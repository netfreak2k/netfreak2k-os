# Netfreak2k Server-OS Roadmap

## Current milestone — v1.0 release candidate

Current source version: **1.0.0-rc1**

The v1.0 feature set is frozen. Work in this milestone is limited to validation, bug fixes, documentation, installation/upgrade testing and release hardening.

### Implemented for v1.0

- browser-managed N2K Golden Glass desktop
- Docker app management and catalog
- Home Assistant OS on KVM/libvirt
- VM resources, controls and snapshots
- storage inventory, SMART and controlled mounts
- Backup & Recovery with verification and restore tests
- safe update preflight and pre-update recovery points
- LAN device inventory, history, service analysis and Wake-on-LAN
- System Health and configurable monitoring policies
- users, roles, TOTP 2FA, sessions and audit log
- host security diagnostics
- HTTPS/domain gateway and connectivity diagnostics
- Jobs & Scheduler
- unified Logs & Events
- Recovery Center
- N2K Drive, WebDAV/CalDAV and calendar
- Office, Media Center, branded terminal and personalization

### Stable v1.0 gates

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Stable **1.0.0** is blocked until the validation workflow, real-host install/upgrade checks, recovery verification and project-license decision are complete.

## Post-v1.0

### v1.1 — Network and storage expansion

- persistent user-managed mounts
- explicit NAS/NFS/SMB management
- richer RAID/ZFS operations with safety guards
- optional gateway/bridge mode for true per-device traffic visibility
- optional external outside-in probe integration

### v1.2 — App platform expansion

- safer managed app update/recreate workflow
- richer catalog metadata and dependency checks
- app backup/restore integration
- additional curated services

### v1.x — AI and automation

- AI Provider Center
- local-model services and hardware recommendations
- multi-pane AI workflows
- graphical automation editor
- richer notification channels
- simulation/dry-run support for automations

## Later platform work

Only after the server platform has stable releases:

- dedicated bootable x86-64 image
- Raspberry Pi images where hardware capability is sufficient
- optional N2K desktop edition
- dedicated recovery environment
- Secure Boot work
- energy/UPS/solar integrations

## Product rule

Netfreak2k remains LAN-first and recovery-oriented. Host-changing actions must stay explicit, authenticated, auditable and reversible where technically possible.
