#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import os
import platform
import re
import secrets
import sqlite3
import socket
import threading
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = os.environ.get("N2K_VERSION", "0.1.0-dev")
HOST_PROC = Path("/host/proc")
HOST_ETC = Path("/host/etc")
DATA_DIR = Path(os.environ.get("N2K_DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "netfreak2k.db"
APPS_FILE = Path(os.environ.get("N2K_APPS_FILE", "/inventory/apps.json"))
VM_AGENT_SOCKET = os.environ.get("N2K_VM_AGENT_SOCKET", "/run/netfreak2k/vm-agent.sock")
AGENT_TOKEN_FILE = Path(os.environ.get("N2K_AGENT_TOKEN_FILE", "/host/netfreak2k/agent.token"))
UPDATE_FILE = Path(os.environ.get("N2K_UPDATE_FILE", "/host/netfreak2k/update-status.json"))
SESSION_TTL = 12 * 60 * 60
MAX_BODY = 16 * 1024
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")

_sessions = {}
_sessions_lock = threading.Lock()


def db_connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def is_configured():
    with db_connect() as conn:
        row = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
    return row is not None


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310000, dklen=32)


def create_admin(username, password):
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("invalid_username")
    if len(password) < 10:
        raise ValueError("password_too_short")

    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)

    with db_connect() as conn:
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise ValueError("already_configured")
        conn.execute(
            "INSERT INTO users (username,password_hash,salt,created_at) VALUES (?,?,?,?)",
            (
                username,
                base64.b64encode(digest).decode("ascii"),
                base64.b64encode(salt).decode("ascii"),
                int(time.time()),
            ),
        )
        conn.commit()


def verify_login(username, password):
    with db_connect() as conn:
        row = conn.execute(
            "SELECT password_hash,salt FROM users WHERE username=?",
            (username,),
        ).fetchone()
    if not row:
        return False
    stored = base64.b64decode(row[0])
    salt = base64.b64decode(row[1])
    supplied = hash_password(password, salt)
    return hmac.compare_digest(stored, supplied)


def new_session(username):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    expires = int(time.time()) + SESSION_TTL
    with _sessions_lock:
        _sessions[token] = {"username": username, "csrf": csrf, "expires": expires}
    return token, csrf, expires


def get_session(token):
    if not token:
        return None
    now = int(time.time())
    with _sessions_lock:
        stale = [key for key, value in _sessions.items() if value["expires"] <= now]
        for key in stale:
            _sessions.pop(key, None)
        return _sessions.get(token)


def delete_session(token):
    if not token:
        return
    with _sessions_lock:
        _sessions.pop(token, None)


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


