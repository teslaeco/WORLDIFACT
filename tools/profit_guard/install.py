"""Opt-in ASTRA guard for the audited v33 runner. No paid generation.

Unknown or already modified sources are NOT overwritten. Jobs, models, keys,
services other than froge-worker, and the public billing gate are preserved.
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

FAST_TOOLS = Path(__file__).resolve().parents[1] / 'fast_preview'
if not FAST_TOOLS.is_dir():
    FAST_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(FAST_TOOLS))
import install_v33 as base
import astra_spend as guard

EXPECTED = {
    'codex_runner.py': 'd953522872c2ff0c811b03962c790e63966f49e6b454d0b57ed60ca3c5b3afd0',
    'fast_preview.py': 'fd3552893a2a080f764f1420498f20f307d8a511dbbca5661025d6df7f4e2449',
}
ANCHOR = "                    request=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode(),headers=headers)"


def once(text, old, new):
    if text.count(old) != 1:
        raise base.InstallError('Reviewed ASTRA request context differs. Nothing changed.')
    return text.replace(old, new, 1)


def changes(originals, helper):
    if set(originals) != set(EXPECTED):
        raise base.InstallError('Unexpected source selection.')
    for name, raw in originals.items():
        if hashlib.sha256(raw).hexdigest() != EXPECTED[name]:
            raise base.InstallError('Unreviewed installed source: ' + name + '. No service stopped.')
    runner = originals['codex_runner.py'].decode()
    runner = once(runner, 'import fast_preview\n', 'import fast_preview\nimport astra_spend\n')
    runner = once(runner, ANCHOR, """                    try:
                        astra_spend.protect(outer.folder, payload, headers)
                    except astra_spend.SpendError:
                        outer.stop('WORLDIFACT_ASTRA_COST_GUARD','ASTRA budget guard stopped before another API call. Keep this job; do not auto-retry.')
                        return self.reject(422,outer.error,outer.error_code)
