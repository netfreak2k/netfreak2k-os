#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is unavailable; nothing was changed by this script." >&2
  exit 2
fi

cd "${ROOT_DIR}/server"
docker compose down --remove-orphans

echo "Netfreak2k Server containers and network have been stopped and removed."
echo "The repository files remain untouched so the installation can be started again later."
