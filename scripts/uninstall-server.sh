#!/usr/bin/env bash
set -Eeuo pipefail

N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
[[ -d "${N2K_DIR}/server" ]] || die "Keine Netfreak2k-Installation unter ${N2K_DIR} gefunden."

log "Stoppe Netfreak2k-Webdienste."
if command -v docker >/dev/null 2>&1; then
  cd "${N2K_DIR}/server"
  docker compose down --remove-orphans || true
fi

systemctl disable --now netfreak2k-vm-agent.service 2>/dev/null || true
systemctl disable --now netfreak2k-ha-proxy.service 2>/dev/null || true
rm -f /etc/systemd/system/netfreak2k-vm-agent.service /etc/systemd/system/netfreak2k-ha-proxy.service
rm -f /usr/local/lib/netfreak2k/vm-agent.py
rm -f /usr/local/sbin/netfreak2k-update /usr/local/sbin/netfreak2k-uninstall
systemctl daemon-reload

rm -rf "${N2K_DIR}"

cat <<'EOF'

Netfreak2k-Webplattform wurde entfernt.

Bewusst NICHT entfernt:
- Linux Mint
- Docker
- KVM/QEMU/libvirt
- andere Container
- andere VMs
- Home Assistant OS VM und ihre virtuelle Festplatte
- persistente Netfreak2k-Datenvolumes

Home Assistant bleibt damit erhalten und kann später wieder an Netfreak2k angebunden werden.
EOF
