/** Operator-only, one bounded GPU job. Does not enable the customer worker. */
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pickA100} from './runpod-provision-on-demand.mjs'
export const IMAGE='ghcr.io/teslaeco/worldifact-runpod3d@sha256:f6cd2c5facce5008e6d40b5d08ce34bfb9050347d585ab8b4d91c79cfb76b993'
export const REGISTRY='cmvbbpdxq000pi81ul0ltivxv'
const MANAGEMENT='https://api.runpod.io'
const RUNTIME='https://api.runpod.ai'
const stateFile='runpod-qualification-state.json'
const receiptFile='runpod-qualification-receipt.json'
const must=(ok,reason)=>{if(!ok)throw new Error(reason)}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{5,100}$/.test(id)
export function plan({run,worker,pool,storage,now=Date.now()}){
  must(/^gha-[0-9]+-1$/.test(run),'FIRST_ATTEMPT_REQUIRED')
  must(typeof worker==='string'&&worker.length>1000&&worker.length<25000,'INVALID_PROBE')
  must(/^[A-Z0-9_]{3,40}$/.test(pool),'INVALID_POOL')
  for(const key of ['ARTIFACT_S3_ENDPOINT','ARTIFACT_BUCKET','ARTIFACT_ACCESS_KEY_ID','ARTIFACT_SECRET_ACCESS_KEY'])
    must(typeof storage[key]==='string'&&storage[key].length>0,'MISSING_PRIVATE_STORAGE')
  must(/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/.test(storage.ARTIFACT_S3_ENDPOINT),'WRONG_STORAGE_DESTINATION')
  return {name:'WORLDIFACT-QUALIFY-'+run,image:IMAGE,registry:REGISTRY,type:'QUEUE',
    gpu:{pools:[pool],count:1,minCudaVersion:'12.4'},disk:100,
    workers:{min:0,max:1,idleTimeout:5},scaling:{type:'QUEUE_DELAY',queueDelay:4},
    timeout:900000,flashboot:'OFF',dataCenterIds:[],mounts:{network:[],global:[]},
    entrypoint:['python','-u','-c'],cmd:[worker],
    env:{...storage,ENABLE_RUNPOD_WORKER:'false',QUALIFICATION_ID:run,
      QUALIFICATION_EXPIRES_AT:String(Math.floor(now/1000)+1200),
      QUALIFICATION_IMAGE:IMAGE,QUALIFICATION_PROBE_SHA:createHash('sha256').update(worker).digest('hex')}}
}

