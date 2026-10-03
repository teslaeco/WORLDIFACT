"""Synthetic source, context, admission and maintenance tests; no paid API."""
import ast
import contextlib
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/model_completion'))
sys.path.insert(0,str(ROOT/'tools/profit_guard'))
import source_fixture,source_patch,reviewed_direct_export,completion_policy
import prebuild_policy as policy
import prebuild_patch as upgrade
import install_prebuild as installer
import offline_cabinet

SOURCE=Path(os.environ.get('MODEL_COMPLETION_SOURCE',ROOT/'.prebuild-source'))
# Schema/geometry fixtures are the original public renderer, never substitutes.
sys.path.insert(0,str(SOURCE))
from scene_repair import photo_schema
from runtime.scene_contract import parse_scene,PROMPT


def installed():
    raw=source_fixture.installed_sources(os.environ.get('MODEL_COMPLETION_SOURCE','/tmp/worldifact-completion-pinned'))
    raw['server.py']=reviewed_direct_export.patch_server(raw['server.py'].decode()).encode()
    raw.update(source_patch.changes({n:raw[n] for n in source_patch.EXPECTED},Path(completion_policy.__file__).read_bytes()))
    return raw


def expanded(schema):
    defs=schema['$defs']
    def walk(v):
        if isinstance(v,dict):
            if '$ref' in v:return walk(defs[v['$ref'].split('/')[-1]])
            return {k:walk(x) for k,x in v.items() if k!='$defs'}
        if isinstance(v,list):return [walk(x) for x in v]
        return v
    return walk(schema)


class ContractTests(unittest.TestCase):
    def test_factoring_preserves_actual_complete_object_schema(self):
        for photos in (0,1,3,4):
            raw=photo_schema(photos);compact=policy.cabinet_contract(raw,[])['scene_schema']
            expected=deepcopy(raw);expected['properties']['subject_type']['enum']=['object']
            expected['properties']['parts']['items']['anyOf']=[v for v in expected['properties']['parts']['items']['anyOf'] if v['properties']['kind']['enum'][0] in policy.OBJECT_KINDS]
            self.assertEqual(expanded(compact),expected)
            self.assertLess(len(policy.compact_json(compact)),len(policy.compact_json(expected)))
            self.assertEqual({v['properties']['kind']['enum'][0] for v in expected['properties']['parts']['items']['anyOf']},policy.OBJECT_KINDS)

    def test_scope_original_inputs_images_and_first_exec(self):
        for marker in (completion_policy.CHARACTER,completion_policy.STANDARD,completion_policy.REFERENCE,'unrelated'):
            self.assertFalse(policy.active({'instructions':marker}))
        request={'prompt':'Exact original brief 😀','instructions':completion_policy.CABINET+'\nStep 1: read get_modeling_contract once.'}
        self.assertTrue(policy.active(request));self.assertFalse(policy.active(request,True))
        refs=[{'name':'One','view':'front'},{'name':'Two','view':'side','subject':'same cabinet'}]
        with patch('photo_input.read_photos',return_value=refs):text=policy.initial_task(Path('/unused'),request)
        self.assertEqual(text.count(request['prompt']),1);self.assertEqual(text.count(request['instructions']),1)
        self.assertLess(text.index('"name":"One"'),text.index('"name":"Two"'))
        self.assertNotIn('text(c)',text);self.assertIn('SAME exec',text)
        self.assertIn('store("contract"',text);self.assertIn('JSON.stringify(scene)',text)
        self.assertEqual(expanded(policy.cabinet_contract(photo_schema(2),refs)['scene_schema'])['properties']['reference_views']['minItems'],1)

    def test_bounded_context_materially_reduced_without_truncation(self):
        raw=installed()['codex_runner.py'].decode();tree=ast.parse(raw)
        run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
        assignment=next(n for n in run.body if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='task' for v in n.targets))
        request={'prompt':'Synthetic cabinet reference brief.','instructions':completion_policy.CABINET+'\nStep 1: read get_modeling_contract once.\n'+('Preserve original reference evidence. '*180)}
        env=dict(request);exec(compile(ast.Module(body=[assignment],type_ignores=[]),'task','exec'),env)
        old=completion_policy.guidance(request)+env['task']
        contract={'scene_schema':photo_schema(3),'coordinate_and_geometry_guide':completion_policy.guidance(request)+PROMPT,'edit_helpers':policy.EDITS,**request,'references':[{'index':i,'name':'Reference','view':'front'} for i in range(3)]}
        with patch('photo_input.read_photos',return_value=contract['references']):new=policy.initial_task(Path('/unused'),request)
        full=policy.compact_json(contract)
        # Prior mandatory text(c) becomes model history; the new full MCP reply
        # remains in CodeMode store only and is not a provider-visible output.
        before=len(old)+len(full);after=len(new)
        self.assertLess(after,before*.55)
        gateway=types.SimpleNamespace(folder=Path('/unused'),fast_limits={'requests':32},requests=1,execution_calls=[])
        self.assertLess(len(policy.turn_guidance(gateway)),400)
        print('CONTEXT_BYTES synthetic before=%d after=%d reduction=%.1f%% full_contract=%d'%(before,after,100*(1-after/before),len(full)))

    def test_synthetic_complete_first_build_uses_real_parser(self):
        parsed=parse_scene(json.dumps(offline_cabinet.scene()),'Synthetic cabinet')
        self.assertEqual(parsed['subject_type'],'object');self.assertLessEqual(len(parsed['parts']),80)
        p=offline_cabinet.programs()[0]
        self.assertLess(p.index('get_modeling_contract'),p.index('build_model'))
        self.assertNotIn('text(c)',p)


class SourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=installed();cls.selected={n:cls.original[n] for n in upgrade.EXPECTED}
        cls.patched=upgrade.changes(cls.selected,Path(policy.__file__).read_bytes())
    def test_exact_ancestor_unknown_refused_and_capabilities_unchanged(self):
        upgrade.review(self.selected)
        for n in self.selected:
            with self.assertRaises(ValueError):upgrade.review({**self.selected,n:self.selected[n]+b'\n'})
        self.assertEqual(self.patched['blender_mcp.py'],self.original['blender_mcp.py'])
        self.assertEqual(self.patched['completion_policy.py'],self.original['completion_policy.py'])
        self.assertIn(reviewed_direct_export.HELPERS,self.patched['server.py'].decode())
        runner=self.patched['codex_runner.py'].decode()
        for fragment in ('timeout=900','minimum_output=completion_policy.minimum_output','WORLDIFACT_RESPONSE_INCOMPLETE','range(1+completion_policy.MAX_CONTINUATIONS)','completion_started=time.monotonic()'):
            self.assertIn(fragment,runner)
        self.assertEqual(runner.count('with Gateway(key,folder,cancelled) as gateway:'),1)
        # Exactly the same CLI command and ordered --image arguments.
        def fn(s,name):
            t=ast.parse(s);v=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name==name);return ast.dump(v)
        self.assertEqual(fn(runner,'command'),fn(self.original['codex_runner.py'],'command'))
        for name in ('completed_upper_cost','settle_completed','ledger','used','verified_health'):
            self.assertEqual(fn(self.patched['astra_spend_v2.py'],name),fn(self.original['astra_spend_v2.py'],name))

    def spend(self):
        m=types.ModuleType('test_spend');m.__file__='/synthetic/astra_spend_v2.py';exec(self.patched['astra_spend_v2.py'],m.__dict__);return m
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.job=self.root/'job';self.job.mkdir();self.s=self.spend();self.ledger=self.root/'ledger'
    def seed(self,held,requests=1):
        path=self.ledger/hashlib.sha256(str(self.job.resolve()).encode()).hexdigest()/self.s.legacy.STATE;path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps({'revision':self.s.REVISION,'legacyHeld':held,'requests':requests,'holds':{}}));return path
    def reserve(self,**kw):return self.s.reserve(self.job,kw.pop('count',1000),kw.pop('requested',16000),ledger_root=self.ledger,minimum_output=kw.pop('minimum',2048),**kw)
    def test_synthetic_exact_affordability_boundary_does_not_write_refusal(self):
        remaining=700000;count=(remaining-2048*55)//14-2048
        path=self.seed(1750000-remaining);before=path.read_bytes()
        with self.assertRaises(self.s.SpendError) as e:self.reserve(count=count+1)
        d=self.s.safe_diagnostic(e.exception);self.assertEqual(d['reason'],'INSUFFICIENT_RESERVATION');self.assertEqual(path.read_bytes(),before)
        self.assertEqual(d['input_ceiling'],count+1+2048);self.assertEqual(d['remaining_micro_usd'],remaining)
        _,output=self.reserve(count=count);self.assertEqual(output,2048)
    def test_request_and_output_floors_are_distinct_and_unchanged(self):
        path=self.seed(0,32);before=path.read_bytes()
        with self.assertRaises(self.s.SpendError) as e:self.reserve()
        self.assertEqual(e.exception.reason,'REQUEST_LIMIT');self.assertEqual(path.read_bytes(),before)
        self.seed(0)
        with self.assertRaises(self.s.SpendError) as e:self.reserve(requested=2047)
        self.assertEqual(e.exception.reason,'OUTPUT_ALLOWANCE_BELOW_MINIMUM')
        _,count=self.reserve(requested=256,minimum=256);self.assertEqual(count,256)
        self.assertEqual((self.s.CEILING_MICRO_USD,self.s.MAX_INPUT,self.s.MAX_OUTPUT,self.s.INPUT_RATE,self.s.OUTPUT_RATE),(1750000,65536,16000,14,55))
    def test_failure_categories_never_leak_raw_sentinels(self):
        for kwargs,reason in [({'now':self.s.VALID_UNTIL},'PRICING_EXPIRED'),({'count':65537},'INPUT_LIMIT')]:
            with self.assertRaises(self.s.SpendError) as e:self.reserve(**kwargs)
            self.assertEqual(e.exception.reason,reason)
        path=self.seed(0);path.write_text('{"secret_path":"sentinel"}')
        with self.assertRaises(self.s.SpendError) as e:self.reserve()
        self.assertEqual(e.exception.reason,'LEDGER_INVALID');self.assertNotIn('sentinel',json.dumps(self.s.safe_diagnostic(e.exception)))
        payload={'model':'gpt-6-astra','input':'synthetic','max_output_tokens':4096}
        with patch.object(self.s.legacy,'count_payload'),self.assertRaises(self.s.SpendError) as e:
            self.s.protect(self.job,payload,{},counter=lambda *_:(_ for _ in ()).throw(OSError('secret sentinel')))
        self.assertEqual(self.s.safe_diagnostic(e.exception),{'reason':'TOKEN_COUNT_UNAVAILABLE','stage':'count'})
    def test_atomic_failure_before_or_after_replace_never_claims_balance_or_retries(self):
        for after in (False,True):
            path=self.seed(0);before=path.read_bytes();real=self.s.legacy.atomic;calls=[]
            def broken(path,state):
                calls.append(True)
                if after:real(path,state)
                raise OSError('secret sentinel')
            with patch.object(self.s.legacy,'atomic',side_effect=broken),self.assertRaises(self.s.SpendError) as e:self.reserve()
            self.assertEqual(self.s.safe_diagnostic(e.exception),{'reason':'LEDGER_IO','stage':'persistence'})
            self.assertEqual(len(calls),1);self.assertEqual(path.read_bytes()==before,not after)


