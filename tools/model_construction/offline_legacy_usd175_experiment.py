"""Isolated legacy USD 1.75 CLI/Podman experiment; all provider replies scripted.

This is not an installer or a production routing option. It keeps source files,
pricing, ledger, executable pins and container limits unchanged. Only the exact
fresh synthetic job bypasses typed routing in memory, inside this experiment.
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
import shutil
import sys
import textwrap
from unittest.mock import patch

GATE_SHA = '380063680197b1b175f03da6c6698c84dfb3bd9ff839de61bae69e76aa1d5f4d'
SUCCESS = 'LEGACY_USD175_CODE_MODE_EDIT_EXPERIMENT_VERIFIED'
EDIT = 'marker = bpy.data.objects.get("marker")\nmarker.scale.x *= 2'
EVIDENCE = 'legacy-usd175-evidence.json'
REPOSITORY = Path(__file__).resolve().parents[2]


def require(value, reason):
    if not value:
        raise ValueError(reason)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path, maximum=1048576):
    path = Path(path)
    require(not any(p.is_symlink() for p in (path, *path.parents)), 'LINKED_PATH_REFUSED')
    require(path.is_file() and 0 < path.stat().st_size <= maximum, 'BOUNDED_FILE_REQUIRED')
    raw = path.read_bytes()
    require(0 < len(raw) <= maximum, 'BOUNDED_FILE_REQUIRED')
    return raw


def once(value, before, after):
    require(value.count(before) == 1, 'EXACT_ADAPTER_ANCHOR_REQUIRED')
    return value.replace(before, after, 1)


def load_gate(repository=REPOSITORY):
    path = Path(repository) / 'tools/model_context_upgrade/offline_standard.py'
    raw = regular(path)
    require(digest(raw) == GATE_SHA, 'EXACT_ORIGINAL_GATE_REQUIRED')
    spec = importlib.util.spec_from_file_location('original_usd175_gate', path)
    gate = importlib.util.module_from_spec(spec)
    exec(compile(raw, str(path), 'exec'), gate.__dict__)
    return gate, raw


def function_source(raw, name, owner=None):
    tree = ast.parse(raw)
    nodes = tree.body
    if owner:
        nodes = next(node for node in nodes if isinstance(node, ast.ClassDef) and node.name == owner).body
    node = next(node for node in nodes if isinstance(node, ast.FunctionDef) and node.name == name)
    return textwrap.dedent(ast.get_source_segment(raw.decode(), node))


def adapted(gate, raw, name, replacements, owner=None):
    require(digest(raw) == GATE_SHA, 'EXACT_ORIGINAL_GATE_REQUIRED')
    source = function_source(raw, name, owner)
    for before, after in replacements:
        source = once(source, before, after)
    namespace = {}
    exec(compile(source, 'isolated-usd175-' + name, 'exec'), gate.__dict__, namespace)
    return namespace[name]


def edit_programs(original, nonce):
    programs = original(nonce)
    require(len(programs) == 4, 'EXACT_FOUR_PHASES_REQUIRED')
    programs[1] = once(programs[1],
        "const b=JSON.parse(built.content.find(b=>b.type==='text').text);store('build_snapshot',b);",
        "const first=JSON.parse(built.content.find(b=>b.type==='text').text);"
        "if(first.revision!==1)throw new Error('EXACT_FIRST_BUILD_REQUIRED');"
        "const edited=await tools.mcp__blender__edit_model({code:" + json.dumps(EDIT) + ",expected_revision:1});"
        "if(edited.isError){text(edited);throw new Error('FIXTURE_EDIT_FAILED');}"
        "const b=JSON.parse(edited.content.find(b=>b.type==='text').text);"
        "if(b.revision!==2)throw new Error('EXACT_EDIT_REVISION_REQUIRED');store('build_snapshot',b);")
    programs[2] = once(programs[2], "load('build_snapshot')?.revision!==1", "load('build_snapshot')?.revision!==2")
    require(programs[2].count('expected_revision:1') == 2, 'EXACT_REVIEW_ANCHORS_REQUIRED')
    programs[2] = programs[2].replace('expected_revision:1', 'expected_revision:2')
    programs[3] = once(programs[3], "load('current_snapshot')?.revision!==1", "load('current_snapshot')?.revision!==2")
    programs[3] = once(programs[3], 'expected_revision:1', 'expected_revision:2')
    return programs


def adapted_fixture(gate, raw):
    class EditFixture(gate.Fixture):
        maximum_liability_micro_usd = 0

        def open(self, request, timeout):
            import astra_spend_v2 as spend
            payload = json.loads(request.data)
            require(isinstance(payload.get('reasoning'), dict)
                and payload['reasoning'].get('effort') == 'low', 'UNCHANGED_LOW_WIRE_POLICY_REQUIRED')
            if request.full_url == gate.MODEL_URL:
                with spend.ledger(self.folder) as (_, state):
                    liability = spend.used(state)
                    require(liability <= 1750000, 'ORIGINAL_CAP_EXCEEDED')
                    require(sum('response' not in hold for hold in state['holds'].values()) == 1,
                            'ONE_ORIGINAL_PENDING_HOLD_REQUIRED')
                    self.maximum_liability_micro_usd = max(self.maximum_liability_micro_usd, liability)
            return super().open(request, timeout)
    EditFixture.current = adapted(gate, raw, 'current', [("current['info'].get('revision') != 1", "current['info'].get('revision') != 2")], 'Fixture')
    EditFixture.compact_snapshot = adapted(gate, raw, 'compact_snapshot', [("value.get('revision') != 1", "value.get('revision') != 2")], 'Fixture')
    verifier = adapted(gate, raw, 'verify_result', [
        ("outcome.get('revision') != 1 or outcome.get('builds') != 1", "outcome.get('revision') != 2 or outcome.get('builds') != 2"),
        ("'get_modeling_contract', 'build_model', 'inspect_render'", "'get_modeling_contract', 'build_model', 'edit_model', 'inspect_render'"),
        ("review.get('model_revision') != 1", "review.get('model_revision') != 2")])
    return EditFixture, verifier


class RunHook:
    def __init__(self, gate, root, runner, runtime, spend, fixture_class, verifier, workspace):
        self.gate, self.root, self.runner, self.runtime, self.spend = gate, root, runner, runtime, spend
        self.fixture_class, self.verifier, self.workspace = fixture_class, verifier, workspace
        self.create_original, self.run_original = gate.create_fixture_job, runner.run
        self.eligible_original = runtime.eligible
        self.folder = None
        self.active = False
        self.proof = None

    def create(self, root):
        require(Path(root) == self.root and self.folder is None, 'ONE_FRESH_STAGE_JOB_REQUIRED')
        self.folder = self.create_original(root)
        return self.folder

    def eligible(self, folder, instructions):
        if Path(folder) == self.folder and instructions == self.gate.INSTRUCTIONS:
            require(self.active, 'EXACT_ACTIVE_JOB_REQUIRED')
            return False
        return self.eligible_original(folder, instructions)

    def run(self, folder, prompt, instructions, key, cancelled, progress, binary=None):
        fixture = getattr(self.runner.urllib.request.build_opener, 'return_value', None)
        require(not self.active and Path(folder) == self.folder and prompt == self.gate.PROMPT
            and instructions == self.gate.INSTRUCTIONS and key == self.gate.KEY
            and type(fixture) is self.fixture_class and fixture.folder == self.folder
            and fixture.runner is self.runner and not cancelled.is_set()
            and binary == self.root / 'tools/codex/codex'
            and self.spend.legacy.LEDGER_ROOT == self.folder / 'fixture-ledgers'
            and not (self.folder / 'agent-request.json').exists(), 'EXACT_ACTIVE_FIXTURE_REQUIRED')
        require(self.eligible_original(self.folder, instructions) is True, 'TYPED_ROUTE_BASELINE_REQUIRED')
        require(self.spend.studio_pricing.job_terms(self.folder) is None, 'ORIGINAL_NO_TIER_TERMS_REQUIRED')
        with self.spend.ledger(self.folder) as (path, state):
            require(not path.exists() and state['requests'] == 0 and self.spend.used(state) == 0
                and not self.spend.terminal_budget.sealed(path), 'FRESH_ORIGINAL_LEDGER_REQUIRED')
        self.active = True
        try:
            with patch.object(self.runtime, 'eligible', self.eligible):
                return self.run_original(folder, prompt, instructions, key, cancelled, progress, binary=binary)
        finally:
            self.active = False
            self.diagnostics()

    def diagnostics(self):
        artifacts = self.workspace / 'artifacts'
        artifacts.mkdir(exist_ok=True)
        for name in ('agent-usage.json', 'agent-tools.json', 'agent-outcome.json',
                     'codex-events.jsonl', 'codex-stderr.log'):
            source = self.folder / name
            if source.is_file() and 0 < source.stat().st_size <= 1048576:
                (artifacts / name).write_bytes(regular(source))

    def verify(self, folder, fixture, runner, spend, completion):
        require(Path(folder) == self.folder and type(fixture) is self.fixture_class
            and runner is self.runner and spend is self.spend and not self.active,
            'EXACT_COMPLETED_FIXTURE_REQUIRED')
        self.verifier(folder, fixture, runner, spend, completion)
        request = self.gate.record(folder / 'agent-request.json')
        outcome = runner.completed_outcome(folder)
        require(request.get('construction_mode') is None
            and outcome['execution_id'] == request['execution_id'], 'LEGACY_EXECUTION_REQUIRED')
        before = regular(folder / 'candidates/1/model.glb', 48 * 1024**2)
        after = regular(folder / 'candidates/2/model.glb', 48 * 1024**2)
        require(digest(before) != digest(after), 'EDIT_MUST_CHANGE_ACTUAL_GLB')
        require(EDIT in regular(folder / 'candidates/2/edits.py', 60000).decode(), 'ACTUAL_EDIT_SOURCE_REQUIRED')
        ledger_path = spend.legacy.ledger_folder(folder) / spend.legacy.STATE
        state = spend.validate_state(self.gate.record(ledger_path))
        artifacts = self.workspace / 'artifacts'
        artifacts.mkdir(exist_ok=True)
        paths = ['model.glb', 'agent-usage.json', 'agent-tools.json', 'agent-outcome.json',
                 'codex-events.jsonl', 'codex-stderr.log']
        # Optional CLI diagnostics may be empty; no secrets or unrelated files.
        for name in paths:
            source = folder / name
            if source.is_file() and 0 < source.stat().st_size <= 48 * 1024**2:
                (artifacts / name).write_bytes(regular(source, 48 * 1024**2))
        for view in self.gate.VIEWS:
            (artifacts / (view + '.png')).write_bytes(regular(folder / ('candidates/2/review/' + view + '.png'), self.gate.MAX_IMAGE))
        (artifacts / 'ledger.json').write_bytes(regular(ledger_path, 16384))
        self.proof = {'provider_fixture': True, 'live_provider_verified': False,
            'visual_quality_verified': False, 'production_installation_verified': False,
            'synthetic_in_memory_route_override': True, 'runtime_source_changed': False,
            'cap_micro_usd': spend.CEILING_MICRO_USD, 'pricing_terms': None,
            'ledger_revision': state['revision'], 'requests': fixture.requests,
            'counts': fixture.counts, 'ledger_used_micro_usd': spend.used(state),
            'maximum_reserved_liability_micro_usd': fixture.maximum_liability_micro_usd,
            'builds': outcome['builds'], 'revision': outcome['revision'],
            'finished': outcome['finished'], 'accepted': outcome['accepted'],
            'original_glb_sha256': digest(before), 'edited_glb_sha256': digest(after),
            'actual_images_verified': fixture.review_images_verified,
            'schemas_verified': fixture.schemas_verified, 'gate_sha256': GATE_SHA,
            'original_podman_sandbox': True, 'native_fallback': False,
            'requested_and_wire_reasoning': 'low'}


def prepare(public, installed, ancestor, workspace):
    sys.path.insert(0, str(REPOSITORY / 'tools/model_construction'))
    import test_native_pipeline
    import construction_manifest
    require(not workspace.exists(), 'FRESH_WORKSPACE_REQUIRED')
    workspace.mkdir(mode=0o700, parents=True)
    provenance = test_native_pipeline.stage_runtime(public, installed, ancestor, workspace / 'stage')
    expected = construction_manifest.final_manifest()
    require({name: digest(regular(workspace / 'stage' / name)) for name in expected} == expected,
            'EXACT_CURRENT_RUNTIME_REQUIRED')
    provenance['exact_runtime_manifest'] = expected
    provenance['purpose'] = 'isolated legacy USD 1.75 experiment, no installation'
    (workspace / 'source-provenance.json').write_text(json.dumps(provenance, indent=2))


def run(source, workspace):
    gate, raw = load_gate()
    root = gate.preflight(source)
    require(workspace.is_dir() and workspace != root and not (workspace / EVIDENCE).exists(), 'FRESH_EVIDENCE_WORKSPACE_REQUIRED')
    require(shutil.which('podman') is not None, 'PODMAN_REQUIRED_NO_NATIVE_FALLBACK')
    provenance = json.loads(regular(root.parent / 'source-provenance.json'))
    expected = provenance['exact_runtime_manifest']
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    import codex_runner as runner
    import runtime_controller as runtime
    import astra_spend_v2 as spend
    import runtime_check
    import install_codex
    sys.path.insert(0, str(REPOSITORY / 'tools/model_construction'))
    import construction_manifest
    require(expected == construction_manifest.final_manifest(), 'REVIEWED_MANIFEST_REQUIRED')
    require({name: digest(regular(root / name)) for name in expected} == expected, 'SOURCE_MANIFEST_CHANGED')
    for module in (runner, runtime, spend, runtime_check, install_codex):
        require(Path(module.__file__).resolve().parent == root, 'STAGED_MODULE_MISMATCH')
    require(install_codex.verified_runtime(root / 'tools/codex') == root / 'tools/codex/codex', 'PINNED_CLI_RUNTIME_REQUIRED')
    runtime_check.verify_runtime(4)
    fixture_class, verifier = adapted_fixture(gate, raw)
    hook = RunHook(gate, root, runner, runtime, spend, fixture_class, verifier, workspace)
    original_programs = gate.programs
    output = io.StringIO()
    with patch.object(gate, 'Fixture', fixture_class), patch.object(gate, 'programs', lambda nonce: edit_programs(original_programs, nonce)), \
         patch.object(gate, 'create_fixture_job', hook.create), patch.object(runner, 'run', hook.run), \
         patch.object(gate, 'verify_result', hook.verify), redirect_stdout(output):
        code = gate.main(['--source', str(root)])
    (workspace / 'original-gate.log').write_text(output.getvalue())
    require(code == 0 and gate.SUCCESS in output.getvalue().splitlines() and hook.proof is not None, 'ORIGINAL_PIPELINE_NOT_VERIFIED')
    require(not (root / 'state').exists(), 'CLEANUP_UNCONFIRMED')
    require({name: digest(regular(root / name)) for name in expected} == expected, 'SOURCE_CHANGED')
    proof = {**hook.proof, 'source_sha256': expected, 'cleanup_verified': True}
    (workspace / EVIDENCE).write_text(json.dumps(proof, indent=2))
    print(SUCCESS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_subparsers(dest='mode', required=True)
    prep = mode.add_parser('prepare')
    for name in ('public', 'installed', 'ancestor', 'workspace'):
        prep.add_argument('--' + name, required=True, type=Path)
    execute = mode.add_parser('run')
    execute.add_argument('--source', required=True, type=Path)
    execute.add_argument('--workspace', required=True, type=Path)
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(*(getattr(args, key).resolve() for key in ('public', 'installed', 'ancestor', 'workspace')))
    else:
        run(args.source.resolve(), args.workspace.resolve())


if __name__ == '__main__':
    main()
