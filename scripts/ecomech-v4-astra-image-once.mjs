/**
 * ECOMECH real-Astra one-shot. Never call this from a browser.
 * Initial "probe" mode only reads live Oracle health and existing job status.
 * The irreversible "run" requires a separate, exact owner-approved marker,
 * a permanent Git tag claim, and the verified immutable $1.75 Oracle cap.
 * NO customer credit ledger, no retries, no automatic provider switching.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { checkAstraRuntime } from './check-astra-runtime.mjs'
import { oracleOrigin } from '../server/platform.ts'
import { MODEL_CATALOG } from '../src/lib/modelCatalog.ts'
import { validateStudioInput, oracleStudioPayload, validateOracleStudioPayload } from '../src/lib/studioProtocol.ts'
import { validateTerminalBudgetReceipt } from '../server/studioBudgetReceipt.ts'
import { inspectGLB } from '../src/lib/glb.ts'

export const JOB_ID = 'd3fc6e0f-6258-4a2d-9935-ae31b0048e61'
export const PROVIDER_MODEL = 'gpt-6-astra'
export const MAX_USD = 1.75
export const CLAIM_TAG = 'worldifact-ecomech-astra-one-job-20261015-image-v1'
export const EVIDENCE_DIR = 'ecomech-v4-image-evidence'
const EXEC = Object.freeze({ revision: 'studio-execution-v1', model: 'astra', mode: 'standard' })
const ORIGIN = 'https://worldifact.xodobrox.workers.dev'
const MAX_GLB = 48 * 1024 * 1024
const TERMINAL = new Set(['succeeded','failed','cancelled'])
const ALLOWED = new Set(['queued','generating','retrying','building',...TERMINAL])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

const PROMPT = [
  'Use the ATTACHED real image as the authoritative visual reference. Reproduce its exact large silhouette and proportions before adding details.',
  'The reference image shows a premium humanoid robot; the image must guide geometry and materials, NOT serve as a flat-plane photograph.',
  'The helmet, narrow waist, asymmetric half-open chest armor, mechanical right limbs, armored left limbs and chili-gripping hand must be recognizable.',
  'Never replace the reference with a generic smooth mannequin. The final answer must explicitly compare all recognizable features in an inspected image.',
  'Create a truly detailed original humanoid collectible industrial MECH: ECOMECH CHILI.',
  'Full-height adult-proportioned guardian robot; one half has precisely layered metallic emerald green and cobalt blue armor,',
  'the opposite half is visibly opened to expose convincing electric motors, copper stator windings, MCC-style contactors,',
  'relay modules, DIN rails, terminal blocks, servomotor shafts, bearings, pistons, joint gear housings, cable trunks and fasteners.',
  'A visibly large curved glossy GREEN CHILI PEPPER must be firmly grasped in its raised articulated HAND: three-dimensional',
  'pepper with a stem and taper, not a texture or a floating decoration.',
  'Faceplate is ORIGINAL with luminous cyan-blue eyes; abundant cyan and green LED light strips and glowing chest power core.',
  'No resemblance to franchise superhero suits, no weapon, no car conversion, no backdrop, pedestal or environment.',
  'Build both full feet, both legs, each finger/thumb, all physically plausible joints and torso; avoid low-poly box mannequin.',
  'Start with the complete hero silhouette and ALL required large geometric assemblies in FIRST scene build. Then add only',
  'affordable detail via supported real Blender/MCP tools: bevels, lathes, lofts, cylindrical coils, tubes and repeated plates.',
  'Separate the major ARMOR/MECH/CORE/CHILI subassemblies as editable objects. Use actual mesh depth for cutaways, ventilation,',
  'joints and engine housings, not flat photographs; multiple PBR materials plus UV only when really authored.',
  'Aim for strong silhouette, many distinct useful parts and high effective polygon detail but NEVER pad polygons or fake',
  'a million triangles. Work strictly inside the original provider budget; no other paid job, no repeated API request.',
  'Inspect original renders from front, side, back and three-quarter before finish_model. If budget runs out, report INCOMPLETE',
  'and retain the genuine last GLB. Do not certify 3D printing: MAKE requires supplier review of minimum walls/supports.',
].join(' ')

export function approvedMarker(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'approval,maxProviderUsd,mode,originalJobId,paidAttempts,validUntil' ||
      value.approval !== 'ECOMECH_V4_REFERENCE_SINGLE_TEST_20261015' ||
      value.originalJobId !== JOB_ID || value.mode !== 'astra-standard' ||
      value.maxProviderUsd !== MAX_USD || value.paidAttempts !== 1 ||
      typeof value.validUntil !== 'string' ||
      Date.parse(value.validUntil) <= now || Date.parse(value.validUntil) > Date.parse('2026-10-17T22:00:00Z'))
    throw Error('OWNER_APPROVAL_MARKER_INVALID_OR_EXPIRED')
  return true
}
export function validateCandidateGLB(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 40 || bytes.byteLength > MAX_GLB)
    throw Error('GLB_INVALID_LENGTH')
  const d = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  if (d.getUint32(0,true)!==0x46546c67 || d.getUint32(4,true)!==2 ||
      d.getUint32(8,true)!==bytes.byteLength || d.getUint32(16,true)!==0x4e4f534a)
    throw Error('GLB_INVALID_HEADER')
  const jslen=d.getUint32(12,true), bin=20+jslen
  if (jslen<4 || jslen%4 || bin+8>bytes.length ||
      d.getUint32(bin+4,true)!==0x004e4942 ||
      bin+8+d.getUint32(bin,true)!==bytes.length)
    throw Error('GLB_NO_EMBEDDED_BIN')
  const report=inspectGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
  if (!report.triangles || !report.renderedTriangles || !report.meshCount || !report.materialCount)
    throw Error('GLB_NO_SCENE_GEOMETRY')
  return {sha256:sha(bytes),bytes:bytes.length,triangles:report.triangles,
    renderedTriangles:report.renderedTriangles,meshes:report.meshCount,
    nodes:report.nodeCount,materials:report.materialCount,substantialMeshes:report.substantialMeshCount}
}
function oracle(env,fetcher=fetch){
  const endpoint=oracleOrigin(env.ORACLE_ENDPOINT),key=env.ORACLE_API_TOKEN
  if (!endpoint || typeof key!=='string' || key.length<32 || key.length>256) throw Error('ORACLE_NOT_CONFIGURED')
  return async (path,{method='GET',body}={})=>{
    if (!/^\/v1\/jobs(?:\/[a-f0-9-]+(?:\/(?:quality|model|budget))?)?$/.test(path))
      throw Error('ORACLE_ROUTE_NOT_ALLOWED')
    return fetcher(endpoint+path,{method,redirect:'error',signal:AbortSignal.timeout(method==='POST'?45_000:90_000),
      headers:{Authorization:'Bearer '+key,Accept:body?'application/json':'*/*',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})})
  }
}
async function readBounded(r,limit){
  if(!r.ok)throw Error('ORACLE_HTTP_'+r.status)
  const declared=Number(r.headers.get('content-length')||0)
  if(declared>limit)throw Error('PROVIDER_RESPONSE_TOO_LARGE')
  const reader=r.body?.getReader()
  if(!reader)throw Error('PROVIDER_BODY_MISSING')
  let size=0;const blocks=[]
  try{
    while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>limit)throw Error('PROVIDER_BODY_TOO_LARGE');blocks.push(v.value)}
  }finally{await reader.cancel().catch(()=>{})}
  if(declared && declared!==size)throw Error('PROVIDER_BODY_LENGTH_MISMATCH')
  const out=new Uint8Array(size);let i=0
  for(const block of blocks){out.set(block,i);i+=block.length}
  return out
}
async function json(r,limit=32768){
  if(!r.headers.get('content-type')?.includes('json')){await r.body?.cancel();throw Error('ORACLE_JSON_REQUIRED')}
  const value=JSON.parse(new TextDecoder().decode(await readBounded(r,limit)))
  if(!value || typeof value!=='object'||Array.isArray(value))throw Error('ORACLE_JSON_INVALID')
  return value
}
export async function claimOnce(env,fetcher=fetch){
  if(env.GITHUB_REF!=='refs/heads/feat/ecomech-v4-image-grounded-20261015' ||
      env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') || !env.GITHUB_TOKEN)
    throw Error('ONE_SHOT_GITHUB_CONTEXT_REQUIRED')
  const response=await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),
    headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,'Content-Type':'application/json',
      Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+CLAIM_TAG,sha:env.GITHUB_SHA})})
  if(response.status!==201){await response.body?.cancel();throw Error('TEST_ALREADY_CLAIMED_OR_UNAVAILABLE_NO_RETRY')}
  const value=await json(response)
  if(value.ref!=='refs/tags/'+CLAIM_TAG || value.object?.sha!==env.GITHUB_SHA)
    throw Error('PERMANENT_CLAIM_NOT_VERIFIED')
}
export async function probe(env,fetcher=fetch){
  const runtime=await checkAstraRuntime(env,fetcher)
  if(runtime.model!==PROVIDER_MODEL || runtime.maxProviderUsdPerJob!==MAX_USD ||
      MODEL_CATALOG.astra.maxProviderCents!==175)throw Error('MODEL_OR_COST_GUARD_MISMATCH')
  const call=oracle(env,fetcher)
  const existing=await call('/v1/jobs/'+JOB_ID)
  const present=existing.status!==404
  await existing.body?.cancel()
  if(present && existing.status!==200)throw Error('JOB_PREFLIGHT_UNCERTAIN')
  return {runtime, originalJobId:JOB_ID,existingJob:present,capUsd:MAX_USD,
    paidGenerationRequested:false,promptReference:'ONE_PNG_REFERENCE_MUST_BE_DOWNLOADED_AND_VALIDATED_BEFORE_SPEND'}
}
export const REFERENCE_URL='https://cdn.shopify.com/s/files/1/1035/0172/6043/files/worldifact-ecomech-v4-reference-20261015.png?v=1792019787'
export async function readReferenceImage(fetcher=fetch) {
  const url=new URL(REFERENCE_URL)
  if(url.protocol!=='https:'||url.hostname!=='cdn.shopify.com')throw Error('REFERENCE_HOST_BLOCKED')
  const response=await fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('image/'))throw Error('REFERENCE_IMAGE_UNAVAILABLE')
  const bytes=new Uint8Array(await response.arrayBuffer())
  if(bytes.length<40000||bytes.length>12*1024*1024||
     ![137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))throw Error('REFERENCE_PNG_INVALID')
  return {bytes,sha256:sha(bytes)}
}
export function prepareReferenceJpeg(originalPNG) {
  if(!(originalPNG instanceof Uint8Array)||originalPNG.length<40_000 ||
    ![137,80,78,71,13,10,26,10].every((x,i)=>originalPNG[i]===x))
    throw Error('REFERENCE_PNG_INVALID')
  // Resample only for the documented Oracle JPEG transport limit. Keep
  // original PNG bytes and SHA separate for audit. No CGI/service calls.
  const code = "import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB');im.thumbnail((1280,1280));out=io.BytesIO();im.save(out,format='JPEG',quality=86,optimize=True);sys.stdout.buffer.write(out.getvalue())"
  const p=spawnSync('python3',['-c',code],{input:Buffer.from(originalPNG),
    maxBuffer:3*1024*1024,timeout:20000})
  if(p.status!==0)throw Error('REFERENCE_JPEG_PREPARATION_FAILED')
  const jpeg=new Uint8Array(p.stdout)
  if(jpeg.length<20000||jpeg.length>2*1024*1024||jpeg[0]!==255||jpeg[1]!==216||
     jpeg[jpeg.length-2]!==255||jpeg[jpeg.length-1]!==217)
    throw Error('REFERENCE_JPEG_INVALID_OR_TOO_LARGE')
  return jpeg
}
export function buildEcomechAstraPayload(imageBytes) {
  if(!(imageBytes instanceof Uint8Array)||imageBytes.length<40000||imageBytes.length>12*1024*1024)
    throw Error('ACTUAL_REFERENCE_IMAGE_REQUIRED')
  if(imageBytes[0]!==255||imageBytes[1]!==216||imageBytes[imageBytes.length-2]!==255||imageBytes[imageBytes.length-1]!==217)
    throw Error('REFERENCE_JPEG_INVALID')
  const input=validateStudioInput({worldId:'enchanted-ai-shop',purpose:'figurine',textureMaxSize:4096,
    photos:[{name:'ECOMECH-reference-front.jpg',view:'front',
      dataUrl:'data:image/jpeg;base64,'+Buffer.from(imageBytes).toString('base64'),textureMaxSize:4096}],
    prompt:PROMPT,studioExecution:EXEC})
  const payload=oracleStudioPayload(JOB_ID,input)
  if(!('agentInstructions' in payload)||payload.studioExecution?.model!=='astra'||
      !Array.isArray(payload.photos)||payload.photos.length!==1)
    throw Error('ASTRA_REFERENCE_EXECUTION_NOT_BOUND')
  payload.agentInstructions+=String.fromCharCode(10,10)+
    'ECOMECH V4 REFERENCE QA: The image attachment is the controlling source for silhouette, camera-facing armor cutaway, helmet, motor framing, cable routes, raised hand and green chili. Inspect first build against the image before surface detail. If silhouette is substantially different, accepted=false and preserve actual original GLB. Never claim rigging, STL manufacturability or image similarity without image inspection.'
  validateOracleStudioPayload(payload,5000)
  return payload
}
export async function execute(env,fetcher=fetch,wait=delay){
  const marker=JSON.parse(await readFile('ops/ECOMECH_V4_REFERENCE_APPROVED_SINGLE_TEST.json','utf8'))
  approvedMarker(marker)
  if(env.WORLDIFACT_ECOMECH_APPROVAL!=='ECOMECH_V4_REFERENCE_SINGLE_TEST_20261015')
    throw Error('TEST_NOT_ARMED')
  const before=await probe(env,fetcher)
  if(before.existingJob)throw Error('ORIGINAL_JOB_ALREADY_EXISTS_NO_SECOND_SUBMISSION')
  const reference=await readReferenceImage(fetcher)
  await mkdir(EVIDENCE_DIR,{recursive:true})
  await writeFile(EVIDENCE_DIR+'/input-reference.png',reference.bytes)
  const preparedJpeg=prepareReferenceJpeg(reference.bytes)
  await writeFile(EVIDENCE_DIR+'/reference-transport.jpg',preparedJpeg)
  const payload=buildEcomechAstraPayload(preparedJpeg)
  await claimOnce(env,fetcher)
  const call=oracle(env,fetcher)
  const submission=await call('/v1/jobs',{method:'POST',body:payload})
  if(![200,201,202].includes(submission.status)){await submission.body?.cancel();throw Error('SINGLE_ORACLE_SUBMISSION_REJECTED_NO_RETRY')}
  const first=await json(submission)
  if(first.id!==JOB_ID||!ALLOWED.has(first.state))throw Error('ORIGINAL_JOB_IDENTITY_NOT_CONFIRMED')
  let last=first
  for(let i=0;i<170&&!TERMINAL.has(last.state);i++){
    await wait(10_000)
    const response=await call('/v1/jobs/'+JOB_ID)
    last=await json(response)
    if(last.id!==JOB_ID||!ALLOWED.has(last.state))throw Error('ORIGINAL_JOB_IDENTITY_CHANGED')
    if(i%12===0)console.log('ASTRA original job still running: '+last.state)
  }
  const report={revision:'ecomech-v4-image-grounded-astra-v1',jobId:JOB_ID,claimedModel:PROVIDER_MODEL,
    selectedExecution:EXEC,oracleTerminalState:last.state,
    completion:last.state==='succeeded'?'UNREVIEWED':'FAILED_OR_TIMEOUT',
    provenance:'SELECTED_UNCONFIRMED',providerCapUsd:MAX_USD,actualApiCostUsd:null,
    textOnly:false,imageReferenceSent:true,referenceSource:REFERENCE_URL,referenceSha256:reference.sha256,paidJobsSubmitted:1,automaticRetries:0,
    customerPointsCharged:0,makeApproved:false,commercialRelease:false,renderHumanReviewed:false,
    originalGLB:null,notes:'Visual quality must be reviewed against user reference; only GLB bytes are evidence.'}
  try{
    const q=await call('/v1/jobs/'+JOB_ID+'/quality')
    if(q.ok){const quality=await json(q,262144)
      if(quality.revision===6&&quality.state===last.state){
        report.quality={status:quality.modelStatus??null,hasModel:quality.hasModel===true,
          finished:quality.agent?.finished===true,
          usedModel:typeof quality.agentUsage?.model==='string'?quality.agentUsage.model:null}
      }}
    else await q.body?.cancel()
  }catch{report.qualityRead='UNAVAILABLE'}
  try{
    const budget=await call('/v1/jobs/'+JOB_ID+'/budget')
    if(budget.ok){const value=await json(budget,16384)
      if(validateTerminalBudgetReceipt(value,JOB_ID,undefined,EXEC)&&value.maximumLiabilityMicroUsd>0){
        report.provenance='ORACLE_CONFIRMED'
        report.providerMaximumLiabilityUsd=value.maximumLiabilityMicroUsd/1e6
        report.budgetReceiptSealId=value.sealId
      }else report.budgetRead='NOT_VERIFIED'
    } else await budget.body?.cancel()
  }catch{report.budgetRead='UNAVAILABLE'}
  if(report.quality?.usedModel&&report.quality.usedModel!==PROVIDER_MODEL)
    report.provenance='MODEL_MISMATCH_NOT_VERIFIED'
  try{
    const modelResp=await call('/v1/jobs/'+JOB_ID+'/model')
    if(modelResp.ok){
      const bytes=await readBounded(modelResp,MAX_GLB)
      const physical=validateCandidateGLB(bytes)
      await writeFile(EVIDENCE_DIR+'/original.glb',bytes)
      report.originalGLB=physical
      report.completion=report.quality?.finished===true && last.state==='succeeded'?'COMPLETE_UNREVIEWED':'INCOMPLETE_UNREVIEWED'
    }else{await modelResp.body?.cancel();report.originalGlbRead='UNAVAILABLE_ORACLE_'+modelResp.status}
  }catch{report.originalGlbRead='INVALID_OR_UNAVAILABLE'}
  await writeFile(EVIDENCE_DIR+'/report.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({jobId:report.jobId,state:report.oracleTerminalState,completion:report.completion,
    provenance:report.provenance,glbBytes:report.originalGLB?.bytes??0,
    triangles:report.originalGLB?.triangles??0,providerMaximumLiabilityUsd:report.providerMaximumLiabilityUsd??'UNKNOWN'}))
  if(!report.originalGLB)process.exitCode=1
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]==='probe')probe(process.env).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('GET_ONLY_PROBE_BLOCKED:'+e.message);process.exitCode=1})
  else if(process.argv[2]==='run')execute(process.env).catch(e=>{console.error('ONE_SHOT_FAILED:'+e.message);process.exitCode=1})
  else{console.error('Specify probe or run');process.exitCode=2}
}
