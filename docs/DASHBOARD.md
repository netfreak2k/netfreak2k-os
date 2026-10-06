# Dashboard and Overview Architecture

## Principle

The Netfreak2k Server-OS overview is a compact status desktop, not a second copy of every management screen.

The sidebar is the primary navigation surface. The overview answers three questions quickly:

1. Is the system healthy?
2. What changed recently?
3. Where do I want to go next?

Detailed controls belong in the dedicated module views.

## Overview widgets

The compact overview includes:

- clock and date
- CPU usage
- RAM usage
- host storage usage
- uptime
- N2K Drive storage/favorites/share summary
- live network download/upload rate with a short sparkline
- next calendar events
- recently added files
- Home Assistant health
- recent activity
- quick links
- bottom status strip for Apps, Backups, Updates and overall System Health
- conditional warnings only when attention is needed

## Navigation behavior

Selecting a sidebar item switches from the overview to the corresponding module view.

Examples:

- Arbeitsplatz shows N2K Drive and Drive Control
- Apps shows Apps and App Catalog
- Kalender shows the full calendar
- Home Assistant shows the HAOS control panel
- Einstellungen opens the update/settings panel

The overview itself avoids destructive controls such as VM shutdown, app removal, restore operations or permanent deletion.

## Telemetry

CPU utilization is calculated from host `/proc/stat` deltas.

Network throughput is calculated from host `/proc/net/dev` deltas. Known Docker/libvirt bridge and virtual Ethernet interfaces are excluded when a physical/non-bridge interface is available to reduce double counting.

The overview primarily aggregates local state. For the explicitly requested WAN provider display, Netfreak2k performs a cached public-IP metadata lookup against ipwho.is. The result is cached for 15 minutes. Ping is measured as outbound TCP connection latency to public Internet endpoints.

## Visual language

Overview widgets follow N2K Golden Glass and remain visually distinct from proprietary Apple assets or copied macOS widgets.


## Detailed network and storage modules

The dedicated Network and Storage views intentionally contain more visual telemetry than the compact overview.

Storage now presents:

- large host-capacity ring
- used/free/total split
- host utilization bar
- HAOS virtual-disk share
- free-capacity health indicator

Network now presents:

- live download/upload KPIs
- cumulative received/sent traffic
- active host interfaces
- enlarged download/upload history chart
- relative traffic-volume bars

The Energy placeholder module has been removed from the product navigation until there is a concrete, hardware-backed energy feature set to ship.


## Compact desktop topbar

The topbar now carries the user greeting, clock/date and update state next to the Netfreak2k Server-OS title. The overview itself uses smaller, more transparent widgets so the selected wallpaper remains visually present behind status information.

Home Assistant controls live only in the VMs module. The overview keeps only a health/status shortcut that opens VMs.

## AI workspace

The AI module is a four-pane workspace. Each pane keeps a small local browser-side context/notebook and can launch a dedicated ChatGPT window.

ChatGPT's web application cannot be reliably embedded in an iframe because the service controls its own anti-framing security headers. The pane architecture is therefore provider-neutral: cloud providers can open in dedicated browser windows today, while a future local inference endpoint can render directly inside the same four pane slots.

## N2K Office

The sidebar includes an Office module. It is intentionally lightweight until the user opts into an editor engine.

The first supported editor engine is ONLYOFFICE Docs Community Edition. It is installed as a managed Docker application only after explicit confirmation. The Office module exposes document, spreadsheet and presentation entry points and keeps the architecture ready for direct N2K Drive document editing.

The global search stays centered in the topbar. Greeting, user actions, clock and date are grouped on the right, with the clock occupying the far-right visual position.

## N2K Terminal

The dashboard includes a branded Netfreak2k diagnostic terminal. It intentionally does not expose an unrestricted host shell.

The browser-side terminal maps a small allowlist of diagnostic commands to existing authenticated Netfreak2k APIs:

- help
- status
- cpu
- ram
- storage
- network
- apps
- vms
- uptime
- clear

This preserves the rule that the browser does not receive arbitrary root, Docker or libvirt command execution.

## N2K Underground / Privacy

The overview contains a small animated Matrix-style widget that opens the Underground/Privacy module.

The module explicitly distinguishes Usenet from Tor/Onion services. Netfreak2k does not expose an open server-side SOCKS or HTTP proxy. The Onion launcher only validates and passes a `.onion` URL to the user's current browser. Actual Onion connectivity therefore requires a Tor-capable client/browser.

The Usenet area is provider-neutral and is reserved for a future newsreader/NZB integration rather than hard-wiring one commercial provider.

