/** Two owner-requested models on one fixed Flex endpoint; no customer router changes. */
import fs from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {pickA100,requestedEndpoint} from './runpod-provision-on-demand.mjs'
export const IMAGE='ghcr.io/teslaeco/worldifact-runpod3d@sha256:d303d66ec97aec3826dea3679ce5bf6b2786718fc2a0777409e859ce5375347e'
const REGISTRY='cmvbbpdxq000pi81ul0ltivxv'
const NAME='WORLDIFACT-3D-FLEX'
const CONTROL='https://api.runpod.io'
const RUNTIME='https://api.runpod.ai'
const STATE='owner-model-endpoint-state.json'
const ensure=(ok,message)=>{if(!ok)throw new Error(message)}
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{5,100}$/.test(value)
export function endpointPlan(pool,storage){
  ensure(/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/.test(storage.ARTIFACT_S3_ENDPOINT),'INVALID_STORAGE')
  ensure(storage.ARTIFACT_BUCKET&&storage.ARTIFACT_ACCESS_KEY_ID&&storage.ARTIFACT_SECRET_ACCESS_KEY,'STORAGE_REQUIRED')
  return {...requestedEndpoint(IMAGE,pool),registry:REGISTRY,timeout:900000,
    gpu:{pools:[pool],count:1,minCudaVersion:'12.4'},env:{...storage,ENABLE_RUNPOD_WORKER:'true'}}
}
export function budgetJob(prepared,price,now=Date.now()){
  ensure(Number.isFinite(price)&&price>0&&price<=3,'GPU_PRICE_CEILING')
  ensure(prepared.planner?.model==='gpt-6-astra'&&/^resp_[a-zA-Z0-9_-]+$/.test(prepared.planner.responseId),'REAL_PLANNER_REQUIRED')
  return {...prepared,budget:{maxGpuMicroUsd:1300000,rateMicroUsdPerSecond:Math.ceil(price*1e6/3600),
    executionSeconds:900,coldStartAllowanceSeconds:600,idleSeconds:5,expiresAt:now+3600000}}
}
async function api(origin,method,path,body){
  ensure([CONTROL,RUNTIME].includes(origin)&&path.startsWith('/v2/'),'INVALID_PROVIDER')
  const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Bearer '+process.env.RUNPOD_API_KEY,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(response.status===404&&method==='GET')return null
  ensure(response.ok,'PROVIDER_'+method+'_'+response.status)
  if(response.status===204)return null
  const raw=await response.text();ensure(raw.length<500000,'PROVIDER_RESPONSE_TOO_LARGE')
  return raw?JSON.parse(raw):null
}
async function cleanup(state){
  ensure(id(state.endpointId)&&state.name===NAME,'CLEANUP_IDENTITY_INVALID')
  const current=await api(CONTROL,'GET','/v2/serverless/'+state.endpointId)
  if(!current)return {deleted:true,alreadyAbsent:true}
  ensure(current.name===NAME&&current.image===IMAGE,'CLEANUP_IDENTITY_MISMATCH')
  await api(CONTROL,'DELETE','/v2/serverless/'+state.endpointId)
  for(let n=0;n<12;n++){
    if(!await api(CONTROL,'GET','/v2/serverless/'+state.endpointId))return {deleted:true}
    await new Promise(r=>setTimeout(r,5000))
  }
  throw new Error('CLEANUP_NOT_CONFIRMED')
}
async function main(){
  ensure(process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_RUN_ATTEMPT==='1','TRUSTED_MAIN_FIRST_ATTEMPT_REQUIRED')
  if(process.argv.includes('--cleanup')){
    const state=JSON.parse(await fs.readFile(STATE,'utf8'))
    if(state.completed===true){console.log(JSON.stringify({endpointId:state.endpointId,retained:true,minWorkers:0}));return}
    console.log(JSON.stringify({cleanup:await cleanup(state)}));return
  }
  ensure(process.env.OWNER_MODEL_CONFIRMATION==='TWO-OWNER-MODELS-MAX-4USD','BUDGET_CONFIRMATION_REQUIRED')
  const cfg=JSON.parse(await fs.readFile('ops/RUNPOD_OWNER_MODEL_JOBS_20261016.json','utf8'))
  ensure(cfg.image===IMAGE&&Date.now()<Date.parse(cfg.expiresBefore),'IMAGE_OR_AUTHORIZATION_EXPIRED')
  const items=JSON.parse(await fs.readFile('owner-model-jobs.json','utf8'))
  ensure(items.length===2&&items.every((v,i)=>v.name===cfg.jobs[i].name&&v.job.jobId===cfg.jobs[i].jobId),'FIXED_TWO_OWNER_JOBS_REQUIRED')
  const inventory=await api(CONTROL,'GET','/v2/serverless')
  ensure(Array.isArray(inventory?.endpoints)&&inventory.pagination?.hasNextPage===false,'INCOMPLETE_ENDPOINT_INVENTORY')
  ensure(!inventory.endpoints.some(x=>x.name===NAME||x.name?.startsWith('WORLDIFACT-QUALIFY-')),'EXISTING_ENDPOINT_REQUIRES_RECONCILIATION')
  const gpu=pickA100(await api(CONTROL,'GET','/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1'))
  const storage=Object.fromEntries(['ARTIFACT_S3_ENDPOINT','ARTIFACT_BUCKET','ARTIFACT_REGION','ARTIFACT_ACCESS_KEY_ID','ARTIFACT_SECRET_ACCESS_KEY'].map(k=>[k,process.env[k]||'']))
  const planned=endpointPlan(gpu.pool,storage)
  const proof={image:IMAGE,gpu,models:[],startedAt:new Date().toISOString(),customerRoutingChanged:false}
  let state
  const deadline=Date.now()+2400000
  try{
    // Exactly one create call; ambiguous responses are never retried.
    const created=await api(CONTROL,'POST','/v2/serverless',planned)
    ensure(id(created?.id),'CREATE_UNKNOWN_INSPECT_BEFORE_RETRY')
    state={endpointId:created.id,name:NAME,completed:false}
    await fs.writeFile(STATE,JSON.stringify(state),{mode:0o600})
    ensure(created.name===NAME&&created.image===IMAGE&&created.registry===REGISTRY&&
      created.workers?.min===0&&created.workers?.max===1&&created.workers?.idleTimeout===5&&
      created.disk===100&&created.timeout===900000&&!created.mounts?.network?.length&&!created.mounts?.global?.length,'ENDPOINT_READBACK_MISMATCH')
    proof.endpointId=created.id
    console.log(JSON.stringify({stage:'ENDPOINT_READY',endpointId:created.id,usdPerHour:gpu.pricePerHour,min:0,max:1,maxBatchSeconds:2400}))
    for(const item of items){
      ensure(deadline-Date.now()>1080000,'INSUFFICIENT_REMAINING_GPU_BUDGET')
      const job=budgetJob(item.job,gpu.pricePerHour)
      // Atomically store the exact envelope before the one POST. Production
      // credentials stay in this runner; the helper emits only a claim status.
      execFileSync('python',['tools/runpod_owner_models/claim_dispatch.py'],{
        input:JSON.stringify(job),timeout:40000,stdio:['pipe','pipe','pipe']})
      const accepted=await api(RUNTIME,'POST','/v2/'+created.id+'/run',{
        input:job,policy:{executionTimeout:900000,ttl:1080000}})
      ensure(id(accepted?.id),'SUBMISSION_UNKNOWN_DO_NOT_RETRY')
      const receipt={name:item.name,jobId:job.jobId,providerId:accepted.id}
      proof.models.push(receipt)
      console.log(JSON.stringify({stage:'SUBMITTED',...receipt}))
      const jobDeadline=Math.min(deadline-60000,Date.now()+1080000)
      let terminal
      while(Date.now()<jobDeadline){
        const value=await api(RUNTIME,'GET','/v2/'+created.id+'/status/'+accepted.id)
        console.log(JSON.stringify({stage:'MODEL',name:item.name,status:value?.status}))
        if(['COMPLETED','FAILED','CANCELLED','TIMED_OUT'].includes(value?.status)){terminal=value;break}
        await new Promise(r=>setTimeout(r,15000))
      }
      ensure(terminal,'MODEL_TIME_LIMIT')
      receipt.status=terminal.status;receipt.executionTimeMs=terminal.executionTime;receipt.delayTimeMs=terminal.delayTime
      ensure(terminal.status==='COMPLETED'&&terminal.output?.state==='REVIEW_REQUIRED'&&
        terminal.output.jobId===job.jobId&&terminal.output.planner?.responseId===job.planner.responseId&&
        terminal.output.inferenceAttempts===1,'MODEL_FAILED_RECONCILE_ORIGINALS')
      receipt.artifacts=terminal.output.artifacts
      receipt.responseId=job.planner.responseId
      console.log(JSON.stringify({stage:'MODEL_EXPORTED',...receipt}))
    }
    // A fixed endpoint remains available with no minimum/always-on worker.
    // Observe the actual worker counters; never claim scale-to-zero from config.
    for(let n=0;n<36&&Date.now()<deadline-30000;n++){
      proof.health=await api(RUNTIME,'GET','/v2/'+created.id+'/health')
      const workers=proof.health?.workers
      if(workers&&Object.keys(workers).length&&Object.values(workers).every(x=>x===0)){
        proof.scaleToZeroObserved=true;break
      }
      await new Promise(r=>setTimeout(r,5000))
    }
    state.completed=true;await fs.writeFile(STATE,JSON.stringify(state),{mode:0o600})
    proof.status='TWO_MODELS_EXPORTED_REVIEW_REQUIRED'
  }catch(error){proof.failure=error.message;process.exitCode=2}
  finally{
    if(state&&!state.completed){try{proof.cleanup=await cleanup(state)}catch(error){proof.cleanup={deleted:false,reason:error.message};process.exitCode=2}}
    proof.finishedAt=new Date().toISOString()
    await fs.writeFile('owner-model-safe-receipt.json',JSON.stringify(proof,null,2)+'\n')
    console.log(JSON.stringify(proof))
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(error=>{console.log(JSON.stringify({status:'REFUSED',reason:error.message}));process.exitCode=2})
