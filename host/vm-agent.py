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
import urllib.request
import urllib.error
from pathlib import Path

SOCKET_PATH = Path("/run/netfreak2k/vm-agent.sock")
TOKEN_FILE = Path(os.environ.get("N2K_AGENT_TOKEN_FILE", "/var/lib/netfreak2k/agent.token"))
VM_NAME = "netfreak2k-homeassistant"
HA_IP = "192.168.122.50"
UPDATE_SCRIPT = "/opt/netfreak2k/scripts/update-server.sh"
UPDATE_COMMAND = "/usr/local/sbin/netfreak2k-update"
ALLOWED = {
    "status", "start", "shutdown", "restart", "update_netfreak2k", "update_preflight", "update_safe_netfreak2k", "check_updates", "linux_upgrade_start", "ollama_local_status", "ollama_local_chat",
    "app_start", "app_stop", "app_restart",
    "app_catalog", "app_install", "app_diagnostics", "app_logs", "app_update_check", "storage_status", "storage_mount", "storage_unmount",
    "backup_list", "backup_create", "backup_restore", "backup_verify", "backup_test_restore", "backup_policy_get", "backup_policy_set", "backup_prune", "backup_scheduled_tick", "vm_list", "vm_action", "vm_snapshot_create",
    "audio_status", "audio_set_default", "bluetooth_connect", "bluetooth_disconnect",
    "audio_multiroom_set", "audio_multiroom_clear",
    "audio_airplay_enable", "audio_airplay_disable",
    "network_inventory", "network_scan", "network_device_analyze", "network_device_update", "network_device_wake",
    "health_status", "hardware_status", "host_power_action", "service_logs", "service_action", "event_logs", "recovery_status", "recovery_action", "release_readiness", "scheduler_status", "scheduler_run", "security_status", "remote_access_status", "remote_connectivity_status", "remote_access_configure", "remote_access_renew"
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


def update_preflight_payload():
    checks = []
    update_target = UPDATE_COMMAND if Path(UPDATE_COMMAND).is_file() else UPDATE_SCRIPT
    target_ok = Path(update_target).is_file()
    checks.append({
        "id": "update_script",
        "label": "Update-Engine",
        "ok": target_ok,
        "required": True,
        "detail": update_target if target_ok else "Update-Skript fehlt",
    })

    systemd_ok = bool(shutil.which("systemd-run"))
    checks.append({
        "id": "systemd",
        "label": "Systemd Runner",
        "ok": systemd_ok,
        "required": True,
        "detail": "systemd-run verfügbar" if systemd_ok else "systemd-run fehlt",
    })

    usage = shutil.disk_usage("/")
    min_free = 2 * 1024 * 1024 * 1024
    checks.append({
        "id": "disk",
        "label": "Freier Speicher",
        "ok": usage.free >= min_free,
        "required": True,
        "detail": f"{round(usage.free / (1024 ** 3), 1)} GiB frei · mindestens 2 GiB erforderlich",
        "free_bytes": usage.free,
    })

    docker = run("docker", "info", "--format", "{{.ServerVersion}}", timeout=8) if shutil.which("docker") else None
    docker_ok = bool(docker and docker.returncode == 0)
    checks.append({
        "id": "docker",
        "label": "Docker Engine",
        "ok": docker_ok,
        "required": True,
        "detail": f"Docker {docker.stdout.strip()}" if docker_ok else "Docker nicht erreichbar",
    })

    backup_ok = True
    backup_detail = "Backup-Ziel beschreibbar"
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        probe = BACKUP_DIR / ".update-preflight"
        probe.write_text(str(int(time.time())), encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError:
        backup_ok = False
        backup_detail = "Backup-Ziel nicht beschreibbar"
    checks.append({
        "id": "backup_target",
        "label": "Backup-Ziel",
        "ok": backup_ok,
        "required": True,
        "detail": backup_detail,
    })

    running = run("systemctl", "is-active", "netfreak2k-web-update.service", timeout=5)
    update_running = running.returncode == 0 and running.stdout.strip() in {"active", "activating"}
    checks.append({
        "id": "update_idle",
        "label": "Update-Status",
        "ok": not update_running,
        "required": True,
        "detail": "Kein Update aktiv" if not update_running else "Ein Update läuft bereits",
    })

    backups = backup_list_payload().get("backups") or []
    latest = backups[0] if backups else None
    recent = False
    if latest and isinstance(latest.get("created_at"), (int, float)):
        recent = int(time.time()) - int(latest["created_at"]) <= 3 * 86400
    checks.append({
        "id": "recent_backup",
        "label": "Vorhandenes Backup",
        "ok": recent,
        "required": False,
        "detail": "Aktuelles Backup vorhanden" if recent else "Kein Backup der letzten 3 Tage · vor dem Update wird automatisch eines erstellt",
    })

    vm_state_result = run("virsh", "--connect", "qemu:///system", "domstate", VM_NAME, timeout=6) if shutil.which("virsh") else None
    ha_running = bool(vm_state_result and vm_state_result.returncode == 0 and vm_state_result.stdout.strip().lower() == "running")
    checks.append({
        "id": "workloads",
        "label": "Workloads",
        "ok": True,
        "required": False,
        "detail": "Home Assistant läuft · kurze Unterbrechung möglich" if ha_running else "Keine laufende HA-VM erkannt",
    })

    ready = all(item["ok"] for item in checks if item.get("required"))
    return {
        "ready": ready,
        "checked_at": int(time.time()),
        "checks": checks,
        "required_ok": sum(1 for item in checks if item.get("required") and item.get("ok")),
        "required_total": sum(1 for item in checks if item.get("required")),
        "automatic_backup": True,
        "backup_verification_required": True,
        "latest_backup": latest,
    }


def safe_trigger_update():
    preflight = update_preflight_payload()
    if not preflight.get("ready"):
        failed = [item.get("id") for item in preflight.get("checks", []) if item.get("required") and not item.get("ok")]
        raise RuntimeError("update_preflight_failed:" + ",".join(failed))

    backup = backup_create(reason="update")
    backup_item = backup.get("backup") or {}
    backup_id = str(backup_item.get("id") or "")
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise RuntimeError("update_backup_missing")

    verification = backup_verify(backup_id)
    if not verification.get("ok"):
        raise RuntimeError("update_backup_verification_failed")

    started = trigger_update()
    return {
        "accepted": bool(started.get("accepted")),
        "already_running": bool(started.get("already_running")),
        "preflight": preflight,
        "backup": {
            "id": backup_id,
            "created_at": backup_item.get("created_at"),
            "size_bytes": backup_item.get("size_bytes"),
            "verified": True,
            "replicated": bool(backup_item.get("replicated")),
        },
    }


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
            "container": spec["container"],
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
        history = list(old.get("history") or [])[-59:]
        if not old:
            history.append({"at": now, "state": "discovered"})
        elif not old.get("online"):
            history.append({"at": now, "state": "online"})
        if old and old.get("ip") and old.get("ip") != ip:
            history.append({"at": now, "state": "ip_change", "from": old.get("ip"), "to": ip})
        online_since = old.get("online_since") if old.get("online") else now
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
            "online_since": online_since or now,
            "offline_since": None,
            "last_online_duration": old.get("last_online_duration"),
            "seen_count": int(old.get("seen_count") or 0) + 1,
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
            history = list(stale.get("history") or [])[-59:]
            history.append({"at": now, "state": "offline"})
            stale["history"] = history
            stale["offline_since"] = now
            if old.get("online_since"):
                stale["last_online_duration"] = max(0, now - int(old.get("online_since")))
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
            "trusted": sum(1 for d in devices if d.get("trusted")),
        },
        "traffic": {
            "per_device_available": False,
            "mode": "host_only",
            "reason": "client_traffic_requires_gateway_or_bridge_visibility",
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
        "trusted": sum(1 for d in devices if d.get("trusted")),
    }
    data.setdefault("traffic", {
        "per_device_available": False,
        "mode": "host_only",
        "reason": "client_traffic_requires_gateway_or_bridge_visibility",
    })
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


def network_device_wake(device_id):
    data, item = find_inventory_device(device_id)
    mac = str(item.get("mac") or "").strip().upper()
    if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", mac):
        raise RuntimeError("wake_mac_unavailable")
    if mac == "00:00:00:00:00:00" or mac.startswith("FF:FF:FF"):
        raise RuntimeError("wake_mac_invalid")

    topology = local_ipv4_network()
    network = ipaddress.ip_network(topology["subnet"], strict=False)
    mac_bytes = bytes.fromhex(mac.replace(":", ""))
    packet = b"\xff" * 6 + mac_bytes * 16
    targets = [(str(network.broadcast_address), 9), ("255.255.255.255", 9)]
    sent = 0
    for host, port in targets:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.settimeout(2)
            sock.sendto(packet, (host, port))
            sent += 1
        except OSError:
            pass
        finally:
            sock.close()
    if not sent:
        raise RuntimeError("wake_send_failed")

    history = list(item.get("history") or [])[-59:]
    history.append({"at": int(time.time()), "state": "wake_sent"})
    item["history"] = history
    item["last_wake_at"] = int(time.time())
    write_network_inventory(data)
    return {"sent": True, "device_id": device_id, "mac": mac, "broadcast": str(network.broadcast_address), "attempts": sent}


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


def docker_container_inspect(name):
    result = run("docker", "inspect", name, timeout=8)
    if result.returncode != 0:
        raise RuntimeError("container_not_found")
    try:
        rows = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError("container_inspect_failed")
    if not rows:
        raise RuntimeError("container_not_found")
    return rows[0]


def docker_container_allowed(info):
    name = str(info.get("Name") or "").lstrip("/")
    labels = (info.get("Config") or {}).get("Labels") or {}
    return name.startswith("netfreak2k-") or str(labels.get("netfreak2k.managed") or "").lower() == "true"


def docker_container_details(info):
    name = str(info.get("Name") or "").lstrip("/")
    config = info.get("Config") or {}
    host = info.get("HostConfig") or {}
    state = info.get("State") or {}
    network = info.get("NetworkSettings") or {}
    labels = config.get("Labels") or {}
    mounts = []
    for mount in info.get("Mounts") or []:
        mounts.append({
            "type": mount.get("Type") or "",
            "name": mount.get("Name") or "",
            "source": mount.get("Source") or "",
            "destination": mount.get("Destination") or "",
            "read_only": not bool(mount.get("RW", True)),
        })
    ports = []
    for private, bindings in (network.get("Ports") or {}).items():
        for binding in bindings or [{}]:
            ports.append({
                "private": private,
                "public": binding.get("HostPort") or "",
                "host_ip": binding.get("HostIp") or "",
            })
    managed = str(labels.get("netfreak2k.managed") or "").lower() == "true"
    return {
        "id": str(info.get("Id") or "")[:12],
        "name": name,
        "image": config.get("Image") or "",
        "image_id": str(info.get("Image") or ""),
        "state": state.get("Status") or "unknown",
        "started_at": state.get("StartedAt") or "",
        "exit_code": state.get("ExitCode"),
        "restart_policy": (host.get("RestartPolicy") or {}).get("Name") or "no",
        "managed": managed,
        "core": name.startswith("netfreak2k-") and not managed,
        "app_id": labels.get("netfreak2k.app") or "",
        "ports": ports,
        "mounts": mounts,
    }


def docker_apps_payload():
    if not shutil.which("docker"):
        return {"available": False, "containers": [], "summary": {"total": 0, "running": 0}}
    result = run("docker", "ps", "-aq", "--filter", "name=netfreak2k-", timeout=8)
    if result.returncode != 0:
        return {"available": False, "containers": [], "summary": {"total": 0, "running": 0}}
    ids = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    containers = []
    for container_id in ids[:80]:
        try:
            info = docker_container_inspect(container_id)
        except RuntimeError:
            continue
        if not docker_container_allowed(info):
            continue
        containers.append(docker_container_details(info))

    stats_map = {}
    if containers:
        stats = run("docker", "stats", "--no-stream", "--format", "{{json .}}", *[item["name"] for item in containers], timeout=15)
        if stats.returncode == 0:
            for line in stats.stdout.splitlines():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                name = row.get("Name") or row.get("Container") or ""
                stats_map[name] = {
                    "cpu_percent": row.get("CPUPerc") or "–",
                    "memory_usage": row.get("MemUsage") or "–",
                    "memory_percent": row.get("MemPerc") or "–",
                    "network_io": row.get("NetIO") or "–",
                    "block_io": row.get("BlockIO") or "–",
                    "pids": row.get("PIDs") or "–",
                }
    for item in containers:
        item["stats"] = stats_map.get(item["name"], {})
    containers.sort(key=lambda item: (not item.get("core"), item.get("name", "")))
    return {
        "available": True,
        "containers": containers,
        "summary": {
            "total": len(containers),
            "running": sum(1 for item in containers if item.get("state") == "running"),
            "managed": sum(1 for item in containers if item.get("managed")),
            "core": sum(1 for item in containers if item.get("core")),
        },
    }


def docker_app_logs(name, lines=120):
    info = docker_container_inspect(str(name or "").strip())
    if not docker_container_allowed(info):
        raise RuntimeError("container_not_allowed")
    try:
        lines = max(20, min(300, int(lines)))
    except (TypeError, ValueError):
        lines = 120
    container = docker_container_details(info)
    result = run("docker", "logs", "--timestamps", "--tail", str(lines), container["name"], timeout=12)
    output = (result.stdout or "") + (result.stderr or "")
    log_lines = [line[:1600] for line in output.splitlines()[-lines:]]
    return {"container": container, "lines": log_lines, "line_count": len(log_lines)}


def docker_app_update_check(name):
    info = docker_container_inspect(str(name or "").strip())
    if not docker_container_allowed(info):
        raise RuntimeError("container_not_allowed")
    container = docker_container_details(info)
    image = container.get("image") or ""
    if not image or "@" in image:
        return {"name": container["name"], "image": image, "status": "unknown", "update_available": None}

    local = run("docker", "image", "inspect", "--format", "{{json .RepoDigests}}", image, timeout=8)
    local_digests = []
    if local.returncode == 0:
        try:
            local_digests = json.loads(local.stdout.strip() or "[]") or []
        except json.JSONDecodeError:
            local_digests = []

    remote = run("docker", "manifest", "inspect", "--verbose", image, timeout=25)
    remote_digest = ""
    if remote.returncode == 0:
        try:
            payload = json.loads(remote.stdout)
            if isinstance(payload, dict):
                descriptor = payload.get("Descriptor") or payload.get("descriptor") or {}
                remote_digest = str(descriptor.get("digest") or "")
        except json.JSONDecodeError:
            pass

    local_values = [str(value).split("@", 1)[-1] for value in local_digests if "@" in str(value)]
    if not remote_digest:
        return {"name": container["name"], "image": image, "status": "unknown", "update_available": None, "local_digests": local_values[:4]}
    update_available = bool(local_values) and remote_digest not in local_values
    return {
        "name": container["name"], "image": image,
        "status": "update_available" if update_available else "current",
        "update_available": update_available,
        "remote_digest": remote_digest,
        "local_digests": local_values[:4],
    }


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


def event_logs_payload(lines=240):
    try:
        lines = max(50, min(500, int(lines)))
    except (TypeError, ValueError):
        lines = 240

    events = []
    if shutil.which("journalctl"):
        result = run(
            "journalctl", "--no-pager", "-n", str(lines), "-o", "json",
            "--since", "24 hours ago",
            timeout=15,
        )
        if result.returncode == 0:
            for raw in result.stdout.splitlines():
                try:
                    item = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                message = str(item.get("MESSAGE") or "").strip()
                if not message:
                    continue
                realtime = str(item.get("__REALTIME_TIMESTAMP") or "")
                timestamp = None
                try:
                    timestamp = int(int(realtime) / 1000000) if realtime else None
                except (TypeError, ValueError):
                    timestamp = None
                priority = 6
                try:
                    priority = int(item.get("PRIORITY") or 6)
                except (TypeError, ValueError):
                    priority = 6
                identifier = str(
                    item.get("SYSLOG_IDENTIFIER")
                    or item.get("_SYSTEMD_UNIT")
                    or item.get("_COMM")
                    or "system"
                )[:120]
                unit = str(item.get("_SYSTEMD_UNIT") or "")[:160]
                source = "system"
                if unit in MANAGED_SERVICES or identifier.startswith("netfreak2k"):
                    source = "n2k"
                elif "docker" in identifier.lower() or unit == "docker.service":
                    source = "docker"
                elif "libvirt" in identifier.lower() or unit == "libvirtd.service":
                    source = "vm"
                elif identifier.lower() in {"sshd", "ssh"} or "ssh" in unit.lower():
                    source = "security"
                events.append({
                    "source": source,
                    "timestamp": timestamp,
                    "priority": priority,
                    "level": (
                        "critical" if priority <= 2 else
                        "error" if priority == 3 else
                        "warning" if priority == 4 else
                        "info"
                    ),
                    "identifier": identifier,
                    "unit": unit,
                    "message": message[:1800],
                })

    if shutil.which("docker"):
        names_result = run("docker", "ps", "-a", "--format", "{{.Names}}", timeout=8)
        if names_result.returncode == 0:
            names = [name.strip() for name in names_result.stdout.splitlines() if name.strip().startswith("netfreak2k-")][:30]
            for name in names:
                result = run("docker", "logs", "--timestamps", "--tail", "8", name, timeout=8)
                output = (result.stdout or "") + (result.stderr or "")
                for raw in output.splitlines()[-8:]:
                    raw = raw.strip()
                    if not raw:
                        continue
                    timestamp = None
                    message = raw
                    match = re.match(r"^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$", raw)
                    if match:
                        message = match.group(2)
                        try:
                            timestamp = int(time.mktime(time.strptime(match.group(1)[:19], "%Y-%m-%dT%H:%M:%S")))
                        except ValueError:
                            timestamp = None
                    events.append({
                        "source": "docker",
                        "timestamp": timestamp,
                        "priority": 6,
                        "level": "info",
                        "identifier": name,
                        "unit": "",
                        "message": message[:1800],
                    })

    events.sort(key=lambda item: int(item.get("timestamp") or 0), reverse=True)
    events = events[:500]
    return {
        "events": events,
        "summary": {
            "total": len(events),
            "critical": sum(1 for item in events if item.get("level") == "critical"),
            "errors": sum(1 for item in events if item.get("level") == "error"),
            "warnings": sum(1 for item in events if item.get("level") == "warning"),
        },
        "sampled_at": int(time.time()),
    }


SCHEDULER_STATE_FILE = Path("/var/lib/netfreak2k/scheduler-state.json")


def scheduler_state_payload():
    try:
        data = json.loads(SCHEDULER_STATE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_scheduler_state(data):
    SCHEDULER_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SCHEDULER_STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, SCHEDULER_STATE_FILE)


def systemd_timer_inventory():
    if not shutil.which("systemctl"):
        return []
    units = run("systemctl", "list-units", "--type=timer", "--all", "--no-legend", "--plain", "--no-pager", timeout=10)
    if units.returncode != 0:
        return []
    names = []
    for line in units.stdout.splitlines():
        parts = line.split()
        if parts and parts[0].endswith(".timer") and parts[0] not in names:
            names.append(parts[0])

    timers = []
    for name in names[:80]:
        result = run(
            "systemctl", "show", name,
            "--property=Id,Description,ActiveState,SubState,Unit,NextElapseUSecRealtime,LastTriggerUSec",
            "--no-pager",
            timeout=5,
        )
        props = {}
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if "=" in line:
                    key, value = line.split("=", 1)
                    props[key] = value.strip()
        enabled = run("systemctl", "is-enabled", name, timeout=4)
        timers.append({
            "unit": name,
            "description": props.get("Description") or name,
            "active_state": props.get("ActiveState") or "unknown",
            "sub_state": props.get("SubState") or "unknown",
            "activates": props.get("Unit") or "",
            "next": props.get("NextElapseUSecRealtime") or "",
            "last": props.get("LastTriggerUSec") or "",
            "enabled": enabled.returncode == 0,
        })
    timers.sort(key=lambda item: (item.get("active_state") != "active", item.get("unit", "")))
    return timers


def scheduler_managed_jobs():
    state = scheduler_state_payload()
    backup_policy = backup_policy_payload()
    return [
        {
            "id": "backup-schedule",
            "label": "Backup-Plan prüfen",
            "description": "Prüft, ob das geplante N2K-Backup fällig ist und erstellt es gegebenenfalls.",
            "role": "admin",
            "target": "backups-panel",
            "schedule": (
                f"{backup_policy.get('frequency','daily')} · {int(backup_policy.get('hour') or 0):02d}:00"
                if backup_policy.get("enabled") else "deaktiviert"
            ),
            **(state.get("backup-schedule") or {}),
        },
        {
            "id": "update-check",
            "label": "Update-Prüfung",
            "description": "Prüft den konfigurierten Netfreak2k-Upstream auf einen neuen Stand.",
            "role": "operator",
            "target": "updates-panel",
            "schedule": "automatische Prüfung + manuell",
            **(state.get("update-check") or {}),
        },
        {
            "id": "network-scan",
            "label": "LAN-Gerätescan",
            "description": "Aktualisiert das bekannte Geräteinventar im Heimnetz.",
            "role": "operator",
            "target": "network-panel",
            "schedule": "manuell / Dashboard",
            **(state.get("network-scan") or {}),
        },
        {
            "id": "health-check",
            "label": "System Health Check",
            "description": "Prüft Temperatur, Speicher, SMART, Dienste und Workloads.",
            "role": "operator",
            "target": "health-panel",
            "schedule": "Dashboard · 60 Sekunden",
            **(state.get("health-check") or {}),
        },
    ]


def scheduler_status_payload():
    timers = systemd_timer_inventory()
    jobs = scheduler_managed_jobs()
    return {
        "sampled_at": int(time.time()),
        "timers": timers,
        "jobs": jobs,
        "summary": {
            "system_timers": len(timers),
            "active_timers": sum(1 for item in timers if item.get("active_state") == "active"),
            "enabled_timers": sum(1 for item in timers if item.get("enabled")),
            "managed_jobs": len(jobs),
            "failed_jobs": sum(1 for item in jobs if item.get("last_ok") is False),
        },
    }


def scheduler_run(job_id):
    job_id = str(job_id or "").strip()
    started = int(time.time())
    state = scheduler_state_payload()
    try:
        if job_id == "backup-schedule":
            result = backup_scheduled_tick()
            detail = "Backup erstellt" if result.get("created") else "Kein Backup fällig"
        elif job_id == "update-check":
            result = check_updates_now()
            detail = "Update-Prüfung abgeschlossen"
        elif job_id == "network-scan":
            result = network_scan_payload()
            detail = f"{(result.get('summary') or {}).get('online', 0)} Geräte online"
        elif job_id == "health-check":
            result = health_status_payload()
            detail = f"Health Score {result.get('score', '–')}"
        else:
            raise RuntimeError("unknown_scheduler_job")
        state[job_id] = {
            "last_run": started,
            "last_finished": int(time.time()),
            "last_ok": True,
            "last_detail": detail[:240],
        }
        write_scheduler_state(state)
        return {"job_id": job_id, "ok": True, "detail": detail, "result": result}
    except Exception as exc:
        state[job_id] = {
            "last_run": started,
            "last_finished": int(time.time()),
            "last_ok": False,
            "last_detail": str(exc)[:240],
        }
        write_scheduler_state(state)
        raise


def security_listening_sockets():
    if not shutil.which("ss"):
        return []
    result = run("ss", "-H", "-lntup", timeout=8)
    if result.returncode != 0:
        return []
    rows = []
    for line in result.stdout.splitlines():
        parts = line.split(None, 6)
        if len(parts) < 5:
            continue
        protocol = parts[0].lower()
        local = parts[4]
        process_text = parts[6] if len(parts) > 6 else ""
        host = local
        port = ""
        if local.startswith("[") and "]:" in local:
            host, port = local.rsplit(":", 1)
            host = host.strip("[]")
        elif ":" in local:
            host, port = local.rsplit(":", 1)
        process = ""
        pid = None
        match = re.search(r'users:\(\("([^"]+)",pid=(\d+)', process_text)
        if match:
            process = match.group(1)[:120]
            try:
                pid = int(match.group(2))
            except ValueError:
                pid = None
        bind_all = host in {"0.0.0.0", "::", "*", ""}
        loopback = host in {"127.0.0.1", "::1", "localhost"}
        scope = "all_interfaces" if bind_all else "loopback" if loopback else "interface"
        rows.append({
            "protocol": protocol,
            "address": host or "*",
            "port": port,
            "process": process,
            "pid": pid,
            "scope": scope,
        })
    rows.sort(key=lambda item: (item.get("scope") != "all_interfaces", item.get("protocol", ""), str(item.get("port", ""))))
    return rows[:120]


def security_firewall_status():
    result = {
        "engine": "none",
        "state": "unknown",
        "active": False,
        "default_input_policy": "unknown",
        "rules": 0,
        "detail": "Keine Firewall-Engine eindeutig erkannt",
    }
    if shutil.which("ufw"):
        ufw = run("ufw", "status", timeout=8)
        if ufw.returncode == 0:
            first = next((line.strip() for line in ufw.stdout.splitlines() if line.strip()), "")
            active = first.lower().startswith("status: active")
            result.update({
                "engine": "ufw",
                "state": "active" if active else "inactive",
                "active": active,
                "detail": first or "UFW installiert",
                "rules": sum(1 for line in ufw.stdout.splitlines() if re.match(r"^\S+\s+ALLOW|^\S+\s+DENY|^\S+\s+REJECT", line.strip())),
            })
            return result

    if shutil.which("firewall-cmd"):
        fw = run("firewall-cmd", "--state", timeout=6)
        if fw.returncode == 0:
            state = fw.stdout.strip() or "running"
            return {
                "engine": "firewalld",
                "state": state,
                "active": state == "running",
                "default_input_policy": "managed",
                "rules": None,
                "detail": "firewalld verwaltet die Host-Firewall",
            }

    if shutil.which("nft"):
        nft = run("nft", "list", "ruleset", timeout=10)
        if nft.returncode == 0:
            text = nft.stdout or ""
            policy_match = re.search(r"hook\s+input\s+priority[^;]*;\s*policy\s+(drop|reject|accept)", text, re.I)
            policy = policy_match.group(1).lower() if policy_match else "unknown"
            protective = policy in {"drop", "reject"}
            return {
                "engine": "nftables",
                "state": "filtered" if protective else "present",
                "active": protective,
                "default_input_policy": policy,
                "rules": sum(1 for line in text.splitlines() if re.search(r"\b(accept|drop|reject)\b", line)),
                "detail": "Host-Eingang standardmäßig blockiert" if protective else "nftables-Regeln vorhanden, aber keine Drop/Reject-Default-Policy erkannt",
            }
    return result


def security_failed_logins():
    if not shutil.which("journalctl"):
        return {"count_24h": 0, "sources": [], "available": False}
    result = run("journalctl", "--since", "24 hours ago", "--no-pager", "-o", "short-iso", timeout=12)
    if result.returncode != 0:
        return {"count_24h": 0, "sources": [], "available": False}
    patterns = ("failed password", "authentication failure", "invalid user", "failed publickey")
    matched = []
    ips = {}
    for line in result.stdout.splitlines():
        lower = line.lower()
        if not any(pattern in lower for pattern in patterns):
            continue
        matched.append(line)
        for ip in re.findall(r"(?<![\d:])(?:\d{1,3}\.){3}\d{1,3}(?![\d:])", line):
            try:
                ipaddress.ip_address(ip)
            except ValueError:
                continue
            ips[ip] = ips.get(ip, 0) + 1
    sources = sorted(
        [{"ip": ip, "count": count} for ip, count in ips.items()],
        key=lambda item: item["count"],
        reverse=True,
    )[:8]
    return {"count_24h": len(matched), "sources": sources, "available": True}


def security_status_payload():
    sockets = security_listening_sockets()
    firewall = security_firewall_status()
    failed = security_failed_logins()

    ssh_unit = "ssh.service"
    ssh = system_service_state(ssh_unit)
    if ssh.get("state") in {"not-found", "unknown", "inactive"}:
        alt = system_service_state("sshd.service")
        if alt.get("state") not in {"not-found", "unknown"}:
            ssh = alt
            ssh_unit = "sshd.service"

    remote = remote_access_status_payload()
    all_interface = [item for item in sockets if item.get("scope") == "all_interfaces"]
    loopback = [item for item in sockets if item.get("scope") == "loopback"]

    findings = []
    if not firewall.get("active"):
        findings.append({
            "level": "warning",
            "title": "Host-Firewall nicht restriktiv erkannt",
            "detail": firewall.get("detail") or "Keine restriktive Input-Policy erkannt.",
        })
    if ssh.get("ok"):
        findings.append({
            "level": "info",
            "title": "SSH-Dienst aktiv",
            "detail": f"{ssh_unit} ist aktiv. Prüfe, ob Remote-Shell-Zugriff benötigt wird.",
        })
    if failed.get("count_24h", 0) >= 20:
        findings.append({
            "level": "warning",
            "title": "Viele fehlgeschlagene Logins",
            "detail": f"{failed['count_24h']} fehlgeschlagene Authentifizierungen in 24 Stunden.",
        })
    exposed_ports = sorted({str(item.get("port")) for item in all_interface if item.get("port")})
    if len(exposed_ports) > 12:
        findings.append({
            "level": "warning",
            "title": "Viele Host-Ports lauschen auf allen Interfaces",
            "detail": f"{len(exposed_ports)} unterschiedliche Ports sind an alle Interfaces gebunden.",
        })

    score = 100
    if not firewall.get("active"):
        score -= 25
    if failed.get("count_24h", 0) >= 20:
        score -= 15
    elif failed.get("count_24h", 0) > 0:
        score -= 5
    if ssh.get("ok"):
        score -= 5
    if len(exposed_ports) > 12:
        score -= 10
    score = max(0, score)

    return {
        "sampled_at": int(time.time()),
        "score": score,
        "firewall": firewall,
        "ssh": {"unit": ssh_unit, **ssh},
        "failed_logins": failed,
        "listeners": sockets,
        "summary": {
            "listeners": len(sockets),
            "all_interfaces": len(all_interface),
            "loopback": len(loopback),
            "distinct_exposed_ports": len(exposed_ports),
        },
        "remote_access": {
            "mode": remote.get("mode"),
            "domain": remote.get("domain"),
            "certificate": remote.get("certificate"),
        },
        "findings": findings,
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



def release_readiness_payload():
    checks = []

    version = ""
    version_sources = [
        Path("/opt/netfreak2k/VERSION"),
        Path("/var/lib/netfreak2k/version.json"),
    ]
    if version_sources[0].is_file():
        try:
            version = version_sources[0].read_text(encoding="utf-8").strip()
        except OSError:
            version = ""
    if not version and version_sources[1].is_file():
        try:
            saved = json.loads(version_sources[1].read_text(encoding="utf-8"))
            version = str(saved.get("version") or "").strip()
        except (OSError, json.JSONDecodeError):
            version = ""
    version_ok = version in {"1.0.0-rc1", "1.0.0"}
    checks.append({
        "id": "version",
        "label": "Produktversion",
        "ok": version_ok,
        "detail": version or "Version nicht erkannt",
    })

    required_services = [
        "netfreak2k-vm-agent.service",
        "netfreak2k-ha-proxy.service",
        "nginx.service",
        "docker.service",
        "libvirtd.service",
    ]
    service_states = [system_service_state(unit) for unit in required_services]
    service_ok = all(item.get("ok") for item in service_states)
    checks.append({
        "id": "services",
        "label": "Kerndienste",
        "ok": service_ok,
        "detail": f"{sum(1 for item in service_states if item.get('ok'))} von {len(service_states)} aktiv",
    })

    remote = remote_access_status_payload()
    backend_port = int(remote.get("backend_port") or 18080)
    api_ok = False
    if shutil.which("curl"):
        result = run("curl", "-fsS", "--max-time", "6", f"http://127.0.0.1:{backend_port}/api/setup", timeout=8)
        api_ok = result.returncode == 0
    checks.append({
        "id": "api",
        "label": "Lokale API",
        "ok": api_ok,
        "detail": f"127.0.0.1:{backend_port}" if api_ok else f"Keine Antwort auf 127.0.0.1:{backend_port}",
    })

    https_port = int(remote.get("https_port") or 443)
    https_ok = False
    if shutil.which("curl"):
        result = run("curl", "-k", "-fsS", "--max-time", "6", f"https://127.0.0.1:{https_port}/", timeout=8)
        https_ok = result.returncode == 0
    checks.append({
        "id": "https",
        "label": "Lokales HTTPS",
        "ok": https_ok,
        "detail": f"HTTPS Port {https_port} antwortet" if https_ok else f"HTTPS Port {https_port} nicht erreichbar",
    })

    ha_state = "unknown"
    if shutil.which("virsh"):
        result = run("virsh", "--connect", "qemu:///system", "domstate", VM_NAME, timeout=8)
        if result.returncode == 0:
            ha_state = result.stdout.strip().lower()
    checks.append({
        "id": "haos",
        "label": "Home Assistant OS",
        "ok": ha_state == "running",
        "detail": f"VM-Zustand: {ha_state}",
    })

    backups = backup_list_payload().get("backups") or []
    latest = backups[0] if backups else None
    backup_ok = bool(latest) and latest.get("verified") is not False
    checks.append({
        "id": "backup",
        "label": "Recovery-Punkt",
        "ok": backup_ok,
        "detail": (
            f"{latest.get('id')} · " + ("verifiziert" if latest.get("verified") is True else "vorhanden")
            if latest else "Kein Backup vorhanden"
        ),
    })

    timer_units = [
        "netfreak2k-update-check.timer",
        "netfreak2k-backup-scheduler.timer",
        "netfreak2k-cert-renew.timer",
    ]
    timer_states = []
    for unit in timer_units:
        result = run("systemctl", "is-enabled", unit, timeout=5)
        timer_states.append({"unit": unit, "enabled": result.returncode == 0})
    timers_ok = all(item["enabled"] for item in timer_states)
    checks.append({
        "id": "timers",
        "label": "System-Timer",
        "ok": timers_ok,
        "detail": f"{sum(1 for item in timer_states if item['enabled'])} von {len(timer_states)} aktiviert",
    })

    passed = sum(1 for item in checks if item.get("ok"))
    blockers = [item for item in checks if not item.get("ok")]
    return {
        "checked_at": int(time.time()),
        "version": version,
        "checks": checks,
        "passed": passed,
        "total": len(checks),
        "host_ready": not blockers,
        "blockers": blockers,
        "manual_gates": [
            {
                "id": "fresh_install",
                "label": "Fresh-Install-Smoke-Test",
                "complete": False,
                "detail": "Muss auf einem echten unterstützten amd64 Linux Mint/Ubuntu Host bestätigt werden.",
            },
            {
                "id": "upgrade",
                "label": "Upgrade-Smoke-Test",
                "complete": False,
                "detail": "Upgrade einer bestehenden Installation muss real bestätigt werden.",
            },
            {
                "id": "license",
                "label": "Projektlizenz",
                "complete": False,
                "detail": "Vor öffentlichem 1.0.0 Stable muss die Netfreak2k-Quelllizenz explizit gewählt werden.",
            },
        ],
    }


def recovery_status_payload():
    health = health_status_payload()
    backups = backup_list_payload()
    backup_items = backups.get("backups") or []
    update_backups = [item for item in backup_items if item.get("reason") == "update"]
    latest_update_backup = update_backups[0] if update_backups else None
    latest_backup = backup_items[0] if backup_items else None

    services = []
    for unit in MANAGED_SERVICES:
        services.append(system_service_state(unit))

    checks = []
    checks.append({
        "id": "host_health",
        "label": "Systemzustand",
        "ok": health.get("overall") != "critical",
        "detail": f"Health Score {health.get('score', '–')} · {health.get('overall', 'unknown')}",
    })
    checks.append({
        "id": "storage",
        "label": "Systemspeicher",
        "ok": not isinstance((health.get("storage") or {}).get("used_percent"), (int, float)) or (health.get("storage") or {}).get("used_percent") < 95,
        "detail": f"{(health.get('storage') or {}).get('used_percent', '–')}% belegt",
    })
    checks.append({
        "id": "core_services",
        "label": "Kerndienste",
        "ok": all(item.get("ok") for item in services if item.get("unit") != "netfreak2k-vm-agent.service"),
        "detail": f"{sum(1 for item in services if item.get('ok'))} von {len(services)} aktiv",
    })
    checks.append({
        "id": "backup",
        "label": "Recovery-Punkt",
        "ok": bool(latest_backup),
        "detail": latest_backup.get("id") if latest_backup else "Kein Backup vorhanden",
    })

    return {
        "sampled_at": int(time.time()),
        "health": {
            "overall": health.get("overall"),
            "score": health.get("score"),
            "warnings": health.get("warnings") or [],
        },
        "services": services,
        "latest_backup": latest_backup,
        "latest_update_backup": latest_update_backup,
        "checks": checks,
        "ready": all(item.get("ok") for item in checks),
        "safe_actions": [
            {"id": "restart-nginx", "label": "HTTPS Gateway neu starten"},
            {"id": "restart-docker", "label": "Docker Engine neu starten"},
            {"id": "restart-libvirt", "label": "KVM / libvirt neu starten"},
            {"id": "restart-ha-proxy", "label": "Home Assistant Proxy neu starten"},
            {"id": "verify-latest-backup", "label": "Letztes Backup verifizieren"},
            {"id": "verify-update-backup", "label": "Update-Recovery verifizieren"},
        ],
    }


def recovery_action(action):
    action = str(action or "").strip()
    service_map = {
        "restart-nginx": "nginx.service",
        "restart-docker": "docker.service",
        "restart-libvirt": "libvirtd.service",
        "restart-ha-proxy": "netfreak2k-ha-proxy.service",
    }
    if action in service_map:
        return {
            "action": action,
            "result": managed_service_action(service_map[action], "restart"),
            "status": recovery_status_payload(),
        }

    backups = backup_list_payload().get("backups") or []
    if action == "verify-latest-backup":
        if not backups:
            raise RuntimeError("backup_not_found")
        backup_id = str(backups[0].get("id") or "")
        return {
            "action": action,
            "backup_id": backup_id,
            "verification": backup_verify(backup_id),
            "status": recovery_status_payload(),
        }

    if action == "verify-update-backup":
        update_backups = [item for item in backups if item.get("reason") == "update"]
        if not update_backups:
            raise RuntimeError("update_backup_not_found")
        backup_id = str(update_backups[0].get("id") or "")
        return {
            "action": action,
            "backup_id": backup_id,
            "verification": backup_verify(backup_id),
            "status": recovery_status_payload(),
        }

    raise RuntimeError("invalid_recovery_action")


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


def remote_connectivity_status():
    status = remote_access_status_payload()
    domain = str(status.get("domain") or "").strip().lower()
    local_addresses = [str(value) for value in status.get("addresses") or []]

    public_ip = ""
    public_ip_source = ""
    if shutil.which("curl"):
        for endpoint in ("https://api.ipify.org", "https://ifconfig.me/ip"):
            result = run("curl", "-4", "-fsS", "--max-time", "5", endpoint, timeout=7)
            candidate = result.stdout.strip() if result.returncode == 0 else ""
            try:
                parsed = ipaddress.ip_address(candidate)
            except ValueError:
                continue
            if parsed.version == 4 and not parsed.is_private and not parsed.is_loopback:
                public_ip = candidate
                public_ip_source = endpoint
                break

    dns_addresses = []
    if domain:
        result = run("getent", "ahostsv4", domain, timeout=6)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                parts = line.split()
                candidate = parts[0] if parts else ""
                try:
                    parsed = ipaddress.ip_address(candidate)
                except ValueError:
                    continue
                if parsed.version == 4 and candidate not in dns_addresses:
                    dns_addresses.append(candidate)

    listeners = security_listening_sockets()
    local_80 = any(str(item.get("port")) == "80" and item.get("scope") != "loopback" for item in listeners)
    local_443 = any(str(item.get("port")) == "443" and item.get("scope") != "loopback" for item in listeners)

    dns_matches_public = bool(public_ip and public_ip in dns_addresses)
    self_probe = {
        "attempted": False,
        "ok": False,
        "http_code": None,
        "detail": "Kein Domain-Modus konfiguriert",
    }
    if domain and shutil.which("curl"):
        self_probe["attempted"] = True
        probe = run(
            "curl", "-k", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
            "--connect-timeout", "5", "--max-time", "10", f"https://{domain}/",
            timeout=12,
        )
        code = probe.stdout.strip() if probe.returncode == 0 else ""
        self_probe["http_code"] = int(code) if code.isdigit() else None
        self_probe["ok"] = probe.returncode == 0 and code not in {"", "000"}
        self_probe["detail"] = (
            f"HTTPS-Selbsttest antwortet mit HTTP {code}"
            if self_probe["ok"] else
            (probe.stderr.strip()[:300] or "HTTPS-Selbsttest fehlgeschlagen")
        )

    certificate = status.get("certificate") or {}
    checks = [
        {
            "id": "nginx",
            "label": "Nginx Gateway",
            "ok": bool((status.get("nginx") or {}).get("ok")),
            "detail": "Gateway aktiv" if (status.get("nginx") or {}).get("ok") else "Gateway nicht aktiv",
        },
        {
            "id": "listener_80",
            "label": "TCP 80 lokal",
            "ok": local_80,
            "detail": "HTTP lauscht auf Host-Interface" if local_80 else "Kein nicht-lokaler Listener auf TCP 80",
        },
        {
            "id": "listener_443",
            "label": "TCP 443 lokal",
            "ok": local_443,
            "detail": "HTTPS lauscht auf Host-Interface" if local_443 else "Kein nicht-lokaler Listener auf TCP 443",
        },
        {
            "id": "certificate",
            "label": "TLS-Zertifikat",
            "ok": bool(certificate.get("valid")),
            "detail": certificate.get("subject") or ("Zertifikat gültig" if certificate.get("valid") else "Kein gültiges Zertifikat erkannt"),
        },
    ]

    if domain:
        checks.extend([
            {
                "id": "dns",
                "label": "DNS-Auflösung",
                "ok": bool(dns_addresses),
                "detail": ", ".join(dns_addresses[:4]) if dns_addresses else "Domain löst nicht per IPv4 auf",
            },
            {
                "id": "dns_public_ip",
                "label": "DNS → WAN-IP",
                "ok": dns_matches_public,
                "detail": (
                    f"{domain} zeigt auf {public_ip}"
                    if dns_matches_public else
                    f"WAN {public_ip or 'unbekannt'} · DNS {', '.join(dns_addresses[:3]) or 'unbekannt'}"
                ),
            },
            {
                "id": "https_self_probe",
                "label": "HTTPS Domain-Selbsttest",
                "ok": bool(self_probe.get("ok")),
                "detail": self_probe.get("detail"),
            },
        ])

    local_ready = all(item["ok"] for item in checks if item["id"] in {"nginx", "listener_443", "certificate"})
    domain_ready = bool(domain and local_ready and dns_addresses and dns_matches_public and self_probe.get("ok"))
    return {
        "checked_at": int(time.time()),
        "mode": status.get("mode") or "local",
        "domain": domain,
        "local_addresses": local_addresses,
        "public_ip": public_ip,
        "public_ip_source": public_ip_source,
        "dns_addresses": dns_addresses,
        "dns_matches_public_ip": dns_matches_public,
        "listeners": {"http": local_80, "https": local_443},
        "self_probe": self_probe,
        "local_ready": local_ready,
        "domain_ready": domain_ready,
        "outside_in_verified": False,
        "outside_in_note": "Ein echter Test aus einem fremden Netz ist ohne externen Probe-Dienst nicht verifizierbar.",
        "checks": checks,
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


def storage_device_inventory():
    result = run(
        "lsblk", "-J", "-b", "-o",
        "NAME,PATH,PKNAME,TYPE,SIZE,MODEL,VENDOR,SERIAL,TRAN,ROTA,MOUNTPOINTS,FSTYPE,LABEL,UUID,FSAVAIL,FSUSE%",
        timeout=12,
    )
    if result.returncode != 0:
        return []

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

    devices = []

    def walk(item, parent=None):
        entry = {
            "name": item.get("name") or "",
            "path": item.get("path") or "",
            "parent": item.get("pkname") or parent or "",
            "type": item.get("type") or "",
            "size_bytes": item.get("size"),
            "model": str(item.get("model") or "").strip(),
            "vendor": str(item.get("vendor") or "").strip(),
            "serial": str(item.get("serial") or "").strip(),
            "transport": item.get("tran") or "",
            "rotational": bool(item.get("rota")),
            "mountpoints": [m for m in (item.get("mountpoints") or []) if m],
            "filesystem": item.get("fstype") or "",
            "label": item.get("label") or "",
            "uuid": item.get("uuid") or "",
            "fs_available_bytes": item.get("fsavail"),
            "fs_used_percent": item.get("fsuse%"),
        }
        entry["managed_mount"] = next((m for m in entry["mountpoints"] if str(m).startswith("/mnt/netfreak2k/")), "")
        entry["mounted"] = bool(entry["mountpoints"])
        entry["mountable"] = (
            entry["type"] in {"part", "disk"} and
            bool(entry["filesystem"]) and
            not entry["mounted"] and
            entry["filesystem"] not in {"swap", "crypto_LUKS", "LVM2_member"}
        )
        devices.append(entry)
        for child in item.get("children") or []:
            walk(child, item.get("name") or parent)

    for root in payload.get("blockdevices") or []:
        walk(root)
    return devices


def storage_raid_payload():
    mdstat = read_text_value("/proc/mdstat")
    arrays = []
    for line in mdstat.splitlines():
        match = re.match(r"^(md\d+)\s*:\s*(\w+)\s+(\w+)\s+(.+)$", line.strip())
        if match:
            members = re.findall(r"([A-Za-z0-9._-]+)\[\d+\]", match.group(4))
            arrays.append({
                "name": match.group(1),
                "state": match.group(2),
                "level": match.group(3),
                "members": members,
            })

    zpools = []
    if shutil.which("zpool"):
        result = run("zpool", "list", "-H", "-o", "name,size,alloc,free,health", timeout=10)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                parts = line.split("\t")
                if len(parts) >= 5:
                    zpools.append({
                        "name": parts[0],
                        "size": parts[1],
                        "allocated": parts[2],
                        "free": parts[3],
                        "health": parts[4],
                    })
    return {"mdraid": arrays, "zpools": zpools}


def storage_payload():
    usage = shutil.disk_usage("/")
    used = usage.total - usage.free
    percent = round((used / usage.total) * 100, 1) if usage.total else None
    haos_disk = Path("/var/lib/netfreak2k/haos/haos.qcow2")
    haos_size = haos_disk.stat().st_size if haos_disk.exists() else None
    devices = storage_device_inventory()
    smart = smart_health_payload()
    return {
        "host": {
            "total_bytes": usage.total,
            "used_bytes": used,
            "free_bytes": usage.free,
            "used_percent": percent,
        },
        "haos_disk_bytes": haos_size,
        "devices": devices,
        "smart": smart,
        "raid": storage_raid_payload(),
        "summary": {
            "disks": sum(1 for item in devices if item.get("type") == "disk"),
            "partitions": sum(1 for item in devices if item.get("type") == "part"),
            "mounted": sum(1 for item in devices if item.get("mounted")),
            "mountable": sum(1 for item in devices if item.get("mountable")),
        },
    }


def storage_mount(device_path):
    device_path = str(device_path or "").strip()
    if not re.fullmatch(r"/dev/[A-Za-z0-9._/+:-]+", device_path):
        raise RuntimeError("invalid_storage_device")
    inventory = storage_device_inventory()
    item = next((row for row in inventory if row.get("path") == device_path), None)
    if not item:
        raise RuntimeError("storage_device_not_found")
    if not item.get("mountable"):
        raise RuntimeError("storage_device_not_mountable")
    if item.get("mounted"):
        raise RuntimeError("storage_device_already_mounted")

    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", item.get("label") or item.get("name") or "disk").strip("-")[:64] or "disk"
    mountpoint = Path("/mnt/netfreak2k") / slug
    if mountpoint.exists() and any(mountpoint.iterdir()):
        slug = f"{slug}-{hashlib.sha256(device_path.encode()).hexdigest()[:6]}"
        mountpoint = Path("/mnt/netfreak2k") / slug
    mountpoint.mkdir(parents=True, exist_ok=True)

    result = run("mount", device_path, str(mountpoint), timeout=30)
    if result.returncode != 0:
        try:
            mountpoint.rmdir()
        except OSError:
            pass
        raise RuntimeError((result.stderr or result.stdout or "storage_mount_failed").strip()[:500])
    return {"mounted": True, "device": device_path, "mountpoint": str(mountpoint), "storage": storage_payload()}


def storage_unmount(device_path):
    device_path = str(device_path or "").strip()
    if not re.fullmatch(r"/dev/[A-Za-z0-9._/+:-]+", device_path):
        raise RuntimeError("invalid_storage_device")
    inventory = storage_device_inventory()
    item = next((row for row in inventory if row.get("path") == device_path), None)
    if not item:
        raise RuntimeError("storage_device_not_found")
    mountpoint = str(item.get("managed_mount") or "")
    if not mountpoint.startswith("/mnt/netfreak2k/"):
        raise RuntimeError("storage_mount_not_managed")
    result = run("umount", device_path, timeout=30)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "storage_unmount_failed").strip()[:500])
    try:
        Path(mountpoint).rmdir()
    except OSError:
        pass
    return {"unmounted": True, "device": device_path, "mountpoint": mountpoint, "storage": storage_payload()}



def virsh_vm_names():
    result = run("virsh", "--connect", "qemu:///system", "list", "--all", "--name", timeout=10)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "virsh_list_failed")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def require_vm_name(name):
    name = str(name or "").strip()
    if not name or name not in virsh_vm_names():
        raise RuntimeError("vm_not_found")
    return name


