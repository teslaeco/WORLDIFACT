"""Fixed-scope construction install; default inert and checksum-pinned.

No provider call, live job mutation or budget reset. The copied maintenance
fence preserves original pidfd/guardian/activation semantics. All changed core
bytes and seven old receipts participate in one rollback transaction. Production
activation refuses until the exact runtime and real gate files are frozen.
"""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import hashlib
import importlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
historical = HERE.parents[1] / 'tools/model_context_upgrade'
if historical.is_dir():
    sys.path.append(str(historical))
import install_upgrade as legacy
import construction_health as policy
import construction_manifest as manifest

base, cache = legacy.base, legacy.cache
Refused = legacy.Refused
MAINTENANCE = legacy.policy.MAINTENANCE
SUCCESS = 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED'
FAILURE = 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'
VERIFY_TIMEOUT = 600
INSTALL_TIMEOUT = 3000
GATE_FILES = {
    'offline_cabinet.py': ('d30f21d49a4eb73f9ddb278901f7938f68c6f21c', 'CABINET_FIRST_EXEC_REAL_PIPELINE_OK'),
    'offline_legacy_standard.py': ('cc91dc779cfbefc61df5279a5d9bd66daebf8b98', 'WORLDIFACT_LEGACY_STANDARD_OFFLINE_VERIFIED'),
    'offline_construction.py': ('40ceaf27b5d1721b5d392478d2c4cb11880b48c5', 'WORLDIFACT_PHASED_STANDARD_OFFLINE_VERIFIED'),
}
REQUIRED_GATES = frozenset((*policy.GATES, 'offline_standard_pipeline'))
RECEIPTS = policy.CHAIN_RECEIPTS
NEW_FILES = policy.RUNTIME_HELPERS | {policy.RECEIPT}
WRITES = manifest.MODIFIED | NEW_FILES | RECEIPTS
PAYLOAD_WRITES = frozenset(('construction_payload.py', policy.RECEIPT))
EXECUTABLE_FILES = frozenset(('tools/codex/codex', 'tools/codex/codex-code-mode-host',
                              'tools/codex/codex-binary.json', 'tools/codex/code-mode-host.json'))
# ggml's Linux ARM backend tags contain a decimal architecture separator.
# Keep the eight official tags exact; arbitrary dotted/Python ABI names refuse.
NATIVE_LIBRARY = re.compile(
    r'(?:lib[A-Za-z0-9_+\-]+|libggml-cpu-armv(?:8\.0_1|8\.2_[123]|8\.6_[12]|9\.2_[12]))'
    r'\.so(?:\.[0-9]+)*\Z')
OLLAMA_NATIVE = ('ollama', 'lib', 'ollama')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def result(phase, code=None, restored=None, committed=False):
    value = {'phase': phase, 'revision': policy.REVISION, 'paid_generation_requested': False,
             'job_rows_changed': False, 'provider_limits_changed': False,
             'previous_source_restored': restored, 'activation_committed': committed}
    if code is not None:
        value['refusal_code'] = code
    return value


def assert_absent(source, names):
    for name in names:
        path = base.safe_path(source / name)
        if path.exists() or path.is_symlink():
            raise Refused('unexpected_construction_file')


