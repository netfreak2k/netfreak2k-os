# Architecture Decisions

This file records decisions that should not be casually changed without updating the product specification and roadmap.

## ADR-001 — Debian Stable base

**Status:** Accepted

Netfreak2k Server-OS uses Debian Stable as the initial upstream base.

Reasons:

- mature package ecosystem
- long-lived stable base
- broad x86-64/ARM64 support
- good fit for live-build and reproducible image work
- suitable foundation for both desktop and constrained systems

Release builds may later pin an exact Debian codename for reproducibility.

## ADR-002 — XFCE for the first prototype

**Status:** Accepted for later desktop prototype

XFCE remains the initial lightweight desktop substrate for a future dedicated desktop image.

It is not required for the server-first release.

## ADR-003 — amd64 VM first

**Status:** Superseded for immediate priority

The earlier bootable-image-first milestone is no longer the immediate delivery target. Server-first web deployment now comes first.

## ADR-004 — Debian live-build for initial ISO

**Status:** Deferred

Debian live-build remains the intended initial x86-64 dedicated-image path, but bootable image work is deferred until the server platform is mature enough.

## ADR-005 — Google Chrome is a real requirement

**Status:** Accepted for desktop edition

Google Chrome remains a first-class browser requirement for a later desktop edition. Server-first releases are accessed from the user's existing browser.

## ADR-006 — User confirmation before risky operations

**Status:** Accepted

Critical automation actions and destructive/recovery-sensitive operations keep explicit user confirmation where specified by PRODUCT_SPEC.md.

Safety prompts for critical automation actions are not user-disableable.

## ADR-007 — Server-first before dedicated OS

**Status:** Accepted

The first usable Netfreak2k product is a browser-managed server platform installed alongside an existing Linux host environment.

The existing host OS must remain intact. Netfreak2k must not automatically repartition disks, replace the bootloader, replace the desktop, or convert the machine into a dedicated appliance during the initial server phase.

The initial deployment model is a self-contained Docker Compose stack accessed through the host IP address.

Dedicated bootable Netfreak2k Server-OS images, desktop environments and installer work remain valid future targets but are no longer the first delivery milestone.

## ADR-008 — Minimal and reversible host integration

**Status:** Accepted

The initial bootstrap must not silently install Docker, change host networking, alter firewall rules, or install unrelated system packages.

If prerequisites are missing, the installer stops and tells the operator what is required.

Every future host-management capability must be explicit, permission-scoped and documented.
## ADR-009 — Home Assistant Core is mandatory

**Status:** Accepted

Home Assistant Core, deployed in its official container form, is a mandatory first-class application for Netfreak2k Server-OS.

This is not an optional community add-on. Netfreak2k must provide a supported installation and lifecycle path for Home Assistant, including persistent configuration storage, safe updates, backups and integration with the Netfreak2k energy/automation layers.

The Home Assistant deployment must not require replacing the host operating system with Home Assistant OS.

## ADR-010 — Linux Mint host, Netfreak2k background platform

**Status:** Accepted

Netfreak2k is installed on top of an existing Linux Mint host and runs as background services with a browser-based UI.

Linux Mint remains the host operating system and desktop.

Netfreak2k may install only runtime dependencies required for its own operation, including Docker and KVM/QEMU/libvirt where required.

It must not repartition the system disk, replace the bootloader, remove the desktop environment, or replace Linux Mint.

## ADR-011 — Home Assistant OS runs as a managed KVM VM

**Status:** Accepted

Home Assistant OS runs as a dedicated KVM/QEMU VM managed by Netfreak2k through libvirt.

This provides the full Home Assistant stack including Supervisor and Apps/Add-ons without requiring Proxmox.

Netfreak2k is the normal user-facing management layer. libvirt/QEMU are implementation details and are not intended as separate user-facing products.

## ADR-012: N2K Golden Glass is the product UI identity

**Status:** Accepted

Netfreak2k Server-OS uses the original **N2K Golden Glass** design language.

The interface may use general modern desktop principles such as translucency, blur, rounded surfaces and layered depth, but must not copy proprietary Apple assets, fonts, icons, wallpapers, sounds or source code.

Warm gold/amber light, the N2K brand, original component geometry and server/cloud information architecture are deliberate differentiators.

See `docs/DESIGN_AND_BRANDING.md`.

## ADR-013: N2K Drive is a first-party workspace, not a third-party file-manager skin

**Status:** Accepted

The private-cloud workspace is implemented as a Netfreak2k-owned UI and API constrained to `/srv/netfreak2k`.

The API receives no general writable host filesystem access. Personal user data and shared data have explicit roots. Path traversal is rejected.

The former optional File Browser catalog entry is removed from new installations because the upstream project is archived and no longer receives security fixes.

Standards such as WebDAV and SMB may be added as interoperability layers later without replacing N2K Drive as the product UI.

See `docs/CLOUD_WORKSPACE.md`.

## ADR-014: N2K Calendar is local-first with future CalDAV interoperability

**Status:** Accepted

Calendar events are stored locally in the Netfreak2k SQLite database and scoped to the authenticated local user.

The built-in web calendar is the product UI. CalDAV will be added later as a standards-based synchronization layer after security and license review.

See `docs/CALENDAR.md`.

## ADR-015: Every shipped dependency requires a license register entry

**Status:** Accepted

Any new runtime dependency, optional app, redistributed binary, font, icon set, wallpaper, illustration or other third-party asset must be reviewed for licensing and maintenance status before inclusion.

The same change that introduces a dependency must update `THIRD_PARTY_NOTICES.md`.

Unknown-license assets are not permitted.

## ADR-016: N2K Drive versions stay inside the workspace boundary

**Status:** Accepted

File-version payloads are stored below the authenticated user's hidden N2K Drive version store rather than in arbitrary host paths.

Replacing or restoring a file snapshots the displaced version first. Version metadata is held in the local Netfreak2k database.

Rename and move operations update associated metadata so favorites and versions continue to follow the logical file.

This keeps versioning local-first, reversible and within the same `/srv/netfreak2k` security boundary as the normal workspace.

## ADR-017: Overview is a status desktop, not a management duplicate

**Status:** Accepted

The Netfreak2k overview remains intentionally compact.

It may contain status widgets, recent activity, health warnings and navigation shortcuts, but detailed operational controls stay inside the corresponding sidebar module.

This prevents the start screen from becoming a second full management console and keeps risky actions out of the glanceable overview.

See `docs/DASHBOARD.md`.

## ADR-018: DAV sync uses revocable app passwords and first-party endpoints

**Status:** Accepted

WebDAV and CalDAV are exposed by the existing Netfreak2k API and NGINX frontend rather than by adding a separate DAV server.

External clients authenticate with individually revocable app passwords. The normal Netfreak2k browser password is not accepted as a DAV credential.

This keeps N2K Drive and N2K Calendar as the authoritative data stores, avoids duplicate account databases and adds no new third-party runtime dependency.

See `docs/SYNC.md`.

## ADR-019: Network and Storage are visual-detail modules; Energy placeholder removed

**Status:** Accepted

Network and Storage are operational modules that benefit from richer graphical telemetry than the overview desktop. Their dedicated views may therefore use larger charts, capacity graphics and detailed live metrics.

The empty Energy placeholder is removed from navigation until Netfreak2k has a real hardware-backed energy implementation. Placeholder modules should not occupy first-class navigation.

See `docs/DASHBOARD.md`.