def parse_dominfo(name):
    result = run("virsh", "--connect", "qemu:///system", "dominfo", name, timeout=8)
    info = {}
    if result.returncode == 0:
        for line in result.stdout.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            info[key.strip().lower().replace(" ", "_")] = value.strip()
    return info


def vm_disks(name):
    result = run("virsh", "--connect", "qemu:///system", "domblklist", name, "--details", timeout=8)
    rows = []
    if result.returncode != 0:
        return rows
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 4 or parts[0].lower() in {"type", "----"}:
            continue
        dtype, device, target = parts[0], parts[1], parts[2]
        source = " ".join(parts[3:])
        size = None
        if source.startswith("/"):
            try:
                size = Path(source).stat().st_size
            except OSError:
                pass
        rows.append({"type": dtype, "device": device, "target": target, "source": source, "size_bytes": size})
    return rows


def vm_interfaces(name):
    result = run("virsh", "--connect", "qemu:///system", "domiflist", name, timeout=8)
    rows = []
    if result.returncode != 0:
        return rows
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].lower() in {"interface", "---------"}:
            continue
        rows.append({
            "interface": parts[0],
            "type": parts[1],
            "source": parts[2],
            "model": parts[3],
            "mac": parts[4].upper(),
        })
    addr = run("virsh", "--connect", "qemu:///system", "domifaddr", name, "--source", "lease", timeout=8)
    if addr.returncode == 0:
        ips = {}
        for line in addr.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 4 and re.fullmatch(r"(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", parts[1]):
                ips[parts[1].upper()] = parts[3]
        for row in rows:
            row["address"] = ips.get(row["mac"], "")
    return rows


