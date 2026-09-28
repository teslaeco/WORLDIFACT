"""Opt-in ASTRA guard for exact audited v33 and v33+FAST-spend variants.
No paid generation. Unknown sources are never approved from a hash alone.
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
import subprocess
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
FAST_SPEND_EXPECTED = {
    'codex_runner.py': '7a86631ce06034e255e0b45a22b342743029b976dfd3879eab9f166fab2c5479',
    'fast_preview.py': 'f010dcf0fc501c24278035d8f582680f36a344aefe73a7236b5e0fa3260d1b6d',
}
FAST_SPEND_SHA256 = '3a904ba15edd0b7636709b491d957fcd88da211be5a8a9decd31627ecb4173c2'
ANCHOR = "                    request=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode(),headers=headers)"
OLD_FAST_CALL = """                    if outer.fast_limits['fast']:
                        try:
                            fast_spend.protect(outer.folder, payload, headers)
                        except fast_spend.SpendError:
                            outer.stop('FORGE_FAST_COST_GUARD','FAST cost guard stopped before another provider request. Keep this job; no automatic paid retry.')
                            return self.reject(422,outer.error,outer.error_code)
"""
OLD_FAST_HEALTH = """    if enabled:
        from fast_spend import REVISION, CEILING_MICRO_USD, VALID_UNTIL
        if time.time() < VALID_UNTIL:
            value['fastBudgetRevision'] = REVISION
            value['fastBudgetMaxUsd'] = CEILING_MICRO_USD // 1000000
"""


def once(text, old, new):
    if text.count(old) != 1:
        raise base.InstallError('Reviewed ASTRA request context differs. Nothing changed.')
    return text.replace(old, new, 1)


def reviewed_variant(originals):
    if set(originals) != set(EXPECTED):
        raise base.InstallError('Unexpected source selection.')
    hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in originals.items()}
    if hashes == EXPECTED:
        return 'FAST_V33_BASE'
    if hashes != FAST_SPEND_EXPECTED:
        raise base.InstallError('Unreviewed installed runner/helper pair. No service stopped.')
    # Prove ancestry by reversing ONLY the previously reviewed installation.
    # Never normalize newlines or bless arbitrary source from a displayed hash.
    runner = once(originals['codex_runner.py'].decode(), 'import fast_preview\nimport fast_spend\n', 'import fast_preview\n')
    runner = once(runner, OLD_FAST_CALL + ANCHOR, ANCHOR)
    profile = once(originals['fast_preview.py'].decode(), OLD_FAST_HEALTH, '')
    recovered = {'codex_runner.py': runner.encode(), 'fast_preview.py': profile.encode()}
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in recovered.items()} != EXPECTED:
        raise base.InstallError('FAST-spend ancestry proof failed. Nothing changed.')
    return 'FAST_V33_WITH_SPEND'


def changes(originals, helper):
    reviewed_variant(originals)
    # Patch the CURRENT bytes, not the reconstructed ancestor. Old FAST behavior stays.
    runner = once(originals['codex_runner.py'].decode(), 'import fast_preview\n', 'import fast_preview\nimport astra_spend\n')
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


# The existing verified smoke test supplies fixture Responses, not live AI.
# Its additional token-count endpoint must also be a fixture. Keep protect/reserve
# running and restrict fixture output to 1,024 tokens so the multi-step fixture
# fits the UNCHANGED $1.75 cap. None of these mocks is installed in runtime source.
OFFLINE_CHECK = r'''
from pathlib import Path
from unittest.mock import patch
import socket
import sys
import astra_spend
import codex_smoke

def no_remote(event, args):
    if event == 'socket.connect':
        address = args[1]
        if isinstance(address, tuple) and address[0] not in ('127.0.0.1', '::1'):
            raise RuntimeError('Offline verification refused external network')
sys.addaudithook(no_remote)
protect = astra_spend.protect
calls = []
def fixture_counter(payload, headers):
    calls.append(True)
    return 100

def bounded_fixture(folder, payload, headers):
    payload['max_output_tokens'] = min(1024, payload['max_output_tokens'])
    return protect(folder, payload, headers, counter=fixture_counter)

with patch.object(astra_spend, 'protect', bounded_fixture):
    if codex_smoke.main(build=True) is not True or len(calls) < 4:
        raise RuntimeError('Missing genuine offline pipeline or guard calls')
print('ASTRA_GUARD_OFFLINE_ROUNDTRIP_OK; real Codex/MCP/Blender, fixture tokens/responses, no paid API')
'''


class Operations(base.LiveOperations):
    def preflight(self):
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise base.InstallError('Use the existing unprivileged Oracle ARM account.')
        if time.time() >= guard.VALID_UNTIL:
            raise base.InstallError('Pricing review expired; guard was not installed.')
        originals = {name: base.read_regular(self.source / name) for name in EXPECTED}
        variant = reviewed_variant(originals)
        if variant == 'FAST_V33_WITH_SPEND' and hashlib.sha256(base.read_regular(self.source / 'fast_spend.py')).hexdigest() != FAST_SPEND_SHA256:
            raise base.InstallError('Existing FAST-spend helper differs. Nothing overwritten.')
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
        print('Verified installed source variant: ' + variant, flush=True)

    def verify(self, workspace):
        if base.blob_sha(base.read_regular(self.source / 'codex_smoke.py')) != base.VERIFIERS['codex_smoke.py']:
            raise base.InstallError('Offline verifier changed before execution.')
        env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
        env.update(PYTHONDONTWRITEBYTECODE='1', FROGE_FAST_DRAFT_V1='0')
        fd = os.open(str(workspace / 'offline-verification.log'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        print('Offline Codex/Blender verification in progress; this can take several minutes. No paid model request.', flush=True)
        with os.fdopen(fd, 'wb') as output:
            process = subprocess.Popen([sys.executable, '-B', '-c', OFFLINE_CHECK], cwd=self.source,
                env=env, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                if process.wait(timeout=600) != 0:
                    raise base.InstallError('Offline Codex/Blender and ASTRA guard check failed.')
            except BaseException:
                if process.poll() is None:
                    try: os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError: pass
                    try: process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=10)
                raise
        if not base.receipt_matches(self.source):
            raise base.InstallError('Genuine offline verifier did not confirm current source.')


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
    for name, raw in original.items(): base.atomic_write(workspace / 'originals' / name, raw)
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
            operations.verify(workspace)
            operations.start(); operations.health(True); check_health(source)
            return base.summary_file(workspace, 'INSTALLED_AND_LOCALLY_VERIFIED', revision=guard.REVISION,
                max_provider_usd=1.75, astra_sales_enabled=False, quality_test='NOT_REQUESTED')
        except BaseException:
            try:
                operations.stop()
                for name in reversed(touched):
                    current = base.read_regular(source / name)
                    if current not in (patched[name], original.get(name)):
                        raise base.InstallError('Concurrent recovery edit; preserve backup.')
                    if name in original: base.atomic_write(source / name, original[name], modes[name])
                    else: (source / name).unlink()
                base.atomic_write(source / base.RECEIPT, old_receipt)
                operations.start(); operations.health(True)
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
        print('PLAN ONLY. No changes, restart or paid generation. Explicit approval is required.'); return
    def interrupted(_signal, _frame):
        raise KeyboardInterrupt('Maintenance interrupted; restoring touched source.')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGHUP, interrupted)
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
    try: main()
    except base.InstallError as exc:
        print('STOP: ' + str(exc), file=sys.stderr); sys.exit(1)
    except Exception:
        print('STOP: maintenance did not complete. Preserve backups; no secrets should be shared.', file=sys.stderr); sys.exit(1)
