"""Isolated gate caller and strict witness fixtures; no real pipeline claim."""
from copy import deepcopy
import ast
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
import unittest
from unittest.mock import patch

import test_construction_transaction as transactions

installer = transactions.installer
health = transactions.health
write = transactions.write


def evidence(hashes):
    cases = []
    for accepted in (True, False):
        phases = ['construction','inspection','reassessment'] if accepted else ['construction','inspection']
        cases.append({'accepted': accepted, 'revision': 2 if accepted else 1,
            'correction': accepted, 'server_success_returned': accepted,
            'model_sha256': 'b' * 64, 'render_sha256': {view:'c' * 64 for view in ('front','side','back')},
            'provider_requests': [{'phase':phase,'payload_sha256':'d' * 64} for phase in phases],
            'before_correction_model_sha256': 'a' * 64 if accepted else None,
            'before_correction_render_sha256': {view:'a' * 64 for view in ('front','side','back')} if accepted else None,
            'fixture_settled_micro_usd': 73844 * len(phases), 'invoice_amount': False})
    commands = [{'phase': phase, 'job_id': '00000000-0000-4000-8000-00000000000' + ('1' if index < 3 else '2'),
                 'command_sha256': 'e' * 64}
                for index, phase in enumerate(('build','build','finalize','build','finalize'))]
    return {'revision': health.REVISION, 'source_sha256': hashes, 'cases': cases, 'container_calls': commands,
        'isolated_podman_execution_verified': True, 'native_fallback': False,
        'provider_fixture': True, 'activation_receipt_fixture': True,
        'installed_runtime_receipt_written': False, 'live_provider_verified': False,
        'visual_quality_verified': False, 'cleanup_verified': True}


def legacy_evidence(hashes):
    return {'execution_id':'a' * 32,
        'terms':{'revision':'studio-pricing-v1','tier':'standard','points':250,'maxProviderCents':200},
        'immutable_terms_sha256':'b' * 64, 'ledger_cap_micro_usd':2000000,
        'ledger_policy_revision':'astra-low-tiered-v1','requests':6,'counts':6,
        'schema_verified':True,'actual_images_verified':True,'scripted_exec_phases':4,'wait_responses':2,
        'provider_fixture':True,'original_cli_standard_verified':True,
        'original_gate_sha256':'380063680197b1b175f03da6c6698c84dfb3bd9ff839de61bae69e76aa1d5f4d',
        'production_budget_changed':False,'runtime_route_override':False,'installed_receipt_written':False,
        'native_fallback':False,'live_provider_verified':False,'visual_quality_verified':False,
        'source_sha256':hashes,'cleanup_verified':True}