async function api(method,origin,path,body){
  must([MANAGEMENT,RUNTIME].includes(origin)&&path.startsWith('/v2/'),'INVALID_PROVIDER')
  const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Bearer '+process.env.RUNPOD_API_KEY,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(response.status===404&&method==='GET')return null
  must(response.ok,'PROVIDER_'+method+'_'+response.status)
  if(response.status===204)return null
  const text=await response.text()
  must(text.length<500000,'OVERSIZED_PROVIDER_RESPONSE')
  return text?JSON.parse(text):null
}
async function cleanup(state){
  must(validId(state.endpointId)&&/^WORLDIFACT-QUALIFY-gha-[0-9]+-1$/.test(state.name),'INVALID_CLEANUP_TARGET')
  const current=await api('GET',MANAGEMENT,'/v2/serverless/'+state.endpointId)
  if(current===null)return {deleted:true,alreadyAbsent:true}
  must(current.id===state.endpointId&&current.name===state.name&&current.image===IMAGE,'CLEANUP_IDENTITY_MISMATCH')
  await api('DELETE',MANAGEMENT,'/v2/serverless/'+state.endpointId)
  for(let attempt=0;attempt<12;attempt++){
    if(await api('GET',MANAGEMENT,'/v2/serverless/'+state.endpointId)===null)return {deleted:true}
    await new Promise(resolve=>setTimeout(resolve,5000))
  }
  throw new Error('DELETION_NOT_CONFIRMED')
}
async function main(){
  must(process.env.RUNPOD_QUALIFY_CONFIRMATION==='QUALIFY-ONE-GPU-MAX-1USD','QUALIFICATION_NOT_AUTHORIZED')
  must(process.env.RUNPOD_API_KEY?.length>=12,'RUNPOD_KEY_MISSING')
  if(process.argv.includes('--cleanup')){
    const state=JSON.parse(await fs.readFile(stateFile,'utf8'))
    console.log(JSON.stringify({cleanup:await cleanup(state)}));return
  }
  const run='gha-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT
  const worker=await fs.readFile('tools/runpod_qualification/worker.py','utf8')
  const storage=Object.fromEntries(['ARTIFACT_S3_ENDPOINT','ARTIFACT_BUCKET','ARTIFACT_REGION',
    'ARTIFACT_ACCESS_KEY_ID','ARTIFACT_SECRET_ACCESS_KEY'].map(k=>[k,process.env[k]||'']))
  const inventory=await api('GET',MANAGEMENT,'/v2/serverless')
  must(Array.isArray(inventory?.endpoints)&&inventory.pagination?.hasNextPage===false,'INCOMPLETE_INVENTORY')
  must(!inventory.endpoints.some(x=>x.name?.startsWith('WORLDIFACT-QUALIFY-')),'PRIOR_QUALIFICATION_MUST_BE_RECONCILED')
  const gpu=pickA100(await api('GET',MANAGEMENT,'/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1'))
  console.log(JSON.stringify({stage:'BUDGET',gpuPool:gpu.pool,usdPerHour:gpu.pricePerHour,
    maxElapsedSeconds:1200,estimatedGpuCeilingUsd:gpu.pricePerHour/3,activeWorkers:0,maxWorkers:1}))
  const body=plan({run,worker,pool:gpu.pool,storage})
  const proof={run,image:IMAGE,probeSha256:body.env.QUALIFICATION_PROBE_SHA,gpu,startedAt:new Date().toISOString()}
  let state
  // Eighteen minutes for startup/job, leaving two minutes for idle observation
  // and cleanup inside the stated twenty-minute GPU allowance.
  const deadline=Date.now()+1080000
  try{
    // Exactly one creation and one job POST. Never retry an ambiguous write.
    const endpoint=await api('POST',MANAGEMENT,'/v2/serverless',body)
    must(validId(endpoint?.id),'CREATE_RESULT_UNKNOWN_INSPECT_BEFORE_RETRY')
    state={endpointId:endpoint.id,name:body.name}
    await fs.writeFile(stateFile,JSON.stringify(state),{mode:0o600})
    must(endpoint.image===IMAGE&&endpoint.name===body.name&&endpoint.workers?.min===0&&
      endpoint.workers?.max===1&&endpoint.disk===100&&endpoint.registry===REGISTRY&&
      !endpoint.mounts?.network?.length&&!endpoint.mounts?.global?.length,'ENDPOINT_SETTINGS_MISMATCH')
    proof.endpointId=endpoint.id
    const job=await api('POST',RUNTIME,'/v2/'+endpoint.id+'/run',{
      input:{qualificationId:run},policy:{executionTimeout:900000,ttl:1200000}})
    must(validId(job?.id),'JOB_SUBMISSION_UNKNOWN_NO_RETRY')
    proof.jobId=job.id
    console.log(JSON.stringify({stage:'SUBMITTED',endpointId:endpoint.id,jobId:job.id}))
    let complete=false
    while(Date.now()<deadline){
      const status=await api('GET',RUNTIME,'/v2/'+endpoint.id+'/status/'+job.id)
      console.log(JSON.stringify({stage:'JOB',status:status?.status,at:new Date().toISOString()}))
      if(['COMPLETED','FAILED','CANCELLED','TIMED_OUT'].includes(status?.status)){
        proof.jobStatus=status.status;proof.output=status.output;
        proof.executionTimeMs=status.executionTime;proof.delayTimeMs=status.delayTime;
        complete=true;break
      }
      await new Promise(resolve=>setTimeout(resolve,15000))
    }
    must(complete,'QUALIFICATION_WALL_CLOCK_LIMIT')
    must(proof.jobStatus==='COMPLETED'&&proof.output?.status==='PASS','GPU_QUALIFICATION_FAILED')
    // Observe actual scale-to-zero before deleting this disposable endpoint.
    for(let attempt=0;attempt<12 && Date.now()<deadline+60000;attempt++){
      const health=await api('GET',RUNTIME,'/v2/'+endpoint.id+'/health')
      proof.health=health
      const workers=health?.workers
      if(workers&&['idle','initializing','ready','running','throttled'].every(k=>(workers[k]??0)===0)){
        proof.scaleToZeroObserved=true;break
      }
      await new Promise(resolve=>setTimeout(resolve,5000))
    }
  }catch(error){proof.failure=error.message;process.exitCode=2}
  finally{
    if(state){try{proof.cleanup=await cleanup(state)}catch(error){proof.cleanup={deleted:false,reason:error.message};process.exitCode=2}}
    proof.finishedAt=new Date().toISOString()
    await fs.writeFile(receiptFile,JSON.stringify(proof,null,2)+'\n')
    console.log(JSON.stringify(proof))
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(error=>{console.log(JSON.stringify({status:'REFUSED',reason:error.message}));process.exitCode=2})
