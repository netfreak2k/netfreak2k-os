# Backup and Recovery

Netfreak2k OS separates the public operating system from the user's private workspace state.

The goal is simple: after a device, SSD or installation failure, a user should be able to reinstall Netfreak2k OS and restore the last authorized private state without rebuilding the desktop manually.

## What belongs to the public OS

- operating-system files
- desktop components
- themes and public assets
- N2K AI Dashboard framework
- N2K Terminal
- system applications
- update and recovery tools

These components come from the public Netfreak2k OS repository and releases.

## What belongs to the private workspace

Examples:

- dashboard layout
- user preferences
- project links
- personal configuration
- radio favorites
- terminal preferences
- desktop and dock layout
- selected applications
- user files if explicitly included
- browser bookmarks/preferences if explicitly included

## Secrets

Secrets must not be committed to the public repository.

Examples:

- passwords
- cookies
- authentication tokens
- API keys
- Wi-Fi credentials
- Tailscale auth keys
- private keys

If secrets are included in a recovery bundle, that bundle must use encrypted storage with explicit user authorization.

## Recovery flow

```text
Hardware or SSD failure
        ↓
Install current Netfreak2k OS image
        ↓
Complete minimum network/login setup
        ↓
Open Recovery Assistant
        ↓
Select authorized private backup
        ↓
Verify backup
        ↓
Restore user state
        ↓
Restart affected services/session
        ↓
Return to last saved workspace state
```

## Backup targets

The architecture should support more than one target:

- local external USB drive
- NAS / network share
- encrypted archive
- private Git repository for text configuration where appropriate
- user-selected remote storage in future

Binary user data and secrets should not be forced into Git.

## Backup generations

Recovery should support multiple generations rather than only one overwriteable backup.

Suggested policy:

- latest manual backup
- latest successful pre-update snapshot
- several rotating historical snapshots

## Update integration

Before major system updates:

1. validate free space
2. create or verify a recovery point
3. install the update
4. run health checks
5. keep the previous recovery point until the new version is confirmed healthy

## Portability

Private workspace data should be versioned independently of the OS where possible so that a workspace can move from Pi 3 to Pi 4, Pi 5 or another supported Netfreak2k OS device.
