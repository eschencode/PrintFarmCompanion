"""
Print Farm Companion — Pi Bridge Server
Runs on the Raspberry Pi, exposed via Cloudflare Tunnel.

Receives .gcode.3mf files and print commands from Cloudflare Workers,
then talks to Bambu Lab printers on the local network via FTPS + MQTT.
"""

import ftplib
import os
import ssl
import threading
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
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


@app.get("/ping-printer")
def ping_printer(ip: str, access_code: str, serial: str):
    """
    Quick connectivity test — tries FTPS login and MQTT connect without printing.
    Call: GET /ping-printer?ip=192.168.x.x&access_code=XXXX&serial=XXXX
    """
    import socket
    result = {"ip": ip, "serial": serial, "ftps": False, "mqtt": False, "errors": []}

    # Test FTPS port 990
    try:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with ftplib.FTP_TLS(context=context) as ftp:
            ftp.connect(host=ip, port=990, timeout=5)
            ftp.login(user="bblp", passwd=access_code)
            result["ftps"] = True
    except Exception as e:
        result["errors"].append(f"FTPS: {e}")

    # Test MQTT port 8883
    try:
        import paho.mqtt.client as mqtt
        connected = threading.Event()
        c = mqtt.Client()
        c.username_pw_set("bblp", access_code)
        c.tls_set(cert_reqs=ssl.CERT_NONE)
        c.tls_insecure_set(True)
        c.on_connect = lambda *_: connected.set()
        c.connect(ip, port=8883, keepalive=5)
        c.loop_start()
        result["mqtt"] = connected.wait(timeout=5)
        c.loop_stop()
        c.disconnect()
    except Exception as e:
        result["errors"].append(f"MQTT: {e}")

    return result


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

    print(f"[Print] file={req.file_path} ip={req.printer_ip} serial={req.printer_serial} access_code={'*'*4+req.printer_access_code[-2:] if req.printer_access_code else 'MISSING'}")

    credentials = PrinterCredentials(
        ip=req.printer_ip,
        serial=req.printer_serial,
        access_code=req.printer_access_code,
    )

    # 1. Upload file synchronously — must succeed before we return
    try:
        remote_path = upload_file_ftps(credentials, str(path), path.name)
        print(f"[Bambu] Uploaded to {remote_path}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"FTPS upload failed: {e}")

    # Inspect the local .3mf to find the correct internal gcode path and filament info
    gcode_param = _find_gcode_param(str(path))
    filament_info = _read_filament_info(str(path))
    print(f"[Print] Using gcode param: {gcode_param}, filament slots: {len(filament_info)}")

    task_id = str(uuid.uuid4())
    options = req.options or {}

    # 2. Send MQTT command + start monitor in background so HTTP response returns immediately
    def _send_and_monitor():
        try:
            send_print_command(credentials, remote_path, task_id, options, param=gcode_param, filament_info=filament_info)
        except Exception as e:
            print(f"[Print] MQTT error: {e}")
        _start_monitor(credentials, task_id)

    threading.Thread(target=_send_and_monitor, daemon=True).start()

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
