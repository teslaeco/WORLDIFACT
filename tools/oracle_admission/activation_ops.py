"""Real native verification and authenticated activation health operations.

No change to historical installers or guards. All native witnesses execute the
pinned CLI/MCP/Podman-Blender gates against disposable code-only stage state.
"""
import importlib
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import time

folder = Path(__file__).resolve().parent.parent / 'model_construction'
if folder.is_dir():
    sys.path.append(str(folder))
import install_construction as previous
import activation_manifest as manifest
import activation_evidence as evidence
import activation_receipts as receipts
import activation_lease

base, legacy, cache = previous.base, previous.legacy, previous.cache
Refused = previous.Refused
HERE = Path(__file__).resolve().parent
ORIGINAL_INSTALLER_SHA256 = '953fbc2182488a91915ac331e18a330d8993759c665d9a55af3d9e653a4408c6'
GATE_TIMEOUT = 600
ENV_ALLOW = ('PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR',
             'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')


def gate_file(name):
    for folder in (HERE, Path(previous.__file__).resolve().parent,
                   HERE.parent / 'model_prebuild', HERE.parent / 'model_execution'):
        path = folder / name
        if path.is_file():
            return path
    raise Refused('native_gate_missing')


def frozen_dependencies():
    if receipts.digest(base.read_regular(Path(previous.__file__))) != ORIGINAL_INSTALLER_SHA256:
        raise Refused('original_installer_changed')
    import oracle_upgrade_launch
    for name, (_path, expected) in oracle_upgrade_launch.FILES.items():
        module = importlib.import_module(name.removesuffix('.py'))
        if base.blob_sha(base.read_regular(Path(module.__file__))) != expected:
            raise Refused('historical_dependency_not_frozen')
    for name, (expected, _) in previous.GATE_FILES.items():
        if base.blob_sha(base.read_regular(gate_file(name))) != expected:
            raise Refused('native_gate_changed')
    if base.blob_sha(base.read_regular(gate_file('offline_models.py'))) != previous.MODEL_GATE_SHA:
        raise Refused('model_gate_changed')
    if receipts.digest(base.read_regular(Path(activation_lease.old.__file__))) != activation_lease.ORIGINAL_FENCE_SHA256:
        raise Refused('historical_fence_changed')


def originals(source):
    value = {name: base.read_regular(source / name) for name in manifest.BEFORE}
    if {name: receipts.digest(raw) for name, raw in value.items()} != manifest.BEFORE:
        raise Refused('admission_predecessor_refused')
    return value


