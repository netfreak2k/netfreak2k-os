#!/usr/bin/env python3
import base64
import calendar
import hashlib
import hmac
import ipaddress
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
import email.utils
import xml.sax.saxutils
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

try:
    from mutagen import File as MutagenFile
except Exception:
    MutagenFile = None

VERSION = os.environ.get("N2K_VERSION", "0.1.0-dev")
HOST_PROC = Path("/host/proc")
HOST_ETC = Path("/host/etc")
HOST_SYS = Path(os.environ.get("N2K_SYS_ROOT", "/host/sys"))
DATA_DIR = Path(os.environ.get("N2K_DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "netfreak2k.db"
APPS_FILE = Path(os.environ.get("N2K_APPS_FILE", "/inventory/apps.json"))
VM_AGENT_SOCKET = os.environ.get("N2K_VM_AGENT_SOCKET", "/run/netfreak2k/vm-agent.sock")
AGENT_TOKEN_FILE = Path(os.environ.get("N2K_AGENT_TOKEN_FILE", "/host/netfreak2k/agent.token"))
UPDATE_FILE = Path(os.environ.get("N2K_UPDATE_FILE", "/host/netfreak2k/update-status.json"))
UPDATE_PROGRESS_FILE = Path(os.environ.get("N2K_UPDATE_PROGRESS_FILE", "/host/netfreak2k/update-progress.json"))
VERSION_FILE = Path(os.environ.get("N2K_VERSION_FILE", "/host/netfreak2k/version.json"))
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
MEDIA_AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".weba"}
SESSION_TTL = 12 * 60 * 60
MAX_BODY = 16 * 1024
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")

_sessions = {}
_sessions_lock = threading.Lock()
_telemetry_lock = threading.Lock()
_cpu_sample = None
_net_sample = None
_network_enrichment = {"at": 0.0, "data": {}}
_ping_cache = {"at": 0.0, "value": None}
_radio_cache = {}
_radio_cache_lock = threading.Lock()
_radio_meta_cache = {}
_radio_meta_cache_lock = threading.Lock()
_media_meta_cache = {}
_media_meta_cache_lock = threading.Lock()


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
            created_at INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            enabled INTEGER NOT NULL DEFAULT 1,
            totp_secret TEXT,
            totp_enabled INTEGER NOT NULL DEFAULT 0,
            last_login_at INTEGER
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS share_links (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            area TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            name TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS favorites (
            username TEXT NOT NULL,
            area TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (username, area, rel_path, name)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS file_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            area TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            name TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            label TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            revoked_at INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            csrf TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            user_agent TEXT NOT NULL DEFAULT '',
            remote_addr TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            remote_addr TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at DESC)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_preferences (
            username TEXT NOT NULL,
            pref_key TEXT NOT NULL,
            pref_value TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (username, pref_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS health_samples (
            sampled_at INTEGER PRIMARY KEY,
            cpu_percent REAL,
            ram_percent REAL,
            storage_percent REAL,
            temperature_c REAL,
            load_1m REAL,
            network_down_bps REAL,
            network_up_bps REAL,
            health_score INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_health_samples_time ON health_samples(sampled_at)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL UNIQUE,
            source TEXT NOT NULL,
            level TEXT NOT NULL,
            title TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            target TEXT NOT NULL DEFAULT '',
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            read_at INTEGER,
            resolved_at INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications(active, last_seen DESC)")
    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "role" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'")
        conn.execute("UPDATE users SET role='admin' WHERE id=(SELECT MIN(id) FROM users)")
    if "enabled" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1")
    if "totp_secret" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT")
    if "totp_enabled" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0")
    if "last_login_at" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN last_login_at INTEGER")
    session_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    if "user_agent" not in session_columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''")
    if "remote_addr" not in session_columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN remote_addr TEXT NOT NULL DEFAULT ''")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(calendar_events)").fetchall()}
    if "uid" not in columns:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN uid TEXT")
    if "updated_at" not in columns:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN updated_at INTEGER")
    if "raw_ics" not in columns:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN raw_ics TEXT")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_uid ON calendar_events(username, uid)")
    legacy = conn.execute("SELECT id,username,title,start_at,end_at,notes FROM calendar_events WHERE uid IS NULL OR uid=''").fetchall()
    for row in legacy:
        uid = f"legacy-{row[0]}@netfreak2k"
        raw_ics = build_ics_event(uid, row[2], row[3], row[4], row[5]) if "build_ics_event" in globals() else None
        conn.execute(
            "UPDATE calendar_events SET uid=?,updated_at=COALESCE(updated_at,created_at),raw_ics=COALESCE(raw_ics,?) WHERE id=?",
            (uid, raw_ics, row[0]),
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
            "INSERT INTO users (username,password_hash,salt,created_at,role,enabled) VALUES (?,?,?,?,?,1)",
            (
                username,
                base64.b64encode(digest).decode("ascii"),
                base64.b64encode(salt).decode("ascii"),
                int(time.time()),
                "admin",
            ),
        )
        conn.commit()


def user_auth_record(username):
    with db_connect() as conn:
        row = conn.execute(
            "SELECT password_hash,salt,role,enabled,totp_secret,totp_enabled,last_login_at FROM users WHERE username=?",
            (username,),
        ).fetchone()
    if not row:
        return None
    return {"password_hash": row[0], "salt": row[1], "role": row[2] or "viewer",
            "enabled": bool(row[3]), "totp_secret": row[4], "totp_enabled": bool(row[5]),
            "last_login_at": row[6]}


def verify_login(username, password):
    record = user_auth_record(username)
    if not record or not record["enabled"]:
        return False
    stored = base64.b64decode(record["password_hash"])
    salt = base64.b64decode(record["salt"])
    supplied = hash_password(password, salt)
    return hmac.compare_digest(stored, supplied)


def totp_code(secret, at=None):
    at = int(at or time.time())
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    counter = (at // 30).to_bytes(8, "big")
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 15
    value = int.from_bytes(digest[offset:offset + 4], "big") & 0x7fffffff
    return f"{value % 1000000:06d}"


def verify_totp(secret, code):
    code = re.sub(r"\s+", "", str(code or ""))
    if not re.fullmatch(r"\d{6}", code):
        return False
    now = int(time.time())
    return any(hmac.compare_digest(totp_code(secret, now + drift), code) for drift in (-30, 0, 30))


def audit_event(username, action, detail="", remote_addr=""):
    with db_connect() as conn:
        conn.execute(
            "INSERT INTO audit_log (username,action,detail,remote_addr,created_at) VALUES (?,?,?,?,?)",
            (str(username or "system")[:64], str(action)[:100], str(detail or "")[:500], str(remote_addr or "")[:80], int(time.time())),
        )
        conn.execute("DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT 1000)")
        conn.commit()


def session_token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session(username, user_agent="", remote_addr=""):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = int(time.time())
    expires = now + SESSION_TTL
    token_hash = session_token_hash(token)
    with db_connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
        conn.execute(
            "INSERT INTO sessions (token_hash,username,csrf,expires_at,created_at,user_agent,remote_addr) VALUES (?,?,?,?,?,?,?)",
            (token_hash, username, csrf, expires, now, str(user_agent or "")[:250], str(remote_addr or "")[:80]),
        )
        conn.execute("UPDATE users SET last_login_at=? WHERE username=?", (now, username))
        conn.commit()
    return token, csrf, expires


def get_session(token):
    if not token:
        return None
    now = int(time.time())
    token_hash = session_token_hash(token)
    with db_connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
        row = conn.execute(
            """SELECT s.username,s.csrf,s.expires_at,u.role,u.enabled,s.created_at,s.user_agent,s.remote_addr
               FROM sessions s JOIN users u ON u.username=s.username WHERE s.token_hash=?""",
            (token_hash,),
        ).fetchone()
        conn.commit()
    if not row or not bool(row[4]):
        return None
    return {"username": row[0], "csrf": row[1], "expires": row[2], "role": row[3] or "viewer",
            "created_at": row[5], "user_agent": row[6], "remote_addr": row[7]}


def delete_session(token):
    if not token:
        return
    token_hash = session_token_hash(token)
    with db_connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        conn.commit()


def security_payload(username):
    with db_connect() as conn:
        current = conn.execute("SELECT role,totp_enabled,last_login_at FROM users WHERE username=?", (username,)).fetchone()
        role = current[0] if current else "viewer"
        users = conn.execute("SELECT username,role,enabled,totp_enabled,created_at,last_login_at FROM users ORDER BY created_at").fetchall() if role == "admin" else []
        sessions = conn.execute("SELECT token_hash,username,expires_at,created_at,user_agent,remote_addr FROM sessions WHERE expires_at>? ORDER BY created_at DESC", (int(time.time()),)).fetchall()
        if role != "admin":
            sessions = [row for row in sessions if row[1] == username]
        audit = conn.execute("SELECT id,username,action,detail,remote_addr,created_at FROM audit_log ORDER BY created_at DESC LIMIT 100").fetchall() if role == "admin" else []
    return {
        "me": {"username": username, "role": role, "totp_enabled": bool(current[1]) if current else False, "last_login_at": current[2] if current else None},
        "users": [{"username": r[0], "role": r[1], "enabled": bool(r[2]), "totp_enabled": bool(r[3]), "created_at": r[4], "last_login_at": r[5]} for r in users],
        "sessions": [{"id": r[0][:16], "username": r[1], "expires_at": r[2], "created_at": r[3], "user_agent": r[4], "remote_addr": r[5]} for r in sessions],
        "audit": [{"id": r[0], "username": r[1], "action": r[2], "detail": r[3], "remote_addr": r[4], "created_at": r[5]} for r in audit],
    }


def create_user_account(username, password, role):
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("invalid_username")
    if len(password) < 10:
        raise ValueError("password_too_short")
    if role not in {"admin", "operator", "viewer"}:
        raise ValueError("invalid_role")
    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)
    with db_connect() as conn:
        try:
            conn.execute("INSERT INTO users (username,password_hash,salt,created_at,role,enabled) VALUES (?,?,?,?,?,1)",
                         (username, base64.b64encode(digest).decode("ascii"), base64.b64encode(salt).decode("ascii"), int(time.time()), role))
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError("user_exists")
    ensure_workspace(username)


def update_user_account(username, role=None, enabled=None):
    with db_connect() as conn:
        row = conn.execute("SELECT role,enabled FROM users WHERE username=?", (username,)).fetchone()
        if not row:
            raise ValueError("user_not_found")
        new_role = role if role is not None else row[0]
        new_enabled = int(bool(enabled)) if enabled is not None else row[1]
        if new_role not in {"admin", "operator", "viewer"}:
            raise ValueError("invalid_role")
        if row[0] == "admin" and (new_role != "admin" or not new_enabled):
            admins = conn.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND enabled=1").fetchone()[0]
            if admins <= 1:
                raise ValueError("last_admin")
        conn.execute("UPDATE users SET role=?,enabled=? WHERE username=?", (new_role, new_enabled, username))
        if not new_enabled:
            conn.execute("DELETE FROM sessions WHERE username=?", (username,))
        conn.commit()


def begin_totp_setup(username):
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    with db_connect() as conn:
        conn.execute("UPDATE users SET totp_secret=?,totp_enabled=0 WHERE username=?", (secret, username))
        conn.commit()
    label = quote(f"Netfreak2k:{username}")
    issuer = quote("Netfreak2k")
    return {"secret": secret, "otpauth_uri": f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&digits=6&period=30"}


def confirm_totp_setup(username, code):
    with db_connect() as conn:
        row = conn.execute("SELECT totp_secret FROM users WHERE username=?", (username,)).fetchone()
        if not row or not row[0] or not verify_totp(row[0], code):
            raise ValueError("invalid_totp")
        conn.execute("UPDATE users SET totp_enabled=1 WHERE username=?", (username,))
        conn.commit()


def disable_totp(username):
    with db_connect() as conn:
        conn.execute("UPDATE users SET totp_secret=NULL,totp_enabled=0 WHERE username=?", (username,))
        conn.commit()


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


def parse_cpu_percent():
    global _cpu_sample
    raw = read_text(HOST_PROC / "stat")
    first = raw.splitlines()[0].split() if raw else []
    if len(first) < 5 or first[0] != "cpu":
        return None
    try:
        values = [int(value) for value in first[1:]]
    except ValueError:
        return None
    total = sum(values)
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    now = time.monotonic()
    with _telemetry_lock:
        previous = _cpu_sample
        _cpu_sample = (total, idle, now)
    if not previous:
        return None
    total_delta = total - previous[0]
    idle_delta = idle - previous[1]
    if total_delta <= 0:
        return None
    busy = max(total_delta - idle_delta, 0)
    return round((busy / total_delta) * 100, 1)


def cpu_topology():
    logical = 0
    raw_stat = read_text(HOST_PROC / "stat")
    for line in raw_stat.splitlines():
        if re.match(r"^cpu\d+\s", line):
            logical += 1

    model = ""
    physical_pairs = set()
    physical_id = None
    core_id = None
    raw_info = read_text(HOST_PROC / "cpuinfo")
    for block in raw_info.split("\n\n"):
        values = {}
        for line in block.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            values[key.strip().lower()] = value.strip()
        if not model:
            model = values.get("model name") or values.get("hardware") or values.get("processor") or ""
        physical_id = values.get("physical id")
        core_id = values.get("core id")
        if physical_id is not None and core_id is not None:
            physical_pairs.add((physical_id, core_id))

    physical = len(physical_pairs) if physical_pairs else logical
    return {
        "logical_cores": logical or None,
        "physical_cores": physical or None,
        "model": model[:160],
    }


def parse_default_gateway():
    raw = read_text(HOST_PROC / "net/route")
    for line in raw.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 4 or parts[1] != "00000000":
            continue
        try:
            value = int(parts[2], 16)
            gateway = socket.inet_ntoa(value.to_bytes(4, byteorder="little"))
        except (ValueError, OSError):
            continue
        return {"interface": parts[0], "gateway": gateway}
    return {"interface": None, "gateway": None}


def host_dns_servers():
    raw = read_text(HOST_ETC / "resolv.conf")
    servers = []
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("nameserver "):
            server = line.split(None, 1)[1].strip()
            if server and server not in servers:
                servers.append(server)
    return servers[:3]


def internet_latency_ms():
    global _ping_cache
    now = time.monotonic()
    if now - _ping_cache.get("at", 0) < 15:
        return _ping_cache.get("value")
    samples = []
    for host, port in (("1.1.1.1", 443), ("8.8.8.8", 443)):
        started = time.monotonic()
        try:
            with socket.create_connection((host, port), timeout=0.8):
                samples.append((time.monotonic() - started) * 1000)
        except OSError:
            continue
    value = round(min(samples), 1) if samples else None
    _ping_cache = {"at": now, "value": value}
    return value


def public_network_identity():
    global _network_enrichment
    now = time.monotonic()
    cached = _network_enrichment
    if now - cached.get("at", 0) < 900 and cached.get("data"):
        return cached["data"]
    data = {}
    try:
        request = Request(
            "https://ipwho.is/",
            headers={"User-Agent": "Netfreak2k-Server-OS/1"},
        )
        with urlopen(request, timeout=2.5) as response:
            payload = json.loads(response.read(64 * 1024).decode("utf-8"))
        if payload.get("success", True):
            connection = payload.get("connection") or {}
            data = {
                "public_ip": payload.get("ip"),
                "provider": connection.get("isp") or connection.get("org"),
                "asn": connection.get("asn"),
                "country": payload.get("country"),
            }
    except Exception:
        data = {}
    _network_enrichment = {"at": now, "data": data}
    return data


def radio_browser_stations(country="DE", search="", limit=60):
    country = re.sub(r"[^A-Za-z]", "", str(country or "DE")).upper()[:2] or "DE"
    search = str(search or "").strip()[:80]
    try:
        limit = max(1, min(int(limit), 120))
    except (TypeError, ValueError):
        limit = 60

    cache_key = (country, search.lower(), limit)
    now = time.monotonic()
    with _radio_cache_lock:
        cached = _radio_cache.get(cache_key)
        if cached and now - cached["at"] < 300:
            return cached["data"]

    params = [
        f"countrycode={quote(country)}",
        "hidebroken=true",
        "order=clickcount",
        "reverse=true",
        f"limit={limit}",
    ]
    if search:
        params.append(f"name={quote(search)}")
    url = "https://de1.api.radio-browser.info/json/stations/search?" + "&".join(params)
    request = Request(url, headers={"User-Agent": "Netfreak2k-Server-OS/0.1"})
    stations = []
    try:
        with urlopen(request, timeout=4.0) as response:
            payload = json.loads(response.read(1024 * 1024).decode("utf-8"))
        for item in payload if isinstance(payload, list) else []:
            stream_url = item.get("url_resolved") or item.get("url")
            name = str(item.get("name") or "").strip()
            if not name or not stream_url or not str(stream_url).startswith(("http://", "https://")):
                continue
            favicon = str(item.get("favicon") or "").strip()
            stations.append({
                "id": item.get("stationuuid") or hashlib.sha256(f"{name}|{stream_url}".encode("utf-8")).hexdigest()[:24],
                "country": country,
                "name": name[:120],
                "genre": (str(item.get("tags") or "").replace(",", " · ")[:120] or "Radio"),
                "bitrate": f'{int(item.get("bitrate") or 0)} kbps' if item.get("bitrate") else (str(item.get("codec") or "Stream")),
                "codec": str(item.get("codec") or ""),
                "url": stream_url,
                "homepage": str(item.get("homepage") or ""),
                "favicon": favicon if favicon.startswith(("http://", "https://")) else "",
                "votes": int(item.get("votes") or 0),
                "clickcount": int(item.get("clickcount") or 0),
            })
    except Exception:
        stations = []

    data = {"country": country, "search": search, "stations": stations, "source": "radio-browser.info"}
    with _radio_cache_lock:
        _radio_cache[cache_key] = {"at": now, "data": data}
        if len(_radio_cache) > 80:
            oldest = sorted(_radio_cache.items(), key=lambda pair: pair[1]["at"])[:20]
            for key, _ in oldest:
                _radio_cache.pop(key, None)
    return data


def safe_external_radio_url(value):
    value = str(value or "").strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("invalid_stream_url")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("invalid_stream_url")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError:
        raise ValueError("stream_unreachable")
    for entry in addresses:
        raw = entry[4][0]
        try:
            addr = ipaddress.ip_address(raw)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved or addr.is_unspecified:
            raise ValueError("invalid_stream_url")
    return value


def radio_stream_metadata(stream_url):
    stream_url = safe_external_radio_url(stream_url)
    now = time.monotonic()
    cache_key = hashlib.sha256(stream_url.encode("utf-8")).hexdigest()
    with _radio_meta_cache_lock:
        cached = _radio_meta_cache.get(cache_key)
        if cached and now - cached["at"] < 7:
            return cached["data"]

    result = {
        "available": False,
        "stream_title": "",
        "artist": "",
        "title": "",
        "icy_name": "",
        "icy_genre": "",
        "source": "icy",
    }
    request = Request(
        stream_url,
        headers={
            "User-Agent": "Netfreak2k-Server-OS/0.2",
            "Icy-MetaData": "1",
            "Accept": "*/*",
        },
    )
    try:
        with urlopen(request, timeout=5.0) as response:
            headers = response.headers
            result["icy_name"] = str(headers.get("icy-name") or "").strip()[:160]
            result["icy_genre"] = str(headers.get("icy-genre") or "").strip()[:160]
            raw_interval = headers.get("icy-metaint")
            if raw_interval:
                interval = int(raw_interval)
                if 0 < interval <= 1024 * 1024:
                    remaining = interval
                    while remaining > 0:
                        chunk = response.read(min(65536, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                    if remaining == 0:
                        length_byte = response.read(1)
                        if length_byte:
                            meta_length = length_byte[0] * 16
                            if 0 < meta_length <= 4080:
                                raw_meta = response.read(meta_length).rstrip(b"\x00")
                                metadata = raw_meta.decode("utf-8", errors="replace")
                                if "�" in metadata:
                                    metadata = raw_meta.decode("latin-1", errors="replace")
                                match = re.search(r"""StreamTitle=(?:'(.+?)'|"(.+?)");""", metadata, flags=re.IGNORECASE)
                                if match:
                                    stream_title = (match.group(1) or match.group(2) or "").strip()[:300]
                                    result["stream_title"] = stream_title
                                    if " - " in stream_title:
                                        artist, title = stream_title.split(" - ", 1)
                                        result["artist"] = artist.strip()[:160]
                                        result["title"] = title.strip()[:200]
                                    else:
                                        result["title"] = stream_title
                                    result["available"] = bool(stream_title)
    except Exception:
        pass

    with _radio_meta_cache_lock:
        _radio_meta_cache[cache_key] = {"at": now, "data": result}
        if len(_radio_meta_cache) > 200:
            oldest = sorted(_radio_meta_cache.items(), key=lambda pair: pair[1]["at"])[:50]
            for key, _ in oldest:
                _radio_meta_cache.pop(key, None)
    return result


def network_details():
    base = parse_network_rate()
    route = parse_default_gateway()
    public = public_network_identity()
    return {
        **base,
        "gateway": route.get("gateway"),
        "default_interface": route.get("interface"),
        "dns": host_dns_servers(),
        "ping_ms": internet_latency_ms(),
        **public,
    }


def parse_network_rate():
    global _net_sample
    raw = read_text(HOST_PROC / "net/dev")
    samples = []
    for line in raw.splitlines()[2:]:
        if ":" not in line:
            continue
        name, values = line.split(":", 1)
        name = name.strip()
        if name == "lo":
            continue
        parts = values.split()
        if len(parts) < 9:
            continue
        try:
            current_rx = int(parts[0])
            current_tx = int(parts[8])
        except ValueError:
            continue
        samples.append((name, current_rx, current_tx))

    physical = [
        sample for sample in samples
        if not sample[0].startswith(("docker", "br-", "veth", "virbr", "tap", "vnet"))
    ]
    selected = physical or samples
    rx = sum(sample[1] for sample in selected)
    tx = sum(sample[2] for sample in selected)
    interfaces = [sample[0] for sample in selected]
    now = time.monotonic()
    with _telemetry_lock:
        previous = _net_sample
        _net_sample = (rx, tx, now)
    down_bps = 0
    up_bps = 0
    if previous:
        elapsed = now - previous[2]
        if elapsed > 0:
            down_bps = max(0, int((rx - previous[0]) / elapsed))
            up_bps = max(0, int((tx - previous[1]) / elapsed))
    return {
        "down_bps": down_bps,
        "up_bps": up_bps,
        "rx_bytes": rx,
        "tx_bytes": tx,
        "interfaces": interfaces,
    }


def create_sync_credential(username, label):
    label = str(label or "").strip()[:80] or "Sync"
    password = secrets.token_urlsafe(24)
    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)
    with db_connect() as conn:
        cur = conn.execute(
            "INSERT INTO sync_credentials (username,label,password_hash,salt,created_at) VALUES (?,?,?,?,?)",
            (
                username,
                label,
                base64.b64encode(digest).decode("ascii"),
                base64.b64encode(salt).decode("ascii"),
                int(time.time()),
            ),
        )
        conn.commit()
        credential_id = cur.lastrowid
    return {"id": credential_id, "label": label, "username": username, "password": password}


def sync_credentials_payload(username):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,label,created_at,last_used_at FROM sync_credentials WHERE username=? AND revoked_at IS NULL ORDER BY created_at DESC",
            (username,),
        ).fetchall()
    return {
        "credentials": [
            {"id": row[0], "label": row[1], "created_at": row[2], "last_used_at": row[3]}
            for row in rows
        ]
    }


def revoke_sync_credential(username, credential_id):
    try:
        credential_id = int(credential_id)
    except (TypeError, ValueError):
        raise ValueError("invalid_credential")
    with db_connect() as conn:
        cur = conn.execute(
            "UPDATE sync_credentials SET revoked_at=? WHERE id=? AND username=? AND revoked_at IS NULL",
            (int(time.time()), credential_id, username),
        )
        conn.commit()
    if cur.rowcount != 1:
        raise ValueError("credential_not_found")
    return {"revoked": True}


def verify_sync_login(username, password):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,password_hash,salt FROM sync_credentials WHERE username=? AND revoked_at IS NULL",
            (username,),
        ).fetchall()
        for row in rows:
            try:
                stored = base64.b64decode(row[1])
                salt = base64.b64decode(row[2])
            except Exception:
                continue
            supplied = hash_password(password, salt)
            if hmac.compare_digest(stored, supplied):
                conn.execute("UPDATE sync_credentials SET last_used_at=? WHERE id=?", (int(time.time()), row[0]))
                conn.commit()
                return True
    return False


def dav_virtual_root(username):
    ensure_workspace(username)
    return {
        "Dokumente": ensure_workspace(username) / WORKSPACE_AREAS["documents"],
        "Bilder & Videos": ensure_workspace(username) / WORKSPACE_AREAS["media"],
        "Audio": ensure_workspace(username) / WORKSPACE_AREAS["audio"],
        "Downloads": ensure_workspace(username) / WORKSPACE_AREAS["downloads"],
        "Persönlich": ensure_workspace(username) / WORKSPACE_AREAS["personal"],
        "Papierkorb": ensure_workspace(username) / WORKSPACE_AREAS["trash"],
        "Shared": WORKSPACE_ROOT / "shared",
    }


def dav_resolve(username, relative):
    relative = unquote(str(relative or "")).strip("/")
    roots = dav_virtual_root(username)
    if not relative:
        return None, None, roots
    parts = [part for part in relative.split("/") if part]
    root = roots.get(parts[0])
    if root is None:
        raise ValueError("dav_not_found")
    target = root.joinpath(*parts[1:]).resolve()
    resolved_root = root.resolve()
    if target != resolved_root and resolved_root not in target.parents:
        raise ValueError("invalid_path")
    return parts[0], target, roots


def dav_href(path):
    return "/dav/files/" + quote(path, safe="/") if path else "/dav/files/"


def dav_prop_response(href, path=None, collection=False, display_name=""):
    esc = xml.sax.saxutils.escape
    if collection:
        resource = "<d:collection/>"
        length = ""
    else:
        resource = ""
        size = path.stat().st_size if path and path.exists() else 0
        length = f"<d:getcontentlength>{size}</d:getcontentlength>"
    modified = ""
    etag = ""
    if path and path.exists():
        stat = path.stat()
        modified = f"<d:getlastmodified>{email.utils.formatdate(stat.st_mtime, usegmt=True)}</d:getlastmodified>"
        etag = f'<d:getetag>"{stat.st_mtime_ns:x}-{stat.st_size:x}"</d:getetag>'
    return (
        "<d:response>"
        f"<d:href>{esc(href)}</d:href>"
        "<d:propstat><d:prop>"
        f"<d:displayname>{esc(display_name)}</d:displayname>"
        f"<d:resourcetype>{resource}</d:resourcetype>"
        f"{length}{modified}{etag}"
        "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>"
        "</d:response>"
    )


def format_ics_datetime(epoch):
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(int(epoch)))


def build_ics_event(uid, title, start_at, end_at=None, notes=""):
    def esc(value):
        return str(value or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Netfreak2k//N2K Calendar//DE",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{format_ics_datetime(int(time.time()))}",
        f"DTSTART:{format_ics_datetime(start_at)}",
    ]
    if end_at:
        lines.append(f"DTEND:{format_ics_datetime(end_at)}")
    lines.extend([
        f"SUMMARY:{esc(title)}",
        f"DESCRIPTION:{esc(notes)}",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ])
    return "\r\n".join(lines)


def parse_ics_datetime(value):
    value = value.strip()
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%dT%H%M%S", "%Y%m%d"):
        try:
            dt = time.strptime(value, fmt)
            return int(calendar.timegm(dt)) if value.endswith("Z") else int(time.mktime(dt))
        except ValueError:
            continue
    raise ValueError("invalid_ics_time")


def unfold_ics(text):
    return re.sub(r"\r?\n[ \t]", "", text)


def parse_ics_event(text):
    text = unfold_ics(text)
    values = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.split(";", 1)[0].upper()
        if key in {"UID", "DTSTART", "DTEND", "SUMMARY", "DESCRIPTION"}:
            values[key] = value
    uid = values.get("UID") or f"{secrets.token_hex(12)}@netfreak2k"
    title = values.get("SUMMARY", "Termin").replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";")
    notes = values.get("DESCRIPTION", "").replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";")
    start_at = parse_ics_datetime(values["DTSTART"])
    end_at = parse_ics_datetime(values["DTEND"]) if values.get("DTEND") else None
    return uid, title, start_at, end_at, notes


