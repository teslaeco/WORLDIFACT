"""Refusal/adapter tests. These are never full CLI, Blender or quality evidence."""
import hashlib
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('legacy_usd175_experiment', HERE / 'offline_legacy_usd175_experiment.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
REPOSITORY = Path(os.environ.get('LEGACY_USD175_TEST_REPOSITORY', str(fixture.REPOSITORY)))


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.gate, self.raw = fixture.load_gate(REPOSITORY)

    def test_original_gate_is_exact_and_mutations_refuse(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), fixture.GATE_SHA)
        with self.assertRaisesRegex(ValueError, 'EXACT_ORIGINAL_GATE_REQUIRED'):
            fixture.adapted_fixture(self.gate, self.raw + b'\n')

    def test_exact_real_edit_precedes_current_revision_images_and_honest_finish(self):
        scripts = fixture.edit_programs(self.gate.programs, 'fixture_nonce')
        self.assertEqual(len(scripts), 4)
        self.assertNotIn('edit_model', scripts[0])
        self.assertLess(scripts[1].index('build_model'), scripts[1].index('edit_model'))
        self.assertEqual(scripts[1].count('edit_model'), 1)
        self.assertNotIn('inspect_render', scripts[1])
        self.assertIn(json.dumps(fixture.EDIT), scripts[1])
        self.assertEqual(scripts[2].count('expected_revision:2'), 2)
        self.assertNotIn('expected_revision:1', scripts[2])
        self.assertIn('image(b)', scripts[2])
        self.assertIn('accepted:false', scripts[3])
        self.assertIn('expected_revision:2', scripts[3])

    def test_verifier_keeps_original_budget_and_exact_tool_sequence(self):
        cls, verify = fixture.adapted_fixture(self.gate, self.raw)
        self.assertTrue(issubclass(cls, self.gate.Fixture))
        names = verify.__code__.co_names
        self.assertIn('CEILING_MICRO_USD', names)
        self.assertIn('validate_state', names)
        self.assertIn('used', names)
        self.assertIn(1750000, verify.__code__.co_consts)
        self.assertIn(6900, verify.__code__.co_consts)
        sequences = [value for value in verify.__code__.co_consts if isinstance(value, tuple)]
        self.assertIn(('get_modeling_contract', 'build_model', 'edit_model', 'inspect_render',
            'inspect_render', 'inspect_render', 'get_current_model', 'finish_model'), sequences)

    def test_unknown_script_anchor_cannot_expand_adapter_scope(self):
        def changed(nonce):
            values = self.gate.programs(nonce)
            values[1] = values[1].replace("store('build_snapshot',b);", '')
            return values
        with self.assertRaisesRegex(ValueError, 'EXACT_ADAPTER_ANCHOR_REQUIRED'):
            fixture.edit_programs(changed, 'fixture')

    def test_route_override_is_inert_for_unrelated_jobs_and_inactive_target(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runner = types.SimpleNamespace(run=lambda *a, **k: None)
            runtime = types.SimpleNamespace(eligible=lambda folder, instructions: True)
            hook = fixture.RunHook(self.gate, root, runner, runtime, None, None, None, root)
            hook.folder = root / 'captured'
            self.assertTrue(hook.eligible(root / 'foreign', self.gate.INSTRUCTIONS))
            self.assertTrue(hook.eligible(hook.folder, 'foreign instructions'))
            with self.assertRaisesRegex(ValueError, 'EXACT_ACTIVE_JOB_REQUIRED'):
                hook.eligible(hook.folder, self.gate.INSTRUCTIONS)
            hook.active = True
            self.assertFalse(hook.eligible(hook.folder, self.gate.INSTRUCTIONS))

    def test_wrong_target_or_repeated_run_never_enters_original_runner(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / 'captured'
            folder.mkdir()
            calls = []
            runtime = types.SimpleNamespace(eligible=lambda *args: True)
            def original(folder, *args, **kwargs):
                calls.append(folder)
                self.assertFalse(runtime.eligible(folder, self.gate.INSTRUCTIONS))
                (folder / 'agent-request.json').write_text('{}')
                return {'synthetic': True}
            runner = types.SimpleNamespace(run=original)
            class ProviderFixture:
                pass
            provider = ProviderFixture()
            provider.folder, provider.runner = folder, runner
            runner.urllib = types.SimpleNamespace(request=types.SimpleNamespace(
                build_opener=types.SimpleNamespace(return_value=provider)))
            @contextmanager
            def ledger(_folder):
                yield root / 'absent-ledger.json', {'requests': 0}
            spend = types.SimpleNamespace(legacy=types.SimpleNamespace(LEDGER_ROOT=folder / 'fixture-ledgers'),
                ledger=ledger, used=lambda _: 0, terminal_budget=types.SimpleNamespace(sealed=lambda _: False),
                studio_pricing=types.SimpleNamespace(job_terms=lambda _: None))
            hook = fixture.RunHook(self.gate, root, runner, runtime, spend, ProviderFixture, None, root)
            hook.folder = folder
            arguments = {'folder': folder, 'prompt': self.gate.PROMPT, 'instructions': self.gate.INSTRUCTIONS,
                'key': self.gate.KEY, 'cancelled': threading.Event(), 'progress': lambda _: None,
                'binary': root / 'tools/codex/codex'}
            for changed in ({'folder': root / 'foreign'}, {'instructions': 'foreign'}, {'key': 'foreign'}):
                with self.assertRaisesRegex(ValueError, 'EXACT_ACTIVE_FIXTURE_REQUIRED'):
                    hook.run(**{**arguments, **changed})
            self.assertEqual(calls, [])
            hook.run(**arguments)
            self.assertEqual(calls, [folder])
            self.assertTrue(runtime.eligible(folder, self.gate.INSTRUCTIONS))
            with self.assertRaisesRegex(ValueError, 'EXACT_ACTIVE_FIXTURE_REQUIRED'):
                hook.run(**arguments)
            self.assertEqual(calls, [folder])

    def test_snapshot_adaptation_requires_exact_original_revision_anchor(self):
        source = fixture.function_source(self.raw, 'compact_snapshot', 'Fixture')
        self.assertEqual(source.count("value.get('revision') != 1"), 1)
        with self.assertRaisesRegex(ValueError, 'EXACT_ADAPTER_ANCHOR_REQUIRED'):
            fixture.adapted(self.gate, self.raw, 'compact_snapshot',
                [("value.get('revision') != 7", "value.get('revision') != 2")], 'Fixture')


@unittest.skipUnless(os.environ.get('LEGACY_USD175_TEST_STAGE'), 'Exact prepared runtime stage required for accounting tests')
class CurrentAccountingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.environ['LEGACY_USD175_TEST_STAGE'])
        import astra_spend_v2
        cls.spend = astra_spend_v2

    def test_original_ceiling_uncertain_hold_and_existing_terms_stay_fail_closed(self):
        spend = self.spend
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / '00000000-0000-4000-8000-000000000001'
            folder.mkdir()
            with patch.object(spend.legacy, 'LEDGER_ROOT', root / 'ledger'):
                self.assertEqual(spend.CEILING_MICRO_USD, 1750000)
                token, allowance = spend.reserve(folder, 11250, 16000, minimum_output=2048)
                self.assertEqual(allowance, 16000)
                with spend.ledger(folder) as (path, state):
                    self.assertEqual(spend.used(state), 1066172)
                self.assertFalse(spend.settle_completed(folder, token, {'status': 'incomplete'}))
                with self.assertRaisesRegex(ValueError, 'Existing provider evidence cannot acquire new terms'):
                    spend.studio_pricing.bind(folder, {'revision': 'studio-pricing-v1',
                        'tier': 'standard', 'points': 250, 'maxProviderCents': 200})
                spend.reserve(folder, 11250, 16000, minimum_output=2048)
                before = path.read_bytes()
                with self.assertRaises(spend.SpendError) as refused:
                    spend.reserve(folder, 11250, 16000, minimum_output=2048)
                self.assertEqual(refused.exception.reason, 'INSUFFICIENT_RESERVATION')
                self.assertEqual(path.read_bytes(), before)
                with spend.ledger(folder) as (_, state):
                    self.assertLessEqual(spend.used(state), 1750000)
                    self.assertEqual(state['requests'], 2)
                    self.assertTrue(all('response' not in hold for hold in state['holds'].values()))


if __name__ == '__main__':
    unittest.main()
