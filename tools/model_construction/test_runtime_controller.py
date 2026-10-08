"""Adapter boundaries; no network, service, user job or provider interaction."""
import copy
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch

import runtime_controller as runtime
import runtime_patch
from phased_controller import Candidate, Inputs, PreparedRequest, RenderPacket, canonical, Refused


class CallbackTests(unittest.TestCase):
    def test_original_event_and_remaining_deadline_reach_both_original_lifecycles(self):
        event = threading.Event()
        server = types.SimpleNamespace(run_blender=Mock(), run_blender_finalize=Mock())
        job, candidate = Path('/synthetic/job'), Path('/synthetic/job/candidate')
        now = [100.0]
        build, finalize = runtime.blender_callbacks(job,event,1800,server,clock=lambda:now[0])
        build(candidate)
        self.assertIs(server.run_blender.call_args.args[2],event)
        self.assertEqual(server.run_blender.call_args.kwargs['timeout'],420)
        now[0] = 1600
        finalize(candidate)
        self.assertIs(server.run_blender_finalize.call_args.args[2],event)
        self.assertEqual(server.run_blender_finalize.call_args.kwargs['timeout'],200)
        with self.assertRaises(Refused): build(candidate)
        event.set()
        with self.assertRaises(Refused): finalize(candidate)
        self.assertEqual(server.run_blender.call_count,1)
        self.assertEqual(server.run_blender_finalize.call_count,1)

    def test_first_build_timeout_preserves_second_build_assessment_and_export(self):
        event = threading.Event()
        server = types.SimpleNamespace(run_blender=Mock(), run_blender_finalize=Mock())
        now, pending = [100.0], [1]
        build, _ = runtime.blender_callbacks(Path('/synthetic/job'), event, 1800, server,
            clock=lambda: now[0], pending_builds=lambda: pending[0])
        candidate = Path('/synthetic/job/candidate')
        build(candidate)
        self.assertEqual(server.run_blender.call_args.kwargs['timeout'], 420)
        # Even if preflight took unexpectedly long, the callback cannot spend
        # the CPU time promised to the next build and its mandatory review.
        now[0] = 700
        build(candidate)
        self.assertEqual(server.run_blender.call_args.kwargs['timeout'], 50)
        now[0] = 750
        with self.assertRaises(Refused):
            build(candidate)
        self.assertEqual(server.run_blender.call_count, 2)
        pending[0] = 0
        build(candidate)
        self.assertEqual(server.run_blender.call_args.kwargs['timeout'], 420)


class InitialEditPolicyTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.now, self.cap, self.sealed = [100.0], [1750000], [False]
        self.inputs = Inputs.freeze({'construction_mode': runtime.REVISION,
            'instructions': runtime.STANDARD, 'prompt': 'Original detailed object',
            'execution_id': 'same-original-job'})
        self.job = types.SimpleNamespace(folder=self.folder, started=0.0,
            fast_limits={'seconds': 1800}, attempts=0, revision=0,
            current=None, build_limit=5, execution_id='same-original-job')
        self.gateway = types.SimpleNamespace(cancelled=threading.Event(), error=None,
            unknown_usage=False, active=False, requests=1, output=512,
            fast_limits={'seconds': 1800, 'requests': 32, 'output': 96000})
        # Deliberately retain original held liability: the admission must use
        # it as-is and must not settle, release, or replace this ledger state.
        self.state = {'requests': 1, 'legacyHeld': 0,
                      'holds': {'original-construction': {'held': 200000}}}
        self.reads = []
        @contextmanager
        def ledger(folder):
            self.assertEqual(folder, self.folder)
            self.reads.append(folder)
            yield self.folder / 'ledger.json', self.state
        self.spend = types.SimpleNamespace(ledger=ledger,
            studio_pricing=types.SimpleNamespace(terms_at=lambda *_: 'existing-terms',
                cap_and_revision=lambda _: (self.cap[0], 'unchanged-pricing')),
            terminal_budget=types.SimpleNamespace(sealed=lambda _: self.sealed[0]),
            used=lambda state: state['legacyHeld'] + sum(
                hold['held'] for hold in state['holds'].values()))
        self.policy = runtime.RuntimePolicy(self.gateway, self.job, self.inputs, self.spend,
                                            clock=lambda: self.now[0])
        self.policy.next_phase = 'inspection'

    def admit(self):
        return self.policy.admit_initial_edit(self.inputs, ('inspection',))

    def test_sequence_fence_is_read_only_single_use_and_does_not_advance_paid_phase(self):
        before = copy.deepcopy(self.state)
        self.assertTrue(self.admit())
        self.assertEqual(self.state, before)
        self.assertEqual(self.reads, [self.folder])
        self.assertEqual(self.gateway.requests, 1)
        self.assertEqual(self.gateway.output, 512)
        self.assertEqual(self.policy.permits, {})
        self.assertEqual(self.policy.confirmed, {})
        self.assertEqual(self.policy.next_phase, 'inspection')
        self.assertEqual(self.policy.pending_initial_builds(), 2)
        self.assertFalse(self.admit())
        self.assertEqual(self.reads, [self.folder])
        self.assertEqual(self.state, before)

    def test_both_build_slots_and_complete_time_are_required_before_first_build(self):
        self.job.build_limit = 1
        self.assertFalse(self.admit())
        self.assertEqual(self.reads, [])
        self.job.build_limit = 2
        self.now[0] = 330.0  # Exactly 1470 left is insufficient.
        self.assertFalse(self.admit())
        self.assertEqual(self.reads, [])
        self.now[0] = 329.9
        self.assertTrue(self.admit())
        self.assertTrue(self.policy.check('before_build', self.inputs, None))
        self.now[0] = 331
        self.assertFalse(self.policy.check('before_build', self.inputs, None))
        self.job.attempts = 1
        self.now[0] = 500
        self.assertEqual(self.policy.pending_initial_builds(), 1)
        self.assertTrue(self.policy.check('before_build', self.inputs, None))
        self.job.attempts = 2
        self.assertEqual(self.policy.pending_initial_builds(), 0)
        self.assertFalse(self.policy.check('before_build', self.inputs, None))

    def test_construction_admission_protects_optional_second_build_before_provider_send(self):
        self.policy.next_phase = 'construction'
        prepared = PreparedRequest(canonical({'max_output_tokens': 8192}).encode(), 'a' * 64)
        self.gateway.prepare_construction = Mock(return_value={
            'permit_id': 'original-gateway-permit', 'payload_sha256': prepared.fingerprint})
        before = copy.deepcopy(self.state)
        admission = self.policy.admit('construction', self.inputs, None, prepared, ('inspection',))
        self.assertEqual(admission.reservation_id, 'original-gateway-permit')
        args = self.gateway.prepare_construction.call_args.kwargs
        self.assertEqual(args['expires_at'], 330)
        self.assertEqual(self.policy.deadline - args['expires_at'], 1470)
        self.assertEqual(args['protected_remaining_micro_usd'], runtime.phase_cost('inspection'))
        self.assertEqual(args['protected_remaining_requests'], 1)
        self.assertEqual(args['max_input_tokens'], 65536)
        self.assertEqual(self.gateway.prepare_construction.call_count, 1)
        self.assertEqual(self.state, before)
        self.assertEqual(self.reads, [])

    def test_too_little_construction_time_prevents_gateway_permit(self):
        self.policy.next_phase = 'construction'
        self.now[0] = 330
        self.gateway.prepare_construction = Mock()
        prepared = PreparedRequest(b'{"max_output_tokens":8192}', 'a' * 64)
        with self.assertRaisesRegex(Refused, 'remaining_phase_time_not_funded'):
            self.policy.admit('construction', self.inputs, None, prepared, ('inspection',))
        self.gateway.prepare_construction.assert_not_called()

    def test_cap_request_slots_and_held_liability_still_protect_inspection(self):
        cases = ('wrong_cap', 'sealed', 'ledger_requests', 'held',
                 'gateway_requests', 'gateway_output')
        for case in cases:
            with self.subTest(case=case):
                self.setUp()
                if case == 'wrong_cap': self.cap[0] = 4000000
                if case == 'sealed': self.sealed[0] = True
                if case == 'ledger_requests': self.state['requests'] = 32
                if case == 'held': self.state['holds']['original-construction']['held'] = 1200000
                if case == 'gateway_requests': self.gateway.requests = 32
                if case == 'gateway_output': self.gateway.output = 96000
                before = copy.deepcopy(self.state)
                self.assertFalse(self.admit())
                self.assertFalse(self.policy.initial_edit_fenced)
                self.assertEqual(self.state, before)
                self.assertEqual(self.policy.permits, {})

    def test_initial_fence_requires_original_fresh_job_completed_phase_and_cancellation_state(self):
        for case in ('cancelled', 'cancelled_file', 'active', 'unknown', 'error', 'expired',
                     'used_attempt', 'used_revision', 'existing_model', 'wrong_phase', 'changed_inputs'):
            with self.subTest(case=case):
                self.setUp()
                inputs = self.inputs
                if case == 'cancelled': self.gateway.cancelled.set()
                if case == 'cancelled_file': (self.folder / 'agent-cancelled').touch()
                if case == 'active': self.gateway.active = True
                if case == 'unknown': self.gateway.unknown_usage = True
                if case == 'error': self.gateway.error = 'Original failure'
                if case == 'expired': self.now[0] = 1800
                if case == 'used_attempt': self.job.attempts = 1
                if case == 'used_revision': self.job.revision = 1
                if case == 'existing_model': self.job.current = self.folder / 'candidate'
                if case == 'wrong_phase': self.policy.next_phase = 'construction'
                if case == 'changed_inputs':
                    inputs = Inputs.freeze({**self.inputs.request, 'prompt': 'Changed request'})
                self.assertFalse(self.policy.admit_initial_edit(inputs, ('inspection',)))
                self.assertEqual(self.reads, [])
                self.assertFalse(self.policy.initial_edit_fenced)

    def test_cancellation_or_lost_build_slot_after_fence_is_checked_before_dispatch(self):
        self.assertTrue(self.admit())
        self.gateway.cancelled.set()
        self.assertFalse(self.policy.check('before_build', self.inputs, None))
        self.gateway.cancelled.clear()
        self.job.build_limit = 1
        self.assertFalse(self.policy.check('before_build', self.inputs, None))


