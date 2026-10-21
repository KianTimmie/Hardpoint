//! `hardpoint` — command-line front end to the Hardpoint engine.
//! Shares its data folder with the desktop app, so the two can be used interchangeably.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use hardpoint_core::engine::{Config, Engine, ImportOptions};
use hardpoint_core::hub::{self, HubIndex};
use hardpoint_core::paths;
use hardpoint_core::{util, Category, Error, Mapping, Target};

#[derive(Parser)]
#[command(name = "hardpoint", version, about = "DCS World mod manager")]
struct Cli {
    /// Data folder (defaults to the same one the desktop app uses).
    #[arg(long, env = "HARDPOINT_DATA", global = true)]
    data_dir: Option<PathBuf>,
    /// Output JSON instead of text.
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Show (or re-detect / set) the DCS folders.
    Paths {
        #[arg(long)]
        detect: bool,
        #[arg(long)]
        install: Option<PathBuf>,
        #[arg(long)]
        saved: Option<PathBuf>,
    },
    /// Add an archive (.zip/.7z) or folder to the library.
    Import {
        source: PathBuf,
        #[arg(long)]
        id: Option<String>,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        version: Option<String>,
        #[arg(long, value_parser = parse_category)]
        category: Option<Category>,
        /// Install rule, e.g. --map "MyMod=saved:Mods/aircraft/MyMod". Repeatable.
        #[arg(long = "map", value_parser = parse_mapping)]
        maps: Vec<Mapping>,
        /// For liveries: the DCS aircraft folder, e.g. FA-18C_hornet.
        #[arg(long)]
        livery_for: Option<String>,
        /// Deploy straight away.
        #[arg(long)]
        enable: bool,
    },
    /// List mods in the library.
    List,
    Enable { id: String },
    Disable { id: String },
    /// Disable and delete from the library.
    Remove { id: String },
    /// Check deployed files are intact (run after a DCS update).
    Verify,
    /// Re-deploy missing/overwritten files for a mod.
    Repair { id: String },
    /// Work with the hub index.
    Hub {
        /// Index URL or file (defaults to the configured one).
        #[arg(long)]
        index: Option<String>,
        #[command(subcommand)]
        cmd: HubCmd,
    },
}

#[derive(Subcommand)]
enum HubCmd {
    /// List mods in the index.
    List,
    /// Download and install a mod (and its dependencies).
    Install {
        id: String,
        #[arg(long)]
        version: Option<String>,
    },
    /// Show installed hub mods with newer releases.
    Updates,
    /// Identify a manually downloaded archive and install it with the hub's rules.
    Match {
        archive: PathBuf,
        #[arg(long)]
        enable: bool,
    },
}

fn parse_category(s: &str) -> Result<Category, String> {
    serde_json::from_value(serde_json::Value::String(s.to_ascii_lowercase())).map_err(|e| e.to_string())
}

fn parse_mapping(s: &str) -> Result<Mapping, String> {
    let (from, to) = s.split_once('=').ok_or("expected FROM=root:path")?;
    Ok(Mapping { from: from.to_string(), to: Target::parse(to).map_err(|e| e.to_string())? })
}

fn default_data_dir() -> PathBuf {
    hardpoint_core::engine::default_data_dir()
}

fn human(bytes: u64) -> String {
    const U: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1024.0 && i < 3 {
        v /= 1024.0;
        i += 1;
    }
    format!("{v:.1} {}", U[i])
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            if let Error::Conflicts(c) = &e {
                for x in c.iter().take(20) {
                    eprintln!("  {} (owned by {})", x.target, x.owner);
                }
            }
            ExitCode::FAILURE
        }
    }
}

fn print<T: serde::Serialize>(json: bool, v: &T, text: impl FnOnce()) {
    if json {
        println!("{}", serde_json::to_string_pretty(v).unwrap());
    } else {
        text();
    }
}

