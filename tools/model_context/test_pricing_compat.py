"""Exact PR195/source/receipt and immutable synthetic-history compatibility.

No provider, service or user state is accessed. Installer execution uses its
existing explicit transaction double; source assembly and ledger logic are real.
"""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import types
import unittest
from unittest.mock import patch

import install_context as installer
import context_patch
import context_policy
import tiers_patch
from maintenance_fence import FenceRefused
from test_context import before_sources, ROOT, SOURCE
import source_fixture
import test_install_context as transaction_tests
from test_install_context import FakeOperations, tree, write


def pricing_sources():
    return tiers_patch.changes(before_sources(), {name: (ROOT / 'tools/model_budget_tiers' / name).read_bytes()
                                                for name in ('studio_pricing.py', 'terminal_budget.py')})


class ExactAncestryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.legacy = before_sources()
        cls.pricing = pricing_sources()
        cls.helper = Path(context_policy.__file__).read_bytes()

    def test_only_exact_two_ancestors_and_their_exact_rollbacks_are_admitted(self):
        for variant, original in (('PREBUILD', self.legacy), ('PRICING', self.pricing)):
            hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
            self.assertEqual(context_patch.reviewed_sources(original), variant)
            self.assertTrue(context_patch.reviewed_manifest(hashes))
            changed = context_patch.changes(original, self.helper)
            after = {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()}
            self.assertTrue(context_patch.reviewed_manifest(after))
            for name in changed:
                self.assertFalse(context_patch.reviewed_manifest({**after, name: '0' * 64}))
            for name in original:
                with self.assertRaises(ValueError): context_patch.changes({**original, name: original[name] + b'\n'}, self.helper)
            with self.assertRaises(ValueError): context_patch.changes({**original, 'unknown.py': b''}, self.helper)
        historical = tiers_patch.previous.changes(self.legacy, tiers_patch.historical_helper())
        with self.assertRaises(ValueError): context_patch.changes(historical, self.helper)

    def test_pricing_spend_terminal_mcp_and_completion_remain_identical(self):
        changed = context_patch.changes(self.pricing, self.helper)
        self.assertEqual({name for name in self.pricing if self.pricing[name] != changed[name]}, {'server.py', 'codex_runner.py'})
        self.assertEqual(changed['codex_runner.py'], context_patch.changes(self.legacy, self.helper)['codex_runner.py'])
        self.assertEqual(hashlib.sha256(changed['astra_spend_v2.py']).hexdigest(), 'eafbf9d261b471bb5e10b2e5bf7def25a75909c019a5ec658abb855b11483673')
        # Reverse only the new health/import and composed marker gates. All
        # existing routes, immutable terms and terminal seal code must remain.
        server = changed['server.py'].decode().replace('import context_policy\n', '', 1)
        server = server.replace("    context_proof=context_policy.verified_health()\n    state.update(context_proof)\n    maintenance=context_policy.maintenance_active()\n    state['worldifactStandardMaintenance']=maintenance\n    if not context_proof or maintenance:state.update(ready=False,detail='STANDARD runtime maintenance or verification is pending.')\n", '', 1)
        server = server.replace('(context_policy.maintenance_active(ROOT) or studio_pricing.maintenance_active(ROOT))', 'studio_pricing.maintenance_active(ROOT)')
        self.assertEqual(server.encode(), self.pricing['server.py'])


class PricingTransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original = pricing_sources()
    def setUp(self):
        transaction_tests.InstallerTests.setUp(self)
        hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in self.original.items()}
        # Retain unrelated facts, including previous cancelled consent, instead
        # of rewriting history with this context installation's new consent.
        for module in (installer.studio_pricing, installer.terminal_budget):
            write(self.source / module.RECEIPT, {'revision': module.REVISION, 'sha256': hashes,
                  'maintenance_fence': context_policy.FENCE_REVISION,
                  'cancelled_cleanup_interruption_approved': True,
                  'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True,
                  'retained_note': 'synthetic prior verification'})
            (self.source / module.RECEIPT).chmod(0o640)
        # Supply genuine unchanged legacy guard dependencies so full installed
        # completion/prebuild/pricing/context readiness can be exercised locally.
        installed = source_fixture.installed_sources(SOURCE)
        for name in ('fast_preview.py', 'astra_spend.py'):
            (self.source / name).write_bytes(installed[name])
        guard_path = self.source / installer.cache.legacy.RECEIPT
        guard = json.loads(guard_path.read_bytes())
        for name in ('fast_preview.py', 'astra_spend.py'):
            guard['sha256'][name] = hashlib.sha256(installed[name]).hexdigest()
        write(guard_path, guard)
        for name in (installer.completion_policy.RECEIPT, installer.prebuild_policy.RECEIPT):
            path = self.source / name
            receipt = json.loads(path.read_bytes()); receipt['retained_extra'] = 'synthetic prior fact'
            write(path, receipt); path.chmod(0o640)
        self.ledgers = self.source / 'state/worldifact-astra-budgets'
        self.spend = types.ModuleType('astra_spend_v2')
        self.spend.__file__ = str(self.source / 'astra_spend_v2.py')
        exec(compile(self.original['astra_spend_v2.py'], self.spend.__file__, 'exec'), self.spend.__dict__)
        self.enterContext(patch.dict(sys.modules, {'astra_spend_v2': self.spend}))
        self.enterContext(patch.object(self.spend.legacy, 'LEDGER_ROOT', self.ledgers))
        self.histories = []
        for index, terms in enumerate((None, *({'revision': installer.studio_pricing.REVISION, **tier}
                                              for tier in installer.studio_pricing.TIERS))):
            job_id = '00000000-0000-4000-8000-%012d' % (index + 1)
            job = self.source / 'state/jobs' / job_id; job.mkdir(parents=True)
            installer.studio_pricing.bind(job, terms)
            token, _ = self.spend.reserve(job, 1000, 16000, now=1)
            self.assertFalse(self.spend.settle_completed(job, token, {'status': 'incomplete'}))
            seal = installer.terminal_budget.seal_terminal(job, job_id)
            write(job / 'agent-candidate.json', {'revision': 3, 'path': 'saved-candidate'})
            write(job / 'agent-usage.json', {'completed': False, 'unknown_usage': True})
            (job / 'saved-candidate').mkdir(); (job / 'saved-candidate/model.glb').write_bytes(b'untouched synthetic model')
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as database:
                database.execute('INSERT INTO jobs VALUES (?,?)', (job_id, 'failed' if index else 'succeeded'))
            self.histories.append((job, terms, seal))
        self.before = tree(self.source)

    def install(self, failure=None):
        return installer.install(self.source, self.backup, FakeOperations(self.source, failure), approved=True)

    def assert_financial_history(self):
        self.assertEqual({name: value for name, value in tree(self.source).items() if name.startswith('state/')},
                         {name: value for name, value in self.before.items() if name.startswith('state/')})
        for index, (job, terms, seal) in enumerate(self.histories):
            self.assertEqual(seal['capMicroUsd'], (1750000, 2000000, 4000000)[index])
            self.assertEqual(installer.studio_pricing.job_terms(job), terms)
            self.assertEqual(installer.terminal_budget.seal_terminal(job, job.name), seal)
            with self.assertRaises(self.spend.SpendError): self.spend.reserve(job, 1000, 16000, now=1)
            replacement = {'revision': installer.studio_pricing.REVISION, **installer.studio_pricing.TIERS[0 if index == 2 else 1]}
            with self.assertRaises(ValueError): installer.studio_pricing.bind(job, replacement)

    def test_success_preserves_saved_candidate_all_caps_seals_usage_and_modes(self):
        result = self.install()
        self.assertTrue(result['activation_committed'])
        self.assert_financial_history()
        after = tree(self.source)
        expected_changes = {'server.py', 'codex_runner.py', 'context_policy.py', context_policy.RECEIPT,
                            installer.base.RECEIPT, installer.completion_policy.RECEIPT,
                            installer.prebuild_policy.RECEIPT, installer.cache.legacy.RECEIPT,
                            *context_patch.PRICING_RECEIPTS}
        self.assertEqual({name for name in after if after[name] != self.before.get(name)}, expected_changes)
        for name in context_patch.PRICING_RECEIPTS:
            prior = json.loads(self.before[name][0]); refreshed = json.loads(after[name][0])
            for target in ('server.py', 'codex_runner.py'):
                self.assertEqual(refreshed['sha256'][target], hashlib.sha256(after[target][0]).hexdigest())
                refreshed['sha256'][target] = prior['sha256'][target]
            self.assertEqual(refreshed, prior); self.assertEqual(after[name][1], self.before[name][1])
        for name in ('astra_spend_v2.py', 'studio_pricing.py', 'terminal_budget.py'):
            self.assertEqual(after[name], self.before[name])
        manifest = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_text())
        self.assertTrue(set(context_patch.PRICING_EXPECTED) | set(context_patch.PRICING_RECEIPTS) <= manifest['originals'].keys())

    def test_full_real_health_chain_survives_success_and_detects_each_stale_receipt(self):
        self.assertTrue(installer.prebuild_policy.verified_health(self.source))
        self.assertTrue(installer.studio_pricing.verified_health(self.source))
        self.assertTrue(installer.terminal_budget.verified_health(self.source))
        self.install()
        self.assertTrue(context_policy.verified_health(self.source))
        for name in (installer.completion_policy.RECEIPT, installer.prebuild_policy.RECEIPT,
                     installer.cache.legacy.RECEIPT, installer.base.RECEIPT, *context_patch.PRICING_RECEIPTS):
            prior = (self.source / name).read_bytes()
            (self.source / name).write_bytes(self.before[name][0])
            self.assertEqual(context_policy.verified_health(self.source), {}, name)
            (self.source / name).write_bytes(prior)
            self.assertTrue(context_policy.verified_health(self.source), name)

    def test_health_failure_restores_same_tree_and_all_immutable_history(self):
        result = self.install('health')
        self.assertTrue(result['previous_source_restored'])
        self.assertEqual(tree(self.source), self.before)
        self.assert_financial_history()

    def test_overlay_receipt_write_failure_restores_previous_overlay(self):
        atomic = installer.base.atomic_write
        for receipt in context_patch.PRICING_RECEIPTS:
            def fail(path, raw, *args, **kwargs):
                if Path(path) == self.source / receipt and raw != self.before[receipt][0]:
                    raise OSError('synthetic overlay receipt write failure')
                return atomic(path, raw, *args, **kwargs)
            with patch.object(installer.base, 'atomic_write', side_effect=fail):
                outcome = self.install()
            self.assertTrue(outcome['previous_source_restored'])
            self.assertEqual(tree(self.source), self.before)
            self.backup = self.root / ('backup-' + receipt)

    def test_mutated_receipt_or_helper_refuses_before_fencing(self):
        for name in ('studio_pricing.py', 'terminal_budget.py', *context_patch.PRICING_RECEIPTS,
                     installer.completion_policy.RECEIPT, installer.prebuild_policy.RECEIPT,
                     installer.cache.legacy.RECEIPT):
            original = self.before[name][0]
            if name.endswith('.py'):
                changed = original + b'\n'
            else:
                record = json.loads(original)
                if name == installer.cache.legacy.RECEIPT: record['outputPolicy']['sha256'] = '0' * 64
                else: record['sha256']['server.py'] = '0' * 64
                changed = json.dumps(record).encode()
            (self.source / name).write_bytes(changed)
            ops = FakeOperations(self.source)
            with self.assertRaises((ValueError, installer.Refused)): installer.install(self.source, self.backup, ops, approved=True)
            self.assertNotIn('fence', ops.events); self.assertFalse(self.backup.exists())
            (self.source / name).write_bytes(original)
        self.assertEqual(tree(self.source), self.before)

    def test_terminal_and_pricing_receipt_flags_cannot_be_laundered(self):
        originals = {name: value[0] for name, value in self.before.items()}
        patched = context_patch.changes(self.original, Path(context_policy.__file__).read_bytes())
        for name in context_patch.PRICING_RECEIPTS:
            for key, invalid in [('revision', 'unknown'), ('offline_generic_pipeline', False),
                                 ('offline_cabinet_pipeline', False), ('maintenance_fence', 'unknown'),
                                 ('cancelled_cleanup_interruption_approved', 1)]:
                value = json.loads(originals[name]); value[key] = invalid
                with self.assertRaises(installer.Refused): installer.receipt_updates({**originals, name: json.dumps(value).encode()}, patched)

    def test_context_health_covers_both_preserved_receipts_and_helper_sets(self):
        self.install()
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'verified': True}):
            self.assertTrue(context_policy.verified_health(self.source))
            for name in context_patch.PRICING_RECEIPTS:
                prior = (self.source / name).read_bytes()
                record = json.loads(prior); record['sha256']['server.py'] = '0' * 64
                write(self.source / name, record)
                self.assertEqual(context_policy.verified_health(self.source), {})
                (self.source / name).write_bytes(prior)
            path = self.source / context_policy.RECEIPT
            proof = json.loads(path.read_bytes())
            proof['sha256'].pop('studio_pricing.py'); proof['sha256'].pop('terminal_budget.py')
            write(path, proof)
            self.assertEqual(context_policy.verified_health(self.source), {})

    def test_active_or_unknown_rows_preserve_every_file_and_refuse_maintenance(self):
        for state in ('queued', 'generating', 'building', 'unknown', None):
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as database:
                database.execute('UPDATE jobs SET state=? WHERE id=?', (state, 'synthetic'))
            before = tree(self.source)
            with self.assertRaises(FenceRefused): self.install()
            self.assertEqual(tree(self.source), before)
            # Each refusal has a private backup; never reuse that directory.
            self.backup = self.root / ('backup-' + str(state))


if __name__ == '__main__': unittest.main()
