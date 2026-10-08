"""Opt-in real native-Blender + loopback Gateway pipeline; no paid API calls.

Requires explicit pinned public source and installed ancestor directories in
MODEL_NATIVE_SOURCE and MODEL_NATIVE_INSTALLED, and the exact PR214 checkout in
MODEL_CONTEXT_ANCESTOR_REPOSITORY. Only upstream token-count/Responses replies
and the activation health receipt are fixtures. JobTools, scene validation,
Blender geometry/renders/exports, loopback HTTP, admission and original durable
ledger settlement execute for real. This is not production container isolation,
installation proof, LIVE Astra evidence, or a model visual-quality evaluation.
"""
import ast
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PIN = 'd3f61b842dcfeda2ed794210caafc391919a75be'
ANCESTOR_PIN = '2380a7e2dad05a40b3753faf06c2635ed444be51'
EDIT_CODE = 'body = bpy.data.objects.get("body")\nbody.scale.x *= 1.25'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def git_blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def stage_runtime(public, installed, ancestor, stage):
    """Copy verified public dependencies and apply the actual bounded transform."""
    import runtime_patch
    observed = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ancestor,
        capture_output=True, text=True, check=True).stdout.strip()
    assert observed == ANCESTOR_PIN, 'Exact reviewed dependency checkout required'
    tree = json.loads((public.parent / 'pinned-tree.json').read_text())
    assert tree['sha'] == PIN and tree.get('truncated') is False
    entries = {entry['path']: entry for entry in tree['tree'] if entry['type'] == 'blob'}
    provenance = {'public_commit': PIN, 'ancestor_commit': ANCESTOR_PIN,
                  'public_files': {}, 'installed_ancestor': {}, 'staged_transform': {},
                  'native_blender_only': True, 'production_isolation_verified': False,
                  'provider_fixture': True, 'activation_receipt_fixture': True}
    stage.mkdir()
    for source in sorted(public.rglob('*.py')):
        assert not source.is_symlink()
        relative = source.relative_to(public).as_posix()
        raw = source.read_bytes()
        assert git_blob(raw) == entries['oracle_connector/' + relative]['sha'], relative
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        provenance['public_files'][relative] = {'sha256': digest(raw), 'git_blob': git_blob(raw)}
    assert (stage / 'ai_stream.py').is_file(), 'Pinned ai_stream.py is required'
    # This verified public lineage supplies the unchanged installed renderer,
    # FAST dependency and original ledger modules used by the production worker.
    sys.path.insert(0, str(ancestor / 'tools/model_completion'))
    import source_fixture
    baseline = source_fixture.installed_sources(public)
    for name, raw in baseline.items():
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        provenance['installed_ancestor'][name] = digest(raw)
    original = {name: (installed / name).read_bytes() for name in runtime_patch.EXPECTED}
    helpers = {name: (HERE / name).read_bytes() for name in runtime_patch.HELPERS}
    changed = runtime_patch.changes(original, helpers)
    assert len(changed) == 14
    for name, raw in changed.items():
        (stage / name).write_bytes(raw)
        provenance['staged_transform'][name] = digest(raw)
    # No module imported during ancestry assembly may mask staged runtime code.
    names = {path.stem for path in stage.glob('*.py')} | {'runtime'}
    for name in list(sys.modules):
        if name in names or name.startswith('runtime.'):
            del sys.modules[name]
    sys.path.insert(0, str(stage))
    return provenance


def original_box(public):
    """Use the existing pinned public native-MCP smoke scene verbatim."""
    values = [node.value for node in ast.walk(ast.parse((public / 'codex_smoke.py').read_bytes()))
              if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == 'cube' for target in node.targets)]
    assert len(values) == 1
    return ast.literal_eval(values[0])


class FixtureResponse(io.BytesIO):
    status = 200


