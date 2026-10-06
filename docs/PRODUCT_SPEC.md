# Netfreak2k Server-OS Product Specification

## 1. Product vision

Netfreak2k Server-OS is a lightweight, general-purpose Linux desktop operating system with a modern N2K Glass interface, strong hardware auto-detection, local-first privacy, AI integration, resilient recovery, multi-device workflows, automation, and optional off-grid/energy capabilities.

The system should be usable as a normal daily-driver OS without requiring terminal knowledge for routine tasks.

Primary target experience:

> Install or boot → hardware is detected → connect Wi-Fi → pair Bluetooth if needed → sign in → work.

The public OS remains separate from the maintainer's private N2K Workspace.

## 2. Supported system classes

Netfreak2k Server-OS should adapt automatically to the detected platform:

- x86-64 desktop PCs
- x86-64 notebooks
- Raspberry Pi systems
- virtual machines / Proxmox guests
- other compatible Linux-capable hardware where practical

The system should automatically recognize the device class and apply appropriate defaults.

## 3. Installation and first boot

### Installer

- Graphical installer
- Live USB mode
- Hardware compatibility check before installation
- Detect Wi-Fi, Bluetooth, graphics, audio and storage
- Detect existing Windows installations and partitions
- Explicit warnings before risky partition changes
- Optional Windows dual-boot setup
- UEFI detection
- Secure Boot support where technically possible
- Disk encryption option
- Installation profiles: Minimal / Standard / Complete
- Netfreak2k Recommended preset

### First-boot assistant

Configure:

- language
- keyboard
- Wi-Fi
- user account
- browser
- AI providers
- messenger choices
- privacy options
- cloud services
- optional Google Drive, OneDrive and Nextcloud integration

## 4. Hardware support

Core hardware support is mandatory, not optional.

- Automatic hardware detection
- Wi-Fi included in the base system
- Bluetooth included in the base system
- Ethernet
- USB devices
- audio devices
- graphics
- webcams
- microphones
- keyboards and mice
- touchpads
- card readers
- printers
- scanners
- external drives
- game controllers
- touchscreens
- 2-in-1 devices
- display rotation
- multi-monitor support
- HiDPI / 4K scaling
- fingerprint readers where supported
- face-authentication hardware where supported
- proprietary graphics drivers offered when needed and legally distributable
- missing firmware/driver diagnostics with clear user-facing guidance

External drives must support automatic mounting and safe removal.

Filesystem interoperability:

- ext4
- Btrfs
- NTFS
- exFAT
- FAT32

When a new drive is connected, the OS may offer:

- Open
- Mount permanently
- Use as backup target

## 5. Desktop experience

### Interface

- N2K Glass design language
- bottom dock
- top status bar
- modern macOS-inspired workflow without copying proprietary Apple assets
- virtual desktops/workspaces
- global search for apps, files, settings and optional AI search
- Light mode
- Dark mode
- automatic day/night theme switching
- Night Light / blue-light filter
- fixed central Control Center in the top-right

### Control Center

Must include:

- Wi-Fi
- Bluetooth
- VPN
- volume
- display brightness
- audio device switching
- work profiles
- Offline Mode
- Private Mode
- Do Not Disturb
- selected automation shortcuts
- running automation status and pause/stop controls

The Control Center is intentionally not freely user-customizable.

### Audio

- per-app volume
- per-app audio output
- per-app microphone selection
- quick switching between speaker, HDMI, USB and Bluetooth outputs
- preferred Bluetooth device priority

## 6. Standard desktop applications

Standard installation should include:

- Google Chrome as a first-class browser
- LibreOffice
- PDF reader
- image viewer
- simple image editor
- VLC or equivalent media player
- archive manager
- screenshot tool
- screen recorder
- text editor
- calculator
- graphical file manager
- software center / app store
- Flatpak support
- integrated help/support app

Preinstalled non-critical apps must be uninstallable.

A central Default Apps section should configure browser, mail, PDF, images, music, video and terminal handlers.

## 7. Web apps

Netfreak2k Server-OS should support installing web services as desktop-like apps.

Examples:

- Gmail
- Google Calendar
- YouTube
- ChatGPT

Web apps should have:

- their own icon
- dock integration
- separate windows
- profile assignment

A dedicated Web App Manager should allow creation, editing, removal and profile assignment.

## 8. Users, security and privacy

### Users

- multiple user accounts
- guest mode
- separate browser, web-app and AI settings per user
- parental controls / user restrictions
- app and website restrictions
- usage-time restrictions

### Security

- firewall enabled by default
- incoming connections blocked unless explicitly allowed
- full-disk encryption option
- Secure Boot support where possible
- biometric system login where supported
- biometric unlock for the local password manager
- SSH installed but disabled by default
- SSH activation via settings

### App permissions

Central per-app control for:

- files
- network
- camera
- microphone
- location
- clipboard
- notifications
- background activity

Permissions should be requested on first access.

### Telemetry

- telemetry off by default
- anonymous telemetry only after explicit opt-in

## 9. Local password manager

Netfreak2k Server-OS should include an integrated password manager.

