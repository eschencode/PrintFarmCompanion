"""
Print Farm Companion — Pi Bridge Server
Runs on the Raspberry Pi, exposed via Cloudflare Tunnel.

Receives .gcode.3mf files and print commands from Cloudflare Workers,
then talks to Bambu Lab printers on the local network via FTPS + MQTT.
"""

import json
import os
import ssl
import threading
import time
from pathlib import Path
from typing import Optional

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel

import uuid

from .bambu_client import (
    BambuMQTTClient,
    PrinterCredentials,
    PrintStatus,
    upload_file_ftps,
    send_print_command,
    _find_gcode_param,
    _read_filament_info,
)
from .log_buffer import log, get_logs, get_printers

load_dotenv()

FILES_DIR = Path(os.getenv("FILES_DIR", "/home/pi/printfarm/files"))
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
PI_SECRET = os.getenv("PI_SECRET", "")

MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB

FILES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PrintFarm Pi Bridge")


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_secret(x_pi_secret: str = Header(default="")):
    if PI_SECRET and x_pi_secret != PI_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── State ─────────────────────────────────────────────────────────────────────

# Active MQTT monitors keyed by printer serial
_monitors: dict[str, BambuMQTTClient] = {}
_monitors_lock = threading.Lock()

# Persistent status cache — survives monitor teardown, updated by monitors + idle poller
_status_cache: dict[str, dict] = {}
_status_cache_lock = threading.Lock()

# Printer registry — stores credentials for idle polling (populated on /print)
_printer_registry: dict[str, PrinterCredentials] = {}
_registry_lock = threading.Lock()

# Some Bambu firmware sticks at RUNNING 99% (final layer, no time left) and never
# emits FINISH. Track when a printer first looked "effectively done" so we can
# synthesize a completion after it persists. Keyed by serial → unix timestamp.
_done_since: dict[str, float] = {}
_done_since_lock = threading.Lock()
STUCK_FINISH_SECONDS = 90

# Last mapped status POSTed to the webhook per serial — used to suppress repeat
# webhooks for an unchanged status (the printer reports the same RUNNING ~every 5s).
_last_sent_status: dict[str, str] = {}
_last_sent_lock = threading.Lock()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", dependencies=[Depends(verify_secret)])
def health():
    return {"ok": True, "files_dir": str(FILES_DIR), "active_monitors": list(_monitors.keys())}


# ── Webhook misroute catch ────────────────────────────────────────────────────

@app.post("/api/pi/webhook")
def webhook_misroute_warning():
    """Catch webhook requests that loop back to the Pi due to WEBHOOK_URL misconfiguration."""
    log("warning", "Webhook", "Received webhook on Pi — WEBHOOK_URL is misconfigured. "
        "It should point to your Cloudflare Pages domain, not the tunnel URL.")
    return {"error": "Webhook received on Pi server — WEBHOOK_URL misconfigured",
            "fix": "Set WEBHOOK_URL in .env to your Cloudflare Pages domain (e.g. https://your-app.pages.dev/api/pi/webhook)"}


# ── Logs ─────────────────────────────────────────────────────────────────────

@app.get("/logs", dependencies=[Depends(verify_secret)])
def get_log_entries(
    printer: str = "",
    level: str = "",
    category: str = "",
    limit: int = 200,
    since: float = 0,
):
    """Return filtered log entries from the in-memory buffer."""
    entries = get_logs(
        printer=printer,
        level=level,
        category=category,
        limit=min(limit, 1000),
        since=since,
    )
    return {"entries": entries, "count": len(entries)}


@app.get("/logs/printers", dependencies=[Depends(verify_secret)])
def get_log_printers():
    """Return list of unique printers seen in the log buffer."""
    return {"printers": get_printers()}


# ── File upload ───────────────────────────────────────────────────────────────