def auxiliary_identity(info):
    # Ignore access time: reading a directory must not change its attestation.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_uid,
            info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def ollama_inventory(root, expected, maximum):
    """Attest the separate native service without reading/copying large blobs.

    The reviewed worker talks to Ollama over localhost HTTP; this distribution
    is neither staged nor added to Python's import path. Refuse Python source,
    bytecode and unexpected native modules instead of hiding them in this
    metadata-only inventory. Only lib*.so[.VERSION] aliases in lib/ollama may
    link to regular native libraries in that same subtree. Never follow a link
    on disk, including a directory swapped while taking this snapshot.
    """
    entries = {}
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC

    def native(name):
        parts = Path(name).parts
        return parts[:3] == OLLAMA_NATIVE and bool(NATIVE_LIBRARY.fullmatch(parts[-1]))

    def visit(fd, name, before, depth):
        if depth > 32 or auxiliary_identity(os.fstat(fd)) != auxiliary_identity(before):
            raise Refused('unsafe_code_inventory')
        entries[name] = ('auxiliary_directory', auxiliary_identity(before))
        if len(entries) > maximum:
            raise Refused('code_inventory_limit')
        with os.scandir(fd) as listing:
            for entry in listing:
                child = name + '/' + entry.name
                info = os.stat(entry.name, dir_fd=fd, follow_symlinks=False)
                if Path(entry.name).suffix in ('.py', '.pyc', '.pyo', '.pyw', '.pth', '.pyd'):
                    raise Refused('unsafe_code_inventory')
                if stat.S_ISDIR(info.st_mode):
                    child_fd = os.open(entry.name, flags, dir_fd=fd)
                    try:
                        visit(child_fd, child, info, depth + 1)
                    finally:
                        os.close(child_fd)
                elif stat.S_ISLNK(info.st_mode):
                    if not native(child):
                        raise Refused('unsafe_code_inventory')
                    target = os.readlink(entry.name, dir_fd=fd)
                    entries[child] = ('auxiliary_symlink', auxiliary_identity(info), target)
                elif stat.S_ISREG(info.st_mode):
                    if Path(entry.name).suffix == '.so' and not native(child):
                        raise Refused('unsafe_code_inventory')
                    entries[child] = ('auxiliary_file', auxiliary_identity(info))
                else:
                    raise Refused('unsafe_code_inventory')
                if len(entries) > maximum:
                    raise Refused('code_inventory_limit')
                if auxiliary_identity(os.stat(entry.name, dir_fd=fd, follow_symlinks=False)) != auxiliary_identity(info):
                    raise Refused('concurrent_code_inventory_edit')
        if auxiliary_identity(os.fstat(fd)) != auxiliary_identity(before):
            raise Refused('concurrent_code_inventory_edit')

    try:
        fd = os.open(root / 'ollama', flags)
        try:
            visit(fd, 'ollama', expected, 0)
        finally:
            os.close(fd)
        if auxiliary_identity((root / 'ollama').lstat()) != auxiliary_identity(expected):
            raise Refused('concurrent_code_inventory_edit')
    except OSError:
        raise Refused('unsafe_code_inventory') from None

    for name, record in entries.items():
        if record[0] != 'auxiliary_symlink':
            continue
        seen = set()
        while record[0] == 'auxiliary_symlink':
            if name in seen or len(seen) >= 40:
                raise Refused('unsafe_code_inventory')
            seen.add(name)
            target = record[2]
            if not target or target.startswith('/'):
                raise Refused('unsafe_code_inventory')
            parts = name.split('/')[:-1]
            components = target.split('/')
            for index, part in enumerate(components):
                if part == '..':
                    if len(parts) <= len(OLLAMA_NATIVE):
                        raise Refused('unsafe_code_inventory')
                    parts.pop()
                elif part not in ('', '.'):
                    parts.append(part)
                item = entries.get('/'.join(parts))
                if item is None or index < len(components) - 1 and item[0] != 'auxiliary_directory':
                    raise Refused('unsafe_code_inventory')
            name = '/'.join(parts)
            record = entries.get(name)
            if not native(name) or record is None:
                raise Refused('unsafe_code_inventory')
        if record[0] != 'auxiliary_file':
            raise Refused('unsafe_code_inventory')
    return entries


def code_inventory(root):
    """Snapshot import paths, package directories and verified runtime tools.

    Live state is never walked. Interpreter cache directories are not source
    import roots and may be created by the restarted worker; direct .pyc/.pyo
    modules and native extensions remain part of the checked import inventory.
    Every other directory is enumerated without following a symlink, so a new
    json package cannot hide outside the old root-*.py/runtime-only copier.
    The auxiliary Ollama service has a separate bounded no-follow metadata
    snapshot; it is preserved in place and never copied into the Python stage.
    """
    root = base.safe_path(root)
    inventory, pending, observed = {}, [root], 0
    while pending:
        folder = pending.pop()
        info = folder.lstat()
        if not stat.S_ISDIR(info.st_mode):
            raise Refused('unsafe_code_inventory')
        name = folder.relative_to(root).as_posix()
        inventory[name] = ('directory', None, stat.S_IMODE(info.st_mode))
        for path in folder.iterdir():
            observed += 1
            if observed > 16384:
                raise Refused('code_inventory_limit')
            info = path.lstat()
            if folder == root and path.name in ('state', 'tools'):
                # Their fixed paths are checked separately; do not read jobs.
                if not stat.S_ISDIR(info.st_mode):
                    raise Refused('unsafe_code_inventory')
                continue
            if path.name == '__pycache__' and stat.S_ISDIR(info.st_mode):
                continue
            if folder == root and path.name == 'ollama':
                if not stat.S_ISDIR(info.st_mode):
                    raise Refused('unsafe_code_inventory')
                auxiliary = ollama_inventory(root, info, 16384 - observed + 1)
                observed += len(auxiliary) - 1
                inventory.update(auxiliary)
                continue
            if stat.S_ISLNK(info.st_mode):
                raise Refused('unsafe_code_inventory')
            if stat.S_ISDIR(info.st_mode):
                pending.append(path)
            elif path.suffix in ('.py', '.pyc', '.pyo', '.so'):
                if not stat.S_ISREG(info.st_mode):
                    raise Refused('unsafe_code_inventory')
                raw = base.read_regular(path, 32 * 1024**2)
                inventory[path.relative_to(root).as_posix()] = ('file', digest(raw), stat.S_IMODE(info.st_mode))
    for name in EXECUTABLE_FILES:
        path = base.safe_path(root / name)
        raw = base.read_regular(path, 300 * 1024**2)
        inventory[name] = ('file', digest(raw), stat.S_IMODE(path.stat().st_mode))
    return inventory


