"""Disposable helper-only transactions; doubles never claim real runtime proof."""
from contextlib import contextmanager, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
from upgrade_test_support import ANCESTOR, bootstrap
bootstrap()
import install_upgrade as installer
import upgrade_patch
import upgrade_fence


def digest(raw): return hashlib.sha256(raw).hexdigest()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else (json.dumps(value) + '\n').encode())

def tree(folder):
    return {path.relative_to(folder).as_posix(): (path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
            for path in folder.rglob('*') if path.is_file()}

def installed_sources():
    """Reconstruct public lineage, or verify a supplied installed-source fixture."""
    supplied = os.environ.get('MODEL_CONTEXT_INSTALLED')
    if supplied:
        original = {name: (Path(supplied) / name).read_bytes() for name in upgrade_patch.EXPECTED}
    else:
        for relative in ('model_completion', 'model_prebuild', 'model_budget_tiers'):
            sys.path.append(str(ANCESTOR / 'tools' / relative))
        import source_fixture, source_patch, reviewed_direct_export, prebuild_patch, tiers_patch
        import importlib.util
        path = ANCESTOR / 'tools/model_context/context_patch.py'
        spec = importlib.util.spec_from_file_location('historical_context_patch', path)
        old = importlib.util.module_from_spec(spec); spec.loader.exec_module(old)
        source = Path(os.environ.get('MODEL_COMPLETION_SOURCE', ROOT / '.model-completion-source/oracle_connector'))
        original = source_fixture.installed_sources(source)
        original['server.py'] = reviewed_direct_export.patch_server(original['server.py'].decode()).encode()
        original.update(source_patch.changes({name: original[name] for name in source_patch.EXPECTED},
                                             Path(installer.completion_policy.__file__).read_bytes()))
        original = prebuild_patch.changes({name: original[name] for name in prebuild_patch.EXPECTED},
                                         Path(installer.prebuild_policy.__file__).read_bytes())
        original = tiers_patch.changes(original, {name: (ANCESTOR / 'tools/model_budget_tiers' / name).read_bytes()
                                                for name in ('studio_pricing.py', 'terminal_budget.py')})
        original = old.changes(original, (ANCESTOR / 'tools/model_context/context_policy.py').read_bytes())
    upgrade_patch.reviewed_sources(original)
    return original


class Lease:
    def __init__(self, operations): self.operations = operations; self.activation_committed = False
    def assert_no_work(self):
        self.operations.events.append('empty')
        if self.operations.failure == 'cleanup': raise installer.Refused('cleanup_unconfirmed')
    def worker_identity(self): return {'MainPID': '123', 'InvocationID': 'fixture', 'NRestarts': '0'}
    def assert_worker_identity(self, identity):
        if identity != self.worker_identity(): raise installer.Refused('identity_changed')
    def confirm_activation_committed(self):
        self.activation_committed = True; self.operations.events.append('activation-latched')
        if self.operations.failure == 'latch': return False
        return True
    def confirm_healthy(self, identity): self.operations.events.append('healthy')


class Operations:
    def __init__(self, source, failure=None):
        self.source, self.failure, self.events = source, failure, []
        self.lease = Lease(self)
    def preflight(self):
        self.events.append('preflight')
        installer.validate_receipts(self.source, installer.original_sources(self.source))
    @contextmanager
    def quiesce(self):
        self.events.append('fence')
        with installer.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids) as ids:
            self.cancelled_job_ids = ids
        yield self.lease
    def verify_stage(self, stage, workspace, lease):
        self.events.append('synthetic-gates')
        assert not (stage / 'state').exists()
        assert not (stage / installer.policy.RECEIPT).exists()
        if self.failure == 'verify': raise installer.Refused('standard_pipeline_unverified')
        if self.failure == 'stage': (stage / 'context_policy.py').write_bytes(b'changed')
        if self.failure == 'drift': (self.source / 'server.py').write_bytes(b'unknown admin edit')
        if self.failure == 'mode-drift': (self.source / 'server.py').chmod(0o777)
        if self.failure == 'receipt-drift': (self.source / installer.prebuild_policy.RECEIPT).write_bytes(b'unknown receipt edit')
        proof = {'sources': {name: digest((stage / name).read_bytes()) for name in ('codex_runner.py', 'blender_mcp.py')},
                 'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True,
                 'fixture_only': True}
        write(stage / installer.base.RECEIPT, proof)
        return (stage / installer.base.RECEIPT).read_bytes()
    def start(self): self.events.append('start')
    @contextmanager
    def rollback_quiesce(self, expected, lease):
        self.events.append('rollback-fence'); lease.assert_no_work()
        with installer.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids): pass
        yield lease
    def context_health(self, maintenance=False):
        self.events.append('new-health')
        installer.validate_receipts(self.source, {name: (self.source / name).read_bytes() for name in upgrade_patch.EXPECTED}, installer.policy.REVISION)
        assert installer.policy.maintenance_active(self.source) is maintenance
        if self.failure == 'health' or self.failure == 'final-health' and not maintenance:
            raise installer.Refused('context_health_unverified')
        if self.failure == 'new-cancelled':
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                db.execute("INSERT INTO jobs VALUES ('00000000-0000-4000-8000-000000000002', 'cancelled')")
    def previous_health(self):
        self.events.append('old-health')
        installer.validate_receipts(self.source, installer.original_sources(self.source))


class UpgradeTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.sources = installed_sources()
    def setUp(self):
        # Disposable transactions simulate the neutral target environment;
        # separate adversarial tests prove ambient scope selectors refuse.
        clean = {key: value for key, value in os.environ.items() if key in (
            'PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR')}
        self.enterContext(patch.dict(os.environ, clean, clear=True))
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name); self.source = self.root / 'source'; self.source.mkdir()
        self.backup = self.root / 'backup'
        for name, raw in self.sources.items(): write(self.source / name, raw)
        # No fixture script/executable below is executed by these tests.
        for name in ('codex_smoke.py', 'runtime_check.py', 'install_codex.py', 'fast_preview.py', 'astra_spend.py'):
            write(self.source / name, b'# inert fixture\n')
        write(self.source / 'runtime/fixture.py', b'# inert fixture\n')
        hashes = dict(upgrade_patch.EXPECTED)
        for name, revision, coverage in (
            (installer.completion_policy.RECEIPT, installer.completion_policy.REVISION, installer.previous.prebuild_patch.EXPECTED),
            (installer.prebuild_policy.RECEIPT, installer.prebuild_policy.REVISION, set(hashes)-{'context_policy.py','studio_pricing.py','terminal_budget.py'}),
            (installer.studio_pricing.RECEIPT, installer.studio_pricing.REVISION, upgrade_patch.PRICING_EXPECTED),
            (installer.terminal_budget.RECEIPT, installer.terminal_budget.REVISION, upgrade_patch.PRICING_EXPECTED),
            (installer.policy.RECEIPT, upgrade_patch.OLD_REVISION, hashes)):
            proof = {'revision': revision, 'sha256': {key: hashes[key] for key in coverage},
                'maintenance_fence': installer.policy.FENCE_REVISION, 'cancelled_cleanup_interruption_approved': True,
                'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True, 'offline_standard_pipeline': True,
                'historical_extra': 'retain original fact'}
            write(self.source / name, proof); (self.source / name).chmod(0o640)
        write(self.source / installer.cache.legacy.RECEIPT, {'revision': installer.cache.legacy.REVISION,
              'sha256': {name: digest((self.source / name).read_bytes()) for name in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py')},
              'outputPolicy': {'revision': installer.cache.policy.REVISION, 'sha256': hashes['astra_spend_v2.py']}})
        write(self.source / installer.base.RECEIPT, {'sources': {name: hashes[name] for name in ('codex_runner.py', 'blender_mcp.py')},
              'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        for name in ('codex', 'codex-code-mode-host', 'codex-binary.json', 'code-mode-host.json'):
            write(self.source / 'tools/codex' / name, b'INERT, NEVER EXECUTED')
        write(self.source / 'state/config.json', {'token': 'synthetic-never-copied'})
        write(self.source / 'state/ai-provider.json', {'api_key': 'synthetic-never-copied'})
        for cents in (175, 200, 400):
            for name, raw in {'terms.json': json.dumps({'cents': cents}).encode(), 'budget-ledger.json': b'{"outstanding":12345}',
                    'seal.json': b'{"immutable":true}', 'candidate.glb': b'original model', 'blend.blend': b'original source'}.items():
                write(self.source / 'state/jobs' / str(cents) / name, raw)
        write(self.source / 'state/balance.json', {'balance': 9876})
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs(id TEXT,state TEXT)'); db.execute("INSERT INTO jobs VALUES ('fixture','failed')")
        (self.source / 'context_policy.py').chmod(0o640)
        self.before = tree(self.source)
        self.enterContext(patch.object(upgrade_patch, 'HELPER_SHA256', digest((HERE / 'context_policy.py').read_bytes())))
    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations, approved=True, **kwargs)
    def test_default_inert_and_approval_first(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('source read')):
            with redirect_stdout(io.StringIO()): installer.main([])
            with self.assertRaises(installer.Refused): installer.install(self.source, self.backup, Operations(self.source))
        self.assertEqual(tree(self.source), self.before)
    def test_helper_only_success_retains_every_other_byte_and_mode(self):
        result = self.install()
        self.assertTrue(result['activation_committed'])
        after = tree(self.source)
        self.assertEqual({name for name in after if after[name] != self.before.get(name)}, {'context_policy.py', installer.policy.RECEIPT})
        self.assertEqual(set(after), set(self.before))
        proof = json.loads(after[installer.policy.RECEIPT][0])
        self.assertFalse(proof['cancelled_cleanup_interruption_approved'])
        self.assertEqual(proof['predecessor_receipt_sha256'], digest(self.before[installer.policy.RECEIPT][0]))
        self.assertFalse((self.backup / 'verification-stage/state/config.json').exists())
        manifest = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_bytes())
        for name, entry in manifest['originals'].items():
            self.assertEqual(tree(self.backup / 'originals')[name], self.before[name])
            self.assertEqual(entry['sha256'], digest(self.before[name][0]))
            self.assertEqual(entry['mode'], self.before[name][1])
    def test_failures_before_activation_restore_every_byte_and_mode(self):
        for failure in ('verify','stage','health'):
            with self.subTest(failure=failure):
                self.backup = self.root / ('backup-' + failure)
                outcome = self.install(failure)
                self.assertTrue(outcome['previous_source_restored']); self.assertFalse(outcome['activation_committed'])
                self.assertEqual(tree(self.source), self.before)
    def test_each_transaction_write_failure_restores_exactly(self):
        actual = installer.base.atomic_write
        for target in ('context_policy.py', installer.policy.RECEIPT):
            with self.subTest(target=target):
                self.backup = self.root / ('backup-' + target)
                calls = []
                def fail_once(path, *args, **kwargs):
                    if Path(path) == self.source / target and not calls:
                        calls.append(True); raise OSError('synthetic failed write')
                    return actual(path, *args, **kwargs)
                with patch.object(installer.base, 'atomic_write', side_effect=fail_once): outcome = self.install()
                self.assertTrue(outcome['previous_source_restored']); self.assertEqual(tree(self.source), self.before)
    def test_possible_activation_never_rolls_back_or_starts_again(self):
        for failure in ('final-health','latch'):
            with self.subTest(failure=failure):
                # Restore disposable fixture between independent cases only.
                for name, (raw, mode) in self.before.items(): write(self.source / name, raw); (self.source / name).chmod(mode)
                marker = self.source / installer.policy.MAINTENANCE
                if marker.exists(): marker.unlink()
                self.backup = self.root / ('backup-' + failure)
                outcome = self.install(failure)
                self.assertIsNone(outcome['previous_source_restored'])
                self.assertEqual(self.operations.events.count('start'), 1)
                self.assertNotIn('rollback-fence', self.operations.events)
    def test_unlink_effect_then_exception_is_activation_unknown(self):
        actual = Path.unlink
        def unlink(path, *args, **kwargs):
            actual(path, *args, **kwargs)
            if path == self.source / installer.policy.MAINTENANCE: raise OSError('lost acknowledgment')
        with patch.object(Path, 'unlink', unlink): outcome = self.install()
        self.assertIsNone(outcome['activation_committed']); self.assertIsNone(outcome['previous_source_restored'])
        self.assertNotIn('rollback-fence', self.operations.events)
    def test_current_cancellation_needs_fresh_separate_consent(self):
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES ('00000000-0000-4000-8000-000000000001', 'cancelled')")
        before = tree(self.source)
        with self.assertRaises(upgrade_fence.FenceRefused): self.install()
        self.assertEqual(tree(self.source), before)
        self.backup = self.root / 'explicit-backup'
        self.assertTrue(self.install(allow_cancelled_cleanup=True)['activation_committed'])
        self.assertEqual(self.operations.cancelled_job_ids, ('00000000-0000-4000-8000-000000000001',))
    def test_unknown_nonterminal_and_null_history_refused(self):
        for state in ('queued','generating','unknown',None):
            with self.subTest(state=state):
                with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                    db.execute('UPDATE jobs SET state=?', (state,))
                self.backup = self.root / ('blocked-' + str(state))
                before = tree(self.source)
                with self.assertRaises(upgrade_fence.FenceRefused): self.install(allow_cancelled_cleanup=True)
                self.assertEqual(tree(self.source), before)
    def test_source_and_receipt_drift_never_overwritten_as_known_original(self):
        for failure in ('drift', 'receipt-drift', 'mode-drift'):
            with self.subTest(failure=failure):
                for name, (raw, mode) in self.before.items(): write(self.source / name, raw); (self.source / name).chmod(mode)
                self.backup = self.root / ('backup-' + failure)
                with self.assertRaisesRegex(installer.Refused,'recovery_required'): self.install(failure)
                self.assertNotEqual(tree(self.source), self.before)
                self.assertNotIn('start', self.operations.events)
    def test_cleanup_uncertainty_never_restarts(self):
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'): self.install('cleanup')
        self.assertEqual(tree(self.source), self.before)
        self.assertNotIn('start', self.operations.events)
    def test_new_cancellation_while_marked_requires_recovery_without_activation(self):
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'): self.install('new-cancelled')
        self.assertTrue((self.source / installer.policy.MAINTENANCE).exists())
        self.assertNotIn('activation-latched', self.operations.events)
        self.assertEqual(self.operations.events.count('start'), 1)
    def test_every_source_and_receipt_mismatch_refused_before_fence(self):
        names = set(upgrade_patch.EXPECTED) | {installer.policy.RECEIPT, installer.base.RECEIPT,
            installer.completion_policy.RECEIPT, installer.prebuild_policy.RECEIPT,
            installer.studio_pricing.RECEIPT, installer.terminal_budget.RECEIPT, installer.cache.legacy.RECEIPT}
        for name in names:
            with self.subTest(name=name):
                raw, mode = self.before[name]
                write(self.source / name, raw + b'\n' if name.endswith('.py') else b'{}')
                try:
                    with self.assertRaises((ValueError, installer.Refused)): self.install()
                    self.assertNotIn('fence', self.operations.events)
                finally: write(self.source / name, raw); (self.source / name).chmod(mode)


if __name__ == '__main__': unittest.main()
