# Netfreak2k Server-OS

**Private Cloud · Server · Home Assistant · Local Intelligence**

Netfreak2k Server-OS is a browser-managed server platform for Linux hosts. It keeps the existing host operating system intact and adds a unified web interface for services, storage, virtualization, backups, security, monitoring, networking and recovery.

> **KEIN NETZ. KEIN PROBLEM.**

## Release status

Current stable release: **1.0.0**

Netfreak2k Server-OS 1.0.0 is released as stable. Release verification is tracked in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Platform target

- Linux Mint / Ubuntu
- amd64
- hardware virtualization (Intel VT-x / AMD-V)
- Docker Compose v2
- KVM/QEMU + libvirt

Netfreak2k does **not** replace the host OS, repartition disks, install a bootloader, replace the desktop environment or take over the local login session.

## Core capabilities

- N2K Golden Glass responsive web dashboard
- Docker app management with diagnostics, logs and image update checks
- Home Assistant OS as a managed KVM/libvirt VM
- VM controls, resources, networking and non-destructive snapshots
- Storage inventory, SMART, RAID/ZFS visibility and controlled mounts
- Backup & Recovery with integrity verification, restore tests and retention
- safe system update preflight with a verified pre-update recovery point
- LAN inventory with device history, service analysis and Wake-on-LAN
- host/network health monitoring and configurable alert policies
- users, roles, password-based local login, sessions and audit log
- host security hardening diagnostics
- HTTPS gateway, domain/TLS status and connectivity diagnostics
- Jobs & Scheduler view for N2K jobs and read-only systemd timers
- unified Logs & Events center
- Recovery Center with bounded admin repair actions
- N2K Drive workspace, WebDAV/CalDAV, calendar, Office and Media Center
- branded terminal and configurable desktop appearance

## Windows und macOS (experimenteller VM-Installationsweg)

Auf Windows 11 und Intel-macOS kann Netfreak2k Server-OS über eine von Multipass bereitgestellte Ubuntu-VM installiert werden. Die neuen Einstiegsskripte sind `install-windows.ps1` und `install-macos.sh`; siehe [Plattform-Anleitung](docs/INSTALL_WINDOWS_MACOS.md).

**Wichtig:** Dies ist keine native Windows-/macOS-Portierung. Die VM muss die Voraussetzungen des Linux-Installers, insbesondere amd64 und Nested VT-x/AMD-V für KVM, erfüllen. Ohne diese wird die Installation gestoppt. Auf Apple Silicon wird die derzeitige amd64-Version nicht unterstützt. Funktionen mit direktem Zugriff auf den Windows-/macOS-Host sind nicht gleichwertig. Für den vollständigen Linux-Umfang empfiehlt sich ein direkt installierter Linux-Host.

## Installation

Run the installer as root on a supported host:

```bash
curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh | sudo bash
```

Or from a repository checkout:

```bash
sudo ./install.sh
```

The installer adds the runtime dependencies required by Netfreak2k, configures managed services, provisions Home Assistant OS and starts the web platform. The first browser visit creates the local administrator account.

## Architecture

```text
Linux Mint / Ubuntu host
├── Nginx HTTPS gateway
├── Netfreak2k host agent
├── Docker
│   ├── N2K Web
│   ├── N2K API
│   └── managed apps
├── KVM / libvirt
│   └── Home Assistant OS
└── systemd
    ├── update checks
    ├── backup scheduler
    └── certificate renewal
```

The browser UI is the primary management surface. High-risk host mutations are deliberately constrained and audited.

## Update and recovery model

System updates follow **Preflight → verified N2K backup → update → post-update status**. The Recovery Center provides diagnostics and bounded repair actions; destructive restore operations remain in Backup & Recovery and require explicit confirmation.

## Remote access

Local HTTPS is provided through the managed Nginx gateway. Optional domain mode supports Let's Encrypt. The dashboard distinguishes local gateway/TLS readiness, DNS-to-WAN-IP matching, the domain HTTPS self-test and true outside-in reachability.

## Security

Netfreak2k includes local password authentication, roles, CSRF protection for mutations, audit events, session management and read-only host attack-surface diagnostics.

Credentials, Wi-Fi secrets, authentication keys, API keys and private user data must never be committed to this repository. Telemetry is disabled by default.

## Documentation

- [Server-first architecture](docs/SERVER_FIRST.md)
- [Product Specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Update Model](docs/UPDATES.md)
- [N2K Drive / Private Cloud](docs/CLOUD_WORKSPACE.md)
- [N2K Calendar](docs/CALENDAR.md)
- [Design, Branding and Copyright Policy](docs/DESIGN_AND_BRANDING.md)
- [v1.0 Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Third-Party Notices / License Register](THIRD_PARTY_NOTICES.md)

## Design

Netfreak2k uses the original **N2K Golden Glass** visual language. The project may use general modern desktop design principles but must not copy Apple trademarks, proprietary fonts, icons, wallpapers, SF Symbols, sounds or interface assets.

## License

Netfreak2k-owned source code is licensed under the **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. See [LICENSE](LICENSE). Runtime dependencies and optional apps retain their respective upstream licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Home Assistant

Home Assistant is integrated as **Home Assistant OS in a dedicated KVM/QEMU VM managed by Netfreak2k**, preserving the supported HAOS model with Supervisor, apps/add-ons, HAOS updates and Home Assistant backups without requiring Proxmox.
