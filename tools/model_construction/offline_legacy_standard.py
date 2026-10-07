"""Genuine old STANDARD CLI gate on one isolated immutable tier-$2 fixture.

The original offline_standard.py stays byte-identical. Only its exact synthetic
job's runner hook binds existing Studio terms, after the original gate redirects
its ledger. The unchanged eligibility function then selects the original CLI
route. A narrowly pinned in-memory verifier adaptation checks those real tier
terms instead of the old gate's no-terms expectation. No production bypass flag,
provider call, installed receipt, budget reset, or native-Blender fallback exists.
"""
import argparse
import ast
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import sys
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
LEGACY_SHA256 = '380063680197b1b175f03da6c6698c84dfb3bd9ff839de61bae69e76aa1d5f4d'
SUCCESS = 'WORLDIFACT_LEGACY_STANDARD_OFFLINE_VERIFIED'
EVIDENCE = 'legacy-standard-evidence.json'
TERMS = {'revision': 'studio-pricing-v1', 'tier': 'standard', 'points': 250, 'maxProviderCents': 200}
OLD_TERMS_CHECK = '''    # This gate deliberately remains on the original USD 1.75 no-terms path,
    # including when unchanged PR195 tier helpers are installed in the stage.
    if (spend.CEILING_MICRO_USD != 1750000 or ledger.get('revision') != spend.REVISION
            or any((ledger_path.parent / name).exists() or (ledger_path.parent / name).is_symlink()
                   for name in ('.worldifact-studio-pricing.json', '.worldifact-astra-terminal-budget.json'))):
        raise Refused('FIXTURE_TERMS_CHANGED')'''
NEW_TERMS_CHECK = '''    # Only this exact captured synthetic job has explicit immutable tier-$2 terms.
    terms = spend.studio_pricing.job_terms(folder)
    if (spend.CEILING_MICRO_USD != 1750000
            or terms != {'revision': 'studio-pricing-v1', 'tier': 'standard', 'points': 250, 'maxProviderCents': 200}
            or spend.studio_pricing.cap_and_revision(terms) != (2000000, spend.studio_pricing.POLICY_REVISION)
            or ledger.get('revision') != spend.studio_pricing.POLICY_REVISION
            or spend.terminal_budget.sealed(ledger_path)):
        raise Refused('FIXTURE_TERMS_CHANGED')'''


class Refused(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Refused(reason)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path, maximum=1048576):
    path = Path(path)
    require(not any(p.is_symlink() for p in (path, *path.parents)), 'LINKED_GATE_PATH')
    require(path.is_file() and 0 < path.stat().st_size <= maximum, 'BOUNDED_GATE_FILE_REQUIRED')
    raw = path.read_bytes()
    require(0 < len(raw) <= maximum, 'BOUNDED_GATE_FILE_REQUIRED')
    return raw


def legacy_path():
    packaged = HERE / 'offline_standard.py'
    return packaged if packaged.exists() else HERE.parent / 'model_context_upgrade/offline_standard.py'


def load_legacy(path=None):
    path = Path(path) if path is not None else legacy_path()
    raw = regular(path)
    require(digest(raw) == LEGACY_SHA256, 'EXACT_LEGACY_GATE_REQUIRED')
    spec = importlib.util.spec_from_file_location('worldifact_legacy_standard_fixture', path)
    module = importlib.util.module_from_spec(spec)
    # Execute the exact checked bytes, not a second path read after the hash.
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module, raw


def verifier_source(raw):
    """Alter only two exact pricing assumptions in the pinned verifier body."""
    require(digest(raw) == LEGACY_SHA256, 'EXACT_LEGACY_GATE_REQUIRED')
    text = raw.decode('utf-8')
    node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == 'verify_result')
    body = ast.get_source_segment(text, node)
    before = 'ledger = spend.validate_state(record(ledger_path))'
    after = 'ledger = spend.validate_state(record(ledger_path), 2000000, spend.studio_pricing.POLICY_REVISION)'
    require(body.count(before) == body.count(OLD_TERMS_CHECK) == 1, 'EXACT_LEGACY_VERIFIER_ANCHORS_REQUIRED')
    return body.replace(before, after, 1).replace(OLD_TERMS_CHECK, NEW_TERMS_CHECK, 1)