class RoutingTests(unittest.TestCase):
    def test_explicit_standard_only_and_no_fallback_after_new_health_failure(self):
        def profile(request):
            text = request['instructions']
            if 'CABINET' in text: return 'cabinet'
            if 'CHARACTER' in text: return 'character'
            if runtime.STANDARD in text or 'WORLDIFACT REFERENCE-FIDELITY MODE:' in text: return 'standard'
            return None
        fast = [False]
        cap = [1750000]
        modules = {'completion_policy':types.SimpleNamespace(profile=profile),
            'fast_preview':types.SimpleNamespace(policy=lambda *a,**k:{'fast':fast[0]}),
            'studio_pricing':types.SimpleNamespace(folder_root=lambda folder:folder,
                terms_at=lambda *a:None,cap_and_revision=lambda value:(cap[0],'fixture'))}
        with patch.dict(sys.modules,modules):
            self.assertTrue(runtime.eligible(Path('/fixture'),runtime.STANDARD))
            for text in ('normal prose','WORLDIFACT REFERENCE-FIDELITY MODE:',
                         runtime.STANDARD+' CABINET',runtime.STANDARD+' CHARACTER'):
                self.assertFalse(runtime.eligible(Path('/fixture'),text))
            for value in (2000000,4000000):
                cap[0]=value
                self.assertFalse(runtime.eligible(Path('/fixture'),runtime.STANDARD))
            cap[0]=1750000;fast[0]=True
            self.assertFalse(runtime.eligible(Path('/fixture'),runtime.STANDARD))


