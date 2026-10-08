#!/usr/bin/env bash
set -Eeuo pipefail
file=/var/lib/netfreak2k/ollama-setup-status.json
if [[ -s "$file" ]] && python3 - "$file" <<'PY'
import json,sys
try:
 d=json.load(open(sys.argv[1]))
 exit(0 if d.get("state")=="ready" else 1)
except (OSError,ValueError): exit(1)
PY
then
  exit 0
fi
exec /usr/local/lib/netfreak2k/provision-ollama.sh
