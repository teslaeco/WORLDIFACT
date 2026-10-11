import test from 'node:test'
import assert from 'node:assert/strict'
import {summarize,inspect} from '../scripts/read-generation-settings.mjs'
test('live settings summary never prints secret/plaintext binding values or account identifiers',()=>{
 const r=summarize({result:{bindings:[{name:'ORACLE_ENDPOINT',type:'plain_text',text:'private-origin'},{name:'OPENAI_API_KEY',type:'secret_text',text:'private-key'},{name:'PRIVATE',type:'plain_text',text:'private-value'}],limits:{cpu_ms:100}}},'private-origin')
 assert.equal(r.oracleEndpointMatchesDiagnostic,true);assert.equal(r.cpuMs,100);assert.doesNotMatch(JSON.stringify(r),/private-/)
})
test('only the fixed WORLDIFACT settings GET is sent; permission denial is not retried',async()=>{
 let calls=0;const r=await inspect({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture'},async(url,i)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+ 'a'.repeat(32)+'/workers/scripts/worldifact/settings');assert.equal(i.method,'GET');assert.equal(i.redirect,'error');return new Response('',{status:403})})
 assert.equal(calls,1);assert.equal(r.httpStatus,403)
})
