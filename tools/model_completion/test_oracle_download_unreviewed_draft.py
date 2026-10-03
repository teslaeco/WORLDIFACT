"""Offline-only tests; fixtures do not represent a user model or job."""
import ast
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('unreviewed_download', HERE / 'oracle_download_unreviewed_draft.py')
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)
JOB = '00000000-0000-4000-8000-000000000077'
TOKEN = 'fixture_authorization_' + 'x' * 32


def model(document_change=None, binary_change=None, instances=1):
    binary = struct.pack('<9f3H', 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2)
    document = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
                'bufferViews': [{'buffer': 0, 'byteLength': 36},
                                {'buffer': 0, 'byteOffset': 36, 'byteLength': 6}],
                'accessors': [{'bufferView': 0, 'componentType': 5126, 'type': 'VEC3', 'count': 3},
                              {'bufferView': 1, 'componentType': 5123, 'type': 'SCALAR', 'count': 3}],
                'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
                'nodes': [{'mesh': 0} for _ in range(instances)],
                'scenes': [{'nodes': list(range(instances))}], 'scene': 0}
    if document_change:
        document_change(document)
    if binary_change:
        binary = binary_change(binary)
    binary += b'\0' * (-len(binary) % 4)
    metadata = json.dumps(document).encode()
    metadata += b' ' * (-len(metadata) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + len(binary))
            + struct.pack('<II', len(metadata), 0x4E4F534A) + metadata
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


