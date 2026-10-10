# Reticulum / LXMF – first-run baseline (2026-10-10)

Status: **candidate**, pending clean-install testing. The live N2K server has demonstrated Retichat (iOS) → N2K LXMF reception and N2K → Retichat delivery, but the updated GitHub source has not yet been verified on a fresh host.

## Intended zero-manual-configuration behavior

- Standard `docker compose` deployment starts the host-network LAN transport (TCP 4243) before the messenger.
- Messenger connects to `host.docker.internal:4243`, initializes /state/rns and /state/lxmf, persists its identity in `/state/identity` and announces its LXMF delivery destination.
- Messenger's built-in API is private to the N2K Docker network (8091). TCP 4242 is loopback-only.
- First boot must generate a **unique identity per installation**. Never commit, distribute or clone Docker volumes, private identity files, or messaging state.
- N2K RNS Network Hub should display status, contacts, messages and error states without command-line setup.
- Send tracking uses an internal random record key, not `LXMessage.hash` before it is initialized.
- Announcements are repeated at 15-minute intervals; incoming and internal send exceptions are logged.

## Install verification

Run `bash scripts/check-lxmf.sh` from the repository root after installation. Then connect an iOS Retichat client to `<N2K-server-LAN-IP>:4243`, import the destination shown in RNS Network Hub and verify an incoming and outgoing message including the receiving device's confirmation.

The check is read-only; it does not send messages, create identities or restart services.

## Release gates before merging to main

1. Run `python3 -m py_compile server/messenger/service.py` (or compile in memory to avoid permissions errors).
2. Validate `docker compose -f server/docker-compose.yml config`, image build, startup and persisted state across restart.
3. Clean install with empty volumes: verify unique identity, healthy service, TCP 4243 and both message directions.
4. Existing install upgrade: verify the old identity and message archive survive.
5. Check that errors are visible but private keys and message content are not printed in routine logs.
6. Confirm API status is accessed via authenticated N2K OS UI; direct unauthenticated API calls may return HTTP 401.

Do **not** expose messenger API port 8091 to the public Internet. The TCP 4243 LAN transport requires normal network access/firewall policy; LAN discovery and external routing are not guaranteed.

## Validation evidence from live server

- Incoming record: `Test 004`
- Outgoing record: `antwort 006`, LXMF status `delivered`, user confirmed visible in Retichat
- Shared Reticulum instance with TCP client connected to LAN host port 4243
- Container restart policy `unless-stopped`

These are field-test observations, **not** evidence that fresh-install automation has passed.