def calendar_event_by_uid(username, uid):
    with db_connect() as conn:
        row = conn.execute(
            "SELECT id,title,start_at,end_at,notes,uid,raw_ics,updated_at FROM calendar_events WHERE username=? AND uid=?",
            (username, uid),
        ).fetchone()
    return row


def upsert_caldav_event(username, uid, ics):
    parsed_uid, title, start_at, end_at, notes = parse_ics_event(ics)
    uid = parsed_uid or uid
    now = int(time.time())
    with db_connect() as conn:
        row = conn.execute(
            "SELECT id FROM calendar_events WHERE username=? AND uid=?",
            (username, uid),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE calendar_events SET title=?,start_at=?,end_at=?,notes=?,raw_ics=?,updated_at=? WHERE id=?",
                (title, start_at, end_at, notes, ics, now, row[0]),
            )
        else:
            conn.execute(
                "INSERT INTO calendar_events (username,title,start_at,end_at,notes,created_at,uid,updated_at,raw_ics) VALUES (?,?,?,?,?,?,?,?,?)",
                (username, title, start_at, end_at, notes, now, uid, now, ics),
            )
        conn.commit()
    return uid


WALLPAPER_IDS = {
    "01-night-bay",
    "02-aurora",
    "03-golden-dunes",
    "04-misty-forest",
    "05-cosmic-nebula",
    "06-glass-waves",
    "07-server-geometry",
    "08-golden-coast",
    "09-cyber-city",
    "10-mountain-lake",
}


