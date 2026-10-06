# Netfreak2k OS

**Offgrid · Mesh · Local Intelligence**

Netfreak2k OS is currently being developed **server-first**: the first usable release runs in the background on an existing Linux machine and is controlled entirely through a browser, similar in operating model to CasaOS or Umbrel.

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

## Current architecture

```text
Existing Linux host
        │
        └── Docker
             │
             └── Netfreak2k Server
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
