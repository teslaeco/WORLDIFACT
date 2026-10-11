"""Run the exact observed Gateway handler with inert provider and spend fixtures.

Set WORLDIFACT_REVIEWED_RUNNER to the privately read, checksum-matching source.
No sockets, live model, ledger files, source mutations or service changes.
"""
import ast
import copy
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import require_tools


class ExecutionContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = os.environ.get('WORLDIFACT_REVIEWED_RUNNER')
        if not source:
            raise RuntimeError('WORLDIFACT_REVIEWED_RUNNER is required; do not count an absent runtime gate as passed.')
        cls.original = Path(source).read_bytes()
        cls.proposed = require_tools.transform(cls.original)
        cls.tree = ast.parse(cls.proposed)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.calls = []
        self.guard_calls = []
        self.terminal = False
        self.refuse_budget = False
        self.event = 'response.completed'
        self.outer = SimpleNamespace(
            folder=Path(self.temp.name), token='fixture-local-token', key='fixture-provider-key',
            construction=False, completion_request={'profile': 'standard'},
            completion_started=time.monotonic(), completed=False, requests=0, input=0,
            output=0, active=False, error=None, error_code=None, unknown_usage=False,
            execution_calls=[], cancelled=threading.Event(), lock=threading.Lock(),
            fast_limits={'fast': False, 'requests': 32, 'output': 96000, 'seconds': 1800},
            observe_execution=lambda _: None, execution_guidance=lambda: 'Complete the current model.',
            save=lambda: None,
        )
        def stop(code, message, *args):
            self.outer.error_code, self.outer.error = code, message
        self.outer.stop = stop
        class SpendError(Exception):
            code = 'fixture-budget-refusal'
        def protect(folder, payload, headers, **kwargs):
            self.guard_calls.append(copy.deepcopy(payload))
            if self.refuse_budget:
                raise SpendError()
            return 'fixture-reservation'
        self.policy = SimpleNamespace(protect=protect, SpendError=SpendError,
                                      settle_completed=lambda *_: True,
                                      safe_diagnostic=lambda *_: {'code': 'fixture-budget-refusal'})
        def open_response(request, **kwargs):
            self.calls.append(json.loads(request.data))
            value = {'type': self.event, 'response': {'usage': {'input_tokens': 50, 'output_tokens': 10}}}
            return io.BytesIO(b'data: ' + json.dumps(value).encode() + b'\n\n')
        self.opener = SimpleNamespace(open=open_response)
        self.namespace = {
            'outer': self.outer, 'hmac': hmac, 'json': json, 'time': time,
            'urllib': urllib, 'MODEL': 'gpt-6-astra',
            'LITE_HEADER': 'x-openai-internal-codex-responses-lite',
            'completed_outcome': lambda _: {'finished': True} if self.terminal else None,
            'current_candidate': lambda _: None,
            'completion_policy': SimpleNamespace(profile=lambda r: r.get('profile'), minimum_output=lambda *_: 2048),
            'fast_preview': SimpleNamespace(checked_candidate=lambda _: None),
            'fast_spend': self.policy, 'astra_spend_v2': self.policy,
            'openai_error': lambda status: 'fixture upstream error', 'safe_message': lambda v: v,
        }
        functions = [n for n in self.tree.body if getattr(n, 'name', None) in ('request_tools', 'tool_entries', 'NoRedirect')]
        gateway = next(n for n in self.tree.body if getattr(n, 'name', None) == 'Gateway')
        init = next(n for n in gateway.body if getattr(n, 'name', None) == '__init__')
        handler = next(n for n in init.body if isinstance(n, ast.ClassDef) and n.name == 'Handler')
        post = next(n for n in handler.body if getattr(n, 'name', None) == 'do_POST')
        exec(compile(ast.Module(body=functions + [post], type_ignores=[]), 'reviewed-handler.py', 'exec'), self.namespace)

    def send(self, value=None):
        payload = value if value is not None else {
            'model': 'gpt-6-astra', 'tool_choice': 'auto', 'tools': [],
            'input': [
                {'type': 'additional_tools', 'role': 'developer', 'tools': [
                    {'type': 'custom', 'name': 'exec', 'format': {'type': 'text'}}]},
                {'role': 'user', 'content': [{'type': 'input_text', 'text': 'Build the complete object.'},
                                           {'type': 'input_image', 'image_url': 'data:image/jpeg;base64,fixture'}]},
            ],
        }
        raw = json.dumps(payload).encode()
        handler = SimpleNamespace(path='/v1/responses', rfile=io.BytesIO(raw), wfile=io.BytesIO(),
            headers={'Content-Length': str(len(raw)), 'Authorization': 'Bearer fixture-local-token'},
            send_header=lambda *_: None, end_headers=lambda: None)
        self.status = None
        def response(code):
            self.status = code
        def reject(code, *args):
            self.status = code
        handler.send_response, handler.reject = response, reject
        with patch.object(urllib.request, 'build_opener', return_value=self.opener):
            self.namespace['do_POST'](handler)
        return payload

    def test_observed_runner_is_exact_and_transform_is_narrow(self):
        self.assertEqual(hashlib.sha256(self.original).hexdigest(), require_tools.SOURCE_SHA256)
        self.assertEqual(self.proposed.replace(require_tools.INSERT.encode(), b'', 1), self.original)
        for raw in (self.original + b'\n', self.proposed, b''):
            with self.assertRaises(ValueError):
                require_tools.transform(raw)

    def test_supervised_request_requires_tools_before_original_spend_guard(self):
        original = self.send()
        self.assertEqual(self.status, 200)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0]['tool_choice'], 'required')
        self.assertEqual(self.guard_calls[0]['tool_choice'], 'required')
        self.assertEqual(self.calls[0]['input'][:-1], original['input'])
        self.assertEqual(self.calls[0]['tools'], original['tools'])
        self.assertEqual(self.calls[0]['reasoning'], {'effort': 'low'})
        self.assertFalse(self.calls[0]['store'])
        self.assertFalse(self.outer.completed)  # API completion is not model completion.

    def test_ordinary_and_fast_requests_retain_original_choice(self):
        for fast, profile in [(False, None), (True, 'standard')]:
            with self.subTest(fast=fast):
                self.calls.clear()
                self.outer.fast_limits['fast'] = fast
                self.outer.completion_request = {'profile': profile}
                self.send()
                self.assertEqual(self.calls[0]['tool_choice'], 'auto')

    def test_completed_model_never_buys_another_turn(self):
        self.terminal = True
        self.send()
        self.assertTrue(self.outer.completed)
        self.assertEqual(self.status, 422)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.guard_calls, [])

    def test_cancellation_unknown_usage_and_request_ceiling_remain_terminal(self):
        for state in ('cancelled', 'unknown', 'ceiling'):
            with self.subTest(state=state):
                self.outer.error = self.outer.error_code = None
                self.outer.cancelled.clear()
                self.outer.unknown_usage = state == 'unknown'
                self.outer.requests = 32 if state == 'ceiling' else 0
                if state == 'cancelled': self.outer.cancelled.set()
                self.send()
                self.assertEqual(self.status, 422)
                self.assertEqual(self.calls, [])
                self.assertEqual(self.guard_calls, [])

    def test_cost_guard_refusal_has_zero_provider_calls(self):
        self.refuse_budget = True
        self.send()
        self.assertEqual(len(self.guard_calls), 1)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.outer.error_code, 'WORLDIFACT_ASTRA_COST_GUARD')
        self.assertFalse(self.outer.active)

    def test_provider_incomplete_is_not_retried(self):
        self.event = 'response.incomplete'
        self.send()
        self.assertEqual(self.outer.error_code, 'WORLDIFACT_RESPONSE_INCOMPLETE')
        self.send()
        self.assertEqual(len(self.calls), 1)

    def test_missing_exec_refuses_before_spending(self):
        self.send({'model': 'gpt-6-astra', 'tools': [], 'input': []})
        self.assertEqual(self.outer.error_code, 'CODEX_TOOLS_MISSING')
        self.assertEqual(self.calls, [])
        self.assertEqual(self.guard_calls, [])


if __name__ == '__main__':
    unittest.main()
