"""Synchronous/resumable Oracle direct-export launcher.

The earlier transient user-systemd launchers could enter ActiveState=failed
before runner.py wrote a result. This v4 path removes that layer completely:
the existing OCI Cloud Shell SSH session runs the reviewed installer directly
and returns its exact JSON. The installer itself is rollback-safe and
idempotent. The one-job E2E verifier is also resumable by job id, so re-running
the same command after a phone/browser disconnect cannot create a second model.
"""
import argparse,base64,hashlib,json,os
from pathlib import Path
import subprocess,sys

HOST="141.148.242.30"
FILES={
    "direct_v33_patch.py":"385811ea2aeb8a817328ffed584ab79e48c10026",
    "patch_server.py":"e034736a4123bd16e973aa52843dff04aa367cc0",
    "upgrade_direct_v33_export.py":"4c7758da210c7c04b0f51dfaa95ab5cf7c0c83bc",
    "install_direct_v33_export_v3.py":"dc69b5687aa3c3eeae4e403e3618ec761a0c4acf",
    "oracle_worker_e2e.py":"5230b3adb092c44a1820c58c88e3e7023b0da604",
}
SUCCESS={"INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"}

REMOTE=r'''
import base64,hashlib,json,os,subprocess
from pathlib import Path

ROOT=Path.home()/".local/state/worldifact-direct-export-v4"
RESULT=ROOT/"result.json"
E2E_RESULT=ROOT/"e2e/result.json"

def blob(raw):return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def service_state(name):
    try:
        p=subprocess.run(["systemctl","--user","show",name,"--property=ActiveState","--value"],
            stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=20)
        return p.stdout.strip() if p.returncode==0 else "unknown"
    except Exception:return "unknown"
def stage():
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(ROOT,0o700)
    if set(PACKAGE)!=set(EXPECTED):raise RuntimeError("incomplete reviewed package")
    for name,expected in EXPECTED.items():
        raw=base64.b64decode(PACKAGE[name],validate=True)
        if len(raw)>262144 or blob(raw)!=expected:raise RuntimeError("package hash mismatch: "+name)
        compile(raw,name,"exec")
        path=ROOT/name
        if path.exists():
            if path.is_symlink() or path.read_bytes()!=raw:raise RuntimeError("existing v4 maintenance file differs: "+name)
        else:
            fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,"wb") as stream:
                stream.write(raw);stream.flush();os.fsync(stream.fileno())
def safe_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>262144:return None
    try:
        value=json.loads(path.read_text())
        return value if isinstance(value,dict) else None
    except Exception:return None
def status():
    value=safe_json(RESULT) or {"phase":"NOT_STARTED","paidGenerationRequested":False,"generationRequested":False}
    value={**value,"workerService":service_state("froge-worker.service"),"tunnelService":service_state("froge-tunnel.service")}
    return value
def run_installer():
    stage()
    p=subprocess.run(["/usr/bin/python3","-B",str(ROOT/"install_direct_v33_export_v3.py"),"--approve-service-restart"],
        cwd=ROOT,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=330)
    try:
        value=json.loads(p.stdout)
        if not isinstance(value,dict):raise ValueError()
    except Exception:
        value={"phase":"INVALID_INSTALLER_OUTPUT","paidGenerationRequested":False,"generationRequested":False,
               "error":("stdout="+p.stdout[-1400:]+" stderr="+p.stderr[-1400:])[-2600:]}
    value["runnerExitCode"]=p.returncode
    value["workerService"]=service_state("froge-worker.service")
    value["tunnelService"]=service_state("froge-tunnel.service")
    tmp=ROOT/"result.json.tmp";tmp.write_text(json.dumps(value,separators=(",",":")));os.chmod(tmp,0o600);os.replace(tmp,RESULT)
    return value
def e2e_status():
    value=safe_json(E2E_RESULT) or {"phase":"E2E_NOT_STARTED","paidGenerationRequested":False,"generationRequested":False}
    value={**value,"workerService":service_state("froge-worker.service"),"tunnelService":service_state("froge-tunnel.service")}
    return value
def run_e2e():
    stage()
    installed=status()
    if installed.get("phase") not in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"):
        return {"phase":"E2E_FAILED","paidGenerationRequested":False,"generationRequested":False,
                "error":"Export capability is not installed and verified."}
    if installed.get("posthocExportRevision")!=2 or installed.get("legacyGlbExportRecoveryRevision")!=1:
        return {"phase":"E2E_FAILED","paidGenerationRequested":False,"generationRequested":False,
                "error":"Required export capability markers are missing."}
    p=subprocess.run(["/usr/bin/python3","-B",str(ROOT/"oracle_worker_e2e.py")],
        cwd=ROOT,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=1300)
    value=safe_json(E2E_RESULT)
    if value is None:
        value={"phase":"E2E_FAILED","paidGenerationRequested":True,"generationRequested":True,
               "automaticGenerationRetries":0,"error":("stdout="+p.stdout[-1400:]+" stderr="+p.stderr[-1400:])[-2600:]}
    value["runnerExitCode"]=p.returncode
    value["workerService"]=service_state("froge-worker.service")
    value["tunnelService"]=service_state("froge-tunnel.service")
    return value

try:
    if MODE=="status":result=status()
    elif MODE=="apply":result=run_installer()
    elif MODE=="e2e-status":result=e2e_status()
    elif MODE=="e2e":result=run_e2e()
    else:raise RuntimeError("unknown mode")
    print(json.dumps(result,separators=(",",":")))
except subprocess.TimeoutExpired:
    path=E2E_RESULT if MODE=="e2e" else RESULT
    value=safe_json(path) or {"phase":"E2E_RUNNING" if MODE=="e2e" else "INSTALLATION_RUNNING"}
    value["transportTimeout"]=True
    value["workerService"]=service_state("froge-worker.service")
    value["tunnelService"]=service_state("froge-tunnel.service")
    print(json.dumps(value,separators=(",",":")))
except Exception as exc:
    print(json.dumps({"phase":"E2E_FAILED" if MODE.startswith("e2e") else "STOPPED_BEFORE_LAUNCH",
      "paidGenerationRequested":MODE.startswith("e2e"),"generationRequested":MODE.startswith("e2e"),
      "error":(type(exc).__name__+":"+str(exc))[:1200],
      "workerService":service_state("froge-worker.service"),"tunnelService":service_state("froge-tunnel.service")},separators=(",",":")))
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
    return ["ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes","-o","BatchMode=yes",
      "-o","ConnectTimeout=20","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=6",
      "opc@"+HOST,"PYTHONDONTWRITEBYTECODE=1 python3 -"]
def call_remote(key,mode,payload,timeout=60):
    data="MODE="+repr(mode)+"\nEXPECTED="+repr(FILES)+"\nPACKAGE="+repr(payload)+"\n"+REMOTE
    try:p=subprocess.run(ssh_command(key),input=data,capture_output=True,text=True,timeout=timeout)
    except subprocess.TimeoutExpired:raise LaunchError("SSH wait timed out. Re-run the SAME command; the E2E state/job id is persisted and no second generation is created.") from None
    except OSError:raise LaunchError("SSH command unavailable in this Cloud Shell.") from None
    if p.returncode:raise LaunchError("SSH connection failed. Do not disable host verification.") from None
    try:value=json.loads(p.stdout)
    except Exception:raise LaunchError("Oracle returned invalid status JSON: "+p.stdout[-500:]) from None
    if not isinstance(value,dict):raise LaunchError("Unexpected Oracle response.")
    return value
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--approve-service-restart",action="store_true");parser.add_argument("--status",action="store_true");args=parser.parse_args()
    if not args.approve_service_restart and not args.status:
        print(json.dumps({"phase":"PLAN_ONLY","host":HOST,"paidGenerationRequested":False,"generationRequested":False,
          "synchronous":True,"resumable":True},indent=2));return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise LaunchError("Existing Cloud Shell SSH key missing.")
    mode="status" if args.status else "apply"
    value=call_remote(key,mode,{} if mode=="status" else package(),timeout=380 if mode=="apply" else 70)
    print(json.dumps(value,indent=2))
    if mode=="status":return
    if value.get("phase") in SUCCESS and value.get("posthocExportRevision")==2 and value.get("legacyGlbExportRecoveryRevision")==1:
        print("WORLDIFACT_DIRECT_EXPORT_P0_COMPLETE");return
    raise LaunchError("Oracle maintenance stopped safely: "+str(value.get("phase","UNKNOWN"))+" "+str(value.get("error",""))[:700])
if __name__=="__main__":
    try:main()
    except LaunchError as exc:print("STOP: "+str(exc)[:900],file=sys.stderr);sys.exit(1)
