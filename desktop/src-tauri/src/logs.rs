//! In-memory structured log buffer for the desktop-direct transport.
//! Mirrors the Pi bridge's `log_buffer.py` (same LogEntry shape) so the
//! frontend "Printer Logs" page can merge Pi + desktop-direct logs into one view.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: f64, // unix secs
    pub level: String,  // "info" | "warning" | "error"
    pub category: String, // "MQTT" | "Print" | "System" ...
    pub printer_serial: String,
    pub printer_name: String,
    pub message: String,
}

const MAX_ENTRIES: usize = 2000;
static BUFFER: Mutex<VecDeque<LogEntry>> = Mutex::new(VecDeque::new());

/// Record a log entry (and echo to stderr for the dev console).
pub fn log(level: &str, category: &str, message: impl Into<String>, serial: &str, name: &str) {
    let message = message.into();
    let display = if !name.is_empty() {
        name
    } else if !serial.is_empty() {
        serial
    } else {
        "system"
    };
    eprintln!("[{category}] {display}: {message}");

    let entry = LogEntry {
        timestamp: now_secs(),
        level: level.to_string(),
        category: category.to_string(),
        printer_serial: serial.to_string(),
        printer_name: name.to_string(),
        message,
    };
    let mut buf = BUFFER.lock().unwrap();
    if buf.len() >= MAX_ENTRIES {
        buf.pop_front();
    }
    buf.push_back(entry);
}

fn now_secs() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

/// Filtered retrieval — mirrors the Pi's `/logs` query params.
#[tauri::command]
pub fn fetch_direct_logs(
    since: f64,
    printer: Option<String>,
    level: Option<String>,
    category: Option<String>,
    limit: Option<usize>,
) -> Vec<LogEntry> {
    let buf = BUFFER.lock().unwrap();
    let printer = printer.unwrap_or_default().to_lowercase();
    let level = level.unwrap_or_default();
    let category = category.unwrap_or_default().to_lowercase();
    let limit = limit.unwrap_or(500);

    let mut out: Vec<LogEntry> = buf
        .iter()
        .filter(|e| since <= 0.0 || e.timestamp > since)
        .filter(|e| {
            printer.is_empty()
                || e.printer_serial.to_lowercase() == printer
                || e.printer_name.to_lowercase() == printer
        })
        .filter(|e| level.is_empty() || e.level == level)
        .filter(|e| category.is_empty() || e.category.to_lowercase() == category)
        .cloned()
        .collect();

    let n = out.len();
    if n > limit {
        out = out.split_off(n - limit);
    }
    out
}

/// Unique printers seen in the desktop-direct logs (for the filter dropdown).
#[tauri::command]
pub fn fetch_direct_printers() -> Vec<serde_json::Value> {
    let buf = BUFFER.lock().unwrap();
    let mut seen: Vec<(String, String)> = Vec::new();
    for e in buf.iter() {
        if !e.printer_serial.is_empty() && !seen.iter().any(|(s, _)| s == &e.printer_serial) {
            let name = if e.printer_name.is_empty() {
                e.printer_serial.clone()
            } else {
                e.printer_name.clone()
            };
            seen.push((e.printer_serial.clone(), name));
        }
    }
    seen.into_iter()
        .map(|(s, n)| serde_json::json!({ "serial": s, "name": n }))
        .collect()
}
