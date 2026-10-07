#!/usr/bin/env python3
import hashlib
import hmac
import ipaddress
import json
import os
import pwd
import re
import secrets
import sqlite3
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
UPDATE_COMMAND = "/usr/local/sbin/netfreak2k-update"
ALLOWED = {
    "status", "start", "shutdown", "restart", "update_netfreak2k", "check_updates",
    "app_start", "app_stop", "app_restart",
    "app_catalog", "app_install", "storage_status",
    "backup_list", "backup_create", "backup_restore", "backup_verify", "backup_test_restore", "backup_policy_get", "backup_policy_set", "backup_prune", "backup_scheduled_tick", "vm_list",
    "audio_status", "audio_set_default", "bluetooth_connect", "bluetooth_disconnect",
    "audio_multiroom_set", "audio_multiroom_clear",
    "audio_airplay_enable", "audio_airplay_disable",
    "network_inventory", "network_scan", "network_device_analyze", "network_device_update",
    "health_status", "hardware_status", "host_power_action", "service_logs", "service_action", "remote_access_status", "remote_access_configure", "remote_access_renew"
}
CONTAINER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
BACKUP_ID_RE = re.compile(r"^n2k-[0-9]{8}-[0-9]{6}$")
BLUETOOTH_MAC_RE = re.compile(r"^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$")
AUDIO_NODE_RE = re.compile(r"^[0-9]{1,6}$")
BACKUP_DIR = Path("/var/lib/netfreak2k/backups")
BACKUP_POLICY_FILE = Path("/var/lib/netfreak2k/backup-policy.json")
MULTIROOM_STATE = Path("/run/netfreak2k/media-multiroom.json")
NETWORK_INVENTORY_FILE = Path("/var/lib/netfreak2k/network-inventory.json")
NETWORK_SCAN_STATE = Path("/run/netfreak2k/network-scan.json")
REMOTE_ACCESS_STATE = Path("/var/lib/netfreak2k/remote-access.json")
GATEWAY_SCRIPT = Path("/opt/netfreak2k/scripts/configure-gateway.sh")
DOMAIN_RE = re.compile(r"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MANAGED_SERVICES = {
    "docker.service": {"label": "Docker Engine", "restartable": True},
    "libvirtd.service": {"label": "KVM / libvirt", "restartable": True},
    "netfreak2k-vm-agent.service": {"label": "N2K Host Agent", "restartable": False},
    "netfreak2k-ha-proxy.service": {"label": "Home Assistant Proxy", "restartable": True},
    "nginx.service": {"label": "HTTPS Gateway", "restartable": True},
}

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
    "tor-browser": {
        "name": "Tor Browser",
        "description": "Isolierter Tor Browser mit browserbasierter KasmVNC-Oberfläche.",
        "image": "kasmweb/tor-browser:1.18.0",
        "container": "netfreak2k-app-tor-browser",
        "host_port": 6901,
        "container_port": 6901,
        "volume": None,
        "mount": None,
        "shm_size": "512m",
        "requirements": "Optionaler isolierter Browser · ca. 1 GB Image",
        "license": "Kasm/Tor Browser upstream licenses",
        "requires_password": True,
    },
    "onlyoffice-docs": {
        "name": "ONLYOFFICE Docs Community",
        "description": "Browserbasierte Office-Engine für Dokumente, Tabellen und Präsentationen.",
        "image": "onlyoffice/documentserver:9.4.0.1",
        "container": "netfreak2k-app-onlyoffice-docs",
        "host_port": 8082,
        "container_port": 80,
        "volume": "netfreak2k-app-onlyoffice-data",
        "mount": "/var/lib/onlyoffice",
        "shm_size": "2g",
        "requirements": "Empfohlen: 4 GB RAM und 40 GB freier Speicher",
        "license": "AGPL-3.0",
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


def audio_session_user():
    forced = os.environ.get("N2K_AUDIO_USER", "").strip()
    if forced:
        try:
            entry = pwd.getpwnam(forced)
            runtime = Path(f"/run/user/{entry.pw_uid}")
            if (runtime / "pipewire-0").exists():
                return entry.pw_name, entry.pw_uid, runtime
        except KeyError:
            pass

    run_user = Path("/run/user")
    try:
        candidates = sorted(
            [item for item in run_user.iterdir() if item.name.isdigit() and int(item.name) >= 1000],
            key=lambda item: int(item.name),
        )
    except OSError:
        candidates = []

    for runtime in candidates:
        if not (runtime / "pipewire-0").exists():
            continue
        uid = int(runtime.name)
        try:
            entry = pwd.getpwuid(uid)
        except KeyError:
            continue
        return entry.pw_name, uid, runtime
    return None, None, None


def run_audio_user(*args, timeout=12):
    username, uid, runtime = audio_session_user()
    if not username or uid is None or runtime is None:
        raise RuntimeError("pipewire_session_unavailable")
    env = os.environ.copy()
    env["XDG_RUNTIME_DIR"] = str(runtime)
    env["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={runtime}/bus"
    command = ["runuser", "-u", username, "--", "env",
               f"XDG_RUNTIME_DIR={runtime}",
               f"DBUS_SESSION_BUS_ADDRESS=unix:path={runtime}/bus",
               *args]
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
        env=env,
    )
    return result


def classify_audio_sink(name):
    text = str(name or "").lower()
    if any(token in text for token in ("raop", "airplay", "airport", "homepod")):
        return "airplay"
    if any(token in text for token in ("dlna", "upnp", "chromecast", "cast")):
        return "dlna"
    if any(token in text for token in ("bluez", "bluetooth")):
        return "bluetooth"
    if "hdmi" in text:
        return "hdmi"
    if any(token in text for token in ("usb", "dac", "fiio", "scarlett", "focusrite")):
        return "usb"
    return "local"


def pipewire_sinks():
    result = run_audio_user("wpctl", "status", "--name", timeout=8)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "wpctl_status_failed")

    sinks = []
    in_sinks = False
    for raw in result.stdout.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("Sinks:"):
            in_sinks = True
            continue
        if in_sinks and stripped and not line.startswith(" ") and not line.startswith("│") and not line.startswith("├") and not line.startswith("└"):
            break
        if not in_sinks:
            continue
        match = re.search(r"([*]?)\s*(\d+)\.\s+(.+?)(?:\s+\[vol:.*)?$", stripped)
        if not match:
            continue
        sink_name = match.group(3).strip()
        sinks.append({
            "id": match.group(2),
            "name": sink_name,
            "kind": classify_audio_sink(sink_name),
            "default": match.group(1) == "*",
            "backend": "PipeWire",
        })
    return sinks


def pulse_sinks():
    result = run_audio_user("pactl", "list", "short", "sinks", timeout=8)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "pactl_sinks_failed")
    default_result = run_audio_user("pactl", "get-default-sink", timeout=5)
    default_name = default_result.stdout.strip() if default_result.returncode == 0 else ""
    sinks = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        index, name = parts[0].strip(), parts[1].strip()
        if not index.isdigit() or not name:
            continue
        sinks.append({
            "id": index,
            "pulse_name": name,
            "name": name,
            "kind": classify_audio_sink(name),
            "default": name == default_name,
            "backend": "PipeWire/Pulse",
        })
    return sinks


def pulse_modules():
    result = run_audio_user("pactl", "list", "short", "modules", timeout=8)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "pactl_modules_failed")
    modules = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2 or not parts[0].strip().isdigit():
            continue
        modules.append({"id": parts[0].strip(), "name": parts[1].strip(), "args": parts[2].strip() if len(parts) > 2 else ""})
    return modules


def airplay_discovery_module_ids():
    try:
        return [module["id"] for module in pulse_modules() if module["name"] == "module-raop-discover"]
    except RuntimeError:
        return []


def airplay_discovery_set(enabled):
    existing = airplay_discovery_module_ids()
    if enabled:
        if existing:
            return audio_status_payload()
        result = run_audio_user("pactl", "load-module", "module-raop-discover", timeout=10)
        if result.returncode != 0 or not result.stdout.strip().isdigit():
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "airplay_discovery_unavailable")
        time.sleep(1.0)
        return audio_status_payload()

    for module_id in existing:
        run_audio_user("pactl", "unload-module", module_id, timeout=8)
    time.sleep(0.2)
    return audio_status_payload()


