#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
state=/var/lib/netfreak2k/linux-upgrade-status.json
mkdir -p /var/lib/netfreak2k
write_state(){
  python3 - "$state" "$1" "$2" <<'PY'
import json,sys,time,os
path,status,msg=sys.argv[1:]
tmp=path+".tmp"
with open(tmp,"w") as f: json.dump({"state":status,"message":msg,"updated_at":int(time.time())},f)
os.replace(tmp,path)
PY
}
trap 'write_state failed "Linux-Update fehlgeschlagen; journalctl -u netfreak2k-linux-upgrade beachten"' ERR
write_state running "Paketlisten werden aktualisiert"
apt-get update
write_state running "Linux-Paketupdates werden installiert"
apt-get -y upgrade
write_state running "Update-Inventar wird neu ermittelt"
python3 /usr/local/lib/netfreak2k/check-host-updates.py
write_state completed "Linux-Paketupdates abgeschlossen. Neustart bei Bedarf manuell durchführen."
