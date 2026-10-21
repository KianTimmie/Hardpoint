//! DCS folder model and detection.
//!
//! A mod writes into one of two roots:
//! * `saved:`   — `%USERPROFILE%\Saved Games\DCS` (aircraft, liveries, scripts, missions…).
//!   Files here do not trip the multiplayer integrity check (IC).
//! * `install:` — the DCS installation folder (core file edits, shaders, some terrains).
//!   Files here can fail IC on servers that enforce it, and DCS updates/repairs overwrite them.

use std::fmt;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Root {
    Saved,
    Install,
}

impl Root {
    pub fn as_str(self) -> &'static str {
        match self {
            Root::Saved => "saved",
            Root::Install => "install",
        }
    }
}

/// A location inside one of the DCS roots, e.g. `saved:Mods/aircraft/A-4E-C`.
/// `rel` always uses `/` separators and never contains `..`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Target {
    pub root: Root,
    pub rel: String,
}

impl Target {
    pub fn new(root: Root, rel: &str) -> Result<Self> {
        let rel = normalize_rel(rel).ok_or_else(|| Error::BadTarget(format!("{}:{rel}", root.as_str())))?;
        Ok(Target { root, rel })
    }

    pub fn parse(s: &str) -> Result<Self> {
        let (root, rel) = s.split_once(':').ok_or_else(|| Error::BadTarget(s.to_string()))?;
        let root = match root.trim().to_ascii_lowercase().as_str() {
            "saved" | "savedgames" | "saved_games" => Root::Saved,
            "install" | "game" | "dcs" => Root::Install,
            _ => return Err(Error::BadTarget(s.to_string())),
        };
        Target::new(root, rel)
    }

    pub fn join(&self, sub: &str) -> Result<Self> {
        if self.rel.is_empty() {
            Target::new(self.root, sub)
        } else {
            Target::new(self.root, &format!("{}/{}", self.rel, sub))
        }
    }

    pub fn parent(&self) -> Option<Target> {
        if self.rel.is_empty() {
            return None;
        }
        Some(match self.rel.rsplit_once('/') {
            Some((p, _)) => Target { root: self.root, rel: p.to_string() },
            None => Target { root: self.root, rel: String::new() },
        })
    }

    pub fn resolve(&self, paths: &DcsPaths) -> Result<PathBuf> {
        let base = paths.root(self.root)?;
        let mut p = base.to_path_buf();
        for part in self.rel.split('/').filter(|s| !s.is_empty()) {
            p.push(part);
        }
        Ok(p)
    }
}

impl fmt::Display for Target {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.root.as_str(), self.rel)
    }
}

impl Serialize for Target {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for Target {
    fn deserialize<D: Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Target::parse(&s).map_err(serde::de::Error::custom)
    }
}

/// Normalise a relative path: `\` → `/`, drop `.` and empty parts, reject `..`,
/// absolute paths and drive prefixes. Returns None if unsafe.
pub fn normalize_rel(rel: &str) -> Option<String> {
    let rel = rel.replace('\\', "/");
    if rel.starts_with('/') || rel.contains(':') {
        return None;
    }
    let mut out: Vec<&str> = Vec::new();
    for part in rel.split('/') {
        match part {
            "" | "." => continue,
            ".." => return None,
            p => out.push(p),
        }
    }
    Some(out.join("/"))
}

/// True if a path taken from an archive is safe to join under a destination.
pub fn is_safe_relative(p: &Path) -> bool {
    p.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

/// The two DCS roots, as configured or detected.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct DcsPaths {
    pub install: Option<PathBuf>,
    pub saved: Option<PathBuf>,
}

impl DcsPaths {
    pub fn root(&self, root: Root) -> Result<&Path> {
        match root {
            Root::Saved => self.saved.as_deref().ok_or(Error::PathNotSet("Saved Games")),
            Root::Install => self.install.as_deref().ok_or(Error::PathNotSet("install")),
        }
    }

    /// DCS version from `autoupdate.cfg` in the install folder, if readable.
    pub fn dcs_version(&self) -> Option<String> {
        let cfg = self.install.as_ref()?.join("autoupdate.cfg");
        let text = fs::read_to_string(cfg).ok()?;
        let v: serde_json::Value = serde_json::from_str(&text).ok()?;
        v.get("version")?.as_str().map(str::to_string)
    }
}

/// Result of auto-detection: every plausible candidate, best first.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Detection {
    pub install_candidates: Vec<PathBuf>,
    pub saved_candidates: Vec<PathBuf>,
}

impl Detection {
    pub fn best(&self) -> DcsPaths {
        DcsPaths {
            install: self.install_candidates.first().cloned(),
            saved: self.saved_candidates.first().cloned(),
        }
    }
}

pub fn looks_like_install(p: &Path) -> bool {
    p.join("bin").join("DCS.exe").is_file()
        || p.join("bin-mt").join("DCS.exe").is_file()
        || (p.join("bin").is_dir() && p.join("CoreMods").is_dir())
}

pub fn looks_like_saved(p: &Path) -> bool {
    p.is_dir() && (p.join("Config").is_dir() || p.join("Logs").is_dir() || p.join("Mods").is_dir())
}

/// Saved Games sub-folder name for an install: `DCS`, or `DCS.<variant>` when
/// `dcs_variant.txt` exists (e.g. the old open beta → `DCS.openbeta`).
pub fn saved_folder_name(install: &Path) -> String {
    match fs::read_to_string(install.join("dcs_variant.txt")) {
        Ok(v) if !v.trim().is_empty() => format!("DCS.{}", v.trim()),
        _ => "DCS".to_string(),
    }
}

