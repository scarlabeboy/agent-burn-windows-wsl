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

/// Bundled next to the app. A development build also accepts an explicit override and a build
/// of the Rust workspace; an installed app only runs the CLI it was installed with, so neither a
/// variable nor the folder it is started from can make it run another program.
fn locate_cli() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
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
    #[cfg(debug_assertions)]
    {
        let mut dir = env::current_dir().ok();
        while let Some(current) = dir {
            for profile in ["release", "debug"] {
                candidates.push(current.join("rust/target").join(profile).join(CLI_NAME));
            }
            dir = current.parent().map(Path::to_path_buf);
        }
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            if cfg!(debug_assertions) {
                "agent-burn.exe not found. Build it with `cargo build -p agent-burn` in rust/, or set ABF_CLI."
                    .to_string()
            } else {
                "agent-burn.exe is missing from the app folder: reinstall the app (an antivirus may have removed it)."
                    .to_string()
            }
        })
}

/// A temporary copy of OpenCode's database, removed as soon as it goes out of use, so no copy
/// of a user's conversations stays in the temp folder.
struct Snapshot(Option<PathBuf>);

impl Drop for Snapshot {
    fn drop(&mut self) {
        if let Some(dir) = &self.0 {
            let _ = fs::remove_dir_all(dir);
        }
    }
}

/// Numbers the temporary files of this process, so overlapping runs never share one.
static NEXT_RUN: AtomicU64 = AtomicU64::new(0);

/// Point the CLI at one source: native Windows (no change) or a WSL distribution.
/// Returns the distribution's home directory (UNC path) for WSL sources, and the OpenCode
/// copy to keep alive until the run is over. Only a usage scan needs OpenCode; a quota
/// reading does not, so it skips the copy.
fn apply_source(
    command: &mut Command,
    distro: Option<&str>,
    with_opencode: bool,
) -> Result<(Option<String>, Snapshot), String> {
    let Some(distro) = distro else {
        return Ok((None, Snapshot(None)));
    };
    let user = sources::running_user(distro)?;
    let home = sources::wsl_home_unc(distro, &user);
    let has_claude = std::path::Path::new(&format!(r"{home}\.claude\projects")).is_dir();
    command.envs(wsl_environment(&home, has_claude));
    // A Cursor token set on Windows belongs to the Windows source, which already counts it.
    command.env_remove("CURSOR_ACCESS_TOKEN");
    let mut snapshot = Snapshot(None);
    if with_opencode {
        let (dir, copy) = snapshot_opencode(distro, &format!(r"{home}\.local\share\opencode"));
        command.env("OPENCODE_DATA_DIR", dir);
        snapshot = copy;
    }
    Ok((Some(home), snapshot))
}