def adapted_verifier(module, raw):
    namespace = {}
    exec(compile(verifier_source(raw), 'tiered-legacy-standard-verifier.py', 'exec'), module.__dict__, namespace)
    return namespace['verify_result']


class RunHook:
    """Inert until the original gate creates one fresh captured fixture job."""
    def __init__(self, legacy, root, runner, spend, runtime, verifier):
        self.legacy, self.root, self.runner, self.spend, self.runtime = legacy, root, runner, spend, runtime
        self.original_create = legacy.create_fixture_job
        self.original_run = runner.run
        self.verifier = verifier
        self.folder = None
        self.phase = 'uninitialized'
        self.proof = None

    def create(self, root):
        require(Path(root) == self.root and self.phase == 'uninitialized', 'EXACT_SYNTHETIC_JOB_REQUIRED')
        folder = self.original_create(root)
        require(folder.parent == self.root / 'state/jobs'
                and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', folder.name),
                'EXACT_SYNTHETIC_JOB_REQUIRED')
        self.folder, self.phase = folder, 'created'
        return folder

    def run(self, folder, prompt, instructions, key, cancelled, progress, binary=None):
        legacy, spend = self.legacy, self.spend
        # The exact original gate installs its inert opener and private ledger
        # before invoking this hook. No ordinary job can satisfy this context.
        fixture = getattr(self.runner.urllib.request.build_opener, 'return_value', None)
        require(self.phase == 'created' and Path(folder) == self.folder
                and prompt == legacy.PROMPT and instructions == legacy.INSTRUCTIONS and key == legacy.KEY
                and binary == self.root / 'tools/codex/codex'
                and type(fixture) is legacy.Fixture and fixture.folder == self.folder and fixture.runner is self.runner
                and spend.legacy.LEDGER_ROOT == self.folder / 'fixture-ledgers'
                and not (self.folder / 'agent-request.json').exists()
                and not (self.folder / 'agent-request.json').is_symlink()
                and not cancelled.is_set(), 'EXACT_ACTIVE_LEGACY_FIXTURE_REQUIRED')
        require(spend.studio_pricing.job_terms(self.folder) is None, 'FRESH_SYNTHETIC_TERMS_REQUIRED')
        with spend.ledger(self.folder) as (path, state):
            require(not path.exists() and state['requests'] == 0 and not state['holds']
                    and spend.used(state) == 0 and not spend.terminal_budget.sealed(path),
                    'FRESH_SYNTHETIC_LEDGER_REQUIRED')
        # No mutable override: this is the existing immutable binding function,
        # applied only to the exact fresh job in the old gate's private ledger.
        spend.studio_pricing.bind(self.folder, dict(TERMS))
        self.terms_path = spend.studio_pricing.folder_root(self.folder) / spend.studio_pricing.TERMS
        self.terms_bytes = regular(self.terms_path, 16384)
        require(spend.studio_pricing.job_terms(self.folder) == TERMS
                and self.runtime.eligible(self.folder, instructions) is False,
                'EXPLICIT_TERMS_MUST_SELECT_ORIGINAL_CLI')
        self.phase = 'running'
        result = self.original_run(folder, prompt, instructions, key, cancelled, progress, binary=binary)
        request = legacy.record(self.folder / 'agent-request.json')
        outcome = self.runner.completed_outcome(self.folder)
        execution = request.get('execution_id')
        require(isinstance(execution, str) and execution
                and request.get('prompt') == legacy.PROMPT and request.get('instructions') == legacy.INSTRUCTIONS
                and isinstance(outcome, dict) and outcome.get('execution_id') == execution
                and isinstance(result, dict) and result.get('execution_id') == execution
                and request.get('construction_mode') is None
                and regular(self.terms_path, 16384) == self.terms_bytes,
                'ORIGINAL_FIXTURE_EXECUTION_CHANGED')
        self.execution, self.fixture, self.phase = execution, fixture, 'completed'
        return result

    def verify(self, folder, fixture, runner, spend, completion):
        require(self.phase == 'completed' and Path(folder) == self.folder and fixture is self.fixture
                and runner is self.runner and spend is self.spend
                and self.legacy.record(self.folder / 'agent-request.json').get('execution_id') == self.execution
                and regular(self.terms_path, 16384) == self.terms_bytes,
                'EXACT_COMPLETED_LEGACY_FIXTURE_REQUIRED')
        self.verifier(folder, fixture, runner, spend, completion)
        self.proof = {'execution_id': self.execution, 'terms': dict(TERMS),
            'immutable_terms_sha256': digest(self.terms_bytes),
            'ledger_cap_micro_usd': 2000000, 'ledger_policy_revision': spend.studio_pricing.POLICY_REVISION,
            'requests': fixture.requests, 'counts': fixture.counts,
            'schema_verified': fixture.schemas_verified, 'actual_images_verified': fixture.review_images_verified,
            'scripted_exec_phases': fixture.phase, 'wait_responses': fixture.waits,
            'provider_fixture': True, 'original_cli_standard_verified': True,
            'original_gate_sha256': LEGACY_SHA256, 'production_budget_changed': False,
            'runtime_route_override': False, 'installed_receipt_written': False, 'native_fallback': False,
            'live_provider_verified': False, 'visual_quality_verified': False}
        self.phase = 'verified'


