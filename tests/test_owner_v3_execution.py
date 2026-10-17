"""Offline provider/storage failure injection; never sends a provider request."""
import copy,json,os,stat,sys,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.runpod_owner_v3 import execute as module
from tools.runpod_owner_v3.prepare import prefix
from contracts import fingerprint

NOW=1800000000
ENV={'GITHUB_REF':'refs/heads/main','GITHUB_RUN_ATTEMPT':'1','GITHUB_RUN_ID':'123456789',
 'GITHUB_REPOSITORY':'teslaeco/WORLDIFACT','OWNER_V3_CONFIRMATION':module.CONFIRMATION,
 'ARTIFACT_S3_ENDPOINT':'https://'+'a'*32+'.r2.cloudflarestorage.com',
 'ARTIFACT_BUCKET':'fixture-private','ARTIFACT_REGION':'auto',
 'ARTIFACT_ACCESS_KEY_ID':'FIXTURE_NOT_A_KEY','ARTIFACT_SECRET_ACCESS_KEY':'FIXTURE_NOT_A_SECRET'}

def configuration():
 cfg=json.loads((ROOT/'ops/RUNPOD_OWNER_V3_20261017.json').read_text())
 cfg.update(image='ghcr.io/teslaeco/worldifact-runpod3d@sha256:'+'a'*64,
  imageSourceCommit='b'*40,sourceReview={'accepted':True},stage1VisualReview=None)
 for item in cfg['jobs']:
  item['mask']={**item['reference'],'sha256':'c'*64,'bytes':1000}
 return cfg

class Store:
 def __init__(self,cfg):
  self.values={};self.fail_suffix=None;self.fail_all_writes=False;self.fail_reads=False
  fixture=json.loads((ROOT/'tests/fixtures/runpod/contract.json').read_text())['job']
  for item in cfg['jobs']:
   job=copy.deepcopy(fixture);p=prefix(item)
   job.update(revision=cfg['revision'],scope=cfg['scope'],jobId=item['jobId'])
   for kind in ('reference','mask'):job[kind]={'key':p+kind+'.png','sha256':item[kind]['sha256']}
   job['planner']['referenceSha256']=item['reference']['sha256'];job['plan']['subject']=item['subject']
   job['settings']={'seed':42,'resolution':1536,'textureSize':4096,'targetFaces':1000000}
   self.create_json(p+'prepared-job.json',job)
 def read(self,key,limit):
  if self.fail_reads:raise OSError('FIXTURE_STORAGE_UNAVAILABLE')
  return self.values.get(key)
 def create_json(self,key,value):
  if self.fail_all_writes or (self.fail_suffix and key.endswith(self.fail_suffix)):
   raise OSError('FIXTURE_STORAGE_UNAVAILABLE')
  if key in self.values:return False
  self.values[key]=json.dumps(value).encode();return True

class Clock:
 def __init__(self):self.now=0
 def __call__(self):return self.now
 def sleep(self,seconds):self.now+=seconds

