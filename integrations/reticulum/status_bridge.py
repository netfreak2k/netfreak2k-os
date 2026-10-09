#!/usr/bin/env python3
"""Read-only Reticulum status adapter. Loopback only; not a public OS API."""
import json
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("N2K_RNS_STATUS_PORT", "18765"))
STATUS_TIMEOUT = 4
MAX_OUTPUT = 32768

def read_status():
    try:
        proc = subprocess.run(
            ["rnstatus"], capture_output=True, text=True,
            timeout=STATUS_TIMEOUT, check=False
        )
    except FileNotFoundError:
        return {"available": False, "connected": False, "state": "not_installed", "interfaces": []}
    except subprocess.TimeoutExpired:
        return {"available": False, "connected": False, "state": "timeout", "interfaces": []}
    except OSError:
        return {"available": False, "connected": False, "state": "unavailable", "interfaces": []}
    output = (proc.stdout or "")[:MAX_OUTPUT]
    if proc.returncode != 0:
        return {"available": False, "connected": False, "state": "service_unavailable", "interfaces": []}
    interfaces = []
    for line in output.splitlines():
        match = re.search(r"\b(Up|Down)\b\s+(.+?)\s*$", line)
        if match and ("Interface" in line or "[" in line):
            interfaces.append({"state": match.group(1).lower(), "label": match.group(2)[:120]})
    # A running local instance does not prove a remote network path.
    return {"available": True, "connected": None, "state": "local_instance_detected",
            "interfaces": interfaces, "note": "Remote connectivity not verified"}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status":
            self.send_error(404)
            return
        body = json.dumps(read_status(), ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_error(405)

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