""" + ANCHOR)
    profile = once(originals['fast_preview.py'].decode(), "    value['generationProfileRevision'] = 1\n",
                   "    value['generationProfileRevision'] = 1\n    from astra_spend import verified_health\n    value.update(verified_health())\n")
    patched = {'codex_runner.py': runner.encode(), 'fast_preview.py': profile.encode(), 'astra_spend.py': helper}
    for name, raw in patched.items():
        compile(raw, name, 'exec')
    return patched


def check_health(source):
    config = json.loads(base.read_regular(source / 'state/config.json', 16384))
    token = config.get('token')
    if not isinstance(token, str) or not 32 <= len(token) <= 256:
        raise base.InstallError('Local health authorization is unavailable.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), guard.NoRedirect())
    request = urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization': 'Bearer ' + token})
    with opener.open(request, timeout=10) as response:
        raw = response.read(16385)
        if len(raw) > 16384:
            raise base.InstallError('Unexpected health response.')
        health = json.loads(raw)
    if not (health.get('ready') is True and health.get('astraBudgetRevision') == guard.REVISION
            and health.get('astraBudgetMaxUsd') == 1.75 and health.get('astraBudgetPreflight') == 'input-tokens'):
        raise base.InstallError('Production worker did not advertise its verified ASTRA guard.')


class Operations(base.LiveOperations):
    def preflight(self):
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise base.InstallError('Use the existing unprivileged Oracle ARM account.')
        if time.time() >= guard.VALID_UNTIL:
            raise base.InstallError('Pricing review expired; guard was not installed.')
        for name, digest in EXPECTED.items():
            if hashlib.sha256(base.read_regular(self.source / name)).hexdigest() != digest:
                raise base.InstallError('Unreviewed installed source: ' + name + '. No service stopped.')
        for name, digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source / name)) != digest:
                raise base.InstallError('Offline verifier changed: ' + name + '. No service stopped.')
        if self.state(base.WORKER) != 'active' or self.state(base.TUNNEL) != 'active':
            raise base.InstallError('Worker and tunnel must already be healthy.')
        if self.command(['systemctl', '--user', 'show', base.WORKER, '--property=WorkingDirectory', '--value']) != str(self.source):
            raise base.InstallError('Unexpected worker directory.')
        if base.read_regular(self.dropin, 1024) != base.DROPIN or not base.receipt_matches(self.source):
            raise base.InstallError('Existing runtime verification is not valid.')
        self.assert_idle()


def install(source, workspace, operations, helper):
    source = base.safe_path(source)
    if guard.verified_health(source):
        check_health(source)
        return {'phase': 'ALREADY_VERIFIED', 'paid_generation_requested': False, 'max_provider_usd': 1.75}
    for name in ('astra_spend.py', guard.RECEIPT):
        if (source / name).exists() or (source / name).is_symlink():
            raise base.InstallError('A previous ASTRA guard needs review; it was not overwritten.')
    operations.preflight()
    original = {name: base.read_regular(source / name) for name in EXPECTED}
    patched = changes(original, helper)
    receipt = {'revision': guard.REVISION, 'sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in patched.items()}}
    patched[guard.RECEIPT] = (json.dumps(receipt, indent=2) + '\n').encode()
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in EXPECTED}
    old_receipt = base.read_regular(source / base.RECEIPT, 16384)
    for name, raw in original.items():
        base.atomic_write(workspace / 'originals' / name, raw)
    base.atomic_write(workspace / 'original-runtime-receipt.json', old_receipt)
    base.summary_file(workspace, 'STAGED_NOT_INSTALLED')
    with operations.quiesce():
        touched = []
        try:
            operations.assert_idle()
            if any(base.read_regular(source / name) != raw for name, raw in original.items()):
                raise base.InstallError('Concurrent source edit; no overwrite allowed.')
            for name, raw in patched.items():
                touched.append(name)
                base.atomic_write(source / name, raw, modes.get(name, 0o600))
            print('Source guard installed. Running the existing offline Codex/Blender check; no paid AI.', flush=True)
            operations.verify(workspace)
            operations.start()
            operations.health(True)
            check_health(source)
            return base.summary_file(workspace, 'INSTALLED_AND_LOCALLY_VERIFIED', revision=guard.REVISION,
                max_provider_usd=1.75, astra_sales_enabled=False, quality_test='NOT_REQUESTED')
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    current = base.read_regular(source / name)
                    if current not in (patched[name], original.get(name)):
                        raise base.InstallError('Concurrent recovery edit; preserve backup.')
                    if name in original:
                        base.atomic_write(source / name, original[name], modes[name])
                    else:
                        (source / name).unlink()
                base.atomic_write(source / base.RECEIPT, old_receipt)
                operations.start()
                operations.health(True)
                base.summary_file(workspace, 'ROLLED_BACK')
            except BaseException:
                base.summary_file(workspace, 'RECOVERY_REQUIRED')
                raise base.InstallError('Recovery needs review. Preserve the backup workspace.') from None
            raise base.InstallError('Guard check failed; previous working source was restored.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args()
    if not args.approve_service_restart:
        print('PLAN ONLY. No changes, restart or paid generation. Explicit approval is required.')
        return
    def interrupted(_signal, _frame):
        raise KeyboardInterrupt('Maintenance interrupted; restoring touched source.')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    source = Path.home() / 'froge-connector'
    parent = base.safe_path(Path.home() / '.local/state/worldifact-astra-guard')
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock_root = base.safe_path(Path.home() / '.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(str(lock_root / 'installation.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        workspace = parent / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        print('Backup workspace: ' + str(workspace), flush=True)
        result = install(source, workspace, Operations(source, Path.home()), Path(__file__).with_name('astra_spend.py').read_bytes())
        print(json.dumps(result, indent=2))
        print('WORLDIFACT_ASTRA_GUARD_VERIFIED. Sales remain disabled; live quality test still required.')


if __name__ == '__main__':
    try:
        main()
    except base.InstallError as exc:
        print('STOP: ' + str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('STOP: maintenance did not complete. Preserve backups; no secrets should be shared.', file=sys.stderr)
        sys.exit(1)