def preferences_payload(username):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT pref_key,pref_value FROM user_preferences WHERE username=?",
            (username,),
        ).fetchall()
    prefs = {row[0]: row[1] for row in rows}
    wallpaper = prefs.get("wallpaper", "01-night-bay")
    if wallpaper not in WALLPAPER_IDS:
        wallpaper = "01-night-bay"
    return {"wallpaper": wallpaper}


def set_preference(username, key, value):
    if key != "wallpaper":
        raise ValueError("invalid_preference")
    value = str(value or "")
    if value not in WALLPAPER_IDS:
        raise ValueError("invalid_wallpaper")
    now = int(time.time())
    with db_connect() as conn:
        conn.execute(
            """
            INSERT INTO user_preferences (username,pref_key,pref_value,updated_at)
            VALUES (?,?,?,?)
            ON CONFLICT(username,pref_key)
            DO UPDATE SET pref_value=excluded.pref_value, updated_at=excluded.updated_at
            """,
            (username, key, value, now),
        )
        conn.commit()
    return {"saved": True, key: value}


def ensure_workspace(username):
    base = WORKSPACE_ROOT / "users" / username
    base.mkdir(parents=True, exist_ok=True)
    for folder in WORKSPACE_AREAS.values():
        (base / folder).mkdir(exist_ok=True)
    (WORKSPACE_ROOT / "shared").mkdir(parents=True, exist_ok=True)
    (base / ".versions").mkdir(exist_ok=True)
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


def audio_metadata_for_file(path):
    path = Path(path)
    try:
        stat = path.stat()
    except OSError:
        return {}
    cache_key = (str(path), int(stat.st_mtime), int(stat.st_size))
    with _media_meta_cache_lock:
        cached = _media_meta_cache.get(cache_key)
        if cached is not None:
            return dict(cached)

    metadata = {
        "title": path.stem,
        "artist": "",
        "album": "",
        "genre": "",
        "track_number": "",
        "duration_seconds": None,
        "has_artwork": False,
    }
    if MutagenFile is not None:
        try:
            easy = MutagenFile(path, easy=True)
            if easy is not None:
                tags = easy.tags or {}
                def first(name):
                    value = tags.get(name)
                    if isinstance(value, (list, tuple)) and value:
                        return str(value[0])
                    return str(value or "")
                metadata["title"] = first("title") or path.stem
                metadata["artist"] = first("artist")
                metadata["album"] = first("album")
                metadata["genre"] = first("genre")
                metadata["track_number"] = first("tracknumber")
                info = getattr(easy, "info", None)
                length = getattr(info, "length", None)
                if isinstance(length, (int, float)) and length >= 0:
                    metadata["duration_seconds"] = round(float(length), 2)

            full = MutagenFile(path, easy=False)
            if full is not None:
                pictures = getattr(full, "pictures", None)
                if pictures:
                    metadata["has_artwork"] = True
                tags = getattr(full, "tags", None)
                if tags:
                    for value in tags.values():
                        cls = value.__class__.__name__.lower()
                        if "apic" in cls or cls == "cover":
                            metadata["has_artwork"] = True
                            break
                    if not metadata["has_artwork"] and hasattr(tags, "get"):
                        covr = tags.get("covr")
                        if covr:
                            metadata["has_artwork"] = True
        except Exception:
            pass

    with _media_meta_cache_lock:
        if len(_media_meta_cache) > 4000:
            _media_meta_cache.clear()
        _media_meta_cache[cache_key] = dict(metadata)
    return metadata


def audio_artwork_for_file(path):
    if MutagenFile is None:
        return None, None
    try:
        full = MutagenFile(path, easy=False)
        if full is None:
            return None, None
        pictures = getattr(full, "pictures", None)
        if pictures:
            picture = pictures[0]
            return bytes(picture.data), str(getattr(picture, "mime", "") or "image/jpeg")
        tags = getattr(full, "tags", None)
        if tags:
            for value in tags.values():
                if "apic" in value.__class__.__name__.lower() and getattr(value, "data", None):
                    return bytes(value.data), str(getattr(value, "mime", "") or "image/jpeg")
            if hasattr(tags, "get"):
                covr = tags.get("covr")
                if covr:
                    raw = bytes(covr[0])
                    mime = "image/png" if raw.startswith(b"\x89PNG") else "image/jpeg"
                    return raw, mime
    except Exception:
        pass
    return None, None


def media_audio_library(username):
    base = workspace_base(username, "audio").resolve()
    tracks = []
    if not base.exists():
        return {"tracks": [], "count": 0}
    for root, dirs, files in os.walk(base):
        dirs[:] = [name for name in dirs if not name.startswith(".")]
        root_path = Path(root)
        for name in sorted(files, key=str.lower):
            if name.startswith(".") or Path(name).suffix.lower() not in MEDIA_AUDIO_EXTENSIONS:
                continue
            target = (root_path / name).resolve()
            if base not in target.parents:
                continue
            try:
                stat = target.stat()
            except OSError:
                continue
            rel_parent = target.parent.relative_to(base)
            rel_path = "" if str(rel_parent) == "." else rel_parent.as_posix()
            track_id = hashlib.sha256(f"{rel_path}/{name}".encode("utf-8")).hexdigest()[:24]
            params = f"area=audio&path={quote(rel_path)}&name={quote(name)}"
            meta = audio_metadata_for_file(target)
            tracks.append({
                "id": f"local-{track_id}",
                "name": name,
                "title": meta.get("title") or target.stem,
                "artist": meta.get("artist") or "",
                "album": meta.get("album") or "",
                "genre": meta.get("genre") or "",
                "track_number": meta.get("track_number") or "",
                "duration_seconds": meta.get("duration_seconds"),
                "has_artwork": bool(meta.get("has_artwork")),
                "artwork_url": f"/api/media/artwork?path={quote(rel_path)}&name={quote(name)}" if meta.get("has_artwork") else "",
                "path": rel_path,
                "size_bytes": stat.st_size,
                "modified_at": int(stat.st_mtime),
                "extension": target.suffix.lower().lstrip("."),
                "url": f"/api/workspace/file?{params}",
            })
            if len(tracks) >= 1000:
                break
        if len(tracks) >= 1000:
            break
    tracks.sort(key=lambda item: (
        (item.get("artist") or "").lower(),
        (item.get("album") or "").lower(),
        (item.get("track_number") or ""),
        (item.get("title") or item["name"]).lower(),
    ))
    return {"tracks": tracks, "count": len(tracks), "area": "audio"}

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


