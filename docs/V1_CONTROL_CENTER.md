# Netfreak2k Server-OS 1.0 Control Center

This document records the implementation baseline for the 1.0 user experience.

## Product shape

Netfreak2k remains server-first and safe to run on an existing Linux host. The browser UI is the control plane. Dedicated x86-64, Proxmox/VM and Raspberry Pi images remain downstream packaging targets built from the same platform.

## Primary navigation

The main navigation is intentionally limited to:

1. Overview
2. Network
3. Storage
4. Virtual Machines
5. AI Workspace
6. Apps
7. Privacy
8. Settings

Drive, Calendar, Office, Terminal, Backups and other tools remain available as apps or secondary views instead of competing for top-level navigation.

## Dashboard contract

The dashboard is the recognition layer, not the full administration layer.

Visible modules:

- CPU/RAM/storage/uptime quick metrics
- Network with live traffic, provider, ping and WAN address
- Storage health and capacity
- Virtual machines with Home Assistant as a first-class workload
- AI Workspace entry point for four panes
- Service health
- Update state
- System Center / hardware summary
- Quick launch
- compact Privacy/Matrix tile

The desktop target is no-scroll on common laptop/desktop resolutions. Mobile is responsive and may stack cards vertically.

## Detail views

Network:
- live traffic
- interfaces
- provider/public IP/ping
- gateway and DNS
- future VPN/firewall/routing controls

Storage:
- host usage
- HAOS storage
- future per-device SMART and temperature
- mounts, RAID/ZFS/Btrfs and backup targets

Virtual Machines:
- inventory
- start/stop/restart/console actions
- Home Assistant OS special handling
- future per-VM CPU/RAM/network charts

AI Workspace:
- 1/2/4 pane layouts
- cloud and local providers
- projects per pane
- local AI reserved as an architectural first-class provider

## First-run baseline

The setup flow now records:

- admin account
- Netfreak2k device name
- usage profile: Home Server / AI Workspace / Custom
- initial AI provider
- update channel preference

These values are stored as Netfreak2k preferences and do not make risky host-level changes automatically.

## Update and recovery contract

Update channels:
- stable
- beta
- developer

Current updater rules stay in force:
- explicit user approval
- integrity/fingerprint checks
- source validation
- Python/shell syntax validation
- live update progress
- post-update health verification
- preservation of Netfreak2k state and the HAOS VM

Recovery direction:
- keep data backup/restore separate from program updates
- create a recovery point before major system changes
- expose rollback/recovery as an authenticated UI workflow
- never overwrite user data silently

## Architecture rule

Public and private environments use one codebase. Personal applications, layouts, VMs and credentials are configuration, not a fork of the operating system.

## 1.0 definition of done

A 1.0 release requires:

- authenticated first-run setup
- compact dashboard
- live system/network/storage data
- VM controls and Home Assistant support
- AI workspace shell
- app management
- settings/preferences
- explicit updates with progress
- backup/restore baseline
- responsive mobile UI
- CI validation

Dedicated bootable installers and recovery media can then package the same control plane instead of reimplementing it.
