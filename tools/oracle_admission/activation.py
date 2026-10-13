"""Atomic Oracle durable-admission installation with verified native gates.

Default is inert. This is a distinct, fixed-scope release, not a new operation
under an old maintenance grant. No provider request, customer-row write, budget
reset or key change exists in this transaction. Unknown activation is never retried.
"""
import argparse
from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import re
import signal
import sqlite3
import stat
import sys
import time
import uuid

import activation_manifest as manifest
import activation_evidence as evidence
import activation_receipts as receipts
import activation_lease as fence
from activation_ops import Operations, originals, frozen_dependencies, previous

base, legacy = previous.base, previous.legacy
Refused = previous.Refused
MAINTENANCE = previous.MAINTENANCE
SUCCESS = 'WORLDIFACT_DURABLE_ADMISSION_VERIFIED'
FAILURE = 'WORLDIFACT_DURABLE_ADMISSION_NOT_CONFIRMED'
NEW_FILES = frozenset((*manifest.HELPERS, manifest.RECEIPT))
WRITES = frozenset(('server.py', *manifest.HELPERS, manifest.RECEIPT)) | receipts.RECEIPTS
INSTALL_TIMEOUT = 3600


def result(phase, code=None, restored=None, committed=False):
    value = {'phase': phase, 'revision': manifest.REVISION, 'paid_generation_requested': False,
             'job_rows_changed': False, 'provider_limits_changed': False,
             'previous_source_restored': restored, 'activation_committed': committed}
    if code is not None:
        value['refusal_code'] = code
    return value


@contextmanager
def final_admission(source, allow_cancelled, expected_cancelled):
    path = base.safe_path(source / 'state/jobs.sqlite')
    connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=2)
    try:
        connection.execute('BEGIN IMMEDIATE')
        fence.pending_admissions(source)
        yield fence.old.allowed_job_history(connection, allow_cancelled, expected_cancelled)
    finally:
        connection.rollback()
        connection.close()


