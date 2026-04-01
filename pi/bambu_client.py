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
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
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

    file_size = Path(local_path).stat().st_size
    print(f"[FTPS] Connecting to {credentials.ip}:990 ... file size: {file_size} bytes ({file_size/1024/1024:.1f} MB)")

    with ImplicitFTP_TLS(context=context) as ftp:
        ftp.connect(host=credentials.ip, port=990, timeout=30)
        print(f"[FTPS] Connected — logging in as bblp ...")
        ftp.login(user="bblp", passwd=credentials.access_code)
        ftp.prot_p()  # switch to encrypted data channel

        # Try upload directories in order — different Bambu models use different paths
        # P1S/X1C use cache/, A1/H2S may use model/ or root
        for subdir in ["cache", "model", ""]:
            stor_cmd = f"STOR {subdir}/{remote_filename}" if subdir else f"STOR {remote_filename}"
            remote_path = f"/{subdir}/{remote_filename}" if subdir else f"/{remote_filename}"
            print(f"[FTPS] Trying {stor_cmd} ...")
            try:
                with open(local_path, "rb") as f:
                    ftp.storbinary(stor_cmd, f)
                print(f"[FTPS] Upload complete → {remote_path}")
                return remote_path
            except ftplib.error_perm as e:
                if "553" in str(e):
                    print(f"[FTPS] 553 on {subdir or 'root'}, trying next ...")
                    continue
                raise

    raise RuntimeError(f"FTPS upload failed: no writable directory found on {credentials.ip}")


def _find_gcode_param(local_path: str) -> str:
    """Inspect the .3mf zip archive and return the internal gcode path for the MQTT param field."""
    try:
        with zipfile.ZipFile(local_path, 'r') as z:
            names = z.namelist()
            print(f"[3MF] Internal paths: {names}")
            for name in names:
                if name.startswith("Metadata/plate_") and name.endswith(".gcode"):
                    print(f"[3MF] Found gcode at: {name}")
                    return name
            for name in names:
                if name.endswith(".gcode"):
                    print(f"[3MF] Fallback gcode at: {name}")
                    return name
    except Exception as e:
        print(f"[3MF] Could not read archive: {e}")
    print(f"[3MF] No gcode found — using default Metadata/plate_1.gcode")
    return "Metadata/plate_1.gcode"


def _read_filament_info(local_path: str) -> list:
    """
    Read filament_sequence.json from the .3mf archive.
    Returns a list of filament dicts, or empty list if not found.
    Used to build the correct ams_mapping for the MQTT print command.
    """
    try:
        with zipfile.ZipFile(local_path, 'r') as z:
            if 'Metadata/filament_sequence.json' in z.namelist():
                data = json.loads(z.read('Metadata/filament_sequence.json').decode())
                print(f"[3MF] filament_sequence.json: {json.dumps(data)}")
                return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[3MF] Could not read filament_sequence.json: {e}")
    return []


def _build_ams_mapping(filament_info: list, use_ams: bool) -> list:
    """
    Build the ams_mapping array for the MQTT print command.
    For external spool (use_ams=False): maps each filament slot to the virtual
    external spool (ams=255, slot=255 in Bambu's protocol).
    For AMS (use_ams=True): maps filaments to their assigned AMS slots.
    """
    if not use_ams:
        # External spool: map every filament in the print to virtual external spool
        count = max(len(filament_info), 1)
        mapping = [{"ams": 255, "slot": 255} for _ in range(count)]
        print(f"[3MF] External spool ams_mapping: {mapping}")
        return mapping
    # AMS: use provided filament info to build slot mapping
    mapping = []
    for i, f in enumerate(filament_info):
        mapping.append({"ams": f.get("ams_id", 0), "slot": f.get("slot_id", i)})
    print(f"[3MF] AMS ams_mapping: {mapping}")
    return mapping


