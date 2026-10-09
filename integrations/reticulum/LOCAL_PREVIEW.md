# Local preview test (development only)

From a checkout of this feature branch on a Linux machine with Python 3:

Terminal 1:
```sh
python3 integrations/reticulum/status_bridge.py
```

Terminal 2:
```sh
python3 integrations/reticulum/preview_server.py
```

Open **http://127.0.0.1:18766/** in a browser on that same machine.

- Without `rnstatus`, the UI should show **Nicht verbunden** and `not_installed`.
- With a working local Reticulum instance, it should show **Lokaler Dienst erkannt**, but **not** claim that a remote network path is established.
- The status refreshes every 15 seconds.
- The preview and adapter bind only to loopback. Do not expose them on the LAN, internet, or a public reverse proxy.
- All action buttons for chat, QR and publishing remain disabled until implemented and authenticated.

This preview is not integrated into the production OS web backend. Production integration requires existing login/session protections, tests and a controlled release. No live-host test was performed by this commit.
