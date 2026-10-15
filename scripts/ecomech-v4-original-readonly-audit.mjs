/**
 * Read-only recovery audit for the ONE already-submitted ECOMECH V4 Astra job.
 * NEVER submits, retries, settles, refunds, touches customer points or deploys.
 * Only GET /v1/jobs/{fixed-id}{,/quality,/budget,/model}.
 *
 * Production report is an immutable observation; budget liability is NOT an invoice.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { oracleOrigin } from '../server/platform.ts'
import { validateTerminalBudgetReceipt } from '../server/studioBudgetReceipt.ts'
import { validateCandidateGLB, JOB_ID, PROVIDER_MODEL } from './ecomech-v4-astra-image-once.mjs'
import { ECOMECH_V4_REFERENCE_SHA256 } from './lib/ecomechReferenceIntegrity.mjs'

const EXEC = Object.freeze({revision:'studio-execution-v1',model:'astra',mode:'standard'})
const DIR = 'ecomech-v4-readonly-recovery'
const ROUTES = new Set(['/v1/jobs/'+JOB_ID,'/v1/jobs/'+JOB_ID+'/quality',
  '/v1/jobs/'+JOB_ID+'/budget','/v1/jobs/'+JOB_ID+'/model'])
const TERMINAL = new Set(['failed','succeeded','cancelled'])
const MAX_MODEL = 48*1024*1024

function guardRuntime(env) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT)
  const token = env.ORACLE_API_TOKEN
  if(!origin||typeof token!=='string'||token.length<32||token.length>256)
    throw Error('ORACLE_READONLY_CREDENTIALS_UNAVAILABLE')
  return {origin,token}
}
async function takeBytes(response,max) {
  const declared=Number(response.headers.get('content-length')||0)
  if(declared>max)throw Error('ORACLE_RESPONSE_EXCEEDS_AUDIT_LIMIT')
  const reader=response.body?.getReader()
  if(!reader)throw Error('ORACLE_RESPONSE_BODY_MISSING')
  let size=0,parts=[]
  try {
    while(true) {
      const {done,value}=await reader.read()
      if(done)break
      size+=value.length
      if(size>max)throw Error('ORACLE_RESPONSE_EXCEEDS_AUDIT_LIMIT')
      parts.push(value)
    }
  } finally {await reader.cancel().catch(()=>{})}
  if(declared&&declared!==size)throw Error('ORACLE_RESPONSE_LENGTH_MISMATCH')
  const bytes=new Uint8Array(size);let i=0
  for(const part of parts){bytes.set(part,i);i+=part.length}
  return bytes
}
export async function auditOriginalV4(env,fetcher=fetch,outputDir=DIR) {
  const {origin,token}=guardRuntime(env)
  const observed=[]
  const get=async (path,maximum=128*1024)=>{
    if(!ROUTES.has(path))throw Error('ONLY_FIXED_ORIGINAL_JOB_GET_ALLOWED')
    observed.push(path)
    const response=await fetcher(origin+path,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(90_000),
      headers:{Authorization:'Bearer '+token,Accept:path.endsWith('/model')?'application/octet-stream':'application/json'}
    })
    if(!response.ok){await response.body?.cancel();return {status:response.status,value:null}}
    if(path.endsWith('/model'))return {status:200,value:await takeBytes(response,MAX_MODEL)}
    if(!response.headers.get('content-type')?.includes('json'))throw Error('ORACLE_JSON_REQUIRED')
    const raw=await takeBytes(response,maximum)
    const value=JSON.parse(new TextDecoder().decode(raw))
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ORACLE_BAD_JSON')
    return {status:200,value}
  }

  const job=await get('/v1/jobs/'+JOB_ID)
  if(job.status!==200||job.value?.id!==JOB_ID)
    throw Error('ORIGINAL_JOB_MISSING_OR_ID_MISMATCH_NO_RETRY')
  const state=job.value.state
  if(!TERMINAL.has(state))throw Error('ORIGINAL_JOB_NOT_TERMINAL_NO_RETRY')
  const quality=await get('/v1/jobs/'+JOB_ID+'/quality')
  const budget=await get('/v1/jobs/'+JOB_ID+'/budget',32*1024)
  const matchedQuality=quality.status===200&&quality.value?.state===state&&
    quality.value?.revision===6 ? quality.value : null
  const usedModel=matchedQuality?.agentUsage?.model
  const modelMatches=(typeof usedModel==='string'&&usedModel===PROVIDER_MODEL)
  const verifiedBudget=budget.status===200&&
    validateTerminalBudgetReceipt(budget.value,JOB_ID,undefined,EXEC) &&
    Number.isSafeInteger(budget.value.maximumLiabilityMicroUsd) &&
    budget.value.maximumLiabilityMicroUsd>0
  const model=await get('/v1/jobs/'+JOB_ID+'/model')
  let originalGLB=null
  if(model.status===200)originalGLB=validateCandidateGLB(model.value)
  const report={
    revision:'ecomech-v4-original-job-readonly-audit-v1',
    jobId:JOB_ID,referenceImageSha256:ECOMECH_V4_REFERENCE_SHA256,
    state,modelSelected:PROVIDER_MODEL,oracleAgentModel:modelMatches?usedModel:null,
    oracleAgentModelMatches:modelMatches,budgetReceiptVerified:verifiedBudget,
    maximumLiabilityUsd:verifiedBudget?budget.value.maximumLiabilityMicroUsd/1e6:null,
    actualOpenAIInvoiceUsd:null,
    output:originalGLB?{state:'EXISTING_ORIGINAL_GLBBYTES_UNREVIEWED',...originalGLB}:
      {state:'NOT_RECOVERED',httpStatus:model.status},
    qa:'NOT_HUMAN_APPROVED',make:'BLOCKED',
    providerPosts:0,paidGenerationsTriggered:0,customerPointMutations:0,
    details:'No result or liability field is a visual-quality or invoice certification.'
  }
  await mkdir(outputDir,{recursive:true})
  if(originalGLB)await writeFile(outputDir+'/original-v4.glb',model.value)
  await writeFile(outputDir+'/audit.json',JSON.stringify(report,null,2)+'\n')
  return {report,readRoutes:observed}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  auditOriginalV4(process.env).then(({report})=>{
    console.log(JSON.stringify(report))
  }).catch(()=>{console.error('READ_ONLY_V4_RECOVERY_BLOCKED: examine protected runtime and connection; no retry attempted');process.exitCode=1})
}
