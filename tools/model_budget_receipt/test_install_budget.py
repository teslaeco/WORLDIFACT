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
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import install_budget as installer
import terminal_budget
# Legacy installer imports expose sibling modules; keep this suite first so
# unittest cannot resolve its test_launcher name to a sibling test module.
sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('MODEL_COMPLETION_SOURCE', ROOT / '.model-completion-source/oracle_connector'))


def before_sources():
    import source_fixture, source_patch, reviewed_direct_export
    original = source_fixture.installed_sources(SOURCE)
    original['server.py'] = reviewed_direct_export.patch_server(original['server.py'].decode()).encode()
    original.update(source_patch.changes({name: original[name] for name in source_patch.EXPECTED},
                                        Path(installer.completion_policy.__file__).read_bytes()))
    original = {name: original[name] for name in installer.previous.prebuild_patch.EXPECTED}
    return installer.previous.prebuild_patch.changes(original, Path(installer.prebuild_policy.__file__).read_bytes())


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
        installer.budget_patch.changes(installer.original_sources(self.source), Path(terminal_budget.__file__).read_bytes())
    @contextmanager
    def quiesce(self):
        self.events.append('fence')
        with installer.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids) as identities:
            self.cancelled_job_ids = identities
        yield self.lease
        self.events.append('leave-fence')
    def verify_stage(self, stage, workspace, lease):
        self.events.append('real-gates-replaced-by-test-double')
        assert not (stage / 'state').exists()
        assert not (stage / installer.policy.RECEIPT).exists()
        if self.failure == 'verify':
            raise installer.Refused('cabinet_pipeline_unverified')
        if self.failure == 'source_drift':
            (self.source / 'server.py').write_bytes(b'concurrent source edit')
        if self.failure == 'stage_drift':
            (stage / 'terminal_budget.py').write_bytes(b'concurrent staged edit')
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
        with installer.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids): pass
        yield lease
    def budget_health(self, maintenance=False):
        self.events.append('new-health')
        if self.failure == 'health' or self.failure == 'final_health' and not maintenance:
            raise installer.Refused('budget_health_unverified')
        assert installer.policy.maintenance_active(self.source) is maintenance
        if self.failure == 'new_cancelled':
            with sqlite3.connect(self.source / 'state/jobs.sqlite') as db: db.execute("INSERT INTO jobs VALUES ('new','cancelled')")
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'worldifactPrebuildPolicy': 'fixture'}):
            assert installer.policy.verified_health(self.source).get('worldifactTerminalBudgetPolicy') == installer.policy.REVISION
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

    def test_fence_adapter_is_exact_pinned_and_preserves_guardian_source(self):
        import maintenance_fence as unchanged
        before = Path(unchanged.__file__).read_bytes()
        adapted = installer.maintenance_fence()
        self.assertEqual(adapted.EXPECTED, installer.budget_patch.EXPECTED)
        self.assertEqual(Path(adapted.__file__).resolve(), Path(unchanged.__file__).resolve())
        self.assertEqual(hashlib.sha256(before).hexdigest(), installer.FENCE_SHA256)
        self.assertEqual(Path(unchanged.__file__).read_bytes(), before)
        self.assertNotIn('terminal_budget.py', unchanged.quiesce.__wrapped__.__code__.co_consts)
        for changed in (before + b'\n', before.replace(b'context_policy.py', b'other_policy.py')):
            with patch.object(installer.base, 'read_regular', return_value=changed):
                with self.assertRaisesRegex(installer.Refused, 'maintenance_fence_source_refused'):
                    installer.maintenance_fence()
        # Even an incorrectly updated hash cannot silently weaken replacement
        # cardinality; adapting later fence revisions requires code review.
        changed = before.replace(b'context_policy.py', b'other_policy.py', 1)
        with patch.object(installer.base, 'read_regular', return_value=changed), \
             patch.object(installer, 'FENCE_SHA256', hashlib.sha256(changed).hexdigest()):
            with self.assertRaisesRegex(installer.Refused, 'maintenance_fence_adapter_refused'):
                installer.maintenance_fence()

    def test_adapted_fence_admits_only_the_complete_budget_rollback_manifest(self):
        fence = installer.maintenance_fence()
        expected = dict(installer.budget_patch.EXPECTED)
        expected['server.py'] = 'a' * 64
        operations = SimpleNamespace(source=Path('/reviewed/froge-connector'), home=Path('/reviewed'))
        for helper in (None, 'context_policy.py', 'other.py'):
            operations.expected_source_sha256 = {**expected, **({helper: 'b' * 64} if helper else {})}
            with patch.object(fence, '_source', side_effect=AssertionError('source access before manifest approval')):
                with self.assertRaises(fence.FenceRefused):
                    with fence.quiesce(operations): self.fail('unexpected lease')
        operations.expected_source_sha256 = {**expected, 'terminal_budget.py': 'b' * 64}
        with patch.object(fence, '_source', side_effect=fence.FenceRefused('sentinel', 'complete budget manifest reached source gate')) as source:
            with self.assertRaisesRegex(fence.FenceRefused, 'complete budget manifest reached source gate'):
                with fence.quiesce(operations): self.fail('unexpected lease')
        self.assertEqual(source.call_args.kwargs['expected_sources'], operations.expected_source_sha256)

    def test_guard_output_receipt_drift_is_refused_before_fencing(self):
        path = self.source / installer.cache.legacy.RECEIPT
        proof = json.loads(path.read_text())
        proof['outputPolicy']['sha256'] = 'a' * 64
        write(path, proof)
        before = tree(self.source)
        ops = FakeOperations(self.source)
        with self.assertRaisesRegex(installer.Refused, 'guard_output_receipt_refused'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertNotIn('fence', ops.events)
        self.assertEqual(tree(self.source), before)
        self.assertFalse(self.backup.exists())

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

    def test_cancelled_flag_requires_separate_maintenance_approval(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('unexpected source access')):
            with self.assertRaises(SystemExit): installer.main(['--allow-cancelled-cleanup'])
            with self.assertRaisesRegex(installer.Refused, 'maintenance_approval_required'):
                installer.install(self.source, self.backup, FakeOperations(self.source), allow_cancelled_cleanup=True)

    def test_explicit_cancelled_consent_preserves_history_artifacts_and_receipt_truth(self):
        cancelled='00000000-0000-4000-8000-000000000001'
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db: db.execute('INSERT INTO jobs VALUES (?,?)',(cancelled,'cancelled'))
        before=tree(self.source); ops=FakeOperations(self.source)
        outcome=installer.install(self.source,self.backup,ops,approved=True,allow_cancelled_cleanup=True)
        self.assertTrue(outcome['activation_committed'])
        self.assertEqual(ops.cancelled_job_ids,(cancelled,))
        after=tree(self.source)
        self.assertEqual({k:v for k,v in before.items() if k.startswith('state/')}, {k:v for k,v in after.items() if k.startswith('state/')})
        proof=json.loads((self.source/terminal_budget.RECEIPT).read_text())
        self.assertTrue(proof['cancelled_cleanup_interruption_approved'])
        self.assertEqual(proof['maintenance_fence'],'pidfd-origin-terminal-consent-v2')
        self.assertNotIn(cancelled,json.dumps(proof))
        with patch.object(installer.prebuild_policy,'verified_health',return_value={'verified':True}):
            self.assertTrue(terminal_budget.verified_health(self.source))
            for invalid in (None,1,'true'):
                proof['cancelled_cleanup_interruption_approved']=invalid
                write(self.source/terminal_budget.RECEIPT,proof)
                self.assertEqual(terminal_budget.verified_health(self.source),{})

    def test_cancelled_consent_survives_rollback_without_rebinding(self):
        cancelled='00000000-0000-4000-8000-000000000001'
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db: db.execute('INSERT INTO jobs VALUES (?,?)',(cancelled,'cancelled'))
        before=tree(self.source); ops=FakeOperations(self.source,'health')
        outcome=installer.install(self.source,self.backup,ops,approved=True,allow_cancelled_cleanup=True)
        self.assertTrue(outcome['previous_source_restored'])
        self.assertEqual(ops.cancelled_job_ids,(cancelled,)); self.assertEqual(tree(self.source),before)

    def test_final_and_rollback_admission_refuse_changed_cancelled_identity_and_active_rows(self):
        FenceRefused = installer.maintenance_fence().FenceRefused
        bound=('00000000-0000-4000-8000-000000000001',)
        for state,identity in [('cancelled','00000000-0000-4000-8000-000000000002'),('queued',bound[0]),('building',bound[0]),('unknown',bound[0]),(None,bound[0])]:
            with self.subTest(state=state):
                with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
                    db.execute('DELETE FROM jobs'); db.execute('INSERT INTO jobs VALUES (?,?)',(identity,state))
                before=(self.source/'state/jobs.sqlite').read_bytes()
                with self.assertRaisesRegex(RuntimeError, '(identity changed|Nonterminal|Only one|Cancelled)'):
                    with installer.final_admission(self.source,True,bound): self.fail('changed history admitted')
                self.assertEqual((self.source/'state/jobs.sqlite').read_bytes(),before)

    def test_success_updates_only_reviewed_source_and_receipt_coverage(self):
        ops = FakeOperations(self.source)
        outcome = installer.install(self.source, self.backup, ops, approved=True)
        self.assertEqual(outcome['phase'], 'WORLDIFACT_TERMINAL_BUDGET_VERIFIED')
        self.assertTrue(ops.lease.confirmed)
        after = tree(self.source)
        changed = {name for name in after if after[name] != self.before.get(name)}
        self.assertEqual(changed, {'server.py', 'astra_spend_v2.py', 'terminal_budget.py', terminal_budget.RECEIPT,
            installer.completion_policy.RECEIPT,
            installer.prebuild_policy.RECEIPT, installer.cache.legacy.RECEIPT})
        guard = json.loads((self.source / installer.cache.legacy.RECEIPT).read_text())
        prior = json.loads(self.before[installer.cache.legacy.RECEIPT][0])
        guard['outputPolicy']['sha256'] = prior['outputPolicy']['sha256']
        self.assertEqual(guard, prior)
        proof = json.loads((self.source / terminal_budget.RECEIPT).read_text())
        self.assertIs(proof['cancelled_cleanup_interruption_approved'],False)
        self.assertEqual(set(proof['sha256']), terminal_budget.SOURCES)
        self.assertIn('terminal_budget.py', proof['sha256'])
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
                self.assertEqual(outcome['phase'], 'WORLDIFACT_TERMINAL_BUDGET_NOT_CONFIRMED')
                self.assertTrue(outcome['previous_source_restored'])
                self.assertEqual(tree(self.source), self.before)
                self.assertTrue(ops.lease.confirmed)

    def test_each_atomic_write_failure_rolls_back_prior_writes(self):
        actual = installer.base.atomic_write
        targets = ('astra_spend_v2.py', 'server.py', 'terminal_budget.py', installer.completion_policy.RECEIPT,
                   installer.prebuild_policy.RECEIPT, installer.cache.legacy.RECEIPT,
                   installer.base.RECEIPT, terminal_budget.RECEIPT)
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
        self.assertTrue((self.source / 'terminal_budget.py').exists())
        self.assertFalse(installer.policy.maintenance_active(self.source))

    def test_unexpected_cancelled_row_keeps_admission_closed_without_reset(self):
        ops = FakeOperations(self.source, 'new_cancelled')
        with self.assertRaisesRegex(installer.Refused, 'recovery_required'):
            installer.install(self.source, self.backup, ops, approved=True)
        self.assertTrue(installer.policy.maintenance_active(self.source))
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            self.assertEqual(db.execute("SELECT state FROM jobs WHERE id='new'").fetchone()[0], 'cancelled')
        self.assertNotIn('activation-committed', ops.events)

    def test_enabled_cleanup_still_refuses_a_second_late_cancelled_row(self):
        identity='00000000-0000-4000-8000-000000000001'
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db: db.execute('INSERT INTO jobs VALUES (?,?)',(identity,'cancelled'))
        ops=FakeOperations(self.source,'new_cancelled')
        with self.assertRaisesRegex(installer.Refused,'recovery_required'):
            installer.install(self.source,self.backup,ops,approved=True,allow_cancelled_cleanup=True)
        self.assertEqual(ops.cancelled_job_ids,(identity,))
        self.assertTrue(installer.policy.maintenance_active(self.source))
        self.assertNotIn('activation-committed',ops.events)
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM jobs WHERE state='cancelled'").fetchone()[0],2)

    def test_unreviewed_context_installation_or_maintenance_is_preserved(self):
        for name in ('context_policy.py', '.worldifact-standard-context.json', '.worldifact-standard-maintenance.json'):
            with self.subTest(name=name):
                path = self.source / name
                path.write_bytes(b'unreviewed context state')
                before = tree(self.source)
                ops = FakeOperations(self.source)
                with self.assertRaisesRegex(installer.Refused, 'foreign_runtime_present'):
                    installer.install(self.source, self.backup, ops, approved=True)
                self.assertEqual(ops.events, [])
                self.assertEqual(tree(self.source), before)
                path.unlink()

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
                self.assertTrue((source / 'terminal_budget.py').exists())
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

    def test_new_helper_or_receipt_tampering_removes_budget_readiness(self):
        installer.install(self.source, self.backup, FakeOperations(self.source), approved=True)
        with patch.object(installer.prebuild_policy, 'verified_health', return_value={'worldifactPrebuildPolicy': 'fixture'}):
            self.assertTrue(terminal_budget.verified_health(self.source))
            for name in terminal_budget.SOURCES:
                original = (self.source / name).read_bytes()
                (self.source / name).write_bytes(original + b'\n')
                self.assertEqual(terminal_budget.verified_health(self.source), {})
                (self.source / name).write_bytes(original)
            proof = json.loads((self.source / terminal_budget.RECEIPT).read_text())
            proof['offline_cabinet_pipeline'] = False
            write(self.source / terminal_budget.RECEIPT, proof)
            self.assertEqual(terminal_budget.verified_health(self.source), {})


if __name__ == '__main__': unittest.main()
