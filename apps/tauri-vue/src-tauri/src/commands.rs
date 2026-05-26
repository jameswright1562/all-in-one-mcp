use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::runtime_host::{self, ManagedRuntime, RuntimeConfig};

#[tauri::command]
pub fn get_runtime_config(runtime: State<'_, ManagedRuntime>) -> RuntimeConfig {
    runtime.config.clone()
}

#[tauri::command]
pub fn wait_for_runtime_ready(
    app: AppHandle,
    runtime: State<'_, ManagedRuntime>,
    timeout_ms: Option<u64>,
) -> Result<RuntimeConfig, String> {
    let port = runtime.config.port;
    let deadline =
        Instant::now() + Duration::from_millis(timeout_ms.unwrap_or(30_000).min(120_000));

    while Instant::now() < deadline {
        if runtime_host::runtime_is_ready(port) {
            let mut config = runtime.config.clone();
            config.status = "ready".into();
            if let Some(window) = app.get_webview_window("main") {
                runtime_host::inject_runtime_config(&window, &config);
            }
            return Ok(config);
        }

        std::thread::sleep(Duration::from_millis(150));
    }

    Err("Runtime did not become ready in time. Check runtime logs in the app data folder.".into())
}

#[tauri::command]
pub fn open_logs_folder(
    app: AppHandle,
    runtime: State<'_, ManagedRuntime>,
) -> Result<(), String> {
    let logs_dir = std::path::PathBuf::from(&runtime.config.logs_dir);
    std::fs::create_dir_all(&logs_dir).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(
            logs_dir.to_string_lossy().into_owned(),
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_data_folder(
    app: AppHandle,
    runtime: State<'_, ManagedRuntime>,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&runtime.config.data_dir);
    std::fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(
            data_dir.to_string_lossy().into_owned(),
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pick_file(app: AppHandle, title: Option<String>) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title(title.unwrap_or_else(|| "Select file".into()))
        .blocking_pick_file();

    Ok(path.map(|selected| selected.to_string()))
}

#[tauri::command]
pub fn pick_directory(
    app: AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title(title.unwrap_or_else(|| "Select folder".into()))
        .blocking_pick_folder();

    Ok(path.map(|selected| selected.to_string()))
}
