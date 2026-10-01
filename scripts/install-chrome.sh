#!/usr/bin/env bash
set -euo pipefail

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$ARCH" in
  amd64|x86_64)
    URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
    ;;
  arm64|aarch64)
    URL="https://dl.google.com/linux/direct/google-chrome-stable_current_arm64.deb"
    ;;
  *)
    echo "Unsupported architecture for Google Chrome target: $ARCH" >&2
    exit 2
    ;;
esac

echo "Checking Google Chrome package for $ARCH..."
if ! curl -fI --retry 2 --connect-timeout 10 "$URL" >/dev/null 2>&1; then
  echo "Google Chrome package is not currently available at the expected official URL for $ARCH." >&2
  echo "Netfreak2k OS will NOT silently replace Chrome. Check the build log and Google support status." >&2
  exit 3
fi

curl -fL --retry 3 "$URL" -o "$TMP/google-chrome.deb"
sudo apt-get update
sudo apt-get install -y "$TMP/google-chrome.deb"

echo "Google Chrome installed successfully."
