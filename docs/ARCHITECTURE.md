# Netfreak2k OS Architecture

## Two-part model

There are only two top-level concepts in the project ecosystem:

1. **Netfreak2k OS** — the public, general-purpose operating-system platform.
2. **N2K Workspace** — the maintainer's private personal work and development environment.

N2K Workspace is not bundled into the public OS image.

## Platform layers

```text
User Experience
├── Local Desktop
├── Web UI
└── Remote Desktop

Platform Services
├── Chrome integration
├── Network manager
├── Tailscale
├── Wi-Fi client / access point fallback
├── Update manager
├── Backup / recovery
└── App and service framework

Optional Capabilities
├── Reticulum / LXMF
├── MeshCore
├── Home Assistant
├── Local AI
└── Energy / telemetry integrations

Linux Base
└── Lightweight ARM64 distribution base
```

## Workspace-to-OS improvement flow

Changes developed in N2K Workspace can become Netfreak2k OS improvements when they are generally useful.

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
        dev
            ↓
        beta
            ↓
        stable
```

The stable OS must never be overwritten directly by experimental Workspace changes.

## Desktop philosophy

The desktop uses the **N2K Glass** design language: translucent surfaces, soft depth, rounded geometry, restrained animation and a clean contemporary layout.

No Apple logos, proprietary Apple fonts, Apple icons, wallpapers or copied interface assets are used.