def read_multiroom_state():
    try:
        data = json.loads(MULTIROOM_STATE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_multiroom_state(data):
    MULTIROOM_STATE.parent.mkdir(parents=True, exist_ok=True)
    MULTIROOM_STATE.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def multiroom_clear():
    state = read_multiroom_state()
    module_id = str(state.get("module_id") or "").strip()
    if module_id.isdigit():
        run_audio_user("pactl", "unload-module", module_id, timeout=8)
    previous = str(state.get("previous_default") or "").strip()
    available = {sink["pulse_name"] for sink in pulse_sinks()}
    if previous and previous in available:
        run_audio_user("pactl", "set-default-sink", previous, timeout=8)
    try:
        MULTIROOM_STATE.unlink()
    except OSError:
        pass
    return audio_status_payload()


def multiroom_set(sink_names):
    if not isinstance(sink_names, list):
        raise RuntimeError("invalid_multiroom_sinks")
    requested = []
    for value in sink_names:
        name = str(value or "").strip()
        if name and name not in requested:
            requested.append(name)
    if len(requested) < 2 or len(requested) > 8:
        raise RuntimeError("multiroom_requires_2_to_8_sinks")

    available_sinks = pulse_sinks()
    available_names = {sink["pulse_name"] for sink in available_sinks}
    if any(name not in available_names for name in requested):
        raise RuntimeError("multiroom_sink_not_found")

    previous_default = next((sink["pulse_name"] for sink in available_sinks if sink.get("default")), "")
    old = read_multiroom_state()
    old_module = str(old.get("module_id") or "").strip()
    if old_module.isdigit():
        run_audio_user("pactl", "unload-module", old_module, timeout=8)

    result = run_audio_user(
        "pactl", "load-module", "module-combine-sink",
        "sink_name=n2k_multiroom",
        "slaves=" + ",".join(requested),
        "sink_properties=device.description=N2K_Multiroom",
        timeout=10,
    )
    if result.returncode != 0 or not result.stdout.strip().isdigit():
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "multiroom_create_failed")
    module_id = result.stdout.strip()
    set_default = run_audio_user("pactl", "set-default-sink", "n2k_multiroom", timeout=8)
    if set_default.returncode != 0:
        run_audio_user("pactl", "unload-module", module_id, timeout=8)
        raise RuntimeError(set_default.stderr.strip() or "multiroom_default_failed")

    state = {
        "active": True,
        "module_id": module_id,
        "sink_name": "n2k_multiroom",
        "members": requested,
        "previous_default": previous_default,
        "updated_at": int(time.time()),
    }
    write_multiroom_state(state)
    time.sleep(0.2)
    return audio_status_payload()


def bluetooth_devices():
    devices = []
    result = run("bluetoothctl", "devices")
    if result.returncode != 0:
        return devices
    for line in result.stdout.splitlines():
        match = re.match(r"Device\s+((?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2})\s+(.+)", line.strip())
        if not match:
            continue
        mac = match.group(1).upper()
        name = match.group(2).strip()
        info = run("bluetoothctl", "info", mac, timeout=5)
        text = info.stdout if info.returncode == 0 else ""
        devices.append({
            "mac": mac,
            "name": name,
            "connected": "Connected: yes" in text,
            "paired": "Paired: yes" in text,
            "trusted": "Trusted: yes" in text,
            "audio": any(token in text for token in ("Audio Sink", "0000110b-", "0000110e-", "0000111e-")),
        })
    return devices


def audio_status_payload():
    username, uid, _ = audio_session_user()
    pipewire_available = bool(username)
    sinks = []
    pipewire_error = None
    if pipewire_available:
        try:
            sinks = pipewire_sinks()
        except Exception as exc:
            pipewire_error = str(exc)
    airplay_sinks = [sink for sink in sinks if sink.get("kind") == "airplay"]
    dlna_sinks = [sink for sink in sinks if sink.get("kind") == "dlna"]
    return {
        "pipewire": {
            "available": pipewire_available and pipewire_error is None,
            "user": username,
            "uid": uid,
            "error": pipewire_error,
            "sinks": sinks,
        },
        "bluetooth": {
            "available": shutil.which("bluetoothctl") is not None,
            "devices": bluetooth_devices() if shutil.which("bluetoothctl") else [],
        },
        "airplay": {
            "available": bool(airplay_sinks),
            "sinks": airplay_sinks,
            "discovery_active": bool(airplay_discovery_module_ids()),
            "discovery_helper": shutil.which("avahi-browse") is not None,
            "note": "AirPlay/RAOP-Ausgang in PipeWire verfügbar" if airplay_sinks else "Kein AirPlay/RAOP-Ausgang in PipeWire gefunden",
        },
        "dlna": {
            "available": bool(dlna_sinks),
            "sinks": dlna_sinks,
            "helper": shutil.which("gmediarender") or shutil.which("upmpdcli"),
            "note": "DLNA/UPnP-Ausgang verfügbar" if dlna_sinks else "Kein DLNA/UPnP-Ausgang in PipeWire gefunden",
        },
        "multiroom": {
            "available": shutil.which("pactl") is not None,
            "network_sinks": [sink for sink in sinks if sink.get("kind") in {"airplay", "dlna"}],
            "state": read_multiroom_state(),
            "pulse_sinks": pulse_sinks() if shutil.which("pactl") else [],
        },
    }


def audio_set_default(node_id):
    node_id = str(node_id or "").strip()
    if not AUDIO_NODE_RE.fullmatch(node_id):
        raise RuntimeError("invalid_audio_node")
    sinks = pipewire_sinks()
    if node_id not in {sink["id"] for sink in sinks}:
        raise RuntimeError("audio_node_not_found")
    result = run_audio_user("wpctl", "set-default", node_id, timeout=8)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "audio_route_failed")
    time.sleep(0.15)
    return audio_status_payload()


def bluetooth_action(action, mac):
    mac = str(mac or "").strip().upper()
    if not BLUETOOTH_MAC_RE.fullmatch(mac):
        raise RuntimeError("invalid_bluetooth_mac")
    if shutil.which("bluetoothctl") is None:
        raise RuntimeError("bluetooth_unavailable")
    verb = "connect" if action == "bluetooth_connect" else "disconnect"
    result = run("bluetoothctl", verb, mac, timeout=20)
    if result.returncode != 0 or "Failed" in result.stdout or "Failed" in result.stderr:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"bluetooth_{verb}_failed")
    time.sleep(0.6)
    return audio_status_payload()


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
    for port in (80, 8123):
        try:
            with socket.create_connection((HA_IP, port), timeout=0.8):
                return True
        except OSError:
            continue
    return False


def network_state():
    result = run("virsh", "--connect", "qemu:///system", "net-info", "default")
    if result.returncode != 0:
        return {"defined": False, "active": False, "autostart": False}
    text = result.stdout.lower()
    return {
        "defined": True,
        "active": "active:           yes" in text or "active: yes" in text,
        "autostart": "autostart:        yes" in text or "autostart: yes" in text,
    }


def ensure_default_network():
    info = network_state()
    if not info["defined"]:
        xml = Path("/usr/share/libvirt/networks/default.xml")
        if not xml.is_file():
            raise RuntimeError("libvirt_default_network_missing")
        run("virsh", "--connect", "qemu:///system", "net-define", str(xml), check=True)
        info = network_state()
    if not info["autostart"]:
        run("virsh", "--connect", "qemu:///system", "net-autostart", "default", check=True)
    if not info["active"]:
        result = run("virsh", "--connect", "qemu:///system", "net-start", "default")
        if result.returncode != 0 and "already active" not in result.stderr.lower():
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "libvirt_network_start_failed")
    return network_state()


def payload():
    state = vm_state()
    net = network_state()
    autostart = False
    if state != "missing":
        result = run("virsh", "--connect", "qemu:///system", "dominfo", VM_NAME)
        autostart = "autostart:      enable" in result.stdout.lower() or "autostart:      yes" in result.stdout.lower()
    return {
        "name": VM_NAME,
        "state": state,
        "installed": state != "missing",
        "reachable": ha_reachable() if state == "running" else False,
        "autostart": autostart,
        "network": net,
        "kvm": Path("/dev/kvm").exists(),
    }


