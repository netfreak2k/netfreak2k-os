#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
N2K_REF="${N2K_REF:-main}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
COMMIT_API="https://api.github.com/repos/${N2K_REPO}/commits/${N2K_REF}"
ARCHIVE_URL="https://github.com/${N2K_REPO}/archive/refs/heads/${N2K_REF}.tar.gz"
PROGRESS_FILE="${STATE_DIR}/update-progress.json"
STARTED_AT="$(date +%s)"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

write_progress(){
  local state="$1" progress="$2" step="$3" message="$4" completed_at="${5:-}"
  mkdir -p "${STATE_DIR}"
  python3 - "${PROGRESS_FILE}" "${state}" "${progress}" "${step}" "${message}" "${STARTED_AT}" "${completed_at}" <<'PY'
import json, os, sys, time
path, state, progress, step, message, started_at, completed_at = sys.argv[1:]
payload = {
    "state": state,
    "progress": int(progress),
    "step": step,
    "message": message,
    "started_at": int(started_at),
    "updated_at": int(time.time()),
}
if completed_at:
    payload["completed_at"] = int(completed_at)
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, separators=(",", ":"))
    handle.write("\n")
os.replace(tmp, path)
PY
}

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
[[ -f "${N2K_DIR}/server/.env" ]] || die "Netfreak2k-Installation nicht gefunden."
command -v curl >/dev/null || die "curl fehlt."
command -v docker >/dev/null || die "Docker fehlt."
docker compose version >/dev/null || die "Docker Compose v2 fehlt."

log "Lade aktuellen Netfreak2k-Stand direkt aus GitHub (${N2K_REF})."
revision="$(curl -fsSL --connect-timeout 8 --max-time 30 --retry 2 -H 'Accept: application/vnd.github+json' -H 'User-Agent: netfreak2k-updater' "${COMMIT_API}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' 2>/dev/null || true)"
if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
  archive_url="https://github.com/${N2K_REPO}/archive/${revision}.tar.gz"
else
  revision=""
  archive_url="${ARCHIVE_URL}"
fi
tmp="$(mktemp -d)"
backup_env="$(mktemp)"
cleanup(){
  local rc=$?
  rm -rf "${tmp}" "${backup_env}"
  if [[ "${rc}" -ne 0 ]]; then
    write_progress "failed" 100 "failed" "Update fehlgeschlagen. Details im systemd-Journal." "$(date +%s)" || true
  fi
  exit "${rc}"
}
trap cleanup EXIT

write_progress "running" 3 "prepare" "Update wird vorbereitet."
cp "${N2K_DIR}/server/.env" "${backup_env}"

log "Lade Update."
write_progress "running" 12 "download" "Aktueller GitHub-Stand wird heruntergeladen."
curl -fL --connect-timeout 8 --max-time 120 --retry 3 "${archive_url}" -o "${tmp}/netfreak2k.tar.gz"
archive_fingerprint="$(sha256sum "${tmp}/netfreak2k.tar.gz" | awk '{print $1}')"
write_progress "running" 30 "extract" "Update wurde geladen und wird entpackt."
mkdir -p "${tmp}/src"
tar -xzf "${tmp}/netfreak2k.tar.gz" -C "${tmp}/src" --strip-components=1

write_progress "running" 42 "validate" "Update-Dateien werden validiert."
[[ -f "${tmp}/src/server/docker-compose.yml" ]] || die "Update-Archiv ist ungültig."
bash -n "${tmp}/src/scripts/update-server.sh"
python3 -m py_compile "${tmp}/src/server/api/server.py" "${tmp}/src/host/vm-agent.py"

log "Aktualisiere Netfreak2k-Programmdateien."
write_progress "running" 55 "install" "Netfreak2k-Programmdateien werden aktualisiert."
find "${N2K_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${tmp}/src/." "${N2K_DIR}/"
chmod 0755 "${N2K_DIR}/scripts/"*.sh
cp "${backup_env}" "${N2K_DIR}/server/.env"
python3 - "${N2K_DIR}/server/.env" <<'PY'
import os, sys
path = sys.argv[1]
values = {}
with open(path, encoding="utf-8") as handle:
    for line in handle:
        if "=" in line:
            k, v = line.rstrip("\n").split("=", 1)
            values[k] = v
legacy = values.get("N2K_HTTP_PORT", "")
if "N2K_BACKEND_PORT" not in values:
    values["N2K_BACKEND_PORT"] = "18080"
if "N2K_PUBLIC_HTTP_PORT" not in values:
    values["N2K_PUBLIC_HTTP_PORT"] = legacy or "80"
if "N2K_PUBLIC_HTTPS_PORT" not in values:
    values["N2K_PUBLIC_HTTPS_PORT"] = "443"
values.pop("N2K_HTTP_PORT", None)
with open(path, "w", encoding="utf-8") as handle:
    for key in sorted(values):
        handle.write(f"{key}={values[key]}\n")
