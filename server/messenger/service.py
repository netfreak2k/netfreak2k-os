#!/usr/bin/env python3
"""Native N2K Reticulum/LXMF runtime. Internal API: reachable only from N2K API."""
import json
import os
import threading
import time
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import RNS
import LXMF
import RNS.vendor.umsgpack as msgpack

STATE = Path("/state")
STATE.mkdir(parents=True, exist_ok=True)
STATE.chmod(0o700)
RUNTIME = {"online": False, "error": None, "identity": None, "transport": "Reticulum / LXMF"}
ROUTER = None
IDENTITY = None
DELIVERY = None
LOCK = threading.RLock()
MESSAGES = STATE / 'messages.json'
CONTACTS = STATE / 'contacts.json'
NODE_CONFIG = STATE / 'node.json'
PEERS = STATE / 'peers.json'
GATEWAY = STATE / 'public-peer.json'

def public_peer():
    try:
        data=json.loads(GATEWAY.read_text(encoding='utf-8'))
        if isinstance(data,dict):
            return {'host':str(data.get('host',''))[:253], 'port':data.get('port',4242), 'enabled':data.get('enabled') is True}
    except (OSError,ValueError):
        pass
    return {'host':'','port':4242,'enabled':False}


def lxmf_display_name(app_data):
    """Decode the LXMF msgpack announce (name, stamp cost, extensions)."""
    try:
        payload = msgpack.unpackb(app_data) if isinstance(app_data, bytes) else app_data
        raw = payload[0] if isinstance(payload, (list, tuple)) and payload else payload
        name = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw or "")
        name = "".join(ch for ch in name if ch.isprintable()).strip()
        return name[:80] or "Unbenannter LXMF-Knoten"
    except Exception:
        return "Unbenannter LXMF-Knoten"


class LXMFAnnounces:
    aspect_filter = 'lxmf.delivery'
    def received_announce(self, destination_hash, announced_identity, app_data):
        try:
            name = lxmf_display_name(app_data)
            with LOCK:
                rows = [x for x in read_records(PEERS) if x.get('destination') != destination_hash.hex()]
                rows.append({'destination':destination_hash.hex(),'name':name or 'Unbenannter LXMF-Knoten','last_seen':int(time.time())})
                tmp=PEERS.with_suffix('.tmp')
                tmp.write_text(json.dumps(rows[-150:],ensure_ascii=False),encoding='utf-8')
                tmp.chmod(0o600)
                tmp.replace(PEERS)
        except Exception:
            pass


def node_settings():
    try:
        value = json.loads(NODE_CONFIG.read_text(encoding='utf-8'))
        if isinstance(value, dict):
            return {'name':str(value.get('name','N2K MeshLink'))[:64], 'enabled':value.get('enabled') is True}
    except (OSError, ValueError):
        pass
    return {'name':'N2K MeshLink','enabled':False}

def set_node_settings(name, enabled):
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64 or any(ord(ch)<32 for ch in name):
        raise ValueError('invalid_node_name')
    if type(enabled) is not bool:
        raise ValueError('invalid_node_state')
    tmp = NODE_CONFIG.with_suffix('.tmp')
    tmp.write_text(json.dumps({'name':name.strip(),'enabled':enabled}), encoding='utf-8')
    tmp.chmod(0o600)
    tmp.replace(NODE_CONFIG)


def read_records(file):
    try:
        data = json.loads(file.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, ValueError, OSError):
        return []

def append_message(record):
    with LOCK:
        rows = read_records(MESSAGES)
        rows.append(record)
        temp = MESSAGES.with_suffix('.tmp')
        temp.write_text(json.dumps(rows[-500:], ensure_ascii=False), encoding='utf-8')
        temp.chmod(0o600)
        temp.replace(MESSAGES)

def on_delivery(message):
    try:
        append_message({'direction':'in', 'source':message.source_hash.hex(), 'content':(message.content.decode('utf-8', errors='replace') if isinstance(message.content, bytes) else str(message.content)), 'time':int(time.time())})
    except Exception:
        pass


