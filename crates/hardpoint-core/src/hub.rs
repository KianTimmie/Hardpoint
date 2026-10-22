//! The hub index: a static JSON file listing mods, their releases and how to install them.
//! The same file drives the website and the desktop app. See docs/MANIFEST.md.

use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};
use crate::model::{Category, Mapping};
use crate::paths::Root;
use crate::version;

pub const INDEX_SCHEMA: u32 = 1;
const USER_AGENT: &str = concat!("Hardpoint/", env!("CARGO_PKG_VERSION"), " (+https://github.com/KianTimmie/Hardpoint)");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubIndex {
    pub schema: u32,
    #[serde(default)]
    pub generated: Option<String>,
    pub mods: Vec<HubMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// Freely licensed photo of the real aircraft or system, with its credit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cover {
    pub url: String,
    pub credit: String,
    pub license: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_version: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadKind {
    /// A URL Hardpoint can fetch directly (e.g. a GitHub release asset).
    Direct,
    /// A web page the user must visit to download (ED User Files, forums, Patreon…).
    Page,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub kind: DownloadKind,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changelog: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dcs_min: Option<String>,
    pub download: Download,
    /// Explicit install rules. When empty, Hardpoint detects the layout.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub install: Vec<Mapping>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub livery_for: Option<String>,
}

impl Release {
    /// Some(true) if the install rules touch the DCS install folder (may fail IC),
    /// Some(false) if they only touch Saved Games, None if unknown (no rules).
    pub fn writes_install_dir(&self) -> Option<bool> {
        if self.install.is_empty() {
            None
        } else {
            Some(self.install.iter().any(|m| m.to.root == Root::Install))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubMod {
    pub id: String,
    pub name: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub category: Category,
    #[serde(default)]
    pub tags: Vec<String>,
    pub authors: Vec<Author>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<Cover>,
    #[serde(default)]
    pub images: Vec<String>,
    /// Official DCS modules the mod needs (e.g. "F/A-18C Hornet").
    #[serde(default)]
    pub requires_modules: Vec<String>,
    /// Other hub mods that must be installed first.
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    /// False for things that aren't installed into DCS folders, such as Lua libraries
    /// loaded inside missions. The hub and app then offer a download link only.
    #[serde(default = "yes")]
    pub installable: bool,
    #[serde(default)]
    pub releases: Vec<Release>,
}

fn yes() -> bool {
    true
}

impl HubMod {
    pub fn latest(&self) -> Option<&Release> {
        self.releases.iter().max_by(|a, b| version::compare(&a.version, &b.version))
    }

    pub fn release(&self, v: Option<&str>) -> Option<&Release> {
        match v {
            None => self.latest(),
            Some(v) => self.releases.iter().find(|r| version::compare(&r.version, v).is_eq()),
        }
    }
}

impl HubIndex {
    pub fn parse(text: &str) -> Result<Self> {
        let idx: HubIndex = serde_json::from_str(text).map_err(|source| Error::Json { what: "hub index".into(), source })?;
        if idx.schema > INDEX_SCHEMA {
            return Err(Error::Other(format!(
                "the hub index uses schema {}, but this version of Hardpoint understands up to {}; please update Hardpoint",
                idx.schema, INDEX_SCHEMA
            )));
        }
        Ok(idx)
    }

    pub fn get(&self, id: &str) -> Option<&HubMod> {
        self.mods.iter().find(|m| m.id == id)
    }

    /// Identify a downloaded archive by checksum (for page/manual downloads).
    pub fn match_sha256(&self, sha: &str) -> Option<(&HubMod, &Release)> {
        self.mods.iter().find_map(|m| {
            m.releases
                .iter()
                .find(|r| r.download.sha256.as_deref().is_some_and(|s| s.eq_ignore_ascii_case(sha)))
                .map(|r| (m, r))
        })
    }

    /// Hub mods (with releases) needed to install `id`, dependencies first.
    pub fn install_order(&self, id: &str) -> Result<Vec<String>> {
        fn visit(idx: &HubIndex, id: &str, stack: &mut Vec<String>, out: &mut Vec<String>) -> Result<()> {
            if out.iter().any(|x| x == id) {
                return Ok(());
            }
            if stack.iter().any(|x| x == id) {
                return Err(Error::DependencyCycle(id.to_string()));
            }
            let m = idx.get(id).ok_or_else(|| Error::NotInIndex(id.to_string()))?;
            stack.push(id.to_string());
            for d in &m.dependencies {
                visit(idx, &d.id, stack, out)?;
            }
            stack.pop();
            out.push(id.to_string());
            Ok(())
        }
        let mut out = Vec::new();
        visit(self, id, &mut Vec::new(), &mut out)?;
        Ok(out)
    }
}

/// Load an index from an http(s) URL or a local file path.
pub fn fetch_index(location: &str) -> Result<HubIndex> {
    let text = if location.starts_with("http://") || location.starts_with("https://") {
        let mut resp = ureq::get(location)
            .header("User-Agent", USER_AGENT)
            .call()
            .map_err(|e| Error::Download(format!("{location}: {e}")))?;
        let mut s = String::new();
        resp.body_mut()
            .as_reader()
            .read_to_string(&mut s)
            .map_err(|e| Error::Download(format!("{location}: {e}")))?;
        s
    } else {
        fs::read_to_string(location).map_err(|e| Error::io("read", location, e))?
    };
    HubIndex::parse(&text)
}

/// File name stem for a cached download, e.g. `community-a-4e-c-2.3`.
pub fn cache_stem(m: &HubMod, r: &Release) -> String {
    format!("{}-{}", m.id, crate::util::safe_dir_name(&r.version))
}

/// Progress callback: (bytes so far, total if known).
pub type Progress<'a> = &'a mut dyn FnMut(u64, Option<u64>);

/// Download `dl` into `cache_dir`, verifying the checksum when the index has one.
/// Re-uses an existing cached file whose checksum matches.
pub fn download(dl: &Download, cache_dir: &Path, stem: &str, progress: Progress) -> Result<PathBuf> {
    if dl.kind != DownloadKind::Direct {
        return Err(Error::Download(format!("{} is a web page, not a file", dl.url)));
    }
    fs::create_dir_all(cache_dir).map_err(|e| Error::io("create folder", cache_dir, e))?;
    let ext = dl
        .file_name
        .as_deref()
        .or_else(|| dl.url.rsplit('/').next())
        .and_then(|n| n.split('?').next())
        .and_then(|n| n.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()))
        .filter(|e| e.len() <= 4)
        .unwrap_or_else(|| "bin".into());
    let dest = cache_dir.join(format!("{stem}.{ext}"));

    if let (Some(expected), true) = (&dl.sha256, dest.is_file()) {
        if crate::util::sha256_file(&dest)?.eq_ignore_ascii_case(expected) {
            let len = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            progress(len, Some(len));
            return Ok(dest);
        }
    }

    let part = dest.with_extension(format!("{ext}.part"));
    let mut resp = ureq::get(&dl.url)
        .header("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| Error::Download(format!("{}: {e}", dl.url)))?;
    let total = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .or(dl.size);
    let mut reader = resp.body_mut().as_reader();
    let file = File::create(&part).map_err(|e| Error::io("create", &part, e))?;
    let mut w = BufWriter::with_capacity(1 << 20, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut got = 0u64;
    loop {
        let n = reader.read(&mut buf).map_err(|e| Error::Download(e.to_string()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        w.write_all(&buf[..n]).map_err(|e| Error::io("write", &part, e))?;
        got += n as u64;
        progress(got, total);
    }
    w.flush().map_err(|e| Error::io("write", &part, e))?;
    drop(w);

    let actual = hex::encode(hasher.finalize());
    if let Some(expected) = &dl.sha256 {
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(&part);
            return Err(Error::Checksum { expected: expected.clone(), actual });
        }
    }
    fs::rename(&part, &dest).map_err(|e| Error::io("rename", &part, e))?;
    Ok(dest)
}

/// An installed mod with a newer release on the hub.
#[derive(Debug, Clone, Serialize)]
pub struct Update {
    pub id: String,
    pub installed: String,
    pub latest: String,
}
