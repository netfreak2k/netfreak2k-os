# Netfreak2k on Linux Mint — Final Host Architecture

## Goal

Netfreak2k runs in the background on an existing Linux Mint installation, similar to CasaOS or Umbrel.

The user opens Netfreak2k through the server IP in a browser:

```text
http://NETFREAK2K-IP/
```

Linux Mint remains the host operating system.

Netfreak2k is the user-facing server platform.

## Host layout

```text
Linux Mint
│
├── Netfreak2k background services
│   ├── Web UI
│   ├── API
│   ├── app management
│   ├── storage/backup integration
│   └── VM orchestration
│
├── Docker / containers for ordinary Netfreak2k apps
│
└── KVM/QEMU + libvirt
    └── Home Assistant OS VM
        ├── Home Assistant Core
        ├── Supervisor
        ├── Apps/Add-ons
        ├── HAOS updates
        └── Home Assistant backups
```

## User experience

Normal use happens under one Netfreak2k web interface.

```text
Browser
  ↓
Netfreak2k Web UI
  ├── Dashboard
  ├── Home Assistant
  ├── Apps
  ├── VMs
  ├── Storage
  ├── Backups
  ├── Network
  ├── AI
  └── Energy
```

The user does not need to operate libvirt or QEMU manually.

## Home Assistant

Home Assistant must run as Home Assistant OS in a KVM virtual machine.

This is mandatory because Home Assistant OS provides the supported full stack with:

- Home Assistant Core
- Supervisor
- Apps/Add-ons
- one-click update flows
- backups

Home Assistant Container is not sufficient because it does not provide Apps/Add-ons.

The old Home Assistant Supervised-on-Debian installation method is not used.

## What Netfreak2k installs

Netfreak2k may install and configure only dependencies required for its own operation, including:

- Docker Engine / Compose for Netfreak2k app workloads where needed
- QEMU/KVM
- libvirt
- virtual networking/bridge support needed for VMs
- Netfreak2k services and data directories

These components are treated as internal Netfreak2k runtime dependencies.

Netfreak2k must not replace Linux Mint, repartition the system disk, replace the bootloader, or remove the user's desktop environment.

## Home Assistant networking

The preferred design gives the HAOS VM its own LAN presence through a bridged or otherwise discovery-compatible virtual NIC.

This allows Home Assistant discovery protocols and integrations to work as naturally as possible.

## USB passthrough

Netfreak2k must provide a UI for attaching selected USB devices to HAOS, for example:

- Zigbee coordinators
- Z-Wave adapters
- Thread radios
- Bluetooth adapters where desired

## Lifecycle

Netfreak2k manages HAOS VM lifecycle:

- create/import official HAOS KVM image
- start
- stop
- restart
- autostart with host
- state/health display
- backup hooks
- VM snapshot integration
- controlled USB passthrough

## Safety

Netfreak2k must not expose unrestricted libvirt or root access to the browser.

State-changing VM operations require authentication and explicit permissions.

Destructive storage operations require explicit confirmation.
