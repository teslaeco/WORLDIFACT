import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreDetailedConfig } from '../scripts/restore-detailed-studio-config.mjs'
import { checkDetailedRuntime } from '../scripts/check-detailed-studio-runtime.mjs'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const config = () => ({name:'worldifact',vars:{ENABLE_PAID_GENERATION:'true',PUBLIC_PILOT:'true',ENFORCE_ACCOUNT_ENTITLEMENTS:'true',ENABLE_ASTRA_PLANS:'true',ENABLE_STUDIO_JOBS:'false',ENABLE_ORACLE_JOBS:'false',OPENAI_MODEL:'gpt-6-astra',ENABLE_APPROVED_FAST_TEST:'false',GENERATION_REQUEST_LIMIT:'unlimited',FREE_SOL_SEED_JOBS:'10'}})
const env = {ORACLE_ENDPOINT:'https://fixture-only.trycloudflare.com',ORACLE_API_TOKEN:'fixture-not-a-real-token-123456789012345678'}

test('restoration requires a current authenticated GET and changes only the signed Studio route flag', async () => {
  const calls=[]
  const evidence=await checkDetailedRuntime(env,async (url,init)=>{calls.push({url,init});return Response.json(detailedHealthFixture)})
  const before=config(),next=restoreDetailedConfig(before,evidence)
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error')
  assert.equal(before.vars.ENABLE_STUDIO_JOBS,'false');assert.equal(next.vars.ENABLE_STUDIO_JOBS,'true')
  assert.deepEqual({...next,vars:{...next.vars,ENABLE_STUDIO_JOBS:'false'}},before)
  assert.equal(evidence.paidGenerationRequested,false);assert.equal(evidence.liveQualityTest,'NOT_RUN')
})
test('missing ownership protection, invalid cost policy and missing reference support cannot enable the route',async()=>{
  const evidence=await checkDetailedRuntime(env,async()=>Response.json(detailedHealthFixture))
  for(const key of ['ENFORCE_ACCOUNT_ENTITLEMENTS','ENABLE_ASTRA_PLANS','ENABLE_PAID_GENERATION']){
    const changed=config();changed.vars[key]='false';assert.throws(()=>restoreDetailedConfig(changed,evidence))
  }
  for(const value of [{...evidence,maxProviderUsdPerJob:20},{...evidence,verifiedForGuardedRouting:false},{...evidence,detailed:{...evidence.detailed,outputPolicyReady:false}},{...evidence,detailed:{...evidence.detailed,photoInput:false}},{}])assert.throws(()=>restoreDetailedConfig(config(),value))
  await assert.rejects(checkDetailedRuntime(env,async()=>new Response('{}',{status:503})),/NOT_VERIFIED/)
  const noPolicy=await checkDetailedRuntime(env,async()=>Response.json({...detailedHealthFixture,astraOutputPolicy:'old'}))
  assert.equal(noPolicy.verifiedForGuardedRouting,false);assert.throws(()=>restoreDetailedConfig(config(),noPolicy))
})
