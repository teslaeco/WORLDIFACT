"""Exact decoder-only upgrade; fixture transactions never imply live installation."""
from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch

import test_construction_transaction as original
import oracle_construction_launch as launcher

installer, manifest, health = original.installer, original.manifest, original.health
write, tree, digest = original.write, original.tree, original.digest


class UpdateBoundaryTests(unittest.TestCase):
    def test_complete_predecessor_and_single_decoder_write_are_compiled_authority(self):
        before, after = manifest.response_phase_predecessor(), manifest.final_manifest()
        self.assertEqual(set(before), health.SOURCES)
        self.assertEqual(before['construction_payload.py'],
            '475e8251a2255775889d00d0611bb8954044cfd7f2dfba27c6735403408c35b8')
        self.assertEqual({name for name in before if before[name] != after[name]},
                         {'construction_payload.py'})
        self.assertEqual(installer.RESPONSE_PHASE_WRITES,
                         {'construction_payload.py', health.RECEIPT})
        self.assertTrue(manifest.reviewed_manifest(before))
        self.assertTrue(manifest.reviewed_manifest(after))
        for bad in (after, {**before, 'server.py': '0' * 64},
                    {**before, 'extra.py': 'a' * 64}, {**before, 'construction_payload.py': None}):
            with self.subTest(bad=bad), patch.object(manifest, 'RESPONSE_PHASE_BEFORE', bad):
                with self.assertRaises(ValueError):
                    manifest.response_phase_predecessor()

    def test_no_implicit_update_or_new_permission_from_old_mode(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')), \
             patch.object(installer, 'frozen_dependencies', side_effect=AssertionError('package read')), \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            installer.main(['--update-response-phase'])
            with self.assertRaisesRegex(installer.Refused, 'maintenance_approval_required'):
                installer.install(Path('/unused'), Path('/unused-backup'), object(), update_response_phase=True)
            for value in (1, None, 'true'):
                with self.assertRaisesRegex(installer.Refused, 'response_phase_update_mode_invalid'):
                    installer.install(Path('/unused'), Path('/unused-backup'), object(),
                                      approved=True, update_response_phase=value)
            for other in ('update_initial_edit', 'update_payload'):
                with self.assertRaisesRegex(installer.Refused, 'conflicting_update_modes'):
                    installer.install(Path('/unused'), Path('/unused-backup'), object(),
                        approved=True, update_response_phase=True, **{other: True})
                with self.assertRaises(SystemExit):
                    installer.main(['--update-response-phase', '--' + other.replace('_', '-')])

    def test_launcher_threads_only_the_explicit_new_mode_without_cleanup_consent(self):
        observed = {'phase': 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED'}
        with patch.object(launcher, 'package', return_value='inert'), \
             patch.object(launcher, 'connection', return_value=['INERT']), \
             patch.object(launcher, 'invoke', return_value=observed) as invoke, \
             redirect_stdout(io.StringIO()):
            launcher.main(['--source-commit', 'a' * 40, '--approve-service-maintenance',
                           '--update-response-phase'])
        program = invoke.call_args.args[1]
        self.assertIn('UPDATE_RESPONSE_PHASE=True', program)
        self.assertIn('UPDATE_INITIAL_EDIT=False', program)
        self.assertIn('ALLOW_CANCELLED_CLEANUP=False', program)
        self.assertIn('EXPECTED_CANCELLED_JOB=None', program)
        self.assertIn("(['--update-response-phase'] if UPDATE_RESPONSE_PHASE else [])", program)
        compile(program, 'phase-updater-wrapper', 'exec')
        with patch.object(launcher, 'package', side_effect=AssertionError('download')), \
             patch.object(launcher, 'connection', side_effect=AssertionError('connection')), \
             redirect_stdout(io.StringIO()):
            launcher.main(['--update-response-phase'])
        for value in (1, None, 'true'):
            with self.assertRaises(launcher.LaunchError):
                launcher.script('inert', approved=True, update_response_phase=value)
        for other in ('update_initial_edit', 'update_payload'):
            with self.assertRaises(launcher.LaunchError):
                launcher.script('inert', approved=True, update_response_phase=True, **{other: True})


class Operations(original.Operations):
    def preflight(self):
        self.events.append('preflight')
        installer.validate_installed_receipts(self.source,
            installer.installed_sources(self.source, response_phase=True), response_phase=True)

    def start(self):
        self.events.append('start')
        if self.failure == 'start' and self.events.count('start') == 1:
            raise installer.Refused('synthetic_start_failure')

    def previous_health(self):
        self.events.append('old-health')
        installer.validate_installed_receipts(self.source,
            installer.installed_sources(self.source, response_phase=True), response_phase=True)


class ResponsePhaseTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        original.ConstructionTransactions.setUpClass.__func__(cls)

    def setUp(self):
        original.ConstructionTransactions.setUp(self)
        self.installed = {**self.after, 'construction_payload.py': b'# inert old decoder fixture\n'}
        self.predecessor = {name: digest(raw) for name, raw in self.installed.items()}
        original.enter_context(self, patch.object(manifest, 'RESPONSE_PHASE_BEFORE', self.predecessor))
        receipts = {name: (self.source / name).read_bytes() for name in installer.RECEIPTS}
        generic = installer.encoded({'sources': {name: self.predecessor[name]
            for name in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True,
            'fixture_only': True, 'historical_extra': 'preserve original fact'})
        evidence = installer.GateEvidence(generic, installer.REQUIRED_GATES)
        with patch.object(manifest, 'EXPECTED_AFTER', self.predecessor):
            receipts = installer.rebound_receipts(receipts, self.installed, evidence, True)
        proof = json.loads(receipts[health.RECEIPT])
        proof['initial_edit_update'] = {'revision': 'typed-plan-initial-edit-v1',
            'previous_construction_receipt_sha256': 'a' * 64, 'verified_generic_receipt_sha256': 'b' * 64}
        receipts[health.RECEIPT] = installer.encoded(proof)
        for name, raw in {**self.installed, **receipts}.items():
            write(self.source / name, raw)
        for name in installer.RESPONSE_PHASE_WRITES:
            (self.source / name).chmod(0o640)
        self.before = tree(self.source)

    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations,
                                 approved=True, update_response_phase=True, **kwargs)

    def test_exact_two_writes_keep_old_receipts_models_jobs_and_modes(self):
        calls, actual = [], installer.base.atomic_write
        def record(path, *args, **kwargs):
            if self.source in Path(path).parents:
                calls.append(Path(path).relative_to(self.source).as_posix())
            return actual(path, *args, **kwargs)
        with patch.object(installer.base, 'atomic_write', side_effect=record):
            outcome = self.install()
        self.assertTrue(outcome['activation_committed'])
        self.assertFalse(outcome['paid_generation_requested'])
        self.assertCountEqual(calls, installer.RESPONSE_PHASE_WRITES)
        after = tree(self.source)
        self.assertEqual(set(after), set(self.before))
        self.assertEqual({name for name in after if after[name] != self.before[name]},
                         installer.RESPONSE_PHASE_WRITES)
        for name in after:
            self.assertEqual(after[name][1], self.before[name][1])
        proof, old = json.loads(after[health.RECEIPT][0]), json.loads(self.before[health.RECEIPT][0])
        self.assertEqual(proof['receipt_sha256'], old['receipt_sha256'])
        self.assertEqual(proof['initial_edit_update'], old['initial_edit_update'])
        self.assertEqual(proof['sha256'], self.expected)
        self.assertEqual(proof['response_phase_update']['revision'], 'final-answer-selection-v1')
        self.assertEqual(proof['response_phase_update']['previous_construction_receipt_sha256'],
                         digest(self.before[health.RECEIPT][0]))
        witness = (self.backup / 'RESPONSE_PHASE_UPDATE_GENERIC_EVIDENCE.json').read_bytes()
        self.assertEqual(proof['response_phase_update']['verified_generic_receipt_sha256'], digest(witness))
        self.assertTrue(all(proof[gate] is True for gate in installer.REQUIRED_GATES))
        self.assertEqual(health.verified_health(self.source), {'worldifactStandardConstructionPolicy': health.REVISION})
        backup = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_bytes())
        self.assertEqual(set(backup['live_write_set']), installer.RESPONSE_PHASE_WRITES | {installer.MAINTENANCE})
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
            for target in installer.RESPONSE_PHASE_WRITES:
                with self.subTest(after=after, target=target):
                    self.backup = self.root / ('write-' + str(after) + '-' + target)
                    fired = []
                    def fail(path, *args, **kwargs):
                        if Path(path) == self.source / target and not fired:
                            fired.append(True)
                            if after:
                                actual(path, *args, **kwargs)
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
                with self.assertRaises(original.fence.FenceRefused):
                    self.install()
                self.assertEqual(tree(self.source), before)
                self.assertNotIn('start', self.operations.events)

    def test_ambiguous_activation_is_not_rolled_back_or_repeated(self):
        outcome = self.install('latch')
        self.assertEqual(outcome['phase'], installer.FAILURE)
        self.assertIsNone(outcome['previous_source_restored'])
        self.assertNotIn('rollback-fence', self.operations.events)
        self.assertEqual(self.operations.events.count('start'), 1)

    def test_repeat_and_wrong_upgrade_mode_refuse_instead_of_reapplying(self):
        self.install()
        after = tree(self.source)
        self.backup = self.root / 'repeat'
        with self.assertRaises((ValueError, installer.Refused)):
            self.install()
        self.assertNotIn('fence', self.operations.events)
        self.assertEqual(tree(self.source), after)


if __name__ == '__main__':
    unittest.main()
