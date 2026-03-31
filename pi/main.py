"""
Print Farm Companion — Pi Bridge Server
Runs on the Raspberry Pi, exposed via Cloudflare Tunnel.

Receives .gcode.3mf files and print commands from Cloudflare Workers,
then talks to Bambu Lab printers on the local network via FTPS + MQTT.
"""

import os
import threading
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .bambu_client import BambuMQTTClient, PrinterCredentials, PrintStatus, start_print

load_dotenv()

FILES_DIR = Path(os.getenv("FILES_DIR", "/home/pi/printfarm/files"))
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")

FILES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PrintFarm Pi Bridge")

# Active MQTT monitors keyed by printer serial
_monitors: dict[str, BambuMQTTClient] = {}
_monitors_lock = threading.Lock()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "files_dir": str(FILES_DIR), "active_monitors": list(_monitors.keys())}


# ── File upload ───────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Receive a .gcode.3mf file from CF Workers and save it to disk.
    Returns the local file path so Workers can store it in D1 as pi_file_path.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename required")

    safe_name = Path(file.filename).name  # strip any path components
    dest = FILES_DIR / safe_name

    contents = await file.read()
    dest.write_bytes(contents)

    return {"success": True, "path": str(dest), "filename": safe_name, "size": len(contents)}


# ── Print ─────────────────────────────────────────────────────────────────────

class PrintRequest(BaseModel):
    file_path: str          # absolute path on Pi disk
    printer_ip: str
    printer_serial: str
    printer_access_code: str
    options: Optional[dict] = None


@app.post("/print")
def trigger_print(req: PrintRequest):
    """
    Upload file to printer via FTPS and send MQTT print command.
    Then start an MQTT monitor to stream status back to CF Workers via webhook.
    """
    path = Path(req.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    credentials = PrinterCredentials(
        ip=req.printer_ip,
        serial=req.printer_serial,
        access_code=req.printer_access_code,
    )

    try:
        task_id = start_print(
            credentials=credentials,
            local_path=str(path),
            remote_filename=path.name,
            options=req.options or {},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Print failed: {e}")

    # Start MQTT status monitor in background
    _start_monitor(credentials, task_id)

    return {"success": True, "task_id": task_id}


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/status/{serial}")
def get_status(serial: str):
    """Return the last known status snapshot for a printer by serial number."""
    with _monitors_lock:
        monitor = _monitors.get(serial)

    if not monitor:
        return {"serial": serial, "connected": False, "status": None}

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
        } if status else None,
    }


# ── Cancel ────────────────────────────────────────────────────────────────────

class CancelRequest(BaseModel):
    printer_ip: str
    printer_serial: str
    printer_access_code: str


@app.post("/cancel")
def cancel_print(req: CancelRequest):
    """Send MQTT stop command to the printer."""
    import json, paho.mqtt.client as mqtt, ssl, time

    cmd = {"print": {"sequence_id": "0", "command": "stop", "param": ""}}
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
        raise HTTPException(status_code=500, detail=f"Cancel failed: {e}")

    return {"success": True}


# ── Internal: MQTT monitor ────────────────────────────────────────────────────

def _start_monitor(credentials: PrinterCredentials, task_id: str):
    """Start a background MQTT monitor for a printer. Sends webhooks to CF Workers."""

    def on_status(status: PrintStatus):
        if not WEBHOOK_URL:
            return

        # Map Bambu gcode_state to our status values
        state_map = {
            "FINISH": "success",
            "FAILED": "failed",
            "RUNNING": "printing",
            "PREPARE": "printing",
            "PAUSE": "paused",
        }
        mapped = state_map.get(status.gcode_state, "printing")

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
            requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=5)
        except Exception as e:
            print(f"[Webhook] Failed to send: {e}")

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
            print(f"[MQTT] Monitor failed for {credentials.serial}: {e}")

    threading.Thread(target=run, daemon=True).start()


def _stop_monitor(serial: str):
    with _monitors_lock:
        monitor = _monitors.pop(serial, None)
    if monitor:
        monitor.disconnect()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
