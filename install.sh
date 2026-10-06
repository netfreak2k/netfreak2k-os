#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="netfreak2k/netfreak2k-os"
N2K_REF="${N2K_REF:-main}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
N2K_PORT="${N2K_HTTP_PORT:-}"
N2K_ARCHIVE_URL="https://github.com/${N2K_REPO}/archive/refs/heads/${N2K_REF}.tar.gz"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || die "Dieser Installer unterstützt aktuell nur Linux."
[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."

case "${N2K_DIR}" in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
    die "Unsicherer Installationspfad abgelehnt: ${N2K_DIR}"
    ;;
esac
[[ "${N2K_DIR}" == /* ]] || die "N2K_DIR muss ein absoluter Pfad sein."

if [[ ! -r /etc/os-release ]]; then
  die "/etc/os-release fehlt; Distribution kann nicht sicher erkannt werden."
fi

# shellcheck disable=SC1091
. /etc/os-release
DIST_ID="${ID:-}"
DIST_LIKE="${ID_LIKE:-}"
CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"

case "${ARCH}" in
  amd64|arm64) ;;
  *) die "Aktuell unterstützt: amd64 und arm64. Gefunden: ${ARCH}" ;;
esac

is_debian_family=false
case " ${DIST_ID} ${DIST_LIKE} " in
  *" debian "*|*" ubuntu "*) is_debian_family=true ;;
esac
${is_debian_family} || die "Automatische Installation ist aktuell nur für Debian/Ubuntu-Familie freigegeben."

command -v apt-get >/dev/null || die "apt-get fehlt."

ensure_base_tools() {
  local missing=()
  for cmd in curl tar; do
    command -v "${cmd}" >/dev/null || missing+=("${cmd}")
  done
  if (("${#missing[@]}")); then
    log "Installiere nur notwendige Basiswerkzeuge: ${missing[*]}"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar
  fi
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Vorhandenes Docker + Compose wird verwendet."
    return
  fi

  log "Docker/Compose fehlt. Prüfe auf bestehende Container-Pakete, bevor etwas geändert wird."

  local conflicts=()
  for pkg in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "install ok installed"; then
      conflicts+=("${pkg}")
    fi
  done

  if (("${#conflicts[@]}")); then
    die "Vorhandene Container-Pakete erkannt: ${conflicts[*]}. Aus Sicherheitsgründen wird nichts entfernt/ersetzt. Docker/Compose bitte manuell prüfen."
  fi

  [[ -n "${CODENAME}" ]] || die "Distributions-Codename konnte nicht ermittelt werden."

  local docker_dist
  if [[ "${DIST_ID}" == "ubuntu" ]]; then
    docker_dist="ubuntu"
  elif [[ "${DIST_ID}" == "debian" ]]; then
    docker_dist="debian"
  else
    die "Docker-Autoinstallation nur auf echtem Debian oder Ubuntu. Auf Derivaten bitte Docker vorher selbst installieren."
  fi

  log "Installiere Docker Engine aus dem offiziellen Docker-Repository."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${docker_dist}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${docker_dist}
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y     docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  docker compose version >/dev/null || die "Docker Compose ist nach Installation nicht verfügbar."
}

detect_port() {
  if [[ -n "${N2K_PORT}" ]]; then
    return
  fi

  N2K_PORT=80
  if command -v ss >/dev/null 2>&1 && ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)(80)$'; then
    N2K_PORT=8080
    log "Port 80 ist belegt. Netfreak2k verwendet deshalb Port 8080; nichts wird beendet."
  fi
}

download_release() {
  local tmp backup_env=""
  tmp="$(mktemp -d)"
  trap "rm -rf '$tmp'" EXIT

  if [[ -f "${N2K_DIR}/server/.env" ]]; then
    backup_env="$(cat "${N2K_DIR}/server/.env")"
  fi

  log "Lade Netfreak2k ${N2K_REF} nach ${N2K_DIR}."
  curl -fL --retry 3 "${N2K_ARCHIVE_URL}" -o "${tmp}/netfreak2k.tar.gz"
  mkdir -p "${tmp}/src"
  tar -xzf "${tmp}/netfreak2k.tar.gz" -C "${tmp}/src" --strip-components=1

  [[ -f "${tmp}/src/server/docker-compose.yml" ]] || die "Archiv enthält keine gültige Netfreak2k-Serverstruktur."

  mkdir -p "${N2K_DIR}"
  # Preserve only local runtime config; code is replaced atomically enough for this dev phase.
  find "${N2K_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "${tmp}/src/." "${N2K_DIR}/"

  printf 'N2K_HTTP_PORT=%s\n' "${N2K_PORT}" > "${N2K_DIR}/server/.env"
  if [[ -n "${backup_env}" ]]; then
    local old_port
    old_port="$(printf '%s\n' "${backup_env}" | sed -n 's/^N2K_HTTP_PORT=//p' | tail -n1)"
    if [[ -n "${old_port}" ]]; then
      N2K_PORT="${old_port}"
      printf 'N2K_HTTP_PORT=%s\n' "${N2K_PORT}" > "${N2K_DIR}/server/.env"
    fi
  fi
}

start_stack() {
  log "Baue und starte Netfreak2k."
  cd "${N2K_DIR}/server"
  docker compose pull --ignore-buildable 2>/dev/null || true
  docker compose up -d --build

  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${N2K_PORT}/api/setup" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  docker compose ps || true
  docker compose logs --tail=100 || true
  die "Netfreak2k wurde gestartet, Healthcheck antwortet aber nicht."
}

show_result() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "${ip}" ]] || ip="<IP-DES-SERVERS>"

  printf '\n'
  printf '============================================================\n'
  printf ' Netfreak2k Server wurde installiert.\n'
  printf ' Bestehendes Linux, Partitionen und Bootloader wurden nicht ersetzt.\n'
  printf ' Installationspfad: %s\n' "${N2K_DIR}"
  printf ' Weboberfläche: http://%s' "${ip}"
  if [[ "${N2K_PORT}" != "80" ]]; then
    printf ':%s' "${N2K_PORT}"
  fi
  printf '/\n'
  printf '============================================================\n'
  printf '\nBeim ersten Öffnen legst du den lokalen Admin-Benutzer an.\n'
}

ensure_base_tools
install_docker_if_missing
detect_port
download_release
start_stack
show_result
