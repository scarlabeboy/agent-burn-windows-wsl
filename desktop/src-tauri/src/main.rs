#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
async fn load_usage(distro: Option<String>, offline: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || cli::run_summary(distro.as_deref(), offline))
        .await
        .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![detect_sources, load_usage])
        .run(tauri::generate_context!())
        .expect("error while running Agent Burn");
}
