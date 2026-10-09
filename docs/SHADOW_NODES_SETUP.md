# Shadow Nodes (experimental)

Implementation branch: `feature/shadow-nodes-design`. **Not automatically deployed.**
This first stage implements persistent remote Reticulum transport peer configuration,
local RNS autodiscovery (already present), and a Tor SOCKS5 tunnel for optional .onion peers.
Dashboard config controls and authenticated API are present; peer approval workflow,
onion publishing, automatic LAN-container restart and validated live connection metrics
are not implemented yet. Do not treat this as a finished release.

## Configure

The host-network LAN transport container mounts named volume
`netfreak2k-reticulum-lan-data` at `/state`. Create
`/state/shadow-nodes.json` in that volume (e.g. using a one-off container with
the volume mounted). Never put private keys or personal node locations into git.

Example (replace all peer hosts with nodes you control or trust):

```json
{
  "enabled": true,
  "tor_enabled": false,
  "peers": [
    {"transport": "tcp", "host": "trusted-peer.example.net", "port": 4243}
  ]
}
```

Then restart *only* `netfreak2k-reticulum-lan`. The Reticulum TCP client
maintains and reconnects configured peer connections; local peers are
discovered through AutoInterface. Internet-wide unknown peers are never
automatically trusted or scanned.

## Tor mode (explicit opt-in)

Run a dedicated Tor client on the **host** with SOCKS5 bound to
`127.0.0.1:9050`. This is not installed or started automatically.
The optional bridge opens a local ephemeral TCP port and translates
Reticulum TCP traffic into a Tor SOCKS5 CONNECT request for a v3
`.onion` endpoint:

```json
{
  "enabled": true,
  "tor_enabled": true,
  "socks_host": "127.0.0.1",
  "socks_port": 9050,
  "peers": [
    {"transport": "tor", "host": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion", "port": 4243}
  ]
}
```

The example onion is a placeholder, not a reachable endpoint. A remote
operator must separately configure an onion service leading to their
Reticulum TCP server. The SOCKS forwarder does **not** downgrade
failed onion connections to normal TCP.

## Safety and limitations

- Default configuration connects to no remote peers and has Tor off.
- Previous LAN server listener `:4243` remains unchanged. Check your
  host firewall; the existing listener binds all host interfaces.
- Peer configuration is startup-only. A change requires container restart.
- If an RNS configuration contains custom interfaces, it is preserved
  rather than overwritten; that means new Shadow settings will *not* apply
  until the configuration is carefully migrated.
- This stage does not verify TCP health, onion anonymity, LXMF delivery,
  or successful Tor circuit creation.
- No automatic Tor installation, onion publication, NAT configuration,
  port forwarding, or unsolicited internet exposure is performed.
- Tor only protects the Onion transport leg; simultaneous public TCP
  interfaces reveal the host IP to their remote peers.
- Test with `python -m unittest discover -s server/reticulum-lan -p 'test_*.py'`
  after installing requirements or in an isolated Python environment.

## Next milestones

Dashboard settings and CSRF-protected management API have been added. Persisted
settings currently require a manual restart of the LAN container. Onion service
provisioning, connection health checks and end-to-end tests remain required before
merging into the stable release.
