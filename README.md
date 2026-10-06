# Netfreak2k Server-OS

**Offgrid · Mesh · Local Intelligence**

Netfreak2k Server-OS is being developed as a **browser-managed background platform for Linux Mint**, similar in user experience to CasaOS or Umbrel. Linux Mint remains the host, while Netfreak2k provides the web UI, app layer and managed virtualization needed for full Home Assistant OS.

> **KEIN NETZ. KEIN PROBLEM.**

## Current target

The first target is a ThinkPad or other Linux host that keeps its existing operating system.

Netfreak2k must not:

- replace the existing OS
- repartition disks
- install a bootloader
- replace the desktop environment
- take over the local login/session

Instead, the first version runs as an isolated Docker stack.

Access is intended to be as simple as:

```text
http://SERVER-IP/
```

Example:

```text
http://192.168.178.50/
```

Later, mDNS may add:

```text
http://netfreak2k.local/
```

## Installation

The target installation method is a single Netfreak2k installer for Linux Mint.

The installer may add only runtime dependencies required by Netfreak2k itself, such as Docker and KVM/QEMU/libvirt. It must not replace Linux Mint, repartition the system disk, replace the bootloader or remove the desktop environment.

See [Host Architecture](docs/APPLIANCE_ARCHITECTURE.md).

## Current architecture

```text
Existing Linux host
        │
        └── Docker
             │
             └── Netfreak2k Server-OS
                    │
                    ├── Web UI
                    ├── Apps
                    ├── System
                    ├── Storage
                    ├── Backups
                    ├── AI
                    ├── Automation
                    └── Energy / Offgrid
```

The first bootstrap serves the existing N2K Glass dashboard through HTTP.

## Host protection

Host changes must remain minimal, explicit and reversible.

The bootstrap scripts deliberately do **not** install Docker or reconfigure the operating system automatically. If Docker/Compose is missing, installation stops without modifying the host.

## Start

After cloning the repository on a Linux host with Docker + Docker Compose v2:

```bash
./scripts/server-install.sh
```

Then open the server IP in a browser.

To stop/remove the Netfreak2k stack:

```bash
./scripts/server-uninstall.sh
```

## Long-term direction

The broader Netfreak2k vision remains:

- browser-managed server platform
- Docker app management
- storage and backups
- Tailscale / remote access
- local and cloud AI integration
- automation
- solar/off-grid/UPS features
- multi-device services
- later optional dedicated OS/Desktop images

The dedicated bootable OS is now a later target, not the first milestone.

## Documentation

- [Server-first architecture](docs/SERVER_FIRST.md)
- [Product Specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Update Model](docs/UPDATES.md)

## Design

Netfreak2k uses the **N2K Glass** visual language: translucent surfaces, soft depth, rounded geometry and restrained animation.

The project must not copy Apple trademarks, proprietary fonts, icons, wallpapers or interface assets.

## Status

Early development. Current version: **0.1.0-dev**.

## Security

Credentials, Wi-Fi secrets, Tailscale auth keys, API keys and private user data must never be committed to this repository.

Telemetry is disabled by default and may only be enabled after explicit user opt-in.

## License

A project license will be selected before the first public stable release.
## Home Assistant

Home Assistant is mandatory and runs as **Home Assistant OS in a dedicated KVM/QEMU VM managed by Netfreak2k**.

This gives the full supported Home Assistant experience with:

- Core
- Supervisor
- Apps/Add-ons
- HAOS updates
- backups

No Proxmox installation is required. Netfreak2k uses the Linux KVM/libvirt stack underneath and exposes Home Assistant through the Netfreak2k web UI.
