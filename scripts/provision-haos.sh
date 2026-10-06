#!/usr/bin/env bash
set -Eeuo pipefail

VM_NAME="netfreak2k-homeassistant"
VM_DIR="/var/lib/netfreak2k/haos"
VM_DISK="${VM_DIR}/haos.qcow2"
VM_MAC="52:54:00:2f:2b:01"
VM_IP="192.168.122.50"
HAOS_API="https://api.github.com/repos/home-assistant/operating-system/releases/latest"

log(){ printf '\n[Netfreak2k] %s\n' "$*"; }
die(){ printf '\n[Netfreak2k] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo/root ausführen."
command -v virsh >/dev/null || die "virsh fehlt."
command -v virt-install >/dev/null || die "virt-install fehlt."
command -v qemu-img >/dev/null || die "qemu-img fehlt."
command -v curl >/dev/null || die "curl fehlt."
command -v xz >/dev/null || die "xz fehlt."

if [[ ! -e /dev/kvm ]]; then
  die "/dev/kvm fehlt. Hardware-Virtualisierung (Intel VT-x/AMD-V) muss im BIOS/UEFI aktiviert sein."
fi

mkdir -p "${VM_DIR}"

if ! virsh --connect qemu:///system net-info default >/dev/null 2>&1; then
  if [[ -f /usr/share/libvirt/networks/default.xml ]]; then
    virsh --connect qemu:///system net-define /usr/share/libvirt/networks/default.xml >/dev/null
  else
    die "libvirt default network ist nicht verfügbar."
  fi
fi

virsh --connect qemu:///system net-start default >/dev/null 2>&1 || true
virsh --connect qemu:///system net-autostart default >/dev/null

if ! virsh --connect qemu:///system net-dumpxml default | grep -q "${VM_MAC}"; then
  virsh --connect qemu:///system net-update default add ip-dhcp-host     "<host mac='${VM_MAC}' name='homeassistant' ip='${VM_IP}'/>"     --live --config >/dev/null
fi

if virsh --connect qemu:///system dominfo "${VM_NAME}" >/dev/null 2>&1; then
  log "Home Assistant OS VM existiert bereits; keine Neuinstallation."
  virsh --connect qemu:///system autostart "${VM_NAME}" >/dev/null
  virsh --connect qemu:///system start "${VM_NAME}" >/dev/null 2>&1 || true
  exit 0
fi

log "Ermittle aktuelle Home Assistant OS Version."
release_json="$(mktemp)"
archive="$(mktemp --suffix=.qcow2.xz)"
trap 'rm -f "${release_json}" "${archive}"' EXIT
curl -fsSL --retry 3 "${HAOS_API}" -o "${release_json}"

asset_url="$(
  grep -oE '"browser_download_url":[[:space:]]*"[^"]+haos_ova-[^"]+\.qcow2\.xz"' "${release_json}"     | head -n1     | sed -E 's/^"browser_download_url":[[:space:]]*"([^"]+)"$/\1/'
)"
[[ -n "${asset_url}" ]] || die "Kein offizielles HAOS KVM/qcow2 Image gefunden."

log "Lade offizielles Home Assistant OS KVM Image."
curl -fL --retry 3 "${asset_url}" -o "${archive}"
xz -dc "${archive}" > "${VM_DISK}"
chmod 0600 "${VM_DISK}"

# Give Home Assistant room for apps and backups.
qemu-img resize "${VM_DISK}" 64G >/dev/null

log "Erstelle Home Assistant OS VM."
virt-install   --connect qemu:///system   --name "${VM_NAME}"   --description "Home Assistant OS managed by Netfreak2k"   --memory 4096   --vcpus 2   --cpu host   --osinfo generic   --disk "path=${VM_DISK},format=qcow2,bus=scsi"   --controller type=scsi,model=virtio-scsi   --network "network=default,model=virtio,mac=${VM_MAC}"   --channel unix,target_type=virtio,name=org.qemu.guest_agent.0   --import   --graphics none   --boot uefi   --noautoconsole

virsh --connect qemu:///system autostart "${VM_NAME}" >/dev/null
log "Home Assistant OS VM wurde angelegt und gestartet."
