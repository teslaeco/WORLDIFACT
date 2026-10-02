"""Idle-only prebuild upgrade. Default plan; never submit a job or paid call."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import stat
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
for folder in (HERE.parents[1]/'tools/profit_guard',HERE.parents[1]/'tools/model_completion'):
    if folder.is_dir(): sys.path.insert(0,str(folder))
import install_completion as previous
import completion_policy
import prebuild_policy as policy
import prebuild_patch
base,cache = previous.base,previous.cache


def check_health(source):
    previous.check_health(source)
    if not policy.verified_health(source): raise base.InstallError('Prebuild source/runtime receipt mismatch.')
    # Existing authenticated health is already source-bound through the source
    # receipt and process restart. Verify the advertised new revision as well.
    config=json.loads(base.read_regular(source/'state/config.json',16384))
    opener=previous.urllib.request.build_opener(previous.urllib.request.ProxyHandler({}),cache.legacy.NoRedirect())
    request=previous.urllib.request.Request('http://127.0.0.1:8765/v1/health',headers={'Authorization':'Bearer '+config['token']})
    with opener.open(request,timeout=10) as response: raw=response.read(16385)
    if len(raw)>16384 or json.loads(raw).get('worldifactPrebuildPolicy')!=policy.REVISION:
        raise base.InstallError('Worker did not advertise the prebuild policy.')


class Operations(previous.Operations):
    def preflight(self):
        if os.getuid()==0 or platform.machine()!='aarch64' or sys.version_info<(3,9):
            raise base.InstallError('Use the existing unprivileged Oracle ARM account.')
        if self.source!=self.home/'froge-connector' or time.time()>=previous.previous.policy.VALID_UNTIL:
            raise base.InstallError('Unexpected source or expired pricing review.')
        try: prebuild_patch.review({n:base.read_regular(self.source/n) for n in prebuild_patch.EXPECTED})
        except ValueError as error: raise base.InstallError(str(error)) from None
        if not completion_policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise base.InstallError('Existing completion/runtime receipt is invalid.')
        if base.read_regular(self.source/'astra_spend.py')!=Path(cache.legacy.__file__).read_bytes():
            raise base.InstallError('Original guard differs.')
        if hashlib.sha256(base.read_regular(self.source/'fast_spend.py')).hexdigest()!=cache.previous.FAST_SPEND_SHA256:
            raise base.InstallError('FAST guard differs.')
        for name,digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source/name))!=digest: raise base.InstallError('Offline verifier differs.')
        if self.state(base.WORKER)!='active' or self.state(base.TUNNEL)!='active': raise base.InstallError('Existing worker/tunnel must be healthy.')
        if self.command(['systemctl','--user','show',base.WORKER,'--property=WorkingDirectory','--value'])!=str(self.source):
            raise base.InstallError('Unexpected service directory.')
        if base.read_regular(self.dropin,1024)!=base.DROPIN: raise base.InstallError('Unexpected service settings.')
        self.assert_idle()

    def verify(self,workspace):
        # Keep the genuine existing generic CLI/MCP/Blender gate, then require
        # the NEW cabinet route. Both use inert model responses and count API.
        super().verify(workspace)
        import subprocess
        env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR')}
        env.update(PYTHONDONTWRITEBYTECODE='1',FROGE_FAST_DRAFT_V1='0')
        path=workspace/'offline-cabinet.log'
        with path.open('xb') as out:
            os.chmod(path,0o600)
            process=subprocess.Popen([sys.executable,'-B',str(HERE/'offline_cabinet.py'),'--source',str(self.source)],
                cwd=self.source,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
            try:
                if process.wait(timeout=600)!=0: raise base.InstallError('Cabinet first-build offline gate failed.')
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid,signal.SIGTERM)
                    try:process.wait(timeout=15)
                    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=10)
                raise
        if 'CABINET_FIRST_EXEC_REAL_PIPELINE_OK' not in base.read_regular(path,1048576).decode():
            raise base.InstallError('Cabinet verification evidence is missing.')


def install(source,workspace,operations,approved=False):
    if approved is not True: raise base.InstallError('Service maintenance approval is required.')
    source,workspace=base.safe_path(source).absolute(),base.safe_path(workspace).absolute()
    if workspace.exists() or workspace==source or source in workspace.parents: raise base.InstallError('Use a new private backup outside worker.')
    if (source/policy.RECEIPT).is_symlink(): raise base.InstallError('Unsafe prebuild receipt; no service stopped.')
    if (source/policy.RECEIPT).exists():
        check_health(source)
        return {'phase':'ALREADY_VERIFIED','revision':policy.REVISION,'paid_generation_requested':False}
    if (source/'prebuild_policy.py').exists() or (source/'prebuild_policy.py').is_symlink():
        raise base.InstallError('Unknown existing prebuild helper; no overwrite.')
    operations.preflight()
    original={n:base.read_regular(source/n) for n in prebuild_patch.EXPECTED}
    for name in (completion_policy.RECEIPT,cache.legacy.RECEIPT,base.RECEIPT): original[name]=base.read_regular(source/name,16384)
    patched=prebuild_patch.changes({n:original[n] for n in prebuild_patch.EXPECTED},(HERE/'prebuild_policy.py').read_bytes())
    prior=json.loads(original[completion_policy.RECEIPT])
    if prior!={'revision':completion_policy.REVISION,'sha256':{n:hashlib.sha256(original[n]).hexdigest() for n in prebuild_patch.EXPECTED}}:
        raise base.InstallError('Completion receipt differs from immutable reviewed ancestor.')
    guard=json.loads(original[cache.legacy.RECEIPT])
    if guard.get('sha256',{}).get('codex_runner.py')!=hashlib.sha256(original['codex_runner.py']).hexdigest() or guard.get('outputPolicy',{}).get('sha256')!=hashlib.sha256(original['astra_spend_v2.py']).hexdigest():
        raise base.InstallError('Guard receipt differs from immutable reviewed ancestor.')
    guard['sha256']['codex_runner.py']=hashlib.sha256(patched['codex_runner.py']).hexdigest()
    guard['outputPolicy']['sha256']=hashlib.sha256(patched['astra_spend_v2.py']).hexdigest()
    completion={'revision':completion_policy.REVISION,'sha256':{n:hashlib.sha256(patched[n]).hexdigest() for n in prebuild_patch.EXPECTED}}
    receipt={'revision':policy.REVISION,'sha256':{n:hashlib.sha256(b).hexdigest() for n,b in patched.items()}}
    patched.update({cache.legacy.RECEIPT:(json.dumps(guard,indent=2)+'\n').encode(),
                    completion_policy.RECEIPT:(json.dumps(completion,indent=2)+'\n').encode(),
                    policy.RECEIPT:(json.dumps(receipt,indent=2)+'\n').encode()})
    workspace.mkdir(mode=0o700,parents=True,exist_ok=False)
    modes={n:stat.S_IMODE((source/n).stat().st_mode) for n in original}
    for n,b in original.items():base.atomic_write(workspace/'originals'/n,b)
    with operations.quiesce():
        touched=[]
        try:
            operations.assert_idle()
            if any(base.read_regular(source/n)!=b for n,b in original.items()):raise base.InstallError('Concurrent source edit; no overwrite.')
            for n,b in patched.items():
                touched.append(n);base.atomic_write(source/n,b,modes.get(n,0o600))
            operations.verify(workspace)
            if any(base.read_regular(source/n)!=b for n,b in patched.items()):raise base.InstallError('Verification changed protected source.')
            operations.start();operations.health(True);check_health(source)
            return base.summary_file(workspace,'WORLDIFACT_PREBUILD_VERIFIED',revision=policy.REVISION,
                max_provider_usd=1.75,paid_generation_requested=False,quality_test='NOT_RUN')
        except BaseException:
            try:
                operations.stop()
                for n in reversed(touched):
                    path=source/n
                    if n not in original and not path.exists() and not path.is_symlink():continue
                    if base.read_regular(path) not in (patched[n],original.get(n)):raise base.InstallError('Concurrent recovery edit; preserve backup.')
                    if n in original:base.atomic_write(path,original[n],modes[n])
                    else:path.unlink()
                if touched:base.atomic_write(source/base.RECEIPT,original[base.RECEIPT],modes[base.RECEIPT])
                operations.start();operations.health(True);previous.check_health(source)
                base.summary_file(workspace,'ROLLED_BACK_PREBUILD')
            except BaseException:
                base.summary_file(workspace,'RECOVERY_REQUIRED_PREBUILD')
                raise base.InstallError('Recovery requires review; preserve private backups.') from None
            raise base.InstallError('Prebuild verification failed; previous working source restored.') from None


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--approve-service-restart',action='store_true');args=parser.parse_args(argv)
    if not args.approve_service_restart:
        print('PLAN ONLY. No installation, restart, provider call, ledger or payment change.');return
    def interrupted(*_):raise KeyboardInterrupt('Restore touched source before exit.')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
    home=Path.home();source=home/'froge-connector'
    parent=base.safe_path(home/'.local/state/worldifact-astra-guard');parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    locks=base.safe_path(home/'.local/state/worldifact-fast');locks.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd=os.open(str(locks/'installation.lock'),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        workspace=parent/('prebuild-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:8])
        print(json.dumps(install(source,workspace,Operations(source,home),approved=True),indent=2))


if __name__=='__main__':
    try:main()
    except base.InstallError as error:print('STOP: '+str(error),file=sys.stderr);sys.exit(1)
    except (Exception,KeyboardInterrupt):print('STOP: maintenance unconfirmed; preserve backups. No paid retry.',file=sys.stderr);sys.exit(1)
