#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
Netfreak2k install.sh is LEGACY.

The project architecture has moved to a dedicated Proxmox-based Netfreak2k Appliance.
This installer intentionally does not install anything into your existing Linux system.

Current target:
- Netfreak2k Appliance on Proxmox VE base
- Netfreak2k web UI as the normal browser entry point
- Home Assistant OS as a full KVM VM with Supervisor and Apps/Add-ons

Use a separate machine, separate boot/storage device, or an already-existing hypervisor
if your current Linux installation must remain untouched.

See:
docs/APPLIANCE_ARCHITECTURE.md
EOF

exit 2
