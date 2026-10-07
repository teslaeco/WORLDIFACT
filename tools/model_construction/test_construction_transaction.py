"""Disposable complete transactions; synthetic gates never claim live proof."""
from contextlib import contextmanager, redirect_stdout
from copy import deepcopy
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
sys.path.insert(0, str(HERE.parents[1] / 'tools/model_context_upgrade'))
import test_upgrade_transaction as lineage
import construction_health as health
import construction_manifest as manifest
import construction_fence as fence
import install_construction as installer
import runtime_patch

write, tree, digest = lineage.write, lineage.tree, lineage.digest
CANCELLED = '00000000-0000-4000-8000-000000000001'


def enter_context(test, manager):
    """Equivalent fixture cleanup on the runtime's supported Python 3.9+."""
    value = manager.__enter__()
    test.addCleanup(manager.__exit__, None, None, None)
    return value


class Lease(lineage.Lease):
    pass


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
        assert not (stage / health.RECEIPT).exists()
        if self.failure == 'verify': raise installer.Refused('construction_pipeline_unverified')
        if self.failure == 'stage': (stage / 'context_policy.py').write_bytes(b'changed')
        if self.failure == 'drift': (self.source / 'server.py').write_bytes(b'unknown admin edit')
        if self.failure == 'mode-drift': (self.source / 'server.py').chmod(0o777)
        if self.failure == 'receipt-drift': (self.source / '.worldifact-prebuild.json').write_bytes(b'unknown receipt edit')
        if self.failure == 'new-file': (self.source / 'runtime_controller.py').write_bytes(b'unknown admin file')
        if self.failure == 'root-shadow': (self.source / 'json.py').write_bytes(b'# unknown root shadow')
        if self.failure == 'package-shadow': write(self.source / 'json/__init__.py', b'# unknown import package')
        if self.failure == 'nested-runtime': write(self.source / 'runtime/new/package.py', b'# unknown nested dependency')
        if self.failure == 'runtime-symlink': (self.source / 'runtime/new').symlink_to(self.source / 'state', target_is_directory=True)
        if self.failure == 'stage-dependency': (stage / 'runtime/fixture.py').write_bytes(b'# changed staged dependency')
        if self.failure == 'stage-addition': write(stage / 'runtime/new/package.py', b'# added staged dependency')
        if self.failure == 'stage-mode': (stage / 'runtime/fixture.py').chmod(0o777)
        if self.failure == 'stage-symlink': (stage / 'runtime/new').symlink_to(stage / 'runtime', target_is_directory=True)
        if self.failure == 'tool-mode-drift': (self.source / 'tools/codex/codex').chmod(0o777)
        proof = {'sources': {name: digest((stage / name).read_bytes()) for name in ('codex_runner.py', 'blender_mcp.py')},
                 'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True,
                 'fixture_only': True}
        write(stage / health.GENERIC_RECEIPT, proof)
        gates = installer.REQUIRED_GATES - {'offline_standard_pipeline'} if self.failure == 'missing-gate' else installer.REQUIRED_GATES
        return installer.GateEvidence((stage / health.GENERIC_RECEIPT).read_bytes(), gates)
    def start(self): self.events.append('start')
    @contextmanager
    def rollback_quiesce(self, expected, lease):
        self.events.append('rollback-fence'); lease.assert_no_work()
        with installer.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids): pass
        yield lease
    def context_health(self, maintenance=False):
        self.events.append('new-health')
        assert health.verified_health(self.source) == {'worldifactStandardConstructionPolicy': health.REVISION}
        assert installer.legacy.policy.maintenance_active(self.source) is maintenance
        if self.failure == 'health' or self.failure == 'final-health' and not maintenance:
            raise installer.Refused('construction_health_unverified')
        if self.failure == 'new-mode-drift':
            (self.source / 'runtime_controller.py').chmod(0o777)
            raise installer.Refused('construction_health_unverified')
        if self.failure == 'new-byte-drift':
            (self.source / 'runtime_controller.py').write_bytes(b'concurrent admin replacement')
            raise installer.Refused('construction_health_unverified')
        if self.failure == 'replace-cancelled':
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                db.execute("UPDATE jobs SET id='00000000-0000-4000-8000-000000000002' WHERE state='cancelled'")
        if self.failure == 'new-cancelled':
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
                db.execute("INSERT INTO jobs VALUES ('00000000-0000-4000-8000-000000000002', 'cancelled')")
        if self.failure == 'late-shadow': (self.source / 'json.py').write_bytes(b'# late admin import shadow')
    def previous_health(self):
        self.events.append('old-health')
        installer.validate_receipts(self.source, installer.original_sources(self.source))


class ConstructionTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = lineage.installed_sources()
        cls.sources['context_policy.py'] = (HERE.parents[1] / 'tools/model_context_upgrade/context_policy.py').read_bytes()
        manifest.reviewed_sources(cls.sources)

    def setUp(self):
        clean = {key: value for key, value in os.environ.items() if key in
                 ('PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR')}
        enter_context(self, patch.dict(os.environ, clean, clear=True))
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name); self.source = self.root / 'source'; self.source.mkdir()
        self.backup = self.root / 'backup'
        self.helpers = {name: (HERE / name).read_bytes() for name in manifest.HELPERS}
        self.after = runtime_patch.changes(self.sources, self.helpers)
        self.expected = {name: digest(raw) for name, raw in self.after.items()}
        enter_context(self, patch.object(manifest, 'EXPECTED_AFTER', self.expected))
        for name, raw in self.sources.items(): write(self.source / name, raw)
        for name in ('codex_smoke.py','runtime_check.py','install_codex.py','fast_preview.py','astra_spend.py'):
            write(self.source / name, b'# inert fixture, never executed\n')
        write(self.source / 'runtime/fixture.py', b'# inert fixture\n')
        for name, (revision, coverage) in health.CHAIN_LAYOUT.items():
            proof = {'revision': revision, 'sha256': {key: manifest.EXPECTED[key] for key in coverage},
                'maintenance_fence': health.FENCE_REVISION, 'cancelled_cleanup_interruption_approved': True,
                'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True, 'offline_standard_pipeline': True,
                'historical_extra': 'retain original fact'}
            write(self.source / name, proof); (self.source / name).chmod(0o640)
        write(self.source / health.GUARD_RECEIPT, {'revision': 'astra-usd175-v1',
              'sha256': {name: digest((self.source / name).read_bytes()) for name in ('codex_runner.py','fast_preview.py','astra_spend.py')},
              'outputPolicy': {'revision': 'astra-low-reconciled-v2', 'sha256': manifest.EXPECTED['astra_spend_v2.py']},
              'original_extra': 'keep'})
        write(self.source / health.GENERIC_RECEIPT, {'sources': {name: manifest.EXPECTED[name] for name in ('codex_runner.py','blender_mcp.py')},
              'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        for name in ('codex','codex-code-mode-host','codex-binary.json','code-mode-host.json'):
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

    def install(self, failure=None, **kwargs):
        self.operations = Operations(self.source, failure)
        return installer.install(self.source, self.backup, self.operations, approved=True, **kwargs)

    def restore_fixture(self):
        for name in installer.NEW_FILES | {installer.MAINTENANCE}:
            path = self.source / name
            if path.exists() or path.is_symlink(): path.unlink()
        for name, (raw, mode) in self.before.items():
            write(self.source / name, raw); (self.source / name).chmod(mode)

    def test_default_inert_approval_and_unfrozen_refuse_before_target(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')):
            with redirect_stdout(io.StringIO()): installer.main([])
            with self.assertRaises(installer.Refused): installer.install(self.source, self.backup, Operations(self.source))
            with patch.object(manifest, 'EXPECTED_AFTER', {name:'UNFROZEN_REFUSE' for name in health.SOURCES}):
                with self.assertRaisesRegex(ValueError, 'not frozen'): self.install()
        self.assertEqual(tree(self.source), self.before)

    def test_success_exactly_sixteen_writes_preserves_state_and_modes(self):
        self.assertEqual(len(installer.WRITES), 16)
        result = self.install()
        self.assertTrue(result['activation_committed'])
        after = tree(self.source)
        self.assertEqual({name for name in after if after[name] != self.before.get(name)}, installer.WRITES)
        self.assertEqual(set(after) - set(self.before), installer.NEW_FILES)
        for name in self.before:
            if name not in installer.WRITES: self.assertEqual(after[name], self.before[name])
            else: self.assertEqual(after[name][1], self.before[name][1])
        self.assertEqual(health.verified_health(self.source), {'worldifactStandardConstructionPolicy': health.REVISION})
        proof = json.loads(after[health.RECEIPT][0])
        self.assertFalse(proof['cancelled_cleanup_interruption_approved'])
        self.assertEqual(proof['predecessor_receipt_sha256'], digest(self.before[installer.legacy.policy.RECEIPT][0]))
        for name in health.CHAIN_LAYOUT:
            self.assertEqual(json.loads(after[name][0])['historical_extra'], 'retain original fact')
        self.assertFalse((self.backup / 'verification-stage/state/config.json').exists())
        backup = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_bytes())
        self.assertEqual(set(backup['absent_before']), installer.NEW_FILES | {installer.MAINTENANCE})
        for name, entry in backup['originals'].items():
            self.assertEqual(tree(self.backup / 'originals')[name], self.before[name])
            self.assertEqual(entry['sha256'], digest(self.before[name][0]))

    def test_failures_before_activation_restore_every_byte_and_mode(self):
        for failure in ('verify','stage','missing-gate','health','stage-dependency','stage-addition','stage-mode','stage-symlink'):
            with self.subTest(failure=failure):
                self.backup = self.root / ('backup-' + failure)
                outcome = self.install(failure)
                self.assertTrue(outcome['previous_source_restored'])
                self.assertFalse(outcome['activation_committed'])
                self.assertEqual(tree(self.source), self.before)

    def test_unknown_import_inventory_additions_are_preserved_and_refuse_activation(self):
        cases = {'root-shadow':'json.py','package-shadow':'json/__init__.py',
                 'nested-runtime':'runtime/new/package.py','runtime-symlink':'runtime/new',
                 'tool-mode-drift':'tools/codex/codex','late-shadow':'json.py'}
        for failure, name in cases.items():
            with self.subTest(failure=failure):
                self.backup = self.root / ('inventory-' + failure)
                with self.assertRaisesRegex(installer.Refused, 'recovery_required'): self.install(failure)
                path = self.source / name
                self.assertTrue(path.exists() or path.is_symlink())
                self.assertNotIn('activation-latched', self.operations.events)
                self.assertEqual(self.operations.events.count('start'), 1 if failure == 'late-shadow' else 0)
                # Only the disposable test restores its own injected unknown item.
                if failure == 'tool-mode-drift': path.chmod(self.before[name][1])
                else:
                    path.unlink()
                    if path.parent != self.source and path.parent not in (self.source / 'runtime',):
                        path.parent.rmdir()
                        if (self.source / 'json').exists(): (self.source / 'json').rmdir()
                self.restore_fixture()

    def test_each_of_sixteen_write_failures_restores_exactly(self):
        actual = installer.base.atomic_write
        for index, target in enumerate(sorted(installer.WRITES)):
            with self.subTest(target=target):
                self.backup = self.root / ('write-failure-' + str(index)); calls = []
                def fail_once(path, *args, **kwargs):
                    if Path(path) == self.source / target and not calls:
                        calls.append(True); raise OSError('synthetic failed write')
                    return actual(path, *args, **kwargs)
                with patch.object(installer.base, 'atomic_write', side_effect=fail_once): outcome = self.install()
                self.assertTrue(outcome['previous_source_restored']); self.assertEqual(tree(self.source), self.before)

    def test_successful_write_with_lost_acknowledgment_restores_exactly(self):
        actual = installer.base.atomic_write
        for index, target in enumerate(('codex_runner.py','runtime_controller.py',health.RECEIPT,health.GENERIC_RECEIPT)):
            with self.subTest(target=target):
                self.backup = self.root / ('ack-failure-' + str(index)); calls = []
                def fail_after(path, *args, **kwargs):
                    result = actual(path, *args, **kwargs)
                    if Path(path) == self.source / target and not calls:
                        calls.append(True); raise KeyboardInterrupt('synthetic lost acknowledgment')
                    return result
                with patch.object(installer.base, 'atomic_write', side_effect=fail_after): outcome = self.install()
                self.assertTrue(outcome['previous_source_restored']); self.assertEqual(tree(self.source), self.before)

    def test_unknown_preexisting_new_files_are_never_overwritten(self):
        for name in installer.NEW_FILES:
            with self.subTest(name=name):
                path = self.source / name; path.write_bytes(b'unknown original data')
                with self.assertRaisesRegex(installer.Refused, 'unexpected_construction_file'): self.install()
                self.assertEqual(path.read_bytes(), b'unknown original data')
                self.assertNotIn('fence', self.operations.events)
                path.unlink()

    def test_activation_ambiguity_never_rolls_back_or_restarts(self):
        for failure in ('final-health','latch'):
            with self.subTest(failure=failure):
                self.restore_fixture(); self.backup = self.root / ('activation-' + failure)
                outcome = self.install(failure)
                self.assertIsNone(outcome['previous_source_restored'])
                self.assertEqual(self.operations.events.count('start'), 1)
                self.assertNotIn('rollback-fence', self.operations.events)

    def test_unlink_effect_then_exception_is_activation_unknown(self):
        actual = Path.unlink
        def unlink(path, *args, **kwargs):
            actual(path, *args, **kwargs)
            if path == self.source / installer.MAINTENANCE: raise OSError('lost acknowledgment')
        with patch.object(Path, 'unlink', unlink): outcome = self.install()
        self.assertIsNone(outcome['activation_committed']); self.assertIsNone(outcome['previous_source_restored'])
        self.assertNotIn('rollback-fence', self.operations.events)

    def test_cancelled_cleanup_is_default_refused_despite_old_receipt_consent(self):
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES (?, 'cancelled')", (CANCELLED,))
        before = tree(self.source)
        with self.assertRaises(fence.FenceRefused): self.install()
        self.assertEqual(tree(self.source), before)
        self.backup = self.root / 'explicit-backup'
        self.assertTrue(self.install(allow_cancelled_cleanup=True, expected_cancelled_job=CANCELLED)['activation_committed'])
        self.assertEqual(self.operations.cancelled_job_ids, (CANCELLED,))

    def test_cleanup_identity_required_before_target_reads(self):
        for enabled, identity in ((True,None),(True,''),(True,'not-a-job'),(True,CANCELLED+'\n'),(True,42),(False,CANCELLED)):
            with self.subTest(enabled=enabled, identity=identity):
                with patch.object(installer.manifest, 'final_manifest', side_effect=AssertionError('premature target')):
                    with self.assertRaisesRegex(installer.Refused, 'cancelled_identity_required'):
                        self.install(allow_cancelled_cleanup=enabled, expected_cancelled_job=identity)

    def test_nonterminal_or_changed_history_never_activates(self):
        for state in ('queued','generating','unknown',None):
            with self.subTest(state=state):
                with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute('UPDATE jobs SET state=?', (state,))
                self.backup = self.root / ('history-' + str(state)); before = tree(self.source)
                with self.assertRaises(fence.FenceRefused): self.install()
                self.assertEqual(tree(self.source), before)
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute("UPDATE jobs SET state='failed'")
        self.backup = self.root / 'changed-history'
        with self.assertRaisesRegex(installer.Refused,'recovery_required'): self.install('new-cancelled')
        self.assertNotIn('activation-latched', self.operations.events)
        self.assertTrue((self.source / installer.MAINTENANCE).exists())

    def test_concurrent_drift_is_preserved_and_never_overwritten(self):
        for failure in ('drift','receipt-drift','mode-drift','new-file','new-byte-drift','new-mode-drift'):
            with self.subTest(failure=failure):
                self.restore_fixture(); self.backup = self.root / ('drift-' + failure)
                with self.assertRaisesRegex(installer.Refused,'recovery_required'): self.install(failure)
                self.assertNotEqual(tree(self.source), self.before)
                self.assertNotIn('activation-latched', self.operations.events)

    def test_cleanup_uncertainty_never_restarts(self):
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'): self.install('cleanup')
        self.assertEqual(tree(self.source), self.before)
        self.assertNotIn('start', self.operations.events)

    def test_every_source_and_receipt_mismatch_refused_before_fence(self):
        for name in set(manifest.EXPECTED) | installer.RECEIPTS:
            with self.subTest(name=name):
                raw, mode = self.before[name]
                write(self.source / name, raw + b'\n' if name.endswith('.py') else b'{}')
                try:
                    with self.assertRaises((ValueError, installer.Refused)): self.install()
                    self.assertNotIn('fence', self.operations.events)
                finally:
                    write(self.source / name, raw); (self.source / name).chmod(mode)

    def test_authenticated_health_requires_construction_flag_and_exact_readiness(self):
        self.install()
        operations = installer.Operations(self.source, self.root)
        observed = {'worldifactStandardConstructionPolicy': health.REVISION,
            'worldifactStandardContextPolicy': installer.legacy.policy.REVISION,
            'worldifactStandardMaintenance': False, 'ready': True,
            'worldifactCompletionPolicy': installer.legacy.completion_policy.REVISION,
            'worldifactPrebuildPolicy': installer.legacy.prebuild_policy.REVISION,
            'astraBudgetMaxUsd': 1.75, 'astraUsageSettlement': 'authenticated-completed-only',
            'astraCacheAccounting': installer.cache.policy.CACHE_ACCOUNTING_REVISION,
            'provider': 'openai', 'codexReady': True}
        with patch.object(operations, 'read_health', return_value=observed), \
             patch.object(operations, 'pricing_health') as pricing:
            operations.context_health()
            pricing.assert_called_once_with(observed)
            for field in ('worldifactStandardConstructionPolicy','worldifactStandardContextPolicy',
                          'astraUsageSettlement','astraBudgetMaxUsd','provider','codexReady','ready'):
                with self.subTest(field=field):
                    saved = observed.pop(field)
                    try:
                        with self.assertRaisesRegex(installer.Refused,'construction_health_unverified'):
                            operations.context_health()
                    finally: observed[field] = saved
            observed.update(worldifactStandardMaintenance=True, ready=False)
            operations.context_health(maintenance=True)
            with self.assertRaisesRegex(installer.Refused,'construction_health_unverified'):
                operations.context_health(maintenance=False)


if __name__ == '__main__': unittest.main()
