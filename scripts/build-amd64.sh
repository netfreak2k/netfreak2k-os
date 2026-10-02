#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/config/build.env"

if [[ "$(dpkg --print-architecture)" != "amd64" ]]; then
  echo "ERROR: this first build script must run on an amd64 Debian-compatible builder." >&2
  exit 1
fi

for cmd in lb sudo awk grep; do
  command -v "${cmd}" >/dev/null || {
    echo "ERROR: missing command: ${cmd}" >&2
    exit 1
  }
done

WORK_DIR="${ROOT_DIR}/build/work-amd64"
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}/config/package-lists"
cd "${WORK_DIR}"

lb config \
  --mode debian \
  --distribution "${N2K_SUITE}" \
  --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --binary-images iso-hybrid \
  --debian-installer live \
  --debian-installer-gui true \
  --bootappend-live "boot=live components hostname=${N2K_HOSTNAME} username=${N2K_DEFAULT_USER}"

{
  grep -Ev '^[[:space:]]*(#|$)' "${ROOT_DIR}/config/packages/base.list"
  grep -Ev '^[[:space:]]*(#|$)' "${ROOT_DIR}/config/packages/standard.list"
} > config/package-lists/netfreak2k.list.chroot

echo "xfce4 xfce4-goodies lightdm" >> config/package-lists/netfreak2k.list.chroot

sudo lb build

mkdir -p "${ROOT_DIR}/dist"
cp live-image-amd64.hybrid.iso "${ROOT_DIR}/dist/${N2K_IMAGE_NAME}-amd64-${N2K_CHANNEL}.iso"

echo "Built: dist/${N2K_IMAGE_NAME}-amd64-${N2K_CHANNEL}.iso"
