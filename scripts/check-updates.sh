#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
N2K_REF="${N2K_REF:-main}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
VERSION_FILE="${STATE_DIR}/version.json"
STATUS_FILE="${STATE_DIR}/update-status.json"
ARCHIVE_URL="https://github.com/${N2K_REPO}/archive/refs/heads/${N2K_REF}.tar.gz"

mkdir -p "${STATE_DIR}"
tmp="$(mktemp)"
# shellcheck disable=SC2064
trap "rm -f '${tmp}'" EXIT

installed_fingerprint=""
if [[ -f "${VERSION_FILE}" ]]; then
  installed_fingerprint="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("fingerprint",""))' "${VERSION_FILE}" 2>/dev/null || true)"
fi

checked_at="$(date +%s)"
if ! curl -fL --connect-timeout 8 --max-time 45 --retry 2 --retry-delay 1 "${ARCHIVE_URL}" -o "${tmp}" >/dev/null 2>&1; then
  printf '{"ok":false,"repo":"%s","ref":"%s","installed_fingerprint":"%s","remote_fingerprint":"","update_available":false,"checked_at":%s,"note":"github_archive_unavailable"}\n'     "${N2K_REPO}" "${N2K_REF}" "${installed_fingerprint}" "${checked_at}" > "${STATUS_FILE}"
  exit 0
fi

remote_fingerprint="$(sha256sum "${tmp}" | awk '{print $1}')"
available=false
if [[ -z "${installed_fingerprint}" || "${installed_fingerprint}" != "${remote_fingerprint}" ]]; then
  available=true
fi

printf '{"ok":true,"repo":"%s","ref":"%s","installed_fingerprint":"%s","remote_fingerprint":"%s","update_available":%s,"checked_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${installed_fingerprint}" "${remote_fingerprint}" "${available}" "${checked_at}" > "${STATUS_FILE}"
