use std::{
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::Value;

/// Files the app may keep in its data directory; nothing else is ever read or written.
const NAMES: [&str; 4] = ["quota-history", "report-cache", "daily-metrics", "wsl-users"];
const MAX_BYTES: usize = 64 * 1024 * 1024;
static NEXT_WRITE: AtomicU64 = AtomicU64::new(0);

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
    read_or_set_aside(&path)
}

/// `None` only when there is nothing usable to lose: the page then starts this archive afresh
/// and saves over it, which would destroy days no harness reports any more. So a file that
/// exists but cannot be opened (another program holds it) is an error, and the page leaves the
/// archive alone for this run; corrupt files are renamed `.broken-<ms>` for a manual recovery.
fn read_or_set_aside(path: &Path) -> Result<Option<Value>, String> {
    let backup = backup_of(path);
    let mut corrupt = Vec::new();
    for candidate in [path, backup.as_path()] {
        match fs::read(candidate) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(value) => return Ok(Some(value)),
                Err(_) => corrupt.push(candidate),
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("{} cannot be read: {error}", candidate.display())),
        }
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis());
    for file in corrupt {
        let aside = PathBuf::from(format!("{}.broken-{stamp}", file.display()));
        fs::rename(file, &aside)
            .map_err(|error| format!("{} cannot be set aside: {error}", file.display()))?;
    }
    Ok(None)
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
    let temp = path.with_extension(format!(
        "json.{}-{}.tmp",
        std::process::id(),
        NEXT_WRITE.fetch_add(1, Ordering::SeqCst)
    ));
    // On disk before the rename: after a power cut the file holds either the old or the new
    // content, never a renamed empty one.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| error.to_string())?;
    let written = file.write_all(&bytes).and_then(|()| file.sync_all());
    drop(file);
    // The temporary file is ours from here: a failed write or rename never leaves it behind.
    let saved = written.and_then(|()| fs::rename(&temp, &path));
    if saved.is_err() {
        let _ = fs::remove_file(&temp);
    }
    saved.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_temporary_name_collision_never_overwrites_an_existing_file() {
        let _turn = crate::sources::TEST_ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        struct RestoreLocalData(Option<std::ffi::OsString>);
        impl Drop for RestoreLocalData {
            fn drop(&mut self) {
                match &self.0 {
                    Some(value) => env::set_var("LOCALAPPDATA", value),
                    None => env::remove_var("LOCALAPPDATA"),
                }
            }
        }
        let _restore = RestoreLocalData(env::var_os("LOCALAPPDATA"));
        let root = env::temp_dir().join(format!("abf-archive-exclusive-test-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        env::set_var("LOCALAPPDATA", &root);
        fs::create_dir_all(directory()).unwrap();
        let path = file_for("report-cache").unwrap();
        let collision = path.with_extension(format!(
            "json.{}-{}.tmp",
            std::process::id(),
            NEXT_WRITE.load(Ordering::SeqCst)
        ));
        fs::write(&collision, b"existing file").unwrap();
        let value = serde_json::json!({ "saved": true });

        assert!(write("report-cache", &value).is_err());
        assert_eq!(fs::read(&collision).unwrap(), b"existing file");
        write("report-cache", &value).unwrap();
        assert_eq!(parse(&path), Some(value.clone()));
        assert_eq!(fs::read(&collision).unwrap(), b"existing file");
        fs::remove_dir_all(&root).unwrap();

        // A rename that fails (a folder sits where the archive goes) leaves no temporary file.
        fs::create_dir_all(&path).unwrap();
        assert!(write("report-cache", &value).is_err());
        let leftovers = fs::read_dir(directory())
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0, "a failed save removes its temporary file");
        fs::remove_dir_all(root).unwrap();
    }

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
        let value = read_or_set_aside(&path).unwrap();
        assert_eq!(value.unwrap()["ok"], true);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn nothing_saved_yet_is_a_fresh_start() {
        let dir = env::temp_dir().join(format!("abf-archive-empty-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_or_set_aside(&dir.join("x.json")), Ok(None));
        let _ = fs::remove_dir_all(dir);
    }

    /// Starting afresh would save over the files: they are kept aside instead.
    #[test]
    fn corrupt_files_are_set_aside_before_a_fresh_start() {
        let dir = env::temp_dir().join(format!("abf-archive-broken-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.json");
        fs::write(&path, b"").unwrap();
        fs::write(backup_of(&path), b"{ broken").unwrap();

        assert_eq!(read_or_set_aside(&path), Ok(None));
        assert!(!path.exists() && !backup_of(&path).exists());
        let kept: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(kept.len(), 2, "both files are kept: {kept:?}");
        assert!(kept.iter().all(|name| name.contains(".broken-")));
        let _ = fs::remove_dir_all(dir);
    }

    /// A file another program holds may be perfectly good: it is an error, not an empty archive.
    #[test]
    fn a_file_that_cannot_be_opened_is_an_error() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = env::temp_dir().join(format!("abf-archive-locked-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.json");
        fs::write(&path, br#"{"ok":true}"#).unwrap();
        let held = fs::OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();

        assert!(read_or_set_aside(&path).is_err());
        drop(held);
        assert_eq!(read_or_set_aside(&path).unwrap().unwrap()["ok"], true);
        let _ = fs::remove_dir_all(dir);
    }
}
