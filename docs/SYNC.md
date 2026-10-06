# N2K Sync Architecture

## Goal

N2K Sync exposes Netfreak2k Drive and N2K Calendar to standards-based external clients without sharing the normal Netfreak2k admin password.

## Authentication

DAV clients use:

- the existing Netfreak2k username
- a dedicated app password created in Settings -> Synchronisation

App passwords:

- are generated randomly
- are shown only once
- are stored only as PBKDF2-HMAC-SHA256 hashes
- can be revoked individually
- record last-use time
- do not create a browser session
- do not grant shell access

## WebDAV

Base URL:

```
http://<server>/dav/files/
```

The WebDAV tree exposes the same logical N2K Drive areas:

- Dokumente
- Bilder & Videos
- Audio
- Downloads
- Persönlich
- Papierkorb
- Shared

Implemented methods:

- OPTIONS
- PROPFIND
- GET / HEAD
- PUT
- MKCOL
- MOVE
- COPY
- DELETE

Path resolution stays inside the existing N2K Drive workspace boundary. Arbitrary host filesystem paths are not accepted.

## CalDAV

Collection URL:

```
http://<server>/dav/calendars/<username>/default/
```

Implemented baseline methods:

- OPTIONS
- PROPFIND
- REPORT
- GET / HEAD
- PUT
- DELETE

Netfreak2k stores VEVENT data in the existing local calendar database. Existing local events are automatically assigned stable CalDAV UIDs.

The CalDAV implementation is intentionally limited to the current N2K Calendar feature set: VEVENT items, title, start/end and notes. More advanced recurrence/timezone/interoperability work remains a future compatibility layer.

## Security boundary

DAV access does not expose:

- /home
- /etc
- /var
- Docker socket
- libvirt
- Netfreak2k admin sessions

Only the authenticated user's N2K Drive data, Shared and calendar collection are reachable.

## Networking

DAV endpoints are proxied through the existing Netfreak2k NGINX frontend. No additional listening daemon or third-party DAV server is installed.

Before WAN use, HTTPS remains mandatory. LAN HTTP is intended only for trusted local networks.

## Compatibility status

CI validates a complete protocol smoke flow:

- create app password
- WebDAV PUT
- WebDAV PROPFIND
- WebDAV GET
- CalDAV PUT
- CalDAV REPORT
- CalDAV GET
- CalDAV DELETE

Real-client compatibility with Windows, macOS, iOS, Android, Thunderbird and other DAV clients will be expanded iteratively.
