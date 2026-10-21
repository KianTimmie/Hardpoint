//! Archive extraction (zip, 7z) and folder import, with path-traversal protection.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read};
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{Error, Result};
use crate::paths::{is_safe_relative, normalize_rel};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Zip,
    SevenZip,
    Folder,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ExtractStats {
    pub files: u64,
    pub bytes: u64,
}

/// Identify an archive by its magic bytes (extensions lie).
pub fn sniff(path: &Path) -> Result<Format> {
    if path.is_dir() {
        return Ok(Format::Folder);
    }
    let mut f = File::open(path).map_err(|e| Error::io("open", path, e))?;
    let mut magic = [0u8; 8];
    let n = f.read(&mut magic).map_err(|e| Error::io("read", path, e))?;
    let m = &magic[..n];
    if m.starts_with(b"PK\x03\x04") || m.starts_with(b"PK\x05\x06") {
        Ok(Format::Zip)
    } else if m.starts_with(&[b'7', b'z', 0xBC, 0xAF, 0x27, 0x1C]) {
        Ok(Format::SevenZip)
    } else if m.starts_with(b"Rar!") {
        Err(Error::UnsupportedArchive(
            "RAR archives can't be opened yet. Extract it with 7-Zip and drop the extracted folder in instead.".into(),
        ))
    } else {
        Err(Error::UnsupportedArchive(format!(
            "{} is not a zip or 7z archive",
            path.file_name().map(|s| s.to_string_lossy()).unwrap_or_default()
        )))
    }
}

/// Extract `src` (zip, 7z or a folder) into `dest`, which must not exist yet or be empty.
pub fn extract(src: &Path, dest: &Path) -> Result<ExtractStats> {
    fs::create_dir_all(dest).map_err(|e| Error::io("create folder", dest, e))?;
    match sniff(src)? {
        Format::Zip => extract_zip(src, dest),
        Format::SevenZip => extract_7z(src, dest),
        Format::Folder => copy_tree(src, dest),
    }
}

fn safe_join(dest: &Path, name: &str) -> Result<Option<PathBuf>> {
    let Some(rel) = normalize_rel(name) else {
        return Err(Error::UnsafePath(name.to_string()));
    };
    if rel.is_empty() {
        return Ok(None);
    }
    let p = PathBuf::from(&rel);
    if !is_safe_relative(&p) {
        return Err(Error::UnsafePath(name.to_string()));
    }
    Ok(Some(dest.join(p)))
}

fn write_stream(reader: &mut dyn Read, out: &Path) -> Result<u64> {
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| Error::io("create folder", parent, e))?;
    }
    let f = File::create(out).map_err(|e| Error::io("create", out, e))?;
    let mut w = BufWriter::new(f);
    io::copy(reader, &mut w).map_err(|e| Error::io("write", out, e))
}

fn extract_zip(src: &Path, dest: &Path) -> Result<ExtractStats> {
    let f = File::open(src).map_err(|e| Error::io("open", src, e))?;
    let mut zip = zip::ZipArchive::new(BufReader::new(f)).map_err(|e| Error::Archive(e.to_string()))?;
    let mut stats = ExtractStats::default();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| Error::Archive(e.to_string()))?;
        let raw_name = entry.name().map_err(|e| Error::Archive(e.to_string()))?.to_string();
        // enclosed_name() rejects absolute and `..` paths; we double-check with our own rules.
        if entry.enclosed_name().is_none() {
            return Err(Error::UnsafePath(raw_name));
        }
        let Some(out) = safe_join(dest, &raw_name)? else { continue };
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| Error::io("create folder", &out, e))?;
            continue;
        }
        stats.bytes += write_stream(&mut entry, &out)?;
        stats.files += 1;
    }
    Ok(stats)
}

fn extract_7z(src: &Path, dest: &Path) -> Result<ExtractStats> {
    let mut stats = ExtractStats::default();
    let mut failure: Option<Error> = None;
    let res = sevenz_rust2::decompress_file_with_extract_fn(src, dest, |entry, reader, _default| {
        let out = match safe_join(dest, entry.name()) {
            Ok(Some(p)) => p,
            Ok(None) => return Ok(true),
            Err(e) => {
                failure = Some(e);
                return Ok(false); // stop extraction
            }
        };
        if entry.is_directory() {
            if let Err(e) = fs::create_dir_all(&out) {
                failure = Some(Error::io("create folder", &out, e));
                return Ok(false);
            }
            return Ok(true);
        }
        match write_stream(reader, &out) {
            Ok(n) => {
                stats.bytes += n;
                stats.files += 1;
                Ok(true)
            }
            Err(e) => {
                failure = Some(e);
                Ok(false)
            }
        }
    });
    if let Some(e) = failure {
        return Err(e);
    }
    res.map_err(|e| Error::Archive(e.to_string()))?;
    Ok(stats)
}

/// Copy a folder tree (used when a user drops an already-extracted mod folder).
pub fn copy_tree(src: &Path, dest: &Path) -> Result<ExtractStats> {
    let mut stats = ExtractStats::default();
    for entry in WalkDir::new(src).follow_links(false) {
        let entry = entry.map_err(|e| Error::Archive(e.to_string()))?;
        let rel = entry.path().strip_prefix(src).expect("walkdir stays under root");
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dest.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&out).map_err(|e| Error::io("create folder", &out, e))?;
        } else if entry.file_type().is_file() {
            if let Some(p) = out.parent() {
                fs::create_dir_all(p).map_err(|e| Error::io("create folder", p, e))?;
            }
            stats.bytes += fs::copy(entry.path(), &out).map_err(|e| Error::io("copy", entry.path(), e))?;
            stats.files += 1;
        }
        // Symlinks are skipped on purpose.
    }
    Ok(stats)
}