def vm_snapshots(name):
    result = run("virsh", "--connect", "qemu:///system", "snapshot-list", name, "--name", timeout=8)
    if result.returncode != 0:
        return []
    rows = []
    for snapshot in [line.strip() for line in result.stdout.splitlines() if line.strip()][:30]:
        info = run("virsh", "--connect", "qemu:///system", "snapshot-info", name, snapshot, timeout=6)
        created = ""
        state = ""
        if info.returncode == 0:
            for line in info.stdout.splitlines():
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                key = key.strip().lower()
                if key == "creation time":
                    created = value.strip()
                elif key == "state":
                    state = value.strip()
        rows.append({"name": snapshot, "created": created, "state": state})
    return rows


def vm_details(name):
    name = require_vm_name(name)
    state_result = run("virsh", "--connect", "qemu:///system", "domstate", name, timeout=6)
    state = state_result.stdout.strip().lower() if state_result.returncode == 0 else "unknown"
    info = parse_dominfo(name)
    memory_kib = None
    try:
        memory_kib = int(str(info.get("used_memory") or info.get("max_memory") or "").split()[0])
    except (ValueError, IndexError):
        pass
    vcpus = None
    try:
        vcpus = int(info.get("cpu(s)") or 0)
    except ValueError:
        pass
    return {
        "name": name,
        "state": state,
        "managed": name == VM_NAME,
        "autostart": str(info.get("autostart") or "").lower() == "enable",
        "persistent": str(info.get("persistent") or "").lower() == "yes",
        "vcpus": vcpus,
        "memory_bytes": memory_kib * 1024 if memory_kib is not None else None,
        "cpu_time": info.get("cpu_time") or "",
        "disks": vm_disks(name),
        "interfaces": vm_interfaces(name),
        "snapshots": vm_snapshots(name),
    }


