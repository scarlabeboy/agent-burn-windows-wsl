use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

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
                // A code: the page says it in its own language (`CLI_MISSING` in api.ts).
                "cli-missing: agent-burn.exe is missing from the app folder.".to_string()
            }
        })
}

/// The CLI also reads an `agent-burn.json` it finds in the current folder, `~/.config/agent-burn/`
/// or the Claude folder, which can change its figures (`until`, `jq`, prices) without the app
/// knowing. An explicit `--config` replaces that search; the null device never holds one, and a
/// configuration that cannot be read is simply none.
const NO_USER_CONFIG: [&str; 2] = ["--config", "NUL"];

/// Whether the CLI may renew the Claude Code sign-in (the "Renew the Claude Code sign-in"
/// setting). Off by default: a renewal replaces the token in `~/.claude/.credentials.json`,
/// which can sign out a `claude` command running at the same time. People who only use the
/// Claude apps, which never renew that file, need it to keep their quota.
static CLAUDE_RENEW: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_claude_renew(enabled: bool) {
    CLAUDE_RENEW.store(enabled, Ordering::SeqCst);
}

/// A run of `program` with `args` (the command and its first options) and no user configuration.
fn cli_command(program: PathBuf, args: &[&str]) -> Command {
    let mut command = Command::new(program);
    command.args(args).args(NO_USER_CONFIG);
    if !CLAUDE_RENEW.load(Ordering::SeqCst) {
        command.env("AGENT_BURN_NO_RENEW", "1");
    }
    command
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

/// Whether a summary asks for `--value`: the subscription block (plan, price, value) and the
/// Claude account meters. The CLI reads them online from the Claude and Codex servers, with
/// sign-in renewal disabled, so they are left out when quotas are turned off. Period
/// scans only need usage and skip it too. A harness selection keeps it: the block then covers
/// the selected harnesses.
fn wants_value(scope: &Scope, quotas: bool) -> bool {
    quotas && scope.since.is_none() && scope.until.is_none()
}

pub fn run_summary(
    distro: Option<&str>,
    offline: bool,
    quotas: bool,
    claude_plan: &str,
    scope: &Scope,
) -> Result<Value, String> {
    let mut command = cli_command(locate_cli()?, &["summary", "--json", "--no-color"]);
    let value = wants_value(scope, quotas);
    if value {
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
    if value {
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
    let mut command = cli_command(locate_cli()?, &["harness", "codex", "--json", "--no-color"]);
    let (_, _snapshot) = apply_source(&mut command, distro, false)?;
    run_json(command, distro, "limits").map(|report| limit_usage_of(&report))
}

/// Live subscription limits for one harness, read without scanning any usage logs.
pub fn run_quota(harness: &str, distro: Option<&str>, force: bool) -> Result<Value, String> {
    if !matches!(harness, "claude" | "codex") {
        return Err(format!("unsupported harness '{harness}'"));
    }
    let mut command = cli_command(
        locate_cli()?,
        &["harness", harness, "--json", "--no-color", "--no-offline"],
    );
    command.env("AGENT_BURN_QUOTA_ONLY", "1");
    if force {
        command.env("AGENT_BURN_FORCE_REFRESH", "1");
    }
    let (_, _snapshot) = apply_source(&mut command, distro, false)?;
    run_json(command, distro, harness)
}

fn temp_directory() -> io::Result<PathBuf> {
    let dir = env::temp_dir().join("agent-burn-windows");
    match fs::create_dir(&dir) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists && dir.is_dir() => {}
        Err(error) => return Err(error),
    }
    Ok(dir)
}

fn run_json(mut command: Command, distro: Option<&str>, label: &str) -> Result<Value, String> {
    hide_window(&mut command);
    // Unique per run: two overlapping runs of the same source must not share a file.
    let output_path = temp_directory().map_err(|error| error.to_string())?.join(format!(
        "abf-{}-{}-{}-{}.json",
        std::process::id(),
        label,
        distro.unwrap_or("windows"),
        NEXT_RUN.fetch_add(1, Ordering::SeqCst)
    ));
    let output_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .map_err(|error| error.to_string())?;
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
    let Ok(temp) = temp_directory() else {
        return (source.to_string(), Snapshot(None));
    };
    let target = temp.join(format!(
        "abf-opencode-{}-{}-{}",
        std::process::id(),
        NEXT_RUN.fetch_add(1, Ordering::SeqCst),
        distro.replace(['/', '\\'], "_")
    ));
    if fs::create_dir(&target).is_err() {
        return (source.to_string(), Snapshot(None));
    }
    // From here the guard removes whatever was copied, including after a failed copy.
    let guard = Snapshot(Some(target.clone()));
    for name in ["opencode.db", "opencode.db-wal", "opencode.db-shm"] {
        let from = source_dir.join(name);
        if from.is_file() && copy_new(&from, &target.join(name)).is_err() {
            return (source.to_string(), guard);
        }
    }
    (target.to_string_lossy().into_owned(), guard)
}

fn copy_new(source: &Path, target: &Path) -> io::Result<u64> {
    let mut source = fs::File::open(source)?;
    let mut target = fs::OpenOptions::new().write(true).create_new(true).open(target)?;
    io::copy(&mut source, &mut target)
}

/// Removes old scan files in the app's own folder. Once per launch, also removes legacy
/// files at the temp root, but only when their complete name matches a generated scan name.
pub fn clean_stale_temp() {
    let root = env::temp_dir();
    let min_age = Duration::from_secs(3600);
    clean_stale_in(&root.join("agent-burn-windows"), min_age);
    static LEGACY_CLEANUP: std::sync::Once = std::sync::Once::new();
    LEGACY_CLEANUP.call_once(|| clean_stale_in(&root, min_age));
}

fn is_temp_name(name: &str, directory: bool) -> bool {
    let numeric = |value: &str| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit());
    if directory {
        let Some(rest) = name.strip_prefix("abf-opencode-") else {
            return false;
        };
        let mut parts = rest.splitn(3, '-');
        return numeric(parts.next().unwrap_or(""))
            && numeric(parts.next().unwrap_or(""))
            && parts.next().is_some_and(|distro| !distro.is_empty());
    }
    let Some(rest) = name.strip_prefix("abf-").and_then(|rest| rest.strip_suffix(".json")) else {
        return false;
    };
    let Some((pid, rest)) = rest.split_once('-') else {
        return false;
    };
    let Some((label, rest)) = rest.split_once('-') else {
        return false;
    };
    let Some((distro, run)) = rest.rsplit_once('-') else {
        return false;
    };
    numeric(pid)
        && matches!(label, "summary" | "limits" | "claude" | "codex")
        && !distro.is_empty()
        && numeric(run)
}

fn clean_stale_in(dir: &Path, min_age: Duration) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if !kind.is_file() && !kind.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let ours = is_temp_name(&name, kind.is_dir());
        let old = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age >= min_age);
        if ours && old {
            let path = entry.path();
            let _ = if kind.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
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
    // The run ends with the app: a scan left running would keep agent-burn.exe locked and stop
    // an update from replacing it. Outside the job it still runs, as before.
    #[cfg(windows)]
    if let Some(job) = crate::job::app_job() {
        job.adopt(&child);
    }
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
        // The page recognises this start (`CLI_FAILED` in api.ts).
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
        let root = env::temp_dir().join(format!("abf-clean-test-{}", std::process::id()));
        let dir = root.join("agent-burn-windows");
        fs::create_dir_all(&dir).unwrap();
        let old_scan = dir.join("abf-1-summary-windows-0.json");
        let new_scan = dir.join("abf-2-summary-windows-0.json");
        let old_copy = dir.join("abf-opencode-1-0-Ubuntu-24.04");
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
        aged_directory(&old_copy, 3);

        clean_stale_in(&dir, Duration::from_secs(3600));

        assert!(!old_scan.exists(), "an old scan file goes");
        assert!(!old_copy.exists(), "an old OpenCode copy goes");
        assert!(new_scan.exists(), "a recent file may belong to a running scan");
        assert!(other.exists() && similar.exists(), "files of other programs stay");
        let _ = fs::remove_dir_all(root);
    }

    fn aged_directory(path: &Path, hours: u64) {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
        fs::OpenOptions::new()
            .write(true)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)
            .unwrap()
            .set_modified(std::time::SystemTime::now() - Duration::from_secs(hours * 3600))
            .unwrap();
    }

    #[test]
    fn legacy_cleanup_keeps_similar_names_at_the_temp_root() {
        let root = env::temp_dir().join(format!("abf-legacy-clean-test-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let notes = root.join("abf-notes.json");
        let backup = root.join("abf-opencode-backup");
        let old_scan = root.join("abf-123-summary-Ubuntu-24.04-7.json");
        let old_copy = root.join("abf-opencode-123-8-Ubuntu-24.04");
        fs::write(&notes, b"keep").unwrap();
        fs::write(&old_scan, b"{}").unwrap();
        fs::create_dir(&backup).unwrap();
        fs::write(backup.join("notes.txt"), b"keep").unwrap();
        fs::create_dir(&old_copy).unwrap();
        fs::write(old_copy.join("opencode.db"), b"x").unwrap();
        aged(&notes, 3);
        aged(&old_scan, 3);
        aged_directory(&backup, 3);
        aged_directory(&old_copy, 3);

        clean_stale_in(&root, Duration::from_secs(3600));

        assert!(notes.exists(), "a similar JSON filename is not ours");
        assert!(backup.join("notes.txt").exists(), "a similar directory is not ours");
        assert!(!old_scan.exists());
        assert!(!old_copy.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_temp_names_require_numeric_ids_and_known_labels() {
        assert!(is_temp_name("abf-123-summary-Ubuntu-24.04-7.json", false));
        assert!(is_temp_name("abf-123-limits-windows-0.json", false));
        assert!(is_temp_name("abf-123-claude-windows-0.json", false));
        assert!(is_temp_name("abf-123-codex-windows-0.json", false));
        assert!(is_temp_name("abf-opencode-123-7-Ubuntu-24.04", true));
        assert!(!is_temp_name("abf-notes.json", false));
        assert!(!is_temp_name("abf-x-summary-windows-0.json", false));
        assert!(!is_temp_name("abf-123-notes-windows-0.json", false));
        assert!(!is_temp_name("abf-123-summary-windows-x.json", false));
        assert!(!is_temp_name("abf-123-summary--0.json", false));
        assert!(!is_temp_name("abf-opencode-backup", true));
        assert!(!is_temp_name("abf-opencode-Ubuntu", true));
        assert!(!is_temp_name("abf-opencode-x-7-Ubuntu", true));
        assert!(!is_temp_name("abf-opencode-123-x-Ubuntu", true));
        assert!(!is_temp_name("abf-opencode-123-7-", true));
        assert!(!is_temp_name("abf-123-summary-windows-0.json", true));
        assert!(!is_temp_name("abf-opencode-123-7-Ubuntu", false));
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
        assert_eq!(copied.parent(), Some(env::temp_dir().join("agent-burn-windows").as_path()));
        assert!(copied.join("opencode.db").is_file());
        assert_eq!(Path::new(&dir), copied);
        drop(copy);
        assert!(!copied.exists());
        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn copying_a_database_never_overwrites_an_existing_file() {
        let dir = env::temp_dir().join(format!("abf-copy-new-test-{}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        let source = dir.join("source.db");
        let target = dir.join("opencode.db");
        fs::write(&source, b"new conversations").unwrap();
        fs::write(&target, b"existing file").unwrap();

        assert_eq!(copy_new(&source, &target).unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&target).unwrap(), b"existing file");
        fs::remove_dir_all(dir).unwrap();
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

    #[test]
    fn asks_for_the_subscription_only_on_a_full_scan_with_quotas() {
        let scope = |since: Option<&str>| Scope {
            since: since.map(str::to_string),
            until: None,
            agents: vec!["codex".to_string()],
        };
        assert!(wants_value(&scope(None), true));
        assert!(!wants_value(&scope(None), false), "quotas off: no online reading");
        assert!(!wants_value(&scope(Some("20261101")), true), "a period scan needs usage only");
    }

    #[test]
    fn every_run_leaves_out_the_user_configuration() {
        let command = cli_command(PathBuf::from("agent-burn.exe"), &["summary", "--json"]);
        let args: Vec<_> = command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["summary", "--json", "--config", "NUL"]);
    }

    #[test]
    fn claude_token_renewal_is_off_unless_the_setting_allows_it() {
        let no_renew = || {
            cli_command(PathBuf::from("agent-burn.exe"), &["summary", "--json"])
                .get_envs()
                .any(|(name, value)| name == "AGENT_BURN_NO_RENEW" && value == Some(std::ffi::OsStr::new("1")))
        };
        assert!(no_renew(), "off by default");
        set_claude_renew(true);
        let allowed = !no_renew();
        set_claude_renew(false);
        assert!(allowed, "the setting lets the CLI renew");
        assert!(no_renew());
    }
}
