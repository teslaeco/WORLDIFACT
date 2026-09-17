"""Narrow cost-guard maintenance for the already installed FAST worker.
No model generation. Reuse the previously verified service/rollback operations.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import stat
import sys
import time
import uuid

LEGACY_SOURCE = 'a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b'
LEGACY = {
 'apply.py':'89b28067ad1b5ba298f22f4fc42f8ddd66b293ec087931bd20b4c0fc63eaac2a',
 'completion.py':'b07c36df110af8800fd956068fd861fb0bfdfe39206117d9a427d30c4cc8bf1d',
 'fast_preview.py':'fd3552893a2a080f764f1420498f20f307d8a511dbbca5661025d6df7f4e2449',
 'installed_v33.py':'9ae9465d89f6a2ab6c8ef52e3b217bb5ceaed7c2a239e4ff6efcf162e120c842',
 'install_v33.py':'6d05ed75d40ea17f8352f42331399d6bb84aca45bc8eac242bc91536f7ca2341',
}
EXPECTED = {'codex_runner.py':'d953522872c2ff0c811b03962c790e63966f49e6b454d0b57ed60ca3c5b3afd0',
 'fast_preview.py':'fd3552893a2a080f764f1420498f20f307d8a511dbbca5661025d6df7f4e2449'}

def once(text, old, new):
    if text.count(old) != 1: raise ValueError('Reviewed cost-guard context changed. No update applied.')
    return text.replace(old, new, 1)

def changes(originals, helper):
    if set(originals) != set(EXPECTED): raise ValueError('Unexpected source files.')
    for name, raw in originals.items():
        if hashlib.sha256(raw).hexdigest() != EXPECTED[name]: raise ValueError('Installed FAST source differs: '+name)
    runner = originals['codex_runner.py'].decode()
    runner = once(runner, 'import fast_preview\n', 'import fast_preview\nimport fast_spend\n')
    anchor = "                    request=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode(),headers=headers)"
    runner = once(runner, anchor, """                    if outer.fast_limits['fast']:
                        try:
                            fast_spend.protect(outer.folder, payload, headers)
                        except fast_spend.SpendError:
                            outer.stop('FORGE_FAST_COST_GUARD','FAST cost guard stopped before another provider request. Keep this job; no automatic paid retry.')
                            return self.reject(422,outer.error,outer.error_code)
""" + anchor)
    profile = originals['fast_preview.py'].decode()
    profile = once(profile, "    value['generationProfileRevision'] = 1\n", """    value['generationProfileRevision'] = 1
    if enabled:
        from fast_spend import REVISION, CEILING_MICRO_USD, VALID_UNTIL
        if time.time() < VALID_UNTIL:
            value['fastBudgetRevision'] = REVISION
            value['fastBudgetMaxUsd'] = CEILING_MICRO_USD // 1000000
""")
    out = {'codex_runner.py':runner.encode(), 'fast_preview.py':profile.encode(), 'fast_spend.py':helper}
    for name, raw in out.items(): compile(raw,name,'exec')
    return out

def load_legacy(folder):
    for name, checksum in LEGACY.items():
        path = folder/name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 262144 or hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError('Prior reviewed maintenance package is missing or changed. Nothing modified.')
    sys.path.insert(0,str(folder))
    spec=importlib.util.spec_from_file_location('_worldifact_reviewed_maintenance',folder/'install_v33.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def install(base, source, workspace, operations, helper):
    operations.preflight()
    original={name:base.read_regular(source/name) for name in EXPECTED}
    patched=changes(original,helper)
    if (source/'fast_spend.py').exists() or (source/'fast_spend.py').is_symlink():
        raise ValueError('Cost guard already exists. Do not overwrite or reinstall it.')
    workspace.mkdir(mode=0o700,parents=True,exist_ok=False)
    modes={name:stat.S_IMODE((source/name).stat().st_mode) for name in EXPECTED}
    old_receipt=base.read_regular(source/base.RECEIPT,16384)
    for name,raw in original.items():base.atomic_write(workspace/'originals'/name,raw)
    base.atomic_write(workspace/'original-receipt.json',old_receipt)
    base.summary_file(workspace,'STAGED_NOT_INSTALLED')
    with operations.quiesce():
        touched=[]
        try:
            operations.assert_idle()
            if any(base.read_regular(source/name)!=raw for name,raw in original.items()):raise ValueError('Concurrent source edit.')
            base.summary_file(workspace,'INSTALLING')
            for name,raw in patched.items():
                touched.append(name);base.atomic_write(source/name,raw,modes.get(name,0o600))
            operations.verify(workspace)
            operations.start();operations.health(True)
            return base.summary_file(workspace,'INSTALLED_AND_LOCALLY_VERIFIED',cost_guard='fast-usd4-v1',paid_benchmark_run=False)
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    current=base.read_regular(source/name)
                    if current not in (patched[name],original.get(name)):raise ValueError('Concurrent recovery edit.')
                    if name in original:base.atomic_write(source/name,original[name],modes[name])
                    else:(source/name).unlink()
                base.atomic_write(source/base.RECEIPT,old_receipt)
                operations.start();operations.health(True)
                base.summary_file(workspace,'ROLLED_BACK')
            except BaseException:
                base.summary_file(workspace,'RECOVERY_REQUIRED');raise RuntimeError('Automatic recovery not fully verified.') from None
            raise RuntimeError('Cost guard update failed; previous working FAST restored.') from None

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--approve-service-restart',action='store_true');args=parser.parse_args()
    if not args.approve_service_restart: print('PLAN ONLY. No update or model request.');return
    home=Path.home();source=home/'froge-connector'
    if os.getuid()==0 or platform.machine()!='aarch64' or sys.version_info<(3,9):raise ValueError('Use the existing Oracle ARM account.')
    base=load_legacy(home/'.local/state/worldifact-fast-launch'/LEGACY_SOURCE)
    class Operations(base.LiveOperations):
        def preflight(self):
            for name,checksum in EXPECTED.items():
                if hashlib.sha256(base.read_regular(source/name)).hexdigest()!=checksum:raise ValueError('Installed FAST source changed.')
            for name,checksum in base.VERIFIERS.items():
                if base.blob_sha(base.read_regular(source/name))!=checksum:raise ValueError('Offline verifier changed.')
            if base.read_regular(self.dropin,1024)!=base.DROPIN:raise ValueError('Existing FAST setting differs.')
            if self.state(base.WORKER)!='active' or self.state(base.TUNNEL)!='active':raise ValueError('Existing services are not active.')
            if self.command(['systemctl','--user','show',base.WORKER,'--property=WorkingDirectory','--value'])!=str(source):raise ValueError('Unexpected worker directory.')
            if not base.receipt_matches(source):raise ValueError('Current runtime verification failed.')
            self.assert_idle()
    parent=base.safe_path(home/'.local/state/worldifact-fast');parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(str(parent/'installation.lock'),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        workspace=parent/(time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:8])
        print('Maintenance workspace: '+str(workspace),flush=True)
        helper=Path(__file__).with_name('fast_spend.py').read_bytes()
        print(json.dumps(install(base,source,workspace,Operations(source,home),helper),indent=2))

if __name__=='__main__':
    try:main()
    except Exception:print('STOP: Cost-guard maintenance did not complete. Preserve the recorded attempt and rollback files.',file=sys.stderr);sys.exit(1)