def vm_list_payload():
    names = virsh_vm_names()
    vms = [vm_details(name) for name in names]
    return {
        "vms": vms,
        "summary": {
            "total": len(vms),
            "running": sum(1 for vm in vms if vm.get("state") == "running"),
            "autostart": sum(1 for vm in vms if vm.get("autostart")),
            "snapshots": sum(len(vm.get("snapshots") or []) for vm in vms),
        },
    }


def generic_vm_action(name, operation):
    name = require_vm_name(name)
    operation = str(operation or "").strip().lower()
    state = run("virsh", "--connect", "qemu:///system", "domstate", name, timeout=6).stdout.strip().lower()
    if operation == "start":
        if state != "running":
            run("virsh", "--connect", "qemu:///system", "start", name, check=True, timeout=30)
    elif operation == "shutdown":
        if state == "running":
            run("virsh", "--connect", "qemu:///system", "shutdown", name, check=True, timeout=30)
    elif operation == "restart":
        if state == "running":
            result = run("virsh", "--connect", "qemu:///system", "reboot", name, timeout=30)
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip() or "vm_restart_failed")
        else:
            run("virsh", "--connect", "qemu:///system", "start", name, check=True, timeout=30)
    else:
        raise RuntimeError("invalid_vm_action")
    time.sleep(0.4)
    return vm_details(name)


