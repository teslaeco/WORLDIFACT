"""Install direct Oracle export v2 over any exact reviewed v33 production revision.

No AI/model request. Refuses unknown source and active model jobs, backs up the
exact current server, restarts only froge-worker.service, verifies authenticated
local health, and rolls back to the exact starting bytes on failure.
"""
import argparse,hashlib,json,os,platform,sqlite3,stat,subprocess,sys,tempfile,time,urllib.error,urllib.request
from pathlib import Path
from upgrade_direct_v33_export import patch_known

WORKER="froge-worker.service"
TUNNEL="froge-tunnel.service"

class InstallError(RuntimeError):pass
def sha256(raw):return hashlib.sha256(raw).hexdigest()
def regular(path,maximum=2*1024*1024):
    path=Path(path)
    if path.is_symlink() or path.parent.is_symlink() or not path.is_file():raise InstallError("Missing or unsafe file: "+str(path))
    info=path.stat()
    if not stat.S_ISREG(info.st_mode) or not 1<=info.st_size<=maximum:raise InstallError("Unexpected file size: "+str(path))
    return path.read_bytes()
def command(args,timeout=30):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise InstallError("Service verification command failed.")
    return p.stdout.strip()
def state(name):return command(["systemctl","--user","show",name,"--property=ActiveState","--value"])
def active_jobs(source):
    path=source/"state/jobs.sqlite"
    if path.is_symlink() or not path.is_file():raise InstallError("Job database unavailable.")
    with sqlite3.connect(path,timeout=5) as db:
        return db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]
def raw_health(source):
    cfg=json.loads(regular(source/"state/config.json",16384))
    token=cfg.get("token")
    if not isinstance(token,str) or not 20<=len(token)<=256:raise InstallError("Worker token invalid.")
    req=urllib.request.Request("http://127.0.0.1:8765/v1/health",headers={"Authorization":"Bearer "+token,"Accept":"application/json"})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=8) as r:
        if r.status!=200:raise InstallError("Local health did not return 200.")
        return json.loads(r.read(32768))
def verified_health(source):
    last=None;deadline=time.monotonic()+75
    while time.monotonic()<deadline:
        try:
            body=raw_health(source)
            if body.get("ready") is not True or body.get("provider")!="openai" or body.get("model")!="gpt-6-astra":
                raise InstallError("Existing worker is not ready.")
            if body.get("connectorVersion")!=33 or body.get("posthocExportRevision")!=2 or body.get("legacyGlbExportRecoveryRevision")!=1:
                raise InstallError("Direct export capability was not verified after restart.")
            return {"connectorVersion":33,"posthocExportRevision":2,"legacyGlbExportRecoveryRevision":1,
                    **({"projectFilesRevision":body["projectFilesRevision"]} if isinstance(body.get("projectFilesRevision"),int) else {})}
        except (urllib.error.URLError,ConnectionError,TimeoutError,OSError) as e:
            last=e
            if state(WORKER)=="failed":raise InstallError("Worker failed while waiting for health.") from None
            time.sleep(2)
    raise InstallError("Worker did not reopen verified local health within 75 seconds.") from last
def atomic_write(path,raw,mode):
    path=Path(path)
    if path.is_symlink() or path.parent.is_symlink():raise InstallError("Unsafe target path.")
    fd,pending=tempfile.mkstemp(prefix=".worldifact-direct-export-v3-",dir=path.parent)
    try:
        with os.fdopen(fd,"wb") as out:
            os.fchmod(out.fileno(),mode);out.write(raw);out.flush();os.fsync(out.fileno())
        os.replace(pending,path)
        directory=os.open(str(path.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(pending):os.unlink(pending)
def install(source):
    source=Path(source).resolve();expected=Path.home()/"froge-connector"
    if os.getuid()==0 or platform.machine()!="aarch64" or sys.version_info<(3,9):raise InstallError("Run as existing unprivileged Oracle ARM user with Python 3.9+.")
    if source!=expected or source.is_symlink():raise InstallError("Unexpected worker directory.")
    if state(WORKER)!="active" or state(TUNNEL)!="active":raise InstallError("Worker and tunnel must be active before maintenance.")
    if command(["systemctl","--user","show",WORKER,"--property=WorkingDirectory","--value"])!=str(source):raise InstallError("Worker service points at another directory.")
    if active_jobs(source)!=0:raise InstallError("A model job is active. Nothing was changed.")
    server=source/"server.py";original=regular(server);current=sha256(original)
    try:
        patched_text,from_revision=patch_known(original.decode("utf-8"))
    except Exception:
        try:
            health=verified_health(source)
            return {"phase":"ALREADY_INSTALLED_AND_VERIFIED","fromRevision":"DIRECT_EXPORT_V2","source_sha256":current,
                    "paidGenerationRequested":False,"generationRequested":False,**health}
        except Exception:
            raise InstallError("Installed server.py is not one of the exact reviewed v33 revisions. Current SHA-256: "+current) from None
    patched=patched_text.encode("utf-8");compile(patched,"server.py","exec");patched_sha=sha256(patched)
    backup=source/"state/code-backups"/("direct-export-v3-"+str(time.time_ns()))
    backup.mkdir(parents=True,mode=0o700);os.chmod(backup,0o700)
    (backup/"server.py").write_bytes(original);os.chmod(backup/"server.py",0o600)
    (backup/"manifest.json").write_text(json.dumps({"feature":"direct-posthoc-export-v3","fromRevision":from_revision,
        "original_sha256":current,"patched_sha256":patched_sha,"paidGenerationRequested":False,"generationRequested":False},indent=2)+"\n")
    os.chmod(backup/"manifest.json",0o600)
    mode=stat.S_IMODE(server.stat().st_mode);stopped=False
    try:
        if active_jobs(source)!=0:raise InstallError("A model job started during maintenance preparation.")
        command(["systemctl","--user","stop",WORKER],timeout=120);stopped=True
        atomic_write(server,patched,mode)
        command(["systemctl","--user","start",WORKER],timeout=60);stopped=False
        health=verified_health(source)
        return {"phase":"INSTALLED_AND_LOCALLY_VERIFIED","fromRevision":from_revision,"fromSha256":current,
                "source_sha256":patched_sha,"backup":str(backup),"paidGenerationRequested":False,
                "generationRequested":False,**health}
    except BaseException:
        try:
            if not stopped:subprocess.run(["systemctl","--user","stop",WORKER],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
            atomic_write(server,original,mode);command(["systemctl","--user","start",WORKER],timeout=60)
            if sha256(regular(server))!=current:raise InstallError("Rollback hash mismatch.")
        except BaseException as rollback:
            raise InstallError("Direct export v3 install failed and rollback could not be verified: "+str(rollback)[:180]) from None
        raise
def main():
    p=argparse.ArgumentParser();p.add_argument("--approve-service-restart",action="store_true");args=p.parse_args()
    if not args.approve_service_restart:
        print(json.dumps({"phase":"PLAN_ONLY","paidGenerationRequested":False,"generationRequested":False},indent=2));return
    print(json.dumps(install(Path.home()/"froge-connector"),indent=2))
if __name__=="__main__":
    try:main()
    except (InstallError,ValueError,UnicodeDecodeError,urllib.error.URLError) as e:
        print(json.dumps({"phase":"STOPPED_OR_ROLLED_BACK","paidGenerationRequested":False,"generationRequested":False,"error":str(e)[:600]},indent=2));sys.exit(1)
