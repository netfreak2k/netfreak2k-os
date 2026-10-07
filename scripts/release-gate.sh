#!/usr/bin/env bash
set -Eeuo pipefail

N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
BACKEND_PORT="${N2K_BACKEND_PORT:-18080}"

ok(){ printf '[ OK ] %s\n' "$*"; }
warn(){ printf '[WARN] %s\n' "$*"; }
fail(){ printf '[FAIL] %s\n' "$*" >&2; failures=$((failures+1)); }

failures=0

printf 'Netfreak2k v1.0 host release gate\n'
printf '=================================\n'

if [[ -f "${N2K_DIR}/VERSION" ]]; then
  version="$(tr -d '\r\n' < "${N2K_DIR}/VERSION")"
  [[ "$version" == "1.0.0-rc1" || "$version" == "1.0.0" ]] && ok "Version: $version" || fail "Unerwartete Version: $version"
else
  fail "VERSION fehlt unter ${N2K_DIR}"
fi

for unit in netfreak2k-vm-agent.service netfreak2k-ha-proxy.service nginx.service docker.service libvirtd.service; do
  if systemctl is-active --quiet "$unit"; then
    ok "$unit aktiv"
  else
    fail "$unit nicht aktiv"
  fi
done

if curl -fsS --max-time 8 "http://127.0.0.1:${BACKEND_PORT}/api/setup" >/dev/null; then
  ok "N2K API antwortet lokal"
else
  fail "N2K API antwortet nicht auf Port ${BACKEND_PORT}"
fi

if curl -kfsS --max-time 8 https://127.0.0.1/ >/dev/null; then
  ok "Lokales HTTPS-Gateway antwortet"
else
  fail "Lokales HTTPS-Gateway antwortet nicht"
fi

if virsh --connect qemu:///system dominfo netfreak2k-homeassistant >/dev/null 2>&1; then
  state="$(virsh --connect qemu:///system domstate netfreak2k-homeassistant 2>/dev/null | tr -d '\r')"
  [[ "$state" == "running" ]] && ok "Home Assistant OS VM läuft" || fail "HAOS VM Zustand: $state"
else
  fail "Home Assistant OS VM fehlt"
fi

if curl -fsS --max-time 8 http://127.0.0.1:8123/ >/dev/null 2>&1; then
  ok "Home Assistant Proxy antwortet auf Port 8123"
else
  warn "Home Assistant antwortet noch nicht auf Port 8123"
fi

if [[ -d "${STATE_DIR}/backups" ]]; then
  latest="$(find "${STATE_DIR}/backups" -mindepth 1 -maxdepth 1 -type d -name 'n2k-*' -printf '%f\n' 2>/dev/null | sort -r | head -n1 || true)"
  [[ -n "$latest" ]] && ok "Backup vorhanden: $latest" || fail "Kein N2K-Backup gefunden"
else
  fail "Backup-Verzeichnis fehlt"
fi

if [[ -f "${STATE_DIR}/version.json" ]]; then
  if python3 - "${STATE_DIR}/version.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
assert p.get("fingerprint")
assert p.get("installed_at")
assert p.get("version") or p.get("ref")
PY
  then
    ok "Installationsmetadaten vollständig"
  else
    fail "version.json ungültig oder unvollständig"
  fi
else
  fail "version.json fehlt"
fi

if systemctl is-enabled --quiet netfreak2k-update-check.timer; then ok "Update-Timer aktiviert"; else fail "Update-Timer nicht aktiviert"; fi
if systemctl is-enabled --quiet netfreak2k-backup-scheduler.timer; then ok "Backup-Timer aktiviert"; else fail "Backup-Timer nicht aktiviert"; fi
if systemctl is-enabled --quiet netfreak2k-cert-renew.timer; then ok "Zertifikats-Timer aktiviert"; else fail "Zertifikats-Timer nicht aktiviert"; fi

printf '\n'
if (( failures == 0 )); then
  printf 'RESULT: PASS\n'
  exit 0
fi
printf 'RESULT: FAIL (%d Fehler)\n' "$failures"
exit 1
