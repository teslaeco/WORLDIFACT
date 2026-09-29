import { writeFile, mkdir } from 'node:fs/promises'
import { oracleOrigin } from '../server/platform.ts'
import { checkAstraRuntime } from './check-astra-runtime.mjs'
const JOB='86002e5b-5a9e-42c0-ae18-c10e2a54ca90'
function clean(value){
  return String(value||'')
    .replace(/https?:\/\/\S+/g,'[url]')
    .replace(/(?:sk|rk|whsec|Bearer)[-_A-Za-z0-9.]+/g,'[secret]')
    .replace(/[A-Fa-f0-9]{32,}/g,'[id]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]')
    .slice(0,2400)
}
async function main(){
  const env=process.env
  const runtime=await checkAstraRuntime(env)
  const origin=oracleOrigin(env.ORACLE_ENDPOINT); if(!origin) throw new Error('ORACLE_NOT_CONFIGURED')
  const response=await fetch(origin+'/v1/jobs/'+JOB,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.ORACLE_API_TOKEN,Accept:'application/json'}})
  if(!response.ok) throw new Error('JOB_READ_FAILED')
  const job=await response.json()
  if(job.id!==JOB) throw new Error('JOB_IDENTITY_INVALID')
  const detail=clean(job.detail)
  const known=['WORLDIFACT_ASTRA_COST_GUARD','FORGE_JOB_BUDGET','CODEX_TOOLS_MISSING','OPENAI_HTTP_429','OPENAI_HTTP_400','max_output_tokens','timeout','timed out','incomplete','reasoning']
    .filter(token=>detail.toLowerCase().includes(token.toLowerCase()))
  const report={checkedAt:new Date().toISOString(),runtime,job:{id:JOB,state:job.state,progress:job.progress??null,knownSignals:known,detail}}
  await mkdir('astra-activation-inspection',{recursive:true})
  await writeFile('astra-activation-inspection/report.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'READ_ONLY_INSPECTION_FAILED');process.exitCode=1})