def vm_snapshot_create(name):
    name = require_vm_name(name)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    snapshot = f"n2k-{stamp}"
    result = run(
        "virsh", "--connect", "qemu:///system",
        "snapshot-create-as", name, snapshot,
        "--description", f"Netfreak2k snapshot {stamp}",
        "--atomic",
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "vm_snapshot_failed").strip()[:600])
    return {"created": True, "vm": name, "snapshot": snapshot, "vm_details": vm_details(name)}




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
        "reason": reason if reason in {"scheduled", "manual", "update"} else "manual",
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


def start_linux_upgrade():
    script = "/usr/local/lib/netfreak2k/linux-upgrade.sh"
    if not Path(script).is_file():
        return {"error":"linux_upgrade_worker_not_installed"}
    status_path = Path("/var/lib/netfreak2k/linux-upgrade-status.json")
    try:
        previous = json.loads(status_path.read_text()) if status_path.exists() else {}
    except (OSError, ValueError):
        previous = {}
    if previous.get("state") == "running":
        p = subprocess.run(["systemctl","is-active","--quiet","netfreak2k-linux-upgrade.service"],check=False)
        if p.returncode == 0:
            return {"error":"linux_upgrade_already_running"}
    result = subprocess.run(["systemd-run","--unit=netfreak2k-linux-upgrade","--collect","--property=Type=exec",
        "--property=TimeoutStartSec=2h",script],capture_output=True,text=True,timeout=15,check=False)
    if result.returncode != 0:
        return {"error":"linux_upgrade_start_failed","detail":result.stderr.strip()[:300]}
    return {"accepted":True,"state":"running"}

