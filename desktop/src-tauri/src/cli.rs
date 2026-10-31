use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use std::sync::atomic::{AtomicU64, Ordering};

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

/// Point the CLI at one source: native Windows (no change) or a WSL distribution.
/// Returns the distribution's home directory (UNC path) for WSL sources.
fn apply_source(
    command: &mut Command,
    distro: Option<&str>,
    with_home: bool,
) -> Result<Option<String>, String> {
    let Some(distro) = distro else {
        return Ok(None);
    };
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
        .env(
            "OPENCODE_DATA_DIR",
            snapshot_opencode(distro, &format!(r"{home}\.local\share\opencode")),
        );
    if with_home {
        // Sign-in tokens are read from the distribution's own home directory.
        command.env("HOME", &home);
    }
    Ok(Some(home))
}

const CLAUDE_PLANS: [&str; 3] = ["pro", "max-5x", "max-20x"];

/// Claude plan passed to the CLI. The CLI cannot detect it, so "auto" reads only the plan
/// fields of the source's own Claude sign-in file; a manual choice is used as given.
fn resolve_claude_plan(setting: &str, home: Option<&str>) -> Option<String> {
    match setting {
        "none" => None,
        "auto" => {
            let home = home
                .map(str::to_string)
                .or_else(|| env::var("USERPROFILE").ok())?;
            claude_plan_from_credentials(
                &Path::new(&home).join(".claude").join(".credentials.json"),
            )
        }
        other => CLAUDE_PLANS.contains(&other).then(|| other.to_string()),
    }
}

/// Reads `subscriptionType` and `rateLimitTier` only; no token is kept or logged.
fn claude_plan_from_credentials(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    let oauth = value.get("claudeAiOauth")?;
    let kind = oauth
        .get("subscriptionType")?
        .as_str()?
        .to_ascii_lowercase();
    let tier = oauth
        .get("rateLimitTier")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    match kind.as_str() {
        "pro" => Some("pro".to_string()),
        "max" if tier.contains("20x") => Some("max-20x".to_string()),
        "max" if tier.contains("5x") => Some("max-5x".to_string()),
        _ => None,
    }
}

/// A date range and harness selection for a period scan, validated before reaching the CLI.
pub struct Scope {
    pub since: Option<String>,
    pub until: Option<String>,
    pub agents: Vec<String>,
}

fn is_compact_date(text: &str) -> bool {
    text.len() == 8 && text.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_agent_name(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_lowercase())
}

pub fn run_summary(
    distro: Option<&str>,
    offline: bool,
    claude_plan: &str,
    scope: &Scope,
) -> Result<Value, String> {
    let mut command = Command::new(locate_cli()?);
    command.args(["summary", "--json", "--no-color"]);
    let scoped = scope.since.is_some() || scope.until.is_some() || !scope.agents.is_empty();
    if !scoped {
        // `--value` adds the subscription block (plan, price, value) and the Claude account
        // meters. Period scans only need usage, so they skip it.
        command.arg("--value");
    }
    for (flag, date) in [("--since", &scope.since), ("--until", &scope.until)] {
        if let Some(date) = date {
            if !is_compact_date(date) {
                return Err(format!("invalid date '{date}'"));
            }
            command.args([flag, date]);
        }
    }
    if !scope.agents.is_empty() {
        if !scope.agents.iter().all(|agent| is_agent_name(agent)) {
            return Err("invalid harness name".to_string());
        }
        command.args(["--agents", &scope.agents.join(",")]);
    }
    if offline {
        command.arg("--offline");
    }
    let home = apply_source(&mut command, distro, true)?;
    if !scoped {
        if let Some(plan) = resolve_claude_plan(claude_plan, home.as_deref()) {
            command.args(["--claude-plan", &plan]);
        }
    }
    run_json(command, distro, "summary")
}

/// Live subscription limits for one harness, read without scanning any usage logs.
pub fn run_quota(harness: &str, distro: Option<&str>, force: bool) -> Result<Value, String> {
    if !matches!(harness, "claude" | "codex") {
        return Err(format!("unsupported harness '{harness}'"));
    }
    let mut command = Command::new(locate_cli()?);
    command
        .args(["harness", harness, "--json", "--no-color", "--no-offline"])
        .env("AGENT_BURN_QUOTA_ONLY", "1");
    if force {
        command.env("AGENT_BURN_FORCE_REFRESH", "1");
    }
    apply_source(&mut command, distro, true)?;
    run_json(command, distro, harness)
}