fn run(cli: Cli) -> Result<(), Error> {
    let data = cli.data_dir.clone().unwrap_or_else(default_data_dir);
    let mut engine = Engine::open(&data)?;
    let json = cli.json;

    match cli.cmd {
        Cmd::Paths { detect, install, saved } => {
            if detect || install.is_some() || saved.is_some() {
                let d = paths::detect().best();
                let cfg = Config {
                    install_dir: install.or(if detect { d.install } else { engine.config.install_dir.clone() }),
                    saved_dir: saved.or(if detect { d.saved } else { engine.config.saved_dir.clone() }),
                    index_url: engine.config.index_url.clone(),
                };
                engine.set_config(cfg)?;
            }
            let p = engine.paths();
            print(json, &p, || {
                println!("data:    {}", data.display());
                println!("install: {}", p.install.as_ref().map(|p| p.display().to_string()).unwrap_or("(not set)".into()));
                println!("saved:   {}", p.saved.as_ref().map(|p| p.display().to_string()).unwrap_or("(not set)".into()));
                if let Some(v) = p.dcs_version() {
                    println!("DCS:     {v}");
                }
            });
        }
        Cmd::Import { source, id, name, version, category, maps, livery_for, enable } => {
            let rec = engine.import(
                &source,
                ImportOptions { id, name, version, category, mappings: maps, livery_for, source: None, enable },
            )?;
            print(json, &rec, || {
                println!("imported {} ({}) — {} files, {}", rec.id, rec.version, rec.library_files, human(rec.library_bytes));
                for m in &rec.mappings {
                    println!("  {} → {}", if m.from.is_empty() { "(root)" } else { &m.from }, m.to);
                }
                if rec.writes_install_dir() {
                    println!("  note: writes into the DCS install folder (may fail multiplayer integrity checks)");
                }
                println!("  {}", if rec.enabled { "enabled" } else { "not enabled — run `hardpoint enable` to deploy" });
            });
        }
        Cmd::List => {
            let list = engine.list();
            print(json, &list, || {
                if list.is_empty() {
                    println!("library is empty");
                }
                for m in &list {
                    println!(
                        "{} {:<28} {:<10} {:<9} {:>9}{}",
                        if m.enabled { "●" } else { "○" },
                        m.id,
                        m.version,
                        serde_json::to_value(m.category).unwrap().as_str().unwrap_or(""),
                        human(m.bytes),
                        if m.writes_install_dir { "  [install dir]" } else { "" }
                    );
                }
            });
        }
        Cmd::Enable { id } => {
            let r = engine.enable(&id)?;
            print(json, &r, || println!("enabled {id}: {} files ({}), {} backed up", r.files, human(r.bytes), r.backed_up));
        }
        Cmd::Disable { id } => {
            let r = engine.disable(&id)?;
            print(json, &r, || {
                println!("disabled {id}: {} removed, {} restored", r.removed, r.restored);
                for t in &r.kept_changed {
                    println!("  kept (changed since deploy): {t}");
                }
            });
        }
        Cmd::Remove { id } => {
            engine.remove(&id)?;
            print(json, &serde_json::json!({"removed": id}), || println!("removed {id}"));
        }
        Cmd::Verify => {
            let h = engine.verify()?;
            print(json, &h, || {
                for m in &h {
                    let state = if m.healthy() { "ok".to_string() } else { format!("{} missing, {} changed", m.missing.len(), m.changed.len()) };
                    println!("{:<28} {}{}", m.id, state, if m.dcs_updated { "  (DCS updated since deploy)" } else { "" });
                }
            });
        }
        Cmd::Repair { id } => {
            let r = engine.repair(&id)?;
            print(json, &r, || println!("repaired {id}: {} files re-deployed", r.files));
        }
        Cmd::Hub { index, cmd } => {
            let loc = index.unwrap_or_else(|| engine.config.index_url.clone());
            let idx: HubIndex = hub::fetch_index(&loc)?;
            match cmd {
                HubCmd::List => print(json, &idx.mods, || {
                    for m in &idx.mods {
                        let latest = m.latest().map(|r| r.version.as_str()).unwrap_or("-");
                        println!("{:<28} {:<10} {}", m.id, latest, m.summary);
                    }
                }),
                HubCmd::Install { id, version } => {
                    let mut last = (String::new(), u64::MAX);
                    let recs = engine.install_from_hub(&idx, &id, version.as_deref(), &mut |mid, got, total| {
                        if json {
                            return;
                        }
                        // Repaint only when the whole-percent (or MB, if size unknown) changes.
                        let tick = match total {
                            Some(t) if t > 0 => got * 100 / t,
                            _ => got >> 20,
                        };
                        if last.0 == mid && last.1 == tick {
                            return;
                        }
                        if last.0 != mid && !last.0.is_empty() {
                            eprintln!();
                        }
                        last = (mid.to_string(), tick);
                        match total {
                            Some(t) if t > 0 => eprint!("\r{mid}: {tick:>3}%  {} / {}   ", human(got), human(t)),
                            _ => eprint!("\r{mid}: {}   ", human(got)),
                        }
                    })?;
                    if !json {
                        eprintln!();
                    }
                    print(json, &recs, || {
                        for r in &recs {
                            println!("installed {} {}", r.id, r.version);
                        }
                    });
                }
                HubCmd::Updates => {
                    let u = engine.updates(&idx);
                    print(json, &u, || {
                        if u.is_empty() {
                            println!("everything is up to date");
                        }
                        for x in &u {
                            println!("{:<28} {} → {}", x.id, x.installed, x.latest);
                        }
                    });
                }
                HubCmd::Match { archive, enable } => {
                    let sha = util::sha256_file(&archive)?;
                    let Some((m, r)) = idx.match_sha256(&sha) else {
                        return Err(Error::Other(format!("no hub release matches this file (sha256 {sha})")));
                    };
                    let rec = engine.import_hub_release(&archive, m, r, enable)?;
                    print(json, &rec, || println!("matched {} {} — imported{}", m.name, r.version, if enable { " and enabled" } else { "" }));
                }
            }
        }
    }
    Ok(())
}
