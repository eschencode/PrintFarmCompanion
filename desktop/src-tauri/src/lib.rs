mod bambu;

use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

use bambu::{BambuDirectManager, subscribe_printer, send_printer_command, start_print_direct};

const PROD_URL: &str = "https://printfarmcompanion.pages.dev";
const DEV_URL: &str = "http://localhost:5173";

/// Save a .3mf file into the app-data modules directory.
/// Returns the full absolute path to the written file.
#[tauri::command]
fn save_module_file(app: tauri::AppHandle, file_name: String, data: Vec<u8>) -> Result<String, String> {
    let modules_dir = app.path().app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules");
    std::fs::create_dir_all(&modules_dir)
        .map_err(|e| format!("failed to create modules dir: {e}"))?;
    let dest = modules_dir.join(&file_name);
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

/// Holds the sidecar child process so it stays alive for the duration of the app.
struct SidecarHandle(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Generate a random auth token by reading from /dev/urandom.
fn generate_token() -> String {
    use std::io::Read;
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .expect("failed to read /dev/urandom");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = generate_token();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(std::sync::Mutex::new(None)))
        .manage(Arc::new(BambuDirectManager::new()))
        .invoke_handler(tauri::generate_handler![
            subscribe_printer,
            send_printer_command,
            start_print_direct,
            save_module_file,
            get_modules_dir,
        ])
        .setup(move |app| {
            // Ensure the app-data modules directory exists.
            let app_data = app.path().app_data_dir().expect("no app data dir");
            let modules_dir = app_data.join("modules");
            std::fs::create_dir_all(&modules_dir).ok();

            // Directories the file handler sidecar is allowed to serve files from.
            let home = std::env::var("HOME").unwrap_or_default();
            let allowed_dirs = format!(
                "{}:{}:{}/Documents:{}/Downloads",
                modules_dir.display(), app_data.display(), home, home
            );

            // Spawn the file handler sidecar.  Failure is non-fatal — the user
            // can still use a manually started file handler, and the UI will
            // reflect the disconnected state via the existing health-check polling.
            match app
                .shell()
                .sidecar("pfc-file-handler")
                .and_then(|cmd| {
                    cmd.env("AUTH_TOKEN", &token)
                        .env("ALLOWED_DIRS", &allowed_dirs)
                        .spawn()
                }) {
                Ok((_, child)) => {
                    *app.state::<SidecarHandle>().0.lock().unwrap() = Some(child);
                    println!("✅ File handler sidecar started");
                }
                Err(e) => {
                    eprintln!("⚠️  Could not start file handler sidecar: {e}");
                    eprintln!("   Run `npm run build:sidecar` once to build it.");
                }
            }

            // Inject desktop marker + auth token into the webview so the
            // SvelteKit app can detect the shell and authenticate automatically.
            let init_script = format!(
                concat!(
                    "window.__IS_DESKTOP__ = true;",
                    r#"window.__PFC_DESKTOP_VERSION__ = "0.1.0";"#,
                    r#"window.__FILE_HANDLER_TOKEN__ = "{}";"#,
                ),
                token
            );

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
