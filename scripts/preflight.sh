#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "README.md"
  "docs/PRODUCT_SPEC.md"
  "docs/ARCHITECTURE.md"
  "docs/ROADMAP.md"
  "config/build.env"
  "config/packages/base.list"
  "config/packages/standard.list"
  "config/packages/complete.list"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "${ROOT_DIR}/${file}" ]]; then
    echo "ERROR: missing or empty: ${file}" >&2
    exit 1
  fi
done

while IFS= read -r file; do
  bash -n "${file}"
done < <(find "${ROOT_DIR}/scripts" -type f -name '*.sh' | sort)

echo "Netfreak2k OS preflight: OK"