def workspace_rename(username, area, rel, old_name, new_name):
    if (
        not old_name or not new_name
        or old_name in {".", ".."} or new_name in {".", ".."}
        or "/" in old_name or "\\" in old_name
        or "/" in new_name or "\\" in new_name
    ):
        raise ValueError("invalid_name")
    _, parent = workspace_target(username, area, rel)
    source = (parent / old_name).resolve()
    target = (parent / new_name).resolve()
    base = workspace_base(username, area).resolve()
    if base not in source.parents or base not in target.parents:
        raise ValueError("invalid_path")
    if not source.exists():
        raise ValueError("not_found")
    if target.exists():
        raise ValueError("already_exists")
    source.rename(target)
    with db_connect() as conn:
        conn.execute(
            "UPDATE favorites SET name=? WHERE username=? AND area=? AND rel_path=? AND name=?",
            (new_name, username, area, str(safe_relative(rel)), old_name),
        )
        conn.execute(
            "UPDATE file_versions SET name=? WHERE username=? AND area=? AND rel_path=? AND name=?",
            (new_name, username, area, str(safe_relative(rel)), old_name),
        )
        conn.commit()
    return {"renamed": True, "name": new_name}


def workspace_restore(username, name):
    if not name or "/" in name or "\\" in name:
        raise ValueError("invalid_name")
    trash = ensure_workspace(username) / WORKSPACE_AREAS["trash"]
    source = (trash / name).resolve()
    if trash.resolve() not in source.parents or not source.exists():
        raise ValueError("not_found")
    restored_name = re.sub(r"^[0-9]+-", "", source.name, count=1) or source.name
    destination_root = ensure_workspace(username) / WORKSPACE_AREAS["documents"]
    destination = destination_root / restored_name
    if destination.exists():
        stem = destination.stem
        suffix = destination.suffix
        restored_name = f"{stem}-wiederhergestellt-{int(time.time())}{suffix}"
        destination = destination_root / restored_name
    shutil.move(str(source), str(destination))
    return {"restored": True, "area": "documents", "name": restored_name}


def workspace_search(username, query):
    query = str(query or "").strip().lower()
    if len(query) < 2:
        return {"results": []}
    results = []
    roots = [(area, workspace_base(username, area)) for area in WORKSPACE_AREAS if area != "trash"]
    roots.append(("shared", workspace_base(username, "shared")))
    for area, root in roots:
        if not root.exists():
            continue
        for item in root.rglob("*"):
            if len(results) >= 80:
                break
            try:
                rel = item.relative_to(root)
            except ValueError:
                continue
            if any(part.startswith(".") for part in rel.parts):
                continue
            if query in item.name.lower():
                results.append({
                    "kind": "folder" if item.is_dir() else "file",
                    "area": area,
                    "path": str(rel.parent) if str(rel.parent) != "." else "",
                    "name": item.name,
                })
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,title,start_at FROM calendar_events WHERE username=? AND lower(title) LIKE ? ORDER BY start_at ASC LIMIT 30",
            (username, f"%{query}%"),
        ).fetchall()
    for row in rows:
        results.append({"kind": "calendar", "id": row[0], "title": row[1], "start_at": row[2]})
    return {"results": results[:100]}


def share_create(username, area, rel, name, hours):
    try:
        hours = max(1, min(int(hours), 24 * 30))
    except (TypeError, ValueError):
        raise ValueError("invalid_expiry")
    if not name or "/" in name or "\\" in name:
        raise ValueError("invalid_name")
    _, parent = workspace_target(username, area, rel)
    target = (parent / name).resolve()
    base = workspace_base(username, area).resolve()
    if base not in target.parents or not target.is_file():
        raise ValueError("not_found")
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with db_connect() as conn:
        conn.execute(
            "INSERT INTO share_links (token,username,area,rel_path,name,expires_at,created_at) VALUES (?,?,?,?,?,?,?)",
            (token, username, area, str(safe_relative(rel)), name, now + hours * 3600, now),
        )
        conn.commit()
    return {"token": token, "expires_at": now + hours * 3600}


def share_resolve(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,80}", str(token or "")):
        raise ValueError("invalid_share")
    with db_connect() as conn:
        row = conn.execute(
            "SELECT username,area,rel_path,name,expires_at FROM share_links WHERE token=?",
            (token,),
        ).fetchone()
        if not row:
            raise ValueError("share_not_found")
        if row[4] <= int(time.time()):
            conn.execute("DELETE FROM share_links WHERE token=?", (token,))
            conn.commit()
            raise ValueError("share_expired")
    username, area, rel, name, expires_at = row
    _, parent = workspace_target(username, area, rel)
    target = (parent / name).resolve()
    base = workspace_base(username, area).resolve()
    if base not in target.parents or not target.is_file():
        raise ValueError("share_not_found")
    return target, expires_at


def favorite_toggle(username, area, rel, name):
    _, parent = workspace_target(username, area, rel)
    target = (parent / name).resolve()
    base = workspace_base(username, area).resolve()
    if base not in target.parents or not target.exists():
        raise ValueError("not_found")
    rel = str(safe_relative(rel))
    with db_connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM favorites WHERE username=? AND area=? AND rel_path=? AND name=?",
            (username, area, rel, name),
        ).fetchone()
        if row:
            conn.execute(
                "DELETE FROM favorites WHERE username=? AND area=? AND rel_path=? AND name=?",
                (username, area, rel, name),
            )
            conn.commit()
            return {"favorite": False}
        conn.execute(
            "INSERT INTO favorites (username,area,rel_path,name,created_at) VALUES (?,?,?,?,?)",
            (username, area, rel, name, int(time.time())),
        )
        conn.commit()
    return {"favorite": True}


def favorites_payload(username):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT area,rel_path,name,created_at FROM favorites WHERE username=? ORDER BY created_at DESC",
            (username,),
        ).fetchall()
    items = []
    stale = []
    for area, rel, name, created_at in rows:
        try:
            _, parent = workspace_target(username, area, rel)
            target = (parent / name).resolve()
            if not target.exists():
                stale.append((area, rel, name))
                continue
            items.append({
                "area": area,
                "path": rel,
                "name": name,
                "type": "folder" if target.is_dir() else "file",
                "created_at": created_at,
            })
        except ValueError:
            stale.append((area, rel, name))
    if stale:
        with db_connect() as conn:
            for row in stale:
                conn.execute(
                    "DELETE FROM favorites WHERE username=? AND area=? AND rel_path=? AND name=?",
                    (username, *row),
                )
            conn.commit()
    return {"favorites": items}


def shares_payload(username):
    now = int(time.time())
    with db_connect() as conn:
        conn.execute("DELETE FROM share_links WHERE expires_at<=?", (now,))
        rows = conn.execute(
            "SELECT token,area,rel_path,name,expires_at,created_at FROM share_links WHERE username=? ORDER BY created_at DESC",
            (username,),
        ).fetchall()
        conn.commit()
    return {
        "shares": [
            {
                "token": row[0],
                "area": row[1],
                "path": row[2],
                "name": row[3],
                "expires_at": row[4],
                "created_at": row[5],
            }
            for row in rows
        ]
    }


def share_revoke(username, token):
    with db_connect() as conn:
        cur = conn.execute("DELETE FROM share_links WHERE token=? AND username=?", (token, username))
        conn.commit()
    if cur.rowcount != 1:
        raise ValueError("share_not_found")
    return {"revoked": True}


def version_snapshot(username, area, rel, name, source):
    if not source.is_file():
        return None
    version_root = ensure_workspace(username) / ".versions"
    bucket = version_root / secrets.token_hex(12)
    bucket.mkdir(parents=True, exist_ok=False)
    stored = bucket / name
    shutil.copy2(source, stored)
    with db_connect() as conn:
        cur = conn.execute(
            "INSERT INTO file_versions (username,area,rel_path,name,stored_path,size_bytes,created_at) VALUES (?,?,?,?,?,?,?)",
            (
                username,
                area,
                str(safe_relative(rel)),
                name,
                str(stored.relative_to(ensure_workspace(username))),
                stored.stat().st_size,
                int(time.time()),
            ),
        )
        conn.commit()
        return cur.lastrowid


def versions_payload(username, area, rel, name):
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,size_bytes,created_at FROM file_versions WHERE username=? AND area=? AND rel_path=? AND name=? ORDER BY created_at DESC LIMIT 30",
            (username, area, str(safe_relative(rel)), name),
        ).fetchall()
    return {"versions": [{"id": r[0], "size_bytes": r[1], "created_at": r[2]} for r in rows]}


def version_restore(username, version_id):
    try:
        version_id = int(version_id)
    except (TypeError, ValueError):
        raise ValueError("invalid_version")
    with db_connect() as conn:
        row = conn.execute(
            "SELECT area,rel_path,name,stored_path FROM file_versions WHERE id=? AND username=?",
            (version_id, username),
        ).fetchone()
    if not row:
        raise ValueError("version_not_found")
    area, rel, name, stored_path = row
    stored = (ensure_workspace(username) / stored_path).resolve()
    user_root = ensure_workspace(username).resolve()
    if user_root not in stored.parents or not stored.is_file():
        raise ValueError("version_not_found")
    _, parent = workspace_target(username, area, rel)
    target = parent / name
    if target.exists() and target.is_file():
        version_snapshot(username, area, rel, name, target)
    shutil.copy2(stored, target)
    return {"restored": True, "name": name}


def workspace_transfer(username, mode, source_area, source_rel, name, target_area, target_rel):
    if mode not in {"copy", "move"}:
        raise ValueError("invalid_mode")
    if not name or "/" in name or "\\" in name:
        raise ValueError("invalid_name")
    _, source_parent = workspace_target(username, source_area, source_rel)
    source = (source_parent / name).resolve()
    source_base = workspace_base(username, source_area).resolve()
    if source_base not in source.parents or not source.exists():
        raise ValueError("not_found")
    _, target_parent = workspace_target(username, target_area, target_rel)
    if not target_parent.is_dir():
        raise ValueError("folder_not_found")
    target = target_parent / name
    if target.exists():
        raise ValueError("already_exists")
    if mode == "copy":
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)
    else:
        shutil.move(str(source), str(target))
        with db_connect() as conn:
            conn.execute(
                "UPDATE favorites SET area=?, rel_path=? WHERE username=? AND area=? AND rel_path=? AND name=?",
                (
                    target_area,
                    str(safe_relative(target_rel)),
                    username,
                    source_area,
                    str(safe_relative(source_rel)),
                    name,
                ),
            )
            conn.execute(
                "UPDATE file_versions SET area=?, rel_path=? WHERE username=? AND area=? AND rel_path=? AND name=?",
                (
                    target_area,
                    str(safe_relative(target_rel)),
                    username,
                    source_area,
                    str(safe_relative(source_rel)),
                    name,
                ),
            )
            conn.commit()
    return {"transferred": True, "mode": mode, "name": name, "area": target_area, "path": str(safe_relative(target_rel))}


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
        now = int(time.time())
        uid = f"{secrets.token_hex(12)}@netfreak2k"
        raw_ics = build_ics_event(uid, title, start_at, end_at, notes)
        cur = conn.execute(
            "INSERT INTO calendar_events (username,title,start_at,end_at,notes,created_at,uid,updated_at,raw_ics) VALUES (?,?,?,?,?,?,?,?,?)",
            (username, title, start_at, end_at, notes, now, uid, now, raw_ics),
        )
        conn.commit()
        event_id = cur.lastrowid
    return {"created": True, "id": event_id, "uid": uid}


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
        client.settimeout(900 if action == "app_install" else 600 if action == "update_safe_netfreak2k" else 360 if action in {"backup_create","backup_verify","backup_test_restore","backup_restore","backup_scheduled_tick"} else 180 if action in {"remote_access_configure","remote_access_renew"} else 150 if action in {"network_scan","network_device_analyze"} else 120 if action == "vm_snapshot_create" else 45 if action in {"service_action","host_power_action","storage_mount","storage_unmount","vm_action"} else 30 if action == "app_update_check" else 15 if action in {"app_diagnostics","vm_list"} else 12 if action in {"service_logs","hardware_status","storage_status","app_logs","update_preflight","security_status"} else 8)
        client.connect(VM_AGENT_SOCKET)
        request = {"action": action, "token": token}
        if extra:
            request.update(extra)
        client.sendall((json.dumps(request) + "\n").encode("utf-8"))
        raw = b""
        while b"\n" not in raw and len(raw) < 1024 * 1024:
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


