"""Opt-in exact-v33 installer. Default is plan-only; no model API is called.
Requires --approve-service-restart and the reviewed patch tools on the Oracle VM.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from installed_v33 import INSTALLED, blob_sha, stage

WORKER='froge-worker.service'
TUNNEL='froge-tunnel.service'
RECEIPT='tools/codex/verified.json'
VERIFIERS={'install_codex.py':'ee6e3471d947a69196d1d554a6f22acf080b53e9',
 'runtime_check.py':'d55115d74925b10661c8407f4db87ec52a9f0d79',
 'codex_smoke.py':'a0dcb85f28a6ebe944d2f3cd3cd0a84afefdadb6'}
DROPIN=b'[Service]\nEnvironment=FROGE_FAST_DRAFT_V1=1\n'

class InstallError(RuntimeError):pass

def safe_path(path):
    path=Path(path)
    if any(p.is_symlink() for p in (path,*path.parents)):raise InstallError('Refusing a symlink in an installation path.')
    return path

def read_regular(path,maximum=1048576):
    path=safe_path(path);info=path.stat()
    if not stat.S_ISREG(info.st_mode) or not 1<=info.st_size<=maximum:raise InstallError('Missing or unsupported installation file.')
    return path.read_bytes()

def atomic_write(path,data,mode=0o600):
    path=safe_path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,pending=tempfile.mkstemp(prefix='.worldifact-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as output:
            os.fchmod(output.fileno(),mode);output.write(data);output.flush();os.fsync(output.fileno())
        os.replace(pending,path)
        directory=os.open(str(path.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(pending):os.unlink(pending)

def summary_file(folder,phase,**fields):
    value={'phase':phase,'paid_generation_requested':False,**fields}
    atomic_write(Path(folder)/'INSTALL_STATUS.json',(json.dumps(value,indent=2)+'\n').encode())
    return value

def receipt_matches(source):
    data=json.loads(read_regular(Path(source)/RECEIPT,16384))
    expected={n:hashlib.sha256(read_regular(Path(source)/n)).hexdigest() for n in ('codex_runner.py','blender_mcp.py')}
    return data.get('sources')==expected and all(data.get(k) is True for k in ('cli_mcp_roundtrip','code_mode_roundtrip','blender_build_roundtrip'))

class LiveOperations:
    def __init__(self,source,home):
        self.source,self.home=Path(source),Path(home)
        self.dropin=self.home/'.config/systemd/user/froge-worker.service.d/90-worldifact-fast.conf'
    def command(self,args,timeout=30):
        answer=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout)
        if answer.returncode:raise InstallError('A service or verification command failed. No private logs are printed.')
        return answer.stdout.strip()
    def state(self,service):return self.command(['systemctl','--user','show',service,'--property=ActiveState','--value'])
    def preflight(self):
        if os.getuid()==0 or platform.machine()!='aarch64' or sys.version_info<(3,9):raise InstallError('Use the existing unprivileged Oracle ARM user and Python 3.9+.')
        if self.source!=self.home/'froge-connector':raise InstallError('Unexpected worker directory.')
        for name,expected in {**INSTALLED,**VERIFIERS}.items():
            if blob_sha(read_regular(self.source/name))!=expected:raise InstallError('Installed source changed: '+name+'. No service stopped.')
        safe_path(self.dropin)
        if self.dropin.exists():raise InstallError('An existing FAST override needs review; not overwritten.')
        if self.state(WORKER)!='active' or self.state(TUNNEL)!='active':raise InstallError('Existing worker and tunnel must be active before maintenance.')
        if self.command(['systemctl','--user','show',WORKER,'--property=WorkingDirectory','--value'])!=str(self.source):raise InstallError('Service points at another directory.')
        spec=importlib.util.spec_from_file_location('_reviewed_installer',self.source/'install_codex.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        if module.verified_runtime(self.source/'tools/codex') is None or not receipt_matches(self.source):raise InstallError('Current Codex/MCP verification is not valid. No files changed.')
        read_regular(self.source/'state/jobs.sqlite',128*1024*1024);self.assert_idle()
    def assert_idle(self):
        with sqlite3.connect((self.source/'state/jobs.sqlite').as_uri()+'?mode=ro',uri=True,timeout=5) as db:
            count=db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]
        if count!=0:raise InstallError('A model job is active. Nothing is cancelled automatically.')
    @contextmanager
    def quiesce(self):
        # No SQL mutation; block new accepted rows between empty-queue check and stop.
        connection=sqlite3.connect((self.source/'state/jobs.sqlite').as_uri()+'?mode=rw',uri=True,timeout=5)
        stop_attempted=False
        try:
            try:
                connection.execute('BEGIN IMMEDIATE')
                count=connection.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]
                if count!=0:raise InstallError('A job appeared before maintenance. No update applied.')
                stop_attempted=True;self.command(['systemctl','--user','stop',WORKER],timeout=120)
                if self.state(WORKER)!='inactive':raise InstallError('Worker did not stop cleanly.')
                if self.command(['systemctl','--user','show',WORKER,'--property=MainPID','--value'])!='0':raise InstallError('Worker process is still present.')
            except BaseException:
                connection.rollback()
                if stop_attempted:self.start()
                raise
        finally:connection.rollback();connection.close()
        yield
    def verify(self,workspace):
        # Genuine offline round trip; model responses are fixtures. Never calls
        # install_codex, paid_trial, production jobs or an OpenAI model endpoint.
        if blob_sha(read_regular(self.source/'codex_smoke.py'))!=VERIFIERS['codex_smoke.py']:raise InstallError('Verifier changed before execution.')
        env={k:v for k,v in os.environ.items() if not any(w in k.upper() for w in ('TOKEN','SECRET','API_KEY'))}
        env.update(PYTHONDONTWRITEBYTECODE='1',FROGE_FAST_DRAFT_V1='0')
        fd=os.open(str(Path(workspace)/'offline-verification.log'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as output:
            process=subprocess.Popen([sys.executable,'-B',str(self.source/'codex_smoke.py'),'--build'],cwd=self.source,
                env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
            try:
                if process.wait(timeout=600)!=0:raise InstallError('Offline Codex/Blender check failed.')
            except BaseException:
                try:os.killpg(process.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=10)
                raise
        if not receipt_matches(self.source):raise InstallError('Offline verifier did not confirm current source.')
    def enable(self):atomic_write(self.dropin,DROPIN);self.command(['systemctl','--user','daemon-reload'])
    def disable(self):
        if self.dropin.exists():
            if read_regular(self.dropin,1024)!=DROPIN:raise InstallError('FAST override changed; manual recovery required.')
            self.dropin.unlink()
        self.command(['systemctl','--user','daemon-reload'])
    def start(self):self.command(['systemctl','--user','start',WORKER],timeout=120)
    def stop(self):
        self.command(['systemctl','--user','stop',WORKER],timeout=120)
        if self.state(WORKER)!='inactive':raise InstallError('Worker not safely stopped for recovery.')
    def health(self,fast):
        # Existing connection token stays on this VM, used only for a loopback GET.
        config=json.loads(read_regular(self.source/'state/config.json',16384));token=config.get('token')
        if not isinstance(token,str) or not 32<=len(token)<=256:raise InstallError('Local health authorization unavailable.')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        for _ in range(10):
            try:
                req=urllib.request.Request('http://127.0.0.1:8765/v1/health',headers={'Authorization':'Bearer '+token})
                with opener.open(req,timeout=8) as response:
                    raw=response.read(16385)
                    if len(raw)>16384:raise InstallError('Oversized health response.')
                    value=json.loads(raw)
                ok=value.get('ready') is True and value.get('codexReady') is True and value.get('provider')=='openai'
                if fast:ok=ok and value.get('generationProfileRevision')==1 and 'fast-draft-v1' in value.get('generationProfiles',[])
                if ok and self.state(WORKER)=='active' and self.state(TUNNEL)=='active':return True
            except Exception:pass
            time.sleep(2)
        raise InstallError('Local post-update readiness check did not pass.')

def install(source,workspace,operations,approved=False,stage_fn=stage):
    if approved is not True:raise InstallError('Service restart approval required. No files or services changed.')
    source,workspace=safe_path(source),safe_path(workspace)
    if workspace.exists() or source.resolve() in workspace.resolve().parents:raise InstallError('Use a NEW rollback workspace outside the worker.')
    operations.preflight();manifest=stage_fn(source,workspace)
    old_receipt=read_regular(source/RECEIPT,16384);atomic_write(workspace/'original-receipt.json',old_receipt)
    modes={n:stat.S_IMODE((source/n).stat().st_mode) for n in INSTALLED}
    originals={n:read_regular(workspace/'originals'/n) for n in INSTALLED}
    patched={n:read_regular(workspace/'patch'/n) for n in manifest['patched_sha256']}
    if set(patched)!=set(INSTALLED)|{'fast_preview.py'}:raise InstallError('Unexpected patch file list.')
    for name,raw in patched.items():
        if hashlib.sha256(raw).hexdigest()!=manifest['patched_sha256'][name]:raise InstallError('A staged file changed.')
    for name,raw in originals.items():
        if blob_sha(raw)!=INSTALLED[name]:raise InstallError('A rollback original changed.')
    summary_file(workspace,'STAGED_NOT_INSTALLED',profile='fast-draft-v1')
    with operations.quiesce():
        changed=[]
        try:
            operations.assert_idle()
            for name,expected in INSTALLED.items():
                if blob_sha(read_regular(source/name))!=expected:raise InstallError('Source changed after staging.')
            summary_file(workspace,'INSTALLING')
            for name,raw in patched.items():
                changed.append(name)
                atomic_write(source/name,raw,modes.get(name,0o600))
            operations.verify(workspace)
            operations.enable();operations.start();operations.health(True)
            return summary_file(workspace,'INSTALLED_AND_LOCALLY_VERIFIED',profile='fast-draft-v1',
                source_git_blobs=manifest['source_git_blobs'],patched_sha256=manifest['patched_sha256'],site_deployed=False,paid_benchmark_run=False)
        except BaseException as error:
            try:
                operations.stop()
                for name in reversed(changed):
                    path=source/name
                    if name in originals:
                        current=read_regular(path)
                        if current not in (originals[name],patched[name]):raise InstallError('Concurrent source edit; do not overwrite.')
                        atomic_write(path,originals[name],modes[name])
                    elif path.exists():
                        if read_regular(path)!=patched[name]:raise InstallError('FAST helper changed during recovery.')
                        path.unlink()
                atomic_write(source/RECEIPT,old_receipt)
                operations.disable();operations.start();operations.health(False)
                summary_file(workspace,'ROLLED_BACK',reason='Installation/check failed; touched source and receipt restored.')
            except BaseException:
                summary_file(workspace,'RECOVERY_REQUIRED',reason='Automatic recovery not fully verified. Preserve workspace.')
                raise InstallError('Recovery requires review. Do not delete the rollback workspace.') from None
            raise InstallError('FAST was not activated. Original generator restored and locally checked.') from error

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--approve-service-restart',action='store_true');args=parser.parse_args()
    if not args.approve_service_restart:print('PLAN ONLY: exact v33 patch, offline verification, worker restart and rollback. No changes made.');return
    home=Path.home();source=home/'froge-connector'
    parent=safe_path(home/'.local/state/worldifact-fast');parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(str(parent/'installation.lock'),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise InstallError('Another installation is in progress.') from None
        workspace=parent/(time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:8])
        print('Maintenance workspace: '+str(workspace),flush=True)
        print(json.dumps(install(source,workspace,LiveOperations(source,home),approved=True),indent=2))

if __name__=='__main__':
    try:main()
    except InstallError as exc:print('STOP: '+str(exc),file=sys.stderr);sys.exit(1)
