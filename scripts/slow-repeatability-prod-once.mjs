import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const APPROVAL='worldifact-slow-repeatability-prod-tiered-20261014-v2'
const OWNER=createHash('sha256').update(APPROVAL+':owner').digest('hex')
const FINGERPRINT=createHash('sha256').update(APPROVAL+':fingerprint').digest('hex')
const JOBS=Object.freeze([
  {name:'astra-tiered',model:'astra',provider:'gpt-6-astra',jobId:'7a140002-2b11-4d33-8c44-000000000101',ceilingUsd:2.00,pricing:{revision:'studio-pricing-v1',tier:'standard',points:250,maxProviderCents:200},prompt:'Create one very simple complete 3D calibration pedestal: a low dark stone square base, one bronze ring, one glowing green crystal cube, and four short symmetric supports. Clean PBR materials, no text, no environment, game-ready GLB. Keep the build compact and finish after required inspection.'},
  {name:'sol-standard',model:'sol',provider:'gpt-6.1-sol',jobId:'7a140002-2b11-4d33-8c44-000000000102',ceilingUsd:0.35,prompt:'Create one very simple complete 3D calibration pedestal: a low dark stone square base, one bronze ring, one glowing blue crystal cube, and four short symmetric supports. Clean PBR materials, no text, no environment, game-ready GLB. Keep the build compact and finish after required inspection.'},
  {name:'luna-standard',model:'luna',provider:'gpt-6-luna',jobId:'7a140002-2b11-4d33-8c44-000000000103',ceilingUsd:0.10,prompt:'Create one very simple complete 3D calibration pedestal: a low dark stone square base, one bronze ring, one glowing purple crystal cube, and four short symmetric supports. Clean PBR materials, no text, no environment, game-ready GLB. Keep the build compact and finish after required inspection.'},
])
const TOTAL=JOBS.reduce((n,j)=>n+j.ceilingUsd,0)
if (Math.abs(TOTAL-2.45)>1e-9) throw new Error('COST_ENVELOPE_CHANGED')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const hash=b=>createHash('sha256').update(b).digest('hex')
const terminal=new Set(['succeeded','failed','cancelled'])
const origin=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('INVALID_ORACLE_ENDPOINT');return u.origin}
async function bounded(response,max=50_000_000){if(!response.ok)throw new Error('HTTP_'+response.status);const b=Buffer.from(await response.arrayBuffer());if(!b.length||b.length>max)throw new Error('INVALID_BODY_SIZE');return b}
async function j(response,max=262144){const b=await bounded(response,max);if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('JSON_REQUIRED');return JSON.parse(b.toString())}
async function claim(env){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||!env.GITHUB_TOKEN)throw new Error('GITHUB_APPROVAL_CONFIG')
  const r=await fetch('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})})
  if(r.status!==201){await r.body?.cancel();throw new Error('APPROVAL_ALREADY_CLAIMED_NO_RETRY')}
  const x=await j(r,32768);if(x.ref!=='refs/tags/'+APPROVAL||x.object?.sha!==env.GITHUB_SHA)throw new Error('APPROVAL_NOT_CONFIRMED')
}
function agentInstructions(provider){return `WORLDIFACT production repeatability acceptance for ${provider}. Build exactly one compact 3D object. Use the supervised Blender MCP contract, inspect the current model, finish once, export the actual GLB. Do not start any other job, do not retry uncertain provider work, and do not claim MAKE validation.`}
async function call(base,token,path,init={},timeout=30000){return fetch(base+path,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),headers:{Authorization:'Bearer '+token,'X-WORLDIFACT-Owner':OWNER,'X-WORLDIFACT-Fingerprint':FINGERPRINT,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}})}
async function runOne(base,token,spec,out){
  const pre=await call(base,token,'/v1/jobs/'+spec.jobId)
  if(pre.status!==404){await pre.body?.cancel();throw new Error(spec.name.toUpperCase()+'_JOB_ALREADY_EXISTS_NO_RETRY')}
  await pre.body?.cancel()
  const payload={id:spec.jobId,prompt:spec.prompt,agentInstructions:agentInstructions(spec.provider),...(spec.pricing?{studioPricing:spec.pricing}:{studioExecution:{revision:'studio-execution-v1',model:spec.model,mode:'standard'}})}
  const staged=await call(base,token,'/v1/jobs/stage',{method:'POST',body:JSON.stringify(payload)})
  if(staged.status!==202){const s=staged.status;await staged.body?.cancel();throw new Error(spec.name.toUpperCase()+'_STAGE_'+s)}
  const stage=await j(staged,32768),receipt=stage.admission
  if(!receipt||receipt.id!==spec.jobId||!/^[a-f0-9]{64}$/.test(receipt.payloadSha256||''))throw new Error(spec.name.toUpperCase()+'_STAGE_RECEIPT_INVALID')
  const started=await call(base,token,'/v1/jobs/start',{method:'POST',body:JSON.stringify({id:spec.jobId,payloadSha256:receipt.payloadSha256,deadline:Date.now()+120000})})
  if(started.status!==202){const s=started.status;await started.body?.cancel();throw new Error(spec.name.toUpperCase()+'_START_'+s)}
  await started.body?.cancel()
  let job
  for(let n=0;n<120;n++){
    await sleep(n?10000:2500)
    const r=await call(base,token,'/v1/jobs/'+spec.jobId,{},30000)
    if(r.status!==200){const s=r.status;await r.body?.cancel();throw new Error(spec.name.toUpperCase()+'_READ_'+s)}
    job=await j(r,32768)
    if(job.id!==spec.jobId||typeof job.state!=='string')throw new Error(spec.name.toUpperCase()+'_IDENTITY')
    if(terminal.has(job.state))break
    if(n%6===0)console.log(spec.name,'state',job.state)
  }
  if(job?.state!=='succeeded')throw new Error(spec.name.toUpperCase()+'_NOT_SUCCEEDED_'+String(job?.state))
  const model=await call(base,token,'/v1/jobs/'+spec.jobId+'/model',{},180000)
  const glb=await bounded(model)
  if(glb.length<20||glb.subarray(0,4).toString('ascii')!=='glTF'||glb.readUInt32LE(4)!==2||glb.readUInt32LE(8)!==glb.length)throw new Error(spec.name.toUpperCase()+'_INVALID_GLB')
  await writeFile(out+'/'+spec.name+'.glb',glb)
  const value={status:'PASSED',name:spec.name,jobId:spec.jobId,model:spec.provider,mode:'standard',maximumProviderUsd:spec.ceilingUsd,bytes:glb.length,sha256:hash(glb),state:job.state}
  console.log(JSON.stringify(value));return value
}
const env=process.env
if(env.WORLDIFACT_SLOW_REPEATABILITY_APPROVAL!=='SLOW_REPEATABILITY_TIERED_ONCE_20261014'||env.GITHUB_RUN_ATTEMPT!=='1')throw new Error('APPROVAL_MISSING')
if(!env.ORACLE_ENDPOINT||!env.ORACLE_API_TOKEN)throw new Error('ORACLE_CONFIG_MISSING')
const base=origin(env.ORACLE_ENDPOINT),out='slow-repeatability-evidence'
await mkdir(out,{recursive:true})
await claim(env)
const report={approval:APPROVAL,startedAt:new Date().toISOString(),automaticRetries:0,maximumCombinedProviderUsd:TOTAL,results:[]}
for(const spec of JOBS){
  try{report.results.push(await runOne(base,env.ORACLE_API_TOKEN,spec,out));await writeFile(out+'/report.json',JSON.stringify(report,null,2))}
  catch(e){const fail={status:'FAILED',name:spec.name,reason:String(e?.message||'UNKNOWN').slice(0,180)};report.results.push(fail);await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.error(JSON.stringify(fail));process.exit(1)}
}
report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
