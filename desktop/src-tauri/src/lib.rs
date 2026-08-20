mod bambu;
mod ftp;
mod logs;

use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

use bambu::{BambuDirectManager, subscribe_printer, send_printer_command, start_print_direct};
use logs::{fetch_direct_logs, fetch_direct_printers, frontend_log};

const PROD_URL: &str = "https://printfarmcompanion.pages.dev";
const DEV_URL: &str = "http://localhost:5173";

/// Flatten a derived module file name to a single path segment. Some modules
/// (older rows not yet normalised to a basename) have a filename containing a
/// path; `<id>_<filename>` would then be a nested path whose parent doesn't
/// exist, breaking save/open/check/upload. Replacing separators keeps it flat —
/// applied identically everywhere so save and read always agree.
pub(crate) fn flatten_local_name(name: &str) -> String {
    name.replace(['/', '\\'], "_")
}

/// Save a .3mf file into the app-data modules directory.
/// Returns the full absolute path to the written file.
#[tauri::command]
fn save_module_file(app: tauri::AppHandle, file_name: String, data: Vec<u8>) -> Result<String, String> {
    let modules_dir = app.path().app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules");
    std::fs::create_dir_all(&modules_dir)
        .map_err(|e| format!("failed to create modules dir: {e}"))?;
    let dest = modules_dir.join(flatten_local_name(&file_name));
    std::fs::write(&dest, &data)
        .map_err(|e| format!("failed to write file: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Return the absolute path to the modules directory.
#[tauri::command]
fn get_modules_dir(app: tauri::AppHandle) -> Result<String, String> {
    let modules_dir = app.path().app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules");
    Ok(modules_dir.to_string_lossy().into_owned())
}

/// Open a module's local copy in the OS default app (the user's slicer).
/// The copy lives at <appdata>/modules/<id>_<file_name>.
#[tauri::command]
fn open_module_file(app: tauri::AppHandle, id: i64, file_name: String) -> Result<(), String> {
    let path = app.path().app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules")
        .join(flatten_local_name(&format!("{id}_{file_name}")));
    if !path.exists() {
        return Err(format!("module file not found: {}", path.display()));
    }
    app.shell()
        .open(path.to_string_lossy(), None)
        .map_err(|e| format!("failed to open file: {e}"))
}

/// Given derived module file names (<id>_<file_name>), return the subset that is
/// MISSING on disk. Used by the dashboard to surface a re-attach prompt.
#[tauri::command]
fn check_module_files(app: tauri::AppHandle, names: Vec<String>) -> Result<Vec<String>, String> {
    let modules_dir = app.path().app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules");
    Ok(names
        .into_iter()
        .filter(|n| !modules_dir.join(flatten_local_name(n)).exists())
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(BambuDirectManager::new()))
        .invoke_handler(tauri::generate_handler![
            subscribe_printer,
            send_printer_command,
            start_print_direct,
            save_module_file,
            get_modules_dir,
            open_module_file,
            check_module_files,
            ftp::upload_file_direct,
            fetch_direct_logs,
            fetch_direct_printers,
            frontend_log,
        ])
        .setup(move |app| {
            // Ensure the app-data modules directory exists.
            let app_data = app.path().app_data_dir().expect("no app data dir");
            let modules_dir = app_data.join("modules");
            std::fs::create_dir_all(&modules_dir).ok();

            // Inject the desktop marker so the SvelteKit app detects the shell and
            // unlocks desktop features (direct MQTT + local file open via Rust).
            let init_script = concat!(
                "window.__IS_DESKTOP__ = true;",
                r#"window.__PFC_DESKTOP_VERSION__ = "0.1.0";"#,
            )
            .to_string();

            let target = if cfg!(debug_assertions) { DEV_URL } else { PROD_URL };
            let url = target.parse().expect("invalid webview URL");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Print Farm Companion")
                .inner_size(1400.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .initialization_script(&init_script)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Print Farm Companion desktop app");
}
