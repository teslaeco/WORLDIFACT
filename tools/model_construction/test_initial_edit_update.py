"""Disposable parser-fixed initial-edit update transactions; synthetic gates are not live proof."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch

import test_construction_transaction as original

installer, manifest, health = original.installer, original.manifest, original.health
write, tree, digest = original.write, original.tree, original.digest
CANCELLED = original.CANCELLED


class Operations(original.Operations):
    def preflight(self):
        self.events.append('preflight')
        installer.validate_installed_receipts(self.source, installer.installed_sources(self.source))

    def start(self):
        self.events.append('start')
        if self.failure == 'start' and self.events.count('start') == 1:
            raise installer.Refused('synthetic_start_failure')

    def previous_health(self):
        self.events.append('old-health')
        installer.validate_installed_receipts(self.source, installer.installed_sources(self.source))


class InitialEditUpdates(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        original.ConstructionTransactions.setUpClass.__func__(cls)

    def setUp(self):
        original.ConstructionTransactions.setUp(self)
        # All unchanged runtime bytes come from the real public lineage. The
        # predecessor helpers are inert; this test never executes a paid route.
        self.installed = {**self.after, **{name: ('# Synthetic installed parser-fixed ' + name + '\n').encode()
                                                 for name in manifest.INITIAL_EDIT_HELPERS}}
        self.predecessor = {name: digest(raw) for name, raw in self.installed.items()}
        original.enter_context(self, patch.object(manifest, 'INITIAL_EDIT_BEFORE', self.predecessor))
        receipts = {name: (self.source / name).read_bytes() for name in installer.RECEIPTS}
        generic = installer.encoded({'sources': {name: self.predecessor[name]
            for name in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True,
            'fixture_only': True, 'original_runtime_fact': 'retain exact bytes'})
        evidence = installer.GateEvidence(generic, installer.REQUIRED_GATES)
        with patch.object(manifest, 'EXPECTED_AFTER', self.predecessor):
            receipts = installer.rebound_receipts(receipts, self.installed, evidence, True)
        proof = json.loads(receipts[health.RECEIPT])
        proof['payload_update'] = {'revision': 'responses-reasoning-content-v1',
            'previous_construction_receipt_sha256': 'a' * 64, 'verified_generic_receipt_sha256': 'b' * 64}
        receipts[health.RECEIPT] = installer.encoded(proof)
        for name, raw in {**self.installed, **receipts}.items():
            write(self.source / name, raw)
        for name in installer.INITIAL_EDIT_WRITES:
            (self.source / name).chmod(0o640)
        self.before = tree(self.source)
        installer.validate_installed_receipts(self.source, installer.installed_sources(self.source))

    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations,
                                 approved=True, update_initial_edit=True, **kwargs)

    def restore_fixture(self):
        marker = self.source / installer.MAINTENANCE
        if marker.exists():
            marker.unlink()
        for name, (raw, mode) in self.before.items():
            write(self.source / name, raw)
            (self.source / name).chmod(mode)

    def test_only_four_persistent_writes_preserve_history_receipts_and_modes(self):
        actual = installer.base.atomic_write
        writes = []
        def record(path, *args, **kwargs):
            if self.source in Path(path).parents:
                writes.append(Path(path).relative_to(self.source).as_posix())
            return actual(path, *args, **kwargs)
        with patch.object(installer.base, 'atomic_write', side_effect=record):
            outcome = self.install()
        self.assertTrue(outcome['activation_committed'])
        self.assertCountEqual(writes, installer.INITIAL_EDIT_WRITES)
        after = tree(self.source)
        self.assertEqual(set(after), set(self.before))
        self.assertEqual({name for name in after if after[name] != self.before[name]}, installer.INITIAL_EDIT_WRITES)
        for name in after:
            self.assertEqual(after[name][1], self.before[name][1])
        proof = json.loads(after[health.RECEIPT][0])
        old_proof = json.loads(self.before[health.RECEIPT][0])
        self.assertEqual(proof['sha256'], self.expected)
        self.assertEqual(proof['receipt_sha256'], old_proof['receipt_sha256'])
        self.assertEqual(proof['payload_update'], old_proof['payload_update'])
        self.assertEqual(proof['initial_edit_update']['revision'], 'typed-plan-initial-edit-v1')
        self.assertEqual(proof['predecessor_receipt_sha256'], old_proof['predecessor_receipt_sha256'])
        self.assertEqual(proof['initial_edit_update']['previous_construction_receipt_sha256'],
                         digest(self.before[health.RECEIPT][0]))
        witness = (self.backup / 'INITIAL_EDIT_UPDATE_GENERIC_EVIDENCE.json').read_bytes()
        self.assertEqual(proof['initial_edit_update']['verified_generic_receipt_sha256'], digest(witness))
        self.assertNotEqual(witness, self.before[health.GENERIC_RECEIPT][0])
        self.assertTrue(all(proof[gate] is True for gate in installer.REQUIRED_GATES))
        self.assertEqual(health.verified_health(self.source), {'worldifactStandardConstructionPolicy': health.REVISION})
        self.assertEqual(health.verified_health(self.backup / 'verification-stage'),
                         {'worldifactStandardConstructionPolicy': health.REVISION})
        backup = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_bytes())
        self.assertEqual(set(backup['live_write_set']), installer.INITIAL_EDIT_WRITES | {installer.MAINTENANCE})
        self.assertEqual(backup['absent_before'], [installer.MAINTENANCE])
        for name, entry in backup['originals'].items():
            self.assertEqual(tree(self.backup / 'originals')[name], self.before[name])
            self.assertEqual(entry['sha256'], digest(self.before[name][0]))
        self.assertFalse((self.backup / 'verification-stage/state').exists())

    def test_update_default_and_invalid_modes_refuse_before_target(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')):
            with redirect_stdout(io.StringIO()):
                installer.main(['--update-initial-edit'])
            with self.assertRaisesRegex(installer.Refused, 'maintenance_approval_required'):
                installer.install(self.source, self.backup, Operations(self.source), update_initial_edit=True)
            for value in (1, None, 'true'):
                with self.assertRaisesRegex(installer.Refused, 'initial_edit_update_mode_invalid'):
                    installer.install(self.source, self.backup, Operations(self.source), approved=True, update_initial_edit=value)
        self.assertEqual(tree(self.source), self.before)

    def test_first_install_still_refuses_installed_helpers(self):
        with self.assertRaisesRegex(installer.Refused, 'unexpected_construction_file'):
            installer.install(self.source, self.backup, Operations(self.source), approved=True)
        self.assertEqual(tree(self.source), self.before)

    def test_missing_or_changed_installed_source_or_receipt_refuses_before_fence(self):
        for name in health.SOURCES | installer.RECEIPTS | {health.RECEIPT}:
            with self.subTest(name=name):
                path = self.source / name
                raw, mode = self.before[name]
                for value in (b'{}', None):
                    if value is None:
                        path.unlink()
                    else:
                        path.write_bytes(value)
                    try:
                        with self.assertRaises((ValueError, OSError, installer.Refused)):
                            self.install()
                        self.assertNotIn('fence', self.operations.events)
                    finally:
                        write(path, raw)
                        path.chmod(mode)

    def test_old_receipt_requires_each_of_the_four_real_gate_flags(self):
        path = self.source / health.RECEIPT
        proof = json.loads(path.read_bytes())
        for gate in installer.REQUIRED_GATES:
            for value in (False, 1, None):
                with self.subTest(gate=gate, value=value):
                    write(path, {**proof, gate: value})
                    with self.assertRaisesRegex(installer.Refused, 'installed_construction_receipt_refused'):
                        self.install()
                    self.assertNotIn('fence', self.operations.events)
        write(path, self.before[health.RECEIPT][0])

    def test_stage_gate_start_and_precommit_health_failures_restore_every_byte(self):
        for failure in ('verify', 'stage', 'missing-gate', 'start', 'health',
                        'stage-dependency', 'stage-addition', 'stage-mode', 'stage-symlink'):
            with self.subTest(failure=failure):
                self.backup = self.root / ('rollback-' + failure)
                outcome = self.install(failure)
                self.assertTrue(outcome['previous_source_restored'])
                self.assertFalse(outcome['activation_committed'])
                self.assertEqual(tree(self.source), self.before)

    def test_each_write_failure_before_and_after_effect_restores_exactly(self):
        actual = installer.base.atomic_write
        for after in (False, True):
            for target in installer.INITIAL_EDIT_WRITES:
                with self.subTest(target=target, after=after):
                    self.backup = self.root / ('write-' + str(after) + target.replace('/', '_'))
                    calls = []
                    def fail_once(path, *args, **kwargs):
                        if Path(path) == self.source / target and not calls:
                            calls.append(True)
                            if after:
                                actual(path, *args, **kwargs)
                            raise OSError('synthetic failed write')
                        return actual(path, *args, **kwargs)
                    with patch.object(installer.base, 'atomic_write', side_effect=fail_once):
                        outcome = self.install()
                        self.assertTrue(outcome['previous_source_restored'])
                    self.assertEqual(tree(self.source), self.before)

    def test_cancelled_history_requires_explicit_exact_consent_again(self):
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES (?, 'cancelled')", (CANCELLED,))
        before = tree(self.source)
        with self.assertRaises(original.fence.FenceRefused):
            self.install()
        self.assertEqual(tree(self.source), before)
        self.backup = self.root / 'wrong-identity'
        with self.assertRaises(original.fence.FenceRefused):
            self.install(allow_cancelled_cleanup=True,
                         expected_cancelled_job='00000000-0000-4000-8000-000000000002')
        self.assertEqual(tree(self.source), before)
        self.backup = self.root / 'approved-identity'
        self.assertTrue(self.install(allow_cancelled_cleanup=True,
                                    expected_cancelled_job=CANCELLED)['activation_committed'])
        self.assertEqual(tree(self.source)['state/jobs.sqlite'], before['state/jobs.sqlite'])

    def test_nonterminal_jobs_refuse_before_any_runtime_write(self):
        for state in ('queued', 'generating', 'unknown', None):
            with self.subTest(state=state):
                with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                    db.execute('UPDATE jobs SET state=?', (state,))
                self.backup = self.root / ('history-' + str(state))
                before = tree(self.source)
                with self.assertRaises(original.fence.FenceRefused):
                    self.install()
                self.assertEqual(tree(self.source), before)
                self.assertNotIn('synthetic-gates', self.operations.events)

    def test_unknown_concurrent_edits_are_preserved_and_block_activation(self):
        for failure in ('drift', 'receipt-drift', 'mode-drift', 'new-byte-drift',
                        'new-mode-drift', 'root-shadow', 'new-cancelled'):
            with self.subTest(failure=failure):
                self.restore_fixture()
                self.backup = self.root / ('drift-' + failure)
                with self.assertRaisesRegex(installer.Refused, 'recovery_required'):
                    self.install(failure)
                self.assertNotEqual(tree(self.source), self.before)
                self.assertNotIn('activation-latched', self.operations.events)
                if failure == 'root-shadow':
                    (self.source / 'json.py').unlink()

    def test_postactivation_uncertainty_never_rolls_back_or_restarts(self):
        for failure in ('final-health', 'latch'):
            with self.subTest(failure=failure):
                self.restore_fixture()
                self.backup = self.root / ('activation-' + failure)
                outcome = self.install(failure)
                self.assertIsNone(outcome['previous_source_restored'])
                self.assertEqual(self.operations.events.count('start'), 1)
                self.assertNotIn('rollback-fence', self.operations.events)

    def test_completed_update_refuses_a_second_application_before_fence(self):
        self.assertTrue(self.install()['activation_committed'])
        after = tree(self.source)
        self.backup = self.root / 'repeat'
        with self.assertRaisesRegex(ValueError, 'installed parser-fixed construction-v1'):
            self.install()
        self.assertNotIn('fence', self.operations.events)
        self.assertEqual(tree(self.source), after)

    def test_real_rollback_health_requires_exact_parser_fixed_predecessor_and_its_construction_health(self):
        operations = installer.Operations(self.source, self.root)
        operations.update_initial_edit = True
        with patch.object(operations, 'context_health') as current_health, \
             patch.object(installer.legacy.Operations, 'context_health',
                          side_effect=AssertionError('Pre-construction health is not valid rollback proof')):
            operations.previous_health()
            current_health.assert_called_once_with()
            current_health.reset_mock()
            (self.source / 'construction_payload.py').write_bytes(b'# unreviewed parser\n')
            with self.assertRaisesRegex(ValueError, 'installed parser-fixed construction-v1'):
                operations.previous_health()
            current_health.assert_not_called()


if __name__ == '__main__':
    unittest.main()
