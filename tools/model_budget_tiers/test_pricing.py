"""Actual tier ledger, settlement, seal and flock tests; no provider requests."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import subprocess
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(HERE), str(ROOT / 'tools/profit_guard'), str(ROOT / 'tools/model_completion'), str(ROOT / 'tools/model_prebuild')]
import astra_spend as legacy
import studio_pricing as pricing
import terminal_budget as terminal
import tiers_patch
import source_fixture
import source_patch
import prebuild_patch
import prebuild_policy
import completion_policy
import reviewed_direct_export
SOURCE = Path(os.environ.get('MODEL_COMPLETION_SOURCE', '/tmp/worldifact-budget-source/oracle_connector'))
JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


def originals():
    original = source_fixture.installed_sources(SOURCE)
    original['server.py'] = reviewed_direct_export.patch_server(original['server.py'].decode()).encode()
    original.update(source_patch.changes({n: original[n] for n in source_patch.EXPECTED}, Path(completion_policy.__file__).read_bytes()))
    return prebuild_patch.changes({n: original[n] for n in prebuild_patch.EXPECTED}, Path(prebuild_policy.__file__).read_bytes())


def helpers():
    return {n: (HERE / n).read_bytes() for n in ('studio_pricing.py', 'terminal_budget.py')}


def module():
    raw = Path(ROOT / 'tools/profit_guard/astra_spend_v2.py').read_text()
    raw = tiers_patch.previous.patch_spend(prebuild_patch.patch_spend(source_patch.patch_spend(raw)))
    raw = tiers_patch.patch_spend(raw)
    policy = types.ModuleType('astra_spend_v2')
    exec(compile(raw, 'installed-astra-spend-v2.py', 'exec'), policy.__dict__)
    return policy


class PricingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'jobs' / JOB; self.folder.mkdir(parents=True)
        self.ledgers = self.root / 'ledger'
        self.policy = module()
        self.mapping = patch.dict(sys.modules, {'astra_spend_v2': self.policy}); self.mapping.start(); self.addCleanup(self.mapping.stop)
        self.patch = patch.object(legacy, 'LEDGER_ROOT', self.ledgers); self.patch.start(); self.addCleanup(self.patch.stop)

    def bind(self, tier):
        terms = {'revision': pricing.REVISION, **pricing.TIERS[tier]}
        pricing.bind(self.folder, terms)
        return terms

    def reserve(self, count=1000, output=16000, minimum=256):
        return self.policy.reserve(self.folder, count, output, now=1, minimum_output=minimum)

    def state_path(self):
        return pricing.folder_root(self.folder) / legacy.STATE

    def completed(self, token, *, status='completed', identifier='resp_fixture'):
        return self.policy.settle_completed(self.folder, token, {'id': identifier, 'model': 'gpt-6-astra', 'status': status,
            'usage': {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200}})

    def seal(self):
        return terminal.seal_terminal(self.folder, JOB)

    def test_exact_terms_pairs_and_fast_reject_cross_tiers_boolean_extra_and_null(self):
        for item in pricing.TIERS:
            value = {'revision': pricing.REVISION, **item}
            self.assertEqual(pricing.admission({'studioPricing': value}, 'standard'), value)
            for bad in ({**value, 'points': True}, {**value, 'points': 500 if item['points'] == 250 else 250},
                        {**value, 'maxProviderCents': 175}, {**value, 'extra': 1}, {**value, 'revision': 'future'}, None):
                with self.assertRaises(ValueError): pricing.admission({'studioPricing': bad}, 'standard')
            with self.assertRaises(ValueError): pricing.admission({'studioPricing': value}, 'fast')
        self.assertIsNone(pricing.admission({}, 'standard'))

    def test_new_tier_caps_apply_to_actual_reserve_and_retained_incomplete_holds(self):
        for tier, cap in ((0, 2000000), (1, 4000000)):
            with self.subTest(tier=tier):
                other = self.root / str(tier) / JOB; other.mkdir(parents=True)
                self.folder = other; terms = self.bind(tier)
                tokens = []
                while True:
                    try:
                        token, _ = self.reserve(); tokens.append(token)
                        self.assertFalse(self.completed(token, status='incomplete'))
                    except self.policy.SpendError as error:
                        self.assertEqual(error.reason, 'INSUFFICIENT_RESERVATION'); break
                state = json.loads(self.state_path().read_text())
                self.assertEqual(state['revision'], pricing.POLICY_REVISION)
                self.assertLessEqual(self.policy.used(state), cap)
                self.assertGreater(self.policy.used(state), cap - 42672 - 256 * 55)
                self.assertEqual(pricing.job_terms(self.folder), terms)
                receipt = self.seal()
                self.assertEqual(receipt['capMicroUsd'], cap)
                self.assertEqual(receipt['policyRevision'], pricing.POLICY_REVISION)
                self.assertEqual(receipt['maximumLiabilityMicroUsd'], self.policy.used(state))

    def test_legacy_175_and_existing_receipt_remain_identical(self):
        self.reserve(); old_module = types.ModuleType('historical_terminal')
        exec(compile(tiers_patch.historical_helper(), 'historical_terminal.py', 'exec'), old_module.__dict__)
        receipt = old_module.seal_terminal(self.folder, JOB)
        self.assertEqual(receipt['capMicroUsd'], 1750000)
        self.assertEqual(receipt['policyRevision'], 'astra-low-reconciled-v2')
        self.assertEqual(self.seal(), receipt)
        with self.assertRaises(ValueError): self.bind(1)
        with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_terms_are_immutable_before_and_after_first_call_and_no_legacy_upgrade(self):
        terms = self.bind(0); before = (pricing.folder_root(self.folder) / pricing.TERMS).read_bytes()
        pricing.bind(self.folder, terms)
        with self.assertRaises(ValueError): self.bind(1)
        with self.assertRaises(ValueError): pricing.bind(self.folder, None)
        self.reserve()
        with self.assertRaises(ValueError): self.bind(1)
        self.assertEqual((pricing.folder_root(self.folder) / pricing.TERMS).read_bytes(), before)
        other = self.root / 'legacy' / JOB; other.mkdir(parents=True); self.folder = other
        self.reserve()
        with self.assertRaises(ValueError): self.bind(0)

    def test_corrupt_linked_or_missing_terms_never_reopen_existing_tier_ledger(self):
        self.bind(1); self.reserve(); path = pricing.folder_root(self.folder) / pricing.TERMS
        before = path.read_bytes()
        for invalid in (b'{}', b'{"jobId":"wrong","studioPricing":{}}'):
            path.write_bytes(invalid)
            with self.assertRaises(self.policy.SpendError): self.reserve()
            with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        path.write_bytes(before); path.unlink()
        with self.assertRaises(self.policy.SpendError): self.reserve()
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        path.symlink_to(self.root / 'missing')
        with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_completed_settlement_reduces_upper_cost_but_receipt_is_immutable_after_restart(self):
        self.bind(1); first, _ = self.reserve(); self.assertTrue(self.completed(first))
        second, _ = self.reserve(); receipt = self.seal()
        self.assertEqual(receipt['maximumLiabilityMicroUsd'], 6900 + 3048 * 14 + 16000 * 55)
        self.assertTrue(self.completed(second, identifier='resp_second'))
        self.policy = module(); sys.modules['astra_spend_v2'] = self.policy
        self.assertEqual(self.seal(), receipt)
        with self.assertRaises(self.policy.SpendError) as caught: self.reserve()
        self.assertEqual(caught.exception.reason, 'JOB_SEALED')

    def test_lock_race_reserve_seal_includes_each_outstanding_hold_or_denies_it(self):
        self.bind(1); self.reserve(); barrier = threading.Barrier(3)
        def reserve():
            barrier.wait()
            try: self.reserve(); return True
            except self.policy.SpendError: return False
        def seal(): barrier.wait(); return self.seal()
        with ThreadPoolExecutor(max_workers=2) as pool:
            call = pool.submit(reserve); close = pool.submit(seal); barrier.wait()
            accepted, receipt = call.result(), close.result()
        self.assertEqual(receipt['maximumLiabilityMicroUsd'], (3048 * 14 + 16000 * 55) * (2 if accepted else 1))
        with self.assertRaises(self.policy.SpendError): self.reserve()

    def test_seal_without_request_holds_never_reports_zero(self):
        self.bind(0)
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()
        self.reserve(); state = json.loads(self.state_path().read_text()); state['holds'] = {}
        self.state_path().write_text(json.dumps(state))
        with self.assertRaises(terminal.BudgetUnavailable): self.seal()

    def test_precise_exhaustion_code_never_covers_count_pricing_io_or_request_limit(self):
        self.bind(0)
        while True:
            try: self.reserve(minimum=2048)
            except self.policy.SpendError as error:
                guard = self.policy.safe_diagnostic(error); break
        self.assertEqual(guard['reason'], 'INSUFFICIENT_RESERVATION')
        usage = {'error_code': 'WORLDIFACT_ASTRA_COST_GUARD', 'cost_guard': guard}
        (self.folder / 'agent-usage.json').write_text(json.dumps(usage))
        self.assertEqual(pricing.public_failure_code(self.folder, 'failed'), {'worldifactFailureCode': 'MODEL_BUDGET_EXCEEDED'})
        self.assertEqual(pricing.public_failure_code(self.folder, 'succeeded'), {'worldifactFailureCode': 'MODEL_BUDGET_EXCEEDED'})
        self.assertEqual(pricing.public_failure_code(self.folder, 'running'), {})
        self.assertEqual(pricing.public_failure_code(self.folder, 'cancelled'), {})
        for reason in self.policy.REASONS - {'INSUFFICIENT_RESERVATION'}:
            usage['cost_guard'] = {**guard, 'reason': reason}
            (self.folder / 'agent-usage.json').write_text(json.dumps(usage))
            self.assertEqual(pricing.public_failure_code(self.folder, 'failed'), {}, reason)
        usage['cost_guard'] = {**guard, 'remaining_micro_usd': guard['required_minimum_micro_usd']}
        (self.folder / 'agent-usage.json').write_text(json.dumps(usage))
        self.assertEqual(pricing.public_failure_code(self.folder, 'failed'), {})

    def test_actual_python_new_receipts_match_worker_stored_terms_without_translation(self):
        values=[]
        for tier in (0,1):
            self.folder=self.root/str(tier)/JOB; self.folder.mkdir(parents=True)
            terms=self.bind(tier); self.reserve()
            values.append({'receipt':self.seal(),'terms':terms})
        script = """import { readFileSync } from 'node:fs';
