"""One genuine CLI/MCP/Podman-Blender gate for an immutable model/mode.

Only Responses/token counting are scripted. The exact historical gate still
requires the actual CLI, seven actual MCP calls, a real GLB and three current
PNG renders. Its terminal verdict remains honestly unaccepted: this is transport
evidence, not a paid model or visual-quality assessment. No installed receipt is
written. The installer runs six separate processes against disposable state.
"""
import argparse
import ast
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
construction = HERE.parent / 'model_construction'
if construction.is_dir(): sys.path.append(str(construction))
import offline_legacy_standard as old

SUCCESS = 'WORLDIFACT_MODEL_EXECUTION_OFFLINE_VERIFIED'
MODELS = ('astra', 'sol', 'luna')
MODES = ('standard', 'fast')


def verifier_source(raw):
    old.require(old.digest(raw) == old.LEGACY_SHA256, 'EXACT_LEGACY_GATE_REQUIRED')
    text = raw.decode('utf-8')
    node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == 'verify_result')
    body = ast.get_source_segment(text, node)
    start = body.index('    ledger_path = spend.legacy.ledger_folder(folder) / spend.legacy.STATE')
    end = body.index("    usage = record(folder / 'agent-usage.json')", start)
    return body[:start] + '''    terms = selected.job_terms(folder)
    root = selected.root_for(folder)
    ledger = selected.validate_state(record(root / selected.STATE), terms)
    if (terms != selection or (root / spend.legacy.STATE).exists()
            or (root / '.worldifact-studio-pricing.json').exists()
            or len(ledger['holds']) != fixture.requests
            or any('response' not in hold for hold in ledger['holds'].values())
            or selected.used(ledger) != selected.cost(terms, 100, 100) * fixture.requests):
        raise Refused('CUMULATIVE_MODEL_FIXTURE_ACCOUNTING_FAILED')
''' + body[end:] + '''
    if usage.get('model') != selected.MODELS[selection['model']][0]:
        raise Refused('WRONG_PROVIDER_MODEL_IN_USAGE')
'''


