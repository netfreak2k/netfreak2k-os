#!/usr/bin/env python3
import hmac
import json
import os
import re
import secrets
import socket
import subprocess
import shutil
import time
from pathlib import Path

SOCKET_PATH = Path("/run/netfreak2k/vm-agent.sock")
TOKEN_FILE = Path(os.environ.get("N2K_AGENT_TOKEN_FILE", "/var/lib/netfreak2k/agent.token"))
VM_NAME = "netfreak2k-homeassistant"
HA_IP = "192.168.122.50"
UPDATE_SCRIPT = "/opt/netfreak2k/scripts/update-server.sh"
ALLOWED = {
    "status", "start", "shutdown", "restart", "update_netfreak2k",
    "app_start", "app_stop", "app_restart",
    "app_catalog", "app_install", "storage_status",
    "backup_list", "backup_create", "backup_restore", "vm_list"
}
CONTAINER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
BACKUP_ID_RE = re.compile(r"^n2k-[0-9]{8}-[0-9]{6}$")
BACKUP_DIR = Path("/var/lib/netfreak2k/backups")

APP_CATALOG = {
    "uptime-kuma": {
        "name": "Uptime Kuma",
        "description": "Lokales Monitoring für Dienste, Webseiten und Geräte.",
        "image": "louislam/uptime-kuma:1",
        "container": "netfreak2k-app-uptime-kuma",
        "host_port": 3001,
        "container_port": 3001,
        "volume": "netfreak2k-app-uptime-kuma-data",
        "mount": "/app/data",
    },
    "file-browser": {
        "name": "File Browser",
        "description": "Einfacher Dateimanager im Browser mit eigenem Netfreak2k-Datenbereich.",
        "image": "filebrowser/filebrowser:v2",
        "container": "netfreak2k-app-file-browser",
        "host_port": 8081,
        "container_port": 80,
        "volume": "netfreak2k-app-file-browser-data",
        "mount": "/srv",
    },
}


def read_token():
    try:
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    except OSError:
        pass

    try:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        token = secrets.token_urlsafe(48)
        TOKEN_FILE.write_text(token + "\n", encoding="utf-8")
        os.chown(TOKEN_FILE, 0, 65534)
        os.chmod(TOKEN_FILE, 0o640)
        return token
    except OSError:
        return ""


