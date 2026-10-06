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

The overview endpoint aggregates local state only. It does not enable external telemetry.

## Visual language

Overview widgets follow N2K Golden Glass and remain visually distinct from proprietary Apple assets or copied macOS widgets.
