#!/usr/bin/env bash
set -Eeuo pipefail

N2K_REPO="${N2K_REPO:-netfreak2k/netfreak2k-os}"
N2K_REF="${N2K_REF:-main}"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
VERSION_FILE="${STATE_DIR}/version.json"
STATUS_FILE="${STATE_DIR}/update-status.json"
COMMIT_API="https://api.github.com/repos/${N2K_REPO}/commits/${N2K_REF}"

mkdir -p "${STATE_DIR}"
checked_at="$(date +%s)"

read_version_field(){
  local field="$1"
  [[ -f "${VERSION_FILE}" ]] || return 0
  python3 - "${VERSION_FILE}" "${field}" <<'PY' 2>/dev/null || true
import json, sys
try:
    data=json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data={}
value=data.get(sys.argv[2], "")
print("" if value is None else value)
PY
}

installed_revision="$(read_version_field revision)"
installed_fingerprint="$(read_version_field fingerprint)"
installed_at="$(read_version_field installed_at)"

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

if ! curl -fsSL --connect-timeout 8 --max-time 30 --retry 2   -H 'Accept: application/vnd.github+json'   -H 'User-Agent: netfreak2k-update-check'   "${COMMIT_API}" -o "${tmp}"; then
  printf '{"ok":false,"repo":"%s","ref":"%s","installed_revision":"%s","remote_revision":"","update_available":false,"checked_at":%s,"note":"github_commit_unavailable"}\n'     "${N2K_REPO}" "${N2K_REF}" "${installed_revision}" "${checked_at}" > "${STATUS_FILE}"
  exit 0
fi

remote_revision="$(python3 - "${tmp}" <<'PY'
import json, sys
try:
    data=json.load(open(sys.argv[1], encoding="utf-8"))
    print(data.get("sha",""))
except Exception:
    print("")
PY
)"

if [[ ! "${remote_revision}" =~ ^[0-9a-f]{40}$ ]]; then
  printf '{"ok":false,"repo":"%s","ref":"%s","installed_revision":"%s","remote_revision":"","update_available":false,"checked_at":%s,"note":"github_commit_invalid"}\n'     "${N2K_REPO}" "${N2K_REF}" "${installed_revision}" "${checked_at}" > "${STATUS_FILE}"
  exit 0
fi

# Migration from older installs that only stored the non-stable tar.gz hash.
# The updater writes installed_at immediately before invoking this new checker,
# so a recent install without a revision can safely be pinned to the revision
# that was just installed.
if [[ -z "${installed_revision}" && "${installed_at}" =~ ^[0-9]+$ ]] && (( checked_at - installed_at <= 600 )); then
  python3 - "${VERSION_FILE}" "${remote_revision}" <<'PY'
import json, os, sys
path, revision = sys.argv[1:]
try:
    data=json.load(open(path, encoding="utf-8"))
except Exception:
    data={}
data["revision"]=revision
tmp=path+".tmp"
with open(tmp,"w",encoding="utf-8") as handle:
    json.dump(data,handle,separators=(",",":"))
    handle.write("\n")
os.replace(tmp,path)
PY
  installed_revision="${remote_revision}"
fi

available=false
if [[ -z "${installed_revision}" || "${installed_revision}" != "${remote_revision}" ]]; then
  available=true
fi

printf '{"ok":true,"repo":"%s","ref":"%s","installed_revision":"%s","remote_revision":"%s","installed_fingerprint":"%s","update_available":%s,"checked_at":%s}\n'   "${N2K_REPO}" "${N2K_REF}" "${installed_revision}" "${remote_revision}" "${installed_fingerprint}" "${available}" "${checked_at}" > "${STATUS_FILE}"