/// Where the CLI finds each harness of a distribution. Sign-in tokens are read from the
/// distribution's own home directory. Cursor is the one harness the CLI looks up through
/// `%APPDATA%` on Windows, which would be the Windows sign-in counted a second time: it is
/// pointed at the Linux location instead.
///
/// The CLI stops on a `CLAUDE_CONFIG_DIR` without `projects/`, which would fail the whole scan of
/// a distribution where Claude Code was never used: it is only set when that folder exists.
/// Without it the CLI looks under `HOME`, the distribution's home, never the Windows one.
fn wsl_environment(home: &str, has_claude: bool) -> Vec<(&'static str, String)> {
    let mut environment = vec![
        ("CODEX_HOME", format!(r"{home}\.codex")),
        ("CURSOR_DATA_DIR", format!(r"{home}\.config\Cursor")),
        ("HOME", home.to_string()),
    ];
    if has_claude {
        environment.push(("CLAUDE_CONFIG_DIR", format!(r"{home}\.claude")));
    }
    environment
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

/// Whether a scan of `agents` (empty = every harness) will read OpenCode. Only then is its
/// database worth copying: a copy for a harness that is turned off is wasted work.
fn reads_opencode(agents: &[String]) -> bool {
    agents.is_empty() || agents.iter().any(|agent| agent == "opencode")
}

pub fn run_summary(
    distro: Option<&str>,
    offline: bool,
    claude_plan: &str,
    scope: &Scope,
) -> Result<Value, String> {
    let mut command = Command::new(locate_cli()?);
    command.args(["summary", "--json", "--no-color"]);
    let period_scoped = scope.since.is_some() || scope.until.is_some();
    if !period_scoped {
        // `--value` adds the subscription block (plan, price, value) and the Claude account
        // meters. Period scans only need usage, so they skip it. A harness selection keeps it:
        // the block then covers the selected harnesses.
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
    let (home, _snapshot) = apply_source(&mut command, distro, reads_opencode(&scope.agents))?;
    if !period_scoped {
        if let Some(plan) = resolve_claude_plan(claude_plan, home.as_deref()) {
            command.args(["--claude-plan", &plan]);
        }
    }
    run_json(command, distro, "summary")
}

/// The daily weekly-limit usage of a `harness codex` report, or an empty list when it has none.
fn limit_usage_of(report: &Value) -> Value {
    match report.get("limitUsageDaily") {
        Some(days) if days.is_array() => days.clone(),
        _ => Value::Array(Vec::new()),
    }
}

/// How much of the weekly Codex limit each recent day used, by surface and model. It comes from
/// the ChatGPT dashboard through the Codex sign-in of the source, so it needs the network.
pub fn run_limit_usage(distro: Option<&str>) -> Result<Value, String> {
    let mut command = Command::new(locate_cli()?);
    command.args(["harness", "codex", "--json", "--no-color"]);
    let (_, _snapshot) = apply_source(&mut command, distro, false)?;
    run_json(command, distro, "limits").map(|report| limit_usage_of(&report))
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
    let (_, _snapshot) = apply_source(&mut command, distro, false)?;
    run_json(command, distro, harness)
}

fn run_json(mut command: Command, distro: Option<&str>, label: &str) -> Result<Value, String> {
    hide_window(&mut command);
    // Unique per run: two overlapping runs of the same source must not share a file.
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
/// Returns the directory OpenCode should read (the copy, or the original when there is none to
/// copy) and the guard that deletes the copy. Each run has its own copy.
fn snapshot_opencode(distro: &str, source: &str) -> (String, Snapshot) {
    let source_dir = Path::new(source);
    if !source_dir.join("opencode.db").is_file() {
        return (source.to_string(), Snapshot(None));
    }
    let target = env::temp_dir().join(format!(
        "abf-opencode-{}-{}-{}",
        std::process::id(),
        NEXT_RUN.fetch_add(1, Ordering::SeqCst),
        distro.replace(['/', '\\'], "_")
    ));
    if fs::create_dir_all(&target).is_err() {
        return (source.to_string(), Snapshot(None));
    }
    // From here the guard removes whatever was copied, including after a failed copy.
    let guard = Snapshot(Some(target.clone()));
    for name in ["opencode.db", "opencode.db-wal", "opencode.db-shm"] {
        let from = source_dir.join(name);
        if from.is_file() && fs::copy(&from, target.join(name)).is_err() {
            return (source.to_string(), guard);
        }
    }
    (target.to_string_lossy().into_owned(), guard)
}

/// Removes temporary files an earlier run of the app left behind (it was stopped in the
/// middle of a scan), including the old fixed-name OpenCode copy. Recent files are kept: a
/// scan may be running.
pub fn clean_stale_temp() {
    clean_stale_in(&env::temp_dir(), Duration::from_secs(3600));
}

fn clean_stale_in(dir: &Path, min_age: Duration) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let ours = (name.starts_with("abf-") && name.ends_with(".json"))
            || name.starts_with("abf-opencode-");
        let old = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age >= min_age);
        if ours && old {
            let path = entry.path();
            let _ = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
        }
    }
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

    /// No harness of a WSL source may be looked up on the Windows side, or Computer adds it twice.
    #[test]
    fn a_wsl_source_reads_every_harness_from_its_own_home() {
        let home = r"\\wsl.localhost\Ubuntu\home\user";
        for (name, value) in wsl_environment(home, true) {
            assert!(value.starts_with(home), "{name} points outside the distribution: {value}");
        }
        let names: Vec<_> = wsl_environment(home, true).iter().map(|(name, _)| *name).collect();
        assert!(names.contains(&"CURSOR_DATA_DIR"), "Cursor would read %APPDATA% on Windows");
        assert!(names.contains(&"CLAUDE_CONFIG_DIR"));
    }

    /// A distribution without Claude Code must still be read: the CLI rejects a Claude folder
    /// that does not exist, so none is given, and HOME keeps the lookup inside the distribution.
    #[test]
    fn a_wsl_source_without_claude_gets_no_claude_folder() {
        let home = r"\\wsl.localhost\Ubuntu\home\user";
        let environment = wsl_environment(home, false);
        assert!(environment.iter().all(|(name, _)| *name != "CLAUDE_CONFIG_DIR"));
        assert!(environment.contains(&("HOME", home.to_string())));
    }

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

    fn aged(path: &Path, hours: u64) {
        let file = fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(std::time::SystemTime::now() - Duration::from_secs(hours * 3600))
            .unwrap();
    }

    #[test]
    fn cleans_only_old_files_of_the_app() {
        let dir = env::temp_dir().join(format!("abf-clean-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let old_scan = dir.join("abf-1-summary-windows-0.json");
        let new_scan = dir.join("abf-2-summary-windows-0.json");
        let old_copy = dir.join("abf-opencode-Ubuntu");
        let other = dir.join("notes.json");
        let similar = dir.join("abf-notes.txt");
        for file in [&old_scan, &new_scan, &other, &similar] {
            fs::write(file, b"{}").unwrap();
        }
        fs::create_dir_all(&old_copy).unwrap();
        fs::write(old_copy.join("opencode.db"), b"x").unwrap();
        for path in [&old_scan, &other, &similar] {
            aged(path, 3);
        }
        // A directory's own age is what counts; Windows opens a directory only with this flag.
        {
            use std::os::windows::fs::OpenOptionsExt;
            const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
            fs::OpenOptions::new()
                .write(true)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
                .open(&old_copy)
                .unwrap()
                .set_modified(std::time::SystemTime::now() - Duration::from_secs(3 * 3600))
                .unwrap();
        }

        clean_stale_in(&dir, Duration::from_secs(3600));

        assert!(!old_scan.exists(), "an old scan file goes");
        assert!(!old_copy.exists(), "an old OpenCode copy goes");
        assert!(new_scan.exists(), "a recent file may belong to a running scan");
        assert!(other.exists() && similar.exists(), "files of other programs stay");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn takes_the_daily_limit_usage_out_of_a_codex_report() {
        let report = serde_json::json!({
            "agent": "codex",
            "limitUsageDaily": [{ "date": "2026-10-31", "usedPercent": 33.1 }]
        });
        assert_eq!(limit_usage_of(&report).as_array().map(Vec::len), Some(1));
        // A report without the field, or with something else in it, gives an empty list.
        assert_eq!(limit_usage_of(&serde_json::json!({ "agent": "codex" })), serde_json::json!([]));
        assert_eq!(
            limit_usage_of(&serde_json::json!({ "limitUsageDaily": "nope" })),
            serde_json::json!([])
        );
    }

    // With OpenCode turned off the scan lists every other harness in `--agents`, so its
    // database must not be copied.
    #[test]
    fn opencode_is_copied_only_when_the_scan_reads_it() {
        let names = |list: &[&str]| list.iter().map(|name| name.to_string()).collect::<Vec<_>>();
        assert!(reads_opencode(&[]), "no selection scans every harness");
        assert!(reads_opencode(&names(&["claude", "opencode"])));
        assert!(!reads_opencode(&names(&["claude", "codex", "cursor"])));
        assert!(!reads_opencode(&names(&["claude"])));
    }

    #[test]
    fn a_copy_of_the_opencode_database_is_made_and_removed() {
        let source = env::temp_dir().join(format!("abf-source-test-{}", std::process::id()));
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("opencode.db"), b"x").unwrap();
        let (dir, copy) = snapshot_opencode("Test", source.to_str().unwrap());
        let copied = copy.0.clone().expect("a copy is made");
        assert!(copied.join("opencode.db").is_file());
        assert_eq!(Path::new(&dir), copied);
        drop(copy);
        assert!(!copied.exists());
        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn the_opencode_copy_is_removed_with_its_guard() {
        let dir = env::temp_dir().join(format!("abf-guard-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("opencode.db"), b"x").unwrap();
        drop(Snapshot(Some(dir.clone())));
        assert!(!dir.exists());
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
