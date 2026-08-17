//! Direct FTPS upload to Bambu Lab printers (implicit TLS, port 990).
//!
//! Ported from the removed `pi/bambu_client.py`. Bambu-specific quirks:
//!  - implicit TLS on :990 (TLS wraps the socket on connect, not AUTH TLS)
//!  - self-signed cert → accept invalid certs/hostnames
//!  - TLS 1.2 only (the printer rejects 1.3 data-channel session resumption)
//!  - passive-mode NAT workaround (printer advertises a bogus PASV address that
//!    would otherwise hang STOR forever — reuse the control connection's host)
//!  - STOR subdirectory varies by model — try candidates, 553 = not writable → next
//!
//! All steps log via `crate::logs` so they surface on the app's Logs page.

use std::io::Cursor;

use serde::Serialize;
use suppaftp::native_tls::{Protocol, TlsConnector};
use suppaftp::types::FileType;
use suppaftp::{Mode, NativeTlsConnector, NativeTlsFtpStream};
use tauri::Manager;

use crate::logs;

/// Result of a direct upload: where the file landed and which internal gcode
/// path the MQTT print command must reference.
#[derive(Serialize)]
pub struct UploadResult {
    pub remote_path: String,
    pub param: String,
}

/// Error message shown when a module's file has no sliced gcode inside (i.e. it's
/// a project .3mf, not a print-ready `.gcode.3mf`). The frontend detects this
/// marker substring and shows it verbatim. Keep the phrasing stable.
const NO_GCODE_MSG: &str =
    "This file has no sliced gcode inside — it's a project file, not a print-ready \
     .gcode.3mf. Open it in Bambu Studio, slice it, export the sliced file, and \
     re-attach it to this module on the Modules page.";

/// Inspect the .3mf (a zip) and return the internal gcode path for the print
/// command's `param`. Returns None when the archive contains no gcode at all —
/// the caller then refuses to send. Mirrors the old Python `_find_gcode_param`.
fn find_gcode_param(bytes: &[u8], serial: &str, name: &str) -> Option<String> {
    match zip::ZipArchive::new(Cursor::new(bytes)) {
        Ok(archive) => {
            let names: Vec<String> = archive.file_names().map(str::to_string).collect();
            // Log the archive contents so we can see exactly what the .3mf holds.
            logs::log("info", "3MF", format!("Archive entries ({}): {}", names.len(), names.join(", ")), serial, name);
            if let Some(p) = names.iter().find(|n| n.starts_with("Metadata/plate_") && n.ends_with(".gcode")) {
                logs::log("info", "3MF", format!("Found gcode at {p}"), serial, name);
                return Some(p.clone());
            }
            if let Some(p) = names.iter().find(|n| n.ends_with(".gcode")) {
                logs::log("info", "3MF", format!("Fallback gcode at {p}"), serial, name);
                return Some(p.clone());
            }
            logs::log("error", "3MF", "No sliced gcode in archive — file is not print-ready", serial, name);
            None
        }
        Err(e) => {
            logs::log("error", "3MF", format!("Could not read .3mf archive: {e}"), serial, name);
            None
        }
    }
}

/// Make a filename safe for FAT32 SD cards (some models reject non-ASCII).
/// Transliterates German umlauts, strips remaining non-ASCII, spaces → '_'.
fn sanitize(name: &str) -> String {
    let mut s = name.to_string();
    for (from, to) in [
        ("ä", "ae"), ("ö", "oe"), ("ü", "ue"),
        ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss"),
    ] {
        s = s.replace(from, to);
    }
    s = s.chars().filter(|c| c.is_ascii()).collect();
    s.split_whitespace().collect::<Vec<_>>().join("_")
}

/// STOR subdirectories to try, by model. H2S/H2D use USB storage under an unknown
/// directory name — try a wide set. Others use the SD-card `cache`/`model` dirs.
fn path_candidates(model: &str) -> Vec<&'static str> {
    if model.to_uppercase().contains("H2") {
        vec!["sdcard", "usbdisk", "usb", "udisk", "external", "storage", "internal", "cache", "model", ""]
    } else {
        vec!["cache", "model", ""]
    }
}

