# Update Model

Netfreak2k OS uses signed release metadata/artifacts as the long-term public update model.

## Channels

- **stable** — normal daily-driver use
- **beta** — preview testing
- **developer** — active development

Users may switch channels in system settings.

## User experience

When a new release is available, Netfreak2k OS shows:

- installed version
- available version
- concise changelog
- release channel
- reboot requirement
- Details / Later / Install actions

Updates may be downloaded automatically in the background, but installation requires user approval.

## Installation flow

```text
Check release source
      ↓
New version?
      ↓
Background download
      ↓
Notify user
      ↓
User approves installation
      ↓
Verify checksum / signature
      ↓
Create recovery point
      ↓
Install
      ↓
Health checks
      ↓
Success or rollback
```

## Recovery rule

Major system updates should create a recovery point before installation whenever the storage/filesystem configuration supports it.

## Release integrity

Stable releases should provide:

- checksums
- signed release metadata or signed artifacts
- reproducible build information where practical

## Secrets

GitHub tokens, Tailscale credentials, API keys and user secrets are runtime configuration only and must never be included in public releases or committed source.
