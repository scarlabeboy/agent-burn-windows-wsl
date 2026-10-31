use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde_json::Value;

/// Files the app may keep in its data directory; nothing else is ever read or written.
const NAMES: [&str; 3] = ["quota-history", "report-cache", "wsl-users"];
const MAX_BYTES: usize = 64 * 1024 * 1024;

fn local_data() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
}

/// Kept apart from the install directory (`%LOCALAPPDATA%\Agent Burn Windows`), in the
/// folder named after the app identifier, so uninstalling the program never mixes with it.
fn directory() -> PathBuf {
    local_data()
        .join("dev.scarlabeboy.agent-burn-windows")
        .join("archive")
}

/// Where the first versions kept the archive: the install directory itself.
fn legacy_directory() -> PathBuf {
    local_data().join("Agent Burn Windows")
}

/// Moves one archive (and its backup) from `old` to `new`. A file is only removed from `old`
/// once its copy in `new` reads back identical; a file already in `new` is never overwritten.
fn migrate_files(old: &Path, new: &Path, name: &str) {
    for suffix in ["json", "json.bak"] {
        let file = format!("{name}.{suffix}");
        let (from, to) = (old.join(&file), new.join(&file));
        if !from.is_file() || to.exists() {
            continue;
        }
        let copied = fs::create_dir_all(new)
            .and_then(|()| fs::copy(&from, &to))
            .is_ok();
        if copied && matches!((fs::read(&from), fs::read(&to)), (Ok(a), Ok(b)) if a == b) {
            let _ = fs::remove_file(&from);
        }
    }
    // Only succeeds when empty, so the install directory is never removed.
    let _ = fs::remove_dir(old);
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
    migrate_files(&legacy_directory(), &directory(), name);
    Ok(parse(&path).or_else(|| parse(&backup_of(&path))))
}

/// Atomic write that keeps the previous valid file as `.bak`.
pub fn write(name: &str, value: &Value) -> Result<(), String> {
    let path = file_for(name)?;
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("archive is too large".to_string());
    }
    migrate_files(&legacy_directory(), &directory(), name);
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
    fn migrates_old_files_without_overwriting_or_touching_others() {
        let root = env::temp_dir().join(format!("abf-migrate-test-{}", std::process::id()));
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("quota-history.json"), b"{\"a\":1}").unwrap();
        fs::write(old.join("quota-history.json.bak"), b"{\"a\":0}").unwrap();
        fs::write(old.join("report-cache.json"), b"{\"old\":true}").unwrap();
        fs::write(new.join("report-cache.json"), b"{\"new\":true}").unwrap();
        fs::write(old.join("program.exe"), b"binary").unwrap();

        migrate_files(&old, &new, "quota-history");
        migrate_files(&old, &new, "report-cache");

        assert_eq!(fs::read(new.join("quota-history.json")).unwrap(), b"{\"a\":1}");
        assert_eq!(fs::read(new.join("quota-history.json.bak")).unwrap(), b"{\"a\":0}");
        assert!(!old.join("quota-history.json").exists());
        // A file already in the new folder wins and the old copy is left alone.
        assert_eq!(fs::read(new.join("report-cache.json")).unwrap(), b"{\"new\":true}");
        assert!(old.join("report-cache.json").exists());
        // The install directory (still holding the program) is never removed.
        assert!(old.join("program.exe").exists());
        let _ = fs::remove_dir_all(root);
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
