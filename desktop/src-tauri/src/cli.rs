use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use serde_json::Value;

use crate::sources;

const TIMEOUT: Duration = Duration::from_secs(180);
const MAX_OUTPUT_BYTES: u64 = 16_000_000;
const CLI_NAME: &str = "agent-burn.exe";

pub fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// Bundled next to the app, an explicit override, or a dev build of the Rust workspace.
fn locate_cli() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("ABF_CLI").map(PathBuf::from) {
        return path
            .is_file()
            .then_some(path)
            .ok_or_else(|| "ABF_CLI does not point to a file".to_string());
    }
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(CLI_NAME));
            candidates.push(dir.join("resources").join(CLI_NAME));
        }
    }
    let mut dir = env::current_dir().ok();
    while let Some(current) = dir {
        for profile in ["release", "debug"] {
            candidates.push(current.join("rust/target").join(profile).join(CLI_NAME));
        }
        dir = current.parent().map(Path::to_path_buf);
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            "agent-burn.exe not found. Build it with `cargo build -p agent-burn` in rust/, or set ABF_CLI."
                .to_string()
        })
}

pub fn run_summary(distro: Option<&str>, offline: bool) -> Result<Value, String> {
    let cli = locate_cli()?;
    let mut command = Command::new(cli);
    command.args(["summary", "--json", "--no-color"]);
    if offline {
        command.arg("--offline");
    }
    if let Some(distro) = distro {
        let user = sources::detect()
            .distros
            .into_iter()
            .find(|candidate| candidate.name == distro)
            .and_then(|candidate| candidate.user)
            .ok_or_else(|| format!("WSL distribution '{distro}' is unavailable"))?;
        let home = sources::wsl_home_unc(distro, &user);
        command
            .env("CLAUDE_CONFIG_DIR", format!(r"{home}\.claude"))
            .env("CODEX_HOME", format!(r"{home}\.codex"))
            .env("OPENCODE_DATA_DIR", format!(r"{home}\.local\share\opencode"));
    }
    hide_window(&mut command);

    let output_path = env::temp_dir().join(format!(
        "abf-{}-{}.json",
        std::process::id(),
        distro.unwrap_or("windows")
    ));
    let output_file = fs::File::create(&output_path).map_err(|error| error.to_string())?;
    let result = run_to_file(&mut command, output_file, &output_path);
    let _ = fs::remove_file(&output_path);
    result
}

fn run_to_file(
    command: &mut Command,
    output_file: fs::File,
    output_path: &Path,
) -> Result<Value, String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(output_file)
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("could not start agent-burn: {error}"))?;
    let deadline = Instant::now() + TIMEOUT;
    let status = loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("agent-burn timed out".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    };
    if !status.success() {
        return Err(format!("agent-burn exited with {status}"));
    }
    let size = fs::metadata(output_path)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_OUTPUT_BYTES {
        return Err("agent-burn output is too large".to_string());
    }
    let bytes = fs::read(output_path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes)
        .map_err(|_| "agent-burn returned an unsupported report".to_string())
}
