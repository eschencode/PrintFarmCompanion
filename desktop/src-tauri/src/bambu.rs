//! Direct Bambu Lab printer connection over LAN MQTT.
//!
//! Mirrors the behaviour of `pi/bambu_client.py`:
//!  - TLS on port 8883, insecure cert (Bambu printers use self-signed certs)
//!  - Credentials: username "bblp", password = printer access code
//!  - Report topic: `device/{serial}/report`
//!  - Request topic: `device/{serial}/request`
//!  - Incremental status merging (Bambu sends only changed fields)

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use rumqttc::{AsyncClient, MqttOptions, QoS, Transport, TlsConfiguration};
use rumqttc::tokio_rustls::rustls::{
    self,
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    DigitallySignedStruct, SignatureScheme,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::logs;

// ── Public event payloads ─────────────────────────────────────────────────────

/// Emitted as `"printer-status"` to the webview.
/// Mirrors the fields logged by the Pi's `BambuMQTTClient`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterStatusEvent {
    pub printer_id: i64,
    pub serial: String,
    pub gcode_state: String,
    pub stage: String,
    pub progress: i64,
    pub layer_num: i64,
    pub total_layer_num: i64,
    pub remaining_time: Option<i64>,
    pub nozzle_temp: Option<f64>,
    pub bed_temp: Option<f64>,
    pub chamber_temp: Option<f64>,
    pub subtask_name: Option<String>,
    pub gcode_file: Option<String>,
    pub error_code: i64,
    // Extended fields — parity with the Pi /status payload so the desktop detail
    // modal shows the same live data (targets, fans, speed profile, wifi, HMS).
    pub nozzle_target_temp: Option<f64>,
    pub bed_target_temp: Option<f64>,
    pub cooling_fan_speed: Option<i64>,
    pub aux_fan_speed: Option<i64>,
    pub chamber_fan_speed: Option<i64>,
    pub speed_level: Option<i64>,
    pub speed_mag: Option<i64>,
    pub wifi_signal: Option<String>,
    pub hms: Option<serde_json::Value>,
}

/// Emitted as `"printer-connected"` / `"printer-disconnected"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterConnectionEvent {
    pub printer_id: i64,
    pub serial: String,
}

// ── Cert verification skip (Bambu uses self-signed certs) ────────────────────

/// Mirrors Python's `ssl.CERT_NONE` — accepts any cert from the printer.
#[derive(Debug)]
struct SkipVerification;

impl ServerCertVerifier for SkipVerification {
    fn verify_server_cert(
        &self, _: &CertificateDer<'_>, _: &[CertificateDer<'_>],
        _: &ServerName<'_>, _: &[u8], _: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct)
        -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct)
        -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA256, SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512, SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,   SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ECDSA_NISTP256_SHA256, SignatureScheme::ECDSA_NISTP384_SHA384,
        ]
    }
}

// ── Internal state ────────────────────────────────────────────────────────────

struct PrinterConn {
    client: AsyncClient,
    #[allow(dead_code)]
    printer_id: i64,
    name: String,
}

/// Shared state — one entry per subscribed printer serial.
pub struct BambuDirectManager {
    printers: Mutex<HashMap<String, PrinterConn>>,
}

impl BambuDirectManager {
    pub fn new() -> Self {
        Self { printers: Mutex::new(HashMap::new()) }
    }

