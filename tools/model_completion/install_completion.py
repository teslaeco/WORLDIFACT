"""Idle-only exact-source WORLDIFACT completion repair. Default PLAN ONLY.

No paid generation or budget reset. Original artifacts, DB, keys, spend ledgers,
payment settings and service permissions are preserved. Offline real Codex/MCP/
Blender verification is mandatory; failed verification restores prior service.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import stat
import sys
import time
import urllib.request
import uuid

HERE = Path(__file__).resolve().parent
PROFIT = HERE.parents[1]/'tools/profit_guard'
if PROFIT.is_dir(): sys.path.insert(0, str(PROFIT))
import install_request_timeout900 as previous
import completion_policy as policy
import source_patch
base = previous.base
cache = previous.cache


def diagnose_job(source, job_id):
    """Existing evidence only; do not invoke ledger_folder (which creates dirs)."""
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', job_id):
        raise base.InstallError('Invalid diagnostic job identifier.')
    try:
        job = base.safe_path(Path(source)/'state/jobs'/job_id)
        if not job.is_dir(): return {'diagnostic': 'JOB_NOT_PRESENT', 'paid_generation_requested': False}
        key = hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest()
        path = Path(source)/'state/worldifact-astra-budgets'/key/cache.legacy.STATE
        if not path.exists(): return {'diagnostic': 'LEDGER_NOT_PRESENT', 'paid_generation_requested': False}
        state = previous.policy.validate_state(json.loads(base.read_regular(path, 16384)))
        holds = list(state['holds'].values())
        return {'diagnostic': 'READ_ONLY_JOB_BUDGET', 'requests': state['requests'],
            'held_micro_usd': previous.policy.used(state), 'cap_micro_usd': previous.policy.CEILING_MICRO_USD,
            'settled_holds': sum('response' in hold for hold in holds),
            'unsettled_holds': [{'input_ceiling': hold['input'], 'output_ceiling': hold['output'],
                'held_micro_usd': hold['held']} for hold in holds if 'response' not in hold],
            'paid_generation_requested': False, 'ledger_modified': False}
    except (OSError, ValueError, previous.policy.SpendError):
        return {'diagnostic': 'EVIDENCE_UNAVAILABLE', 'paid_generation_requested': False, 'ledger_modified': False}


def check_health(source):
    cache.check_health(source)
    config = json.loads(base.read_regular(source/'state/config.json', 16384))
    token = config.get('token')
    if not isinstance(token, str) or not 32 <= len(token) <= 256: raise base.InstallError('Local health authorization unavailable.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), cache.legacy.NoRedirect())
    request = urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization':'Bearer '+token})
    with opener.open(request, timeout=10) as response:
        raw = response.read(16385)
        if len(raw)>16384: raise base.InstallError('Invalid health response.')
        value = json.loads(raw)
    if value.get('worldifactCompletionPolicy') != policy.REVISION or value.get('worldifactCompletionMaxContinuations') != 1:
        raise base.InstallError('Running worker did not confirm the completion policy.')


class Operations(cache.Operations):
    def preflight(self):
        if os.getuid()==0 or platform.machine()!='aarch64' or sys.version_info<(3,9):
            raise base.InstallError('Use the existing unprivileged Oracle ARM account.')
        if self.source != self.home/'froge-connector' or time.time() >= previous.policy.VALID_UNTIL:
            raise base.InstallError('Unexpected source or expired pricing review.')
        sources={name:base.read_regular(self.source/name) for name in source_patch.EXPECTED}
        source_patch.changes(sources, (HERE/'completion_policy.py').read_bytes())
        # Reverse exactly the reviewed timeout, then prove the existing guard
        # chain, including FAST-spend ancestry. A hash display is not enough.
        runner=cache.previous.once(sources['codex_runner.py'].decode(), previous.NEW, previous.OLD).encode()
        variant=cache.reviewed_installed_variant({'codex_runner.py':runner,'fast_preview.py':base.read_regular(self.source/'fast_preview.py')})
        if variant!='FAST_V33_WITH_SPEND': raise base.InstallError('Unexpected reviewed ancestor variant.')
        if hashlib.sha256(base.read_regular(self.source/'fast_spend.py')).hexdigest()!=cache.previous.FAST_SPEND_SHA256:
            raise base.InstallError('Existing FAST guard differs.')
        if base.read_regular(self.source/'astra_spend.py')!=Path(cache.legacy.__file__).read_bytes():
            raise base.InstallError('Existing original guard differs.')
        if not previous.policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise base.InstallError('Existing guard/runtime verification is invalid.')
        for name,digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source/name))!=digest: raise base.InstallError('Offline verifier differs.')
        if self.state(base.WORKER)!='active' or self.state(base.TUNNEL)!='active': raise base.InstallError('Existing worker/tunnel must be healthy.')
        if self.command(['systemctl','--user','show',base.WORKER,'--property=WorkingDirectory','--value'])!=str(self.source):
            raise base.InstallError('Unexpected service directory.')
        if base.read_regular(self.dropin,1024)!=base.DROPIN: raise base.InstallError('Unexpected service settings.')
        self.assert_idle()


def install(source, workspace, operations, approved=False):
    if approved is not True: raise base.InstallError('Service maintenance approval is required.')
    source,workspace=base.safe_path(source).absolute(),base.safe_path(workspace).absolute()
    if workspace.exists() or workspace==source or source in workspace.parents: raise base.InstallError('Use a new private backup outside the worker.')
    if (source/policy.RECEIPT).exists():
        if not policy.verified_health(source): raise base.InstallError('Previous completion installation is not verified; no overwrite.')
        check_health(source)
        return {'phase':'ALREADY_VERIFIED','revision':policy.REVISION,'paid_generation_requested':False}
    if (source/'completion_policy.py').exists() or (source/'completion_policy.py').is_symlink():
        raise base.InstallError('Unreviewed existing completion helper; no overwrite.')
    operations.preflight()
    original={name:base.read_regular(source/name) for name in source_patch.EXPECTED}
    original[cache.legacy.RECEIPT]=base.read_regular(source/cache.legacy.RECEIPT,16384)
    original[base.RECEIPT]=base.read_regular(source/base.RECEIPT,16384)
    patched=source_patch.changes({name:original[name] for name in source_patch.EXPECTED},(HERE/'completion_policy.py').read_bytes())
    proof=json.loads(original[cache.legacy.RECEIPT])
    if (proof.get('revision')!=cache.legacy.REVISION or
        proof.get('sha256',{}).get('codex_runner.py')!=hashlib.sha256(original['codex_runner.py']).hexdigest() or
        proof.get('outputPolicy',{}).get('sha256')!=hashlib.sha256(original['astra_spend_v2.py']).hexdigest()):
        raise base.InstallError('Original guard receipt does not match exact source.')
    proof['sha256']['codex_runner.py']=hashlib.sha256(patched['codex_runner.py']).hexdigest()
    proof['outputPolicy']['sha256']=hashlib.sha256(patched['astra_spend_v2.py']).hexdigest()
    completion_proof={'revision':policy.REVISION,'sha256':{n:hashlib.sha256(b).hexdigest() for n,b in patched.items()}}
    patched[cache.legacy.RECEIPT]=(json.dumps(proof,indent=2)+'\n').encode()
    patched[policy.RECEIPT]=(json.dumps(completion_proof,indent=2)+'\n').encode()
    workspace.mkdir(mode=0o700,parents=True,exist_ok=False)
    modes={name:stat.S_IMODE((source/name).stat().st_mode) for name in original}
    for name,raw in original.items(): base.atomic_write(workspace/'originals'/name,raw)
    base.summary_file(workspace,'STAGED_COMPLETION_NOT_INSTALLED')
    with operations.quiesce():
        touched=[]
        try:
            operations.assert_idle()
            if any(base.read_regular(source/n)!=b for n,b in original.items()): raise base.InstallError('Concurrent source edit; no overwrite.')
            for name,raw in patched.items():
                touched.append(name);base.atomic_write(source/name,raw,modes.get(name,0o600))
            operations.verify(workspace)
            if any(base.read_regular(source/n)!=b for n,b in patched.items()): raise base.InstallError('Verification changed protected source.')
            operations.start();operations.health(True)
            if not policy.verified_health(source): raise base.InstallError('Completion source/runtime receipt mismatch.')
            check_health(source)
            return base.summary_file(workspace,'WORLDIFACT_MODEL_COMPLETION_VERIFIED',revision=policy.REVISION,
                max_provider_usd=1.75,max_continuations=1,paid_generation_requested=False,
                payment_settings_changed=False,quality_test='NOT_RUN')
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    path=source/name
                    if name not in original and not path.exists() and not path.is_symlink(): continue
                    if base.read_regular(source/name) not in (patched[name],original.get(name)):
                        raise base.InstallError('Concurrent recovery edit; preserve backup.')
                    if name in original: base.atomic_write(source/name,original[name],modes[name])
                    else: (source/name).unlink()
                if touched: base.atomic_write(source/base.RECEIPT,original[base.RECEIPT],modes[base.RECEIPT])
                operations.start();operations.health(True);cache.check_health(source)
                base.summary_file(workspace,'ROLLED_BACK_MODEL_COMPLETION')
            except BaseException:
                base.summary_file(workspace,'RECOVERY_REQUIRED_MODEL_COMPLETION')
                raise base.InstallError('Recovery requires review; preserve private backups.') from None
            raise base.InstallError('Completion verification failed; previous working source restored.') from None


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart',action='store_true')
    parser.add_argument('--diagnose-job')
    args=parser.parse_args(argv)
    home=Path.home();source=home/'froge-connector'
    if args.diagnose_job: print(json.dumps(diagnose_job(source,args.diagnose_job),indent=2))
    if not args.approve_service_restart:
        print('PLAN ONLY. No installation, restart, provider call, generation or payment change.');return
    def interrupted(*_): raise KeyboardInterrupt('Restore touched source before exit.')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
    parent=base.safe_path(home/'.local/state/worldifact-astra-guard');parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    locks=base.safe_path(home/'.local/state/worldifact-fast');locks.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd=os.open(str(locks/'installation.lock'),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        workspace=parent/('completion-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:8])
        print(json.dumps(install(source,workspace,Operations(source,home),approved=True),indent=2))
        print('WORLDIFACT_MODEL_COMPLETION_VERIFIED. Payments unchanged. Paid generation NOT RUN.')


if __name__=='__main__':
    try: main()
    except base.InstallError as error:
        print('STOP: '+str(error),file=sys.stderr);sys.exit(1)
    except (Exception,KeyboardInterrupt):
        print('STOP: completion maintenance unconfirmed. Preserve backups; no automatic paid retry.',file=sys.stderr);sys.exit(1)
