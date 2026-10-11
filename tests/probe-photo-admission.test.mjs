import test from 'node:test'
import assert from 'node:assert/strict'
import { probe, probeBody } from '../scripts/probe-photo-admission.mjs'
const env = { ORACLE_ENDPOINT: 'https://fixture.trycloudflare.com', ORACLE_API_TOKEN: 'synthetic-fixture-token-not-production' }
test('every admission probe is doubly invalid and contains only a synthetic reference', async () => {
  let calls=0
  const result=await probe(env, async (url, init)=>{
    calls++; assert.equal(url,env.ORACLE_ENDPOINT+'/v1/jobs'); assert.equal(init.redirect,'error')
    const b=JSON.parse(init.body); assert.equal(b.id,'INVALID-NON-JOB-PHOTO-VALIDATION'); assert.equal(b.prompt,''); assert.equal(b.agentInstructions,'')
    assert.deepEqual(b,probeBody(calls>=2,calls===3)); assert.equal(init.method,'POST')
    return Response.json({error:'Nieprawidlowy opis lub identyfikator zlecenia.'},{status:400})
  })
  assert.equal(calls,3); assert.ok(result.results.every(r=>r.code==='EXPECTED_INVALID_ID_AND_PROMPT'))
})
test('unknown acceptance, redirect or private error stops the probe without printing details or retrying', async ()=>{
  for (const status of [200,202,301,400,500]) {
    let calls=0
    const r=await probe(env,async()=>{calls++;return Response.json({error:'private secret prompt token'},{status})})
    assert.equal(calls,1); assert.doesNotMatch(JSON.stringify(r),/private|secret|prompt token/)
  }
})
test('external endpoint overrides and invalid credentials are rejected before network',async()=>{
  for(const endpoint of ['http://fixture.trycloudflare.com','https://example.com','https://fixture.trycloudflare.com/path'])
    await assert.rejects(probe({...env,ORACLE_ENDPOINT:endpoint},()=>assert.fail('no network')),/CONFIGURATION/)
})
