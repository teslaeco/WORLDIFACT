"""Exact Oracle-source/HTTP-handler regressions; inert local fixtures, no AI calls."""
import ast
from contextlib import contextmanager
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(Path(__file__).resolve().parent), str(ROOT / 'tools/model_completion'), str(ROOT / 'tools/model_prebuild'),
                str(ROOT / 'tools/model_context'), str(ROOT / 'tools/profit_guard')]
import source_fixture
import source_patch
import reviewed_direct_export
import completion_policy
import prebuild_patch
import prebuild_policy
import context_patch
import tiers_patch as budget_patch
import studio_pricing
import terminal_budget

SOURCE = Path(os.environ.get('MODEL_COMPLETION_SOURCE', ROOT / '.model-completion-source/oracle_connector'))
JOB = '12345678-1234-1234-1234-123456789abc'
OTHER = 'abcdef12-abcd-abcd-abcd-abcdef123456'
NOW = 1791024000  # Fixed synthetic time within the reviewed pricing window.


def original_sources():
    original = source_fixture.installed_sources(SOURCE)
    original['server.py'] = reviewed_direct_export.patch_server(original['server.py'].decode()).encode()
    original.update(source_patch.changes({name: original[name] for name in source_patch.EXPECTED},
                                        Path(completion_policy.__file__).read_bytes()))
    return prebuild_patch.changes({name: original[name] for name in prebuild_patch.EXPECTED},
                                  Path(prebuild_policy.__file__).read_bytes())


def function_dump(source, name):
    return ast.dump(next(node for node in ast.parse(source).body
                         if isinstance(node, ast.FunctionDef) and node.name == name))


class EndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = original_sources()
        cls.changed = budget_patch.changes(cls.original, {name:(Path(__file__).resolve().parent/name).read_bytes() for name in ('studio_pricing.py','terminal_budget.py')})
        tree = ast.parse(cls.changed['server.py'])
        cls.handler_ast = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Handler')
        cls.uuid_ast = next(node for node in tree.body if isinstance(node, ast.Assign)
                            and any(isinstance(target, ast.Name) and target.id == 'UUID' for target in node.targets))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.jobs = self.root / 'jobs'
        self.jobs.mkdir()
        self.folder = self.jobs / JOB
        self.folder.mkdir()
        self.ledgers = self.root / 'ledgers'
        self.config = self.root / 'config.json'
        self.config.write_text(json.dumps({'token': 'inert-bearer-secret'}))
        self.dbpath = self.root / 'jobs.sqlite'
        with self.database() as db:
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY, state TEXT, prompt TEXT)')
            db.execute('INSERT INTO jobs VALUES(?,?,?)', (JOB, 'failed', 'private prompt must not leak'))
        self.spend = types.ModuleType('_budget_test_spend')
        self.spend.__file__ = str(self.root / 'astra_spend_v2.py')
        exec(compile(self.changed['astra_spend_v2.py'], 'astra_spend_v2.py', 'exec'), self.spend.__dict__)
        self.addCleanup(patch.stopall)
        patch.dict(sys.modules, {'astra_spend_v2': self.spend}).start()
        patch.object(terminal_budget.legacy, 'LEDGER_ROOT', self.ledgers).start()
        self.health = patch.object(terminal_budget, 'verified_health', return_value={
            'worldifactTerminalBudgetPolicy': terminal_budget.REVISION}).start()
        # The real route is executed, but no daemon, network client, model or
        # renderer is available. A regression reaching any paid path must fail.
        self.network = patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('network forbidden')).start()
        self.process = patch('subprocess.Popen', side_effect=AssertionError('process forbidden')).start()
        self.counter = patch.object(self.spend.legacy, 'count_tokens', side_effect=AssertionError('token count forbidden')).start()
        env = {'BaseHTTPRequestHandler': BaseHTTPRequestHandler, 'CONFIG': self.config, 'ROOT': self.root,
               'JOBS': self.jobs, 'LOCK': threading.RLock(), 'database': self.database,
               'terminal_budget': terminal_budget, 'studio_pricing': studio_pricing, 'json': json, 'hmac': hmac, 're': re,
               'time': time, 'threading': threading}
        exec(compile(ast.Module(body=[self.uuid_ast, self.handler_ast], type_ignores=[]), 'server.py', 'exec'), env)
        self.handler = env['Handler']

    @contextmanager
    def database(self):
        connection = sqlite3.connect(self.dbpath)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def request(self, job=JOB, authorization='Bearer inert-bearer-secret', write=False, suffix='budget'):
        handler = self.handler.__new__(self.handler)
        handler.path = '/v1/jobs/' + job + '/' + suffix
        handler.headers = {'Authorization': authorization} if authorization is not None else {}
        handler.wfile = io.BytesIO()
        sent = {'headers': {}}
        handler.send_response = lambda status: sent.update(status=status)
        handler.send_header = lambda key, value: sent['headers'].update({key: value})
        handler.end_headers = lambda: None
        (handler.do_POST if write else handler.do_GET)()
        sent['raw'] = handler.wfile.getvalue()
        sent['body'] = json.loads(sent['raw'])
        self.network.assert_not_called()
        self.process.assert_not_called()
        self.counter.assert_not_called()
        return sent

    def state(self, value):
        with self.database() as db:
            db.execute('UPDATE jobs SET state=? WHERE id=?', (value, JOB))

    def reserve(self, folder=None):
        return self.spend.reserve(folder or self.folder, 1000, 2048, now=NOW,
                                  ledger_root=self.ledgers, minimum_output=2048)

    def ledger_path(self, folder=None):
        key = hashlib.sha256(str((folder or self.folder).resolve()).encode()).hexdigest()
        return self.ledgers / key / self.spend.legacy.STATE

    def files(self):
        return {str(path.relative_to(self.root)): path.read_bytes() for path in self.root.rglob('*') if path.is_file()}

    def completed(self, token, response_id='resp_local_completed'):
        return self.spend.settle_completed(self.folder, token, {
            'id': response_id, 'model': 'gpt-6-astra', 'status': 'completed', 'service_tier': 'default',
            'usage': {'input_tokens': 1000, 'output_tokens': 500, 'total_tokens': 1500}}, ledger_root=self.ledgers)

    def test_authentication_precedes_job_lookup_and_all_financial_access(self):
        before = self.files()
        with patch.object(terminal_budget, 'seal_terminal', side_effect=AssertionError('seal before authentication')):
            for authorization in (None, '', 'Bearer wrong', 'Basic inert-bearer-secret'):
                for job in (JOB, OTHER):
                    with self.subTest(authorization=authorization, job=job):
                        self.assertEqual(self.request(job, authorization)['status'], 401)
        self.health.assert_not_called()
        self.assertEqual(self.files(), before)

    def test_nonterminal_database_states_never_seal_or_infer_zero_cost(self):
        self.reserve()
        for state in ('queued', 'running', 'building', 'rendering', 'finishing', 'unknown'):
            self.state(state)
            before = self.files()
            with patch.object(terminal_budget, 'seal_terminal', side_effect=AssertionError('nonterminal seal')):
                result = self.request()
            self.assertEqual((result['status'], result['body']), (409, {'code': 'TERMINAL_BUDGET_NOT_FINAL'}))
            self.assertEqual(self.files(), before)

    def test_unknown_or_malformed_uuid_never_accesses_another_jobs_budget(self):
        self.reserve()
        before = self.files()
        with patch.object(terminal_budget, 'seal_terminal', side_effect=AssertionError('unknown job seal')):
            for job in (OTHER, JOB.upper(), '../' + JOB, 'x' * 36, JOB + '?other=' + OTHER):
                with self.subTest(job=job):
                    self.assertEqual(self.request(job)['status'], 404)
        self.assertEqual(self.files(), before)

    def test_only_get_allowed_and_unverified_runtime_refused(self):
        self.reserve()
        before = self.files()
        self.assertEqual(self.request(write=True)['status'], 405)
        self.health.return_value = {}
        self.assertEqual(self.request()['status'], 503)
        self.assertEqual(self.files(), before)

    def test_missing_ledger_or_lock_is_unavailable_and_never_created(self):
        before = self.files()
        self.assertEqual(self.request()['status'], 503)
        self.assertEqual(self.files(), before)
        self.reserve()
        ledger = self.ledger_path()
        ledger_bytes = ledger.read_bytes()
        ledger.unlink()
        before = self.files()
        self.assertEqual(self.request()['status'], 503)
        self.assertEqual(self.files(), before)
        ledger.write_bytes(ledger_bytes)
        (ledger.parent / '.worldifact-astra-spend.lock').unlink()
        before = self.files()
        self.assertEqual(self.request()['status'], 503)
        self.assertEqual(self.files(), before)

    def test_maintenance_fence_prevents_terminal_sealing(self):
        self.reserve()
        (self.root / studio_pricing.MAINTENANCE).write_text('{"synthetic":true}')
        before = self.files()
        with patch.object(terminal_budget, 'seal_terminal', side_effect=AssertionError('seal during maintenance')):
            result = self.request()
        self.assertEqual(result['status'], 503)
        self.assertEqual(result['body']['code'], 'RUNTIME_MAINTENANCE')
        self.assertEqual(self.files(), before)

    def test_all_terminal_states_return_only_bound_liability_and_no_private_data(self):
        self.assertEqual((self.spend.CEILING_MICRO_USD, self.spend.MAX_INPUT, self.spend.MAX_OUTPUT,
                          self.spend.INPUT_RATE, self.spend.CACHED_INPUT_RATE, self.spend.OUTPUT_RATE),
                         (1750000, 65536, 16000, 14, 2, 55))
        first, output = self.reserve()
        self.assertEqual(output, 2048)
        self.assertTrue(self.completed(first))
        self.reserve()
        expected = 1000 * 14 + 500 * 55 + 3048 * 14 + 2048 * 55
        original_ledger = self.ledger_path().read_bytes()
        receipts = []
        for state in ('succeeded', 'failed', 'cancelled'):
            self.state(state)
            result = self.request()
            self.assertEqual(result['status'], 200)
            receipt = result['body']
            self.assertEqual(set(receipt), terminal_budget.FIELDS)
            self.assertEqual(receipt['jobId'], JOB)
            self.assertEqual(receipt['maximumLiabilityMicroUsd'], expected)
            self.assertIs(receipt['sealed'], True)
            self.assertEqual(receipt['capMicroUsd'], 1750000)
            self.assertRegex(receipt['sealId'], r'^[a-f0-9]{64}$')
            self.assertEqual(result['headers']['Cache-Control'], 'no-store')
            self.assertEqual(result['headers']['X-Content-Type-Options'], 'nosniff')
            self.assertEqual(int(result['headers']['Content-Length']), len(result['raw']))
            self.assertLess(len(result['raw']), 1024)
            for sentinel in ('private prompt', 'inert-bearer-secret', str(self.root), 'resp_local_completed'):
                self.assertNotIn(sentinel, result['raw'].decode())
            receipts.append(receipt)
        self.assertEqual(receipts, [receipts[0]] * 3)
        self.assertEqual(self.ledger_path().read_bytes(), original_ledger)

    def test_sealing_preserves_legacy_liability_and_never_reopens_future_reserves(self):
        self.reserve()
        path = self.ledger_path()
        value = json.loads(path.read_text())
        value['legacyHeld'] = 12345
        path.write_text(json.dumps(value))
        result = self.request()
        self.assertEqual(result['status'], 200)
        # Migrated legacy entries lack the original per-call count/evidence;
        # positive legacy liability cannot support releasing account funding.
        self.assertEqual(result['body']['maximumLiabilityMicroUsd'], 1750000)
        before = self.files()
        for _ in range(3):
            with self.assertRaises(self.spend.SpendError) as error:
                self.reserve()
            self.assertEqual(self.spend.safe_diagnostic(error.exception), {'reason': 'JOB_SEALED', 'stage': 'admission'})
        self.assertEqual(self.files(), before)

    def test_missing_request_hold_evidence_never_becomes_a_zero_receipt(self):
        self.reserve()
        ledger = self.ledger_path()
        value = json.loads(ledger.read_text())
        value['holds'] = {}
        ledger.write_text(json.dumps(value))
        before = self.files()
        result = self.request()
        self.assertEqual((result['status'], result['body']), (503, {'code': 'TERMINAL_BUDGET_UNAVAILABLE'}))
        self.assertEqual(self.files(), before)

    def test_zero_liability_requires_a_recorded_authenticated_completed_request(self):
        token, _ = self.reserve()
        self.assertTrue(self.spend.settle_completed(self.folder, token, {
            'id': 'resp_synthetic_zero', 'model': 'gpt-6-astra', 'status': 'completed',
            'usage': {'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 0}}, ledger_root=self.ledgers))
        result = self.request()
        self.assertEqual(result['status'], 200)
        self.assertEqual(result['body']['maximumLiabilityMicroUsd'], 0)
        self.assertEqual(result['body']['jobId'], JOB)
        with self.assertRaises(self.spend.SpendError):
            self.reserve()

    def test_late_authenticated_settlement_cannot_change_the_existing_receipt(self):
        token, _ = self.reserve()
        result = self.request()
        self.assertEqual(result['status'], 200)
        self.assertTrue(self.completed(token))
        self.assertLess(self.spend.used(json.loads(self.ledger_path().read_text())), result['body']['maximumLiabilityMicroUsd'])
        again = self.request()
        self.assertEqual(again['body'], result['body'])
        with self.assertRaises(self.spend.SpendError):
            self.reserve()

    def test_cross_job_seal_or_corruption_stays_unavailable_and_cannot_reopen(self):
        self.reserve()
        first = self.request()
        other_folder = self.jobs / OTHER
        other_folder.mkdir()
        self.reserve(other_folder)
        with self.database() as db:
            db.execute('INSERT INTO jobs VALUES(?,?,?)', (OTHER, 'failed', 'other private prompt'))
        first_seal = self.ledger_path().parent / terminal_budget.SEAL
        other_seal = self.ledger_path(other_folder).parent / terminal_budget.SEAL
        other_seal.write_bytes(first_seal.read_bytes())
        self.assertEqual(self.request(OTHER)['status'], 503)
        first_seal.write_text('{"private":"must not leak"}')
        result = self.request()
        self.assertEqual((result['status'], result['body']), (503, {'code': 'TERMINAL_BUDGET_UNAVAILABLE'}))
        with self.assertRaises(self.spend.SpendError):
            self.reserve()
        self.assertEqual(first['body']['jobId'], JOB)

    def test_authenticated_terminal_route_returns_exact_bound_new_cap(self):
        terms={'revision':studio_pricing.REVISION, **studio_pricing.TIERS[1]}
        studio_pricing.bind(self.folder,terms)
        self.reserve()
        result=self.request()
        self.assertEqual(result['status'],200)
        self.assertEqual(result['body']['capMicroUsd'],4000000)
        self.assertEqual(result['body']['policyRevision'],'astra-low-tiered-v1')
        self.assertEqual(set(result['body']),terminal_budget.FIELDS)
        with self.assertRaises(self.spend.SpendError):self.reserve()


if __name__ == '__main__':
    unittest.main()
