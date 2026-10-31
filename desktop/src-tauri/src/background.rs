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

/// Notification-area icon: click to open, menu to refresh quotas or quit.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Agent Burn Windows", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Actualiser les quotas", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &refresh, &separator, &quit])?;

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

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
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
