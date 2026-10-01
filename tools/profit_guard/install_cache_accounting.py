"""Opt-in, idle-only update of completed Astra cache accounting.

Keeps the installed runner, monetary cap, job ledgers and all payment settings.
Only the reviewed v2 helper and its hash receipt are replaced. Real offline
Codex/Blender verification and local authenticated readiness are mandatory.
No model call, retry, customer credit grant or remote installation on import.
"""
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
import urllib.request
import uuid
import install as previous
import install_tuning as tuning
import astra_spend as legacy
import astra_spend_v2 as policy

base = previous.base
OLD_POLICY_BLOB = '4c7e123af4383bf0d1c73296ec90a0f4d69c75ad'
POLICY_FILE = 'astra_spend_v2.py'
SETTLEMENT_HOOK = "                                        if event.get('type') == 'response.completed':\n                                            astra_spend_v2.settle_completed(outer.folder, astra_reservation, value)\n"


def reviewed_installed_variant(originals):
    """Reverse ONLY the previously reviewed tuner, then verify exact ancestry."""
    once = previous.once
    runner = once(originals['codex_runner.py'].decode(), 'import astra_spend_v2\n', 'import astra_spend\n')
    runner = once(runner, "payload['reasoning']={**payload.get('reasoning',{}),'effort':'low'}", "payload['reasoning']={**payload.get('reasoning',{}),'effort':'low' if outer.fast_limits['fast'] else 'high'}")
    runner = once(runner, "'model_reasoning_effort':'low'", "'model_reasoning_effort':'low' if fast_preview.read_profile(folder)==fast_preview.PROFILE else 'high'")
    runner = once(runner, 'astra_reservation = astra_spend_v2.protect(outer.folder, payload, headers)', 'astra_spend.protect(outer.folder, payload, headers)')
    runner = once(runner, 'except astra_spend_v2.SpendError:', 'except astra_spend.SpendError:')
    runner = once(runner, SETTLEMENT_HOOK, '')
    helper = once(originals['fast_preview.py'].decode(), 'from astra_spend_v2 import verified_health', 'from astra_spend import verified_health')
    return tuning.original_variant({'codex_runner.py': runner.encode(), 'fast_preview.py': helper.encode()})


def check_health(source):
    tuning.check_health(source)
    config = json.loads(base.read_regular(source / 'state/config.json', 16384))
    token = config.get('token')
    if not isinstance(token, str) or not 32 <= len(token) <= 256:
        raise base.InstallError('Local authenticated readiness is unavailable.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), legacy.NoRedirect())
    request = urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization': 'Bearer ' + token})
    with opener.open(request, timeout=10) as response:
        raw = response.read(16385)
        if len(raw) > 16384:
            raise base.InstallError('Invalid local readiness response.')
        value = json.loads(raw)
    if (value.get('astraCacheAccounting') != policy.CACHE_ACCOUNTING_REVISION
            or value.get('astraBudgetMaxUsd') != 1.75
            or value.get('astraUsageSettlement') != 'authenticated-completed-only'):
        raise base.InstallError('The running worker did not confirm completed-cache accounting.')


class Operations(tuning.Operations):
    def preflight(self):
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise base.InstallError('Use the existing unprivileged Oracle ARM account.')
        if self.source != self.home / 'froge-connector' or time.time() >= policy.VALID_UNTIL:
            raise base.InstallError('Unexpected source or expired pricing review.')
        originals = {name: base.read_regular(self.source / name) for name in previous.EXPECTED}
        variant = reviewed_installed_variant(originals)
        if base.blob_sha(base.read_regular(self.source / POLICY_FILE)) != OLD_POLICY_BLOB:
            raise base.InstallError('Installed output policy differs; it was not overwritten.')
        if base.read_regular(self.source / 'astra_spend.py') != Path(legacy.__file__).read_bytes():
            raise base.InstallError('Installed original guard differs; nothing changed.')
        if not policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise base.InstallError('Current guard/runtime receipt is invalid.')
        if variant == 'FAST_V33_WITH_SPEND' and hashlib.sha256(base.read_regular(self.source / 'fast_spend.py')).hexdigest() != previous.FAST_SPEND_SHA256:
            raise base.InstallError('Legacy FAST guard differs.')
        for name, digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source / name)) != digest:
                raise base.InstallError('Offline verifier differs; nothing changed.')
        if self.state(base.WORKER) != 'active' or self.state(base.TUNNEL) != 'active':
            raise base.InstallError('Existing worker and tunnel must be healthy.')
        if self.command(['systemctl', '--user', 'show', base.WORKER, '--property=WorkingDirectory', '--value']) != str(self.source):
            raise base.InstallError('Unexpected service working directory.')
        if base.read_regular(self.dropin, 1024) != base.DROPIN:
            raise base.InstallError('Unexpected service verification settings.')
        self.assert_idle()


