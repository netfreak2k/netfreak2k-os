#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
N2K_REF="${N2K_REF:-main}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
VERSION_FILE="${STATE_DIR}/version.json"
STATUS_FILE="${STATE_DIR}/update-status.json"
API_URL="https://api.github.com/repos/${N2K_REPO}/commits/${N2K_REF}"

mkdir -p "${STATE_DIR}"

installed_sha=""
if [[ -f "${VERSION_FILE}" ]]; then
  installed_sha="$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "${VERSION_FILE}" | head -n1)"
fi

remote_json="$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "${API_URL}")"
remote_sha="$(printf '%s' "${remote_json}" | sed -n 's/.*"sha":"\([0-9a-f]\{40\}\)".*/\1/p' | head -n1)"

[[ -n "${remote_sha}" ]] || {
  printf '{"ok":false,"error":"remote_sha_unavailable"}\n' > "${STATUS_FILE}"
  exit 1
}

available=false
if [[ -n "${installed_sha}" && "${installed_sha}" != "${remote_sha}" ]]; then
  available=true
fi

checked_at="$(date +%s)"
printf '{"ok":true,"repo":"%s","ref":"%s","installed_sha":"%s","remote_sha":"%s","update_available":%s,"checked_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${installed_sha}" "${remote_sha}" "${available}" "${checked_at}"   > "${STATUS_FILE}"
