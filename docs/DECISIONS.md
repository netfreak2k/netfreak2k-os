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

**Status:** Accepted for prototype

XFCE is the initial lightweight desktop substrate.

It is not the final Netfreak2k visual identity. N2K Glass theming, Control Center and custom user-facing components sit above it.

Reasons:

- lightweight enough for lower-end hardware
- mature
- widely packaged
- suitable for early VM and Raspberry Pi testing

This decision can be revisited after performance measurements.

## ADR-003 — amd64 VM first

**Status:** Accepted

The first bootable prototype is amd64 and must pass a VM smoke test before Raspberry Pi-specific image engineering becomes a gating concern.

This reduces simultaneous variables during early development.

## ADR-004 — Debian live-build for initial ISO

**Status:** Accepted

The first x86-64 live/installer image is generated using Debian live-build.

ARM64/Raspberry Pi images may require a different image-building path while keeping the same product configuration and package/profile definitions.

## ADR-005 — Google Chrome is a real requirement

**Status:** Accepted

Google Chrome is treated as a first-class required browser, not merely a placeholder for Chromium.

Its external package/repository integration must be tested and documented separately from the Debian-only bootstrap image.

## ADR-006 — User confirmation before risky operations

**Status:** Accepted

Critical automation actions and destructive/recovery-sensitive operations keep explicit user confirmation where specified by PRODUCT_SPEC.md.

Safety prompts for critical automation actions are not user-disableable.
