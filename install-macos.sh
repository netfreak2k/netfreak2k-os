#!/usr/bin/env bash
# Netfreak2k Server-OS for macOS: runs supported Linux stack in Ubuntu VM.
set -Eeuo pipefail
VM=netfreak2k-os
[[ "$(uname -m)" == "x86_64" ]] || { echo "Apple Silicon/ARM64 wird vom derzeitigen amd64-Installer nicht unterstützt."; exit 2; }
command -v multipass >/dev/null || { echo "Multipass fehlt: https://canonical.com/multipass/install"; exit 1; }
echo "Netfreak2k Server-OS | macOS/Ubuntu VM"
if ! multipass info "$VM" >/dev/null 2>&1; then
  multipass launch 24.04 --name "$VM" --cpus 4 --memory 8G --disk 60G
else
  multipass start "$VM" >/dev/null 2>&1 || true
fi
if ! multipass exec "$VM" -- bash -lc 'grep -Eq "(vmx|svm)" /proc/cpuinfo'; then
  echo "Installation gestoppt: Dem Ubuntu-Gast fehlen VT-x/AMD-V. Der Linux-Installer benoetigt KVM."; exit 2
fi
multipass exec "$VM" -- bash -lc 'curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh | sudo bash'
multipass info "$VM"
echo "Oeffne die im Installer angegebene Server-Adresse in deinem Browser."
