# Netfreak2k OS

**Offgrid · Mesh · Local Intelligence**

Netfreak2k OS is a customizable Raspberry Pi focused operating-system platform designed around a lightweight desktop, Google Chrome, remote web access, resilient networking and optional off-grid / mesh capabilities.

> **KEIN NETZ. KEIN PROBLEM.**

## Project model

Netfreak2k OS is the public, general-purpose OS platform.

The maintainer's personal **N2K Workspace** is intentionally separate and is not part of this public repository. Improvements developed in the Workspace may later be contributed back to Netfreak2k OS after review and testing.

## Core goals

- Lightweight desktop suitable for Raspberry Pi 3 and newer
- Modern **N2K Glass** visual language inspired by contemporary translucent desktop UI, without copying Apple trademarks, proprietary assets, fonts, icons or artwork
- Google Chrome as a first-class application
- Local Web UI accessible from the LAN
- Browser-based remote desktop
- Tailscale remote access
- Direct Wi-Fi access point fallback when no infrastructure network is available
- User-customizable appearance and feature set
- GitHub-based, user-approved update workflow
- Stable / Beta / Developer update channels
- Recovery and rollback before system-level updates
- Optional Reticulum, LXMF, MeshCore, Home Assistant and local-AI integrations

## Architecture principle

Netfreak2k OS is the platform. User-specific workspaces and projects sit on top of it.

```text
Netfreak2k OS
├── Desktop
├── Chrome
├── Web UI
├── Remote Desktop
├── Networking
├── Tailscale
├── Update Manager
├── App / Service Framework
├── Themes
└── System Services
```

## Status

Early development / architecture phase.

Initial target: **0.1.0-dev**

## Hardware target

Primary bootstrap target:

- Raspberry Pi 3
- 64-bit Linux base
- SSD system storage

The architecture should remain portable to newer Raspberry Pi models and other ARM64 systems where practical.

## Updates

Netfreak2k OS checks published GitHub releases and notifies the user before installation. Updates are never silently installed by default.

See [docs/UPDATES.md](docs/UPDATES.md).

## Security

Credentials, Wi-Fi secrets, Tailscale auth keys, API keys and private user data must never be committed to this repository.

## License

A project license will be selected before the first public stable release.
