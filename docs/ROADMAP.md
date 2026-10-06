# Roadmap

This roadmap reflects the current **Proxmox-based appliance** direction.

## Phase 0 — Appliance foundation / 0.1.x

- Proxmox VE virtualization base
- dedicated Netfreak2k management guest
- existing Linux host is not modified
- N2K Glass web interface
- access through `http://SERVER-IP/`
- health endpoint
- self-contained install/start script
- reversible stop/remove script
- CI validation
- container build validation
- LAN-first operation
- no host-changing administration yet

### Definition of done

- stack starts on a Linux host with Docker Compose
- browser can open the UI by IP address
- container health check passes
- restart policy works
- uninstall helper removes Netfreak2k containers/network
- no bootloader, partition or desktop changes

## Phase 1 — Secure server management

- first-run wizard
- admin account
- authentication
- session management
- HTTPS strategy
- CSRF/security hardening
- limited host agent
- explicit permission model
- system status API
- CPU/RAM/load/temperature
- network status
- disk/storage status
- service status
- update status

No host-changing control is enabled before authentication is implemented.

## Phase 2 — App platform

- Docker app inventory
- start/stop/restart apps
- app logs
- app installation framework
- app catalog
- storage mappings
- port conflict detection
- app permissions
- backup metadata
- safe uninstall

## Phase 3 — Storage, backup and remote access

- mounted disk overview
- SMART health
- storage warnings
- backup destinations
- scheduled backups
- encrypted backups
- integrity checks
- SMB/NAS integration
- Tailscale
- remote browser access

## Phase 4 — AI platform

- AI Provider Center
- ChatGPT/Gemini/Claude integration paths
- local model services
- hardware-based local-model recommendations
- multi-pane AI dashboard
- project/folder permissions
- local/cloud routing rules
- offline mode
- local activity log

## Phase 5 — Automation platform

- graphical automation editor
- time/network/device/energy triggers
- multiple conditions
- notifications
- templates
- simulation mode
- local audit log
- mandatory confirmation for critical actions

## Phase 6 — Energy / off-grid

- solar/battery/inverter dashboard
- UPS monitoring
- multiple sites
- history and charts
- alerts
- energy-aware system rules
- critical-service prioritization
- local-AI energy analysis
- generator integration with mandatory safety controls

## Phase 7 — Dedicated Netfreak2k OS / Desktop

Only after the server platform is mature:

- dedicated bootable images
- x86-64 installer
- Raspberry Pi images
- N2K Glass desktop
- hardware detection
- Wi-Fi/Bluetooth desktop controls
- recovery environment
- Secure Boot work
- optional daily-driver desktop edition
### Mandatory Home Assistant support

- Home Assistant OS in a KVM VM is a required first-class workload
- persistent Home Assistant config storage
- LAN device discovery support where technically required
- clear port/network conflict checks
- backup integration for Home Assistant config
- safe update/restart path
- Home Assistant status surfaced in Netfreak2k
- future links between Home Assistant entities and Netfreak2k automation/energy modules

