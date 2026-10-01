#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(cat "$ROOT_DIR/VERSION")"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y   ca-certificates curl git rsync jq sudo   network-manager bluez pipewire pipewire-audio   xdg-utils unzip p7zip-full file   python3 python3-venv   htop lm-sensors   nftables openssh-client

install -d /etc/netfreak2k /usr/local/lib/netfreak2k /opt/netfreak2k/dashboard
install -m 0644 "$ROOT_DIR/core/etc/netfreak2k/defaults.conf" /etc/netfreak2k/defaults.conf
printf '%s
' "$VERSION" > /etc/netfreak2k/version
install -m 0755 "$ROOT_DIR/core/usr/local/bin/n2k" /usr/local/bin/n2k

rsync -a --delete "$ROOT_DIR/dashboard/" /opt/netfreak2k/dashboard/

if [[ -f "$ROOT_DIR/core/usr/lib/systemd/system/n2k-dashboard.service" ]]; then
  install -m 0644 "$ROOT_DIR/core/usr/lib/systemd/system/n2k-dashboard.service" /etc/systemd/system/n2k-dashboard.service
  systemctl daemon-reload
fi

echo "Netfreak2k OS common core bootstrap complete: $VERSION"
