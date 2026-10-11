/** Read-only production settings audit; never emit binding values or credentials. */
import { pathToFileURL } from 'node:url'
export function summarize(value, endpoint) {
  const bindings=Array.isArray(value?.result?.bindings)?value.result.bindings:[]
  const find=name=>bindings.find(b=>b.name===name)
  const oracle=find('ORACLE_ENDPOINT')
  return {readOnly:true,oracleEndpointPresent:!!oracle,oracleEndpointMatchesDiagnostic:oracle?.type==='plain_text' ? oracle.text===endpoint : null,
    secretPresence:Object.fromEntries(['ORACLE_API_TOKEN','OPENAI_API_KEY'].map(n=>[n,find(n)?.type==='secret_text'])),
    cpuMs:Number.isSafeInteger(value?.result?.limits?.cpu_ms)?value.result.limits.cpu_ms:null,
    logsEnabled:value?.result?.observability?.logs?.enabled===true,observabilityEnabled:value?.result?.observability?.enabled===true,
    generationEnabled:find('ENABLE_STUDIO_JOBS')?.text==='true',paidGenerationEnabled:find('ENABLE_PAID_GENERATION')?.text==='true'}
}
export async function inspect(env,fetcher=fetch) {
  if(!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!env.CLOUDFLARE_API_TOKEN) throw Error('CONFIGURATION_UNAVAILABLE')
  const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/worldifact/settings`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`}})
  if(r.status!==200){await r.body?.cancel();return {readOnly:true,unavailable:true,httpStatus:r.status}}
  const reader=r.body.getReader();let n=0,s='';const decoder=new TextDecoder()
  try{for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;if(n>262144)throw Error('BOUNDED_RESPONSE_REQUIRED');s+=decoder.decode(p.value,{stream:true})}}finally{await reader.cancel().catch(()=>{})}
  const v=JSON.parse(s+decoder.decode());if(v.success!==true)throw Error('SETTINGS_UNAVAILABLE')
  return summarize(v,env.ORACLE_ENDPOINT)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await inspect(process.env)))}catch{console.error('SETTINGS_INSPECTION_UNAVAILABLE');process.exitCode=1}}
