# Netfreak2k Server-OS 1.0.0-rc1

This release candidate marks the v1.0 feature freeze.

## Highlights

- unified browser-managed server dashboard
- Home Assistant OS managed through KVM/libvirt
- Docker Apps 2.0 with resources, logs and update checks
- Storage 2.0 with device inventory, SMART and controlled mounts
- Network 2.0 with device history, diagnostics and Wake-on-LAN
- Virtualization 2.0 with VM resources, controls and snapshots
- Backup & Recovery 2.0 with integrity verification and restore tests
- safe OS updates with preflight checks and verified recovery point
- Security Hardening 2.0 and TOTP-based account security
- Monitoring & Automation 2.0 with thresholds, quiet hours and maintenance mode
- Remote Connectivity 2.0
- Jobs & Scheduler 2.0
- Logs & Events 2.0
- Recovery Center 2.0

## Release-candidate limitations

- no stable public v1.0 tag until the validation workflow and real-host smoke tests pass
- project-wide source license is still pending
- true per-device LAN traffic requires future gateway/bridge visibility
- outside-in internet reachability is not claimed without an external probe
- snapshot restore/delete is intentionally not exposed in the UI
- destructive recovery stays behind explicit Backup & Recovery confirmation

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for stable-release gates.
