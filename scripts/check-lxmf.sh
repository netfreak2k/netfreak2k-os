#!/usr/bin/env bash
# Non-destructive LXMF first-run check. Run from the repository root.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f server/docker-compose.yml config --quiet
docker compose -f server/docker-compose.yml ps netfreak2k-reticulum-lan netfreak2k-messenger
docker exec netfreak2k-messenger python -c '
import json, urllib.request
with urllib.request.urlopen("http://127.0.0.1:8091/status", timeout=10) as response:
    data=json.load(response)
assert data.get("online") is True, "LXMF runtime offline"
assert len(data.get("identity") or "") == 32, "LXMF destination missing"
print("PASS: LXMF online; identity available; name:", data.get("node_name"))
'
echo "INFO: A successful incoming and outgoing LXMF message is still required for end-to-end validation."
