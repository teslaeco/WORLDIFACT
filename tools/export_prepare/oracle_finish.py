"""Finish WORLDIFACT Oracle P0 in one controlled Cloud Shell command.

Recognizes only three reviewed worker revisions:
FAST v33 base -> project-files -> post-hoc export preparation.
It refuses unknown source, active model jobs, wrong VM/service state or failed
health. Each reviewed installer makes its own backup and rollback. No Astra/
OpenAI generation, checkout, payment, B2B order or manufacturing action occurs.
"""
import argparse
import base64
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

SOURCE="a512296b7e8a852d0141bc407adde5f16beba5a9"
FILES={
 "project_files/patch_server.py":("tools/project_files/patch_server.py","f6002b9ae5eae6cbbca1ae19fac5eb9faae17285"),
 "project_files/install_project_files.py":("tools/project_files/install_project_files.py","2d28e7ccd19baba61594c50f4081fa091d57de83"),
 "export_prepare/patch_server.py":("tools/export_prepare/patch_server.py","e034736a4123bd16e973aa52843dff04aa367cc0"),
 "export_prepare/install_export_prepare.py":("tools/export_prepare/install_export_prepare.py","965151fec6ae7c14ee55acc56fdfa9a3d51bca88"),
}
BASE="1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9"
PROJECT="6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14"
EXPORT="aa18c1d081c5e29c2481def9874b46082dbfaf6e58664bb07b1b28fbbea9206a"

REMOTE=r'''
import base64,hashlib,json,os,platform,pwd,sqlite3,stat,subprocess,sys,urllib.request
from pathlib import Path

BASE="1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9"
PROJECT="6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14"
EXPORT="aa18c1d081c5e29c2481def9874b46082dbfaf6e58664bb07b1b28fbbea9206a"
root=Path.home()/"froge-connector"

def gitblob(raw):
    return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""):h.update(b)
    return h.hexdigest()
def cmd(args,timeout=40):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError("Required service check failed.")
    return p.stdout.strip()
def state(unit):
    try:return cmd(["systemctl","--user","show",unit,"--property=ActiveState","--value"])
    except Exception:return "unknown"
def active_jobs():
    db=root/"state/jobs.sqlite"
    if db.is_symlink() or not db.is_file():raise RuntimeError("Job database unavailable.")
    with sqlite3.connect(db,timeout=5) as con:
        return con.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]
def health():
    cfg=root/"state/config.json"
    if cfg.is_symlink() or not cfg.is_file() or cfg.stat().st_size>16384:raise RuntimeError("Worker config unavailable.")
    token=json.loads(cfg.read_text()).get("token")
    if not isinstance(token,str) or not 20<=len(token)<=256:raise RuntimeError("Worker token invalid.")
    req=urllib.request.Request("http://127.0.0.1:8765/v1/health",headers={"Authorization":"Bearer "+token,"Accept":"application/json"})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=12) as r:
        if r.status!=200:raise RuntimeError("Local health failed.")
        b=json.loads(r.read(32768))
    return {k:b.get(k) for k in ("ready","provider","model","connectorVersion","projectFilesRevision","posthocExportRevision")}
def run_installer(path,cwd):
    p=subprocess.run(["/usr/bin/python3","-B",str(path),"--approve-service-restart"],
        cwd=cwd,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=240)
    try:data=json.loads(p.stdout)
    except Exception:data={"phase":"INVALID_INSTALLER_OUTPUT","paidGenerationRequested":False}
    if p.returncode or data.get("phase") not in ("INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"):
        raise RuntimeError(json.dumps({"stage":path.parent.name,"result":data},separators=(",",":")))
    return data

result={"phase":"STARTING","paidGenerationRequested":False,"generationRequested":False}
try:
    if pwd.getpwuid(os.getuid()).pw_name!="opc" or os.getuid()==0 or platform.machine()!="aarch64":
        raise RuntimeError("Expected unprivileged Oracle ARM opc session.")
    if root.resolve()!=Path.home()/"froge-connector" or root.is_symlink():
        raise RuntimeError("Unexpected worker directory.")
    if state("froge-worker.service")!="active" or state("froge-tunnel.service")!="active":
        raise RuntimeError("Worker and tunnel must be active.")
    if cmd(["systemctl","--user","show","froge-worker.service","--property=WorkingDirectory","--value"])!=str(root):
        raise RuntimeError("Worker service points at another directory.")
    if active_jobs()!=0:raise RuntimeError("A model job is active; nothing changed.")
    server=root/"server.py"
    if server.is_symlink() or not server.is_file():raise RuntimeError("Worker server.py unavailable.")
    current=sha(server)
    result["initialServerSha256"]=current
    if current not in (BASE,PROJECT,EXPORT):raise RuntimeError("Unknown server.py revision; nothing changed.")

    job=Path.home()/".local/state/worldifact-export-finish"/SOURCE
    job.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(job,0o700)
    for rel,(blob_sha,encoded) in PACKAGE.items():
        raw=base64.b64decode(encoded,validate=True)
        if len(raw)>262144 or gitblob(raw)!=blob_sha:raise RuntimeError("Reviewed package verification failed.")
        compile(raw,rel,"exec")
        target=job/rel
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(target.parent,0o700)
        if target.exists():
            if target.is_symlink() or target.read_bytes()!=raw:raise RuntimeError("Existing maintenance package differs.")
        else:
            fd=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())

    steps=[]
    if current==BASE:
        if active_jobs()!=0:raise RuntimeError("A model job started before project-files maintenance.")
        steps.append(run_installer(job/"project_files/install_project_files.py",job/"project_files"))
        current=sha(server)
        if current!=PROJECT:raise RuntimeError("Project-files stage did not reach reviewed hash.")
    if current==PROJECT:
        if active_jobs()!=0:raise RuntimeError("A model job started before export maintenance.")
        steps.append(run_installer(job/"export_prepare/install_export_prepare.py",job/"export_prepare"))
        current=sha(server)
        if current!=EXPORT:raise RuntimeError("Export stage did not reach reviewed hash.")

    h=health()
    if current!=EXPORT or h.get("ready") is not True or h.get("connectorVersion")!=33 or h.get("projectFilesRevision")!=1 or h.get("posthocExportRevision")!=1:
        raise RuntimeError("Final worker capability verification failed.")
    result.update({"phase":"INSTALLED_AND_LOCALLY_VERIFIED","finalServerSha256":current,
        "workerService":state("froge-worker.service"),"tunnelService":state("froge-tunnel.service"),
        "activeJobs":active_jobs(),"health":h,"steps":steps})
except Exception as exc:
    result.update({"phase":"STOPPED_OR_ROLLED_BACK","error":str(exc)[:1000],
        "workerService":state("froge-worker.service"),"tunnelService":state("froge-tunnel.service")})
print(json.dumps(result,indent=2))
sys.exit(0 if result["phase"]=="INSTALLED_AND_LOCALLY_VERIFIED" else 1)
'''

