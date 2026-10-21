//! Lenient version comparison. Mod authors write "v2.1", "2.1.0-beta", "1.0b"…

use std::cmp::Ordering;

fn parse(v: &str) -> Option<semver::Version> {
    let v = v.trim().trim_start_matches(['v', 'V']);
    if let Ok(s) = semver::Version::parse(v) {
        return Some(s);
    }
    // Pad "2.1" → "2.1.0", keeping any "-beta" suffix.
    let (core, pre) = match v.find(|c: char| !(c.is_ascii_digit() || c == '.')) {
        Some(i) => (&v[..i], v[i..].trim_start_matches(['-', '_', ' '])),
        None => (v, ""),
    };
    let mut parts: Vec<&str> = core.split('.').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    while parts.len() < 3 {
        parts.push("0");
    }
    let mut s = parts.join(".");
    if !pre.is_empty() {
        let pre: String = pre.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' { c } else { '-' }).collect();
        s = format!("{s}-{pre}");
    }
    semver::Version::parse(&s).ok()
}

/// Compare two version strings; falls back to string order when unparseable.
pub fn compare(a: &str, b: &str) -> Ordering {
    match (parse(a), parse(b)) {
        (Some(x), Some(y)) => x.cmp(&y),
        _ => a.cmp(b),
    }
}

pub fn is_newer(candidate: &str, installed: &str) -> bool {
    compare(candidate, installed) == Ordering::Greater
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lenient() {
        assert!(is_newer("v2.1", "2.0.9"));
        assert!(is_newer("2.1.0", "2.1.0-beta"));
        assert!(is_newer("1.10", "1.9"));
        assert_eq!(compare("v1.0", "1.0.0"), Ordering::Equal);
        assert!(!is_newer("1.0", "1.0"));
    }
}
