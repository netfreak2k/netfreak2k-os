# Architecture Decisions

This file records decisions that should not be casually changed without updating the product specification and roadmap.

## ADR-001 — Debian Stable base

**Status:** Accepted

Netfreak2k OS uses Debian Stable as the initial upstream base.

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

Dedicated bootable Netfreak2k OS images, desktop environments and installer work remain valid future targets but are no longer the first delivery milestone.

## ADR-008 — Minimal and reversible host integration

**Status:** Accepted

The initial bootstrap must not silently install Docker, change host networking, alter firewall rules, or install unrelated system packages.

If prerequisites are missing, the installer stops and tells the operator what is required.

Every future host-management capability must be explicit, permission-scoped and documented.
