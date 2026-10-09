"""Fail-closed admission/network/cleanup tests; not isolated Blender gate proof."""
import base64
from contextlib import nullcontext
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import urllib.request

import construction_payload
import offline_construction as gate


class OfflineGateSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.stage, self.workspace = self.root / 'stage', self.root / 'workspace'
        self.stage.mkdir(); self.workspace.mkdir()

    def test_missing_podman_refuses_without_native_fallback_or_stage_mutation(self):
        with patch.object(gate.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(gate.Refused, 'PODMAN_REQUIRED_NO_NATIVE_FALLBACK'):
                gate.preflight(self.stage, self.workspace)
        self.assertEqual(list(self.stage.iterdir()), [])
        self.assertEqual(list(self.workspace.iterdir()), [])

    def test_existing_state_and_linked_paths_are_never_used_or_deleted(self):
        state = self.stage / 'state'; state.mkdir()
        retained = state / 'retained'; retained.write_bytes(b'keep')
        with self.assertRaisesRegex(gate.Refused, 'STATELESS'):
            gate.preflight(self.stage, self.workspace)
        self.assertEqual(retained.read_bytes(), b'keep')
        linked = self.root / 'linked-workspace'; linked.symlink_to(self.workspace, target_is_directory=True)
        with self.assertRaisesRegex(gate.Refused, 'UNSAFE_STAGE_OR_WORKSPACE'):
            gate.preflight(self.stage, linked)

    def test_existing_evidence_cannot_be_overwritten_or_count_as_a_new_pass(self):
        evidence = self.workspace / gate.EVIDENCE
        evidence.write_bytes(b'previous proof')
        with self.assertRaisesRegex(gate.Refused, 'FRESH_EVIDENCE'):
            gate.preflight(self.stage, self.workspace)
        self.assertEqual(evidence.read_bytes(), b'previous proof')

    def test_external_network_and_unrequested_api_paths_are_refused_before_open(self):
        provider = gate.Provider(None, None, None, self.stage, True)
        def unexpected(*_args, **_kwargs):
            raise AssertionError('Should not open any connection')
        for url in ('https://example.com/', 'https://api.openai.com/v1/models',
                    'http://127.0.0.1:9999/v1/responses',
                    'https://api.openai.com/v1/responses?secret=unexpected'):
            with self.subTest(url=url):
                with self.assertRaisesRegex(gate.Refused, 'EXTERNAL_NETWORK_REFUSED'):
                    provider.open(unexpected, None, urllib.request.Request(url, data=b'{}'))
        for event, args in (('socket.connect', (None, ('8.8.8.8', 443))),
                            ('socket.getaddrinfo', ('api.openai.com', 443))):
            with self.assertRaisesRegex(gate.Refused, 'EXTERNAL_NETWORK_REFUSED'):
                gate.no_remote(event, args)
        gate.no_remote('socket.connect', (None, ('127.0.0.1', 1234)))

    def test_a_third_count_cannot_create_an_unplanned_paid_phase(self):
        request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
            data=b'{"model":"gpt-6-astra"}', headers={'Authorization': 'Bearer ' + gate.KEY})
        for accepted, initial_edit in ((False, None), (True, gate.EDIT_CODE)):
            with self.subTest(initial_edit=initial_edit):
                provider = gate.Provider(None, None, None, self.stage, accepted, initial_edit)
                provider.calls = [{}, {}]; provider.counts = [{}, {}]
                with self.assertRaisesRegex(gate.Refused, 'UNEXPECTED_COUNT_REQUEST'):
                    provider.open(lambda *_: None, None, request)

    def provider_fixture(self, initial_edit):
        # These files and module objects test the gate's refusal logic only.
        # They are deliberately inert, never isolated Blender gate evidence.
        provider = gate.Provider(None, None, None, self.stage, True, initial_edit)
        provider.spend = types.SimpleNamespace(
            legacy=types.SimpleNamespace(count_payload=lambda wire: wire), used=lambda _: 0,
            ledger=lambda _: nullcontext((None, {'requests': len(provider.calls) + 1, 'holds': {'pending': {}}})))
        schema = {'synthetic_full_schema': True}
        patcher = patch.dict(sys.modules, {'scene_repair': types.SimpleNamespace(photo_schema=lambda _: schema)})
        patcher.start()
        self.addCleanup(patcher.stop)
        return provider, schema

    def reply_fixture(self, provider, schema, phase, *, current=None, state=None):
        document = {'phase': phase, 'request': {'prompt': gate.PROMPT, 'instructions': gate.INSTRUCTIONS},
            'modeling_contract': {'scene_schema': schema}, 'current_model': state}
        content = [{'type': 'input_text', 'text': gate.canonical(document)}]
        if current is not None:
            for view in gate.VIEWS:
                raw = (current['path'] / 'review' / (view + '.png')).read_bytes()
                content.extend([{'type': 'input_text', 'text': gate.canonical({'view': view,
                    'model_sha256': current['identity'][1], 'revision': current['info']['revision']})},
                    {'type': 'input_image', 'image_url': 'data:image/png;base64,' + base64.b64encode(raw).decode()}])
        wire = {'model': 'gpt-6-astra', 'tools': [], 'store': False, 'stream': True, 'service_tier': 'default',
            'reasoning': {'effort': 'low'}, 'truncation': 'disabled',
            'max_output_tokens': construction_payload.OUTPUT_TOKENS[phase], 'input': [{'content': content}],
            'text': {'format': {'type': 'json_schema', 'strict': True,
                               'schema': construction_payload.output_schema(phase)}}}
        raw = gate.canonical(wire).encode()
        provider.counts.append(wire)
        provider.local_bytes.append(raw)
        request = urllib.request.Request('https://api.openai.com/v1/responses', data=raw,
            headers={'Authorization': 'Bearer ' + gate.KEY})
        reply = provider.open(lambda *_: None, None, request).read()
        response = json.loads(reply.removeprefix(b'data: '))['response']
        return json.loads(response['output'][0]['content'][0]['text'])

    def candidate_fixture(self, provider, *, revision=2, width=1.25, edits=gate.EDIT_CODE, changed=True):
        base = self.stage / 'candidates/1'
        base.mkdir(parents=True)
        (base / 'model.glb').write_bytes(b'Original inert model bytes')
        path = self.stage / 'candidates' / str(revision)
        (path / 'review').mkdir(parents=True)
        (path / 'scene.json').write_text(gate.canonical(gate.scene()))
        for view in gate.VIEWS:
            (path / 'review' / (view + '.png')).write_bytes(b'\x89PNG\r\n\x1a\n' + b'inert-pixels' * 100)
        current = {'path': path, 'info': {'revision': revision},
            'identity': ('synthetic-execution', gate.digest(b'Edited inert model bytes' if changed else (base / 'model.glb').read_bytes())),
            'result': {'mesh_objects': [{'name': 'body', 'dimensions': [width, 1, 2]}]}}
        provider.mcp = types.SimpleNamespace(current_candidate=lambda _: current)
        state = {'scene': gate.scene(), 'edits': edits, 'report': current['result'],
                 'completion_contract': {'structural_passed': True}}
        return current, state

    def test_initial_edit_is_in_the_first_plan_and_inspection_requires_its_real_revision_and_geometry(self):
        provider, schema = self.provider_fixture(gate.EDIT_CODE)
        first = self.reply_fixture(provider, schema, 'construction')
        self.assertEqual(first, {'scene_json': gate.canonical(gate.scene()), 'initial_edit': gate.EDIT_CODE})
        current, state = self.candidate_fixture(provider)
        verdict = self.reply_fixture(provider, schema, 'inspection', current=current, state=state)
        self.assertTrue(verdict['accepted'])
        self.assertIsNone(verdict['correction'])
        self.assertEqual(provider.inspected_revisions, [2])
        self.assertEqual([value['phase'] for value in provider.calls], ['construction', 'inspection'])
        self.assertNotEqual(provider.before_initial_model, current['identity'][1])

    def test_initial_edit_gate_cannot_accept_the_base_revision_missing_edit_or_unchanged_geometry(self):
        cases = [({'revision': 1}, 'REAL_CURRENT_GLB_MISSING'),
                 ({'edits': ''}, 'FULL_CURRENT_STATE_MISSING'),
                 ({'changed': False}, 'ACTUAL_INITIAL_EDIT_MODEL_REQUIRED'),
                 ({'width': 1}, 'ORIGINAL_SANDBOX_EDIT_NOT_APPLIED')]
        for index, (change, reason) in enumerate(cases):
            with self.subTest(change=change):
                original_stage = self.stage
                self.stage = original_stage / str(index)
                self.stage.mkdir()
                try:
                    provider, schema = self.provider_fixture(gate.EDIT_CODE)
                    self.reply_fixture(provider, schema, 'construction')
                    current, state = self.candidate_fixture(provider, **change)
                    with self.assertRaisesRegex(gate.Refused, reason):
                        self.reply_fixture(provider, schema, 'inspection', current=current, state=state)
                    self.assertEqual(provider.inspected_revisions, [])
                finally:
                    self.stage = original_stage

    def test_unconfirmed_cleanup_preserves_fixture_state_and_cannot_issue_proof(self):
        folders, inode = gate.create_jobs(self.stage)
        with patch.object(gate.subprocess, 'run', return_value=types.SimpleNamespace(returncode=125)):
            with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                gate.cleanup(self.stage, folders, [], inode)
        self.assertTrue((self.stage / 'state/jobs.sqlite').is_file())
        self.assertFalse((self.workspace / gate.EVIDENCE).exists())

    def test_cleanup_only_deletes_the_exact_owned_fresh_state(self):
        folders, inode = gate.create_jobs(self.stage)
        with patch.object(gate.subprocess, 'run', return_value=types.SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                gate.cleanup(self.stage, folders, [], inode + 1)
            self.assertTrue((self.stage / 'state').exists())
            gate.cleanup(self.stage, folders, [], inode)
        self.assertFalse((self.stage / 'state').exists())

    def test_cli_cannot_emit_success_when_required_container_runtime_is_missing(self):
        # Run resource-limit/signal setup in its own process, never the test host.
        executable = Path(gate.__file__).resolve()
        with tempfile.TemporaryDirectory() as empty_path:
            result = subprocess.run([sys.executable, str(executable), '--source', str(self.stage),
                '--workspace', str(self.workspace)], capture_output=True, text=True, timeout=10,
                env={'PATH': empty_path, 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 1)
        self.assertIn('PODMAN_REQUIRED_NO_NATIVE_FALLBACK', result.stdout)
        self.assertNotIn(gate.SUCCESS, result.stdout)
        self.assertFalse((self.workspace / gate.EVIDENCE).exists())


if __name__ == '__main__':
    unittest.main()
