# Roadmap

## 0.1.0-dev — Foundation

- Raspberry Pi 3 bootstrap on SSD
- shared cross-platform Netfreak2k OS core
- ARM64 Raspberry Pi platform layer
- x86_64 platform layer
- Netfreak2k OS branding
- N2K Glass desktop foundation
- performance profile for Raspberry Pi 3
- Google Chrome integration
- N2K AI Dashboard foundation
- branded N2K Terminal
- file manager
- PDF viewer
- archive tools
- text editor / notes
- screenshot tool
- system monitor
- Wi-Fi and Ethernet
- Bluetooth
- audio stack
- removable storage
- Tailscale integration
- Git-based build workflow
- CI build matrix for Raspberry Pi, x86_64 ISO and Proxmox QCOW2
- update checker foundation
- backup / recovery design

## 0.2 — Everyday desktop

- Office suite integration
- media player
- radio application
- printing support
- codec and browser-media validation
- YouTube validation
- Netflix/DRM validation where supported by Chrome/platform
- default-app management
- appearance settings
- light/dark N2K Glass themes

## 0.3 — Multi-platform builds

- reproducible ARM64 Raspberry Pi image
- reproducible x86_64 ISO
- Proxmox-ready QCOW2 image
- VirtIO defaults
- QEMU Guest Agent
- ACPI shutdown/reboot validation
- SPICE/noVNC validation
- optional cloud-init support
- automated target-specific smoke tests

## 0.4 — Personalization

- customizable AI dashboard
- user-defined dashboard tiles
- custom wallpapers from approved/free sources
- icon and theme switching
- dock customization
- startup applications
- performance / enhanced appearance profiles

## 0.5 — Recovery and lifecycle

- private workspace export
- encrypted private backup support
- one-click restore flow
- fresh-install recovery assistant
- rollback before major OS updates
- health checks after updates
- signed public releases

## Release artifact goal

```text
netfreak2k-os-rpi-arm64.img.xz
netfreak2k-os-amd64.iso
netfreak2k-os-proxmox-amd64.qcow2
```

General features should be developed once in the shared core and propagated through the automated build matrix. Hardware-specific differences stay isolated in platform adapters.

Special-purpose personal projects are intentionally not part of the base OS roadmap.
