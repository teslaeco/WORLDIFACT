"""Execute exact patched server branches against private synthetic state."""
import ast
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

from test_context import before_sources
import context_patch
import context_policy
import completion_policy
import prebuild_policy


class MarkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = context_patch.changes(before_sources(), Path(context_policy.__file__).read_bytes())['server.py']
        cls.module = ast.parse(cls.source)
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.marker = self.root / context_policy.MAINTENANCE
        self.config = self.root / 'fixture-config.json'; self.config.write_text('{"token":"inert"}')
        self.path = self.root / 'fixture.sqlite'
        self.db = sqlite3.connect(self.path); self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE jobs(id TEXT,state TEXT,detail TEXT)')
        self.db.execute("INSERT INTO jobs VALUES ('synthetic','queued','original')"); self.db.commit()
    def test_unknown_marker_and_link_are_fail_closed(self):
        self.assertFalse(context_policy.maintenance_active(self.root))
        self.marker.write_bytes(b'invalid marker still closes admission')
        self.assertTrue(context_policy.maintenance_active(self.root))
        self.marker.unlink(); self.marker.symlink_to(self.root / 'absent')
        self.assertTrue(context_policy.maintenance_active(self.root))
    def test_all_non_health_routes_are_blocked_before_dispatch(self):
        self.marker.write_bytes(b'held')
        handler = next(n for n in self.module.body if isinstance(n, ast.ClassDef) and n.name == 'Handler')
        ns = {'BaseHTTPRequestHandler': object, 'CONFIG': self.config, 'ROOT': self.root,
              'json': json, 'context_policy': context_policy, 'health': lambda: {'read_only_fixture': True},
              'capability': lambda value: value}
        exec(compile(ast.Module(body=[handler], type_ignores=[]), 'exact-marker-handler', 'exec'), ns)
        for path, write in (('/v1/jobs', True), ('/v1/pair', True), ('/v1/ai', True),
                            ('/v1/jobs/synthetic/exports/prepare', True), ('/v1/jobs/synthetic/model', False), ('/unrecognized', False)):
            instance = ns['Handler'](); instance.path = path
            instance.input = lambda: self.fail('body read during maintenance')
            instance.send_json = lambda value, status_code=200: (value, status_code)
            result = instance.handle_request(write)
            self.assertEqual((result[1], result[0]['code']), (503, 'RUNTIME_MAINTENANCE'))
        instance = ns['Handler'](); instance.path = '/v1/health'
        instance.authorized = lambda value: value == 'inert'
        instance.send_json = lambda value, status_code=200: (value, status_code)
        with patch.object(context_policy, 'verified_health', return_value={}):
            # Legacy health route also appends unchanged optional export labels;
            # only verify this is the permitted authenticated read route.
            self.assertEqual(instance.handle_request(False)[1], 200)
        instance.authorized = lambda _: False
        self.assertEqual(instance.handle_request(False)[1], 401)
    def test_worker_cannot_consume_queued_rows_while_marker_exists(self):
        self.marker.write_bytes(b'held')
        worker = next(n for n in self.module.body if isinstance(n, ast.FunctionDef) and n.name == 'worker')
        @contextmanager
        def database():
            with self.db: yield self.db
        ns = {'WAKE': types.SimpleNamespace(wait=unittest.mock.Mock(side_effect=[None, StopIteration]), clear=lambda: None),
              'LOCK': threading.RLock(), 'database': database, 'ROOT': self.root, 'context_policy': context_policy}
        exec(compile(ast.Module(body=[worker], type_ignores=[]), 'exact-marker-worker', 'exec'), ns)
        with self.assertRaises(StopIteration): ns['worker']()
        self.assertEqual(self.db.execute('SELECT state,detail FROM jobs').fetchone(), ('queued', 'original'))
    def test_startup_does_not_reconcile_rows_during_maintenance(self):
        conditional = next(n for n in ast.walk(self.module) if isinstance(n, ast.If)
            and isinstance(n.test, ast.UnaryOp) and isinstance(n.test.operand, ast.Call)
            and isinstance(n.test.operand.func, ast.Attribute) and n.test.operand.func.attr == 'maintenance_active')
        executable = compile(ast.Module(body=[conditional], type_ignores=[]), 'exact-startup-reconciliation', 'exec')
        ns = {'context_policy': context_policy, 'ROOT': self.root, 'db': self.db}
        self.marker.write_bytes(b'held'); exec(executable, ns)
        self.assertEqual(self.db.execute('SELECT state,detail FROM jobs').fetchone(), ('queued', 'original'))
        self.marker.unlink(); exec(executable, ns)
        self.assertEqual(self.db.execute('SELECT state FROM jobs').fetchone()[0], 'failed')
    def test_health_is_not_ready_during_maintenance_or_without_context_proof(self):
        function = next(n for n in self.module.body if isinstance(n, ast.FunctionDef) and n.name == 'health')
        ns = {'_text_health': lambda: {'ready': True, 'provider': 'openai'}, 'context_policy': context_policy,
              'CODEX_UNAVAILABLE': 'inert', 'total_ai_limit': lambda _: 100}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'exact-context-health', 'exec'), ns)
        limits = types.SimpleNamespace(MAX_SECONDS=1, MAX_REQUESTS=1, MAX_OUTPUT_TOKENS=1, MAX_BUILDS=1)
        with patch.dict('sys.modules', {'codex_runner': types.SimpleNamespace(executable=lambda: 'inert'), 'agent_limits': limits}), \
             patch.object(completion_policy, 'verified_health', return_value={}), \
             patch.object(prebuild_policy, 'verified_health', return_value={}):
            for proof, held, ready in ((True, True, False), (True, False, True), (False, False, False)):
                with patch.object(context_policy, 'verified_health', return_value={'worldifactStandardContextPolicy':context_policy.REVISION} if proof else {}), \
                     patch.object(context_policy, 'maintenance_active', return_value=held):
                    value = ns['health']()
                    self.assertIs(value['ready'], ready)
                    self.assertIs(value['worldifactStandardMaintenance'], held)


if __name__ == '__main__': unittest.main()
