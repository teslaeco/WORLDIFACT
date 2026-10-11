import test from 'node:test'
import assert from 'node:assert/strict'
import {QUERY,summarize,inspect} from '../scripts/read-generation-metrics.mjs'
test('historical metrics cannot transmit a job, mutate GraphQL or broaden the query',async()=>{
 let calls=0;const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture'}
 const r=await inspect(env,async(url,i)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');assert.equal(i.redirect,'error');assert.deepEqual(JSON.parse(i.body),{query:QUERY,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID}});assert.match(QUERY,/^query IncidentMetrics/);assert.doesNotMatch(QUERY,/mutation|prompt|ipAddress/);return Response.json({errors:[{message:'Actor requires permission private-secret'}]})})
 assert.equal(calls,1);assert.equal(r.permissionDenied,true);assert.doesNotMatch(JSON.stringify(r),/private-secret/)
})
test('summary keeps bounded metrics and public statuses, never raw records',()=>{
 const r=summarize({data:{viewer:{accounts:[{workersInvocationsAdaptive:[{dimensions:{status:'exceededCpu',private:'never'},sum:{requests:1,errors:1,subrequests:3},quantiles:{cpuTimeP50:10000,cpuTimeP99:10000}}]}]}}})
 assert.equal(r.rows[0].status,'exceededCpu');assert.doesNotMatch(JSON.stringify(r),/never/)
})
