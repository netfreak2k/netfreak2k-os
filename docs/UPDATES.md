# Update Model

Netfreak2k pulls its own software updates from the public GitHub repository:

`netfreak2k/netfreak2k-os`

## Development workflow

The intended development loop is:

```text
ChatGPT development
      ↓
commit to GitHub
      ↓
Netfreak2k checks GitHub
      ↓
new commit available
      ↓
user approves update
      ↓
Netfreak2k code is replaced
      ↓
containers/services restart
```

## Automatic checks

A systemd timer checks GitHub every six hours.

It records:

- installed branch-archive SHA-256 fingerprint
- current remote branch-archive SHA-256 fingerprint
- whether an update is available
- last check time

Automatic checks do not install anything.

## Manual update

```bash
sudo /opt/netfreak2k/scripts/update-server.sh
```

The updater downloads the current GitHub branch archive, validates it, records its SHA-256 fingerprint, replaces only Netfreak2k program files and rebuilds the Netfreak2k containers. The same archive endpoint is used for update checks, so update detection does not depend on the GitHub REST API.

It preserves:

- Linux Mint
- Home Assistant OS VM
- HAOS virtual disk
- Netfreak2k Docker volumes
- Netfreak2k admin data
- local server port configuration

## Safety rule

Updates are never installed automatically.

The user must explicitly approve installation.

The Netfreak2k UI exposes this flow through the browser. “Neu prüfen” performs an immediate archive-fingerprint check. “Jetzt aktualisieren” still requires explicit user approval.

## Channels

Long-term channels remain:

- stable
- beta
- developer

During active development, `main` is the source used by the developer channel.

## Live progress reporting

The updater writes its current installation state to:

```
/var/lib/netfreak2k/update-progress.json
```

The file is updated atomically as the updater advances through:

- prepare
- download
- extract
- validate
- install
- services
- containers
- restart
- verify
- completed / failed

The browser Update Center reads this host-side status through the authenticated Netfreak2k API and displays the real updater percentage, current phase, installed and remote fingerprints, last check time, installation time and GitHub source.

The progress indicator is not a synthetic animation: it reflects explicit milestones emitted by `scripts/update-server.sh`.

