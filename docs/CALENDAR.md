# N2K Calendar Architecture

## Current implementation

N2K Calendar is built directly into Netfreak2k Server-OS.

Events are stored in the existing local Netfreak2k SQLite database and scoped by local username.

Current capabilities:

- month view
- previous/next month navigation
- create event
- start time
- optional end time
- notes
- upcoming-event list
- delete event with confirmation

Calendar data remains local to the server.

## Synchronization layer

A first-party CalDAV baseline is now implemented.

Target behavior:

- keep the Netfreak2k UI as the primary built-in calendar
- expose standards-based CalDAV synchronization
- allow compatible phone and desktop clients to synchronize
- preserve local-first operation
- avoid requiring a third-party cloud account

CalDAV is implemented as a standards-based first-party service in the existing Netfreak2k API. It uses dedicated app passwords and the existing local calendar database. CI covers PUT/REPORT/GET/DELETE; broader real-client compatibility remains iterative. See `docs/SYNC.md`.
