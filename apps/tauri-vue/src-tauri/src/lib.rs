use tauri_plugin_opener::OpenerExt;

mod commands;
mod runtime_host;

use runtime_host::ManagedRuntime;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!(
            "{{\"level\":\"error\",\"component\":\"tauri.panic\",\"message\":{:?}}}",
            panic_info.to_string()
        );
    }));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_runtime_config,
            commands::wait_for_runtime_ready,
            commands::open_logs_folder,
            commands::open_data_folder,
            commands::pick_file,
            commands::pick_directory,
        ])
        .setup(|app| {
            let runtime = runtime_host::start_embedded_runtime(app.handle())?;
            let config = runtime.config.clone();
            app.manage(runtime);

            if let Some(window) = app.get_webview_window("main") {
                runtime_host::inject_runtime_config(&window, &config);
            }

            let show_item = MenuItem::with_id(app, "tray-show", "Show dashboard", true, None::<&str>)?;
            let logs_item =
                MenuItem::with_id(app, "tray-logs", "Open runtime logs", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &logs_item, &quit_item])?;

            let app_handle = app.handle().clone();
            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("All-in-One MCP")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "tray-show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "tray-logs" => {
                        if let Some(runtime) = app.try_state::<ManagedRuntime>() {
                            let logs_dir = std::path::PathBuf::from(&runtime.config.logs_dir);
                            let _ = std::fs::create_dir_all(&logs_dir);
                            let _ = app.opener().open_path(
                                logs_dir.to_string_lossy().into_owned(),
                                None::<&str>,
                            );
                        }
                    }
                    "tray-quit" => {
                        app.exit(0);
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
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let _ = _tray;
            let _ = app_handle;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(runtime) = app_handle.try_state::<ManagedRuntime>() {
                    runtime.shutdown();
                }
            }
        });
}