@app.post("/upload", dependencies=[Depends(verify_secret)])
async def upload_file(file: UploadFile = File(...)):
    """
    Receive a .gcode.3mf file from CF Workers and save it to disk.
    Returns the local file path so Workers can store it in D1 as pi_file_path.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename required")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 500MB)")

    safe_name = Path(file.filename).name  # strip any path components
    dest = FILES_DIR / safe_name
    dest.write_bytes(contents)

    return {"success": True, "path": str(dest), "filename": safe_name, "size": len(contents)}


# ── Print ─────────────────────────────────────────────────────────────────────

class PrintRequest(BaseModel):
    file_path: str          # absolute path on Pi disk
    printer_ip: str
    printer_serial: str
    printer_access_code: str
    printer_name: Optional[str] = None  # friendly name from D1
    printer_model: Optional[str] = None  # e.g. "P1S", "H2S" — selects FTP path
    options: Optional[dict] = None


@app.post("/print", dependencies=[Depends(verify_secret)])
def trigger_print(req: PrintRequest):
    """
    Upload file to printer via FTPS and send MQTT print command.
    Then start an MQTT monitor to stream status back to CF Workers via webhook.
    """
    path = Path(req.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    log("info", "Print", f"file={req.file_path} ip={req.printer_ip} access_code={'*'*4+req.printer_access_code[-2:] if req.printer_access_code else 'MISSING'}",
        printer_serial=req.printer_serial, printer_name=req.printer_name or "")

    credentials = PrinterCredentials(
        ip=req.printer_ip,
        serial=req.printer_serial,
        access_code=req.printer_access_code,
        name=req.printer_name or "",
    )

    # Register printer for idle polling
    with _registry_lock:
        _printer_registry[req.printer_serial] = credentials

    # 1. Upload file synchronously — must succeed before we return
    try:
        remote_path = upload_file_ftps(credentials, str(path), path.name, printer_model=req.printer_model or "")
        log("info", "Bambu", f"Uploaded to {remote_path}",
            printer_serial=req.printer_serial, printer_name=req.printer_name or "")
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Surface the real reason into the in-app log viewer, not just stderr.
        log("error", "FTPS", f"Upload failed: {type(e).__name__}: {e}",
            printer_serial=req.printer_serial, printer_name=req.printer_name or "")
        raise HTTPException(status_code=500, detail=f"FTPS upload failed: {e}")

    # Inspect the local .3mf to find the correct internal gcode path and filament info
    gcode_param = _find_gcode_param(str(path))
    filament_info = _read_filament_info(str(path))
    log("info", "Print", f"Using gcode param: {gcode_param}, filament slots: {len(filament_info)}",
        printer_serial=req.printer_serial, printer_name=req.printer_name or "")

    task_id = str(uuid.uuid4())
    options = req.options or {}

    # Immediately set status cache to PREPARE so the frontend doesn't briefly show IDLE
    with _status_cache_lock:
        _status_cache[req.printer_serial] = {
            "task_id": task_id,
            "gcode_state": "PREPARE",
            "progress": 0,
            "layer_num": 0,
            "total_layer_num": 0,
            "error_code": 0,
            "remaining_time": None,
            "nozzle_temp": None,
            "bed_temp": None,
            "chamber_temp": None,
            "subtask_name": None,
            "gcode_file": None,
            "hms": None,
            "nozzle_target_temp": None,
            "bed_target_temp": None,
            "cooling_fan_speed": None,
            "aux_fan_speed": None,
            "chamber_fan_speed": None,
            "speed_level": None,
            "speed_mag": None,
            "wifi_signal": None,
            "updated_at": int(time.time()),
        }

    # 2. Send MQTT command + start monitor in background so HTTP response returns immediately
    def _send_and_monitor():
        try:
            send_print_command(credentials, remote_path, task_id, options, param=gcode_param, filament_info=filament_info)
        except Exception as e:
            log("error", "Print", f"MQTT error: {e}",
                printer_serial=credentials.serial, printer_name=credentials.name)
        _start_monitor(credentials, task_id)

    threading.Thread(target=_send_and_monitor, daemon=True).start()

    return {"success": True, "task_id": task_id}


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/status/{serial}", dependencies=[Depends(verify_secret)])
def get_status(serial: str, request: Request):
    """Return the last known status snapshot for a printer by serial number."""
    # Auto-register printer if credentials are provided and it's not in registry.
    # This lets the Pi self-heal after a restart — the CF Worker passes credentials
    # on every poll, so the first request after restart triggers a pushall immediately.
    printer_ip = request.headers.get("x-printer-ip", "")
    printer_code = request.headers.get("x-printer-code", "")
    printer_name = request.headers.get("x-printer-name", "")
    with _registry_lock:
        already_registered = serial in _printer_registry
    if printer_ip and printer_code and not already_registered:
        creds = PrinterCredentials(ip=printer_ip, serial=serial, access_code=printer_code, name=printer_name)
        with _registry_lock:
            _printer_registry[serial] = creds
        log("info", "Status", f"Auto-registered — triggering background poll",
            printer_serial=serial, printer_name=printer_name)
        threading.Thread(target=_poll_idle_printer, args=(creds,), daemon=True).start()

    with _monitors_lock:
        monitor = _monitors.get(serial)

    # Active monitor — use live data
    if monitor and monitor.last_status:
        status = monitor.last_status
        return {
            "serial": serial,
            "connected": monitor._connected,
            "status": {
                "task_id": status.task_id,
                "gcode_state": status.gcode_state,
                "progress": status.progress,
                "layer_num": status.layer_num,
                "total_layer_num": status.total_layer_num,
                "error_code": status.error_code,
                "remaining_time": status.raw.get("mc_remaining_time"),
                "nozzle_temp": status.raw.get("nozzle_temper"),
                "bed_temp": status.raw.get("bed_temper"),
                "chamber_temp": status.raw.get("chamber_temper"),
                "subtask_name": status.raw.get("subtask_name"),
                "gcode_file": status.raw.get("gcode_file"),
                "hms": status.raw.get("hms"),
                "nozzle_target_temp": status.raw.get("nozzle_target_temper"),
                "bed_target_temp": status.raw.get("bed_target_temper"),
                "cooling_fan_speed": status.raw.get("cooling_fan_speed"),
                "aux_fan_speed": status.raw.get("big_fan1_speed"),
                "chamber_fan_speed": status.raw.get("big_fan2_speed"),
                "speed_level": status.raw.get("spd_lvl"),
                "speed_mag": status.raw.get("spd_mag"),
                "wifi_signal": status.raw.get("wifi_signal"),
                "updated_at": int(monitor.last_status_at),
            },
        }

    # No active monitor — return cached status (from last print or idle poll)
    with _status_cache_lock:
        cached = _status_cache.get(serial)

    if cached:
        return {"serial": serial, "connected": False, "status": cached}

    return {"serial": serial, "connected": False, "status": None}


# ── Printer controls (cancel / pause / resume) ────────────────────────────────

class PrinterRequest(BaseModel):
    printer_ip: str
    printer_serial: str
    printer_access_code: str


def _send_mqtt_command(req: PrinterRequest, cmd: dict, action: str):
    """Connect, publish a single MQTT command, then disconnect."""
    client = mqtt.Client()
    client.username_pw_set("bblp", req.printer_access_code)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)
    try:
        client.connect(req.printer_ip, port=8883, keepalive=10)
        client.loop_start()
        time.sleep(0.5)
        client.publish(f"device/{req.printer_serial}/request", json.dumps(cmd))
        time.sleep(0.3)
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{action} failed: {e}")


@app.post("/cancel", dependencies=[Depends(verify_secret)])
def cancel_print(req: PrinterRequest):
    """Send MQTT stop command to the printer."""
    _send_mqtt_command(req, {"print": {"sequence_id": "0", "command": "stop", "param": ""}}, "Cancel")
    return {"success": True}


@app.post("/pause", dependencies=[Depends(verify_secret)])
def pause_print(req: PrinterRequest):
    """Send MQTT pause command to the printer."""
    _send_mqtt_command(req, {"print": {"sequence_id": "0", "command": "pause", "param": ""}}, "Pause")
    return {"success": True}


@app.post("/resume", dependencies=[Depends(verify_secret)])
def resume_print(req: PrinterRequest):
    """Send MQTT resume command to the printer."""
    _send_mqtt_command(req, {"print": {"sequence_id": "0", "command": "resume", "param": ""}}, "Resume")
    return {"success": True}


# ── Internal: MQTT monitor ────────────────────────────────────────────────────

# Only these states trigger webhooks — IDLE/empty are ignored
_ACTIVE_STATES = {"FINISH", "FAILED", "RUNNING", "PREPARE", "PAUSE"}
_STATE_MAP = {
    "FINISH": "success",
    "FAILED": "failed",
    "RUNNING": "printing",
    "PREPARE": "printing",
    "PAUSE": "paused",
}


def _start_monitor(credentials: PrinterCredentials, task_id: str):
    """Start a background MQTT monitor for a printer. Sends webhooks to CF Workers."""

    def on_status(status: PrintStatus):
        # Skip IDLE and unknown states — avoids spurious "printing 100%" webhooks
        if status.gcode_state not in _ACTIVE_STATES:
            return

        # Bambu firmware can stick at RUNNING 99% (final layer, no time left) and
        # never emit FINISH. If that condition persists, synthesize a FINISH so the
        # print completes normally and this monitor stops leaking.
        is_done_running = (
            status.gcode_state == "RUNNING"
            and status.total_layer_num > 0
            and status.layer_num >= status.total_layer_num
            and int(status.raw.get("mc_remaining_time") or 0) == 0
            and status.progress >= 99
        )
        if is_done_running:
            with _done_since_lock:
                first_seen = _done_since.setdefault(credentials.serial, time.time())
            if time.time() - first_seen >= STUCK_FINISH_SECONDS:
                log("warning", "MQTT",
                    f"Stuck at RUNNING {status.progress}% (layer {status.layer_num}/{status.total_layer_num}, "
                    f"0 min left) for {STUCK_FINISH_SECONDS}s — synthesizing FINISH",
                    printer_serial=credentials.serial, printer_name=credentials.name)
                status.gcode_state = "FINISH"
                with _done_since_lock:
                    _done_since.pop(credentials.serial, None)
        else:
            with _done_since_lock:
                _done_since.pop(credentials.serial, None)

        # Always keep status cache up to date
        with _status_cache_lock:
            _status_cache[credentials.serial] = {
                "task_id": status.task_id,
                "gcode_state": status.gcode_state,
                "progress": status.progress,
                "layer_num": status.layer_num,
                "total_layer_num": status.total_layer_num,
                "error_code": status.error_code,
                "remaining_time": status.raw.get("mc_remaining_time"),
                "nozzle_temp": status.raw.get("nozzle_temper"),
                "bed_temp": status.raw.get("bed_temper"),
                "chamber_temp": status.raw.get("chamber_temper"),
                "subtask_name": status.raw.get("subtask_name"),
                "gcode_file": status.raw.get("gcode_file"),
                "hms": status.raw.get("hms"),
                "nozzle_target_temp": status.raw.get("nozzle_target_temper"),
                "bed_target_temp": status.raw.get("bed_target_temper"),
                "cooling_fan_speed": status.raw.get("cooling_fan_speed"),
                "aux_fan_speed": status.raw.get("big_fan1_speed"),
                "chamber_fan_speed": status.raw.get("big_fan2_speed"),
                "speed_level": status.raw.get("spd_lvl"),
                "speed_mag": status.raw.get("spd_mag"),
                "wifi_signal": status.raw.get("wifi_signal"),
                "updated_at": int(time.time()),
            }

        if not WEBHOOK_URL:
            return

        mapped = _STATE_MAP[status.gcode_state]
        is_terminal = mapped in ("success", "failed")
        # Only POST on a status change (or any terminal state) — skip the steady
        # stream of identical 'printing' frames the printer emits every ~5s.
        with _last_sent_lock:
            already_sent = _last_sent_status.get(credentials.serial) == mapped
            if not is_terminal:
                _last_sent_status[credentials.serial] = mapped
        if already_sent and not is_terminal:
            return

        payload = {
            "task_id": task_id,
            "printer_serial": credentials.serial,
            "status": mapped,
            "progress": status.progress,
            "layer_num": status.layer_num,
            "total_layer_num": status.total_layer_num,
            "error_code": status.error_code,
            "gcode_state": status.gcode_state,
        }

        headers = {}
        if WEBHOOK_SECRET:
            headers["X-Webhook-Secret"] = WEBHOOK_SECRET

        try:
            resp = requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=5)
            if resp.status_code == 404:
                log("warning", "Webhook", f"Got 404 from {WEBHOOK_URL} — is WEBHOOK_URL pointing back to the Pi instead of Cloudflare Pages?",
                    printer_serial=credentials.serial, printer_name=credentials.name)
            elif resp.status_code >= 400:
                log("warning", "Webhook", f"Got {resp.status_code} from {WEBHOOK_URL}",
                    printer_serial=credentials.serial, printer_name=credentials.name)
        except Exception as e:
            log("error", "Webhook", f"Failed to send: {e}",
                printer_serial=credentials.serial, printer_name=credentials.name)

        # Stop monitoring when print completes
        if mapped in ("success", "failed"):
            threading.Timer(2.0, lambda: _stop_monitor(credentials.serial)).start()

    with _monitors_lock:
        # Stop any existing monitor for this serial before starting a new one
        if credentials.serial in _monitors:
            _monitors[credentials.serial].disconnect()

        monitor = BambuMQTTClient(credentials=credentials, on_status=on_status)
        _monitors[credentials.serial] = monitor

    def run():
        try:
            monitor.connect()
        except Exception as e:
            log("error", "MQTT", f"Monitor failed: {e}",
                printer_serial=credentials.serial, printer_name=credentials.name)

    threading.Thread(target=run, daemon=True).start()


def _stop_monitor(serial: str):
    with _monitors_lock:
        monitor = _monitors.pop(serial, None)
    with _last_sent_lock:
        _last_sent_status.pop(serial, None)
    if monitor:
        monitor.disconnect()


# ── Idle status poller ────────────────────────────────────────────────────────

def _poll_idle_printer(credentials: PrinterCredentials):
    """One-shot MQTT pushall to refresh status cache for an idle printer."""
    log("info", "Idle", "Polling ...",
        printer_serial=credentials.serial, printer_name=credentials.name)
    got_response = threading.Event()

    client = mqtt.Client()
    client.username_pw_set("bblp", credentials.access_code)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)

    def on_connect(c, _u, _f, rc):
        if rc == 0:
            c.subscribe(f"device/{credentials.serial}/report")
            pushall = {"pushing": {"sequence_id": str(int(time.time())), "command": "pushall"}}
            c.publish(f"device/{credentials.serial}/request", json.dumps(pushall))

    def on_message(_c, _u, msg):
        try:
            data = json.loads(msg.payload.decode())
            print_data = data.get("print", {})
            if not print_data:
                return
            with _status_cache_lock:
                _status_cache[credentials.serial] = {
                    "task_id": str(print_data.get("task_id", "")),
                    "gcode_state": print_data.get("gcode_state", "IDLE"),
                    "progress": int(print_data.get("mc_percent", 0)),
                    "layer_num": int(print_data.get("layer_num", 0)),
                    "total_layer_num": int(print_data.get("total_layer_num", 0)),
                    "error_code": int(print_data.get("print_error", 0)),
                    "remaining_time": print_data.get("mc_remaining_time"),
                    "nozzle_temp": print_data.get("nozzle_temper"),
                    "bed_temp": print_data.get("bed_temper"),
                    "chamber_temp": print_data.get("chamber_temper"),
                    "subtask_name": print_data.get("subtask_name"),
                    "gcode_file": print_data.get("gcode_file"),
                    "hms": print_data.get("hms"),
                    "nozzle_target_temp": print_data.get("nozzle_target_temper"),
                    "bed_target_temp": print_data.get("bed_target_temper"),
                    "cooling_fan_speed": print_data.get("cooling_fan_speed"),
                    "aux_fan_speed": print_data.get("big_fan1_speed"),
                    "chamber_fan_speed": print_data.get("big_fan2_speed"),
                    "speed_level": print_data.get("spd_lvl"),
                    "speed_mag": print_data.get("spd_mag"),
                    "wifi_signal": print_data.get("wifi_signal"),
                    "updated_at": int(time.time()),
                }
            log("info", "Idle", f"gcode_state={print_data.get('gcode_state')} progress={print_data.get('mc_percent')}%",
                printer_serial=credentials.serial, printer_name=credentials.name)
            got_response.set()
        except Exception:
            pass

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(credentials.ip, port=8883, keepalive=10)
        client.loop_start()
        got_response.wait(timeout=8)
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        log("error", "Idle", f"Poll failed: {e}",
            printer_serial=credentials.serial, printer_name=credentials.name)


def _idle_watchdog():
    """Background thread — polls idle registered printers every 60s."""
    while True:
        time.sleep(60)
        with _registry_lock:
            registered = dict(_printer_registry)
        with _monitors_lock:
            active_serials = set(_monitors.keys())

        for serial, credentials in registered.items():
            if serial not in active_serials:
                threading.Thread(target=_poll_idle_printer, args=(credentials,), daemon=True).start()


# Start idle watchdog on server startup
threading.Thread(target=_idle_watchdog, daemon=True).start()


class DeleteFileRequest(BaseModel):
    file_path: str  # absolute path on Pi disk


@app.delete("/file", dependencies=[Depends(verify_secret)])
def delete_file(req: DeleteFileRequest):
    """
    Delete a module file from Pi disk.
    Security: the path must be inside FILES_DIR to prevent arbitrary deletion.
    """
    try:
        target = Path(req.file_path).resolve()
        files_dir_resolved = FILES_DIR.resolve()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

    if not str(target).startswith(str(files_dir_resolved)):
        raise HTTPException(status_code=403, detail="Access denied: path outside FILES_DIR")

    deleted = False
    if target.exists():
        target.unlink()
        deleted = True
        log("info", "Files", f"Deleted {target.name}")
    else:
        log("info", "Files", f"Delete requested but file not found: {target.name}")

    return {"success": True, "deleted": deleted, "path": str(target)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)