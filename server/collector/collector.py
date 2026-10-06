#!/usr/bin/env python3
import json
import os
import socket
import time
from pathlib import Path

SOCKET_PATH = os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock")
OUT = Path("/state/apps.json")
INTERVAL = int(os.environ.get("N2K_COLLECT_INTERVAL", "15"))


def docker_get(path):
    request = (
        f"GET {path} HTTP/1.1\r\n"
        "Host: docker\r\n"
        "Connection: close\r\n\r\n"
    ).encode("ascii")

    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(5)
    try:
        client.connect(SOCKET_PATH)
        client.sendall(request)
        chunks = []
        while True:
            data = client.recv(65536)
            if not data:
                break
            chunks.append(data)
    finally:
        client.close()

    raw = b"".join(chunks)
    head, body = raw.split(b"\r\n\r\n", 1)
    header_lines = head.split(b"\r\n")
    status_line = header_lines[0]
    if b" 200 " not in status_line:
        raise RuntimeError(status_line.decode("ascii", errors="replace"))

    headers = {}
    for line in header_lines[1:]:
        if b":" not in line:
            continue
        key, value = line.split(b":", 1)
        headers[key.strip().lower()] = value.strip().lower()

    if headers.get(b"transfer-encoding") == b"chunked":
        decoded = bytearray()
        rest = body
        while rest:
            size_line, rest = rest.split(b"\r\n", 1)
            size = int(size_line.split(b";", 1)[0], 16)
            if size == 0:
                break
            decoded.extend(rest[:size])
            rest = rest[size + 2:]
        body = bytes(decoded)

    return json.loads(body.decode("utf-8"))


def sanitize(items):
    result = []
    for item in items:
        names = item.get("Names") or []
        name = names[0].lstrip("/") if names else item.get("Id", "")[:12]
        ports = []
        for port in item.get("Ports") or []:
            public = port.get("PublicPort")
            private = port.get("PrivatePort")
            proto = port.get("Type", "tcp")
            if public:
                ports.append({"public": public, "private": private, "protocol": proto})

        labels = item.get("Labels") or {}
        result.append({
            "id": item.get("Id", "")[:12],
            "name": name,
            "image": item.get("Image", ""),
            "state": item.get("State", "unknown"),
            "status": item.get("Status", ""),
            "managed": str(labels.get("netfreak2k.managed", "")).lower() == "true",
            "core": str(labels.get("netfreak2k.core", "")).lower() == "true",
            "ports": ports,
        })
    return sorted(result, key=lambda x: x["name"].lower())


def write_payload(payload):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)


def collect_once():
    items = docker_get("/containers/json?all=1")
    write_payload({
        "available": True,
        "updated_at": int(time.time()),
        "containers": sanitize(items),
    })


while True:
    try:
        collect_once()
    except Exception as exc:
        write_payload({
            "available": False,
            "updated_at": int(time.time()),
            "error": type(exc).__name__,
            "containers": [],
        })
    time.sleep(max(INTERVAL, 5))
