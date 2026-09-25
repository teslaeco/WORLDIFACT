"""Install the reviewed no-AI post-hoc export endpoint on exact live v33.

Default is plan-only. With --approve-service-restart it changes server.py only
while the queue is idle, backs up first, restarts froge-worker.service only,
verifies authenticated local health, and rolls back automatically on failure.
It never calls Astra/OpenAI or submits a model job.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from patch_server import patch_server

EXPECTED_SERVER_SHA256='6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14'
PATCHED_SERVER_SHA256='aa18c1d081c5e29c2481def9874b46082dbfaf6e58664bb07b1b28fbbea9206a'
WORKER='froge-worker.service'
TUNNEL='froge-tunnel.service'

class InstallError(RuntimeError):pass

def sha256(raw):return hashlib.sha256(raw).hexdigest()

def regular(path,maximum=2*1024*1024):
    path=Path(path)
    if path.is_symlink() or path.parent.is_symlink() or not path.is_file():raise InstallError('Missing or unsafe file: '+str(path))
    info=path.stat()
    if not stat.S_ISREG(info.st_mode) or not 1<=info.st_size<=maximum:raise InstallError('Unexpected file size: '+str(path))
    return path.read_bytes()

def command(args,timeout=30):
    result=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout)
    if result.returncode:raise InstallError('Service verification command failed.')
    return result.stdout.strip()

def state(name):return command(['systemctl','--user','show',name,'--property=ActiveState','--value'])

def atomic_write(path,raw,mode):
    path=Path(path)
    if path.is_symlink() or path.parent.is_symlink():raise InstallError('Unsafe target path.')
    fd,pending=tempfile.mkstemp(prefix='.worldifact-export-prepare-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as output:
            os.fchmod(output.fileno(),mode);output.write(raw);output.flush();os.fsync(output.fileno())
        os.replace(pending,path)
        directory=os.open(str(path.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(pending):os.unlink(pending)

def active_jobs(source):
    path=source/'state/jobs.sqlite'
    if path.is_symlink() or not path.is_file():raise InstallError('Job database is unavailable.')
    with sqlite3.connect(path,timeout=5) as db:
        return db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]

def local_health(source):
    config=json.loads(regular(source/'state/config.json',16384))
    token=config.get('token')
    if not isinstance(token,str) or not 20<=len(token)<=256:raise InstallError('Worker token is invalid.')
    req=urllib.request.Request('http://127.0.0.1:8765/v1/health',headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=12) as response:
        if response.status!=200:raise InstallError('Local health did not return 200.')
        body=json.loads(response.read(32768))
    if body.get('ready') is not True or body.get('provider')!='openai' or body.get('model')!='gpt-6-astra':
        raise InstallError('Existing worker is not ready after restart.')
    if body.get('connectorVersion')!=33 or body.get('projectFilesRevision')!=1 or body.get('posthocExportRevision')!=1:
        raise InstallError('Export-preparation capability was not verified after restart.')
    return {'connectorVersion':33,'projectFilesRevision':1,'posthocExportRevision':1}

def install(source):
    source=Path(source).resolve();expected=Path.home()/'froge-connector'
    if os.getuid()==0 or platform.machine()!='aarch64' or sys.version_info<(3,9):
        raise InstallError('Run as the existing unprivileged Oracle ARM user with Python 3.9+.')
    if source!=expected or source.is_symlink():raise InstallError('Unexpected worker directory.')
    if state(WORKER)!='active' or state(TUNNEL)!='active':raise InstallError('Worker and tunnel must be active before maintenance.')
    if command(['systemctl','--user','show',WORKER,'--property=WorkingDirectory','--value'])!=str(source):
        raise InstallError('Worker service points at another directory.')
    if active_jobs(source)!=0:raise InstallError('A model job is active. Nothing was changed.')

    server=source/'server.py';original=regular(server);current=sha256(original)
    if current==PATCHED_SERVER_SHA256:
        return {'phase':'ALREADY_INSTALLED_AND_VERIFIED','source_sha256':current,'paidGenerationRequested':False,**local_health(source)}
    if current!=EXPECTED_SERVER_SHA256:raise InstallError('Installed server.py differs from the reviewed v33 + project-files source. Nothing was changed.')
    patched=patch_server(original.decode('utf-8')).encode()
    if sha256(patched)!=PATCHED_SERVER_SHA256:raise InstallError('Patched server hash does not match reviewed output.')
    compile(patched,'server.py','exec')

    backup=source/'state/code-backups'/('export-prepare-v1-'+str(time.time_ns()))
    if backup.exists() or backup.is_symlink():raise InstallError('Backup path collision.')
    backup.mkdir(parents=True,mode=0o700);os.chmod(backup,0o700)
    (backup/'server.py').write_bytes(original);os.chmod(backup/'server.py',0o600)
    (backup/'manifest.json').write_text(json.dumps({'feature':'posthoc-export-v1','original_sha256':current,
        'patched_sha256':PATCHED_SERVER_SHA256,'paidGenerationRequested':False,'createdAt':time.time()},indent=2)+'\n')
    os.chmod(backup/'manifest.json',0o600)

    mode=stat.S_IMODE(server.stat().st_mode);stopped=False
    try:
        if active_jobs(source)!=0:raise InstallError('A model job started during maintenance preparation.')
        command(['systemctl','--user','stop',WORKER],timeout=120);stopped=True
        atomic_write(server,patched,mode)
        command(['systemctl','--user','start',WORKER],timeout=45);stopped=False
        return {'phase':'INSTALLED_AND_LOCALLY_VERIFIED','source_sha256':PATCHED_SERVER_SHA256,
            'backup':str(backup),'paidGenerationRequested':False,**local_health(source)}
    except BaseException:
        try:
            if not stopped:subprocess.run(['systemctl','--user','stop',WORKER],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
            atomic_write(server,original,mode)
            command(['systemctl','--user','start',WORKER],timeout=45)
            if sha256(regular(server))!=EXPECTED_SERVER_SHA256:raise InstallError('Rollback hash mismatch.')
        except BaseException as rollback:
            raise InstallError('Export-preparation install failed and rollback could not be verified: '+str(rollback)[:180]) from None
        raise

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--approve-service-restart',action='store_true');args=parser.parse_args()
    if not args.approve_service_restart:
        print(json.dumps({'phase':'PLAN_ONLY','paidGenerationRequested':False,'expected_server_sha256':EXPECTED_SERVER_SHA256,'patched_server_sha256':PATCHED_SERVER_SHA256},indent=2));return
    print(json.dumps(install(Path.home()/'froge-connector'),indent=2))

if __name__=='__main__':
    try:main()
    except (InstallError,ValueError,UnicodeDecodeError,urllib.error.URLError) as error:
        print(json.dumps({'phase':'STOPPED_OR_ROLLED_BACK','paidGenerationRequested':False,'error':str(error)[:300]},indent=2));sys.exit(1)
