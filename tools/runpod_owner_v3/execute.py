"""Two separately gated owner stages; one disposable endpoint and inference each.

Only the protected first-attempt main workflow may mutate provider resources.
No write is automatically retried. All new endpoints are deleted, including on
success; the old WORLDIFACT-3D-FLEX endpoint is read-only throughout.
"""
from __future__ import annotations
import argparse, copy, json, math, os, re, sys, tempfile, time, uuid
from pathlib import Path
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tools/runpod_worker'))
from contracts import validate_job, fingerprint, Rejected
from storage import S3Store
from tools.runpod_owner_v3.prepare import config, prefix, stage2_gate, read_json, SCOPE, BATCH, JOBS

CONTROL='https://api.runpod.io'
RUNTIME='https://api.runpod.ai'
PREVIOUS_ENDPOINT='s461jvmhr256g3'
REGISTRY='cmvbbpdxq000pi81ul0ltivxv'
A100_POOL='AMPERE_80'  # Runpod SDK GPU types + prior successful A100 qualification.
CONFIRMATION='TWO-OWNER-V3-MAX-6USD'
IMAGE=re.compile(r'ghcr.io/teslaeco/worldifact-runpod3d@sha256:[a-f0-9]{64}')
IDENTIFIER=re.compile(r'[A-Za-z0-9_-]{5,100}')
SAFE_CODE=re.compile(r'[A-Z0-9_]{1,100}')
ARTIFACT_NAMES={'raw/decoder.npz','raw/engine.json','raw/original.glb',
 'outputs/game.glb','outputs/source.blend','outputs/scene-report.json',
 'outputs/qa.initial.json','outputs/qa.json'}|{
 'outputs/'+kind+'_'+view+'.png' for kind in ('pbr','clay')
 for view in ('front','three_quarter','side','back')}

class Refused(RuntimeError):pass
def require(ok,code):
 if not ok:raise Refused(code)
def safe_error(error):
 return str(error) if isinstance(error,(Refused,Rejected)) and SAFE_CODE.fullmatch(str(error)) else 'UNEXPECTED_FAILURE_RECONCILE'

def read_final_result(store,key,sleep):
 # Only this read-only reconciliation is retried. Endpoint creation, paid
 # submission and conditional storage writes remain strictly one-shot.
 from botocore.exceptions import BotoCoreError
 for attempt in range(3):
  try:return read_json(store,key)
  except (OSError,BotoCoreError,Rejected) as error:
   if isinstance(error,Rejected) and str(error)!='STORAGE_READ_FAILED':raise
   if attempt==2:raise Refused('DURABLE_RESULT_READ_UNAVAILABLE') from None
   sleep(1)
def valid_id(value):return isinstance(value,str) and IDENTIFIER.fullmatch(value) is not None
def stage_name(stage):
 require(type(stage) is int and stage in (1,2),'INVALID_STAGE')
 return 'WORLDIFACT-OWNER-V3-S'+str(stage)

def trusted_context(environment,cleanup_mode=False):
 attempt=environment.get('GITHUB_RUN_ATTEMPT','')
 require(environment.get('GITHUB_REF')=='refs/heads/main'
  and (re.fullmatch(r'[1-9][0-9]{0,8}',attempt) is not None if cleanup_mode else attempt=='1')
  and environment.get('GITHUB_REPOSITORY')=='teslaeco/WORLDIFACT'
  and re.fullmatch(r'[1-9][0-9]{0,24}',environment.get('GITHUB_RUN_ID','')) is not None,
  'TRUSTED_MAIN_FIRST_ATTEMPT_REQUIRED')
 require(environment.get('OWNER_V3_CONFIRMATION')==CONFIRMATION,'BATCH_CONFIRMATION_REQUIRED')
 return environment['GITHUB_RUN_ID']

