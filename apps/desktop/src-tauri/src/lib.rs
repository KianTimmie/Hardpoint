//! Tauri shell around hardpoint-core. Every command is a thin wrapper; the logic lives in the core
//! crate so the CLI and the app behave identically.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use hardpoint_core::engine::{self, Config, DeployReport, DisableReport, ImportOptions, ModHealth, ModSummary};
use hardpoint_core::error::{Conflict, ErrorInfo};
use hardpoint_core::hub::{self, HubIndex, Update};
use hardpoint_core::paths::{self, DcsPaths, Detection};
use hardpoint_core::{util, Engine, Error, Mapping, Target};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

struct AppState {
    engine: Mutex<Engine>,
    /// Last successfully loaded hub index (used to match dropped archives).
    index: Mutex<Option<HubIndex>>,
    /// A hardpoint:// link the app was launched with, until the UI asks for it.
    pending_link: Mutex<Option<String>>,
}

type CmdResult<T> = Result<T, ErrorInfo>;

fn err(e: Error) -> ErrorInfo {
    ErrorInfo::from(&e)
}

fn other(msg: impl Into<String>) -> ErrorInfo {
    err(Error::Other(msg.into()))
}

#[derive(Serialize)]
struct Overview {
    config: Config,
    paths: DcsPaths,
    install_ok: bool,
    saved_ok: bool,
    dcs_version: Option<String>,
    data_dir: PathBuf,
    mods: Vec<ModSummary>,
}

fn overview_of(e: &Engine) -> Overview {
    let p = e.paths();
    Overview {
        install_ok: p.install.as_deref().is_some_and(paths::looks_like_install),
        saved_ok: p.saved.as_deref().is_some_and(Path::is_dir),
        dcs_version: p.dcs_version(),
        config: e.config.clone(),
        paths: p,
        data_dir: e.data_dir().to_path_buf(),
        mods: e.list(),
    }
}

#[tauri::command]
fn overview(state: State<AppState>) -> CmdResult<Overview> {
    let e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
    Ok(overview_of(&e))
}

#[tauri::command]
fn detect_paths() -> Detection {
    paths::detect()
}

#[tauri::command]
fn save_config(state: State<AppState>, config: Config) -> CmdResult<Overview> {
    let mut e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
    e.set_config(config).map_err(err)?;
    Ok(overview_of(&e))
}

#[derive(Serialize)]
struct IndexResult {
    index: HubIndex,
    updates: Vec<Update>,
    /// True when the network fetch failed and a cached copy was used.
    offline: bool,
    error: Option<String>,
}

#[tauri::command]
async fn load_index(app: AppHandle) -> CmdResult<IndexResult> {
    let state = app.state::<AppState>();
    let (url, cache) = {
        let e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
        (e.config.index_url.clone(), e.data_dir().join("cache").join("index.json"))
    };
    let fetched = tauri::async_runtime::spawn_blocking(move || hub::fetch_index(&url))
        .await
        .map_err(|e| other(e.to_string()))?;
    let (index, offline, error) = match fetched {
        Ok(idx) => {
            let _ = util::write_json_atomic(&cache, &idx);
            (idx, false, None)
        }
        Err(fetch_err) => match util::read_json::<HubIndex>(&cache) {
            Ok(Some(idx)) => (idx, true, Some(fetch_err.to_string())),
            _ => return Err(err(fetch_err)),
        },
    };
    let updates = state.engine.lock().map_err(|_| other("engine lock poisoned"))?.updates(&index);
    *state.index.lock().map_err(|_| other("index lock poisoned"))? = Some(index.clone());
    Ok(IndexResult { index, updates, offline, error })
}

#[derive(Clone, Serialize)]
struct Progress<'a> {
    id: &'a str,
    phase: &'a str,
    done: u64,
    total: Option<u64>,
}

/// Download and install a hub mod plus dependencies. Downloads run without holding the
/// engine lock so the rest of the UI stays responsive.
#[tauri::command]
async fn install_hub(app: AppHandle, id: String, version: Option<String>) -> CmdResult<Vec<ModSummary>> {
    let state = app.state::<AppState>();
    let index = state
        .index
        .lock()
        .map_err(|_| other("index lock poisoned"))?
        .clone()
        .ok_or_else(|| other("the hub index hasn't loaded yet"))?;
    let (plan, cache) = {
        let e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
        (e.plan_hub_install(&index, &id, version.as_deref()).map_err(err)?, e.cache_dir())
    };
    for (m, r) in plan {
        let app2 = app.clone();
        let cache2 = cache.clone();
        let (m2, r2) = (m.clone(), r.clone());
        let file = tauri::async_runtime::spawn_blocking(move || {
            let mut last = 0u64;
            hub::download(&r2.download, &cache2, &hub::cache_stem(&m2, &r2), &mut |done, total| {
                // Throttle to ~200 events per download.
                let step = total.unwrap_or(0) / 200;
                if done == total.unwrap_or(u64::MAX) || done >= last + step.max(256 * 1024) {
                    last = done;
                    let _ = app2.emit("progress", Progress { id: &m2.id, phase: "download", done, total });
                }
            })
        })
        .await
        .map_err(|e| other(e.to_string()))?
        .map_err(err)?;

        let _ = app.emit("progress", Progress { id: &m.id, phase: "install", done: 0, total: None });
        let app3 = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let st = app3.state::<AppState>();
            let mut e = st.engine.lock().map_err(|_| other("engine lock poisoned"))?;
            e.import_hub_release(&file, &m, &r, true).map_err(err)
        })
        .await
        .map_err(|e| other(e.to_string()))??;
    }
    let _ = app.emit("progress", Progress { id: &id, phase: "done", done: 0, total: None });
    let list = state.engine.lock().map_err(|_| other("engine lock poisoned"))?.list();
    Ok(list)
}

