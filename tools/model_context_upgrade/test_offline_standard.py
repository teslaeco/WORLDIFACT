"""Selective gate protocol/refusal checks with inert tools; no provider or CLI run."""
from contextlib import redirect_stdout
from copy import deepcopy
import base64
import ast
import hashlib
import importlib.util
import threading
import time
import io
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile
import types
import unittest
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
# This suite uses only the pinned Froge source fixture and the new local verifier.
# WORLDIFACT's separate MODEL_CONTEXT_ANCESTOR_REPOSITORY checkout is needed by
# presentation/installer comparisons, not by these independent protocol tests.
SOURCE = Path(os.environ.get('MODEL_CONTEXT_ANCESTOR', os.environ.get(
    'MODEL_COMPLETION_SOURCE', ROOT / '.model-completion-source/oracle_connector')))
sys.path.insert(0, str(SOURCE))
from scene_repair import photo_schema
from runtime.scene_contract import parse_scene

# Keep historical verifier imports isolated when both suites share a process.
_spec = importlib.util.spec_from_file_location('selective_offline_standard', Path(__file__).with_name('offline_standard.py'))
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'fixture'; self.folder.mkdir()
        self.candidate = self.folder / 'candidate'; (self.candidate / 'review').mkdir(parents=True)
        self.built = False
        self.images = []
        for index, view in enumerate(gate.VIEWS):
            raw = b'\x89PNG\r\n\x1a\n' + b'synthetic-test-only-' + bytes([index])
            (self.candidate / 'review' / (view + '.png')).write_bytes(raw)
            self.images.append({'type': 'input_image', 'image_url': 'data:image/png;base64,' + base64.b64encode(raw).decode()})
        self.report = {'synthetic': 'Complete report retained.', 'mesh_count': 2}
        (self.candidate / 'result.json').write_text(json.dumps(self.report))
        self.assessment = {'structural_passed': True, 'measured': {'meshCount': 2}, 'visual_fidelity_verified': False}
        self.completion = types.SimpleNamespace(assessment=lambda *_: deepcopy(self.assessment))
        self.runner = types.SimpleNamespace(MODEL='gpt-6-astra',
            request_tools=lambda _payload: iter([(None, {'name': 'exec', 'type': 'custom'}),
                                                (None, {'name': 'wait', 'type': 'function'})]),
            current_candidate=lambda _folder: {'path': self.candidate, 'info': {'revision': 1}} if self.built else None)
        self.schema = photo_schema(0)
        self.reset_fixture()

    def reset_fixture(self):
        self.fixture = gate.Fixture(self.runner, self.folder, 'Exact synthetic STANDARD task.', 'challenge', self.schema, self.completion)

    def snapshot(self, reviewed=False):
        sections = {}
        for name, value in (('scene', gate.scene()), ('edits', ''), ('report', self.report), ('visual_review', None)):
            raw = value if name == 'edits' else json.dumps(value)
            sections[name] = {'format': 'python' if name == 'edits' else 'json', 'characters': len(raw),
                              'bytes': len(raw.encode()), 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'inline': True}
        return {'revision': 1, 'has_model': True, 'finished': False, 'builds_remaining': 4,
                'scene': gate.scene(), 'edits': '', 'report': deepcopy(self.report), 'visual_review': None,
                'completion_contract': deepcopy(self.assessment), 'inspected_views': list(gate.VIEWS) if reviewed else [],
                'sections': sections}

    def compact(self, reviewed=False):
        current = self.snapshot(reviewed)
        current.update(scene=None, edits=None, stored_snapshot='current_model')
        for name in ('scene', 'edits'): current['sections'][name].update(inline=False, stored=True)
        return current

    def witness(self, step):
        if step == 1:
            return {'standard_schema_discovery': 'challenge', 'primitive_schemas': gate.selected_schemas(self.schema)}
        if step == 2:
            return {'standard_build': 'challenge', 'current': self.compact()}
        return {'standard_review': 'challenge', 'images': 3, 'current': self.compact(True)}

    def payload(self, step):
        if step == 0:
            inputs = [{'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': self.fixture.initial_task}]}]
        else:
            output = 'Script completed\nWall time: 0.1 seconds\nOutput:\n' + json.dumps(self.witness(step))
            if step == 3: output = [{'type': 'input_text', 'text': output}, *deepcopy(self.images)]
            inputs = [{'type': 'custom_tool_call_output', 'call_id': 'standard_challenge_' + str(step - 1), 'output': output}]
        return {'model': 'gpt-6-astra', 'input': inputs}

    def request(self, payload, url=gate.MODEL_URL, key=gate.KEY):
        return urllib.request.Request(url, data=json.dumps(payload).encode(),
                                      headers={'Authorization': 'Bearer ' + key}, method='POST')

    def respond(self, payload):
        count = self.fixture.open(self.request(payload, gate.COUNT_URL), 15)
        self.assertEqual(json.loads(count.read())['input_tokens'], 100)
        stream = self.fixture.open(self.request(payload), 900)
        events = [json.loads(line[5:]) for line in stream.read().splitlines() if line.startswith(b'data:')]
        self.assertEqual(events[-1]['response']['usage'], {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200})
        return events[-1]['response']['output'][0]

    def result(self, item, output):
        return {'model': 'gpt-6-astra', 'input': [{
            'type': 'custom_tool_call_output' if item['type'] == 'custom_tool_call' else 'function_call_output',
            'call_id': item['call_id'], 'output': output}]}

    def test_four_distinct_model_turns_require_exact_schemas_before_build_and_images_before_finish(self):
        first = self.respond(self.payload(0))
        self.assertIn('get_modeling_contract', first['input']); self.assertNotIn('build_model', first['input'])
        self.assertIn("store('contract',c)", first['input'])
        second = self.respond(self.payload(1))
        self.assertTrue(self.fixture.schemas_verified)
        self.assertIn('build_model', second['input']); self.assertNotIn('get_modeling_contract', second['input'])
        self.assertNotIn('inspect_render', second['input'])
        self.built = True
        third = self.respond(self.payload(2))
        self.assertIn('inspect_render', third['input']); self.assertNotIn('finish_model', third['input'])
        self.assertFalse(self.fixture.review_images_verified)
        fourth = self.respond(self.payload(3))
        self.assertIn('finish_model', fourth['input']); self.assertIn('accepted:false', fourth['input'])
        self.assertTrue(self.fixture.review_images_verified)
        self.assertEqual((self.fixture.requests, self.fixture.counts, self.fixture.phase), (4, 4, 4))
        with self.assertRaises(gate.Refused): self.respond(self.result(fourth, 'Script completed\nOutput:\n{}'))

    def test_full_selected_canonical_schemas_required_not_names_partial_references_or_extras(self):
        for change in ('partial', 'names', 'ref', 'extra', 'duplicate', 'missing', 'full-contract', 'early-build'):
            with self.subTest(change=change):
                value = deepcopy(self.witness(1)); self.built = False; self.reset_fixture()
                if change == 'partial': value['primitive_schemas'][0]['properties'].pop('rotation')
                if change == 'names': value['primitive_schemas'] = list(gate.PRIMITIVES)
                if change == 'ref': value['primitive_schemas'][0] = {'$ref': '#/box'}
                if change == 'extra': value['primitive_schemas'].append(self.schema['properties']['parts']['items']['anyOf'][0])
                if change == 'duplicate': value['primitive_schemas'][1] = deepcopy(value['primitive_schemas'][0])
                if change == 'missing': value['primitive_schemas'].pop()
                if change == 'full-contract': value['scene_schema'] = self.schema
                if change == 'early-build': self.built = True
                with self.assertRaises(gate.Refused): self.fixture.check_previous({}, 1, value)
                self.assertFalse(self.fixture.schemas_verified)

    def test_selected_schemas_fail_closed_on_absent_or_duplicate_canonical_kind(self):
        for duplicate in (False, True):
            schema = deepcopy(self.schema); variants = schema['properties']['parts']['items']['anyOf']
            selected = next(v for v in variants if v['properties']['kind']['enum'] == ['box'])
            if duplicate: variants.append(deepcopy(selected))
            else: variants.remove(selected)
            with self.assertRaisesRegex(gate.Refused, 'EXACT_PRIMITIVE_SCHEMA_MISSING'): gate.selected_schemas(schema)

    def test_build_requires_schema_boundary_exact_identity_revision_and_unclipped_evidence(self):
        self.built = True; self.fixture.schemas_verified = True
        self.fixture.check_previous(self.payload(2), 2)
        for change in ('identity', 'unrelated', 'no-discovery', 'stale', 'report', 'completion', 'scene', 'edits', 'section', 'stored', 'extra-witness'):
            with self.subTest(change=change):
                value = deepcopy(self.witness(2)); payload = self.payload(2)
                self.fixture.schemas_verified = change != 'no-discovery'
                self.built = change != 'stale'
                if change == 'identity': payload['input'][0]['call_id'] = 'other'
                if change == 'unrelated': payload['input'][0]['type'] = 'message'
                if change == 'report': value['current']['report'] = {'synthetic': 'clipped'}
                if change == 'completion': value['current']['completion_contract'].pop('measured')
                if change == 'scene': value['current']['scene'] = gate.scene()
                if change == 'edits': value['current']['edits'] = 'full private edit history'
                if change == 'section': value['current']['sections']['scene'].pop('sha256')
                if change == 'stored': value['current']['sections']['scene']['inline'] = True
                if change == 'extra-witness': value['unrelated_snapshot'] = self.snapshot()
                payload['input'][0]['output'] = 'Script completed\nOutput:\n' + json.dumps(value)
                with self.assertRaises(gate.Refused): self.fixture.check_previous(payload, 2)

    def test_slow_schema_build_render_and_terminal_calls_wait_on_exact_cell(self):
        first = self.respond(self.payload(0))
        early = self.payload(1)['input'][0]['output'].replace('Script completed', 'Script running with cell ID schema-1')
        schema_wait = self.respond(self.result(first, early))
        self.assertEqual(schema_wait['name'], 'wait'); self.assertFalse(self.fixture.schemas_verified)
        build = self.respond(self.result(schema_wait, 'Script completed\nOutput:\n'))
        self.assertIn('build_model', build['input']); self.assertTrue(self.fixture.schemas_verified)
        self.built = True
        build_wait = self.respond(self.result(build, 'Script running with cell ID build-2\nOutput:\n'))
        self.assertEqual(json.loads(build_wait['arguments']), {'cell_id': 'build-2', 'yield_time_ms': 120000, 'max_tokens': 12000})
        review = self.respond(self.result(build_wait, self.payload(2)['input'][0]['output']))
        review_wait = self.respond(self.result(review, [
            {'type': 'input_text', 'text': 'Script running with cell ID review-3\nOutput:\n'}, self.images[0]]))
        self.assertFalse(self.fixture.review_images_verified)
        completed = self.payload(3)['input'][0]['output']
        finish = self.respond(self.result(review_wait, [completed[0], *completed[2:]]))
        self.assertIn('finish_model', finish['input']); self.assertTrue(self.fixture.review_images_verified)
        self.assertEqual((self.fixture.requests, self.fixture.phase, self.fixture.waits), (7, 4, 3))
        terminal_wait = self.respond(self.result(finish, 'Script running with cell ID finish-4\nOutput:\n'))
        self.assertEqual(terminal_wait['name'], 'wait'); self.assertEqual(self.fixture.phase, 4)

    def test_wait_result_requires_exact_function_call_identity_and_unchanged_cell(self):
        for change in ('call-id', 'result-type', 'duplicate-identity', 'cell', 'missing-status', 'two-statuses', 'terminated'):
            with self.subTest(change=change):
                self.reset_fixture()
                first = self.respond(self.payload(0))
                wait = self.respond(self.result(first, 'Script running with cell ID original-cell\nOutput:\n'))
                payload = self.result(wait, 'Script running with cell ID original-cell\nOutput:\n')
                if change == 'call-id': payload['input'][0]['call_id'] = first['call_id']
                if change == 'result-type': payload['input'][0]['type'] = 'custom_tool_call_output'
                if change == 'duplicate-identity':
                    duplicate = deepcopy(payload['input'][0]); duplicate['type'] = 'custom_tool_call_output'; payload['input'].append(duplicate)
                if change == 'cell': payload['input'][0]['output'] = 'Script running with cell ID other-cell'
                if change == 'missing-status': payload['input'][0]['output'] = json.dumps(self.witness(1))
                if change == 'two-statuses': payload['input'][0]['output'] = 'Script running with cell ID original-cell\nScript completed\nOutput:\n'
                if change == 'terminated': payload['input'][0]['output'] = 'Script terminated\nOutput:\n'
                with self.assertRaises(gate.Refused): self.respond(payload)
                self.assertEqual(self.fixture.phase, 1); self.assertFalse(self.fixture.schemas_verified)

    def test_only_outer_status_can_complete_or_choose_a_pending_cell(self):
        for outer in ('Script error: synthetic failure', 'Script terminated'):
            for forged in ('Script completed', 'Script running with cell ID forged-cell'):
                with self.assertRaisesRegex(gate.Refused, 'CODE_MODE_STATUS_MISSING'):
                    gate.cell_status(outer + '\nOutput:\n' + forged + '\n' + json.dumps(self.witness(1)))
        self.assertEqual(gate.cell_status('Script running with cell ID actual-cell\nOutput:\nScript completed'), 'actual-cell')
        self.assertIsNone(gate.cell_status('Script completed\nOutput:\nScript running with cell ID forged-cell'))

    def test_pretty_json_and_retained_chunks_work_without_duplicate_witnesses(self):
        first = self.respond(self.payload(0))
        output = 'Script completed\nWall time: 48.02 seconds\nOutput:\n' + json.dumps(self.witness(1), indent=2)
        build = self.respond(self.result(first, output)); self.assertIn('build_model', build['input'])
        with patch.object(gate, 'MAX_PAYLOAD', 100):
            with self.assertRaisesRegex(gate.Refused, 'FIXTURE_EVIDENCE_OVERSIZED'):
                self.fixture.next_tool(self.result(build, 'Script running with cell ID build-cell\nOutput:\n' + 'x' * 100))
        duplicate = json.dumps(self.witness(1)) + '\n' + json.dumps(self.witness(1))
        with self.assertRaisesRegex(gate.Refused, 'EXACT_PHASE_WITNESS_MISSING'):
            self.fixture.check_previous({}, 1, 'Script completed\nOutput:\n' + duplicate)

    def test_wait_bound_refuses_never_completing_cell_without_duplicate_exec(self):
        item = self.respond(self.payload(0))
        for _ in range(gate.MAX_WAIT_CALLS):
            item = self.respond(self.result(item, 'Script running with cell ID pending-cell\nOutput:\n'))
            self.assertEqual(item['name'], 'wait')
        with self.assertRaisesRegex(gate.Refused, 'OFFLINE_WAIT_LIMIT'):
            self.respond(self.result(item, 'Script running with cell ID pending-cell'))
        self.assertEqual(self.fixture.requests, 1 + gate.MAX_WAIT_CALLS); self.assertEqual(self.fixture.phase, 1)
        self.assertLess(gate.MAX_REQUESTS, 32)

    def test_real_wait_tool_and_count_admission_required(self):
        for request in [self.request(self.payload(0)), self.request(self.payload(0), 'https://example.test/'),
                        self.request(self.payload(0), gate.COUNT_URL, 'unexpected-secret')]:
            with self.assertRaises(gate.Refused): self.fixture.open(request, 15)
        payload = self.payload(0); payload['model'] = 'wrong-model'
        with self.assertRaises(gate.Refused): self.fixture.open(self.request(payload, gate.COUNT_URL), 15)
        first = self.respond(self.payload(0))
        with patch.object(self.runner, 'request_tools', return_value=iter([(None, {'name': 'exec', 'type': 'custom'})])):
            with self.assertRaisesRegex(gate.Refused, 'REAL_CODE_MODE_MISSING'):
                self.respond(self.result(first, 'Script running with cell ID pending-cell'))

    def test_duplicate_count_or_missing_standard_task_cannot_start_model_step(self):
        self.fixture.open(self.request(self.payload(0), gate.COUNT_URL), 15)
        with self.assertRaises(gate.Refused): self.fixture.open(self.request(self.payload(0), gate.COUNT_URL), 15)
        payload = self.payload(0); payload['input'][0]['content'][0]['text'] = 'Legacy task only.'
        with self.assertRaisesRegex(gate.Refused, 'STANDARD_TASK_NOT_USED'): self.fixture.open(self.request(payload), 900)
        self.assertEqual(self.fixture.requests, 0)

    def test_current_images_require_exact_real_blocks_from_current_call_not_text_or_unrelated_output(self):
        self.built = True
        self.fixture.check_previous(self.payload(3), 3)
        for change in ('missing', 'duplicate', 'text-only', 'old-pixels', 'old-revision', 'wrong-views', 'unrelated'):
            with self.subTest(change=change):
                payload = self.payload(3); blocks = payload['input'][0]['output']
                if change == 'missing': blocks.pop()
                if change == 'duplicate': blocks[-1] = deepcopy(blocks[-2])
                if change == 'text-only': payload['input'][0]['output'] = json.dumps(blocks)
                if change == 'old-pixels': blocks[-1]['image_url'] = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'old' * 10).decode()
                if change == 'old-revision': blocks[0]['text'] = blocks[0]['text'].replace('"revision": 1', '"revision": 2')
                if change == 'wrong-views': blocks[0]['text'] = blocks[0]['text'].replace('back', 'face')
                if change == 'unrelated':
                    payload['input'][0]['output'] = blocks[:1]
                    payload['input'].append({'type': 'function_call_output', 'call_id': 'unrelated', 'output': self.images})
                with self.assertRaises(gate.Refused): self.fixture.check_previous(payload, 3)

    def test_external_images_invalid_base64_and_excessive_depth_are_rejected(self):
        for url in ('https://example.test/image.png', 'data:image/png;base64,???', 'data:image/jpeg;base64,AA=='):
            with self.assertRaises(gate.Refused): gate.image_digests({'input': [{'type': 'input_image', 'image_url': url}]})
        value = 'leaf'
        for _ in range(32): value = [value]
        with self.assertRaises(gate.Refused): list(gate.values(value))

    def test_code_mode_programs_execute_against_inert_tools_and_preserve_full_original_store(self):
        self.assertEqual(parse_scene(json.dumps(gate.scene()), gate.PROMPT), gate.scene())
        contract = {'revision': 0, 'references': [], 'scene_schema': self.schema, 'prompt': gate.PROMPT,
                    'instructions': gate.INSTRUCTIONS, 'coordinate_and_geometry_guide': 'Full original guide sentinel'}
        original = self.snapshot(); original['future_field'] = {'kept': 'without projection loss'}
        current = self.snapshot(True); current['future_field'] = original['future_field']
        script = 'const programs=' + json.dumps(gate.programs('challenge')) + ';\n' + 'const fixture=' + json.dumps({
            'contract': contract, 'build': original, 'current': current, 'scene': gate.scene()}) + ''';
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const saved=new Map(), calls=[], outputs=[], images=[];
const copy=v=>structuredClone(v);
const reply=v=>({content:[{type:'text',text:JSON.stringify(v)}],isError:false});
const store=(key,v)=>saved.set(key,copy(v)),load=key=>copy(saved.get(key));
const tools={
 mcp__blender__get_modeling_contract:async args=>{calls.push(['contract',args]);return reply(fixture.contract)},
 mcp__blender__build_model:async args=>{calls.push(['build',args]);return reply(fixture.build)},
 mcp__blender__inspect_render:async args=>{calls.push(['render',args]);return {content:[{type:'image',mimeType:'image/png',data:args.view}]}},
 mcp__blender__get_current_model:async args=>{calls.push(['current',args]);return reply(fixture.current)},
 mcp__blender__finish_model:async args=>{calls.push(['finish',args]);return reply({finished:true})}
};
for(const program of programs){const texts=[];await new AsyncFunction('tools','store','load','text','image',program)(tools,store,load,v=>texts.push(copy(v)),v=>images.push(copy(v)));outputs.push(texts);}
console.log(JSON.stringify({saved:Object.fromEntries(saved),calls,outputs,images}));
'''
        result = subprocess.run(['node', '--input-type=module', '-'], input=script, text=True, capture_output=True, check=True, timeout=10)
        evidence = json.loads(result.stdout)
        self.assertEqual(evidence['saved']['contract'], contract)
        self.assertEqual(evidence['saved']['build_snapshot'], original)
        self.assertEqual(evidence['saved']['current_snapshot'], current)
        self.assertEqual(evidence['saved']['current_model'], current)
        self.assertEqual(evidence['outputs'][0], [self.witness(1)])
        for index, snapshot in ((1, original), (2, current)):
            projected = evidence['outputs'][index][0]['current']
            self.assertIsNone(projected['scene']); self.assertIsNone(projected['edits'])
            for key in snapshot.keys() - {'scene', 'edits', 'sections'}: self.assertEqual(projected[key], snapshot[key])
            self.assertEqual(projected['sections']['report'], snapshot['sections']['report'])
            self.assertFalse(projected['sections']['scene']['inline']); self.assertTrue(projected['sections']['scene']['stored'])
        self.assertEqual([name for name, _ in evidence['calls']], ['contract', 'build', 'render', 'render', 'render', 'current', 'finish'])
        self.assertEqual(json.loads(evidence['calls'][1][1]['scene_json']), gate.scene())
        self.assertEqual(evidence['calls'][-1][1], {'expected_revision': 1, 'accepted': False, 'issues': gate.ISSUES, 'summary': gate.SUMMARY})
        self.assertEqual([image['data'] for image in evidence['images']], list(gate.VIEWS))
        # An MCP-omitted section remains omitted with the exact page witness;
        # projection must never imply that absent bytes were saved in store.
        omitted = self.snapshot(); omitted['scene'] = omitted['edits'] = None
        for key in ('scene', 'edits'): omitted['sections'][key]['inline'] = False
        code = "const s=" + json.dumps(omitted) + ";const saved={};const store=(k,v)=>saved[k]=v;" + gate.snapshot_program('s') + ";console.log(JSON.stringify({state,saved}));"
        projected = json.loads(subprocess.run(['node', '--input-type=module', '-'], input=code, text=True,
                              capture_output=True, check=True, timeout=10).stdout)
        self.assertEqual(projected['saved']['current_model'], omitted)
        for key in ('scene', 'edits'):
            self.assertFalse(projected['state']['sections'][key]['stored'])
            self.assertEqual(projected['state']['sections'][key]['sha256'], omitted['sections'][key]['sha256'])

    def test_terminal_evidence_requires_honest_finish_current_state_and_settled_accounting(self):
        self.fixture.requests = self.fixture.counts = 4
        self.fixture.phase = 4
        self.fixture.schemas_verified = True
        self.fixture.review_images_verified = True
        outcome = {'finished': True, 'accepted': False, 'revision': 1, 'builds': 1}
        self.runner.completed_outcome = lambda _folder: outcome
        documents = {
            'agent-request.json': {'prompt': gate.PROMPT, 'instructions': gate.INSTRUCTIONS},
            'agent-tools.json': {'calls': [{'tool': name, 'status': 'completed'} for name in
                ['get_modeling_contract', 'build_model', 'inspect_render', 'inspect_render', 'inspect_render', 'get_current_model', 'finish_model']]},
            'visual-review.json': {'issues': gate.ISSUES, 'summary': gate.SUMMARY, 'model_revision': 1,
                                   'inspected_views': list(gate.VIEWS), 'accepted': False},
            'scene.json': gate.scene(),
            'ledger.json': {'revision':'fixture-v1', 'legacyHeld': 0, 'requests': 4, 'holds': {str(i): {'held': 6900, 'response': 'fixture'} for i in range(4)}},
            'agent-usage.json': {'requests': 4, 'input_tokens': 400, 'output_tokens': 400,
                                 'unknown_usage': False, 'completed': True, 'error_code': None}}
        spend = types.SimpleNamespace(CEILING_MICRO_USD=1750000, REVISION='fixture-v1', legacy=types.SimpleNamespace(ledger_folder=lambda _folder: self.folder, STATE='ledger.json'),
                                      validate_state=lambda value: value,
                                      used=lambda value: value['legacyHeld'] + sum(v['held'] for v in value['holds'].values()))
        completion = types.SimpleNamespace(profile=lambda _request: 'standard', assessment=lambda *_args: {'structural_passed': True})
        def save():
            for name, value in documents.items(): (self.folder / name).write_text(json.dumps(value))
        def verify(): gate.verify_result(self.folder, self.fixture, self.runner, spend, completion)
        save(); verify()
        # Every inert wait is a separately counted and settled real gateway
        # request. Four execs plus three waits must prove all seven charges.
        self.fixture.requests = self.fixture.counts = 7; self.fixture.waits = 3
        baseline_ledger = deepcopy(documents['ledger.json']); baseline_usage = deepcopy(documents['agent-usage.json'])
        documents['ledger.json'] = {'revision':'fixture-v1', 'legacyHeld': 0, 'requests': 7, 'holds': {str(i): {'held': 6900, 'response': 'fixture'} for i in range(7)}}
        documents['agent-usage.json'].update(requests=7, input_tokens=700, output_tokens=700)
        save(); verify()
        documents['ledger.json'] = baseline_ledger; save()
        with self.assertRaisesRegex(gate.Refused, 'CUMULATIVE_FIXTURE_ACCOUNTING_FAILED'): verify()
        documents['agent-usage.json'] = baseline_usage
        self.fixture.requests = self.fixture.counts = 4; self.fixture.waits = 0
        save()
        for file, field, replacement in [
            ('agent-request.json', 'instructions', 'changed'),
            ('visual-review.json', 'accepted', True),
            ('visual-review.json', 'inspected_views', ['front']),
            ('ledger.json', 'legacyHeld', 1),
            ('ledger.json', 'holds', {'0': {'held': 20700}}),
            ('agent-usage.json', 'unknown_usage', True),
            ('agent-usage.json', 'completed', False),
            ('agent-usage.json', 'error_code', 'fixture failure')]:
            old = documents[file][field]; documents[file][field] = replacement; save()
            with self.assertRaises(gate.Refused, msg=file + ':' + field): verify()
            documents[file][field] = old
        save()
        outcome['accepted'] = True
        with self.assertRaisesRegex(gate.Refused, 'HONEST_FINISH_MISSING'): verify()
        outcome['accepted'] = False
        with patch.object(completion, 'assessment', return_value={'structural_passed': False}):
            with self.assertRaisesRegex(gate.Refused, 'REAL_GLB_STRUCTURAL_CHECK_FAILED'): verify()
        for field in ('schemas_verified', 'review_images_verified'):
            old = getattr(self.fixture, field); setattr(self.fixture, field, False)
            with self.assertRaisesRegex(gate.Refused, 'OFFLINE_SEQUENCE_INCOMPLETE'): verify()
            setattr(self.fixture, field, old)
        for name in ('.worldifact-studio-pricing.json', '.worldifact-astra-terminal-budget.json'):
            path = self.folder / name; path.write_text('{}')
            with self.assertRaisesRegex(gate.Refused, 'FIXTURE_TERMS_CHANGED'): verify()
            path.unlink(); path.symlink_to(self.folder / 'missing-private-terms')
            with self.assertRaisesRegex(gate.Refused, 'FIXTURE_TERMS_CHANGED'): verify()
            path.unlink()
        with patch.object(spend, 'CEILING_MICRO_USD', 4000000):
            with self.assertRaisesRegex(gate.Refused, 'FIXTURE_TERMS_CHANGED'): verify()


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def create_source(self):
        for name in ('codex_runner.py', 'blender_mcp.py', 'server.py', 'context_policy.py', 'install_codex.py', 'runtime_check.py'):
            (self.root / name).write_text('# synthetic source, not executed\n')

    def test_stage_with_any_existing_state_or_source_symlink_is_refused_before_import(self):
        self.create_source(); self.assertEqual(gate.preflight(self.root), self.root)
        state = self.root / 'state'; state.mkdir()
        (state / 'config.json').write_text('private sentinel')
        with self.assertRaisesRegex(gate.Refused, 'DISPOSABLE_STATELESS_STAGE_REQUIRED'):
            gate.preflight(self.root)
        self.assertEqual((state / 'config.json').read_text(), 'private sentinel')
        (state / 'config.json').unlink(); state.rmdir()
        (self.root / 'server.py').unlink(); (self.root / 'server.py').symlink_to(self.root / 'missing')
        with self.assertRaisesRegex(gate.Refused, 'UNSAFE_FIXTURE_PATH'):
            gate.preflight(self.root)

    def test_synthetic_job_schema_supports_real_progress_callback_and_never_reuses_state(self):
        folder = gate.create_fixture_job(self.root)
        database = self.root / 'state/jobs.sqlite'
        with sqlite3.connect(database) as connection:
            self.assertEqual([row[1] for row in connection.execute('PRAGMA table_info(jobs)')],
                             ['id', 'prompt', 'state', 'detail', 'created', 'updated'])
            row = connection.execute('SELECT * FROM jobs').fetchone()
            self.assertEqual(row[:3], (folder.name, gate.PROMPT, 'generating'))
        source = ast.parse((SOURCE / 'server.py').read_bytes())
        callbacks = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ('database', 'status')]
        self.assertEqual(len(callbacks), 2)
        scope = {'STATE': self.root / 'state', 'LOCK': threading.RLock(), 'sqlite3': sqlite3, 'time': time}
        exec(compile(ast.Module(body=callbacks, type_ignores=[]), 'exact-installed-progress', 'exec'), scope)
        scope['status'](folder.name, 'building', 'Synthetic progress')
        with sqlite3.connect(database) as connection:
            self.assertEqual(connection.execute('SELECT state,detail FROM jobs').fetchone(), ('building', 'Synthetic progress'))
        before = database.read_bytes()
        with self.assertRaises(FileExistsError): gate.create_fixture_job(self.root)
        self.assertEqual(database.read_bytes(), before)

    def test_network_guard_permits_only_loopback_connections(self):
        gate.no_remote('socket.connect', (None, ('127.0.0.1', 1234)))
        gate.no_remote('socket.connect', (None, ('::1', 1234)))
        for event, args in [('socket.connect', (None, ('1.1.1.1', 443))), ('socket.getaddrinfo', ('api.openai.com', 443))]:
            with self.assertRaises(gate.Refused): gate.no_remote(event, args)

    def test_cleanup_targets_only_fixture_group_and_container_then_removes_owned_state(self):
        state = self.root / 'state'; folder = state / 'jobs' / 'synthetic-owned-id'; folder.mkdir(parents=True)
        process = types.SimpleNamespace(pid=123, wait=lambda timeout: 0)
        seen = []
        def drain(pid): seen.append(pid); return True
        results = [types.SimpleNamespace(returncode=0), types.SimpleNamespace(returncode=0), types.SimpleNamespace(returncode=1)]
        with patch.object(gate.subprocess, 'run', side_effect=results) as command:
            gate.cleanup(self.root, folder, [process], drain)
        self.assertEqual(seen, [123]); self.assertFalse(state.exists())
        self.assertEqual([call.args[0] for call in command.call_args_list], [
            ['podman', 'container', 'exists', 'froge-job-synthetic-owned-id'],
            ['podman', 'rm', '--force', 'froge-job-synthetic-owned-id'],
            ['podman', 'container', 'exists', 'froge-job-synthetic-owned-id']])

    def test_uncertain_process_container_or_cleanup_preserves_evidence_and_never_succeeds(self):
        folder = self.root / 'state/jobs/synthetic'; folder.mkdir(parents=True)
        process = types.SimpleNamespace(pid=123, wait=lambda timeout: 0)
        for group_ok, returncode in ((False, 1), (True, 125)):
            with patch.object(gate.subprocess, 'run', return_value=types.SimpleNamespace(returncode=returncode)):
                with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                    gate.cleanup(self.root, folder, [process], lambda _pid: group_ok)
            self.assertTrue(folder.exists())
        with patch.object(gate.subprocess, 'run', side_effect=subprocess.TimeoutExpired('podman', 10)):
            with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                gate.cleanup(self.root, folder, [], lambda _pid: True)
        self.assertTrue(folder.exists())

    def test_marker_only_after_run_and_cleanup_return_successfully(self):
        for error in (None, gate.Refused('CLEANUP_UNCONFIRMED'), RuntimeError('private secret sentinel')):
            out = io.StringIO()
            with patch.object(gate.signal, 'signal'), patch.object(gate.signal, 'setitimer'), \
                 patch.object(gate.resource, 'setrlimit'), patch.object(gate, 'run', side_effect=error), redirect_stdout(out):
                status = gate.main(['--source', str(self.root)])
            if error is None:
                self.assertEqual(status, 0); self.assertEqual(out.getvalue().strip(), gate.SUCCESS)
            else:
                self.assertEqual(status, 1); self.assertNotIn(gate.SUCCESS, out.getvalue())
                self.assertNotIn('private secret sentinel', out.getvalue())


if __name__ == '__main__':
    unittest.main()
