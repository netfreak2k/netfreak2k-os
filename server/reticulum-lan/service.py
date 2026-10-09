#!/usr/bin/env python3
"""N2K Shadow Node transport: local Reticulum discovery and opt-in remote peers.

External peers are configured in /state/shadow-nodes.json and require restart.
Tor peers use a local SOCKS5 proxy, never an automatic clearnet fallback.
"""
import ipaddress
import json
import logging
import os
from pathlib import Path
import re
import socket
import struct
import threading
import time

import RNS

STATE = Path("/state")
CONFIG = STATE / "shadow-nodes.json"
RNS_DIR = STATE / "rns"
LOG = logging.getLogger("n2k-shadow")
MAX_PEERS = 8


def hostname(value, onion=False):
    if not isinstance(value, str) or len(value) > 253 or not value:
        raise ValueError("invalid host")
    if onion:
        if not re.fullmatch(r"[a-z2-7]{56}\.onion", value):
            raise ValueError("invalid v3 onion address")
    elif not re.fullmatch(r"[a-zA-Z0-9.-]+", value) or ".." in value or value.startswith(("-", ".")):
        raise ValueError("invalid hostname")
    return value


def port(value):
    if type(value) is not int or not 1 <= value <= 65535:
        raise ValueError("invalid port")
    return value


def load_settings(path=CONFIG):
    defaults = {"enabled": False, "tor_enabled": False, "peers": []}
    if not path.exists():
        return defaults
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) - {"enabled", "tor_enabled", "peers", "socks_host", "socks_port"}:
        raise ValueError("invalid configuration")
    if type(data.get("enabled", False)) is not bool or type(data.get("tor_enabled", False)) is not bool:
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
        if transport not in ("tcp", "tor"):
            raise ValueError("invalid transport")
        host = hostname(peer["host"], onion=transport == "tor")
        p = port(peer["port"])
        key = (host, p, transport)
        if key in seen:
            raise ValueError("duplicate peer")
        seen.add(key)
        normalized.append({"host": host, "port": p, "transport": transport})
    socks_host = data.get("socks_host", "127.0.0.1")
    try:
        loopback = isinstance(socks_host, str) and ipaddress.ip_address(socks_host).is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise ValueError("SOCKS must bind to loopback")
    return {"enabled": data.get("enabled", False),
            "tor_enabled": data.get("tor_enabled", False),
            "peers": normalized, "socks_host": socks_host,
            "socks_port": port(data.get("socks_port", 9050))}


def relay(left, right):
    try:
        while True:
            chunk = left.recv(65536)
            if not chunk:
                break
            right.sendall(chunk)
    except (OSError, TimeoutError):
        pass
    finally:
        try:
            left.shutdown(socket.SHUT_RD)
            right.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def recv_exact(sock, count):
    out = b""
    while len(out) < count:
        block = sock.recv(count - len(out))
        if not block:
            raise ConnectionError("truncated SOCKS5 reply")
        out += block
    return out


def socks_connect(proxy_host, proxy_port, destination, destination_port):
    remote = socket.create_connection((proxy_host, proxy_port), timeout=15)
    try:
        remote.sendall(b"\x05\x01\x00")
        if recv_exact(remote, 2) != b"\x05\x00":
            raise ConnectionError("SOCKS5 no-auth refused")
        host = destination.encode("ascii")
        remote.sendall(b"\x05\x01\x00\x03" + bytes([len(host)]) + host + struct.pack("!H", destination_port))
        head = recv_exact(remote, 4)
        if head[:2] != b"\x05\x00":
            raise ConnectionError("SOCKS5 CONNECT failed")
        if head[3] == 1:
            recv_exact(remote, 4)
        elif head[3] == 4:
            recv_exact(remote, 16)
        elif head[3] == 3:
            recv_exact(remote, recv_exact(remote, 1)[0])
        else:
            raise ConnectionError("invalid SOCKS5 address")
        recv_exact(remote, 2)
        remote.settimeout(None)
        return remote
    except Exception:
        remote.close()
        raise


def forward_connection(local, settings, peer):
    try:
        remote = socks_connect(settings["socks_host"], settings["socks_port"], peer["host"], peer["port"])
    except (OSError, ConnectionError) as exc:
        LOG.warning("Tor connection unavailable: %s", type(exc).__name__)
        local.close()
        return
    with local, remote:
        t = threading.Thread(target=relay, args=(local, remote), daemon=True)
        t.start()
        relay(remote, local)
        t.join(timeout=3)


def launch_tor_bridge(settings, peer):
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(16)
    local_port = listener.getsockname()[1]

    def serve():
        while True:
            try:
                conn, addr = listener.accept()
                threading.Thread(target=forward_connection, args=(conn, settings, peer), daemon=True).start()
            except OSError:
                return

    threading.Thread(target=serve, daemon=True, name="n2k-tor-bridge").start()
    return local_port


def managed_config(settings):
    lines = ["[reticulum]", "  enable_transport = Yes", "  share_instance = No", "",
             "[interfaces]", "  [[N2K LAN Discovery]]", "    type = AutoInterface",
             "    enabled = Yes", "    ignored_devices = docker0, veth, virbr0, tailscale0, br-",
             "", "  [[N2K Bridge Transport]]", "    type = TCPServerInterface",
             "    enabled = Yes", "    listen_ip = 0.0.0.0",
             "    listen_port = 4243"]
    if settings["enabled"]:
        for index, peer in enumerate(settings["peers"]):
            if peer["transport"] == "tor" and not settings["tor_enabled"]:
                continue
            target_host, target_port = peer["host"], peer["port"]
            if peer["transport"] == "tor":
                target_host = "127.0.0.1"
                target_port = launch_tor_bridge(settings, peer)
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
    LOG.info("Shadow peers configured: %d; tor allowed: %s",
             len(settings["peers"]) if settings["enabled"] else 0, settings["tor_enabled"])
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
