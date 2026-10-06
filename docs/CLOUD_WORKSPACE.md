# N2K Workspace and Private Cloud Architecture

## Goal

Netfreak2k Server-OS evolves from a server dashboard into a local-first private cloud and server workspace.

The built-in **Arbeitsplatz** is a first-party Netfreak2k module. It does not expose arbitrary host directories.

## Storage boundary

The only host workspace mounted read/write into the API container is:

```
/srv/netfreak2k
```

Structure:

```
/srv/netfreak2k/
├── users/
│   └── <username>/
│       ├── Dokumente/
│       ├── Bilder & Videos/
│       ├── Audio/
│       ├── Downloads/
│       ├── Persönlich/
│       └── Papierkorb/
└── shared/
```

The API container does not receive general read/write access to `/home`, `/etc`, `/var` or the full host filesystem.

## Current workspace capabilities

Implemented foundation:

- authenticated per-user workspace
- Documents
- Images & Video
- Audio
- Downloads
- Personal
- Shared
- Trash
- folder browsing
- folder creation
- file upload
- file preview/open
- file download
- move-to-trash behavior
- restore from Trash back to Documents
- explicit confirmation for permanent deletion from Trash
- rename files and folders
- expiring high-entropy file share links
- global search across workspace filenames and calendar titles
- image thumbnails in the media area
- path traversal protection
- per-user logical separation

## Planned next layers

- file move/copy
- favorites
- file version history
- quota support
- richer gallery/timeline
- media indexing
- optional share-link passwords
- WebDAV
- SMB/NFS integration
- external backup targets
- optional object-storage synchronization

## Security model

Workspace paths are resolved against an allowlisted area root. Absolute paths, parent traversal and separator injection in item names are rejected.

The browser never receives shell access.

## N2K Drive

The product name for this built-in cloud workspace is **N2K Drive**. It is a Netfreak2k-owned UI and API layer, not a repackaged File Browser or Nextcloud UI.


## Share-link model

Share links are random URL-safe tokens stored in the local Netfreak2k database. They reference one file, expire automatically and do not expose the underlying host path. The initial implementation supports expirations from 1 hour to 30 days.

Share links are intentionally file-only in this stage; recursive public folder exposure is deferred until a separate permission model is implemented.

## Global search

The first global search layer covers:

- file and folder names in the authenticated user's workspace
- Shared
- calendar event titles

The search deliberately does not index file contents yet. Content indexing will require explicit resource limits and file-type parsers before it is enabled.
