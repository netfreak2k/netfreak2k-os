#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  rpi-arm64|amd64-iso|proxmox-amd64) ;;
  *)
    echo "Usage: $0 {rpi-arm64|amd64-iso|proxmox-amd64}" >&2
    exit 2
    ;;
esac

VERSION="$(cat VERSION)"
OUT="build/output/$TARGET"
mkdir -p "$OUT"

cat > "$OUT/BUILD-MANIFEST.txt" <<EOF
Netfreak2k OS
Version: $VERSION
Target: $TARGET
Commit: ${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}
Built: $(date -u +%FT%TZ)
EOF

echo "Prepared build manifest for $TARGET."
echo "Image assembly backend is intentionally staged for the next implementation step."