def read_json_file(path):
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
        return {}


def update_payload():
    status = read_json_file(UPDATE_FILE)
    version = read_json_file(VERSION_FILE)
    progress = read_json_file(UPDATE_PROGRESS_FILE)

    if not status:
        status = {
            "ok": False,
            "update_available": False,
            "note": "update_status_unavailable",
        }

    status["available"] = bool(status)
    status["installed"] = {
        "repo": version.get("repo"),
        "ref": version.get("ref"),
        "fingerprint": version.get("fingerprint") or status.get("installed_fingerprint"),
        "installed_at": version.get("installed_at"),
    }
    status["progress"] = progress or {
        "state": "idle",
        "progress": 0,
        "step": "idle",
        "message": "Kein Update-Vorgang aktiv.",
    }
    return status


def recent_workspace_items(username, limit=6):
    items = []
    roots = [(area, workspace_base(username, area)) for area in WORKSPACE_AREAS if area != "trash"]
    roots.append(("shared", workspace_base(username, "shared")))
    for area, root in roots:
        if not root.exists():
            continue
        for item in root.rglob("*"):
            if item.name.startswith(".") or any(part.startswith(".") for part in item.relative_to(root).parts):
                continue
            if not item.is_file():
                continue
            try:
                stat = item.stat()
                rel = item.relative_to(root)
            except (OSError, ValueError):
                continue
            items.append({
                "area": area,
                "path": str(rel.parent) if str(rel.parent) != "." else "",
                "name": item.name,
                "size_bytes": stat.st_size,
                "modified_at": int(stat.st_mtime),
            })
    items.sort(key=lambda item: item["modified_at"], reverse=True)
    return items[:limit]


def upcoming_events_payload(username, limit=4):
    now = int(time.time())
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT id,title,start_at,end_at FROM calendar_events WHERE username=? AND start_at>=? ORDER BY start_at ASC LIMIT ?",
            (username, now, limit),
        ).fetchall()
    return [
        {"id": row[0], "title": row[1], "start_at": row[2], "end_at": row[3]}
        for row in rows
    ]



