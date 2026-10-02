# Netfreak2k OS Architecture

## Product model

There are two top-level concepts:

1. **Netfreak2k OS** — the public general-purpose operating-system platform.
2. **N2K Workspace** — the maintainer's private work and development environment.

N2K Workspace is not bundled into the public OS image.

## Platform layers

```text
User Experience
├── N2K Glass Desktop
├── Dock + Top Bar + Control Center
├── Settings / Support / Diagnostics
├── AI Dashboard
├── Automation Editor
├── Energy Dashboard
├── Web UI
└── Remote Desktop

Desktop Services
├── App / Web-App Manager
├── Password Manager
├── Permission Broker
├── Clipboard / Nearby Share
├── Device Overview
├── Multi-device Sync
└── Notifications

System Services
├── Hardware Detection
├── NetworkManager / Wi-Fi / Bluetooth
├── Audio / PipeWire
├── VPN / Tailscale
├── Printing / Scanning
├── Backup / Snapshot / Recovery
├── Update Manager
├── System Health / SMART / Thermal
├── Power Management
├── Automation Runtime
└── Emergency Mode

AI Services
├── Cloud Provider Connectors
├── Local Model Runtime
├── Permission / Folder Grants
├── Local-vs-Cloud Routing
└── Local Activity Log

Optional Integrations
├── Reticulum / LXMF
├── MeshCore
├── Home Assistant
├── Energy / Solar / UPS
└── Generator Control

Linux Base
└── Lightweight upstream Linux distribution
```

## Architectural principles

### Daily-driver first

Routine desktop use must not require terminal knowledge.

### Hardware-first usability

Wi-Fi, Bluetooth, Ethernet, audio, graphics, USB/storage, printers/scanners and common input/output hardware are base-system responsibilities.

### Local-first privacy

Local processing and local storage are preferred where practical. Cloud use must be visible and user-controlled.

### Explicit permissions

AI and apps do not receive blanket access to user data. Folder/resource access must be explicitly granted and revocable.

### Recovery before risk

Major updates and automated repairs should create a recovery point when possible.

### Mature upstream components

Prefer established Linux components for core plumbing instead of rebuilding them unnecessarily.

### Cross-platform target

The architecture must support x86-64 PCs/notebooks, Raspberry Pi systems and virtual machines. Hardware-specific features should be capability-detected.

## Workspace-to-OS improvement flow

```text
Workspace change
    ↓
Classification
    ├── Workspace-only
    └── OS candidate
            ↓
        Git branch
            ↓
        Automated tests
            ↓
        Review
            ↓
        developer
            ↓
        beta
            ↓
        stable
```

Stable builds must never be overwritten directly by experimental Workspace changes.

## Desktop philosophy

The desktop uses the **N2K Glass** design language: translucent surfaces, soft depth, rounded geometry, restrained animation and a clean contemporary layout.

No Apple logos, proprietary Apple fonts, Apple icons, wallpapers or copied interface assets are used.