def apps_payload():
    try:
        payload = json.loads(APPS_FILE.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("invalid_inventory")
        return payload
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
        return {
            "available": False,
            "updated_at": None,
            "error": "inventory_unavailable",
            "containers": [],
        }


def vm_agent(action, extra=None):
    try:
        token = AGENT_TOKEN_FILE.read_text(encoding="utf-8").strip()
        if not token:
            return {"available": False, "error": "agent_token_unavailable"}
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        client.settimeout(360 if action in {"app_install", "backup_create"} else 8)
        client.connect(VM_AGENT_SOCKET)
        request = {"action": action, "token": token}
        if extra:
            request.update(extra)
        client.sendall((json.dumps(request) + "\n").encode("utf-8"))
        raw = b""
        while b"\n" not in raw and len(raw) < 65536:
            chunk = client.recv(65536)
            if not chunk:
                break
            raw += chunk
        client.close()
        result = json.loads(raw.decode("utf-8").strip() or "{}")
        if not result.get("ok"):
            return {"available": False, "error": result.get("error", "vm_agent_error")}
        data = result.get("data") or {}
        data["available"] = True
        return data
    except (OSError, ValueError, json.JSONDecodeError):
        return {"available": False, "installed": False, "state": "unavailable", "reachable": False}


def update_payload():
    try:
        payload = json.loads(UPDATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("invalid_update_status")
        payload["available"] = True
        return payload
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
        return {
            "available": False,
            "ok": False,
            "update_available": False,
            "note": "update_status_unavailable",
        }


def status_payload():
    hostname = read_text(HOST_ETC / "hostname") or platform.node() or "unknown"
    return {
        "product": "Netfreak2k Server-OS",
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
    def send_json(self, payload, status=200, extra_headers=None):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid_length")
        if length <= 0 or length > MAX_BODY:
            raise ValueError("invalid_body")
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("invalid_json")
        if not isinstance(value, dict):
            raise ValueError("invalid_json")
        return value

    def session_token(self):
        raw = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie()
        try:
            jar.load(raw)
        except cookies.CookieError:
            return None
        morsel = jar.get("n2k_session")
        return morsel.value if morsel else None

    def session(self):
        return get_session(self.session_token())

    def require_auth(self):
        session = self.session()
        if not session:
            self.send_json({"error": "authentication_required"}, 401)
            return None
        return session

    def require_csrf(self, session):
        provided = self.headers.get("X-CSRF-Token", "")
        if not provided or not hmac.compare_digest(provided, session["csrf"]):
            self.send_json({"error": "csrf_required"}, 403)
            return False
        return True

    def set_session_response(self, username):
        token, csrf, _ = new_session(username)
        cookie = (
            f"n2k_session={token}; Path=/; HttpOnly; SameSite=Strict; "
            f"Max-Age={SESSION_TTL}"
        )
        self.send_json(
            {"authenticated": True, "username": username, "csrf": csrf},
            200,
            {"Set-Cookie": cookie},
        )

    def do_GET(self):
        if self.path == "/healthz":
            self.send_json({"status": "ok"})
            return

        if self.path == "/setup":
            self.send_json({"configured": is_configured()})
            return

        if self.path == "/session":
            session = self.session()
            if not session:
                self.send_json({"authenticated": False}, 200)
                return
            self.send_json(
                {
                    "authenticated": True,
                    "username": session["username"],
                    "csrf": session["csrf"],
                }
            )
            return

        if self.path == "/status":
            if not self.require_auth():
                return
            self.send_json(status_payload())
            return

        if self.path == "/apps":
            if not self.require_auth():
                return
            self.send_json(apps_payload())
            return

        if self.path == "/homeassistant":
            if not self.require_auth():
                return
            self.send_json(vm_agent("status"))
            return

        if self.path == "/updates":
            if not self.require_auth():
                return
            self.send_json(update_payload())
            return

        if self.path == "/catalog":
            if not self.require_auth():
                return
            result = vm_agent("app_catalog")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/storage":
            if not self.require_auth():
                return
            result = vm_agent("storage_status")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/vms":
            if not self.require_auth():
                return
            result = vm_agent("vm_list")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/backups":
            if not self.require_auth():
                return
            result = vm_agent("backup_list")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        self.send_json({"error": "not_found"}, 404)

    def do_POST(self):
        if self.path == "/setup":
            if is_configured():
                self.send_json({"error": "already_configured"}, 409)
                return
            try:
                data = self.read_json()
                username = str(data.get("username", "")).strip()
                password = str(data.get("password", ""))
                create_admin(username, password)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            self.set_session_response(username)
            return

        if self.path == "/login":
            if not is_configured():
                self.send_json({"error": "setup_required"}, 409)
                return
            try:
                data = self.read_json()
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))
            if not verify_login(username, password):
                time.sleep(0.35)
                self.send_json({"error": "invalid_credentials"}, 401)
                return
            self.set_session_response(username)
            return

        if self.path == "/homeassistant/action":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            action = str(data.get("action", ""))
            if action not in {"start", "shutdown", "restart"}:
                self.send_json({"error": "invalid_action"}, 400)
                return
            result = vm_agent(action)
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/backups/create":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            result = vm_agent("backup_create")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result, 201)
            return

        if self.path == "/backups/restore":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            backup_id = str(data.get("backup_id", ""))
            result = vm_agent("backup_restore", {"backup_id": backup_id})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result, 202)
            return

        if self.path == "/catalog/install":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            app_id = str(data.get("app_id", ""))
            result = vm_agent("app_install", {"app_id": app_id})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result, 201)
            return

        if self.path == "/apps/action":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            action = str(data.get("action", ""))
            name = str(data.get("name", ""))
            mapping = {
                "start": "app_start",
                "stop": "app_stop",
                "restart": "app_restart",
            }
            if action not in mapping or not name:
                self.send_json({"error": "invalid_app_action"}, 400)
                return
            result = vm_agent(mapping[action], {"name": name})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/updates/check":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            result = vm_agent("check_updates")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if self.path == "/updates/install":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            result = vm_agent("update_netfreak2k")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result, 202)
            return

        if self.path == "/logout":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            token = self.session_token()
            delete_session(token)
            self.send_json(
                {"authenticated": False},
                200,
                {"Set-Cookie": "n2k_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"},
            )
            return

        self.send_json({"error": "not_found"}, 404)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    db_connect().close()
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