def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None):
    if approved is not True:
        raise Refused('maintenance_approval_required')
    if type(allow_cancelled_cleanup) is not bool:
        raise Refused('cancelled_consent_invalid')
    if ((allow_cancelled_cleanup and (not isinstance(expected_cancelled_job, str)
            or re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', expected_cancelled_job) is None))
            or (not allow_cancelled_cleanup and expected_cancelled_job is not None)):
        raise Refused('cancelled_identity_required')
    manifest.final_manifest()  # Unknown/unfrozen release fails before target reads.
    legacy.check_container_environment()
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if (os.path.lexists(workspace) or workspace == source or source in workspace.parents
            or workspace in source.parents):
        raise Refused('unsafe_backup')
    if legacy.policy.maintenance_active(source):
        raise Refused('maintenance_already_present')
    previous.assert_absent(source, NEW_FILES)
    operations.allow_cancelled_cleanup = allow_cancelled_cleanup
    operations.cancelled_job_ids = (expected_cancelled_job,) if allow_cancelled_cleanup else ()
    operations.source_variant = 'PRICING'
    operations.update_models = True
    operations.expected_source_sha256 = dict(manifest.BEFORE)
    operations.preflight()
    original = originals(source)
    changed = manifest.changes(original)
    patched = {name: raw for name, raw in changed.items() if original.get(name) != raw}
    original.update({name: base.read_regular(source / name, 16384) for name in receipts.RECEIPTS})
    receipts.validate_original(source, original)
    original_inventory = previous.code_inventory(source)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in original}
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, raw in original.items():
        base.atomic_write(workspace / 'originals' / name, raw, modes[name])
    backup = {'revision': 1, 'kind': manifest.REVISION,
              'originals': {name: {'sha256': receipts.digest(raw), 'bytes': len(raw), 'mode': modes[name]}
                            for name, raw in original.items()},
              'absent_before': sorted(NEW_FILES | {MAINTENANCE}), 'live_write_set': sorted(WRITES | {MAINTENANCE}),
              'original_code_inventory': original_inventory,
              'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup}
    base.atomic_write(workspace / 'ORIGINAL_MANIFEST.json', receipts.encoded(backup))
    base.summary_file(workspace, **result('WORLDIFACT_DURABLE_ADMISSION_STAGED'))
    with operations.quiesce() as lease:
        touched, desired = [], {}
        marker = receipts.encoded({'revision': previous.policy.REVISION, 'nonce': uuid.uuid4().hex})
        marker_owned = committed = activation_attempted = False
        try:
            legacy.assert_preserved(source, original, modes)
            previous.assert_inventory(source, original_inventory)
            previous.assert_absent(source, NEW_FILES)
            stage = workspace / 'verification-stage'
            copied = legacy.stage_runtime(source, stage, changed, {})
            stage_inventory = previous.code_inventory(stage)
            native = operations.verify_stage(stage, workspace, lease)
            evidence.validate_native(native)
            lease.assert_no_work()
            previous.assert_inventory(stage, stage_inventory)
            previous.assert_inventory(source, original_inventory)
            for name, expected in copied.items():
                maximum = 300 * 1024**2 if name in ('tools/codex/codex', 'tools/codex/codex-code-mode-host') else 2 * 1024**2
                if receipts.digest(base.read_regular(source / name, maximum)) != expected:
                    raise Refused('source_changed_during_verification')
            legacy.assert_preserved(source, original, modes)
            previous.assert_absent(source, NEW_FILES)
            if any(base.read_regular(stage / name) != raw for name, raw in changed.items()):
                raise Refused('verification_changed_source')
            rebound = receipts.rebound(original, changed, native, allow_cancelled_cleanup)
            for name, raw in rebound.items():
                base.atomic_write(stage / name, raw)
            if previous.policy.verified_health(stage) != {'worldifactStandardConstructionPolicy': previous.policy.REVISION}:
                raise Refused('staged_construction_receipt_unverified')
            ingress = operations.verify_ingress(stage, workspace, lease)
            receipts.validate_ingress(ingress)
            previous.assert_inventory(stage, stage_inventory)
            if os.path.lexists(stage / 'state'):
                raise Refused('ingress_cleanup_unverified')
            # A verifier must not rewrite a stage receipt or source after review.
            if any(base.read_regular(stage / n) != b for n, b in {**changed, **rebound}.items()):
                raise Refused('ingress_changed_stage')
            legacy.assert_preserved(source, original, modes)
            previous.assert_inventory(source, original_inventory)
            rebound[manifest.RECEIPT] = receipts.activation_receipt(changed, rebound, native, ingress)
            base.atomic_write(stage / manifest.RECEIPT, rebound[manifest.RECEIPT])
            receipts.validate_installed(stage)
            desired = {**patched, **rebound}
            if set(desired) != WRITES:
                raise Refused('unexpected_write_set')
            marker_owned = True
            legacy.write_marker(source, marker)
            for name, raw in desired.items():
                if name in original:
                    if (base.read_regular(source / name) != original[name]
                            or stat.S_IMODE((source / name).stat().st_mode) != modes[name]):
                        raise Refused('concurrent_source_edit')
                else:
                    previous.assert_absent(source, {name})
                touched.append(name)  # Include writes whose acknowledgement is lost.
                base.atomic_write(source / name, raw, modes.get(name, 0o600))
            lease.assert_no_work()
            desired_inventory = previous.updated_inventory(original_inventory, desired, modes)
            previous.assert_inventory(source, desired_inventory)
            operations.start()
            identity = legacy.wait_for_health(lease, lambda: operations.context_health(maintenance=True))
            with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                lease.assert_worker_identity(identity)
                legacy.check_marker(source, marker)
                legacy.assert_preserved(source, original, modes, desired)
                previous.assert_inventory(source, desired_inventory)
                for name in NEW_FILES:
                    if base.read_regular(source / name) != desired[name] or stat.S_IMODE((source / name).stat().st_mode) != 0o600:
                        raise Refused('concurrent_new_source_edit')
                activation_attempted = True
                if lease.confirm_activation_committed() is not True:
                    raise Refused('activation_latch_unconfirmed')
                (source / MAINTENANCE).unlink()
                committed = True
                legacy.sync_directory(source)
            operations.context_health(maintenance=False)
            lease.confirm_healthy(identity)
            return base.summary_file(workspace, **result(SUCCESS, committed=True))
        except BaseException as error:
            if committed or activation_attempted or getattr(lease, 'activation_committed', False):
                lease.activation_committed = True
                code = 'activation_health_unconfirmed' if committed else 'activation_commit_unconfirmed'
                value = result(FAILURE, code, None, True if committed else None)
                base.summary_file(workspace, **value)
                return value  # No downgrade/retry after potentially accepted work.
            try:
                if marker_owned:
                    legacy.check_marker(source, marker)
                with operations.rollback_quiesce(changed, lease) as restore_lease:
                    for name in reversed(touched):
                        path = source / name
                        if not os.path.lexists(path) and name not in original:
                            continue
                        if (base.read_regular(path) not in (desired[name], original.get(name))
                                or stat.S_IMODE(path.stat().st_mode) != modes.get(name, 0o600)):
                            raise Refused('concurrent_recovery_edit')
                        if name in original:
                            base.atomic_write(path, original[name], modes[name])
                        else:
                            path.unlink()
                    legacy.sync_directory(source)
                    legacy.assert_preserved(source, original, modes)
                    previous.assert_absent(source, NEW_FILES)
                    previous.assert_inventory(source, original_inventory)
                    with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                        if marker_owned:
                            legacy.check_marker(source, marker)
                            (source / MAINTENANCE).unlink()
                            legacy.sync_directory(source)
                    operations.start()
                    restored_identity = legacy.wait_for_health(restore_lease, operations.previous_health)
                    restore_lease.confirm_healthy(restored_identity)
                lease.confirm_healthy(restored_identity)
                value = result(FAILURE, getattr(error, 'code', 'verification_failed'), True)
                base.summary_file(workspace, **value)
                return value
            except BaseException:
                base.summary_file(workspace, **result(FAILURE, 'recovery_required', False))
                raise Refused('recovery_required') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--approve-service-maintenance', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    parser.add_argument('--expected-cancelled-job')
    args = parser.parse_args(argv)
    if not args.approve_service_maintenance:
        print('PLAN ONLY. No source read, connection, service change or provider call.')
        return
    manifest.final_manifest()
    frozen_dependencies()
    def interrupted(*_):
        raise KeyboardInterrupt('Maintenance interrupted; preserve verified source.')
    for number in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
        signal.signal(number, interrupted)
    signal.alarm(INSTALL_TIMEOUT)
    home = Path.home()
    lock_root = base.safe_path(home / '.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(lock_root / 'installation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        parent = base.safe_path(home / '.local/state/worldifact-astra-guard')
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        workspace = parent / ('durable-admission-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        source = home / 'froge-connector'
        value = install(source, workspace, Operations(source, home), approved=True,
                        allow_cancelled_cleanup=args.allow_cancelled_cleanup,
                        expected_cancelled_job=args.expected_cancelled_job)
        print(receipts.encoded(value).decode())
        return value


if __name__ == '__main__':
    try:
        value = main()
        if value and value['phase'] == FAILURE:
            raise SystemExit(1)
    except (Exception, KeyboardInterrupt) as error:
        print(receipts.encoded(result(FAILURE, getattr(error, 'code', 'unconfirmed'), None, None)).decode())
        raise SystemExit(1)
