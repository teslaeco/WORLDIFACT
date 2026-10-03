"""Explicit, bounded Studio tier-budget maintenance. Default invocation is inert.

The target service is never touched by importing this module. Activation needs
exact old sources, a proved maintenance fence, genuine isolated offline gates,
transactional receipts, and authenticated health. No job or budget is reset.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import types
import uuid

HERE = Path(__file__).resolve().parent
for relative in ('tools/model_prebuild', 'tools/model_completion', 'tools/profit_guard', 'tools/model_context', 'tools/model_budget_receipt'):
    candidate = HERE.parents[1] / relative
    if candidate.is_dir():
        sys.path.insert(0, str(candidate))
sys.path.insert(0, str(HERE))
import install_prebuild as previous
import install_completion
import completion_policy
import prebuild_policy
import tiers_patch
sys.path.insert(0, str(HERE))
import studio_pricing as policy
import terminal_budget

base, cache = previous.base, previous.cache
MAX_STAGE_BYTES = 64 * 1024**2
VERIFY_TIMEOUT = 600


class Refused(base.InstallError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


# The copied guardian changes only source-manifest admission. Its kernel,
# process, cgroup, session, DB and exact-worker recovery gates are preserved.
FENCE_SHA256 = 'e8c5d899e190dcbf26946a400f03db9749e191dcac14588d7409725b1d6212a9'


def maintenance_fence():
    path = HERE / 'maintenance_fence.py'
    raw = base.read_regular(path)
    if hashlib.sha256(raw).hexdigest() != FENCE_SHA256:
        raise Refused('maintenance_fence_source_refused')
    name = '_worldifact_studio_pricing_fence'
    module = types.ModuleType(name)
    module.__file__ = str(path.resolve())
    sys.modules[name] = module
    try:
        exec(compile(raw, str(path), 'exec'), module.__dict__)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module


def result(phase, code=None, restored=None, committed=False):
    value = {'phase': phase, 'revision': policy.REVISION, 'paid_generation_requested': False,
             'job_rows_changed': False, 'provider_limits_changed': True if committed is True else (None if committed is None else False),
             'legacy_provider_cap_micro_usd': 1750000,
             'previous_source_restored': restored, 'activation_committed': committed}
    if code is not None:
        value['refusal_code'] = code
    return value


def write_marker(source, marker):
    path = base.safe_path(source / policy.MAINTENANCE)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(marker); stream.flush(); os.fsync(stream.fileno())
    sync_directory(source)


def sync_directory(path):
    fd = os.open(base.safe_path(path), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)


@contextmanager
def final_admission(source, allow_cancelled_cleanup=False, expected_cancelled=None):
    path = base.safe_path(source / 'state/jobs.sqlite')
    connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=2)
    try:
        connection.execute('BEGIN IMMEDIATE')
        identities = maintenance_fence().allowed_job_history(connection, allow_cancelled_cleanup, expected_cancelled)
        yield identities
    finally:
        connection.rollback(); connection.close()


def check_marker(source, marker):
    if base.read_regular(source / policy.MAINTENANCE, 1024) != marker:
        raise Refused('maintenance_marker_changed')


def logout_guard_supported(operations):
    # Read-only login1 policy gate: a detached guardian cannot survive a logout
    # policy that kills its entire inherited session cgroup. Never change it.
    try:
        value = operations.command(['busctl', '--system', 'get-property', 'org.freedesktop.login1',
            '/org/freedesktop/login1', 'org.freedesktop.login1.Manager', 'KillUserProcesses'], timeout=3)
    except Exception:
        raise Refused('session_guard_unproven') from None
    if value != 'b false':
        raise Refused('session_guard_unproven')


def wait_for_health(lease, check, timeout=30):
    """Read-only bounded startup retry, bound to one exact worker invocation."""
    identity = lease.worker_identity()
    deadline = time.monotonic() + timeout
    while True:
        lease.assert_worker_identity(identity)
        try:
            check()
        except (OSError, TimeoutError):
            lease.assert_worker_identity(identity)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Refused('health_startup_timeout') from None
            time.sleep(min(.25, remaining))
            continue
        lease.assert_worker_identity(identity)
        return identity


def helper_sources():
    return {name: base.read_regular(HERE / name) for name in ('studio_pricing.py', 'terminal_budget.py')}


def original_sources(source):
    names = set(tiers_patch.PREBUILD_EXPECTED)
    helper, receipt = source / 'terminal_budget.py', source / terminal_budget.RECEIPT
    if helper.exists() or helper.is_symlink() or receipt.exists() or receipt.is_symlink():
        names.add('terminal_budget.py')
    original = {name: base.read_regular(source / name) for name in names}
    # Validate complete exact ancestry before treating either variant as known.
    tiers_patch.changes(original, helper_sources())
    return original


def receipt_updates(original, patched):
    """Change source identities only; preserve all unrelated receipt fields."""
    completion = json.loads(original[completion_policy.RECEIPT])
    prebuild = json.loads(original[prebuild_policy.RECEIPT])
    guard = json.loads(original[cache.legacy.RECEIPT])
    expected = {name: hashlib.sha256(original[name]).hexdigest() for name in tiers_patch.PREBUILD_EXPECTED}
    if completion != {'revision': completion_policy.REVISION, 'sha256': {n: expected[n] for n in previous.prebuild_patch.EXPECTED}}:
        raise Refused('completion_receipt_refused')
    if prebuild != {'revision': prebuild_policy.REVISION, 'sha256': expected}:
        raise Refused('prebuild_receipt_refused')
    if guard.get('sha256', {}).get('codex_runner.py') != expected['codex_runner.py']:
        raise Refused('guard_receipt_refused')
    if guard.get('outputPolicy', {}).get('sha256') != expected['astra_spend_v2.py']:
        raise Refused('guard_output_receipt_refused')
    if 'terminal_budget.py' in original:
        old = json.loads(original[terminal_budget.RECEIPT])
        old_expected = {name: hashlib.sha256(original[name]).hexdigest() for name in tiers_patch.RECEIPT_EXPECTED}
        if (set(old) != {'revision', 'sha256', 'maintenance_fence', 'cancelled_cleanup_interruption_approved',
                         'offline_generic_pipeline', 'offline_cabinet_pipeline'}
                or old.get('revision') != terminal_budget.REVISION or old.get('sha256') != old_expected
                or old.get('maintenance_fence') != policy.FENCE_REVISION
                or type(old.get('cancelled_cleanup_interruption_approved')) is not bool
                or old.get('offline_generic_pipeline') is not True or old.get('offline_cabinet_pipeline') is not True):
            raise Refused('terminal_budget_receipt_refused')
    for receipt in (completion, prebuild):
        for name in receipt['sha256']:
            receipt['sha256'][name] = hashlib.sha256(patched[name]).hexdigest()
    guard['sha256']['codex_runner.py'] = hashlib.sha256(patched['codex_runner.py']).hexdigest()
    guard['outputPolicy']['sha256'] = hashlib.sha256(patched['astra_spend_v2.py']).hexdigest()
    return {name: (json.dumps(value, indent=2) + '\n').encode() for name, value in (
        (completion_policy.RECEIPT, completion), (prebuild_policy.RECEIPT, prebuild),
        (cache.legacy.RECEIPT, guard))}


def stage_runtime(source, destination, patched, receipts):
    """Copy code and verified executables only; never copy live state/config."""
    source, destination = base.safe_path(source), base.safe_path(destination)
    if destination.exists() or destination == source or source in destination.parents:
        raise Refused('unsafe_stage')
    destination.mkdir(mode=0o700)
    paths = list(source.glob('*.py')) + list((source / 'runtime').rglob('*.py'))
    if not 1 <= len(paths) <= 512:
        raise Refused('stage_source_limit')
    copied = {}
    total = 0
    for path in paths:
        name = path.relative_to(source).as_posix()
        raw = base.read_regular(path, 2 * 1024**2)
        total += len(raw)
        if total > MAX_STAGE_BYTES:
            raise Refused('stage_source_limit')
        copied[name] = hashlib.sha256(raw).hexdigest()
        base.atomic_write(destination / name, patched.get(name, raw))
    if not {'codex_smoke.py', 'install_codex.py', 'runtime_check.py'} <= set(copied):
        raise Refused('stage_dependencies_missing')
    for name, raw in patched.items():
        base.atomic_write(destination / name, raw)
    for name, raw in receipts.items():
        base.atomic_write(destination / name, raw)
    for name in ('codex', 'codex-code-mode-host', 'codex-binary.json', 'code-mode-host.json'):
        path = source / 'tools/codex' / name
        maximum = 300 * 1024**2 if name in ('codex', 'codex-code-mode-host') else 4096
        raw = base.read_regular(path, maximum)
        copied['tools/codex/' + name] = hashlib.sha256(raw).hexdigest()
        base.atomic_write(destination / 'tools/codex' / name, raw, 0o700 if maximum > 4096 else 0o600)
    # The live generic receipt is deliberately not copied. The genuine stage
    # verifier must create a new one, bound to its actual patched runner.
    if (destination / 'state').exists():
        raise Refused('unexpected_stage_state')
    return copied


class Operations(install_completion.Operations):
    def preflight(self):
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise Refused('unsupported_target')
        if self.source != self.home / 'froge-connector' or time.time() >= previous.previous.previous.policy.VALID_UNTIL:
            raise Refused('source_or_pricing_review_refused')
        original = original_sources(self.source)
        self.expected_source_sha256 = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
        self.previous_terminal_budget = 'terminal_budget.py' in original
        if not prebuild_policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise Refused('existing_receipt_refused')
        if base.read_regular(self.source / 'astra_spend.py') != Path(cache.legacy.__file__).read_bytes():
            raise Refused('original_guard_refused')
        if hashlib.sha256(base.read_regular(self.source / 'fast_spend.py')).hexdigest() != cache.previous.FAST_SPEND_SHA256:
            raise Refused('fast_guard_refused')
        for name, digest in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source / name)) != digest:
                raise Refused('verifier_refused')
        if self.state(base.WORKER) != 'active' or self.state(base.TUNNEL) != 'active':
            raise Refused('services_not_healthy')
        if self.command(['systemctl', '--user', 'show', base.WORKER, '--property=WorkingDirectory', '--value']) != str(self.source):
            raise Refused('service_directory_refused')
        if base.read_regular(self.dropin, 1024) != base.DROPIN:
            raise Refused('service_settings_refused')
        if shutil.disk_usage(self.source).free < 4 * 1024**3:
            raise Refused('insufficient_stage_space')
        logout_guard_supported(self)
        # Probe transient supervision support before the live worker is fenced.
        from verification_scope import VerificationScope
        probe = VerificationScope()
        probe.start()
        probe.close()

    def quiesce(self):
        return maintenance_fence().quiesce(self)

    def assert_verifier_drained(self):
        scope = getattr(self, 'verification_scope', None)
        if scope is None:
            return True  # No verifier process has been started by this object.
        scope.assert_drained()
        return True

    def verify_stage(self, stage, workspace, lease):
        from verification_scope import VerificationScope
        scope = VerificationScope()
        scope.start()
        self.verification_scope = scope
        try:
            return self._verify_stage(stage, workspace, lease)
        except BaseException:
            self.verification_scope.cleanup()
            raise
        finally:
            self.verification_scope.close()

    def _verify_stage(self, stage, workspace, lease):
        state = stage / 'state'
        state.mkdir(mode=0o700)
        with sqlite3.connect(state / 'jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
        generic = install_completion.Operations(stage, self.home)
        generic.verify(workspace)
        if not base.receipt_matches(stage):
            raise Refused('generic_pipeline_unverified')
        generic_receipt = base.read_regular(stage / base.RECEIPT, 16384)
        lease.assert_no_work()
        # Entire state belongs to this fresh stage and contains synthetic data.
        base.safe_path(state)
        shutil.rmtree(state)
        verifier = Path(previous.__file__).resolve().parent / 'offline_cabinet.py'
        raw = base.read_regular(verifier)
        compile(raw, 'offline_cabinet.py', 'exec')
        env = {key: value for key, value in os.environ.items() if key in (
            'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
        env.update(PYTHONDONTWRITEBYTECODE='1', FROGE_FAST_DRAFT_V1='0')
        log = workspace / 'offline-cabinet.log'
        with log.open('xb') as output:
            os.chmod(log, 0o600)
            process = subprocess.Popen([sys.executable, '-B', str(verifier), '--source', str(stage)],
                cwd=stage, env=env, stdin=subprocess.DEVNULL, stdout=output,
                stderr=subprocess.STDOUT, start_new_session=True)
            try:
                if process.wait(timeout=VERIFY_TIMEOUT) != 0:
                    raise Refused('cabinet_pipeline_unverified')
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=10)
                raise
        if 'CABINET_FIRST_EXEC_REAL_PIPELINE_OK' not in base.read_regular(log, 1048576).decode():
            raise Refused('cabinet_pipeline_unverified')
        lease.assert_no_work()
        if base.read_regular(stage / base.RECEIPT, 16384) != generic_receipt or not base.receipt_matches(stage):
            raise Refused('runtime_receipt_changed')
        return generic_receipt

    @contextmanager
    def rollback_quiesce(self, expected, existing_lease):
        if self.state(base.WORKER) == 'inactive':
            existing_lease.assert_no_work()
            yield existing_lease
            return
        original = getattr(self, 'expected_source_sha256', None)
        self.expected_source_sha256 = {name: hashlib.sha256(raw).hexdigest() for name, raw in expected.items() if name.endswith('.py')}
        try:
            with self.quiesce() as lease:
                yield lease
        finally:
            if original is None: del self.expected_source_sha256
            else: self.expected_source_sha256 = original

    def read_health(self):
        config = json.loads(base.read_regular(self.source / 'state/config.json', 16384))
        opener = previous.previous.urllib.request.build_opener(previous.previous.urllib.request.ProxyHandler({}), cache.legacy.NoRedirect())
        request = previous.previous.urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization': 'Bearer ' + config['token']})
        with opener.open(request, timeout=10) as response:
            raw = response.read(16385)
        if len(raw) > 16384:
            raise Refused('pricing_health_unverified')
        return json.loads(raw)

    def pricing_health(self, maintenance=False):
        tiers = [{'tier': 'standard', 'points': 250, 'maxProviderCents': 200},
                 {'tier': 'extended', 'points': 500, 'maxProviderCents': 400}]
        proof = policy.verified_health(self.source)
        if proof.get('studioPricingRevision') != policy.REVISION or proof.get('studioPricingTiers') != tiers:
            raise Refused('pricing_receipt_unverified')
        health = self.read_health()
        if (health.get('studioPricingRevision') != policy.REVISION
                or health.get('studioPricingTiers') != tiers
                or health.get('studioPricingMaintenance') is not maintenance
                or health.get('worldifactTerminalBudgetPolicy') != terminal_budget.REVISION
                or health.get('worldifactTerminalBudgetMaintenance') is not maintenance
                or health.get('ready') is not (not maintenance)
                or health.get('worldifactCompletionPolicy') != completion_policy.REVISION
                or health.get('worldifactPrebuildPolicy') != prebuild_policy.REVISION
                or health.get('astraBudgetMaxUsd') != 1.75
                or health.get('astraUsageSettlement') != 'authenticated-completed-only'
                or health.get('astraCacheAccounting') != cache.policy.CACHE_ACCOUNTING_REVISION
                or health.get('provider') != 'openai' or health.get('codexReady') is not True):
            raise Refused('pricing_health_unverified')

    def previous_health(self):
        previous.check_health(self.source)
        if getattr(self, 'previous_terminal_budget', False):
            health = self.read_health()
            if (health.get('worldifactTerminalBudgetPolicy') != terminal_budget.REVISION
                    or health.get('worldifactTerminalBudgetMaintenance') is not False):
                raise Refused('previous_terminal_health_unverified')


def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False):
    if approved is not True:
        raise Refused('maintenance_approval_required')
    if type(allow_cancelled_cleanup) is not bool:
        raise Refused('cancelled_consent_invalid')
    operations.allow_cancelled_cleanup = allow_cancelled_cleanup
    operations.cancelled_job_ids = None  # Bound privately by the first DB gate.
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if workspace.exists() or workspace == source or source in workspace.parents:
        raise Refused('unsafe_backup')
    if policy.maintenance_active(source):
        raise Refused('maintenance_already_present')
    for name in ('context_policy.py', '.worldifact-standard-context.json', '.worldifact-standard-maintenance.json'):
        if (source / name).exists() or (source / name).is_symlink():
            raise Refused('foreign_runtime_present')
    if (source / policy.RECEIPT).exists() or (source / 'studio_pricing.py').exists():
        if not policy.verified_health(source):
            raise Refused('partial_pricing_installation')
        operations.pricing_health()
        return result('ALREADY_VERIFIED', committed=True)
    for name in (policy.RECEIPT, 'studio_pricing.py', terminal_budget.RECEIPT, 'terminal_budget.py'):
        if (source / name).is_symlink():
            raise Refused('unsafe_existing_pricing')
    old_marker = source / '.worldifact-terminal-budget-maintenance.json'
    if old_marker.exists() or old_marker.is_symlink():
        raise Refused('terminal_maintenance_already_present')
    operations.preflight()
    original = original_sources(source)
    operations.expected_source_sha256 = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
    operations.previous_terminal_budget = 'terminal_budget.py' in original
    changed = tiers_patch.changes(original, helper_sources())
    patched = {name: raw for name, raw in changed.items() if original.get(name) != raw}
    receipt_names = [completion_policy.RECEIPT, prebuild_policy.RECEIPT, cache.legacy.RECEIPT, base.RECEIPT]
    if 'terminal_budget.py' in original:
        receipt_names.append(terminal_budget.RECEIPT)
    original.update({name: base.read_regular(source / name, 16384) for name in receipt_names})
    receipts = receipt_updates(original, changed)
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in original}
    for name, raw in original.items():
        base.atomic_write(workspace / 'originals' / name, raw)
    manifest = {'revision': 1, 'originals': {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'mode': modes[name]} for name, raw in original.items()},
                'absent_before': [name for name in ('studio_pricing.py', 'terminal_budget.py', policy.RECEIPT, terminal_budget.RECEIPT, policy.MAINTENANCE) if name not in original],
                'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup}
    base.atomic_write(workspace / 'ORIGINAL_MANIFEST.json', (json.dumps(manifest, indent=2) + '\n').encode())
    base.summary_file(workspace, 'STUDIO_PRICING_STAGED_NOT_INSTALLED')
    with operations.quiesce() as lease:
        touched = []
        desired = {}
        marker = (json.dumps({'revision': policy.REVISION, 'nonce': uuid.uuid4().hex}, sort_keys=True) + '\n').encode()
        marker_owned = False
        committed = False
        activation_attempted = False
        try:
            if any(base.read_regular(source / name) != raw for name, raw in original.items()):
                raise Refused('source_changed_after_fence')
            stage = workspace / 'verification-stage'
            copied = stage_runtime(source, stage, changed, receipts)
            runtime_receipt = operations.verify_stage(stage, workspace, lease)
            lease.assert_no_work()
            for name, digest in copied.items():
                maximum = 300 * 1024**2 if name in ('tools/codex/codex', 'tools/codex/codex-code-mode-host') else 2 * 1024**2
                if hashlib.sha256(base.read_regular(source / name, maximum)).hexdigest() != digest:
                    raise Refused('source_changed_during_verification')
            if any(base.read_regular(stage / name) != raw for name, raw in changed.items()):
                raise Refused('verification_changed_source')
            proof = {'revision': policy.REVISION,
                     'sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()},
                     'maintenance_fence': policy.FENCE_REVISION,
                     'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup,
                     'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True}
            terminal_proof = {**proof, 'revision': terminal_budget.REVISION}
            desired = {**patched, **receipts, base.RECEIPT: runtime_receipt,
                       terminal_budget.RECEIPT: (json.dumps(terminal_proof, indent=2) + '\n').encode(),
                       policy.RECEIPT: (json.dumps(proof, indent=2) + '\n').encode()}
            marker_owned = True
            write_marker(source, marker)
            # No attestation is written to the live source until genuine stage
            # verification and source-preservation checks have all passed.
            for name, raw in desired.items():
                if name in original and base.read_regular(source / name) != original[name]:
                    raise Refused('concurrent_source_edit')
                if name not in original and ((source / name).exists() or (source / name).is_symlink()):
                    raise Refused('concurrent_helper_creation')
                touched.append(name)
                base.atomic_write(source / name, raw, modes.get(name, 0o600))
            lease.assert_no_work()
            operations.start()
            identity = wait_for_health(lease, lambda: operations.pricing_health(maintenance=True))
            with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                lease.assert_worker_identity(identity)
                check_marker(source, marker)
                if any(base.read_regular(source / name) != raw for name, raw in desired.items()):
                    raise Refused('source_changed_before_activation')
                # The lease records POSSIBLE activation before the non-idempotent
                # unlink. An interrupt after a successful unlink cannot report
                # uncommitted or enter rollback, even if Python never returns.
                activation_attempted = True
                if lease.confirm_activation_committed() is not True:
                    raise Refused('activation_latch_unconfirmed')
                (source / policy.MAINTENANCE).unlink()
                committed = True
                sync_directory(source)
            # Admission is open after unlink. Never stop or roll back a worker
            # that could have accepted a new job, even if this final GET fails.
            operations.pricing_health(maintenance=False)
            lease.confirm_healthy(identity)
            return base.summary_file(workspace, **result('WORLDIFACT_STUDIO_PRICING_VERIFIED', committed=True))
        except BaseException as error:
            if committed or activation_attempted or getattr(lease, 'activation_committed', False):
                # A failed latch acknowledgment leaves the marker in place for
                # review; it does not authorize another activation attempt.
                lease.activation_committed = True
                code = 'activation_health_unconfirmed' if committed else 'activation_commit_unconfirmed'
                value = result('WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED', code, None, True if committed else None)
                base.summary_file(workspace, **value)
                return value
            try:
                # The live tunnel is unchanged. Re-fence an activated process
                # before touching source; its marker still blocks every route
                # except authenticated health, queued work and reconciliation.
                if marker_owned:
                    check_marker(source, marker)
                with operations.rollback_quiesce(changed, lease) as restore_lease:
                    for name in reversed(touched):
                        path = source / name
                        if not path.exists() and not path.is_symlink() and name not in original:
                            continue
                        if base.read_regular(path) not in (desired[name], original.get(name)):
                            raise Refused('concurrent_recovery_edit')
                        if name in original:
                            base.atomic_write(path, original[name], modes[name])
                        else:
                            path.unlink()
                    if any(base.read_regular(source / name) != raw for name, raw in original.items()):
                        raise Refused('rollback_source_mismatch')
                    # Old startup has no marker gate: prove unchanged bound
                    # terminal history and no nonterminal rows before starting.
                    with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                        if marker_owned:
                            check_marker(source, marker)
                            (source / policy.MAINTENANCE).unlink()
                            sync_directory(source)
                    operations.start()
                    restored_identity = wait_for_health(restore_lease, operations.previous_health)
                    restore_lease.confirm_healthy(restored_identity)
                lease.confirm_healthy(restored_identity)
                value = result('WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED', getattr(error, 'code', 'verification_failed'), True)
                base.summary_file(workspace, **value)
                return value
            except BaseException:
                value = result('WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED', 'recovery_required', False)
                base.summary_file(workspace, **value)
                raise Refused('recovery_required') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--approve-service-maintenance', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    args = parser.parse_args(argv)
    if args.allow_cancelled_cleanup and not args.approve_service_maintenance:
        parser.error('--allow-cancelled-cleanup also requires --approve-service-maintenance')
    if not args.approve_service_maintenance:
        print('PLAN ONLY. No source reads, service signals, installation, exports or generation.')
        return
    def interrupted(*_):
        raise KeyboardInterrupt('Maintenance interrupted; restore verified source.')
    for number in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
        signal.signal(number, interrupted)
    signal.alarm(1500)
    home = Path.home()
    source = home / 'froge-connector'
    lock_root = base.safe_path(home / '.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(lock_root / 'installation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        parent = base.safe_path(home / '.local/state/worldifact-astra-guard')
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        workspace = parent / ('studio-pricing-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        value = install(source, workspace, Operations(source, home), approved=True,
                        allow_cancelled_cleanup=args.allow_cancelled_cleanup)
        print(json.dumps(value, sort_keys=True))
        return value


if __name__ == '__main__':
    try:
        observed = main()
        if observed and observed['phase'] == 'WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED':
            raise SystemExit(1)
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps(result('WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED', getattr(error, 'code', 'unconfirmed'), None, None), sort_keys=True))
        raise SystemExit(1)
