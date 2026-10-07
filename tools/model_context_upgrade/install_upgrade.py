"""Explicit, bounded helper-only upgrade of installed PR214. Default is inert.

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
import uuid

HERE = Path(__file__).resolve().parent
for relative in ('tools/model_prebuild', 'tools/model_completion', 'tools/profit_guard'):
    candidate = HERE.parents[1] / relative
    if candidate.is_dir():
        sys.path.insert(0, str(candidate))
import install_prebuild as previous
import install_completion
import completion_policy
import prebuild_policy
import upgrade_patch as context_patch
import context_policy as policy

# Only immutable historical verifier supervision is reused.
context_tools = HERE.parents[1] / 'tools/model_context'
if context_tools.is_dir():
    sys.path.append(str(context_tools))

# Append so the reviewed context fence cannot be shadowed by the tier package.
pricing_tools = HERE.parents[1] / 'tools/model_budget_tiers'
if pricing_tools.is_dir():
    sys.path.append(str(pricing_tools))
import studio_pricing
import terminal_budget

base, cache = previous.base, previous.cache
MAX_STAGE_BYTES = 64 * 1024**2
VERIFY_TIMEOUT = 600


class Refused(base.InstallError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def result(phase, code=None, restored=None, committed=False):
    value = {'phase': phase, 'revision': policy.REVISION, 'paid_generation_requested': False,
             'job_rows_changed': False, 'provider_limits_changed': False,
             'previous_source_restored': restored, 'activation_committed': committed}
    if code is not None:
        value['refusal_code'] = code
    return value


def check_container_environment():
    # The inherited fence/guardian commands and the credential-free gates must
    # inspect the same engine/storage scope. The gate allowlist excludes these
    # selectors; refuse them rather than guess or silently target another store.
    prefixes = ('CONTAINER_', 'CONTAINERS_', '_CONTAINERS_', 'PODMAN_', 'DOCKER_')
    if any(value and (key.startswith(prefixes) or key in ('XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'STORAGE_DRIVER', 'STORAGE_OPTS'))
           for key, value in os.environ.items()):
        raise Refused('container_environment_scope_unproven')


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
        from upgrade_fence import allowed_job_history
        identities = allowed_job_history(connection, allow_cancelled_cleanup, expected_cancelled)
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


def original_sources(source):
    original = {name: base.read_regular(source / name) for name in context_patch.EXPECTED}
    context_patch.reviewed_sources(original)
    return original


def validate_receipts(source, original, revision=context_patch.OLD_REVISION):
    """Require the complete exact source-bound chain; never rewrite old proof."""
    expected = {name: hashlib.sha256(original[name]).hexdigest() for name in context_patch.EXPECTED}
    admitted = context_patch.EXPECTED if revision == context_patch.OLD_REVISION else context_patch.upgraded_manifest()
    if revision not in (context_patch.OLD_REVISION, context_patch.REVISION) or expected != admitted:
        raise Refused('source_receipt_identity_refused')
    coverage = {
        completion_policy.RECEIPT: (completion_policy.REVISION, set(previous.prebuild_patch.EXPECTED)),
        prebuild_policy.RECEIPT: (prebuild_policy.REVISION, set(context_patch.PRICING_EXPECTED) - {'studio_pricing.py', 'terminal_budget.py'}),
        terminal_budget.RECEIPT: (terminal_budget.REVISION, set(context_patch.PRICING_EXPECTED)),
        studio_pricing.RECEIPT: (studio_pricing.REVISION, set(context_patch.PRICING_EXPECTED)),
        policy.RECEIPT: (revision, set(context_patch.EXPECTED)),
    }
    for name, (required_revision, names) in coverage.items():
        proof = json.loads(base.read_regular(source / name, 16384))
        if (not isinstance(proof, dict) or proof.get('revision') != required_revision
                or proof.get('sha256') != {key: expected[key] for key in names}):
            raise Refused('installed_receipt_refused')
        if name in (*context_patch.PRICING_RECEIPTS, policy.RECEIPT):
            gate = 'offline_standard_pipeline' if name == policy.RECEIPT else 'offline_cabinet_pipeline'
            if (proof.get('maintenance_fence') != policy.FENCE_REVISION
                    or type(proof.get('cancelled_cleanup_interruption_approved')) is not bool
                    or proof.get('offline_generic_pipeline') is not True or proof.get(gate) is not True):
                raise Refused('installed_gate_receipt_refused')
    guard = json.loads(base.read_regular(source / cache.legacy.RECEIPT, 16384))
    hashes = {name: hashlib.sha256(base.read_regular(source / name)).hexdigest()
              for name in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py')}
    if (not isinstance(guard, dict) or guard.get('revision') != cache.legacy.REVISION
            or guard.get('sha256') != hashes
            or guard.get('outputPolicy') != {'revision': cache.policy.REVISION, 'sha256': expected['astra_spend_v2.py']}
            or not base.receipt_matches(source)):
        raise Refused('installed_guard_receipt_refused')


def assert_preserved(source, original, modes, desired=None):
    desired = desired or {}
    for name, raw in original.items():
        if (base.read_regular(source / name) != desired.get(name, raw)
                or stat.S_IMODE((source / name).stat().st_mode) != modes[name]):
            raise Refused('concurrent_source_or_receipt_edit')


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
        check_container_environment()
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise Refused('unsupported_target')
        if self.source != self.home / 'froge-connector' or time.time() >= previous.previous.previous.policy.VALID_UNTIL:
            raise Refused('source_or_pricing_review_refused')
        original = original_sources(self.source)
        self.source_variant = context_patch.reviewed_sources(original)
        self.expected_source_sha256 = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
        context_patch.changes(original, (HERE / 'context_policy.py').read_bytes())
        if self.source_variant == 'PRICING':
            if (not studio_pricing.verified_health(self.source) or not terminal_budget.verified_health(self.source)
                    or studio_pricing.maintenance_active(self.source) or terminal_budget.maintenance_active(self.source)):
                raise Refused('existing_pricing_receipt_refused')
        validate_receipts(self.source, original)
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
        self.previous_health()
        logout_guard_supported(self)
        # Probe transient supervision support before the live worker is fenced.
        from verification_scope import VerificationScope
        probe = VerificationScope()
        probe.start()
        probe.close()

    def quiesce(self):
        from upgrade_fence import quiesce
        return quiesce(self)

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
        inherited_env = dict(os.environ)
        try:
            os.environ.clear()
            os.environ.update({key: value for key, value in inherited_env.items() if key in (
                'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')})
            generic.verify(workspace)
        finally:
            os.environ.clear()
            os.environ.update(inherited_env)
        if not base.receipt_matches(stage):
            raise Refused('generic_pipeline_unverified')
        generic_receipt = base.read_regular(stage / base.RECEIPT, 16384)
        lease.assert_no_work()
        # Entire state belongs to this fresh stage and contains synthetic data.
        base.safe_path(state)
        shutil.rmtree(state)
        verifier = HERE / 'offline_standard.py'
        raw = base.read_regular(verifier)
        compile(raw, 'offline_standard.py', 'exec')
        env = {key: value for key, value in os.environ.items() if key in (
            'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
        env.update(PYTHONDONTWRITEBYTECODE='1', FROGE_FAST_DRAFT_V1='0')
        log = workspace / 'offline-upgrade.log'
        with log.open('xb') as output:
            os.chmod(log, 0o600)
            process = subprocess.Popen([sys.executable, '-B', str(verifier), '--source', str(stage)],
                cwd=stage, env=env, stdin=subprocess.DEVNULL, stdout=output,
                stderr=subprocess.STDOUT, start_new_session=True)
            try:
                if process.wait(timeout=VERIFY_TIMEOUT) != 0:
                    raise Refused('standard_pipeline_unverified')
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=10)
                raise
        if 'STANDARD_SELECTIVE_EXEC_REAL_PIPELINE_OK' not in base.read_regular(log, 1048576).decode():
            raise Refused('standard_pipeline_unverified')
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

    def context_health(self, maintenance=False, revision=policy.REVISION):
        sources = {name: base.read_regular(self.source / name) for name in context_patch.EXPECTED}
        validate_receipts(self.source, sources, revision)
        if revision == policy.REVISION and policy.verified_health(self.source).get('worldifactStandardContextPolicy') != revision:
            raise Refused('context_receipt_unverified')
        health = self.read_health()
        self.pricing_health(health)

        if (health.get('worldifactStandardContextPolicy') != revision
                or health.get('worldifactStandardMaintenance') is not maintenance
                or health.get('ready') is not (not maintenance)
                or health.get('worldifactCompletionPolicy') != completion_policy.REVISION
                or health.get('worldifactPrebuildPolicy') != prebuild_policy.REVISION
                or health.get('astraBudgetMaxUsd') != 1.75
                or health.get('astraUsageSettlement') != 'authenticated-completed-only'
                or health.get('astraCacheAccounting') != cache.policy.CACHE_ACCOUNTING_REVISION
                or health.get('provider') != 'openai' or health.get('codexReady') is not True):
            raise Refused('context_health_unverified')

    def read_health(self):
        config = json.loads(base.read_regular(self.source / 'state/config.json', 16384))
        opener = previous.previous.urllib.request.build_opener(previous.previous.urllib.request.ProxyHandler({}), cache.legacy.NoRedirect())
        request = previous.previous.urllib.request.Request('http://127.0.0.1:8765/v1/health', headers={'Authorization': 'Bearer ' + config['token']})
        with opener.open(request, timeout=10) as response:
            raw = response.read(16385)
        if len(raw) > 16384:
            raise Refused('context_health_unverified')
        health = json.loads(raw)
        return health

    def pricing_health(self, health):
        if getattr(self, 'source_variant', None) == 'PRICING' or (self.source / 'studio_pricing.py').exists():
            if (not studio_pricing.verified_health(self.source) or not terminal_budget.verified_health(self.source)
                    or health.get('studioPricingRevision') != studio_pricing.REVISION
                    or health.get('studioPricingTiers') != [dict(tier) for tier in studio_pricing.TIERS]
                    or health.get('studioPricingMaintenance') is not False
                    or health.get('worldifactTerminalBudgetPolicy') != terminal_budget.REVISION
                    or health.get('worldifactTerminalBudgetMaintenance') is not False
                    or studio_pricing.maintenance_active(self.source) or terminal_budget.maintenance_active(self.source)):
                raise Refused('pricing_health_unverified')

    def previous_health(self):
        self.context_health(revision=context_patch.OLD_REVISION)


def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False):
    if approved is not True:
        raise Refused('maintenance_approval_required')
    if type(allow_cancelled_cleanup) is not bool:
        raise Refused('cancelled_consent_invalid')
    check_container_environment()
    operations.allow_cancelled_cleanup = allow_cancelled_cleanup
    operations.cancelled_job_ids = None  # Bound privately by the first DB gate.
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if workspace.exists() or workspace == source or source in workspace.parents:
        raise Refused('unsafe_backup')
    if policy.maintenance_active(source):
        raise Refused('maintenance_already_present')
    operations.preflight()
    original = original_sources(source)
    operations.source_variant = context_patch.reviewed_sources(original)
    operations.expected_source_sha256 = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
    changed = context_patch.changes(original, (HERE / 'context_policy.py').read_bytes())
    patched = {name: raw for name, raw in changed.items() if original.get(name) != raw}
    receipt_names = (completion_policy.RECEIPT, prebuild_policy.RECEIPT, cache.legacy.RECEIPT, base.RECEIPT, policy.RECEIPT)
    if operations.source_variant == 'PRICING':
        receipt_names += context_patch.PRICING_RECEIPTS
    original.update({name: base.read_regular(source / name, 16384) for name in receipt_names})
    validate_receipts(source, original)
    receipts = {name: original[name] for name in receipt_names if name not in (policy.RECEIPT, base.RECEIPT)}
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in original}
    for name, raw in original.items():
        base.atomic_write(workspace / 'originals' / name, raw, modes[name])
    manifest = {'revision': 1, 'originals': {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'mode': modes[name]} for name, raw in original.items()},
                'absent_before': [policy.MAINTENANCE], 'ancestor_commit': context_patch.ANCESTOR_COMMIT,
                'live_write_set': ['context_policy.py', policy.RECEIPT, policy.MAINTENANCE],
                'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup}
    base.atomic_write(workspace / 'ORIGINAL_MANIFEST.json', (json.dumps(manifest, indent=2) + '\n').encode())
    base.summary_file(workspace, 'STANDARD_CONTEXT_UPGRADE_STAGED_NOT_INSTALLED')
    check_container_environment()
    with operations.quiesce() as lease:
        touched = []
        desired = {}
        marker = (json.dumps({'revision': policy.REVISION, 'nonce': uuid.uuid4().hex}, sort_keys=True) + '\n').encode()
        marker_owned = False
        committed = False
        activation_attempted = False
        try:
            assert_preserved(source, original, modes)
            stage = workspace / 'verification-stage'
            copied = stage_runtime(source, stage, changed, receipts)
            runtime_receipt = operations.verify_stage(stage, workspace, lease)
            lease.assert_no_work()
            for name, digest in copied.items():
                maximum = 300 * 1024**2 if name in ('tools/codex/codex', 'tools/codex/codex-code-mode-host') else 2 * 1024**2
                if hashlib.sha256(base.read_regular(source / name, maximum)).hexdigest() != digest:
                    raise Refused('source_changed_during_verification')
            assert_preserved(source, original, modes)
            if any(base.read_regular(stage / name) != raw for name, raw in changed.items()):
                raise Refused('verification_changed_source')
            proof = {'revision': policy.REVISION,
                     'ancestor_commit': context_patch.ANCESTOR_COMMIT,
                     'predecessor_receipt_sha256': hashlib.sha256(original[policy.RECEIPT]).hexdigest(),
                     'sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()},
                     'maintenance_fence': policy.FENCE_REVISION,
                     'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup,
                     'offline_generic_pipeline': True, 'offline_standard_pipeline': True}
            # The new stage proof is retained privately; the unchanged installed
            # generic/completion/prebuild/financial receipts remain byte-identical.
            base.atomic_write(workspace / 'verified-generic-receipt.json', runtime_receipt)
            desired = {**patched, policy.RECEIPT: (json.dumps(proof, indent=2) + '\n').encode()}
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
            identity = wait_for_health(lease, lambda: operations.context_health(maintenance=True))
            with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                lease.assert_worker_identity(identity)
                check_marker(source, marker)
                assert_preserved(source, original, modes, desired)
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
            operations.context_health(maintenance=False)
            lease.confirm_healthy(identity)
            return base.summary_file(workspace, **result('WORLDIFACT_STANDARD_CONTEXT_UPGRADE_VERIFIED', committed=True))
        except BaseException as error:
            if committed or activation_attempted or getattr(lease, 'activation_committed', False):
                # A failed latch acknowledgment leaves the marker in place for
                # review; it does not authorize another activation attempt.
                lease.activation_committed = True
                code = 'activation_health_unconfirmed' if committed else 'activation_commit_unconfirmed'
                value = result('WORLDIFACT_STANDARD_CONTEXT_UPGRADE_NOT_CONFIRMED', code, None, True if committed else None)
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
                    assert_preserved(source, original, modes)
                    # Prove the original bound terminal history before clearing
                    # our marker and restarting the exact PR214 predecessor.
                    with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                        if marker_owned:
                            check_marker(source, marker)
                            (source / policy.MAINTENANCE).unlink()
                            sync_directory(source)
                    operations.start()
                    restored_identity = wait_for_health(restore_lease, operations.previous_health)
                    restore_lease.confirm_healthy(restored_identity)
                lease.confirm_healthy(restored_identity)
                value = result('WORLDIFACT_STANDARD_CONTEXT_UPGRADE_NOT_CONFIRMED', getattr(error, 'code', 'verification_failed'), True)
                base.summary_file(workspace, **value)
                return value
            except BaseException:
                value = result('WORLDIFACT_STANDARD_CONTEXT_UPGRADE_NOT_CONFIRMED', 'recovery_required', False)
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
        workspace = parent / ('standard-context-upgrade-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        value = install(source, workspace, Operations(source, home), approved=True,
                        allow_cancelled_cleanup=args.allow_cancelled_cleanup)
        print(json.dumps(value, sort_keys=True))
        return value


if __name__ == '__main__':
    try:
        observed = main()
        if observed and observed['phase'] == 'WORLDIFACT_STANDARD_CONTEXT_UPGRADE_NOT_CONFIRMED':
            raise SystemExit(1)
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps(result('WORLDIFACT_STANDARD_CONTEXT_UPGRADE_NOT_CONFIRMED', getattr(error, 'code', 'unconfirmed'), None, None), sort_keys=True))
        raise SystemExit(1)
