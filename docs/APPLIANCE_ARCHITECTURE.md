# Netfreak2k Appliance Architecture

## Product model

Netfreak2k is a browser-managed virtualization appliance built on top of Proxmox VE technologies.

The user interacts primarily with the Netfreak2k web UI. Proxmox VE provides the virtualization substrate underneath.

The appliance is accessed through:

```text
http://NETFREAK2K-IP/
```

The Netfreak2k UI becomes the main front door. Proxmox's native administration UI remains available as an advanced/admin fallback.

## Host layout

```text
Physical server / ThinkPad
│
└── Netfreak2k Appliance Host
    │
    ├── Proxmox VE base
    │   ├── KVM/QEMU
    │   ├── LXC
    │   ├── storage
    │   ├── networking
    │   ├── backup/snapshots
    │   └── VM lifecycle
    │
    ├── Netfreak2k Management VM/Container
    │   ├── Netfreak2k Web UI
    │   ├── API
    │   ├── app catalog
    │   ├── system overview
    │   └── orchestration
    │
    └── Home Assistant OS VM
        ├── Home Assistant Core
        ├── Supervisor
        ├── Apps/Add-ons
        ├── backups
        └── HAOS updates
```

## Home Assistant requirement

Home Assistant must run as **Home Assistant OS in a KVM VM**.

This is mandatory because the product requires the full Home Assistant experience:

- Home Assistant Supervisor
- Apps/Add-ons
- HAOS updates
- backups
- supported Home Assistant appliance behavior

Home Assistant Container is not sufficient for this requirement.

Home Assistant Supervised installed directly on the Netfreak2k/Proxmox host is not used.

## Netfreak2k OS inside the appliance

"Netfreak2k OS" is the user-facing management environment.

It does not need to replace or modify the Proxmox base directly for normal use. It runs as a dedicated management guest and controls allowed Proxmox resources through a scoped API/service account.

The Netfreak2k web UI should eventually provide:

- Home page/dashboard
- Home Assistant launch/status
- VM and container overview
- app catalog
- storage overview
- backups
- network overview
- AI services
- energy/off-grid services
- automation
- update status

## One roof

The user should not need to jump between unrelated admin interfaces for normal operation.

The intended flow is:

```text
Browser
  ↓
Netfreak2k Web UI
  ├── Home Assistant
  ├── Apps
  ├── VMs
  ├── Containers
  ├── Storage
  ├── Backups
  ├── Network
  ├── AI
  └── Energy
```

Home Assistant itself remains a separate guest and may be opened inside a dedicated Netfreak2k view or in its own browser tab.

## Existing Linux protection

Netfreak2k Appliance is **not installed into an existing Linux desktop/server**.

If an existing Linux installation must remain completely untouched, supported deployment choices are:

1. install Netfreak2k Appliance on a separate physical machine,
2. install it on a separate SSD/NVMe and boot from that disk,
3. run it as a VM on an already-existing hypervisor.

Installing the Proxmox-based appliance bare-metal onto the same disk as an existing Linux installation would replace/modify that host and is therefore not allowed by the "existing Linux untouched" requirement.

## Networking

Default design:

- one physical LAN bridge
- Netfreak2k management guest obtains a LAN address
- Home Assistant OS obtains its own LAN presence through a bridged VM NIC
- future mDNS name: `netfreak2k.local`
- Home Assistant remains discoverable on the LAN for device integrations

## Storage

The appliance owns only storage explicitly assigned to it.

VM disks, backups and Netfreak2k data live on Proxmox-managed storage.

An existing Linux disk that is meant to remain untouched must not be automatically imported, mounted read-write, repartitioned or used as appliance storage.

## Security

- Netfreak2k uses a scoped Proxmox API identity
- no direct unrestricted root API access from the browser
- state-changing VM/storage operations require authenticated Netfreak2k sessions
- destructive operations require explicit confirmation
- Proxmox native UI remains the recovery/admin interface
