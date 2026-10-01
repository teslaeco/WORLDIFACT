/** Owner-approved 2026-10-01: exactly one live GPT-6 Astra -> Oracle/Blender character job.
 * Maximum provider reservation: USD 1.75. No retries, no customer checkout, no credit mutation.
 * The three chat reference images are intentionally NOT committed to this public repository.
 * Their visual content is converted into the fixed written design brief below.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { boundedBytes } from './approved-model-test.mjs'
import { inspectGLB } from '../src/lib/glb.ts'
import { oracleStudioPayload, validateStudioInput } from '../src/lib/studioProtocol.ts'
import { oracleOrigin } from '../server/platform.ts'
import { checkAstraRuntime } from './check-astra-runtime.mjs'

export const APPROVAL='worldifact-terraforming-heroine-20261001-once'
export const JOB_ID='a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781'
export const CAP_USD=1.75
export const APPROVAL_ENV='ASTRA175_TERRAFORMING_HEROINE_ONCE'
const allowedStates=new Set(['queued','generating','retrying','building','succeeded','failed','cancelled'])
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')

export const CHARACTER_PROMPT=`Create ONE premium full-body adult female sci-fi heroine for the TerraformingPlanet / WORLDIFACT game world. Build an actual 3D character, never a billboard, card, relief, mannequin substitute, environment-only scene, or floating hologram.

Identity and silhouette: elegant adult woman, friendly confident expression, slim athletic proportions, realistic stylized anatomy, silver-white hair in a voluminous messy bun with loose face-framing strands and a small black/cyan hair clip. Preserve the recognizable silhouette: fitted black high-neck inner suit; long open pearl-white futuristic coat with wide sleeves, black hood/shoulder insert, split coat tails, and translucent ice-cyan panels; white cargo pants with black side inserts, thigh pockets, belt, hanging utility straps; chunky white/black high-top sneakers with cyan luminous accents. Add small cyan geometric knot emblems on the chest, coat/back, belt and footwear as clean costume graphics.

IMPORTANT: both hands must be empty. Remove the glowing orb, hologram, orbit rings, particles and any hand-held prop entirely. Do not model a black background. The character itself is the main deliverable.

Quality: prioritize facial anatomy, eyes, mouth, nose, ears, hands with five separated fingers, feet, shoes, hair volume and garment layering. No fused limbs, intersecting clothing, missing back geometry or collapsed fingers. Use clean closed geometry suitable for game use and future rigging. Separate major clothing/hair/accessory parts where practical. Preserve 360-degree continuity, including the back and side silhouettes. Materials must visibly distinguish skin, hair, matte/stretch fabric, coated textile, rubber, metal/plastic hardware and translucent cyan panels. Use PBR materials and UVs. Keep emissive cyan accents subtle and localized; do not bake scene lighting into base color.

GAME target: a visually rich hero asset with sensible topology and scale around 1.75-1.80 m tall, centered at world origin, upright neutral A/T-ready stance with feet grounded and arms slightly away from torso. If the pipeline can rig reliably, produce a clean humanoid rig; otherwise prefer an excellent static full-body mesh over a broken rig. Do not add scenery that steals geometry budget from the character.

TerraformingPlanet placement intent: this heroine will appear in the green valley hub as a premium in-world character. Her palette is white, black, pearl silver and cyan so she reads clearly against grass, water and mountains. Keep the result original and production-quality in appearance while staying faithful to this design brief.

Export the real model and complete the normal reviewed GAME outputs: GLB with embedded/available materials, FBX, BLEND and PBR textures when supported. MAKE remains validation-required and must not be described as manufacturing-approved.`

export function buildInput(){
  return validateStudioInput({
    worldId:'ai-game-lab',
    purpose:'game',
    textureMaxSize:8192,
    photos:[],
    prompt:CHARACTER_PROMPT
  })
}

async function json(response,maximum=1000000){
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('JSON_REQUIRED')
  return JSON.parse((await boundedBytes(response,maximum)).toString('utf8'))
}

export async function claimApproval(env,fetcher=fetch){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')||!env.GITHUB_TOKEN) throw new Error('APPROVAL_CONFIGURATION_MISSING')
  const response=await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})
  })
  if(response.status!==201){await response.body?.cancel();throw new Error('APPROVAL_ALREADY_CLAIMED_OR_UNAVAILABLE_NO_RETRY')}
  const value=await json(response,16384)
  if(value.ref!=='refs/tags/'+APPROVAL||value.object?.sha!==env.GITHUB_SHA) throw new Error('APPROVAL_NOT_CONFIRMED')
}

export async function runAstra(env,output,fetcher=fetch,wait=sleep){
  await checkAstraRuntime(env,fetcher)
  const origin=oracleOrigin(env.ORACLE_ENDPOINT)
  if(!origin||!env.ORACLE_API_TOKEN) throw new Error('ORACLE_NOT_CONFIGURED')
  const call=(path,init={},timeout=30000)=>fetcher(origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{Authorization:'Bearer '+env.ORACLE_API_TOKEN,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})}})
  const existing=await call('/v1/jobs/'+JOB_ID)
  if(existing.status!==404){await existing.body?.cancel();throw new Error('JOB_ALREADY_EXISTS_NO_SECOND_SUBMISSION')}
  await existing.body?.cancel()

  const input=buildInput()
  const submit=await call('/v1/jobs',{method:'POST',body:JSON.stringify(oracleStudioPayload(JOB_ID,input))})
  if(![200,201,202].includes(submit.status)){await submit.body?.cancel();throw new Error('SUBMISSION_NOT_CONFIRMED_NO_RETRY')}
  let job=await json(submit,65536)
  for(let poll=0;poll<90;poll++){
    if(job.id!==JOB_ID||!allowedStates.has(job.state)) throw new Error('JOB_IDENTITY_INVALID')
    if(['succeeded','failed','cancelled'].includes(job.state)) break
    if(poll%6===0) console.log('ASTRA heroine progress:',job.state,'; same job, no resubmission')
    await wait(10000)
    job=await json(await call('/v1/jobs/'+JOB_ID),65536)
  }
  if(job.state!=='succeeded'){
    const detail=String(job.detail||'')
    const known=['WORLDIFACT_ASTRA_COST_GUARD','FORGE_JOB_BUDGET','CODEX_TOOLS_MISSING','OPENAI_HTTP_429'].find(code=>detail.includes(code))
    return {status:'FAILED',state:job.state,jobId:JOB_ID,submittedJobs:1,ceilingUsd:CAP_USD,reason:known||'MODEL_DID_NOT_FINISH',actualCostUsd:null}
  }

  const exports={}
  for(const [name,route,limit] of [['glb','model',50_000_000],['fbx','exports/fbx',50_000_000],['blend','exports/blend',80_000_000],['pbr','exports/pbr',80_000_000]]){
    try{
      const bytes=await boundedBytes(await call('/v1/jobs/'+JOB_ID+'/'+route,{},180000),limit)
      if(name==='glb'){
        const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
        const inspection=inspectGLB(buffer)
        if((inspection.triangles??0)<10000||(inspection.materialCount??0)<2) throw new Error('CHARACTER_GLB_TOO_SIMPLE')
        exports[name]={bytes:bytes.length,sha256:hash(bytes),inspection}
      }else{
        if(bytes.length<16||/^\s*[{<]/.test(bytes.subarray(0,16).toString())) throw new Error('INVALID_EXPORT')
        exports[name]={bytes:bytes.length,sha256:hash(bytes)}
      }
      await writeFile(output+'/terraforming-heroine.'+(name==='pbr'?'textures.zip':name),bytes)
    }catch{exports[name]={status:'FAILED'}}
  }
  return {status:exports.glb?.status?'FAILED':'PASSED',model:'gpt-6-astra',jobId:JOB_ID,submittedJobs:1,ceilingUsd:CAP_USD,
    exports,visualQuality:'REQUIRES_HUMAN_REVIEW',referenceTransport:'CHAT_REFERENCES_NOT_PUBLISHED; FIXED_VISUAL_BRIEF_USED',actualCostUsd:null,
    worldTarget:'TerraformingPlanet green valley hub'}
}

async function main(){
  const env=process.env
  if(env.WORLDIFACT_PAID_TEST_APPROVAL!==APPROVAL_ENV||env.GITHUB_RUN_ATTEMPT!=='1'||Date.now()>Date.parse('2026-10-02T08:00:00Z')) throw new Error('APPROVAL_MISSING_OR_EXPIRED')
  const output='terraforming-heroine-evidence';await mkdir(output,{recursive:true})
  await checkAstraRuntime(env)
  await claimApproval(env)
  const report={approval:APPROVAL,checkedAt:new Date().toISOString(),maximumProviderReservationUsd:CAP_USD,automaticRetries:0,customerCharges:0,
    commercialActivation:'UNCHANGED',paymentSettingsChanged:false,result:null}
  try{report.result=await runAstra(env,output)}
  catch(error){report.result={status:'FAILED',reason:/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'TEST_FAILED_NO_RETRY'}}
  await writeFile(output+'/report.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
  if(report.result.status!=='PASSED') process.exitCode=1
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'TEST_STOPPED_NO_RETRY');process.exitCode=1})
}