Requirements:

- local encrypted storage
- no mandatory cloud synchronization
- password generation
- browser autofill
- biometric unlock where available

## 10. Network and connectivity

- NetworkManager-based graphical networking
- known Wi-Fi network priority
- Wi-Fi hotspot mode
- hotspot can operate without internet as a local LAN
- mDNS / Bonjour
- SMB / Windows share discovery
- NAS discovery
- simple folder sharing
- WireGuard
- OpenVPN
- Tailscale
- graphical VPN management
- UPnP / DLNA discovery
- media streaming to compatible devices
- Chromecast support
- AirPlay-compatible output where feasible with free software
- Miracast / Wireless Display support where feasible
- Bluetooth file transfer

## 11. Smartphone and nearby-device integration

- automatic smartphone detection over USB/network where possible
- photo and file transfer
- notifications from phone to desktop
- shared clipboard
- local-network nearby-device file transfer
- receiver confirmation before incoming transfers
- device discovery in the local network
- optional operation over VPN/Tailscale between owned devices

## 12. Multi-device ecosystem

A graphical device overview should show:

- online/offline state
- last sync
- storage state
- connection type

Available actions may include:

- send file
- share clipboard
- open remote desktop
- start synchronization
- Wake-on-LAN

File/folder synchronization should support:

- LAN-only mode
- optional Tailscale mode
- version history
- conflict detection
- keep both versions on conflicts

## 13. Remote access

- browser-based remote desktop
- remote access from PCs and smartphones
- local-network operation
- optional Tailscale access
- explicit security controls

## 14. Backup and recovery

### Backups

- simple personal-file backup
- USB targets
- NAS targets
- network shares
- encrypted backups
- incremental backups
- scheduled backups
- event-based backups
- automatic retry after failure
- free-space check before backup
- retention rules
- automatic integrity testing
- at least one recoverable full state must always remain

Example retention:

- 7 daily
- 4 weekly
- 12 monthly

### Snapshots

- Btrfs-supported snapshot strategy where appropriate
- automatic recovery point before major updates
- recovery point before automatic repair actions where possible

### Recovery environment

Bootable recovery environment capable of:

- restoring snapshots
- repairing boot problems
- copying personal files to USB
- system reset
- optional reset while preserving personal files

## 15. Updates

Update channels:

- Stable
- Beta
- Developer

Users may switch channels in Settings.

Update behavior:

- download updates in the background
- install only after user confirmation
- create recovery point before major updates
- verify package/release integrity
- post-update health checks
- rollback on failure where possible

## 16. System health and diagnostics

System Health should show:

- CPU
- RAM
- storage
- temperatures
- fan speeds where available
- network
- battery
- battery health
- battery cycles
- battery runtime estimate

Storage health:

- SMART monitoring
- user-friendly states such as Good / Warning / Replacement recommended
- backup recommendation when storage becomes unreliable

Diagnostics:

- detect missing firmware/drivers
- collect relevant logs locally
- explain Wi-Fi, storage, update and hardware failures in user-friendly language
- integrated support app
- post-emergency root-cause assistant
- repair suggestions
- repairs may be executed automatically after user confirmation
- verify whether repairs succeeded

## 17. Power management

Power profiles:

- Performance
- Balanced
- Power Saver
- Quiet Mode
- Maximum Battery Life

Notebook features:

- battery health
- charge cycles
- charge thresholds such as 80%, when hardware supports them
- detect long-term AC use and offer battery-preserving charge limits
- detect high-power USB devices
- per-app/device power visibility

Thermal handling:

- monitor temperatures
- monitor fan speed where available
- warn on overheating
- automatically switch to a lower-power profile if necessary

## 18. Work profiles

Users can create multiple work profiles such as:

- Development
- Private
- Solar
- Office
- AI

Profiles may store:

- dock apps
- wallpaper
- browser profiles
- AI providers
- windows/layouts
- virtual desktops
- startup apps

Profiles may switch automatically based on attached hardware, for example a dock or external monitor.

Location-based automatic profile switching is explicitly not required.

Manual profile switching must be available from the Control Center.

## 19. Private and offline modes

### Offline Mode

One-click mode that disables:

- cloud AI
- cloud sync
- external network services

while keeping local functions operational.

The active offline state must be clearly visible in the top status area.

### Private Mode

Should avoid persistent storage of:

- browsing/session history
- clipboard history
- temporary files

Private Mode should also apply to web apps and AI dashboard sessions, clearing local session data on exit.

## 20. AI platform

### AI Provider Center

Central management for:

- ChatGPT
- Gemini
- Claude
- other cloud providers
- local models

### AI Dashboard

- multiple AI windows side by side
- several providers/projects at once
- shared prompt input
- send one prompt to multiple AI windows
- compare responses
- highlight differences
- create a combined summary

### File and project access

- drag-and-drop PDFs, images, text files and spreadsheets
- project folders can be added as sources
- folder access must always be explicitly granted
- no automatic access to the full home directory
- central AI permission overview
- permissions can be revoked at any time

### Cloud upload rules

