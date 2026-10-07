"""Compatibility-hook guards with the real immutable pricing/ledger functions.

These are unit fixtures, not a CLI/MCP/Blender or installed-runtime gate pass.
"""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch

import offline_legacy_standard as gate
import runtime_controller
import test_construction_spend_patch as spend_fixture



def enter_context(case, manager):
    """Match TestCase.enterContext cleanup semantics on supported Python 3.9."""
    value = manager.__enter__()
    case.addCleanup(manager.__exit__, None, None, None)
    return value


class LegacyHookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spend_source = spend_fixture.transform.changes(spend_fixture.lineage.installed_sources()['astra_spend_v2.py'])

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.legacy, self.raw = gate.load_legacy()
        self.spend = spend_fixture.load(self.spend_source)
        enter_context(self, patch.object(self.spend.legacy, 'LEDGER_ROOT', self.root / 'not-yet-redirected'))
        self.outcome = None
        self.original_calls = []
        def original(folder, prompt, instructions, key, cancelled, progress, binary=None):
            self.original_calls.append(folder)
            request = {'execution_id': 'synthetic-unit-execution', 'prompt': prompt, 'instructions': instructions}
            (folder / 'agent-request.json').write_text(json.dumps(request))
            self.outcome = {'finished': True, 'execution_id': request['execution_id'], 'accepted': False}
            return dict(self.outcome)
        self.runner = types.SimpleNamespace(run=original,
            completed_outcome=lambda folder: self.outcome,
            urllib=types.SimpleNamespace(request=types.SimpleNamespace(build_opener=Mock())))
        self.hook = gate.RunHook(self.legacy, self.root, self.runner, self.spend,
                                runtime_controller, gate.adapted_verifier(self.legacy, self.raw))
        self.folder = self.hook.create(self.root)
        fixture = object.__new__(self.legacy.Fixture)
        fixture.folder, fixture.runner = self.folder, self.runner
        self.runner.urllib.request.build_opener.return_value = fixture
        enter_context(self, patch.dict(sys.modules, {
            'studio_pricing': self.spend.studio_pricing,
            'completion_policy': types.SimpleNamespace(profile=lambda request: 'standard'),
            'fast_preview': types.SimpleNamespace(policy=lambda *args, **kwargs: {'fast': False})}))
        self.event = threading.Event()

    def activate(self):
        self.spend.legacy.LEDGER_ROOT = self.folder / 'fixture-ledgers'

    def call(self, **overrides):
        arguments = {'folder': self.folder, 'prompt': self.legacy.PROMPT,
            'instructions': self.legacy.INSTRUCTIONS, 'key': self.legacy.KEY,
            'cancelled': self.event, 'progress': lambda _: None,
            'binary': self.root / 'tools/codex/codex'}
        arguments.update(overrides)
        return self.hook.run(**arguments)

    def test_default_inert_until_original_fixture_ledger_redirect_is_active(self):
        with patch.object(self.spend.studio_pricing, 'bind', wraps=self.spend.studio_pricing.bind) as bind:
            with self.assertRaisesRegex(gate.Refused, 'EXACT_ACTIVE_LEGACY_FIXTURE_REQUIRED'):
                self.call()
            self.assertEqual(bind.call_count, 0)
        self.assertEqual(self.original_calls, [])
        self.assertFalse((self.folder / 'fixture-ledgers').exists())

    def test_real_immutable_tier_binding_selects_actual_legacy_eligibility(self):
        self.activate()
        self.assertTrue(runtime_controller.eligible(self.folder, self.legacy.INSTRUCTIONS))
        self.call()
        self.assertEqual(self.spend.studio_pricing.job_terms(self.folder), gate.TERMS)
        self.assertFalse(runtime_controller.eligible(self.folder, self.legacy.INSTRUCTIONS))
        self.assertEqual(self.original_calls, [self.folder])
        self.assertEqual(self.hook.phase, 'completed')
        self.assertEqual(self.hook.execution, 'synthetic-unit-execution')
        self.assertIsNone(self.hook.proof)  # A hook-only unit run is never a gate pass.
        with self.assertRaisesRegex(ValueError, 'immutable'):
            self.spend.studio_pricing.bind(self.folder,
                {'revision': 'studio-pricing-v1', 'tier': 'extended', 'points': 500, 'maxProviderCents': 400})
        with self.assertRaises(gate.Refused):
            self.call()
        self.assertEqual(self.original_calls, [self.folder])

    def test_foreign_folder_prompt_credentials_binary_or_missing_fixture_never_bind(self):
        self.activate()
        for override in ({'folder': self.root}, {'prompt': 'unrelated user job'}, {'key': 'not-the-fixture-key'},
                         {'instructions': 'different'}, {'binary': self.root / 'other-cli'}):
            with self.subTest(override=override):
                with self.assertRaises(gate.Refused):
                    self.call(**override)
        self.runner.urllib.request.build_opener.return_value = object()
        with self.assertRaises(gate.Refused):
            self.call()
        self.assertEqual(self.original_calls, [])
        self.assertIsNone(self.spend.studio_pricing.job_terms(self.folder))

    def test_cancelled_or_already_started_job_never_binds_new_terms(self):
        self.activate(); self.event.set()
        with self.assertRaises(gate.Refused):
            self.call()
        self.event.clear()
        (self.folder / 'agent-request.json').write_text('{}')
        with self.assertRaises(gate.Refused):
            self.call()
        self.assertIsNone(self.spend.studio_pricing.job_terms(self.folder))

    def test_existing_provider_hold_cannot_be_upgraded_by_the_fixture(self):
        self.activate()
        self.spend.reserve(self.folder, 0, 256, now=1)
        path = self.spend.studio_pricing.folder_root(self.folder) / self.spend.legacy.STATE
        before = path.read_bytes()
        with self.assertRaisesRegex(gate.Refused, 'FRESH_SYNTHETIC_LEDGER_REQUIRED'):
            self.call()
        self.assertEqual(path.read_bytes(), before)
        self.assertIsNone(self.spend.studio_pricing.job_terms(self.folder))

    def test_existing_terms_or_changed_execution_fail_closed(self):
        self.activate()
        self.spend.studio_pricing.bind(self.folder, gate.TERMS)
        with self.assertRaisesRegex(gate.Refused, 'FRESH_SYNTHETIC_TERMS_REQUIRED'):
            self.call()
        self.assertEqual(self.original_calls, [])
        self.setUp(); self.activate()
        original = self.hook.original_run
        def changed(*args, **kwargs):
            result = original(*args, **kwargs)
            self.outcome['execution_id'] = 'unrelated-execution'
            return result
        self.hook.original_run = changed
        with self.assertRaisesRegex(gate.Refused, 'ORIGINAL_FIXTURE_EXECUTION_CHANGED'):
            self.call()
        self.assertIsNone(self.hook.proof)

    def test_exact_old_gate_is_unchanged_and_only_two_verifier_pricing_assumptions_adapt(self):
        before = gate.regular(gate.legacy_path())
        self.assertEqual(hashlib.sha256(before).hexdigest(), gate.LEGACY_SHA256)
        source = before.decode()
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'verify_result')
        original = ast.get_source_segment(source, node)
        adapted = gate.verifier_source(before)
        reversed_source = adapted.replace(
            'ledger = spend.validate_state(record(ledger_path), 2000000, spend.studio_pricing.POLICY_REVISION)',
            'ledger = spend.validate_state(record(ledger_path))', 1).replace(gate.NEW_TERMS_CHECK, gate.OLD_TERMS_CHECK, 1)
        self.assertEqual(reversed_source, original)
        self.assertEqual(gate.regular(gate.legacy_path()), before)
        with self.assertRaisesRegex(gate.Refused, 'EXACT_LEGACY_GATE_REQUIRED'):
            gate.verifier_source(before + b'\n')

    def test_no_podman_no_success_marker_no_legacy_gate_receipt(self):
        stage = self.root / 'fresh-stage'; stage.mkdir()
        workspace = self.root / 'workspace'; workspace.mkdir()
        for name in ('codex_runner.py', 'blender_mcp.py', 'server.py', 'context_policy.py', 'install_codex.py', 'runtime_check.py'):
            (stage / name).write_bytes(b'# inert admission fixture, never imported\n')
        with tempfile.TemporaryDirectory() as empty_path:
            result = subprocess.run([sys.executable, str(Path(gate.__file__).resolve()), '--source', str(stage),
                '--workspace', str(workspace)], capture_output=True, text=True, timeout=10,
                env={'PATH': empty_path, 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 1)
        self.assertIn('PODMAN_REQUIRED_NO_NATIVE_FALLBACK', result.stdout)
        self.assertNotIn(gate.SUCCESS, result.stdout)
        self.assertFalse((workspace / gate.EVIDENCE).exists())
        self.assertFalse((stage / 'state').exists())


if __name__ == '__main__':
    unittest.main()