fn run_json(mut command: Command, distro: Option<&str>, label: &str) -> Result<Value, String> {
    hide_window(&mut command);
    // Unique per run: two overlapping runs of the same source must not share a file.
    static NEXT_RUN: AtomicU64 = AtomicU64::new(0);
    let output_path = env::temp_dir().join(format!(
        "abf-{}-{}-{}-{}.json",
        std::process::id(),
        label,
        distro.unwrap_or("windows"),
        NEXT_RUN.fetch_add(1, Ordering::SeqCst)
    ));
    let output_file = fs::File::create(&output_path).map_err(|error| error.to_string())?;
    let result = run_to_file(&mut command, output_file, &output_path);
    let _ = fs::remove_file(&output_path);
    result
}

/// OpenCode keeps its usage in a SQLite WAL database, which cannot be opened in place on
/// the `\\wsl.localhost` network share. Read a local copy of the database files instead.
/// Returns the directory OpenCode should read: the copy, or the original when it is absent.
fn snapshot_opencode(distro: &str, source: &str) -> String {
    let source_dir = Path::new(source);
    if !source_dir.join("opencode.db").is_file() {
        return source.to_string();
    }
    let target = env::temp_dir().join(format!("abf-opencode-{}", distro.replace(['/', '\\'], "_")));
    if fs::create_dir_all(&target).is_err() {
        return source.to_string();
    }
    for name in ["opencode.db", "opencode.db-wal", "opencode.db-shm"] {
        let from = source_dir.join(name);
        let to = target.join(name);
        if from.is_file() {
            if fs::copy(&from, &to).is_err() {
                return source.to_string();
            }
        } else {
            let _ = fs::remove_file(&to);
        }
    }
    target.to_string_lossy().into_owned()
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    fn plan_for(json: &str) -> Option<String> {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = env::temp_dir().join(format!(
            "abf-plan-test-{}-{}.json",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        fs::write(&path, json).unwrap();
        let plan = claude_plan_from_credentials(&path);
        let _ = fs::remove_file(&path);
        plan
    }

    #[test]
    fn reads_the_pro_plan() {
        let json =
            r#"{"claudeAiOauth":{"subscriptionType":"pro","rateLimitTier":"default_claude_ai"}}"#;
        assert_eq!(plan_for(json).as_deref(), Some("pro"));
    }

    #[test]
    fn reads_max_plans_from_the_rate_limit_tier() {
        let five = r#"{"claudeAiOauth":{"subscriptionType":"max","rateLimitTier":"default_claude_max_5x"}}"#;
        let twenty = r#"{"claudeAiOauth":{"subscriptionType":"max","rateLimitTier":"default_claude_max_20x"}}"#;
        assert_eq!(plan_for(five).as_deref(), Some("max-5x"));
        assert_eq!(plan_for(twenty).as_deref(), Some("max-20x"));
    }

    #[test]
    fn leaves_unknown_plans_undetected() {
        assert_eq!(
            plan_for(r#"{"claudeAiOauth":{"subscriptionType":"max"}}"#),
            None
        );
        assert_eq!(
            plan_for(r#"{"claudeAiOauth":{"subscriptionType":"free"}}"#),
            None
        );
        assert_eq!(plan_for("not json"), None);
    }

    #[test]
    fn validates_scan_scope_values() {
        assert!(is_compact_date("20261031"));
        assert!(!is_compact_date("2026-10-31"));
        assert!(!is_compact_date("1; rm"));
        assert!(is_agent_name("claude"));
        assert!(!is_agent_name("claude,codex"));
        assert!(!is_agent_name(""));
    }

    #[test]
    fn manual_choice_is_validated() {
        assert_eq!(
            resolve_claude_plan("max-5x", None).as_deref(),
            Some("max-5x")
        );
        assert_eq!(resolve_claude_plan("none", None), None);
        assert_eq!(resolve_claude_plan("$$", None), None);
    }
}