class FinishError(RuntimeError):pass
def invoke(args,data=None,timeout=600):
    try:p=subprocess.run(args,input=data,capture_output=True,text=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired):raise FinishError("Connection timed out. Re-run this same command; reviewed installers are idempotent.") from None
    if p.returncode:
        if p.stdout.strip():print(p.stdout)
        raise FinishError("Oracle maintenance stopped safely. Use the JSON above; do not bypass checks.")
    return p.stdout
def one(text,label):
    try:v=json.loads(text)
    except ValueError:raise FinishError("OCI returned invalid JSON for "+label) from None
    if not isinstance(v,list) or len(v)!=1 or not isinstance(v[0],str) or not v[0]:
        raise FinishError("Expected exactly one "+label+".")
    return v[0]
def gitblob(raw):
    return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()
def connection():
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise FinishError("Existing Cloud Shell SSH key missing.")
    oci=["oci","--region","eu-amsterdam-1"]
    instance=one(invoke(oci+["search","resource","structured-search","--query-text",
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        "--query","data.items[].identifier","--output","json"],timeout=90),"running Froge VM")
    address=one(invoke(oci+["compute","instance","list-vnics","--instance-id",instance,"--all",
        "--query",'data[?"is-primary" == `true`]."public-ip"',"--output","json"],timeout=90),"primary public IP")
    ipaddress.ip_address(address)
    return ["ssh","-T","-i",str(key),"-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes",
        "-o","BatchMode=yes","-o","ConnectTimeout=20","-o","ServerAliveInterval=15",
        "-o","ServerAliveCountMax=3","opc@"+address,"PYTHONDONTWRITEBYTECODE=1 python3 -"]
def package():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**k):return None
    opener=urllib.request.build_opener(NoRedirect())
    out={}
    for rel,(path,expected) in FILES.items():
        url="https://raw.githubusercontent.com/teslaeco/WORLDIFACT/"+SOURCE+"/"+path
        with opener.open(url,timeout=45) as r:raw=r.read(262145)
        if len(raw)>262144 or gitblob(raw)!=expected:raise FinishError("Pinned maintenance source failed verification: "+rel)
        compile(raw,rel,"exec")
        out[rel]=(expected,base64.b64encode(raw).decode())
    return out
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approve-service-restart",action="store_true")
    args=parser.parse_args()
    if not args.approve_service_restart:
        print(json.dumps({"phase":"PLAN_ONLY","paidGenerationRequested":False,"generationRequested":False,
            "path":"FAST_V33_BASE -> PROJECT_FILES -> EXPORT_PREPARE"},indent=2));return
    data="PACKAGE="+repr(package())+"\nSOURCE="+repr(SOURCE)+"\n"+REMOTE
    out=invoke(connection(),data=data,timeout=600)
    print(out)
    value=json.loads(out)
    if value.get("phase")!="INSTALLED_AND_LOCALLY_VERIFIED" or value.get("health",{}).get("posthocExportRevision")!=1:
        raise FinishError("Final export-preparation verification failed.")
    print("WORLDIFACT_ORACLE_P0_COMPLETE")
if __name__=="__main__":
    try:main()
    except (FinishError,ValueError,urllib.error.URLError) as e:
        print("STOP: "+str(e)[:500],file=sys.stderr);sys.exit(1)
