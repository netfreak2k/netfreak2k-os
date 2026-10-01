# Netfreak2k OS Architecture

## Architecture model

Netfreak2k OS has two deliberately separated domains:

1. **Netfreak2k OS** — the public, reusable operating-system platform.
2. **Private Workspace** — the user's personal work environment, configuration and recoverable state.

The private workspace is not bundled into the public OS image.

## Platform layers

```text
User Experience
├── N2K Glass Desktop
├── N2K AI Dashboard
├── N2K Terminal
├── Google Chrome
├── Office
├── Radio / Media
└── Core desktop utilities

Desktop / Platform Services
├── Window manager / compositor
├── Application launcher / dock
├── Network manager
├── Bluetooth
├── Audio stack
├── Removable storage
├── Printing support
├── Tailscale integration
├── Update manager
├── Backup / recovery
└── User settings

Linux Base
├── Lightweight ARM64 distribution base
├── systemd services
├── package management
├── firewall
├── logging / diagnostics
└── hardware support
```

## Raspberry Pi performance rule

Raspberry Pi 3 is the minimum supported design target. The default profile must therefore avoid heavy background services and excessive GPU effects.

Two visual profiles are planned:

- **Pi 3 / Performance** — reduced blur, restrained animation, minimal background services
- **Enhanced** — richer visual effects for Pi 4, Pi 5 and stronger systems

## Desktop philosophy

The desktop uses the **N2K Glass** design language. It may be visually inspired by current premium desktop systems, including macOS-style concepts such as a top bar, floating dock, translucent surfaces, rounded geometry and visual depth.

Brand and asset rules:

- no Apple logos
- no proprietary Apple fonts
- no copied Apple icons
- no Apple wallpapers
- no proprietary Apple artwork
- no direct redistribution of protected Apple UI assets
- only freely redistributable themes, icon sets, fonts and wallpapers

## Chrome requirement

Google Chrome is a first-class required application for the target experience. It is the primary browser for ChatGPT, video streaming, PWAs and browser-based productivity.

Where Chrome availability or DRM support differs by architecture, the build system must detect and document the limitation instead of silently substituting an incompatible experience.

## AI dashboard

The AI dashboard is part of the public OS framework and is user-customizable.

It should support:

- user-defined tiles and shortcuts
- ChatGPT launch/integration through the user's normal account session
- system status
- files
- notes
- updates
- terminal launch
- configurable web apps
- future local-AI backends

Personal dashboard layouts and private project links belong to the private workspace.

## Branded terminal

Netfreak2k OS includes an **N2K Terminal** profile with:

- project branding
- lightweight shell prompt
- optional system summary
- commands such as `n2k status`, `n2k update`, `n2k doctor`, `n2k backup` and `n2k restore`
- normal Linux shell access underneath

Branding must not reduce shell compatibility or administrator access.

## Public-to-private development flow

```text
Private workspace improvement
        ↓
Is it generally useful?
   ├── no  → stays private
   └── yes → OS candidate
                 ↓
             dev branch
                 ↓
          automated tests
                 ↓
              review
                 ↓
              stable
```

The stable OS must never be overwritten directly by experimental workspace changes.

## Recovery principle

The OS and the user's private state are backed up separately.

A hardware failure should be recoverable by:

```text
Install clean Netfreak2k OS
        ↓
Authenticate to private backup source
        ↓
Restore workspace state
        ↓
Resume from last saved configuration
```

Secrets require encrypted handling and must never be stored in the public repository.
