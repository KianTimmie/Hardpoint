use serde::{Deserialize, Serialize};

use crate::paths::Target;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Aircraft,
    Livery,
    Terrain,
    Mission,
    Campaign,
    Script,
    Sound,
    Tech,
    Utility,
    #[default]
    #[serde(other)]
    Other,
}

/// "Copy `from` (a file or folder inside the mod archive) to `to`."
/// `from` is relative to the archive root; an empty `from` means the whole archive.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Mapping {
    #[serde(default)]
    pub from: String,
    pub to: Target,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ModSource {
    /// Installed from the hub index.
    Hub {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        download_url: Option<String>,
    },
    /// Dropped in by the user, with no hub entry.
    Local { file_name: String },
}
