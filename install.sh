#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="netfreak2k/netfreak2k-os"
N2K_REF="${N2K_REF:-main}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
N2K_HTTP_PORT="${N2K_HTTP_PORT:-}"
ARCHIVE_URL="https://github.com/${N2K_REPO}/archive/refs/heads/${N2K_REF}.tar.gz"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
[[ "$(uname -s)" == "Linux" ]] || die "Nur Linux wird unterstützt."
[[ -r /etc/os-release ]] || die "/etc/os-release fehlt."

# shellcheck disable=SC1091
. /etc/os-release

case "${ID:-}" in
  linuxmint|ubuntu) ;;
  *) die "Dieser Installer ist aktuell für Linux Mint/Ubuntu freigegeben. Gefunden: ${ID:-unbekannt}" ;;
esac

case "$(dpkg --print-architecture 2>/dev/null || true)" in
  amd64) ;;
  *) die "Home Assistant OS KVM wird in diesem Installer aktuell nur auf amd64 unterstützt." ;;
esac

case "${N2K_DIR}" in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
    die "Unsicherer Installationspfad: ${N2K_DIR}"
    ;;
esac

export DEBIAN_FRONTEND=noninteractive

log "Prüfe Hardware-Virtualisierung."
if ! grep -Eq '(vmx|svm)' /proc/cpuinfo; then
  die "CPU-Virtualisierung wurde nicht erkannt. Intel VT-x/AMD-V bitte im BIOS/UEFI aktivieren."
fi

log "Installiere Netfreak2k-Laufzeitabhängigkeiten."
apt-get update
apt-get install -y   ca-certificates curl xz-utils python3 socat   qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients virtinst ovmf   pipewire pipewire-pulse wireplumber pulseaudio-utils bluez libspa-0.2-bluetooth avahi-daemon nmap arp-scan iputils-ping smartmontools

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
elif ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2
fi

systemctl enable --now docker
systemctl enable --now libvirtd
systemctl enable --now bluetooth
systemctl enable --now avahi-daemon

[[ -e /dev/kvm ]] || die "/dev/kvm fehlt trotz installierter KVM-Pakete. Virtualisierung im BIOS/UEFI prüfen."
docker compose version >/dev/null || die "Docker Compose v2 ist nicht verfügbar."
virsh --connect qemu:///system list >/dev/null || die "libvirt ist nicht funktionsfähig."

if [[ -z "${N2K_HTTP_PORT}" ]]; then
  N2K_HTTP_PORT=80
  if command -v ss >/dev/null 2>&1 && ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)80$'; then
    N2K_HTTP_PORT=8080
    log "Port 80 ist bereits belegt; Netfreak2k nutzt Port 8080."
  fi
fi

if command -v ss >/dev/null 2>&1 && ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)8123$'; then
  if systemctl is-active --quiet netfreak2k-ha-proxy.service 2>/dev/null; then
    log "Port 8123 wird bereits vom Netfreak2k Home-Assistant-Proxy verwendet; wird weiterverwendet."
  else
    listener="$(ss -H -ltnp 'sport = :8123' 2>/dev/null | head -n1 || true)"
    die "Port 8123 ist durch einen anderen Dienst belegt. Bitte erst prüfen: ${listener:-unbekannter Prozess}"
  fi
fi

log "Lade aktuellen Netfreak2k-Stand direkt aus GitHub (${N2K_REF})."
tmp="$(mktemp -d)"
# shellcheck disable=SC2064
trap "rm -rf '${tmp}'" EXIT
curl -fL --connect-timeout 8 --max-time 120 --retry 3 "${ARCHIVE_URL}" -o "${tmp}/netfreak2k.tar.gz"
archive_fingerprint="$(sha256sum "${tmp}/netfreak2k.tar.gz" | awk '{print $1}')"
mkdir -p "${tmp}/src"
tar -xzf "${tmp}/netfreak2k.tar.gz" -C "${tmp}/src" --strip-components=1
[[ -f "${tmp}/src/server/docker-compose.yml" ]] || die "Ungültiges Netfreak2k-Archiv."

mkdir -p "${N2K_DIR}"
find "${N2K_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${tmp}/src/." "${N2K_DIR}/"
chmod 0755 "${N2K_DIR}/scripts/"*.sh
install -m 0755 "${N2K_DIR}/scripts/update-server.sh" /usr/local/sbin/netfreak2k-update
install -m 0755 "${N2K_DIR}/scripts/uninstall-server.sh" /usr/local/sbin/netfreak2k-uninstall
printf 'N2K_HTTP_PORT=%s\n' "${N2K_HTTP_PORT}" > "${N2K_DIR}/server/.env"

log "Installiere eingeschränkten Netfreak2k VM-Agenten."
install -d -m 0755 /usr/local/lib/netfreak2k /run/netfreak2k /var/lib/netfreak2k
install -d -m 0770 -o nobody -g nogroup /srv/netfreak2k /srv/netfreak2k/users /srv/netfreak2k/shared
if [[ ! -s /var/lib/netfreak2k/agent.token ]]; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(48))' > /var/lib/netfreak2k/agent.token
fi
chown root:nogroup /var/lib/netfreak2k/agent.token
chmod 0640 /var/lib/netfreak2k/agent.token
install -m 0755 "${N2K_DIR}/host/vm-agent.py" /usr/local/lib/netfreak2k/vm-agent.py
install -m 0644 "${N2K_DIR}/host/netfreak2k-vm-agent.service" /etc/systemd/system/netfreak2k-vm-agent.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-ha-proxy.service" /etc/systemd/system/netfreak2k-ha-proxy.service
install -m 0755 "${N2K_DIR}/scripts/check-updates.sh" /usr/local/lib/netfreak2k/check-updates.sh
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.service" /etc/systemd/system/netfreak2k-update-check.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.timer" /etc/systemd/system/netfreak2k-update-check.timer
systemctl daemon-reload
systemctl enable --now netfreak2k-vm-agent.service
systemctl enable --now netfreak2k-ha-proxy.service
systemctl enable --now netfreak2k-update-check.timer

log "Installiere Home Assistant OS als KVM-VM."
bash "${N2K_DIR}/scripts/provision-haos.sh"

log "Starte Netfreak2k Webplattform."
cd "${N2K_DIR}/server"
docker compose up -d --build

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${N2K_HTTP_PORT}/api/setup" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${N2K_HTTP_PORT}/api/setup" >/dev/null   || die "Netfreak2k Weboberfläche antwortet nicht."

mkdir -p /var/lib/netfreak2k
printf '{"repo":"%s","ref":"%s","fingerprint":"%s","installed_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${archive_fingerprint}" "$(date +%s)" > /var/lib/netfreak2k/version.json
"${N2K_DIR}/scripts/check-updates.sh" || true

host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "${host_ip}" ]] || host_ip="<MINT-IP>"

printf '\n============================================================\n'
printf ' Netfreak2k wurde erfolgreich installiert.\n'
printf ' Linux Mint wurde nicht ersetzt oder neu partitioniert.\n'
printf ' Netfreak2k: http://%s' "${host_ip}"
if [[ "${N2K_HTTP_PORT}" != "80" ]]; then printf ':%s' "${N2K_HTTP_PORT}"; fi
printf '/\n'
printf ' Home Assistant OS: http://%s:8123/\n' "${host_ip}"
printf '============================================================\n'
printf '\nBeim ersten Netfreak2k-Aufruf legst du deinen lokalen Admin an.\n'
printf 'HAOS kann beim ersten Start einige Minuten benötigen.\n'