class Response(io.BytesIO):
    status = 200


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.root = self.home / 'froge-connector'
        self.folder = self.root / 'state/jobs' / JOB
        self.candidate = self.folder / 'candidates/7'
        self.candidate.mkdir(parents=True)
        self.raw = model()
        self.write(self.root / 'state/config.json', {'token': TOKEN})
        self.write(self.folder / 'agent-request.json', {'execution_id': 'fixture-execution'})
        self.write(self.folder / 'agent-candidate.json',
                   {'execution_id': 'fixture-execution', 'revision': 7, 'path': 'candidates/7'})
        self.save_model(self.raw)
        self.states = [{'id': JOB, 'state': 'failed'}] * 2
        self.requests = []
        self.opener = patch.object(draft.urllib.request, 'build_opener', self.build_opener)
        self.opener.start()
        self.addCleanup(self.opener.stop)

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def save_model(self, raw, triangles=1):
        self.raw = raw
        self.private = draft.parameters(JOB, 7, len(raw))
        result = {'triangles': triangles, 'vertices': 3, 'objects': triangles}
        self.write(self.candidate / 'model-ready.json', {'revision': 1, 'phase': 'core_export',
                   'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'result': result})
        self.write(self.candidate / 'result.json', dict(result, review_render='later-fixture-metadata'))
        (self.candidate / 'model.glb').write_bytes(raw)

    def build_opener(self, *handlers):
        self.assertIsInstance(handlers[0], draft.urllib.request.ProxyHandler)
        self.assertEqual(handlers[0].proxies, {})
        self.assertIsInstance(handlers[1], draft.NoRedirect)
        test = self
        class Opener:
            def open(self, request, timeout):
                test.requests.append(request)
                test.assertEqual(request.get_method(), 'GET')
                test.assertEqual(request.full_url, 'http://127.0.0.1:8765/v1/jobs/' + JOB)
                test.assertEqual(request.get_header('Authorization'), 'Bearer ' + TOKEN)
                test.assertEqual(timeout, 10)
                return Response(json.dumps(test.states.pop(0)).encode())
        return Opener()

    def verify(self):
        return draft.verified_model(self.home, self.private)

    def tree(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def mutate(self, filename, values):
        path = self.folder / filename
        value = json.loads(path.read_text())
        value.update(values)
        self.write(path, value)

    def test_candidate_only_transfer_is_authenticated_and_preserves_entire_tree(self):
        before = self.tree()
        observed = []
        original = draft.os.open
        def read_only(path, flags, *args, **kwargs):
            observed.append(flags)
            self.assertFalse(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC))
            return original(path, flags, *args, **kwargs)
        with patch.object(draft.os, 'open', read_only):
            self.assertEqual(self.verify(), self.raw)
        self.assertTrue(observed)
        self.assertEqual(self.tree(), before)
        self.assertEqual(len(self.requests), 2)
        self.assertFalse((self.folder / 'model.glb').exists())
        self.assertFalse((self.folder / 'model-ready.json').exists())
        self.assertFalse((self.folder / 'agent-outcome.json').exists())

    def test_linked_mesh_instances_allow_blender_per_object_triangle_count(self):
        self.save_model(model(instances=2), triangles=2)
        self.assertEqual(draft.glb(self.raw), 1)
        self.assertEqual(self.verify(), self.raw)

    def test_incomplete_later_candidate_is_never_selected(self):
        later = self.folder / 'candidates/8'
        later.mkdir()
        (later / 'model.glb').write_bytes(b'partial')
        before = self.tree()
        self.assertEqual(self.verify(), self.raw)
        self.assertEqual(self.tree(), before)

    def test_wrong_job_or_nonfailed_state_stops_before_candidate_read(self):
        for state in ({'id': JOB, 'state': 'succeeded'}, {'id': JOB, 'state': 'running'},
                      {'id': '00000000-0000-4000-8000-000000000088', 'state': 'failed'}):
            with self.subTest(state=state):
                self.states = [state]
                original = draft.regular
                def only_config(root, name, *args, **kwargs):
                    self.assertEqual(name, 'state/config.json')
                    return original(root, name, *args, **kwargs)
                with patch.object(draft, 'regular', only_config), self.assertRaises(ValueError):
                    self.verify()

    def test_changed_terminal_state_is_refused(self):
        self.states[1] = {'id': JOB, 'state': 'succeeded'}
        with self.assertRaises(ValueError):
            self.verify()

    def test_invalid_candidate_identity_is_refused(self):
        path = self.folder / 'agent-candidate.json'
        original = path.read_bytes()
        for change in ({'execution_id': 'other'}, {'revision': 8}, {'revision': True},
                       {'path': 'candidates/8'}, {'path': '../outside'}, {'path': '/etc/passwd'}):
            with self.subTest(change=change):
                path.write_bytes(original)
                self.mutate('agent-candidate.json', change)
                self.states = [{'id': JOB, 'state': 'failed'}] * 2
                with self.assertRaises(ValueError):
                    self.verify()

    def test_missing_execution_identity_is_refused(self):
        self.write(self.folder / 'agent-request.json', {})
        with self.assertRaises(ValueError):
            self.verify()

    def test_ready_hash_size_schema_and_geometry_identity_are_bound(self):
        path = self.candidate / 'model-ready.json'
        original = path.read_bytes()
        for change in ({'sha256': '0' * 64}, {'bytes': len(self.raw) + 1}, {'revision': 7},
                       {'phase': 'unrecognized'}, {'result': {'triangles': 2}},
                       {'result': {'triangles': True}}, {'result': {'triangles': 1, 'vertices': 8, 'objects': 1}}):
            with self.subTest(change=change):
                path.write_bytes(original)
                self.mutate('candidates/7/model-ready.json', change)
                self.states = [{'id': JOB, 'state': 'failed'}] * 2
                with self.assertRaises(ValueError):
                    self.verify()

    def test_independent_hash_mismatch_is_refused(self):
        self.private['expected_hash'] = 'f' * 64
        with self.assertRaises(ValueError):
            self.verify()

    def test_success_claim_is_refused(self):
        for name, value in (('agent-outcome.json', {'finished': True}), ('visual-review.json', {'accepted': True})):
            with self.subTest(name=name):
                self.states = [{'id': JOB, 'state': 'failed'}] * 2
                self.write(self.folder / name, value)
                with self.assertRaises(ValueError):
                    self.verify()
                (self.folder / name).unlink()

    def test_symlink_and_hardlink_artifacts_are_refused(self):
        path = self.candidate / 'model.glb'
        saved = self.home / 'saved.glb'
        path.rename(saved)
        for create in (lambda: path.symlink_to(saved), lambda: os.link(saved, path)):
            with self.subTest(create=create):
                create()
                self.states = [{'id': JOB, 'state': 'failed'}] * 2
                with self.assertRaises((OSError, ValueError)):
                    self.verify()
                path.unlink()

    def test_symlink_candidate_directory_is_refused(self):
        saved = self.home / 'saved-candidate'
        self.candidate.rename(saved)
        self.candidate.symlink_to(saved, target_is_directory=True)
        with self.assertRaises(OSError):
            self.verify()

    def test_readback_refuses_changed_pointer_model_or_checkpoint(self):
        original = draft.regular
        saved = self.tree()
        for target in ('pointer', 'model', 'ready'):
            with self.subTest(target=target):
                for name, raw in saved.items():
                    (self.root / name).write_bytes(raw)
                self.states = [{'id': JOB, 'state': 'failed'}] * 2
                changed = []
                def race(root, name, *args, **kwargs):
                    raw = original(root, name, *args, **kwargs)
                    if name.endswith('/model.glb') and not changed:
                        changed.append(True)
                        if target == 'pointer':
                            self.mutate('agent-candidate.json', {'revision': 8, 'path': 'candidates/8'})
                        elif target == 'model':
                            (self.candidate / 'model.glb').write_bytes(raw[:-1] + b'x')
                        else:
                            self.mutate('candidates/7/model-ready.json', {'phase': 'interchange_exports'})
                    return raw
                with patch.object(draft, 'regular', race), self.assertRaises(ValueError):
                    self.verify()

    def test_glb_structural_and_resource_guards(self):
        changes = [lambda d: d['buffers'][0].update(uri='https://example.invalid/asset.bin'),
                   lambda d: d.update(extras={'uri': 'data:arbitrary'}),
                   lambda d: d.update(extensionsUsed=['EXT_mesh_gpu_instancing']),
                   lambda d: d['meshes'][0].update(extensions={'UNKNOWN_extension': {}}),
                   lambda d: d['bufferViews'][0].update(byteLength=10000),
                   lambda d: d['accessors'][0].update(count=10000),
                   lambda d: d['accessors'][0].update(sparse={}),
                   lambda d: d['nodes'][0].update(children=[0]),
                   lambda d: d['nodes'][0].update(mesh=99),
                   lambda d: d.update(extras={'invalid': float('nan')})]
        for change in changes:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                draft.glb(model(change))
        for raw in (self.raw[:-1], self.raw + b'xxxx', b'x' * 40,
                    model(binary_change=lambda b: b[:36] + struct.pack('<3H', 0, 1, 99))):
            with self.subTest(raw=raw[:12]), self.assertRaises(ValueError):
                draft.glb(raw)

    def test_default_mode_is_inert_and_invalid_args_are_private(self):
        with patch.object(draft, 'connection', side_effect=AssertionError), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertIsNone(draft.main([]))
        self.assertIn('PLAN ONLY', out.getvalue())
        with patch.object(draft, 'connection', side_effect=AssertionError), self.assertRaises(draft.DownloadError):
            draft.main(['--download-unreviewed-draft', '--job', 'private-invalid-value'])
        with contextlib.redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit):
            draft.main(['--revision', 'private-invalid-value'])
        self.assertNotIn('private-invalid-value', err.getvalue())

    def test_remote_program_has_only_read_only_imports_and_no_worker_calls(self):
        tree = ast.parse(draft.GUARDS)
        imports = {alias.name.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        self.assertNotIn('sqlite3', imports)
        self.assertNotIn('subprocess', imports)
        self.assertFalse(any(isinstance(node, ast.ImportFrom) for node in ast.walk(tree)))
        compile(draft.script(self.private), '<remote>', 'exec')
        self.assertIsNone(draft.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_connection_routines_match_exact_reviewed_git_blob(self):
        raw = subprocess.check_output(['git', 'cat-file', 'blob', 'ba7bb96db4fe1dd0b32f3cfb8c858bd1fd62230c'], cwd=HERE)
        source = ast.parse(raw)
        actual = ast.parse((HERE / 'oracle_download_unreviewed_draft.py').read_text())
        for name in ('lookup', 'connection'):
            expected = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == name)
            found = next(n for n in actual.body if isinstance(n, ast.FunctionDef) and n.name == name)
            self.assertEqual(ast.dump(found), ast.dump(expected))

    def transfer(self, raw=None, code=None, timeout=3):
        raw = self.raw if raw is None else raw
        code = code or ('import sys;sys.stdout.buffer.write(bytes.fromhex(' + repr(raw.hex()) + '));sys.stdout.buffer.flush()')
        def local_process(command, **kwargs):
            return subprocess.Popen([sys.executable, '-B', '-c', code], **kwargs)
        return draft.download(['offline-fixture-only'], b'ignored fixture input', self.private,
                              home=self.home, popen=local_process, timeout=timeout)

    def test_local_transfer_is_exact_private_atomic_and_explicitly_incomplete(self):
        result = self.transfer()
        path = Path(result['path'])
        self.assertEqual(path.read_bytes(), self.raw)
        self.assertIn('UNREVIEWED-INCOMPLETE', path.name)
        self.assertEqual(path.stat().st_nlink, 1)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(result['sha256'], hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(result['state'], 'UNREVIEWED_INCOMPLETE')
        self.assertFalse(result['completed'])
        self.assertFalse(result['accepted'])
        self.assertFalse(result['manufacturingApproval'])
        self.assertEqual(list(path.parent.iterdir()), [path])

    def test_local_short_excess_bad_hash_and_nonzero_exit_leave_no_artifact(self):
        for case in ('short', 'excess', 'hash', 'exit'):
            with self.subTest(case=case):
                self.private['expected_hash'] = 'f' * 64 if case == 'hash' else None
                raw = self.raw[:-1] if case == 'short' else self.raw + b'x' if case == 'excess' else self.raw
                code = ('import sys;sys.stdout.buffer.write(bytes.fromhex(' + repr(self.raw.hex()) + '));sys.exit(1)') if case == 'exit' else None
                with self.assertRaises(draft.DownloadError):
                    self.transfer(raw, code)
                self.assertEqual(list(self.home.glob('worldifact-*')), [])

    def test_local_timeout_leaves_no_artifact(self):
        with self.assertRaises(draft.DownloadError):
            self.transfer(code='import time;time.sleep(10)', timeout=0.05)
        self.assertEqual(list(self.home.glob('worldifact-*')), [])

    def test_local_existing_directory_is_never_clobbered(self):
        folder = self.home / ('worldifact-UNREVIEWED-INCOMPLETE-' + 'f' * 24)
        folder.mkdir()
        marker = folder / 'owner-file'
        marker.write_bytes(b'keep')
        with patch.object(draft.secrets, 'token_hex', return_value='f' * 24), self.assertRaises(draft.DownloadError):
            self.transfer()
        self.assertEqual(marker.read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
