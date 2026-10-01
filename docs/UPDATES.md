# Update Model

Netfreak2k OS uses GitHub Releases as the public update source.

## Channels

- **stable** — normal users
- **beta** — preview users
- **developer** — active development

## User experience

When a new release is available, Netfreak2k OS shows:

- installed version
- available version
- concise changelog
- release channel
- expected reboot requirement
- buttons for Details, Later and Install

Silent installation is not the default.

## Installation flow

```text
Check GitHub release
      ↓
New version?
      ↓
Notify user
      ↓
User approves
      ↓
Download artifact
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

## Release integrity

Stable releases should provide checksums and, before public stable deployment, signed release metadata or artifacts.

## Secrets

GitHub tokens, Tailscale credentials and user secrets are runtime configuration only and must never be included in public releases or committed source.
