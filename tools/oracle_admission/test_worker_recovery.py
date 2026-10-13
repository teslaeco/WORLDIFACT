"""Execute the exact original/candidate queue functions with inert rendering.

Real local SQLite is used, but renderer/provider calls are fixtures. These
regressions prove queue liveness and once-only claims, not real generated models.
"""
import ast
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
import urllib.error
from unittest.mock import patch

import patch_server


class EndFixture(BaseException):
    pass


class Wake:
    def __init__(self, release=None):
        self.count = 0
        self.release = release

    def wait(self, seconds):
        if seconds != 2:
            raise AssertionError('The reviewed bounded queue wait changed.')
        self.count += 1
        if self.count == 2 and self.release is not None:
            self.release()
        if self.count > 15:
            raise EndFixture()

    def clear(self):
        pass


class QueueRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = (Path(os.environ['ORACLE_ADMISSION_SOURCE']) / 'server.py').read_bytes()
        here = Path(__file__).resolve().parent
        helpers = {name: (here / name).read_bytes() for name in patch_server.HELPERS}
        cls.candidate = patch_server.transform(cls.original, helpers)

    def execute(self, code, count=2, timing_failure=False, mkdir_failure=False,
                busy=False, commit_ack_failure=False, terminal_write_failure=False):
        with tempfile.TemporaryDirectory(prefix='worldifact-queue-inert-') as tmp:
            root = Path(tmp)
            jobs = root / 'jobs'
            jobs.mkdir()
            ids = ['00000000-0000-4000-8000-%012d' % i for i in range(1, count + 1)]
            database_path = root / 'jobs.sqlite'
            connection = sqlite3.connect(database_path)
            connection.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT, state TEXT, detail TEXT, created REAL, updated REAL)')
            for i, job_id in enumerate(ids):
                folder = jobs / job_id
                folder.mkdir()
                (folder / 'saved-scene.json').write_text('{}')
                connection.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (job_id, 'INERT', 'queued', '', i, i))
            connection.commit()
            connection.close()
            renders, faults, terminal_faults = [], [], []
            blockers = []
            if busy:
                lock = sqlite3.connect(database_path)
                lock.execute('BEGIN IMMEDIATE')
                blockers.append(lock)

            def release():
                if blockers:
                    blockers.pop().close()

            commits = []
            class CommitAckConnection(sqlite3.Connection):
                def __exit__(self, *args):
                    result = super().__exit__(*args)
                    if commit_ack_failure and not commits and args[0] is None:
                        commits.append(True)
                        raise sqlite3.OperationalError('INERT_COMMIT_ACK_FAILURE')
                    return result

            def database():
                c = sqlite3.connect(database_path, timeout=0.01, factory=CommitAckConnection)
                c.row_factory = sqlite3.Row
                return c

            def status(job_id, state, detail):
                if terminal_write_failure and job_id == ids[0] and state == 'failed' and not terminal_faults:
                    terminal_faults.append(True)
                    raise sqlite3.OperationalError('INERT_TERMINAL_WRITE_FAILURE')
                with sqlite3.connect(database_path, timeout=0.01) as c:
                    c.execute('UPDATE jobs SET state=?,detail=? WHERE id=?', (state, detail, job_id))

            def verify_runtime(_):
                if terminal_write_failure and not terminal_faults:
                    raise ValueError('INERT_RUNTIME_REJECTION')

            def write_json(path, value):
                if timing_failure and Path(path).parent.name == ids[0] and 'last_phase' in value and not faults:
                    faults.append(True)
                    raise OSError('INERT_DIAGNOSTIC_DISK_FAILURE')
                Path(path).write_text(json.dumps(value))

            def render(job_id, folder, cancelled, timeout):
                renders.append(job_id)

            original_mkdir = Path.mkdir
            def mkdir(path, *args, **kwargs):
                if mkdir_failure and Path(path) == jobs / ids[0] and not faults:
                    faults.append(True)
                    raise OSError('INERT_FOLDER_FAILURE')
                return original_mkdir(path, *args, **kwargs)

            api = {'WAKE': Wake(release), 'LOCK': threading.RLock(), 'database': database,
                   'RUNNING': set(), 'CANCEL': {}, 'threading': threading, 'JOBS': jobs,
                   'ROOT': root, 'SYSTEM': 'INERT', 'time': time, 'json': json,
                   'sqlite3': sqlite3, 'urllib': urllib, 'status': status, 'verify_runtime': verify_runtime,
                   'job_memory_gib': lambda _: 4, 'parse_scene': lambda *a: {},
                   'write_json': write_json, 'run_blender': render, 'BLENDER_TIME_LIMIT': 10,
                   'photo_input': SimpleNamespace(read_photos=lambda _: []),
                   'context_policy': SimpleNamespace(maintenance_active=lambda *_: False),
                   'studio_pricing': SimpleNamespace(maintenance_active=lambda *_: False),
                   'ADMISSIONS': SimpleNamespace(drain=lambda: None)}
            node = next(n for n in ast.parse(code).body if isinstance(n, ast.FunctionDef) and n.name == 'worker')
            exec(compile(ast.Module(body=[node], type_ignores=[]), 'actual-reviewed-worker.py', 'exec'), api)
            escaped = None
            try:
                with patch.object(Path, 'mkdir', mkdir):
                    api['worker']()
            except EndFixture:
                pass
            except Exception as error:
                escaped = type(error).__name__
            finally:
                release()
            with sqlite3.connect(database_path) as c:
                states = dict(c.execute('SELECT id,state FROM jobs'))
            return dict(ids=ids, states=states, renders=renders, running=api['RUNNING'],
                        cancellations=api['CANCEL'], escaped=escaped, faults=faults)

    def test_original_timing_failure_kills_queue_and_leaks_running_identity(self):
        old = self.execute(self.original, timing_failure=True)
        self.assertEqual(old['escaped'], 'OSError')
        self.assertEqual(old['renders'], old['ids'][:1])
        self.assertEqual(old['states'][old['ids'][1]], 'queued')
        self.assertEqual(old['running'], set(old['ids'][:1]))

    def test_final_timing_failure_preserves_next_job_and_never_repeats_previous(self):
        new = self.execute(self.candidate, count=3, timing_failure=True)
        self.assertIsNone(new['escaped'])
        self.assertEqual(new['renders'], new['ids'])
        self.assertEqual(set(new['states'].values()), {'succeeded'})
        self.assertFalse(new['running'])
        self.assertFalse(new['cancellations'])

    def test_ten_sequential_jobs_keep_queue_reusable(self):
        new = self.execute(self.candidate, count=10, timing_failure=True)
        self.assertEqual(new['renders'], new['ids'])
        self.assertFalse(new['running'])
        self.assertIsNone(new['escaped'])

    def test_sqlite_lock_does_not_kill_queue_or_leave_a_running_claim(self):
        new = self.execute(self.candidate, busy=True)
        self.assertIsNone(new['escaped'])
        self.assertEqual(new['renders'], new['ids'])
        self.assertFalse(new['running'])
        self.assertFalse(new['cancellations'])

    def test_unknown_commit_preserves_uncertain_row_without_execution_or_retry(self):
        new = self.execute(self.candidate, commit_ack_failure=True)
        self.assertIsNone(new['escaped'])
        self.assertEqual(new['states'][new['ids'][0]], 'generating')
        self.assertEqual(new['renders'], new['ids'][1:])
        self.assertFalse(new['running'])
        self.assertFalse(new['cancellations'])

    def test_folder_failure_cleans_flags_and_allows_the_next_model(self):
        new = self.execute(self.candidate, mkdir_failure=True)
        self.assertIsNone(new['escaped'])
        self.assertEqual(new['states'][new['ids'][0]], 'failed')
        self.assertEqual(new['renders'], new['ids'][1:])
        self.assertFalse(new['running'])

    def test_terminal_sqlite_failure_is_not_retried_and_next_job_is_processed(self):
        new = self.execute(self.candidate, terminal_write_failure=True)
        self.assertIsNone(new['escaped'])
        self.assertEqual(new['states'][new['ids'][0]], 'generating')
        self.assertEqual(new['renders'], new['ids'][1:])
        self.assertFalse(new['running'])
        self.assertFalse(new['cancellations'])


if __name__ == '__main__':
    unittest.main()