#[derive(Serialize)]
struct ImportResult {
    id: String,
    name: String,
    /// Set when the file matched a hub release by checksum.
    matched_hub: bool,
    enabled: bool,
    writes_install_dir: bool,
}

/// Import a dropped/picked archive or folder. Matches it to the hub by checksum first.
#[tauri::command]
async fn import_path(
    app: AppHandle,
    path: String,
    livery_for: Option<String>,
    target: Option<String>,
    enable: bool,
) -> CmdResult<ImportResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = PathBuf::from(&path);
        let matched = if p.is_file() && target.is_none() {
            let sha = util::sha256_file(&p).map_err(err)?;
            let idx = state.index.lock().map_err(|_| other("index lock poisoned"))?;
            idx.as_ref().and_then(|i| i.match_sha256(&sha).map(|(m, r)| (m.clone(), r.clone())))
        } else {
            None
        };
        let mut e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
        let rec = match &matched {
            Some((m, r)) => e.import_hub_release(&p, m, r, enable),
            None => {
                let mappings = match &target {
                    Some(t) => vec![Mapping { from: String::new(), to: Target::parse(t).map_err(err)? }],
                    None => Vec::new(),
                };
                e.import(&p, ImportOptions { livery_for, mappings, enable, ..Default::default() })
            }
        }
        .map_err(err)?;
        Ok(ImportResult {
            id: rec.id.clone(),
            name: rec.name.clone(),
            matched_hub: matched.is_some(),
            enabled: rec.enabled,
            writes_install_dir: rec.writes_install_dir(),
        })
    })
    .await
    .map_err(|e| other(e.to_string()))?
}

fn with_engine<T>(app: &AppHandle, f: impl FnOnce(&mut Engine) -> Result<T, Error>) -> CmdResult<T> {
    let state = app.state::<AppState>();
    let mut e = state.engine.lock().map_err(|_| other("engine lock poisoned"))?;
    f(&mut e).map_err(err)
}

#[tauri::command]
async fn enable(app: AppHandle, id: String) -> CmdResult<DeployReport> {
    tauri::async_runtime::spawn_blocking(move || with_engine(&app, |e| e.enable(&id)))
        .await
        .map_err(|e| other(e.to_string()))?
}

#[tauri::command]
async fn disable(app: AppHandle, id: String) -> CmdResult<DisableReport> {
    tauri::async_runtime::spawn_blocking(move || with_engine(&app, |e| e.disable(&id)))
        .await
        .map_err(|e| other(e.to_string()))?
}

#[tauri::command]
async fn remove(app: AppHandle, id: String) -> CmdResult<Option<DisableReport>> {
    tauri::async_runtime::spawn_blocking(move || with_engine(&app, |e| e.remove(&id)))
        .await
        .map_err(|e| other(e.to_string()))?
}

#[tauri::command]
async fn repair(app: AppHandle, id: String) -> CmdResult<DeployReport> {
    tauri::async_runtime::spawn_blocking(move || with_engine(&app, |e| e.repair(&id)))
        .await
        .map_err(|e| other(e.to_string()))?
}

#[tauri::command]
async fn verify(app: AppHandle) -> CmdResult<Vec<ModHealth>> {
    tauri::async_runtime::spawn_blocking(move || with_engine(&app, |e| e.verify()))
        .await
        .map_err(|e| other(e.to_string()))?
}

#[tauri::command]
fn conflicts(app: AppHandle, id: String) -> CmdResult<Vec<Conflict>> {
    with_engine(&app, |e| e.conflicts(&id))
}

/// Open a DCS location (e.g. "saved:Mods/aircraft/A-4E-C") or the data folder in Explorer.
#[tauri::command]
fn reveal(app: AppHandle, target: String) -> CmdResult<()> {
    let path = if target == "data" {
        with_engine(&app, |e| Ok(e.data_dir().to_path_buf()))?
    } else {
        let t = Target::parse(&target).map_err(err)?;
        let p = with_engine(&app, |e| t.resolve(&e.paths()))?;
        // Walk up to the nearest folder that exists.
        let mut p = p.as_path();
        while !p.is_dir() {
            p = p.parent().ok_or_else(|| other("folder not found"))?;
        }
        p.to_path_buf()
    };
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| other(e.to_string()))
}

#[tauri::command]
fn open_external(url: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(other("only web links can be opened"));
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| other(e.to_string()))
}

#[tauri::command]
fn take_pending_link(state: State<AppState>) -> Option<String> {
    state.pending_link.lock().ok().and_then(|mut l| l.take())
}

pub fn run() {
    tauri::Builder::default()
        // Must be first: forwards hardpoint:// links from a second launch to this instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let engine = Engine::open(engine::default_data_dir())?;
            app.manage(AppState {
                engine: Mutex::new(engine),
                index: Mutex::new(None),
                pending_link: Mutex::new(None),
            });

            // In installed builds the installer registers the scheme; in dev, register at runtime.
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(u) = urls.first() {
                    *app.state::<AppState>().pending_link.lock().unwrap() = Some(u.to_string());
                }
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = handle.emit("deep-link", url.to_string());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            overview,
            detect_paths,
            save_config,
            load_index,
            install_hub,
            import_path,
            enable,
            disable,
            remove,
            repair,
            verify,
            conflicts,
            reveal,
            open_external,
            take_pending_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hardpoint");
}