def check_updates_now():
    checker = Path("/usr/local/lib/netfreak2k/check-updates.sh")
    if not checker.is_file():
        checker = Path("/opt/netfreak2k/scripts/check-updates.sh")
    if not checker.is_file():
        raise RuntimeError("update_checker_missing")
    result = run(str(checker), check=False, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "update_check_failed")
    status_file = Path("/var/lib/netfreak2k/update-status.json")
    try:
        return json.loads(status_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"ok": False, "note": "update_status_unavailable"}


def trigger_update():
    update_target = UPDATE_COMMAND if Path(UPDATE_COMMAND).is_file() else UPDATE_SCRIPT
    if not Path(update_target).is_file():
        raise RuntimeError("update_script_missing")

    result = subprocess.run(
        [
            "systemd-run",
            "--unit=netfreak2k-web-update",
            "--collect",
            "--property=Type=exec",
            update_target,
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
            "requirements": spec.get("requirements"),
            "license": spec.get("license"),
            "requires_password": bool(spec.get("requires_password")),
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


def install_catalog_app(app_id, options=None):
    spec = APP_CATALOG.get(app_id)
    options = options or {}
    if not spec:
        raise RuntimeError("unknown_catalog_app")
    if container_state(spec["container"]) is not None:
        return {"installed": True, "name": spec["container"], "already_installed": True}
    if not port_available(spec["host_port"]):
        raise RuntimeError("app_port_in_use")

    run("docker", "pull", spec["image"], check=True, timeout=300)
    if spec.get("volume"):
        run("docker", "volume", "create", spec["volume"], check=True)
    docker_args = [
        "docker", "run", "-d",
        "--name", spec["container"],
        "--restart", "unless-stopped",
        "--label", "netfreak2k.managed=true",
        "--label", f"netfreak2k.app={app_id}",
        "-p", f'{spec["host_port"]}:{spec["container_port"]}',
    ]
    if spec.get("volume") and spec.get("mount"):
        docker_args.extend(["-v", f'{spec["volume"]}:{spec["mount"]}'])
    if spec.get("shm_size"):
        docker_args.extend(["--shm-size", str(spec["shm_size"])])
    if spec.get("requires_password"):
        password = str(options.get("password", ""))
        if len(password) < 10 or len(password) > 64:
            raise RuntimeError("invalid_app_password")
        docker_args.extend(["-e", f"VNC_PW={password}"])
    docker_args.append(spec["image"])
    run(*docker_args, check=True, timeout=600)
    return {
        "installed": True,
        "name": spec["container"],
        "state": container_state(spec["container"]) or "unknown",
        "host_port": spec["host_port"],
    }



def read_network_inventory():
    try:
        data = json.loads(NETWORK_INVENTORY_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("devices", [])
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {"devices": [], "last_scan": None, "subnet": None, "interface": None}


def write_network_inventory(data):
    NETWORK_INVENTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = NETWORK_INVENTORY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, NETWORK_INVENTORY_FILE)


def local_ipv4_network():
    result = run("ip", "-j", "-4", "route", "show", "default", timeout=5)
    if result.returncode != 0:
        raise RuntimeError("network_route_unavailable")
    try:
        routes = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        routes = []
    if not routes:
        raise RuntimeError("default_route_unavailable")
    interface = str(routes[0].get("dev") or "").strip()
    gateway = str(routes[0].get("gateway") or "").strip()
    if not interface:
        raise RuntimeError("default_interface_unavailable")

    addr_result = run("ip", "-j", "-4", "addr", "show", "dev", interface, timeout=5)
    try:
        addr_data = json.loads(addr_result.stdout or "[]")
    except json.JSONDecodeError:
        addr_data = []
    address = None
    prefix = None
    for item in addr_data:
        for info in item.get("addr_info") or []:
            if info.get("family") == "inet" and info.get("scope") == "global":
                address = info.get("local")
                prefix = info.get("prefixlen")
                break
        if address:
            break
    if not address or prefix is None:
        raise RuntimeError("interface_address_unavailable")
    network = ipaddress.ip_network(f"{address}/{prefix}", strict=False)
    if not network.is_private:
        raise RuntimeError("refusing_non_private_network")
    if network.num_addresses > 4096:
        network = ipaddress.ip_network(f"{address}/24", strict=False)
    return {
        "interface": interface,
        "gateway": gateway or None,
        "host_ip": address,
        "subnet": str(network),
    }


def reverse_hostname(ip):
    result = run("getent", "hosts", ip, timeout=2)
    if result.returncode != 0 or not result.stdout.strip():
        return ""
    parts = result.stdout.strip().split()
    return (parts[1] if len(parts) > 1 else "")[:160].rstrip(".")


def classify_network_device(name, vendor, services, ip, gateway=None):
    text = " ".join([str(name or ""), str(vendor or ""), " ".join(services or [])]).lower()
    if gateway and ip == gateway:
        return "router"
    if any(token in text for token in ("fritz", "ubiquiti", "unifi", "mikrotik", "router", "gateway")):
        return "network"
    if any(token in text for token in ("synology", "qnap", "nas")):
        return "nas"
    if any(token in text for token in ("printer", "epson", "brother", "canon", "hp laser", "airprint")):
        return "printer"
    if any(token in text for token in ("iphone", "ipad", "android", "samsung", "pixel", "oneplus", "xiaomi")):
        return "mobile"
    if any(token in text for token in ("tv", "chromecast", "roku", "firetv", "appletv", "television")):
        return "tv"
    if any(token in text for token in ("homeassistant", "home assistant", "hue", "shelly", "tasmota", "esp", "iot")):
        return "iot"
    if any(token in text for token in ("server", "linux", "proxmox", "docker", "ssh")):
        return "server"
    if any(token in text for token in ("windows", "macbook", "imac", "desktop", "laptop")):
        return "computer"
    return "unknown"


def mdns_services():
    result = run("avahi-browse", "-artpk", timeout=8)
    if result.returncode != 0:
        return {}
    mapping = {}
    for line in result.stdout.splitlines():
        if not line.startswith("="):
            continue
        parts = line.split(";")
        if len(parts) < 9:
            continue
        interface, name, service, host, address = parts[1], parts[3], parts[4], parts[6], parts[7]
        try:
            ipaddress.ip_address(address)
        except ValueError:
            continue
        entry = mapping.setdefault(address, {"services": set(), "mdns_name": "", "interface": interface})
        entry["services"].add(service)
        if host and not entry["mdns_name"]:
            entry["mdns_name"] = host.rstrip(".")
        if name:
            entry["services"].add(name)
    return {ip: {"services": sorted(v["services"])[:20], "mdns_name": v["mdns_name"], "interface": v["interface"]} for ip, v in mapping.items()}


def arp_scan_devices(interface, subnet):
    devices = {}
    if shutil.which("arp-scan"):
        result = run("arp-scan", "--interface", interface, "--localnet", "--plain", "--ignoredups", timeout=30)
        if result.returncode in (0, 1):
            for line in result.stdout.splitlines():
                match = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+((?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2})\s*(.*)$", line.strip())
                if not match:
                    continue
                ip, mac, vendor = match.groups()
                try:
                    if ipaddress.ip_address(ip) not in ipaddress.ip_network(subnet):
                        continue
                except ValueError:
                    continue
                devices[ip] = {"ip": ip, "mac": mac.upper(), "vendor": vendor.strip()[:160]}
    return devices


def ping_sweep_devices(subnet):
    devices = {}
    if not shutil.which("nmap"):
        return devices
    result = run("nmap", "-sn", "-n", "--min-rate", "20", "--max-retries", "1", subnet, timeout=60)
    current_ip = None
    for line in result.stdout.splitlines():
        host_match = re.match(r"Nmap scan report for (\d+\.\d+\.\d+\.\d+)", line.strip())
        if host_match:
            current_ip = host_match.group(1)
            devices.setdefault(current_ip, {"ip": current_ip, "mac": "", "vendor": ""})
            continue
        mac_match = re.match(r"MAC Address:\s+((?:[0-9A-F]{2}:){5}[0-9A-F]{2})(?:\s+\((.*)\))?", line.strip())
        if mac_match and current_ip:
            devices[current_ip]["mac"] = mac_match.group(1)
            devices[current_ip]["vendor"] = (mac_match.group(2) or "").strip()[:160]
    return devices


def network_scan_payload():
    topology = local_ipv4_network()
    now = int(time.time())
    current = arp_scan_devices(topology["interface"], topology["subnet"])
    if not current:
        for ip, item in ping_sweep_devices(topology["subnet"]).items():
            base = current.setdefault(ip, item)
            if not base.get("mac") and item.get("mac"):
                base["mac"] = item["mac"]
            if not base.get("vendor") and item.get("vendor"):
                base["vendor"] = item["vendor"]

    neigh = run("ip", "-j", "neigh", "show", "dev", topology["interface"], timeout=5)
    try:
        neigh_rows = json.loads(neigh.stdout or "[]")
    except json.JSONDecodeError:
        neigh_rows = []
    for row in neigh_rows:
        ip = str(row.get("dst") or "")
        try:
            addr = ipaddress.ip_address(ip)
            if addr.version != 4 or addr not in ipaddress.ip_network(topology["subnet"]):
                continue
        except ValueError:
            continue
        lladdr = str(row.get("lladdr") or "").upper()
        item = current.setdefault(ip, {"ip": ip, "mac": lladdr, "vendor": ""})
        if lladdr and not item.get("mac"):
            item["mac"] = lladdr

    current.setdefault(topology["host_ip"], {"ip": topology["host_ip"], "mac": "", "vendor": "Netfreak2k Host"})
    mdns = mdns_services()
    previous = read_network_inventory()
    old_by_key = {}
    for item in previous.get("devices", []):
        key = item.get("mac") or item.get("ip")
        if key:
            old_by_key[key] = item

    devices = []
    for ip, discovered in current.items():
        md = mdns.get(ip, {})
        hostname = md.get("mdns_name") or reverse_hostname(ip)
        key = discovered.get("mac") or ip
        old = old_by_key.get(key, {})
        services = md.get("services") or []
        latency = None
        ping = run("ping", "-c", "1", "-W", "1", ip, timeout=2)
        match = re.search(r"time[=<]([\d.]+)\s*ms", ping.stdout)
        if match:
            try:
                latency = round(float(match.group(1)), 2)
            except ValueError:
                latency = None
        name = old.get("custom_name") or hostname or discovered.get("vendor") or ip
        dtype = old.get("device_type") or classify_network_device(name, discovered.get("vendor"), services, ip, topology.get("gateway"))
        history = list(old.get("history") or [])[-39:]
        if not old:
            history.append({"at": now, "state": "discovered"})
        elif not old.get("online"):
            history.append({"at": now, "state": "online"})
        devices.append({
            "id": hashlib.sha256(key.encode("utf-8")).hexdigest()[:20],
            "ip": ip,
            "mac": discovered.get("mac") or old.get("mac") or "",
            "vendor": discovered.get("vendor") or old.get("vendor") or "",
            "hostname": hostname or old.get("hostname") or "",
            "custom_name": old.get("custom_name") or "",
            "name": name,
            "device_type": dtype,
            "online": True,
            "new": not bool(old),
            "first_seen": old.get("first_seen") or now,
            "last_seen": now,
            "latency_ms": latency,
            "services": services,
            "notes": old.get("notes") or "",
            "trusted": bool(old.get("trusted")),
            "deep_scan": old.get("deep_scan") or {},
            "history": history,
        })

    found_keys = {item.get("mac") or item.get("ip") for item in devices}
    for old in previous.get("devices", []):
        key = old.get("mac") or old.get("ip")
        if not key or key in found_keys:
            continue
        stale = dict(old)
        if old.get("online"):
            history = list(stale.get("history") or [])[-39:]
            history.append({"at": now, "state": "offline"})
            stale["history"] = history
        stale["online"] = False
        stale["new"] = False
        devices.append(stale)

    def sort_key(item):
        try:
            ip_key = int(ipaddress.ip_address(item.get("ip") or "0.0.0.0"))
        except ValueError:
            ip_key = 0
        return (not item.get("online"), ip_key)

    devices.sort(key=sort_key)
    payload = {
        "available": True,
        "interface": topology["interface"],
        "gateway": topology.get("gateway"),
        "host_ip": topology["host_ip"],
        "subnet": topology["subnet"],
        "last_scan": now,
        "devices": devices,
        "summary": {
            "online": sum(1 for d in devices if d.get("online")),
            "known": len(devices),
            "new": sum(1 for d in devices if d.get("new") and d.get("online")),
            "offline": sum(1 for d in devices if not d.get("online")),
        },
    }
    write_network_inventory(payload)
    return payload


def network_inventory_payload():
    data = read_network_inventory()
    data["available"] = True
    devices = data.get("devices", [])
    data["summary"] = {
        "online": sum(1 for d in devices if d.get("online")),
        "known": len(devices),
        "new": sum(1 for d in devices if d.get("new") and d.get("online")),
        "offline": sum(1 for d in devices if not d.get("online")),
    }
    return data


def find_inventory_device(device_id):
    data = read_network_inventory()
    for item in data.get("devices", []):
        if item.get("id") == device_id:
            return data, item
    raise RuntimeError("network_device_not_found")


def network_device_update(device_id, fields):
    data, item = find_inventory_device(device_id)
    if "custom_name" in fields:
        item["custom_name"] = str(fields.get("custom_name") or "").strip()[:80]
        item["name"] = item["custom_name"] or item.get("hostname") or item.get("vendor") or item.get("ip")
    if "notes" in fields:
        item["notes"] = str(fields.get("notes") or "").strip()[:500]
    if "trusted" in fields:
        item["trusted"] = bool(fields.get("trusted"))
    if "device_type" in fields:
        allowed = {"router","network","server","nas","computer","mobile","tv","printer","iot","unknown"}
        value = str(fields.get("device_type") or "unknown")
        if value not in allowed:
            raise RuntimeError("invalid_device_type")
        item["device_type"] = value
    write_network_inventory(data)
    return item


def network_device_analyze(device_id):
    data, item = find_inventory_device(device_id)
    topology = local_ipv4_network()
    ip = str(item.get("ip") or "")
    try:
        address = ipaddress.ip_address(ip)
        if address.version != 4 or address not in ipaddress.ip_network(topology["subnet"]):
            raise RuntimeError("device_outside_local_network")
    except ValueError:
        raise RuntimeError("invalid_device_ip")
    if not shutil.which("nmap"):
        raise RuntimeError("nmap_unavailable")

    result = run(
        "nmap", "-sT", "-sV", "-Pn", "--version-light",
        "--top-ports", "25", "--host-timeout", "35s", ip,
        timeout=45,
    )
    ports = []
    os_hint = ""
    for line in result.stdout.splitlines():
        match = re.match(r"^(\d+)/(tcp|udp)\s+(open|closed|filtered)\s+(\S+)(?:\s+(.*))?$", line.strip())
        if match and match.group(3) == "open":
            ports.append({
                "port": int(match.group(1)),
                "protocol": match.group(2),
                "service": match.group(4),
                "product": (match.group(5) or "").strip()[:160],
            })
        if "Service Info:" in line:
            os_hint = line.split("Service Info:", 1)[1].strip()[:200]
    item["deep_scan"] = {
        "scanned_at": int(time.time()),
        "ports": ports[:40],
        "os_hint": os_hint,
        "status": "ok" if result.returncode == 0 else "partial",
    }
    service_names = [p["service"] for p in ports]
    if item.get("device_type") == "unknown":
        item["device_type"] = classify_network_device(item.get("name"), item.get("vendor"), service_names, ip, topology.get("gateway"))
    write_network_inventory(data)
    return item


def read_text_value(path, default=""):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return default


def hardware_status_payload():
    cpu_model = ""
    try:
        for line in Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace").splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            if key.strip().lower() in {"model name", "hardware", "processor"} and value.strip():
                cpu_model = value.strip()
                if key.strip().lower() == "model name":
                    break
    except OSError:
        pass

    os_release = {}
    try:
        for line in Path("/etc/os-release").read_text(encoding="utf-8", errors="replace").splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                os_release[key] = value.strip().strip('"')
    except OSError:
        pass

    hostname = socket.gethostname()
    kernel = run("uname", "-r", timeout=4)
    arch = run("uname", "-m", timeout=4)
    uptime = 0
    try:
        uptime = int(float(Path("/proc/uptime").read_text(encoding="utf-8").split()[0]))
    except (OSError, ValueError, IndexError):
        pass

    memory_total = 0
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("MemTotal:"):
                memory_total = int(line.split()[1]) * 1024
                break
    except (OSError, ValueError, IndexError):
        pass

    board_vendor = read_text_value("/sys/class/dmi/id/board_vendor")
    board_name = read_text_value("/sys/class/dmi/id/board_name")
    product_name = read_text_value("/sys/class/dmi/id/product_name")
    product_vendor = read_text_value("/sys/class/dmi/id/sys_vendor")

    drives = []
    if shutil.which("lsblk"):
        result = run(
            "lsblk", "-J", "-b", "-o",
            "NAME,PATH,TYPE,SIZE,MODEL,VENDOR,SERIAL,TRAN,ROTA,MOUNTPOINTS,FSTYPE",
            timeout=10,
        )
        if result.returncode == 0:
            try:
                payload = json.loads(result.stdout)
                for item in payload.get("blockdevices") or []:
                    if item.get("type") not in {"disk", "rom"}:
                        continue
                    drive = {
                        "name": item.get("name") or "",
                        "path": item.get("path") or "",
                        "type": item.get("type") or "",
                        "size_bytes": item.get("size"),
                        "model": str(item.get("model") or "").strip(),
                        "vendor": str(item.get("vendor") or "").strip(),
                        "serial": str(item.get("serial") or "").strip(),
                        "transport": item.get("tran") or "",
                        "rotational": bool(item.get("rota")),
                        "mountpoints": [m for m in (item.get("mountpoints") or []) if m],
                        "filesystem": item.get("fstype") or "",
                    }
                    drives.append(drive)
            except (json.JSONDecodeError, TypeError):
                pass

    return {
        "hostname": hostname,
        "os": os_release.get("PRETTY_NAME") or os_release.get("NAME") or "Linux",
        "kernel": kernel.stdout.strip() if kernel.returncode == 0 else "",
        "architecture": arch.stdout.strip() if arch.returncode == 0 else "",
        "cpu_model": cpu_model,
        "logical_cores": os.cpu_count() or 0,
        "memory_total_bytes": memory_total,
        "uptime_seconds": uptime,
        "board": {
            "vendor": board_vendor,
            "name": board_name,
            "system_vendor": product_vendor,
            "product": product_name,
        },
        "drives": drives,
        "temperatures": cpu_temperature_payload(),
        "smart": smart_health_payload(),
    }


def host_power_action(operation):
    operation = str(operation or "").strip().lower()
    if operation not in {"reboot", "poweroff"}:
        raise RuntimeError("invalid_power_action")
    if not shutil.which("systemd-run"):
        raise RuntimeError("systemd_run_unavailable")
    command = "/usr/bin/systemctl reboot" if operation == "reboot" else "/usr/bin/systemctl poweroff"
    unit = f"netfreak2k-{operation}-{int(time.time())}"
    result = run(
        "systemd-run", "--unit", unit, "--collect", "--on-active=3s",
        "/bin/sh", "-c", command,
        timeout=8,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "power_action_failed").strip()[:500])
    return {"accepted": True, "operation": operation, "delay_seconds": 3}


def cpu_temperature_payload():
    readings = []
    roots = [Path("/sys/class/thermal"), Path("/sys/class/hwmon")]
    for root in roots:
        try:
            paths = list(root.glob("thermal_zone*/temp")) if root.name == "thermal" else list(root.glob("hwmon*/temp*_input"))
        except OSError:
            paths = []
        for path in paths:
            try:
                raw = path.read_text(encoding="utf-8").strip()
                value = float(raw)
                celsius = value / 1000.0 if abs(value) > 500 else value
                if -20 <= celsius <= 150:
                    label = path.parent.name
                    if root.name == "hwmon":
                        name_file = path.parent / "name"
                        try:
                            label = name_file.read_text(encoding="utf-8").strip() or label
                        except OSError:
                            pass
                    readings.append({"label": label[:80], "celsius": round(celsius, 1)})
            except (OSError, ValueError):
                continue
    if not readings:
        return {"available": False, "current_c": None, "max_c": None, "sensors": []}
    values = [item["celsius"] for item in readings]
    return {
        "available": True,
        "current_c": round(sum(values) / len(values), 1),
        "max_c": round(max(values), 1),
        "sensors": readings[:24],
    }


def smart_health_payload():
    if not shutil.which("smartctl"):
        return {"available": False, "drives": [], "overall": "unknown", "error": "smartctl_unavailable"}
    scan = run("smartctl", "--scan-open", timeout=12)
    devices = []
    overall = "passed"
    for line in scan.stdout.splitlines()[:12]:
        device = line.split()[0] if line.strip() else ""
        if not device.startswith("/dev/"):
            continue
        result = run("smartctl", "-H", "-A", "-j", device, timeout=15)
        if not result.stdout.strip().startswith("{"):
            continue
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            continue
        passed = (data.get("smart_status") or {}).get("passed")
        temperature = (data.get("temperature") or {}).get("current")
        model = data.get("model_name") or data.get("product") or data.get("device", {}).get("name") or device
        serial = data.get("serial_number") or ""
        health = "passed" if passed is True else "failed" if passed is False else "unknown"
        if health == "failed":
            overall = "failed"
        elif health == "unknown" and overall == "passed":
            overall = "unknown"
        devices.append({
            "device": device,
            "model": str(model)[:160],
            "serial": str(serial)[:80],
            "health": health,
            "temperature_c": temperature if isinstance(temperature, (int, float)) else None,
        })
    return {"available": bool(devices), "drives": devices, "overall": overall if devices else "unknown"}


def system_service_state(unit):
    result = run("systemctl", "is-active", unit, timeout=5)
    state = result.stdout.strip() or "unknown"
    spec = MANAGED_SERVICES.get(unit) or {}
    return {
        "unit": unit,
        "label": spec.get("label") or unit.replace(".service", ""),
        "state": state,
        "ok": state == "active",
        "restartable": bool(spec.get("restartable")),
    }


def managed_service_logs(unit, lines=100):
    unit = str(unit or "").strip()
    if unit not in MANAGED_SERVICES:
        raise RuntimeError("service_not_allowed")
    try:
        lines = max(20, min(200, int(lines)))
    except (TypeError, ValueError):
        lines = 100
    result = run(
        "journalctl", "--no-pager", "--output=short-iso",
        "-n", str(lines), "-u", unit,
        timeout=12,
    )
    log_lines = [line[:1200] for line in result.stdout.splitlines()[-lines:]]
    return {
        "unit": unit,
        "label": MANAGED_SERVICES[unit]["label"],
        "state": system_service_state(unit),
        "lines": log_lines,
        "line_count": len(log_lines),
    }


def managed_service_action(unit, operation):
    unit = str(unit or "").strip()
    operation = str(operation or "").strip().lower()
    spec = MANAGED_SERVICES.get(unit)
    if not spec:
        raise RuntimeError("service_not_allowed")
    if not spec.get("restartable"):
        raise RuntimeError("service_action_blocked")
    if operation not in {"start", "restart"}:
        raise RuntimeError("invalid_service_action")
    result = run("systemctl", operation, unit, timeout=35)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "service_action_failed").strip()[:500])
    time.sleep(0.35)
    return {"action": operation, "service": system_service_state(unit)}


