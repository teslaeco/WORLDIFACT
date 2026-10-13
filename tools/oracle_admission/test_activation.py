"""Synthetic full transactions: no live runtime, provider or service proof.

All file/SQLite/rollback behavior is real in a disposable directory. Native
witnesses and process leases are explicit fixtures, not installation receipts
usable on the production hashes. The exact-source CI test is separate.
"""
from contextlib import closing, contextmanager
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

import activation as target
import activation_manifest as manifest
import activation_evidence as evidence
import activation_receipts as receipts
from activation_ops import previous


def raw(value):
    return json.dumps(value, sort_keys=True).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def write(path, value, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else raw(value))
    path.chmod(mode)


def tree(root):
    return {p.relative_to(root).as_posix(): (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
            for p in root.rglob('*') if p.is_file()}


def witnesses():
    generic = {'sources': {n: manifest.final_manifest()[n] for n in ('codex_runner.py', 'blender_mcp.py')},
               'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True,
               'fixture_only': True}
    legacy = {'execution_id': 'a' * 32, 'terms': {'revision': 'studio-pricing-v1', 'tier': 'standard', 'points': 250, 'maxProviderCents': 200},
              'immutable_terms_sha256': 'b' * 64, 'ledger_cap_micro_usd': 2000000, 'ledger_policy_revision': 'astra-low-tiered-v1',
              'requests': 4, 'counts': 4, 'scripted_exec_phases': 4, 'wait_responses': 0,
              'original_gate_sha256': evidence.ORIGINAL_GATE, 'source_sha256': evidence.core_sources(),
              **{k: True for k in ('schema_verified', 'actual_images_verified', 'provider_fixture', 'original_cli_standard_verified', 'cleanup_verified')},
              **{k: False for k in ('production_budget_changed', 'runtime_route_override', 'installed_receipt_written', 'native_fallback', 'live_provider_verified', 'visual_quality_verified')}}
    cases = []
    calls = []
    for i in range(3):
        accepted, correction, edit = i != 1, i == 0, i == 2
        phases = ['construction', 'inspection', 'reassessment'] if correction else ['construction', 'inspection']
        tools = ['build_model'] + (['edit_model'] if edit else []) + ['inspect_render'] * 3
        if correction:
            tools += ['edit_model'] + ['inspect_render'] * 3
        tools += ['finish_model']
        cases.append({'accepted': accepted, 'revision': 2 if accepted else 1, 'correction': correction,
                      'server_success_returned': accepted, 'model_sha256': 'a' * 64,
                      'render_sha256': {v: 'b' * 64 for v in ('front', 'side', 'back')},
                      'provider_requests': [{'phase': p, 'payload_sha256': 'c' * 64} for p in phases],
                      'before_correction_model_sha256': 'd' * 64 if correction else None,
                      'before_correction_render_sha256': {v: 'e' * 64 for v in ('front', 'side', 'back')} if correction else None,
                      'fixture_settled_micro_usd': 73844 * len(phases), 'invoice_amount': False,
                      'initial_edit': edit, 'first_inspected_revision': 2 if edit else 1,
                      'inspected_revisions': [1, 2] if correction else [2] if edit else [1],
                      'before_initial_edit_model_sha256': 'f' * 64 if edit else None, 'completed_pipeline_tools': tools})
        for phase in (['build', 'build', 'finalize'] if i != 1 else ['build', 'finalize']):
            calls.append({'job_id': '00000000-0000-4000-8000-%012d' % i, 'phase': phase, 'command_sha256': 'a' * 64})
    phased = {'revision': 'worldifact-standard-construction-v1', 'source_sha256': evidence.core_sources(),
              'cases': cases, 'container_calls': calls,
              **{k: True for k in ('isolated_podman_execution_verified', 'provider_fixture', 'activation_receipt_fixture', 'cleanup_verified')},
              **{k: False for k in ('native_fallback', 'installed_runtime_receipt_written', 'live_provider_verified', 'visual_quality_verified')}}
    models = []
    for model, mode in evidence.MODEL_CASES:
        api, cap, cost = {'astra': ('gpt-6-astra', 1750000, 6875), 'sol': ('gpt-6.1-sol', 350000, 1375), 'luna': ('gpt-6-luna', 100000, 69)}[model]
        cost *= 4 * (2 if mode == 'fast' else 1)
        seal = {'revision': 'worldifact-terminal-budget-v1', 'jobId': '00000000-0000-4000-8000-000000000001',
                'model': api, 'policyRevision': 'studio-model-budget-v1:' + mode, 'capMicroUsd': cap,
                'maximumLiabilityMicroUsd': cost, 'sealed': True, 'sealId': 'b' * 64}
        models.append(raw({'selection': {'revision': 'studio-execution-v1', 'model': model, 'mode': mode},
                           'model': api, 'service_tier': 'fast' if mode == 'fast' else 'default', 'cap_micro_usd': cap,
                           'requests': 4, 'counts': 4, 'phases': 4, 'waits': 0, 'fixture_liability_micro_usd': cost,
                           'seal': seal, 'execution_id': 'a' * 32, 'terms_sha256': 'b' * 64, 'model_sha256': 'c' * 64,
                           'render_sha256': {v: 'd' * 64 for v in ('front', 'side', 'back')},
                           'source_sha256': evidence.model_sources(), 'original_gate_sha256': evidence.ORIGINAL_GATE,
                           **{k: True for k in ('actual_cli_mcp_blender', 'actual_images_verified', 'provider_fixture', 'cleanup_verified')},
                           **{k: False for k in ('live_provider_verified', 'visual_quality_verified', 'installed_receipt_written', 'native_fallback')}}))
    return evidence.NativeEvidence(raw(generic), evidence.GATES, raw(legacy), raw(phased), tuple(models))


class Lease:
    def __init__(self, ops):
        self.ops = ops
        self.healthy = False
        self.activation_committed = False
    def assert_no_work(self):
        self.ops.events.append('idle')
    def worker_identity(self):
        return {'MainPID': '123', 'InvocationID': 'fixture', 'NRestarts': '0'}
    def assert_worker_identity(self, identity):
        if identity != self.worker_identity():
            raise target.Refused('identity_changed')
    def confirm_activation_committed(self):
        self.ops.events.append('commit')
        self.activation_committed = True
        if self.ops.failure == 'latch':
            return False
        return True
    def confirm_healthy(self, identity):
        self.assert_worker_identity(identity)
        self.healthy = True
        self.ops.events.append('healthy')


class FixtureOperations:
    def __init__(self, source, failure=None):
        self.source, self.failure, self.events = source, failure, []
        self.lease = Lease(self)
    def preflight(self):
        self.events.append('preflight')
        receipts.validate_original(self.source, target.originals(self.source))
    @contextmanager
    def quiesce(self):
        with target.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids):
            pass
        self.events.append('fence')
        yield self.lease
    @contextmanager
    def rollback_quiesce(self, changed, lease):
        self.events.append('rollback')
        with target.final_admission(self.source, self.allow_cancelled_cleanup, self.cancelled_job_ids):
            pass
        yield lease
    def verify_stage(self, stage, workspace, lease):
        self.events.append('native-fixture')
        if self.failure == 'native':
            raise target.Refused('native_failed')
        value = witnesses()
        write(stage / receipts.policy.GENERIC_RECEIPT, value.generic_receipt)
        if self.failure == 'source-edit':
            (self.source / 'server.py').write_bytes(b'# unknown concurrent source\n')
        if self.failure == 'stage-edit':
            (stage / 'server.py').write_bytes(b'# unknown staged source\n')
        if self.failure == 'missing-model':
            value = evidence.NativeEvidence(value.generic_receipt, value.gates, value.legacy, value.phased, value.models[:-1])
        return value
    def verify_ingress(self, stage, workspace, lease):
        self.events.append('ingress-fixture')
        if self.failure == 'ingress':
            raise target.Refused('ingress_failed')
        if self.failure == 'ingress-edit':
            (stage / 'studio_execution.py').write_bytes(b'# changed\n')
        if self.failure == 'ingress-state':
            (stage / 'state').mkdir()
        return raw({'revision': manifest.REVISION, 'source_sha256': manifest.final_manifest(),
                    **{k: True for k in ('stage_survived_restart', 'start_idempotent', 'queue_row_preserved',
                                          'input_hash_verified', 'model_terms_verified', 'no_provider_calls', 'cleanup_verified')}})
    def start(self):
        self.events.append('start')
        if self.failure == 'start' and self.events.count('start') == 1:
            raise target.Refused('start_failed')
    def context_health(self, maintenance=False):
        receipts.validate_installed(self.source)
        if target.legacy.policy.maintenance_active(self.source) is not maintenance:
            raise target.Refused('marker_invalid')
        if self.failure == 'health' or self.failure == 'post-commit-health' and not maintenance:
            raise target.Refused('health_failed')
    def previous_health(self):
        self.preflight()


