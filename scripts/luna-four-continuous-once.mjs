import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const APPROVAL = 'worldifact-luna-four-continuous-20261014-v1'
const JOBS = Object.freeze([
  ['luna-1','5f017611-1d33-4e9a-8b3d-02f4c6d47101','blue-green'],
  ['luna-2','5f017611-1d33-4e9a-8b3d-02f4c6d47102','violet-amber'],
  ['luna-3','5f017611-1d33-4e9a-8b3d-02f4c6d47103','red-cyan'],
  ['luna-4','5f017611-1d33-4e9a-8b3d-02f4c6d47104','white-gold'],
].map(([name,jobId,accent])=>({name,jobId,accent,model:'luna',provider:'gpt-6-luna',ceilingUsd:0.10})))
const OWNER=createHash('sha256').update(APPROVAL+':owner').digest('hex')
const FINGERPRINT=createHash('sha256').update(APPROVAL+':fingerprint').digest('hex')
const terminal=new Set(['succeeded','failed','cancelled'])
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const hash=b=>createHash('sha256').update(b).digest('hex')

function origin(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('INVALID_ORACLE_ENDPOINT');return u.origin}
async function bounded(response,max=50_000_000){if(!response.ok)throw new Error('HTTP_'+response.status);const b=Buffer.from(await response.arrayBuffer());if(!b.length||b.length>max)throw new Error('INVALID_BODY_SIZE');return b}
async function json(response,max=262144){const b=await bounded(response,max);if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('JSON_REQUIRED');return JSON.parse(b.toString())}
async function claim(env){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||!env.GITHUB_TOKEN)throw new Error('GITHUB_APPROVAL_CONFIG')
  const r=await fetch('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})})
  if(r.status!==201){await r.body?.cancel();throw new Error('APPROVAL_ALREADY_CLAIMED_NO_RETRY')}
  const x=await json(r,32768);if(x.ref!=='refs/tags/'+APPROVAL||x.object?.sha!==env.GITHUB_SHA)throw new Error('APPROVAL_NOT_CONFIRMED')
}
function instructions(){return `WORLDIFACT continuous-generation acceptance. Build exactly one compact complete 3D object. Use the supervised Blender MCP contract: get_modeling_contract once, build one complete scene, inspect front/side/back/three-quarter, get_current_model summary, then finish_model once. Keep geometry/materials compact. Export the actual self-contained GLB. Do not retry provider execution if anything becomes uncertain. GAME asset only; MAKE is not validated.`}
async function call(base,token,path,init={},timeout=30000){return fetch(base+path,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),headers:{Authorization:'Bearer '+token,'X-WORLDIFACT-Owner':OWNER,'X-WORLDIFACT-Fingerprint':FINGERPRINT,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}})}
async function runOne(base,token,spec,out){
  const pre=await call(base,token,'/v1/jobs/'+spec.jobId);if(pre.status!==404){await pre.body?.cancel();throw new Error(spec.name.toUpperCase()+'_EXISTS_NO_RETRY')}await pre.body?.cancel()
  const payload={id:spec.jobId,prompt:`Create one compact premium 3D stone pedestal with two stacked geometric blocks, rounded bevels, realistic dark stone PBR material, and a thin ${spec.accent} emissive accent strip. No text, no environment, no people. Keep it simple, fully 3D, and game-ready.`,agentInstructions:instructions(),studioExecution:{revision:'studio-execution-v1',model:'luna',mode:'standard'}}
  const stage=await call(base,token,'/v1/jobs/stage',{method:'POST',body:JSON.stringify(payload)});if(stage.status!==202){const s=stage.status;await stage.body?.cancel();throw new Error(spec.name.toUpperCase()+'_STAGE_'+s)}
  const sb=await json(stage,32768),receipt=sb.admission;if(!receipt||receipt.id!==spec.jobId||!/^[a-f0-9]{64}$/.test(receipt.payloadSha256||''))throw new Error(spec.name.toUpperCase()+'_STAGE_RECEIPT_INVALID')
  const start=await call(base,token,'/v1/jobs/start',{method:'POST',body:JSON.stringify({id:spec.jobId,payloadSha256:receipt.payloadSha256,deadline:Date.now()+120000})});if(start.status!==202){const s=start.status;await start.body?.cancel();throw new Error(spec.name.toUpperCase()+'_START_'+s)}await start.body?.cancel()
  let job
  for(let n=0;n<72;n++){await sleep(n?10000:2500);const r=await call(base,token,'/v1/jobs/'+spec.jobId,{},30000);if(r.status!==200){const s=r.status;await r.body?.cancel();throw new Error(spec.name.toUpperCase()+'_READ_'+s)}job=await json(r,32768);if(job.id!==spec.jobId||typeof job.state!=='string')throw new Error(spec.name.toUpperCase()+'_IDENTITY');if(terminal.has(job.state))break;if(n%6===0)console.log(spec.name,'state',job.state)}
  if(job?.state!=='succeeded')throw new Error(spec.name.toUpperCase()+'_NOT_SUCCEEDED_'+String(job?.state))
  const model=await call(base,token,'/v1/jobs/'+spec.jobId+'/model',{},180000),glb=await bounded(model)
  if(glb.length<20||glb.subarray(0,4).toString('ascii')!=='glTF'||glb.readUInt32LE(4)!==2||glb.readUInt32LE(8)!==glb.length)throw new Error(spec.name.toUpperCase()+'_INVALID_GLB')
  await writeFile(out+'/'+spec.name+'.glb',glb)
  return {status:'PASSED',jobId:spec.jobId,sequence:JOBS.indexOf(spec)+1,model:'gpt-6-luna',mode:'standard',maximumProviderUsd:0.10,bytes:glb.length,sha256:hash(glb),state:job.state}
}

const env=process.env
if(env.WORLDIFACT_LUNA_FOUR_APPROVAL!=='LUNA_FOUR_ONCE_20261014'||env.GITHUB_RUN_ATTEMPT!=='1')throw new Error('APPROVAL_MISSING')
if(!env.ORACLE_ENDPOINT||!env.ORACLE_API_TOKEN)throw new Error('ORACLE_CONFIG_MISSING')
const base=origin(env.ORACLE_ENDPOINT),out='luna-four-evidence';await mkdir(out,{recursive:true});await claim(env)
const report={approval:APPROVAL,startedAt:new Date().toISOString(),automaticRetries:0,maximumCombinedProviderUsd:0.40,results:[]}
for(const spec of JOBS){try{const result=await runOne(base,env.ORACLE_API_TOKEN,spec,out);report.results.push(result);console.log(JSON.stringify(result))}catch(e){const fail={status:'FAILED',name:spec.name,reason:String(e?.message||'UNKNOWN').slice(0,180)};report.results.push(fail);await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.error(JSON.stringify(fail));process.exit(1)}}
report.finishedAt=new Date().toISOString();report.fourthSucceeded=report.results.length===4&&report.results[3]?.status==='PASSED';await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