def checked_config(cfg):
 require(cfg.get('id')==BATCH and cfg.get('scope')==SCOPE
  and cfg.get('revision')=='astra-runpod-blender-v3' and cfg.get('maxBatchMicroUsd')==6000000,
  'FIXED_BATCH_SCOPE_REQUIRED')
 require(cfg.get('previousEndpointId')==PREVIOUS_ENDPOINT and cfg.get('registry')==REGISTRY,
  'ACCOUNT_RESOURCE_IDENTITY_CHANGED')
 require(isinstance(cfg.get('image'),str) and IMAGE.fullmatch(cfg['image']) is not None
  and re.fullmatch(r'[a-f0-9]{40}',cfg.get('imageSourceCommit') or '') is not None,
  'IMMUTABLE_REVIEWED_IMAGE_REQUIRED')
 require(cfg.get('sourceReview',{}).get('accepted') is True,'SOURCE_MASK_REVIEW_REQUIRED')
 jobs=cfg.get('jobs')
 require(isinstance(jobs,list) and len(jobs)==2 and tuple(j.get('jobId') for j in jobs)==JOBS,
  'EXACT_TWO_JOB_IDENTITIES_REQUIRED')
 require(tuple(j.get('name') for j in jobs)==('ECOMECH_V4','HALLOWEEN_MUSIC_ROOM')
  and tuple(j.get('subject') for j in jobs)==('robot','person'),'FIXED_STAGE_ORDER_REQUIRED')
 for job in jobs:
  for kind in ('reference','mask'):
   spec=job.get(kind)
   require(isinstance(spec,dict) and set(spec)=={'sha256','bytes','width','height'}
    and re.fullmatch(r'[a-f0-9]{64}',spec.get('sha256','')) is not None
    and type(spec['bytes']) is int and 0<spec['bytes']<=12*1024*1024
    and type(spec['width']) is int and type(spec['height']) is int
    and min(spec['width'],spec['height'])>=32 and spec['width']*spec['height']<=16000000,
    'INVALID_REVIEWED_SOURCE')
  require((job['reference']['width'],job['reference']['height'])==
   (job['mask']['width'],job['mask']['height']),'SOURCE_MASK_DIMENSIONS_CHANGED')
 return cfg

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise Refused('PROVIDER_REDIRECT_REJECTED')

class Provider:
 def __init__(self,key):
  require(isinstance(key,str) and len(key)>=12 and not re.search(r'\s',key),'PROVIDER_SECRET_MISSING')
  self.key=key;self.opener=urllib.request.build_opener(NoRedirect())
 def request(self,origin,method,path,body=None):
  require(origin in (CONTROL,RUNTIME) and method in ('GET','POST','DELETE'),'UNAPPROVED_PROVIDER_OPERATION')
  if origin==CONTROL:
   allowed=(method=='GET' and path in ('/v2/serverless','/v2/pods','/v2/network-volumes',
    '/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1')) or (
    method=='POST' and path=='/v2/serverless') or (method in ('GET','DELETE')
    and re.fullmatch(r'/v2/serverless/[A-Za-z0-9_-]{5,100}',path))
  else:
   allowed=(method=='POST' and re.fullmatch(r'/v2/[A-Za-z0-9_-]{5,100}/run',path)) or (
    method=='GET' and re.fullmatch(r'/v2/[A-Za-z0-9_-]{5,100}/(?:health|status/[A-Za-z0-9_-]{5,100})',path))
  require(bool(allowed),'UNAPPROVED_PROVIDER_RESOURCE')
  require((method=='POST')==(body is not None),'INVALID_PROVIDER_BODY')
  req=urllib.request.Request(origin+path,method=method,
   data=json.dumps(body).encode() if body is not None else None,
   headers={'Authorization':'Bearer '+self.key,'Accept':'application/json',
    **({'Content-Type':'application/json'} if body is not None else {})})
  try:
   with self.opener.open(req,timeout=20) as response:
    if response.status==204:return None
    require(response.headers.get_content_type()=='application/json','PROVIDER_RESPONSE_NOT_JSON')
    raw=response.read(500001);require(len(raw)<=500000,'PROVIDER_RESPONSE_TOO_LARGE')
    return json.loads(raw) if raw else None
  except urllib.error.HTTPError as error:
   if method=='GET' and error.code==404:return None
   raise Refused('PROVIDER_'+method+'_HTTP_'+str(error.code)) from None
  except Refused:raise
  except Exception:
   raise Refused('PROVIDER_WRITE_RESULT_UNKNOWN' if method in ('POST','DELETE')
                 else 'PROVIDER_READ_FAILED') from None

