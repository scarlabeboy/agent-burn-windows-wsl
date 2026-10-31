use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde_json::Value;

/// Files the app may keep in its data directory; nothing else is ever read or written.
const NAMES: [&str; 3] = ["quota-history", "report-cache", "wsl-users"];
const MAX_BYTES: usize = 64 * 1024 * 1024;

fn directory() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("Agent Burn Windows")
}

fn file_for(name: &str) -> Result<PathBuf, String> {
    NAMES
        .contains(&name)
        .then(|| directory().join(format!("{name}.json")))
        .ok_or_else(|| format!("unknown archive '{name}'"))
}

fn backup_of(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn parse(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

/// The saved value, falling back to the previous valid copy when the file is corrupt.
pub fn read(name: &str) -> Result<Option<Value>, String> {
    let path = file_for(name)?;
    Ok(parse(&path).or_else(|| parse(&backup_of(&path))))
}

/// Atomic write that keeps the previous valid file as `.bak`.
pub fn write(name: &str, value: &Value) -> Result<(), String> {
    let path = file_for(name)?;
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("archive is too large".to_string());
    }
    fs::create_dir_all(directory()).map_err(|error| error.to_string())?;
    // Never replace the recovery copy with a corrupt primary file.
    if parse(&path).is_some() {
        let _ = fs::copy(&path, backup_of(&path));
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| error.to_string())?;
    fs::rename(&temp, &path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_names_outside_the_allowlist() {
        assert!(file_for("../secrets").is_err());
        assert!(file_for("quota-history").is_ok());
    }

    #[test]
    fn falls_back_to_the_backup_when_the_file_is_corrupt() {
        let dir = env::temp_dir().join(format!("abf-archive-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.json");
        fs::write(backup_of(&path), br#"{"ok":true}"#).unwrap();
        fs::write(&path, b"{ broken").unwrap();
        let value = parse(&path).or_else(|| parse(&backup_of(&path)));
        assert_eq!(value.unwrap()["ok"], true);
        let _ = fs::remove_dir_all(dir);
    }
}
