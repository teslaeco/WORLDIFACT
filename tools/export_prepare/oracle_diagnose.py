"""Read-only diagnosis for the WORLDIFACT export-preparation maintenance unit.

Run only from the owner's OCI Cloud Shell. Resolves the known froge-blender VM
through OCI and uses the existing SSH key by path. It never reads/prints the
private key, modifies worker files, restarts services, or requests AI.
"""
from pathlib import Path
import ipaddress
import json
import os
import subprocess
import sys

COMMIT = "81521fa275525b3369e0b876f05c3cfab257321a"
UNIT = "worldifact-export-prepare-" + COMMIT[:12] + ".service"

REMOTE = r"""
from pathlib import Path
import json, os, re, subprocess
commit="81521fa275525b3369e0b876f05c3cfab257321a"
unit="worldifact-export-prepare-"+commit[:12]+".service"
job=Path.home()/".local/state/worldifact-export-prepare-launch"/commit

def run(args):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=20)
    return {"code":p.returncode,"stdout":p.stdout[-12000:],"stderr":p.stderr[-4000:]}

show=run(["systemctl","--user","show",unit,
          "--property=ActiveState","--property=SubState","--property=Result",
          "--property=ExecMainCode","--property=ExecMainStatus"])
journal=run(["journalctl","--user","-u",unit,"-n","60","--no-pager","-o","cat"])
result=None
rp=job/"result.json"
if rp.is_file() and not rp.is_symlink() and rp.stat().st_size<65536:
    try:
        value=json.loads(rp.read_text())
        if isinstance(value,dict):
            allow={"phase","source_sha256","backup","connectorVersion","projectFilesRevision",
                   "posthocExportRevision","runnerExitCode","paidGenerationRequested","error"}
            result={k:v for k,v in value.items() if k in allow}
    except Exception:
        result={"parse":"FAILED"}
runner={"exists":False,"syntax":"UNKNOWN"}
rr=job/"runner.py"
if rr.is_file() and not rr.is_symlink() and rr.stat().st_size<262144:
    runner["exists"]=True
    try:
        compile(rr.read_text(),str(rr),"exec")
        runner["syntax"]="OK"
    except Exception as exc:
        runner["syntax"]="ERROR"
        runner["errorType"]=type(exc).__name__
files=[]
if job.is_dir() and not job.is_symlink():
    for p in sorted(job.iterdir()):
        if p.is_file() and not p.is_symlink():
            files.append({"name":p.name,"size":p.stat().st_size})
out={
 "readOnly":True,
 "generationRequested":False,
 "paidGenerationRequested":False,
 "unit":unit,
 "service":show,
 "result":result,
 "runner":runner,
 "files":files,
 "journal":journal,
}
print(json.dumps(out,indent=2))
"""

class DiagnoseError(RuntimeError): pass
def invoke(args,data=None,timeout=90):
    try:
        p=subprocess.run(args,input=data,capture_output=True,text=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired):
        raise DiagnoseError("Connection unavailable.") from None
    if p.returncode:
        raise DiagnoseError("Read-only diagnosis failed; no maintenance action was taken.")
    return p.stdout
def one(text,label):
    try: value=json.loads(text)
    except ValueError: raise DiagnoseError("OCI did not return JSON for "+label) from None
    if not isinstance(value,list) or len(value)!=1 or not isinstance(value[0],str) or not value[0]:
        raise DiagnoseError("Expected exactly one "+label+".")
    return value[0]
def connection():
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):
        raise DiagnoseError("Existing Cloud Shell SSH key is unavailable.")
    oci=["oci","--region","eu-amsterdam-1"]
    instance=one(invoke(oci+["search","resource","structured-search","--query-text",
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        "--query","data.items[].identifier","--output","json"]),"running Froge VM")
    address=one(invoke(oci+["compute","instance","list-vnics","--instance-id",instance,"--all",
        "--query",'data[?"is-primary" == `true`]."public-ip"',"--output","json"]),"primary public IP")
    ipaddress.ip_address(address)
    return ["ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes",
            "-o","BatchMode=yes","-o","ConnectTimeout=20","opc@"+address,
            "PYTHONDONTWRITEBYTECODE=1 python3 -"]
def main():
    value=json.loads(invoke(connection(),data=REMOTE,timeout=120))
    if value.get("readOnly") is not True or value.get("generationRequested") is not False:
        raise DiagnoseError("Unexpected diagnostic response.")
    print(json.dumps(value,indent=2))
    print("DIAGNOSIS COMPLETE. No install, restart, generation or payment action was performed.")
if __name__=="__main__":
    try: main()
    except (DiagnoseError,ValueError) as exc:
        print("STOP: "+str(exc),file=sys.stderr);sys.exit(1)