def assert_inventory(root, expected):
    if code_inventory(root) != expected:
        raise Refused('concurrent_code_inventory_edit')


def updated_inventory(original, desired, modes):
    value = dict(original)
    for name, raw in desired.items():
        if name.endswith('.py'):
            value[name] = ('file', digest(raw), modes.get(name, 0o600))
    return value


def original_sources(source):
    original = {name: base.read_regular(source / name) for name in manifest.EXPECTED}
    manifest.reviewed_sources(original)
    return original


def installed_sources(source):
    original = {name: base.read_regular(source / name) for name in policy.SOURCES}
    manifest.reviewed_installed_sources(original)
    return original


def validate_installed_receipts(source, original):
    manifest.reviewed_installed_sources({name: original[name] for name in policy.SOURCES})
    proof = policy._json(base.read_regular(source / policy.RECEIPT, 16384))
    if (proof.get('sha256') != manifest.payload_predecessor()
            or any(proof.get(gate) is not True for gate in REQUIRED_GATES)
            or policy.verified_health(source) != {'worldifactStandardConstructionPolicy': policy.REVISION}):
        raise Refused('installed_construction_receipt_refused')


def validate_receipts(source, original):
    # The installed predecessor is exactly context-v2, not PR214 context-v1.
    legacy.validate_receipts(source, original, revision=legacy.context_patch.REVISION)


@contextmanager
def final_admission(source, allow_cancelled_cleanup=False, expected_cancelled=None):
    from construction_fence import allowed_job_history
    path = base.safe_path(source / 'state/jobs.sqlite')
    connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=2)
    try:
        connection.execute('BEGIN IMMEDIATE')
        yield allowed_job_history(connection, allow_cancelled_cleanup, expected_cancelled)
    finally:
        connection.rollback()
        connection.close()


@dataclass(frozen=True)
class GateEvidence:
    generic_receipt: bytes
    gates: frozenset


def verified_gate_hashes(changed, evidence):
    if (not isinstance(evidence, GateEvidence) or evidence.gates != REQUIRED_GATES
            or type(evidence.generic_receipt) is not bytes
            or not 0 < len(evidence.generic_receipt) <= 16384):
        raise Refused('complete_pipeline_evidence_required')
    hashes = {name: digest(raw) for name, raw in changed.items()}
    if hashes != manifest.final_manifest():
        raise Refused('frozen_source_identity_required')
    generic = policy._json(evidence.generic_receipt)
    if (generic.get('sources') != {name: hashes[name] for name in ('codex_runner.py', 'blender_mcp.py')}
            or any(generic.get(key) is not True for key in
                   ('cli_mcp_roundtrip', 'code_mode_roundtrip', 'blender_build_roundtrip'))):
        raise Refused('generic_pipeline_unverified')
    return hashes


def payload_update_receipt(original, changed, evidence, allow_cancelled_cleanup):
    hashes = verified_gate_hashes(changed, evidence)
    proof = policy._json(original[policy.RECEIPT])
    proof.update(sha256=hashes,
                 receipt_sha256={name: digest(original[name]) for name in RECEIPTS},
                 cancelled_cleanup_interruption_approved=allow_cancelled_cleanup,
                 **{gate: True for gate in REQUIRED_GATES})
    proof['payload_update'] = {
        'revision': 'responses-reasoning-content-v1',
        'previous_construction_receipt_sha256': digest(original[policy.RECEIPT]),
        'verified_generic_receipt_sha256': digest(evidence.generic_receipt),
    }
    return {policy.RECEIPT: encoded(proof)}


