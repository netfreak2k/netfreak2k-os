#!/usr/bin/env bash
set -Eeuo pipefail

N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
N2K_REF="${N2K_REF:-main}"

[[ "${EUID}" -eq 0 ]] || { echo "Bitte mit sudo/root ausführen." >&2; exit 1; }
[[ -f "${N2K_DIR}/server/.env" ]] || { echo "Netfreak2k-Installation nicht gefunden." >&2; exit 1; }

exec env N2K_DIR="${N2K_DIR}" N2K_REF="${N2K_REF}" bash <(curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh)