class ReferenceTests(unittest.TestCase):
    def test_order_complete_metadata_and_bytes_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            raw=[{'name':'first','view':'front','sha256':'a','custom':{'requested':'keep'}},
                 {'name':'second','view':'back','sha256':'b','additional':['one','two']}]
            (folder/'reference-photos.json').write_text(json.dumps(raw))
            photos=[{**{k:v for k,v in entry.items() if k in ('name','view','sha256')},
                     'bytes':data,'dataUrl':'not copied'}
                    for entry,data in zip(raw,(b'first bytes',b'second bytes'))]
            before=copy.deepcopy(photos)
            refs=runtime.reference_values(photos,folder)
            self.assertEqual([json.loads(r.metadata_json) for r in refs],raw)
            self.assertEqual([r.data for r in refs],[b'first bytes',b'second bytes'])
            self.assertEqual(photos,before)
            raw[0]['name']='changed'
            (folder/'reference-photos.json').write_text(json.dumps(raw))
            with self.assertRaises(Refused): runtime.reference_values(photos,folder)

    def test_missing_duplicate_or_extra_manifest_cannot_be_silently_dropped(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            self.assertEqual(runtime.reference_values([],folder),())
            path=folder/'reference-photos.json'
            for raw in ('[{"name":"a"}]','[{"name":"a","name":"b"}]','{}'):
                path.write_text(raw)
                with self.assertRaises((Refused,ValueError)):
                    runtime.reference_values([],folder)


class PageAdapter:
    def __init__(self):
        self.raw={'scene':json.dumps({'parts':[{'name':'żółw '+('é'*17000)}]},ensure_ascii=False),
                  'edits':'# original edits\n'+('x = 1\n'*3000),'report':'{"triangles":12}'}
        self.candidate=Candidate('fixture',1,'a'*64,canonical({'triangles':12}))
        self.offsets=[]
        self.bad=None

    def current(self): return self.candidate

    def call(self,name,args):
        assert name=='get_current_model'
        if 'section' not in args:
            return {'revision':1,'has_model':True,'scene':None,'edits':None,'report':None,
                    'sections':{key:{'sha256':hashlib.sha256(value.encode()).hexdigest()}
                                for key,value in self.raw.items()}}
        key=args['section'];raw=self.raw[key];offset=args['offset'];end=min(len(raw),offset+args['limit'])
        self.offsets.append((key,offset))
        value={'revision':1,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'offset':offset,
               'text':raw[offset:end],'next_offset':end if end<len(raw) else None,
               'complete':end==len(raw)}
        if self.bad=='hash':value['sha256']='b'*64
        if self.bad=='loop':value['next_offset']=offset
        if self.bad=='incomplete':value['next_offset']=None;value['complete']=False
        if self.bad=='changed':self.candidate=Candidate('fixture',2,'b'*64,self.candidate.report_json)
        return value


class FullStateTests(unittest.TestCase):
    def test_all_original_section_bytes_are_reassembled_with_revision_hashes(self):
        adapter=PageAdapter();packet=RenderPacket(adapter.candidate,())
        result=runtime.full_state(adapter,packet)
        self.assertEqual(result['scene'],json.loads(adapter.raw['scene']))
        self.assertEqual(result['edits'],adapter.raw['edits'])
        self.assertEqual(result['report'],json.loads(adapter.raw['report']))
        self.assertIn(('scene',16000),adapter.offsets)
        self.assertIn(('edits',16000),adapter.offsets)

    def test_corrupt_nonprogressing_partial_and_changed_sections_fail(self):
        for bad in ('hash','loop','incomplete','changed'):
            adapter=PageAdapter();packet=RenderPacket(adapter.candidate,());adapter.bad=bad
            with self.subTest(bad=bad),self.assertRaises(Refused):
                runtime.full_state(adapter,packet)


class SourceEnvelopeTests(unittest.TestCase):
    def test_exact_core_and_five_helper_changes_compile_with_legacy_files_preserved(self):
        root=Path(__file__).resolve().parents[2]
        source=root.parent/'bounded-construction-installed-fixture'
        if source.is_dir():
            original={name:(source/name).read_bytes() for name in runtime_patch.EXPECTED}
        else:
            sys.path.insert(0,str(root/'tools/model_context_upgrade'))
            import test_upgrade_transaction as lineage
            original=lineage.installed_sources()
            original['context_policy.py']=(root/'tools/model_context_upgrade/context_policy.py').read_bytes()
        helpers={name:(Path(__file__).parent/name).read_bytes() for name in runtime_patch.HELPERS}
        result=runtime_patch.changes(original,helpers)
        self.assertEqual({name for name in original if original[name]!=result[name]},runtime_patch.MODIFIED)
        self.assertEqual(set(result)-set(original),runtime_patch.HELPERS)
        self.assertIn(b'runtime_controller.eligible(Path(folder),instructions)',result['codex_runner.py'])
        self.assertIn(b'construction_health.verified_health(root)',result['context_policy.py'])
        altered={**original,'server.py':original['server.py']+b'\n'}
        with self.assertRaises(ValueError):runtime_patch.changes(altered,helpers)


if __name__=='__main__':unittest.main()
