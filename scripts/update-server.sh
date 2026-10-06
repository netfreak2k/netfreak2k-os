#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
N2K_REF="${N2K_REF:-main}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
API_URL="https://api.github.com/repos/${N2K_REPO}/commits/${N2K_REF}"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
[[ -f "${N2K_DIR}/server/.env" ]] || die "Netfreak2k-Installation nicht gefunden."
command -v curl >/dev/null || die "curl fehlt."
command -v docker >/dev/null || die "Docker fehlt."
docker compose version >/dev/null || die "Docker Compose v2 fehlt."

log "Prüfe GitHub auf neue Netfreak2k-Version."
remote_json="$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "${API_URL}")"
remote_sha="$(printf '%s' "${remote_json}" | sed -n 's/.*"sha":"\([0-9a-f]\{40\}\)".*/\1/p' | head -n1)"
[[ -n "${remote_sha}" ]] || die "Aktueller GitHub-Commit konnte nicht ermittelt werden."

installed_sha=""
if [[ -f "${STATE_DIR}/version.json" ]]; then
  installed_sha="$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "${STATE_DIR}/version.json" | head -n1)"
fi

if [[ "${installed_sha}" == "${remote_sha}" ]]; then
  log "Netfreak2k ist bereits aktuell (${remote_sha:0:12})."
  exit 0
fi

archive_url="https://github.com/${N2K_REPO}/archive/${remote_sha}.tar.gz"
tmp="$(mktemp -d)"
backup_env="$(mktemp)"
# shellcheck disable=SC2064
trap "rm -rf '${tmp}' '${backup_env}'" EXIT

cp "${N2K_DIR}/server/.env" "${backup_env}"

log "Lade Update ${remote_sha:0:12}."
curl -fL --retry 3 "${archive_url}" -o "${tmp}/netfreak2k.tar.gz"
mkdir -p "${tmp}/src"
tar -xzf "${tmp}/netfreak2k.tar.gz" -C "${tmp}/src" --strip-components=1

[[ -f "${tmp}/src/server/docker-compose.yml" ]] || die "Update-Archiv ist ungültig."
bash -n "${tmp}/src/scripts/update-server.sh"
python3 -m py_compile "${tmp}/src/server/api/server.py" "${tmp}/src/host/vm-agent.py"

log "Aktualisiere Netfreak2k-Programmdateien."
find "${N2K_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${tmp}/src/." "${N2K_DIR}/"
cp "${backup_env}" "${N2K_DIR}/server/.env"

install -m 0755 "${N2K_DIR}/host/vm-agent.py" /usr/local/lib/netfreak2k/vm-agent.py
install -m 0644 "${N2K_DIR}/host/netfreak2k-vm-agent.service" /etc/systemd/system/netfreak2k-vm-agent.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-ha-proxy.service" /etc/systemd/system/netfreak2k-ha-proxy.service
install -m 0755 "${N2K_DIR}/scripts/check-updates.sh" /usr/local/lib/netfreak2k/check-updates.sh
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.service" /etc/systemd/system/netfreak2k-update-check.service
install -m 0644 "${N2K_DIR}/host/netfreak2k-update-check.timer" /etc/systemd/system/netfreak2k-update-check.timer

systemctl daemon-reload
systemctl restart netfreak2k-vm-agent.service
systemctl restart netfreak2k-ha-proxy.service
systemctl enable --now netfreak2k-update-check.timer

log "Baue und starte aktualisierte Webplattform."
cd "${N2K_DIR}/server"
docker compose up -d --build

mkdir -p "${STATE_DIR}"
printf '{"repo":"%s","ref":"%s","sha":"%s","installed_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${remote_sha}" "$(date +%s)" > "${STATE_DIR}/version.json"

"${N2K_DIR}/scripts/check-updates.sh" || true

log "Update abgeschlossen: ${remote_sha:0:12}"
log "Home Assistant OS VM und Nutzerdaten wurden nicht verändert."
