"""Disposable source/receipt transactions only; no host services or model calls."""
from contextlib import contextmanager, redirect_stdout
import ast
import io
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

import install_context as installer
import context_policy
from test_context import before_sources, SOURCE


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def tree(folder):
    return {path.relative_to(folder).as_posix(): (path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
            for path in folder.rglob('*') if path.is_file()}


class Lease:
    def __init__(self, operations):
        self.operations = operations
        self.confirmed = False
    def assert_no_work(self):
        self.operations.events.append('resources-empty')
        if self.operations.failure == 'cleanup':
            raise installer.Refused('cleanup_unconfirmed')
    def worker_identity(self): return {'MainPID': '123', 'InvocationID': 'fixture', 'NRestarts': '0'}
    def assert_worker_identity(self, value): assert value == self.worker_identity()
    def confirm_activation_committed(self):
        self.activation_committed = True
        self.operations.events.append('activation-committed')
        return True
    def confirm_healthy(self, identity):
        self.operations.events.append('ingress-restored')
        self.confirmed = True


class FakeOperations:
    def __init__(self, source, failure=None):
        self.source, self.failure, self.events = source, failure, []
        self.lease = Lease(self)
    def preflight(self):
        self.events.append('preflight')
        installer.context_patch.changes(installer.original_sources(self.source), Path(context_policy.__file__).read_bytes())
    @contextmanager
    def quiesce(self):
        self.events.append('fence')
        yield self.lease
        self.events.append('leave-fence')
    def verify_stage(self, stage, workspace, lease):
        self.events.append('real-gates-replaced-by-test-double')
        assert not (stage / 'state').exists()
        assert not (stage / installer.policy.RECEIPT).exists()
        if self.failure == 'verify':
            raise installer.Refused('standard_pipeline_unverified')
        if self.failure == 'source_drift':
            (self.source / 'server.py').write_bytes(b'concurrent source edit')
        if self.failure == 'stage_drift':
            (stage / 'context_policy.py').write_bytes(b'concurrent staged edit')
        receipt = {'sources': {name: hashlib.sha256((stage / name).read_bytes()).hexdigest()
                   for name in ('codex_runner.py', 'blender_mcp.py')},
                   'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True}
        write(stage / installer.base.RECEIPT, receipt)
        return (stage / installer.base.RECEIPT).read_bytes()
    def start(self): self.events.append('start')
    def stop(self): self.events.append('stop')
    @contextmanager
    def rollback_quiesce(self, expected, lease):
        self.events.append('refence-before-rollback')
        lease.assert_no_work()
        with installer.final_admission(self.source): pass
        yield lease
    def context_health(self, maintenance=False):
        self.events.append('new-health')
        if self.failure == 'health' or self.failure == 'final_health' and not maintenance:
            raise installer.Refused('context_health_unverified')
        assert installer.policy.maintenance_active(self.source) is maintenance
        if self.failure == 'new_cancelled':
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute("INSERT INTO jobs VALUES ('new','cancelled')")
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'worldifactPrebuildPolicy': 'fixture'}):
            assert installer.policy.verified_health(self.source).get('worldifactStandardContextPolicy') == installer.policy.REVISION
    def previous_health(self): self.events.append('old-health')