class Provider:
 def __init__(self,store):
  self.store=store;self.calls=[];self.created=None;self.deleted=False;self.output=None
  self.create_ambiguous=False;self.run_ambiguous=False;self.delete_ambiguous=False
  self.always_running=False;self.no_result=False;self.extra_endpoints=[]
  self.pods=[];self.volumes=[];self.busy_previous=False;self.fail_poll=False
  self.price=2.72;self.fail_storage_after_create=False
 def request(self,origin,method,path,body=None):
  self.calls.append((origin,method,path))
  if origin==module.CONTROL and method=='GET' and path=='/v2/serverless':
   entries=[{'id':module.PREVIOUS_ENDPOINT,'name':'WORLDIFACT-3D-FLEX','workers':{'min':0}}]
   if self.created and not self.deleted:entries.append(self.created)
   return {'endpoints':entries+self.extra_endpoints,'pagination':{'hasNextPage':False}}
  if path=='/v2/pods':return {'pods':self.pods,'pagination':{'hasNextPage':False}}
  if path=='/v2/network-volumes':return {'networkVolumes':self.volumes,'pagination':{'hasNextPage':False}}
  if path=='/v2/'+module.PREVIOUS_ENDPOINT+'/health':
   return {'jobs':{'inQueue':1 if self.busy_previous else 0,'inProgress':0},'workers':{'idle':1}}
  if path.startswith('/v2/catalog/gpus'):
   return {'gpus':[{'name':'NVIDIA A100','memory':80,'pool':'AMPERE_80',
    'price':{'serverless':self.price},'availability':'HIGH'}]}
  if origin==module.CONTROL and method=='POST' and path=='/v2/serverless':
   self.created={**copy.deepcopy(body),'id':'owned_stage_endpoint'}
   if self.fail_storage_after_create:self.store.fail_all_writes=True
   if self.create_ambiguous:raise module.Refused('PROVIDER_WRITE_RESULT_UNKNOWN')
   return copy.deepcopy(self.created)
  if origin==module.CONTROL and path=='/v2/serverless/owned_stage_endpoint':
   if method=='GET':return None if self.deleted else copy.deepcopy(self.created)
   if method=='DELETE':
    self.deleted=True
    if self.delete_ambiguous:raise module.Refused('PROVIDER_WRITE_RESULT_UNKNOWN')
    return None
  if origin==module.RUNTIME and method=='POST' and path=='/v2/owned_stage_endpoint/run':
   if self.run_ambiguous:raise module.Refused('PROVIDER_WRITE_RESULT_UNKNOWN')
   job=body['input'];p=f"jobs/{job['scope']}/{job['jobId']}/"
   self.output={'state':'REVIEW_REQUIRED','revision':job['revision'],'jobId':job['jobId'],
    'fingerprint':fingerprint(job),'inferenceAttempts':1,
    'artifacts':[{'key':p+name,'bytes':100,'sha256':'d'*64} for name in sorted(module.ARTIFACT_NAMES)]}
   if not self.no_result:self.store.create_json(p+'result.json',self.output)
   return {'id':'provider_job_fixture'}
  if origin==module.RUNTIME and path=='/v2/owned_stage_endpoint/status/provider_job_fixture':
   if self.fail_poll:raise module.Refused('PROVIDER_READ_FAILED')
   if self.always_running:return {'status':'IN_PROGRESS'}
   return {'status':'COMPLETED','output':self.output,'executionTime':454771,'delayTime':100}
  raise AssertionError('UNEXPECTED_FIXTURE_CALL:'+method+' '+path)
 def count(self,method,suffix):return sum(m==method and p.endswith(suffix) for _,m,p in self.calls)