def rebound_receipts(original, changed, evidence, allow_cancelled_cleanup):
    hashes = verified_gate_hashes(changed, evidence)
    receipts = {policy.GENERIC_RECEIPT: evidence.generic_receipt}
    for name, (_revision, coverage) in policy.CHAIN_LAYOUT.items():
        proof = policy._json(original[name])
        proof['sha256'] = {key: hashes[key] for key in coverage}
        if coverage in (policy.PRICING_SOURCES, policy.CORE_SOURCES):
            proof.update(maintenance_fence=policy.FENCE_REVISION,
                         cancelled_cleanup_interruption_approved=allow_cancelled_cleanup,
                         offline_generic_pipeline=True)
            proof['offline_standard_pipeline' if coverage == policy.CORE_SOURCES
                  else 'offline_cabinet_pipeline'] = True
        receipts[name] = encoded(proof)
    guard = policy._json(original[policy.GUARD_RECEIPT])
    guard['sha256']['codex_runner.py'] = hashes['codex_runner.py']
    guard['outputPolicy']['sha256'] = hashes['astra_spend_v2.py']
    receipts[policy.GUARD_RECEIPT] = encoded(guard)
    proof = {'revision': policy.REVISION, 'ancestor_commit': manifest.ANCESTOR_COMMIT,
             'sha256': hashes, 'receipt_sha256': {name: digest(raw) for name, raw in receipts.items()},
             'predecessor_receipt_sha256': digest(original[legacy.policy.RECEIPT]),
             'maintenance_fence': policy.FENCE_REVISION,
             'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup,
             **{gate: True for gate in REQUIRED_GATES}}
    receipts[policy.RECEIPT] = encoded(proof)
    return receipts


def frozen_dependencies():
    """Refuse accidental current-main imports; flat package uses old exact pins."""
    import oracle_upgrade_launch
    for name, (_path, expected) in oracle_upgrade_launch.FILES.items():
        module = importlib.import_module(name.removesuffix('.py'))
        if base.blob_sha(base.read_regular(Path(module.__file__))) != expected:
            raise Refused('historical_dependency_not_frozen')
    for name, (expected, _marker) in GATE_FILES.items():
        if re.fullmatch('[a-f0-9]{40}', expected) is None:
            raise Refused('construction_gates_not_frozen')
        if base.blob_sha(base.read_regular(HERE / name)) != expected:
            raise Refused('construction_gate_changed')


def validate_phased_evidence(raw):
    """Bind the distinct real Podman witness, never a native/marker-only pass."""
    value = policy._json(raw)
    true_flags = {'isolated_podman_execution_verified', 'provider_fixture',
                  'activation_receipt_fixture', 'cleanup_verified'}
    false_flags = {'native_fallback', 'installed_runtime_receipt_written',
                   'live_provider_verified', 'visual_quality_verified'}
    keys = {'revision', 'source_sha256', 'cases', 'container_calls'} | true_flags | false_flags
    def require(condition):
        if not condition:
            raise Refused('phased_pipeline_evidence_unverified')
    require(set(value) == keys and value.get('revision') == policy.REVISION
            and value.get('source_sha256') == manifest.final_manifest()
            and all(value.get(key) is True for key in true_flags)
            and all(value.get(key) is False for key in false_flags))
    cases = value.get('cases')
    require(isinstance(cases, list) and len(cases) == 2)
    fields = {'accepted', 'revision', 'correction', 'server_success_returned', 'model_sha256',
              'render_sha256', 'provider_requests', 'before_correction_model_sha256',
              'before_correction_render_sha256', 'fixture_settled_micro_usd', 'invoice_amount'}
    for index, case in enumerate(cases):
        accepted = index == 0
        phases = ['construction', 'inspection', 'reassessment'] if accepted else ['construction', 'inspection']
        require(isinstance(case, dict) and set(case) == fields
                and case.get('accepted') is accepted and case.get('correction') is accepted
                and case.get('server_success_returned') is accepted
                and type(case.get('revision')) is int and case['revision'] == (2 if accepted else 1)
                and isinstance(case.get('model_sha256'), str) and policy.HASH.fullmatch(case['model_sha256'])
                and policy._hashes(case.get('render_sha256'), {'front', 'side', 'back'})
                and type(case.get('fixture_settled_micro_usd')) is int
                and case['fixture_settled_micro_usd'] == 73844 * len(phases)
                and case.get('invoice_amount') is False)
        requests = case.get('provider_requests')
        require(isinstance(requests, list) and len(requests) == len(phases))
        for request, phase in zip(requests, phases):
            require(isinstance(request, dict) and set(request) == {'phase', 'payload_sha256'}
                    and request.get('phase') == phase and isinstance(request.get('payload_sha256'), str)
                    and policy.HASH.fullmatch(request['payload_sha256']))
        if accepted:
            before = case.get('before_correction_model_sha256')
            require(isinstance(before, str) and policy.HASH.fullmatch(before)
                    and before != case['model_sha256']
                    and policy._hashes(case.get('before_correction_render_sha256'), {'front', 'side', 'back'})
                    and case['before_correction_render_sha256'] != case['render_sha256'])
        else:
            require(case.get('before_correction_model_sha256') is None
                    and case.get('before_correction_render_sha256') is None)
    calls = value.get('container_calls')
    require(isinstance(calls, list) and len(calls) == 5)
    for call, phase in zip(calls, ('build', 'build', 'finalize', 'build', 'finalize')):
        require(isinstance(call, dict) and set(call) == {'job_id', 'phase', 'command_sha256'}
                and call.get('phase') == phase and isinstance(call.get('job_id'), str)
                and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', call['job_id'])
                and isinstance(call.get('command_sha256'), str) and policy.HASH.fullmatch(call['command_sha256']))
    require(len({call['job_id'] for call in calls[:3]}) == 1
            and len({call['job_id'] for call in calls[3:]}) == 1
            and calls[0]['job_id'] != calls[3]['job_id'])
    return value


