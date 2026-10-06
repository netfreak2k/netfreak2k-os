# Netfreak2k Server — Server-first Architecture

## Current priority

The first usable Netfreak2k release is a **web-managed server platform**, comparable in operating model to CasaOS or Umbrel.

The existing host operating system remains in place.

Netfreak2k does **not**:

- replace the host OS
- repartition disks
- install a bootloader
- replace the desktop environment
- change the login manager
- require the ThinkPad to boot a Netfreak2k image

Instead, Netfreak2k runs as an isolated background stack and is opened from another device through a browser.

## Access model

Default:

```text
http://SERVER-IP/
```

Example:

```text
http://192.168.178.50/
```

A later milestone may add:

```text
http://netfreak2k.local/
```

using mDNS.

## Host protection rule

Host changes must be minimal, explicit and reversible.

The initial installer therefore:

1. checks whether Docker and Docker Compose already exist,
2. refuses to install or reconfigure Docker automatically,
3. builds only the Netfreak2k container stack,
4. creates only Docker-managed containers/networks required by Netfreak2k,
5. provides an uninstall helper.

No automatic package-manager modifications are performed in the first bootstrap.

## Initial stack

```text
Existing Linux on ThinkPad
        │
        └── Docker
             │
             └── Netfreak2k Web Container
                    │
                    └── HTTP :80
                         │
                         ▼
                  Browser on LAN
```

The first container serves the existing N2K web dashboard.

## Planned evolution

After the web shell is proven:

- authenticated first-run setup
- host/API agent with deliberately limited permissions
- system health
- disk/storage information
- Docker app management
- app catalog
- file services
- backup controls
- Tailscale
- local AI services
- energy/off-grid modules
- mDNS name `netfreak2k.local`

Every host-facing capability must be individually documented and permission-scoped.

## Security direction

The dashboard must not expose administrative controls unauthenticated once host-management APIs are introduced.

The static prototype may run LAN-only during development. Authentication becomes mandatory before any feature capable of changing host state is enabled.
