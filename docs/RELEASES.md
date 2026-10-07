# Netfreak2k release process

Netfreak2k uses semantic versions and three update channels.

## Channels

- **Stable**: only non-prerelease GitHub releases.
- **Beta**: newest published GitHub release, including prereleases.
- **Development**: current `main` branch. This preserves the historic development workflow.

Existing development installations remain on the development channel until an administrator changes the channel in the Update Center.

## Versioning

The canonical source version lives in the repository root `VERSION` file. Runtime metadata written to `/var/lib/netfreak2k/version.json` records the installed version, channel, ref, source fingerprint and installation time.

Tags use the form `vMAJOR.MINOR.PATCH` for stable releases and prerelease suffixes such as `v0.2.0-beta.1` for beta builds.

## Promotion

A release candidate must pass the full Validate workflow before a tag or GitHub release is published. Stable releases should be promoted from a tested beta commit rather than rebuilt from unrelated source.

## Update safety

Before an update replaces `/opt/netfreak2k`, the updater stores one rollback snapshot under `/var/lib/netfreak2k/rollback`. The snapshot contains the previous source tree, environment file and version metadata. Rollback is an explicit administrator action and rebuilds the previous server stack and gateway configuration.

User data is not copied into the rollback snapshot. Persistent Docker volumes, N2K workspace data, HAOS VM data and backups remain outside the source tree.

## Release checklist

1. Full CI is green.
2. Backup/restore readiness passes on a representative host.
3. Upgrade from the previous stable version succeeds.
4. Rollback to the previous version succeeds.
5. HTTPS/local gateway and optional domain mode are verified.
6. `VERSION` and `CHANGELOG.md` are updated.
7. Create the signed/annotated version tag and GitHub release.
8. Mark prerelease for beta builds; leave prerelease off for stable builds.

## Compatibility promise

Changing the update channel never deletes user data. Stable and Beta resolve published GitHub releases; Development follows `main`. Before source replacement, the updater preserves the immediately previous program state for one explicit rollback.
