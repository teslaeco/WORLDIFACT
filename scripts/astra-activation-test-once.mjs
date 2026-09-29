/** Owner-approved 2026-09-29 commercial Astra activation test.
 * Exactly one new Oracle/Astra job, max provider reservation USD 1.75, no retry.
 * This test never creates a Stripe checkout or customer charge.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inspectGLB } from '../src/lib/glb.ts'
import { oracleStudioPayload, validateStudioInput } from '../src/lib/studioProtocol.ts'
import { oracleOrigin } from '../server/platform.ts'
import { checkAstraRuntime } from './check-astra-runtime.mjs'

const APPROVAL='worldifact-astra-activation-check-20260929-v1'
const JOB='86002e5b-5a9e-42c0-ae18-c10e2a54ca90'
const MAX_USD=1.75
const terminal=new Set(['succeeded','failed','cancelled'])
const allowed=new Set(['queued','generating','retrying','building','succeeded','failed','cancelled'])
const hash=b=>createHash('sha256').update(b).digest('hex')

async function bounded(response, maximum=50_000_000){
  if(!response.ok || Number(response.headers.get('content-length')||0)>maximum) throw new Error('ARTIFACT_NOT_AVAILABLE')
  const reader=response.body?.getReader(); if(!reader) throw new Error('ARTIFACT_EMPTY')
  const chunks=[]; let size=0
  try{
    for(;;){const item=await reader.read(); if(item.done) break; size+=item.value.byteLength; if(size>maximum) throw new Error('ARTIFACT_TOO_LARGE'); chunks.push(Buffer.from(item.value))}
  } finally { await reader.cancel().catch(()=>{}) }
  return Buffer.concat(chunks,size)
}
async function json(response){
  if(!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('ORACLE_RESPONSE_INVALID')
  return JSON.parse((await bounded(response,1_000_000)).toString('utf8'))
}
async function claim(env, fetcher=fetch){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT' || !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'') || !env.GITHUB_TOKEN) throw new Error('APPROVAL_CONFIGURATION_MISSING')
  const response=await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})
  })
  if(response.status!==201){await response.body?.cancel(); throw new Error('APPROVAL_ALREADY_CLAIMED_OR_UNAVAILABLE_NO_RETRY')}
  await response.body?.cancel()
}
async function main(){
  const env=process.env
  if(env.WORLDIFACT_ASTRA_ACTIVATION_APPROVAL!=='ASTRA175_ACTIVATION_ONCE' || env.GITHUB_RUN_ATTEMPT!=='1') throw new Error('APPROVAL_MISSING')
  const output='astra-activation-evidence'; await mkdir(output,{recursive:true})
  const runtime=await checkAstraRuntime(env)
  if(runtime.maxProviderUsdPerJob!==MAX_USD || runtime.model!=='gpt-6-astra') throw new Error('ASTRA_RUNTIME_COST_GUARD_INVALID')
  await claim(env)
  const origin=oracleOrigin(env.ORACLE_ENDPOINT); if(!origin) throw new Error('ORACLE_NOT_CONFIGURED')
  const call=(path,init={},timeout=30000)=>fetch(origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{Authorization:'Bearer '+env.ORACLE_API_TOKEN,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})}})
  const prior=await call('/v1/jobs/'+JOB)
  if(prior.status!==404){await prior.body?.cancel(); throw new Error('ASTRA_JOB_ALREADY_EXISTS_NO_RETRY')}
  await prior.body?.cancel()

  const input=validateStudioInput({
    worldId:'enchanted-ai-shop',purpose:'object',textureMaxSize:2048,photos:[],
    prompt:'Create one compact realistic teal industrial inspection robot for a 3D game asset. Separate head, torso, two arms and two legs; stable proportions; clean watertight-looking hard-surface geometry; matte teal painted metal, dark rubber joints, two amber indicator lights. No text, people, background, room or extra objects. Keep the workflow concise: build one complete model, review only what is necessary, then export the actual self-contained GLB. Clearly mark MAKE as validation required.'
  })
  const submitted=await call('/v1/jobs',{method:'POST',body:JSON.stringify(oracleStudioPayload(JOB,input))})
  if(![200,201,202].includes(submitted.status)){await submitted.body?.cancel(); throw new Error('ASTRA_SUBMISSION_NOT_CONFIRMED_NO_RETRY')}
  let job=await json(submitted)
  for(let poll=0;poll<72;poll++){
    if(job.id!==JOB || !allowed.has(job.state)) throw new Error('ASTRA_JOB_IDENTITY_INVALID')
    if(terminal.has(job.state)) break
    await new Promise(resolve=>setTimeout(resolve,10000))
    job=await json(await call('/v1/jobs/'+JOB))
  }
  const report={approval:APPROVAL,jobId:JOB,checkedAt:new Date().toISOString(),ceilingUsd:MAX_USD,submittedJobs:1,automaticRetries:0,runtime,state:job.state,glb:null}
  if(job.state!=='succeeded'){await writeFile(output+'/report.json',JSON.stringify(report,null,2)); throw new Error('ASTRA_JOB_DID_NOT_SUCCEED_NO_RETRY')}
  const glb=await bounded(await call('/v1/jobs/'+JOB+'/model',{},180000))
  const inspection=inspectGLB(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength))
  if(!inspection.triangles || !inspection.materialCount) throw new Error('ASTRA_GLB_VALIDATION_FAILED')
  report.glb={bytes:glb.length,sha256:hash(glb),inspection}
  await writeFile(output+'/astra.glb',glb)
  await writeFile(output+'/report.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify({status:'PASSED',commercialActivationCandidate:true,ceilingUsd:MAX_USD,submittedJobs:1,automaticRetries:0,glb:report.glb},null,2))
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'ASTRA_ACTIVATION_TEST_FAILED_NO_RETRY');process.exitCode=1})