class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original = before_sources()
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        for name, raw in self.original.items():
            (self.source / name).write_bytes(raw)
        for name in ('codex_smoke.py', 'runtime_check.py', 'install_codex.py'):
            shutil.copyfile(SOURCE / name, self.source / name)
        (self.source / 'runtime').mkdir()
        (self.source / 'runtime/fixture.py').write_text('# synthetic dependency, never executed\n')
        hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in self.original.items()}
        write(self.source / installer.completion_policy.RECEIPT,
              {'revision': installer.completion_policy.REVISION, 'sha256': {n: hashes[n] for n in installer.previous.prebuild_patch.EXPECTED}})
        write(self.source / installer.prebuild_policy.RECEIPT,
              {'revision': installer.prebuild_policy.REVISION, 'sha256': hashes})
        write(self.source / installer.cache.legacy.RECEIPT,
              {'revision': installer.cache.legacy.REVISION, 'sha256': {'codex_runner.py': hashes['codex_runner.py'],
               'fast_preview.py': 'unchanged-fixture', 'astra_spend.py': 'unchanged-fixture'},
               'outputPolicy': {'revision': 'unchanged-fixture', 'sha256': hashes['astra_spend_v2.py']},
               'preserved_extra_field': 'do not remove'})
        write(self.source / installer.base.RECEIPT,
              {'sources': {n: hashes[n] for n in ('codex_runner.py', 'blender_mcp.py')},
               'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        for name in ('codex', 'codex-code-mode-host', 'codex-binary.json', 'code-mode-host.json'):
            (self.source / 'tools/codex' / name).write_bytes(b'INERT EXECUTABLE/RECEIPT FIXTURE')
        write(self.source / 'state/config.json', {'token': 'synthetic-never-copied'})
        write(self.source / 'state/ai-provider.json', {'api_key': 'synthetic-never-copied'})
        write(self.source / 'state/ledger.json', {'held': 12345})
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs(id TEXT,state TEXT)')
            db.execute("INSERT INTO jobs VALUES ('synthetic','succeeded')")
        (self.source / 'state/model.glb').write_bytes(b'original synthetic artifact')
        self.before = tree(self.source)
        self.backup = self.root / 'backup'

    def test_logout_policy_is_read_only_and_fails_closed_before_freezing(self):
        from types import SimpleNamespace
        calls = []
        def command(args, timeout):
            calls.append((args, timeout)); return 'b false'
        installer.logout_guard_supported(SimpleNamespace(command=command))
        self.assertEqual(calls[0][0][:3], ['busctl', '--system', 'get-property'])
        for value in ('b true', '', 'unknown'):
            with self.assertRaisesRegex(installer.Refused, 'session_guard_unproven'):
                installer.logout_guard_supported(SimpleNamespace(command=lambda *args, **kwargs: value))

    def test_unexpected_cli_error_never_claims_activation_did_not_happen(self):
        node = next(n for n in ast.parse(Path(installer.__file__).read_text()).body if isinstance(n, ast.If)
            and isinstance(n.test, ast.Compare) and isinstance(n.test.left, ast.Name) and n.test.left.id == '__name__')
        def failed_main(): raise OSError('synthetic post-activation reporting failure')
        output = io.StringIO()
        with redirect_stdout(output), self.assertRaises(SystemExit):
            exec(compile(ast.Module(body=node.body, type_ignores=[]), 'exact-cli-failure', 'exec'),
                 {'main': failed_main, 'result': installer.result, 'json': json})
        self.assertIsNone(json.loads(output.getvalue())['activation_committed'])

    def test_default_is_inert_and_explicit_approval_precedes_all_access(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('unexpected source access')):
            installer.main([])
            with self.assertRaises(installer.Refused):
                installer.install(self.source, self.backup, FakeOperations(self.source))
        self.assertEqual(tree(self.source), self.before)

    def test_success_updates_only_reviewed_source_and_receipt_coverage(self):
        ops = FakeOperations(self.source)
        outcome = installer.install(self.source, self.backup, ops, approved=True)
        self.assertEqual(outcome['phase'], 'WORLDIFACT_STANDARD_CONTEXT_VERIFIED')
        self.assertTrue(ops.lease.confirmed)
        after = tree(self.source)
        changed = {name for name in after if after[name] != self.before.get(name)}
        self.assertEqual(changed, {'server.py', 'codex_runner.py', 'context_policy.py', context_policy.RECEIPT,
            installer.base.RECEIPT, installer.completion_policy.RECEIPT,
            installer.prebuild_policy.RECEIPT, installer.cache.legacy.RECEIPT})
        guard = json.loads((self.source / installer.cache.legacy.RECEIPT).read_text())
        prior = json.loads(self.before[installer.cache.legacy.RECEIPT][0])
        guard['sha256']['codex_runner.py'] = prior['sha256']['codex_runner.py']
        self.assertEqual(guard, prior)
        proof = json.loads((self.source / context_policy.RECEIPT).read_text())
        self.assertEqual(set(proof['sha256']), context_policy.SOURCES)
        self.assertIn('context_policy.py', proof['sha256'])
        manifest = json.loads((self.backup / 'ORIGINAL_MANIFEST.json').read_text())
        for name, entry in manifest['originals'].items():
            self.assertEqual(entry['mode'], self.before[name][1])
            self.assertEqual(entry['sha256'], hashlib.sha256(self.before[name][0]).hexdigest())
        self.assertFalse((self.backup / 'verification-stage/state/config.json').exists())
        self.assertFalse((self.backup / 'verification-stage/state/jobs.sqlite').exists())
        self.assertLess(ops.events.index('real-gates-replaced-by-test-double'), ops.events.index('new-health'))
        self.assertLess(ops.events.index('new-health'), ops.events.index('ingress-restored'))

    def test_failed_verification_and_failed_health_restore_all_original_bytes_and_modes(self):
        for failure in ('verify', 'health', 'stage_drift'):
            with self.subTest(failure=failure):
                ops = FakeOperations(self.source, failure)
                outcome = installer.install(self.source, self.root / ('backup-' + failure), ops, approved=True)
                self.assertEqual(outcome['phase'], 'WORLDIFACT_STANDARD_CONTEXT_NOT_CONFIRMED')
                self.assertTrue(outcome['previous_source_restored'])
                self.assertEqual(tree(self.source), self.before)
                self.assertTrue(ops.lease.confirmed)

    def test_each_atomic_write_failure_rolls_back_prior_writes(self):
        actual = installer.base.atomic_write
        targets = ('codex_runner.py', 'server.py', 'context_policy.py', installer.completion_policy.RECEIPT,
                   installer.prebuild_policy.RECEIPT, installer.cache.legacy.RECEIPT,
                   installer.base.RECEIPT, context_policy.RECEIPT)
        for target in targets:
            with self.subTest(target=target):
                failed = []
                def write_once(path, *args, **kwargs):
                    if Path(path) == self.source / target and not failed:
                        failed.append(True)
                        raise OSError('synthetic interrupted write')
                    return actual(path, *args, **kwargs)
                ops = FakeOperations(self.source)
                with patch.object(installer.base, 'atomic_write', side_effect=write_once):
                    outcome = installer.install(self.source, self.root / ('backup-' + target.replace('/', '-')), ops, approved=True)
                self.assertTrue(outcome['previous_source_restored'])
                self.assertEqual(tree(self.source), self.before)

    def test_uncertain_final_health_never_rolls_back_committed_activation(self):
        ops = FakeOperations(self.source, 'final_health')
        outcome = installer.install(self.source, self.backup, ops, approved=True)
        self.assertTrue(outcome['activation_committed'])
        self.assertIsNone(outcome['previous_source_restored'])
        self.assertEqual(outcome['refusal_code'], 'activation_health_unconfirmed')
        self.assertNotIn('refence-before-rollback', ops.events)
        self.assertTrue((self.source / 'context_policy.py').exists())
        self.assertFalse(installer.policy.maintenance_active(self.source))

    def test_unexpected_cancelled_row_keeps_admission_closed_without_reset(self):
        ops = FakeOperations(self.source, 'new_cancelled')
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertTrue(installer.policy.maintenance_active(self.source))
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            self.assertEqual(db.execute("SELECT state FROM jobs WHERE id='new'").fetchone()[0], 'cancelled')
        self.assertNotIn('activation-committed', ops.events)

    def test_existing_unknown_marker_is_never_removed_or_overridden(self):
        marker = self.source / installer.policy.MAINTENANCE
        marker.write_bytes(b'unknown previous maintenance')
        ops = FakeOperations(self.source)
        with self.assertRaisesRegex(installer.Refused, 'maintenance_already_present'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertEqual(marker.read_bytes(), b'unknown previous maintenance')
        self.assertEqual(ops.events, [])

    def test_unlink_success_then_exception_cannot_report_uncommitted_or_rollback(self):
        actual = Path.unlink
        for failure in (OSError, KeyboardInterrupt):
            with self.subTest(failure=failure):
                source = self.source
                marker = source / installer.policy.MAINTENANCE
                fired = []
                def interrupted_unlink(path, *args, **kwargs):
                    actual(path, *args, **kwargs)
                    if path == marker and not fired:
                        fired.append(True)
                        raise failure('synthetic interrupt after successful removal')
                ops = FakeOperations(source)
                with patch.object(Path, 'unlink', interrupted_unlink):
                    outcome = installer.install(source, self.root / ('unlink-' + failure.__name__), ops, approved=True)
                self.assertIsNone(outcome['activation_committed'])
                self.assertEqual(outcome['refusal_code'], 'activation_commit_unconfirmed')
                self.assertNotIn('refence-before-rollback', ops.events)
                self.assertFalse(marker.exists())
                self.assertTrue((source / 'context_policy.py').exists())
                # Reset only this disposable fixture for the next fault case.
                for name in list(tree(source)):
                    if name not in self.before: (source / name).unlink()
                for name, (raw, mode) in self.before.items():
                    (source / name).write_bytes(raw); (source / name).chmod(mode)

    def test_latch_failure_holds_marker_and_never_retries_activation(self):
        ops = FakeOperations(self.source)
        ops.lease.confirm_activation_committed = lambda: False
        outcome = installer.install(self.source, self.backup, ops, approved=True)
        self.assertIsNone(outcome['activation_committed'])
        self.assertEqual(outcome['refusal_code'], 'activation_commit_unconfirmed')
        self.assertTrue(installer.policy.maintenance_active(self.source))
        self.assertNotIn('refence-before-rollback', ops.events)

    def test_delayed_same_identity_listener_is_retried_without_stopping(self):
        ops = FakeOperations(self.source)
        calls = []
        def check():
            calls.append(True)
            if len(calls) < 3: raise ConnectionRefusedError('synthetic delayed listener')
        with patch.object(installer.time, 'sleep'):
            identity = installer.wait_for_health(ops.lease, check)
        self.assertEqual(identity, ops.lease.worker_identity())
        self.assertEqual(len(calls), 3)
        self.assertNotIn('refence-before-rollback', ops.events)

    def test_unknown_source_is_refused_before_fence(self):
        (self.source / 'server.py').write_bytes(self.original['server.py'] + b'\n')
        ops = FakeOperations(self.source)
        with self.assertRaises(ValueError):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertNotIn('fence', ops.events)
        self.assertFalse(self.backup.exists())

    def test_unconfirmed_cleanup_does_not_restart_worker_or_reopen_ingress(self):
        ops = FakeOperations(self.source, 'cleanup')
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertNotIn('start', ops.events)
        self.assertFalse(ops.lease.confirmed)
        self.assertEqual(tree(self.source), self.before)

    def test_source_drift_is_never_overwritten_or_reported_restored(self):
        ops = FakeOperations(self.source, 'source_drift')
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertEqual((self.source / 'server.py').read_bytes(), b'concurrent source edit')
        self.assertFalse(ops.lease.confirmed)
        self.assertNotIn('start', ops.events)

    def test_valid_installation_is_idempotent_without_refreezing(self):
        ops = FakeOperations(self.source)
        installer.install(self.source, self.backup, ops, approved=True)
        after = tree(self.source)
        again = FakeOperations(self.source)
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'worldifactPrebuildPolicy': 'fixture'}):
            outcome = installer.install(self.source, self.root / 'unused', again, approved=True)
        self.assertEqual(outcome['phase'], 'ALREADY_VERIFIED')
        self.assertEqual(again.events, ['new-health'])
        self.assertEqual(tree(self.source), after)

    def test_new_helper_or_receipt_tampering_removes_context_readiness(self):
        installer.install(self.source, self.backup, FakeOperations(self.source), approved=True)
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'worldifactPrebuildPolicy': 'fixture'}):
            self.assertTrue(context_policy.verified_health(self.source))
            for name in context_policy.SOURCES:
                original = (self.source / name).read_bytes()
                (self.source / name).write_bytes(original + b'\n')
                self.assertEqual(context_policy.verified_health(self.source), {})
                (self.source / name).write_bytes(original)
            proof = json.loads((self.source / context_policy.RECEIPT).read_text())
            proof['offline_standard_pipeline'] = False
            write(self.source / context_policy.RECEIPT, proof)
            self.assertEqual(context_policy.verified_health(self.source), {})


if __name__ == '__main__': unittest.main()
