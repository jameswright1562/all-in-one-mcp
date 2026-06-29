use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, State};

#[derive(Debug)]
struct RuntimeState {
    url: String,
    child: Mutex<Option<Child>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
    base_url: String,
}

#[tauri::command]
fn runtime_config(state: State<'_, RuntimeState>) -> RuntimeConfig {
    RuntimeConfig {
        base_url: state.url.clone(),
    }
}

fn spawn_packaged_runtime(app: &tauri::App) -> Option<Child> {
    let resource_dir = app.path().resource_dir().ok()?;
    let runtime_host = resource_dir.join("runtime-host");
    let node_exe = runtime_host.join(if cfg!(windows) { "node.exe" } else { "node" });
    let cli_entry = runtime_host
        .join("node_modules")
        .join("all-in-one-mcp")
        .join("dist")
        .join("cli.js");

    if !node_exe.exists() || !cli_entry.exists() {
        eprintln!(
            "{{\"level\":\"warn\",\"component\":\"tauri.runtime\",\"message\":\"packaged runtime host not found; falling back to existing localhost runtime\"}}"
        );
        return None;
    }

    Command::new(node_exe)
        .arg(cli_entry)
        .arg("serve")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("4100")
        .current_dir(runtime_host)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!(
            "{{\"level\":\"error\",\"component\":\"tauri.panic\",\"message\":{:?}}}",
            panic_info.to_string()
        );
    }));

    let runtime_url = "http://127.0.0.1:4100".to_string();

    tauri::Builder::default()
        .manage(RuntimeState {
            url: runtime_url,
            child: Mutex::new(None),
        })
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .invoke_handler(tauri::generate_handler![runtime_config])
        .setup(move |app| {
            let child = spawn_packaged_runtime(app);
            if let Some(state) = app.try_state::<RuntimeState>() {
                if let Ok(mut guard) = state.child.lock() {
                    *guard = child;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<RuntimeState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
