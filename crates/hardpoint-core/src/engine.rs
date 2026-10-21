//! The mod library and the deploy/undeploy engine.
//!
//! Data folder layout:
//! ```text
//! config.json                 settings (DCS paths, index URL)
//! state.json                  every mod in the library and what it deployed
//! journal.json                present only while a deploy is in flight (crash recovery)
//! library/<id>/<version>/     extracted mod contents (the "source of truth")
//! backups/<id>/<root>/<rel>   original files a mod replaced, restored on disable
//! orphaned/<stamp>-<id>/…     backups that could no longer be restored safely (never deleted)
//! cache/downloads/            downloaded archives
//! ```
//! Deploying copies files into DCS; disabling removes exactly those files (only if
//! unchanged) and puts back whatever was there before.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::archive;
use crate::error::{Conflict, Error, Result};
use crate::hub::{self, HubIndex, HubMod, Release, Update};
use crate::layout::{self, LayoutHints};
use crate::model::{Category, Mapping, ModSource};
use crate::paths::{self, DcsPaths, Root, Target};
use crate::util;
use crate::version;

pub const STATE_SCHEMA: u32 = 1;
/// Placeholder until the hub is published; overridable in Settings.
/// The data folder shared by the desktop app and the CLI:
/// `%APPDATA%\\hardpoint\\Hardpoint\\data` on Windows.
pub fn default_data_dir() -> PathBuf {
    directories::ProjectDirs::from("org", "hardpoint", "Hardpoint")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".hardpoint"))
}

pub const DEFAULT_INDEX_URL: &str = "https://OWNER.github.io/hardpoint/index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub install_dir: Option<PathBuf>,
    #[serde(default)]
    pub saved_dir: Option<PathBuf>,
    #[serde(default = "default_index_url")]
    pub index_url: String,
}

fn default_index_url() -> String {
    DEFAULT_INDEX_URL.to_string()
}