PY
install -m 0755 "${N2K_DIR}/scripts/update-server.sh" /usr/local/sbin/netfreak2k-update
install -m 0755 "${N2K_DIR}/scripts/uninstall-server.sh" /usr/local/sbin/netfreak2k-uninstall

install -m 0755 "${N2K_DIR}/host/vm-agent.py" /usr/local/lib/netfreak2k/vm-agent.py
install -m 0644 "${N2K_DIR}/host/netfreak2k-vm-agent.service" /etc/systemd/system/netfreak2k-vm-agent.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-ha-proxy.service" /etc/systemd/system/netfreak2k-ha-proxy.service
install -m 0755 "${N2K_DIR}/scripts/check-updates.sh" /usr/local/lib/netfreak2k/check-updates.sh
install -m 0755 "${N2K_DIR}/scripts/check-host-updates.py" /usr/local/lib/netfreak2k/check-host-updates.py
install -m 0755 "${N2K_DIR}/scripts/backup-scheduler.sh" /usr/local/lib/netfreak2k/backup-scheduler.sh
install -m 0755 "${N2K_DIR}/scripts/configure-gateway.sh" /usr/local/sbin/netfreak2k-gateway
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.service" /etc/systemd/system/netfreak2k-update-check.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.timer" /etc/systemd/system/netfreak2k-update-check.timer
install -m 0644 "${N2K_DIR}/host/netfreak2k-backup-scheduler.service" /etc/systemd/system/netfreak2k-backup-scheduler.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-backup-scheduler.timer" /etc/systemd/system/netfreak2k-backup-scheduler.timer
install -m 0644 "${N2K_DIR}/host/netfreak2k-cert-renew.service" /etc/systemd/system/netfreak2k-cert-renew.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-cert-renew.timer" /etc/systemd/system/netfreak2k-cert-renew.timer

log "Installiere Media-Center-Audioabhängigkeiten."
write_progress "running" 62 "audio" "PipeWire, Bluetooth und AirPlay-Basis werden geprüft."
apt-get update
apt-get install -y pipewire pipewire-pulse wireplumber pulseaudio-utils bluez libspa-0.2-bluetooth avahi-daemon nmap arp-scan iputils-ping smartmontools nginx openssl certbot
systemctl enable --now bluetooth
systemctl enable --now avahi-daemon

write_progress "running" 68 "services" "Host-Dienste werden aktualisiert."
systemctl daemon-reload
systemctl restart netfreak2k-vm-agent.service
systemctl restart netfreak2k-ha-proxy.service
systemctl enable --now netfreak2k-update-check.timer
systemctl enable --now netfreak2k-backup-scheduler.timer
systemctl enable --now netfreak2k-cert-renew.timer

install -d -m 0770 -o nobody -g nogroup /srv/netfreak2k /srv/netfreak2k/users /srv/netfreak2k/shared

log "Baue und starte aktualisierte Webplattform."
write_progress "running" 78 "containers" "Webplattform und Container werden neu gebaut."
cd "${N2K_DIR}/server"
docker compose up -d --build

write_progress "running" 88 "gateway" "HTTP/HTTPS-Gateway wird aktualisiert."
remote_mode="local"
remote_domain=""
remote_email=""
if [[ -s "${STATE_DIR}/remote-access.json" ]]; then
  readarray -t remote_fields < <(python3 - "${STATE_DIR}/remote-access.json" <<'PY'
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
  remote_mode="${remote_fields[0]:-local}"
  remote_domain="${remote_fields[1]:-}"
  remote_email="${remote_fields[2]:-}"
fi
if [[ "${remote_mode}" == "domain" && -n "${remote_domain}" && -n "${remote_email}" ]]; then
  "${N2K_DIR}/scripts/configure-gateway.sh" domain "${remote_domain}" "${remote_email}" || "${N2K_DIR}/scripts/configure-gateway.sh" local
else
  "${N2K_DIR}/scripts/configure-gateway.sh" local
fi
write_progress "running" 92 "restart" "Neue Webplattform und HTTPS-Gateway wurden gestartet. Abschlusspruefung laeuft."

mkdir -p "${STATE_DIR}"
product_version="$(tr -d '\\r\\n' < "${N2K_DIR}/VERSION" 2>/dev/null || true)"
printf '{"repo":"%s","ref":"%s","version":"%s","revision":"%s","fingerprint":"%s","installed_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${product_version}" "${revision}" "${archive_fingerprint}" "$(date +%s)" > "${STATE_DIR}/version.json"

write_progress "running" 97 "verify" "Installierter Stand wird geprueft."
"${N2K_DIR}/scripts/check-updates.sh" || true
write_progress "completed" 100 "completed" "Update erfolgreich abgeschlossen." "$(date +%s)"

log "Update abgeschlossen."
log "Home Assistant OS VM und Nutzerdaten wurden nicht verändert."
