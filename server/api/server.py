#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import platform
import re
import secrets
import sqlite3
import socket
import shutil
import threading
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

VERSION = os.environ.get("N2K_VERSION", "0.1.0-dev")
HOST_PROC = Path("/host/proc")
HOST_ETC = Path("/host/etc")
DATA_DIR = Path(os.environ.get("N2K_DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "netfreak2k.db"
APPS_FILE = Path(os.environ.get("N2K_APPS_FILE", "/inventory/apps.json"))
VM_AGENT_SOCKET = os.environ.get("N2K_VM_AGENT_SOCKET", "/run/netfreak2k/vm-agent.sock")
AGENT_TOKEN_FILE = Path(os.environ.get("N2K_AGENT_TOKEN_FILE", "/host/netfreak2k/agent.token"))
UPDATE_FILE = Path(os.environ.get("N2K_UPDATE_FILE", "/host/netfreak2k/update-status.json"))
WORKSPACE_ROOT = Path(os.environ.get("N2K_WORKSPACE_ROOT", "/workspace"))
WORKSPACE_AREAS = {
    "documents": "Dokumente",
    "media": "Bilder & Videos",
    "audio": "Audio",
    "downloads": "Downloads",
    "personal": "Persönlich",
    "trash": "Papierkorb",
}
MAX_UPLOAD = 250 * 1024 * 1024
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            start_at INTEGER NOT NULL,
            end_at INTEGER,
            notes TEXT NOT NULL DEFAULT '',
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


def ensure_workspace(username):
    base = WORKSPACE_ROOT / "users" / username
    base.mkdir(parents=True, exist_ok=True)
    for folder in WORKSPACE_AREAS.values():
        (base / folder).mkdir(exist_ok=True)
    (WORKSPACE_ROOT / "shared").mkdir(parents=True, exist_ok=True)
    return base


def safe_relative(value):
    raw = unquote(str(value or "")).strip().replace("\\", "/")
    if raw.startswith("/") or "\x00" in raw:
        raise ValueError("invalid_path")
    parts = [part for part in raw.split("/") if part not in ("", ".")]
    if any(part == ".." for part in parts):
        raise ValueError("invalid_path")
    return Path(*parts) if parts else Path()


def workspace_base(username, area):
    if area == "shared":
        ensure_workspace(username)
        return WORKSPACE_ROOT / "shared"
    folder = WORKSPACE_AREAS.get(area)
    if not folder:
        raise ValueError("invalid_area")
    return ensure_workspace(username) / folder


def workspace_target(username, area, rel=""):
    base = workspace_base(username, area)
    relative = safe_relative(rel)
    target = (base / relative).resolve()
    resolved_base = base.resolve()
    if target != resolved_base and resolved_base not in target.parents:
        raise ValueError("invalid_path")
    return base, target


def workspace_list(username, area, rel=""):
    _, target = workspace_target(username, area, rel)
    if not target.exists() or not target.is_dir():
        raise ValueError("folder_not_found")
    items = []
    for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if entry.name.startswith("."):
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        items.append({
            "name": entry.name,
            "type": "folder" if entry.is_dir() else "file",
            "size_bytes": None if entry.is_dir() else stat.st_size,
            "modified_at": int(stat.st_mtime),
        })
    return {"area": area, "path": str(safe_relative(rel)), "items": items}


def workspace_mkdir(username, area, rel, name):
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise ValueError("invalid_name")
    _, parent = workspace_target(username, area, rel)
    if not parent.is_dir():
        raise ValueError("folder_not_found")
    target = parent / name
    target.mkdir(exist_ok=False)
    return {"created": True, "name": name}


def workspace_delete(username, area, rel, name):
    if not name or "/" in name or "\\" in name:
        raise ValueError("invalid_name")
    _, parent = workspace_target(username, area, rel)
    target = (parent / name).resolve()
    base = workspace_base(username, area).resolve()
    if base not in target.parents:
        raise ValueError("invalid_path")
    if not target.exists():
        raise ValueError("not_found")

    if area == "trash":
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"deleted": True, "permanent": True}

    trash = ensure_workspace(username) / WORKSPACE_AREAS["trash"]
    stamp = int(time.time())
    destination = trash / f"{stamp}-{target.name}"
    shutil.move(str(target), str(destination))
    return {"deleted": True, "permanent": False}


def calendar_payload(username):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,title,start_at,end_at,notes FROM calendar_events WHERE username=? ORDER BY start_at ASC",
            (username,),
        ).fetchall()
    return {
        "events": [
            {"id": row[0], "title": row[1], "start_at": row[2], "end_at": row[3], "notes": row[4]}
            for row in rows
        ]
    }


def calendar_create(username, title, start_at, end_at=None, notes=""):
    title = str(title).strip()
    if not title or len(title) > 160:
        raise ValueError("invalid_title")
    try:
        start_at = int(start_at)
        end_at = int(end_at) if end_at not in (None, "") else None
    except (TypeError, ValueError):
        raise ValueError("invalid_time")
    if end_at is not None and end_at < start_at:
        raise ValueError("invalid_time")
    notes = str(notes)[:2000]
    with db_connect() as conn:
        cur = conn.execute(
            "INSERT INTO calendar_events (username,title,start_at,end_at,notes,created_at) VALUES (?,?,?,?,?,?)",
            (username, title, start_at, end_at, notes, int(time.time())),
        )
        conn.commit()
        event_id = cur.lastrowid
    return {"created": True, "id": event_id}