    /// Returns true if a connection already exists for this serial.
    pub fn is_connected(&self, serial: &str) -> bool {
        self.printers.lock().unwrap().contains_key(serial)
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Subscribe to a printer's MQTT status stream.
/// Safe to call multiple times — re-connects if not already connected.
#[tauri::command]
pub async fn subscribe_printer(
    printer_id: i64,
    ip: String,
    serial: String,
    access_code: String,
    #[allow(non_snake_case)] name: Option<String>,
    state: tauri::State<'_, Arc<BambuDirectManager>>,
    app: AppHandle,
) -> Result<(), String> {
    if state.is_connected(&serial) {
        return Ok(());
    }
    let name = name.unwrap_or_default();

    logs::log("info", "MQTT", format!("Connecting to {ip}:8883 (direct)"), &serial, &name);

    let (client, eventloop) = build_mqtt_client(&ip, &serial, &access_code)
        .map_err(|e| {
            logs::log("error", "MQTT", format!("Connect failed: {e}"), &serial, &name);
            e.to_string()
        })?;

    // Subscribe to the report topic
    client
        .subscribe(format!("device/{}/report", serial), QoS::AtMostOnce)
        .await
        .map_err(|e| e.to_string())?;

    // Request full state immediately (same as Pi's pushall)
    let pushall = serde_json::json!({
        "pushing": { "sequence_id": timestamp_secs(), "command": "pushall" }
    });
    client
        .publish(
            format!("device/{}/request", serial),
            QoS::AtMostOnce,
            false,
            pushall.to_string(),
        )
        .await
        .map_err(|e| e.to_string())?;

    state.printers.lock().unwrap().insert(
        serial.clone(),
        PrinterConn { client: client.clone(), printer_id, name: name.clone() },
    );
    logs::log("info", "MQTT", "Subscribed to status stream", &serial, &name);

    // Run the event loop in the background. It self-reconnects with backoff, so it
    // only returns if the printer is explicitly disconnected.
    let serial_clone = serial.clone();
    let name_clone = name.clone();
    let state_clone = Arc::clone(&state);
    let app_clone = app.clone();
    let client_clone = client.clone();
    tauri::async_runtime::spawn(async move {
        run_eventloop(eventloop, client_clone, printer_id, serial_clone.clone(), name_clone, app_clone.clone()).await;
        // Remove from state on disconnect so reconnect is possible
        state_clone.printers.lock().unwrap().remove(&serial_clone);
        let _ = app_clone.emit(
            "printer-disconnected",
            PrinterConnectionEvent { printer_id, serial: serial_clone },
        );
    });

    // Heartbeat: re-request a full status push every 30s. Bambu only includes the
    // detail fields (targets, fans, speed, wifi, HMS) in full reports, not in the
    // small per-frame deltas — and the on-connect pushall can race the SUBACK.
    let hb_client = client.clone();
    let hb_topic = format!("device/{serial}/request");
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let pushall = serde_json::json!({
                "pushing": { "sequence_id": timestamp_secs(), "command": "pushall" }
            });
            // Errors here mean the eventloop is gone (printer removed) — stop.
            if hb_client
                .publish(hb_topic.clone(), QoS::AtMostOnce, false, pushall.to_string())
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let _ = app.emit(
        "printer-connected",
        PrinterConnectionEvent { printer_id, serial },
    );

    Ok(())
}

/// Send a control command (pause | resume | stop) to a connected printer.
#[tauri::command]
pub async fn send_printer_command(
    serial: String,
    command: String,
    state: tauri::State<'_, Arc<BambuDirectManager>>,
) -> Result<(), String> {
    let (client, name) = {
        let printers = state.printers.lock().unwrap();
        printers
            .get(&serial)
            .map(|c| (c.client.clone(), c.name.clone()))
            .ok_or_else(|| format!("Printer {serial} not connected"))?
    };

    logs::log("info", "MQTT", format!("Sending command: {command}"), &serial, &name);

    let payload = serde_json::json!({
        "print": { "sequence_id": "0", "command": command, "param": "" }
    });

    client
        .publish(
            format!("device/{}/request", serial),
            QoS::AtMostOnce,
            false,
            payload.to_string(),
        )
        .await
        .map_err(|e| {
            logs::log("error", "MQTT", format!("Command failed: {e}"), &serial, &name);
            e.to_string()
        })
}

/// Start a print on a connected printer.
/// `remote_path` is the absolute path on the printer SD card, e.g. `/cache/file.gcode.3mf`.
/// `param` is the internal gcode path inside the .3mf, e.g. `Metadata/plate_1.gcode`.
#[tauri::command]
pub async fn start_print_direct(
    serial: String,
    remote_path: String,
    param: String,
    state: tauri::State<'_, Arc<BambuDirectManager>>,
) -> Result<String, String> {
    let (client, name) = {
        let printers = state.printers.lock().unwrap();
        printers
            .get(&serial)
            .map(|c| (c.client.clone(), c.name.clone()))
            .ok_or_else(|| format!("Printer {serial} not connected — call subscribe_printer first"))?
    };

    let task_id = uuid::Uuid::new_v4().to_string();
    let url = format!("file:///sdcard{}", remote_path);
    logs::log("info", "Print", format!("Starting print: {param} (task {task_id})"), &serial, &name);

    let payload = serde_json::json!({
        "print": {
            "sequence_id": timestamp_secs(),
            "command": "project_file",
            "param": param,
            "url": url,
            "subtask_id": "0",
            "profile_id": "0",
            "task_id": task_id,
            "project_id": "0",
            "bed_type": "auto",
            "bed_leveling": true,
            "flow_cali": false,
            "vibration_cali": true,
            "layer_inspect": false,
            "use_ams": false,
            "ams_mapping": [{ "ams": 255, "slot": 255 }],
            "timelapse": false,
        }
    });

    client
        .publish(
            format!("device/{}/request", serial),
            QoS::AtMostOnce,
            false,
            payload.to_string(),
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(task_id)
}

// ── Internals ─────────────────────────────────────────────────────────────────

fn build_mqtt_client(
    ip: &str,
    serial: &str,
    access_code: &str,
) -> Result<(AsyncClient, rumqttc::EventLoop), Box<dyn std::error::Error>> {
    let client_id = format!("pfc-desktop-{}", &serial[..serial.len().min(8)]);

    let tls_config = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(SkipVerification))
        .with_no_client_auth();

    let mut opts = MqttOptions::new(client_id, ip, 8883u16);
    opts.set_credentials("bblp", access_code);
    opts.set_keep_alive(std::time::Duration::from_secs(60));
    // Bambu's full `pushall` status report is ~14KB+ (more with AMS/multi-color),
    // which blows past rumqttc's 10KB default incoming limit and disconnects on
    // every connect. Raise the cap so the full report parses.
    opts.set_max_packet_size(1024 * 1024, 1024 * 1024);
    opts.set_transport(Transport::tls_with_config(
        TlsConfiguration::Rustls(std::sync::Arc::new(tls_config)),
    ));

    Ok(AsyncClient::new(opts, 32))
}

/// Poll the rumqttc event loop, forwarding status events to the webview.
/// Survives transient drops: on a poll error it backs off (1s→60s) and keeps
/// polling — rumqttc reconnects, and we re-subscribe on each ConnAck so the
/// monitor doesn't go silent (parity with the Pi's auto-reconnect).
async fn run_eventloop(
    mut eventloop: rumqttc::EventLoop,
    client: AsyncClient,
    printer_id: i64,
    serial: String,
    name: String,
    app: AppHandle,
) {
    // Incremental state — merge like Pi's BambuMQTTClient
    let mut last: Option<PrinterStatusEvent> = None;
    let mut backoff = std::time::Duration::from_secs(1);

    loop {
        match eventloop.poll().await {
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::ConnAck(_))) => {
                backoff = std::time::Duration::from_secs(1);
                logs::log("info", "MQTT", "Connected", &serial, &name);
                // (Re)subscribe + request a full state push on every (re)connect —
                // Bambu doesn't persist sessions, so subscriptions are lost on drop.
                let _ = client
                    .subscribe(format!("device/{serial}/report"), QoS::AtMostOnce)
                    .await;
                let pushall = serde_json::json!({
                    "pushing": { "sequence_id": timestamp_secs(), "command": "pushall" }
                });
                let _ = client
                    .publish(format!("device/{serial}/request"), QoS::AtMostOnce, false, pushall.to_string())
                    .await;
                let _ = app.emit(
                    "printer-connected",
                    PrinterConnectionEvent { printer_id, serial: serial.clone() },
                );
            }
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::Publish(p))) => {
                if let Ok(text) = std::str::from_utf8(&p.payload) {
                    if let Some(evt) = merge_status(printer_id, &serial, text, last.as_ref()) {
                        last = Some(evt.clone());
                        let _ = app.emit("printer-status", &evt);
                    }
                }
            }
            Err(e) => {
                logs::log("warning", "MQTT",
                    format!("Disconnected ({e}) — reconnecting in {backoff:?}"), &serial, &name);
                let _ = app.emit(
                    "printer-disconnected",
                    PrinterConnectionEvent { printer_id, serial: serial.clone() },
                );
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(std::time::Duration::from_secs(60));
            }
            _ => {}
        }
    }
}