def install(source, workspace, operations, approved=False):
    if approved is not True:
        raise base.InstallError('Service maintenance approval is required. Nothing changed.')
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if workspace.exists() or workspace == source or source in workspace.parents:
        raise base.InstallError('Use a new private backup directory outside the worker.')
    desired = Path(policy.__file__).read_bytes()
    if base.read_regular(source / POLICY_FILE) == desired:
        if not policy.verified_health(source):
            raise base.InstallError('Matching helper lacks valid runtime evidence.')
        check_health(source)
        return {'phase': 'ALREADY_VERIFIED', 'paid_generation_requested': False}
    operations.preflight()
    originals = {name: base.read_regular(source / name) for name in (POLICY_FILE, legacy.RECEIPT, base.RECEIPT)}
    if base.blob_sha(originals[POLICY_FILE]) != OLD_POLICY_BLOB:
        raise base.InstallError('Output policy changed after preflight.')
    untouched = {name: base.read_regular(source / name) for name in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py')}
    receipt = json.loads(originals[legacy.RECEIPT])
    expected = receipt.get('outputPolicy')
    if expected != {'revision': policy.REVISION, 'sha256': hashlib.sha256(originals[POLICY_FILE]).hexdigest()}:
        raise base.InstallError('Output policy receipt changed; nothing overwritten.')
    receipt['outputPolicy'] = {'revision': policy.REVISION, 'sha256': hashlib.sha256(desired).hexdigest()}
    patched = {POLICY_FILE: desired, legacy.RECEIPT: (json.dumps(receipt, indent=2) + '\n').encode()}
    compile(desired, POLICY_FILE, 'exec')
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in originals}
    for name, raw in originals.items():
        base.atomic_write(workspace / 'originals' / name, raw)
    with operations.quiesce():
        touched = []
        try:
            operations.assert_idle()
            if any(base.read_regular(source / name) != raw for name, raw in {**originals, **untouched}.items()):
                raise base.InstallError('Concurrent source edit; no overwrite.')
            for name, raw in patched.items():
                touched.append(name)
                base.atomic_write(source / name, raw, modes[name])
            operations.verify(workspace)
            if any(base.read_regular(source / name) != raw for name, raw in untouched.items()):
                raise base.InstallError('Verification changed protected runtime source.')
            operations.start(); operations.health(True); check_health(source)
            return base.summary_file(workspace, 'CACHE_ACCOUNTING_VERIFIED', policy=policy.CACHE_ACCOUNTING_REVISION,
                                     max_provider_usd=1.75, quality_test='NOT_RUN', payment_settings_changed=False)
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    current = base.read_regular(source / name)
                    if current not in (originals[name], patched[name]):
                        raise base.InstallError('Concurrent recovery edit; preserve private backups.')
                    base.atomic_write(source / name, originals[name], modes[name])
                # The genuine offline verifier can refresh only this receipt.
                if touched:
                    base.atomic_write(source / base.RECEIPT, originals[base.RECEIPT], modes[base.RECEIPT])
                operations.start(); operations.health(True); tuning.check_health(source)
                base.summary_file(workspace, 'ROLLED_BACK_CACHE_ACCOUNTING')
            except BaseException:
                base.summary_file(workspace, 'RECOVERY_REQUIRED')
                raise base.InstallError('Recovery requires review; preserve private backups.') from None
            raise base.InstallError('Verification failed; previous helper restored.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args()
    if not args.approve_service_restart:
        print('PLAN ONLY. No installation, restart, provider call, refund or payment change.'); return
    def interrupted(*_):
        raise KeyboardInterrupt('Restore touched files before exit.')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGHUP, interrupted)
    home = Path.home(); source = home / 'froge-connector'
    parent = base.safe_path(home / '.local/state/worldifact-astra-guard')
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    locks = base.safe_path(home / '.local/state/worldifact-fast')
    locks.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(str(locks / 'installation.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        workspace = parent / ('cache-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        print(json.dumps(install(source, workspace, Operations(source, home), approved=True), indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('STOP: cache-accounting installation not confirmed; no paid test. Preserve backups.', file=sys.stderr)
        sys.exit(1)
