# Reticulum: first live-service adapter

The initial integration is **read-only**. It calls the installed `rnstatus` command with a four-second timeout and returns a small JSON health snapshot.

## Local development

Prerequisites: Python 3 and a separately installed/configured Reticulum runtime exposing `rnstatus`.

```sh
python3 integrations/reticulum/status_bridge.py
curl -fsS http://127.0.0.1:18765/status
```

The bridge binds **only to 127.0.0.1**. Do not expose this endpoint via the public Nginx gateway. When connecting the OS web UI, proxy it through the existing authenticated application backend with its session and permission checks. Do not configure an unauthenticated public reverse proxy.

`available=true` means `rnstatus` succeeded locally, **not** that a remote peer is reachable. The `connected` field is deliberately null until remote-path verification is implemented. The status endpoint does not create an identity, start a daemon, connect to bootstrap peers, enable transport, or send messages.

## Next integration milestones

1. Identify the real OS backend route and authentication/CSRF conventions.
2. Wire an authenticated backend status route to this local adapter.
3. Add identity provisioning and secure recovery, only after designing permissions and key storage.
4. Add optional interface/bootstrap configuration and explicit transport opt-in.
5. Integrate LXMF with real contact and delivery state; only then enable chat UI.
6. Add Reticulum-native page hosting/editor after format and security validation.

No stable release or production deployment is included in this change.