def run(source, workspace, model, mode):
    legacy, raw = old.load_legacy()
    root = legacy.preflight(source)
    workspace = Path(workspace).absolute()
    old.require(workspace.is_dir() and workspace != root
        and not any(p.is_symlink() for p in (workspace, *workspace.parents)), 'SEPARATE_SAFE_WORKSPACE_REQUIRED')
    evidence_path = workspace / ('model-' + model + '-' + mode + '.json')
    old.require(not os.path.lexists(evidence_path), 'FRESH_EVIDENCE_REQUIRED')
    sys.path.insert(0, str(root))
    import codex_runner as runner
    import studio_execution as selected
    import astra_spend_v2 as spend
    import construction_health
    for module in (runner, selected, spend, construction_health):
        old.require(Path(module.__file__).resolve().parent == root, 'STAGED_MODULE_MISMATCH')
    selection = selected.validate({'revision': selected.REVISION, 'model': model, 'mode': mode})
    api_model, cap, *_ = selected.MODELS[model]
    tier = 'fast' if mode == 'fast' else 'default'
    names = construction_health.SOURCES | {'studio_execution.py'}
    hashes = {name: old.digest(old.regular(root / name)) for name in names}
    proof = {}
    original_fixture, original_run = legacy.Fixture, runner.run
    verifier_namespace = {**legacy.__dict__, 'selected': selected, 'selection': selection}
    exec(compile(verifier_source(raw), 'selected-model-verifier.py', 'exec'), verifier_namespace)
    verify_original = verifier_namespace['verify_result']

    class Fixture(original_fixture):
        def open(self, request, timeout):
            old.require(request.get_method() == 'POST' and request.get_header('Authorization') == 'Bearer ' + legacy.KEY,
                        'UNEXPECTED_FIXTURE_REQUEST')
            old.require(isinstance(request.data, bytes) and 0 < len(request.data) <= legacy.MAX_PAYLOAD,
                        'FIXTURE_PAYLOAD_INVALID')
            payload = json.loads(request.data)
            old.require(isinstance(payload, dict) and payload.get('model') == api_model, 'IMMUTABLE_MODEL_NOT_DISPATCHED')
            if request.full_url == legacy.COUNT_URL:
                old.require(self.counts == self.requests and self.counts < legacy.MAX_REQUESTS, 'UNEXPECTED_COUNT_REQUEST')
                self.counts += 1
                return legacy.Reply(b'{"object":"response.input_tokens","input_tokens":100}')
            old.require(request.full_url == legacy.MODEL_URL and self.requests < legacy.MAX_REQUESTS
                        and self.counts == self.requests + 1 and payload.get('tool_choice') == 'required'
                        and payload.get('service_tier') == tier,
                        'UNEXPECTED_FIXTURE_REQUEST')
            name, argument = self.next_tool(payload)
            kind = 'custom' if name == 'exec' else 'function'
            namespace = next((ns for ns, tool in self.runner.request_tools(payload)
                              if tool.get('name') == name and tool.get('type') == kind), False)
            old.require(namespace is not False, 'REAL_CODE_MODE_MISSING')
            call_id = 'standard_' + self.nonce + '_' + str(self.requests)
            if name == 'exec':
                item = {'id': 'ctc_' + call_id, 'type': 'custom_tool_call', 'status': 'completed',
                        'call_id': call_id, 'name': name, 'input': argument}
                result_kind = 'custom_tool_call_output'
            else:
                item = {'id': 'fc_' + call_id, 'type': 'function_call', 'status': 'completed',
                        'call_id': call_id, 'name': name, 'arguments': json.dumps(argument)}
                result_kind = 'function_call_output'
            if namespace: item['namespace'] = namespace
            response = {'id': 'resp_' + call_id, 'object': 'response', 'created_at': 1789170000,
                'status': 'completed', 'model': api_model, 'service_tier': tier, 'output': [item],
                'usage': {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200}}
            events = [{'type': 'response.created', 'response': {**response, 'status': 'in_progress', 'output': []}},
                      {'type': 'response.output_item.done', 'output_index': 0, 'item': item},
                      {'type': 'response.completed', 'response': response}]
            self.requests += 1
            self.last_call = (call_id, result_kind)
            return legacy.Reply(''.join('data: ' + json.dumps(e) + '\n\n' for e in events).encode())

    bound = {}
    def call(folder, prompt, instructions, key, cancelled, progress, binary=None):
        old.require(not bound and Path(folder).parent == root / 'state/jobs'
                    and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', Path(folder).name)
                    and prompt == legacy.PROMPT and instructions == legacy.INSTRUCTIONS and key == legacy.KEY
                    and binary == root / 'tools/codex/codex'
                    and spend.legacy.LEDGER_ROOT == Path(folder) / 'fixture-ledgers'
                    and selected.job_terms(folder) is None, 'EXACT_SYNTHETIC_JOB_REQUIRED')
        selected.bind(folder, selection)
        bound.update(folder=Path(folder), terms=old.regular(selected.root_for(folder) / selected.TERMS))
        return original_run(folder, prompt, instructions, key, cancelled, progress, binary=binary)

    def verify(folder, fixture, actual_runner, actual_spend, completion):
        old.require(Path(folder) == bound.get('folder') and type(fixture) is Fixture
                    and actual_runner is runner and actual_spend is spend, 'EXACT_COMPLETED_FIXTURE_REQUIRED')
        verify_original(folder, fixture, runner, spend, completion)
        old.require(old.regular(selected.root_for(folder) / selected.TERMS) == bound['terms'], 'IMMUTABLE_TERMS_CHANGED')
        request = legacy.record(folder / 'agent-request.json')
        old.require(request.get('construction_mode') is None, 'SUPERVISED_CLI_REQUIRED')
        seal = selected.seal_terminal(folder, folder.name)
        old.require(seal['model'] == api_model and seal['capMicroUsd'] == cap
                    and seal['policyRevision'] == selected.POLICY + ':' + mode
                    and seal['maximumLiabilityMicroUsd'] == fixture.requests * selected.cost(selection, 100, 100),
                    'TERMINAL_MODEL_RECEIPT_INCONSISTENT')
        proof.update(selection=selection, model=api_model, service_tier=tier, cap_micro_usd=cap,
            requests=fixture.requests, counts=fixture.counts, phases=fixture.phase, waits=fixture.waits,
            fixture_liability_micro_usd=seal['maximumLiabilityMicroUsd'], seal=seal,
            execution_id=request['execution_id'], terms_sha256=old.digest(bound['terms']),
            model_sha256=old.digest(old.regular(folder / 'model.glb', 100 * 1024**2)),
            render_sha256={view: old.digest(old.regular(fixture.current() / 'review' / (view + '.png'), legacy.MAX_IMAGE))
                           for view in legacy.VIEWS},
            actual_cli_mcp_blender=True, actual_images_verified=fixture.review_images_verified,
            provider_fixture=True, live_provider_verified=False, visual_quality_verified=False,
            installed_receipt_written=False, native_fallback=False)

    output = io.StringIO()
    with patch.object(legacy, 'Fixture', Fixture), patch.object(runner, 'run', call), \
         patch.object(legacy, 'verify_result', verify), redirect_stdout(output):
        code = legacy.main(['--source', str(root)])
    lines = output.getvalue().splitlines()
    old.require(code == 0 and legacy.SUCCESS in lines and proof,
                'MODEL_PIPELINE_NOT_VERIFIED ' + (lines[-1][:150] if lines else 'NO_RESULT'))
    old.require(not os.path.lexists(root / 'state'), 'MODEL_CLEANUP_UNCONFIRMED')
    old.require(hashes == {n: old.digest(old.regular(root / n)) for n in names}, 'STAGED_SOURCE_CHANGED')
    proof.update(source_sha256=hashes, cleanup_verified=True, original_gate_sha256=old.LEGACY_SHA256)
    fd = os.open(evidence_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(proof, stream, sort_keys=True); stream.flush(); os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--model', required=True, choices=MODELS)
    parser.add_argument('--mode', required=True, choices=MODES)
    args = parser.parse_args()
    try:
        run(args.source, args.workspace, args.model, args.mode)
        print(SUCCESS)
    except (Exception, KeyboardInterrupt) as error:
        reason = str(error) if isinstance(error, (old.Refused, ValueError)) else type(error).__name__
        print('WORLDIFACT_MODEL_EXECUTION_OFFLINE_FAILED ' + reason[:200])
        raise SystemExit(1)


if __name__ == '__main__': main()
