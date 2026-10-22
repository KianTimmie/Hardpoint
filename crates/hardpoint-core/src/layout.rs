//! Work out where an archive's contents belong in DCS when the hub entry
//! doesn't spell it out. Mods are packaged inconsistently, so this recognises the
//! common shapes and refuses to guess otherwise.

use std::fs;
use std::path::Path;

use crate::error::{Error, Result};
use crate::model::{Category, Mapping};
use crate::paths::{Root, Target};

/// Top-level folders of `Saved Games\DCS`.
const SAVED_MARKERS: &[&str] = &[
    "Mods", "Liveries", "Scripts", "Missions", "Kneeboard", "Config", "Sounds", "Tracks", "MissionEditor",
    "Input", "Movies",
];
/// Folders that only exist in the DCS install folder.
const INSTALL_MARKERS: &[&str] = &["bin", "bin-mt", "CoreMods", "Bazar", "FUI"];

const DOC_EXTS: &[&str] = &[
    "txt", "md", "pdf", "url", "html", "htm", "jpg", "jpeg", "png", "gif", "webp", "rtf", "doc", "docx", "nfo",
];

#[derive(Debug, Clone, Default)]
pub struct LayoutHints {
    pub category: Option<Category>,
    /// For liveries: the DCS aircraft folder name, e.g. `FA-18C_hornet`.
    pub livery_for: Option<String>,
    /// Folder name to use when the mod's files sit at the archive root.
    pub fallback_name: String,
}

struct Listing {
    dirs: Vec<String>,
    files: Vec<String>,
}

fn is_doc(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("readme") || lower.starts_with("license") || lower.starts_with("changelog") {
        return true;
    }
    match lower.rsplit_once('.') {
        Some((_, ext)) => DOC_EXTS.contains(&ext),
        None => false,
    }
}

fn list(dir: &Path) -> Result<Listing> {
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| Error::io("read folder", dir, e))? {
        let e = e.map_err(|e| Error::io("read folder", dir, e))?;
        let name = e.file_name().to_string_lossy().to_string();
        if name == "__MACOSX" || name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }
        let ft = e.file_type().map_err(|e| Error::io("read folder", dir, e))?;
        if ft.is_dir() {
            dirs.push(name);
        } else if ft.is_file() {
            files.push(name);
        }
    }
    dirs.sort();
    files.sort();
    Ok(Listing { dirs, files })
}

