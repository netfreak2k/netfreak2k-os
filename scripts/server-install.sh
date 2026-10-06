#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Docker is not installed.

For safety, Netfreak2k does NOT install Docker or modify the host automatically.
Install/configure Docker yourself first, then run this script again.
EOF
  exit 2
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Host was not modified." >&2
  exit 3
fi

cd "${ROOT_DIR}/server"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

docker compose up -d --build

echo
echo "Netfreak2k Server is running."
echo "Open: http://<IP-DES-THINKPADS>/"
echo
echo "No bootloader, partition, desktop or operating-system replacement was performed."