def run(source, workspace):
    legacy, raw = load_legacy()
    root = legacy.preflight(source)
    workspace = Path(workspace).absolute()
    require(workspace.is_dir() and workspace != root
            and not any(p.is_symlink() for p in (workspace, *workspace.parents)), 'SEPARATE_SAFE_WORKSPACE_REQUIRED')
    require(not (workspace / EVIDENCE).exists() and not (workspace / EVIDENCE).is_symlink(), 'FRESH_EVIDENCE_PATH_REQUIRED')
    require(shutil.which('podman') is not None, 'PODMAN_REQUIRED_NO_NATIVE_FALLBACK')
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    import codex_runner as runner
    import astra_spend_v2 as spend
    import runtime_controller as runtime
    import construction_health
    for module in (runner, spend, runtime, construction_health):
        require(Path(module.__file__).resolve().parent == root, 'STAGED_MODULE_MISMATCH')
    source_hashes = {name: digest(regular(root / name)) for name in construction_health.SOURCES}
    hook = RunHook(legacy, root, runner, spend, runtime, adapted_verifier(legacy, raw))
    output = io.StringIO()
    with patch.object(legacy, 'create_fixture_job', hook.create), \
         patch.object(runner, 'run', hook.run), \
         patch.object(legacy, 'verify_result', hook.verify), redirect_stdout(output):
        code = legacy.main(['--source', str(root)])
    require(code == 0 and legacy.SUCCESS in output.getvalue().splitlines()
            and hook.phase == 'verified' and hook.proof is not None, 'ORIGINAL_LEGACY_PIPELINE_NOT_VERIFIED')
    require(not (root / 'state').exists() and not (root / 'state').is_symlink(), 'LEGACY_CLEANUP_UNCONFIRMED')
    require(source_hashes == {name: digest(regular(root / name)) for name in construction_health.SOURCES}, 'STAGED_SOURCE_CHANGED')
    require(digest(regular(legacy.__file__)) == LEGACY_SHA256, 'ORIGINAL_LEGACY_GATE_CHANGED')
    proof = {**hook.proof, 'source_sha256': source_hashes, 'cleanup_verified': True}
    descriptor = os.open(workspace / EVIDENCE, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        stream.write(json.dumps(proof, sort_keys=True)); stream.flush(); os.fsync(stream.fileno())


class Parser(argparse.ArgumentParser):
    def error(self, _message):
        raise Refused('INVALID_ARGUMENTS')


def main(argv=None):
    try:
        parser = Parser(description=__doc__)
        parser.add_argument('--source', required=True)
        parser.add_argument('--workspace', required=True)
        args = parser.parse_args(argv)
        run(args.source, args.workspace)
        print(SUCCESS)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        reason = str(error) if isinstance(error, Refused) else 'LEGACY_GATE_FAILED'
        print('WORLDIFACT_LEGACY_STANDARD_OFFLINE_FAILED ' + reason)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