def start_stack():
    global ROUTER, IDENTITY, DELIVERY
    try:
        # Reticulum owns /state/rns, LXMF owns /state/lxmf. Never share a
        # Home Assistant add-on identity/database concurrently.
        rns_path = STATE / "rns"
        lxmf_path = STATE / "lxmf"
        rns_path.mkdir(exist_ok=True)
        lxmf_path.mkdir(exist_ok=True)
        node = node_settings()
        # Configure transport mode before RNS initialises; applying a change
        # requires restarting ONLY the MeshLink container.
        config_file = rns_path / "config"
        if not config_file.exists():
            config_file.write_text("[reticulum]\n  enable_transport = No\n  share_instance = No\n\n[interfaces]\n  [[N2K AutoInterface]]\n    type = AutoInterface\n    enabled = Yes\n", encoding="utf-8")
        config_text = config_file.read_text(encoding="utf-8")
        config_text = re.sub(r"(?m)^\s*enable_transport\s*=.*$", "  enable_transport = " + ("Yes" if node["enabled"] else "No"), config_text)
        gateway=public_peer()
        # Only the explicitly managed block is changed; preserve user interfaces.
        config_text=re.sub(r"(?ms)\n?  \[\[N2K Public TCP Peer\]\]\n.*?(?=\n  \[\[|\Z)", "", config_text)
        if gateway["enabled"] and gateway["host"]:
            config_text += ("\n  [[N2K Public TCP Peer]]\n    type = TCPClientInterface\n"
                "    enabled = Yes\n    target_host = " + gateway["host"] +
                "\n    target_port = " + str(gateway["port"]) + "\n")
        # Auto-installed LAN transport: isolated host-network RNS service.
        # The Messenger HTTP API remains reachable only on the private N2K bridge.
        lan_host = os.environ.get("N2K_LAN_TRANSPORT_HOST", "").strip()
        config_text = re.sub(r"(?ms)\n?  \[\[N2K LAN Transport\]\]\n.*?(?=\n  \[\[|\Z)", "", config_text)
        if lan_host:
            config_text += ("\n  [[N2K LAN Transport]]\n    type = TCPClientInterface\n"
                            "    enabled = Yes\n    target_host = " + lan_host +
                            "\n    target_port = 4243\n")
        # N2K owns its local Reticulum transport server, independently of HA.
        # The TCP listener is only enabled when the OS transport-node switch is on.
        config_text=re.sub(r"(?ms)\n?  \[\[N2K TCP Server\]\]\n.*?(?=\n  \[\[|\Z)", "", config_text)
        if node["enabled"]:
            config_text += ("\n  [[N2K TCP Server]]\n    type = TCPServerInterface\n"
                            "    enabled = Yes\n    listen_ip = 0.0.0.0\n    listen_port = 4242\n")
        config_file.write_text(config_text, encoding="utf-8")
        RNS.Reticulum(configdir=str(rns_path))
        RNS.Transport.register_announce_handler(LXMFAnnounces())
        identity_file = STATE / "identity"
        if identity_file.exists():
            IDENTITY = RNS.Identity.from_file(str(identity_file))
            if IDENTITY is None:
                raise RuntimeError("identity_unreadable")
        else:
            IDENTITY = RNS.Identity()
            IDENTITY.to_file(str(identity_file))
        ROUTER = LXMF.LXMRouter(storagepath=str(lxmf_path))
        DELIVERY = ROUTER.register_delivery_identity(IDENTITY, display_name=node["name"])
        ROUTER.register_delivery_callback(on_delivery)
        ROUTER.announce(DELIVERY.hash)
        RUNTIME.update(online=True, identity=DELIVERY.hash.hex(), error=None, node_name=node["name"], transport_enabled=node["enabled"])
    except Exception as exc:
        RUNTIME.update(online=False, error=str(exc)[:180])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/status":
            result = dict(RUNTIME)
        elif self.path == "/messages":
            result = {"messages":read_records(MESSAGES)}
        elif self.path == "/contacts":
            result = {"contacts":read_records(CONTACTS)}
        elif self.path == "/peers/best":
            now=int(time.time())
            candidates=[]
            for peer in read_records(PEERS):
                try:
                    h=bytes.fromhex(peer["destination"])
                    known=bool(RNS.Transport.has_path(h))
                    hops=RNS.Transport.hops_to(h) if known else None
                    age=max(0,now-int(peer.get("last_seen",0)))
                    candidates.append(dict(peer,path_known=known,hops=hops,age_seconds=age))
                except (ValueError,KeyError,TypeError):
                    continue
            candidates.sort(key=lambda p:(not p["path_known"],p["hops"] if isinstance(p["hops"],int) else 999,p["age_seconds"]))
            best=next((p for p in candidates if p["path_known"] and p["age_seconds"]<=86400),None)
            result={"best":best,"known_count":len(candidates),"reachable_route_count":sum(1 for p in candidates if p["path_known"]),
                    "connected_transport_count":None,"diagnostic":"Keine LXMF-Announcements. Der lokale LAN-Transport muss auf Erreichbarkeit geprüft werden." if not candidates and not public_peer()["enabled"] else "Ein bekanntes LXMF-Ziel ist keine bestätigte TCP-Verbindung.", "note":"Known route != active TCP connection"}
        elif self.path == "/gateway":
            result=dict(public_peer(), applied=RUNTIME.get("online",False))
        elif self.path == "/peers":
            peers=[]
            for item in read_records(PEERS):
                entry=dict(item)
                try:
                    h=bytes.fromhex(entry["destination"])
                    entry["path_known"]=bool(RNS.Transport.has_path(h))
                    entry["hops"]=RNS.Transport.hops_to(h) if entry["path_known"] else None
                except Exception:
                    entry["path_known"]=False
                    entry["hops"]=None
                peers.append(entry)
            result={"peers":peers,"known_count":len(peers),"reachable_route_count":sum(1 for peer in peers if peer.get("path_known") is True),"connected_count":None,"online":RUNTIME["online"],"gateway":public_peer(), "diagnostic":("Reticulum ist offline: "+str(RUNTIME.get("error") or "Startfehler")) if not RUNTIME["online"] else ("N2K LAN-Transport vorkonfiguriert; erreichbare Knoten erst nach Empfang von Announcements sichtbar." if not public_peer()["enabled"] else "TCP-Uplink konfiguriert, tatsächliche Verbindung nicht bestätigt."),"note":"path_known means a route is known, not an established TCP peer connection"}
        elif self.path == "/node":
            result = dict(node_settings(), applied_name=RUNTIME.get("node_name"), applied_transport=RUNTIME.get("transport_enabled"))
        else:
            self.send_error(404)
            return
        body = json.dumps(result).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path not in ("/contacts", "/messages", "/node", "/peers/request", "/gateway", "/peers/auto"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 8192:
                raise ValueError("invalid_size")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("invalid_payload")
            if self.path == "/peers/auto":
                if not RUNTIME["online"]:
                    raise ValueError("reticulum_offline")
                now=int(time.time())
                candidates=[]
                for entry in read_records(PEERS):
                    try:
                        dest=bytes.fromhex(entry["destination"])
                        age=max(0,now-int(entry.get("last_seen",0)))
                        if age>86400:
                            continue
                        has=bool(RNS.Transport.has_path(dest))
                        hops=RNS.Transport.hops_to(dest) if has else None
                        candidates.append((not has,hops if isinstance(hops,int) else 999,age,entry["destination"]))
                    except (ValueError,KeyError,TypeError):
                        continue
                candidates.sort()
                if not candidates:
                    self.send_result({"selected":None,"requested":False,"message":"no_recent_announces"})
                    return
                selected=candidates[0][3]
                RNS.Transport.request_path(bytes.fromhex(selected))
                self.send_result({"selected":selected,"requested":True,
                    "path_known":bool(RNS.Transport.has_path(bytes.fromhex(selected))),
                    "note":"best observed LXMF route requested; this is not a direct TCP link"})
                return
            if self.path == "/gateway":
                host=str(payload.get("host","")).strip().lower()
                port=payload.get("port")
                enabled=payload.get("enabled")
                if (type(enabled) is not bool or type(port) is not int or not 1<=port<=65535
                        or len(host)>253 or (enabled and not host)
                        or (host and not re.fullmatch(r"[a-z0-9.-]+",host))
                        or (host and (".." in host or host.startswith(("-", ".")) or host.endswith(("-", "."))))):
                    raise ValueError("invalid_public_peer")
                tmp=GATEWAY.with_suffix(".tmp")
                tmp.write_text(json.dumps({"host":host,"port":port,"enabled":enabled}),encoding="utf-8")
                tmp.chmod(0o600)
                tmp.replace(GATEWAY)
                self.send_result({"saved":True,"restart_required":True})
                return
            if self.path == "/peers/request":
                dest = str(payload.get("destination", "")).strip().lower()
                if not re.fullmatch(r"[0-9a-f]{32}", dest):
                    raise ValueError("invalid_destination")
                if not any(x.get("destination") == dest for x in read_records(PEERS)):
                    raise ValueError("peer_not_discovered")
                h = bytes.fromhex(dest)
                if not RUNTIME["online"]:
                    raise ValueError("reticulum_offline")
                RNS.Transport.request_path(h)
                self.send_result({"requested":True,"path_known":bool(RNS.Transport.has_path(h)),
                                  "note":"route requested; not a confirmed direct connection"})
                return
            if self.path == "/node":
                node = node_settings()
                name = payload.get("name", node["name"])
                enabled = payload.get("enabled", node["enabled"])
                set_node_settings(name, enabled)
                self.send_result({"saved":True,"restart_required":True})
                return
            dest = str(payload.get("destination", "")).strip().lower()
            if not re.fullmatch(r"[0-9a-f]{32}", dest):
                raise ValueError("invalid_destination_hash")
            if self.path == "/contacts":
                name = str(payload.get("name", "")).strip()[:80]
                if not name:
                    raise ValueError("name_required")
                with LOCK:
                    contacts = [x for x in read_records(CONTACTS) if x.get("destination") != dest]
                    contacts.append({"destination":dest, "name":name})
                    temp = CONTACTS.with_suffix(".tmp")
                    temp.write_text(json.dumps(contacts), encoding="utf-8")
                    temp.chmod(0o600)
                    temp.replace(CONTACTS)
                result = {"saved":True}
            else:
                if not RUNTIME["online"] or ROUTER is None:
                    raise ValueError("reticulum_offline")
                content = str(payload.get("content", "")).strip()
                if not content or len(content) > 2048:
                    raise ValueError("invalid_content")
                identity = RNS.Identity.recall(bytes.fromhex(dest))
                if identity is None:
                    RNS.Transport.request_path(bytes.fromhex(dest))
                    raise ValueError("destination_unknown_announce_required")
                destination = RNS.Destination(identity, RNS.Destination.OUT, RNS.Destination.SINGLE, "lxmf", "delivery")
                message = LXMF.LXMessage(destination, DELIVERY, content, desired_method=LXMF.LXMessage.DIRECT)
                # Identity/path resolution and delivery success are asynchronous.
                ROUTER.handle_outbound(message)
                append_message({"direction":"out","source":dest,"content":content,"time":int(time.time()),"status":"queued"})
                result = {"queued":True}
            self.send_result(result, 200)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_result({"error":str(exc)}, 400)
        except Exception:
            self.send_result({"error":"messenger_internal_error"}, 500)

    def send_result(self, result, status=200):
        body = json.dumps(result).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        return

if __name__ == "__main__":
    # Reticulum installs signal handlers; initialisation MUST occur on the main thread.
    # Keep the internal status API responsive on a separate daemon thread.
    httpd = ThreadingHTTPServer(("0.0.0.0", 8091), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True, name="n2k-messenger-api").start()
    start_stack()
    # Keep the process running after initialisation so the API and LXMF router remain alive.
    while True:
        time.sleep(60)
