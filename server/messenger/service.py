#!/usr/bin/env python3
"""Native N2K Reticulum/LXMF runtime. Internal API: reachable only from N2K API."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import RNS
import LXMF

STATE = Path("/state")
STATE.mkdir(parents=True, exist_ok=True)
STATE.chmod(0o700)
RUNTIME = {"online": False, "error": None, "identity": None, "transport": "Reticulum / LXMF"}
ROUTER = None
IDENTITY = None

def start_stack():
    global ROUTER, IDENTITY
    try:
        # Reticulum owns /state/rns, LXMF owns /state/lxmf. Never share a
        # Home Assistant add-on identity/database concurrently.
        rns_path = STATE / "rns"
        lxmf_path = STATE / "lxmf"
        rns_path.mkdir(exist_ok=True)
        lxmf_path.mkdir(exist_ok=True)
        RNS.Reticulum(configdir=str(rns_path))
        identity_file = STATE / "identity"
        if identity_file.exists():
            IDENTITY = RNS.Identity.from_file(str(identity_file))
            if IDENTITY is None:
                raise RuntimeError("identity_unreadable")
        else:
            IDENTITY = RNS.Identity()
            IDENTITY.to_file(str(identity_file))
        ROUTER = LXMF.LXMRouter(storagepath=str(lxmf_path))
        ROUTER.register_delivery_identity(IDENTITY, display_name="Netfreak2k OS")
        RUNTIME.update(online=True, identity=RNS.prettyhexrep(IDENTITY.hash), error=None)
    except Exception as exc:
        RUNTIME.update(online=False, error=str(exc)[:180])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status":
            self.send_error(404)
            return
        body = json.dumps(RUNTIME).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        return

if __name__ == "__main__":
    threading.Thread(target=start_stack, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 8091), Handler).serve_forever()
