"""
Bambu Lab P1S client — FTPS file upload + MQTT print command + status monitoring.

Credentials are passed per-call (stored in D1 per printer, sent by CF Workers).
This module is stateless with respect to printer config so one Pi can serve many printers.
"""

import ftplib
import json
import ssl
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

import paho.mqtt.client as mqtt


@dataclass
class PrinterCredentials:
    ip: str
    serial: str
    access_code: str


@dataclass
class PrintStatus:
    task_id: str
    stage: str = "idle"          # idle | slicing | printing | paused | failed | finish
    progress: int = 0            # 0-100
    layer_num: int = 0
    total_layer_num: int = 0
    gcode_state: str = ""        # IDLE | PREPARE | RUNNING | PAUSE | FAILED | FINISH
    error_code: int = 0
    raw: dict = field(default_factory=dict)


class ImplicitFTP_TLS(ftplib.FTP_TLS):
    """
    FTP_TLS subclass that wraps the socket with TLS immediately on connect
    (implicit TLS / port 990) rather than using AUTH TLS after connection.
    Bambu Lab printers require implicit TLS.
    """
    def storbinary(self, cmd, fp, blocksize=8192, callback=None, rest=None):
        """Override to ignore TLS close_notify timeout — Bambu servers don't send it."""
        self.voidcmd('TYPE I')
        with self.transfercmd(cmd, rest) as conn:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
                if callback:
                    callback(buf)
            try:
                conn.unwrap()
            except (TimeoutError, OSError):
                pass  # Bambu doesn't send TLS close_notify — safe to ignore
        return self.voidresp()

    def connect(self, host='', port=0, timeout=-999, source_address=None):
        # Call grandparent (FTP.connect) to set up the raw socket
        if timeout != -999:
            self.timeout = timeout
        if host:
            self.host = host
        if port:
            self.port = port

        import socket as _socket
        self.sock = _socket.create_connection(
            (self.host, self.port),
            self.timeout,
            source_address,
        )
        self.af = self.sock.family
        # Wrap immediately with TLS — no plain-text greeting
        self.sock = self.context.wrap_socket(self.sock, server_hostname=self.host)
        self.file = self.sock.makefile('r', encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome


def upload_file_ftps(credentials: PrinterCredentials, local_path: str, remote_filename: str) -> str:
    """
    Upload a .gcode.3mf file to the printer via FTPS (implicit TLS, port 990).
    Returns the remote path on the printer's virtual SD card.
    """
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # Bambu uses self-signed cert

    # FTP root on Bambu printers IS /sdcard/ — upload to cache/ subfolder
    remote_path = f"/cache/{remote_filename}"

    with ImplicitFTP_TLS(context=context) as ftp:
        ftp.connect(host=credentials.ip, port=990, timeout=30)
        ftp.login(user="bblp", passwd=credentials.access_code)
        ftp.prot_p()  # switch to encrypted data channel

        with open(local_path, "rb") as f:
            ftp.storbinary(f"STOR cache/{remote_filename}", f)

    return remote_path


def build_print_command(
    remote_path: str,
    task_id: str,
    bed_leveling: bool = True,
    vibration_calibration: bool = True,
    use_ams: bool = False,
    timelapse: bool = False,
) -> dict:
    """
    Build the MQTT 'project_file' print command payload.
    remote_path should be the FTPS path, e.g. /sdcard/Models/file.gcode.3mf
    """
    return {
        "print": {
            "sequence_id": "0",
            "command": "project_file",
            "param": "Metadata/plate_1.gcode",
            "url": f"ftp://{remote_path}",
            "subtask_id": "0",
            "profile_id": "0",
            "task_id": task_id,
            "project_id": "0",
            "bed_type": "auto",
            "bed_leveling": bed_leveling,
            "flow_cali": False,
            "vibration_cali": vibration_calibration,
            "layer_inspect": False,
            "use_ams": use_ams,
            "ams_mapping": [],
            "timelapse": timelapse,
        }
    }


class BambuMQTTClient:
    """
    Long-lived MQTT client for a single printer.
    Subscribes to status reports and calls on_status when updates arrive.
    """

    def __init__(
        self,
        credentials: PrinterCredentials,
        on_status: Optional[Callable[[PrintStatus], None]] = None,
    ):
        self.credentials = credentials
        self.on_status = on_status
        self.last_status: Optional[PrintStatus] = None
        self._client = mqtt.Client()
        self._connected = False
        self._lock = threading.Lock()

        self._client.username_pw_set("bblp", credentials.access_code)
        self._client.tls_set(cert_reqs=ssl.CERT_NONE)
        self._client.tls_insecure_set(True)

        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.on_disconnect = self._on_disconnect

    @property
    def report_topic(self) -> str:
        return f"device/{self.credentials.serial}/report"

    @property
    def request_topic(self) -> str:
        return f"device/{self.credentials.serial}/request"

    def connect(self):
        self._client.connect(self.credentials.ip, port=8883, keepalive=60)
        self._client.loop_start()

    def disconnect(self):
        self._client.loop_stop()
        self._client.disconnect()

    def publish(self, payload: dict):
        self._client.publish(self.request_topic, json.dumps(payload))

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            client.subscribe(self.report_topic)
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False

    def _on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode())
        except Exception:
            return

        print_data = data.get("print", {})
        if not print_data:
            return

        task_id = str(print_data.get("task_id", ""))
        status = PrintStatus(
            task_id=task_id,
            stage=print_data.get("mc_print_stage", ""),
            progress=int(print_data.get("mc_percent", 0)),
            layer_num=int(print_data.get("layer_num", 0)),
            total_layer_num=int(print_data.get("total_layer_num", 0)),
            gcode_state=print_data.get("gcode_state", ""),
            error_code=int(print_data.get("print_error", 0)),
            raw=print_data,
        )

        with self._lock:
            self.last_status = status

        if self.on_status:
            self.on_status(status)


