#!/usr/bin/env python3
"""Standalone N2K Reticulum LAN transport. No HTTP/API or access to LXMF data."""
import os
import time
from pathlib import Path
import RNS

state = Path("/state")
state.mkdir(parents=True, exist_ok=True)
config_dir = state / "rns"
config_dir.mkdir(parents=True, exist_ok=True)
config = config_dir / "config"
if not config.exists():
    config.write_text(
        "[reticulum]\n  enable_transport = Yes\n  share_instance = No\n\n"
        "[interfaces]\n  [[N2K LAN Discovery]]\n    type = AutoInterface\n    enabled = Yes\n"
        "    ignored_devices = docker0, veth, virbr0, tailscale0, br-\n"
        "  [[N2K Bridge Transport]]\n    type = TCPServerInterface\n"
        "    enabled = Yes\n    listen_ip = 0.0.0.0\n    listen_port = 4243\n",
        encoding="utf-8",
    )
RNS.Reticulum(configdir=str(config_dir))
while True:
    time.sleep(60)
