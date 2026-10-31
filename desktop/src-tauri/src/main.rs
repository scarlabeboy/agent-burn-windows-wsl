#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive;
mod backfill;
mod cli;
mod sources;

use serde_json::Value;

#[tauri::command]
async fn detect_sources() -> sources::Detected {
    tauri::async_runtime::spawn_blocking(sources::detect)
        .await
        .unwrap_or_default()
}

/// Run the Agent Burn CLI for one source and return its JSON report.
/// `distro` is `None` for native Windows, or a WSL distribution name.
#[tauri::command]
async fn load_usage(
    distro: Option<String>,
    offline: bool,
    claude_plan: String,
    since: Option<String>,
    until: Option<String>,
    agents: Option<Vec<String>>,
) -> Result<Value, String> {
    let scope = cli::Scope {
        since,
        until,
        agents: agents.unwrap_or_default(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        cli::run_summary(distro.as_deref(), offline, &claude_plan, &scope)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Live subscription limits (5-hour session and weekly) for one harness and source.
#[tauri::command]
async fn load_quota(harness: String, distro: Option<String>, force: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || cli::run_quota(&harness, distro.as_deref(), force))
        .await
        .map_err(|error| error.to_string())?
}

/// Previously saved app data (quota history, report cache), or null when there is none.
#[tauri::command]
fn archive_read(name: String) -> Result<Option<Value>, String> {
    archive::read(&name)
}

#[tauri::command]
fn archive_write(name: String, value: Value) -> Result<(), String> {
    archive::write(&name, &value)
}

/// Codex limit history rebuilt from session logs modified since `since_ms`.
#[tauri::command]
async fn backfill_codex(
    distro: Option<String>,
    since_ms: i64,
) -> Result<Vec<backfill::BackfillSeries>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        backfill::codex_rate_limits(distro.as_deref(), since_ms)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_sources,
            load_usage,
            load_quota,
            archive_read,
            archive_write,
            backfill_codex
        ])
        .run(tauri::generate_context!())
        .expect("error while running Agent Burn");
}
