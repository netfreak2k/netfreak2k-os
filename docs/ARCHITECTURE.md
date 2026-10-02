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
├── Hardware detection and firmware support
├── Network manager
├── Wi-Fi
├── Bluetooth
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
└── Lightweight Linux distribution base
```

## Hardware support baseline

Netfreak2k OS is intended to be usable immediately after installation on supported hardware.

Core hardware support is a **base-system requirement**, not an optional add-on:

- Automatic detection of common hardware during installation and boot
- Wi-Fi support included by default, including required free/non-free firmware where legally distributable
- Bluetooth stack and desktop controls included by default
- Ethernet, USB, audio, graphics, webcam, input-device and storage detection
- Clear reporting when a device needs firmware or a driver that cannot be bundled
- Network and Bluetooth controls available through the graphical desktop without requiring terminal commands for normal use

The target user experience is: install or boot the system, choose a Wi-Fi network, enter the password, pair Bluetooth devices if needed, and start working.

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
