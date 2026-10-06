#!/usr/bin/env bash
set -Eeuo pipefail

N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
[[ -d "${N2K_DIR}/server" ]] || die "Keine Netfreak2k-Installation unter ${N2K_DIR} gefunden."
command -v docker >/dev/null 2>&1 || die "Docker ist nicht verfügbar."

log "Stoppe und entferne nur Netfreak2k-Container und das Netfreak2k-Netzwerk."
cd "${N2K_DIR}/server"
docker compose down --remove-orphans

log "Entferne Netfreak2k-Programmdateien unter ${N2K_DIR}."
rm -rf "${N2K_DIR}"

cat <<'EOF'

Netfreak2k wurde entfernt.

NICHT entfernt wurden:
- Docker Engine
- andere Docker-Container
- andere Docker-Volumes
- dein Linux
- Partitionen
- Bootloader
- persönliche Dateien

Das persistente Netfreak2k-Datenvolume "netfreak2k-data" bleibt absichtlich erhalten.
Wenn du es später wirklich löschen willst:
  sudo docker volume rm netfreak2k-data netfreak2k-inventory
EOF
