#!/usr/bin/env python3
"""Optional USB RNode to existing N2K TCP transport; isolated from LXMF identities."""
import os
import time
from pathlib import Path
import RNS

state=Path("/state/rns")
state.mkdir(parents=True,exist_ok=True)
config=state/"config"

def setting(key,default):
    value=os.environ.get(key,default)
    return int(value)

port=os.environ.get("N2K_RNODE_DEVICE","/dev/ttyACM0")
if not Path(port).exists():
    raise SystemExit("RNode device missing: "+port)
if not config.exists():
    config.write_text("""[reticulum]
  enable_transport = Yes
  share_instance = No

[interfaces]
  [[N2K LAN Uplink]]
    type = TCPClientInterface
    enabled = Yes
    target_host = 127.0.0.1
    target_port = 4243

  [[N2K RNode USB]]
    type = RNodeInterface
    enabled = Yes
    port = {port}
    frequency = {freq}
    bandwidth = {bw}
    txpower = {tx}
    spreadingfactor = {sf}
    codingrate = {cr}
""".format(
        port=port,
        freq=setting("N2K_RNODE_FREQUENCY",868100000),
        bw=setting("N2K_RNODE_BANDWIDTH",125000),
        tx=setting("N2K_RNODE_TXPOWER",14),
        sf=setting("N2K_RNODE_SF",10),
        cr=setting("N2K_RNODE_CR",5)
    ),encoding="utf-8")
    config.chmod(0o600)
print("Starting isolated RNode gateway",port,flush=True)
RNS.Reticulum(configdir=str(state))
while True:
    time.sleep(60)