def ollama_local_status():
    try:
        setup=json.loads(Path("/var/lib/netfreak2k/ollama-setup-status.json").read_text())
    except (OSError,ValueError):
        setup={}
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=3) as resp:
            data=json.load(resp)
        models=[m.get("name","") for m in data.get("models",[])]
        return {"running":True,"models":models,"model":"qwen2.5:0.5b","ready":"qwen2.5:0.5b" in models,"setup":setup}
    except (OSError, ValueError, urllib.error.URLError):
        return {"running":False,"models":[],"model":"qwen2.5:0.5b","ready":False,"setup":setup}

def ollama_local_chat(messages):
    if not isinstance(messages,list) or not 1 <= len(messages) <= 12:
        return {"error":"invalid_messages"}
    safe=[]
    for item in messages:
        if not isinstance(item,dict) or item.get("role") not in ("user","assistant"):
            return {"error":"invalid_message_role"}
        content=item.get("content")
        if not isinstance(content,str) or not 1 <= len(content) <= 2000:
            return {"error":"invalid_message_content"}
        safe.append({"role":item["role"],"content":content})
    if safe[-1]["role"]!="user": return {"error":"last_message_must_be_user"}
    data={"model":"qwen2.5:0.5b","messages":safe,"stream":False,
          "think":False,"keep_alive":0,
          "options":{"num_ctx":1024,"num_predict":96,"temperature":0.5}}
    request=urllib.request.Request("http://127.0.0.1:11434/api/chat",
        data=json.dumps(data).encode(),headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(request,timeout=90) as response:
            result=json.load(response)
        return {"reply":str(result.get("message",{}).get("content",""))[:6000],
                "model":"qwen2.5:0.5b"}
    except urllib.error.HTTPError as exc:
        return {"error":"ollama_http_error","detail":str(exc.code)}
    except (OSError,ValueError,urllib.error.URLError):
        return {"error":"ollama_unavailable_or_timeout"}

def execute(action, request):
    if action == "ollama_local_status":
        return ollama_local_status()

    if action == "ollama_local_chat":
        return ollama_local_chat(request.get("messages"))

    if action == "status":
        return payload()

    if action == "update_netfreak2k":
        return trigger_update()

    if action == "update_preflight":
        return update_preflight_payload()

    if action == "update_safe_netfreak2k":
        return safe_trigger_update()

    if action == "linux_upgrade_start":
        return start_linux_upgrade()

    if action == "check_updates":
        return check_updates_now()

    if action in {"app_start", "app_stop", "app_restart"}:
        return app_action(action, str(request.get("name", "")))

    if action == "app_catalog":
        return catalog_payload()

    if action == "app_diagnostics":
        return docker_apps_payload()

    if action == "app_logs":
        return docker_app_logs(request.get("name"), request.get("lines", 120))

    if action == "app_update_check":
        return docker_app_update_check(request.get("name"))

    if action == "app_install":
        return install_catalog_app(str(request.get("app_id", "")), request.get("options") or {})

    if action == "storage_status":
        return storage_payload()

    if action == "storage_mount":
        return storage_mount(request.get("device"))

    if action == "storage_unmount":
        return storage_unmount(request.get("device"))

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

    if action == "event_logs":
        return event_logs_payload(request.get("lines", 240))

    if action == "recovery_status":
        return recovery_status_payload()

    if action == "recovery_action":
        return recovery_action(request.get("operation"))

    if action == "release_readiness":
        return release_readiness_payload()

    if action == "scheduler_status":
        return scheduler_status_payload()

    if action == "scheduler_run":
        return scheduler_run(request.get("job_id"))

    if action == "security_status":
        return security_status_payload()

    if action == "remote_access_status":
        return remote_access_status_payload()

    if action == "remote_connectivity_status":
        return remote_connectivity_status()

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

    if action == "network_device_wake":
        return network_device_wake(str(request.get("device_id", "")))

    if action == "vm_list":
        return vm_list_payload()

    if action == "vm_action":
        return generic_vm_action(request.get("name"), request.get("operation"))

    if action == "vm_snapshot_create":
        return vm_snapshot_create(request.get("name"))

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