def calendar_delete(username, event_id):
    try:
        event_id = int(event_id)
    except (TypeError, ValueError):
        raise ValueError("invalid_event")
    with db_connect() as conn:
        cur = conn.execute("DELETE FROM calendar_events WHERE id=? AND username=?", (event_id, username))
        conn.commit()
    if cur.rowcount != 1:
        raise ValueError("event_not_found")
    return {"deleted": True}


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

    def send_file(self, path, download=False):
        path = Path(path)
        if not path.is_file():
            self.send_json({"error": "not_found"}, 404)
            return
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        disposition = "attachment" if download else "inline"
        safe_name = path.name.replace('"', "")
        self.send_header("Content-Disposition", f'{disposition}; filename="{safe_name}"')
        self.end_headers()
        with path.open("rb") as handle:
            shutil.copyfileobj(handle, self.wfile, length=1024 * 1024)

    def read_binary(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid_length")
        if length <= 0 or length > MAX_UPLOAD:
            raise ValueError("invalid_upload_size")
        return self.rfile.read(length)

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
        ensure_workspace(username)
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
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/healthz":
            self.send_json({"status": "ok"})
            return

        if path == "/setup":
            self.send_json({"configured": is_configured()})
            return

        if path == "/session":
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

        if path == "/status":
            if not self.require_auth():
                return
            self.send_json(status_payload())
            return

        if path == "/apps":
            if not self.require_auth():
                return
            self.send_json(apps_payload())
            return

        if path == "/homeassistant":
            if not self.require_auth():
                return
            self.send_json(vm_agent("status"))
            return

        if path == "/updates":
            if not self.require_auth():
                return
            self.send_json(update_payload())
            return

        if path == "/catalog":
            if not self.require_auth():
                return
            result = vm_agent("app_catalog")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/storage":
            if not self.require_auth():
                return
            result = vm_agent("storage_status")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/vms":
            if not self.require_auth():
                return
            result = vm_agent("vm_list")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/backups":
            if not self.require_auth():
                return
            result = vm_agent("backup_list")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/workspace":
            session = self.require_auth()
            if not session:
                return
            try:
                area = (query.get("area") or ["documents"])[0]
                rel = (query.get("path") or [""])[0]
                self.send_json(workspace_list(session["username"], area, rel))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/file":
            session = self.require_auth()
            if not session:
                return
            try:
                area = (query.get("area") or ["documents"])[0]
                rel = (query.get("path") or [""])[0]
                name = (query.get("name") or [""])[0]
                if not name or "/" in name or "\\" in name:
                    raise ValueError("invalid_name")
                _, parent = workspace_target(session["username"], area, rel)
                target = (parent / name).resolve()
                base = workspace_base(session["username"], area).resolve()
                if base not in target.parents:
                    raise ValueError("invalid_path")
                download = (query.get("download") or ["0"])[0] == "1"
                self.send_file(target, download=download)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/calendar":
            session = self.require_auth()
            if not session:
                return
            self.send_json(calendar_payload(session["username"]))
            return

        self.send_json({"error": "not_found"}, 404)

    def do_POST(self):
        if path == "/setup":
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

        if path == "/login":
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

        if path == "/workspace/upload":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                area = (query.get("area") or ["documents"])[0]
                rel = (query.get("path") or [""])[0]
                name = (query.get("name") or [""])[0]
                if not name or name in {".", ".."} or "/" in name or "\\" in name:
                    raise ValueError("invalid_name")
                _, parent = workspace_target(session["username"], area, rel)
                if not parent.is_dir():
                    raise ValueError("folder_not_found")
                target = parent / name
                if target.exists():
                    raise ValueError("already_exists")
                payload = self.read_binary()
                target.write_bytes(payload)
                self.send_json({"uploaded": True, "name": name, "size_bytes": len(payload)}, 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/mkdir":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(
                    workspace_mkdir(
                        session["username"],
                        str(data.get("area", "documents")),
                        str(data.get("path", "")),
                        str(data.get("name", "")).strip(),
                    ),
                    201,
                )
            except (ValueError, FileExistsError) as exc:
                self.send_json({"error": str(exc) or "already_exists"}, 400)
            return

        if path == "/workspace/delete":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(workspace_delete(
                    session["username"],
                    str(data.get("area", "documents")),
                    str(data.get("path", "")),
                    str(data.get("name", "")).strip(),
                ))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/calendar/create":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(calendar_create(
                    session["username"],
                    data.get("title", ""),
                    data.get("start_at"),
                    data.get("end_at"),
                    data.get("notes", ""),
                ), 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/calendar/delete":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(calendar_delete(session["username"], data.get("id")))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/homeassistant/action":
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

        if path == "/backups/create":
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

        if path == "/backups/restore":
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

        if path == "/catalog/install":
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

        if path == "/apps/action":
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

        if path == "/updates/check":
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

        if path == "/updates/install":
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

        if path == "/logout":
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
