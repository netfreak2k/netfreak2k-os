# Reticulum release gate — 2026-10-09

**Current verdict: NOT RELEASE READY.** This is a feature branch, not a validated production release.

## Mandatory before publishing a stable release

- [ ] GitHub Actions test run completed successfully for the exact release commit.
- [ ] Run Python compile checks, unit tests, Docker Compose config validation, image builds and module-import smoke tests.
- [ ] Test clean installation on disposable Linux Mint/Ubuntu host.
- [ ] Test upgrade with a backup of existing `netfreak2k-reticulum-lan-data` and `netfreak2k-messenger-data` volumes; verify original identity and message history unchanged.
- [ ] Test Messenger connection to LAN TCP port 4243 after upgrade, including restart.
- [ ] Validate the new **manual host-only controller** on a disposable Linux host (dry-run, start, stop, legacy transport, multi-user, restart). Do not expose it through the web API or run it on production yet.
- [ ] Confirm explicit per-user activation, multi-user behavior, disable/restart and transport opt-in.
- [ ] Implement LXMF delivery callbacks/status persistence and verify queued vs sent vs delivered on two real peers.
- [ ] Complete secure identity backup/restore, QR, and mobile UI testing.
- [ ] Document rollback and restore procedures; take a verified backup before deploy.
- [ ] Only after all gates pass: publish release notes, tag a release candidate, get explicit deployment approval.

## Beta integration checklist (updater)

- [ ] Identify the existing OS updater release manifest and its signing/rollback semantics.
- [ ] Add an explicit opt-in beta channel; never publish this branch as stable.
- [ ] Wire a host-agent allowlisted lifecycle action, including authorization, CSRF, audit and runtime-state feedback.
- [ ] Persist explicit activation across Compose updates without overwriting RNS identities.
- [ ] Verify end-to-end tests on a disposable host before showing an Update available badge.

## Read-only beta preflight

Run `python3 integrations/reticulum/beta_preflight.py` on a disposable test host before considering an upgrade. It resolves the Docker Compose project from the exact managed container and inspects its two project-prefixed persistent volumes without changing them. When the container is absent, the project cannot be inferred safely: the preflight returns HOLD and a clean-install inventory is required. An existing volume requires an independently verified identity and data backup. A reported `review_required` state is **not deployment authorization**: legacy transport, port conflicts, live peer checks, rollback, and manual controller approval still need validation. The preflight never issues Docker start, stop or compose commands.

## Known limitations

The preview uses the existing Messenger API. Its send action is admin-only, CSRF protected, and returns *queued*, not delivered. Activation requests are stored, and an admin-only read-only multi-user activation plan is available. A separate **host-only, dry-run-first controller** exists in source, but is not installed, scheduled, connected to the UI, or production-tested. Its client start command is opt-in for that invocation; Compose upgrades may revert to disabled until persistence is designed. Existing persisted RNS configurations missing the Messenger LAN port now fail closed instead of being silently rewritten. The new Reticulum website editor is not implemented. No production installation has been changed.

## Publication options

A clearly marked **source-only development preview** may be shared without deploying, but must not be described as production-ready or as a stable OS release. Stable publication requires the gates above.
