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
| Certbot / Let's Encrypt client | TLS certificate automation | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| OpenSSL | TLS/crypto tooling | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| Avahi | mDNS / local service discovery | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| nmap | LAN discovery / service analysis | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| arp-scan | LAN device discovery | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| smartmontools | SMART disk diagnostics | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| PipeWire / WirePlumber | Host audio routing / Media Center | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| BlueZ | Bluetooth host integration | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| curl / ca-certificates / xz-utils / iputils | Installer, download and network runtime tooling | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| OVMF / virt-install | UEFI and VM provisioning support | Installed from the host distribution; exact packaged license/NOTICE metadata is authoritative |
| Mutagen 1.47.0 | Audio metadata parsing inside the API container | Python package installed from PyPI; upstream package metadata and bundled license text are authoritative |


## v1.0 dependency inventory review

For the **1.0.0-rc1** feature freeze, this register was cross-checked against:

- packages installed by `install.sh`,
- Python packages installed by `server/api/Dockerfile`,
- the managed application catalog in `host/vm-agent.py`.

This is an engineering dependency-inventory review, not legal advice. Distribution-time obligations remain governed by the exact upstream/package licenses and notices shipped by each dependency.

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


## N2K Sync implementation

The WebDAV and CalDAV server paths are implemented directly in Netfreak2k-owned source code using the existing Python standard library and NGINX reverse proxy.

No new third-party DAV server, calendar server, font, icon set or binary dependency is introduced by this feature.

WebDAV and CalDAV are open interoperability standards/protocol families; implementing those protocols does not add a software dependency license to this repository.


## N2K wallpaper collection

The ten wallpapers under `dashboard/assets/wallpapers/` are original AI-generated visual assets created specifically for Netfreak2k Server-OS in this project workflow.

They are not sourced from Apple, Microsoft, Linux Mint, commercial wallpaper packs, stock-photo libraries or other third-party operating-system artwork.

No third-party logo, proprietary operating-system wallpaper, proprietary font or copied UI asset is intentionally included in this collection.

The collection is treated as Netfreak2k project artwork rather than a third-party runtime dependency. The repository-wide public license is still to be selected separately before a stable public release.


## ipwho.is network metadata

Netfreak2k may query the public ipwho.is HTTPS service to display the server's public IP, ISP/provider, ASN and country in the Network module.

No ipwho.is software is redistributed or bundled. The request necessarily exposes the server's public source IP to that service. Results are cached for 15 minutes to limit requests.

This lookup exists only for WAN identity/status display. Netfreak2k does not send workspace content, credentials, calendar data or other user content in the request.

## ONLYOFFICE Docs Community

Optional catalog application: `onlyoffice/documentserver:9.4.0.1`

Upstream: ONLYOFFICE DocumentServer / Ascensio System SIA.

License: GNU Affero General Public License v3.0 (AGPL-3.0) with the upstream additional terms and notice requirements.

Netfreak2k does not modify or rebrand the ONLYOFFICE editor engine and does not claim ownership of ONLYOFFICE trademarks. The product name is used only to identify the optional interoperable editor engine.

The app is not installed by default. Installation is initiated explicitly by the user from the N2K Office/App catalog. The upstream editor UI and its legal notices remain intact.

Upstream source and license:
- https://github.com/ONLYOFFICE/DocumentServer
- https://github.com/ONLYOFFICE/DocumentServer/blob/master/LICENSE

The Community Edition is resource-intensive relative to the Netfreak2k core. Netfreak2k therefore treats it as optional rather than a mandatory runtime dependency.


## Kasm Tor Browser

Optional catalog application: `kasmweb/tor-browser:1.18.0`

Publisher: Kasm Technologies.

Purpose: run an isolated Tor Browser session that can be viewed from the Netfreak2k web UI through KasmVNC.

The image is not installed by default. Installation requires explicit user confirmation and a user-chosen access password.

Kasm publishes its Workspaces images and KasmVNC source publicly. KasmVNC is distributed under GPL-family terms; Tor Browser itself is built from upstream Tor/Mozilla components with their respective open-source licenses. Netfreak2k does not modify the Tor Browser branding or claim affiliation with Kasm Technologies or the Tor Project.

Upstream references:
- https://hub.docker.com/r/kasmweb/tor-browser
- https://github.com/kasmtech/workspaces-core-images
- https://github.com/kasmtech/KasmVNC
- https://www.torproject.org/