impl Default for Config {
    fn default() -> Self {
        Config { install_dir: None, saved_dir: None, index_url: default_index_url() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeployedFile {
    pub target: Target,
    pub sha256: String,
    pub size: u64,
    /// True if a pre-existing file was moved to backups/ and must be restored.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModRecord {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub category: Category,
    pub source: ModSource,
    pub mappings: Vec<Mapping>,
    pub library_files: u64,
    pub library_bytes: u64,
    pub imported_at: DateTime<Utc>,
    pub enabled: bool,
    #[serde(default)]
    pub enabled_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub dcs_version_at_enable: Option<String>,
    #[serde(default)]
    pub deployed: Vec<DeployedFile>,
    #[serde(default)]
    pub created_dirs: Vec<Target>,
}

impl ModRecord {
    pub fn writes_install_dir(&self) -> bool {
        self.mappings.iter().any(|m| m.to.root == Root::Install)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct State {
    pub schema: u32,
    pub mods: BTreeMap<String, ModRecord>,
}

/// What the UI shows for each mod.
#[derive(Debug, Clone, Serialize)]
pub struct ModSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub category: Category,
    pub source: ModSource,
    pub enabled: bool,
    pub writes_install_dir: bool,
    pub files: u64,
    pub bytes: u64,
    pub targets: Vec<Target>,
    pub imported_at: DateTime<Utc>,
    pub enabled_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default)]
pub struct ImportOptions {
    pub id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub category: Option<Category>,
    pub mappings: Vec<Mapping>,
    pub livery_for: Option<String>,
    pub source: Option<ModSource>,
    /// Deploy right after importing.
    pub enable: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct DeployReport {
    pub id: String,
    pub files: usize,
    pub bytes: u64,
    pub backed_up: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct DisableReport {
    pub id: String,
    pub removed: usize,
    pub restored: usize,
    /// Files changed since deploy (by the user or a DCS update); left in place.
    pub kept_changed: Vec<Target>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ModHealth {
    pub id: String,
    pub name: String,
    pub ok: usize,
    pub missing: Vec<Target>,
    pub changed: Vec<Target>,
    /// DCS has been updated since this mod was deployed.
    pub dcs_updated: bool,
}

impl ModHealth {
    pub fn healthy(&self) -> bool {
        self.missing.is_empty() && self.changed.is_empty()
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Journal {
    mod_id: String,
    entries: Vec<JournalEntry>,
    created_dirs: Vec<Target>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    target: Target,
    existed: bool,
}

pub struct Engine {
    data_dir: PathBuf,
    pub config: Config,
    state: State,
}

impl Engine {
    /// Open (or create) a data folder. Runs crash recovery and first-run detection.
    pub fn open(data_dir: impl Into<PathBuf>) -> Result<Self> {
        let data_dir = data_dir.into();
        fs::create_dir_all(&data_dir).map_err(|e| Error::io("create folder", &data_dir, e))?;
        let mut config: Config = util::read_json(&data_dir.join("config.json"))?.unwrap_or_default();
        let state: State = util::read_json(&data_dir.join("state.json"))?
            .unwrap_or(State { schema: STATE_SCHEMA, mods: BTreeMap::new() });
        if state.schema > STATE_SCHEMA {
            return Err(Error::Other("this data folder was written by a newer Hardpoint".into()));
        }
        let first_run = config.install_dir.is_none() && config.saved_dir.is_none();
        if first_run {
            let d = paths::detect().best();
            config.install_dir = d.install;
            config.saved_dir = d.saved;
        }
        let mut engine = Engine { data_dir, config, state };
        if first_run {
            engine.save_config()?;
        }
        engine.recover()?;
        Ok(engine)
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn paths(&self) -> DcsPaths {
        DcsPaths { install: self.config.install_dir.clone(), saved: self.config.saved_dir.clone() }
    }

    pub fn set_config(&mut self, config: Config) -> Result<()> {
        if self.state.mods.values().any(|m| m.enabled) && self.paths() != (DcsPaths { install: config.install_dir.clone(), saved: config.saved_dir.clone() }) {
            return Err(Error::Other("disable all mods before changing DCS folders".into()));
        }
        self.config = config;
        self.save_config()
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.data_dir.join("cache").join("downloads")
    }

    pub fn get(&self, id: &str) -> Option<&ModRecord> {
        self.state.mods.get(id)
    }

    pub fn list(&self) -> Vec<ModSummary> {
        self.state
            .mods
            .values()
            .map(|r| ModSummary {
                id: r.id.clone(),
                name: r.name.clone(),
                version: r.version.clone(),
                category: r.category,
                source: r.source.clone(),
                enabled: r.enabled,
                writes_install_dir: r.writes_install_dir(),
                files: r.library_files,
                bytes: r.library_bytes,
                targets: r.mappings.iter().map(|m| m.to.clone()).collect(),
                imported_at: r.imported_at,
                enabled_at: r.enabled_at,
            })
            .collect()
    }

    // ---------------------------------------------------------------- import

    fn library_dir(&self, id: &str, version: &str) -> PathBuf {
        self.data_dir.join("library").join(id).join(util::safe_dir_name(version))
    }

    fn backup_path(&self, id: &str, t: &Target) -> PathBuf {
        let mut p = self.data_dir.join("backups").join(id).join(t.root.as_str());
        for part in t.rel.split('/') {
            p.push(part);
        }
        p
    }

    /// Extract an archive (or folder) into the library and work out its install mapping.
    pub fn import(&mut self, src: &Path, opts: ImportOptions) -> Result<ModRecord> {
        let stem = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "mod".into());
        let stem_no_ext = stem
            .strip_suffix(".zip")
            .or_else(|| stem.strip_suffix(".7z"))
            .unwrap_or(&stem)
            .to_string();
        let id = util::slugify(opts.id.as_deref().unwrap_or(&stem_no_ext));
        let version = opts.version.clone().unwrap_or_else(|| "local".into());
        let name = opts.name.clone().unwrap_or_else(|| stem_no_ext.clone());

        let incoming = self
            .data_dir
            .join("library")
            .join(&id)
            .join(format!(".incoming-{}", Utc::now().timestamp_nanos_opt().unwrap_or_default()));
        let result = (|| -> Result<(archive::ExtractStats, Vec<Mapping>)> {
            let stats = archive::extract(src, &incoming)?;
            let mappings = if opts.mappings.is_empty() {
                let hints = LayoutHints {
                    category: opts.category,
                    livery_for: opts.livery_for.clone(),
                    fallback_name: name.clone(),
                };
                layout::detect(&incoming, &hints)?
            } else {
                for m in &opts.mappings {
                    let rel = paths::normalize_rel(&m.from).ok_or_else(|| Error::UnsafePath(m.from.clone()))?;
                    if !incoming.join(&rel).exists() {
                        return Err(Error::AmbiguousLayout(format!(
                            "install rule refers to '{}', which isn't in the archive",
                            m.from
                        )));
                    }
                }
                opts.mappings.clone()
            };
            Ok((stats, mappings))
        })();
        let (stats, mappings) = match result {
            Ok(v) => v,
            Err(e) => {
                let _ = fs::remove_dir_all(&incoming);
                return Err(e);
            }
        };

        // Replacing an existing version: undeploy it first, re-deploy the new one after.
        let mut was_enabled = false;
        if let Some(old) = self.state.mods.get(&id).cloned() {
            if old.enabled {
                if let Err(e) = self.disable(&id) {
                    let _ = fs::remove_dir_all(&incoming);
                    return Err(e);
                }
                was_enabled = true;
            }
            let old_dir = self.library_dir(&id, &old.version);
            let _ = fs::remove_dir_all(old_dir);
        }
        let final_dir = self.library_dir(&id, &version);
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir).map_err(|e| Error::io("delete", &final_dir, e))?;
        }
        fs::rename(&incoming, &final_dir).map_err(|e| Error::io("move", &incoming, e))?;

        let record = ModRecord {
            id: id.clone(),
            name,
            version,
            category: opts.category.unwrap_or_default(),
            source: opts.source.clone().unwrap_or(ModSource::Local { file_name: stem }),
            mappings,
            library_files: stats.files,
            library_bytes: stats.bytes,
            imported_at: Utc::now(),
            enabled: false,
            enabled_at: None,
            dcs_version_at_enable: None,
            deployed: Vec::new(),
            created_dirs: Vec::new(),
        };
        self.state.mods.insert(id.clone(), record);
        self.save_state()?;

        if was_enabled || opts.enable {
            self.enable(&id)?;
        }
        Ok(self.state.mods[&id].clone())
    }

    /// Import an archive downloaded for a hub release, using the index metadata and rules.
    pub fn import_hub_release(&mut self, archive: &Path, m: &HubMod, r: &Release, enable: bool) -> Result<ModRecord> {
        self.import(
            archive,
            ImportOptions {
                id: Some(m.id.clone()),
                name: Some(m.name.clone()),
                version: Some(r.version.clone()),
                category: Some(m.category),
                mappings: r.install.clone(),
                livery_for: r.livery_for.clone(),
                source: Some(ModSource::Hub {
                    download_url: (r.download.kind == hub::DownloadKind::Direct).then(|| r.download.url.clone()),
                }),
                enable,
            },
        )
    }

    /// Work out which hub releases to install for `id` (dependencies first, skipping
    /// ones already satisfied). Does no I/O, so callers can download without holding a lock.
    pub fn plan_hub_install(&self, index: &HubIndex, id: &str, version: Option<&str>) -> Result<Vec<(HubMod, Release)>> {
        let target = index.get(id).ok_or_else(|| Error::NotInIndex(id.to_string()))?;
        let mut out = Vec::new();
        for dep in index.install_order(id)? {
            let m = index.get(&dep).ok_or_else(|| Error::NotInIndex(dep.clone()))?;
            let is_target = dep == id;
            if !is_target {
                if let Some(rec) = self.get(&dep) {
                    let min = target.dependencies.iter().find(|d| d.id == dep).and_then(|d| d.min_version.clone());
                    if min.is_none_or(|min| !version::is_newer(&min, &rec.version)) {
                        continue; // dependency already satisfied
                    }
                }
            }
            let r = m
                .release(if is_target { version } else { None })
                .ok_or_else(|| Error::Other(format!("'{}' has no matching release", m.id)))?;
            if !m.installable {
                return Err(Error::NotInstallable { name: m.name.clone(), url: r.download.url.clone() });
            }
            if r.download.kind != hub::DownloadKind::Direct {
                return Err(Error::ManualDownload { name: m.name.clone(), version: r.version.clone(), url: r.download.url.clone() });
            }
            out.push((m.clone(), r.clone()));
        }
        Ok(out)
    }

    /// Download (with dependencies) and install a hub mod. Blocking; holds `&mut self` throughout.
    pub fn install_from_hub(
        &mut self,
        index: &HubIndex,
        id: &str,
        version: Option<&str>,
        progress: &mut dyn FnMut(&str, u64, Option<u64>),
    ) -> Result<Vec<ModRecord>> {
        let plan = self.plan_hub_install(index, id, version)?;
        let cache = self.cache_dir();
        let mut done = Vec::new();
        for (m, r) in plan {
            let file = hub::download(&r.download, &cache, &hub::cache_stem(&m, &r), &mut |a, b| progress(&m.id, a, b))?;
            done.push(self.import_hub_release(&file, &m, &r, true)?);
        }
        Ok(done)
    }

    pub fn updates(&self, index: &HubIndex) -> Vec<Update> {
        self.state
            .mods
            .values()
            .filter(|r| matches!(r.source, ModSource::Hub { .. }))
            .filter_map(|r| {
                let latest = index.get(&r.id)?.latest()?;
                version::is_newer(&latest.version, &r.version).then(|| Update {
                    id: r.id.clone(),
                    installed: r.version.clone(),
                    latest: latest.version.clone(),
                })
            })
            .collect()
    }

    // ---------------------------------------------------------------- deploy

    /// Expand a mod's mappings into (library file, DCS target) pairs.
    fn plan(&self, rec: &ModRecord) -> Result<BTreeMap<Target, PathBuf>> {
        let lib = self.library_dir(&rec.id, &rec.version);
        let mut out = BTreeMap::new();
        for m in &rec.mappings {
            let from_rel = paths::normalize_rel(&m.from).ok_or_else(|| Error::UnsafePath(m.from.clone()))?;
            let src = if from_rel.is_empty() { lib.clone() } else { lib.join(&from_rel) };
            if src.is_file() {
                out.insert(m.to.clone(), src);
                continue;
            }
            if !src.is_dir() {
                return Err(Error::Other(format!(
                    "library copy of '{}' is missing '{}'; re-import the mod",
                    rec.id, m.from
                )));
            }
            for e in WalkDir::new(&src).follow_links(false) {
                let e = e.map_err(|e| Error::Other(e.to_string()))?;
                if !e.file_type().is_file() {
                    continue;
                }
                let rel = e.path().strip_prefix(&src).expect("under src");
                let rel_s = rel.to_string_lossy().replace('\\', "/");
                let fname = e.file_name().to_string_lossy();
                if fname == ".DS_Store" || fname == "Thumbs.db" || rel_s.starts_with("__MACOSX/") {
                    continue;
                }
                // Don't scatter readmes into the root of DCS or Saved Games.
                if m.to.rel.is_empty() && !rel_s.contains('/') && is_doc_name(&fname) {
                    continue;
                }
                out.insert(m.to.join(&rel_s)?, e.path().to_path_buf());
            }
        }
        Ok(out)
    }

    /// Which enabled mod owns each deployed target.
    fn owners(&self, except: &str) -> HashMap<Target, String> {
        let mut map = HashMap::new();
        for r in self.state.mods.values().filter(|r| r.enabled && r.id != except) {
            for f in &r.deployed {
                map.insert(f.target.clone(), r.id.clone());
            }
        }
        map
    }

    /// Conflicts this mod would hit if enabled now.
    pub fn conflicts(&self, id: &str) -> Result<Vec<Conflict>> {
        let rec = self.state.mods.get(id).ok_or_else(|| Error::UnknownMod(id.into()))?;
        let plan = self.plan(rec)?;
        let owners = self.owners(id);
        Ok(plan
            .keys()
            .filter_map(|t| owners.get(t).map(|o| Conflict { target: t.clone(), owner: o.clone() }))
            .collect())
    }

    pub fn enable(&mut self, id: &str) -> Result<DeployReport> {
        let rec = self.state.mods.get(id).cloned().ok_or_else(|| Error::UnknownMod(id.into()))?;
        if rec.enabled {
            return Err(Error::AlreadyEnabled(id.into()));
        }
        let paths = self.paths();
        for root in [Root::Saved, Root::Install] {
            if rec.mappings.iter().any(|m| m.to.root == root) {
                let base = paths.root(root)?;
                if root == Root::Install && !base.is_dir() {
                    return Err(Error::Other(format!("DCS install folder not found at {}", base.display())));
                }
            }
        }

        let plan = self.plan(&rec)?;
        let owners = self.owners(id);
        let conflicts: Vec<Conflict> = plan
            .keys()
            .filter_map(|t| owners.get(t).map(|o| Conflict { target: t.clone(), owner: o.clone() }))
            .collect();
        if !conflicts.is_empty() {
            return Err(Error::Conflicts(conflicts));
        }

        // Pre-flight: what exists, what folders we'll create.
        let mut entries = Vec::with_capacity(plan.len());
        let mut created: BTreeSet<Target> = BTreeSet::new();
        for t in plan.keys() {
            let abs = t.resolve(&paths)?;
            let existed = match fs::symlink_metadata(&abs) {
                Ok(md) if md.is_dir() => return Err(Error::FileDirClash { target: t.to_string() }),
                Ok(_) => true,
                Err(_) => false,
            };
            let mut p = t.parent();
            while let Some(dir) = p {
                if dir.rel.is_empty() || created.contains(&dir) || dir.resolve(&paths)?.is_dir() {
                    break;
                }
                created.insert(dir.clone());
                p = dir.parent();
            }
            entries.push(JournalEntry { target: t.clone(), existed });
        }
        let created_dirs: Vec<Target> = created.into_iter().collect();
        let journal = Journal { mod_id: id.to_string(), entries, created_dirs: created_dirs.clone() };
        util::write_json_atomic(&self.journal_path(), &journal)?;

        let mut deployed: Vec<DeployedFile> = Vec::with_capacity(plan.len());
        let mut report = DeployReport { id: id.to_string(), ..Default::default() };
        let run = (|| -> Result<()> {
            for (entry, (target, src)) in journal.entries.iter().zip(plan.iter()) {
                let abs = target.resolve(&paths)?;
                if entry.existed {
                    util::move_file(&abs, &self.backup_path(id, target))?;
                }
                if let Some(parent) = abs.parent() {
                    fs::create_dir_all(parent).map_err(|e| Error::io("create folder", parent, e))?;
                }
                let copied = util::copy_with_hash(src, &abs);
                // Record before propagating so rollback knows a backup was taken.
                let (sha256, size) = match copied {
                    Ok(v) => v,
                    Err(e) => {
                        deployed.push(DeployedFile { target: target.clone(), sha256: String::new(), size: 0, backup: entry.existed });
                        return Err(e);
                    }
                };
                report.files += 1;
                report.bytes += size;
                if entry.existed {
                    report.backed_up += 1;
                }
                deployed.push(DeployedFile { target: target.clone(), sha256, size, backup: entry.existed });
            }
            Ok(())
        })();

        if let Err(e) = run {
            self.rollback(id, &deployed, &created_dirs, &paths);
            let _ = fs::remove_file(self.journal_path());
            return Err(e);
        }

        let rec = self.state.mods.get_mut(id).expect("checked above");
        rec.enabled = true;
        rec.enabled_at = Some(Utc::now());
        rec.dcs_version_at_enable = paths.dcs_version();
        rec.deployed = deployed;
        rec.created_dirs = created_dirs;
        self.save_state()?;
        let _ = fs::remove_file(self.journal_path());
        Ok(report)
    }

    fn rollback(&self, id: &str, done: &[DeployedFile], created_dirs: &[Target], paths: &DcsPaths) {
        for f in done.iter().rev() {
            let Ok(abs) = f.target.resolve(paths) else { continue };
            let _ = fs::remove_file(&abs);
            if f.backup {
                let b = self.backup_path(id, &f.target);
                if b.is_file() {
                    let _ = util::move_file(&b, &abs);
                }
            }
        }
        self.prune_created(created_dirs, paths);
        self.prune_backups(id);
    }

    fn prune_created(&self, dirs: &[Target], paths: &DcsPaths) {
        let mut dirs: Vec<&Target> = dirs.iter().collect();
        dirs.sort_by_key(|t| std::cmp::Reverse(t.rel.matches('/').count()));
        for d in dirs {
            if let Ok(abs) = d.resolve(paths) {
                let _ = fs::remove_dir(abs); // only succeeds when empty
            }
        }
    }

    fn prune_backups(&self, id: &str) {
        let root = self.data_dir.join("backups").join(id);
        if !root.exists() {
            return;
        }
        let mut dirs: Vec<PathBuf> = WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_dir())
            .map(|e| e.into_path())
            .collect();
        dirs.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
        for d in dirs {
            let _ = fs::remove_dir(d);
        }
    }

    fn orphan(&self, id: &str, backup: &Path, t: &Target) {
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let mut dest = self.data_dir.join("orphaned").join(format!("{stamp}-{id}")).join(t.root.as_str());
        for part in t.rel.split('/') {
            dest.push(part);
        }
        let _ = util::move_file(backup, &dest);
    }

    pub fn disable(&mut self, id: &str) -> Result<DisableReport> {
        let rec = self.state.mods.get(id).cloned().ok_or_else(|| Error::UnknownMod(id.into()))?;
        if !rec.enabled {
            return Err(Error::NotEnabled(id.into()));
        }
        let paths = self.paths();
        let mut report = DisableReport { id: id.into(), ..Default::default() };
        for f in rec.deployed.iter().rev() {
            let abs = f.target.resolve(&paths)?;
            let backup = self.backup_path(id, &f.target);
            let have_backup = f.backup && backup.is_file();
            if abs.is_file() {
                if file_matches(&abs, f)? {
                    fs::remove_file(&abs).map_err(|e| Error::io("delete", &abs, e))?;
                    report.removed += 1;
                    if have_backup {
                        util::move_file(&backup, &abs)?;
                        report.restored += 1;
                    }
                } else {
                    // Someone (often a DCS update/repair) replaced our file. Leave theirs alone.
                    report.kept_changed.push(f.target.clone());
                    if have_backup {
                        self.orphan(id, &backup, &f.target);
                    }
                }
            } else if have_backup {
                util::move_file(&backup, &abs)?;
                report.restored += 1;
            }
        }
        self.prune_created(&rec.created_dirs, &paths);
        self.prune_backups(id);

        let rec = self.state.mods.get_mut(id).expect("exists");
        rec.enabled = false;
        rec.enabled_at = None;
        rec.deployed.clear();
        rec.created_dirs.clear();
        self.save_state()?;
        Ok(report)
    }

    /// Disable (if needed) and delete a mod from the library.
    pub fn remove(&mut self, id: &str) -> Result<Option<DisableReport>> {
        let rec = self.state.mods.get(id).cloned().ok_or_else(|| Error::UnknownMod(id.into()))?;
        let report = if rec.enabled { Some(self.disable(id)?) } else { None };
        let lib = self.data_dir.join("library").join(id);
        if lib.exists() {
            fs::remove_dir_all(&lib).map_err(|e| Error::io("delete", &lib, e))?;
        }
        self.state.mods.remove(id);
        self.save_state()?;
        Ok(report)
    }

    /// Check every enabled mod's files are still what we deployed.
    pub fn verify(&self) -> Result<Vec<ModHealth>> {
        let paths = self.paths();
        let current_dcs = paths.dcs_version();
        let mut out = Vec::new();
        for r in self.state.mods.values().filter(|r| r.enabled) {
            let mut h = ModHealth {
                id: r.id.clone(),
                name: r.name.clone(),
                dcs_updated: current_dcs.is_some() && r.dcs_version_at_enable.is_some() && current_dcs != r.dcs_version_at_enable,
                ..Default::default()
            };
            for f in &r.deployed {
                let abs = f.target.resolve(&paths)?;
                if !abs.is_file() {
                    h.missing.push(f.target.clone());
                } else if !file_matches(&abs, f)? {
                    h.changed.push(f.target.clone());
                } else {
                    h.ok += 1;
                }
            }
            out.push(h);
        }
        Ok(out)
    }

    /// Re-deploy missing or overwritten files (typically after a DCS update).
    /// A file DCS put back becomes the new backup, so disabling later restores it.
    pub fn repair(&mut self, id: &str) -> Result<DeployReport> {
        let rec = self.state.mods.get(id).cloned().ok_or_else(|| Error::UnknownMod(id.into()))?;
        if !rec.enabled {
            return Err(Error::NotEnabled(id.into()));
        }
        let paths = self.paths();
        let plan = self.plan(&rec)?;
        let mut deployed = rec.deployed.clone();
        let mut report = DeployReport { id: id.into(), ..Default::default() };
        for f in deployed.iter_mut() {
            let abs = f.target.resolve(&paths)?;
            let Some(src) = plan.get(&f.target) else { continue };
            let present = abs.is_file();
            if present && file_matches(&abs, f)? {
                continue;
            }
            if present {
                let backup = self.backup_path(id, &f.target);
                if f.backup && backup.is_file() {
                    self.orphan(id, &backup, &f.target);
                }
                util::move_file(&abs, &backup)?;
                f.backup = true;
                report.backed_up += 1;
            } else if let Some(parent) = abs.parent() {
                fs::create_dir_all(parent).map_err(|e| Error::io("create folder", parent, e))?;
            }
            let (sha, size) = util::copy_with_hash(src, &abs)?;
            f.sha256 = sha;
            f.size = size;
            report.files += 1;
            report.bytes += size;
        }
        let rec = self.state.mods.get_mut(id).expect("exists");
        rec.deployed = deployed;
        rec.dcs_version_at_enable = paths.dcs_version();
        self.save_state()?;
        Ok(report)
    }

    // ---------------------------------------------------------------- persistence

    fn journal_path(&self) -> PathBuf {
        self.data_dir.join("journal.json")
    }

    fn save_state(&self) -> Result<()> {
        util::write_json_atomic(&self.data_dir.join("state.json"), &self.state)
    }

    fn save_config(&self) -> Result<()> {
        util::write_json_atomic(&self.data_dir.join("config.json"), &self.config)
    }

    /// Undo a deploy that was interrupted (crash, power cut) before it committed.
    fn recover(&mut self) -> Result<()> {
        let Some(j): Option<Journal> = util::read_json(&self.journal_path())? else { return Ok(()) };
        let committed = self
            .state
            .mods
            .get(&j.mod_id)
            .is_some_and(|r| r.enabled && r.deployed.len() == j.entries.len());
        if !committed {
            let paths = self.paths();
            for e in j.entries.iter().rev() {
                let Ok(abs) = e.target.resolve(&paths) else { continue };
                let backup = self.backup_path(&j.mod_id, &e.target);
                if e.existed {
                    if backup.is_file() {
                        let _ = fs::remove_file(&abs);
                        let _ = util::move_file(&backup, &abs);
                    }
                } else if abs.is_file() {
                    let _ = fs::remove_file(&abs);
                }
            }
            self.prune_created(&j.created_dirs, &paths);
            self.prune_backups(&j.mod_id);
        }
        fs::remove_file(self.journal_path()).map_err(|e| Error::io("delete", self.journal_path(), e))
    }
}

fn is_doc_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("readme")
        || lower.starts_with("license")
        || lower.starts_with("changelog")
        || [".txt", ".md", ".pdf", ".url", ".html", ".htm", ".rtf", ".nfo"].iter().any(|e| lower.ends_with(e))
}

fn file_matches(abs: &Path, f: &DeployedFile) -> Result<bool> {
    let md = fs::metadata(abs).map_err(|e| Error::io("read", abs, e))?;
    if md.len() != f.size {
        return Ok(false);
    }
    Ok(util::sha256_file(abs)? == f.sha256)
}