def run(*args, check=False, timeout=20):
    result = subprocess.run(
        list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command_failed")
    return result


def vm_exists():
    return run("virsh", "--connect", "qemu:///system", "dominfo", VM_NAME).returncode == 0


def vm_state():
    if not vm_exists():
        return "missing"
    result = run("virsh", "--connect", "qemu:///system", "domstate", VM_NAME)
    if result.returncode != 0:
        return "unknown"
    return result.stdout.strip().lower()


def ha_reachable():
    try:
        with socket.create_connection((HA_IP, 8123), timeout=0.8):
            return True
    except OSError:
        return False


def payload():
    state = vm_state()
    return {
        "name": VM_NAME,
        "state": state,
        "installed": state != "missing",
        "reachable": ha_reachable() if state == "running" else False,
    }


def trigger_update():
    if not Path(UPDATE_SCRIPT).is_file():
        raise RuntimeError("update_script_missing")

    result = subprocess.run(
        [
            "systemd-run",
            "--unit=netfreak2k-web-update",
            "--collect",
            "--property=Type=exec",
            UPDATE_SCRIPT,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        if "already exists" in result.stderr.lower():
            return {"accepted": True, "already_running": True}
        raise RuntimeError(result.stderr.strip() or "update_start_failed")
    return {"accepted": True, "already_running": False}


def managed_container_state(name):
    if not CONTAINER_RE.fullmatch(name):
        raise RuntimeError("invalid_container_name")

    label = run(
        "docker", "inspect", "--format",
        '{{ index .Config.Labels "netfreak2k.managed" }}',
        name,
    )
    if label.returncode != 0:
        raise RuntimeError("container_not_found")
    if label.stdout.strip().lower() != "true":
        raise RuntimeError("container_not_managed")

    state = run("docker", "inspect", "--format", "{{.State.Status}}", name, check=True)
    return state.stdout.strip()


def app_action(action, name):
    managed_container_state(name)
    if action == "app_start":
        run("docker", "start", name, check=True)
    elif action == "app_stop":
        run("docker", "stop", "--time", "20", name, check=True, timeout=30)
    elif action == "app_restart":
        run("docker", "restart", "--time", "20", name, check=True, timeout=30)
    else:
        raise RuntimeError("unsupported_action")
    return {"name": name, "state": managed_container_state(name)}


def container_state(name):
    result = run("docker", "inspect", "--format", "{{.State.Status}}", name)
    return result.stdout.strip() if result.returncode == 0 else None


def catalog_payload():
    apps = []
    for app_id, spec in APP_CATALOG.items():
        state = container_state(spec["container"])
        apps.append({
            "id": app_id,
            "name": spec["name"],
            "description": spec["description"],
            "image": spec["image"],
            "host_port": spec["host_port"],
            "installed": state is not None,
            "state": state or "not_installed",
            "url_path": "/",
        })
    return {"apps": apps}


def port_available(port):
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("0.0.0.0", int(port)))
        return True
    except OSError:
        return False
    finally:
        probe.close()


def install_catalog_app(app_id):
    spec = APP_CATALOG.get(app_id)
    if not spec:
        raise RuntimeError("unknown_catalog_app")
    if container_state(spec["container"]) is not None:
        return {"installed": True, "name": spec["container"], "already_installed": True}
    if not port_available(spec["host_port"]):
        raise RuntimeError("app_port_in_use")

    run("docker", "pull", spec["image"], check=True, timeout=300)
    run("docker", "volume", "create", spec["volume"], check=True)
    run(
        "docker", "run", "-d",
        "--name", spec["container"],
        "--restart", "unless-stopped",
        "--label", "netfreak2k.managed=true",
        "--label", f"netfreak2k.app={app_id}",
        "-p", f'{spec["host_port"]}:{spec["container_port"]}',
        "-v", f'{spec["volume"]}:{spec["mount"]}',
        spec["image"],
        check=True,
        timeout=120,
    )
    return {
        "installed": True,
        "name": spec["container"],
        "state": container_state(spec["container"]) or "unknown",
        "host_port": spec["host_port"],
    }


def storage_payload():
    usage = shutil.disk_usage("/")
    used = usage.total - usage.free
    percent = round((used / usage.total) * 100, 1) if usage.total else None
    haos_disk = Path("/var/lib/netfreak2k/haos/haos.qcow2")
    haos_size = haos_disk.stat().st_size if haos_disk.exists() else None
    return {
        "host": {
            "total_bytes": usage.total,
            "used_bytes": used,
            "free_bytes": usage.free,
            "used_percent": percent,
        },
        "haos_disk_bytes": haos_size,
    }


def vm_list_payload():
    result = run(
        "virsh", "--connect", "qemu:///system",
        "list", "--all", "--name",
        check=True,
    )
    vms = []
    for name in [line.strip() for line in result.stdout.splitlines() if line.strip()]:
        state_result = run("virsh", "--connect", "qemu:///system", "domstate", name)
        state = state_result.stdout.strip().lower() if state_result.returncode == 0 else "unknown"
        vms.append({
            "name": name,
            "state": state,
            "managed": name == VM_NAME,
        })
    return {"vms": vms}


def backup_list_payload():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backups = []
    for path in sorted(BACKUP_DIR.iterdir(), reverse=True):
        if not path.is_dir() or not BACKUP_ID_RE.fullmatch(path.name):
            continue
        meta_file = path / "meta.json"
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            meta = {}
        size = 0
        for item in path.rglob("*"):
            try:
                if item.is_file():
                    size += item.stat().st_size
            except OSError:
                pass
        backups.append({
            "id": path.name,
            "created_at": meta.get("created_at"),
            "size_bytes": size,
            "apps": meta.get("apps", []),
        })
    return {"backups": backups[:20]}


def backup_create():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_id = time.strftime("n2k-%Y%m%d-%H%M%S", time.localtime())
    target = BACKUP_DIR / backup_id
    target.mkdir(mode=0o700)
    apps = []

    env_file = Path("/opt/netfreak2k/server/.env")
    if env_file.is_file():
        shutil.copy2(env_file, target / "server.env")

    db_target = target / "netfreak2k.db"
    db_backup_inside = "/data/.netfreak2k-backup.db"
    result = run(
        "docker", "exec", "netfreak2k-api", "python3", "-c",
        "import sqlite3; src=sqlite3.connect('/data/netfreak2k.db'); dst=sqlite3.connect('/data/.netfreak2k-backup.db'); src.backup(dst); dst.close(); src.close()",
        timeout=30,
    )
    if result.returncode == 0:
        run("docker", "cp", f"netfreak2k-api:{db_backup_inside}", str(db_target), check=True)
        run("docker", "exec", "netfreak2k-api", "rm", "-f", db_backup_inside)

    apps_dir = target / "apps"
    apps_dir.mkdir()
    for app_id, spec in APP_CATALOG.items():
        if container_state(spec["container"]) is None:
            continue
        app_target = apps_dir / app_id
        app_target.mkdir()
        cp_result = run(
            "docker", "cp",
            f'{spec["container"]}:{spec["mount"]}/.',
            str(app_target),
            timeout=120,
        )
        if cp_result.returncode == 0:
            apps.append(app_id)

    meta = {
        "id": backup_id,
        "created_at": int(time.time()),
        "apps": apps,
        "includes": ["netfreak2k-admin-db", "managed-app-data", "server-env"],
    }
    (target / "meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    return {"created": True, "backup": backup_list_payload()["backups"][0]}


def backup_restore(backup_id):
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise RuntimeError("invalid_backup_id")
    source = BACKUP_DIR / backup_id
    if not source.is_dir():
        raise RuntimeError("backup_not_found")

    restore_script = Path("/opt/netfreak2k/scripts/restore-server.sh")
    if not restore_script.is_file():
        raise RuntimeError("restore_script_missing")

    result = subprocess.run(
        [
            "systemd-run",
            f"--unit=netfreak2k-restore-{backup_id}",
            "--collect",
            "--property=Type=exec",
            str(restore_script),
            backup_id,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "restore_start_failed")
    return {"accepted": True, "backup_id": backup_id}


def execute(action, request):
    if action == "status":
        return payload()

    if action == "update_netfreak2k":
        return trigger_update()

    if action in {"app_start", "app_stop", "app_restart"}:
        return app_action(action, str(request.get("name", "")))

    if action == "app_catalog":
        return catalog_payload()

    if action == "app_install":
        return install_catalog_app(str(request.get("app_id", "")))

    if action == "storage_status":
        return storage_payload()

    if action == "vm_list":
        return vm_list_payload()

    if action == "backup_list":
        return backup_list_payload()

    if action == "backup_create":
        return backup_create()

    if action == "backup_restore":
        return backup_restore(str(request.get("backup_id", "")))

    state = vm_state()
    if state == "missing":
        raise RuntimeError("haos_not_installed")

    if action == "start":
        if state != "running":
            run("virsh", "--connect", "qemu:///system", "start", VM_NAME, check=True)
    elif action == "shutdown":
        if state == "running":
            run("virsh", "--connect", "qemu:///system", "shutdown", VM_NAME, check=True)
    elif action == "restart":
        if state == "running":
            run("virsh", "--connect", "qemu:///system", "reboot", VM_NAME, check=True)
        else:
            run("virsh", "--connect", "qemu:///system", "start", VM_NAME, check=True)
    else:
        raise RuntimeError("unsupported_action")

    time.sleep(0.5)
    return payload()


def serve():
    SOCKET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SOCKET_PATH.exists():
        SOCKET_PATH.unlink()

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(SOCKET_PATH))
    os.chmod(SOCKET_PATH, 0o666)
    server.listen(8)

    while True:
        conn, _ = server.accept()
        with conn:
            try:
                raw = b""
                while b"\n" not in raw and len(raw) < 8192:
                    chunk = conn.recv(4096)
                    if not chunk:
                        break
                    raw += chunk

                request = json.loads(raw.decode("utf-8").strip() or "{}")
                action = str(request.get("action", "status"))
                supplied_token = str(request.get("token", ""))
                expected_token = read_token()

                if not expected_token or not supplied_token or not hmac.compare_digest(supplied_token, expected_token):
                    raise RuntimeError("agent_auth_failed")
                if action not in ALLOWED:
                    raise RuntimeError("unsupported_action")

                response = {"ok": True, "data": execute(action, request)}
            except Exception as exc:
                response = {"ok": False, "error": str(exc)}
            conn.sendall((json.dumps(response, separators=(",", ":")) + "\n").encode("utf-8"))


if __name__ == "__main__":
    serve()
