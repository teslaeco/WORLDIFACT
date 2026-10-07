"""Exact Gateway handler + original ledger tests with all network replaced.

Neither a socket nor a provider connection is opened. The original Handler is
called with in-memory HTTP streams; only its HTTPS opener and token counter are
fixtures. These tests establish orchestration/accounting, never LIVE AI quality.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler
import io
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'tools/model_context_upgrade'))
import construction_spend_patch
import gateway_patch as transform
import test_upgrade_transaction as lineage

JOB = '00000000-0000-4000-8000-000000000042'
EXECUTION = 'fixture-execution'
CONTEXT = 'a' * 64
ADMISSION = 'b' * 64


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_policy(raw):
    module = types.ModuleType('gateway_spend_fixture')
    exec(compile(raw, 'gateway-spend-fixture.py', 'exec'), module.__dict__)
    return module



def enter_context(case, manager):
    """Match TestCase.enterContext cleanup semantics on supported Python 3.9."""
    value = manager.__enter__()
    case.addCleanup(manager.__exit__, None, None, None)
    return value


class InMemoryServer:
    def __init__(self, address, handler):
        self.address, self.handler = address, handler
    def serve_forever(self):
        raise AssertionError('No HTTP sockets in these tests')


def gateway_module(raw, policy, fast=False):
    """Execute unmodified Gateway AST, including the original nested Handler."""
    module = types.ModuleType('gateway_handler_fixture')
    module.__dict__.update({
        'hmac': hmac, 'hashlib': hashlib, 'BaseHTTPRequestHandler': BaseHTTPRequestHandler,
        'ThreadingHTTPServer': InMemoryServer, 'json': json, 'Path': Path,
        'secrets': secrets, 're': re, 'threading': threading, 'time': time,
        'urllib': urllib, 'MODEL': 'gpt-6-astra', 'LITE_HEADER': 'x-openai-internal-codex-responses-lite',
        'MAX_REQUESTS': 32, 'MAX_OUTPUT_TOKENS': 96000, 'MAX_SECONDS': 900, 'MAX_BUILDS': 5,
        'astra_spend_v2': policy, 'completed_outcome': lambda _: None,
        'current_candidate': lambda _: None,
        'write': lambda path, value: path.write_text(json.dumps(value)),
        'openai_error': lambda status: 'Fixture provider HTTP error ' + str(status),
        'completion_policy': lineage.installer.completion_policy,
        'context_policy': types.SimpleNamespace(active=lambda *_: False),
        'prebuild_policy': types.SimpleNamespace(active=lambda *_: False),
        'fast_spend': types.SimpleNamespace(protect=lambda *_: None, SpendError=ValueError),
        'fast_preview': types.SimpleNamespace(
            policy=lambda *_: {'fast': fast, 'requests': 6 if fast else 32,
                              'output': 32000 if fast else 96000, 'seconds': 900},
            checked_candidate=lambda _: None),
    })
    names = {'request_tools', 'tool_entries', 'safe_message', 'NoRedirect', 'code_errors', 'Gateway'}
    nodes = [node for node in ast.parse(raw).body if getattr(node, 'name', None) in names]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'exact-gateway-handler.py', 'exec'), module.__dict__)
    return module


class Response:
    def __init__(self, lines):
        self.lines = lines
    def __enter__(self):
        return self
    def __exit__(self, *_):
        pass
    def __iter__(self):
        return iter(self.lines)


def event(value, kind='response.completed'):
    return b'data: ' + canonical({'type': kind, 'response': value}).encode() + b'\n'


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        supplied = os.environ.get('MODEL_CONTEXT_INSTALLED')
        sources = ({name: (Path(supplied) / name).read_bytes()
                    for name in ('codex_runner.py', 'astra_spend_v2.py')}
                   if supplied else lineage.installed_sources())
        cls.original = sources['codex_runner.py']
        cls.changed = transform.changes(cls.original)
        cls.spend_source = construction_spend_patch.changes(sources['astra_spend_v2.py'])

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.folder = self.root / JOB
        self.folder.mkdir()
        self.request = {'prompt': 'Synthetic complete object',
            'instructions': 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:',
            'construction_mode': 'worldifact-standard-construction-v1',
            'execution_id': EXECUTION, 'completion_started': time.monotonic()}
        self.save_request()
        self.policy = load_policy(self.spend_source)
        enter_context(self, patch.object(self.policy.legacy, 'LEDGER_ROOT', self.root / 'ledger'))
        enter_context(self, patch.object(self.policy.time, 'time', return_value=1))
        enter_context(self, patch('socket.socket', side_effect=AssertionError('Network forbidden')))
        enter_context(self, patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('Network forbidden')))
        self.module = gateway_module(self.changed, self.policy)
        self.gateway = self.module.Gateway('synthetic-provider-key', self.folder, threading.Event(), construction=True)
        self.counted = []
        self.count = 4096
        self.counter = enter_context(self, patch.object(self.policy.legacy, 'count_tokens', side_effect=self.count_tokens))
        self.response = {'id': 'resp_fixture1', 'object': 'response', 'model': 'gpt-6-astra',
            'status': 'completed', 'service_tier': 'default',
            'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': '{"scene":"fixture"}'}]}],
            'usage': {'input_tokens': 900, 'output_tokens': 300, 'total_tokens': 1200,
                      'input_tokens_details': {'cached_tokens': 100, 'cache_write_tokens': 0}}}
        self.lines = [event(self.response)]
        self.sent = []
        self.timeouts = []
        self.opener = enter_context(self, patch('urllib.request.build_opener', return_value=types.SimpleNamespace(open=self.open)))

    def save_request(self):
        (self.folder / 'agent-request.json').write_text(json.dumps(self.request))

    def count_tokens(self, payload, headers):
        self.counted.append((json.loads(json.dumps(payload)), dict(headers)))
        return self.count

    def open(self, request, timeout):
        self.sent.append(request)
        self.timeouts.append(timeout)
        self.assertGreater(timeout, 0)
        self.assertLessEqual(timeout, 900)
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/responses')
        return Response(self.lines)

    def payload(self, **overrides):
        value = {'model': 'gpt-6-astra', 'input': [{'role': 'user', 'content': 'Exact full brief'}],
            'max_output_tokens': 1024, 'reasoning': {'effort': 'low'}, 'tools': [],
            'store': False, 'stream': True, 'service_tier': 'default', 'truncation': 'disabled'}
        value.update(overrides)
        # Deliberately non-canonical bytes prove that forwarding keeps EXACT bytes.
        return json.dumps(value, indent=2, ensure_ascii=False).encode()

    def prepare(self, raw=None, **overrides):
        raw = self.payload() if raw is None else raw
        args = {'payload_bytes': raw, 'execution_id': EXECUTION, 'phase': 'construction',
            'context_sha256': CONTEXT, 'admission_sha256': ADMISSION, 'max_input_tokens': 4096,
            'protected_remaining_micro_usd': 500000, 'protected_remaining_requests': 2,
            'expires_at': time.monotonic() + 30}
        args.update(overrides)
        return self.gateway.prepare_construction(**args)

    def post(self, raw=None, permit=None, token=None, gateway=None, extra_headers=None):
        gateway = gateway or self.gateway
        raw = self.payload() if raw is None else raw
        handler = object.__new__(gateway.server.handler)
        handler.path = '/v1/responses'
        handler.headers = Message()
        for name, value in {'Authorization': 'Bearer ' + (gateway.token if token is None else token),
                            'Content-Length': str(len(raw)), **(extra_headers or {})}.items():
            handler.headers[name] = value
        if permit is not None:
            handler.headers['X-Worldifact-Construction-Permit'] = permit
        handler.rfile, handler.wfile = io.BytesIO(raw), io.BytesIO()
        status = []
        handler.send_response = lambda value: status.append(value)
        handler.send_header = lambda *_: None
        handler.end_headers = lambda: None
        handler.do_POST()
        return status[-1], handler.wfile.getvalue()

    def ledger(self):
        path = self.policy.studio_pricing.folder_root(self.folder) / self.policy.legacy.STATE
        return json.loads(path.read_bytes()) if path.exists() else None

    def test_source_is_pinned_and_run_cli_other_gateway_methods_are_unchanged(self):
        self.assertEqual(digest(self.original), transform.EXPECTED)
        with self.assertRaises(ValueError):
            transform.changes(self.original + b'\n')
        before, after = ast.parse(self.original), ast.parse(self.changed)
        self.assertEqual([ast.dump(n) for n in before.body if getattr(n, 'name', None) != 'Gateway'],
                         [ast.dump(n) for n in after.body if getattr(n, 'name', None) != 'Gateway'])
        old_gateway = next(n for n in before.body if getattr(n, 'name', None) == 'Gateway')
        new_methods = {n.name: ast.dump(n) for n in next(n for n in after.body if getattr(n, 'name', None) == 'Gateway').body}
        for method in old_gateway.body:
            if method.name != '__init__':
                self.assertEqual(ast.dump(method), new_methods[method.name], method.name)

    def test_exact_request_one_reservation_original_settlement_and_private_receipt(self):
        raw = self.payload()
        permit = self.prepare(raw)
        self.assertEqual(permit['payload_sha256'], digest(raw))
        self.assertIsNone(self.gateway.construction_receipt(permit['permit_id']))
        with patch.object(self.policy, 'protect', wraps=self.policy.protect) as protect, \
             patch.object(self.policy, 'settle_completed', wraps=self.policy.settle_completed) as settle:
            status, body = self.post(raw, permit['permit_id'], extra_headers={self.module.LITE_HEADER: 'true'})
        self.assertEqual(status, 200)
        self.assertIn(b'resp_fixture1', body)
        self.assertEqual(len(self.sent), 1)
        self.assertLessEqual(self.timeouts[0], 30)
        self.assertEqual(self.sent[0].data, raw)
        self.assertEqual(self.sent[0].get_header('Authorization'), 'Bearer synthetic-provider-key')
        self.assertNotIn(permit['permit_id'].encode(), self.sent[0].data)
        self.assertEqual(set(k.lower() for k in self.sent[0].headers), {'authorization', 'content-type'})
        self.assertEqual(self.counted[0][0], json.loads(raw))
        self.assertEqual(protect.call_count, 1)
        self.assertEqual(protect.call_args.kwargs['minimum_output'], 1024)
        self.assertEqual(protect.call_args.kwargs['protected_remaining_micro_usd'], 500000)
        self.assertEqual(protect.call_args.kwargs['protected_remaining_requests'], 2)
        self.assertEqual(settle.call_count, 1)
        self.assertEqual((self.gateway.requests, self.gateway.input, self.gateway.output), (1, 900, 300))
        self.assertFalse(self.gateway.active)
        state = self.ledger()
        self.assertEqual(state['requests'], 1)
        hold = next(iter(state['holds'].values()))
        self.assertEqual(hold['output'], 1024)
        self.assertEqual(hold['input'], 6144)
        self.assertEqual(hold['response'], 'resp_fixture1')
        self.assertEqual(hold['held'], 800 * 14 + 100 * 2 + 300 * 55)
        receipt = self.gateway.construction_receipt(permit['permit_id'])
        self.assertEqual(receipt, {'permit_id': permit['permit_id'], 'execution_id': EXECUTION,
            'phase': 'construction', 'sequence': 1, 'context_sha256': CONTEXT,
            'payload_sha256': digest(raw), 'admission_sha256': ADMISSION,
            'response_id': 'resp_fixture1', 'response_sha256': digest(canonical(self.response).encode()),
            'model': 'gpt-6-astra', 'status': 'completed', 'usage_known': True, 'usage': self.response['usage']})
        receipt['usage']['input_tokens'] = 0
        self.assertEqual(self.gateway.construction_receipt(permit['permit_id'])['usage']['input_tokens'], 900)

    def test_missing_wrong_auth_unknown_changed_and_replayed_permits_never_count(self):
        raw = self.payload()
        permit = self.prepare(raw)['permit_id']
        self.assertEqual(self.post(raw, permit, token='wrong')[0], 403)
        self.assertEqual(self.post(raw)[0], 422)
        self.assertEqual(self.post(raw, 'unknown')[0], 422)
        self.assertEqual(self.post(raw + b' ', permit)[0], 422)
        self.assertEqual(self.gateway.requests, 0)
        self.assertIsNone(self.ledger())
        self.assertEqual(self.sent, [])
        self.assertEqual(self.post(raw, permit)[0], 200)
        snapshot = canonical(self.ledger())
        self.assertEqual(self.post(raw, permit)[0], 422)
        self.assertEqual(self.gateway.requests, 1)
        self.assertEqual(canonical(self.ledger()), snapshot)
        self.assertEqual(len(self.sent), 1)

    def test_pending_expired_and_cancelled_permits_are_not_replaceable(self):
        permit = self.prepare()['permit_id']
        with self.assertRaises(ValueError):
            self.prepare()
        with patch.object(self.module.time, 'monotonic', return_value=time.monotonic() + 31):
            self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertEqual(self.gateway.requests, 0)
        (self.folder / 'agent-cancelled').write_text('cancelled')
        self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertEqual(self.gateway.requests, 0)
        self.assertIsNone(self.ledger())
        self.assertEqual(self.sent, [])
        with self.assertRaises(ValueError):
            self.prepare()

    def test_concurrent_requests_consume_only_once_and_cannot_prepare_while_active(self):
        entered, released = threading.Event(), threading.Event()
        permit = self.prepare()['permit_id']
        def blocked_open(request, timeout):
            self.sent.append(request)
            entered.set()
            self.assertTrue(released.wait(5))
            return Response(self.lines)
        with patch('urllib.request.build_opener', return_value=types.SimpleNamespace(open=blocked_open)):
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(self.post, permit=permit)
                try:
                    self.assertTrue(entered.wait(5))
                    self.assertEqual(self.post(permit=permit)[0], 409)
                    with self.assertRaises(ValueError):
                        self.prepare()
                    self.assertEqual(self.gateway.requests, 1)
                finally:
                    released.set()
                self.assertEqual(first.result(timeout=5)[0], 200)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.ledger()['requests'], 1)

    def test_count_over_reviewed_bound_fails_before_reservation_without_truncating(self):
        self.count = 4097
        permit = self.prepare()['permit_id']
        self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertEqual(self.counted[0][0], json.loads(self.payload()))
        self.assertIsNone(self.ledger())
        self.assertEqual(self.sent, [])
        self.assertEqual(self.gateway.requests, 1)
        self.assertFalse(self.gateway.active)
        self.assertIsNone(self.gateway.construction_receipt(permit))
        with self.assertRaises(ValueError):
            self.prepare()

    def test_full_output_future_money_and_request_slots_are_original_atomic_policy(self):
        raw = self.payload(max_output_tokens=16000)
        permit = self.prepare(raw, protected_remaining_micro_usd=1000000)['permit_id']
        self.assertEqual(self.post(raw, permit)[0], 422)
        self.assertEqual(self.sent, [])
        self.assertIsNone(self.ledger())
        self.assertEqual(self.gateway.cost_guard['reason'], 'INSUFFICIENT_RESERVATION')
        self.assertEqual(self.gateway.cost_guard['minimum_output'], 16000)
        self.assertIsNone(self.gateway.construction_receipt(permit))

    def test_unsettled_completed_event_never_produces_receipt_or_allows_retry(self):
        permit = self.prepare()['permit_id']
        self.response['usage']['total_tokens'] += 1
        self.lines = [event(self.response)]
        self.assertEqual(self.post(permit=permit)[0], 200)
        self.assertTrue(self.gateway.unknown_usage)
        self.assertEqual(self.gateway.error_code, 'WORLDIFACT_CONSTRUCTION_UNSETTLED')
        self.assertIsNone(self.gateway.construction_receipt(permit))
        hold = next(iter(self.ledger()['holds'].values()))
        self.assertNotIn('response', hold)
        self.assertEqual(hold['held'], 6144 * 14 + 1024 * 55)
        with self.assertRaises(ValueError):
            self.prepare()

    def test_incomplete_failed_unknown_and_cancelled_streams_keep_full_hold_and_stop(self):
        for kind in ('response.incomplete', 'response.failed', 'no-terminal', 'cancelled'):
            with self.subTest(kind=kind):
                self.gateway = self.module.Gateway('synthetic-provider-key', self.folder, threading.Event(), construction=True)
                permit = self.prepare()['permit_id']
                value = {**self.response, 'status': kind.removeprefix('response.')}
                self.lines = [event(value, kind)] if kind != 'no-terminal' else [b': keepalive\n']
                if kind == 'cancelled':
                    def stream():
                        self.gateway.cancelled.set()
                        yield event(self.response)
                    self.lines = stream()
                self.assertEqual(self.post(permit=permit)[0], 200)
                self.assertIsNone(self.gateway.construction_receipt(permit))
                self.assertTrue(self.gateway.error or self.gateway.unknown_usage or self.gateway.cancelled.is_set())
                self.assertFalse(self.gateway.active)
                with self.assertRaises(ValueError):
                    self.prepare()
        self.assertEqual(self.ledger()['requests'], 4)
        for hold in self.ledger()['holds'].values():
            self.assertNotIn('response', hold)
            self.assertEqual(hold['held'], 6144 * 14 + 1024 * 55)

    def test_exact_phase_execution_hash_capacity_and_payload_contract_are_required(self):
        for overrides in ({'phase': 'discovery'}, {'phase': 'finalization'}, {'phase': 'unknown'},
                {'execution_id': 'other'}, {'context_sha256': 'unknown'}, {'admission_sha256': 'unknown'},
                {'max_input_tokens': True}, {'protected_remaining_micro_usd': None},
                {'protected_remaining_requests': None}, {'expires_at': float('nan')},
                {'expires_at': float('inf')}, {'expires_at': time.monotonic() - 1}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.prepare(**overrides)
        for overrides in ({'tools': [{'type': 'web_search'}]}, {'tools': [{'type': 'function', 'name': 'x'}]},
                {'input': [{'type': 'additional_tools', 'tools': []}]}, {'reasoning': {'effort': 'high'}},
                {'stream': False}, {'store': True}, {'service_tier': 'priority'}, {'truncation': 'auto'},
                {'max_output_tokens': True}, {'max_output_tokens': 16001}, {'background': True},
                {'previous_response_id': 'resp_old'}, {'metadata': {'unreviewed': 'field'}}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.prepare(self.payload(**overrides))
        with self.assertRaises(ValueError):
            self.prepare(self.payload().replace(b'"tools": []', b'"tools": [], "tools": []'))
        self.assertIsNone(self.ledger())
        self.assertEqual(self.gateway.requests, 0)

    def test_original_total_limits_still_apply_without_shrinking_output(self):
        self.gateway.requests = 30
        with self.assertRaises(ValueError):
            self.prepare(protected_remaining_requests=2)
        self.gateway.requests = 0
        self.gateway.output = 96000 - 1023
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertIsNone(self.ledger())
        self.assertEqual(self.sent, [])

    def test_cancellation_during_count_never_reserves_or_sends(self):
        permit = self.prepare()['permit_id']
        def count_then_cancel(*_):
            self.gateway.cancelled.set()
            return 4096
        with patch.object(self.policy.legacy, 'count_tokens', side_effect=count_then_cancel):
            self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertIsNone(self.ledger())
        self.assertEqual(self.sent, [])

    def test_default_gateway_retains_cli_exec_requirement_and_fast_is_excluded(self):
        ordinary = self.module.Gateway('fixture-key', self.folder, threading.Event())
        self.assertFalse(ordinary.construction)
        self.assertEqual(self.post(gateway=ordinary)[0], 422)
        self.assertEqual(ordinary.error_code, 'CODEX_TOOLS_MISSING')
        self.assertEqual(ordinary.requests, 0)
        with self.assertRaises(ValueError):
            ordinary.prepare_construction(self.payload(), EXECUTION, 'construction', CONTEXT,
                                          ADMISSION, 4096, 0, 0, time.monotonic() + 30)
        fast = gateway_module(self.changed, self.policy, fast=True)
        with self.assertRaises(ValueError):
            fast.Gateway('fixture-key', self.folder, threading.Event(), construction=True)
        self.request.pop('construction_mode')
        self.save_request()
        with self.assertRaises(ValueError):
            self.module.Gateway('fixture-key', self.folder, threading.Event(), construction=True)
        self.assertEqual(self.sent, [])

    def test_successive_permits_bind_response_identity_phase_and_sequence(self):
        first = self.prepare()['permit_id']
        self.assertEqual(self.post(permit=first)[0], 200)
        second = self.prepare(phase='inspection', protected_remaining_micro_usd=100000,
                              protected_remaining_requests=1)['permit_id']
        self.response['id'] = 'resp_fixture2'
        self.lines = [event(self.response)]
        self.assertEqual(self.post(permit=second)[0], 200)
        receipt = self.gateway.construction_receipt(second)
        self.assertEqual(receipt['sequence'], 2)
        self.assertEqual(receipt['phase'], 'inspection')
        self.assertEqual(receipt['response_id'], 'resp_fixture2')
        self.assertEqual(self.ledger()['requests'], 2)
        self.assertEqual(len(self.ledger()['holds']), 2)

    def test_stream_expiry_never_settles_late_completed_usage(self):
        now = time.monotonic()
        permit = self.prepare(expires_at=now + 2)['permit_id']
        def late_stream():
            yield b': before expiry\n'
            with patch.object(self.module.time, 'monotonic', return_value=now + 3):
                yield event(self.response)
        self.lines = late_stream()
        with patch.object(self.policy, 'settle_completed', wraps=self.policy.settle_completed) as settle:
            self.assertEqual(self.post(permit=permit)[0], 200)
        self.assertEqual(settle.call_count, 0)
        self.assertEqual(self.gateway.error_code, 'WORLDIFACT_CONSTRUCTION_EXPIRED')
        self.assertTrue(self.gateway.unknown_usage)
        self.assertIsNone(self.gateway.construction_receipt(permit))
        hold = next(iter(self.ledger()['holds'].values()))
        self.assertEqual(hold['held'], 6144 * 14 + 1024 * 55)
        self.assertNotIn('response', hold)
        self.assertLessEqual(self.timeouts[0], 2)
        with self.assertRaises(ValueError):
            self.prepare()

    def test_reused_authenticated_response_id_cannot_settle_a_second_reservation(self):
        first = self.prepare()['permit_id']
        self.assertEqual(self.post(permit=first)[0], 200)
        second = self.prepare(phase='inspection')['permit_id']
        self.assertEqual(self.post(permit=second)[0], 200)
        self.assertIsNone(self.gateway.construction_receipt(second))
        self.assertTrue(self.gateway.unknown_usage)
        holds = self.ledger()['holds'].values()
        self.assertEqual(sum('response' in hold for hold in holds), 1)
        self.assertEqual(sum('response' not in hold for hold in holds), 1)
        with self.assertRaises(ValueError):
            self.prepare()

    def test_ambiguous_or_nonfinite_stream_json_never_settles_or_issues_receipt(self):
        cases = (
            b'data: {"type":"response.completed","type":"response.completed","response":' + canonical(self.response).encode() + b'}\n',
            event(self.response).replace(b'"input_tokens":900', b'"input_tokens":900,"input_tokens":900'),
            event({**self.response, 'metadata': {'x': 'placeholder'}}).replace(b'"placeholder"', b'NaN'),
            event({**self.response, 'metadata': {'x': 'placeholder'}}).replace(b'"placeholder"', b'1e9999'),
            b'data: []\n', b'data: {"type":"response.completed","response":null}\n')
        for bad in cases:
            with self.subTest(event=bad[:100]):
                self.gateway = self.module.Gateway('synthetic-provider-key', self.folder, threading.Event(), construction=True)
                permit = self.prepare()['permit_id']
                self.lines = [bad, event(self.response)]
                with patch.object(self.policy, 'settle_completed', wraps=self.policy.settle_completed) as settle:
                    self.assertEqual(self.post(permit=permit)[0], 200)
                self.assertEqual(settle.call_count, 0)
                self.assertTrue(self.gateway.unknown_usage)
                self.assertEqual(self.gateway.error_code, 'WORLDIFACT_CONSTRUCTION_INVALID_STREAM')
                self.assertIsNone(self.gateway.construction_receipt(permit))
                with self.assertRaises(ValueError):
                    self.prepare()
        self.assertEqual(self.ledger()['requests'], len(cases))
        for hold in self.ledger()['holds'].values():
            self.assertNotIn('response', hold)

    def test_counter_or_protect_mutation_cannot_change_reviewed_provider_payload(self):
        permit = self.prepare()['permit_id']
        def count_then_mutate(payload, _):
            payload['input'].append({'role': 'user', 'content': 'Unreviewed added context'})
            return 4096
        with patch.object(self.policy.legacy, 'count_tokens', side_effect=count_then_mutate):
            self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertEqual(self.sent, [])
        hold = next(iter(self.ledger()['holds'].values()))
        self.assertEqual(hold['held'], 6144 * 14 + 1024 * 55)
        self.assertNotIn('response', hold)
        self.assertIsNone(self.gateway.construction_receipt(permit))
        with self.assertRaises(ValueError):
            self.prepare()

    def test_provider_http_error_retains_reservation_and_never_retries(self):
        permit = self.prepare()['permit_id']
        error = urllib.error.HTTPError('https://api.openai.com/v1/responses', 429, 'fixture',
            {'Retry-After': '5'}, io.BytesIO(b'{"error":{"code":"insufficient_quota"}}'))
        with patch('urllib.request.build_opener', return_value=types.SimpleNamespace(
                open=lambda *_args, **_kwargs: (_ for _ in ()).throw(error))):
            self.assertEqual(self.post(permit=permit)[0], 422)
        self.assertEqual(self.gateway.upstream_status, 429)
        self.assertEqual(self.gateway.error_code, 'insufficient_quota')
        self.assertIsNone(self.gateway.construction_receipt(permit))
        self.assertEqual(self.ledger()['requests'], 1)
        self.assertNotIn('response', next(iter(self.ledger()['holds'].values())))
        with self.assertRaises(ValueError):
            self.prepare()

    def test_legacy_standard_and_fast_success_match_original_handler(self):
        raw = self.payload(tools=[{'type': 'custom', 'name': 'exec'}],
                           reasoning={'effort': 'high'}, max_output_tokens=1024)
        for fast in (False, True):
            results = []
            for index, source in enumerate((self.original, self.changed)):
                with self.subTest(fast=fast, changed=bool(index)):
                    folder = self.root / ('00000000-0000-4000-8000-%012d' % (100 + int(fast) * 10 + index))
                    folder.mkdir()
                    (folder / 'agent-request.json').write_text(json.dumps(self.request))
                    module = gateway_module(source, self.policy, fast=fast)
                    gateway = module.Gateway('synthetic-provider-key', folder, threading.Event())
                    status, _ = self.post(raw, gateway=gateway,
                        extra_headers={module.LITE_HEADER: 'true'})
                    self.assertEqual(status, 200)
                    sent = self.sent[-1]
                    forwarded = json.loads(sent.data)
                    self.assertEqual(forwarded['max_output_tokens'], 8192 if fast else 16000)
                    self.assertEqual(forwarded['reasoning']['effort'], 'low')
                    self.assertEqual(len(forwarded['input']), 2)
                    self.assertEqual(sent.get_header(module.LITE_HEADER.capitalize()), 'true')
                    self.assertEqual(self.timeouts[-1], 900)
                    results.append((forwarded, gateway.requests, gateway.output, gateway.input,
                                    gateway.unknown_usage, gateway.error_code))
            self.assertEqual(results[0], results[1])


if __name__ == '__main__':
    unittest.main()