def send_print_command(
    credentials: PrinterCredentials,
    remote_path: str,
    task_id: str,
    options: dict = None,
):
    """
    Send MQTT print command for an already-uploaded file.
    Designed to be called in a background thread.
    """
    options = options or {}
    cmd = build_print_command(
        remote_path=remote_path,
        task_id=task_id,
        bed_leveling=options.get("bed_leveling", True),
        vibration_calibration=options.get("vibration_calibration", True),
        use_ams=options.get("use_ams", False),
        timelapse=options.get("timelapse", False),
    )

    connected = threading.Event()
    client = mqtt.Client()
    client.username_pw_set("bblp", credentials.access_code)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)

    def on_connect(_c, _u, _f, rc):
        print(f"[MQTT] on_connect rc={rc}")
        if rc == 0:
            connected.set()

    client.on_connect = on_connect
    client.connect(credentials.ip, port=8883, keepalive=10)
    client.loop_start()

    if not connected.wait(timeout=15):
        client.loop_stop()
        print("[MQTT] Connection timed out — print command not sent")
        return

    client.publish(f"device/{credentials.serial}/request", json.dumps(cmd), qos=1)
    time.sleep(1)  # allow QoS 1 ack
    client.loop_stop()
    client.disconnect()
    print(f"[Bambu] Print command sent. task_id={task_id}")


def start_print(
    credentials: PrinterCredentials,
    local_path: str,
    remote_filename: str,
    options: dict = None,
) -> str:
    """
    High-level: upload file via FTPS then send MQTT print command.
    Returns task_id (UUID) that can be used to match webhook callbacks.
    """
    options = options or {}
    task_id = str(uuid.uuid4())

    remote_path = upload_file_ftps(credentials, local_path, remote_filename)
    print(f"[Bambu] Uploaded to {remote_path}")

    send_print_command(credentials, remote_path, task_id, options)
    return task_id
