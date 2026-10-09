# Reticulum release gate — 2026-10-09

**Current verdict: NOT RELEASE READY.** This is a feature branch, not a validated production release.

## Mandatory before publishing a stable release

- [ ] GitHub Actions test run completed successfully for the exact release commit.
- [ ] Run Python compile checks, unit tests and Docker Compose config validation.
- [ ] Test clean installation on disposable Linux Mint/Ubuntu host.
- [ ] Test upgrade with a backup of existing `netfreak2k-reticulum-lan-data` and `netfreak2k-messenger-data` volumes; verify original identity and message history unchanged.
- [ ] Test Messenger connection to LAN TCP port 4243 after upgrade, including restart.
- [ ] Implement and test a restricted activation controller (no Docker socket exposed to web API).
- [ ] Confirm explicit per-user activation, multi-user behavior, disable/restart and transport opt-in.
- [ ] Implement LXMF delivery callbacks/status persistence and verify queued vs sent vs delivered on two real peers.
- [ ] Complete secure identity backup/restore, QR, and mobile UI testing.
- [ ] Document rollback and restore procedures; take a verified backup before deploy.
- [ ] Only after all gates pass: publish release notes, tag a release candidate, get explicit deployment approval.

## Known limitations

The preview uses the existing Messenger API. Its send action is admin-only, CSRF protected, and returns *queued*, not delivered. The new activation preference is stored but not applied. Existing persisted RNS configurations missing the Messenger LAN port now fail closed instead of being silently rewritten. The new Reticulum website editor is not implemented. No production installation has been changed.

## Publication options

A clearly marked **source-only development preview** may be shared without deploying, but must not be described as production-ready or as a stable OS release. Stable publication requires the gates above.
