# Netfreak2k OS 0.1.0-dev Implementation Plan

## Current implementation

The repository now contains the first executable project skeleton:

- shared OS defaults
- branded `n2k` command
- common bootstrap script
- architecture-aware Google Chrome installer
- Raspberry Pi and x86_64 platform package manifests
- N2K AI Dashboard MVP
- local dashboard systemd service
- CI validation and cross-platform build matrix scaffold

## Phase 1 — Bootable Raspberry Pi developer image

1. Select and pin the Debian/Raspberry Pi compatible base.
2. Integrate a reproducible image builder.
3. Install common packages and Raspberry Pi adapter.
4. Add lightweight desktop/session.
5. Add N2K Glass theme using redistributable assets.
6. Validate Raspberry Pi 3 boot, RAM use, GPU behavior and Wi-Fi.

## Phase 2 — Chrome and everyday desktop

1. Run architecture-aware Chrome availability test.
2. Install Chrome only from official Google packages/repositories.
3. Validate YouTube.
4. Validate DRM/Widevine separately per architecture.
5. Add office, PDF, media and radio applications.
6. Add file manager, screenshot and archive utilities.

## Phase 3 — N2K AI Dashboard

1. Replace preview server with authenticated local service.
2. Add live system API.
3. Add persisted module layout.
4. Add Chrome/PWA launch integration.
5. Add notes, files, updates and terminal launch.
6. Keep private user state outside the public repository.

## Phase 4 — Updates and recovery

1. GitHub Releases update feed.
2. Update notification before installation.
3. SHA256/signature validation.
4. Pre-update recovery point.
5. Health checks.
6. Rollback.
7. Private workspace export/restore.

## Phase 5 — x86_64 and Proxmox

1. Produce generic amd64 ISO.
2. Add VirtIO/QEMU Guest Agent defaults.
3. Produce QCOW2 template.
4. Validate SPICE/noVNC, ACPI and dynamic display sizing.
5. Add optional cloud-init path.

## Definition of done for 0.1.0-dev

- Pi 3 boots to a usable lightweight desktop.
- N2K Glass branding is visible.
- Chrome availability is checked and installed where officially available.
- N2K Terminal works.
- N2K AI Dashboard opens locally.
- Network/audio/storage basics work.
- CI validates all three target families.
- No private workspace data or secrets are present in the public repository.