def validate_legacy_evidence(raw):
    """Require the unchanged CLI gate with immutable synthetic tier terms."""
    value = policy._json(raw)
    true_flags = {'schema_verified', 'actual_images_verified', 'provider_fixture',
                  'original_cli_standard_verified', 'cleanup_verified'}
    false_flags = {'production_budget_changed', 'runtime_route_override', 'installed_receipt_written',
                   'native_fallback', 'live_provider_verified', 'visual_quality_verified'}
    fields = {'execution_id', 'terms', 'immutable_terms_sha256', 'ledger_cap_micro_usd',
              'ledger_policy_revision', 'requests', 'counts', 'scripted_exec_phases',
              'wait_responses', 'original_gate_sha256', 'source_sha256'} | true_flags | false_flags
    if (set(value) != fields or value.get('source_sha256') != manifest.final_manifest()
            or not all(value.get(key) is True for key in true_flags)
            or not all(value.get(key) is False for key in false_flags)
            or not isinstance(value.get('execution_id'), str)
            or re.fullmatch('[a-f0-9]{32}', value['execution_id']) is None
            or value.get('terms') != {'revision':'studio-pricing-v1','tier':'standard','points':250,'maxProviderCents':200}
            or not isinstance(value.get('immutable_terms_sha256'), str)
            or policy.HASH.fullmatch(value['immutable_terms_sha256']) is None
            or type(value.get('ledger_cap_micro_usd')) is not int or value['ledger_cap_micro_usd'] != 2000000
            or value.get('ledger_policy_revision') != 'astra-low-tiered-v1'
            or type(value.get('scripted_exec_phases')) is not int or value['scripted_exec_phases'] != 4
            or type(value.get('wait_responses')) is not int or not 0 <= value['wait_responses'] <= 24
            or type(value.get('requests')) is not int or value['requests'] != 4 + value['wait_responses']
            or type(value.get('counts')) is not int or value['counts'] != value['requests']
            or value.get('original_gate_sha256') != '380063680197b1b175f03da6c6698c84dfb3bd9ff839de61bae69e76aa1d5f4d'):
        raise Refused('legacy_standard_evidence_unverified')
    return value


