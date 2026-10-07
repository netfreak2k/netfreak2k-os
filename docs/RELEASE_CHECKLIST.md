# Netfreak2k Server-OS v1.0 Release Checklist

Target candidate: **1.0.0-rc1**

## Code freeze

- [x] Major v1.0 feature work complete
- [x] Update preflight and verified pre-update backup gate implemented
- [x] Recovery Center implemented with bounded admin actions
- [x] Logs & Events center implemented
- [x] Jobs & Scheduler center implemented
- [x] Security, remote access, monitoring, virtualization, storage and network 2.0 blocks integrated

## Required before 1.0.0 stable

- [x] GitHub Actions Validate workflow completes successfully on the current RC head (`e10da010`, Validate run 488)
- [ ] Fresh install smoke test on supported amd64 Linux Mint/Ubuntu host
- [ ] Upgrade smoke test from an existing Netfreak2k installation
- [ ] Backup verification and restore-test pass on a real installation
- [ ] Home Assistant OS provisioning/startup verified after fresh install
- [ ] HTTPS local gateway verified on ports selected by installer
- [ ] Mobile UI pass on phone-sized viewport
- [ ] Project-wide license for Netfreak2k-owned code selected and committed (decision aid: `docs/LICENSE_DECISION.md`)
- [x] THIRD_PARTY_NOTICES.md reviewed against installer, API container dependencies and managed app catalog
- [ ] Stable VERSION changed from 1.0.0-rc1 to 1.0.0
- [ ] Stable release/tag created only after the gates above are complete

## Real-host verification

On the release-candidate host, run:

```bash
sudo /opt/netfreak2k/scripts/release-gate.sh
```

A clean `RESULT: PASS` covers service state, local API/HTTPS reachability, HAOS VM presence, backup presence, installed-version metadata and required timers. It complements, but does not replace, the fresh-install and upgrade smoke tests.

## Release policy

Do not label a build as stable merely because the feature set is complete. A stable v1.0 requires a passing validation workflow, a real-host installation/upgrade smoke test, a verified recovery path and an explicit project license.


## Current remaining blockers

The codebase and current release-readiness UI are validated on GitHub Actions. The remaining stable-release gates are external to CI:

1. **Fresh-install smoke test** on a supported amd64 Linux Mint/Ubuntu host.
2. **Upgrade smoke test** from an existing Netfreak2k installation.
3. **Real backup/recovery verification** on the target host.
4. **Home Assistant OS startup verification** on the target host.
5. **HTTPS gateway verification** on the installer-selected ports.
6. **Mobile UI pass** on a phone-sized browser.
7. **Explicit Netfreak2k project license decision** and committed LICENSE file.

The in-product Recovery Center now exposes the technical host-readiness checks so these can be verified without relying on terminal-only workflows.