- before file upload, show which provider will receive the file
- explicit confirmation required
- sensitive-content auto-detection/blocking is not required
- user remains responsible for deciding what is uploaded

### Local AI

- fully offline local models
- automatic hardware capability detection
- recommend models suitable for available CPU/RAM/GPU
- automatic local-vs-cloud routing where enabled
- user-defined routing rules
- rules such as:
  - personal files always local
  - web search may use cloud
  - selected projects never leave the device

### AI logs

- local activity log for AI file/folder access
- stored locally only
- fully deletable by the user

## 21. Automation platform

Graphical no-code automation editor.

Supported triggers/conditions:

- battery level
- solar production
- time
- day of week
- network state
- selected Wi-Fi
- Tailscale state
- internet availability
- USB insertion
- NAS availability
- Bluetooth connection
- monitor connection
- other device events

Rules may combine multiple conditions.

Actions may include:

- change power profile
- pause/resume backup
- pause/resume AI tasks
- start synchronization
- display notification
- play warning sound
- send smartphone notification
- run selected safe system actions

Automation features:

- templates
- custom templates
- import/export
- version history
- test/simulation mode
- local activity log
- manual launch
- Control Center shortcuts
- pause/stop from Control Center

Critical actions always require confirmation and this requirement cannot be disabled.

Critical examples:

- shutdown
- destructive delete
- generator start
- network shutdown

## 22. Emergency mode

One-click Emergency Mode should:

- pause automations
- stop generator control
- restrict network access
- allow only local administration and pre-approved connections
- disconnect cloud services
- disconnect cloud AI
- keep local AI/local services available where safe
- preserve a local diagnostic snapshot

Diagnostic snapshot should include:

- relevant logs
- recent automation activity
- network state
- energy state

After Emergency Mode, the system may launch a root-cause assistant.

## 23. Energy / off-grid platform

Dedicated energy dashboard.

Support multiple installations/sites such as:

- home
- garden
- camper
- off-grid station

Possible data sources:

- inverter
- battery
- PV generation
- consumption
- UPS
- generator
- other supported energy telemetry

Dashboard features:

- live state
- history
- charts
- daily/monthly/yearly comparisons
- local long-term storage
- low-battery warnings
- inverter fault warnings
- abnormal-consumption warnings
- trend detection
- battery-capacity degradation detection
- PV performance trends

Local AI may analyze energy data and explain trends without cloud use.

AI may suggest actions, but changes require user confirmation.

## 24. Energy-aware system control

At critical battery level the OS may:

- switch power profile
- pause heavy AI tasks
- pause backups
- reduce non-critical services
- keep user-selected critical services running

The user defines which services are critical.

Time-based energy profiles are supported.

On mains failure / battery switch the OS may automatically:

- pause heavy jobs
- prioritize critical services
- change power profile

UPS support:

- automatic detection where supported
- battery level
- estimated runtime
- clean shutdown
- multiple UPS/power-source management

Power-source rules may support:

- grid
- UPS
- solar battery
- generator

The system may prioritize a preferred source where connected hardware supports control.

## 25. Generator control

Generator start/stop automation may be supported only when compatible control hardware is available.

Mandatory safety requirements:

- user confirmation for critical actions
- minimum battery threshold
- maximum runtime
- cooldown phase
- manual emergency stop
- audit logging

## 26. Developer mode

Optional developer mode should expose:

- advanced logs
- additional terminal tools
- test options
- Git
- GitHub integration
- graphical Git client
- automatic detection of Git repositories
- Git actions in the file manager where feasible
- Docker/container support as an optional component

## 27. Software management

- graphical software center
- native packages
- Flatpak support
- app uninstall
- autostart manager
- app permissions
- update integration
- clear distinction between system-critical and removable components

## 28. Explicit non-goals / decisions

The following decisions are currently explicit:

- no dedicated Gaming Mode
- no automatic location-based work-profile switching
- no automatic scanning/blocking of sensitive document contents before cloud upload
- Control Center is not freely user-customizable
- critical automation confirmations cannot be disabled

## 29. Implementation principle

Netfreak2k Server-OS should prefer mature upstream Linux components over unnecessary custom reinvention.

Custom development should focus on:

- N2K Glass UX
- unified Control Center
- first-boot experience
- AI dashboard/provider layer
- permissions UX
- automation editor
- system health/support UI
- multi-device experience
- energy/off-grid dashboard
- recovery integration

The system should remain lightweight enough to scale down to constrained hardware while providing richer features on stronger x86-64 and Raspberry Pi systems.
## 30. Mandatory Home Assistant support

Home Assistant is a required first-class workload in Netfreak2k Server-OS.

Requirements:

- Home Assistant Core must be supported in container form
- no requirement to replace the host with Home Assistant OS
- persistent Home Assistant configuration storage
- safe install/update/restart/uninstall lifecycle
- backup and restore of Home Assistant configuration
- LAN discovery compatibility where required by integrations
- visibility of Home Assistant service state inside Netfreak2k
- future integration with Netfreak2k automations
- future integration with the energy/off-grid dashboard
- ability to keep Home Assistant classified as a critical service during energy-saving or emergency scenarios

