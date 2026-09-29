/** One-off owner-approved direct Astra activation check.
 * One paid Responses generation request maximum, bounded by the same $1.75
 * server preflight. No Stripe charge, no retry, no Oracle job.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { handle } from '../server/worker.ts'
import { GenerationBudget } from '../server/budget.ts'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'
import { inspectGLB } from '../src/lib/glb.ts'

const APPROVAL='worldifact-astra-direct-activation-20260929-v1'
class Store {
  constructor(){ this.data=new Map(); this.tail=Promise.resolve() }
  async get(key){ return this.data.get(key) }
  async put(key,value){ this.data.set(key,value) }
  transaction(fn){ const next=this.tail.then(()=>fn(this)); this.tail=next.catch(()=>{}); return next }
}
async function claim(env, fetcher=fetch){
  if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')||!env.GITHUB_TOKEN) throw new Error('APPROVAL_CONFIGURATION_MISSING')
  const response=await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})
  })
  if(response.status!==201){await response.body?.cancel();throw new Error('APPROVAL_ALREADY_CLAIMED_OR_UNAVAILABLE_NO_RETRY')}
  await response.body?.cancel()
}
async function main(){
  const env=process.env
  if(env.WORLDIFACT_ASTRA_DIRECT_APPROVAL!=='ASTRA175_DIRECT_ONCE'||env.GITHUB_RUN_ATTEMPT!=='1'||!env.OPENAI_API_KEY) throw new Error('APPROVAL_MISSING')
  await claim(env)
  const store=new Store(), budgetEnv={GENERATION_REQUEST_LIMIT:'unlimited',GENERATION_EXPIRES_AT:''}
  const budget=new GenerationBudget({storage:store},budgetEnv)
  let generationCalls=0, countCalls=0
  const guardedFetch=async(url,init)=>{
    const href=String(url)
    if(href==='https://api.openai.com/v1/responses/input_tokens'){
      countCalls++
      if(countCalls>1) throw new Error('NO_PREFLIGHT_RETRY')
    } else if(href==='https://api.openai.com/v1/responses'){
      generationCalls++
      if(generationCalls>1) throw new Error('NO_PROVIDER_RETRY')
      const payload=JSON.parse(String(init?.body))
      if(payload.model!=='gpt-6-astra'||payload.store!==false||payload.service_tier!=='default'||payload.reasoning?.effort!=='low'||payload.max_output_tokens!==4000)
        throw new Error('UNREVIEWED_PROVIDER_PAYLOAD')
    }
    return fetch(url,init)
  }
  const workerEnv={
    OPENAI_API_KEY:env.OPENAI_API_KEY,
    OPENAI_MODEL:'gpt-6-astra',
    OPENAI_FAST_MODEL:'gpt-6-sol',
    ENABLE_PAID_GENERATION:'true',
    ENABLE_ASTRA_PLANS:'true',
    PUBLIC_PILOT:'true',
    GENERATION_REQUEST_LIMIT:'unlimited',
    GENERATION_EXPIRES_AT:'',
    GENERATION_LIMITER:{async limit(){return {success:true}}},
    GENERATION_BUDGET:{idFromName:name=>name,get:()=>budget},
  }
  const request=new Request('https://worldifact.xodobrox.workers.dev/api/blueprint',{
    method:'POST',
    headers:{Origin:'https://worldifact.xodobrox.workers.dev','Content-Type':'application/json','X-WORLDIFACT-Request':'99235d65-2d99-4b49-8bd8-19b949f77a31'},
    body:JSON.stringify({worldId:'enchanted-ai-shop',mode:'live',model:'astra',prompt:'Create a compact realistic teal industrial inspection robot as one reusable GAME asset. Separate head, torso, arms and legs; stable proportions; matte teal metal, dark rubber joints and two amber status lights. No text, no room, no extra people. Return a concise validated WORLDIFACT blueprint/spec suitable for a procedural GLB preview; MAKE remains validation-required.'})
  })
  const response=await handle(request,workerEnv,guardedFetch)
  const body=await response.json()
  if(response.status!==200||body.mode!=='LIVE'||body.provenance!=='GENERATED'||body.model!=='gpt-6-astra'||!body.evidence?.providerResponseId)
    throw new Error('DIRECT_ASTRA_RESULT_NOT_VERIFIED')
  if(generationCalls!==1||countCalls!==1) throw new Error('DIRECT_ASTRA_CALL_COUNT_INVALID')
  const glb=await exportBlueprintGlb(body.blueprint)
  const inspection=inspectGLB(glb)
  if(!inspection.triangles||!inspection.materialCount) throw new Error('DIRECT_ASTRA_GLB_INVALID')
  const input=Number(body.evidence.inputTokens), output=Number(body.evidence.outputTokens)
  const upperMicro=Number.isSafeInteger(input)&&Number.isSafeInteger(output)?(input*14+output*55):null
  if(upperMicro!==null&&upperMicro>1_750_000) throw new Error('DIRECT_ASTRA_USAGE_EXCEEDS_GUARD')
  const report={status:'PASSED',approval:APPROVAL,checkedAt:new Date().toISOString(),generationCalls,countCalls,model:body.model,responseId:body.evidence.providerResponseId,inputTokens:body.evidence.inputTokens,outputTokens:body.evidence.outputTokens,conservativeUpperUsd:upperMicro===null?null:upperMicro/1_000_000,glb:inspection}
  await mkdir('astra-direct-activation-evidence',{recursive:true})
  await writeFile('astra-direct-activation-evidence/report.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify({...report,responseId:'verified'},null,2))
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'DIRECT_ASTRA_ACTIVATION_FAILED_NO_RETRY');process.exitCode=1})
