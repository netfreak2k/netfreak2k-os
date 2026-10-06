# Third-Party Notices and License Register

This register tracks software currently used, installed, downloaded or offered by Netfreak2k Server-OS.

It is a compliance inventory, not a replacement for the upstream license texts. When redistributing binaries or source, the applicable upstream license/NOTICE requirements must also be satisfied.

## Netfreak2k project code

The repository currently does **not** declare a final project-wide public license. Until a project license is explicitly selected and committed, do not assume permission to redistribute Netfreak2k-owned source code beyond the permissions granted by applicable law.

A final project license must be selected before a public stable release.

## Runtime / platform dependencies

| Component | Role | Upstream license / note |
|---|---|---|
| Linux Mint / Ubuntu packages | Host operating system and packages | Mixed free/open-source licenses. Individual package metadata is authoritative. Netfreak2k installs packages from the host distribution rather than relicensing them. |
| Docker Engine / Moby | Container runtime | Apache License 2.0 |
| QEMU | Virtualization | QEMU emulator as a whole: GNU GPL v2; individual bundled components/files may carry compatible licenses |
| libvirt | Virtualization management | LGPL-2.1 / GPL-2.0 components; individual source files/package metadata are authoritative |
| Python | Netfreak2k API/runtime tooling | Python Software Foundation License Version 2; bundled portions may have additional compatible licenses |
| NGINX Open Source | Web frontend / reverse proxy | BSD-like 2-clause license |
| socat | Home Assistant host proxy | GPL family; distribution/package metadata must be checked for the exact packaged version |
| Home Assistant Operating System | Managed Home Assistant VM | Apache License 2.0 for the Home Assistant OS repository; the image contains many separately licensed components |
| Uptime Kuma | Optional managed app | MIT License |

## Removed from new installations

### File Browser

File Browser was previously present as an optional catalog entry under Apache License 2.0.

The upstream repository is archived and no longer receives security fixes. For that reason, Netfreak2k no longer offers it for new installations. Existing user installations are not automatically removed.

Netfreak2k now uses its first-party N2K Drive workspace instead.

## Trademarks

Third-party product names are used only to identify interoperability or dependencies.

Home Assistant, Docker, QEMU, Linux Mint, Ubuntu, Python, NGINX, Uptime Kuma, Apple, macOS and other names may be trademarks of their respective owners.

Netfreak2k Server-OS is not presented as being sponsored, endorsed or produced by those third parties.

## Compliance rule for new dependencies

Before adding a dependency:

1. identify the exact upstream project,
2. record its license,
3. check redistribution and NOTICE/attribution obligations,
4. confirm that its license is compatible with the intended Netfreak2k distribution model,
5. prefer maintained projects,
6. document security/support status,
7. update this file in the same change.
