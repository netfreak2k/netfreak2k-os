#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(cat "$ROOT_DIR/VERSION")"

mapfile -t COMMON_PACKAGES < <(grep -Ev '^\s*(#|$)' "$ROOT_DIR/packages/common.txt")
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y "${COMMON_PACKAGES[@]}"

install -d /etc/netfreak2k /usr/local/lib/netfreak2k /opt/netfreak2k/dashboard
install -m 0644 "$ROOT_DIR/core/etc/netfreak2k/defaults.conf" /etc/netfreak2k/defaults.conf
printf '%s\n' "$VERSION" > /etc/netfreak2k/version
install -m 0755 "$ROOT_DIR/core/usr/local/bin/n2k" /usr/local/bin/n2k
install -m 0755 "$ROOT_DIR/core/usr/local/lib/netfreak2k/"* /usr/local/lib/netfreak2k/

rsync -a --delete "$ROOT_DIR/dashboard/" /opt/netfreak2k/dashboard/

if [[ -f "$ROOT_DIR/core/usr/lib/systemd/system/n2k-dashboard.service" ]]; then
  install -m 0644 "$ROOT_DIR/core/usr/lib/systemd/system/n2k-dashboard.service" /etc/systemd/system/n2k-dashboard.service
  systemctl daemon-reload
fi

echo "Netfreak2k OS common core bootstrap complete: $VERSION"
