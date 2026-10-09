#!/usr/bin/env python3
"""N2K Shadow Node transport: local Reticulum discovery and opt-in remote peers.

External peers are configured in /state/shadow-nodes.json and require restart.
This service intentionally has no Tor integration.
"""
import json
import logging
import os
from pathlib import Path
import re
import time

import RNS

STATE = Path("/state")
CONFIG = STATE / "shadow-nodes.json"
RNS_DIR = STATE / "rns"
LOG = logging.getLogger("n2k-shadow")
MAX_PEERS = 8


def hostname(value):
    if not isinstance(value, str) or len(value) > 253 or not value:
        raise ValueError("invalid host")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", value) or ".." in value or value.startswith(("-", ".")):
        raise ValueError("invalid hostname")
    return value


def port(value):
    if type(value) is not int or not 1 <= value <= 65535:
        raise ValueError("invalid port")
    return value


def load_settings(path=CONFIG):
    defaults = {"enabled": False, "peers": []}
    if not path.exists():
        return defaults
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) - {"enabled", "peers"}:
        raise ValueError("invalid configuration")
    if type(data.get("enabled", False)) is not bool:
        raise ValueError("invalid enabled setting")
    peers = data.get("peers", [])
    if not isinstance(peers, list) or len(peers) > MAX_PEERS:
        raise ValueError("invalid peer count")
    normalized = []
    seen = set()
    for peer in peers:
        if not isinstance(peer, dict) or set(peer) != {"host", "port", "transport"}:
            raise ValueError("invalid peer")
        transport = peer["transport"]
        if transport != "tcp":
            raise ValueError("invalid transport")
        host = hostname(peer["host"])
        p = port(peer["port"])
        key = (host, p, transport)
        if key in seen:
            raise ValueError("duplicate peer")
        seen.add(key)
        normalized.append({"host": host, "port": p, "transport": transport})
    return {"enabled": data.get("enabled", False), "peers": normalized}


def managed_config(settings):
    lines = ["[reticulum]", "  enable_transport = Yes", "  share_instance = No", "",
             "[interfaces]", "  [[N2K LAN Discovery]]", "    type = AutoInterface",
             "    enabled = Yes", "    ignored_devices = docker0, veth, virbr0, tailscale0, br-",
             "", "  [[N2K Bridge Transport]]", "    type = TCPServerInterface",
             "    enabled = Yes", "    listen_ip = 0.0.0.0",
             "    listen_port = 4243"]
    if settings["enabled"]:
        for index, peer in enumerate(settings["peers"]):
            target_host, target_port = peer["host"], peer["port"]
            lines.extend(["", f"  [[N2K Shadow Peer {index + 1}]]",
                          "    type = TCPClientInterface", "    enabled = Yes",
                          f"    target_host = {target_host}", f"    target_port = {target_port}"])
    return "\n".join(lines) + "\n"


def main():
    logging.basicConfig(level=logging.INFO)
    STATE.mkdir(parents=True, exist_ok=True)
    RNS_DIR.mkdir(parents=True, exist_ok=True)
    # Reject unsafe changes instead of changing connectivity or losing the previous config.
    settings = load_settings()
    config = RNS_DIR / "config"
    # Keep an existing unmanaged Reticulum configuration intact.
    if not config.exists():
        config.write_text(managed_config(settings), encoding="utf-8")
    else:
        existing = config.read_text(encoding="utf-8")
        # Existing user-defined interfaces must never be removed by regeneration.
        # This initial feature only updates configurations with no custom blocks.
        names = re.findall(r"(?m)^\\s*\\[\\[([^]]+)\\]\\]", existing)
        managed = {"N2K LAN Discovery", "N2K Bridge Transport"}
        managed.update(name for name in names if re.fullmatch(r"N2K Shadow Peer \\d+", name))
        if set(names) <= managed and {"N2K LAN Discovery", "N2K Bridge Transport"} <= set(names):
            config.write_text(managed_config(settings), encoding="utf-8")
        else:
            LOG.warning("Custom RNS config preserved; Shadow peer settings not applied")
    RNS.Reticulum(configdir=str(RNS_DIR))
    LOG.info("Shadow TCP peers configured: %d",
             len(settings["peers"]) if settings["enabled"] else 0)
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
