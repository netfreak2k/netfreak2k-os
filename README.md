# Netfreak2k OS

**Lightweight · AI-ready · Personal · Recoverable**

Netfreak2k OS is a lightweight, cross-platform Linux desktop operating-system project. Raspberry Pi 3+ is the primary development and minimum performance target, while the same shared OS core is also intended to build for x86_64 PCs and virtualized environments such as Proxmox.

It aims for a polished, modern desktop experience inspired by contemporary macOS design principles while using only legally redistributable open assets for themes, icons, fonts and wallpapers.

The public repository contains only the reusable base operating system. Personal work data and user-specific workspace state stay private and restorable.

## Core goals

- Raspberry Pi 3+ as the minimum hardware target
- shared core for ARM64 and x86_64
- automatic builds for Raspberry Pi, generic x86_64 and Proxmox
- lightweight desktop with restrained visual effects
- modern **N2K Glass** design language
- Google Chrome as a required first-class browser
- freely customizable AI dashboard built into the desktop experience
- branded **N2K Terminal**
- Office suite
- YouTube, Netflix and other mainstream web services through Chrome where platform DRM/codec support allows
- Radio and media playback
- File manager, PDF viewer, archive tools and system utilities
- Wi-Fi, Ethernet, Bluetooth, audio and removable-storage support
- Tailscale-ready remote access
- GitHub-based, user-approved updates
- Backup, restore and recovery designed from the start
- Public OS development, private personal workspace/state

## Cross-platform build model

Development may happen directly on a Raspberry Pi, but shared features are not tied to Pi hardware.

```text
Develop on Pi
    ↓
Shared OS Core
    ↓
GitHub dev branch
    ↓
CI / automated tests
    ↓
Build matrix
├── Raspberry Pi ARM64 image
├── x86_64 ISO
└── Proxmox QCOW2
```

Platform-specific drivers, boot configuration and virtualization support are isolated from the shared desktop/core code.

Target release artifacts:

```text
netfreak2k-os-rpi-arm64.img.xz
netfreak2k-os-amd64.iso
netfreak2k-os-proxmox-amd64.qcow2
```

## Public OS vs. private workspace

```text
PUBLIC
Netfreak2k OS
├── Desktop
├── Chrome
├── AI Dashboard framework
├── N2K Terminal
├── Office
├── Media / Radio
├── System Settings
├── Update Manager
├── Backup / Recovery
└── Linux base

PRIVATE
Personal Workspace
├── Dashboard layout
├── User configuration
├── Project links
├── Browser preferences
├── Personal files
└── Recoverable user state
```

General improvements created in the private workspace may be proposed back to the public OS after review and testing. Private data, secrets and personal project state never become part of the public image.

## Desktop design

The desktop uses the **N2K Glass** visual language:

- translucent surfaces
- floating dock
- compact top bar
- soft depth and rounded geometry
- light and dark appearance
- restrained animation for Raspberry Pi 3 performance

The project does **not** ship Apple logos, proprietary Apple fonts, Apple icons, Apple wallpapers or copied proprietary interface assets. Only redistributable/free assets are permitted in the public image.

## Required desktop applications

- Google Chrome
- Office suite
- N2K AI Dashboard
- N2K Terminal
- File manager
- PDF viewer
- Media player
- Radio application
- Archive manager
- Text editor / notes
- Screenshot tool
- System monitor
- Settings and update tools

## Status

Early development / architecture phase.

Initial target: **0.1.0-dev**

## Hardware and virtualization targets

Primary bootstrap target:

- Raspberry Pi 3
- 64-bit Linux base where practical
- SSD preferred for the system drive

Additional targets:

- Raspberry Pi 4 / Pi 5
- generic x86_64 PCs and mini-PCs
- Proxmox/QEMU virtual machines using VirtIO
- other compatible ARM64 systems where practical

## Updates

Netfreak2k OS checks GitHub Releases and notifies the user before installation. Updates are not silently installed by default.

See [docs/UPDATES.md](docs/UPDATES.md).

## Backup and recovery

A fresh Netfreak2k OS installation must be able to restore the user's last private workspace state from an authorized backup source.

See [docs/RECOVERY.md](docs/RECOVERY.md).

## Security

Credentials, Wi-Fi secrets, Tailscale auth keys, API keys, browser secrets and private user data must never be committed to this public repository.

## License

A project license will be selected before the first public stable release.
