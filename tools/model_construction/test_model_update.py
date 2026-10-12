"""Synthetic transaction failure tests; no runtime/Blender attestation claim."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch

import test_execution_update as predecessor
original = predecessor.original
installer, manifest, health = original.installer, original.manifest, original.health
write, tree, digest = original.write, original.tree, original.digest
sys.path.append(str(Path(__file__).resolve().parent.parent / 'model_execution'))
import model_routes
import offline_models


def model_evidence(model, mode):
    api, cap, cost = {'astra': ('gpt-6-astra', 1750000, 6875),
        'sol': ('gpt-6.1-sol', 350000, 1375), 'luna': ('gpt-6-luna', 100000, 69)}[model]
    liability = 4 * cost * (2 if mode == 'fast' else 1)
    seal = {'revision': 'worldifact-terminal-budget-v1', 'jobId': original.CANCELLED,
        'model': api, 'policyRevision': 'studio-model-budget-v1:' + mode,
        'capMicroUsd': cap, 'maximumLiabilityMicroUsd': liability, 'sealed': True, 'sealId': 'e' * 64}
    return {'selection': {'revision': 'studio-execution-v1', 'model': model, 'mode': mode},
        'model': api, 'service_tier': 'fast' if mode == 'fast' else 'default', 'cap_micro_usd': cap,
        'requests': 4, 'counts': 4, 'phases': 4, 'waits': 0, 'fixture_liability_micro_usd': liability,
        'seal': seal, 'execution_id': 'a' * 32, 'terms_sha256': 'b' * 64, 'model_sha256': 'c' * 64,
        'render_sha256': {v: 'd' * 64 for v in ('front', 'side', 'back')},
        'source_sha256': manifest.model_manifest(),
        'original_gate_sha256': offline_models.old.LEGACY_SHA256,
        'actual_cli_mcp_blender': True, 'actual_images_verified': True, 'provider_fixture': True,
        'cleanup_verified': True, 'live_provider_verified': False, 'visual_quality_verified': False,
        'installed_receipt_written': False, 'native_fallback': False}


class Operations(predecessor.Operations):
    def preflight(self):
        self.events.append('preflight')
        installer.validate_installed_receipts(self.source, installer.installed_sources(self.source, models=True), models=True)

    def verify_stage(self, stage, workspace, lease):
        result = super().verify_stage(stage, workspace, lease)
        models = tuple(installer.encoded(model_evidence(m, mode)) for m, mode in installer.MODEL_CASES)
        if self.failure == 'missing-model': models = models[:-1]
        if self.failure == 'wrong-model': models = (models[1],) + models[1:]
        return installer.GateEvidence(result.generic_receipt, result.gates, models)


class ModelTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        original.ConstructionTransactions.setUpClass.__func__(cls)

    def setUp(self):
        predecessor.ExecutionTransactions.setUp(self)
        # First construct the complete known predecessor in the disposable
        # fixture using the existing transaction, never production files.
        result = installer.install(self.source, self.backup, predecessor.Operations(self.source), approved=True, update_execution=True)
        self.assertTrue(result['activation_committed'])
        self.before = tree(self.source)
        self.backup = self.root / 'models-install'
        self.installed = {n: (self.source / n).read_bytes() for n in health.SOURCES}
        changed = {**self.installed, 'server.py': self.installed['server.py'] + b'\n# synthetic model admission\n',
            'codex_runner.py': self.installed['codex_runner.py'] + b'\n# synthetic model dispatch\n',
            manifest.MODEL_HELPER: installer.model_file(manifest.MODEL_HELPER).read_bytes()}
        original.enter_context(self, patch.object(manifest, 'MODEL_AFTER', {n: digest(b) for n, b in changed.items()}))
        def transform(sources):
            self.assertEqual(sources, {n: self.installed[n] for n in model_routes.EXPECTED})
            return {n: changed[n] for n in model_routes.EXPECTED}
        original.enter_context(self, patch.object(model_routes, 'transform', side_effect=transform))

    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations, approved=True, update_models=True, **kwargs)

    def test_all_model_gates_bind_the_exact_write_set_and_preserve_old_ledgers(self):
        calls, actual = [], installer.base.atomic_write
        def record(path, *args, **kwargs):
            if self.source in Path(path).parents: calls.append(Path(path).relative_to(self.source).as_posix())
            return actual(path, *args, **kwargs)
        with patch.object(installer.base, 'atomic_write', side_effect=record): outcome = self.install()
        self.assertTrue(outcome['activation_committed'])
        self.assertFalse(outcome['job_rows_changed'])
        self.assertCountEqual(calls, installer.MODEL_WRITES)
        after = tree(self.source)
        self.assertEqual(set(after) - set(self.before), {manifest.MODEL_HELPER, manifest.MODEL_RECEIPT})
        for name, value in self.before.items():
            if name not in installer.MODEL_WRITES: self.assertEqual(after[name], value)
            else: self.assertEqual(after[name][1], value[1])
        proof = json.loads(after[manifest.MODEL_RECEIPT][0])
        self.assertEqual(proof['sha256'], {n: manifest.MODEL_AFTER[n] for n in ('server.py', 'codex_runner.py', manifest.MODEL_HELPER)})
        self.assertEqual(proof['construction_receipt_sha256'], digest(after[health.RECEIPT][0]))
        self.assertEqual(set(proof['evidence_sha256']), {m + '-' + mode for m, mode in installer.MODEL_CASES})
        self.assertFalse(proof['live_provider_verified'])
        self.assertEqual(health.verified_health(self.source), {'worldifactStandardConstructionPolicy': health.REVISION})

    def test_every_write_and_lost_ack_restore_all_old_bytes_and_remove_new_files(self):
        actual = installer.base.atomic_write
        for lost_ack in (False, True):
            for index, target in enumerate(installer.MODEL_WRITES):
                with self.subTest(lost_ack=lost_ack, target=target):
                    self.backup = self.root / ('failed-write-' + str(lost_ack) + '-' + str(index)); fired = []
                    def fail(path, *args, **kwargs):
                        if Path(path) == self.source / target and not fired:
                            fired.append(True)
                            if lost_ack: actual(path, *args, **kwargs)
                            raise OSError('inert write failure')
                        return actual(path, *args, **kwargs)
                    with patch.object(installer.base, 'atomic_write', side_effect=fail): result = self.install()
                    self.assertTrue(fired)
                    self.assertTrue(result['previous_source_restored'])
                    self.assertFalse(result['activation_committed'])
                    self.assertEqual(tree(self.source), self.before)

    def test_missing_legacy_or_selected_model_gate_prevents_any_live_write(self):
        for failure in ('verify', 'stage', 'missing-gate', 'missing-model', 'wrong-model', 'start', 'health', 'stage-dependency'):
            with self.subTest(failure=failure):
                self.backup = self.root / ('failed-' + failure)
                result = self.install(failure)
                self.assertTrue(result['previous_source_restored'])
                self.assertEqual(tree(self.source), self.before)

    def test_unknown_predecessor_and_existing_new_files_refuse_before_service_stop(self):
        for name in health.SOURCES | installer.RECEIPTS | {health.RECEIPT, manifest.MODEL_HELPER, manifest.MODEL_RECEIPT}:
            path = self.source / name
            previous = self.before.get(name)
            write(path, b'{}')
            try:
                with self.assertRaises((ValueError, OSError, installer.Refused)): self.install()
                self.assertNotIn('fence', self.operations.events)
            finally:
                if previous: write(path, previous[0]); path.chmod(previous[1])
                else: path.unlink()

    def test_admission_and_ambiguous_activation_keep_the_existing_fence(self):
        for state in ('queued', 'generating', 'cancelled', 'unknown', None):
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute('UPDATE jobs SET state=?', (state,))
            before = tree(self.source); self.backup = self.root / ('busy-' + str(state))
            with self.assertRaises(original.fence.FenceRefused): self.install()
            self.assertEqual(tree(self.source), before)
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute("UPDATE jobs SET state='failed'")
        self.backup = self.root / 'ambiguous'
        result = self.install('latch')
        self.assertIsNone(result['previous_source_restored'])
        self.assertNotIn('rollback-fence', self.operations.events)
        self.assertEqual(self.operations.events.count('start'), 1)

    def test_repeat_conflicting_modes_and_unapproved_call_refuse(self):
        for mode in ('update_payload', 'update_initial_edit', 'update_response_phase', 'update_execution'):
            with self.assertRaisesRegex(installer.Refused, 'conflicting_update_modes'): self.install(**{mode: True})
        with self.assertRaisesRegex(installer.Refused, 'maintenance_approval_required'):
            installer.install(self.source, self.backup, object(), update_models=True)
        self.install(); after = tree(self.source); self.backup = self.root / 'repeat'
        with self.assertRaises((ValueError, installer.Refused)): self.install()
        self.assertEqual(tree(self.source), after)

    def test_evidence_rejects_cross_model_cross_mode_and_false_pipeline_claims(self):
        valid = model_evidence('luna', 'fast')
        installer.validate_model_evidence(installer.encoded(valid), 'luna', 'fast')
        for field, replacement in [('source_sha256', {}), ('selection', {'revision': 'studio-execution-v1', 'model': 'sol', 'mode': 'fast'}),
            ('model', 'gpt-6-astra'), ('service_tier', 'default'), ('cap_micro_usd', 1750000), ('counts', 3),
            ('fixture_liability_micro_usd', 0), ('cleanup_verified', False), ('actual_cli_mcp_blender', False),
            ('native_fallback', True), ('live_provider_verified', True), ('render_sha256', {}), ('seal', {})]:
            value = deepcopy(valid); value[field] = replacement
            with self.subTest(field=field), self.assertRaises(installer.Refused):
                installer.validate_model_evidence(installer.encoded(value), 'luna', 'fast')


if __name__ == '__main__': unittest.main()
