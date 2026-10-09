> Architecture decision (2026-10-09): Tor is a completely separate non-exit relay service. MeshLink / Reticulum Shadow Nodes use only direct TCP and LAN discovery. No SOCKS5 bridge or onion peer support is part of Shadow Nodes. The independent Tor relay is controlled via the existing /tor/relay API.

# N2K Shadow Nodes — design and rollout

Status: design only; NOT enabled on production hosts.

## Existing runtime
- server/reticulum-lan/service.py: host-network RNS AutoInterface and TCP server :4243.
- server/messenger/service.py: LXMF identity, peer announcements, local TCP uplink, messenger status API.
- Preserve separate state volumes and identities; do not create a competing RNS daemon.

## Goals
1. Shadow nodes: opt-in transport relay using RNS (not a new cryptographic protocol).
2. LAN autodiscovery via RNS AutoInterface; remote discovery via explicit trusted bootstrap peers, never arbitrary unauthenticated internet scanning.
3. Automatic reconnect/backoff for configured endpoints, with jitter and connection caps.
4. Optional Tor .onion transport; no onion or clearnet WAN exposure by default.
5. Clear metrics differentiating discovered destinations, known paths, live interfaces, and LXMF delivery acknowledgements.
6. Store-and-forward only when LXMF propagation is deliberately configured, not implied by RNS routing.

## Configuration contract (proposal)
- shadow.enabled=false
- shadow.allow_relay=false
- shadow.autoconnect=true for LAN, false for external untrusted peers
- shadow.bootstrap_peers=[] (explicit operator-managed entries)
- shadow.peer_approval=required for externally learned endpoints
- shadow.max_outbound=6
- shadow.reconnect_min_seconds=5
- shadow.reconnect_max_seconds=300
- tor.enabled=false
- tor.publish_onion=false
- tor.socks_endpoint=127.0.0.1:9050 (only if Tor provisioned on matching network namespace)

## Tor design
Tor is NOT equivalent to a SOCKS-capable RNS TCPClientInterface. Use an audited forwarding adapter that establishes a Tor SOCKS5 CONNECT tunnel to an explicitly trusted .onion destination, and exposes a loopback TCP endpoint for RNS. A Tor onion service, if opted in, forwards only to the local RNS transport listener. Onion private keys live in dedicated 0700 persistent volumes and never in git or logs. Never silently fall back from onion to clearnet.

## UI / API
- New page under MeshLink: Shadow Nodes, showing settings, known/trusted peers and transport health.
- Per-peer badges: Discovered, Route known, TCP connected, Tor connected, Last seen.
- Actions: enable, approve/revoke, reconnect, diagnostics, enable Tor (explicit confirmation).
- Expose only authenticated, CSRF-protected N2K API paths; internal messenger HTTP stays on private container network.
- Never report a route as a verified live connection.

## Rollout
1. Unit tests for config validation, input bounds, peer approval, safe defaults.
2. Compose integration tests to keep all external listener ports closed by default; validate existing LAN path.
3. Tor adapter and hidden-service integration tests with two isolated Tor test instances.
4. API and UI, metrics, telemetry disabled by default.
5. Canary on one host, verify LAN, Tor mode, reconnect after container restart, failure recovery.
6. Deploy through normal N2K preflight and backup process.

## Security invariants
- Do not turn on relay, port forwarding, Tor, or onion publication implicitly.
- Public node enrollment must be operator-controlled or cryptographically authenticated.
- Reticulum encryption does not hide clearnet IP addresses; Tor is optional for anonymity and adds latency.
- Limit peer count, API payloads, discovery rates and logs to prevent resource exhaustion.
- Never overwrite user-created RNS interfaces when updating the managed sections.