def docker_health_payload():
    if not shutil.which("docker"):
        return {"available": False, "running": 0, "total": 0, "containers": []}
    result = run("docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}", timeout=8)
    containers = []
    for line in result.stdout.splitlines():
        parts = line.split("\t", 2)
        if len(parts) < 2:
            continue
        name, state = parts[0], parts[1]
        status = parts[2] if len(parts) > 2 else state
        if name.startswith("netfreak2k-"):
            containers.append({"name": name, "state": state, "status": status[:160], "ok": state == "running"})
    return {
        "available": result.returncode == 0,
        "running": sum(1 for item in containers if item["ok"]),
        "total": len(containers),
        "containers": containers,
    }


def health_status_payload():
    usage = shutil.disk_usage("/")
    storage_used = usage.total - usage.free
    storage_percent = round((storage_used / usage.total) * 100, 1) if usage.total else None
    temp = cpu_temperature_payload()
    smart = smart_health_payload()
    docker = docker_health_payload()
    services = [
        system_service_state("docker.service"),
        system_service_state("libvirtd.service"),
        system_service_state("netfreak2k-vm-agent.service"),
        system_service_state("netfreak2k-ha-proxy.service"),
        system_service_state("nginx.service"),
    ]
    vm = payload()
    backups = backup_list_payload()
    latest_backup = backups.get("backups", [None])[0] if backups.get("backups") else None

    warnings = []
    max_temp = temp.get("max_c")
    if isinstance(max_temp, (int, float)) and max_temp >= 85:
        warnings.append({"kind": "temperature", "level": "critical", "title": "CPU-Temperatur kritisch", "detail": f"{max_temp:.1f} °C"})
    elif isinstance(max_temp, (int, float)) and max_temp >= 75:
        warnings.append({"kind": "temperature", "level": "warning", "title": "CPU-Temperatur erhöht", "detail": f"{max_temp:.1f} °C"})
    if isinstance(storage_percent, (int, float)) and storage_percent >= 90:
        warnings.append({"kind": "storage", "level": "critical", "title": "Speicher fast voll", "detail": f"{storage_percent:.1f}% belegt"})
    elif isinstance(storage_percent, (int, float)) and storage_percent >= 80:
        warnings.append({"kind": "storage", "level": "warning", "title": "Speicher wird knapp", "detail": f"{storage_percent:.1f}% belegt"})
    if smart.get("overall") == "failed":
        warnings.append({"kind": "smart", "level": "critical", "title": "SMART-Fehler erkannt", "detail": "Mindestens ein Datenträger meldet einen Fehler."})
    for service in services:
        if not service["ok"]:
            warnings.append({"kind": "service", "level": "warning", "title": f"{service['unit']} nicht aktiv", "detail": service["state"]})
    if docker.get("available") and docker.get("running") != docker.get("total"):
        warnings.append({"kind": "docker", "level": "warning", "title": "Container prüfen", "detail": f"{docker.get('running', 0)} von {docker.get('total', 0)} N2K-Containern laufen."})
    if vm.get("installed") and (vm.get("state") != "running" or not vm.get("reachable")):
        warnings.append({"kind": "haos", "level": "warning", "title": "Home Assistant prüfen", "detail": vm.get("state") or "nicht erreichbar"})
    if latest_backup and isinstance(latest_backup.get("created_at"), (int, float)):
        age = int(time.time()) - int(latest_backup["created_at"])
        if age > 3 * 86400:
            warnings.append({"kind": "backup", "level": "warning", "title": "Backup ist veraltet", "detail": f"Letztes Backup vor {age // 86400} Tagen."})
        if latest_backup.get("verified") is False:
            warnings.append({"kind": "backup", "level": "critical", "title": "Backup-Integrität fehlgeschlagen", "detail": f"{latest_backup.get('id', 'Backup')} konnte nicht verifiziert werden."})
    elif not latest_backup:
        warnings.append({"kind": "backup", "level": "warning", "title": "Kein Backup vorhanden", "detail": "Es wurde noch kein N2K-Backup gefunden."})
    backup_policy = backup_policy_payload()
    last_backup_result = backup_policy.get("last_result")
    if backup_policy.get("enabled") and isinstance(last_backup_result, dict) and last_backup_result.get("ok") is False:
        warnings.append({
            "kind": "backup",
            "level": "critical",
            "title": "Automatisches Backup fehlgeschlagen",
            "detail": str(last_backup_result.get("error") or "Der geplante Backup-Lauf ist fehlgeschlagen.")[:300],
        })

    score = 100
    for item in warnings:
        score -= 25 if item["level"] == "critical" else 10
    score = max(0, score)
    overall = "critical" if any(i["level"] == "critical" for i in warnings) else "warning" if warnings else "healthy"

    return {
        "sampled_at": int(time.time()),
        "overall": overall,
        "score": score,
        "cpu_temperature": temp,
        "storage": {
            "total_bytes": usage.total,
            "used_bytes": storage_used,
            "free_bytes": usage.free,
            "used_percent": storage_percent,
        },
        "smart": smart,
        "docker": docker,
        "services": services,
        "homeassistant": {
            "installed": bool(vm.get("installed")),
            "state": vm.get("state"),
            "reachable": bool(vm.get("reachable")),
        },
        "backup": latest_backup,
        "warnings": warnings,
    }



