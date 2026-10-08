# Netfreak2k Server-OS Windows bootstrap (PowerShell 5.1+)
# Linux services run inside an Ubuntu VM, not directly on Windows.
$ErrorActionPreference = 'Stop'
$vm = 'netfreak2k-os'
Write-Host 'Netfreak2k Server-OS | Windows/Ubuntu VM'
if (-not (Get-Command multipass -ErrorAction SilentlyContinue)) {
  throw 'Multipass fehlt. Bitte zuerst Multipass von https://canonical.com/multipass/install installieren und PowerShell erneut starten.'
}
$existing = multipass info $vm 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Erstelle Ubuntu 24.04 VM (4 CPUs, 8 GB RAM, 60 GB SSD)...'
  multipass launch 24.04 --name $vm --cpus 4 --memory 8G --disk 60G
  if ($LASTEXITCODE -ne 0) { throw 'VM konnte nicht erstellt werden. Virtualisierung und freien RAM/SSD prüfen.' }
} else {
  multipass start $vm 2>$null
}
Write-Host 'Prüfe Hardwarevirtualisierung innerhalb der VM...'
multipass exec $vm -- bash -lc 'grep -Eq "(vmx|svm)" /proc/cpuinfo'
if ($LASTEXITCODE -ne 0) {
  throw 'Installation gestoppt: Dem Ubuntu-Gast fehlen VT-x/AMD-V. Der aktuelle Installer benötigt KVM. Für vollen Funktionsumfang Linux direkt installieren.'
}
multipass exec $vm -- bash -lc 'curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh | sudo bash'
if ($LASTEXITCODE -ne 0) { throw 'Linux-Installation fehlgeschlagen. Logs mit: multipass shell netfreak2k-os' }
Write-Host 'Installation abgeschlossen. VM-Adresse:'
multipass info $vm
Write-Host 'Öffne die im Linux-Installer angegebene URL im Browser.'
