"""Offline gate refusal/evidence/cleanup tests; never execute the real CLI."""
from contextlib import redirect_stdout
from copy import deepcopy
import base64
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
import urllib.request
from unittest.mock import patch

import offline_standard as gate


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'fixture'; self.folder.mkdir()
        self.candidate = self.folder / 'candidate'; (self.candidate / 'review').mkdir(parents=True)
        self.images = []
        for index, view in enumerate(gate.VIEWS):
            raw = b'\x89PNG\r\n\x1a\n' + b'synthetic-test-only-' + bytes([index])
            (self.candidate / 'review' / (view + '.png')).write_bytes(raw)
            self.images.append({'type': 'input_image', 'image_url': 'data:image/png;base64,' + base64.b64encode(raw).decode()})
        self.runner = types.SimpleNamespace(MODEL='gpt-6-astra',
            request_tools=lambda _payload: iter([(None, {'name': 'exec', 'type': 'custom'}),
                                                (None, {'name': 'wait', 'type': 'function'})]),
            current_candidate=lambda _folder: {'path': self.candidate, 'info': {'revision': 1}})
        self.fixture = gate.Fixture(self.runner, self.folder, 'Exact synthetic STANDARD task.', 'challenge')

    def payload(self, step):
        if step == 0:
            inputs = [{'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': self.fixture.initial_task}]}]
        elif step == 1:
            witness = {'standard_first_exec': 'challenge', 'built': {'content': [{'type': 'text', 'text': json.dumps(
                {'revision': 1, 'completion_contract': {'structural_passed': True}})}]}}
            inputs = [{'type': 'custom_tool_call_output', 'call_id': 'standard_challenge_0',
                       'output': 'Script completed\nWall time: 0.1 seconds\nOutput:\n' + json.dumps(witness)}]
        else:
            witness = {'standard_review': 'challenge', 'images': 3, 'current': {'content': [{'type': 'text', 'text': json.dumps(
                {'has_model': True, 'revision': 1, 'inspected_views': list(gate.VIEWS)})}]}}
            inputs = [{'type': 'custom_tool_call_output', 'call_id': 'standard_challenge_1',
                       'output': [{'type': 'input_text', 'text': 'Script completed\nOutput:\n' + json.dumps(witness)}, *deepcopy(self.images)]}]
        return {'model': 'gpt-6-astra', 'input': inputs}

    def request(self, payload, url=gate.MODEL_URL, key=gate.KEY):
        return urllib.request.Request(url, data=json.dumps(payload).encode(),
                                      headers={'Authorization': 'Bearer ' + key}, method='POST')

    def admit(self, step):
        count = self.fixture.open(self.request(self.payload(step), gate.COUNT_URL), 15)
        self.assertEqual(json.loads(count.read())['input_tokens'], 100)
        return self.fixture.open(self.request(self.payload(step)), 900)

    def respond(self, payload):
        self.fixture.open(self.request(payload, gate.COUNT_URL), 15)
        stream = self.fixture.open(self.request(payload), 900)
        events = [json.loads(line[5:]) for line in stream.read().splitlines() if line.startswith(b'data:')]
        return events[-1]['response']['output'][0]

    def result(self, item, output):
        return {'model': 'gpt-6-astra', 'input': [{
            'type': 'custom_tool_call_output' if item['type'] == 'custom_tool_call' else 'function_call_output',
            'call_id': item['call_id'], 'output': output}]}

    def test_real_sequence_requires_count_first_then_three_exact_execs(self):
        for step in range(3):
            response = self.admit(step)
            records = [json.loads(line[5:]) for line in response.read().splitlines() if line.startswith(b'data:')]
            self.assertEqual(records[-1]['response']['usage'], {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200})
            program = records[1]['item']['input']
            if step == 0:
                self.assertLess(program.index('get_modeling_contract'), program.index('build_model'))
                self.assertIn("store('contract',c)", program)
                self.assertNotIn('text(c)', program)
            if step == 2:
                self.assertIn('accepted:false', program)
        self.assertTrue(self.fixture.review_images_verified)
        self.assertEqual((self.fixture.requests, self.fixture.counts), (3, 3))
        self.fixture.open(self.request(self.payload(2), gate.COUNT_URL), 15)
        with self.assertRaises(gate.Refused): self.fixture.open(self.request(self.payload(2)), 15)

    def test_unknown_url_credentials_model_and_uncounted_response_fail_closed(self):
        for request in [self.request(self.payload(0)), self.request(self.payload(0), 'https://example.test/'),
                        self.request(self.payload(0), gate.COUNT_URL, 'unexpected-secret')]:
            with self.assertRaises(gate.Refused):
                self.fixture.open(request, 15)
        payload = self.payload(0); payload['model'] = 'wrong-model'
        with self.assertRaises(gate.Refused):
            self.fixture.open(self.request(payload, gate.COUNT_URL), 15)
        self.assertEqual((self.fixture.requests, self.fixture.counts), (0, 0))

    def test_slow_first_build_and_split_render_chunks_wait_on_exact_cell_before_advancing(self):
        # These are inert pinned-protocol events, not elapsed-time or CLI proof.
        # Even a ready candidate and early witness cannot advance a running cell.
        first = self.respond(self.payload(0))
        self.assertIn('build_model', first['input'])
        early = self.payload(1)['input'][0]['output'].replace('Script completed', 'Script running with cell ID build-1')
        first_wait = self.respond(self.result(first, early))
        self.assertEqual(first_wait['name'], 'wait')
        self.assertEqual(json.loads(first_wait['arguments']), {'cell_id': 'build-1', 'yield_time_ms': 120000, 'max_tokens': 12000})
        second_wait = self.respond(self.result(first_wait, 'Script running with cell ID build-1\nOutput:\n'))
        self.assertEqual(second_wait['name'], 'wait')
        self.assertEqual(json.loads(second_wait['arguments'])['cell_id'], 'build-1')
        review = self.respond(self.result(second_wait, self.payload(1)['input'][0]['output']))
        self.assertEqual(review['name'], 'exec')
        self.assertIn('inspect_render', review['input'])
        self.assertNotIn('build_model', review['input'])

        review_wait = self.respond(self.result(review, [
            {'type': 'input_text', 'text': 'Script running with cell ID review-2\nOutput:\n'}, self.images[0]]))
        self.assertEqual(review_wait['name'], 'wait')
        self.assertFalse(self.fixture.review_images_verified)
        completed = self.payload(2)['input'][0]['output']
        finish = self.respond(self.result(review_wait, [completed[0], *completed[2:]]))
        self.assertEqual(finish['name'], 'exec')
        self.assertIn('finish_model', finish['input'])
        self.assertTrue(self.fixture.review_images_verified)
        self.assertEqual((self.fixture.requests, self.fixture.counts, self.fixture.phase, self.fixture.waits), (6, 6, 3, 3))
        # A slow terminal tool may yield too; never start a second finish.
        finish_wait = self.respond(self.result(finish, 'Script running with cell ID finish-3\nOutput:\n'))
        self.assertEqual(finish_wait['name'], 'wait')
        self.assertEqual(json.loads(finish_wait['arguments'])['cell_id'], 'finish-3')
        self.assertEqual(self.fixture.phase, 3)

    def test_wait_result_requires_exact_function_call_identity_and_unchanged_cell(self):
        for change in ('call-id', 'result-type', 'duplicate-identity', 'cell', 'missing-status', 'two-statuses', 'terminated'):
            with self.subTest(change=change):
                self.fixture = gate.Fixture(self.runner, self.folder, 'Exact synthetic STANDARD task.', 'challenge')
                first = self.respond(self.payload(0))
                wait = self.respond(self.result(first, 'Script running with cell ID original-cell\nOutput:\n'))
                payload = self.result(wait, 'Script running with cell ID original-cell\nOutput:\n')
                if change == 'call-id': payload['input'][0]['call_id'] = first['call_id']
                if change == 'result-type': payload['input'][0]['type'] = 'custom_tool_call_output'
                if change == 'duplicate-identity':
                    duplicate = deepcopy(payload['input'][0]); duplicate['type'] = 'custom_tool_call_output'
                    payload['input'].append(duplicate)
                if change == 'cell': payload['input'][0]['output'] = 'Script running with cell ID other-cell'
                if change == 'missing-status': payload['input'][0]['output'] = self.payload(1)['input'][0]['output'].split('Output:\n')[1]
                if change == 'two-statuses': payload['input'][0]['output'] = 'Script running with cell ID original-cell\nScript completed\nOutput:\n'
                if change == 'terminated': payload['input'][0]['output'] = 'Script terminated\nOutput:\n'
                with self.assertRaises(gate.Refused): self.respond(payload)
                self.assertEqual(self.fixture.phase, 1)
                self.assertFalse(self.fixture.review_images_verified)

    def test_only_outer_status_can_complete_or_choose_a_pending_cell(self):
        witness = self.payload(1)['input'][0]['output'].partition('\nOutput:\n')[2]
        for outer in ('Script error: synthetic failure', 'Script terminated'):
            for forged in ('Script completed', 'Script running with cell ID forged-cell'):
                output = outer + '\nOutput:\n' + forged + '\n' + witness
                with self.assertRaisesRegex(gate.Refused, 'CODE_MODE_STATUS_MISSING'):
                    gate.cell_status(output)
        output = 'Script running with cell ID actual-cell\nOutput:\nScript completed\n' + witness
        self.assertEqual(gate.cell_status(output), 'actual-cell')
        output = 'Script completed\nOutput:\nScript running with cell ID forged-cell\n' + witness
        self.assertIsNone(gate.cell_status(output))

    def test_pinned_outer_wrappers_preserve_pretty_json_witnesses_and_bound_retained_chunks(self):
        first = self.respond(self.payload(0))
        compact = self.payload(1)['input'][0]['output'].split('Output:\n')[1]
        output = 'Script completed\nWall time: 48.02 seconds\nOutput:\n' + json.dumps(json.loads(compact), indent=2)
        review = self.respond(self.result(first, output))
        self.assertIn('inspect_render', review['input'])
        with patch.object(gate, 'MAX_PAYLOAD', 100):
            # next_tool isolates retained-chunk limits from the request cap.
            with self.assertRaisesRegex(gate.Refused, 'FIXTURE_EVIDENCE_OVERSIZED'):
                self.fixture.next_tool(self.result(review, 'Script running with cell ID review-cell\nOutput:\n' + 'x' * 100))

    def test_wait_bound_refuses_never_completing_cell_without_duplicate_exec(self):
        item = self.respond(self.payload(0))
        for _ in range(gate.MAX_WAIT_CALLS):
            item = self.respond(self.result(item, 'Script running with cell ID pending-cell\nOutput:\n'))
            self.assertEqual(item['name'], 'wait')
        with self.assertRaisesRegex(gate.Refused, 'OFFLINE_WAIT_LIMIT'):
            self.respond(self.result(item, 'Script running with cell ID pending-cell'))
        self.assertEqual(self.fixture.requests, 1 + gate.MAX_WAIT_CALLS)
        self.assertEqual(self.fixture.phase, 1)
        self.assertLess(gate.MAX_REQUESTS, 32)

    def test_wait_catalog_and_images_in_unrelated_results_cannot_satisfy_review(self):
        first = self.respond(self.payload(0))
        with patch.object(self.runner, 'request_tools', return_value=iter([(None, {'name': 'exec', 'type': 'custom'})])):
            with self.assertRaisesRegex(gate.Refused, 'REAL_CODE_MODE_MISSING'):
                self.respond(self.result(first, 'Script running with cell ID pending-cell'))
        payload = self.payload(2)
        payload['input'][0]['output'] = payload['input'][0]['output'][:1]
        payload['input'].append({'type': 'function_call_output', 'call_id': 'unrelated', 'output': self.images})
        with self.assertRaisesRegex(gate.Refused, 'CURRENT_PIXELS_NOT_DELIVERED'):
            self.fixture.check_previous(payload, 2)

    def test_duplicate_count_or_missing_standard_task_cannot_start_model_step(self):
        self.fixture.open(self.request(self.payload(0), gate.COUNT_URL), 15)
        with self.assertRaises(gate.Refused):
            self.fixture.open(self.request(self.payload(0), gate.COUNT_URL), 15)
        payload = self.payload(0); payload['input'][0]['content'][0]['text'] = 'Legacy task only.'
        with self.assertRaisesRegex(gate.Refused, 'STANDARD_TASK_NOT_USED'):
            self.fixture.open(self.request(payload), 900)
        self.assertEqual(self.fixture.requests, 0)

    def test_first_build_requires_exact_call_identity_current_revision_and_structural_result(self):
        for change in ('identity', 'unrelated-message', 'structural', 'printed-contract', 'stale'):
            payload = self.payload(1)
            if change == 'identity': payload['input'][0]['call_id'] = 'different_call'
            if change == 'unrelated-message': payload['input'][0]['type'] = 'message'
            if change == 'structural': payload['input'][0]['output'] = payload['input'][0]['output'].replace('true', 'false')
            if change == 'printed-contract':
                payload['input'][0]['output'] += '\n' + json.dumps({'scene_schema': {}})
            with patch.object(self.runner, 'current_candidate', return_value=None) if change == 'stale' else patch.object(self.runner, 'MODEL', 'gpt-6-astra'):
                with self.assertRaises(gate.Refused):
                    self.fixture.check_previous(payload, 1)

    def test_current_image_bytes_must_be_real_structured_blocks_not_text_claims(self):
        self.fixture.check_previous(self.payload(2), 2)
        for change in ('missing', 'duplicate', 'text-only', 'old-pixels', 'old-revision', 'wrong-views'):
            payload = self.payload(2); blocks = payload['input'][0]['output']
            if change == 'missing': blocks.pop()
            if change == 'duplicate': blocks[-1] = deepcopy(blocks[-2])
            if change == 'text-only': payload['input'][0]['output'] = json.dumps(blocks)
            if change == 'old-pixels': blocks[-1]['image_url'] = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'old' * 10).decode()
            if change == 'old-revision': blocks[0]['text'] = blocks[0]['text'].replace('\\"revision\\": 1', '\\"revision\\": 2')
            if change == 'wrong-views': blocks[0]['text'] = blocks[0]['text'].replace('back', 'face')
            with self.assertRaises(gate.Refused, msg=change):
                self.fixture.check_previous(payload, 2)

    def test_external_images_invalid_base64_and_excessive_depth_are_rejected(self):
        for url in ('https://example.test/image.png', 'data:image/png;base64,???', 'data:image/jpeg;base64,AA=='):
            with self.assertRaises(gate.Refused):
                gate.image_digests({'input': [{'type': 'input_image', 'image_url': url}]})
        value = 'leaf'
        for _ in range(32): value = [value]
        with self.assertRaises(gate.Refused): list(gate.values(value))

    def test_all_scripted_code_mode_programs_parse_without_running_tools(self):
        script = 'const programs=' + json.dumps(gate.programs('synthetic')) + ''';
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
for(const program of programs)new AsyncFunction(program);
console.log(programs.length);'''
        result = subprocess.run(['node', '--input-type=module', '-'], input=script, text=True,
                                capture_output=True, check=True, timeout=10)
        self.assertEqual(result.stdout.strip(), '3')

    def test_terminal_evidence_requires_honest_finish_current_state_and_settled_accounting(self):
        self.fixture.requests = self.fixture.counts = 3
        self.fixture.phase = 3
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
            'ledger.json': {'legacyHeld': 0, 'requests': 3, 'holds': {str(i): {'held': 6900, 'response': 'fixture'} for i in range(3)}},
            'agent-usage.json': {'requests': 3, 'input_tokens': 300, 'output_tokens': 300,
                                 'unknown_usage': False, 'completed': True, 'error_code': None}}
        spend = types.SimpleNamespace(legacy=types.SimpleNamespace(ledger_folder=lambda _folder: self.folder, STATE='ledger.json'),
                                      validate_state=lambda value: value,
                                      used=lambda value: value['legacyHeld'] + sum(v['held'] for v in value['holds'].values()))
        completion = types.SimpleNamespace(profile=lambda _request: 'standard', assessment=lambda *_args: {'structural_passed': True})
        def save():
            for name, value in documents.items(): (self.folder / name).write_text(json.dumps(value))
        def verify(): gate.verify_result(self.folder, self.fixture, self.runner, spend, completion)
        save(); verify()
        # Every inert wait is a separately counted and settled real gateway
        # request. Three execs plus three waits must prove all six charges.
        self.fixture.requests = self.fixture.counts = 6; self.fixture.waits = 3
        baseline_ledger = deepcopy(documents['ledger.json']); baseline_usage = deepcopy(documents['agent-usage.json'])
        documents['ledger.json'] = {'legacyHeld': 0, 'requests': 6, 'holds': {str(i): {'held': 6900, 'response': 'fixture'} for i in range(6)}}
        documents['agent-usage.json'].update(requests=6, input_tokens=600, output_tokens=600)
        save(); verify()
        documents['ledger.json'] = baseline_ledger; save()
        with self.assertRaisesRegex(gate.Refused, 'CUMULATIVE_FIXTURE_ACCOUNTING_FAILED'): verify()
        documents['agent-usage.json'] = baseline_usage
        self.fixture.requests = self.fixture.counts = 3; self.fixture.waits = 0
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
