"""
Structured in-memory log buffer for the Pi bridge server.
Stores log entries in a ring buffer and provides filtered retrieval.
"""

import time
import threading
from collections import deque
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class LogEntry:
    timestamp: float
    level: str            # "info", "warning", "error"
    category: str         # "MQTT", "FTPS", "Print", "Webhook", "Idle", "3MF", "System"
    printer_serial: str   # "" for system-level logs
    printer_name: str     # "" for system-level logs
    message: str


_buffer: deque[LogEntry] = deque(maxlen=2000)
_lock = threading.Lock()


def log(
    level: str,
    category: str,
    message: str,
    printer_serial: str = "",
    printer_name: str = "",
):
    entry = LogEntry(
        timestamp=time.time(),
        level=level,
        category=category,
        printer_serial=printer_serial,
        printer_name=printer_name,
        message=message,
    )
    with _lock:
        _buffer.append(entry)
    # Also print to stdout for journalctl / uvicorn console
    display = printer_name or printer_serial or "system"
    print(f"[{category}] {display}: {message}")


def get_logs(
    printer: str = "",
    level: str = "",
    category: str = "",
    limit: int = 200,
    since: float = 0,
) -> list[dict]:
    with _lock:
        entries = list(_buffer)

    if printer:
        p = printer.lower()
        entries = [
            e for e in entries
            if e.printer_serial.lower() == p or e.printer_name.lower() == p
        ]
    if level:
        entries = [e for e in entries if e.level == level]
    if category:
        c = category.lower()
        entries = [e for e in entries if e.category.lower() == c]
    if since > 0:
        entries = [e for e in entries if e.timestamp > since]

    return [asdict(e) for e in entries[-limit:]]


def get_printers() -> list[dict]:
    """Return unique printers seen in logs."""
    with _lock:
        entries = list(_buffer)
    seen: dict[str, str] = {}
    for e in entries:
        if e.printer_serial and e.printer_serial not in seen:
            seen[e.printer_serial] = e.printer_name or e.printer_serial
    return [{"serial": s, "name": n} for s, n in seen.items()]
