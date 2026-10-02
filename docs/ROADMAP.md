# Roadmap

This roadmap reflects the product specification in [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Phase 0 — Foundation / 0.1.x

- Choose and lock Linux base
- Reproducible image/build pipeline
- Raspberry Pi and x86-64 boot targets
- VM/Proxmox target
- N2K Glass desktop foundation
- Bottom dock + top status bar
- Hardware detection baseline
- Wi-Fi
- Bluetooth
- Ethernet
- audio
- graphics
- USB/storage
- printers/scanners baseline
- Google Chrome integration
- LibreOffice, PDF, media and image baseline apps
- software center + Flatpak
- graphical installer
- Live USB mode
- first-boot assistant
- Stable/Beta/Developer update channels
- recovery point before updates
- Btrfs snapshot design
- firewall defaults
- disk encryption option
- telemetry opt-in only
- Git-based development workflow

## Phase 1 — Daily-driver completeness

- multi-monitor + HiDPI
- touchscreen / 2-in-1 support
- audio routing per app
- central Settings
- central Control Center
- app permissions
- guest mode
- parental controls
- password manager
- biometric integration
- default-app management
- autostart manager
- web-app manager
- SMB/NAS discovery
- smartphone integration
- local file sharing
- VPN center
- remote desktop
- device overview
- local/Tailscale clipboard and file transfer

## Phase 2 — Backup, recovery and diagnostics

- incremental encrypted backups
- USB/NAS backup targets
- backup schedules
- retention policies
- backup integrity checks
- SMART monitoring
- storage-health UX
- system health dashboard
- driver/firmware diagnostics
- bootable recovery environment
- system reset with keep-files option
- automatic repair assistant
- post-repair verification
- emergency mode

## Phase 3 — AI platform

- AI Provider Center
- ChatGPT/Gemini/Claude integration paths
- local model support
- hardware-based local-model recommendations
- multi-pane AI dashboard
- shared prompt input
- answer comparison
- answer synthesis
- file drag-and-drop
- explicit project-folder permissions
- AI permission dashboard
- cloud-upload confirmation UX
- local AI activity logging
- local/cloud routing rules
- offline mode
- private mode

## Phase 4 — Automation platform

- graphical automation editor
- multiple conditions
- time/network/device triggers
- notifications
- manual automation launch
- Control Center automation actions
- templates
- import/export
- version history
- simulation mode
- local audit log
- mandatory confirmation for critical actions

## Phase 5 — Multi-device ecosystem

- device discovery
- device state overview
- Wake-on-LAN
- shared clipboard
- file transfer
- folder synchronization
- sync version history
- conflict handling
- remote desktop actions
- backup to another Netfreak2k device
- optional Tailscale transport

## Phase 6 — Energy / off-grid

- multi-site energy dashboard
- inverter/battery/PV/consumption integration framework
- UPS monitoring
- multiple power sources
- energy history and charts
- long-term local storage
- alerts and trend detection
- energy-aware power profiles
- critical-service prioritization
- power-failure actions
- local-AI energy analysis
- energy-saving recommendations
- generator control framework with mandatory safety checks

## Phase 7 — Hardening and public release

- hardware compatibility matrix
- Secure Boot path
- signed releases
- rollback validation
- accessibility review
- localization
- privacy/security review
- performance tuning
- low-memory profile for constrained devices
- public documentation
- release engineering
