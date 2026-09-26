"""Disconnect-safe Oracle launcher for the reviewed direct-v33 export fix.

Run from the owner's OCI Cloud Shell. The command only needs SSH long enough to
stage and start a transient user-systemd maintenance unit on froge-blender.
The VM then finishes independently if the phone/browser disconnects. Re-running
the same approved command is idempotent: it observes the recorded unit/result
instead of launching a second installer.

No AI/model request, new generation, checkout, payment, supplier or B2B action.
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
UNIT="worldifact-direct-export-v2-385811ea.service"
FILES={
    "direct_v33_patch.py":"385811ea2aeb8a817328ffed584ab79e48c10026",
    "install_direct_v33_export.py":"5f8b3ed18ca72ecbb375e627ba6f0b042044f83e",
}
TERMINAL={
    "INSTALLED_AND_LOCALLY_VERIFIED",
    "ALREADY_INSTALLED_AND_VERIFIED",
    "STOPPED_OR_ROLLED_BACK",
    "INVALID_INSTALLER_OUTPUT",
    "LAUNCH_FAILED",
    "STOPPED_BEFORE_LAUNCH",
}

REMOTE=r'''
import base64,fcntl,hashlib,json,os,re,stat,subprocess,sys
from pathlib import Path

UNIT="worldifact-direct-export-v2-385811ea.service"
ROOT=Path.home()/".local/state/worldifact-direct-export-v2"
RESULT=ROOT/"result.json"
MARKER=ROOT/"launch.json"

RUNNER=r"""
import json,os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent
result=root/"result.json"
try:
    p=subprocess.run(
        ["/usr/bin/python3","-B",str(root/"install_direct_v33_export.py"),"--approve-service-restart"],
        cwd=root,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=180
    )
    try:
        value=json.loads(p.stdout)
        if not isinstance(value,dict):raise ValueError()
    except Exception:
        value={"phase":"INVALID_INSTALLER_OUTPUT","paidGenerationRequested":False}
    value["runnerExitCode"]=p.returncode
except BaseException as exc:
    value={"phase":"LAUNCH_FAILED","paidGenerationRequested":False,
           "generationRequested":False,"runnerExitCode":127,
           "error":type(exc).__name__}
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

def unit_state():
    try:
        value=command(["systemctl","--user","show",UNIT,"--property=ActiveState","--value"])
        return value if re.fullmatch(r"[A-Za-z0-9_-]{1,40}",value) else "unknown"
    except Exception:
        return "unknown"

def worker_state(name):
    try:
        value=command(["systemctl","--user","show",name,"--property=ActiveState","--value"])
        return value if re.fullmatch(r"[A-Za-z0-9_-]{1,40}",value) else "unknown"
    except Exception:
        return "unknown"

def safe_read(path,limit=65536):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:
        raise RuntimeError("unsafe maintenance result")
    return path.read_text()

def observe():
    out={
      "phase":"NOT_STARTED",
      "paidGenerationRequested":False,
      "generationRequested":False,
      "maintenanceService":unit_state(),
      "workerService":worker_state("froge-worker.service"),
      "tunnelService":worker_state("froge-tunnel.service"),
    }
    if RESULT.exists():
        try:value=json.loads(safe_read(RESULT))
        except Exception:return {**out,"phase":"LAUNCH_FAILED","error":"Unreadable maintenance result."}
        if isinstance(value,dict):
            allowed={"phase","source_sha256","backup","connectorVersion","posthocExportRevision",
                     "legacyGlbExportRecoveryRevision","paidGenerationRequested","generationRequested",
                     "runnerExitCode","error"}
            out.update({k:v for k,v in value.items() if k in allowed})
        return out
    if MARKER.exists():
        state=out["maintenanceService"]
        out["phase"]="INSTALLATION_RUNNING" if state in ("active","activating") else "LAUNCH_FAILED"
    return out

