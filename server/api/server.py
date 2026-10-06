#!/usr/bin/env python3
import json
import os
import platform
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = os.environ.get("N2K_VERSION", "0.1.0-dev")
HOST_PROC = Path("/host/proc")
HOST_ETC = Path("/host/etc")


def read_text(path, default=""):
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return default


def parse_os_release():
    data = {}
    text = read_text(HOST_ETC / "os-release")
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key] = value.strip().strip('"')
    return {
        "name": data.get("PRETTY_NAME") or data.get("NAME") or "Linux",
        "id": data.get("ID", "linux"),
        "version": data.get("VERSION_ID", ""),
    }


def parse_meminfo():
    values = {}
    text = read_text(HOST_PROC / "meminfo")
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        parts = raw.strip().split()
        if not parts:
            continue
        try:
            values[key] = int(parts[0]) * 1024
        except ValueError:
            pass

    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", 0)
    used = max(total - available, 0)
    percent = round((used / total) * 100, 1) if total else None
    return {
        "total_bytes": total,
        "used_bytes": used,
        "available_bytes": available,
        "used_percent": percent,
    }


def parse_uptime():
    raw = read_text(HOST_PROC / "uptime", "0")
    try:
        return int(float(raw.split()[0]))
    except (ValueError, IndexError):
        return 0


def parse_load():
    raw = read_text(HOST_PROC / "loadavg")
    parts = raw.split()
    if len(parts) < 3:
        return {"1m": None, "5m": None, "15m": None}
    try:
        return {"1m": float(parts[0]), "5m": float(parts[1]), "15m": float(parts[2])}
    except ValueError:
        return {"1m": None, "5m": None, "15m": None}


def status_payload():
    hostname = read_text(HOST_ETC / "hostname") or platform.node() or "unknown"
    return {
        "product": "Netfreak2k Server",
        "version": VERSION,
        "mode": "server-first",
        "read_only": True,
        "host": {
            "hostname": hostname,
            "os": parse_os_release(),
            "uptime_seconds": parse_uptime(),
            "memory": parse_meminfo(),
            "load": parse_load(),
        },
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self.send_json({"status": "ok"})
            return
        if self.path == "/status":
            self.send_json(status_payload())
            return
        self.send_json({"error": "not_found"}, 404)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
