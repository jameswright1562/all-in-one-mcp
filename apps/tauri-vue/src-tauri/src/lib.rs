#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!(
            "{{\"level\":\"error\",\"component\":\"tauri.panic\",\"message\":{:?}}}",
            panic_info.to_string()
        );
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
