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

- [x] GitHub Actions Validate workflow completes successfully on the release commit (`b550f58d`, Validate run 472)
- [ ] Fresh install smoke test on supported amd64 Linux Mint/Ubuntu host
- [ ] Upgrade smoke test from an existing Netfreak2k installation
- [ ] Backup verification and restore-test pass on a real installation
- [ ] Home Assistant OS provisioning/startup verified after fresh install
- [ ] HTTPS local gateway verified on ports selected by installer
- [ ] Mobile UI pass on phone-sized viewport
- [ ] Project-wide license for Netfreak2k-owned code selected and committed
- [ ] THIRD_PARTY_NOTICES.md reviewed for shipped runtime/app dependencies
- [ ] Stable VERSION changed from 1.0.0-rc1 to 1.0.0
- [ ] Stable release/tag created only after the gates above are complete

## Release policy

Do not label a build as stable merely because the feature set is complete. A stable v1.0 requires a passing validation workflow, a real-host installation/upgrade smoke test, a verified recovery path and an explicit project license.
