#!/usr/bin/env python3
"""Read-only local host update inventory."""
import json,os,subprocess,time
from pathlib import Path
def run(argv):
 try:
  p=subprocess.run(argv,capture_output=True,text=True,timeout=60,env={**os.environ,"LC_ALL":"C"})
  return p.stdout,p.returncode
 except (OSError,subprocess.TimeoutExpired): return "",-1
def main():
 d={"checked_at":int(time.time()),"packages":None,"security":None,"kernel":{},"docker":{}}
 if Path("/usr/bin/apt-get").exists():
  out,rc=run(["apt-get","-s","-o","Debug::NoLocking=1","upgrade"])
  if rc==0:
   lines=[x for x in out.splitlines() if x.startswith("Inst ")]
   d["packages"]=len(lines)
   d["security"]=sum("security" in x.lower() for x in lines)
 out,_=run(["uname","-r"])
 d["kernel"]={"running":out.strip(),"reboot_required":Path("/var/run/reboot-required").exists()}
 out,rc=run(["docker","--version"])
 d["docker"]={"installed":rc==0,"version":out.strip() if rc==0 else ""}
 path=Path(os.environ.get("N2K_STATE_DIR","/var/lib/netfreak2k"))/"host-update-status.json"
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix(".tmp")
 tmp.write_text(json.dumps(d)+"\n")
 tmp.replace(path)
if __name__=="__main__": main()
