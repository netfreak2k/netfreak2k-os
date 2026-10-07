# Changelog

All notable Netfreak2k Server-OS changes are recorded here.

## 0.2.0-beta.1 — 2026-10-07

First product-hardening beta line.

### Added
- System Health monitoring with history, SMART and temperature telemetry.
- Persistent notification center with optional desktop notifications.
- Backup & Recovery 2.0 with schedules, retention, integrity and restore-readiness tests.
- Multi-user Admin / Operator / Viewer roles, TOTP 2FA, session controls and audit logging.
- Managed Nginx HTTPS gateway with local TLS and optional Let's Encrypt domain mode.
- Rich home-network inventory and media-center status improvements.

### Release policy
- `development` tracks the current `main` branch.
- `beta` tracks the newest non-draft GitHub release, including prereleases.
- `stable` tracks the newest non-prerelease GitHub release.
- Updates create one local rollback snapshot before replacing the running source tree.
