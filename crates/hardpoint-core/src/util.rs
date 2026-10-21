use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};

pub fn sha256_file(path: &Path) -> Result<String> {
    let f = File::open(path).map_err(|e| Error::io("open", path, e))?;
    let mut r = BufReader::with_capacity(1 << 20, f);
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = r.read(&mut buf).map_err(|e| Error::io("read", path, e))?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

/// Copy `src` to `dst`, hashing as we go. Returns (sha256, bytes).
pub fn copy_with_hash(src: &Path, dst: &Path) -> Result<(String, u64)> {
    let f = File::open(src).map_err(|e| Error::io("open", src, e))?;
    let mut r = BufReader::with_capacity(1 << 20, f);
    let out = File::create(dst).map_err(|e| Error::io("create", dst, e))?;
    let mut w = BufWriter::with_capacity(1 << 20, out);
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let n = r.read(&mut buf).map_err(|e| Error::io("read", src, e))?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        w.write_all(&buf[..n]).map_err(|e| Error::io("write", dst, e))?;
        total += n as u64;
    }
    w.flush().map_err(|e| Error::io("write", dst, e))?;
    Ok((hex::encode(h.finalize()), total))
}

/// Move a file, falling back to copy + delete across drives.
pub fn move_file(src: &Path, dst: &Path) -> Result<()> {
    if let Some(p) = dst.parent() {
        fs::create_dir_all(p).map_err(|e| Error::io("create folder", p, e))?;
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(src, dst).map_err(|e| Error::io("copy", src, e))?;
            fs::remove_file(src).map_err(|e| Error::io("delete", src, e))
        }
    }
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|source| Error::Json {
            what: path.display().to_string(),
            source,
        }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(Error::io("read", path, e)),
    }
}

/// Write JSON via a temp file + rename so a crash never leaves a half-written file.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| Error::io("create folder", p, e))?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(|source| Error::Json {
        what: path.display().to_string(),
        source,
    })?;
    {
        let mut f = File::create(&tmp).map_err(|e| Error::io("create", &tmp, e))?;
        f.write_all(&bytes).map_err(|e| Error::io("write", &tmp, e))?;
        f.sync_all().ok();
    }
    fs::rename(&tmp, path).map_err(|e| Error::io("replace", path, e))
}

/// `"My Cool Mod v1.2 (fixed).zip"` → `"my-cool-mod-v1-2-fixed"`.
pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "mod".into()
    } else {
        out
    }
}

/// Make a string safe to use as a single folder name.
pub fn safe_dir_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+') { c } else { '_' })
        .collect();
    let cleaned = cleaned.trim_matches('.').to_string();
    if cleaned.is_empty() {
        "_".into()
    } else {
        cleaned
    }
}

/// Remove `dir` and its parents while they are empty, stopping at `stop`.
pub fn prune_empty_dirs(dir: &Path, stop: &Path) {
    let mut cur = Some(dir);
    while let Some(d) = cur {
        if d == stop || !d.starts_with(stop) {
            break;
        }
        if fs::remove_dir(d).is_err() {
            break;
        }
        cur = d.parent();
    }
}
