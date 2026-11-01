use std::{
    collections::BTreeMap,
    env,
    ffi::OsStr,
    io::Read,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;

use crate::{archive, cli::hide_window};

const WSL_TIMEOUT: Duration = Duration::from_secs(5);
/// Last known default user of each distribution. It is only learned while the distribution
/// is already running, so that a stopped one never has to be started to find its home.
const USERS_ARCHIVE: &str = "wsl-users";

#[derive(Serialize, Default, Clone)]
pub struct Detected {
    pub distros: Vec<Distro>,
}

#[derive(Serialize, Clone)]
pub struct Distro {
    pub name: String,
    pub user: Option<String>,
    pub running: bool,
}

/// `wsl.exe` prints UTF-16LE when its output is piped.
fn decode_wsl(bytes: &[u8]) -> String {
    if !bytes.contains(&0) {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let wide: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&wide)
}

/// Distribution names from `wsl -l -q` style output. Anything that is not a plain name
/// (an error message, a hint) is ignored.
fn parse_names(bytes: &[u8]) -> Vec<String> {
    decode_wsl(bytes)
        .lines()
        .map(|line| line.trim().trim_start_matches('\u{feff}').to_string())
        .filter(|name| {
            !name.is_empty()
                && !name.contains(char::is_whitespace)
                // An option of the help text ("--install", "--status"), not a distribution.
                && !name.starts_with('-')
                && !name.starts_with("docker-desktop")
        })
        .collect()
}

/// Runs `wsl.exe` and returns its output, or `None` on failure or after `WSL_TIMEOUT`.
/// The listing commands never start a distribution; the one command that runs inside a
/// distribution is only used on one that is already running.
fn wsl_output(args: &[&str]) -> Option<Vec<u8>> {
    output_within(&wsl_program(), args, WSL_TIMEOUT)
}

/// `wsl.exe`, or the program `ABF_WSL_EXE` names (the tests use fake ones).
pub fn wsl_program() -> std::ffi::OsString {
    env::var_os("ABF_WSL_EXE").unwrap_or_else(|| "wsl.exe".into())
}

/// Names of the installed distributions, without starting any of them.
pub fn distribution_names() -> Vec<String> {
    detect_recent().detected.distros.into_iter().map(|distro| distro.name).collect()
}

fn output_within(program: &OsStr, args: &[&str], timeout: Duration) -> Option<Vec<u8>> {
    let mut command = Command::new(program);
    hide_window(&mut command);
    let mut child = command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        bytes
    });
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let bytes = reader.join().ok()?;
                return status.success().then_some(bytes);
            }
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(40)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn saved_users() -> BTreeMap<String, String> {
    archive::read(USERS_ARCHIVE)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

#[derive(Clone)]
struct Detection {
    at: Instant,
    detected: Detected,
    /// False when the listing failed and `detected` is the last known state: it may be out of
    /// date, so no distribution is read from it.
    confirmed: bool,
}

/// Result of the last detection, so a burst of reads (a scan, both quotas, the history) does
/// not list WSL again for each one.
static RECENT: Mutex<Option<Detection>> = Mutex::new(None);
/// Short on purpose: it is also what keeps the app from reading a distribution that has just
/// stopped, which would start it again.
const RECENT_TTL: Duration = Duration::from_secs(2);

/// A fresh detection, used by the periodic check of the interface.
pub fn detect() -> Detected {
    detect_fresh().detected
}

fn detect_fresh() -> Detection {
    let fresh = detect_now();
    let mut recent = RECENT.lock().unwrap_or_else(|error| error.into_inner());
    let detection = match fresh {
        Some(detected) => Detection { at: Instant::now(), detected, confirmed: true },
        // A listing that fails or hangs (WSL restarting after a shutdown, a busy machine) says
        // nothing about what is installed: the distributions stay as last seen instead of
        // vanishing, which would also stop the keeping processes. A machine without WSL has
        // never had a successful listing, so it still has none.
        None => Detection {
            at: Instant::now(),
            detected: recent.as_ref().map(|last| last.detected.clone()).unwrap_or_default(),
            confirmed: false,
        },
    };
    *recent = Some(detection.clone());
    detection
}

/// The last detection when it is under `RECENT_TTL` old, otherwise a fresh one.
fn detect_recent() -> Detection {
    if let Ok(recent) = RECENT.lock() {
        if let Some(last) = recent.as_ref() {
            if last.at.elapsed() < RECENT_TTL {
                return last.clone();
            }
        }
    }
    detect_fresh()
}

/// Lists the distributions and which ones are running, without starting any of them:
/// `wsl -l -q` and `wsl --list --running --quiet` only read WSL's registry. `None` when the
/// listing fails or takes too long.
fn detect_now() -> Option<Detected> {
    let listed = wsl_output(&["-l", "-q"])?;
    // A failing `--running` (nothing is running) simply means an empty set.
    let running = wsl_output(&["--list", "--running", "--quiet"])
        .map(|bytes| parse_names(&bytes))
        .unwrap_or_default();
    let mut users = saved_users();
    let before = users.clone();
    let distros = parse_names(&listed)
        .into_iter()
        .map(|name| {
            let running = running.contains(&name);
            if running && !users.contains_key(&name) {
                // Already running, so asking it for its user cannot wake anything up.
                if let Some(user) = default_user(&name) {
                    users.insert(name.clone(), user);
                }
            }
            let user = users.get(&name).cloned();
            Distro { name, user, running }
        })
        .collect();
    if users != before {
        if let Ok(value) = serde_json::to_value(&users) {
            let _ = archive::write(USERS_ARCHIVE, &value);
        }
    }
    Some(Detected { distros })
}

/// Only called for a distribution reported as running, and only once per distribution (the
/// answer is remembered). It has the same time limit as the listing commands.
fn default_user(distro: &str) -> Option<String> {
    let bytes = wsl_output(&["-d", distro, "-e", "whoami"])?;
    let user = String::from_utf8_lossy(&bytes).trim().to_string();
    (!user.is_empty() && !user.contains(char::is_whitespace)).then_some(user)
}

/// Default user of a running distribution. A stopped distribution is an error: reading its
/// files through `\\wsl.localhost` would start it.
pub fn running_user(distro: &str) -> Result<String, String> {
    let detection = detect_recent();
    if !detection.confirmed {
        return Err("WSL could not be listed".to_string());
    }
    let found = detection
        .detected
        .distros
        .into_iter()
        .find(|candidate| candidate.name == distro)
        .ok_or_else(|| format!("WSL distribution '{distro}' is unavailable"))?;
    if !found.running {
        return Err(format!("WSL distribution '{distro}' is stopped"));
    }
    found
        .user
        .ok_or_else(|| format!("WSL distribution '{distro}' is unavailable"))
}

pub fn wsl_home_unc(distro: &str, user: &str) -> String {
    if user == "root" {
        format!(r"\\wsl.localhost\{distro}\root")
    } else {
        format!(r"\\wsl.localhost\{distro}\home\{user}")
    }
}

/// The program path and data folder are process-wide, so tests that set them take turns.
#[cfg(test)]
pub static TEST_ENVIRONMENT: Mutex<()> = Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16(text: &str) -> Vec<u8> {
        let mut bytes = vec![0xff, 0xfe];
        bytes.extend(text.encode_utf16().flat_map(u16::to_le_bytes));
        bytes
    }

    #[test]
    fn reads_utf16_names_and_skips_docker() {
        let names = parse_names(&utf16("Ubuntu\r\ndocker-desktop\r\nDebian\r\n"));
        assert_eq!(names, ["Ubuntu", "Debian"]);
    }

    #[test]
    fn reads_utf8_output() {
        assert_eq!(parse_names(b"Ubuntu\n"), ["Ubuntu"]);
    }

    use super::TEST_ENVIRONMENT as ENVIRONMENT;

    fn fake_wsl(dir: &std::path::Path, name: &str, script: &str) -> std::path::PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, script).unwrap();
        path
    }

    /// Windows machines where `wsl.exe` has nothing to list, with fake `wsl.exe` scripts.
    #[test]
    fn machines_without_wsl_have_no_distributions() {
        let _turn = ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-fake-wsl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        env::set_var("LOCALAPPDATA", dir.join("data"));

        let scripts = [
            ("silent", "@exit /b 0\r\n"),
            ("message", "@echo Windows Subsystem for Linux has no installed distributions.\r\n@exit /b 0\r\n"),
            ("not enabled", "@echo The optional component is not enabled.\r\n@exit /b 1\r\n"),
            ("failure", "@exit /b 4\r\n"),
            // The usage text a Windows 10 without WSL prints, even with a success code.
            ("usage text", "@echo Utilisation : wsl.exe [Argument]\r\n@echo     --install\r\n@echo     --status\r\n@echo    --help\r\n@exit /b 0\r\n"),
        ];
        for (label, script) in scripts {
            let fake = fake_wsl(&dir, "wsl.cmd", script);
            env::set_var("ABF_WSL_EXE", &fake);
            assert!(detect_now().unwrap_or_default().distros.is_empty(), "{label}: expected no distribution");
        }
        // No wsl.exe at all.
        env::set_var("ABF_WSL_EXE", dir.join("missing.exe"));
        assert!(detect_now().is_none());

        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_frozen_wsl_exe_is_stopped_after_the_time_limit() {
        let dir = env::temp_dir().join(format!("abf-frozen-wsl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = fake_wsl(&dir, "wsl.cmd", "@ping -n 10 127.0.0.1 >nul\r\n");
        let started = Instant::now();
        let output = output_within(fake.as_os_str(), &["-l", "-q"], Duration::from_millis(800));
        assert!(output.is_none());
        assert!(started.elapsed() < Duration::from_secs(4), "took {:?}", started.elapsed());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A distribution that is stopped is listed from memory and never queried.
    #[test]
    fn a_stopped_distribution_is_never_asked_for_its_user() {
        let _turn = ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-stopped-wsl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mark = dir.join("queried.txt");
        env::set_var("LOCALAPPDATA", dir.join("data"));
        env::set_var("ABF_FAKE_MARK", &mark);
        let script = "@echo off\r\nif \"%1\"==\"-l\" goto list\r\nif \"%1\"==\"--list\" goto running\r\n\
            if \"%1\"==\"-d\" goto inside\r\nexit /b 2\r\n:list\r\necho Ubuntu\r\nexit /b 0\r\n\
            :running\r\nif \"%ABF_FAKE_RUNNING%\"==\"1\" echo Ubuntu\r\nexit /b 0\r\n\
            :inside\r\necho x> \"%ABF_FAKE_MARK%\"\r\necho beboy\r\nexit /b 0\r\n";
        env::set_var("ABF_WSL_EXE", fake_wsl(&dir, "wsl.cmd", script));

        // Running: the user is asked once and remembered.
        env::set_var("ABF_FAKE_RUNNING", "1");
        let running = detect_now().unwrap();
        assert!(running.distros[0].running);
        assert_eq!(running.distros[0].user.as_deref(), Some("beboy"));
        assert!(mark.exists());
        std::fs::remove_file(&mark).unwrap();

        // Stopped: still known by name and user, and nothing was run inside it.
        env::set_var("ABF_FAKE_RUNNING", "0");
        let stopped = detect_now().unwrap();
        assert!(!stopped.distros[0].running);
        assert_eq!(stopped.distros[0].user.as_deref(), Some("beboy"));
        assert!(!mark.exists(), "a stopped distribution must not be queried");

        for key in ["ABF_WSL_EXE", "ABF_FAKE_MARK", "ABF_FAKE_RUNNING", "LOCALAPPDATA"] {
            env::remove_var(key);
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A listing that fails after a good one keeps the distributions, but nothing is read from
    /// them until a listing succeeds again.
    #[test]
    fn a_failed_listing_keeps_the_last_known_distributions() {
        let _turn = ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-failed-wsl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        env::set_var("LOCALAPPDATA", dir.join("data"));
        *RECENT.lock().unwrap() = None;

        let good = "@echo off\r\nif \"%1\"==\"-l\" goto list\r\nif \"%1\"==\"--list\" goto running\r\n\
            if \"%1\"==\"-d\" goto inside\r\nexit /b 2\r\n:list\r\necho Ubuntu\r\nexit /b 0\r\n\
            :running\r\necho Ubuntu\r\nexit /b 0\r\n:inside\r\necho beboy\r\nexit /b 0\r\n";
        env::set_var("ABF_WSL_EXE", fake_wsl(&dir, "good.cmd", good));
        assert_eq!(detect().distros.len(), 1);
        assert_eq!(running_user("Ubuntu").as_deref(), Ok("beboy"));

        env::set_var("ABF_WSL_EXE", fake_wsl(&dir, "broken.cmd", "@exit /b 4\r\n"));
        let kept = detect();
        assert_eq!(kept.distros.len(), 1, "the distribution does not vanish");
        assert_eq!(distribution_names(), ["Ubuntu"], "the keeping processes keep their target");
        assert!(running_user("Ubuntu").is_err(), "an unconfirmed state is never read");

        env::set_var("ABF_WSL_EXE", fake_wsl(&dir, "good.cmd", good));
        assert_eq!(detect().distros.len(), 1);
        assert!(running_user("Ubuntu").is_ok());

        *RECENT.lock().unwrap() = None;
        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = std::fs::remove_dir_all(dir);
    }

    /// What `wsl.exe -l -q` printed on a Windows 10 22H2 machine without WSL (exit code 1).
    #[test]
    fn ignores_the_usage_text_of_wsl_without_the_feature() {
        let help = "Copyright (c) Microsoft Corporation. Tous droits réservés.\r\n\r\n\
            Utilisation : wsl.exe [Argument]\r\n\r\nArguments :\r\n\r\n    --install <Options>\r\n\
            \x20       Installez les fonctionnalités du sous-système Windows pour Linux.\r\n\
            \x20           --inbox\r\n                Installez la fonctionnalité optionnelle.\r\n\
            \x20       --list, -| [Options]\r\n    --status\r\n       Affiche l'état.\r\n   --help\r\n\
            \x20       Affiche des informations sur l'utilisation.\r\n";
        assert!(parse_names(help.as_bytes()).is_empty());
        assert!(parse_names(&utf16(help)).is_empty());
    }

    #[test]
    fn ignores_messages_that_are_not_names() {
        let message = utf16("Windows Subsystem for Linux has no installed distributions.\r\n");
        assert!(parse_names(&message).is_empty());
        assert!(parse_names(&[]).is_empty());
    }
}
