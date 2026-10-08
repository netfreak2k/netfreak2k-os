#!/usr/bin/env bash
# Optional, unattended local Ollama provisioning for Netfreak2k Server-OS.
# Must run as root from the host installer/updater. Never installs Hermes.
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
STATE=/var/lib/netfreak2k/ollama-setup-status.json
MODEL=qwen2.5:0.5b
mkdir -p /var/lib/netfreak2k
status(){
  python3 - "$STATE" "$1" "$2" <<'PY'
import json,os,sys,time
path,state,message=sys.argv[1:]
tmp=path+".tmp"
with open(tmp,"w") as f:
 json.dump({"state":state,"message":message,"model":"qwen2.5:0.5b","updated_at":int(time.time())},f)
os.replace(tmp,path)
PY
}
fail(){ status error "$1"; echo "[N2K Ollama] $1" >&2; exit 1; }
trap 'status error "Ollama provisioning failed"' ERR
status preparing "Prüfe lokalen RAM und Ollama"
if [[ $(awk '/MemTotal:/ {print $2}' /proc/meminfo) -lt 3500000 ]]; then
  fail "Zu wenig RAM fuer lokale KI (mindestens 4 GB empfohlen)."
fi
if ! command -v ollama >/dev/null 2>&1; then
  status installing "Installiere Ollama lokal"
  # Official upstream installer; intentionally no shell prompts.
  curl -fsSL --connect-timeout 10 --max-time 120 https://ollama.com/install.sh -o /tmp/n2k-ollama-install.sh ||
    fail "Ollama-Installer nicht erreichbar"
  bash /tmp/n2k-ollama-install.sh || fail "Ollama konnte nicht installiert werden"
fi
install -d -m 0755 /etc/systemd/system/ollama.service.d
cat >/etc/systemd/system/ollama.service.d/95-n2k-local-ai.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=0"
Environment="OLLAMA_CONTEXT_LENGTH=1024"
MemoryHigh=1200M
MemoryMax=1500M
MemorySwapMax=0
EOF
systemctl daemon-reload
systemctl enable --now ollama.service
systemctl restart ollama.service
status downloading "Lade Qwen2.5 0.5B (nur beim ersten Mal)"
if ! ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  timeout 600 ollama pull "$MODEL" || fail "Modell konnte nicht heruntergeladen werden"
fi
status verifying "Prüfe das lokale Modell"
# A downloaded model is not sufficient: verify the generation API is usable.
if ! timeout 100 python3 - <<'PY'
import json,urllib.request
payload={"model":"qwen2.5:0.5b","prompt":"Antworte nur mit OK.","stream":False,
         "keep_alive":0,"options":{"num_ctx":1024,"num_predict":5}}
req=urllib.request.Request("http://127.0.0.1:11434/api/generate",
    data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=90) as response:
    result=json.load(response)
assert result.get("done") is True and isinstance(result.get("response"),str)
PY
then
  fail "Modell installiert, aber Inferenz-Test fehlgeschlagen. KI ist noch nicht bereit."
fi
status ready "Ollama und Qwen2.5 0.5B getestet und startbereit"
