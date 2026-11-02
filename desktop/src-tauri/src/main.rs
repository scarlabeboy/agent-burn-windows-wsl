#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive;
mod backfill;
mod background;
mod cli;
#[cfg(windows)]
mod job;
mod keepalive;
mod sources;

use serde_json::Value;

#[tauri::command]
async fn detect_sources() -> sources::Detected {
    tauri::async_runtime::spawn_blocking(sources::detect)
        .await
        .unwrap_or_default()
}

/// "Keep WSL awake" on or off (see `keepalive`). Called again every few seconds while it is on,
/// so a distribution that was shut down gets its keeping process back.
#[tauri::command]
async fn set_wsl_keepalive(enabled: bool) {
    keepalive::want(enabled);
    let _ = tauri::async_runtime::spawn_blocking(keepalive::ensure).await;
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

/// Weekly Codex limit used per day, by surface and model, for one source (a list, maybe empty).
#[tauri::command]
async fn load_limit_usage(distro: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || cli::run_limit_usage(distro.as_deref()))
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

/// Native message box, used when the web view cannot start and nothing else can be shown.
#[cfg(windows)]
fn show_error(message: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut (), text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    const MB_OK_ICONERROR: u32 = 0x10;
    let wide = |text: &str| -> Vec<u16> { text.encode_utf16().chain(Some(0)).collect() };
    let (text, caption) = (wide(message), wide("Agent Burn Windows"));
    // SAFETY: both buffers are NUL-terminated and outlive the call.
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), MB_OK_ICONERROR);
    }
}

#[cfg(not(windows))]
fn show_error(message: &str) {
    eprintln!("{message}");
}

const WEBVIEW2_HELP: &str = "Agent Burn Windows ne peut pas démarrer : le composant Microsoft Edge \
WebView2 est absent ou endommagé.\n\nRéparez-le dans Paramètres > Applications > Microsoft Edge \
WebView2 Runtime > Modifier, ou installez-le depuis :\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\n\
Si un antivirus a mis des fichiers en quarantaine, ajoutez une exclusion pour ce dossier avant de réparer.";

fn main() {
    if tauri::webview_version().is_err() {
        show_error(WEBVIEW2_HELP);
        std::process::exit(1);
    }
    tauri::Builder::default()
        // A second launch (for example the startup entry while the app is open) only
        // brings the existing window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            background::show_main(app);
        }))
        // The entry name is fixed so the uninstaller can remove it (see windows/hooks.nsh).
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Agent Burn Windows")
                .args([background::BACKGROUND_FLAG])
                .build(),
        )
        // Updates come signed from the GitHub releases; the page checks and installs them.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Opens the release notes and the repository in the browser (github.com only).
        .plugin(tauri_plugin_opener::init())
        .manage(background::CloseToTray::default())
        .on_window_event(|window, event| background::on_window_event(window, event))
        .setup(|app| {
            // Leftovers of a run that was stopped mid-scan; off the startup path.
            std::thread::spawn(cli::clean_stale_temp);
            background::build_tray(app.handle())?;
            // The window starts hidden; a startup launch keeps it in the notification area.
            if !background::started_in_background() {
                background::show_main(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_sources,
            load_usage,
            load_quota,
            load_limit_usage,
            archive_read,
            archive_write,
            backfill_codex,
            set_wsl_keepalive,
            background::set_close_to_tray,
            background::get_autostart,
            background::set_autostart,
            background::set_tray_tooltip,
            background::set_tray_labels
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            // The page and its language setting are not there yet: both languages.
            show_error(&format!(
                "Agent Burn Windows ne peut pas démarrer.\nAgent Burn Windows cannot start.\n\n{error}"
            ));
            std::process::exit(1);
        });
}