class Operations(legacy.Operations):
    def preflight(self):
        manifest.final_manifest()
        frozen_dependencies()
        legacy.check_container_environment()
        if os.getuid() == 0 or platform.machine() != 'aarch64' or sys.version_info < (3, 9):
            raise Refused('unsupported_target')
        if self.source != self.home / 'froge-connector' or time.time() >= cache.legacy.VALID_UNTIL:
            raise Refused('source_or_pricing_review_refused')
        update = getattr(self, 'update_payload', False)
        original = installed_sources(self.source) if update else original_sources(self.source)
        self.source_variant = 'PRICING'
        self.expected_source_sha256 = manifest.payload_predecessor() if update else dict(manifest.EXPECTED)
        if (not legacy.studio_pricing.verified_health(self.source)
                or not legacy.terminal_budget.verified_health(self.source)
                or legacy.studio_pricing.maintenance_active(self.source)
                or legacy.terminal_budget.maintenance_active(self.source)):
            raise Refused('existing_pricing_receipt_refused')
        (validate_installed_receipts if update else validate_receipts)(self.source, original)
        if not legacy.prebuild_policy.verified_health(self.source) or not base.receipt_matches(self.source):
            raise Refused('existing_receipt_refused')
        if base.read_regular(self.source / 'astra_spend.py') != Path(cache.legacy.__file__).read_bytes():
            raise Refused('original_guard_refused')
        if digest(base.read_regular(self.source / 'fast_spend.py')) != cache.previous.FAST_SPEND_SHA256:
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
        legacy.logout_guard_supported(self)
        from verification_scope import VerificationScope
        probe = VerificationScope()
        probe.start()
        probe.close()

    def quiesce(self):
        from construction_fence import quiesce
        return quiesce(self)

    def _verify_stage(self, stage, workspace, lease):
        state = stage / 'state'
        def fresh_server_state():
            state.mkdir(mode=0o700)
            with sqlite3.connect(state / 'jobs.sqlite') as db:
                db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
        fresh_server_state()
        generic = legacy.install_completion.Operations(stage, self.home)
        inherited = dict(os.environ)
        env = {key: value for key, value in inherited.items() if key in
               ('PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
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
        for index, (name, (expected, marker)) in enumerate(GATE_FILES.items()):
            verifier = HERE / name
            if base.blob_sha(base.read_regular(verifier)) != expected:
                raise Refused('construction_gate_changed')
            if name == 'offline_cabinet.py':
                # This immutable verifier creates its job folder, while the
                # original server's Blender status updates require this schema.
                # Each gate receives disposable state, never live job history.
                fresh_server_state()
            log = workspace / ('offline-construction-' + str(index) + '.log')
            args = [sys.executable, '-B', str(verifier), '--source', str(stage)]
            if name in ('offline_legacy_standard.py', 'offline_construction.py'):
                gate_workspace = workspace / ('legacy-gate-workspace' if name == 'offline_legacy_standard.py'
                                               else 'phased-gate-workspace')
                gate_workspace.mkdir(mode=0o700, exist_ok=False)
                args += ['--workspace', str(gate_workspace)]
            with log.open('xb') as output:
                os.chmod(log, 0o600)
                process = subprocess.Popen(args,
                    cwd=stage, env=env, stdin=subprocess.DEVNULL, stdout=output,
                    stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    if process.wait(timeout=VERIFY_TIMEOUT) != 0:
                        raise Refused('construction_pipeline_unverified')
                except BaseException:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=15)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait(timeout=10)
                    raise
            if marker not in base.read_regular(log, 1048576).decode():
                raise Refused('construction_pipeline_unverified')
            if name == 'offline_construction.py':
                validate_phased_evidence(base.read_regular(gate_workspace / 'phased-standard-evidence.json', 65536))
            elif name == 'offline_legacy_standard.py':
                validate_legacy_evidence(base.read_regular(gate_workspace / 'legacy-standard-evidence.json', 65536))
            lease.assert_no_work()
            # Some historical verifiers remove their job, leaving empty state.
            # This is wholly synthetic; no live state was ever staged.
            if state.exists():
                base.safe_path(state)
                shutil.rmtree(state)
            if base.read_regular(stage / base.RECEIPT, 16384) != generic_receipt or not base.receipt_matches(stage):
                raise Refused('runtime_receipt_changed')
        return GateEvidence(generic_receipt, REQUIRED_GATES)

    def context_health(self, maintenance=False):
        if policy.verified_health(self.source).get('worldifactStandardConstructionPolicy') != policy.REVISION:
            raise Refused('construction_receipt_unverified')
        health = self.read_health()
        self.pricing_health(health)
        if (health.get('worldifactStandardConstructionPolicy') != policy.REVISION
                or health.get('worldifactStandardContextPolicy') != legacy.policy.REVISION
                or health.get('worldifactStandardMaintenance') is not maintenance
                or health.get('ready') is not (not maintenance)
                or health.get('worldifactCompletionPolicy') != legacy.completion_policy.REVISION
                or health.get('worldifactPrebuildPolicy') != legacy.prebuild_policy.REVISION
                or health.get('astraBudgetMaxUsd') != 1.75
                or health.get('astraUsageSettlement') != 'authenticated-completed-only'
                or health.get('astraCacheAccounting') != cache.policy.CACHE_ACCOUNTING_REVISION
                or health.get('provider') != 'openai' or health.get('codexReady') is not True):
            raise Refused('construction_health_unverified')

    def previous_health(self):
        if getattr(self, 'update_payload', False):
            validate_installed_receipts(self.source, installed_sources(self.source))
            return self.context_health()
        return legacy.Operations.context_health(self, revision=legacy.policy.REVISION)


def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False):
    if approved is not True:
        raise Refused('maintenance_approval_required')
    if type(allow_cancelled_cleanup) is not bool:
        raise Refused('cancelled_consent_invalid')
    if (allow_cancelled_cleanup and (not isinstance(expected_cancelled_job, str)
            or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', expected_cancelled_job))
            or not allow_cancelled_cleanup and expected_cancelled_job is not None):
        raise Refused('cancelled_identity_required')
    if type(update_payload) is not bool:
        raise Refused('payload_update_mode_invalid')
    manifest.final_manifest()  # Before target reads, directories or service work.
    if update_payload:
        manifest.payload_predecessor()
    absent = frozenset() if update_payload else NEW_FILES
    writes = PAYLOAD_WRITES if update_payload else WRITES
    operations.update_payload = update_payload
    legacy.check_container_environment()
    operations.allow_cancelled_cleanup = allow_cancelled_cleanup
    operations.cancelled_job_ids = (expected_cancelled_job,) if allow_cancelled_cleanup else ()
    source, workspace = base.safe_path(source).absolute(), base.safe_path(workspace).absolute()
    if workspace.exists() or workspace == source or source in workspace.parents:
        raise Refused('unsafe_backup')
    if legacy.policy.maintenance_active(source):
        raise Refused('maintenance_already_present')
    assert_absent(source, absent)
    operations.preflight()
    original = installed_sources(source) if update_payload else original_sources(source)
    operations.source_variant = 'PRICING'
    operations.expected_source_sha256 = manifest.payload_predecessor() if update_payload else dict(manifest.EXPECTED)
    if update_payload:
        changed = manifest.payload_changes(original, base.read_regular(HERE / 'construction_payload.py'))
    else:
        helpers = {name: base.read_regular(HERE / name) for name in manifest.HELPERS}
        changed = manifest.changes(original, helpers)
    patched = {name: raw for name, raw in changed.items() if original.get(name) != raw}
    original.update({name: base.read_regular(source / name, 16384) for name in RECEIPTS | ({policy.RECEIPT} if update_payload else set())})
    (validate_installed_receipts if update_payload else validate_receipts)(source, original)
    original_inventory = code_inventory(source)
    workspace.mkdir(mode=0o700, parents=True, exist_ok=False)
    modes = {name: stat.S_IMODE((source / name).stat().st_mode) for name in original}
    for name, raw in original.items():
        base.atomic_write(workspace / 'originals' / name, raw, modes[name])
    backup = {'revision': 1, 'originals': {name: {'sha256': digest(raw), 'bytes': len(raw), 'mode': modes[name]}
               for name, raw in original.items()}, 'absent_before': sorted(absent | {MAINTENANCE}),
              'ancestor_commit': manifest.ANCESTOR_COMMIT, 'live_write_set': sorted(writes | {MAINTENANCE}),
              'original_code_inventory': original_inventory,
              'cancelled_cleanup_interruption_approved': allow_cancelled_cleanup}
    base.atomic_write(workspace / 'ORIGINAL_MANIFEST.json', encoded(backup))
    base.summary_file(workspace, 'STANDARD_CONSTRUCTION_STAGED_NOT_INSTALLED')
    legacy.check_container_environment()
    with operations.quiesce() as lease:
        touched, desired = [], {}
        marker = encoded({'revision': policy.REVISION, 'nonce': uuid.uuid4().hex})
        marker_owned = committed = activation_attempted = False
        try:
            legacy.assert_preserved(source, original, modes)
            assert_inventory(source, original_inventory)
            assert_absent(source, absent)
            stage = workspace / 'verification-stage'
            copied = legacy.stage_runtime(source, stage, changed, {})
            stage_inventory = code_inventory(stage)
            evidence = operations.verify_stage(stage, workspace, lease)
            lease.assert_no_work()
            assert_inventory(stage, stage_inventory)
            assert_inventory(source, original_inventory)
            for name, expected in copied.items():
                maximum = 300 * 1024**2 if name in ('tools/codex/codex', 'tools/codex/codex-code-mode-host') else 2 * 1024**2
                if digest(base.read_regular(source / name, maximum)) != expected:
                    raise Refused('source_changed_during_verification')
            legacy.assert_preserved(source, original, modes)
            assert_absent(source, absent)
            if any(base.read_regular(stage / name) != raw for name, raw in changed.items()):
                raise Refused('verification_changed_source')
            if update_payload:
                receipts = payload_update_receipt(original, changed, evidence, allow_cancelled_cleanup)
                base.atomic_write(workspace / 'PAYLOAD_UPDATE_GENERIC_EVIDENCE.json', evidence.generic_receipt)
                staged_receipts = {**{name: original[name] for name in RECEIPTS}, **receipts}
            else:
                receipts = rebound_receipts(original, changed, evidence, allow_cancelled_cleanup)
                staged_receipts = receipts
            for name, raw in staged_receipts.items():
                base.atomic_write(stage / name, raw)
            if policy.verified_health(stage).get('worldifactStandardConstructionPolicy') != policy.REVISION:
                raise Refused('staged_construction_receipt_unverified')
            desired = {**patched, **receipts}
            if set(desired) != writes:
                raise Refused('unexpected_write_set')
            marker_owned = True
            legacy.write_marker(source, marker)
            for name, raw in desired.items():
                if name in original:
                    if (base.read_regular(source / name) != original[name]
                            or stat.S_IMODE((source / name).stat().st_mode) != modes[name]):
                        raise Refused('concurrent_source_edit')
                else:
                    assert_absent(source, {name})
                touched.append(name)
                base.atomic_write(source / name, raw, modes.get(name, 0o600))
            lease.assert_no_work()
            desired_inventory = updated_inventory(original_inventory, desired, modes)
            assert_inventory(source, desired_inventory)
            operations.start()
            identity = legacy.wait_for_health(lease, lambda: operations.context_health(maintenance=True))
            with final_admission(source, allow_cancelled_cleanup, operations.cancelled_job_ids):
                lease.assert_worker_identity(identity)
                legacy.check_marker(source, marker)
                legacy.assert_preserved(source, original, modes, desired)
                assert_inventory(source, desired_inventory)
                for name in absent:
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
                return value
            try:
                if marker_owned:
                    legacy.check_marker(source, marker)
                with operations.rollback_quiesce(changed, lease) as restore_lease:
                    for name in reversed(touched):
                        path = source / name
                        if not path.exists() and not path.is_symlink() and name not in original:
                            continue
                        if (base.read_regular(path) not in (desired[name], original.get(name))
                                or stat.S_IMODE(path.stat().st_mode) != modes.get(name, 0o600)):
                            raise Refused('concurrent_recovery_edit')
                        if name in original:
                            base.atomic_write(path, original[name], modes[name])
                        else:
                            path.unlink()
                    legacy.assert_preserved(source, original, modes)
                    assert_absent(source, absent)
                    assert_inventory(source, original_inventory)
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
    parser.add_argument('--update-payload', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    parser.add_argument('--expected-cancelled-job')
    args = parser.parse_args(argv)
    if (args.allow_cancelled_cleanup and (not args.approve_service_maintenance
            or not isinstance(args.expected_cancelled_job, str)
            or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', args.expected_cancelled_job))
            or not args.allow_cancelled_cleanup and args.expected_cancelled_job is not None):
        parser.error('cleanup requires maintenance approval and the exact approved job identity')
    if not args.approve_service_maintenance:
        print('PLAN ONLY. No source reads, service signals, installation, exports or generation.')
        return
    manifest.final_manifest()
    if args.update_payload:
        manifest.payload_predecessor()
    frozen_dependencies()
    def interrupted(*_):
        raise KeyboardInterrupt('Maintenance interrupted; preserve verified source.')
    for number in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
        signal.signal(number, interrupted)
    signal.alarm(INSTALL_TIMEOUT)
    home = Path.home()
    source = home / 'froge-connector'
    lock_root = base.safe_path(home / '.local/state/worldifact-fast')
    lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(lock_root / 'installation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        parent = base.safe_path(home / '.local/state/worldifact-astra-guard')
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        workspace = parent / ('standard-construction-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
        value = install(source, workspace, Operations(source, home), approved=True,
                        allow_cancelled_cleanup=args.allow_cancelled_cleanup,
                        expected_cancelled_job=args.expected_cancelled_job, update_payload=args.update_payload)
        print(json.dumps(value, sort_keys=True))
        return value


if __name__ == '__main__':
    try:
        observed = main()
        if observed and observed['phase'] == FAILURE:
            raise SystemExit(1)
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps(result(FAILURE, getattr(error, 'code', 'unconfirmed'), None, None), sort_keys=True))
        raise SystemExit(1)
