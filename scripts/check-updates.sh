#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
VERSION_FILE="${STATE_DIR}/version.json"
STATUS_FILE="${STATE_DIR}/update-status.json"
CHANNEL_FILE="${STATE_DIR}/update-channel"
CHANNEL="${N2K_UPDATE_CHANNEL:-}"

mkdir -p "${STATE_DIR}"
if [[ -z "${CHANNEL}" && -s "${CHANNEL_FILE}" ]]; then
  CHANNEL="$(tr -d '[:space:]' < "${CHANNEL_FILE}")"
fi
CHANNEL="${CHANNEL:-development}"
case "${CHANNEL}" in
  stable|beta|development) ;;
  *) CHANNEL="development" ;;
esac

installed_fingerprint=""
installed_version=""
if [[ -f "${VERSION_FILE}" ]]; then
  readarray -t installed < <(python3 - "${VERSION_FILE}" <<'PY'
import json, sys
try:
    data=json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data={}
print(data.get("fingerprint") or "")
print(data.get("version") or "")
PY
)
  installed_fingerprint="${installed[0]:-}"
  installed_version="${installed[1]:-}"
fi

target_ref="main"
release_api=""
if [[ "${CHANNEL}" == "stable" ]]; then
  release_api="https://api.github.com/repos/${N2K_REPO}/releases/latest"
elif [[ "${CHANNEL}" == "beta" ]]; then
  release_api="https://api.github.com/repos/${N2K_REPO}/releases?per_page=20"
fi

if [[ -n "${release_api}" ]]; then
  meta="$(mktemp)"
  trap 'rm -f "${meta:-}" "${tmp:-}"' EXIT
  if ! curl -fL --connect-timeout 8 --max-time 30 --retry 2 -H 'Accept: application/vnd.github+json' "${release_api}" -o "${meta}" >/dev/null 2>&1; then
    printf '{"ok":false,"repo":"%s","channel":"%s","installed_fingerprint":"%s","installed_version":"%s","remote_fingerprint":"","update_available":false,"checked_at":%s,"note":"release_metadata_unavailable"}\n'       "${N2K_REPO}" "${CHANNEL}" "${installed_fingerprint}" "${installed_version}" "$(date +%s)" > "${STATUS_FILE}"
    exit 0
  fi
  target_ref="$(python3 - "${meta}" "${CHANNEL}" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
channel=sys.argv[2]
if channel == "stable":
    item=data if isinstance(data, dict) else {}
else:
    item=next((x for x in data if isinstance(x, dict) and not x.get("draft")), {}) if isinstance(data, list) else {}
print(item.get("tag_name") or "")
PY
)"
  if [[ -z "${target_ref}" ]]; then
    printf '{"ok":true,"repo":"%s","channel":"%s","installed_fingerprint":"%s","installed_version":"%s","remote_fingerprint":"","update_available":false,"checked_at":%s,"note":"no_release_for_channel"}\n'       "${N2K_REPO}" "${CHANNEL}" "${installed_fingerprint}" "${installed_version}" "$(date +%s)" > "${STATUS_FILE}"
    exit 0
  fi
fi

ARCHIVE_URL="https://github.com/${N2K_REPO}/archive/refs/$([[ "${target_ref}" == "main" ]] && printf 'heads' || printf 'tags')/${target_ref}.tar.gz"
tmp="$(mktemp)"
trap 'rm -f "${meta:-}" "${tmp:-}"' EXIT
checked_at="$(date +%s)"
if ! curl -fL --connect-timeout 8 --max-time 45 --retry 2 --retry-delay 1 "${ARCHIVE_URL}" -o "${tmp}" >/dev/null 2>&1; then
  printf '{"ok":false,"repo":"%s","channel":"%s","target_ref":"%s","installed_fingerprint":"%s","installed_version":"%s","remote_fingerprint":"","update_available":false,"checked_at":%s,"note":"github_archive_unavailable"}\n'     "${N2K_REPO}" "${CHANNEL}" "${target_ref}" "${installed_fingerprint}" "${installed_version}" "${checked_at}" > "${STATUS_FILE}"
  exit 0
fi

remote_fingerprint="$(sha256sum "${tmp}" | awk '{print $1}')"
remote_version="$(tar -xOzf "${tmp}" --wildcards '*/VERSION' 2>/dev/null | head -n1 | tr -d '\r\n' || true)"
available=false
if [[ -z "${installed_fingerprint}" || "${installed_fingerprint}" != "${remote_fingerprint}" ]]; then
  available=true
fi

printf '{"ok":true,"repo":"%s","channel":"%s","target_ref":"%s","installed_fingerprint":"%s","installed_version":"%s","remote_fingerprint":"%s","remote_version":"%s","update_available":%s,"checked_at":%s}\n'   "${N2K_REPO}" "${CHANNEL}" "${target_ref}" "${installed_fingerprint}" "${installed_version}" "${remote_fingerprint}" "${remote_version}" "${available}" "${checked_at}" > "${STATUS_FILE}"