/// Find DCS on this machine. Environment variables `HARDPOINT_DCS_INSTALL` and
/// `HARDPOINT_DCS_SAVED` take priority (useful for testing and unusual setups).
pub fn detect() -> Detection {
    let mut install: Vec<PathBuf> = Vec::new();
    let mut saved: Vec<PathBuf> = Vec::new();

    if let Ok(p) = std::env::var("HARDPOINT_DCS_INSTALL") {
        install.push(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("HARDPOINT_DCS_SAVED") {
        saved.push(PathBuf::from(p));
    }

    let mut found = Vec::new();
    platform_install_candidates(&mut found);
    found.retain(|p| looks_like_install(p));
    install.extend(found);
    dedup(&mut install);

    // Saved Games: prefer the folder matching the detected install's variant.
    let saved_games_roots = saved_games_roots();
    let mut names: Vec<String> = install.iter().map(|p| saved_folder_name(p)).collect();
    names.extend(["DCS".to_string(), "DCS.openbeta".to_string()]);
    dedup(&mut names);
    for root in &saved_games_roots {
        for n in &names {
            let p = root.join(n);
            if p.is_dir() {
                saved.push(p);
            }
        }
    }
    // If nothing exists yet, still offer the expected default so first-run works.
    if saved.is_empty() {
        if let (Some(root), Some(n)) = (saved_games_roots.first(), names.first()) {
            saved.push(root.join(n));
        }
    }
    dedup(&mut saved);

    Detection { install_candidates: install, saved_candidates: saved }
}

fn dedup<T: PartialEq + Clone>(v: &mut Vec<T>) {
    let mut out: Vec<T> = Vec::new();
    for x in v.drain(..) {
        if !out.contains(&x) {
            out.push(x);
        }
    }
    *v = out;
}

/// DCS on Steam has app id 223750.
const STEAM_DIR: &str = "DCSWorld";
const STEAM_APP_ID: &str = "223750";

fn steam_library_dirs(steam_root: &Path) -> Vec<PathBuf> {
    let mut libs = vec![steam_root.to_path_buf()];
    let vdf = steam_root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(vdf) {
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("\"path\"") {
                let v = rest.trim().trim_matches('"').replace("\\\\", "\\");
                libs.push(PathBuf::from(v));
            }
        }
    }
    libs
}

#[cfg(windows)]
fn platform_install_candidates(out: &mut Vec<PathBuf>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for key in ["Software\\Eagle Dynamics\\DCS World", "Software\\Eagle Dynamics\\DCS World OpenBeta"] {
        if let Ok(k) = hkcu.open_subkey(key) {
            if let Ok(p) = k.get_value::<String, _>("Path") {
                out.push(PathBuf::from(p));
            }
        }
    }
    let mut steam_roots = Vec::new();
    if let Ok(k) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(p) = k.get_value::<String, _>("SteamPath") {
            steam_roots.push(PathBuf::from(p.replace('/', "\\")));
        }
    }
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(k) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
        if let Ok(p) = k.get_value::<String, _>("InstallPath") {
            steam_roots.push(PathBuf::from(p));
        }
    }
    for root in steam_roots {
        for lib in steam_library_dirs(&root) {
            out.push(lib.join("steamapps").join("common").join(STEAM_DIR));
        }
    }
    for drive in ["C", "D", "E", "F", "G"] {
        out.push(PathBuf::from(format!("{drive}:\\Program Files\\Eagle Dynamics\\DCS World")));
        out.push(PathBuf::from(format!("{drive}:\\Program Files\\Eagle Dynamics\\DCS World OpenBeta")));
        out.push(PathBuf::from(format!("{drive}:\\DCS World")));
    }
}

#[cfg(not(windows))]
fn platform_install_candidates(out: &mut Vec<PathBuf>) {
    // DCS under Steam + Proton on Linux.
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for root in [home.join(".local/share/Steam"), home.join(".steam/steam")] {
            for lib in steam_library_dirs(&root) {
                out.push(lib.join("steamapps").join("common").join(STEAM_DIR));
            }
        }
    }
}

#[cfg(windows)]
fn saved_games_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE") {
        v.push(PathBuf::from(home).join("Saved Games"));
    }
    v
}

#[cfg(not(windows))]
fn saved_games_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for root in [home.join(".local/share/Steam"), home.join(".steam/steam")] {
            v.push(
                root.join("steamapps/compatdata")
                    .join(STEAM_APP_ID)
                    .join("pfx/drive_c/users/steamuser/Saved Games"),
            );
        }
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_parse_and_normalise() {
        let t = Target::parse("saved:Mods\\aircraft/./A-4E-C/").unwrap();
        assert_eq!(t.root, Root::Saved);
        assert_eq!(t.rel, "Mods/aircraft/A-4E-C");
        assert_eq!(t.to_string(), "saved:Mods/aircraft/A-4E-C");
        assert!(Target::parse("saved:../evil").is_err());
        assert!(Target::parse("saved:C:/Windows").is_err());
        assert!(Target::parse("nowhere:x").is_err());
        assert_eq!(Target::parse("install:").unwrap().rel, "");
        assert_eq!(t.parent().unwrap().rel, "Mods/aircraft");
    }
}
