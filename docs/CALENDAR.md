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

## Planned synchronization layer

The next interoperability layer is CalDAV.

Target behavior:

- keep the Netfreak2k UI as the primary built-in calendar
- expose standards-based CalDAV synchronization
- allow compatible phone and desktop clients to synchronize
- preserve local-first operation
- avoid requiring a third-party cloud account

CalDAV must be implemented with a maintained, license-compatible component or a standards-compliant first-party service after security review.