def rows(value,key):
 require(isinstance(value,dict) and isinstance(value.get(key),list)
  and isinstance(value.get('pagination'),dict) and value['pagination'].get('hasNextPage') is False
  and len(value[key])<=5000,'INCOMPLETE_ACCOUNT_INVENTORY')
 return value[key]

def inspect(api):
 endpoints=rows(api.request(CONTROL,'GET','/v2/serverless'),'endpoints')
 pods=rows(api.request(CONTROL,'GET','/v2/pods'),'pods')
 volumes=rows(api.request(CONTROL,'GET','/v2/network-volumes'),'networkVolumes')
 require(not pods and not volumes,'PODS_OR_NETWORK_VOLUMES_REQUIRE_REVIEW')
 require(all(isinstance(ep,dict) and ep.get('workers',{}).get('min')==0 for ep in endpoints),
  'ALWAYS_ON_ENDPOINT_REQUIRES_REVIEW')
 prior_health=None
 for ep in endpoints:
  if ep.get('id')==PREVIOUS_ENDPOINT:
   require(ep.get('name')=='WORLDIFACT-3D-FLEX','PREVIOUS_ENDPOINT_IDENTITY_CHANGED')
   health=api.request(RUNTIME,'GET','/v2/'+PREVIOUS_ENDPOINT+'/health')
   jobs=health.get('jobs') if isinstance(health,dict) else None
   require(isinstance(jobs,dict) and type(jobs.get('inQueue')) is int and jobs['inQueue']==0
    and type(jobs.get('inProgress')) is int and jobs['inProgress']==0,'PREVIOUS_ENDPOINT_BUSY_OR_UNKNOWN')
   prior_health={'inQueue':0,'inProgress':0}
  else:
   require(not str(ep.get('name','')).startswith('WORLDIFACT'),'UNEXPECTED_TASK_ENDPOINT_REQUIRES_REVIEW')
 return {'pods':0,'networkVolumes':0,'endpointCount':len(endpoints),
  'alwaysOnEndpoints':0,'previousEndpoint':prior_health}

def gpu_price(api):
 catalog=api.request(CONTROL,'GET','/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1')
 require(isinstance(catalog,dict) and isinstance(catalog.get('gpus'),list)
  and len(catalog['gpus'])<300,'GPU_CATALOG_UNVERIFIED')
 candidates=[]
 for gpu in catalog['gpus']:
  price=gpu.get('price',{}).get('serverless') if isinstance(gpu,dict) else None
  if (isinstance(gpu,dict) and re.search('A100',str(gpu.get('name','')),re.I)
   and gpu.get('memory')==80 and gpu.get('pool')==A100_POOL and type(price) in (int,float)
   and math.isfinite(price) and 0<price<=3 and gpu.get('availability') in ('HIGH','MEDIUM','LOW')):
   candidates.append({'pool':gpu['pool'],'pricePerHour':price})
 require(candidates,'A100_80GB_PRICE_OR_AVAILABILITY_NOT_CONFIRMED')
 return min(candidates,key=lambda value:(value['pricePerHour'],value['pool']))

def endpoint_plan(cfg,stage,gpu,environment,run_id):
 storage={key:environment.get(key,'') for key in ('ARTIFACT_S3_ENDPOINT','ARTIFACT_BUCKET',
  'ARTIFACT_REGION','ARTIFACT_ACCESS_KEY_ID','ARTIFACT_SECRET_ACCESS_KEY')}
 require(re.fullmatch(r'https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com/?',storage['ARTIFACT_S3_ENDPOINT'])
  and all(storage[key] for key in ('ARTIFACT_BUCKET','ARTIFACT_ACCESS_KEY_ID','ARTIFACT_SECRET_ACCESS_KEY')),
  'PRIVATE_STORAGE_CONFIGURATION_REQUIRED')
 return {'name':stage_name(stage),'image':cfg['image'],'registry':REGISTRY,'type':'QUEUE',
  'gpu':{'pools':[gpu['pool']],'count':1,'minCudaVersion':'12.4'},'disk':100,
  'workers':{'min':0,'max':1,'idleTimeout':5},'scaling':{'type':'QUEUE_DELAY','queueDelay':4},
  'timeout':1800000,'flashboot':'OFF','dataCenterIds':[],'mounts':{'network':[],'global':[]},
  'env':{**storage,'ENABLE_RUNPOD_WORKER':'true','WORLDIFACT_OWNER_BATCH':BATCH,
   'WORLDIFACT_OWNER_JOB_ID':cfg['jobs'][stage-1]['jobId'],'WORLDIFACT_OWNER_RUN_ID':run_id}}