/// Parse a raw MQTT message and merge with the last known status.
/// Returns None if the message has no `print` field.
fn merge_status(
    printer_id: i64,
    serial: &str,
    payload: &str,
    last: Option<&PrinterStatusEvent>,
) -> Option<PrinterStatusEvent> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    let print = value.get("print")?;

    // Detect task_id change → reset progress/layers (same logic as Pi code)
    let incoming_task = print.get("task_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let task_changed = last.is_some()
        && !incoming_task.is_empty()
        && Some(incoming_task.as_str()) != last.map(|_| "");

    let prev_progress = if task_changed { 0 } else { last.map(|s| s.progress).unwrap_or(0) };
    let prev_layer = if task_changed { 0 } else { last.map(|s| s.layer_num).unwrap_or(0) };
    let prev_total = if task_changed { 0 } else { last.map(|s| s.total_layer_num).unwrap_or(0) };

    Some(PrinterStatusEvent {
        printer_id,
        serial: serial.to_string(),
        gcode_state: str_field(print, "gcode_state")
            .unwrap_or_else(|| last.map(|s| s.gcode_state.clone()).unwrap_or_default()),
        stage: str_field(print, "mc_print_stage")
            .unwrap_or_else(|| last.map(|s| s.stage.clone()).unwrap_or_default()),
        progress: int_field(print, "mc_percent").unwrap_or(prev_progress),
        layer_num: int_field(print, "layer_num").unwrap_or(prev_layer),
        total_layer_num: int_field(print, "total_layer_num").unwrap_or(prev_total),
        remaining_time: int_field(print, "mc_remaining_time")
            .or_else(|| last.and_then(|s| s.remaining_time)),
        nozzle_temp: float_field(print, "nozzle_temper")
            .or_else(|| last.and_then(|s| s.nozzle_temp)),
        bed_temp: float_field(print, "bed_temper")
            .or_else(|| last.and_then(|s| s.bed_temp)),
        chamber_temp: float_field(print, "chamber_temper")
            .or_else(|| last.and_then(|s| s.chamber_temp)),
        subtask_name: str_field(print, "subtask_name")
            .or_else(|| last.and_then(|s| s.subtask_name.clone())),
        gcode_file: str_field(print, "gcode_file")
            .or_else(|| last.and_then(|s| s.gcode_file.clone())),
        error_code: int_field(print, "print_error")
            .unwrap_or_else(|| last.map(|s| s.error_code).unwrap_or(0)),
        nozzle_target_temp: float_field(print, "nozzle_target_temper")
            .or_else(|| last.and_then(|s| s.nozzle_target_temp)),
        bed_target_temp: float_field(print, "bed_target_temper")
            .or_else(|| last.and_then(|s| s.bed_target_temp)),
        // Bambu reports fan speeds as strings ("0".."15") — parse loosely.
        cooling_fan_speed: loose_int(print, "cooling_fan_speed")
            .or_else(|| last.and_then(|s| s.cooling_fan_speed)),
        aux_fan_speed: loose_int(print, "big_fan1_speed")
            .or_else(|| last.and_then(|s| s.aux_fan_speed)),
        chamber_fan_speed: loose_int(print, "big_fan2_speed")
            .or_else(|| last.and_then(|s| s.chamber_fan_speed)),
        speed_level: loose_int(print, "spd_lvl")
            .or_else(|| last.and_then(|s| s.speed_level)),
        speed_mag: loose_int(print, "spd_mag")
            .or_else(|| last.and_then(|s| s.speed_mag)),
        wifi_signal: str_field(print, "wifi_signal")
            .or_else(|| last.and_then(|s| s.wifi_signal.clone())),
        // hms is a full array re-sent on change — carry the latest, else keep last.
        hms: print.get("hms").cloned()
            .or_else(|| last.and_then(|s| s.hms.clone())),
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn timestamp_secs() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn str_field(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key)?.as_str().map(str::to_string)
}

fn int_field(v: &serde_json::Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64().or_else(|| x.as_f64().map(|f| f as i64)))
}

fn float_field(v: &serde_json::Value, key: &str) -> Option<f64> {
    v.get(key)?.as_f64()
}

/// Parse an int that Bambu may send as a number OR a string (e.g. fan speeds "15").
fn loose_int(v: &serde_json::Value, key: &str) -> Option<i64> {
    let field = v.get(key)?;
    field
        .as_i64()
        .or_else(|| field.as_f64().map(|f| f as i64))
        .or_else(|| field.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
}
