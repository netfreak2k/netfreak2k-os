# Netfreak2k OS

**Lightweight · AI-ready · Personal · Recoverable**

Netfreak2k OS is a lightweight Linux desktop platform for Raspberry Pi 3 and newer. It aims for a polished, modern desktop experience inspired by contemporary macOS design principles while using only legally redistributable open assets for themes, icons, fonts and wallpapers.

The public repository contains only the reusable base operating system. Personal work data and user-specific workspace state stay private and restorable.

## Core goals

- Raspberry Pi 3+ as the minimum target
- Lightweight desktop with restrained visual effects
- Modern **N2K Glass** design language
- Google Chrome as a required first-class browser
- Freely customizable AI dashboard built into the desktop experience
- Branded **N2K Terminal**
- Office suite
- YouTube, Netflix and other mainstream web services through Chrome where platform DRM/codec support allows
- Radio and media playback
- File manager, PDF viewer, archive tools and system utilities
- Wi-Fi, Ethernet, Bluetooth, audio and removable-storage support
- Tailscale-ready remote access
- GitHub-based, user-approved updates
- Backup, restore and recovery designed from the start
- Public OS development, private personal workspace/state

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

## Hardware target

Primary bootstrap target:

- Raspberry Pi 3
- 64-bit Linux base where practical
- SSD preferred for the system drive

The same architecture should scale upward to Raspberry Pi 4, Pi 5 and compatible ARM64 systems.

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
