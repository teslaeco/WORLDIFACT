"""Restore the v33 Astra gateway request timeout to 15 minutes, safely.

This is an idle-only maintenance patch for the already verified WORLDIFACT
Oracle worker. It changes only codex_runner.py's authenticated OpenAI response
socket timeout from 180 to 900 seconds. It does not change the USD1.75 spend
guard, request/output limits, customer credits, Stripe/PayPal, retries, prompts,
models, jobs or artifacts.

Default is PLAN ONLY. Installation requires --approve-service-restart.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import stat
import sys
import time
import uuid

import install_cache_accounting as cache
import astra_spend_v2 as policy

base = cache.base
RUNNER = 'codex_runner.py'
OLD = "with opener.open(request,timeout=180) as response:"
NEW = "with opener.open(request,timeout=900) as response:"
REVISION = 'astra-request-timeout900-v1'


def patch_runner(raw):
    if not isinstance(raw, (bytes, bytearray)):
        raise base.InstallError('Invalid runner bytes.')
    text = bytes(raw).decode('utf-8')
    if text.count(NEW) == 1 and text.count(OLD) == 0:
        return bytes(raw), False
    if text.count(OLD) != 1 or text.count(NEW) != 0:
        raise base.InstallError('Reviewed Astra request-timeout context differs. Nothing changed.')
    patched = text.replace(OLD, NEW, 1).encode()
    compile(patched, RUNNER, 'exec')
    return patched, True


def runtime_verified(source):
    runner = base.read_regular(Path(source) / RUNNER)
    if runner.count(NEW.encode()) != 1 or OLD.encode() in runner:
        raise base.InstallError('The installed runner does not contain the reviewed 900-second request timeout.')
    if not base.receipt_matches(source):
        raise base.InstallError('Current Codex/MCP verification receipt does not match the timeout-patched runner.')
    cache.check_health(source)


class Operations(cache.Operations):
    def preflight(self):
        # This maintenance runs AFTER the cache-accounting update, so verify the
        # CURRENT reviewed policy instead of requiring its pre-update blob.
        if os.getuid() == 0 or self.source != self.home / 'froge-connector' or time.time() >= policy.VALID_UNTIL:
            raise base.InstallError('Unexpected Oracle account/source or expired pricing review.')
        originals = {name: base.read_regular(self.source / name) for name in cache.previous.EXPECTED}
        variant = cache.reviewed_installed_variant(originals)
        if base.read_regular(self.source / cache.POLICY_FILE) != Path(policy.__file__).read_bytes():
            raise base.InstallError('Installed cache-accounting policy differs from the reviewed current policy.')
        if base.read_regular(self.source / 'astra_spend.py') != Path(cache.legacy.__file__).read_bytes():
            raise base.InstallError('Installed original guard differs; nothing changed.')
        if not policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise base.InstallError('Current cache-accounting/runtime receipt is invalid.')
        if variant == 'FAST_V33_WITH_SPEND' and hashlib.sha256(base.read_regular(self.source / 'fast_spend.py')).hexdigest() != cache.previous.FAST_SPEND_SHA256:
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
        runner = base.read_regular(self.source / RUNNER)
        _, changed = patch_runner(runner)
        if not changed:
            raise base.InstallError('The 900-second request timeout is already present; use read-only verification instead.')


def install(source, workspace, operations, approved=False):
    if approved is not True:
        raise base.InstallError('Service maintenance approval is required. Nothing changed.')
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if workspace.exists() or workspace == source or source in workspace.parents:
        raise base.InstallError('Use a new private backup directory outside the worker.')

    current = base.read_regular(source / RUNNER)
    patched, changed = patch_runner(current)
    if not changed:
        runtime_verified(source)
        return {'phase':'ALREADY_VERIFIED','revision':REVISION,'astra_request_timeout_seconds':900,
                'max_provider_usd':1.75,'paid_generation_requested':False,'payment_settings_changed':False}

    operations.preflight()
    original_receipt = base.read_regular(source / base.RECEIPT, 16384)
    original = base.read_regular(source / RUNNER)
    patched, changed = patch_runner(original)
    if not changed:
        raise base.InstallError('Concurrent timeout update detected; no overwrite.')

    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    mode = stat.S_IMODE((source / RUNNER).stat().st_mode)
    base.atomic_write(workspace / 'originals' / RUNNER, original)
    base.atomic_write(workspace / 'original-runtime-receipt.json', original_receipt)
    base.summary_file(workspace, 'STAGED_TIMEOUT900_NOT_INSTALLED',
                      astra_request_timeout_seconds=900, max_provider_usd=1.75,
                      paid_generation_requested=False, payment_settings_changed=False)

    with operations.quiesce():
        touched = False
        try:
            operations.assert_idle()
            if base.read_regular(source / RUNNER) != original:
                raise base.InstallError('Concurrent source change; no overwrite.')
            base.atomic_write(source / RUNNER, patched, mode)
            touched = True
            operations.verify(workspace)
            operations.start()
            operations.health(True)
            runtime_verified(source)
            return base.summary_file(workspace, 'ASTRA_REQUEST_TIMEOUT900_VERIFIED',
                revision=REVISION, astra_request_timeout_seconds=900,
                agent_budget_seconds_unchanged=1800, max_provider_usd=1.75,
                paid_generation_requested=False, payment_settings_changed=False,
                quality_test='NOT_RUN')
        except BaseException:
            try:
                operations.stop()
                if touched:
                    current_bytes = base.read_regular(source / RUNNER)
                    if current_bytes not in (patched, original):
                        raise base.InstallError('Concurrent recovery edit; preserve backup.')
                    base.atomic_write(source / RUNNER, original, mode)
                    base.atomic_write(source / base.RECEIPT, original_receipt)
                operations.start()
                operations.health(True)
                cache.check_health(source)
                base.summary_file(workspace, 'ROLLED_BACK_TIMEOUT900')
            except BaseException:
                base.summary_file(workspace, 'RECOVERY_REQUIRED_TIMEOUT900')
                raise base.InstallError('Recovery requires review; preserve private backups.') from None
            raise base.InstallError('Timeout update verification failed; previous working runner restored.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args()
    if not args.approve_service_restart:
        print('PLAN ONLY. No installation, restart, provider call, generation, refund or payment change.')
        return
    def interrupted(*_):
        raise KeyboardInterrupt('Restore touched source before exit.')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    home = Path.home()
    source = home / 'froge-connector'
    parent = base.safe_path(home / '.local/state/worldifact-astra-guard')
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock_root = base.safe_path(home / '.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(str(lock_root / 'installation.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        workspace = parent / ('timeout900-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        result = install(source, workspace, Operations(source, home), approved=True)
        print(json.dumps(result, indent=2))
        print('WORLDIFACT_ASTRA_REQUEST_TIMEOUT900_INSTALLED. Payments unchanged. Paid generation NOT RUN.')


if __name__ == '__main__':
    try:
        main()
    except base.InstallError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('STOP: timeout900 maintenance is unconfirmed. Preserve backups; do not run a paid retry.', file=sys.stderr)
        sys.exit(1)