def record_health_sample(current):
    sampled_at = int(current.get("sampled_at") or time.time())
    with db_connect() as conn:
        latest = conn.execute("SELECT MAX(sampled_at) FROM health_samples").fetchone()
        if latest and latest[0] and sampled_at - int(latest[0]) < 45:
            return
        conn.execute(
            """INSERT OR REPLACE INTO health_samples
               (sampled_at,cpu_percent,ram_percent,storage_percent,temperature_c,load_1m,
                network_down_bps,network_up_bps,health_score)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                sampled_at,
                current.get("cpu_percent"),
                (current.get("memory") or {}).get("used_percent"),
                (current.get("storage") or {}).get("used_percent"),
                (current.get("cpu_temperature") or {}).get("max_c"),
                (current.get("load") or {}).get("1m"),
                (current.get("network") or {}).get("down_bps"),
                (current.get("network") or {}).get("up_bps"),
                current.get("score"),
            ),
        )
        cutoff = sampled_at - 8 * 86400
        conn.execute("DELETE FROM health_samples WHERE sampled_at<?", (cutoff,))
        conn.commit()


def health_history_payload(period="24h"):
    period = str(period or "24h").lower()
    seconds = 7 * 86400 if period == "7d" else 24 * 3600
    bucket = 1800 if period == "7d" else 300
    since = int(time.time()) - seconds
    with db_connect() as conn:
        rows = conn.execute(
            """SELECT
                 (sampled_at / ?) * ? AS bucket_at,
                 AVG(cpu_percent), AVG(ram_percent), AVG(storage_percent), AVG(temperature_c),
                 AVG(load_1m), AVG(network_down_bps), AVG(network_up_bps), AVG(health_score)
               FROM health_samples
               WHERE sampled_at>=?
               GROUP BY bucket_at
               ORDER BY bucket_at ASC""",
            (bucket, bucket, since),
        ).fetchall()
    return [
        {
            "sampled_at": int(row[0]),
            "cpu_percent": row[1],
            "ram_percent": row[2],
            "storage_percent": row[3],
            "temperature_c": row[4],
            "load_1m": row[5],
            "network_down_bps": row[6],
            "network_up_bps": row[7],
            "health_score": row[8],
        }
        for row in rows
    ]


def system_health_payload(period="24h"):
    host = vm_agent("health_status")
    memory = parse_meminfo()
    network = network_details()
    load = parse_load()
    cpu = parse_cpu_percent()
    updates = update_payload()

    current = {
        "sampled_at": int(time.time()),
        "cpu_percent": cpu,
        "cpu": cpu_topology(),
        "memory": memory,
        "load": load,
        "network": network,
        "storage": host.get("storage") or {},
        "cpu_temperature": host.get("cpu_temperature") or {},
        "smart": host.get("smart") or {},
        "docker": host.get("docker") or {},
        "services": host.get("services") or [],
        "homeassistant": host.get("homeassistant") or {},
        "backup": host.get("backup"),
        "warnings": host.get("warnings") or [],
        "score": host.get("score") if isinstance(host.get("score"), int) else 0,
        "overall": host.get("overall") or "unknown",
        "host_available": bool(host.get("available")),
        "update": {
            "available": bool(updates.get("available")),
            "update_available": bool(updates.get("update_available")),
            "ok": bool(updates.get("ok")),
        },
    }
    record_health_sample(current)
    return {
        "current": current,
        "period": "7d" if str(period).lower() == "7d" else "24h",
        "history": health_history_payload(period),
    }



def notification_target_for_kind(kind):
    return {
        "temperature": "health-panel",
        "storage": "storage-panel",
        "smart": "health-panel",
        "service": "health-panel",
        "docker": "health-panel",
        "haos": "vms-panel",
        "backup": "backups-panel",
        "network_device": "network-panel",
        "update": "updates-panel",
    }.get(str(kind or ""), "health-panel")


def collect_notification_candidates():
    candidates = []
    host = vm_agent("health_status")
    if host.get("available"):
        for warning in host.get("warnings") or []:
            kind = str(warning.get("kind") or "health")[:40]
            title = str(warning.get("title") or "Systemhinweis")[:180]
            detail = str(warning.get("detail") or "")[:500]
            level = str(warning.get("level") or "warning")
            if level not in {"info", "warning", "critical"}:
                level = "warning"
            stable = hashlib.sha256(f"{kind}|{title}".encode("utf-8")).hexdigest()[:24]
            candidates.append({
                "event_key": f"health:{stable}",
                "source": "system",
                "level": level,
                "title": title,
                "detail": detail,
                "target": notification_target_for_kind(kind),
            })

    inventory = vm_agent("network_inventory")
    if inventory.get("available"):
        for device in inventory.get("devices") or []:
            if not device.get("online") or not device.get("new"):
                continue
            device_id = str(device.get("id") or "")
            if not re.fullmatch(r"[0-9a-f]{20}", device_id):
                continue
            name = str(device.get("name") or device.get("hostname") or device.get("ip") or "Unbekanntes Gerät")[:120]
            facts = [str(device.get("ip") or "").strip(), str(device.get("vendor") or "").strip()]
            detail = " · ".join(item for item in facts if item)[:500]
            candidates.append({
                "event_key": f"network:new:{device_id}",
                "source": "network",
                "level": "info",
                "title": f"Neues Gerät im Heimnetz: {name}"[:180],
                "detail": detail,
                "target": "network-panel",
            })

    updates = update_payload()
    if updates.get("available") and updates.get("update_available"):
        remote = str(updates.get("remote_fingerprint") or "")[:32]
        candidates.append({
            "event_key": "update:available",
            "source": "update",
            "level": "info",
            "title": "Netfreak2k-Update verfügbar",
            "detail": f"Neuer Stand erkannt{f' · {remote}' if remote else ''}.",
            "target": "updates-panel",
        })
    return candidates


def sync_system_notifications():
    now = int(time.time())
    candidates = collect_notification_candidates()
    active_keys = {item["event_key"] for item in candidates}

    with db_connect() as conn:
        current_rows = {
            row[0]: {"active": bool(row[1]), "read_at": row[2]}
            for row in conn.execute("SELECT event_key,active,read_at FROM notifications").fetchall()
        }

        for item in candidates:
            existing = current_rows.get(item["event_key"])
            if existing is None:
                conn.execute(
                    """INSERT INTO notifications
                       (event_key,source,level,title,detail,target,first_seen,last_seen,active,read_at,resolved_at)
                       VALUES (?,?,?,?,?,?,?,?,1,NULL,NULL)""",
                    (
                        item["event_key"], item["source"], item["level"], item["title"], item["detail"],
                        item["target"], now, now,
                    ),
                )
            elif existing["active"]:
                conn.execute(
                    """UPDATE notifications
                       SET source=?,level=?,title=?,detail=?,target=?,last_seen=?,active=1,resolved_at=NULL
                       WHERE event_key=?""",
                    (
                        item["source"], item["level"], item["title"], item["detail"],
                        item["target"], now, item["event_key"],
                    ),
                )
            else:
                conn.execute(
                    """UPDATE notifications
                       SET source=?,level=?,title=?,detail=?,target=?,first_seen=?,last_seen=?,
                           active=1,read_at=NULL,resolved_at=NULL
                       WHERE event_key=?""",
                    (
                        item["source"], item["level"], item["title"], item["detail"],
                        item["target"], now, now, item["event_key"],
                    ),
                )

        rows = conn.execute("SELECT event_key FROM notifications WHERE active=1").fetchall()
        for row in rows:
            event_key = row[0]
            if event_key not in active_keys:
                conn.execute(
                    "UPDATE notifications SET active=0,resolved_at=? WHERE event_key=?",
                    (now, event_key),
                )

        cutoff = now - 30 * 86400
        conn.execute("DELETE FROM notifications WHERE active=0 AND COALESCE(resolved_at,last_seen)<?", (cutoff,))
        conn.commit()


def notifications_payload():
    sync_system_notifications()
    with db_connect() as conn:
        rows = conn.execute(
            """SELECT id,event_key,source,level,title,detail,target,first_seen,last_seen,active,read_at,resolved_at
               FROM notifications
               ORDER BY active DESC,
                        CASE level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                        last_seen DESC
               LIMIT 80"""
        ).fetchall()
    items = [
        {
            "id": row[0],
            "event_key": row[1],
            "source": row[2],
            "level": row[3],
            "title": row[4],
            "detail": row[5],
            "target": row[6],
            "first_seen": row[7],
            "last_seen": row[8],
            "active": bool(row[9]),
            "read": row[10] is not None,
            "read_at": row[10],
            "resolved_at": row[11],
        }
        for row in rows
    ]
    return {
        "notifications": items,
        "unread": sum(1 for item in items if item["active"] and not item["read"]),
        "active": sum(1 for item in items if item["active"]),
        "critical": sum(1 for item in items if item["active"] and item["level"] == "critical"),
        "generated_at": int(time.time()),
    }


def mark_notification_read(notification_id=None, all_active=False):
    now = int(time.time())
    with db_connect() as conn:
        if all_active:
            conn.execute("UPDATE notifications SET read_at=? WHERE active=1 AND read_at IS NULL", (now,))
        else:
            try:
                notification_id = int(notification_id)
            except (TypeError, ValueError):
                raise ValueError("invalid_notification_id")
            cur = conn.execute("UPDATE notifications SET read_at=? WHERE id=?", (now, notification_id))
            if cur.rowcount != 1:
                raise ValueError("notification_not_found")
        conn.commit()
    return {"ok": True}


def overview_payload(username):
    memory = parse_meminfo()
    network = network_details()
    apps = apps_payload()
    containers = apps.get("containers", []) if isinstance(apps, dict) else []
    running_apps = sum(1 for app in containers if app.get("state") == "running")
    stopped_apps = max(len(containers) - running_apps, 0)

    ha = vm_agent("status")
    storage = vm_agent("storage_status")
    backups = vm_agent("backup_list")
    network_inventory = vm_agent("network_inventory")
    updates = update_payload()
    favorites = favorites_payload(username)
    shares = shares_payload(username)

    backup_items = backups.get("backups", []) if backups.get("available") else []
    latest_backup = backup_items[0] if backup_items else None
    host_storage = storage.get("host", {}) if storage.get("available") else {}

    warnings = []
    used_percent = host_storage.get("used_percent")
    if isinstance(used_percent, (int, float)) and used_percent >= 80:
        warnings.append({
            "kind": "storage",
            "level": "warning" if used_percent < 90 else "critical",
            "title": "Speicher wird knapp",
            "detail": f"{used_percent}% des Host-Speichers sind belegt.",
            "target": "storage-panel",
        })
    if ha.get("available") and (ha.get("state") != "running" or not ha.get("reachable")):
        warnings.append({
            "kind": "homeassistant",
            "level": "warning",
            "title": "Home Assistant prüfen",
            "detail": "HAOS ist nicht vollständig erreichbar.",
            "target": "vms-panel",
        })
    new_network_devices = int((network_inventory.get("summary") or {}).get("new") or 0) if network_inventory.get("available") else 0
    if new_network_devices:
        warnings.append({
            "kind": "network_device",
            "level": "info",
            "title": f"{new_network_devices} neue Geräte im Heimnetz",
            "detail": "N2K Network hat bisher unbekannte Geräte erkannt.",
            "target": "network-panel",
        })
    if updates.get("available") and updates.get("update_available"):
        warnings.append({
            "kind": "update",
            "level": "info",
            "title": "Update verfügbar",
            "detail": "Ein neuer Netfreak2k-Stand ist verfügbar.",
            "target": "updates-panel",
        })

    healthy = not any(item["level"] in {"warning", "critical"} for item in warnings)
    return {
        "cpu_percent": parse_cpu_percent(),
        "cpu": cpu_topology(),
        "memory": memory,
        "network": network,
        "network_inventory": {
            "available": bool(network_inventory.get("available")),
            "summary": network_inventory.get("summary") or {},
            "last_scan": network_inventory.get("last_scan"),
        },
        "storage": host_storage,
        "uptime_seconds": parse_uptime(),
        "recent": recent_workspace_items(username, 6),
        "upcoming": upcoming_events_payload(username, 4),
        "favorites_count": len(favorites.get("favorites", [])),
        "shares_count": len(shares.get("shares", [])),
        "apps": {"running": running_apps, "stopped": stopped_apps, "total": len(containers)},
        "homeassistant": {
            "state": ha.get("state"),
            "reachable": bool(ha.get("reachable")),
            "available": bool(ha.get("available")),
        },
        "backup": latest_backup,
        "update": {
            "available": bool(updates.get("available")),
            "update_available": bool(updates.get("update_available")),
            "ok": bool(updates.get("ok")),
        },
        "health": {"ok": healthy, "warnings": warnings},
    }


def audio_devices_payload():
    cards = []
    raw_cards = read_text(HOST_PROC / "asound/cards")
    current = None
    for line in raw_cards.splitlines():
        match = re.match(r"\s*(\d+)\s+\[(.+?)\s*\]:\s*(.+)$", line)
        if match:
            current = {
                "index": int(match.group(1)),
                "id": match.group(2).strip(),
                "name": match.group(3).strip(),
                "detail": "",
            }
            cards.append(current)
            continue
        if current and line.strip():
            current["detail"] = line.strip()

    devices = []
    for card in cards:
        text = f'{card["id"]} {card["name"]} {card["detail"]}'.lower()
        kind = "audio"
        if "hdmi" in text:
            kind = "hdmi"
        elif any(token in text for token in ("usb", "dac", "focusrite", "fiio", "scarlett")):
            kind = "usb"
        elif any(token in text for token in ("bluetooth", "bluez")):
            kind = "bluetooth"
        elif any(token in text for token in ("analog", "pch", "ac97", "built-in", "builtin")):
            kind = "local"
        devices.append({
            "id": f'alsa-{card["index"]}',
            "kind": kind,
            "name": card["name"] or card["id"],
            "detail": card["detail"] or card["id"],
            "backend": "ALSA",
            "available": True,
        })

    bluetooth_adapters = []
    bluetooth_root = HOST_SYS / "class" / "bluetooth"
    try:
        if bluetooth_root.exists():
            for item in sorted(bluetooth_root.iterdir()):
                if item.name.startswith("hci"):
                    bluetooth_adapters.append(item.name)
    except OSError:
        pass

    return {
        "devices": devices,
        "bluetooth": {
            "available": bool(bluetooth_adapters),
            "adapters": bluetooth_adapters,
            "note": "Bluetooth routing is handled by the host audio stack.",
        },
        "airplay": {
            "available": False,
            "planned": True,
            "note": "AirPlay receiver/output service not enabled yet.",
        },
        "dlna": {
            "available": False,
            "planned": True,
            "note": "DLNA/UPnP discovery service not enabled yet.",
        },
        "multiroom": {
            "available": False,
            "planned": True,
            "note": "Multiroom grouping will use discovered network outputs.",
        },
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
            "cpu_percent": parse_cpu_percent(),
            "cpu": cpu_topology(),
            "network": network_details(),
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
        start = 0
        end = max(0, size - 1)
        status = 200
        range_header = self.headers.get("Range", "").strip()
        if range_header and size > 0:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header)
            if not match:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            left, right = match.groups()
            try:
                if left:
                    start = int(left)
                    end = int(right) if right else size - 1
                elif right:
                    suffix = min(int(right), size)
                    start = size - suffix
                    end = size - 1
                else:
                    raise ValueError
            except ValueError:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            if start < 0 or end < start or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            end = min(end, size - 1)
            status = 206

        length = max(0, end - start + 1)
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        disposition = "attachment" if download else "inline"
        safe_name = path.name.replace('"', "")
        self.send_header("Content-Disposition", f'{disposition}; filename="{safe_name}"')
        self.end_headers()
        if self.command != "HEAD":
            with path.open("rb") as handle:
                handle.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = handle.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

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

    def client_ip(self):
        peer = self.client_address[0] if self.client_address else ""
        if peer in {"127.0.0.1", "::1"}:
            forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
            if forwarded:
                try:
                    ipaddress.ip_address(forwarded)
                    return forwarded
                except ValueError:
                    pass
        return peer

    def require_auth(self):
        session = self.session()
        if not session:
            self.send_json({"error": "authentication_required"}, 401)
            return None
        return session

    def require_csrf_token(self, session):
        provided = self.headers.get("X-CSRF-Token", "")
        if not provided or not hmac.compare_digest(provided, session["csrf"]):
            self.send_json({"error": "csrf_required"}, 403)
            return False
        return True

    def require_csrf(self, session):
        if not self.require_csrf_token(session):
            return False
        return True

    def require_admin(self, session):
        if not session or session.get("role") != "admin":
            self.send_json({"error": "admin_required"}, 403)
            return False
        return True

    def send_xml(self, xml, status=207, extra_headers=None):
        body = xml.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def sync_auth(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return None
        try:
            raw = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
            username, password = raw.split(":", 1)
        except Exception:
            return None
        username = username.strip()
        if not username or not verify_sync_login(username, password):
            return None
        ensure_workspace(username)
        return username

    def require_sync_auth(self):
        username = self.sync_auth()
        if username:
            return username
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Netfreak2k Sync"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return None

    def read_body(self, max_size=MAX_UPLOAD):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid_length")
        if length < 0 or length > max_size:
            raise ValueError("invalid_body")
        return self.rfile.read(length)

    def dav_file_path(self, username):
        prefix = "/dav/files/"
        path = urlparse(self.path).path
        rel = unquote(path[len(prefix):]) if path.startswith(prefix) else ""
        return dav_resolve(username, rel)

    def caldav_parts(self):
        path = unquote(urlparse(self.path).path)
        prefix = "/dav/calendars/"
        if not path.startswith(prefix):
            return None
        rel = path[len(prefix):].strip("/")
        return [part for part in rel.split("/") if part]

    def set_session_response(self, username):
        ensure_workspace(username)
        token, csrf, _ = new_session(username, self.headers.get("User-Agent", ""), self.client_ip())
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        cookie = (
            f"n2k_session={token}; Path=/; HttpOnly; SameSite=Strict; "
            f"Max-Age={SESSION_TTL}{secure}"
        )
        self.send_json(
            {"authenticated": True, "username": username, "csrf": csrf, "role": user_auth_record(username).get("role", "viewer")},
            200,
            {"Set-Cookie": cookie},
        )

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/dav/files/"):
            username = self.require_sync_auth()
            if not username:
                return
            try:
                _, target, _ = self.dav_file_path(username)
                if target is None or not target.is_file():
                    raise ValueError("not_found")
                self.send_file(target, download=False)
            except ValueError:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return

        if path.startswith("/dav/calendars/"):
            username = self.require_sync_auth()
            if not username:
                return
            parts = self.caldav_parts() or []
            if len(parts) == 3 and parts[0] == username and parts[1] == "default" and parts[2].endswith(".ics"):
                uid = unquote(parts[2][:-4])
                row = calendar_event_by_uid(username, uid)
                if row:
                    ics = row[6] or build_ics_event(row[5] or uid, row[1], row[2], row[3], row[4])
                    body = ics.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/calendar; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("ETag", f'"{(row[7] or row[2]):x}"')
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(body)
                    return
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/update/progress":
            progress = read_json_file(UPDATE_PROGRESS_FILE)
            self.send_json(progress or {
                "state": "idle",
                "progress": 0,
                "step": "idle",
                "message": "Kein Update-Vorgang aktiv.",
            })
            return

        if path == "/healthz":
            self.send_json({"status": "ok"})
            return

        if path == "/share":
            try:
                token = (query.get("token") or [""])[0]
                target, _ = share_resolve(token)
                self.send_file(target, download=True)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 404)
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
                    "role": session.get("role", "viewer"),
                }
            )
            return

        if path == "/security":
            session = self.require_auth()
            if not session:
                return
            self.send_json(security_payload(session["username"]))
            return

        if path == "/remote-access":
            session = self.require_auth()
            if not session:
                return
            result = vm_agent("remote_access_status")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/status":
            if not self.require_auth():
                return
            self.send_json(status_payload())
            return

        if path == "/overview":
            session = self.require_auth()
            if not session:
                return
            self.send_json(overview_payload(session["username"]))
            return

        if path == "/health":
            if not self.require_auth():
                return
            period = (query.get("range") or ["24h"])[0]
            if period not in {"24h", "7d"}:
                period = "24h"
            self.send_json(system_health_payload(period))
            return

        if path == "/security/host":
            if not self.require_auth():
                return
            result = vm_agent("security_status")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/service/logs":
            if not self.require_auth():
                return
            unit = str((query.get("unit") or [""])[0]).strip()
            try:
                lines = int((query.get("lines") or ["100"])[0])
            except (TypeError, ValueError):
                lines = 100
            result = vm_agent("service_logs", {"unit": unit, "lines": lines})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/hardware":
            if not self.require_auth():
                return
            result = vm_agent("hardware_status")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/notifications":
            if not self.require_auth():
                return
            self.send_json(notifications_payload())
            return

        if path == "/apps":
            if not self.require_auth():
                return
            live = vm_agent("app_diagnostics")
            if live.get("available"):
                self.send_json(live)
            else:
                self.send_json(apps_payload())
            return

        if path == "/apps/logs":
            if not self.require_auth():
                return
            name = str((query.get("name") or [""])[0]).strip()
            try:
                lines = int((query.get("lines") or ["120"])[0])
            except (TypeError, ValueError):
                lines = 120
            result = vm_agent("app_logs", {"name": name, "lines": lines})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
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

        if path == "/updates/preflight":
            if not self.require_auth():
                return
            result = vm_agent("update_preflight")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
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

        if path == "/network/devices":
            if not self.require_auth():
                return
            result = vm_agent("network_inventory")
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

        if path == "/media/artwork":
            session = self.require_auth()
            if not session:
                return
            try:
                rel = (query.get("path") or [""])[0]
                name = (query.get("name") or [""])[0]
                if not name or "/" in name or "\\" in name:
                    raise ValueError("invalid_name")
                _, parent = workspace_target(session["username"], "audio", rel)
                target = (parent / name).resolve()
                base = workspace_base(session["username"], "audio").resolve()
                if base not in target.parents or not target.is_file():
                    raise ValueError("not_found")
                data, mime = audio_artwork_for_file(target)
                if not data:
                    self.send_json({"error": "artwork_not_found"}, 404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", mime or "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "private, max-age=3600")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/media/library":
            session = self.require_auth()
            if not session:
                return
            self.send_json(media_audio_library(session["username"]))
            return

        if path == "/media/devices":
            if not self.require_auth():
                return
            payload = audio_devices_payload()
            live = vm_agent("audio_status")
            payload["routing"] = live if live.get("available") else {
                "available": False,
                "error": live.get("error", "audio_agent_unavailable"),
            }
            self.send_json(payload)
            return

        if path == "/media/radio/metadata":
            if not self.require_auth():
                return
            stream_url = (query.get("url") or [""])[0]
            try:
                self.send_json(radio_stream_metadata(stream_url))
            except ValueError as exc:
                self.send_json({"available": False, "error": str(exc)}, 400)
            return

        if path == "/media/radio":
            if not self.require_auth():
                return
            country = (query.get("country") or ["DE"])[0]
            search = (query.get("search") or [""])[0]
            limit = (query.get("limit") or ["60"])[0]
            payload = radio_browser_stations(country, search, limit)
            self.send_json(payload, 200 if payload.get("stations") else 503)
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

        if path == "/search":
            session = self.require_auth()
            if not session:
                return
            self.send_json(workspace_search(session["username"], (query.get("q") or [""])[0]))
            return

        if path == "/favorites":
            session = self.require_auth()
            if not session:
                return
            self.send_json(favorites_payload(session["username"]))
            return

        if path == "/shares":
            session = self.require_auth()
            if not session:
                return
            self.send_json(shares_payload(session["username"]))
            return

        if path == "/workspace/versions":
            session = self.require_auth()
            if not session:
                return
            try:
                self.send_json(versions_payload(
                    session["username"],
                    (query.get("area") or ["documents"])[0],
                    (query.get("path") or [""])[0],
                    (query.get("name") or [""])[0],
                ))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/sync/credentials":
            session = self.require_auth()
            if not session:
                return
            payload = sync_credentials_payload(session["username"])
            payload["webdav_url"] = "/dav/files/"
            payload["caldav_url"] = f'/dav/calendars/{quote(session["username"])}/default/'
            self.send_json(payload)
            return

        if path == "/preferences":
            session = self.require_auth()
            if not session:
                return
            self.send_json(preferences_payload(session["username"]))
            return

        if path == "/calendar":
            session = self.require_auth()
            if not session:
                return
            self.send_json(calendar_payload(session["username"]))
            return

        self.send_json({"error": "not_found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

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
                audit_event(username or "unknown", "login_failed", "Ungültige Zugangsdaten", self.client_ip())
                self.send_json({"error": "invalid_credentials"}, 401)
                return
            record = user_auth_record(username)
            if record and record.get("totp_enabled"):
                code = str(data.get("totp", ""))
                if not verify_totp(record.get("totp_secret") or "", code):
                    self.send_json({"error": "totp_required"}, 401)
                    return
            audit_event(username, "login", "Anmeldung erfolgreich", self.client_ip())
            self.set_session_response(username)
            return

        viewer_mutation_session = self.session()
        viewer_allowed_posts = {"/logout", "/notifications/read", "/security/totp/begin", "/security/totp/confirm", "/security/totp/disable", "/security/session/revoke"}
        if viewer_mutation_session and viewer_mutation_session.get("role") == "viewer" and path not in viewer_allowed_posts:
            self.send_json({"error": "read_only_role"}, 403)
            return

        if path == "/power/action":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                operation = str(data.get("operation", "")).strip().lower()
                if operation not in {"reboot", "poweroff"}:
                    raise ValueError("invalid_power_action")
                result = vm_agent("host_power_action", {"operation": operation})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "host_power_action", operation, self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/vms/action":
            session = self.require_auth()
            if not session or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                name = str(data.get("name", "")).strip()
                operation = str(data.get("operation", "")).strip().lower()
                if operation not in {"start", "shutdown", "restart"}:
                    raise ValueError("invalid_vm_action")
                result = vm_agent("vm_action", {"name": name, "operation": operation})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "vm_action", f"{operation}:{name}"[:500], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/vms/snapshot":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                name = str(data.get("name", "")).strip()
                result = vm_agent("vm_snapshot_create", {"name": name})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "vm_snapshot_create", name[:300], self.client_ip())
                self.send_json(result, 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/storage/mount":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                device = str(data.get("device", "")).strip()
                result = vm_agent("storage_mount", {"device": device})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "storage_mount", device[:300], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/storage/unmount":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                device = str(data.get("device", "")).strip()
                result = vm_agent("storage_unmount", {"device": device})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "storage_unmount", device[:300], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/service/action":
            session = self.require_auth()
            if not session or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                unit = str(data.get("unit", "")).strip()
                operation = str(data.get("operation", "")).strip().lower()
                result = vm_agent("service_action", {"unit": unit, "operation": operation})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "service_action", f"{operation}:{unit}"[:500], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/remote-access/configure":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                mode = str(data.get("mode", "")).strip()
                domain = str(data.get("domain", "")).strip()
                email = str(data.get("email", "")).strip()
                result = vm_agent("remote_access_configure", {"mode": mode, "domain": domain, "email": email})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "remote_access_configure", f"{mode}:{domain}"[:500], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/remote-access/renew":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            result = vm_agent("remote_access_renew")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            audit_event(session["username"], "certificate_renew", "", self.client_ip())
            self.send_json(result)
            return

        if path == "/security/users/create":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                username = str(data.get("username", "")).strip()
                create_user_account(username, str(data.get("password", "")), str(data.get("role", "viewer")))
                audit_event(session["username"], "user_create", username, self.client_ip())
                self.send_json({"ok": True}, 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/security/users/update":
            session = self.require_auth()
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                username = str(data.get("username", "")).strip()
                update_user_account(username, data.get("role"), data.get("enabled") if "enabled" in data else None)
                audit_event(session["username"], "user_update", username, self.client_ip())
                self.send_json({"ok": True})
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/security/totp/begin":
            session = self.require_auth()
            if not session or not self.require_csrf_token(session):
                return
            result = begin_totp_setup(session["username"])
            audit_event(session["username"], "totp_begin", "", self.client_ip())
            self.send_json(result)
            return

        if path == "/security/totp/confirm":
            session = self.require_auth()
            if not session or not self.require_csrf_token(session):
                return
            try:
                data = self.read_json()
                confirm_totp_setup(session["username"], data.get("code"))
                audit_event(session["username"], "totp_enable", "", self.client_ip())
                self.send_json({"ok": True})
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/security/totp/disable":
            session = self.require_auth()
            if not session or not self.require_csrf_token(session):
                return
            disable_totp(session["username"])
            audit_event(session["username"], "totp_disable", "", self.client_ip())
            self.send_json({"ok": True})
            return

        if path == "/security/session/revoke":
            session = self.require_auth()
            if not session or not self.require_csrf_token(session):
                return
            try:
                data = self.read_json()
                session_id = str(data.get("id", ""))
                if not re.fullmatch(r"[0-9a-f]{16}", session_id):
                    raise ValueError("invalid_session")
                with db_connect() as conn:
                    rows = conn.execute("SELECT token_hash,username FROM sessions WHERE token_hash LIKE ?", (session_id + "%",)).fetchall()
                    allowed = [row for row in rows if session.get("role") == "admin" or row[1] == session["username"]]
                    if len(allowed) != 1:
                        raise ValueError("session_not_found")
                    conn.execute("DELETE FROM sessions WHERE token_hash=?", (allowed[0][0],))
                    conn.commit()
                audit_event(session["username"], "session_revoke", allowed[0][1], self.client_ip())
                self.send_json({"ok": True})
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/notifications/read":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                result = mark_notification_read(data.get("id"), bool(data.get("all")))
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/network/scan":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            result = vm_agent("network_scan")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
            return

        if path == "/network/device/wake":
            session = self.require_auth()
            if not session or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                device_id = str(data.get("device_id", "")).strip()
                if not re.fullmatch(r"[0-9a-f]{20}", device_id):
                    raise ValueError("invalid_device_id")
                result = vm_agent("network_device_wake", {"device_id": device_id})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "network_device_wake", device_id, self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/network/device/analyze":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                device_id = str(data.get("device_id", "")).strip()
                if not re.fullmatch(r"[0-9a-f]{20}", device_id):
                    raise ValueError("invalid_device_id")
                result = vm_agent("network_device_analyze", {"device_id": device_id})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/network/device/update":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                device_id = str(data.get("device_id", "")).strip()
                fields = data.get("fields")
                if not re.fullmatch(r"[0-9a-f]{20}", device_id) or not isinstance(fields, dict):
                    raise ValueError("invalid_device_update")
                allowed = {"custom_name", "notes", "trusted", "device_type"}
                clean = {key: value for key, value in fields.items() if key in allowed}
                if not clean:
                    raise ValueError("invalid_device_update")
                result = vm_agent("network_device_update", {"device_id": device_id, "fields": clean})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/media/output":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                node_id = str(data.get("node_id", "")).strip()
                if not re.fullmatch(r"[0-9]{1,6}", node_id):
                    raise ValueError("invalid_audio_node")
                result = vm_agent("audio_set_default", {"node_id": node_id})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/media/bluetooth":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                action = str(data.get("action", "")).strip()
                mac = str(data.get("mac", "")).strip().upper()
                if action not in {"connect", "disconnect"}:
                    raise ValueError("invalid_bluetooth_action")
                if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", mac):
                    raise ValueError("invalid_bluetooth_mac")
                mapped = "bluetooth_connect" if action == "connect" else "bluetooth_disconnect"
                result = vm_agent(mapped, {"mac": mac})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/media/airplay":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                action = str(data.get("action", "")).strip()
                mapping = {"enable": "audio_airplay_enable", "disable": "audio_airplay_disable"}
                if action not in mapping:
                    raise ValueError("invalid_airplay_action")
                result = vm_agent(mapping[action])
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/media/multiroom":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                action = str(data.get("action", "")).strip()
                if action == "set":
                    sinks = data.get("sinks")
                    if not isinstance(sinks, list) or not (2 <= len(sinks) <= 8):
                        raise ValueError("invalid_multiroom_sinks")
                    clean = []
                    for item in sinks:
                        value = str(item or "").strip()
                        if not value or len(value) > 180:
                            raise ValueError("invalid_multiroom_sink")
                        if value not in clean:
                            clean.append(value)
                    if len(clean) < 2:
                        raise ValueError("invalid_multiroom_sinks")
                    result = vm_agent("audio_multiroom_set", {"sinks": clean})
                elif action == "clear":
                    result = vm_agent("audio_multiroom_clear")
                else:
                    raise ValueError("invalid_multiroom_action")
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
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
                replace = (query.get("replace") or ["0"])[0] == "1"
                if target.exists():
                    if not replace or not target.is_file():
                        raise ValueError("already_exists")
                    version_snapshot(session["username"], area, rel, name, target)
                payload = self.read_binary()
                target.write_bytes(payload)
                self.send_json({"uploaded": True, "name": name, "size_bytes": len(payload), "replaced": replace}, 201)
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

        if path == "/workspace/rename":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(workspace_rename(
                    session["username"],
                    str(data.get("area", "documents")),
                    str(data.get("path", "")),
                    str(data.get("old_name", "")).strip(),
                    str(data.get("new_name", "")).strip(),
                ))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/restore":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(workspace_restore(session["username"], str(data.get("name", "")).strip()))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/share":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(share_create(
                    session["username"],
                    str(data.get("area", "documents")),
                    str(data.get("path", "")),
                    str(data.get("name", "")).strip(),
                    data.get("hours", 24),
                ), 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/favorites/toggle":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(favorite_toggle(
                    session["username"],
                    str(data.get("area", "documents")),
                    str(data.get("path", "")),
                    str(data.get("name", "")),
                ))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/shares/revoke":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(share_revoke(session["username"], str(data.get("token", ""))))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/transfer":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(workspace_transfer(
                    session["username"],
                    str(data.get("mode", "")),
                    str(data.get("source_area", "documents")),
                    str(data.get("source_path", "")),
                    str(data.get("name", "")),
                    str(data.get("target_area", "documents")),
                    str(data.get("target_path", "")),
                ))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/workspace/version/restore":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(version_restore(session["username"], data.get("id")))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/preferences":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                key = str(data.get("key", ""))
                value = data.get("value")
                self.send_json(set_preference(session["username"], key, value))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/sync/credentials/create":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(create_sync_credential(session["username"], data.get("label", "Sync")), 201)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/sync/credentials/revoke":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                self.send_json(revoke_sync_credential(session["username"], data.get("id")))
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

        if path == "/backups/verify":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                backup_id = str(data.get("backup_id", ""))
                result = vm_agent("backup_verify", {"backup_id": backup_id})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/backups/test-restore":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                backup_id = str(data.get("backup_id", ""))
                result = vm_agent("backup_test_restore", {"backup_id": backup_id})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/backups/policy":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                fields = data.get("fields")
                if not isinstance(fields, dict):
                    raise ValueError("invalid_backup_policy")
                result = vm_agent("backup_policy_set", {"fields": fields})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
            return

        if path == "/backups/prune":
            session = self.require_auth()
            if not session:
                return
            if not self.require_csrf(session):
                return
            result = vm_agent("backup_prune")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result)
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
            options = data.get("options") if isinstance(data.get("options"), dict) else {}
            result = vm_agent("app_install", {"app_id": app_id, "options": options})
            if not result.get("available"):
                self.send_json(result, 503)
                return
            self.send_json(result, 201)
            return

        if path == "/apps/update-check":
            session = self.require_auth()
            if not session or not self.require_csrf(session):
                return
            try:
                data = self.read_json()
                name = str(data.get("name", "")).strip()
                result = vm_agent("app_update_check", {"name": name})
                if not result.get("available"):
                    self.send_json(result, 503)
                    return
                audit_event(session["username"], "app_update_check", name[:300], self.client_ip())
                self.send_json(result)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
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
            audit_event(session["username"], "app_action", f"{action}:{name}"[:500], self.client_ip())
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
            if not session or not self.require_admin(session) or not self.require_csrf(session):
                return
            result = vm_agent("update_safe_netfreak2k")
            if not result.get("available"):
                self.send_json(result, 503)
                return
            backup_id = str((result.get("backup") or {}).get("id") or "")
            audit_event(session["username"], "system_update_start", backup_id[:300], self.client_ip())
            self.send_json(result, 202)
            return

        if path == "/logout":
            session = self.require_auth()
            if not session:
                return
            provided = self.headers.get("X-CSRF-Token", "")
            if not provided or not hmac.compare_digest(provided, session["csrf"]):
                self.send_json({"error": "csrf_required"}, 403)
                return
            token = self.session_token()
            audit_event(session["username"], "logout", "", self.client_ip())
            delete_session(token)
            self.send_json(
                {"authenticated": False},
                200,
                {"Set-Cookie": "n2k_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"},
            )
            return

        self.send_json({"error": "not_found"}, 404)

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path.startswith("/dav/"):
            if not self.require_sync_auth():
                return
            self.send_response(200)
            self.send_header("DAV", "1, 2, calendar-access")
            self.send_header("Allow", "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY, REPORT")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path.startswith("/dav/files/") or path.startswith("/dav/calendars/"):
            self.do_GET()
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_PROPFIND(self):
        path = urlparse(self.path).path
        username = self.require_sync_auth()
        if not username:
            return
        depth = self.headers.get("Depth", "0")

        if path.startswith("/dav/files/"):
            try:
                rel = unquote(path[len("/dav/files/"):]).strip("/")
                _, target, roots = dav_resolve(username, rel)
                responses = []
                if not rel:
                    responses.append(dav_prop_response("/dav/files/", collection=True, display_name="N2K Drive"))
                    if depth != "0":
                        for name, root in roots.items():
                            responses.append(dav_prop_response(dav_href(name) + "/", root, True, name))
                else:
                    if target is None or not target.exists():
                        raise ValueError("dav_not_found")
                    is_collection = target.is_dir()
                    href = dav_href(rel) + ("/" if is_collection else "")
                    responses.append(dav_prop_response(href, target, is_collection, target.name))
                    if is_collection and depth != "0":
                        for child in sorted(target.iterdir(), key=lambda item: item.name.lower()):
                            if child.name.startswith("."):
                                continue
                            child_rel = f"{rel}/{child.name}"
                            child_href = dav_href(child_rel) + ("/" if child.is_dir() else "")
                            responses.append(dav_prop_response(child_href, child, child.is_dir(), child.name))
                xml_body = '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">' + "".join(responses) + "</d:multistatus>"
                self.send_xml(xml_body)
            except ValueError:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return

        if path.startswith("/dav/calendars/"):
            parts = self.caldav_parts() or []
            esc = xml.sax.saxutils.escape
            responses = []
            if not parts:
                responses.append(
                    '<d:response><d:href>/dav/calendars/</d:href><d:propstat><d:prop>'
                    '<d:displayname>N2K Calendar</d:displayname>'
                    '<d:resourcetype><d:collection/></d:resourcetype>'
                    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                )
            elif parts == [username] or parts == [username, "default"]:
                href = f"/dav/calendars/{quote(username)}/" + ("default/" if len(parts) == 2 else "")
                resource = '<d:collection/><c:calendar/>' if len(parts) == 2 else '<d:collection/>'
                responses.append(
                    f'<d:response><d:href>{esc(href)}</d:href><d:propstat><d:prop>'
                    f'<d:displayname>{"Kalender" if len(parts)==2 else esc(username)}</d:displayname>'
                    f'<d:resourcetype>{resource}</d:resourcetype>'
                    '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>'
                    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                )
                if len(parts) == 2 and depth != "0":
                    with db_connect() as conn:
                        rows = conn.execute(
                            "SELECT uid,title,start_at,end_at,notes,raw_ics,updated_at FROM calendar_events WHERE username=? ORDER BY start_at",
                            (username,),
                        ).fetchall()
                    for row in rows:
                        uid = row[0] or f"event-{row[2]}"
                        href = f"/dav/calendars/{quote(username)}/default/{quote(uid)}.ics"
                        responses.append(
                            f'<d:response><d:href>{esc(href)}</d:href><d:propstat><d:prop>'
                            '<d:resourcetype/>'
                            f'<d:getetag>"{(row[6] or row[2]):x}"</d:getetag>'
                            '<d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>'
                            '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                        )
            else:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            xml_body = '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' + "".join(responses) + "</d:multistatus>"
            self.send_xml(xml_body)
            return

        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_REPORT(self):
        path = urlparse(self.path).path
        username = self.require_sync_auth()
        if not username:
            return
        parts = self.caldav_parts() or []
        if not (path.startswith("/dav/calendars/") and parts == [username, "default"]):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        with db_connect() as conn:
            rows = conn.execute(
                "SELECT uid,title,start_at,end_at,notes,raw_ics,updated_at FROM calendar_events WHERE username=? ORDER BY start_at",
                (username,),
            ).fetchall()
        esc = xml.sax.saxutils.escape
        responses = []
        for row in rows:
            uid = row[0] or f"event-{row[2]}"
            ics = row[5] or build_ics_event(uid, row[1], row[2], row[3], row[4])
            href = f"/dav/calendars/{quote(username)}/default/{quote(uid)}.ics"
            responses.append(
                f'<d:response><d:href>{esc(href)}</d:href><d:propstat><d:prop>'
                f'<d:getetag>"{(row[6] or row[2]):x}"</d:getetag>'
                f'<c:calendar-data>{esc(ics)}</c:calendar-data>'
                '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
            )
        xml_body = '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' + "".join(responses) + "</d:multistatus>"
        self.send_xml(xml_body)

    def do_MKCOL(self):
        path = urlparse(self.path).path
        username = self.require_sync_auth()
        if not username:
            return
        if not path.startswith("/dav/files/"):
            self.send_response(405)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            _, target, _ = self.dav_file_path(username)
            if target is None or target.exists() or not target.parent.is_dir():
                raise ValueError("invalid_collection")
            target.mkdir()
            self.send_response(201)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except (ValueError, OSError):
            self.send_response(409)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def do_PUT(self):
        path = urlparse(self.path).path
        username = self.require_sync_auth()
        if not username:
            return

        if path.startswith("/dav/files/"):
            try:
                _, target, _ = self.dav_file_path(username)
                if target is None or not target.parent.is_dir():
                    raise ValueError("invalid_target")
                existed = target.exists()
                if existed and not target.is_file():
                    raise ValueError("invalid_target")
                payload = self.read_body(MAX_UPLOAD)
                target.write_bytes(payload)
                self.send_response(204 if existed else 201)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except (ValueError, OSError):
                self.send_response(409)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return

        if path.startswith("/dav/calendars/"):
            parts = self.caldav_parts() or []
            if len(parts) == 3 and parts[0] == username and parts[1] == "default" and parts[2].endswith(".ics"):
                uid = unquote(parts[2][:-4])
                try:
                    existed = calendar_event_by_uid(username, uid) is not None
                    ics = self.read_body(MAX_BODY * 8).decode("utf-8")
                    upsert_caldav_event(username, uid, ics)
                    self.send_response(204 if existed else 201)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                except (ValueError, UnicodeDecodeError):
                    self.send_response(400)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                return

        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_DELETE(self):
        path = urlparse(self.path).path
        username = self.require_sync_auth()
        if not username:
            return

        if path.startswith("/dav/files/"):
            try:
                _, target, _ = self.dav_file_path(username)
                if target is None or not target.exists():
                    raise ValueError("not_found")
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except ValueError:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return

        if path.startswith("/dav/calendars/"):
            parts = self.caldav_parts() or []
            if len(parts) == 3 and parts[0] == username and parts[1] == "default" and parts[2].endswith(".ics"):
                uid = unquote(parts[2][:-4])
                with db_connect() as conn:
                    cur = conn.execute("DELETE FROM calendar_events WHERE username=? AND uid=?", (username, uid))
                    conn.commit()
                self.send_response(204 if cur.rowcount else 404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _dav_transfer(self, move=False):
        username = self.require_sync_auth()
        if not username:
            return
        source_path = urlparse(self.path).path
        if not source_path.startswith("/dav/files/"):
            self.send_response(405)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        destination = self.headers.get("Destination", "")
        dest_path = urlparse(destination).path
        if not dest_path.startswith("/dav/files/"):
            self.send_response(400)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            _, source, _ = self.dav_file_path(username)
            rel = unquote(dest_path[len("/dav/files/"):])
            _, target, _ = dav_resolve(username, rel)
            if source is None or target is None or not source.exists() or target.exists() or not target.parent.is_dir():
                raise ValueError("invalid_transfer")
            if move:
                shutil.move(str(source), str(target))
            elif source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
            self.send_response(201)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except (ValueError, OSError):
            self.send_response(409)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def do_MOVE(self):
        self._dav_transfer(move=True)

    def do_COPY(self):
        self._dav_transfer(move=False)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    db_connect().close()
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
