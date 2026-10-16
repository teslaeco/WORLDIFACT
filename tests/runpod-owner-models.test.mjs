import test from 'node:test'
import assert from 'node:assert/strict'
import {endpointPlan,budgetJob,IMAGE} from '../scripts/runpod-owner-models-once.mjs'
const storage={ARTIFACT_S3_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',ARTIFACT_BUCKET:'test-fixture',ARTIFACT_ACCESS_KEY_ID:'FIXTURE',ARTIFACT_SECRET_ACCESS_KEY:'FIXTURE'}
test('owner models use one scale-to-zero GPU, private image and no persistent volume',()=>{
  const p=endpointPlan('AMPERE_80',storage)
  assert.equal(p.name,'WORLDIFACT-3D-FLEX');assert.equal(p.image,IMAGE)
  assert.equal(p.disk,100);assert.deepEqual(p.workers,{min:0,max:1,idleTimeout:5})
  assert.equal(p.gpu.count,1);assert.equal(p.timeout,900000)
  assert.deepEqual(p.mounts,{network:[],global:[]})
  assert.equal(p.env.ENABLE_RUNPOD_WORKER,'true');assert.equal(p.env.QUALIFICATION_ID,undefined)
  assert.equal(p.entrypoint,undefined);assert.equal(p.cmd,undefined)
})
test('price above agreed ceiling and missing real planner identity fail closed',()=>{
  const j={planner:{model:'gpt-6-astra',responseId:'resp_TEST_FIXTURE_NOT_LIVE'}}
  assert.throws(()=>budgetJob(j,3.01));assert.throws(()=>budgetJob({},2.72))
  const {budget:b}=budgetJob(j,2.72,1000000)
  assert.ok((b.executionSeconds+b.coldStartAllowanceSeconds+b.idleSeconds)*b.rateMicroUsdPerSecond<=b.maxGpuMicroUsd)
  assert.equal(b.executionSeconds,900);assert.equal(b.expiresAt,4600000)
})
test('wrong storage destination cannot receive credentials or source models',()=>{
  assert.throws(()=>endpointPlan('AMPERE_80',{...storage,ARTIFACT_S3_ENDPOINT:'https://unrelated.invalid'}))
})
