#!/usr/bin/env python3
"""Native N2K Reticulum/LXMF runtime. Internal API: reachable only from N2K API."""
import json
import os
import threading
import time
import re
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
DELIVERY = None
LOCK = threading.RLock()
MESSAGES = STATE / 'messages.json'
CONTACTS = STATE / 'contacts.json'

def read_records(file):
    try:
        data = json.loads(file.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, ValueError, OSError):
        return []

def append_message(record):
    with LOCK:
        rows = read_records(MESSAGES)
        rows.append(record)
        temp = MESSAGES.with_suffix('.tmp')
        temp.write_text(json.dumps(rows[-500:], ensure_ascii=False), encoding='utf-8')
        temp.chmod(0o600)
        temp.replace(MESSAGES)

def on_delivery(message):
    try:
        append_message({'direction':'in', 'source':message.source_hash.hex(), 'content':str(message.content), 'time':int(time.time())})
    except Exception:
        pass


def start_stack():
    global ROUTER, IDENTITY, DELIVERY
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
        DELIVERY = ROUTER.register_delivery_identity(IDENTITY, display_name="Netfreak2k OS")
        ROUTER.register_delivery_callback(on_delivery)
        RUNTIME.update(online=True, identity=DELIVERY.hash.hex(), error=None)
    except Exception as exc:
        RUNTIME.update(online=False, error=str(exc)[:180])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/status":
            result = dict(RUNTIME)
        elif self.path == "/messages":
            result = {"messages":read_records(MESSAGES)}
        elif self.path == "/contacts":
            result = {"contacts":read_records(CONTACTS)}
        else:
            self.send_error(404)
            return
        body = json.dumps(result).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path not in ("/contacts", "/messages"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 8192:
                raise ValueError("invalid_size")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("invalid_payload")
            dest = str(payload.get("destination", "")).strip().lower()
            if not re.fullmatch(r"[0-9a-f]{32}", dest):
                raise ValueError("invalid_destination_hash")
            if self.path == "/contacts":
                name = str(payload.get("name", "")).strip()[:80]
                if not name:
                    raise ValueError("name_required")
                with LOCK:
                    contacts = [x for x in read_records(CONTACTS) if x.get("destination") != dest]
                    contacts.append({"destination":dest, "name":name})
                    temp = CONTACTS.with_suffix(".tmp")
                    temp.write_text(json.dumps(contacts), encoding="utf-8")
                    temp.chmod(0o600)
                    temp.replace(CONTACTS)
                result = {"saved":True}
            else:
                if not RUNTIME["online"] or ROUTER is None:
                    raise ValueError("reticulum_offline")
                content = str(payload.get("content", "")).strip()
                if not content or len(content) > 2048:
                    raise ValueError("invalid_content")
                identity = RNS.Identity.recall(bytes.fromhex(dest))
                if identity is None:
                    raise ValueError("destination_identity_unknown")
                destination = RNS.Destination(identity, RNS.Destination.OUT, RNS.Destination.SINGLE, "lxmf", "delivery")
                message = LXMF.LXMessage(destination, DELIVERY, content, desired_method=LXMF.LXMessage.DIRECT)
                # Identity/path resolution and delivery success are asynchronous.
                ROUTER.handle_outbound(message)
                append_message({"direction":"out","source":dest,"content":content,"time":int(time.time()),"status":"queued"})
                result = {"queued":True}
            self.send_result(result, 200)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_result({"error":str(exc)}, 400)
        except Exception:
            self.send_result({"error":"messenger_internal_error"}, 500)

    def send_result(self, result, status=200):
        body = json.dumps(result).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        return

if __name__ == "__main__":
    threading.Thread(target=start_stack, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 8091), Handler).serve_forever()
