use std::process::Command;

use serde::Serialize;

use crate::cli::hide_window;

#[derive(Serialize, Default)]
pub struct Detected {
    pub distros: Vec<Distro>,
}

#[derive(Serialize)]
pub struct Distro {
    pub name: String,
    pub user: Option<String>,
}

/// `wsl.exe` prints UTF-16LE when its output is piped.
fn decode_wsl(bytes: &[u8]) -> String {
    let wide: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&wide)
}

fn wsl() -> Command {
    let mut command = Command::new("wsl.exe");
    hide_window(&mut command);
    command
}

pub fn detect() -> Detected {
    let Ok(output) = wsl().args(["-l", "-q"]).output() else {
        return Detected::default();
    };
    if !output.status.success() {
        return Detected::default();
    }
    let distros = decode_wsl(&output.stdout)
        .lines()
        .map(|line| line.trim().trim_start_matches('\u{feff}').to_string())
        .filter(|name| !name.is_empty() && !name.starts_with("docker-desktop"))
        .map(|name| {
            let user = default_user(&name);
            Distro { name, user }
        })
        .collect();
    Detected { distros }
}

fn default_user(distro: &str) -> Option<String> {
    let output = wsl().args(["-d", distro, "-e", "whoami"]).output().ok()?;
    let user = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && !user.is_empty()).then_some(user)
}

pub fn wsl_home_unc(distro: &str, user: &str) -> String {
    if user == "root" {
        format!(r"\\wsl.localhost\{distro}\root")
    } else {
        format!(r"\\wsl.localhost\{distro}\home\{user}")
    }
}