def readback(endpoint,planned):
 require(isinstance(endpoint,dict) and valid_id(endpoint.get('id'))
  and endpoint.get('id')!=PREVIOUS_ENDPOINT,'ENDPOINT_CREATE_ID_UNKNOWN')
 workers=endpoint.get('workers');mounts=endpoint.get('mounts');gpu=endpoint.get('gpu')
 # The v2 response may add status/metadata fields. Check each requested cost
 # and storage constraint rather than requiring dictionary byte-for-byte shape.
 # Never accept an omitted mount list or a conflicting legacy volume alias.
 require(all(endpoint.get(key)==planned[key] for key in ('name','image','registry','type','disk','timeout'))
  and isinstance(workers,dict) and all(type(workers.get(key)) is int and workers[key]==value
   for key,value in planned['workers'].items())
  and isinstance(gpu,dict) and type(gpu.get('count')) is int and gpu['count']==1
  and gpu.get('pools')==planned['gpu']['pools']
  and isinstance(mounts,dict) and mounts.get('network')==[] and mounts.get('global')==[]
  and endpoint.get('networkVolumes',[])==[],'ENDPOINT_READBACK_MISMATCH')

def local_json(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 require(not path.is_symlink(),'LOCAL_STATE_SYMLINK_REJECTED')
 with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,prefix=path.name+'.',delete=False) as stream:
  pending=Path(stream.name)
  try:
   os.fchmod(stream.fileno(),0o600);json.dump(value,stream);stream.write('\n')
   stream.flush();os.fsync(stream.fileno());pending.replace(path)
  finally:
   if pending.exists():pending.unlink()

def identity(endpoint,cfg,stage,run_id):
 require(valid_id(endpoint.get('id')) and endpoint['id']!=PREVIOUS_ENDPOINT,'UNSAFE_ENDPOINT_ID')
 return {'batch':BATCH,'stage':stage,'jobId':cfg['jobs'][stage-1]['jobId'],
  'endpointId':endpoint['id'],'name':stage_name(stage),'image':cfg['image'],'githubRunId':run_id}

def check_identity(state,cfg,stage):
 require(isinstance(state,dict) and state.get('batch')==BATCH and state.get('stage')==stage
  and state.get('jobId')==cfg['jobs'][stage-1]['jobId'] and valid_id(state.get('endpointId'))
  and state['endpointId']!=PREVIOUS_ENDPOINT and state.get('name')==stage_name(stage)
  and state.get('image')==cfg['image'],'CLEANUP_IDENTITY_INVALID')

def cleanup(api,state,cfg,stage,clock=time.monotonic,sleep=time.sleep):
 check_identity(state,cfg,stage)
 path='/v2/serverless/'+state['endpointId'];current=api.request(CONTROL,'GET',path)
 if current is None:return {'deleted':True,'alreadyAbsent':True,'endpointId':state['endpointId']}
 require(isinstance(current,dict) and current.get('id')==state['endpointId']
  and current.get('name')==state['name'] and current.get('image')==state['image'],
  'CLEANUP_PROVIDER_IDENTITY_MISMATCH')
 delete_error=None
 try:api.request(CONTROL,'DELETE',path)
 except Exception as error:delete_error=safe_error(error)
 # Even an ambiguous DELETE is followed by bounded read-only reconciliation.
 end=clock()+120
 for _ in range(12):
  if clock()>=end:break
  try:
   if api.request(CONTROL,'GET',path) is None:
    return {'deleted':True,'endpointId':state['endpointId'],'deleteResponseAmbiguous':delete_error is not None}
  except Exception:pass
  sleep(min(5,max(0,end-clock())))
 return {'deleted':False,'endpointId':state['endpointId'],'reason':delete_error or 'ENDPOINT_DELETION_NOT_CONFIRMED'}