class Operations(previous.Operations):
    def preflight(self):
        manifest.final_manifest()
        frozen_dependencies()
        legacy.check_container_environment()
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise Refused('unsupported_target')
        if self.source != self.home / 'froge-connector' or time.time() >= cache.legacy.VALID_UNTIL:
            raise Refused('source_or_pricing_review_refused')
        self.source_variant = 'PRICING'
        self.update_models = True
        self.expected_source_sha256 = dict(manifest.BEFORE)
        receipts.validate_original(self.source, originals(self.source))
        if (not legacy.studio_pricing.verified_health(self.source)
                or not legacy.terminal_budget.verified_health(self.source)
                or legacy.studio_pricing.maintenance_active(self.source)
                or legacy.terminal_budget.maintenance_active(self.source)):
            raise Refused('existing_pricing_receipt_refused')
        if not legacy.prebuild_policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise Refused('existing_receipt_refused')
        if base.read_regular(self.source / 'astra_spend.py') != Path(cache.legacy.__file__).read_bytes():
            raise Refused('original_guard_refused')
        if receipts.digest(base.read_regular(self.source / 'fast_spend.py')) != cache.previous.FAST_SPEND_SHA256:
            raise Refused('fast_guard_refused')
        for name, expected in base.VERIFIERS.items():
            if base.blob_sha(base.read_regular(self.source / name)) != expected:
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
        activation_lease.pending_admissions(self.source)
        legacy.logout_guard_supported(self)
        from verification_scope import VerificationScope
        scope = VerificationScope()
        scope.start()
        scope.close()

    def quiesce(self):
        return activation_lease.quiesce(self)

    def previous_health(self):
        receipts.validate_original(self.source, originals(self.source))
        self.update_models = True
        previous.Operations.context_health(self, maintenance=False)

    def context_health(self, maintenance=False):
        self.update_models = True
        previous.Operations.context_health(self, maintenance=maintenance)
        if self.read_health().get('studioAdmissionRevision') != manifest.REVISION:
            raise Refused('admission_health_unverified')
        receipts.validate_installed(self.source)

    def run_gate(self, command, log, stage, env, timeout=GATE_TIMEOUT):
        with log.open('xb') as output:
            os.chmod(log, 0o600)
            process = subprocess.Popen(command, cwd=stage, env=env, stdin=subprocess.DEVNULL,
                                       stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                if process.wait(timeout=timeout) != 0:
                    raise Refused('native_pipeline_unverified')
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=10)
                raise
        return base.read_regular(log, 1048576).decode()

    def _verify_stage(self, stage, workspace, lease):
        # The inherited verify_stage starts a VerificationScope/subreaper before
        # calling this method, and drains all descendants on failure/return.
        state = stage / 'state'
        def fresh_state():
            state.mkdir(mode=0o700)
            with sqlite3.connect(state / 'jobs.sqlite') as db:
                db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
        env = {k: v for k, v in os.environ.items() if k in ENV_ALLOW}
        fresh_state()
        generic = legacy.install_completion.Operations(stage, self.home)
        inherited = dict(os.environ)
        try:
            os.environ.clear()
            os.environ.update(env)
            generic.verify(workspace)
        finally:
            os.environ.clear()
            os.environ.update(inherited)
        if not base.receipt_matches(stage):
            raise Refused('generic_pipeline_unverified')
        generic_receipt = base.read_regular(stage / base.RECEIPT, 16384)
        lease.assert_no_work()
        base.safe_path(state)
        shutil.rmtree(state)
        env.update(PYTHONDONTWRITEBYTECODE='1', FROGE_FAST_DRAFT_V1='0')
        results = {}
        for index, (name, (expected, marker)) in enumerate(previous.GATE_FILES.items()):
            verifier = gate_file(name)
            if base.blob_sha(base.read_regular(verifier)) != expected:
                raise Refused('native_gate_changed')
            if name == 'offline_cabinet.py':
                fresh_state()
            command = [sys.executable, '-B', str(verifier), '--source', str(stage)]
            gate_workspace = workspace / ('native-gate-' + str(index))
            if name in ('offline_legacy_standard.py', 'offline_construction.py'):
                gate_workspace.mkdir(mode=0o700)
                command += ['--workspace', str(gate_workspace)]
            output = self.run_gate(command, workspace / ('native-gate-' + str(index) + '.log'), stage, env)
            terminal = (marker + '; real Codex/CodeMode/MCP/Blender; scripted responses; paid quality NOT RUN'
                        if name == 'offline_cabinet.py' else marker)
            if terminal not in output.splitlines():
                raise Refused('native_pipeline_unverified')
            if name == 'offline_legacy_standard.py':
                results['legacy'] = base.read_regular(gate_workspace / 'legacy-standard-evidence.json', 65536)
                evidence.validate_legacy(results['legacy'])
            if name == 'offline_construction.py':
                results['phased'] = base.read_regular(gate_workspace / 'phased-standard-evidence.json', 65536)
                evidence.validate_phased(results['phased'])
            lease.assert_no_work()
            if state.exists():
                base.safe_path(state)
                shutil.rmtree(state)
            if base.read_regular(stage / base.RECEIPT, 16384) != generic_receipt or not base.receipt_matches(stage):
                raise Refused('generic_receipt_changed')
        models = []
        for model, mode in evidence.MODEL_CASES:
            verifier = gate_file('offline_models.py')
            if base.blob_sha(base.read_regular(verifier)) != previous.MODEL_GATE_SHA:
                raise Refused('model_gate_changed')
            print('VERIFY_MODEL ' + model + ' ' + mode, flush=True)
            command = [sys.executable, '-B', str(verifier), '--source', str(stage), '--workspace', str(workspace),
                       '--model', model, '--mode', mode]
            output = self.run_gate(command, workspace / ('model-' + model + '-' + mode + '.log'), stage, env)
            if 'WORLDIFACT_MODEL_EXECUTION_OFFLINE_VERIFIED' not in output.splitlines():
                raise Refused('model_pipeline_unverified')
            raw = base.read_regular(workspace / ('model-' + model + '-' + mode + '.json'), 65536)
            evidence.validate_model(raw, model, mode)
            models.append(raw)
            lease.assert_no_work()
            if os.path.lexists(state) or base.read_regular(stage / base.RECEIPT, 16384) != generic_receipt or not base.receipt_matches(stage):
                raise Refused('model_stage_cleanup_unverified')
        result = evidence.NativeEvidence(generic_receipt, evidence.GATES, results['legacy'], results['phased'], tuple(models))
        evidence.validate_native(result)
        return result

    def verify_ingress(self, stage, workspace, lease):
        from verification_scope import VerificationScope
        scope = VerificationScope()
        scope.start()
        self.verification_scope = scope
        try:
            env = {k: v for k, v in os.environ.items() if k in ENV_ALLOW}
            env['PYTHONDONTWRITEBYTECODE'] = '1'
            helper = HERE / 'offline_admission.py'
            output = self.run_gate([sys.executable, '-B', str(helper), '--source', str(stage),
                                    '--workspace', str(workspace)], workspace / 'native-ingress.log', stage, env, 180)
            if 'WORLDIFACT_DURABLE_INGRESS_OFFLINE_VERIFIED' not in output.splitlines():
                raise Refused('ingress_pipeline_unverified')
            raw = base.read_regular(workspace / 'admission-evidence.json', 65536)
            receipts.validate_ingress(raw)
            lease.assert_no_work()
            return raw
        except BaseException:
            scope.cleanup()
            raise
        finally:
            scope.close()
