import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('candidate_readonly', Path(__file__).with_name('inspect_candidate_readonly.py'))
candidate = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(candidate)


def glb(extra=None):
    document = {'asset': {'version': '2.0'}, 'meshes': [{}], 'nodes': [{}], 'materials': [{}], **(extra or {})}
    body = json.dumps(document).encode(); body += b' ' * (-len(body) % 4)
    return struct.pack('<IIIII', 0x46546c67, 2, 20 + len(body), len(body), 0x4e4f534a) + body


class CandidateReadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'state/jobs' / candidate.JOB
        self.model = self.folder / 'candidates/1'
        self.model.mkdir(parents=True)
        self.write('agent-request.json', {'execution_id': 'test-execution', 'prompt': 'PRIVATE_PROMPT', 'instructions': 'PRIVATE_INSTRUCTIONS'})
        self.write('agent-candidate.json', {'execution_id': 'test-execution', 'revision': 1, 'path': 'candidates/1'})
        self.set_model(glb())

    def write(self, relative, value):
        (self.folder / relative).write_text(json.dumps(value))

    def set_model(self, data):
        (self.model / 'model.glb').write_bytes(data)
        self.write('candidates/1/model-ready.json', {'revision': 1, 'phase': 'core_export', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'result': {'triangles': 100}})
        self.write('candidates/1/result.json', {'triangles': 100, 'private': 'PRIVATE_GEOMETRY_REPORT'})

    def snapshot(self):
        return {str(p.relative_to(self.root)): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.root.rglob('*') if p.is_file()}

    def test_current_hash_bound_candidate_is_read_without_root_export_or_financial_mutation(self):
        before = self.snapshot()
        value = candidate.inspect(self.root)
        self.assertEqual(value['phase'], 'CURRENT_CANDIDATE_FOUND_UNREVIEWED')
        self.assertEqual(value['model']['sha256'], hashlib.sha256(glb()).hexdigest())
        for key in ('paid_generation_requested', 'job_rows_changed', 'financial_settlement_requested', 'artifact_copied', 'completion_verified', 'visual_quality_verified'):
            self.assertIs(value[key], False)
        self.assertNotIn('PRIVATE', json.dumps(value))
        self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.folder / 'model.glb').exists())

    def test_absence_is_unverified_not_a_claim_no_other_candidate_exists(self):
        (self.folder / 'agent-candidate.json').unlink()
        value = candidate.inspect(self.root)
        self.assertEqual(value['phase'], 'CURRENT_CANDIDATE_UNVERIFIED')
        self.assertEqual(value['reason'], 'MISSING_FILE')
        self.assertTrue((self.model / 'model.glb').exists())

    def test_cross_execution_paths_and_unbounded_revisions_are_refused(self):
        for delta in ({'execution_id': 'other'}, {'revision': True}, {'revision': 6}, {'path': '../other'}, {'path': '/tmp/private'}, {'path': 'candidates/1/../../other'}, {'path': 'candidates/100'}):
            self.write('agent-candidate.json', {'execution_id': 'test-execution', 'revision': 1, 'path': 'candidates/1', **delta})
            self.assertEqual(candidate.inspect(self.root)['phase'], 'CURRENT_CANDIDATE_UNVERIFIED')

    def test_success_revision_is_independent_of_attempt_number_after_a_failed_build(self):
        # Pinned build() increments attempts before Blender and revision only
        # after success. A valid second revision may therefore be attempt three.
        self.model.rename(self.folder / 'candidates/3')
        self.write('agent-candidate.json', {'execution_id': 'test-execution', 'revision': 2, 'path': 'candidates/3'})
        value = candidate.inspect(self.root)
        self.assertEqual(value['phase'], 'CURRENT_CANDIDATE_FOUND_UNREVIEWED')
        self.assertEqual(value['revision'], 2)

    def test_model_and_parent_symlinks_are_refused_without_following(self):
        original = self.model / 'model.glb'; original.rename(self.model / 'original.glb')
        original.symlink_to('original.glb')
        self.assertEqual(candidate.inspect(self.root)['reason'], 'LINKED_PATH')
        linked = self.root / 'linked'; linked.symlink_to(self.root / 'state', target_is_directory=True)
        with self.assertRaises(candidate.Refused): candidate.checked_path(linked / 'jobs')

    def test_fifo_is_refused_without_waiting_for_any_writer(self):
        path = self.folder / 'agent-request.json'
        path.unlink(); os.mkfifo(path)
        # O_NONBLOCK permits fstat to reject the FIFO immediately, without an
        # unbounded remote wait or any writer having to open the other end.
        with patch.object(candidate.os, 'open', wraps=os.open) as opened:
            value = candidate.inspect(self.root)
        self.assertEqual(value['reason'], 'INVALID_FILE')
        self.assertTrue(opened.call_args.args[1] & os.O_NONBLOCK)

    def test_corrupt_external_or_mismatched_model_is_not_verified(self):
        for data in (b'not-a-model', glb({'buffers': [{'uri': 'https://private.example/model.bin'}]}), glb({'images': [{'uri': '../private.png'}]})):
            self.set_model(data)
            self.assertEqual(candidate.inspect(self.root)['phase'], 'CURRENT_CANDIDATE_UNVERIFIED')
        self.set_model(glb()); (self.model / 'model.glb').write_bytes(glb({'extra': 1}))
        self.assertEqual(candidate.inspect(self.root)['reason'], 'CHECKPOINT_MISMATCH')

    def test_result_mismatch_and_changed_files_are_refused(self):
        self.write('candidates/1/result.json', {'triangles': 101})
        self.assertEqual(candidate.inspect(self.root)['reason'], 'RESULT_MISMATCH')
        self.set_model(glb())
        with patch.object(candidate.Reader, 'stable', side_effect=candidate.Refused('CHANGED_FILE')):
            self.assertEqual(candidate.inspect(self.root)['reason'], 'CHANGED_FILE')

    def test_plan_is_inert_and_inspector_never_imports_or_executes_installed_worker(self):
        stream = io.StringIO()
        with patch.object(candidate, 'inspect', side_effect=AssertionError('must be inert')), redirect_stdout(stream):
            self.assertEqual(candidate.main([]), 0)
        self.assertIn('PLAN ONLY', stream.getvalue())
        # A malicious installed source is irrelevant: no worker import occurs.
        (self.root / 'blender_mcp.py').write_text('raise RuntimeError("DO_NOT_EXECUTE")')
        self.assertEqual(candidate.inspect(self.root)['phase'], 'CURRENT_CANDIDATE_FOUND_UNREVIEWED')


if __name__ == '__main__':
    unittest.main()
