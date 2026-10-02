"""Offline structural/continuation/source/rollback tests. No paid model calls."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch

import completion_policy as policy
import source_patch
import install_completion as installer


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def glb(path, triangles=12, meshes=13, copies=1, materials=3):
    doc={'asset':{'version':'2.0'},'accessors':[{'count':triangles*3}],
         'meshes':[{'primitives':[{'indices':0,'mode':4}]} for _ in range(meshes)],
         'nodes':[{'mesh':i} for _ in range(copies) for i in range(meshes)],
         'materials':[{} for _ in range(materials)]}
    body=json.dumps(doc).encode();body+=b' '*((-len(body))%4)
    raw=struct.pack('<IIIII',0x46546c67,2,20+len(body),len(body),0x4e4f534a)+body
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.request={'instructions':policy.CABINET,'execution_id':'x','completion_started':time.monotonic()-10}

    def test_incident_13_boxes_rejected_with_actionable_measures(self):
        glb(self.root/'model.glb')
        result=policy.assessment(self.request,self.root)
        self.assertFalse(result['structural_passed']);self.assertEqual(result['measured']['renderedTriangles'],156)
        self.assertEqual(result['deficits']['substantialMeshCount'],{'actual':0,'required':6})
        self.assertIn('physical',result['next_action']);self.assertFalse(result['visual_fidelity_verified'])
        self.assertEqual(policy.minimum_output(self.request,{'path':self.root}),2048)

    def test_all_thresholds_and_linked_mesh_count(self):
        glb(self.root/'model.glb',triangles=2500,meshes=8)
        self.assertTrue(policy.assessment(self.request,self.root)['structural_passed'])
        self.assertEqual(policy.minimum_output(self.request,{'path':self.root}),256)
        glb(self.root/'model.glb',triangles=2500,meshes=1,copies=8)
        result=policy.assessment(self.request,self.root)
        self.assertEqual(result['measured']['renderedTriangles'],20000)
        self.assertFalse(result['structural_passed']);self.assertIn('meshCount',result['deficits'])
        for kw in ({'triangles':2499},{'meshes':7},{'materials':2}):
            glb(self.root/'model.glb',**{'triangles':2500,'meshes':8,**kw})
            self.assertFalse(policy.assessment(self.request,self.root)['structural_passed'])

    def test_scope_and_priority(self):
        self.assertIsNone(policy.profile({'instructions':'Build a cabinet WORLDIFACT'}))
        self.assertIsNone(policy.profile({'prompt':policy.CABINET,'instructions':''}))
        self.assertEqual(policy.guidance({'instructions':''}),'')
        self.assertIn('FIRST build',policy.guidance(self.request))
        self.assertEqual(policy.required_views(self.request,{'subject_type':'object'}),{'front','side','back','three-quarter'})
        self.assertEqual(policy.minimum_output(self.request,None),2048)
        self.assertEqual(policy.minimum_output({},None),256)

    def test_invalid_glb_fails_closed(self):
        (self.root/'model.glb').write_bytes(b'bad')
        self.assertFalse(policy.assessment(self.request,self.root)['structural_passed'])

    def gateway(self):
        return types.SimpleNamespace(folder=self.root,fast_limits={'fast':False,'requests':32,'output':96000},
            requests=12,output=1711,error=None,error_code=None,upstream_status=None,unknown_usage=False,
            active=False,cancelled=threading.Event())

    def test_continuation_only_one_clean_known_usage_same_limits(self):
        g=self.gateway();start=time.monotonic()-10
        ok=lambda **changes:policy.can_continue(self.request,g,changes.get('code',0),changes.get('reader',False),changes.get('failure'),changes.get('pass_index',0),changes.get('started',start),1800)
        self.assertTrue(ok())
        for change in ({'code':1},{'reader':True},{'failure':'x'},{'pass_index':1},{'started':start-1800}): self.assertFalse(ok(**change))
        for field,value in [('unknown_usage',True),('error_code','WORLDIFACT_RESPONSE_INCOMPLETE'),('upstream_status',500),('active',True),('requests',32),('requests',0),('output',96000)]:
            old=getattr(g,field);setattr(g,field,value);self.assertFalse(ok());setattr(g,field,old)
        g.cancelled.set();self.assertFalse(ok());g.cancelled.clear()
        (self.root/'agent-cancelled').touch();self.assertFalse(ok())

    def job(self):
        return types.SimpleNamespace(folder=self.root,request=self.request,execution_id='x',fast_limits={'fast':False},
            build_limit=5,started=self.request['completion_started'],attempts=4,revision=2,blender_seconds=40.,
            calls=[{'tool':'build_model','status':'failed'}],tool_failures=2,seen={'front','side','back'},current=None)

    def test_restore_keeps_failed_attempts_deadline_current_and_edits(self):
        job=self.job();candidate=self.root/'candidates/3';candidate.mkdir(parents=True)
        (self.root/'candidates/4').mkdir();(candidate/'edits.py').write_text('original edit')
        policy.save_state(job,write);new=self.job();new.attempts=0;new.started=time.monotonic()
        policy.restore_state(new,lambda folder,execution_id:{'path':candidate,'info':{'revision':2}})
        self.assertEqual(new.attempts,4);self.assertEqual(new.revision,2);self.assertEqual(new.started,job.started)
        self.assertEqual(new.current,candidate);self.assertEqual(new.blender_seconds,40);self.assertEqual(new.seen,set())
        self.assertEqual((new.current/'edits.py').read_text(),'original edit')

    def test_corrupt_stale_unaccounted_and_unfinished_checkpoints_refused(self):
        job=self.job();policy.save_state(job,write)
        value=json.loads((self.root/policy.STATE).read_text())
        for change in ({'execution_id':'old'},{'attempts':6},{'started':time.monotonic()},{'calls':[{'status':'started'}]}):
            write(self.root/policy.STATE,{**value,**change})
            with self.assertRaises(ValueError):policy.restore_state(self.job(),lambda *_:None)
        write(self.root/policy.STATE,value);(self.root/'candidates/5').mkdir(parents=True)
        with self.assertRaises(ValueError):policy.restore_state(self.job(),lambda *_:None)


class FakeOperations:
    def __init__(self,source,fail=None):self.source=source;self.fail=fail;self.events=[]
    def preflight(self):
        self.events.append('preflight')
        if self.fail=='active':raise installer.base.InstallError('active')
    @contextlib.contextmanager
    def quiesce(self):self.events.append('quiesce');yield
    def assert_idle(self):self.events.append('idle')
    def stop(self):self.events.append('stop')
    def start(self):self.events.append('start')
    def health(self,*_):self.events.append('health')
    def verify(self,*_):
        self.events.append('verify')
        if self.fail=='verify':raise ValueError('fixture failure')
        write(self.source/installer.base.RECEIPT,{'sources':{n:hashlib.sha256((self.source/n).read_bytes()).hexdigest() for n in ('codex_runner.py','blender_mcp.py')},'cli_mcp_roundtrip':True,'code_mode_roundtrip':True,'blender_build_roundtrip':True})


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'),'Pinned source fixture is required in CI')
class ExactSourceTests(unittest.TestCase):
    def setUp(self):
        from source_fixture import installed_sources
        self.original=installed_sources(os.environ['MODEL_COMPLETION_SOURCE'])
        self.input={n:self.original[n] for n in source_patch.EXPECTED}
        self.patched=source_patch.changes(self.input,Path(policy.__file__).read_bytes())
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def test_exact_source_and_unknown_mutation(self):
        self.assertEqual({n:hashlib.sha256(b).hexdigest() for n,b in self.input.items()},source_patch.EXPECTED)
        with self.assertRaises(ValueError):source_patch.changes({**self.input,'server.py':self.input['server.py']+b'\n'},b'')
        for n,b in self.patched.items():compile(b,n,'exec')
        runner=self.patched['codex_runner.py'].decode()
        self.assertEqual(runner.count('with Gateway(key,folder,cancelled) as gateway:'),1)
        self.assertEqual(runner.count('execution_id=secrets.token_hex(16)'),1)
        self.assertEqual(runner.count('completion_started=time.monotonic()'),1)
        self.assertIn('WORLDIFACT_RESPONSE_INCOMPLETE',runner)
        self.assertIn('current_candidate(outer.folder)',runner)
        self.assertIn('timeout=900',runner)
        self.assertIn('astra_spend_v2.settle_completed',runner)
        self.assertIn('range(1+completion_policy.MAX_CONTINUATIONS)',runner)

    def load_spend(self):
        module=types.ModuleType('patched_spend');module.__file__=str(self.root/'astra_spend_v2.py')
        exec(compile(self.patched['astra_spend_v2.py'],'patched_spend','exec'),module.__dict__)
        return module

    def test_minimum_output_no_reservation_below_floor_and_legacy_default_unchanged(self):
        spend=self.load_spend();job=self.root/'job';job.mkdir();ledger=self.root/'ledger'
        # Existing used amount leaves only 1000 output tokens after input floor.
        key=hashlib.sha256(str(job.resolve()).encode()).hexdigest();path=ledger/key/spend.legacy.STATE
        held=spend.CEILING_MICRO_USD-2048*spend.INPUT_RATE-1000*spend.OUTPUT_RATE
        write(path,{'revision':spend.REVISION,'legacyHeld':held,'requests':1,'holds':{}})
        before=path.read_bytes()
        with self.assertRaises(spend.SpendError):spend.reserve(job,0,16000,ledger_root=ledger,minimum_output=2048)
        self.assertEqual(path.read_bytes(),before)
        token,count=spend.reserve(job,0,16000,ledger_root=ledger)
        self.assertEqual(count,1000)
        state=json.loads(path.read_text());self.assertEqual(state['requests'],2);self.assertIn(token,state['holds'])
        self.assertEqual(state['legacyHeld'],held)
        self.assertLessEqual(spend.used(state),1750000)

    def setup_install(self):
        source=self.root/'worker';source.mkdir()
        for n,b in self.original.items():
            p=source/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
        write(source/installer.base.RECEIPT,{'old':True})
        write(source/installer.cache.legacy.RECEIPT,{'revision':installer.cache.legacy.REVISION,
            'sha256':{n:hashlib.sha256(self.original[n]).hexdigest() for n in ('codex_runner.py','fast_preview.py','astra_spend.py')},
            'outputPolicy':{'revision':installer.previous.policy.REVISION,'sha256':hashlib.sha256(self.original['astra_spend_v2.py']).hexdigest()}})
        (source/'state').mkdir();(source/'state/jobs.sqlite').write_bytes(b'unchanged database')
        (source/'state/secrets').write_bytes(b'never printed');(source/'state/ledger').write_bytes(b'unchanged ledger')
        return source

    def test_installer_success_and_unchanged_state(self):
        source=self.setup_install();ops=FakeOperations(source)
        with patch.object(installer,'check_health'),patch.object(installer.policy,'verified_health',return_value={'ok':True}):
            result=installer.install(source,self.root/'backup',ops,approved=True)
        self.assertEqual(result['phase'],'WORLDIFACT_MODEL_COMPLETION_VERIFIED')
        self.assertFalse(result['paid_generation_requested']);self.assertEqual(result['max_provider_usd'],1.75)
        for n,b in self.patched.items():self.assertEqual((source/n).read_bytes(),b)
        self.assertEqual((source/'state/jobs.sqlite').read_bytes(),b'unchanged database')
        self.assertEqual((source/'state/ledger').read_bytes(),b'unchanged ledger')
        self.assertEqual((self.root/'backup').stat().st_mode&0o777,0o700)

    def test_verification_failure_restores_all_sources_receipts_and_service(self):
        source=self.setup_install();before={str(p.relative_to(source)):p.read_bytes() for p in source.rglob('*') if p.is_file()};ops=FakeOperations(source,'verify')
        with patch.object(installer.cache,'check_health'),self.assertRaises(installer.base.InstallError):
            installer.install(source,self.root/'backup',ops,approved=True)
        after={str(p.relative_to(source)):p.read_bytes() for p in source.rglob('*') if p.is_file()}
        self.assertEqual(before,after);self.assertEqual(ops.events[-3:],['stop','start','health'])

    def test_no_approval_or_active_queue_no_changes(self):
        source=self.setup_install()
        for approved,fail in [(False,None),(True,'active')]:
            with self.assertRaises(installer.base.InstallError):installer.install(source,self.root/'backup',FakeOperations(source,fail),approved=approved)
            self.assertFalse((self.root/'backup').exists());self.assertFalse((source/policy.RECEIPT).exists())

    def test_diagnostic_has_no_side_effects_or_sensitive_fields(self):
        source=self.setup_install();jobid='00000000-0000-0000-0000-000000000001';job=source/'state/jobs'/jobid;job.mkdir(parents=True)
        key=hashlib.sha256(str(job.resolve()).encode()).hexdigest();path=source/'state/worldifact-astra-budgets'/key/installer.cache.legacy.STATE
        state={'revision':installer.previous.policy.REVISION,'legacyHeld':0,'requests':1,'holds':{'0'*32:{'input':2048,'output':256,'held':2048*14+256*55}}}
        write(path,state);before=path.read_bytes();result=installer.diagnose_job(source,jobid)
        self.assertEqual(result['unsettled_holds'][0]['output_ceiling'],256);self.assertEqual(path.read_bytes(),before)
        self.assertNotIn('response',json.dumps(result));self.assertNotIn(jobid,json.dumps(result));self.assertNotIn('0'*32,json.dumps(result))


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'),'Pinned source fixture is required in CI')
class RunnerIntegrationTests(unittest.TestCase):
    def setUp(self):
        import ast
        from source_fixture import installed_sources
        source=installed_sources(os.environ['MODEL_COMPLETION_SOURCE'])
        self.patched=source_patch.changes({n:source[n] for n in source_patch.EXPECTED},Path(policy.__file__).read_bytes())
        tree=ast.parse(self.patched['codex_runner.py'])
        self.function=ast.Module(body=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='run'],type_ignores=[])
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def run_fixture(self, exits, incomplete=False, ordinary=False):
        calls=[];gateways=[];outcome=[None];job=self.root/'job';job.mkdir();ledger=[]
        class FakeGateway:
            def __init__(self,key,folder,cancelled):
                self.folder=folder;self.cancelled=cancelled;self.fast_limits={'fast':False,'requests':32,'output':96000,'seconds':1800}
                self.requests=0;self.output=0;self.error=None;self.error_code=None;self.unknown_usage=False
                self.upstream_status=None;self.active=False;self.completed=False;self.token='fixture';self.server=types.SimpleNamespace(server_port=1)
                gateways.append(self)
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def save(self):pass
            def stop(self,code,message):self.error_code=code;self.error=message
        def popen(command,**kwargs):
            g=gateways[0];index=len(calls);g.requests+=3;g.output+=200;ledger.append({'held':100,'job':str(job)})
            request=json.loads((job/'agent-request.json').read_text());calls.append((g,request['execution_id'],g.requests,g.output))
            write(job/policy.STATE,{'execution_id':request['execution_id'],'calls':[{'status':'completed'}]})
            if incomplete:g.error_code='WORLDIFACT_RESPONSE_INCOMPLETE';g.error='incomplete'
            if index==1:outcome[0]={'finished':True,'accepted':False}
            code=exits[index]
            return types.SimpleNamespace(stdin=io.StringIO(),stdout=io.StringIO(''),returncode=code,pid=12345,poll=lambda:code)
        namespace={'Path':Path,'secrets':types.SimpleNamespace(token_hex=lambda n:'same-id'),
            'write':write,'completion_policy':policy,'time':time,'Gateway':FakeGateway,
            'fast_preview':types.SimpleNamespace(policy=lambda *_:{'fast':False,'seconds':1800},task=lambda *_:''),
            'MAX_REQUESTS':32,'MAX_OUTPUT_TOKENS':96000,'MAX_SECONDS':1800,'MAX_BUILDS':5,
            'os':os,'threading':threading,'json':json,'signal':__import__('signal'),
            'subprocess':types.SimpleNamespace(Popen=popen,PIPE=-1),'command':lambda *_:[],
            'completed_outcome':lambda folder:outcome[0]}
        exec(compile(self.function,'patched_runner','exec'),namespace)
        with patch.object(policy,'drain_group',return_value=True):
            try:result=namespace['run'](job,'brief','ordinary' if ordinary else policy.CABINET,'fixture-key',threading.Event(),lambda *_:None,binary='/fake/codex')
            except RuntimeError as error:result=str(error)
        return result,calls,gateways,ledger

    def test_clean_exit_runs_once_more_using_same_gateway_identity_and_counters(self):
        result,calls,gateways,ledger=self.run_fixture([0,0])
        self.assertEqual(result,{'finished':True,'accepted':False});self.assertEqual(len(gateways),1);self.assertEqual(len(calls),2)
        self.assertIs(calls[0][0],calls[1][0]);self.assertEqual(calls[0][1],calls[1][1]);self.assertEqual(calls[1][2:],(6,400))
        self.assertEqual(len({entry['job'] for entry in ledger}),1);self.assertEqual(len(ledger),2)

    def test_nonzero_or_measured_incomplete_never_continues(self):
        result,calls,gateways,ledger=self.run_fixture([1],incomplete=True)
        self.assertEqual(len(calls),1);self.assertEqual(gateways[0].error_code,'WORLDIFACT_RESPONSE_INCOMPLETE')
        self.assertEqual(result,'incomplete');self.assertEqual(len(ledger),1)


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'),'Pinned source fixture is required in CI')
class NewFileRollbackTests(ExactSourceTests):
    def test_failure_before_new_file_creation_restores_every_existing_byte(self):
        source=self.setup_install();before={str(p.relative_to(source)):p.read_bytes() for p in source.rglob('*') if p.is_file()}
        ops=FakeOperations(source);atomic=installer.base.atomic_write
        def fail_new(path,raw,mode=0o600):
            if path==source/'completion_policy.py':raise OSError('fixture disk error before replace')
            return atomic(path,raw,mode)
        with patch.object(installer.base,'atomic_write',side_effect=fail_new),patch.object(installer.cache,'check_health'),self.assertRaises(installer.base.InstallError):
            installer.install(source,self.root/'backup',ops,approved=True)
        after={str(p.relative_to(source)):p.read_bytes() for p in source.rglob('*') if p.is_file()}
        self.assertEqual(before,after);self.assertIn('start',ops.events)

@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'),'Pinned source fixture is required in CI')
class RuntimeBindingTests(ExactSourceTests):
    def test_real_health_binding_rejects_changed_source_and_fake_runtime_receipt(self):
        source=self.setup_install();ops=FakeOperations(source)
        with patch.object(installer,'check_health'):
            # Real helper verifies source and genuine-verifier-shaped fixture.
            result=installer.install(source,self.root/'backup',ops,approved=True)
        self.assertEqual(result['phase'],'WORLDIFACT_MODEL_COMPLETION_VERIFIED')
        self.assertEqual(policy.verified_health(source)['worldifactCompletionPolicy'],policy.REVISION)
        path=source/'completion_policy.py';before=path.read_bytes();path.write_bytes(before+b'\n')
        self.assertEqual(policy.verified_health(source),{});path.write_bytes(before)
        write(source/installer.base.RECEIPT,{'sources':{},'blender_build_roundtrip':True})
        self.assertEqual(policy.verified_health(source),{})

    def test_patched_mcp_finish_requires_current_images_and_real_structural_floor(self):
        import ast
        tree=ast.parse(self.patched['blender_mcp.py'])
        node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='JobTools')
        request={'instructions':policy.CABINET,'execution_id':'same','completion_started':time.monotonic()-1}
        current=self.root/'current';current.mkdir();glb(current/'model.glb')
        write(current/'scene.json',{'subject_type':'object','parts':[]})
        namespace={'completion_policy':policy,'json':json,'time':time,'SNAPSHOT_PAGE_CHARS':8000,
            'current_candidate':lambda *_:{'path':current,'info':{'revision':1}},
            'read_record':lambda p,*_:json.loads(p.read_text()),'write':write,
            'threading':threading,'retain_candidate':lambda *_:None,'model_digest':lambda *_:(100,'a'*64)}
        exec(compile(ast.Module(body=[node],type_ignores=[]),'patched_mcp','exec'),namespace)
        cls=namespace['JobTools'];job=object.__new__(cls)
        job.current=current;job.folder=self.root;job.request=request;job.execution_id='same';job.revision=1
        job.fast_limits={'fast':False};job.finished=False;job.seen={'front','side','back'}
        job.check=lambda *_:None;job.progress=lambda *_:None;job.attempts=2;job.blender_seconds=0
        job.finalize_callback=lambda *_:None;job.review_result=lambda:job.final_report
        args={'expected_revision':1,'accepted':True,'issues':[],'summary':'fixture'}
        with self.assertRaisesRegex(ValueError,'three-quarter'):job.call('finish_model',args)
        job.seen.add('three-quarter')
        with self.assertRaisesRegex(ValueError,'structural gate'):job.call('finish_model',args)
        with self.assertRaisesRegex(ValueError,'specific unresolved'):job.call('finish_model',{**args,'accepted':False})
        report=job.call('finish_model',{**args,'accepted':False,'issues':['Sparse device geometry remains.']})
        self.assertFalse(report['accepted']);self.assertTrue(report['assessment_completed'])
        self.assertTrue(json.loads((self.root/'agent-outcome.json').read_text())['finished'])


if __name__=='__main__':unittest.main()
