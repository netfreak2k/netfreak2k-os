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
  installed_sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("sha",""))' "${VERSION_FILE}")"
fi

remote_sha=""
if remote_json="$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "${API_URL}" 2>/dev/null)"; then
  remote_sha="$(printf '%s' "${remote_json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' 2>/dev/null || true)"
fi

if [[ -z "${remote_sha}" ]]; then
  checked_at="$(date +%s)"
  printf '{"ok":true,"repo":"%s","ref":"%s","installed_sha":"%s","remote_sha":"","update_available":false,"checked_at":%s,"note":"github_api_unavailable"}\n'     "${N2K_REPO}" "${N2K_REF}" "${installed_sha}" "${checked_at}" > "${STATUS_FILE}"
  exit 0
fi

available=false
if [[ -n "${installed_sha}" && "${installed_sha}" != "${remote_sha}" ]]; then
  available=true
fi

checked_at="$(date +%s)"
printf '{"ok":true,"repo":"%s","ref":"%s","installed_sha":"%s","remote_sha":"%s","update_available":%s,"checked_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${installed_sha}" "${remote_sha}" "${available}" "${checked_at}"   > "${STATUS_FILE}"
