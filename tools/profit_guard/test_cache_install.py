"""Maintenance transaction fixtures; no production VM or provider access."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install as previous
import install_tuning as tuning
import install_cache_accounting as update
import astra_spend as legacy
import astra_spend_v2 as policy


class FakeOperations:
    def __init__(self, failure=None):
        self.failure, self.events = failure, []
    def preflight(self):
        self.events.append('preflight')
        if self.failure == 'active': raise update.base.InstallError('Active job')
    @contextlib.contextmanager
    def quiesce(self):
        self.events.append('quiesce'); yield
    def assert_idle(self): self.events.append('idle')
    def verify(self, workspace):
        self.events.append('verify')
        if self.failure == 'verify': raise RuntimeError('Fixture offline failure')
    def start(self): self.events.append('start')
    def stop(self): self.events.append('stop')
    def health(self, enabled): self.events.append('health')


class CacheInstallTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / 'worker'; self.source.mkdir()
        self.old = b'# reviewed old fixture policy\n'
        self.original = {update.POLICY_FILE: self.old,
                         'codex_runner.py': b'# protected runner\n', 'fast_preview.py': b'# protected profile\n',
                         'astra_spend.py': b'# protected ledger\n', update.base.RECEIPT: b'{"runtime":"original"}\n'}
        self.original[legacy.RECEIPT] = json.dumps({'revision': legacy.REVISION,
            'outputPolicy': {'revision': policy.REVISION, 'sha256': hashlib.sha256(self.old).hexdigest()}}).encode()
        for name, raw in self.original.items():
            p = self.source / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(raw)
        self.model = self.source / 'state/jobs/original.glb'; self.model.parent.mkdir(parents=True); self.model.write_bytes(b'ORIGINAL_MODEL')
        self.funds = self.source / 'state/funds.json'; self.funds.write_bytes(b'{"held":1600000}')
        self.addCleanup(patch.stopall)
        patch.object(update, 'OLD_POLICY_BLOB', update.base.blob_sha(self.old)).start()
        self.health = patch.object(update, 'check_health').start()
        patch.object(tuning, 'check_health').start()

    def preserved(self):
        self.assertEqual(self.model.read_bytes(), b'ORIGINAL_MODEL')
        self.assertEqual(self.funds.read_bytes(), b'{"held":1600000}')
        for name in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py'):
            self.assertEqual((self.source / name).read_bytes(), self.original[name])

    def test_explicit_approval_is_required_before_any_read_or_change(self):
        ops = FakeOperations()
        with patch.object(update.base, 'read_regular', side_effect=AssertionError('No read')):
            with self.assertRaises(update.base.InstallError): update.install(self.source, self.root / 'backup', ops)
        self.assertEqual(ops.events, [])

    def test_default_cli_does_not_install_connect_or_restart(self):
        with patch('sys.argv', ['install_cache_accounting.py']), patch.object(update, 'install') as install, contextlib.redirect_stdout(io.StringIO()):
            update.main(); install.assert_not_called()

    def test_idle_update_changes_only_helper_and_hash_receipt(self):
        ops = FakeOperations()
        result = update.install(self.source, self.root / 'backup', ops, approved=True)
        self.assertEqual(result['phase'], 'CACHE_ACCOUNTING_VERIFIED')
        self.assertFalse(result['payment_settings_changed']); self.assertFalse(result['paid_generation_requested'])
        self.assertEqual(result['max_provider_usd'], 1.75)
        self.assertEqual((self.source / update.POLICY_FILE).read_bytes(), Path(policy.__file__).read_bytes())
        receipt = json.loads((self.source / legacy.RECEIPT).read_bytes())
        self.assertEqual(receipt['outputPolicy']['sha256'], hashlib.sha256(Path(policy.__file__).read_bytes()).hexdigest())
        self.assertEqual(ops.events, ['preflight', 'quiesce', 'idle', 'verify', 'start', 'health'])
        self.preserved()

    def test_offline_failure_restores_original_helper_and_receipts(self):
        ops = FakeOperations('verify')
        with self.assertRaises(update.base.InstallError): update.install(self.source, self.root / 'backup', ops, approved=True)
        for name, raw in self.original.items(): self.assertEqual((self.source / name).read_bytes(), raw)
        self.assertEqual(ops.events[-3:], ['stop', 'start', 'health'])
        self.preserved()

    def test_failed_current_runtime_proof_rolls_back_not_claims_success(self):
        self.health.side_effect = RuntimeError('Fixture cache flag missing')
        with self.assertRaises(update.base.InstallError): update.install(self.source, self.root / 'backup', FakeOperations(), approved=True)
        for name, raw in self.original.items(): self.assertEqual((self.source / name).read_bytes(), raw)
        self.preserved()

    def test_active_model_is_not_cancelled_or_restarted(self):
        ops = FakeOperations('active')
        with self.assertRaises(update.base.InstallError): update.install(self.source, self.root / 'backup', ops, approved=True)
        self.assertEqual(ops.events, ['preflight']); self.assertFalse((self.root / 'backup').exists())
        self.preserved()

    def test_unknown_installed_helper_stops_without_change(self):
        (self.source / update.POLICY_FILE).write_bytes(b'# unreviewed\n')
        ops = FakeOperations()
        with self.assertRaises(update.base.InstallError): update.install(self.source, self.root / 'backup', ops, approved=True)
        self.assertNotIn('quiesce', ops.events); self.assertFalse((self.root / 'backup').exists())
        self.assertEqual((self.source / update.POLICY_FILE).read_bytes(), b'# unreviewed\n')

    def test_existing_backup_and_inside_worker_backup_are_rejected(self):
        for target in (self.source / 'backup', self.source, self.root):
            with self.assertRaises(update.base.InstallError): update.install(self.source, target, FakeOperations(), approved=True)
        self.preserved()

    def test_repeat_install_checks_live_marker_but_does_not_rewrite_or_restart(self):
        update.install(self.source, self.root / 'backup', FakeOperations(), approved=True)
        ops = FakeOperations()
        with patch.object(policy, 'verified_health', return_value={'reviewed': True}):
            result = update.install(self.source, self.root / 'again', ops, approved=True)
        self.assertEqual(result['phase'], 'ALREADY_VERIFIED'); self.assertEqual(ops.events, [])
        self.assertFalse((self.root / 'again').exists()); self.preserved()

    def test_symlink_backup_path_is_rejected(self):
        target = self.root / 'symlink'; target.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(update.base.InstallError): update.install(self.source, target / 'backup', FakeOperations(), approved=True)
        self.preserved()


@unittest.skipUnless(os.environ.get('FAST_INSTALLED_FIXTURE'), 'Real ancestor is reconstructed in the existing guard CI')
class ExactCacheUpdaterTests(unittest.TestCase):
    def test_exact_installed_v2_source_round_trip_is_required_before_maintenance(self):
        source = Path(os.environ['FAST_INSTALLED_FIXTURE'])
        prior = {name: (source / name).read_bytes() for name in previous.EXPECTED}
        v1 = previous.changes(prior, Path(legacy.__file__).read_bytes())
        v2 = tuning.changes({name: v1[name] for name in previous.EXPECTED}, Path(policy.__file__).read_bytes())
        current = {name: v2[name] for name in previous.EXPECTED}
        self.assertEqual(update.reviewed_installed_variant(current), 'FAST_V33_WITH_SPEND')
        bad = {**current, 'codex_runner.py': current['codex_runner.py'] + b'# unreviewed\n'}
        with self.assertRaises(update.base.InstallError): update.reviewed_installed_variant(bad)


if __name__ == '__main__': unittest.main()
