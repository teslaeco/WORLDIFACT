"""Opt-in update of the verified ASTRA guard. Never raises its USD1.75 ceiling.

No paid AI or billing activation. Exact source ancestry, idle-job preflight,
private backups, genuine offline verification and rollback are mandatory.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import sys
import time
import urllib.request
import uuid
import install as previous
import astra_spend as legacy
import astra_spend_v2 as policy

base = previous.base
BLOCK = """                    try:
                        astra_spend.protect(outer.folder, payload, headers)
                    except astra_spend.SpendError:
                        outer.stop('WORLDIFACT_ASTRA_COST_GUARD','ASTRA budget guard stopped before another API call. Keep this job; do not auto-retry.')
                        return self.reject(422,outer.error,outer.error_code)
"""
HEALTH = "    from astra_spend import verified_health\n    value.update(verified_health())\n"


def original_variant(originals):
    runner = previous.once(originals['codex_runner.py'].decode(), 'import astra_spend\n', '')
    runner = previous.once(runner, BLOCK + previous.ANCHOR, previous.ANCHOR)
    helper = previous.once(originals['fast_preview.py'].decode(), HEALTH, '')
    return previous.reviewed_variant({'codex_runner.py': runner.encode(), 'fast_preview.py': helper.encode()})


def changes(originals, policy_bytes):
    original_variant(originals)
    runner = previous.once(originals['codex_runner.py'].decode(), 'import astra_spend\n', 'import astra_spend_v2\n')
    runner = previous.once(runner, "payload['reasoning']={**payload.get('reasoning',{}),'effort':'high'}", "payload['reasoning']={**payload.get('reasoning',{}),'effort':'low'}")
    runner = previous.once(runner, "'model_reasoning_effort':'high'", "'model_reasoning_effort':'low'")
    runner = previous.once(runner, 'astra_spend.protect(outer.folder, payload, headers)', 'astra_reservation = astra_spend_v2.protect(outer.folder, payload, headers)')
    runner = previous.once(runner, 'except astra_spend.SpendError:', 'except astra_spend_v2.SpendError:')
    event = "                                        event=json.loads(line[5:]);value=event.get('response') or {}\n"
    runner = previous.once(runner, event, event + "                                        if event.get('type') == 'response.completed':\n                                            astra_spend_v2.settle_completed(outer.folder, astra_reservation, value)\n")
    helper = previous.once(originals['fast_preview.py'].decode(), 'from astra_spend import verified_health', 'from astra_spend_v2 import verified_health')
    output = {'codex_runner.py': runner.encode(), 'fast_preview.py': helper.encode(), 'astra_spend_v2.py': policy_bytes}
    for name, raw in output.items():
        compile(raw, name, 'exec')
    return output


def check_health(source):
    config = json.loads(base.read_regular(source / 'state/config.json', 16384))
    token = config.get('token')
    if not isinstance(token, str) or not 32 <= len(token) <= 256:
        raise base.InstallError('Local authenticated health unavailable.')
    request = urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization': 'Bearer ' + token})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), legacy.NoRedirect())
    with opener.open(request, timeout=10) as response:
        raw = response.read(16385)
        if len(raw) > 16384:
            raise base.InstallError('Invalid health response.')
        value = json.loads(raw)
    if value.get('ready') is not True or value.get('astraOutputPolicy') != policy.REVISION or value.get('astraBudgetMaxUsd') != 1.75:
        raise base.InstallError('Updated Astra output policy is not runtime verified.')


class Operations(previous.Operations):
    def preflight(self):
        if os.getuid() == 0 or time.time() >= policy.VALID_UNTIL:
            raise base.InstallError('Use the existing unprivileged account and current pricing review.')
        originals = {name: base.read_regular(self.source / name) for name in previous.EXPECTED}
        variant = original_variant(originals)
        if base.read_regular(self.source / 'astra_spend.py') != Path(legacy.__file__).read_bytes():
            raise base.InstallError('Installed original guard differs. It was not overwritten.')
        if not legacy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise base.InstallError('Existing guard/runtime receipt is invalid.')
        if variant == 'FAST_V33_WITH_SPEND' and hashlib.sha256(base.read_regular(self.source / 'fast_spend.py')).hexdigest() != previous.FAST_SPEND_SHA256:
            raise base.InstallError('Legacy FAST helper differs.')
        for name, digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source / name)) != digest:
                raise base.InstallError('Offline verifier differs: ' + name)
        if self.state(base.WORKER) != 'active' or self.state(base.TUNNEL) != 'active':
            raise base.InstallError('Worker and tunnel must already be healthy.')
        if self.command(['systemctl', '--user', 'show', base.WORKER, '--property=WorkingDirectory', '--value']) != str(self.source):
            raise base.InstallError('Unexpected worker working directory.')
        if base.read_regular(self.dropin, 1024) != base.DROPIN:
            raise base.InstallError('Unexpected service verification policy.')
        self.assert_idle()
        print('Verified installed Astra v1 source: ' + variant, flush=True)

    def verify(self, workspace):
        old = previous.OFFLINE_CHECK
        # Fixture token counts belong only in this isolated verification process.
        # Real protect/reserve remains active; production source has no fake usage.
        previous.OFFLINE_CHECK = old.replace('import astra_spend\n', 'import astra_spend_v2 as astra_spend\n')
        try:
            super().verify(workspace)
        finally:
            previous.OFFLINE_CHECK = old


def install(source, workspace, operations):
    source = base.safe_path(source)
    if policy.verified_health(source):
        check_health(source)
        return {'phase': 'ALREADY_VERIFIED', 'policy': policy.REVISION, 'paidGenerationRequested': False}
    if (source / 'astra_spend_v2.py').exists() or (source / 'astra_spend_v2.py').is_symlink():
        raise base.InstallError('Partial prior update requires review; no overwrite.')
    operations.preflight()
    old = {name: base.read_regular(source / name) for name in previous.EXPECTED}
    old[legacy.RECEIPT] = base.read_regular(source / legacy.RECEIPT, 16384)
    old_runtime = base.read_regular(source / base.RECEIPT, 16384)
    patched = changes({name: old[name] for name in previous.EXPECTED}, Path(policy.__file__).read_bytes())
    proof = json.loads(old[legacy.RECEIPT])
    proof['sha256'] = {name: hashlib.sha256(patched.get(name, base.read_regular(source/name))).hexdigest() for name in proof['sha256']}
    proof['outputPolicy'] = {'revision': policy.REVISION, 'sha256': hashlib.sha256(patched['astra_spend_v2.py']).hexdigest()}
    patched[legacy.RECEIPT] = (json.dumps(proof, indent=2)+'\n').encode()
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source/name).stat().st_mode) for name in old}
    for name, raw in old.items():
        base.atomic_write(workspace/'originals'/name, raw)
    base.atomic_write(workspace/'original-runtime-receipt.json', old_runtime)
    with operations.quiesce():
        touched = []
        try:
            operations.assert_idle()
            if any(base.read_regular(source/name) != raw for name,raw in old.items()):
                raise base.InstallError('Concurrent source change; no overwrite.')
            for name, raw in patched.items():
                touched.append(name); base.atomic_write(source/name, raw, modes.get(name, 0o600))
            operations.verify(workspace)
            operations.start(); operations.health(True); check_health(source)
            return base.summary_file(workspace, 'ASTRA_OUTPUT_POLICY_VERIFIED', policy=policy.REVISION, max_provider_usd=1.75, paid_generation_requested=False, sales_enabled=False)
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    if base.read_regular(source/name) not in (patched[name], old.get(name)):
                        raise base.InstallError('Concurrent recovery edit; retain backup.')
                    if name in old: base.atomic_write(source/name, old[name], modes[name])
                    else: (source/name).unlink()
                base.atomic_write(source/base.RECEIPT, old_runtime)
                operations.start(); operations.health(True)
                base.summary_file(workspace, 'ROLLED_BACK_OUTPUT_POLICY')
            except BaseException:
                base.summary_file(workspace, 'RECOVERY_REQUIRED')
                raise base.InstallError('Recovery requires review; preserve private backups.') from None
            raise base.InstallError('Output policy check failed; previous source restored.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args()
    if not args.approve_service_restart:
        print('PLAN ONLY. No installation, restart, model call or payment.'); return
    def interrupted(*_): raise KeyboardInterrupt('Restore touched source before exit.')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGHUP, interrupted)
    source = Path.home()/'froge-connector'
    parent = base.safe_path(Path.home()/'.local/state/worldifact-astra-guard')
    parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    lock_root = base.safe_path(Path.home()/'.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd = os.open(str(lock_root/'installation.lock'), os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        workspace = parent/('output-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:8])
        print('Private backup: '+str(workspace),flush=True)
        print(json.dumps(install(source,workspace,Operations(source,Path.home())),indent=2))
        print('WORLDIFACT_ASTRA_OUTPUT_POLICY_VERIFIED. Paid quality test and sales activation remain separate.')


if __name__ == '__main__':
    try: main()
    except base.InstallError as error:
        print('STOP: '+str(error),file=sys.stderr); sys.exit(1)
    except Exception:
        print('STOP: output-policy update was not confirmed. Preserve backups; do not share keys.',file=sys.stderr); sys.exit(1)