def reconcile_create(api,cfg,stage,run_id):
 candidates=rows(api.request(CONTROL,'GET','/v2/serverless'),'endpoints')
 matches=[ep for ep in candidates if ep.get('name')==stage_name(stage)]
 require(len(matches)<=1,'AMBIGUOUS_ENDPOINT_IDENTITY')
 if not matches:return None
 ep=matches[0]
 require(ep.get('image')==cfg['image'] and ep.get('registry')==REGISTRY
  and ep.get('env',{}).get('WORLDIFACT_OWNER_JOB_ID')==cfg['jobs'][stage-1]['jobId']
  and ep.get('env',{}).get('WORLDIFACT_OWNER_RUN_ID')==run_id,
  'AMBIGUOUS_ENDPOINT_OWNERSHIP')
 return identity(ep,cfg,stage,run_id)

def save_cleanup(store,item,state,result,run_id):
 proof={'batch':BATCH,'jobId':item['jobId'],'identity':state,'cleanup':result}
 key=prefix(item)+'operator-cleanup/'+run_id+'-'+uuid.uuid4().hex+'.json'
 require(store.create_json(key,proof),'CLEANUP_PROOF_CONFLICT')
 if result.get('deleted'):
  canonical=prefix(item)+'operator-cleanup.json'
  if not store.create_json(canonical,proof):
   previous=read_json(store,canonical)
   require(previous and previous.get('cleanup',{}).get('deleted') is True
    and previous.get('identity',{}).get('endpointId')==state['endpointId'],'CLEANUP_PROOF_CONFLICT')
 return key

