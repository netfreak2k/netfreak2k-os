#!/usr/bin/env python3
"""N2K Reticulum LAN runtime: opt-in and status-only bridge to OS API."""
import json
import os
import time
from pathlib import Path

STATE = Path("/state")
STATE.mkdir(parents=True, exist_ok=True)
STATUS = STATE / "status.json"
ENABLED = os.environ.get("N2K_RETICULUM_ENABLED", "").lower() in ("1", "true", "yes")
TRANSPORT = os.environ.get("N2K_RETICULUM_TRANSPORT", "").lower() in ("1", "true", "yes")

def report(state, *, available=False, transport=False, error=None):
    payload = {
        "state": state, "available": available, "enabled": ENABLED,
        "transport_enabled": transport, "connected": None,
        "interfaces": [], "updated_at": int(time.time())
    }
    if error:
        payload["error"] = str(error)[:180]
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(STATUS)

if not ENABLED:
    report("disabled")
    while True:
        time.sleep(15)
        report("disabled")
else:
    try:
        import RNS
        config_dir = STATE / "rns"
        config_dir.mkdir(parents=True, exist_ok=True)
        config = config_dir / "config"
        fresh_config = not config.exists()
        if fresh_config:
            # Fresh installs may opt in explicitly; never alter persisted settings.
            config.write_text(
                "[reticulum]\n  enable_transport = No\n  share_instance = No\n\n"
                "[interfaces]\n  [[N2K LAN Discovery]]\n"
                "    type = AutoInterface\n    enabled = Yes\n"
                "    ignored_devices = docker0, veth, virbr0, tailscale0, br-\n"
                "  [[N2K LAN Transport Server]]\n"
                "    type = TCPServerInterface\n"
                "    enabled = Yes\n"
                "    listen_ip = 0.0.0.0\n"
                "    listen_port = 4243\n",
                encoding="utf-8"
            )
        # Do not rewrite existing user configuration or claim transport consent.
        # Existing config may contain transport settings from older installs:
        # refuse activation until it is reviewed by a migration.
        existing = config.read_text(encoding="utf-8")
        import re
        if re.search(r"(?im)^\s*enable_transport\s*=\s*(yes|true|1)\s*$", existing):
            raise RuntimeError("Legacy transport configuration needs explicit migration")
        # Existing persisted configurations must provide the Messenger LAN endpoint.
        # Do not silently rewrite a user configuration during upgrade.
        if not re.search(r"(?im)^\s*type\s*=\s*TCPServerInterface\s*$", existing) or not re.search(r"(?im)^\s*listen_port\s*=\s*4243\s*$", existing):
            raise RuntimeError("Existing RNS config lacks Messenger LAN TCP 4243; migration required")
        RNS.Reticulum(configdir=str(config_dir))
        while True:
            report("local_instance_started", available=True, transport=TRANSPORT)
            time.sleep(15)
    except Exception as exc:
        while True:
            report("error", error=exc)
            time.sleep(15)
