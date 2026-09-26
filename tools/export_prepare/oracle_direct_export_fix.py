"""Disconnect-safe Oracle launcher for the reviewed direct-v33 export v3 fix.

This supersedes the earlier v2 maintenance namespace so a stale failed v2
result cannot permanently block a corrected attempt. It accepts only exact
reviewed v33 source revisions, performs no AI during maintenance, and exposes
a separately explicit one-job E2E mode after installation.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HOST="141.148.242.30"
UNIT="worldifact-direct-export-v3-4c7758da.service"
E2E_UNIT="worldifact-export-e2e-v3-5230b3ad.service"
FILES={
    "direct_v33_patch.py":"385811ea2aeb8a817328ffed584ab79e48c10026",
    "patch_server.py":"e034736a4123bd16e973aa52843dff04aa367cc0",
    "upgrade_direct_v33_export.py":"4c7758da210c7c04b0f51dfaa95ab5cf7c0c83bc",
    "install_direct_v33_export_v3.py":"dc69b5687aa3c3eeae4e403e3618ec761a0c4acf",
    "oracle_worker_e2e.py":"5230b3adb092c44a1820c58c88e3e7023b0da604",
}
SUCCESS={"INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"}

REMOTE=r'''
import base64,fcntl,hashlib,json,os,re,subprocess
from pathlib import Path

UNIT="worldifact-direct-export-v3-4c7758da.service"
E2E_UNIT="worldifact-export-e2e-v3-5230b3ad.service"
ROOT=Path.home()/".local/state/worldifact-direct-export-v3"
RESULT=ROOT/"result.json"
MARKER=ROOT/"launch.json"
E2E_DIR=ROOT/"e2e"
E2E_RESULT=E2E_DIR/"result.json"
E2E_MARKER=ROOT/"e2e-launch.json"

RUNNER=r"""
import json,os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent
result=root/"result.json"
try:
    p=subprocess.run(
        ["/usr/bin/python3","-B",str(root/"install_direct_v33_export_v3.py"),"--approve-service-restart"],
        cwd=root,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=240
    )
    try:
        value=json.loads(p.stdout)
        if not isinstance(value,dict):raise ValueError()
    except Exception:
        value={"phase":"INVALID_INSTALLER_OUTPUT","paidGenerationRequested":False,"generationRequested":False,
               "error":("stdout="+p.stdout[-500:]+" stderr="+p.stderr[-500:])[:900]}
    value["runnerExitCode"]=p.returncode
except BaseException as exc:
    value={"phase":"LAUNCH_FAILED","paidGenerationRequested":False,"generationRequested":False,
           "runnerExitCode":127,"error":(type(exc).__name__+":"+str(exc))[:900]}
