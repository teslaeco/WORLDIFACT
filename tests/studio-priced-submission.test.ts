import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { prepareStudioInput, type StudioInput, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION, type StudioBudgetTier, type StudioPricing } from '../src/lib/studioPricing.ts'
import { detailedGLBFixture, detailedHealthFixture } from './detailed-studio-fixture.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A detailed blue chess rook', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
const selected = (tier: StudioBudgetTier): StudioInput => ({ ...input, pricingRevision: STUDIO_PRICING_REVISION, budgetTier: tier, acceptedPoints: STUDIO_PRICING[tier].points })
const tierHealth = () => ({ ...detailedHealthFixture, studioPricingRevision: STUDIO_PRICING_REVISION,
  studioPricingMaintenance: false, studioPricingTiers: Object.values(STUDIO_PRICING).map(({ tier, points, maxProviderCents }) => ({ tier, points, maxProviderCents })) })
type PricedReceipt = StudioReceipt & { pricing?: StudioPricing }

function storage(): EntitlementStorage {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (value: EntitlementStorage) => Promise<T>) { const next = queue.then(() => callback(store)); queue = next.catch(() => {}); return next },
  }
  return store
}
function fixture() {
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'owner-fixture-'.repeat(4), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'inert-oracle-fixture',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', STUDIO_NEW_JOB_POLICY: 'tiered-v1',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: storage() as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const stores = new Map<string, EntitlementStorage>(), objects = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(key) {
    const name = String(key)
    if (!stores.has(name)) stores.set(name, storage())
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: stores.get(name)! }, { ENABLE_ASTRA_PLANS: 'true' }, () => Date.now()))
    return objects.get(name)!
  } }
  let runtime: Record<string, unknown> = tierHealth(), healthReads = 0, state: StudioJob['state'] = 'building', statusFields: Record<string, unknown> = {}
  const submitted: Record<string, unknown>[] = []
  // Every outbound call is intercepted: these are Worker/ledger integration
  // tests, never paid-provider, authenticated-production or visual evidence.
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: new Headers(init?.headers).get('Authorization') === 'Bearer bob-token' ? bob : alice, email: 'fixture@example.test' })
    if (path === '/v1/health') { healthReads++; return Response.json(runtime) }
    if (path === '/v1/jobs') { const body = JSON.parse(String(init?.body)); submitted.push(body); return Response.json({ id: body.id, state: 'building' }) }
    if (path.endsWith('/budget')) return Response.json({}, { status: 404 })
    if (path.endsWith('/quality')) return Response.json({ revision: 6, state: 'succeeded', hasModel: true, modelStatus: 'draft', automaticQualityAccepted: false,
      agent: { finished: false }, agentUsage: { error_code: 'WORLDIFACT_ASTRA_COST_GUARD' } })
    if (path.endsWith('/model')) { const bytes = detailedGLBFixture(); return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }) }
    if (/^\/v1\/jobs\/[a-f0-9-]+$/.test(path)) return Response.json({ id: path.split('/').pop(), state, ...statusFields })
    throw new Error('Unexpected fixture request: ' + path)
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, receipt?: PricedReceipt, user: 'alice' | 'bob' = 'alice') => studioApi(new Request(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Host-worldifact-access=${user}-token`,
      ...(receipt ? { 'X-WORLDIFACT-Job': receipt.ticket, 'X-WORLDIFACT-Idempotency-Key': receipt.id } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  const account = (id = alice) => stores.get(`account:v1:${id}`)!
  const balances = async (id = alice) => ({ points: await account(id).get('balance'), held: await account(id).get('customer-reserved-credits:v1') ?? 0,
    provider: await account(id).get('provider-budget-cents:v1'), global: (await (await budget.fetch(new Request('https://budget.internal/status'))).json() as { used: number }).used })
  return { env, call, account, balances, submitted, healthReads: () => healthReads,
    runtime: (value: Record<string, unknown>) => { runtime = value }, state: (value: StudioJob['state']) => { state = value }, statusFields: (value: Record<string, unknown>) => { statusFields = value },
    restart: () => objects.clear(),
    async fund(id = alice) {
      await entitlementCall(env, id, '/grant', { id: 'in_priced', credits: 4500, subscriptionId: 'sub_priced' })
      await entitlementCall(env, id, '/subscription', { id: 'sub_priced', until: Date.now() + 86400_000, active: true, revision: 1, plan: 'pro', grantId: 'in_priced' })
    },
    async prepare(body = selected('standard')) {
      const response = await call('/api/studio/prepare', 'POST', await prepareStudioInput(body))
      assert.equal(response.status, 200, await response.clone().text())
      return await response.json() as PricedReceipt
    },
  }
}

test('legacy runtime keeps unpriced 250-point/175-cent submissions available and never offers an extended tier', async () => {
  const f = fixture(); await f.fund(); f.runtime({ ...detailedHealthFixture })
  const status = await (await f.call('/api/studio/status')).json() as { ready: boolean; tiersReady?: boolean }
  assert.equal(status.ready, true); assert.notEqual(status.tiersReady, true)
  const before = await f.balances()
  assert.equal((await f.call('/api/studio/prepare', 'POST', await prepareStudioInput(selected('extended')))).status, 503)
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
  const receipt = await f.prepare(input); assert.equal(receipt.pricing, undefined)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt)).status, 202)
  assert.deepEqual(await f.balances(), { points: 4500, held: 250, provider: 2975, global: 1 })
  assert.equal(f.submitted[0].studioPricing, undefined)
  assert.match(String(f.submitted[0].agentInstructions), /USD 1\.75/)
})

test('reviewed runtime quotes and reserves only the exact selected standard or extended terms', async () => {
  for (const tier of ['standard', 'extended'] as const) {
    const f = fixture(); await f.fund(); const body = selected(tier), pricing = STUDIO_PRICING[tier]
    const receipt = await f.prepare(body)
    assert.deepEqual(receipt.pricing, pricing)
    assert.deepEqual(await f.balances(), { points: 4500, held: 0, provider: 3150, global: 0 }, 'Preparation never reserves points or provider funding')
    const response = await f.call('/api/studio/jobs', 'POST', body, receipt)
    assert.equal(response.status, 202)
    assert.deepEqual((await response.json() as { job: StudioJob }).job.pricing, pricing)
    assert.deepEqual(f.submitted[0].studioPricing, pricing)
    assert.deepEqual(await f.balances(), { points: 4500, held: pricing.points, provider: 3150 - pricing.maxProviderCents, global: 1 })
  }
})

test('missing, partial or incompatible additive attestation rejects new pricing without reserving anything', async () => {
  const valid = tierHealth()
  for (const changed of [
    { studioPricingRevision: undefined }, { studioPricingRevision: 'studio-pricing-v2' }, { studioPricingMaintenance: undefined }, { studioPricingMaintenance: true },
    { studioPricingTiers: valid.studioPricingTiers.slice(0, 1) },
    { studioPricingTiers: [valid.studioPricingTiers[0], { tier: 'extended', points: 500, maxProviderCents: 500 }] },
    { astraBudgetMaxUsd: 4 }, { astraOutputPolicy: 'unknown' }, { astraUsageSettlement: 'estimated' },
  ]) {
    const f = fixture(); await f.fund(); f.runtime({ ...valid, ...changed }); const before = await f.balances()
    const response = await f.call('/api/studio/prepare', 'POST', await prepareStudioInput(selected('standard')))
    assert.equal(response.status, 503, JSON.stringify(changed))
    assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
  }
})

test('500 points require exact explicit consent and changed inputs cannot consume the signed quote', async () => {
  const f = fixture(); await f.fund(); const body = selected('extended'), before = await f.balances()
  for (const acceptedPoints of [undefined, 250, 499, '500', true]) {
    assert.equal((await f.call('/api/studio/prepare', 'POST', { ...body, acceptedPoints })).status, 400)
  }
  const receipt = await f.prepare(body)
  for (const change of [ { prompt: body.prompt + ' changed' }, { purpose: 'object' }, { worldId: 'ai-game-lab' }, { textureMaxSize: 8192 },
    { budgetTier: 'standard', acceptedPoints: 250 }, { pricingRevision: undefined }, { acceptedPoints: undefined } ]) {
    const response = await f.call('/api/studio/jobs', 'POST', { ...body, ...change }, receipt)
    assert.ok([400, 409].includes(response.status), JSON.stringify(change))
  }
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
})

test('extended consent is bound to the exact reference bytes and metadata', async () => {
  // A container-only JPEG fixture, not a photograph or generated image.
  const jpeg = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
  const photo = { name: 'fixture.jpg', view: 'front' as const, textureMaxSize: 4096 as const, dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') }
  const body: StudioInput = { ...selected('extended'), photos: [photo] }
  const f = fixture(); await f.fund(); const receipt = await f.prepare(body), before = await f.balances()
  const changedBytes = 'data:image/jpeg;base64,' + Buffer.concat([jpeg.subarray(0, -2), Buffer.from([0]), jpeg.subarray(-2)]).toString('base64')
  for (const photos of [[], [{ ...photo, name: 'different.jpg' }], [{ ...photo, view: 'back' }], [{ ...photo, dataUrl: changedBytes }]]) {
    assert.equal((await f.call('/api/studio/jobs', 'POST', { ...body, photos }, receipt)).status, 409)
  }
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
})

test('expired fresh priced quotes and capability loss fail before account or operator reservations', async t => {
  const f = fixture(); await f.fund(); const body = selected('extended'), receipt = await f.prepare(body), before = await f.balances()
  const issued = Date.now(); t.mock.method(Date, 'now', () => issued + 5 * 60_000 + 1)
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, receipt)).status, 409)
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
  t.mock.restoreAll()
  const fresh = await f.prepare(body); f.runtime({ ...detailedHealthFixture })
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, fresh)).status, 503)
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
})

test('account binding and concurrent duplicates permit one extended reservation and one Oracle POST', async () => {
  const f = fixture(); await f.fund(); await f.fund(bob); const body = selected('extended'), receipt = await f.prepare(body)
  const before = await f.balances(), otherBefore = await f.balances(bob)
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, receipt, 'bob')).status, 401)
  assert.deepEqual(await f.balances(), before); assert.deepEqual(await f.balances(bob), otherBefore)
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.call('/api/studio/jobs', 'POST', body, receipt)))
  for (const response of responses) assert.equal(response.status, 202)
  assert.equal(f.submitted.length, 1)
  assert.deepEqual(await f.balances(), { points: 4500, held: 500, provider: 2750, global: 1 })
  f.restart()
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, receipt)).status, 202)
  assert.equal(f.submitted.length, 1)
})

test('already admitted exact input recovers its original pricing after quote expiry and health loss', async t => {
  const f = fixture(); await f.fund(); const body = selected('extended'), receipt = await f.prepare(body)
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, receipt)).status, 202)
  const before = await f.balances(), healthBefore = f.healthReads(), issued = Date.now()
  t.mock.method(Date, 'now', () => issued + 6 * 60_000)
  f.runtime({ ...tierHealth(), ready: false }); f.restart()
  const replay = await f.call('/api/studio/jobs', 'POST', body, receipt)
  assert.equal(replay.status, 202)
  const recovered = await replay.json() as { job: StudioJob; recoveryOnly?: boolean }
  assert.equal(recovered.recoveryOnly, true); assert.deepEqual(recovered.job.pricing, STUDIO_PRICING.extended)
  assert.equal(f.healthReads(), healthBefore); assert.equal(f.submitted.length, 1); assert.deepEqual(await f.balances(), before)
  assert.equal((await f.call('/api/studio/jobs', 'POST', { ...body, prompt: body.prompt + ' replacement' }, receipt)).status, 409)
  assert.equal(f.submitted.length, 1)
})

test('successful result and refreshed recovery receipt retain the original 500-point terms', async () => {
  const f = fixture(); await f.fund(); const body = selected('extended'), receipt = await f.prepare(body)
  await f.call('/api/studio/jobs', 'POST', body, receipt)
  f.state('succeeded')
  const polled = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)
  assert.equal(polled.status, 200)
  const completed = (await polled.json() as { job: StudioJob }).job
  assert.equal(completed.state, 'succeeded'); assert.deepEqual(completed.pricing, STUDIO_PRICING.extended)
  assert.deepEqual(await f.balances(), { points: 4000, held: 0, provider: 2750, global: 1 })
  f.runtime({ ...tierHealth(), ready: false }); f.restart()
  const recovered = await (await f.call('/api/studio/current')).json() as { current: { receipt: PricedReceipt; pricing: StudioPricing; financialState: string } }
  assert.deepEqual(recovered.current.pricing, STUDIO_PRICING.extended)
  assert.deepEqual(recovered.current.receipt.pricing, STUDIO_PRICING.extended)
  assert.equal(recovered.current.financialState, 'completed')
  const replay = await f.call('/api/studio/jobs', 'POST', body, recovered.current.receipt)
  assert.equal(replay.status, 202)
  assert.equal((await replay.json() as { job: StudioJob }).job.state, 'succeeded')
  assert.equal(f.submitted.length, 1)
})

test('unfinished retained drafts show complexity only for the precise Oracle budget-exhaustion code', async () => {
  for (const precise of [true, false]) {
    const f = fixture(); await f.fund(); const body = selected('extended'), receipt = await f.prepare(body)
    await f.call('/api/studio/jobs', 'POST', body, receipt)
    f.state('succeeded'); f.statusFields({ modelStatus: 'draft', ...(precise ? { worldifactFailureCode: 'MODEL_BUDGET_EXCEEDED' } : {}) })
    const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)
    assert.equal(response.status, 200)
    const job = (await response.json() as { job: StudioJob }).job
    assert.equal(job.state, 'failed'); assert.equal(job.failureCode, precise ? 'MODEL_BUDGET_EXCEEDED' : 'ASTRA_COST_LIMIT')
    if (precise) assert.match(job.detail, /too elaborate/)
    else assert.doesNotMatch(job.detail, /too elaborate/)
    assert.deepEqual(job.pricing, STUDIO_PRICING.extended)
    assert.deepEqual(await f.balances(), { points: 4500, held: 0, provider: 2750, global: 1 }, 'Failure releases customer points but missing sealed evidence retains provider funding')
    assert.equal(f.submitted.length, 1)
  }
})

test('historical new-job policy offers only the original budget even on a tier-capable runtime', async () => {
  const f = fixture(); await f.fund(); f.env.STUDIO_NEW_JOB_POLICY = 'legacy-usd175-v1'
  const before = await f.balances()
  const status = await (await f.call('/api/studio/status')).json() as Record<string, unknown>
  assert.equal(status.ready, true); assert.equal(status.detailedReady, true)
  assert.equal(status.newJobPolicy, 'legacy-usd175-v1'); assert.equal(status.tiersReady, false); assert.equal(status.pricingRevision, undefined)
  for (const tier of ['standard', 'extended'] as const) for (const manifest of [false, true]) {
    const body = selected(tier)
    const response = await f.call('/api/studio/prepare', 'POST', manifest ? await prepareStudioInput(body) : body)
    assert.equal(response.status, 409)
    assert.equal((await response.json() as { failureCode: string }).failureCode, 'STUDIO_BUDGET_POLICY_CHANGED')
  }
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
  const receipt = await f.prepare(input); assert.equal(receipt.pricing, undefined)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt)).status, 202)
  assert.deepEqual(await f.balances(), { points: 4500, held: 250, provider: 2975, global: 1 })
  assert.equal(f.submitted[0].studioPricing, undefined)
  assert.match(String(f.submitted[0].agentInstructions), /USD 1\.75/)
})

test('a priced receipt prepared before rollback cannot reserve or dispatch after the policy switch', async () => {
  for (const tier of ['standard', 'extended'] as const) {
    const f = fixture(); await f.fund(); const body = selected(tier), receipt = await f.prepare(body)
    const before = await f.balances(); f.env.STUDIO_NEW_JOB_POLICY = 'legacy-usd175-v1'
    const responses = await Promise.all(Array.from({ length: 6 }, () => f.call('/api/studio/jobs', 'POST', body, receipt)))
    assert.ok(responses.every(response => response.status === 409))
    assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 0)
    assert.equal(await f.account().get(`job:${receipt.id}`), undefined)
  }
})

test('admitted priced jobs retain exact replay, recovery, settlement and funding through rollback', async () => {
  for (const tier of ['standard', 'extended'] as const) for (const outcome of ['failed', 'succeeded'] as const) {
    const f = fixture(); await f.fund(); const body = selected(tier), receipt = await f.prepare(body), pricing = STUDIO_PRICING[tier]
    assert.equal((await f.call('/api/studio/jobs', 'POST', body, receipt)).status, 202)
    const before = await f.balances(), healthBefore = f.healthReads()
    f.env.STUDIO_NEW_JOB_POLICY = 'legacy-usd175-v1'; f.restart()
    const pendingReplay = await (await f.call('/api/studio/jobs', 'POST', body, receipt)).json() as { job: StudioJob; recoveryOnly: boolean }
    assert.equal(pendingReplay.recoveryOnly, true); assert.deepEqual(pendingReplay.job.pricing, pricing)
    assert.deepEqual(await f.balances(), before); assert.equal(f.healthReads(), healthBefore); assert.equal(f.submitted.length, 1)
    f.state(outcome)
    const completed = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)).json() as { job: StudioJob }
    assert.equal(completed.job.state, outcome); assert.deepEqual(completed.job.pricing, pricing)
    const settled = await f.balances()
    assert.equal(settled.points, outcome === 'succeeded' ? 4500 - pricing.points : 4500)
    assert.equal(settled.held, 0); assert.equal(settled.provider, 3150 - pricing.maxProviderCents)
    const current = await (await f.call('/api/studio/current')).json() as { current: { receipt: PricedReceipt; pricing: StudioPricing } }
    assert.deepEqual(current.current.pricing, pricing); assert.deepEqual(current.current.receipt.pricing, pricing)
    assert.equal((await f.call('/api/studio/jobs', 'POST', body, current.current.receipt)).status, 202)
    assert.deepEqual(await f.balances(), settled); assert.equal(f.submitted.length, 1)
    assert.equal((await f.call('/api/studio/jobs', 'POST', { ...body, prompt: body.prompt + ' changed' }, receipt)).status, 409)
  }
})

test('unknown new-job policy refuses admission while already admitted pricing remains recoverable', async () => {
  const f = fixture(); await f.fund(); const body = selected('extended'), receipt = await f.prepare(body)
  await f.call('/api/studio/jobs', 'POST', body, receipt)
  const before = await f.balances(); f.env.STUDIO_NEW_JOB_POLICY = 'unreviewed-policy'
  const status = await (await f.call('/api/studio/status')).json() as Record<string, unknown>
  assert.equal(status.ready, false); assert.equal(status.reason, 'STUDIO_POLICY_UNAVAILABLE'); assert.equal(status.tiersReady, false)
  assert.equal((await f.call('/api/studio/prepare', 'POST', await prepareStudioInput(input))).status, 503)
  const recovered = await (await f.call('/api/studio/jobs', 'POST', body, receipt)).json() as { recoveryOnly: boolean; job: StudioJob }
  assert.equal(recovered.recoveryOnly, true); assert.deepEqual(recovered.job.pricing, STUDIO_PRICING.extended)
  assert.deepEqual(await f.balances(), before); assert.equal(f.submitted.length, 1)
})
