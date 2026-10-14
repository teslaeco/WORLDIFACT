test('exact generated Astra/Blender request is bounded and never relabels the source image or cost',()=>{
  const payload=buildEcomechAstraPayload()
  assert.equal(payload.id,JOB_ID)
  assert.deepEqual(payload.studioExecution,{revision:'studio-execution-v1',model:'astra',mode:'standard'})
  assert.equal('photos' in payload,false,'A reference image not sent cannot be claimed image-guided')
  assert.equal('studioPricing' in payload,false)
  assert.match(payload.prompt,/CHILI PEPPER/)
  assert.match(payload.prompt,/FIRST scene build/)
  assert.match(payload.agentInstructions,/ECOMECH QA/)
  assert.match(payload.agentInstructions,/tools\.mcp__blender__build_model/)
  assert.match(payload.agentInstructions,/tools\.mcp__blender__finish_model/)
  assert.match(payload.agentInstructions,/USD 1\.75 guard/)
  assert.match(payload.agentInstructions,/Do not start another job/)
  assert.ok(payload.agentInstructions.length<=12000)
  assert.ok(payload.prompt.length<=5000)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'
import { approvedMarker, validateCandidateGLB, probe, buildEcomechAstraPayload, MAX_USD, JOB_ID, CLAIM_TAG } from '../scripts/ecomech-astra-once.mjs'
const marker={approval:'ECOMECH_ASTRA_SINGLE_TEST_20261014',maxProviderUsd:1.75,mode:'astra-standard',
  originalJobId:JOB_ID,paidAttempts:1,validUntil:'2026-10-16T23:59:59Z'}
test('no editable cost ceiling, duplicate ID, expired or unknown marker can start a paid job',()=>{
  assert.equal(MAX_USD,1.75)
  assert.match(JOB_ID,/^[0-9a-f-]{36}$/)
  assert.equal(CLAIM_TAG,'worldifact-ecomech-astra-one-job-20261014-v1')
  assert.equal(approvedMarker(marker,Date.parse('2026-10-15T00:00:00Z')),true)
  for(const change of [
    {maxProviderUsd:100},{maxProviderUsd:4},{paidAttempts:2},{mode:'sol-standard'},
    {originalJobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}, {provider:'gpt-6-astra'},
    {validUntil:'2026-10-13T00:00:00Z'}])
    assert.throws(()=>approvedMarker({...marker,...change},Date.parse('2026-10-15T00:00:00Z')))
  assert.throws(()=>approvedMarker(marker,Date.parse('2026-10-17T00:00:00Z')))
})
test('real GLB container, embedded geometry, SHA and nonzero scene metrics required',()=>{
  const b=detailedGLBFixture()
  const result=validateCandidateGLB(b)
  assert.match(result.sha256,/^[0-9a-f]{64}$/)
  assert.equal(result.bytes,b.length)
  assert.ok(result.triangles>0&&result.meshes>0)
  const corrupt=b.slice()
  new DataView(corrupt.buffer).setUint32(8,900,true)
  assert.throws(()=>validateCandidateGLB(corrupt),/GLB_INVALID_HEADER/)
  const truncated=b.slice(0,48)
  assert.throws(()=>validateCandidateGLB(truncated))
})
test('preflight is GET-only and requires exactly matching verified Astra cap',async()=>{
  const token='z'.repeat(40), env={ORACLE_ENDPOINT:'https://ecomech-test.trycloudflare.com',ORACLE_API_TOKEN:token}
  const paths=[], now=Date.now()
  const fetcher=async (url,init)=>{
    assert.equal(init.method,'GET');paths.push(String(url))
    assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+token)
    if(String(url).endsWith('/v1/health'))return Response.json({
      ready:true,codexReady:true,provider:'openai',model:'gpt-6-astra',connectorVersion:35,
      astraBudgetRevision:'astra-usd175-v1',astraBudgetMaxUsd:1.75,
      astraBudgetPreflight:'input-tokens',astraBudgetExpiry:1793145600,
    })
    if(String(url).endsWith('/v1/jobs/'+JOB_ID))return Response.json({error:'not_found'},{status:404})
    throw Error('Unknown route')
  }
  const result=await probe(env,fetcher)
  assert.equal(result.runtime.model,'gpt-6-astra')
  assert.equal(result.originalJobId,JOB_ID)
  assert.equal(result.existingJob,false)
  assert.equal(result.paidGenerationRequested,false)
  assert.equal(result.promptReference,'TEXT_DESCRIPTION_ONLY_NO_IMAGE_ATTACHMENT')
  assert.equal(paths.length,2)
  const hostile=async (url,init)=>{
    const r=await fetcher(url,init)
    if(String(url).endsWith('/v1/health'))return Response.json({
      ready:true,codexReady:true,provider:'openai',model:'gpt-6-luna',connectorVersion:35,
      astraBudgetRevision:'astra-usd175-v1',astraBudgetMaxUsd:1.75,
      astraBudgetPreflight:'input-tokens',astraBudgetExpiry:1793145600,
    })
    return r
  }
  await assert.rejects(probe(env,hostile),/ASTRA_RUNTIME_NOT_VERIFIED/)
  assert.ok(now<1793145600*1000,'Test assumes current API guard review window')
})
