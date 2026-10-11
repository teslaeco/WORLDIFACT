/** Fixed historical Workers analytics query, not a GraphQL mutation or generation. */
import { pathToFileURL } from 'node:url'
export const QUERY = `query IncidentMetrics($accountTag: string) { viewer { accounts(filter:{accountTag:$accountTag}) { workersInvocationsAdaptive(limit:100,filter:{scriptName:"worldifact",datetime_geq:"2026-10-11T15:56:00Z",datetime_leq:"2026-10-11T16:04:00Z"}) { sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 } dimensions { status } } } } }`
const statuses=new Set(['success','ok','exception','exceededCpu','exceededMemory','canceled','cancelled','internalError','exceededSubrequests','responseStreamDisconnected','scriptNotFound','unknown'])
export function summarize(v) {
  if(v.errors?.length) return {readOnly:true,unavailable:true,permissionDenied:v.errors.some(e=>/permission|unauthorized|not authorized|access denied/i.test(e.message??''))}
  const rows=v.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
  if(!Array.isArray(rows)||rows.length>100) return {readOnly:true,unavailable:true}
  const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<1e15?x:null
  return {readOnly:true,window:'2026-10-11T15:56Z/16:04Z',sampledAnalytics:true,rows:rows.map(r=>({status:statuses.has(r.dimensions?.status)?r.dimensions.status:'UNRECOGNIZED',requests:n(r.sum?.requests),errors:n(r.sum?.errors),subrequests:n(r.sum?.subrequests),cpuTimeP50:n(r.quantiles?.cpuTimeP50),cpuTimeP99:n(r.quantiles?.cpuTimeP99)}))}
}
export async function inspect(env,fetcher=fetch){
  if(!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('CONFIGURATION_UNAVAILABLE')
  const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:QUERY,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID}})})
  if(r.status!==200){await r.body?.cancel();return {readOnly:true,unavailable:true,httpStatus:r.status}}
  const reader=r.body.getReader();let n=0,s='';const decoder=new TextDecoder()
  try{for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;if(n>262144)throw Error('BOUNDED_RESPONSE_REQUIRED');s+=decoder.decode(p.value,{stream:true})}}finally{await reader.cancel().catch(()=>{})}
  return summarize(JSON.parse(s+decoder.decode()))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await inspect(process.env)))}catch{console.error('METRICS_INSPECTION_UNAVAILABLE');process.exitCode=1}}
