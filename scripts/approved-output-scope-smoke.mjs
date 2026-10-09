/** One new owner-approved $1.75 test, never a retry of an earlier paid approval.
 * Uses the exact production Shop adapter and original authenticated Oracle.
 * It does not impersonate a customer or alter any points, billing or library row.
 */
import {mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {setTimeout as pause} from 'node:timers/promises'
import {oracleStudioPayload,validateStudioInput} from '../src/lib/studioProtocol.ts'
import {inspectGLB} from '../src/lib/glb.ts'
import {oracleOrigin} from '../server/platform.ts'
import {checkAstraRuntime} from './check-astra-runtime.mjs'

export const SOURCE='49a02609a3730976ec0744ecf01877d1fbf16859'
export const APPROVAL='worldifact-output-scope-smoke-20261010-once'
export const JOB='38c71530-2bc8-42ca-823c-e91be4f01b7a'
export const MAX_COST_USD=1.75
const SHA=/^[a-f0-9]{64}$/
const STATES=new Set(['queued','generating','retrying','building','succeeded','failed','cancelled'])
const FAILURES=new Set(['complete_scene_not_supported','typed_complete_scene_required','fresh_construction_job_required','WORLDIFACT_CONSTRUCTION_INCOMPLETE','CODEX_UNAVAILABLE','CODEX_TOOLS_MISSING','FORGE_JOB_BUDGET'])
const hash=b=>createHash('sha256').update(b).digest('hex')
export function testInput(){return validateStudioInput({worldId:'enchanted-ai-shop',purpose:'object',textureMaxSize:2048,photos:[],prompt:'Create one complete freestanding industrial MCC electrical cabinet as an editable digital game asset, about 1.2 m wide, 2 m tall and 0.5 m deep. Its single hinged door is open approximately 100 degrees. Include a recessed backplate, three DIN rails with distinct circuit breakers, contactors, relays and PLC modules, a small HMI screen, red and green pushbuttons, a fan grille, slotted cable ducts and a bottom terminal strip. Model at least eight visibly routed cylindrical wires. Components must have real projecting 3D bodies and not be a photo on a plane. Use gray metal, off-white devices, dark terminals and colored wires. Build the complete cabinet in the first scene using the supported geometry and optional bounded initial edit. Inspect the actual front, side, back and three-quarter renders and finish the accepted result. Export a self-contained GLB. No room, background scene, brands, text labels or extra cabinet. Digital GAME output only; manufacturing and electrical safety are not validated. Keep the existing USD 1.75 budget and never start another job.'})}
export async function bytes(response,max=65536){
  if(!response.ok)throw Error('HTTP_NOT_OK')
  const n=Number(response.headers.get('content-length')||0)
  if(!Number.isFinite(n)||n<0||n>max)throw Error('RESPONSE_SIZE_INVALID')
  const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_BODY')
  const chunks=[];let length=0
  try {for(;;){const v=await reader.read();if(v.done)break;length+=v.value.byteLength;if(length>max)throw Error('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(v.value))}}
  finally {await reader.cancel().catch(()=>{})}
  if(n&&n!==length)throw Error('RESPONSE_INCOMPLETE')
  return Buffer.concat(chunks,length)
}
async function json(r,max){if(!r.headers.get('content-type')?.includes('application/json'))throw Error('JSON_REQUIRED');return JSON.parse((await bytes(r,max)).toString())}
export function validateEnvelope(value){if(value?.id!==JOB||!STATES.has(value?.state))throw Error('JOB_IDENTITY_INVALID');return value}
export async function claim(env,fetcher=fetch){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||!env.GITHUB_TOKEN||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('APPROVAL_ENV_INVALID')
  const r=await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})})
  if(r.status!==201){await r.body?.cancel();throw Error('APPROVAL_ALREADY_CLAIMED_OR_UNAVAILABLE')}
  const v=await json(r,16384);if(v.ref!=='refs/tags/'+APPROVAL||v.object?.sha!==env.GITHUB_SHA)throw Error('APPROVAL_NOT_CONFIRMED')
}
export async function run(env,{fetcher=fetch,wait=pause,save=async()=>{},persist=async()=>{},now=Date.now}={}){
  const report={sourceCommit:SOURCE,approval:APPROVAL,jobId:JOB,checkedAt:new Date(now()).toISOString(),maximumProviderUsd:MAX_COST_USD,dispatchAttempts:0,automaticResubmissions:0,customerFinancialOperations:0,actualCostUsd:null,signedInShopFlowVerified:false,accountLibrarySaveVerified:false,status:'NOT_STARTED'}
  const checkpoint=async()=>save({...report})
  try {
    if(env.WORLDIFACT_TEST_APPROVAL!==APPROVAL||env.GITHUB_RUN_ATTEMPT!=='1'||now()>Date.parse('2026-10-11T00:00:00Z'))throw Error('APPROVAL_MISSING_OR_EXPIRED')
    const origin=oracleOrigin(env.ORACLE_ENDPOINT);if(!origin)throw Error('ORACLE_ORIGIN_INVALID')
    const input=testInput(),payload=oracleStudioPayload(JOB,input)
    if('studioPricing' in payload||payload.generationProfile||payload.agentInstructions.includes('resin-print candidates'))throw Error('EXACT_LEGACY175_DIGITAL_SCOPE_REQUIRED')
    await checkAstraRuntime(env,fetcher,now())
    const call=(path,body)=>fetcher(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(body?45000:60000),headers:{Authorization:'Bearer '+env.ORACLE_API_TOKEN,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
    const prior=await call('/v1/jobs/'+JOB)
    if(prior.status!==404){await prior.body?.cancel();throw Error('JOB_ALREADY_EXISTS_NO_RESUBMISSION')}
    await prior.body?.cancel()
    await claim(env,fetcher)
    report.status='DISPATCHING';report.dispatchAttempts=1;await checkpoint()
    let current
    try {const posted=await call('/v1/jobs',payload);if(![200,201,202].includes(posted.status)){await posted.body?.cancel();throw Error()};current=validateEnvelope(await json(posted,65536))}
    catch {report.status='SUBMISSION_UNCERTAIN';await checkpoint();current=validateEnvelope(await json(await call('/v1/jobs/'+JOB),65536))}
    const deadline=now()+32*60*1000
    for(let i=0;i<192&&!['succeeded','failed','cancelled'].includes(current.state)&&now()<deadline;i++){
      report.status='RUNNING';report.workerState=current.state;await checkpoint();await wait(10000)
      const response=await call('/v1/jobs/'+JOB)
      if(response.status===429){await response.body?.cancel();continue}
      current=validateEnvelope(await json(response,65536))
    }
    report.workerState=current.state
    if(current.state!=='succeeded'){report.status=['failed','cancelled'].includes(current.state)?'MODEL_FAILED':'RESULT_UNCONFIRMED';report.reason=FAILURES.has(current.detail)?current.detail:'MODEL_NOT_COMPLETED';await checkpoint();return report}
    if(current.modelStatus!=='reviewed'||!SHA.test(current.modelSha256||''))throw Error('REVIEWED_MODEL_NOT_CONFIRMED')
    const quality=await json(await call('/v1/jobs/'+JOB+'/quality'),262144)
    if(quality.modelStatus!=='reviewed'||quality.modelSha256!==current.modelSha256||quality.acceptanceGate?.passed!==true)throw Error('HOST_QUALITY_NOT_CONFIRMED')
    const model=await bytes(await call('/v1/jobs/'+JOB+'/model'),50000000)
    const inspection=inspectGLB(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength))
    if(hash(model)!==current.modelSha256||inspection.triangles<1000||inspection.meshCount<12||inspection.materialCount<4)throw Error('MCC_MODEL_INTEGRITY_OR_COMPLEXITY_FAILED')
    await persist('mcc.glb',model)
    // Same artifact twice: verifies retrieval consistency, never dispatches again.
    const retrieved=await bytes(await call('/v1/jobs/'+JOB+'/model'),50000000)
    if(hash(retrieved)!==hash(model))throw Error('MODEL_DOWNLOAD_CHANGED')
    report.status='NEW_REVIEWED_GLB_VERIFIED';report.model={sha256:hash(model),...inspection};report.repeatDownloadMatched=true;report.hostRenderedReview=true;await checkpoint();return report
  } catch(error){report.status=report.dispatchAttempts?'TEST_INCOMPLETE_NO_RESUBMISSION':'STOPPED_BEFORE_DISPATCH';report.reason=typeof error?.message==='string'&&/^[A-Z0-9_]{1,90}$/.test(error.message)?error.message:'TEST_ERROR_PRIVATE_DETAILS_OMITTED';await checkpoint();return report}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const folder='live-smoke-evidence';await mkdir(folder,{recursive:true})
  const save=r=>writeFile(folder+'/report.json',JSON.stringify(r,null,2)+'\n')
  const result=await run(process.env,{save,persist:(name,data)=>writeFile(folder+'/'+name,data,{flag:'wx'})})
  console.log(JSON.stringify(result,null,2));if(result.status!=='NEW_REVIEWED_GLB_VERIFIED')process.exitCode=1
}