def remote_access_status_payload():
    state = {
        "mode": "local",
        "domain": "",
        "email": "",
        "certificate": "local",
        "backend_port": 18080,
        "http_port": 80,
        "https_port": 443,
        "configured_at": None,
    }
    try:
        saved = json.loads(REMOTE_ACCESS_STATE.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            state.update(saved)
    except (OSError, json.JSONDecodeError):
        pass

    addresses = []
    try:
        result = run("hostname", "-I", timeout=4)
        for raw in result.stdout.split():
            try:
                ip = ipaddress.ip_address(raw)
            except ValueError:
                continue
            if ip.version == 4 and not ip.is_loopback:
                addresses.append(str(ip))
    except Exception:
        pass

    cert_path = Path("/var/lib/netfreak2k/tls/local.crt")
    if state.get("mode") == "domain" and state.get("domain"):
        candidate = Path("/etc/letsencrypt/live") / str(state["domain"]) / "fullchain.pem"
        if candidate.is_file():
            cert_path = candidate

    certificate = {
        "type": state.get("certificate") or "local",
        "expires_at": None,
        "subject": "",
        "valid": False,
    }
    if cert_path.is_file() and shutil.which("openssl"):
        result = run("openssl", "x509", "-in", str(cert_path), "-noout", "-enddate", "-subject", timeout=5)
        if result.returncode == 0:
            certificate["valid"] = True
            for line in result.stdout.splitlines():
                if line.startswith("notAfter="):
                    try:
                        certificate["expires_at"] = int(time.mktime(time.strptime(line.split("=", 1)[1], "%b %d %H:%M:%S %Y %Z")))
                    except ValueError:
                        pass
                elif line.startswith("subject="):
                    certificate["subject"] = line.split("=", 1)[1].strip()[:200]

    http_port = int(state.get("http_port") or 80)
    https_port = int(state.get("https_port") or 443)
    urls = []
    for address in addresses[:4]:
        urls.append({
            "http": f"http://{address}{'' if http_port == 80 else ':' + str(http_port)}/",
            "https": f"https://{address}{'' if https_port == 443 else ':' + str(https_port)}/",
        })
    if state.get("mode") == "domain" and state.get("domain"):
        urls.insert(0, {"http": f"http://{state['domain']}/", "https": f"https://{state['domain']}/"})

    nginx = system_service_state("nginx.service")
    return {
        "mode": state.get("mode") or "local",
        "domain": state.get("domain") or "",
        "email": state.get("email") or "",
        "backend_port": int(state.get("backend_port") or 18080),
        "http_port": http_port,
        "https_port": https_port,
        "configured_at": state.get("configured_at"),
        "addresses": addresses,
        "urls": urls,
        "certificate": certificate,
        "nginx": nginx,
        "remote_ready": bool(state.get("mode") == "domain" and certificate.get("valid") and nginx.get("ok")),
        "requirements": [
            "DNS-A/AAAA zeigt auf die öffentliche Server-IP",
            "Router leitet TCP 80 und 443 auf diesen Server weiter",
            "2FA für Admin-Konten empfohlen",
        ],
    }


def remote_access_configure(mode, domain="", email=""):
    mode = str(mode or "").strip().lower()
    domain = str(domain or "").strip().lower()
    email = str(email or "").strip()
    if mode not in {"local", "domain"}:
        raise RuntimeError("invalid_remote_mode")
    if not GATEWAY_SCRIPT.is_file():
        raise RuntimeError("gateway_script_missing")
    args = [str(GATEWAY_SCRIPT), mode]
    if mode == "domain":
        if not DOMAIN_RE.fullmatch(domain):
            raise RuntimeError("invalid_domain")
        if not EMAIL_RE.fullmatch(email):
            raise RuntimeError("invalid_email")
        args.extend([domain, email])
    result = run(*args, timeout=180)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "gateway_config_failed").strip()[:500])
    return remote_access_status_payload()


