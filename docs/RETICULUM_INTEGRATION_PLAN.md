# Reticulum integration — implementation contract (draft)

Status: design / implementation pending. This document does **not** imply a working release.

## Product contract
- Reticulum is bundled as an **optional**, disabled-by-default feature of Netfreak2k Server-OS.
- Only authenticated OS dashboard users can access the Reticulum UI. No guest/public HTTP pages.
- On first enable: choose a public display name, generate a local cryptographic Reticulum identity, persist it securely and offer encrypted backup/recovery. The name is **not** the source of the address; addresses are derived from cryptographic keys.
- Connect automatically via supported local interfaces and configured, reachable Reticulum bootstrap peers. Never promise connectivity without an actual peer/path.
- Offer explicit, separate opt-in to run a Reticulum transport node, with resource/bandwidth explanation and ability to switch off.
- LXMF chat is primary UI. Display identity/profile, QR contact exchange, contacts, delivery state and a small real-data Living Mesh preview that expands on demand. On mobile, chat has priority.
- The QR payload may contain public contact/destination information only; never private identity keys.
- Reticulum-only personal pages: editor, preview, publish and Reticulum-native viewer. No public internet HTTP bridge.
- Future: file-manager “Send via Reticulum”, resumable transfer, offline delivery via compatible propagation infrastructure, optional voice on adequate-bandwidth paths.

## Delivery phases
1. **Discovery**: inspect existing web/API/auth/job/service architecture, identify Reticulum and LXMF dependencies and test environment; record compatibility matrix.
2. **Service**: disabled-by-default managed runtime, identity lifecycle, encrypted export, bootstrap peer configuration, health and reconnection, safe host permissions.
3. **Authenticated API**: CSRF/session enforcement, explicit opt-in to transport, audited mutations, connection status and telemetry.
4. **UI**: dashboard tile, three-step setup, profile/QR, LXMF conversations and responsive Living Mesh preview; no fabricated topology.
5. **Reticulum web**: implement compatible Reticulum-native page hosting/viewer (evaluate Nomad Network conventions), safe content/editor/publish, no ordinary-web exposure.
6. **Hardening**: integration tests, rollback/backup validation, upgrade migration, resource limits, documentation and release gate.

## Acceptance checks
- Fresh installation leaves Reticulum off and creates no network listener.
- First enable provisions a usable local identity; reboot retains the same identity and address.
- Restoring an exported identity preserves the address; changing the display name does not change it.
- Unauthenticated access to profile, QR, chat, web editor and telemetry is rejected.
- Transport forwarding is off unless separately enabled; disabling it does not delete identity or chat history.
- With a known reachable peer, connection establishes without manual address entry; without one, UI reports a truthful disconnected state.
- Chat send/receive and delivery status tested against a second compatible node.
- QR imports a contact in a compatible client without disclosing secret material.
- Network visualization renders only observed peers/links, with clear distinction between observed and inferred state.
- Reticulum pages cannot be fetched through the public HTTP gateway.
- Existing N2K backup, updater, monitoring and mobile navigation pass regression tests.

## Safety constraints
Do not modify production services, overwrite Reticulum keys, publish a release, or enable transport on user machines without validated migration and explicit user action. Keep this work isolated in a feature branch until tested.