def stage():
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(ROOT,0o700)
    lock_path=ROOT/"launch.lock"
    fd=os.open(str(lock_path),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        current=observe()
        if current["phase"]!="NOT_STARTED":
            return current
        if set(PACKAGE)!=set(EXPECTED):raise RuntimeError("incomplete reviewed package")
        for name,expected in EXPECTED.items():
            raw=base64.b64decode(PACKAGE[name],validate=True)
            if len(raw)>262144 or blob(raw)!=expected:raise RuntimeError("package hash mismatch")
            compile(raw,name,"exec")
            path=ROOT/name
            if path.exists():
                if path.is_symlink() or path.read_bytes()!=raw:raise RuntimeError("existing maintenance file differs")
            else:
                out=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                with os.fdopen(out,"wb") as stream:
                    stream.write(raw);stream.flush();os.fsync(stream.fileno())
        runner=ROOT/"runner.py"
        if runner.exists():
            if runner.is_symlink() or runner.read_text()!=RUNNER:raise RuntimeError("existing runner differs")
        else:
            runner.write_text(RUNNER);os.chmod(runner,0o600)
        marker={"unit":UNIT,"approval":"service-restart-only-no-ai","revision":2}
        tmp=ROOT/"launch.json.tmp";tmp.write_text(json.dumps(marker));os.chmod(tmp,0o600);os.replace(tmp,MARKER)
        subprocess.run(["systemctl","--user","reset-failed",UNIT],
                       stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        p=subprocess.run([
            "systemd-run","--user","--unit="+UNIT,
            "--property=Type=exec","--property=UMask=0077",
            "--property=WorkingDirectory="+str(ROOT),
            "--setenv=PYTHONDONTWRITEBYTECODE=1",
            "/usr/bin/python3","-B",str(runner)
        ],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if p.returncode:
            return {**observe(),"phase":"STOPPED_BEFORE_LAUNCH","error":"Could not start maintenance unit."}
    return observe()

try:
    if MODE=="status":result=observe()
    elif MODE=="apply":result=stage()
    else:raise RuntimeError("unknown mode")
    print(json.dumps(result,separators=(",",":")))
except Exception as exc:
    print(json.dumps({"phase":"STOPPED_BEFORE_LAUNCH","paidGenerationRequested":False,
                      "generationRequested":False,"error":str(exc)[:240]}))
'''

class LaunchError(RuntimeError):pass

def blob(raw):
    return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()

def package():
    base=Path(__file__).resolve().parent
    out={}
    for name,expected in FILES.items():
        raw=(base/name).read_bytes()
        if len(raw)>262144 or blob(raw)!=expected:
            raise LaunchError("Local reviewed maintenance file mismatch: "+name)
        compile(raw,name,"exec")
        out[name]=base64.b64encode(raw).decode()
    return out

def ssh_command(key):
    return [
      "ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes",
      "-o","StrictHostKeyChecking=yes","-o","BatchMode=yes",
      "-o","ConnectTimeout=20","-o","ServerAliveInterval=15",
      "-o","ServerAliveCountMax=3","opc@"+HOST,
      "PYTHONDONTWRITEBYTECODE=1 python3 -"
    ]

def call_remote(key,mode,payload,timeout=60):
    data="MODE="+repr(mode)+"\nEXPECTED="+repr(FILES)+"\nPACKAGE="+repr(payload)+"\n"+REMOTE
    try:
        p=subprocess.run(ssh_command(key),input=data,capture_output=True,text=True,timeout=timeout)
    except subprocess.TimeoutExpired:
        raise LaunchError("Cloud Shell connection timed out. The remote systemd maintenance may still be running; re-run the same command.") from None
    except OSError:
        raise LaunchError("SSH command unavailable in this Cloud Shell.") from None
    if p.returncode:
        raise LaunchError("SSH connection failed. Re-run the same command; do not disable host verification.") from None
    try:value=json.loads(p.stdout)
    except Exception:raise LaunchError("Oracle returned an invalid maintenance status.") from None
    if not isinstance(value,dict) or value.get("paidGenerationRequested") is not False:
        raise LaunchError("Unexpected Oracle maintenance response.")
    return value

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approve-service-restart",action="store_true")
    parser.add_argument("--status",action="store_true")
    args=parser.parse_args()
    if not args.approve_service_restart and not args.status:
        print(json.dumps({"phase":"PLAN_ONLY","host":HOST,"paidGenerationRequested":False,
                          "generationRequested":False,"disconnectSafe":True},indent=2))
        return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):
        raise LaunchError("Existing Cloud Shell SSH key missing.")
    mode="status" if args.status else "apply"
    value=call_remote(key,mode,{} if mode=="status" else package())
    started=time.monotonic()
    while value.get("phase")=="INSTALLATION_RUNNING" and time.monotonic()-started<150:
        print("Oracle export maintenance: running safely on VM…",flush=True)
        time.sleep(5)
        value=call_remote(key,"status",{},timeout=45)
    print(json.dumps(value,indent=2))
    if value.get("phase") in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"):
        if value.get("posthocExportRevision")!=2 or value.get("legacyGlbExportRecoveryRevision")!=1:
            raise LaunchError("Installer completed without the required export capability.")
        if value.get("workerService")!="active" or value.get("tunnelService")!="active":
            raise LaunchError("Export capability installed but worker/tunnel health is not active.")
        print("WORLDIFACT_DIRECT_EXPORT_P0_COMPLETE")
        return
    if value.get("phase")=="INSTALLATION_RUNNING":
        print("REMOTE_MAINTENANCE_CONTINUES. Re-run this same command to read the result.")
        return
    raise LaunchError("Oracle maintenance stopped safely: "+str(value.get("phase","UNKNOWN")))

if __name__=="__main__":
    try:main()
    except LaunchError as exc:
        print("STOP: "+str(exc)[:500],file=sys.stderr);sys.exit(1)