def remote_access_renew():
    result = run("certbot", "renew", "--quiet", "--deploy-hook", "systemctl reload nginx", timeout=180)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "certificate_renew_failed").strip()[:500])
    return remote_access_status_payload()


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



def default_backup_policy():
    return {
        "enabled": False,
        "frequency": "daily",
        "hour": 3,
        "weekday": 6,
        "retention": 7,
        "verify_after_create": True,
        "target": "local",
        "target_path": "",
        "last_scheduled_at": None,
        "last_result": None,
    }


def backup_policy_payload():
    policy = default_backup_policy()
    try:
        saved = json.loads(BACKUP_POLICY_FILE.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            for key in policy:
                if key in saved:
                    policy[key] = saved[key]
    except (OSError, json.JSONDecodeError):
        pass
    return policy


def write_backup_policy(policy):
    BACKUP_POLICY_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = BACKUP_POLICY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(policy, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, BACKUP_POLICY_FILE)
    os.chmod(BACKUP_POLICY_FILE, 0o600)


def normalize_backup_target_path(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    path = Path(raw).expanduser().resolve()
    allowed_roots = [Path("/mnt").resolve(), Path("/media").resolve(), Path("/srv/backups").resolve(), Path("/srv/netfreak2k-backups").resolve()]
    if not any(path == root or root in path.parents for root in allowed_roots):
        raise RuntimeError("backup_target_not_allowed")
    return str(path)


def backup_policy_set(fields):
    if not isinstance(fields, dict):
        raise RuntimeError("invalid_backup_policy")
    policy = backup_policy_payload()
    if "enabled" in fields:
        policy["enabled"] = bool(fields.get("enabled"))
    if "frequency" in fields:
        frequency = str(fields.get("frequency") or "")
        if frequency not in {"daily", "weekly"}:
            raise RuntimeError("invalid_backup_frequency")
        policy["frequency"] = frequency
    if "hour" in fields:
        try:
            hour = int(fields.get("hour"))
        except (TypeError, ValueError):
            raise RuntimeError("invalid_backup_hour")
        if not 0 <= hour <= 23:
            raise RuntimeError("invalid_backup_hour")
        policy["hour"] = hour
    if "weekday" in fields:
        try:
            weekday = int(fields.get("weekday"))
        except (TypeError, ValueError):
            raise RuntimeError("invalid_backup_weekday")
        if not 0 <= weekday <= 6:
            raise RuntimeError("invalid_backup_weekday")
        policy["weekday"] = weekday
    if "retention" in fields:
        try:
            retention = int(fields.get("retention"))
        except (TypeError, ValueError):
            raise RuntimeError("invalid_backup_retention")
        if retention not in {3, 5, 7, 14, 30, 60}:
            raise RuntimeError("invalid_backup_retention")
        policy["retention"] = retention
    if "verify_after_create" in fields:
        policy["verify_after_create"] = bool(fields.get("verify_after_create"))
    if "target" in fields:
        target = str(fields.get("target") or "local")
        if target not in {"local", "mounted"}:
            raise RuntimeError("invalid_backup_target")
        policy["target"] = target
    if "target_path" in fields:
        policy["target_path"] = normalize_backup_target_path(fields.get("target_path"))
    if policy["target"] == "mounted" and not policy.get("target_path"):
        raise RuntimeError("backup_target_path_required")
    write_backup_policy(policy)
    return policy


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def backup_manifest(target):
    files = []
    for path in sorted(target.rglob("*")):
        if not path.is_file() or path.name in {"manifest.json", "verify.json", "meta.json"}:
            continue
        rel = str(path.relative_to(target))
        try:
            stat = path.stat()
            files.append({
                "path": rel,
                "size_bytes": stat.st_size,
                "sha256": file_sha256(path),
            })
        except OSError:
            continue
    return {
        "created_at": int(time.time()),
        "algorithm": "sha256",
        "files": files,
    }


def backup_verify(backup_id):
    if not BACKUP_ID_RE.fullmatch(str(backup_id or "")):
        raise RuntimeError("invalid_backup_id")
    source = BACKUP_DIR / backup_id
    if not source.is_dir():
        raise RuntimeError("backup_not_found")
    manifest_file = source / "manifest.json"
    if not manifest_file.is_file():
        result = {"ok": False, "checked_at": int(time.time()), "error": "manifest_missing", "files_checked": 0}
    else:
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            manifest = {}
        failures = []
        checked = 0
        for entry in manifest.get("files") or []:
            rel = str(entry.get("path") or "")
            expected = str(entry.get("sha256") or "")
            expected_size = entry.get("size_bytes")
            path = (source / rel).resolve()
            if source.resolve() not in path.parents:
                failures.append({"path": rel, "error": "invalid_path"})
                continue
            if not path.is_file():
                failures.append({"path": rel, "error": "missing"})
                continue
            try:
                stat = path.stat()
                if expected_size is not None and stat.st_size != int(expected_size):
                    failures.append({"path": rel, "error": "size_mismatch"})
                    continue
                if expected and file_sha256(path) != expected:
                    failures.append({"path": rel, "error": "checksum_mismatch"})
                    continue
                checked += 1
            except (OSError, ValueError):
                failures.append({"path": rel, "error": "read_failed"})
        result = {
            "ok": not failures and checked == len(manifest.get("files") or []),
            "checked_at": int(time.time()),
            "files_checked": checked,
            "failures": failures[:25],
        }
    try:
        (source / "verify.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    except OSError:
        pass
    try:
        meta_file = source / "meta.json"
        meta = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.is_file() else {}
        meta["verified_at"] = result.get("checked_at")
        meta["verified"] = bool(result.get("ok"))
        meta_file.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    except (OSError, json.JSONDecodeError):
        pass
    return result


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
            "reason": meta.get("reason", "manual"),
            "verified": meta.get("verified"),
            "verified_at": meta.get("verified_at"),
            "target": meta.get("target", "local"),
            "replicated": bool(meta.get("replicated")),
            "restore_ready": meta.get("restore_ready"),
            "restore_tested_at": meta.get("restore_tested_at"),
        })
    return {"backups": backups[:60], "policy": backup_policy_payload()}


def backup_target_is_mounted(path):
    current = Path(path)
    for candidate in [current, *current.parents]:
        if str(candidate) == "/":
            break
        if candidate.exists() and os.path.ismount(candidate):
            return True
    return False


def replicate_backup(target, policy):
    if policy.get("target") != "mounted":
        return False
    raw = normalize_backup_target_path(policy.get("target_path"))
    if not raw:
        return False
    root = Path(raw)
    if not backup_target_is_mounted(root):
        raise RuntimeError("backup_target_not_mounted")
    root.mkdir(parents=True, exist_ok=True)
    destination = root / target.name
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(target, destination)
    return True


def backup_create(reason="manual"):
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
        if container_state(spec["container"]) is None or not spec.get("mount"):
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

    policy = backup_policy_payload()
    meta = {
        "id": backup_id,
        "created_at": int(time.time()),
        "apps": apps,
        "includes": ["netfreak2k-admin-db", "managed-app-data", "server-env"],
        "reason": "scheduled" if reason == "scheduled" else "manual",
        "target": policy.get("target", "local"),
        "verified": None,
        "verified_at": None,
        "replicated": False,
    }
    (target / "meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    manifest = backup_manifest(target)
    (target / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")

    verification = None
    if policy.get("verify_after_create", True):
        verification = backup_verify(backup_id)

    replicated = replicate_backup(target, policy)
    try:
        meta = json.loads((target / "meta.json").read_text(encoding="utf-8"))
        meta["replicated"] = replicated
        (target / "meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    except (OSError, json.JSONDecodeError):
        pass

    if replicated and policy.get("target") == "mounted":
        try:
            replica_meta = Path(policy.get("target_path")) / backup_id / "meta.json"
            shutil.copy2(target / "meta.json", replica_meta)
        except OSError:
            pass

    backup_prune()
    current = backup_list_payload()["backups"][0]
    return {"created": True, "backup": current, "verification": verification}


def backup_prune():
    policy = backup_policy_payload()
    retention = int(policy.get("retention") or 7)
    payload = backup_list_payload()
    backups = payload.get("backups") or []
    removed = []
    for item in backups[retention:]:
        backup_id = item.get("id")
        if not BACKUP_ID_RE.fullmatch(str(backup_id or "")):
            continue
        target = BACKUP_DIR / backup_id
        try:
            shutil.rmtree(target)
            removed.append(backup_id)
        except OSError:
            continue

    replica_removed = []
    if policy.get("target") == "mounted" and policy.get("target_path"):
        try:
            root = Path(normalize_backup_target_path(policy.get("target_path")))
            if backup_target_is_mounted(root) and root.is_dir():
                replicas = sorted(
                    [item for item in root.iterdir() if item.is_dir() and BACKUP_ID_RE.fullmatch(item.name)],
                    reverse=True,
                )
                for item in replicas[retention:]:
                    shutil.rmtree(item)
                    replica_removed.append(item.name)
        except (OSError, RuntimeError):
            pass
    return {"removed": removed, "replica_removed": replica_removed, "retention": retention}


def backup_schedule_due(policy, now=None):
    if not policy.get("enabled"):
        return False
    now = int(now or time.time())
    local = time.localtime(now)
    target_hour = int(policy.get("hour") or 0)
    if local.tm_hour < target_hour:
        return False
    last = policy.get("last_scheduled_at")
    if last:
        last_local = time.localtime(int(last))
        if (last_local.tm_year, last_local.tm_yday) == (local.tm_year, local.tm_yday):
            return False
    if policy.get("frequency") == "weekly":
        weekday = (local.tm_wday + 0) % 7
        if weekday != int(policy.get("weekday") or 0):
            return False
    return True


def backup_scheduled_tick():
    policy = backup_policy_payload()
    if not backup_schedule_due(policy):
        return {"due": False, "policy": policy}
    try:
        result = backup_create(reason="scheduled")
        policy = backup_policy_payload()
        policy["last_scheduled_at"] = int(time.time())
        policy["last_result"] = {
            "ok": True,
            "at": policy["last_scheduled_at"],
            "backup_id": (result.get("backup") or {}).get("id"),
        }
        write_backup_policy(policy)
        return {"due": True, "created": True, "result": result, "policy": policy}
    except Exception as exc:
        policy = backup_policy_payload()
        policy["last_scheduled_at"] = int(time.time())
        policy["last_result"] = {"ok": False, "at": policy["last_scheduled_at"], "error": str(exc)[:300]}
        write_backup_policy(policy)
        raise


def backup_test_restore(backup_id):
    if not BACKUP_ID_RE.fullmatch(str(backup_id or "")):
        raise RuntimeError("invalid_backup_id")
    source = BACKUP_DIR / backup_id
    if not source.is_dir():
        raise RuntimeError("backup_not_found")

    verification = backup_verify(backup_id)
    checks = [{"name": "checksums", "ok": bool(verification.get("ok")), "detail": f"{verification.get('files_checked', 0)} Dateien geprüft"}]

    db_file = source / "netfreak2k.db"
    db_ok = False
    db_detail = "Admin-Datenbank fehlt"
    if db_file.is_file():
        try:
            conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
            row = conn.execute("PRAGMA integrity_check").fetchone()
            conn.close()
            db_ok = bool(row and str(row[0]).lower() == "ok")
            db_detail = "SQLite integrity_check: ok" if db_ok else f"SQLite integrity_check: {row[0] if row else 'unknown'}"
        except sqlite3.Error as exc:
            db_detail = f"SQLite Fehler: {str(exc)[:160]}"
    checks.append({"name": "database", "ok": db_ok, "detail": db_detail})

    env_ok = (source / "server.env").is_file()
    checks.append({"name": "server_config", "ok": env_ok, "detail": "Server-Konfiguration vorhanden" if env_ok else "server.env fehlt"})

    try:
        meta = json.loads((source / "meta.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        meta = {}
    missing_apps = []
    for app_id in meta.get("apps") or []:
        if not (source / "apps" / str(app_id)).is_dir():
            missing_apps.append(str(app_id))
    apps_ok = not missing_apps
    checks.append({
        "name": "app_data",
        "ok": apps_ok,
        "detail": "App-Daten vollständig" if apps_ok else "Fehlend: " + ", ".join(missing_apps[:8]),
    })

    ready = all(item["ok"] for item in checks)
    result = {
        "ok": ready,
        "tested_at": int(time.time()),
        "backup_id": backup_id,
        "checks": checks,
    }
    try:
        test_file = source / "restore-test.json"
        test_file.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
        meta_file = source / "meta.json"
        meta["restore_tested_at"] = result["tested_at"]
        meta["restore_ready"] = ready
        meta_file.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    except OSError:
        pass
    return result


def backup_restore(backup_id):
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise RuntimeError("invalid_backup_id")
    source = BACKUP_DIR / backup_id
    if not source.is_dir():
        raise RuntimeError("backup_not_found")

    verification = backup_verify(backup_id)
    if not verification.get("ok"):
        raise RuntimeError("backup_integrity_failed")

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
    return {"accepted": True, "backup_id": backup_id, "verified": True}


def execute(action, request):
    if action == "status":
        return payload()

    if action == "update_netfreak2k":
        return trigger_update()

    if action == "check_updates":
        return check_updates_now()

    if action in {"app_start", "app_stop", "app_restart"}:
        return app_action(action, str(request.get("name", "")))

    if action == "app_catalog":
        return catalog_payload()

    if action == "app_install":
        return install_catalog_app(str(request.get("app_id", "")), request.get("options") or {})

    if action == "storage_status":
        return storage_payload()

    if action == "health_status":
        return health_status_payload()

    if action == "hardware_status":
        return hardware_status_payload()

    if action == "host_power_action":
        return host_power_action(request.get("operation"))

    if action == "service_logs":
        return managed_service_logs(request.get("unit"), request.get("lines", 100))

    if action == "service_action":
        return managed_service_action(request.get("unit"), request.get("operation"))

    if action == "remote_access_status":
        return remote_access_status_payload()

    if action == "remote_access_configure":
        return remote_access_configure(request.get("mode"), request.get("domain"), request.get("email"))

    if action == "remote_access_renew":
        return remote_access_renew()

    if action == "network_inventory":
        return network_inventory_payload()

    if action == "network_scan":
        return network_scan_payload()

    if action == "network_device_analyze":
        return network_device_analyze(str(request.get("device_id", "")))

    if action == "network_device_update":
        return network_device_update(str(request.get("device_id", "")), request.get("fields") or {})

    if action == "vm_list":
        return vm_list_payload()

    if action == "backup_list":
        return backup_list_payload()

    if action == "backup_create":
        return backup_create()

    if action == "backup_verify":
        return backup_verify(str(request.get("backup_id", "")))

    if action == "backup_test_restore":
        return backup_test_restore(str(request.get("backup_id", "")))

    if action == "backup_policy_get":
        return backup_policy_payload()

    if action == "backup_policy_set":
        return backup_policy_set(request.get("fields") or {})

    if action == "backup_prune":
        return backup_prune()

    if action == "backup_scheduled_tick":
        return backup_scheduled_tick()

    if action == "audio_status":
        return audio_status_payload()

    if action == "audio_set_default":
        return audio_set_default(request.get("node_id"))

    if action in {"bluetooth_connect", "bluetooth_disconnect"}:
        return bluetooth_action(action, request.get("mac"))

    if action == "audio_multiroom_set":
        return multiroom_set(request.get("sinks"))

    if action == "audio_multiroom_clear":
        return multiroom_clear()

    if action == "audio_airplay_enable":
        return airplay_discovery_set(True)

    if action == "audio_airplay_disable":
        return airplay_discovery_set(False)

    if action == "backup_restore":
        return backup_restore(str(request.get("backup_id", "")))

    state = vm_state()
    if state == "missing":
        raise RuntimeError("haos_not_installed")

    if action == "start":
        if state != "running":
            ensure_default_network()
            run("virsh", "--connect", "qemu:///system", "autostart", VM_NAME, check=True)
            run("virsh", "--connect", "qemu:///system", "start", VM_NAME, check=True)
    elif action == "shutdown":
        if state == "running":
            run("virsh", "--connect", "qemu:///system", "shutdown", VM_NAME, check=True)
    elif action == "restart":
        ensure_default_network()
        run("virsh", "--connect", "qemu:///system", "autostart", VM_NAME, check=True)
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
