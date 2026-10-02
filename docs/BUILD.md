# Build Guide

## Current build baseline

The first implementation target is:

- Debian Stable
- XFCE as the lightweight desktop foundation
- Debian live-build for amd64 ISO generation
- separate ARM64/Raspberry Pi image work after the amd64 VM prototype is proven

XFCE is the initial substrate, not the final visual identity. N2K Glass theming and custom shell components are layered on top.

## Why amd64 first

The first bootable image should be proven in a VM before hardware-specific Raspberry Pi work is allowed to complicate the build.

Target sequence:

1. amd64 build
2. VM boot
3. networking/audio/desktop smoke test
4. installer test
5. physical x86-64 hardware test
6. ARM64/Raspberry Pi image path

## Builder requirements

Use a Debian-compatible amd64 system or VM with root/sudo access.

Install:

```bash
sudo apt update
sudo apt install live-build git
```

Then:

```bash
git clone https://github.com/netfreak2k/netfreak2k-os.git
cd netfreak2k-os
./scripts/preflight.sh
./scripts/build-amd64.sh
```

The ISO is expected under `dist/`.

## Google Chrome

Chrome is a required first-class application in the product specification.

Google currently documents Linux support for Debian/Ubuntu on x86-64 and ARM64. The Chrome packaging step is intentionally kept separate from the first live-build bootstrap until its repository/package integration is tested in CI and in the VM image.

Do not silently substitute another browser and call the requirement fulfilled.

## Current stop point

Repository scaffolding, package profiles and validation can be prepared remotely.

A real computer/VM becomes necessary when we need to:

- execute the image build
- boot the ISO
- inspect graphical behavior
- validate Wi-Fi/Bluetooth/audio/graphics
- test the installer
- test suspend/resume and real hardware
