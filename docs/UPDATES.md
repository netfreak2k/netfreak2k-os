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

- installed commit SHA
- current remote commit SHA
- whether an update is available
- last check time

Automatic checks do not install anything.

## Manual update

```bash
sudo /opt/netfreak2k/scripts/update-server.sh
```

The updater downloads the current GitHub commit, validates the archive, replaces only Netfreak2k program files and rebuilds the Netfreak2k containers.

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

A future Netfreak2k UI will expose the same check/install flow through the browser.

## Channels

Long-term channels remain:

- stable
- beta
- developer

During active development, `main` is the source used by the developer channel.
