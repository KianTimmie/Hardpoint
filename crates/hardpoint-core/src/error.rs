use std::path::PathBuf;

use serde::Serialize;

use crate::paths::Target;

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// A file the mod wants to write that another enabled mod already owns.
#[derive(Debug, Clone, Serialize)]
pub struct Conflict {
    pub target: Target,
    pub owner: String,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{action} {path}: {source}")]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid JSON in {what}: {source}")]
    Json {
        what: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("could not read archive: {0}")]
    Archive(String),
    #[error("{0}")]
    UnsupportedArchive(String),
    #[error("archive contains an unsafe path and was rejected: {0}")]
    UnsafePath(String),
    #[error("could not work out where this mod installs: {0}")]
    AmbiguousLayout(String),
    #[error("invalid install target '{0}' (expected e.g. 'saved:Mods/aircraft/MyMod')")]
    BadTarget(String),
    #[error("the DCS {0} folder is not set; run detection or set it in Settings")]
    PathNotSet(&'static str),
    #[error("mod '{0}' is not in the library")]
    UnknownMod(String),
    #[error("mod '{0}' is already enabled")]
    AlreadyEnabled(String),
    #[error("mod '{0}' is not enabled")]
    NotEnabled(String),
    #[error("{} file(s) are already provided by other enabled mods ({})", .0.len(), owners(.0))]
    Conflicts(Vec<Conflict>),
    #[error("'{target}' exists as a folder but the mod needs to write a file there")]
    FileDirClash { target: String },
    #[error("download failed: {0}")]
    Download(String),
    #[error("checksum mismatch: the index says {expected}, the file is {actual}")]
    Checksum { expected: String, actual: String },
    #[error("'{name}' {version} is not a direct download; get it from {url}, then drop the archive into Hardpoint")]
    ManualDownload {
        name: String,
        version: String,
        url: String,
    },
    #[error("'{name}' is used inside missions rather than installed into DCS; download it from {url}")]
    NotInstallable { name: String, url: String },
    #[error("'{0}' is not in the hub index")]
    NotInIndex(String),
    #[error("dependency cycle involving '{0}'")]
    DependencyCycle(String),
    #[error("{0}")]
    Other(String),
}

fn owners(c: &[Conflict]) -> String {
    let mut o: Vec<&str> = c.iter().map(|c| c.owner.as_str()).collect();
    o.sort();
    o.dedup();
    o.join(", ")
}

impl Error {
    pub fn io(action: &'static str, path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Error::Io {
            action,
            path: path.into(),
            source,
        }
    }

    /// Short machine-readable kind, used by the desktop UI.
    pub fn kind(&self) -> &'static str {
        match self {
            Error::Io { .. } => "io",
            Error::Json { .. } => "json",
            Error::Archive(_) => "archive",
            Error::UnsupportedArchive(_) => "unsupported_archive",
            Error::UnsafePath(_) => "unsafe_path",
            Error::AmbiguousLayout(_) => "ambiguous_layout",
            Error::BadTarget(_) => "bad_target",
            Error::PathNotSet(_) => "path_not_set",
            Error::UnknownMod(_) => "unknown_mod",
            Error::AlreadyEnabled(_) => "already_enabled",
            Error::NotEnabled(_) => "not_enabled",
            Error::Conflicts(_) => "conflicts",
            Error::FileDirClash { .. } => "file_dir_clash",
            Error::Download(_) => "download",
            Error::Checksum { .. } => "checksum",
            Error::ManualDownload { .. } => "manual_download",
            Error::NotInstallable { .. } => "not_installable",
            Error::NotInIndex(_) => "not_in_index",
            Error::DependencyCycle(_) => "dependency_cycle",
            Error::Other(_) => "other",
        }
    }
}

/// Serializable form of an error for the UI.
#[derive(Debug, Serialize)]
pub struct ErrorInfo {
    pub kind: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicts: Option<Vec<Conflict>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

impl From<&Error> for ErrorInfo {
    fn from(e: &Error) -> Self {
        ErrorInfo {
            kind: e.kind(),
            message: e.to_string(),
            conflicts: match e {
                Error::Conflicts(c) => Some(c.clone()),
                _ => None,
            },
            url: match e {
                Error::ManualDownload { url, .. } | Error::NotInstallable { url, .. } => Some(url.clone()),
                _ => None,
            },
        }
    }
}
