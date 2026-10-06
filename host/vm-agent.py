#!/usr/bin/env python3
import json
import os
import socket
import subprocess
import time
from pathlib import Path

SOCKET_PATH = Path("/run/netfreak2k/vm-agent.sock")
VM_NAME = "netfreak2k-homeassistant"
HA_IP = "192.168.122.50"
ALLOWED = {"status", "start", "shutdown", "restart"}


def run(*args, check=False):
    result = subprocess.run(
        list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=20,
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
        "url": f"http://{os.environ.get('N2K_PUBLIC_HOST', '')}:8123/" if os.environ.get("N2K_PUBLIC_HOST") else None,
    }


def execute(action):
    if action == "status":
        return payload()

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
                while b"\n" not in raw and len(raw) < 4096:
                    chunk = conn.recv(4096)
                    if not chunk:
                        break
                    raw += chunk
                request = json.loads(raw.decode("utf-8").strip() or "{}")
                action = str(request.get("action", "status"))
                if action not in ALLOWED:
                    raise RuntimeError("unsupported_action")
                response = {"ok": True, "data": execute(action)}
            except Exception as exc:
                response = {"ok": False, "error": str(exc)}
            conn.sendall((json.dumps(response, separators=(",", ":")) + "\n").encode("utf-8"))


if __name__ == "__main__":
    serve()
