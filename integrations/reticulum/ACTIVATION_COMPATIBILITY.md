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
