use std::{
    fs::{self, File},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub const RUNTIME_HOST: &str = "127.0.0.1";
pub const DEFAULT_RUNTIME_PORT: u16 = 4100;

#[cfg(target_os = "windows")]
const BUNDLED_NODE: &str = "node.exe";

#[cfg(not(target_os = "windows"))]
const BUNDLED_NODE: &str = "node";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    pub base_url: String,
    pub port: u16,
    pub logs_dir: String,
    pub data_dir: String,
    pub status: String,
    pub owns_process: bool,
}

pub struct ManagedRuntime {
    pub config: RuntimeConfig,
    child: Mutex<Option<Child>>,
}

impl ManagedRuntime {
    pub fn shutdown(&self) {
        if let Ok(mut child_guard) = self.child.lock() {
            if let Some(mut child) = child_guard.take() {
                graceful_shutdown_child(&mut child);
            }
        }
    }
}

fn runtime_port() -> u16 {
    std::env::var("ALL_IN_ONE_MCP_RUNTIME_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_RUNTIME_PORT)
}

pub fn runtime_base_url(port: u16) -> String {
    format!("http://{RUNTIME_HOST}:{port}")
}

fn should_skip_embed() -> bool {
    matches!(
        std::env::var("ALL_IN_ONE_MCP_SKIP_EMBED").as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
}

fn http_readyz_ok(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let request = format!(
        "GET /readyz HTTP/1.1\r\nHost: {RUNTIME_HOST}:{port}\r\nConnection: close\r\n\r\n"
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut buffer = [0_u8; 768];
    let read = match stream.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return false,
    };

    if read == 0 {
        return false;
    }

    let response = String::from_utf8_lossy(&buffer[..read]);
    response.contains("200") && response.contains("\"status\":\"ok\"")
}

fn tcp_listening(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

pub fn runtime_is_ready(port: u16) -> bool {
    if !tcp_listening(port) {
        return false;
    }

    http_readyz_ok(port)
}

fn graceful_shutdown_child(child: &mut Child) {
    let _ = child.kill();
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }
    let _ = child.wait();
}

fn wait_for_runtime(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);

    while Instant::now() < deadline {
        if runtime_is_ready(port) {
            return Ok(());
        }

        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Err(format!(
                "Embedded runtime exited before becoming ready: {status}"
            ));
        }

        sleep(Duration::from_millis(100));
    }

    Err("Embedded runtime did not pass /readyz in time.".into())
}

fn workspace_runtime_cli() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let cli = manifest_dir
        .join("..")
        .join("..")
        .join("..")
        .join("packages")
        .join("runtime")
        .join("dist")
        .join("cli.js");

    if cli.is_file() {
        return Some(cli);
    }

    None
}

fn resolve_node_executable(
    _app: &AppHandle,
    runtime_root: Option<&Path>,
) -> Result<PathBuf, String> {
    if let Some(root) = runtime_root {
        let bundled = root.join(BUNDLED_NODE);
        if bundled.is_file() {
            return Ok(bundled);
        }
    }

    if let Ok(node_from_path) = which_node_from_path() {
        return Ok(node_from_path);
    }

    Err("Node.js executable was not found for the embedded runtime.".into())
}

fn which_node_from_path() -> Result<PathBuf, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let path_var = std::env::var_os("PATH").ok_or_else(|| "PATH is not set.".to_string())?;

    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(node_name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("node was not found on PATH.".into())
}

fn spawn_embedded_runtime(
    app: &AppHandle,
    runtime_root: Option<&Path>,
    cli_entrypoint: PathBuf,
    port: u16,
) -> Result<ManagedRuntime, String> {
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let runtime_logs_dir = app_data_dir.join("logs");
    fs::create_dir_all(&runtime_logs_dir).map_err(|error| error.to_string())?;

    let stdout_log = File::create(runtime_logs_dir.join("runtime.stdout.log"))
        .map_err(|error| error.to_string())?;
    let stderr_log = File::create(runtime_logs_dir.join("runtime.stderr.log"))
        .map_err(|error| error.to_string())?;

    let node_path = resolve_node_executable(app, runtime_root)?;
    let database_path = app_data_dir.join("all-in-one-mcp.sqlite");

    let mut command = Command::new(&node_path);
    command
        .arg(&cli_entrypoint)
        .arg("serve")
        .arg("--host")
        .arg(RUNTIME_HOST)
        .arg("--port")
        .arg(port.to_string())
        .arg("--database")
        .arg(&database_path)
        .env("ALL_IN_ONE_MCP_HOME", &app_data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log));

    if let Some(root) = runtime_root {
        command.current_dir(root);
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    wait_for_runtime(&mut child, port)?;

    Ok(ManagedRuntime {
        config: RuntimeConfig {
            base_url: runtime_base_url(port),
            port,
            logs_dir: runtime_logs_dir.to_string_lossy().into_owned(),
            data_dir: app_data_dir.to_string_lossy().into_owned(),
            status: "ready".into(),
            owns_process: true,
        },
        child: Mutex::new(Some(child)),
    })
}

fn bundled_runtime_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let resources_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let runtime_root = resources_dir.join("runtime-host");
    let entrypoint = runtime_root
        .join("node_modules")
        .join("all-in-one-mcp")
        .join("bin")
        .join("all-in-one-mcp.mjs");

    if !entrypoint.is_file() {
        return Err("Bundled runtime entrypoint was not found in app resources.".into());
    }

    Ok((runtime_root, entrypoint))
}

pub fn start_embedded_runtime(app: &AppHandle) -> Result<ManagedRuntime, String> {
    let port = runtime_port();

    if should_skip_embed() {
        return Ok(external_runtime_config(app, port));
    }

    if runtime_is_ready(port) {
        return Ok(external_runtime_config(app, port));
    }

    if let Ok((runtime_root, entrypoint)) = bundled_runtime_paths(app) {
        return spawn_embedded_runtime(
            app,
            Some(runtime_root.as_path()),
            entrypoint,
            port,
        );
    }

    if let Some(cli) = workspace_runtime_cli() {
        return spawn_embedded_runtime(app, None, cli, port);
    }

    Err(
        "No embedded runtime bundle or workspace build was found. Run `pnpm mcp:serve` or build the app with `pnpm prepare-runtime`."
            .into(),
    )
}

fn external_runtime_config(app: &AppHandle, port: u16) -> ManagedRuntime {
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .ok()
        .unwrap_or_else(|| PathBuf::from("."));
    let runtime_logs_dir = app_data_dir.join("logs");

    ManagedRuntime {
        config: RuntimeConfig {
            base_url: runtime_base_url(port),
            port,
            logs_dir: runtime_logs_dir.to_string_lossy().into_owned(),
            data_dir: app_data_dir.to_string_lossy().into_owned(),
            status: if runtime_is_ready(port) {
                "ready".into()
            } else {
                "external".into()
            },
            owns_process: false,
        },
        child: Mutex::new(None),
    }
}

pub fn inject_runtime_config(window: &tauri::WebviewWindow, config: &RuntimeConfig) {
    let script = format!(
        "window.__ALL_IN_ONE_MCP_RUNTIME_BASE_URL__ = {:?};",
        config.base_url
    );
    let _ = window.eval(&script);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_base_url_uses_configured_port() {
        assert_eq!(
            runtime_base_url(4100),
            "http://127.0.0.1:4100".to_string()
        );
    }

    #[test]
    fn runtime_is_ready_is_false_when_port_is_closed() {
        assert!(!runtime_is_ready(59_999));
    }
}