def execute(store,cfg,stage,api,environment,clock=time.monotonic,wall=time.time,sleep=time.sleep,state_path=None):
 run_id=trusted_context(environment);checked_config(cfg);stage_name(stage)
 if stage==2:stage2_gate(store,cfg)
 item=cfg['jobs'][stage-1];p=prefix(item)
 prepared=read_json(store,p+'prepared-job.json')
 require(isinstance(prepared,dict),'PREPARED_JOB_REQUIRED')
 require(prepared.get('revision')==cfg['revision'] and prepared.get('jobId')==item['jobId']
  and prepared.get('scope')==SCOPE and prepared.get('plan',{}).get('subject')==item['subject']
  and prepared.get('settings')=={'seed':42,'resolution':1536,'textureSize':4096,'targetFaces':1000000},
  'PREPARED_JOB_SCOPE_CHANGED')
 for kind in ('reference','mask'):
  require(prepared.get(kind)=={'key':p+kind+'.png','sha256':item[kind]['sha256']},'PREPARED_SOURCE_CHANGED')
 for key in ('operator-run-claim.json','operator-dispatch-claim.json','claim.json','result.json'):
  require(read_json(store,p+key) is None,'STAGE_ALREADY_CONSUMED_RECONCILE_ONLY')
 account=inspect(api);gpu=gpu_price(api)
 job=copy.deepcopy(prepared)
 job['budget']={'maxGpuMicroUsd':2100000,'rateMicroUsdPerSecond':math.ceil(gpu['pricePerHour']*1e6/3600),
  'executionSeconds':1800,'coldStartAllowanceSeconds':600,'idleSeconds':5,'expiresAt':int(wall()*1000)+3600000}
 job=validate_job(job,int(wall()*1000));fp=fingerprint(job)
 planned=endpoint_plan(cfg,stage,gpu,environment,run_id)
 require(store.create_json(p+'operator-run-claim.json',{'batch':BATCH,'stage':stage,'jobId':item['jobId'],
  'image':cfg['image'],'name':stage_name(stage),'githubRunId':run_id,'fingerprint':fp}),
  'OPERATOR_RUN_ALREADY_CLAIMED')
 path=Path(state_path or f'owner-v3-local/owner-v3-stage{stage}-state.json')
 proof={'batch':BATCH,'stage':stage,'jobId':item['jobId'],'githubRunId':run_id,'image':cfg['image'],
  'status':'FAILED_RECONCILE','accountBefore':account,'gpu':gpu,'settings':job['settings'],
  'gpuReservedMicroUsd':2100000,'batchModeledLimitMicroUsd':6000000,
  'providerInvoiceCapAbsolute':False,'customerRoutingChanged':False,'automaticRetryAllowed':False,
  'startedAtUnixMs':int(wall()*1000)}
 state=None;create_started=False;end=clock()+2400;phase='ENDPOINT_SETUP'
 try:
  create_started=True
  created=api.request(CONTROL,'POST','/v2/serverless',planned)
  require(isinstance(created,dict) and valid_id(created.get('id')),'ENDPOINT_CREATE_ID_UNKNOWN')
  state=identity(created,cfg,stage,run_id)
  local_json(path,state)
  require(store.create_json(p+'operator-endpoint.json',state),'ENDPOINT_IDENTITY_COMMIT_CONFLICT')
  readback(created,planned)
  actual=api.request(CONTROL,'GET','/v2/serverless/'+state['endpointId']);readback(actual,planned)
  require(end-clock()>1800,'INSUFFICIENT_REMAINING_EXECUTION_TIME')
  phase='DISPATCH'
  require(store.create_json(p+'operator-dispatch-claim.json',{'batch':BATCH,'stage':stage,
   'fingerprint':fp,'job':job,'endpointId':state['endpointId']}),'DISPATCH_ALREADY_CLAIMED_NO_RETRY')
  accepted=api.request(RUNTIME,'POST','/v2/'+state['endpointId']+'/run',
   {'input':job,'policy':{'executionTimeout':1800000,'ttl':2400000}})
  require(isinstance(accepted,dict) and valid_id(accepted.get('id')),'SUBMISSION_UNKNOWN_NO_RETRY')
  state['providerId']=accepted['id'];local_json(path,state)
  require(store.create_json(p+'operator-provider-job.json',{'jobId':item['jobId'],
   'endpointId':state['endpointId'],'providerId':accepted['id'],'fingerprint':fp}),
   'PROVIDER_JOB_ID_COMMIT_CONFLICT')
  proof.update(endpointId=state['endpointId'],providerId=accepted['id'],fingerprint=fp)
  phase='POLL'
  terminal=None
  while clock()<end:
   status=api.request(RUNTIME,'GET','/v2/'+state['endpointId']+'/status/'+accepted['id'])
   require(isinstance(status,dict) and status.get('status') in
    ('IN_QUEUE','IN_PROGRESS','COMPLETED','FAILED','CANCELLED','TIMED_OUT'),'JOB_STATUS_UNKNOWN')
   if status['status'] in ('COMPLETED','FAILED','CANCELLED','TIMED_OUT'):
    terminal=status;break
   sleep(min(15,max(0,end-clock())))
  require(terminal is not None,'STAGE_WALL_CLOCK_LIMIT')
  phase='PROVIDER_RESULT'
  proof['providerStatus']=terminal['status']
  for field in ('executionTime','delayTime'):
   if type(terminal.get(field)) in (int,float) and math.isfinite(terminal[field]) and terminal[field]>=0:
    proof[field+'Ms']=terminal[field]
  output=terminal.get('output',{})
  require(terminal['status']=='COMPLETED' and isinstance(output,dict)
   and output.get('state')=='REVIEW_REQUIRED' and output.get('jobId')==item['jobId']
   and output.get('fingerprint')==fp and output.get('inferenceAttempts')==1,
   'GENERATION_FAILED_RECONCILE_SAVED_CHECKPOINTS')
  phase='DURABLE_RESULT'
  durable=read_final_result(store,p+'result.json',sleep)
  require(durable==output,'DURABLE_RESULT_MISMATCH')
  phase='ARTIFACT_MANIFEST'
  artifacts=durable.get('artifacts')
  require(isinstance(artifacts,list) and len(artifacts)==16
   and {a.get('key') for a in artifacts if isinstance(a,dict)}=={p+name for name in ARTIFACT_NAMES},
   'DURABLE_ARTIFACT_SET_INCOMPLETE')
  proof.update(status='EXPORTED_REVIEW_REQUIRED',artifactCount=len(artifacts),inferenceAttempts=1)
 except Exception as error:
  proof['failure']=safe_error(error)
  proof['failurePhase']=phase
  error_type=type(error).__name__
  proof['failureType']=error_type if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,79}',error_type) else 'Exception'
 finally:
  if state is None and create_started:
   try:
    state=reconcile_create(api,cfg,stage,run_id)
    if state:
     local_json(path,state)
     try:store.create_json(p+'operator-endpoint.json',state)
     except Exception:proof['endpointIdentityStorageConfirmed']=False
    else:proof['unconfirmedCreateRequiresReconciliation']=True
   except Exception as error:proof['createReconciliationFailure']=safe_error(error)
  if state:
   try:proof['cleanup']=cleanup(api,state,cfg,stage,clock,sleep)
   except Exception as error:proof['cleanup']={'deleted':False,'reason':safe_error(error),'endpointId':state['endpointId']}
   try:proof['cleanupProofKey']=save_cleanup(store,item,state,proof['cleanup'],run_id)
   except Exception:proof['cleanupProofStorageConfirmed']=False
  else:proof['cleanup']={'deleted':False,'reason':'NO_CONFIRMED_CREATED_IDENTITY'}
  if proof['cleanup'].get('deleted') is not True:proof['status']='FAILED_RECONCILE'
  proof['finishedAtUnixMs']=int(wall()*1000)
  try:
   proof['executionReceiptStored']=bool(store.create_json(p+'operator-execution.json',proof))
  except Exception:proof['executionReceiptStored']=False
  if not proof['executionReceiptStored']:proof['status']='FAILED_RECONCILE'
  local_json(path.with_name(f'owner-v3-stage{stage}-receipt.json'),proof)
 return proof