const { validateTerminalBudgetReceipt } = await import(process.argv[1]);
const values = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(values.map(({receipt,terms}) => [
validateTerminalBudgetReceipt(receipt, process.argv[2],terms),
validateTerminalBudgetReceipt(receipt, process.argv[2],null),
validateTerminalBudgetReceipt(receipt, process.argv[2], {...terms,maxProviderCents:175}),
validateTerminalBudgetReceipt({...receipt,capMicroUsd:1750000}, process.argv[2],terms)])));"""
        result=subprocess.run(['node','--input-type=module','-e',script,
            (ROOT/'server/studioBudgetReceipt.ts').as_uri(),JOB],input=json.dumps(values),text=True,capture_output=True,check=True,timeout=15)
        self.assertEqual(json.loads(result.stdout),[[True,False,False,False],[True,False,False,False]])


class SourceTests(unittest.TestCase):
    def test_only_exact_prebuild_or_receipt_ancestry_produces_identical_upgrade(self):
        original = originals(); helper = helpers()
        old = tiers_patch.previous.changes(original, tiers_patch.historical_helper())
        self.assertEqual(tiers_patch.reviewed_sources(original), 'PREBUILD')
        self.assertEqual(tiers_patch.reviewed_sources(old), 'TERMINAL_BUDGET')
        self.assertEqual(tiers_patch.changes(original, helper), tiers_patch.changes(old, helper))
        for sources in (original, old):
            for name in sources:
                with self.assertRaises(ValueError): tiers_patch.changes({**sources, name: sources[name] + b'\n'}, helper)
        for name in ('codex_runner.py', 'blender_mcp.py', 'completion_policy.py', 'prebuild_policy.py'):
            self.assertEqual(original[name], tiers_patch.changes(original, helper)[name])


if __name__ == '__main__': unittest.main()