/// Upload a module's local copy (`<appdata>/modules/<id>_<file_name>`) to the
/// printer via FTPS. Returns the remote path (e.g. `/cache/<file>`) for the
/// subsequent MQTT `project_file` print command.
#[tauri::command]
pub async fn upload_file_direct(
    app: tauri::AppHandle,
    id: i64,
    file_name: String,
    ip: String,
    serial: String,
    access_code: String,
    printer_model: String,
    name: String,
) -> Result<UploadResult, String> {
    // The local copy is id-prefixed (collision-free on this machine), but the file
    // uploaded to the printer keeps the clean original name.
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("modules")
        .join(crate::flatten_local_name(&format!("{id}_{file_name}")));
    if !path.exists() {
        return Err(format!("file not on this machine: {}", path.display()));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("read failed: {e}"))?;
    // Refuse to upload a file the printer can't print — fail fast with guidance.
    let param = find_gcode_param(&bytes, &serial, &name)
        .ok_or_else(|| NO_GCODE_MSG.to_string())?;
    let remote_filename = sanitize(&crate::flatten_local_name(&file_name));

    // suppaftp is blocking — run it off the async runtime.
    let remote_path = tokio::task::spawn_blocking(move || {
        upload_blocking(&ip, &serial, &access_code, &printer_model, &name, &remote_filename, &bytes)
    })
    .await
    .map_err(|e| format!("upload task failed: {e}"))??;

    Ok(UploadResult { remote_path, param })
}

fn upload_blocking(
    ip: &str,
    serial: &str,
    access_code: &str,
    model: &str,
    name: &str,
    remote_filename: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let size = bytes.len();
    let candidates = path_candidates(model);
    logs::log(
        "info", "FTPS",
        format!("Connecting to {ip}:990 — {size} bytes ({:.1} MB), model={}, paths={candidates:?}",
            size as f64 / 1024.0 / 1024.0, if model.is_empty() { "unknown" } else { model }),
        serial, name,
    );

    let connector = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .min_protocol_version(Some(Protocol::Tlsv12))
        .max_protocol_version(Some(Protocol::Tlsv12))
        .build()
        .map_err(|e| format!("TLS setup failed: {e}"))?;

    let mut ftp = NativeTlsFtpStream::connect_secure_implicit(
        format!("{ip}:990"),
        NativeTlsConnector::from(connector),
        ip,
    )
    .map_err(|e| {
        logs::log("error", "FTPS", format!("Connect failed: {e}"), serial, name);
        format!("connect failed: {e}")
    })?;

    logs::log("info", "FTPS", "Connected — logging in as bblp", serial, name);
    ftp.login("bblp", access_code).map_err(|e| {
        logs::log("error", "FTPS", format!("Login failed: {e}"), serial, name);
        format!("login failed: {e}")
    })?;
    ftp.set_mode(Mode::Passive);
    ftp.set_passive_nat_workaround(true);
    ftp.transfer_type(FileType::Binary)
        .map_err(|e| format!("set binary type failed: {e}"))?;

    for subdir in &candidates {
        let (remote, remote_path) = if subdir.is_empty() {
            (remote_filename.to_string(), format!("/{remote_filename}"))
        } else {
            (format!("{subdir}/{remote_filename}"), format!("/{subdir}/{remote_filename}"))
        };
        logs::log("info", "FTPS", format!("STOR {remote} ..."), serial, name);
        let mut cursor = Cursor::new(bytes);
        match ftp.put_file(&remote, &mut cursor) {
            Ok(_) => {
                logs::log("info", "FTPS", format!("Upload complete → {remote_path}"), serial, name);
                let _ = ftp.quit();
                return Ok(remote_path);
            }
            Err(e) => {
                let es = e.to_string();
                if es.contains("553") {
                    logs::log("warning", "FTPS",
                        format!("553 on {}, trying next dir", if subdir.is_empty() { "root" } else { subdir }),
                        serial, name);
                    continue;
                }
                logs::log("error", "FTPS", format!("STOR failed: {es}"), serial, name);
                let _ = ftp.quit();
                return Err(format!("upload failed: {es}"));
            }
        }
    }

    let _ = ftp.quit();
    logs::log("error", "FTPS", format!("No writable directory found on {ip}"), serial, name);
    Err(format!("no writable directory found on {ip}"))
}
