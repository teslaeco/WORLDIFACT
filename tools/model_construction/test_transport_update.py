"""Transport installation fixtures exercise every write rollback, never live work."""
import json
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch

import test_construction_transaction as original

installer, manifest, health = original.installer, original.manifest, original.health
write, tree, digest = original.write, original.tree, original.digest


class Operations(original.Operations):
    def preflight(self):
        self.events.append('preflight')
        installer.validate_installed_receipts(self.source,
            installer.installed_sources(self.source, transport=True), transport=True)

    def start(self):
        self.events.append('start')
        if self.failure == 'start' and self.events.count('start') == 1:
            raise installer.Refused('synthetic_start_failure')

    def previous_health(self):
        self.events.append('old-health')
        self.preflight()


class TransportTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        original.ConstructionTransactions.setUpClass.__func__(cls)

    def setUp(self):
        original.ConstructionTransactions.setUp(self)
        receipts = {name: (self.source / name).read_bytes() for name in installer.RECEIPTS}
        generic = installer.encoded({'sources': {name: digest(self.after[name])
            for name in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True,
            'blender_build_roundtrip': True, 'fixture_only': True})
        receipts = installer.rebound_receipts(receipts, self.after,
            installer.GateEvidence(generic, installer.REQUIRED_GATES), False)
        for name, raw in {**self.after, **receipts}.items():
            write(self.source / name, raw)
        for name in installer.TRANSPORT_WRITES:
            (self.source / name).chmod(0o640)
        self.before = tree(self.source)

    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations,
                                 approved=True, update_transport=True, **kwargs)

    def test_exact_transport_write_set_preserves_state_and_attests_completed_gates(self):
        calls, actual = [], installer.base.atomic_write
        def record(path, *args, **kwargs):
            if self.source in Path(path).parents:
                calls.append(Path(path).relative_to(self.source).as_posix())
            return actual(path, *args, **kwargs)
        with patch.object(installer.base, 'atomic_write', side_effect=record):
            outcome = self.install()
        self.assertTrue(outcome['activation_committed'])
        self.assertFalse(outcome['paid_generation_requested'])
        self.assertCountEqual(calls, installer.TRANSPORT_WRITES)
        after = tree(self.source)
        self.assertEqual(set(after), set(self.before))
        for name in after:
            self.assertEqual(after[name][1], self.before[name][1])
            if name not in installer.TRANSPORT_WRITES:
                self.assertEqual(after[name], self.before[name])
        proof = json.loads(after[health.RECEIPT][0])
        self.assertEqual(proof['sha256'], manifest.transport_manifest())
        self.assertEqual(proof['transport_repair']['previous_construction_receipt_sha256'],
                         digest(self.before[health.RECEIPT][0]))
        self.assertEqual(health.verified_health(self.source), {'worldifactStandardConstructionPolicy': health.REVISION})
        self.assertFalse((self.backup / 'verification-stage/state').exists())

    def test_missing_changed_or_forged_source_and_receipt_refuse_before_fence(self):
        for name in health.SOURCES | installer.RECEIPTS | {health.RECEIPT}:
            with self.subTest(name=name):
                path = self.source / name
                raw, mode = self.before[name]
                path.write_bytes(b'{}')
                try:
                    with self.assertRaises((ValueError, OSError, installer.Refused)):
                        self.install()
                    self.assertNotIn('fence', self.operations.events)
                finally:
                    write(path, raw); path.chmod(mode)

    def test_each_write_failure_and_lost_ack_restores_every_byte(self):
        actual = installer.base.atomic_write
        for after in (False, True):
            for index, target in enumerate(installer.TRANSPORT_WRITES):
                with self.subTest(after=after, target=target):
                    self.backup = self.root / ('write-' + str(after) + '-' + str(index))
                    fired = []
                    def fail(path, *args, **kwargs):
                        if Path(path) == self.source / target and not fired:
                            fired.append(True)
                            if after: actual(path, *args, **kwargs)
                            raise OSError('synthetic write failure')
                        return actual(path, *args, **kwargs)
                    with patch.object(installer.base, 'atomic_write', side_effect=fail):
                        outcome = self.install()
                    self.assertTrue(fired)
                    self.assertTrue(outcome['previous_source_restored'])
                    self.assertFalse(outcome['activation_committed'])
                    self.assertEqual(tree(self.source), self.before)

    def test_offline_gate_start_and_precommit_health_failure_roll_back(self):
        for failure in ('verify', 'stage', 'missing-gate', 'start', 'health', 'stage-dependency'):
            with self.subTest(failure=failure):
                self.backup = self.root / ('failed-' + failure)
                outcome = self.install(failure)
                self.assertTrue(outcome['previous_source_restored'])
                self.assertFalse(outcome['activation_committed'])
                self.assertEqual(tree(self.source), self.before)

    def test_active_unknown_or_cancelled_jobs_are_not_deleted_or_cancelled(self):
        for state in ('queued', 'generating', 'cancelled', 'unknown', None):
            with self.subTest(state=state):
                with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                    db.execute('UPDATE jobs SET state=?', (state,))
                before = tree(self.source)
                self.backup = self.root / ('busy-' + str(state))
                with self.assertRaises(original.fence.FenceRefused): self.install()
                self.assertEqual(tree(self.source), before)
                self.assertNotIn('start', self.operations.events)

    def test_ambiguous_activation_is_not_rolled_back_or_repeated(self):
        outcome = self.install('latch')
        self.assertEqual(outcome['phase'], installer.FAILURE)
        self.assertIsNone(outcome['previous_source_restored'])
        self.assertNotIn('rollback-fence', self.operations.events)
        self.assertEqual(self.operations.events.count('start'), 1)

    def test_repeat_refuses_instead_of_reapplying(self):
        self.install()
        after = tree(self.source)
        self.backup = self.root / 'repeat'
        with self.assertRaises((ValueError, installer.Refused)): self.install()
        self.assertNotIn('fence', self.operations.events)
        self.assertEqual(tree(self.source), after)

    def test_mode_cannot_enable_other_updates(self):
        for mode in ('update_payload', 'update_initial_edit', 'update_response_phase'):
            with self.assertRaisesRegex(installer.Refused, 'conflicting_update_modes'):
                self.install(**{mode: True})
        with self.assertRaisesRegex(installer.Refused, 'maintenance_approval_required'):
            installer.install(self.source, self.backup, object(), update_transport=True)
        self.assertEqual(tree(self.source), self.before)


if __name__ == '__main__':
    unittest.main()
