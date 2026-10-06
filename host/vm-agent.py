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
    "app_catalog", "app_install", "storage_status"
}
CONTAINER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")

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