tmp=root/"result.json.tmp"
tmp.write_text(json.dumps(value,separators=(",",":)))
os.chmod(tmp,0o600)
os.replace(tmp,result)
sys.exit(0 if value.get("phase") in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED") else 1)
"""

def blob(raw):
    return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def command(args,timeout=30):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError("maintenance command failed")
    return p.stdout.strip()
def unit_state(name):
    try:
        value=command(["systemctl","--user","show",name,"--property=ActiveState","--value"])
        return value if re.fullmatch(r"[A-Za-z0-9_-]{1,40}",value) else "unknown"
    except Exception:return "unknown"
def worker_state(name):return unit_state(name)
def safe_read(path,limit=131072):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:raise RuntimeError("unsafe result")
    return path.read_text()
def load_json(path):
    try:
        value=json.loads(safe_read(path))
        return value if isinstance(value,dict) else None
    except Exception:return None

def observe():
    out={"phase":"NOT_STARTED","paidGenerationRequested":False,"generationRequested":False,
         "maintenanceService":unit_state(UNIT),
         "workerService":worker_state("froge-worker.service"),
         "tunnelService":worker_state("froge-tunnel.service")}
    if RESULT.exists():
        value=load_json(RESULT)
        if value is None:return {**out,"phase":"LAUNCH_FAILED","error":"Unreadable maintenance result."}
        allowed={"phase","fromRevision","fromSha256","source_sha256","backup","connectorVersion","projectFilesRevision",
                 "posthocExportRevision","legacyGlbExportRecoveryRevision","paidGenerationRequested",
                 "generationRequested","runnerExitCode","error"}
        out.update({k:v for k,v in value.items() if k in allowed})
        return out
    if MARKER.exists():
        state=out["maintenanceService"]
        out["phase"]="INSTALLATION_RUNNING" if state in ("active","activating") else "LAUNCH_FAILED"
    return out

def stage_package():
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(ROOT,0o700)
    if set(PACKAGE)!=set(EXPECTED):raise RuntimeError("incomplete reviewed package")
    for name,expected in EXPECTED.items():
        raw=base64.b64decode(PACKAGE[name],validate=True)
        if len(raw)>262144 or blob(raw)!=expected:raise RuntimeError("package hash mismatch: "+name)
        compile(raw,name,"exec")
        path=ROOT/name
        if path.exists():
            if path.is_symlink() or path.read_bytes()!=raw:raise RuntimeError("existing maintenance file differs: "+name)
        else:
            fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,"wb") as stream:
                stream.write(raw);stream.flush();os.fsync(stream.fileno())

def stage():
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(ROOT,0o700)
    fd=os.open(str(ROOT/"launch.lock"),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        current=observe()
        if current["phase"]!="NOT_STARTED":return current
        stage_package()
        runner=ROOT/"runner.py"
        if runner.exists():
            if runner.is_symlink() or runner.read_text()!=RUNNER:raise RuntimeError("existing runner differs")
        else:
            runner.write_text(RUNNER);os.chmod(runner,0o600)
        marker={"unit":UNIT,"approval":"service-restart-only-no-ai","revision":3}
        tmp=ROOT/"launch.json.tmp";tmp.write_text(json.dumps(marker));os.chmod(tmp,0o600);os.replace(tmp,MARKER)
        subprocess.run(["systemctl","--user","reset-failed",UNIT],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        p=subprocess.run(["systemd-run","--user","--unit="+UNIT,"--property=Type=exec","--property=UMask=0077",
            "--property=WorkingDirectory="+str(ROOT),"--setenv=PYTHONDONTWRITEBYTECODE=1",
            "/usr/bin/python3","-B",str(runner)],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if p.returncode:return {**observe(),"phase":"STOPPED_BEFORE_LAUNCH","error":("systemd-run:"+p.stderr[-500:])[:700]}
    return observe()

def e2e_observe():
    out={"phase":"E2E_NOT_STARTED","paidGenerationRequested":False,"generationRequested":False,
         "e2eService":unit_state(E2E_UNIT),"workerService":worker_state("froge-worker.service"),
         "tunnelService":worker_state("froge-tunnel.service")}
    if E2E_RESULT.exists():
        value=load_json(E2E_RESULT)
        if value is None:return {**out,"phase":"E2E_FAILED","error":"Unreadable E2E result."}
        allowed={"phase","jobId","state","paidGenerationRequested","generationRequested","automaticGenerationRetries","artifacts","error"}
        out.update({k:v for k,v in value.items() if k in allowed});return out
    if E2E_MARKER.exists():
        state=out["e2eService"];out["phase"]="E2E_RUNNING" if state in ("active","activating") else "E2E_FAILED"
    return out

def e2e_stage():
    installed=observe()
    if installed.get("phase") not in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"):
        return {"phase":"E2E_FAILED","paidGenerationRequested":False,"generationRequested":False,
                "error":"Export capability is not installed and verified."}
    if installed.get("posthocExportRevision")!=2 or installed.get("legacyGlbExportRecoveryRevision")!=1:
        return {"phase":"E2E_FAILED","paidGenerationRequested":False,"generationRequested":False,
                "error":"Required export capability markers are missing."}
    fd=os.open(str(ROOT/"e2e.lock"),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        current=e2e_observe()
        if current["phase"]!="E2E_NOT_STARTED":return current
        script=ROOT/"oracle_worker_e2e.py"
        if script.is_symlink() or not script.is_file():raise RuntimeError("E2E script was not staged.")
        E2E_DIR.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(E2E_DIR,0o700)
        tmp=ROOT/"e2e-launch.json.tmp";tmp.write_text(json.dumps({"unit":E2E_UNIT,"approval":"exactly-one-live-model-no-auto-retry"}));os.chmod(tmp,0o600);os.replace(tmp,E2E_MARKER)
        subprocess.run(["systemctl","--user","reset-failed",E2E_UNIT],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        p=subprocess.run(["systemd-run","--user","--unit="+E2E_UNIT,"--property=Type=exec","--property=UMask=0077",
            "--property=WorkingDirectory="+str(ROOT),"--setenv=PYTHONDONTWRITEBYTECODE=1",
            "/usr/bin/python3","-B",str(script)],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if p.returncode:return {**e2e_observe(),"phase":"E2E_FAILED","error":("systemd-run:"+p.stderr[-500:])[:700]}
    return e2e_observe()

try:
    if MODE=="status":result=observe()
    elif MODE=="apply":result=stage()
    elif MODE=="e2e-status":result=e2e_observe()
    elif MODE=="e2e":result=e2e_stage()
    else:raise RuntimeError("unknown mode")
    print(json.dumps(result,separators=(",",":")))
except Exception as exc:
    paid=MODE.startswith("e2e")
    print(json.dumps({"phase":"E2E_FAILED" if paid else "STOPPED_BEFORE_LAUNCH",
                      "paidGenerationRequested":paid,"generationRequested":paid,"error":str(exc)[:700]}))
'''

class LaunchError(RuntimeError):pass
def blob(raw):return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def package():
    base=Path(__file__).resolve().parent;out={}
    for name,expected in FILES.items():
        raw=(base/name).read_bytes()
        if len(raw)>262144 or blob(raw)!=expected:raise LaunchError("Local reviewed maintenance file mismatch: "+name)
        compile(raw,name,"exec");out[name]=base64.b64encode(raw).decode()
    return out
def ssh_command(key):
    return ["ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes",
      "-o","BatchMode=yes","-o","ConnectTimeout=20","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=3",
      "opc@"+HOST,"PYTHONDONTWRITEBYTECODE=1 python3 -"]
def call_remote(key,mode,payload,timeout=60):
    data="MODE="+repr(mode)+"\nEXPECTED="+repr(FILES)+"\nPACKAGE="+repr(payload)+"\n"+REMOTE
    try:p=subprocess.run(ssh_command(key),input=data,capture_output=True,text=True,timeout=timeout)
    except subprocess.TimeoutExpired:raise LaunchError("Cloud Shell connection timed out; the remote systemd task may still be running. Re-run the same command.") from None
    except OSError:raise LaunchError("SSH command unavailable in this Cloud Shell.") from None
    if p.returncode:raise LaunchError("SSH connection failed. Do not disable host verification.") from None
    try:value=json.loads(p.stdout)
    except Exception:raise LaunchError("Oracle returned invalid status JSON.") from None
    if not isinstance(value,dict):raise LaunchError("Unexpected Oracle response.")
    if mode in ("apply","status") and value.get("paidGenerationRequested") is not False:
        raise LaunchError("Maintenance unexpectedly reported a paid generation.")
    return value
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--approve-service-restart",action="store_true");parser.add_argument("--status",action="store_true");args=parser.parse_args()
    if not args.approve_service_restart and not args.status:
        print(json.dumps({"phase":"PLAN_ONLY","host":HOST,"paidGenerationRequested":False,"generationRequested":False,"disconnectSafe":True},indent=2));return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise LaunchError("Existing Cloud Shell SSH key missing.")
    mode="status" if args.status else "apply";value=call_remote(key,mode,{} if mode=="status" else package())
    started=time.monotonic()
    while value.get("phase")=="INSTALLATION_RUNNING" and time.monotonic()-started<300:
        print("Oracle export maintenance: running safely on VM...",flush=True);time.sleep(6);value=call_remote(key,"status",{},timeout=50)
    print(json.dumps(value,indent=2))
    if value.get("phase") in SUCCESS:
        if value.get("posthocExportRevision")!=2 or value.get("legacyGlbExportRecoveryRevision")!=1:raise LaunchError("Installer completed without required export capability.")
        if value.get("workerService")!="active" or value.get("tunnelService")!="active":raise LaunchError("Worker/tunnel not active.")
        print("WORLDIFACT_DIRECT_EXPORT_P0_COMPLETE");return
    if value.get("phase")=="INSTALLATION_RUNNING":
        print("REMOTE_MAINTENANCE_CONTINUES. Re-run this same command to read the result.");return
    raise LaunchError("Oracle maintenance stopped safely: "+str(value.get("phase","UNKNOWN"))+" "+str(value.get("error",""))[:300])
if __name__=="__main__":
    try:main()
    except LaunchError as exc:print("STOP: "+str(exc)[:700],file=sys.stderr);sys.exit(1)