fn canonical_marker(name: &str, markers: &[&'static str]) -> Option<&'static str> {
    markers.iter().copied().find(|m| m.eq_ignore_ascii_case(name))
}

fn join_rel(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    }
}

fn has_file(l: &Listing, name: &str) -> bool {
    l.files.iter().any(|f| f.eq_ignore_ascii_case(name))
}

/// Detect mappings for an extracted archive rooted at `root`.
pub fn detect(root: &Path, hints: &LayoutHints) -> Result<Vec<Mapping>> {
    let mut out = Vec::new();
    analyse(root, "", None, hints, &mut out)?;
    if out.is_empty() {
        return Err(Error::AmbiguousLayout("the archive has no recognisable DCS content".into()));
    }
    Ok(out)
}

fn analyse(dir: &Path, prefix: &str, dir_name: Option<&str>, hints: &LayoutHints, out: &mut Vec<Mapping>) -> Result<()> {
    let l = list(dir)?;

    let name = dir_name.map(str::to_string).unwrap_or_else(|| hints.fallback_name.clone());

    // 1. A module folder (has entry.lua) → Mods/aircraft|tech|terrains/<name>.
    //    Checked first: modules often contain their own Liveries, Input or bin folders,
    //    which would otherwise look like a Saved Games or install-folder mirror.
    if has_file(&l, "entry.lua") {
        let kind = match hints.category {
            Some(Category::Tech) | Some(Category::Utility) => "tech",
            Some(Category::Terrain) => "terrains",
            _ => "aircraft",
        };
        out.push(Mapping { from: prefix.to_string(), to: Target::new(Root::Saved, &format!("Mods/{kind}/{name}"))? });
        return Ok(());
    }

    let meaningful_files: Vec<&String> = l.files.iter().filter(|f| !is_doc(f)).collect();

    // 2. Mirror of the install folder (OvGME-style packages).
    if l.dirs.iter().any(|d| canonical_marker(d, INSTALL_MARKERS).is_some()) {
        out.push(Mapping { from: prefix.to_string(), to: Target::new(Root::Install, "")? });
        return Ok(());
    }

    // 3. Mirror of Saved Games\DCS: map each recognised top-level folder. Anything else at
    //    this level means we don't understand the package, so refuse rather than drop it.
    let saved: Vec<(&String, &'static str)> = l
        .dirs
        .iter()
        .filter_map(|d| canonical_marker(d, SAVED_MARKERS).map(|m| (d, m)))
        .collect();
    if !saved.is_empty() {
        let unknown: Vec<&String> = l
            .dirs
            .iter()
            .filter(|d| canonical_marker(d, SAVED_MARKERS).is_none())
            .chain(meaningful_files.iter().copied())
            .collect();
        if !unknown.is_empty() {
            return Err(Error::AmbiguousLayout(format!(
                "'{}' mixes Saved Games folders with other items ({})",
                if prefix.is_empty() { "archive root" } else { prefix },
                unknown.iter().take(4).map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
            )));
        }
        for (d, canon) in saved {
            out.push(Mapping { from: join_rel(prefix, d), to: Target::new(Root::Saved, canon)? });
        }
        return Ok(());
    }

    // 4. A livery folder (has description.lua) → Liveries/<aircraft>/<name>.
    if has_file(&l, "description.lua") {
        let Some(aircraft) = hints.livery_for.as_deref() else {
            return Err(Error::AmbiguousLayout(format!(
                "'{name}' is a livery, but it isn't clear which aircraft it is for"
            )));
        };
        out.push(Mapping {
            from: prefix.to_string(),
            to: Target::new(Root::Saved, &format!("Liveries/{aircraft}/{name}"))?,
        });
        return Ok(());
    }

    // 5. Loose mission files.
    let mizzes: Vec<&String> = l.files.iter().filter(|f| f.to_ascii_lowercase().ends_with(".miz")).collect();
    if !mizzes.is_empty() && l.dirs.is_empty() {
        for f in mizzes {
            out.push(Mapping { from: join_rel(prefix, f), to: Target::new(Root::Saved, &format!("Missions/{f}"))? });
        }
        return Ok(());
    }

    // 6. A single wrapper folder → look inside.
    if l.dirs.len() == 1 && meaningful_files.is_empty() {
        let d = &l.dirs[0];
        return analyse(&dir.join(d), &join_rel(prefix, d), Some(d), hints, out);
    }

    // 7. Several folders: every one must resolve on its own (e.g. a pack of liveries).
    if l.dirs.len() > 1 && meaningful_files.is_empty() {
        let mut sub = Vec::new();
        for d in &l.dirs {
            analyse(&dir.join(d), &join_rel(prefix, d), Some(d), hints, &mut sub)?;
        }
        out.extend(sub);
        return Ok(());
    }

    Err(Error::AmbiguousLayout(format!(
        "'{}' doesn't match a known mod layout (no Mods/Liveries/Scripts folders, entry.lua or description.lua)",
        if prefix.is_empty() { "archive root" } else { prefix }
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(root: &Path, rel: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b"x").unwrap();
    }

    fn hints() -> LayoutHints {
        LayoutHints { fallback_name: "fallback".into(), ..Default::default() }
    }

    #[test]
    fn saved_games_mirror() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "Pack v1/Mods/aircraft/X/entry.lua");
        touch(t.path(), "Pack v1/Liveries/F-16C_50/skin/description.lua");
        touch(t.path(), "Pack v1/README.txt");
        let m = detect(t.path(), &hints()).unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].from, "Pack v1/Liveries");
        assert_eq!(m[0].to.to_string(), "saved:Liveries");
        assert_eq!(m[1].to.to_string(), "saved:Mods");
    }

    #[test]
    fn bare_module_folder() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "A-4E-C/entry.lua");
        touch(t.path(), "A-4E-C/Cockpit/x.lua");
        touch(t.path(), "Manual.pdf");
        let m = detect(t.path(), &hints()).unwrap();
        assert_eq!(m, vec![Mapping { from: "A-4E-C".into(), to: Target::parse("saved:Mods/aircraft/A-4E-C").unwrap() }]);
    }

    #[test]
    fn install_mirror() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "Bazar/shaders/x.fx");
        let m = detect(t.path(), &hints()).unwrap();
        assert_eq!(m[0].to.to_string(), "install:");
    }

    #[test]
    fn livery_needs_aircraft() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "SAAF 2 Sqn/description.lua");
        assert!(matches!(detect(t.path(), &hints()), Err(Error::AmbiguousLayout(_))));
        let h = LayoutHints { livery_for: Some("F-16C_50".into()), ..hints() };
        let m = detect(t.path(), &h).unwrap();
        assert_eq!(m[0].to.to_string(), "saved:Liveries/F-16C_50/SAAF 2 Sqn");
    }

    #[test]
    fn module_with_own_liveries_and_bin() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "Nike_Hercules/entry.lua");
        touch(t.path(), "Nike_Hercules/Liveries/MIM14B/description.lua");
        touch(t.path(), "Nike_Hercules/Database/Vehicle/x.lua");
        touch(t.path(), "Nike_Hercules/bin/fm.dll");
        let h = LayoutHints { category: Some(Category::Tech), ..hints() };
        let m = detect(t.path(), &h).unwrap();
        assert_eq!(m, vec![Mapping { from: "Nike_Hercules".into(), to: Target::parse("saved:Mods/tech/Nike_Hercules").unwrap() }]);
    }

    #[test]
    fn mixed_mirror_is_ambiguous() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "Pack/Mods/tech/X/entry.lua");
        touch(t.path(), "Pack/Extras/thing.lua");
        assert!(matches!(detect(t.path(), &hints()), Err(Error::AmbiguousLayout(_))));
    }

    #[test]
    fn junk_is_ambiguous() {
        let t = tempfile::tempdir().unwrap();
        touch(t.path(), "random.dll");
        assert!(matches!(detect(t.path(), &hints()), Err(Error::AmbiguousLayout(_))));
    }
}
