#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="netfreak2k/netfreak2k-os"
N2K_REF="${N2K_REF:-main}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
N2K_PUBLIC_HTTP_PORT="${N2K_PUBLIC_HTTP_PORT:-${N2K_HTTP_PORT:-}}"
N2K_PUBLIC_HTTPS_PORT="${N2K_PUBLIC_HTTPS_PORT:-}"
N2K_BACKEND_PORT="${N2K_BACKEND_PORT:-18080}"
COMMIT_API="https://api.github.com/repos/${N2K_REPO}/commits/${N2K_REF}"
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
apt-get install -y   ca-certificates curl xz-utils python3 socat nginx openssl certbot   qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients virtinst ovmf   pipewire pipewire-pulse wireplumber pulseaudio-utils bluez libspa-0.2-bluetooth avahi-daemon nmap arp-scan iputils-ping smartmontools

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

if [[ -z "${N2K_PUBLIC_HTTP_PORT}" ]]; then
  N2K_PUBLIC_HTTP_PORT=80
  if command -v ss >/dev/null 2>&1 && ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)80$'; then
    N2K_PUBLIC_HTTP_PORT=8080
    log "Port 80 ist bereits belegt; Netfreak2k HTTP nutzt Port 8080."
  fi
fi

if [[ -z "${N2K_PUBLIC_HTTPS_PORT}" ]]; then
  N2K_PUBLIC_HTTPS_PORT=443
  if command -v ss >/dev/null 2>&1 && ss -H -ltn | awk '{print $4}' | grep -Eq '(^|:)443$'; then
    N2K_PUBLIC_HTTPS_PORT=8443
    log "Port 443 ist bereits belegt; Netfreak2k HTTPS nutzt Port 8443."
  fi
fi

if command -v ss >/dev/null 2>&1 && ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)${N2K_BACKEND_PORT}$"; then
  for candidate in 18081 18082 18083; do
    if ! ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)${candidate}$"; then
      N2K_BACKEND_PORT="${candidate}"
      break
    fi
  done
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
revision="$(curl -fsSL --connect-timeout 8 --max-time 30 --retry 2 -H 'Accept: application/vnd.github+json' -H 'User-Agent: netfreak2k-installer' "${COMMIT_API}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' 2>/dev/null || true)"
archive_url="${ARCHIVE_URL}"
if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
  archive_url="https://github.com/${N2K_REPO}/archive/${revision}.tar.gz"
else
  revision=""
fi
tmp="$(mktemp -d)"
# shellcheck disable=SC2064
trap "rm -rf '${tmp}'" EXIT
curl -fL --connect-timeout 8 --max-time 120 --retry 3 "${archive_url}" -o "${tmp}/netfreak2k.tar.gz"
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
printf 'N2K_BACKEND_PORT=%s\nN2K_PUBLIC_HTTP_PORT=%s\nN2K_PUBLIC_HTTPS_PORT=%s\n' "${N2K_BACKEND_PORT}" "${N2K_PUBLIC_HTTP_PORT}" "${N2K_PUBLIC_HTTPS_PORT}" > "${N2K_DIR}/server/.env"

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
install -m 0755 "${N2K_DIR}/scripts/check-host-updates.py" /usr/local/lib/netfreak2k/check-host-updates.py
install -m 0755 "${N2K_DIR}/scripts/linux-upgrade.sh" /usr/local/lib/netfreak2k/linux-upgrade.sh
install -m 0755 "${N2K_DIR}/scripts/backup-scheduler.sh" /usr/local/lib/netfreak2k/backup-scheduler.sh
install -m 0755 "${N2K_DIR}/scripts/configure-gateway.sh" /usr/local/sbin/netfreak2k-gateway
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.service" /etc/systemd/system/netfreak2k-update-check.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.timer" /etc/systemd/system/netfreak2k-update-check.timer
install -m 0644 "${N2K_DIR}/host/netfreak2k-backup-scheduler.service" /etc/systemd/system/netfreak2k-backup-scheduler.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-backup-scheduler.timer" /etc/systemd/system/netfreak2k-backup-scheduler.timer
install -m 0644 "${N2K_DIR}/host/netfreak2k-cert-renew.service" /etc/systemd/system/netfreak2k-cert-renew.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-cert-renew.timer" /etc/systemd/system/netfreak2k-cert-renew.timer
systemctl daemon-reload
systemctl enable --now netfreak2k-vm-agent.service
systemctl enable --now netfreak2k-ha-proxy.service
systemctl enable --now netfreak2k-update-check.timer
systemctl enable --now netfreak2k-backup-scheduler.timer
systemctl enable --now netfreak2k-cert-renew.timer

log "Installiere Home Assistant OS als KVM-VM."
bash "${N2K_DIR}/scripts/provision-haos.sh"

log "Starte Netfreak2k Webplattform."
cd "${N2K_DIR}/server"
docker compose up -d --build

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${N2K_BACKEND_PORT}/api/setup" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${N2K_BACKEND_PORT}/api/setup" >/dev/null   || die "Netfreak2k Weboberfläche antwortet nicht."

log "Aktiviere lokalen HTTP/HTTPS-Gateway."
"${N2K_DIR}/scripts/configure-gateway.sh" local

mkdir -p /var/lib/netfreak2k
product_version="$(tr -d '\\r\\n' < "${N2K_DIR}/VERSION" 2>/dev/null || true)"
printf '{"repo":"%s","ref":"%s","version":"%s","revision":"%s","fingerprint":"%s","installed_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${product_version}" "${revision}" "${archive_fingerprint}" "$(date +%s)" > /var/lib/netfreak2k/version.json
"${N2K_DIR}/scripts/check-updates.sh" || true

host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "${host_ip}" ]] || host_ip="<MINT-IP>"

printf '\n============================================================\n'
printf ' Netfreak2k wurde erfolgreich installiert.\n'
printf ' Linux Mint wurde nicht ersetzt oder neu partitioniert.\n'
printf ' Netfreak2k HTTP:  http://%s' "${host_ip}"
if [[ "${N2K_PUBLIC_HTTP_PORT}" != "80" ]]; then printf ':%s' "${N2K_PUBLIC_HTTP_PORT}"; fi
printf '/\n'
printf ' Netfreak2k HTTPS: https://%s' "${host_ip}"
if [[ "${N2K_PUBLIC_HTTPS_PORT}" != "443" ]]; then printf ':%s' "${N2K_PUBLIC_HTTPS_PORT}"; fi
printf '/  (lokales Zertifikat)\n'
printf ' Home Assistant OS: http://%s:8123/\n' "${host_ip}"
printf '============================================================\n'
printf '\nBeim ersten Netfreak2k-Aufruf legst du deinen lokalen Admin an.\n'
printf 'HAOS kann beim ersten Start einige Minuten benötigen.\n'
