#!/usr/bin/env python3
"""Local development preview for the Reticulum UI; NOT a production OS gateway.

Binds only to 127.0.0.1. Serves the isolated prototype and forwards a read-only
status request to the local Reticulum status adapter without exposing it publicly.
"""
import json
import os
import pathlib
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parents[2]
HTML = HERE / "prototypes" / "reticulum" / "index.html"
HOST = "127.0.0.1"
PORT = int(os.environ.get("N2K_RNS_PREVIEW_PORT", "18766"))
ADAPTER = "http://127.0.0.1:18765/status"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            try:
                body = HTML.read_bytes()
            except OSError:
                self.send_error(503, "Preview unavailable")
                return
            mime = "text/html; charset=utf-8"
        elif self.path == "/api/reticulum/status":
            try:
                with urllib.request.urlopen(ADAPTER, timeout=5) as response:
                    body = response.read(65536)
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ValueError("invalid adapter response")
                body = json.dumps(data).encode("utf-8")
            except (urllib.error.URLError, TimeoutError, ValueError, OSError):
                body = json.dumps({"available": False, "connected": False, "state": "adapter_unavailable", "interfaces": []}).encode()
            mime = "application/json; charset=utf-8"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_error(405)

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
