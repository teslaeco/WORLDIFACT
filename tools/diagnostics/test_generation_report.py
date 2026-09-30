import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import generation_report as report

JOB = '11111111-2222-3333-4444-555555555555'
SECRET = 'sk-proj-PRIVATE_CANARY_NOT_FOR_REPORT'


class GenerationReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'froge-connector'
        self.folder = self.root / 'state/jobs' / JOB
        self.folder.mkdir(parents=True)

    def write(self, name, value):
        (self.folder / name).write_text(json.dumps(value))

    def test_missing_evidence_is_unknown_not_zero_spend_or_success(self):
        item = report.inspect(self.root)['jobs'][0]
        self.assertIsNone(item['recordedInputTokens'])
        self.assertEqual(item['budget']['status'], 'UNAVAILABLE')
        self.assertEqual(item['artifacts']['model.glb']['status'], 'MISSING')

    def test_private_prompts_images_tokens_and_errors_are_not_emitted(self):
        self.write('agent-usage.json', {'error_code': SECRET, 'last_error': SECRET,
            'requests': 2, 'input_tokens': 500, 'output_tokens': 100, 'completed': False})
        self.write('reference-photos.json', [{'name': SECRET, 'dataUrl': SECRET}])
        self.write('agent-tools.json', {'calls': [{'tool': SECRET, 'error': SECRET}, {'tool': 'build_model', 'prompt': SECRET}]})
        result = report.inspect(self.root)
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(result['jobs'][0]['referenceCount'], 1)
        self.assertEqual(result['jobs'][0]['toolCalls'], {'OTHER': 1, 'build_model': 1})

    def test_generic_guard_does_not_claim_actual_exhaustion(self):
        self.write('agent-usage.json', {'error_code': 'WORLDIFACT_ASTRA_COST_GUARD', 'requests': 1,
            'input_tokens': 0, 'output_tokens': 0, 'unknown_usage': False})
        item = report.inspect(self.root)['jobs'][0]
        self.assertEqual(item['guardSubreason'], 'NOT_RECORDED_BY_INSTALLED_GENERIC_GUARD')
        self.assertEqual(item['budget']['status'], 'UNAVAILABLE')

    def test_recorded_budget_uses_the_original_job_path_without_writes(self):
        digest = hashlib.sha256(str(self.folder.resolve()).encode()).hexdigest()
        ledger = self.root / 'state/worldifact-astra-budgets' / digest
        ledger.mkdir(parents=True)
        path = ledger / '.worldifact-astra-spend.json'
        path.write_text(json.dumps({'revision': 'astra-usd175-v1', 'reserved': 1200000, 'requests': 2}))
        before = path.read_bytes()
        item = report.inspect(self.root)['jobs'][0]['budget']
        self.assertEqual(item['heldMicroUsd'], 1200000)
        self.assertEqual(item['remainingMicroUsd'], 550000)
        self.assertEqual(before, path.read_bytes())
        self.assertEqual(list(ledger.iterdir()), [path])

    def test_completed_and_uncertain_holds_are_not_reported_as_invoice_costs(self):
        state = {'revision': 'astra-low-reconciled-v2', 'legacyHeld': 0, 'requests': 2,
            'holds': {'a' * 32: {'input': 3000, 'output': 1000, 'held': 14000, 'response': 'resp_test'},
                      'b' * 32: {'input': 3000, 'output': 1000, 'held': 97000}}}
        value = report.budget_summary(state)
        self.assertEqual(value['heldMicroUsd'], 111000)
        self.assertEqual(value['completedSettlements'], 1)
        self.assertEqual(value['status'], 'RECORDED_CONSERVATIVE_HOLD_NOT_INVOICE')
        self.assertNotIn('resp_test', json.dumps(value))

    def test_corrupt_and_unknown_ledgers_stay_unknown(self):
        for state in [{'revision': 'new', 'requests': 1},
                      {'revision': 'astra-usd175-v1', 'requests': True, 'reserved': 0},
                      {'revision': 'astra-usd175-v1', 'requests': 1, 'reserved': report.CAP + 1},
                      {'revision': 'astra-low-reconciled-v2', 'legacyHeld': 0, 'requests': 1,
                       'holds': {'a' * 32: {'input': 3000, 'output': 1000, 'held': 0}}}]:
            self.assertEqual(report.budget_summary(state)['status'], 'UNAVAILABLE')

    def test_existing_file_does_not_prove_valid_geometry(self):
        (self.folder / 'model.glb').write_bytes(b'not a valid GLB')
        item = report.inspect(self.root)['jobs'][0]['artifacts']['model.glb']
        self.assertEqual(item, {'status': 'PRESENT_UNVALIDATED', 'bytes': 15})

    def test_symlinks_are_never_followed(self):
        secret = self.root / 'private.json'
        secret.write_text(json.dumps({'error_code': SECRET}))
        (self.folder / 'agent-usage.json').symlink_to(secret)
        (self.folder / 'model.glb').symlink_to(secret)
        value = report.inspect(self.root)['jobs'][0]
        self.assertEqual(value['errorCode'], 'UNKNOWN')
        self.assertEqual(value['artifacts']['model.glb']['status'], 'UNAVAILABLE')
        self.assertNotIn(SECRET, json.dumps(value))

    def test_oversized_or_malformed_files_cannot_leak(self):
        (self.folder / 'agent-usage.json').write_text(SECRET * 20000)
        self.assertEqual(report.inspect(self.root)['jobs'][0]['errorCode'], 'UNKNOWN')

    def test_inspection_never_invokes_a_process_or_provider(self):
        before = sorted(str(p) for p in self.root.rglob('*'))
        with patch.object(report.subprocess, 'run', side_effect=AssertionError('Unexpected command')):
            value = report.inspect(self.root)
        self.assertFalse(value['paidGenerationRequested'])
        self.assertFalse(value['creditLedgerChecked'])
        self.assertEqual(before, sorted(str(p) for p in self.root.rglob('*')))

    def test_cloud_lookup_requires_exactly_one_vm(self):
        for raw in ['[]', '["one", "two"]', '{"token":"secret"}', '[123]']:
            with self.assertRaises(ValueError):
                report.one_json(raw)


if __name__ == '__main__':
    unittest.main()