class Operations:
    def __init__(self,fail=None):self.events=[];self.fail=fail
    def preflight(self):
        self.events.append('preflight')
        if self.fail=='active':raise installer.base.InstallError('Active job')
    @contextlib.contextmanager
    def quiesce(self):self.events.append('quiesce');yield
    def assert_idle(self):self.events.append('idle')
    def verify(self,*_):
        self.events.append('verify')
        if self.fail=='verify':raise ValueError('Synthetic verification failed')
    def stop(self):self.events.append('stop')
    def start(self):self.events.append('start')
    def health(self,*_):self.events.append('health')


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.source=self.root/'worker';self.source.mkdir();self.original=installed()
        for n,b in self.original.items():
            p=self.source/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
        def write(n,v):p=self.source/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v))
        write(completion_policy.RECEIPT,{'revision':completion_policy.REVISION,'sha256':{n:hashlib.sha256(self.original[n]).hexdigest() for n in upgrade.EXPECTED}})
        write(installer.cache.legacy.RECEIPT,{'revision':installer.cache.legacy.REVISION,'sha256':{n:hashlib.sha256(self.original[n]).hexdigest() for n in ('codex_runner.py','fast_preview.py','astra_spend.py')},'outputPolicy':{'revision':'astra-low-reconciled-v2','sha256':hashlib.sha256(self.original['astra_spend_v2.py']).hexdigest()}})
        write(installer.base.RECEIPT,{'prior_runtime':True});write('state/untouched.json',{'claim':'consumed','ledger':'do not refill'})
    def contents(self):return {str(p.relative_to(self.source)):p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
    def test_success_backup_state_receipts(self):
        before=self.contents();ops=Operations()
        with patch.object(installer,'check_health'):result=installer.install(self.source,self.root/'backup',ops,True)
        self.assertEqual(result['phase'],'WORLDIFACT_PREBUILD_VERIFIED');self.assertFalse(result['paid_generation_requested'])
        self.assertEqual((self.source/'state/untouched.json').read_bytes(),before['state/untouched.json'])
        self.assertEqual((self.source/'blender_mcp.py').read_bytes(),before['blender_mcp.py'])
        self.assertEqual((self.root/'backup/originals/codex_runner.py').read_bytes(),before['codex_runner.py'])
    def test_verify_failure_restores_every_byte(self):
        before=self.contents();ops=Operations('verify')
        with patch.object(installer.previous,'check_health'),self.assertRaises(installer.base.InstallError):installer.install(self.source,self.root/'backup',ops,True)
        self.assertEqual(self.contents(),before);self.assertEqual(ops.events[-3:],['stop','start','health'])
    def test_denied_active_unknown_and_dangling_receipt_no_change(self):
        for mode in ('approval','active','unknown','symlink'):
            with self.subTest(mode=mode):
                path=self.source/'server.py';original=path.read_bytes()
                if mode=='unknown':path.write_bytes(original+b'\n')
                receipt=self.source/policy.RECEIPT
                if mode=='symlink':receipt.symlink_to(self.root/'absent')
                before=self.contents();ops=Operations('active' if mode=='active' else None)
                with self.assertRaises((installer.base.InstallError,ValueError)):installer.install(self.source,self.root/'backup',ops,mode!='approval')
                self.assertEqual(before,self.contents());self.assertNotIn('quiesce',ops.events)
                if mode=='symlink':receipt.unlink()
                path.write_bytes(original)


if __name__=='__main__':unittest.main()
