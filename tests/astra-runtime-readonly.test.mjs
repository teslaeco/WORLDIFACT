import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { checkAstraRuntime, publicGuardEvidence } from '../scripts/check-astra-runtime.mjs'
const now = Date.UTC(2026,8,28)
const health = { ready:true, codexReady:true, provider:'openai', model:'gpt-6-astra', connectorVersion:33,
  astraBudgetRevision:'astra-usd175-v1', astraBudgetMaxUsd:1.75, astraBudgetPreflight:'input-tokens', astraBudgetExpiry:1793145600 }
const env = { ORACLE_ENDPOINT:'https://fixture-worker.trycloudflare.com', ORACLE_API_TOKEN:'fixture-only-token-xxxxxxxxxxxxxxxxxxxxxxxxxx' }
test('runtime check is a single authenticated GET and logs only allowlisted evidence', async () => {
  const calls = []
  const result = await checkAstraRuntime(env, async (url, init) => {
    calls.push({url,init}); return Response.json({...health,secret:'NEVER_PRINT',jobs:[{prompt:'PRIVATE'}]})
  }, now)
  assert.equal(calls.length,1); assert.equal(calls[0].url,env.ORACLE_ENDPOINT+'/v1/health')
  assert.equal(calls[0].init.method,'GET'); assert.equal(calls[0].init.redirect,'error')
  assert.equal(calls[0].init.headers.Authorization,'Bearer '+env.ORACLE_API_TOKEN)
  assert.equal(calls[0].init.body,undefined)
  assert.equal(result.runtime,'VERIFIED'); assert.equal(result.paidGenerationRequested,false)
  assert.equal(result.commercialActivation,'STILL_BLOCKED')
  assert.doesNotMatch(JSON.stringify(result), /NEVER_PRINT|PRIVATE|fixture-only-token|trycloudflare/)
})
test('a ready connector without exact current cost guard is not commercial evidence', () => {
  for (const change of [{astraBudgetRevision:undefined},{astraBudgetMaxUsd:4},{astraBudgetMaxUsd:0},
    {astraBudgetPreflight:'estimated'},{astraBudgetExpiry:1},{astraBudgetExpiry:1794000000},
    {model:'gpt-6-sol'},{provider:'other'},{codexReady:false},{ready:false},{connectorVersion:32}])
    assert.throws(()=>publicGuardEvidence({...health,...change},now),/ASTRA_RUNTIME_NOT_VERIFIED/)
  assert.throws(()=>publicGuardEvidence(health,1793145600000),/ASTRA_RUNTIME_NOT_VERIFIED/)
})
test('config, transport and oversized responses never print secrets or try a second route', async () => {
  let calls = 0
  await assert.rejects(()=>checkAstraRuntime({...env,ORACLE_ENDPOINT:'https://example.invalid'},async()=>{calls++;return Response.json(health)},now),/CONFIGURATION_MISSING/)
  assert.equal(calls,0)
  await assert.rejects(()=>checkAstraRuntime(env,async()=>{calls++;throw new Error('PRIVATE_ENDPOINT_AND_TOKEN')},now),error=>error.message==='ASTRA_RUNTIME_NOT_VERIFIED')
  assert.equal(calls,1)
  await assert.rejects(()=>checkAstraRuntime(env,async()=>Response.json({padding:'x'.repeat(17000),...health}),now),/ASTRA_RUNTIME_NOT_VERIFIED/)
  await assert.rejects(()=>checkAstraRuntime(env,async()=>new Response('',{status:302,headers:{location:'https://example.invalid'}}),now),/ASTRA_RUNTIME_NOT_VERIFIED/)
})
test('live Astra prices are mapped but this rollout cannot enable untested commercial sales', async () => {
  const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'))
  assert.equal(config.vars.STRIPE_PRO_PRICE_ID,'price_1UKi3GBrIVB6dkxNm66OnDAr')
  assert.equal(config.vars.STRIPE_STUDIO_PRICE_ID,'price_1UKi3UBrIVB6dkxNfojjhJsv')
  assert.equal(config.vars.ENABLE_ASTRA_PLANS,'false')
})
