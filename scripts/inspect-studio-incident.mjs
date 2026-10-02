// Existing CI route: authenticated health GET only, bounded allowlisted output.
import { pathToFileURL } from 'node:url'
export function evidence(h) {
 const expected={ready:true,codexReady:true,provider:'openai',model:'gpt-6-astra',astraBudgetRevision:'astra-usd175-v1',astraBudgetMaxUsd:1.75,astraUsageSettlement:'authenticated-completed-only',worldifactCompletionPolicy:'worldifact-reference-completion-v1',worldifactCompletionMaxContinuations:1}
 if(!h||typeof h!=='object'||Array.isArray(h)||Object.entries(expected).some(([k,v])=>h[k]!==v))throw Error('COMPLETION_RUNTIME_NOT_VERIFIED')
 return {phase:'WORLDIFACT_COMPLETION_RUNTIME_VERIFIED',revision:expected.worldifactCompletionPolicy,maxContinuations:1,maxProviderUsd:1.75,paidRequests:0,qualityTest:'NOT_RUN'}
}
export async function inspect(env,fetcher=fetch){
 const u=new URL(env.ORACLE_ENDPOINT||'https://invalid.invalid'),token=env.ORACLE_API_TOKEN
 if(u.protocol!=='https:'||!/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(u.hostname)||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||typeof token!=='string'||token.length<32||token.length>256||/\s/.test(token))throw Error('CONFIGURATION_INVALID')
 const response=await fetcher(u.origin+'/v1/health',{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)})
 if(!response.ok||!response.headers.get('content-type')?.startsWith('application/json')||Number(response.headers.get('content-length')||0)>32768){await response.body?.cancel();throw Error('COMPLETION_RUNTIME_NOT_VERIFIED')}
 const reader=response.body?.getReader();if(!reader)throw Error('COMPLETION_RUNTIME_NOT_VERIFIED')
 let size=0;const chunks=[]
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32768)throw Error('COMPLETION_RUNTIME_NOT_VERIFIED');chunks.push(Buffer.from(value))}return evidence(JSON.parse(Buffer.concat(chunks).toString()))}finally{await reader.cancel().catch(()=>{})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify({checkedAt:new Date().toISOString(),...await inspect(process.env)},null,2))}
 catch{console.error(JSON.stringify({phase:'COMPLETION_RUNTIME_NOT_VERIFIED',paidRequests:0,qualityTest:'NOT_RUN'}));process.exitCode=1}
}
