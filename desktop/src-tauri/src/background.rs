use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

const TRAY_ID: &str = "main";
/// Passed by the Windows startup entry so the app opens in the notification area only.
pub const BACKGROUND_FLAG: &str = "--background";
/// How long the page gets to save its data before a tray "Quit" ends the process.
const QUIT_GRACE: Duration = Duration::from_millis(1500);
/// Windows truncates longer tooltips.
const MAX_TOOLTIP_CHARS: usize = 120;

/// Whether closing the window keeps the app running in the notification area.
#[derive(Default)]
pub struct CloseToTray(AtomicBool);

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The tray menu in the page's language; it starts in French until the page sends its words.
fn tray_menu(app: &AppHandle, open: &str, refresh: &str, quit: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", refresh, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&open, &refresh, &separator, &quit])
}

/// Notification-area icon: click to open, menu to refresh quotas or quit.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app, "Open Agent Burn Windows", "Refresh quotas", "Quit")?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Agent Burn Windows")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "refresh" => {
                let _ = app.emit("tray-refresh", ());
            }
            "quit" => {
                // The page saves its archive, then the process ends.
                let _ = app.emit("quit-requested", ());
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(QUIT_GRACE);
                    handle.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Hide instead of closing when the user asked the app to stay in the notification area.
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let keep_running = window
            .app_handle()
            .state::<CloseToTray>()
            .0
            .load(Ordering::SeqCst);
        if keep_running {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

pub fn started_in_background() -> bool {
    std::env::args().any(|argument| argument == BACKGROUND_FLAG)
}

#[tauri::command]
pub fn set_close_to_tray(state: tauri::State<CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::SeqCst);
}

/// Asks Windows to start the app again, in the notification area, after a crash or a hang, or
/// when an installer or Windows Update closed it. A "Quit" from the menu is never undone, and
/// Windows only does it for a run that lasted at least a minute.
#[tauri::command]
pub fn set_restart_on_crash(enabled: bool) {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn RegisterApplicationRestart(command_line: *const u16, flags: u32) -> i32;
            fn UnregisterApplicationRestart() -> i32;
        }
        let command_line: Vec<u16> = BACKGROUND_FLAG.encode_utf16().chain(Some(0)).collect();
        // SAFETY: the command line is NUL-terminated and Windows copies it during the call.
        unsafe {
            if enabled {
                RegisterApplicationRestart(command_line.as_ptr(), 0);
            } else {
                UnregisterApplicationRestart();
            }
        }
    }
    #[cfg(not(windows))]
    let _ = enabled;
}

// Async so the registry access never runs on the thread that draws the window: a slow
// write (an antivirus checking the startup entry) would otherwise freeze the interface.
#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| error.to_string())
}

/// Quota summary shown when hovering the notification-area icon.
#[tauri::command]
pub fn set_tray_tooltip(app: AppHandle, text: String) {
    let text: String = text.chars().take(MAX_TOOLTIP_CHARS).collect();
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// The words of the tray menu, sent by the page in its language.
#[tauri::command]
pub fn set_tray_labels(app: AppHandle, open: String, refresh: String, quit: String) -> Result<(), String> {
    let menu = tray_menu(&app, &open, &refresh, &quit).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|error| error.to_string())?;
    }
    Ok(())
}
