# Reticulum activation: compatibility gate (development branch)

## Existing dependency
The existing `netfreak2k-messenger` service is configured with
`N2K_LAN_TRANSPORT_HOST=host.docker.internal`. The original
`netfreak2k-reticulum-lan` service exposes a TCPServerInterface on
port 4243. The new opt-in service implementation currently does **not**
create that TCP server. This is a **breaking compatibility risk**.

Do not deploy the current feature branch as an OS update. Existing messenger
connectivity must be measured and the LAN service contract preserved or
migrated in a tested, reversible release.

## Start/stop implementation prerequisites
1. Inventory the messenger's actual RNS/LXMF connection logic and verify
   whether it depends on the host TCP interface and its port.
2. Define a single system-wide runtime owner. Multiple OS users may opt in;
   an individual user's disable action must not stop a shared active runtime.
3. Keep the OS API free of Docker socket access. Use a dedicated, narrowly
   scoped privileged controller with explicit commands and authorization.
4. Reconcile user preferences, legacy RNS configuration, and container state
   before any action. Reject unknown states and transport mode until a
   dedicated migration and consent flow is implemented.
5. Preserve and back up /state/rns identities/config. Never overwrite
   existing keys, configuration, or transport mode silently.
6. Test client start, stop, restart, legacy upgrade, messenger compatibility,
   failure recovery, and multi-user contention on a disposable test system.
7. Only then expose an activation button that reports **applied** instead
   of merely **requested**.

## Current behavior
The UI and API persist per-user **requested** settings. The service has
environment-controlled opt-in, but there is no authorized reconciler and
no verified messenger compatibility. Status reflects only the local runtime;
remote path connectivity and LXMF delivery remain unverified.

## Verified from source inspection (2026-10-09)
- `server/messenger/service.py` explicitly adds `[[N2K LAN Transport]]`
  with `TCPClientInterface`, `target_host = host.docker.internal`, and
  `target_port = 4243` whenever `N2K_LAN_TRANSPORT_HOST` is nonempty.
- `server/docker-compose.yml` sets that environment variable unconditionally.
- The previous LAN service configured `TCPServerInterface` on port 4243.
  The feature-branch replacement currently has **no** matching server.
  This is a confirmed configuration incompatibility, though no live outage
  has been measured.
- The Messenger already has an LXMF identity at `/state/identity`, an
  `LXMRouter`, `/messages`, `/contacts`, `/peers`, and `/status`.
  Avoid creating a second independent identity/router until the intended
  per-user model is designed and existing messages are preserved.
- Messenger `/node` toggles its own transport mode; it is separate from
  the new per-user Reticulum preference. Reconcile both controls explicitly.

## Decision
**Block runtime rollout** until the port-4243 contract and existing
Messenger behavior are covered by an integration test. Continue building
the new UI against authenticated API routes without switching live
containers. No network connectivity was verified by source inspection.