class GateCallerTests(unittest.TestCase):
    setUp = transactions.ConstructionTransactions.setUp
    @classmethod
    def setUpClass(cls):
        cls.sources = transactions.lineage.installed_sources()
        cls.sources['context_policy.py'] = (transactions.HERE.parents[1] / 'tools/model_context_upgrade/context_policy.py').read_bytes()

    def exercise(self, *, failure=None, verify_state=False):
        stage = self.root / 'stage'; workspace = self.root / 'verify'; workspace.mkdir()
        installer.legacy.stage_runtime(self.source, stage, self.after, {})
        gates = self.root / 'gates'; gates.mkdir()
        pins = {}
        for name, (_old_hash, marker) in installer.GATE_FILES.items():
            raw = ('# synthetic gate ' + name + '\n').encode()
            (gates / name).write_bytes(raw)
            pins[name] = (installer.base.blob_sha(raw), marker)
        generic_envs, processes, signals = [], [], []
        proof = evidence(self.expected)
        if failure == 'native-proof': proof['native_fallback'] = True
        def generic_verify(_operations, _workspace):
            generic_envs.append(dict(os.environ))
            if verify_state:
                with sqlite3.connect(stage / 'state/jobs.sqlite') as db:
                    db.execute("INSERT INTO jobs VALUES ('generic-fixture', 'synthetic', 'done', '', 0, 0)")
            if failure == 'generic': raise installer.Refused('generic_fixture_failure')
            write(stage / health.GENERIC_RECEIPT, {
                'sources': {name:self.expected[name] for name in ('codex_runner.py','blender_mcp.py')},
                'cli_mcp_roundtrip':True,'code_mode_roundtrip':True,'blender_build_roundtrip':True})
        class Process:
            pid = 99999999
            def __init__(self, args, **kwargs):
                self.name = Path(args[2]).name; self.calls = 0
                processes.append((args, kwargs))
                if verify_state:
                    if self.name == 'offline_cabinet.py':
                        # The immutable cabinet verifier makes a job folder,
                        # but relies on its caller to initialize the schema.
                        state = stage / 'state'
                        (state / 'jobs/cabinet-fixture').mkdir(parents=True)
                        tree = ast.parse((stage / 'server.py').read_text())
                        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                                     and node.name in ('database', 'status')]
                        if len(functions) != 2: raise AssertionError('Actual server status contract changed')
                        namespace = {'STATE': state, 'sqlite3': sqlite3, 'LOCK': threading.RLock(), 'time': time}
                        exec(compile(ast.Module(body=functions, type_ignores=[]), 'staged-server.py', 'exec'), namespace)
                        # No mocked SQL: without the real jobs schema this
                        # raises the same OperationalError as run_blender.
                        namespace['status']('cabinet-fixture', 'building', 'Synthetic Blender status')
                        with sqlite3.connect(state / 'jobs.sqlite') as db:
                            if db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] != 0:
                                raise AssertionError('Previous gate state leaked into cabinet verification')
                    elif (stage / 'state').exists():
                        raise AssertionError('Later gates must create their own clean state')
                marker = pins[self.name][1]
                if failure == 'old-marker' and self.name == 'offline_construction.py':
                    marker = 'STANDARD_FIRST_EXEC_REAL_PIPELINE_OK'
                kwargs['stdout'].write((marker + '\n').encode())
                if self.name == 'offline_construction.py' and failure != 'missing-proof':
                    write(Path(args[args.index('--workspace')+1]) / 'phased-standard-evidence.json', proof)
                if self.name == 'offline_legacy_standard.py':
                    value = legacy_evidence({**proof['source_sha256']})
                    if failure == 'legacy-override': value['runtime_route_override'] = True
                    write(Path(args[args.index('--workspace')+1]) / 'legacy-standard-evidence.json', value)
            def wait(self, timeout):
                self.calls += 1
                if failure == 'timeout' and self.calls == 1:
                    raise installer.subprocess.TimeoutExpired('synthetic', timeout)
                return 1 if failure == 'exit' else 0
            def poll(self): return None if failure == 'timeout' and self.calls == 1 else 0
        operations = installer.Operations(self.source, self.root)
        lease = transactions.Operations(self.source).lease
        with patch.dict(os.environ, {'OPENAI_API_KEY':'synthetic-excluded','CODEX_API_KEY':'synthetic-excluded',
                                     'UNRELATED_CREDENTIAL':'synthetic-excluded'}, clear=False):
            before = dict(os.environ)
            with patch.object(installer,'HERE',gates), patch.object(installer,'GATE_FILES',pins), \
                 patch.object(installer.legacy.install_completion.Operations,'verify',generic_verify), \
                 patch.object(installer.subprocess,'Popen',Process), \
                 patch.object(installer.os,'killpg',side_effect=lambda *args:signals.append(args)):
                try: answer = operations._verify_stage(stage, workspace, lease)
                finally: self.assertEqual(dict(os.environ), before)
        return answer, generic_envs, processes, signals

    def test_cabinet_has_fresh_real_server_schema_and_later_gates_have_clean_state(self):
        original = (self.source / 'state/jobs.sqlite').read_bytes()
        self.exercise(verify_state=True)
        self.assertFalse((self.root / 'stage/state').exists())
        self.assertEqual((self.source / 'state/jobs.sqlite').read_bytes(), original)

    def test_four_distinct_gate_classes_and_credential_free_environments(self):
        answer, generic, processes, signals = self.exercise()
        self.assertIsInstance(answer, installer.GateEvidence)
        self.assertEqual(answer.gates, installer.REQUIRED_GATES)
        self.assertEqual(len(generic), 1); self.assertEqual(len(processes), 3)
        self.assertEqual([Path(args[2]).name for args,_ in processes], list(installer.GATE_FILES))
        self.assertEqual(processes[-1][0][-2:], ['--workspace', str(self.root / 'verify/phased-gate-workspace')])
        self.assertEqual(processes[-2][0][-2:], ['--workspace', str(self.root / 'verify/legacy-gate-workspace')])
        allowed = {'PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR',
                   'PYTHONDONTWRITEBYTECODE','FROGE_FAST_DRAFT_V1'}
        for env in generic + [options['env'] for _,options in processes]:
            self.assertTrue(set(env) <= allowed)
        self.assertTrue(all(options['start_new_session'] is True for _,options in processes))
        self.assertEqual(signals, [])

    def test_success_marker_requires_zero_exit(self):
        with self.assertRaisesRegex(installer.Refused,'construction_pipeline_unverified'): self.exercise(failure='exit')

    def test_old_marker_cannot_attest_new_phased_gate(self):
        with self.assertRaisesRegex(installer.Refused,'construction_pipeline_unverified'): self.exercise(failure='old-marker')

    def test_successful_exit_without_proof_is_not_evidence(self):
        with self.assertRaises(OSError): self.exercise(failure='missing-proof')

    def test_native_proof_cannot_substitute_for_original_sandbox(self):
        with self.assertRaisesRegex(installer.Refused,'phased_pipeline_evidence_unverified'): self.exercise(failure='native-proof')

    def test_generic_failure_restores_parent_environment(self):
        with self.assertRaisesRegex(installer.Refused,'generic_fixture_failure'): self.exercise(failure='generic')

    def test_legacy_route_override_is_not_old_standard_evidence(self):
        with self.assertRaisesRegex(installer.Refused,'legacy_standard_evidence_unverified'): self.exercise(failure='legacy-override')

    def test_timed_out_gate_is_not_reported_as_success(self):
        with self.assertRaises(installer.subprocess.TimeoutExpired): self.exercise(failure='timeout')

    def test_phased_witness_exact_source_shape_flags_and_case_outcomes(self):
        original = evidence(self.expected)
        self.assertEqual(installer.validate_phased_evidence(installer.encoded(original)), original)
        mutations = [
            lambda x:x['source_sha256'].update({'runtime_controller.py':'0' * 64}),
            lambda x:x['source_sha256'].update({'unreviewed.py':'0' * 64}),
            lambda x:x.update({'cleanup_verified':1}),
            lambda x:x.update({'live_provider_verified':True}),
            lambda x:x['cases'][0].update({'server_success_returned':False}),
            lambda x:x['cases'][1].update({'server_success_returned':True}),
            lambda x:x['cases'][0].update({'revision':1}),
            lambda x:x['cases'][0].update({'before_correction_model_sha256':'b' * 64}),
            lambda x:x['cases'][0].update({'fixture_settled_micro_usd':0}),
            lambda x:x['cases'][0]['provider_requests'].pop(),
            lambda x:x['container_calls'].pop(),
            lambda x:x['container_calls'][0].update({'phase':'finalize'}),
            lambda x:x['container_calls'][3].update({'job_id':x['container_calls'][0]['job_id']}),
        ]
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                modified = deepcopy(original); mutation(modified)
                with self.assertRaises(installer.Refused): installer.validate_phased_evidence(installer.encoded(modified))

    def test_legacy_witness_requires_exact_terms_schema_images_and_counted_cli_turns(self):
        original = legacy_evidence(self.expected)
        self.assertEqual(installer.validate_legacy_evidence(installer.encoded(original)), original)
        mutations = [
            lambda x:x['source_sha256'].update({'runtime_controller.py':'0' * 64}),
            lambda x:x.update({'original_gate_sha256':'0' * 64}),
            lambda x:x.update({'runtime_route_override':True}),
            lambda x:x.update({'actual_images_verified':1}),
            lambda x:x.update({'counts':7}),
            lambda x:x.update({'wait_responses':25,'counts':29,'requests':29}),
            lambda x:x['terms'].update({'maxProviderCents':400}),
            lambda x:x.update({'ledger_cap_micro_usd':1750000}),
            lambda x:x.update({'scripted_exec_phases':3}),
            lambda x:x.update({'execution_id':'synthetic-unbound-value'}),
            lambda x:x.update({'live_provider_verified':True}),
        ]
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                modified = deepcopy(original); mutation(modified)
                with self.assertRaises(installer.Refused): installer.validate_legacy_evidence(installer.encoded(modified))


if __name__ == '__main__': unittest.main()
