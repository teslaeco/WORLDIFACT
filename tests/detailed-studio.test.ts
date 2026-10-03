import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailedRuntime, detailedUnavailable } from '../src/lib/detailedStudio.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'
import { parseStudioJob } from '../src/lib/studioClient.ts'
import type { StudioStatus } from '../src/lib/studioProtocol.ts'

test('detailed readiness is measured, expires at the reviewed deadline and never inferred from a blueprint',()=>{
  assert.deepEqual(detailedRuntime(detailedHealthFixture,1790740000000),{costGuardReady:true,outputPolicyReady:true,tiersReady:false})
  assert.equal(detailedRuntime(detailedHealthFixture,1793145600000).costGuardReady,false)
  assert.equal(detailedRuntime({generationReady:true,astraBlueprintReady:true}).outputPolicyReady,false)
  const status={ready:true,detailedReady:true,photoReady:true} as StudioStatus
  for(const count of [0,1,3,4])assert.equal(detailedUnavailable(status,count),null)
  assert.match(detailedUnavailable(status,5)!,/four/)
  assert.notEqual(detailedUnavailable({...status,detailedReady:undefined},3),null)
})
test('only fixed failure codes become customer-facing details',()=>{
  const a=parseStudioJob({job:{id:'fixture',state:'failed',failureCode:'ASTRA_COST_LIMIT',detail:'PRIVATE SECRET'}},'fixture')
  assert.match(a.detail,/cost protection/);assert.doesNotMatch(a.detail,/PRIVATE|model (?:is )?too (?:large|complex)|\$[0-9]|500 points/i)
  const b=parseStudioJob({job:{id:'fixture',state:'failed',failureCode:'PRIVATE SECRET',detail:'PRIVATE SECRET'}},'fixture')
  assert.doesNotMatch(JSON.stringify(b),/PRIVATE/)
})
