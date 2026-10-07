"""Adapter boundaries; no network, service, user job or provider interaction."""
import copy
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
from phased_controller import Candidate, RenderPacket, canonical, Refused


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
