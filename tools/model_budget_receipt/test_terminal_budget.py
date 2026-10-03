"""Real flock, actual patched reserve/settlement, no network/model requests."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'tools/profit_guard'), str(ROOT / 'tools/model_completion'),
               str(ROOT / 'tools/model_prebuild')]
import astra_spend as legacy
import source_patch
import prebuild_patch
import budget_patch
import terminal_budget as terminal

JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def policy_module():
    raw = (ROOT / 'tools/profit_guard/astra_spend_v2.py').read_text()
    raw = prebuild_patch.patch_spend(source_patch.patch_spend(raw))
    assert hashlib.sha256(raw.encode()).hexdigest() == budget_patch.EXPECTED['astra_spend_v2.py']
    module = types.ModuleType('astra_spend_v2')
    exec(compile(budget_patch.patch_spend(raw), 'installed_astra_spend_v2.py', 'exec'), module.__dict__)
    return module


class TerminalBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.job = self.root / 'jobs' / JOB; self.job.mkdir(parents=True)
        self.ledgers = self.root / 'budgets'
        self.policy = policy_module()
        self.mapping = patch.dict(sys.modules, {'astra_spend_v2': self.policy})
        self.mapping.start(); self.addCleanup(self.mapping.stop)

    def reserve(self, **extra):
        return self.policy.reserve(self.job, 1000, 2048, ledger_root=self.ledgers, now=1, **extra)

    def state_path(self):
        return self.ledgers / hashlib.sha256(str(self.job).encode()).hexdigest() / legacy.STATE

    def seal(self):
        return terminal.seal_terminal(self.job, JOB, self.ledgers)

    def completed(self, token):
        return self.policy.settle_completed(self.job, token, {
            'id': 'resp_fixture', 'model': 'gpt-6-astra', 'status': 'completed',
            'usage': {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200}}, self.ledgers)

    def test_unknown_hold_preserved_and_late_settlement_cannot_change_receipt_or_reopen(self):
        token, _ = self.reserve()
        state_before = self.state_path().read_bytes()
        receipt = self.seal()
        self.assertEqual(receipt['maximumLiabilityMicroUsd'], (1000 + 2048) * 14 + 2048 * 55)
        self.assertEqual(set(receipt), terminal.FIELDS)
        self.assertEqual(receipt['policyRevision'], 'astra-low-reconciled-v2')
        self.assertEqual(self.state_path().read_bytes(), state_before)
        self.assertTrue(self.completed(token))
        self.assertLess(self.policy.used(self.policy.validate_state(json.loads(self.state_path().read_text()))), receipt['maximumLiabilityMicroUsd'])
        self.assertEqual(self.seal(), receipt)
        with self.assertRaises(self.policy.SpendError) as error: self.reserve()
        self.assertEqual(error.exception.reason, 'JOB_SEALED')
        self.assertEqual(self.seal(), receipt)

    def test_completed_upper_cost_and_unknown_reservation_all_count(self):
        first, _ = self.reserve(); self.assertTrue(self.completed(first)); self.reserve()
        self.assertEqual(self.seal()['maximumLiabilityMicroUsd'], 6900 + (3048 * 14 + 2048 * 55))

    def test_migrated_legacy_reservation_keeps_full_cap_when_original_request_count_is_unknown(self):
        first, _ = self.reserve(); self.assertTrue(self.completed(first)); self.reserve()
        state = json.loads(self.state_path().read_text()); state['legacyHeld'] = 200000
        self.state_path().write_text(json.dumps(state))
        self.assertEqual(self.seal()['maximumLiabilityMicroUsd'], 1750000)

    def test_legacy_whole_job_reservation_is_not_reclaimed_or_migrated(self):
        self.reserve()
        old = {'revision': legacy.REVISION, 'reserved': 1750000, 'requests': 2}
        self.state_path().write_text(json.dumps(old)); before = self.state_path().read_bytes()
        self.assertEqual(self.seal()['maximumLiabilityMicroUsd'], 1750000)
        self.assertEqual(self.state_path().read_bytes(), before)

    def test_missing_evidence_never_creates_zero_ledger_or_lock(self):
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        self.assertFalse(self.ledgers.exists())
        self.reserve(); self.state_path().unlink()
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        self.assertFalse(self.state_path().exists())
        self.assertFalse((self.state_path().parent / terminal.SEAL).exists())

    def test_semantically_missing_request_holds_never_produce_zero_or_partial_refund(self):
        self.reserve()
        for requests in (0, 1, 2):
            self.state_path().write_text(json.dumps({'revision': self.policy.REVISION,
                'legacyHeld': 0, 'requests': requests, 'holds': {}}))
            with self.assertRaises(terminal.BudgetUnavailable): self.seal()
            self.assertFalse((self.state_path().parent / terminal.SEAL).exists())

    def test_authenticated_completed_zero_usage_is_distinct_from_missing_evidence(self):
        token, _ = self.reserve()
        self.assertTrue(self.policy.settle_completed(self.job, token, {
            'id': 'resp_zero', 'model': 'gpt-6-astra', 'status': 'completed',
            'usage': {'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 0}}, self.ledgers))
        self.assertEqual(self.seal()['maximumLiabilityMicroUsd'], 0)

    def test_corrupt_or_linked_evidence_and_wrong_job_binding_refuse(self):
        self.reserve(); before = self.state_path().read_bytes()
        for value in ({}, {'revision': legacy.REVISION, 'reserved': True, 'requests': 1}):
            self.state_path().write_text(json.dumps(value))
            with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        self.state_path().write_bytes(before)
        with self.assertRaises(terminal.BudgetUnavailable): terminal.seal_terminal(self.job, OTHER, self.ledgers)
        self.state_path().unlink(); self.state_path().symlink_to(self.root / 'missing')
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()

    def test_existing_unreadable_seal_still_permanently_fences_reserve(self):
        self.reserve(); marker = self.state_path().parent / terminal.SEAL
        marker.write_text('{}')
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        with self.assertRaises(self.policy.SpendError): self.reserve()
        marker.unlink(); marker.symlink_to(self.root / 'missing')
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_same_lock_covers_racing_reserve_and_seal_in_either_order(self):
        self.reserve()
        barrier = threading.Barrier(3)
        def reserve():
            barrier.wait()
            try: self.reserve(); return True
            except self.policy.SpendError: return False
        def seal(): barrier.wait(); return self.seal()
        with ThreadPoolExecutor(max_workers=2) as executor:
            allocation = executor.submit(reserve); receipt = executor.submit(seal); barrier.wait()
            allocated, result = allocation.result(), receipt.result()
        hold = 3048 * 14 + 2048 * 55
        self.assertEqual(result['maximumLiabilityMicroUsd'], hold * (2 if allocated else 1))
        self.assertEqual(self.seal(), result)
        with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_parallel_replays_return_one_byte_identical_seal(self):
        self.reserve()
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: self.seal(), range(24)))
        self.assertTrue(all(result == results[0] for result in results))
        marker = self.state_path().parent / terminal.SEAL
        raw = marker.read_bytes(); self.assertEqual(self.seal(), results[0]); self.assertEqual(raw, marker.read_bytes())
        self.assertEqual(os.stat(marker).st_mode & 0o777, 0o600)

    def test_tampered_or_cross_job_seal_never_returns_a_refund_receipt(self):
        self.reserve(); self.seal(); marker = self.state_path().parent / terminal.SEAL
        original = json.loads(marker.read_text())
        for key, value in [('maximumLiabilityMicroUsd', 0), ('jobId', OTHER), ('sealed', False)]:
            altered = json.loads(json.dumps(original)); altered['receipt'][key] = value
            marker.write_text(json.dumps(altered))
            with self.assertRaises(terminal.BudgetUnavailable): self.seal()
            with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_actual_python_receipt_passes_worker_typescript_protocol_without_translation(self):
        self.reserve(); receipt = self.seal()
        values = [receipt, {**receipt, 'jobId': OTHER}, {**receipt, 'maximumLiabilityMicroUsd': -1},
                  {**receipt, 'maximumLiabilityMicroUsd': 1750001}, {**receipt, 'sealed': False},
                  {**receipt, 'policyRevision': legacy.REVISION}, {**receipt, 'extra': 1}]
        script = '''import { readFileSync } from 'node:fs';
const { validateTerminalBudgetReceipt } = await import(process.argv[1]);
const values = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(values.map(value => validateTerminalBudgetReceipt(value, process.argv[2]))));'''
        result = subprocess.run(['node', '--input-type=module', '-e', script,
            (ROOT / 'server/studioBudgetReceipt.ts').as_uri(), JOB], input=json.dumps(values),
            text=True, capture_output=True, check=True, timeout=15)
        self.assertEqual(json.loads(result.stdout), [True, False, False, False, False, False, False])


if __name__ == '__main__': unittest.main()