def build_print_command(
    printer_ip: str,
    remote_path: str,
    task_id: str,
    param: str = "Metadata/plate_1.gcode",
    ams_mapping: list = None,
    bed_leveling: bool = True,
    vibration_calibration: bool = True,
    use_ams: bool = False,
    timelapse: bool = False,
) -> dict:
    """
    Build the MQTT 'project_file' print command payload.
    remote_path is the path on the printer, e.g. /cache/file.gcode.3mf
    Uses file:///sdcard/ scheme (not ftp://) which works with subdirectories on P1S.
    """
    # Convert absolute path to file:// URL for local printer filesystem
    url = f"file:///sdcard{remote_path}"
    print(f"[MQTT] Building print command: url={url} param={param} task_id={task_id}")
    print(f"[MQTT] Options: bed_leveling={bed_leveling} vibration_cali={vibration_calibration} use_ams={use_ams} timelapse={timelapse}")
    return {
        "print": {
            "sequence_id": str(int(time.time())),
            "command": "project_file",
            "param": param,
            "url": url,
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
            "ams_mapping": ams_mapping if ams_mapping is not None else [],
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
    param: str = "Metadata/plate_1.gcode",
    filament_info: list = None,
):
    """
    Send MQTT print command for an already-uploaded file.
    Designed to be called in a background thread.
    """
    options = options or {}
    use_ams = options.get("use_ams", False)
    print(f"[MQTT] send_print_command start — ip={credentials.ip} serial={credentials.serial} remote_path={remote_path} param={param} use_ams={use_ams}")

    ams_mapping = _build_ams_mapping(filament_info or [], use_ams)

    cmd = build_print_command(
        printer_ip=credentials.ip,
        remote_path=remote_path,
        task_id=task_id,
        param=param,
        ams_mapping=ams_mapping,
        bed_leveling=options.get("bed_leveling", True),
        vibration_calibration=options.get("vibration_calibration", True),
        use_ams=use_ams,
        timelapse=options.get("timelapse", False),
    )
    print(f"[MQTT] Full command payload: {json.dumps(cmd)}")

    connected = threading.Event()
    client = mqtt.Client()
    client.username_pw_set("bblp", credentials.access_code)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)

    report_topic = f"device/{credentials.serial}/report"

    def on_connect(_c, _u, _f, rc):
        print(f"[MQTT] on_connect rc={rc}")
        if rc == 0:
            connected.set()
        else:
            print(f"[MQTT] Connection refused — rc={rc} (1=bad protocol, 2=bad client id, 3=server unavailable, 4=bad credentials, 5=not authorised)")

    def on_publish(_c, _u, mid):
        print(f"[MQTT] on_publish mid={mid} — message delivered to broker")

    def on_disconnect(_c, _u, rc):
        print(f"[MQTT] on_disconnect rc={rc}")

    def on_message(_c, _u, msg):
        try:
            data = json.loads(msg.payload.decode())
            print_data = data.get("print", {})
            print(f"[MQTT] Printer response: gcode_state={print_data.get('gcode_state')} "
                  f"print_error={print_data.get('print_error')} "
                  f"mc_print_stage={print_data.get('mc_print_stage')} "
                  f"full={json.dumps(print_data)[:400]}")
        except Exception as e:
            print(f"[MQTT] Could not parse response: {e} raw={msg.payload[:200]}")

    client.on_connect = on_connect
    client.on_publish = on_publish
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    print(f"[MQTT] Connecting to {credentials.ip}:8883 ...")
    client.connect(credentials.ip, port=8883, keepalive=10)
    client.loop_start()
    print(f"[MQTT] loop_start done — waiting for on_connect (timeout=15s) ...")

    if not connected.wait(timeout=15):
        client.loop_stop()
        print("[MQTT] Connection timed out after 15s — print command NOT sent")
        return

    print(f"[MQTT] Subscribing to {report_topic} to capture printer response ...")
    client.subscribe(report_topic)

    # Request a full status push to see current printer state before sending print command
    pushall = {"pushing": {"sequence_id": str(int(time.time())), "command": "pushall"}}
    topic = f"device/{credentials.serial}/request"
    print(f"[MQTT] Sending pushall to get full printer state ...")
    client.publish(topic, json.dumps(pushall), qos=0)
    time.sleep(2)  # give printer time to respond with full push_status (msg:0)

    payload = json.dumps(cmd)
    print(f"[MQTT] Publishing print command to topic={topic} payload_len={len(payload)} qos=0")
    client.publish(topic, payload, qos=0)
    print(f"[MQTT] Waiting 5s for printer response ...")
    time.sleep(5)
    print(f"[MQTT] loop_stop ...")
    client.loop_stop()
    client.disconnect()
    print(f"[Bambu] Print command sent successfully. task_id={task_id}")


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