class ExecutionTests(unittest.TestCase):
 def setUp(self):
  self.cfg=configuration();self.store=Store(self.cfg);self.api=Provider(self.store);self.clock=Clock()
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.path=Path(self.temp.name)/'state.json'
 def run_stage(self,stage=1,environment=None):
  return module.execute(self.store,self.cfg,stage,self.api,environment or ENV,
   clock=self.clock,wall=lambda:NOW,sleep=self.clock.sleep,state_path=self.path)
 def grant_stage1_review(self):
  first=self.cfg['jobs'][0];sha='e'*64
  self.store.create_json(prefix(first)+'operator-verified.json',{'status':'VERIFIED','jobId':first['jobId'],
   'artifacts':[{'key':prefix(first)+'outputs/game.glb','sha256':sha}]})
  self.cfg['stage1VisualReview']={'accepted':True,'jobId':first['jobId'],'gameSha256':sha}
 def assert_only_own_cleanup(self):
  deletes=[path for _,method,path in self.api.calls if method=='DELETE']
  self.assertEqual(deletes,['/v2/serverless/owned_stage_endpoint'])
  self.assertFalse(any(method!='GET' and module.PREVIOUS_ENDPOINT in path for _,method,path in self.api.calls))
 def test_success_deletes_endpoint_and_persists_exact_dispatch_provider_id_and_cleanup(self):
  result=self.run_stage()
  self.assertEqual(result['status'],'EXPORTED_REVIEW_REQUIRED');self.assertTrue(result['cleanup']['deleted'])
  self.assert_only_own_cleanup();self.assertEqual(self.api.count('POST','/run'),1)
  self.assertEqual(self.api.count('POST','/v2/serverless'),1)
  self.assertEqual(stat.S_IMODE(self.path.stat().st_mode),0o600)
  p=prefix(self.cfg['jobs'][0]);claim=json.loads(self.store.values[p+'operator-dispatch-claim.json'])
  self.assertEqual(claim['fingerprint'],fingerprint(claim['job']))
  self.assertEqual(claim['job']['budget']['rateMicroUsdPerSecond'],756)
  self.assertEqual(claim['job']['budget']['executionSeconds'],1800)
  self.assertIn(p+'operator-provider-job.json',self.store.values)
  self.assertTrue(json.loads(self.store.values[p+'operator-cleanup.json'])['cleanup']['deleted'])
  self.assertNotIn('FIXTURE_NOT_A_SECRET',json.dumps(result))
 def test_consumed_stage_cannot_create_second_endpoint_or_submit_again(self):
  self.run_stage();before=len(self.api.calls)
  with self.assertRaisesRegex(module.Refused,'STAGE_ALREADY_CONSUMED'):self.run_stage()
  self.assertEqual(len(self.api.calls),before)
 def test_ambiguous_create_is_not_retried_and_exact_owned_endpoint_is_reconciled_deleted(self):
  self.api.create_ambiguous=True;result=self.run_stage()
  self.assertEqual(result['status'],'FAILED_RECONCILE');self.assertTrue(result['cleanup']['deleted'])
  self.assertEqual(self.api.count('POST','/v2/serverless'),1);self.assertEqual(self.api.count('POST','/run'),0)
  self.assert_only_own_cleanup()
 def test_ambiguous_paid_submission_is_not_retried_and_endpoint_is_deleted(self):
  self.api.run_ambiguous=True;result=self.run_stage()
  self.assertEqual(result['status'],'FAILED_RECONCILE');self.assertTrue(result['cleanup']['deleted'])
  self.assertEqual(self.api.count('POST','/run'),1);self.assert_only_own_cleanup()
  self.assertIn(prefix(self.cfg['jobs'][0])+'operator-dispatch-claim.json',self.store.values)
 def test_ambiguous_delete_uses_only_readback_and_never_second_delete(self):
  self.api.delete_ambiguous=True;result=self.run_stage()
  self.assertTrue(result['cleanup']['deleted']);self.assertTrue(result['cleanup']['deleteResponseAmbiguous'])
  self.assert_only_own_cleanup()
 def test_storage_outage_after_create_still_cleans_up_using_local_identity(self):
  self.api.fail_storage_after_create=True;result=self.run_stage()
  self.assertEqual(result['status'],'FAILED_RECONCILE');self.assertTrue(result['cleanup']['deleted'])
  self.assert_only_own_cleanup();self.assertFalse(result['executionReceiptStored'])
  self.assertEqual(self.api.count('POST','/run'),0)
 def test_poll_error_always_deletes_paid_endpoint(self):
  self.api.fail_poll=True;result=self.run_stage()
  self.assertEqual(result['status'],'FAILED_RECONCILE');self.assertTrue(result['cleanup']['deleted'])
  self.assert_only_own_cleanup()
 def test_stage_deadline_terminates_running_worker_and_does_not_start_more_work(self):
  self.api.always_running=True;result=self.run_stage()
  self.assertEqual(result['failure'],'STAGE_WALL_CLOCK_LIMIT');self.assertTrue(result['cleanup']['deleted'])
  self.assertEqual(self.clock.now,2400);self.assertEqual(self.api.count('POST','/run'),1)
  self.assert_only_own_cleanup()
 def test_missing_durable_final_result_cannot_be_called_export_success(self):
  self.api.no_result=True;result=self.run_stage()
  self.assertEqual(result['failure'],'DURABLE_RESULT_MISMATCH');self.assertTrue(result['cleanup']['deleted'])
 def test_stage2_requires_verified_stage1_and_matching_visual_review_before_any_provider_read(self):
  with self.assertRaises(AssertionError):self.run_stage(2)
  self.assertEqual(self.api.calls,[])
  self.grant_stage1_review();self.cfg['stage1VisualReview']['gameSha256']='f'*64
  with self.assertRaises(AssertionError):self.run_stage(2)
  self.assertEqual(self.api.calls,[])
 def test_stage2_valid_review_uses_its_distinct_job_and_endpoint_name(self):
  self.grant_stage1_review();result=self.run_stage(2)
  self.assertEqual(result['status'],'EXPORTED_REVIEW_REQUIRED')
  self.assertEqual(self.api.created['name'],'WORLDIFACT-OWNER-V3-S2')
  self.assertEqual(result['jobId'],self.cfg['jobs'][1]['jobId']);self.assert_only_own_cleanup()
 def test_untrusted_context_and_changed_source_never_mutate_provider(self):
  for name,value in [('GITHUB_REF','refs/heads/topic'),('GITHUB_RUN_ATTEMPT','2'),
   ('GITHUB_REPOSITORY','other/repo'),('OWNER_V3_CONFIRMATION','wrong')]:
   with self.assertRaises(module.Refused):self.run_stage(environment={**ENV,name:value})
  self.assertEqual(self.api.calls,[])
  key=prefix(self.cfg['jobs'][0])+'prepared-job.json';job=json.loads(self.store.values[key])
  job['mask']['sha256']='f'*64;self.store.values[key]=json.dumps(job).encode()
  with self.assertRaisesRegex(module.Refused,'PREPARED_SOURCE_CHANGED'):self.run_stage()
  self.assertEqual(self.api.calls,[])
 def test_busy_old_endpoint_pods_volumes_existing_task_and_high_price_refuse_before_create(self):
  for name,value in [('busy_previous',True),('pods',[{'id':'fixture'}]),('volumes',[{'id':'fixture'}]),
   ('extra_endpoints',[{'id':'otherstage','name':'WORLDIFACT-OWNER-V3-S2','workers':{'min':0}}]),('price',3.01)]:
   api=Provider(self.store);setattr(api,name,value);self.api=api
   with self.assertRaises(module.Refused):self.run_stage()
   self.assertFalse(any(method!='GET' for _,method,_ in api.calls))
 def test_independent_cleanup_works_during_storage_outage_without_job_or_endpoint_create(self):
  self.api.created={**module.endpoint_plan(self.cfg,1,{'pool':'AMPERE_80'},ENV,ENV['GITHUB_RUN_ID']),
   'id':'owned_stage_endpoint'}
  state=module.identity(self.api.created,self.cfg,1,ENV['GITHUB_RUN_ID']);module.local_json(self.path,state)
  self.store.fail_reads=True;self.store.fail_all_writes=True
  result=module.cleanup_only(self.store,self.cfg,1,self.api,ENV,self.path,self.clock,self.clock.sleep)
  self.assertTrue(result['deleted']);self.assert_only_own_cleanup()
  self.assertFalse(any(method=='POST' for _,method,_ in self.api.calls))
 def test_independent_cleanup_cannot_target_old_or_mismatched_endpoint(self):
  self.api.created={**module.endpoint_plan(self.cfg,1,{'pool':'AMPERE_80'},ENV,ENV['GITHUB_RUN_ID']),
   'id':'owned_stage_endpoint'}
  state=module.identity(self.api.created,self.cfg,1,ENV['GITHUB_RUN_ID'])
  state['endpointId']=module.PREVIOUS_ENDPOINT
  with self.assertRaisesRegex(module.Refused,'CLEANUP_IDENTITY_INVALID'):
   module.cleanup(self.api,state,self.cfg,1,self.clock,self.clock.sleep)
  state['endpointId']='owned_stage_endpoint';self.api.created['image']='wrong'
  with self.assertRaisesRegex(module.Refused,'CLEANUP_PROVIDER_IDENTITY_MISMATCH'):
   module.cleanup(self.api,state,self.cfg,1,self.clock,self.clock.sleep)
  self.assertFalse(any(method=='DELETE' for _,method,_ in self.api.calls))
 def test_cleanup_after_failed_preparation_is_noop_without_provider_calls(self):
  result=module.cleanup_only(self.store,self.cfg,1,self.api,ENV,self.path,self.clock,self.clock.sleep)
  self.assertTrue(result['noCreationClaim']);self.assertTrue(result['noOwnedEndpoint'])
  self.assertEqual(self.api.calls,[])
  self.assertTrue((self.path.parent/'owner-v3-stage1-cleanup-receipt.json').is_file())
 def test_cleanup_rerun_is_allowed_but_cannot_launch_any_paid_work(self):
  self.api.created={**module.endpoint_plan(self.cfg,1,{'pool':'AMPERE_80'},ENV,ENV['GITHUB_RUN_ID']),
   'id':'owned_stage_endpoint'}
  state=module.identity(self.api.created,self.cfg,1,ENV['GITHUB_RUN_ID']);module.local_json(self.path,state)
  result=module.cleanup_only(self.store,self.cfg,1,self.api,{**ENV,'GITHUB_RUN_ATTEMPT':'2'},
   self.path,self.clock,self.clock.sleep)
  self.assertTrue(result['deleted']);self.assert_only_own_cleanup()
  self.assertFalse(any(method=='POST' for _,method,_ in self.api.calls))

if __name__=='__main__':unittest.main()
