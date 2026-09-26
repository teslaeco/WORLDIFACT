"""Run the reviewed direct-v33 export fix from the owner's OCI Cloud Shell.

One controlled SSH session to the known froge-blender VM. Uses the existing
Cloud Shell key by path only; does not read or print it. Packages only the two
reviewed maintenance files, verifies their Git blob IDs locally and remotely,
runs the rollback-safe installer, and prints one final JSON result.
"""
import argparse,base64,hashlib,json,os,subprocess,sys
from pathlib import Path

HOST="141.148.242.30"
FILES={
    "direct_v33_patch.py":"385811ea2aeb8a817328ffed584ab79e48c10026",
    "install_direct_v33_export.py":"5f8b3ed18ca72ecbb375e627ba6f0b042044f83e",
}
REMOTE=r'''
import base64,hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
def blob(raw):return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
try:
    if os.getuid()==0:raise RuntimeError("root session refused")
    root=Path.home()/".local/state/worldifact-direct-export-v2"
    root.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(root,0o700)
    for name,(expected,encoded) in PACKAGE.items():
        raw=base64.b64decode(encoded,validate=True)
        if len(raw)>262144 or blob(raw)!=expected:raise RuntimeError("package hash mismatch")
        compile(raw,name,"exec")
        path=root/name
        if path.exists():
            if path.is_symlink() or path.read_bytes()!=raw:raise RuntimeError("existing maintenance file differs")
        else:
            fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,"wb") as out:out.write(raw);out.flush();os.fsync(out.fileno())
    p=subprocess.run(["/usr/bin/python3","-B",str(root/"install_direct_v33_export.py"),"--approve-service-restart"],
        cwd=root,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=180)
    try:value=json.loads(p.stdout)
    except Exception:value={"phase":"INVALID_INSTALLER_OUTPUT","paidGenerationRequested":False}
    print(json.dumps(value))
    sys.exit(0 if p.returncode==0 and value.get("phase") in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED") else 1)
except Exception as e:
    print(json.dumps({"phase":"STOPPED_BEFORE_INSTALL","paidGenerationRequested":False,"error":str(e)[:300]}))
    sys.exit(1)
'''
def blob(raw):return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def package():
    base=Path(__file__).resolve().parent;out={}
    for name,expected in FILES.items():
        raw=(base/name).read_bytes()
        if len(raw)>262144 or blob(raw)!=expected:raise RuntimeError("Local maintenance file differs from reviewed Git blob: "+name)
        compile(raw,name,"exec");out[name]=(expected,base64.b64encode(raw).decode())
    return out
def main():
    p=argparse.ArgumentParser();p.add_argument("--approve-service-restart",action="store_true");args=p.parse_args()
    if not args.approve_service_restart:
        print(json.dumps({"phase":"PLAN_ONLY","host":HOST,"paidGenerationRequested":False,"generationRequested":False},indent=2));return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise RuntimeError("Existing Cloud Shell SSH key missing.")
    data="PACKAGE="+repr(package())+"\n"+REMOTE
    cmd=["ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes",
         "-o","BatchMode=yes","-o","ConnectTimeout=20","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=3",
         "opc@"+HOST,"PYTHONDONTWRITEBYTECODE=1 python3 -"]
    result=subprocess.run(cmd,input=data,capture_output=True,text=True,timeout=240)
    if result.stdout.strip():print(json.dumps(json.loads(result.stdout),indent=2))
    if result.returncode:raise RuntimeError("Oracle maintenance stopped safely; no paid generation was requested.")
    value=json.loads(result.stdout)
    if value.get("posthocExportRevision")!=2 or value.get("legacyGlbExportRecoveryRevision")!=1:
        raise RuntimeError("Final Oracle export capability was not verified.")
    print("WORLDIFACT_DIRECT_EXPORT_P0_COMPLETE")
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("STOP: "+str(e)[:400],file=sys.stderr);sys.exit(1)