class ScriptedProvider:
    """Only the HTTPS response boundary is scripted; all local HTTP is real."""
    def __init__(self, runner, runtime, spend, folder, scene, accepted, correction=False):
        self.runner, self.runtime, self.spend = runner, runtime, spend
        self.folder, self.scene, self.accepted = folder, scene, accepted
        self.correction = correction
        self.before_model = None
        self.before_renders = None
        self.calls, self.counts, self.loopback, self.ports = [], [], [], set()
        self.render_hashes = {}

    def gateway(self, *args, **kwargs):
        value = self.runner.Gateway(*args, **kwargs)
        self.ports.add(value.server.server_address[1])
        self.actual_gateway = value
        return value

    def open(self, original_open, opener, request, *args, **kwargs):
        from urllib.parse import urlsplit
        from phased_controller import canonical
        url = urlsplit(request.full_url)
        if url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port in self.ports:
            assert url.path == '/v1/responses'
            self.loopback.append(request.data)
            return original_open(opener, request, *args, **kwargs)
        assert url.scheme == 'https' and url.hostname == 'api.openai.com', 'Unexpected external network'
        assert not url.query and not url.fragment
        assert request.get_header('Authorization') == 'Bearer offline-unused-fixture-key'
        wire = json.loads(request.data)
        if url.path == '/v1/responses/input_tokens':
            self.counts.append(wire)
            return FixtureResponse(canonical({'object': 'response.input_tokens', 'input_tokens': 4096}).encode())
        assert url.path == '/v1/responses', 'Unexpected external API'
        phases = ['construction', 'inspection'] + (['reassessment'] if self.correction else [])
        assert len(self.calls) < len(phases), 'No retry or extra model call is allowed'
        assert self.counts[-1] == self.spend.legacy.count_payload(wire), 'Count must include the same full context and images'
        assert request.data == self.loopback[-1], 'Gateway changed the admitted wire bytes'
        assert wire['model'] == 'gpt-6-astra' and wire['tools'] == []
        assert wire['store'] is False and wire['stream'] is True
        assert wire['service_tier'] == 'default' and wire['reasoning'] == {'effort': 'low'}
        assert wire['truncation'] == 'disabled'
        document = json.loads(wire['input'][0]['content'][0]['text'])
        phase = document['phase']
        assert phase == phases[len(self.calls)]
        assert wire['max_output_tokens'] == {'construction': 8192, 'inspection': 3072, 'reassessment': 1536}[phase]
        assert wire['text']['format']['type'] == 'json_schema' and wire['text']['format']['strict'] is True
        schema = wire['text']['format']['schema']
        assert schema['additionalProperties'] is False
        assert len(document['modeling_contract']['scene_schema']['properties']['parts']['items']['anyOf']) == 18
        assert document['request']['prompt'] == 'Synthetic native-MCP transport box; no user model or likeness request.'
        assert document['modeling_contract_task_fields_from_request'] == ['prompt', 'instructions']
        # A real original ledger hold must already exist before scripted HTTPS.
        with self.spend.ledger(self.folder) as (_, state):
            assert state['requests'] == len(self.calls) + 1
            assert len([hold for hold in state['holds'].values() if 'response' not in hold]) == 1
            assert self.spend.used(state) <= 1_750_000
        if phase == 'construction':
            assert not (self.folder / 'candidates').exists()
            assert schema['properties'] == {'scene_json': {'type': 'string'}}
            envelope = {'scene_json': canonical(self.scene)}
        else:
            import blender_mcp
            current = blender_mcp.current_candidate(self.folder)
            revision = 2 if phase == 'reassessment' else 1
            assert current is not None and current['info']['revision'] == revision
            assert current['result']['triangles'] > 0
            assert current['identity'][0] > 20
            content = wire['input'][0]['content']
            images = [value for value in content if value['type'] == 'input_image']
            assert len(images) == 3
            import base64
            labels = [json.loads(value['text']) for value in content[1:] if value['type'] == 'input_text']
            assert [value['view'] for value in labels] == ['front', 'side', 'back']
            for label, image in zip(labels, images):
                raw = base64.b64decode(image['image_url'].split(',', 1)[1], validate=True)
                actual = (current['path'] / 'review' / (label['view'] + '.png')).read_bytes()
                assert raw == actual and raw.startswith(b'\x89PNG\r\n\x1a\n')
                assert len(raw) > 1000, 'Native rendered pixels, not a tiny image fixture'
                assert label['model_sha256'] == current['identity'][1]
                assert label['revision'] == revision
                self.render_hashes[label['view']] = digest(raw)
            state = document['current_model']
            assert state['scene'] == json.loads((current['path'] / 'scene.json').read_text())
            assert state['report'] == current['result']
            assert EDIT_CODE in state['edits'] if revision == 2 else state['edits'] == ''
            assert state['completion_contract']['structural_passed'] is True
            assert set(schema['properties']) == {'accepted', 'issues', 'summary', 'correction'}
            correcting = self.correction and phase == 'inspection'
            if correcting:
                self.before_model = current['identity'][1]
                self.before_renders = dict(self.render_hashes)
            if phase == 'reassessment':
                assert current['identity'][1] != self.before_model, 'Edit did not change actual GLB'
                assert any(self.render_hashes[view] != self.before_renders[view] for view in self.render_hashes), 'No new rendered pixels after edit'
                mesh = next(v for v in current['result']['mesh_objects'] if v['name'] == 'body')
                assert abs(mesh['dimensions'][0] - 1.25) < 1e-6
            envelope = {'accepted': self.accepted and not correcting,
                'issues': (['The scripted fixture asks for a 25 percent wider current box.'] if correcting else
                           [] if self.accepted else ['Explicit scripted rejection of this synthetic transport fixture.']),
                'summary': 'Scripted offline transport verdict only; no live AI visual-quality evaluation.',
                'correction': {'kind': 'edit', 'code': EDIT_CODE} if correcting else None}
        self.calls.append({'phase': phase, 'payload_sha256': digest(request.data)})
        response = {'id': 'resp_native_' + ('accepted_' if self.accepted else 'rejected_') + phase,
            'object': 'response', 'model': 'gpt-6-astra', 'status': 'completed', 'service_tier': 'default',
            # Exercise documented reasoning metadata through the actual parser
            # before every real build/render/export case, not only a unit test.
            'output': [{'type': 'reasoning', 'id': 'rs_native_' + phase, 'summary': [],
                'status': None, 'encrypted_content': None,
                'content': None if phase == 'construction' else [] if phase == 'inspection' else
                    [{'type': 'reasoning_text', 'text': 'Synthetic transport metadata.'}]},
                {'type': 'message', 'id': 'message_native_' + phase,
                'role': 'assistant', 'status': 'completed', 'phase': 'final_answer',
                'content': [{'type': 'output_text', 'text': canonical(envelope), 'annotations': [], 'logprobs': []}]}],
            'usage': {'input_tokens': 4096, 'output_tokens': 300, 'total_tokens': 4396,
                'input_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0},
                'output_tokens_details': {'reasoning_tokens': 20}}}
        return FixtureResponse(b'data: ' + canonical({'type': 'response.completed', 'response': response}).encode() + b'\n\n')


