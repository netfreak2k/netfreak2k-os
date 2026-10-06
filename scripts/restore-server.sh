#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ID="${1:-}"
BACKUP_ROOT="/var/lib/netfreak2k/backups"
N2K_DIR="/opt/netfreak2k"

log(){ printf '\n[Netfreak2k Restore] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k Restore] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte als root ausführen."
[[ "${BACKUP_ID}" =~ ^n2k-[0-9]{8}-[0-9]{6}$ ]] || die "Ungültige Backup-ID."

SRC="${BACKUP_ROOT}/${BACKUP_ID}"
[[ -d "${SRC}" ]] || die "Backup nicht gefunden: ${BACKUP_ID}"

log "Stelle Netfreak2k-Daten aus ${BACKUP_ID} wieder her."

if [[ -f "${SRC}/server.env" && -d "${N2K_DIR}/server" ]]; then
  cp "${SRC}/server.env" "${N2K_DIR}/server/.env"
fi

if [[ -f "${SRC}/netfreak2k.db" ]]; then
  if docker inspect netfreak2k-api >/dev/null 2>&1; then
    docker cp "${SRC}/netfreak2k.db" netfreak2k-api:/data/netfreak2k.db.restore
    docker exec netfreak2k-api sh -c 'mv /data/netfreak2k.db.restore /data/netfreak2k.db'
    docker restart netfreak2k-api >/dev/null
  fi
fi

restore_app(){
  local app_id="$1"
  local container="$2"
  local mount="$3"
  local source="${SRC}/apps/${app_id}"
  [[ -d "${source}" ]] || return 0
  docker inspect "${container}" >/dev/null 2>&1 || return 0
  local was_running
  was_running="$(docker inspect --format '{{.State.Running}}' "${container}" 2>/dev/null || true)"
  docker stop --time 20 "${container}" >/dev/null 2>&1 || true
  docker cp "${source}/." "${container}:${mount}/"
  if [[ "${was_running}" == "true" ]]; then
    docker start "${container}" >/dev/null
  fi
}

restore_app "uptime-kuma" "netfreak2k-app-uptime-kuma" "/app/data"
restore_app "file-browser" "netfreak2k-app-file-browser" "/srv"

if [[ -d "${N2K_DIR}/server" ]]; then
  cd "${N2K_DIR}/server"
  docker compose up -d >/dev/null
fi

log "Wiederherstellung abgeschlossen."