def cleanup_only(store,cfg,stage,api,environment,state_path=None,clock=time.monotonic,sleep=time.sleep):
 run_id=trusted_context(environment,cleanup_mode=True);stage_name(stage)
 item=cfg['jobs'][stage-1];path=Path(state_path or f'owner-v3-local/owner-v3-stage{stage}-state.json')
 local=json.loads(path.read_text()) if path.is_file() and not path.is_symlink() else None
 try:durable=read_json(store,prefix(item)+'operator-endpoint.json')
 except Exception:durable=None
 state=local or durable
 if local and durable:
  require(all(local.get(k)==durable.get(k) for k in ('endpointId','name','image','jobId','stage','batch')),
   'CLEANUP_LOCAL_DURABLE_IDENTITY_MISMATCH')
 if state is None:
  claim=read_json(store,prefix(item)+'operator-run-claim.json')
  if claim is None:
   result={'deleted':True,'noOwnedEndpoint':True,'noCreationClaim':True,
    'status':'NOTHING_CREATED_NO_PROVIDER_MUTATION'}
   local_json(path.with_name(f'owner-v3-stage{stage}-cleanup-receipt.json'),result)
   return result
  require(claim and claim.get('image')==cfg['image'] and claim.get('jobId')==item['jobId']
   and claim.get('name')==stage_name(stage),'CLEANUP_RUN_CLAIM_REQUIRED')
  state=reconcile_create(api,cfg,stage,claim['githubRunId'])
  require(state is not None,'CREATE_IDENTITY_STILL_UNKNOWN')
 result=cleanup(api,state,cfg,stage,clock,sleep)
 try:result['proofKey']=save_cleanup(store,item,state,result,run_id)
 except Exception:result['proofStorageConfirmed']=False
 local_json(path.with_name(f'owner-v3-stage{stage}-cleanup-receipt.json'),result)
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--stage',type=int,choices=(1,2))
 modes=parser.add_mutually_exclusive_group();modes.add_argument('--cleanup',action='store_true');modes.add_argument('--inspect',action='store_true')
 args=parser.parse_args()
 try:
  api=Provider(os.environ.get('RUNPOD_API_KEY'))
  if args.inspect:
   print(json.dumps({'status':'READ_ONLY','account':inspect(api)}));return 0
  require(args.stage in (1,2),'STAGE_REQUIRED')
  cfg=config();store=S3Store.from_env()
  result=(cleanup_only(store,cfg,args.stage,api,os.environ) if args.cleanup
   else execute(store,cfg,args.stage,api,os.environ))
  print(json.dumps(result))
  return 0 if (result.get('deleted') is True if args.cleanup else result.get('status')=='EXPORTED_REVIEW_REQUIRED') else 2
 except Exception as error:
  print(json.dumps({'status':'REFUSED','reason':safe_error(error)}));return 2

if __name__=='__main__':sys.exit(main())
