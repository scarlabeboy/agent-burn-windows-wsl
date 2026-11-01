use std::{
    collections::BTreeMap,
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
                && !name.starts_with("docker-desktop")
        })
        .collect()
}

/// Runs `wsl.exe` and returns its output, or `None` on failure or after `WSL_TIMEOUT`.
/// The listing commands never start a distribution; the one command that runs inside a
/// distribution is only used on one that is already running.
fn wsl_output(args: &[&str]) -> Option<Vec<u8>> {
    let mut command = Command::new("wsl.exe");
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
    let deadline = Instant::now() + WSL_TIMEOUT;
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

/// Lists the distributions and which ones are running, without starting any of them:
/// `wsl -l -q` and `wsl --list --running --quiet` only read WSL's registry.
/// Result of the last detection, so a burst of reads (a scan, both quotas, the history) does
/// not list WSL again for each one.
static RECENT: Mutex<Option<(Instant, Detected)>> = Mutex::new(None);
/// Short on purpose: it is also what keeps the app from reading a distribution that has just
/// stopped, which would start it again.
const RECENT_TTL: Duration = Duration::from_secs(2);

/// A fresh detection, used by the periodic check of the interface.
pub fn detect() -> Detected {
    let detected = detect_now();
    if let Ok(mut recent) = RECENT.lock() {
        *recent = Some((Instant::now(), detected.clone()));
    }
    detected
}

/// The last detection when it is under `RECENT_TTL` old, otherwise a fresh one.
fn detect_recent() -> Detected {
    if let Ok(recent) = RECENT.lock() {
        if let Some((at, detected)) = recent.as_ref() {
            if at.elapsed() < RECENT_TTL {
                return detected.clone();
            }
        }
    }
    detect()
}

fn detect_now() -> Detected {
    let Some(listed) = wsl_output(&["-l", "-q"]) else {
        return Detected::default();
    };
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
    Detected { distros }
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
    let found = detect_recent()
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

    #[test]
    fn ignores_messages_that_are_not_names() {
        let message = utf16("Windows Subsystem for Linux has no installed distributions.\r\n");
        assert!(parse_names(&message).is_empty());
        assert!(parse_names(&[]).is_empty());
    }
}
