import contextlib, hashlib, importlib.util, io, json, os, pathlib, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('diagnostic',pathlib.Path(__file__).with_name('worldifact_failed_test_diagnostic.py'))
d=importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
TEST='00000000-0000-4000-8000-000000000001'
SOURCE='00000000-0000-4000-8000-000000000002'
class Checks(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.root=pathlib.Path(self.temp.name)
  self.ns={}; exec(d.REMOTE,self.ns)
  self.folder=self.root/'state/jobs'/TEST; self.folder.mkdir(parents=True)
  self.claim=self.root/'state/worldifact-original-test-claims/one-shot.json'; self.claim.parent.mkdir()
  self.write(self.claim,{'jobId':TEST,'sourceJobId':SOURCE,'approval':'ORIGINAL_INPUT_ASTRA175_ONCE','maxProviderReservationUsd':1.75,'inputBinding':{}})
  self.ns['status']=lambda root,job:{'state':'failed'}
 def tearDown(self): self.temp.cleanup()
 def write(self,path,value): path.write_text(json.dumps(value))
 def run_report(self): return self.ns['validate'](self.ns['inspect'](self.root,TEST))
 def test_default_zero_reads_network(self):
  with patch.object(d,'loader',side_effect=AssertionError()),patch.object(d.subprocess,'run',side_effect=AssertionError()),contextlib.redirect_stdout(io.StringIO()) as out:
   d.main([])
  self.assertIn('PLAN_ONLY',out.getvalue())
 def test_bad_params_before_download(self):
  with patch.object(d,'loader',side_effect=AssertionError()):
   with self.assertRaises(ValueError): d.main(['--inspect-failed-test','--source-commit','bad','--test-job',TEST])
 def test_bound_failure_safe_summary(self):
  self.write(self.folder/'agent-usage.json',{'requests':3,'input_tokens':8000,'output_tokens':4000,'error_code':'WORLDIFACT_ASTRA_COST_GUARD','last_error':'Astra job budget exhausted before another request. PRIVATE_SECRET','private':'hidden'})
  result=self.run_report(); text=json.dumps(result)
  self.assertIn('astra_budget_exhausted',text); self.assertIn('WORLDIFACT_ASTRA_COST_GUARD',text)
  self.assertNotIn('PRIVATE_SECRET',text); self.assertNotIn(TEST,text); self.assertNotIn(SOURCE,text)
 def test_wrong_claim_no_status(self):
  self.write(self.claim,{'jobId':SOURCE}); self.ns['status']=lambda *a:self.fail('network')
  with self.assertRaises(ValueError): self.run_report()
 def test_symlink_and_oversize_refused(self):
  target=self.root/'secret'; target.write_text('secret'); (self.folder/'failure.json').symlink_to(target)
  self.assertEqual(self.run_report()['files']['failure.json']['availability'],'unavailable')
  (self.folder/'agent-usage.json').write_text('x'*200001)
  self.assertEqual(self.run_report()['files']['agent-usage.json']['availability'],'unavailable')
 def test_safe_tools_and_frames(self):
  self.write(self.folder/'agent-tools.json',{'build_attempts':1,'calls':[{'tool':'build_model','status':'failed','error':'Traceback\nFile "/private/place/blender_mcp.py", line 321\nTypeError: private words'}]})
  result=self.run_report(); text=json.dumps(result)
  self.assertIn('blender_mcp.py',text); self.assertIn('321',text); self.assertNotIn('/private',text); self.assertNotIn('private words',text)
 def test_candidate_path_escape_refused(self):
  self.write(self.folder/'agent-candidate.json',{'path':'../../secret'})
  self.assertEqual(self.run_report()['candidate'],{'availability':'unavailable'})
 def test_budget_read_only_and_numeric(self):
  key=hashlib.sha256(str(self.folder.resolve()).encode()).hexdigest(); p=self.root/'state/worldifact-astra-budgets'/key/'.worldifact-astra-spend.json'; p.parent.mkdir(parents=True)
  value={'revision':'astra-low-reconciled-v2','legacyHeld':0,'requests':1,'holds':{'a'*32:{'input':3000,'output':2048,'held':3000*14+2048*55}}}; self.write(p,value)
  before={str(x.relative_to(self.root)):x.read_bytes() for x in self.root.rglob('*') if x.is_file()}
  report=self.run_report(); self.assertEqual(report['budget']['holds'][0]['output_ceiling'],2048)
  self.assertNotIn('secret-hold',json.dumps(report))
  after={str(x.relative_to(self.root)):x.read_bytes() for x in self.root.rglob('*') if x.is_file()}; self.assertEqual(before,after)
 def test_malformed_settlement_unavailable(self):
  key=hashlib.sha256(str(self.folder.resolve()).encode()).hexdigest(); p=self.root/'state/worldifact-astra-budgets'/key/'.worldifact-astra-spend.json'; p.parent.mkdir(parents=True)
  self.write(p,{'revision':'astra-low-reconciled-v2','legacyHeld':0,'requests':1,'holds':{'a'*32:{'input':3000,'output':2048,'held':1,'response':'private-invalid'}}})
  self.assertEqual(self.run_report()['budget'],{'availability':'unavailable'})
 def test_output_rejects_private_strings(self):
  report=self.run_report(); report['job']['error_codes']=['PRIVATE_SECRET']
  with self.assertRaises(ValueError): self.ns['validate'](report)
 def test_remote_surface_no_mutations(self):
  import ast
  tree=ast.parse(d.REMOTE); calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call)]
  forbidden={'mkdir','write_text','write_bytes','unlink','system','Popen','run','connect','sqlite3','exec','compile'}
  self.assertFalse([n for n in calls if isinstance(n.func,ast.Attribute) and n.func.attr in forbidden])
  for n in calls:
   if isinstance(n.func,ast.Attribute) and n.func.attr=='Request': self.assertEqual([k.value.value for k in n.keywords if k.arg=='method'],['GET'])
 def test_loader_hash_before_execution(self):
  class Response:
   status=200
   def read(self,n): return b'raise AssertionError("executed")'
   def __enter__(self): return self
   def __exit__(self,*args): pass
  class Opener:
   def open(self,*a,**k): return Response()
  with patch.object(d.urllib.request,'build_opener',return_value=Opener()):
   with self.assertRaises(ValueError): d.loader('0'*40)
if __name__=='__main__': unittest.main()
