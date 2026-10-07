#!/usr/bin/env bash
set -Eeuo pipefail

N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
ROLLBACK_DIR="${STATE_DIR}/rollback"

log(){ printf '\n[Netfreak2k Rollback] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k Rollback] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "root_required"
[[ -s "${ROLLBACK_DIR}/source.tar.gz" ]] || die "rollback_snapshot_missing"
[[ -s "${ROLLBACK_DIR}/server.env" ]] || die "rollback_environment_missing"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

log "Prüfe Rollback-Punkt."
mkdir -p "${tmp}/source"
tar -xzf "${ROLLBACK_DIR}/source.tar.gz" -C "${tmp}/source"
[[ -f "${tmp}/source/server/docker-compose.yml" ]] || die "rollback_snapshot_invalid"
[[ -f "${tmp}/source/scripts/update-server.sh" ]] || die "rollback_snapshot_invalid"
bash -n "${tmp}/source/scripts/update-server.sh"
python3 -m py_compile "${tmp}/source/server/api/server.py" "${tmp}/source/host/vm-agent.py"

log "Stelle vorherigen Programmstand wieder her."
find "${N2K_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${tmp}/source/." "${N2K_DIR}/"
cp "${ROLLBACK_DIR}/server.env" "${N2K_DIR}/server/.env"
chmod 0755 "${N2K_DIR}/scripts/"*.sh

install -m 0755 "${N2K_DIR}/scripts/update-server.sh" /usr/local/sbin/netfreak2k-update
install -m 0755 "${N2K_DIR}/scripts/uninstall-server.sh" /usr/local/sbin/netfreak2k-uninstall
if [[ -f "${N2K_DIR}/scripts/rollback-server.sh" ]]; then
  install -m 0755 "${N2K_DIR}/scripts/rollback-server.sh" /usr/local/sbin/netfreak2k-rollback
fi
install -m 0755 "${N2K_DIR}/host/vm-agent.py" /usr/local/lib/netfreak2k/vm-agent.py
install -m 0644 "${N2K_DIR}/host/netfreak2k-vm-agent.service" /etc/systemd/system/netfreak2k-vm-agent.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-ha-proxy.service" /etc/systemd/system/netfreak2k-ha-proxy.service
install -m 0755 "${N2K_DIR}/scripts/check-updates.sh" /usr/local/lib/netfreak2k/check-updates.sh
install -m 0755 "${N2K_DIR}/scripts/backup-scheduler.sh" /usr/local/lib/netfreak2k/backup-scheduler.sh

if [[ -f "${N2K_DIR}/scripts/configure-gateway.sh" ]]; then
  install -m 0755 "${N2K_DIR}/scripts/configure-gateway.sh" /usr/local/sbin/netfreak2k-gateway
fi

for unit in netfreak2k-update-check.service netfreak2k-update-check.timer netfreak2k-backup-scheduler.service netfreak2k-backup-scheduler.timer netfreak2k-cert-renew.service netfreak2k-cert-renew.timer; do
  [[ -f "${N2K_DIR}/host/${unit}" ]] && install -m 0644 "${N2K_DIR}/host/${unit}" "/etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl restart netfreak2k-vm-agent.service
systemctl restart netfreak2k-ha-proxy.service

log "Baue vorherige Webplattform."
cd "${N2K_DIR}/server"
docker compose up -d --build

if [[ -x "${N2K_DIR}/scripts/configure-gateway.sh" ]]; then
  mode="local"
  domain=""
  email=""
  if [[ -s "${STATE_DIR}/remote-access.json" ]]; then
    readarray -t fields < <(python3 - "${STATE_DIR}/remote-access.json" <<'PY'
import json, sys
try:
    data=json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data={}
print(data.get("mode") or "local")
print(data.get("domain") or "")
print(data.get("email") or "")
PY
)
    mode="${fields[0]:-local}"
    domain="${fields[1]:-}"
    email="${fields[2]:-}"
  fi
  if [[ "${mode}" == "domain" && -n "${domain}" && -n "${email}" ]]; then
    "${N2K_DIR}/scripts/configure-gateway.sh" domain "${domain}" "${email}" || "${N2K_DIR}/scripts/configure-gateway.sh" local
  else
    "${N2K_DIR}/scripts/configure-gateway.sh" local
  fi
fi

if [[ -s "${ROLLBACK_DIR}/version.json" ]]; then
  cp "${ROLLBACK_DIR}/version.json" "${STATE_DIR}/version.json"
fi
"${N2K_DIR}/scripts/check-updates.sh" || true

log "Rollback erfolgreich abgeschlossen."
rm -rf "${ROLLBACK_DIR}"