class ActivationTests(unittest.TestCase):
    def setUp(self):
        # Only this disposable fixture uses a sanitized synthetic environment.
        # The live installer still refuses external container-storage selectors.
        env = patch.dict(os.environ, {k: v for k, v in os.environ.items()
            if not k.startswith(('CONTAINER_', 'CONTAINERS_', '_CONTAINERS_', 'PODMAN_', 'DOCKER_'))
            and k not in ('XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'STORAGE_DRIVER', 'STORAGE_OPTS')}, clear=True)
        env.start()
        self.addCleanup(env.stop)
        tmp = tempfile.TemporaryDirectory(prefix='worldifact-activation-fixture-')
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / 'froge-connector'
        self.backup = self.root / 'backup'
        self.originals = {n: ('# synthetic original ' + n + '\n').encode() for n in manifest.BEFORE}
        self.helpers = {n: ('# synthetic new ' + n + '\n').encode() for n in manifest.HELPERS}
        self.changed = {**self.originals, **self.helpers, 'server.py': b'# synthetic corrected server\n'}
        self.patches = [patch.object(manifest, 'BEFORE', {n: sha(b) for n, b in self.originals.items()}),
                        patch.object(manifest, 'HELPERS', {n: sha(b) for n, b in self.helpers.items()}),
                        patch.object(manifest, 'AFTER_SERVER_SHA256', sha(self.changed['server.py'])),
                        patch.object(manifest, 'changes', return_value=self.changed)]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        for n, b in self.originals.items():
            write(self.source / n, b, 0o640)
        for n in ('fast_preview.py', 'astra_spend.py', 'codex_smoke.py', 'install_codex.py', 'runtime_check.py', 'runtime/fixture.py'):
            write(self.source / n, b'# inert fixture only\n')
        for n in previous.EXECUTABLE_FILES:
            write(self.source / n, b'INERT NEVER EXECUTED', 0o700)
        proofs = {}
        for n, (rev, coverage) in receipts.policy.CHAIN_LAYOUT.items():
            proofs[n] = raw({'revision': rev, 'sha256': {k: manifest.BEFORE[k] for k in coverage},
                'maintenance_fence': receipts.policy.FENCE_REVISION, 'cancelled_cleanup_interruption_approved': False,
                'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True, 'offline_standard_pipeline': True,
                'preserve_history': 'do not erase'})
        proofs[receipts.policy.GENERIC_RECEIPT] = raw({'sources': {n: manifest.BEFORE[n] for n in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        proofs[receipts.policy.GUARD_RECEIPT] = raw({'revision': 'astra-usd175-v1',
            'sha256': {n: sha((self.source / n).read_bytes()) for n in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py')},
            'outputPolicy': {'revision': 'astra-low-reconciled-v2', 'sha256': manifest.BEFORE['astra_spend_v2.py']}})
        proofs[receipts.policy.RECEIPT] = raw({'revision': receipts.policy.REVISION,
            'sha256': {n: manifest.BEFORE[n] for n in receipts.policy.SOURCES},
            'receipt_sha256': {n: sha(proofs[n]) for n in receipts.policy.CHAIN_RECEIPTS},
            'maintenance_fence': receipts.policy.FENCE_REVISION, 'cancelled_cleanup_interruption_approved': False,
            **{k: True for k in evidence.GATES}})
        proofs[manifest.MODEL_RECEIPT] = raw({'revision': 'studio-execution-v1',
            'sha256': {n: manifest.BEFORE[n] for n in ('server.py', 'codex_runner.py', 'studio_execution.py')},
            'construction_receipt_sha256': sha(proofs[receipts.policy.RECEIPT]), 'offline_model_pipeline': True,
            'models': ['astra', 'sol', 'luna'], 'modes': ['standard', 'fast'],
            'evidence_sha256': {m + '-' + mode: 'a' * 64 for m, mode in evidence.MODEL_CASES}})
        for n, b in proofs.items():
            write(self.source / n, b, 0o640)
        write(self.source / 'state/config.json', b'{"synthetic":"not copied"}')
        write(self.source / 'state/customers/account/balance.json', b'{"held":3900,"balance":1920}')
        write(self.source / 'state/jobs/history/model.glb', b'original customer model')
        with closing(sqlite3.connect(self.source / 'state/jobs.sqlite')) as db:
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY, state TEXT)')
            db.execute("INSERT INTO jobs VALUES('history','failed')")
            db.commit()
        self.before = tree(self.source)

    def install(self, failure=None):
        self.ops = FixtureOperations(self.source, failure)
        return target.install(self.source, self.backup, self.ops, approved=True)

    def test_success_has_exact_write_set_and_preserves_models_balances_and_old_prices(self):
        writes, actual = [], target.base.atomic_write
        def observe(path, *args, **kwargs):
            if self.source in Path(path).parents:
                writes.append(Path(path).relative_to(self.source).as_posix())
            return actual(path, *args, **kwargs)
        with patch.object(target.base, 'atomic_write', side_effect=observe):
            result = self.install()
        self.assertTrue(result['activation_committed'])
        self.assertFalse(result['paid_generation_requested'])
        self.assertFalse(result['job_rows_changed'])
        self.assertCountEqual(writes, target.WRITES)
        after = tree(self.source)
        self.assertEqual(set(after) - set(self.before), target.NEW_FILES)
        for name, value in self.before.items():
            if name not in target.WRITES:
                self.assertEqual(after[name], value)
            else:
                self.assertEqual(after[name][1], value[1])
        self.assertEqual(after[receipts.policy.GUARD_RECEIPT], self.before[receipts.policy.GUARD_RECEIPT])
        self.assertFalse((self.backup / 'verification-stage/state').exists())
        proof = receipts.validate_installed(self.source)
        self.assertFalse(proof['live_provider_verified'])

    def test_every_write_and_lost_ack_rolls_back_exact_bytes_and_modes(self):
        actual = target.base.atomic_write
        for lost_ack in (False, True):
            for index, name in enumerate(sorted(target.WRITES)):
                self.backup = self.root / ('fail-%s-%d' % (lost_ack, index))
                fired = []
                def fail(path, *args, **kwargs):
                    if Path(path) == self.source / name and not fired:
                        fired.append(True)
                        if lost_ack:
                            actual(path, *args, **kwargs)
                        raise OSError('INERT_WRITE_FAILURE')
                    return actual(path, *args, **kwargs)
                with self.subTest(lost_ack=lost_ack, name=name), patch.object(target.base, 'atomic_write', side_effect=fail):
                    result = self.install()
                    self.assertTrue(fired)
                    self.assertTrue(result['previous_source_restored'])
                    self.assertFalse(result['activation_committed'])
                    self.assertEqual(tree(self.source), self.before)

    def test_native_ingress_and_pre_activation_failures_preserve_old_runtime(self):
        for failure in ('native', 'missing-model', 'stage-edit', 'ingress', 'ingress-edit', 'ingress-state', 'start', 'health'):
            with self.subTest(failure=failure):
                self.backup = self.root / failure
                result = self.install(failure)
                self.assertFalse(result['activation_committed'])
                self.assertTrue(result['previous_source_restored'])
                self.assertEqual(tree(self.source), self.before)

    def test_unknown_activation_latch_is_not_rolled_back_or_restarted(self):
        result = self.install('latch')
        self.assertIsNone(result['activation_committed'])
        self.assertIsNone(result['previous_source_restored'])
        self.assertNotIn('rollback', self.ops.events)
        self.assertEqual(self.ops.events.count('start'), 1)
        self.assertTrue((self.source / target.MAINTENANCE).exists())

    def test_post_commit_health_failure_preserves_new_sources_and_existing_jobs(self):
        result = self.install('post-commit-health')
        self.assertTrue(result['activation_committed'])
        self.assertIsNone(result['previous_source_restored'])
        self.assertNotIn('rollback', self.ops.events)
        self.assertEqual((self.source / 'state/jobs/history/model.glb').read_bytes(), b'original customer model')

    def test_unknown_concurrent_edit_is_preserved_and_never_activated(self):
        with self.assertRaisesRegex(target.Refused, 'recovery_required'):
            self.install('source-edit')
        self.assertEqual((self.source / 'server.py').read_bytes(), b'# unknown concurrent source\n')
        self.assertNotIn('commit', self.ops.events)

    def test_unapproved_or_unfrozen_install_does_not_touch_files(self):
        with self.assertRaises(target.Refused):
            target.install(self.source, self.backup, object())
        with patch.object(manifest, 'AFTER_SERVER_SHA256', None), self.assertRaises(ValueError):
            self.install()
        self.assertEqual(tree(self.source), self.before)
        self.assertFalse(self.backup.exists())

    def test_active_unknown_or_unapproved_cancelled_jobs_prevent_fence(self):
        for state in ('queued', 'generating', 'cancelled', 'unknown', None):
            with closing(sqlite3.connect(self.source / 'state/jobs.sqlite')) as db:
                db.execute('UPDATE jobs SET state=?', (state,))
                db.commit()
            self.backup = self.root / ('busy-' + str(state))
            before = tree(self.source)
            with self.subTest(state=state), self.assertRaises(target.fence.old.FenceRefused):
                self.install()
            self.assertNotIn('fence', self.ops.events)
            self.assertEqual(tree(self.source), before)

    def test_bad_receipt_source_or_preexisting_helper_refuses_before_quiesce(self):
        for name in (*manifest.BEFORE, *receipts.RECEIPTS, *target.NEW_FILES):
            path = self.source / name
            before = self.before.get(name)
            write(path, b'{}')
            try:
                self.backup = self.root / ('corrupt-' + name.replace('/', '-'))
                with self.subTest(name=name), self.assertRaises((ValueError, OSError, target.Refused)):
                    self.install()
                self.assertNotIn('fence', self.ops.events)
            finally:
                if before:
                    write(path, before[0], before[1])
                else:
                    path.unlink()

    def test_native_witnesses_reject_wrong_sources_models_prices_and_false_flags(self):
        native = witnesses()
        for (model, mode), item in zip(evidence.MODEL_CASES, native.models):
            value = json.loads(item)
            for field, replacement in [('source_sha256', {}), ('model', 'unknown'), ('counts', 3),
                                       ('cap_micro_usd', 9999999), ('native_fallback', True),
                                       ('live_provider_verified', True), ('actual_cli_mcp_blender', False),
                                       ('cleanup_verified', False), ('render_sha256', {}), ('seal', {})]:
                mutated = deepcopy(value)
                mutated[field] = replacement
                with self.subTest(model=model, mode=mode, field=field), self.assertRaises(evidence.EvidenceError):
                    evidence.validate_model(raw(mutated), model, mode)
        for field in ('legacy', 'phased'):
            value = json.loads(getattr(native, field))
            value['source_sha256'] = {}
            with self.assertRaises(evidence.EvidenceError):
                getattr(evidence, 'validate_' + field)(raw(value))
        with self.assertRaises(evidence.EvidenceError):
            evidence.decode(b'{"duplicate":1,"duplicate":2}')


if __name__ == '__main__':
    unittest.main()
