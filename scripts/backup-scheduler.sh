#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json
import socket
from pathlib import Path

token_file = Path("/var/lib/netfreak2k/agent.token")
socket_path = "/run/netfreak2k/vm-agent.sock"

if not token_file.is_file():
    raise SystemExit(0)

token = token_file.read_text(encoding="utf-8").strip()
request = {"action": "backup_scheduled_tick", "token": token}

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(300)
sock.connect(socket_path)
sock.sendall((json.dumps(request, separators=(",", ":")) + "\n").encode("utf-8"))

raw = b""
while b"\n" not in raw and len(raw) < 1024 * 1024:
    chunk = sock.recv(65536)
    if not chunk:
        break
    raw += chunk
sock.close()

response = json.loads(raw.decode("utf-8").strip() or "{}")
if not response.get("ok"):
    raise SystemExit(response.get("error") or "scheduled_backup_failed")
PY