def run_worker(public, installed, ancestor, workspace, blender):
    from unittest.mock import patch
    import socket
    import threading
    import types
    import urllib.request
    workspace.mkdir(parents=True, exist_ok=True)
    stage = workspace / 'stage'
    provenance = stage_runtime(public, installed, ancestor, stage)
    (workspace / 'source-provenance.json').write_text(json.dumps(provenance, indent=2))
    import codex_runner as runner
    import runtime_controller as runtime
    import construction_health
    import construction_policy
    import astra_spend_v2 as spend
    import blender_mcp
    from phased_controller import RejectedForServer
    assert Path(runner.__file__).parent == stage
    assert Path(runtime.__file__).parent == stage
    assert Path(blender_mcp.__file__).parent == stage
    assert Path(spend.__file__).parent == stage
    native_calls = []
    cancel = threading.Event()
    # Only this test-server adapter is replaced. Its callbacks execute the
    # actual unchanged native renderer/finalizer, using the original event.
    server = types.ModuleType('server')
    def native(job_id, candidate, cancelled, timeout, final=False):
        assert cancelled is cancel and not cancelled.is_set()
        assert 0 < timeout <= (300 if final else 420)
        runtime_dir = stage / 'runtime'
        expression = ('import sys;from pathlib import Path;sys.path.insert(0,' + repr(str(runtime_dir)) + ');'
            + ('from finalize import finalize;finalize' if final else 'from run import execute_job;execute_job')
            + '(Path(' + repr(str(candidate)) + '))')
        log = candidate / ('native-finalize.log' if final else 'native-build.log')
        with log.open('wb') as output:
            result = subprocess.run([str(blender), '--background', '--factory-startup', '-t', '2',
                '--python-exit-code', '1', '--python-expr', expression], stdout=output, stderr=subprocess.STDOUT,
                timeout=timeout, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
        assert result.returncode == 0, log.read_text()[-12000:]
        native_calls.append({'job_id': job_id, 'phase': 'finalize' if final else 'build',
                             'log': str(log.relative_to(workspace))})
    server.run_blender = native
    server.run_blender_finalize = lambda job_id, candidate, cancelled, timeout: native(job_id, candidate, cancelled, timeout, True)
    results = []
    scene = original_box(public)
    with patch.dict(sys.modules, {'server': server}), patch.object(construction_health, 'verified_health',
            return_value={'worldifactStandardConstructionPolicy': construction_policy.MODE}):
        for index, (accepted, correction) in enumerate(((True, False), (False, False), (True, True)), 1):
            folder = workspace / 'jobs' / ('00000000-0000-4000-8000-%012d' % index)
            folder.mkdir(parents=True)
            fixture = ScriptedProvider(runner, runtime, spend, folder, scene, accepted, correction)
            expected_requests = 3 if correction else 2
            original_open = urllib.request.OpenerDirector.open
            original_connect = socket.socket.connect
            def guarded_connect(sock, address):
                assert isinstance(address, tuple) and address[0] == '127.0.0.1' and address[1] in fixture.ports, 'External socket refused'
                return original_connect(sock, address)
            def intercepted_open(opener, request, *args, **kwargs):
                return fixture.open(original_open, opener, request, *args, **kwargs)
            with patch.object(urllib.request.OpenerDirector, 'open', intercepted_open), \
                 patch.object(socket.socket, 'connect', guarded_connect), \
                 patch.object(spend, 'protect', wraps=spend.protect) as protect, \
                 patch.object(spend, 'settle_completed', wraps=spend.settle_completed) as settle:
                try:
                    outcome = runtime.run(folder,
                        'Synthetic native-MCP transport box; no user model or likeness request.',
                        'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:\nBuild the exact public synthetic box fixture.',
                        'offline-unused-fixture-key', cancel, lambda text: None, gateway_factory=fixture.gateway)
                    assert accepted, 'A rejected assessment returned server success'
                    assert outcome['finished'] is True and outcome['accepted'] is True
                except RejectedForServer:
                    assert not accepted, 'Accepted path was rejected'
                assert protect.call_count == settle.call_count == expected_requests
                assert all(call.kwargs.get('minimum_output') in (8192, 3072, 1536) for call in protect.call_args_list)
            assert len(fixture.calls) == len(fixture.counts) == len(fixture.loopback) == expected_requests
            assert fixture.actual_gateway.unknown_usage is False
            assert fixture.actual_gateway.requests == expected_requests and fixture.actual_gateway.output == 300 * expected_requests
            assert fixture.actual_gateway.completed is accepted
            outcome = blender_mcp.completed_outcome(folder)
            assert outcome is not None and outcome['accepted'] is accepted
            assert outcome['revision'] == (2 if correction else 1)
            current = blender_mcp.current_candidate(folder, outcome['execution_id'])
            assert current is not None and current['identity'][1] == outcome['model_sha256']
            for name in ('model.glb', 'model.blend', 'model.fbx', 'model.obj', 'model-mm.stl', 'model-ready.json'):
                assert (folder / name).is_file() and (folder / name).stat().st_size > 0, name
            assert (folder / 'model.glb').read_bytes() == (current['path'] / 'model.glb').read_bytes()
            report = json.loads((folder / 'result.json').read_text())
            assert report['interchange_exports']['status'] == 'ready'
            with spend.ledger(folder) as (ledger_path, state):
                assert state['requests'] == expected_requests and len(state['holds']) == expected_requests
                assert all('response' in hold for hold in state['holds'].values())
                assert spend.used(state) == expected_requests * (4096 * 14 + 300 * 55)
                ledger = {'requests': state['requests'], 'held_micro_usd': spend.used(state),
                          'responses': [hold['response'] for hold in state['holds'].values()],
                          'path': str(ledger_path.relative_to(workspace))}
            calls = json.loads((folder / 'agent-tools.json').read_text())['calls']
            completed = [call['tool'] for call in calls if call['status'] == 'completed']
            assert completed.count('build_model') == completed.count('finish_model') == 1
            assert completed.count('edit_model') == (1 if correction else 0)
            assert completed.count('inspect_render') == (6 if correction else 3)
            results.append({'accepted': accepted, 'correction': correction, 'revision': outcome['revision'], 'server_success_returned': accepted,
                'actual_glb_sha256': outcome['model_sha256'], 'renders': fixture.render_hashes,
                'before_correction_model_sha256': fixture.before_model,
                'before_correction_renders': fixture.before_renders,
                'ledger': ledger, 'provider_requests': fixture.calls, 'native_calls': native_calls[-3 if correction else -2:]})
            print('NATIVE_PIPELINE_' + ('CORRECTED_ACCEPTED' if correction else 'ACCEPTED' if accepted else 'REJECTED') + '_VERIFIED', flush=True)
    evidence = {'scope': 'native Blender, actual JobTools, loopback Gateway and original ledger',
        'provider': 'explicit scripted count/Responses fixture; no network provider call',
        'activation': 'explicit fixture; no installed runtime claim',
        'production_container_isolation': False, 'visual_quality_verified': False,
        'cases': results, 'native_calls': native_calls}
    (workspace / 'native-evidence.json').write_text(json.dumps(evidence, indent=2))
    print('NATIVE_PIPELINE_VERIFIED ' + str(workspace / 'native-evidence.json'), flush=True)


@unittest.skipUnless(os.environ.get('MODEL_NATIVE_SOURCE') and os.environ.get('MODEL_NATIVE_INSTALLED'),
                     'Native gate requires explicit pinned public and installed source fixtures')
class NativePipelineTests(unittest.TestCase):
    def test_real_native_blender_gateway_ledger_and_honest_terminal_results(self):
        source = Path(os.environ['MODEL_NATIVE_SOURCE']).resolve()
        installed = Path(os.environ['MODEL_NATIVE_INSTALLED']).resolve()
        ancestor = Path(os.environ['MODEL_CONTEXT_ANCESTOR_REPOSITORY']).resolve()
        blender = Path(os.environ.get('MODEL_NATIVE_BLENDER', '/usr/bin/blender')).resolve()
        self.assertTrue(blender.is_file())
        retained = os.environ.get('MODEL_NATIVE_EVIDENCE')
        if retained:
            parent = Path(retained).resolve(); parent.mkdir(parents=True, exist_ok=True)
            workspace = Path(tempfile.mkdtemp(prefix='worldifact-native-', dir=parent))
        else:
            temporary = tempfile.TemporaryDirectory(prefix='worldifact-native-')
            self.addCleanup(temporary.cleanup)
            workspace = Path(temporary.name)
        log = workspace / 'pipeline.log'
        command = [sys.executable, str(Path(__file__).resolve()), '--native-worker',
                   str(source), str(installed), str(ancestor), str(workspace), str(blender)]
        with log.open('wb') as output:
            result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, timeout=1000,
                env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8',
                     'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 0, str(workspace) + '\n' + log.read_text()[-16000:])
        evidence = json.loads((workspace / 'native-evidence.json').read_text())
        self.assertEqual([case['accepted'] for case in evidence['cases']], [True, False, True])
        self.assertEqual([case['revision'] for case in evidence['cases']], [1, 1, 2])
        self.assertEqual(len(evidence['native_calls']), 7)
        self.assertIn('NATIVE_PIPELINE_VERIFIED', log.read_text())
        if retained:
            print('Native pipeline evidence: ' + str(workspace), flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--native-worker':
        run_worker(*(Path(value) for value in sys.argv[2:]))
    else:
        unittest.main()
