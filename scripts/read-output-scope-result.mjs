/** Read the same newly approved synthetic engineering test; cannot submit a job.
 * No account scan, original customer job lookup, raw logs or provider invocation.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {JOB,bytes} from './approved-output-scope-smoke.mjs'
import {oracleOrigin} from '../server/platform.ts'
const STATES=new Set(['queued','generating','retrying','building','succeeded','failed','cancelled'])
const TOOLS=new Set(['get_modeling_contract','build_model','edit_model','get_current_model','inspect_render','finish_model'])
const statuses=new Set(['started','succeeded','failed','completed'])
const initial=new Set(['WORLDIFACT_CONSTRUCTION_INCOMPLETE','WORLDIFACT_ASTRA_COST_GUARD','CODEX_UNAVAILABLE','CODEX_TOOLS_MISSING','FORGE_JOB_BUDGET','FORGE_UNCERTAIN_USAGE','FORGE_STREAM_INTERRUPTED','FORGE_REPEATED_CODE_ERROR','FORGE_REPEATED_TOOL_ERROR','OPENAI_HTTP_400','OPENAI_HTTP_401','OPENAI_HTTP_403','OPENAI_HTTP_404','OPENAI_HTTP_429','OPENAI_RESPONSE_FAILED','insufficient_quota','rate_limit_exceeded','model_not_found','context_length_exceeded','max_output_tokens'])
const phases=new Set(['construction','inspection','reassessment','codex_mcp','blender','blender_build','blender_finalize','export','before_build','before_finish','before_initial_edit'])
export async function knownCodes(){
 const known=new Set(initial)
 for(const name of ['construction_payload.py','runtime_controller.py','phased_controller.py']){
  const source=await readFile(new URL('../tools/model_construction/'+name,import.meta.url),'utf8')
  for(const m of source.matchAll(/raise Refused\('([A-Za-z0-9_:]+)'/g)){
   if(m[1].endsWith(':')) for(const phase of phases) known.add(m[1]+phase)
   else known.add(m[1])
  }
 }
 return known
}
export function category(value,known){
 if(typeof value!=='string')return 'UNAVAILABLE'
 if(known.has(value))return value
 const v=value.slice(0,8192)
 const classes=[['SYNTAX_ERROR',/(?:^|\n)SyntaxError:/],['TYPE_ERROR',/(?:^|\n)TypeError:/],['ATTRIBUTE_ERROR',/(?:^|\n)AttributeError:/],['KEY_ERROR',/(?:^|\n)KeyError:/],['NAME_ERROR',/(?:^|\n)NameError:/],['ANATOMY_VALIDATION',/ANATOMY_VALIDATION/],['SCENE_SCHEMA_VALIDATION',/scene\.(?:parts|materials|subject_type)|Nieprawidlowy schemat/],['CODE_VALIDATION',/CodePolicyError|Niedozwolon|Forbidden|forbidden|unsafe/],['BLENDER_TIMEOUT',/BLENDER.*(?:TIMEOUT|TIME_LIMIT)|Blender.*(?:timeout|czasu)/],['PROVIDER_LIMIT',/insufficient_quota|rate_limit_exceeded|HTTP.?429/],['RENDER_OR_EXPORT',/(?:render|export|GLB).*(?:failed|missing|invalid)/i]]
 return classes.find(([,pattern])=>pattern.test(v))?.[0]||'UNRECOGNIZED'
}
function numbers(value,names){return Object.fromEntries(names.filter(k=>typeof value?.[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1e12).map(k=>[k,value[k]]))}
function flags(value,names){return Object.fromEntries(names.filter(k=>typeof value?.[k]==='boolean').map(k=>[k,value[k]]))}
export function summarize(job,q,known){
 if(job?.id!==JOB||!STATES.has(job?.state))throw Error('IDENTITY_REFUSED')
 const usage=q?.agentUsage,tools=q?.agentTools,timing=q?.timing,review=q?.visualReview
 return {jobId:JOB,state:job.state,detailCode:category(job.detail,known),modelStatus:['none','draft','reviewed'].includes(q?.modelStatus)?q.modelStatus:'UNKNOWN',
  ...flags(q,['hasModel','automaticQualityAccepted']),
  usage:{code:category(usage?.error_code,known),source:['forge','openai'].includes(usage?.error_source)?usage.error_source:'UNKNOWN',
   ...numbers(usage,['upstream_status','requests','input_tokens','output_tokens','seconds_limit']),...flags(usage,['unknown_usage','completed'])},
  timing:{phase:phases.has(timing?.last_phase)?timing.last_phase:'UNKNOWN',...numbers(timing,['total_seconds','ai_seconds','blender_seconds'])},
  geometry:numbers(q?.geometry,['vertices','triangles','objects']),
  tools:{...numbers(tools,['total_calls','failures','build_attempts','revision']),calls:(Array.isArray(tools?.calls)?tools.calls:[]).slice(-12).map(c=>({tool:TOOLS.has(c?.tool)?c.tool:'UNKNOWN',status:statuses.has(c?.status)?c.status:'UNKNOWN',code:category(c?.error,known),...numbers(c,['revision','attempt','build_attempts','elapsed_seconds'])}))},
  review:{...flags(review,['accepted','reportedAccepted','assessment_completed','hostAcceptanceBlocked']),issueCount:Array.isArray(review?.issues)?review.issues.length:null},
  failureCode:category(q?.failure?.detail,known),generationRequested:false,accountOperations:0,rawDetailExported:false}
}
export async function readResult(env,{fetcher=fetch,known=initial}={}){
 const origin=oracleOrigin(env.ORACLE_ENDPOINT),token=env.ORACLE_API_TOKEN
 if(!origin||typeof token!=='string'||token.length<32||token.length>256||/\s/.test(token))throw Error('CONFIGURATION_REFUSED')
 const get=async suffix=>{
  const r=await fetcher(origin+'/v1/jobs/'+JOB+suffix,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}})
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('JSON_REQUIRED')
  return JSON.parse((await bytes(r,262144)).toString())
 }
 const job=await get('')
 if(job?.id!==JOB||!['failed','cancelled','succeeded'].includes(job.state))throw Error('TERMINAL_TEST_JOB_REQUIRED')
 const q=await get('/quality')
 if(q.state!==job.state)throw Error('STATE_MISMATCH')
 return summarize(job,q,known)
}
async function test(){
 const env={ORACLE_ENDPOINT:'https://synthetic-scope.trycloudflare.com',ORACLE_API_TOKEN:'synthetic-token'.repeat(4)}
 const known=await knownCodes(),calls=[]
 const q={state:'failed',modelStatus:'none',secret:'NEVER_PRINT',agentUsage:{error_code:'WORLDIFACT_CONSTRUCTION_INCOMPLETE',last_error:'NEVER_PRINT',requests:2,unknown_usage:false},timing:{last_phase:'codex_mcp',total_seconds:9,blender_seconds:3},agentTools:{calls:[{tool:'edit_model',status:'failed',error:'NameError: private_value'}]}}
 const r=await readResult(env,{known,fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/quality')?q:{id:JOB,state:'failed',detail:'final_assessment_rejected'}),{headers:{'content-type':'application/json'}})}})
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.body===undefined&&c.options.redirect==='error'&&c.url.includes('/v1/jobs/'+JOB)))
 assert.ok(!JSON.stringify(r).includes('NEVER_PRINT'));assert.ok(!JSON.stringify(r).includes('private_value'));assert.equal(r.usage.requests,2);assert.equal(r.tools.calls[0].code,'NAME_ERROR')
 assert.equal(category('Bearer SECRET',known),'UNRECOGNIZED');assert.equal(category('complete_scene_not_supported',known),'complete_scene_not_supported')
 assert.throws(()=>summarize({id:'wrong',state:'failed'},q,known))
 assert.deepEqual(numbers({requests:-1,input_tokens:NaN,seconds_limit:Infinity},['requests','input_tokens','seconds_limit']),{})
 let count=0;await assert.rejects(readResult(env,{fetcher:async()=>{count++;return new Response(JSON.stringify({id:'wrong',state:'failed'}),{headers:{'content-type':'application/json'}})}}));assert.equal(count,1)
 console.log('PASS: fixed synthetic-job GET-only report; no raw private fields, arbitrary paths or write methods.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--test')await test()
 else if(process.argv.length!==2)throw Error('ARGUMENTS_REFUSED')
 else {try{const result=await readResult(process.env,{known:await knownCodes()});await mkdir('live-result-evidence',{recursive:true});await writeFile('live-result-evidence/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))}catch{console.error('TEST_RESULT_READ_UNAVAILABLE; no state changed.');process.exitCode=1}}
}
