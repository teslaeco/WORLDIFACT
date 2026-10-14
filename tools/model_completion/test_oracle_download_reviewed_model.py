"""Offline-only tests. Every UUID, hash, model and SSH result here is synthetic."""
import ast
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import oracle_download_reviewed_model as mod

SOURCE = '11111111-1111-4111-8111-111111111111'
TEST = '22222222-2222-4222-8222-222222222222'
HASH = 'a' * 64


def model(uri=None):
    doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 36}],
           'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3,
                          'type': 'VEC3', 'min': [0, 0, 0], 'max': [1, 1, 0]}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
           'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    if uri is not None:
        doc['buffers'][0]['uri'] = uri
    raw = json.dumps(doc, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    binary = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
    return (struct.pack('<IIIII', 0x46546c67, 2, 28 + len(raw) + len(binary), len(raw), 0x4e4f534a)
            + raw + struct.pack('<II', len(binary), 0x004e4942) + binary)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='download-offline-', dir=Path(__file__).parent)
        self.home = Path(self.tmp.name)
        self.root = self.home / 'froge-connector'
        self.folder = self.root / 'state/jobs' / TEST
        self.candidate = self.folder / 'candidates/1'
        self.claim = self.root / 'state/worldifact-original-test-claims/one-shot.json'
        self.raw = model()
        self.private = mod.parameters(SOURCE, TEST, HASH, len(self.raw), hashlib.sha256(self.raw).hexdigest())
        self.write(self.claim, {'approval': mod.APPROVAL, 'sourceJobId': SOURCE, 'jobId': TEST,
                               'maxProviderReservationUsd': 1.75, 'expectedOriginalArtifactSha256': HASH,
                               'inputBinding': {'promptSha256': HASH, 'instructionsSha256': HASH,
                                                'photoMetadataSha256': HASH, 'photoSha256': [HASH] * 3,
                                                'unfinishedRetainedArtifact': {'sha256': HASH, 'bytes': 100,
                                                                              'checkpointSha256': HASH}}})
        self.claim.parent.chmod(0o700)
        self.claim.chmod(0o600)
        self.write(self.folder / 'agent-request.json', {'execution_id': 'synthetic-execution', 'prompt': 'PRIVATE-SENTINEL'})
        self.write(self.folder / 'agent-candidate.json', {'execution_id': 'synthetic-execution', 'revision': 1,
                                                       'path': 'candidates/1'})
        self.write(self.folder / 'agent-outcome.json', {'execution_id': 'synthetic-execution', 'revision': 1,
                                                      'finished': True, 'accepted': True,
                                                      'model_sha256': self.private['expected_hash']})
        self.write(self.folder / 'visual-review.json', {'status': 'reviewed', 'model_revision': 1,
                                                      'assessment_completed': True, 'accepted': True, 'issues': []})
        ready = {'revision': 1, 'phase': 'core_export', 'bytes': len(self.raw),
                 'sha256': self.private['expected_hash'], 'result': {'triangles': 1}}
        for base in (self.folder, self.candidate):
            self.write(base / 'model-ready.json', ready)
            self.write(base / 'result.json', {'triangles': 1})
            (base / 'model.glb').write_bytes(self.raw)

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def change(self, path, key, value):
        obj = json.loads(path.read_text())
        obj[key] = value
        self.write(path, obj)

    def verify(self):
        return mod.verified_model(self.home, self.private)

    def streaming(self, raw=None, code=0, before=None, hang=False):
        # A local inert subprocess substitutes for SSH; no network or credentials.
        raw = self.raw if raw is None else raw
        def start(argv, **kwargs):
            self.assertEqual(argv, ['offline-fixture'])
            if before is not None:
                before()
            command = 'import sys,time;sys.stdout.buffer.write(bytes.fromhex(%r));sys.stdout.flush();%s;sys.exit(%d)' % (
                raw.hex(), 'time.sleep(5)' if hang else 'pass', code)
            return subprocess.Popen([sys.executable, '-B', '-c', command], **kwargs)
        return start

    def copy(self, raw=None, code=0, before=None, hang=False, timeout=3):
        return mod.download(['offline-fixture'], mod.script(self.private), self.private, self.home,
                            popen=self.streaming(raw, code, before, hang), timeout=timeout)

    def no_ready(self):
        self.assertEqual(list(self.home.glob('worldifact-reviewed-model-*/model.glb')), [])
        self.assertEqual(list(self.home.glob('worldifact-reviewed-model-*/.model.glb.part')), [])

    def test_default_inert_even_with_private_arguments(self):
        with mock.patch.object(mod, 'connection', side_effect=AssertionError('connection')), \
             mock.patch.object(mod, 'directory', side_effect=AssertionError('file read')), \
             mock.patch.object(mod, 'download', side_effect=AssertionError('download')), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            mod.main([])
            mod.main(['--test-job', TEST, '--expected-glb-sha256', HASH])
        self.assertEqual(output.getvalue().count('PLAN ONLY'), 2)

    def test_malformed_parameters_fail_before_connection(self):
        good = ['--download-reviewed-model', '--source-job', SOURCE, '--test-job', TEST,
                '--expected-original-artifact-sha256', HASH, '--expected-glb-bytes', str(len(self.raw)),
                '--expected-glb-sha256', self.private['expected_hash']]
        for flag, bad in [('--source-job', '../secret'), ('--test-job', SOURCE), ('--test-job', TEST.upper()),
                          ('--expected-original-artifact-sha256', 'b' * 63), ('--expected-glb-sha256', HASH + ';x'),
                          ('--expected-glb-bytes', '50000001'), ('--expected-glb-bytes', '19')]:
            if flag == '--test-job' and bad == TEST.upper():
                bad = 'FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF'
            with self.subTest(flag=flag, bad=bad), mock.patch.object(mod, 'connection', side_effect=AssertionError()):
                argv = good.copy()
                argv[argv.index(flag) + 1] = bad
                with self.assertRaises(mod.DownloadError):
                    mod.main(argv)
        with self.assertRaises(mod.DownloadError):
            mod.parameters(SOURCE, TEST, HASH, True, HASH)

    def test_script_revalidates_private_scope(self):
        for private in ({}, {**self.private, 'path': '/etc/passwd'}, {**self.private, 'test_job': '../../secret'}):
            with self.subTest(private=private), self.assertRaises(mod.DownloadError):
                mod.script(private)

    def test_valid_exact_fixed_claim_model(self):
        self.assertEqual(self.verify(), self.raw)

    def test_wrong_claim_descriptor(self):
        original = self.claim.read_bytes()
        for key, value in [('approval', 'other'), ('sourceJobId', TEST), ('jobId', SOURCE),
                           ('maxProviderReservationUsd', 2.0), ('expectedOriginalArtifactSha256', 'b' * 64)]:
            with self.subTest(key=key):
                self.claim.write_bytes(original)
                self.change(self.claim, key, value)
                with self.assertRaises(ValueError):
                    self.verify()
        self.claim.write_bytes(original)
        self.change(self.claim, 'extra', True)
        with self.assertRaises(ValueError):
            self.verify()

    def test_missing_claim_no_creation(self):
        self.claim.unlink()
        with self.assertRaises(FileNotFoundError):
            self.verify()
        self.assertFalse(self.claim.exists())

    def test_private_claim_permissions_required(self):
        for path in (self.claim, self.claim.parent):
            with self.subTest(path=path):
                original = path.stat().st_mode
                path.chmod(0o755)
                with self.assertRaises(ValueError):
                    self.verify()
                path.chmod(original)

    def test_claim_binding_malformed(self):
        for binding in ({}, {'photoSha256': [HASH] * 3}, {'promptSha256': HASH, 'instructionsSha256': HASH,
                                                       'photoMetadataSha256': HASH, 'photoSha256': [HASH] * 2}):
            self.change(self.claim, 'inputBinding', binding)
            with self.assertRaises(ValueError):
                self.verify()

    def test_completion_barriers(self):
        mutations = [('agent-outcome.json', 'finished', False), ('agent-outcome.json', 'accepted', False),
                     ('agent-outcome.json', 'accepted', 1), ('agent-outcome.json', 'revision', 2),
                     ('agent-outcome.json', 'execution_id', 'old'), ('agent-outcome.json', 'model_sha256', HASH),
                     ('agent-candidate.json', 'execution_id', 'old'), ('agent-request.json', 'execution_id', ''),
                     ('visual-review.json', 'status', 'needs_revision'), ('visual-review.json', 'accepted', False),
                     ('visual-review.json', 'assessment_completed', False), ('visual-review.json', 'issues', ['fault']),
                     ('visual-review.json', 'model_revision', 2)]
        for name, key, value in mutations:
            path = self.folder / name
            original = path.read_bytes()
            with self.subTest(name=name, key=key):
                self.change(path, key, value)
                with self.assertRaises(ValueError):
                    self.verify()
                path.write_bytes(original)

    def test_missing_outcome_and_incomplete_evidence(self):
        for path in (self.folder / 'agent-outcome.json', self.candidate / 'model-ready.json',
                     self.folder / 'visual-review.json'):
            original = path.read_bytes()
            path.unlink()
            with self.subTest(path=path), self.assertRaises(FileNotFoundError):
                self.verify()
            path.write_bytes(original)

    def test_candidate_path_injection(self):
        for value in ('../../secret', '/etc', 'candidates/../1', 'candidates/1/model.glb', 'candidates/01'):
            self.change(self.folder / 'agent-candidate.json', 'path', value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.verify()

    def test_checkpoint_bytes_hash_and_results(self):
        for path, key, value in [(self.candidate / 'model-ready.json', 'bytes', len(self.raw) - 1),
                                 (self.candidate / 'model-ready.json', 'sha256', HASH),
                                 (self.folder / 'model-ready.json', 'phase', 'unknown'),
                                 (self.folder / 'result.json', 'triangles', 2),
                                 (self.candidate / 'result.json', 'triangles', 0)]:
            original = path.read_bytes()
            with self.subTest(path=path, key=key):
                self.change(path, key, value)
                with self.assertRaises(ValueError):
                    self.verify()
                path.write_bytes(original)

    def test_model_bytes_and_hash(self):
        for path in (self.folder / 'model.glb', self.candidate / 'model.glb'):
            for raw in (self.raw[:-1], self.raw + b'x', self.raw[:-1] + b'x'):
                path.write_bytes(raw)
                with self.subTest(path=path, length=len(raw)), self.assertRaises(ValueError):
                    self.verify()
                path.write_bytes(self.raw)

    def test_remote_symlink_at_each_level_rejected(self):
        for path in (self.root, self.root / 'state', self.folder, self.candidate,
                     self.folder / 'model.glb', self.claim):
            moved = path.with_name(path.name + '-held')
            path.rename(moved)
            path.symlink_to(moved, target_is_directory=moved.is_dir())
            with self.subTest(path=path), self.assertRaises(OSError):
                self.verify()
            path.unlink()
            moved.rename(path)

    def test_fifo_rejected_without_blocking(self):
        path = self.folder / 'model.glb'
        path.unlink()
        os.mkfifo(path)
        with self.assertRaises(ValueError):
            self.verify()

    def test_glb_structure_and_external_resources_rejected(self):
        for raw in (b'x' * 100, self.raw[:-1], self.raw + b'x', model('https://example.invalid/private.bin'),
                    model('data:application/octet-stream;base64,AA==')):
            with self.subTest(length=len(raw)), self.assertRaises((ValueError, struct.error)):
                mod.glb(raw)

    def test_remote_program_only_emits_binary(self):
        run = subprocess.run([sys.executable, '-B', '-'], input=mod.script(self.private),
                             env={**os.environ, 'HOME': str(self.home)}, capture_output=True, timeout=3)
        self.assertEqual(run.returncode, 0)
        self.assertEqual(run.stdout, self.raw)
        self.assertEqual(run.stderr, b'')

    def test_remote_failure_emits_no_metadata_or_traceback(self):
        self.change(self.folder / 'agent-outcome.json', 'finished', False)
        run = subprocess.run([sys.executable, '-B', '-'], input=mod.script(self.private),
                             env={**os.environ, 'HOME': str(self.home)}, capture_output=True, timeout=3)
        self.assertEqual(run.returncode, 1)
        self.assertEqual(run.stdout, b'')
        self.assertEqual(run.stderr, b'')

    def test_full_copy_private_exact_bytes_hash_and_no_mutation(self):
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = self.copy()
        path = Path(result['path'])
        self.assertEqual(path.read_bytes(), self.raw)
        self.assertEqual(result['sha256'], hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(result['bytes'], len(self.raw))
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(list(path.parent.iterdir()), [path])
        self.assertIn('ACTUAL_BROWSER_PREVIEW', result['visualQuality'])
        after = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_truncated_oversize_corrupt_and_exit_failure_remove_partial(self):
        for raw, code in [(self.raw[:-1], 0), (self.raw + b'x', 0), (self.raw[:-1] + b'x', 0), (self.raw, 1)]:
            with self.subTest(length=len(raw), code=code), self.assertRaises(mod.DownloadError):
                self.copy(raw, code)
            self.no_ready()

    def test_timeout_removes_partial_and_kills_process(self):
        with self.assertRaises(mod.DownloadError):
            self.copy(hang=True, timeout=0.05)
        self.no_ready()

    def test_untrusted_invalid_glb_rejected_even_matching_hash(self):
        self.raw = b'x' * len(self.raw)
        self.private['expected_hash'] = hashlib.sha256(self.raw).hexdigest()
        with self.assertRaises(mod.DownloadError):
            self.copy()
        self.no_ready()

    def test_unique_directory_never_reused_or_clobbered(self):
        with mock.patch.object(mod.secrets, 'token_hex', return_value='synthetic'):
            first = self.copy()
            path = Path(first['path'])
            with self.assertRaises(mod.DownloadError):
                self.copy()
            self.assertEqual(path.read_bytes(), self.raw)

    def test_existing_empty_directory_is_not_removed(self):
        existing = self.home / 'worldifact-reviewed-model-synthetic'
        existing.mkdir()
        with mock.patch.object(mod.secrets, 'token_hex', return_value='synthetic'):
            with self.assertRaises(mod.DownloadError):
                self.copy()
        self.assertTrue(existing.is_dir())

    def test_final_fsync_failure_removes_only_new_validated_output(self):
        original = mod.os.fsync
        calls = []
        def fail_after_link(fd):
            calls.append(fd)
            if len(calls) == 2:
                raise OSError('synthetic fsync failure')
            return original(fd)
        with mock.patch.object(mod.os, 'fsync', side_effect=fail_after_link):
            with self.assertRaises(mod.DownloadError):
                self.copy()
        self.no_ready()

    def test_ready_filename_collision_never_overwrites(self):
        def inject():
            folder, = self.home.glob('worldifact-reviewed-model-*')
            (folder / 'model.glb').write_bytes(b'KEEP')
        with self.assertRaises(mod.DownloadError):
            self.copy(before=inject)
        path, = self.home.glob('worldifact-reviewed-model-*/model.glb')
        self.assertEqual(path.read_bytes(), b'KEEP')
        self.assertEqual(list(path.parent.glob('*.part')), [])

    def test_output_home_symlink_rejected(self):
        link = self.home / 'link'
        link.symlink_to(self.home, target_is_directory=True)
        with self.assertRaises(OSError):
            mod.download(['offline-fixture'], mod.script(self.private), self.private, link,
                         popen=self.streaming())
        self.no_ready()

    def test_script_has_no_provider_installer_or_mutating_remote_calls(self):
        tree = ast.parse(mod.script(self.private))
        names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
        self.assertFalse(names & {'subprocess', 'urllib', 'sqlite3', 'requests', 'socket'})
        attrs = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
        self.assertFalse(attrs & {'mkdir', 'unlink', 'replace', 'rename', 'write_text', 'write_bytes'})

    def test_strict_connection_no_private_key_read(self):
        key = self.home / 'ssh-key-2026-09-06.key'
        key.write_text('SYNTHETIC KEY NEVER OPENED')
        with mock.patch.object(mod, 'lookup', side_effect=['ocid1.instance.oc1.synthetic', '8.8.8.8']) as lookup, \
             mock.patch.object(Path, 'read_bytes', side_effect=AssertionError('key read')), \
             mock.patch.object(Path, 'read_text', side_effect=AssertionError('key read')):
            command = mod.connection(self.home)
        self.assertIn('StrictHostKeyChecking=yes', command)
        self.assertIn('BatchMode=yes', command)
        self.assertIn('IdentitiesOnly=yes', command)
        self.assertEqual(command[:4], ['ssh', '-F', '/dev/null', '-T'])
        self.assertEqual(command[-2:], ['opc@8.8.8.8', 'PYTHONDONTWRITEBYTECODE=1 python3 -B -'])
        self.assertEqual(lookup.call_count, 2)
        self.assertIn("query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
                      lookup.call_args_list[0].args[0])

    def test_strict_connection_rejects_symlink_key_and_nonpublic_address(self):
        key = self.home / 'ssh-key-2026-09-06.key'
        other = self.home / 'synthetic-key'
        other.write_text('unused')
        key.symlink_to(other)
        with mock.patch.object(mod, 'lookup', side_effect=AssertionError()), self.assertRaises(mod.DownloadError):
            mod.connection(self.home)
        key.unlink()
        key.write_text('unused')
        for address in ('127.0.0.1', '10.0.0.1', '169.254.169.254', 'hostname.invalid', '8.8.8.8;echo x'):
            with self.subTest(address=address), \
                 mock.patch.object(mod, 'lookup', side_effect=['ocid1.instance.oc1.synthetic', address]), \
                 self.assertRaises(mod.DownloadError):
                mod.connection(self.home)

    def test_lookup_rejects_ambiguous_and_failed_responses(self):
        for stdout, code in [('[]', 0), ('["a", "b"]', 0), ('[1]', 0), ('{"x":1}', 0), ('private log', 0), ('["a"]', 1)]:
            with self.subTest(stdout=stdout), mock.patch.object(mod.subprocess, 'run',
                 return_value=subprocess.CompletedProcess([], code, stdout, 'SECRET')), self.assertRaises(mod.DownloadError):
                mod.lookup(['offline-fixture'])


if __name__ == '__main__':
    unittest.main()
