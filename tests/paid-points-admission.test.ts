import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
import { blueprintRetainedCents } from '../server/blueprintTerminalUsage.ts'
import { MODEL_ECONOMICS } from '../server/generationEconomics.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'
import { PAID_POINTS_JOB_PREFIX } from '../server/paidPointsStorage.ts'

const NOW = Date.parse('2026-10-07T07:00:00Z'), fingerprint = 'a'.repeat(64)
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PROVIDER = 'provider-budget-cents:v1'
function fixture() {
  let values = new Map<string, unknown>(), queue: Promise<unknown> = Promise.resolve(), now = NOW, providerReadFails = false
  const wrap = (data: Map<string, unknown>): EntitlementStorage => ({
    async get<T>(key: string) { if (key === PROVIDER && providerReadFails) throw new Error('Inert legacy provider read failure'); return structuredClone(data.get(key)) as T | undefined },
    async put(key, value) { data.set(key, structuredClone(value)) },
    async list<T>({ prefix, startAfter, limit }: { prefix: string; startAfter?: string; limit: number }) {
      return new Map([...data.entries()].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>
    },
    transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const operation = queue.then(async () => { const draft = structuredClone(values), result = await callback(wrap(draft)); values = draft; return result })
      queue = operation.catch(() => undefined); return operation
    },
  })
  const storage: EntitlementStorage = { get: key => wrap(values).get(key), put: (key, value) => wrap(values).put(key, value), list: options => wrap(values).list!(options), transaction: callback => wrap(values).transaction(callback) }
  let env = { ENABLE_ASTRA_PLANS: 'true' }, ledger = new AccountEntitlements({ storage }, env, () => now)
  const call = async (path: string, body?: unknown, expected: number | number[] = 200, versioned = true) => {
    const response = await ledger.fetch(new Request('https://inert.example.test' + (versioned ? '/generation-v3' : '') + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-WORLDIFACT-Verified-Account': ACCOUNT }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    const value = await response.json() as Record<string, any>
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), JSON.stringify(value)); return value
  }
  const seed = async (plan = 'creator', points = 1500, active = true) => {
    await call('/grant', { id: 'in_points', credits: points, subscriptionId: 'sub_points' }, 200, false)
    await call('/subscription', { id: 'sub_points', until: NOW + 86400000, active, revision: 1, plan, grantId: 'in_points' }, 200, false)
    values.set(PROVIDER, 0)
  }
  return { call, seed, values: () => structuredClone(values), patch: (key: string, value: unknown) => values.set(key, value), remove: (key: string) => values.delete(key),
    failProviderRead: () => { providerReadFails = true }, advance: (ms: number) => { now += ms }, restart: () => { ledger = new AccountEntitlements({ storage }, env, () => now) },
    disableAstra: () => { env = { ENABLE_ASTRA_PLANS: 'false' }; ledger = new AccountEntitlements({ storage }, env, () => now) } }
}
function request(id: string, channel = 'studio', model: 'astra' | 'sol' | 'luna' = 'astra', pricing?: typeof STUDIO_PRICING[keyof typeof STUDIO_PRICING]) {
  return { id, paidPointsPolicy: PAID_POINTS_POLICY, ...(channel === 'studio' ? { requiredFundingMode: PAID_POINTS_FUNDING } : {}), profile: model === 'astra' ? 'slow' : 'fast', model, channel, fingerprint, ...(channel === 'studio' ? { prompt: 'Inert account contract model' } : { blueprintDispatch: 'fenced-v1', providerModel: MODEL_ECONOMICS[model].model }), ...(pricing ? { pricing } : {}) }
}
const proof = (id: string) => ({ revision: 'worldifact-terminal-budget-v1', jobId: id, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 420001, sealed: true, sealId: 'b'.repeat(64) })

test('all active paid plans admit every reviewed model and Studio tier with zero secondary reserve', async () => {
  for (const plan of ['creator', 'pro', 'studio']) for (const [channel, model, pricing] of [
    ['studio', 'astra'], ['studio', 'astra', STUDIO_PRICING.standard], ['studio', 'astra', STUDIO_PRICING.extended], ['blueprint', 'astra'], ['blueprint', 'sol'], ['blueprint', 'luna'],
  ] as const) {
    const f = fixture(), id = crypto.randomUUID(); await f.seed(plan)
    const before = f.values(), reserved = await f.call('/reserve', request(id, channel, model, pricing))
    assert.equal(reserved.allowed, true); assert.equal(reserved.fundingSource, PAID_POINTS_FUNDING)
    const job = f.values().get(PAID_POINTS_JOB_PREFIX + id) as any
    assert.equal(job.cost, pricing?.points ?? MODEL_ECONOMICS[model].creditsPerGeneration)
    assert.equal(job.providerLiability.capCents, pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents)
    assert.equal(job.providerLiability.maximumLiabilityCents, 0); assert.equal(job.providerLiability.state, 'unsubmitted')
    assert.equal(f.values().get(PROVIDER), before.get(PROVIDER)); assert.equal(job.studioProviderReservation, undefined); assert.equal(job.blueprintProviderReservation, undefined)
    await f.call('/settle', { id, state: 'failed' })
    assert.equal(f.values().get('balance'), 1500); assert.equal(f.values().get(PROVIDER), 0)
  }
})

test('paid read-only projection and new admission neither require nor seed the ordinary reserve', async () => {
  for (const mode of ['absent', 'corrupt', 'read-error']) {
    const f = fixture(); await f.seed()
    if (mode === 'absent') f.remove(PROVIDER)
    if (mode === 'corrupt') f.patch(PROVIDER, { unusable: true })
    if (mode === 'read-error') f.failProviderRead()
    const before = f.values(), state = await f.call('/status')
    assert.equal(state.paidGenerationPolicy, PAID_POINTS_POLICY); assert.equal(state.generationAdmission.astra.allowed, true); assert.equal(state.studioAdmission.tiers.extended.allowed, true)
    assert.deepEqual(f.values(), before)
    assert.equal((await f.call('/reserve', request(crypto.randomUUID()))).allowed, true)
    assert.deepEqual(f.values().get(PROVIDER), before.get(PROVIDER))
  }
})

test('paid points, holds, billing review, membership and runtime remain authoritative', async () => {
  const f = fixture(); await f.seed('creator', 250)
  const replies = await Promise.all(Array.from({ length: 12 }, () => f.call('/reserve', request(crypto.randomUUID()), [200, 429])))
  assert.equal(replies.filter(value => value?.reason === 'CREDITS_EXHAUSTED').length, 11)
  assert.equal((await f.call('/status')).reservedCredits, 250)
  const held = [...f.values()].find(([key]) => key.startsWith(PAID_POINTS_JOB_PREFIX))![0].slice(PAID_POINTS_JOB_PREFIX.length)
  f.patch('billingHold', true)
  assert.equal((await f.call('/studio-dispatch', { id: held, fingerprint })).dispatch, false)
  await f.call('/settle', { id: held, state: 'failed' })
  assert.equal((await f.call('/reserve', request(crypto.randomUUID()), 429)).reason, 'BILLING_REVIEW_REQUIRED')
  f.patch('billingHold', false); f.disableAstra()
  assert.equal((await f.call('/reserve', request(crypto.randomUUID()), 429)).reason, 'ASTRA_RUNTIME_DISABLED')
  for (const mutation of [{ active: false }, { until: NOW }, { terminal: true }, { plan: 'unreviewed' }]) {
    const inactive = fixture(); await inactive.seed(); inactive.patch('subscription', { ...(inactive.values().get('subscription') as object), ...mutation })
    assert.equal((await inactive.call('/reserve', request(crypto.randomUUID()), 429)).reason, 'ACCOUNT_ADMISSION_UNAVAILABLE')
  }
})

test('top-up-only, free and explicit legacy callers retain bounded economics', async () => {
  const f = fixture(); await f.seed('creator', 1500, false)
  assert.equal((await f.call('/reserve', { ...request(crypto.randomUUID()), requiredFundingMode: undefined }, 429)).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  const paid = fixture(); await paid.seed()
  assert.equal((await paid.call('/reserve', { ...request(crypto.randomUUID()), requiredFundingMode: undefined }, 429, false)).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  const free = fixture()
  assert.equal((await free.call('/reserve', { ...request(crypto.randomUUID()), requiredFundingMode: undefined }, 429)).reason, 'FREE_SOL_ONLY')
  for (let index = 0; index < 2; index++) assert.equal((await free.call('/reserve', request(crypto.randomUUID(), 'blueprint', 'sol'))).kind, 'free')
  assert.equal((await free.call('/reserve', request(crypto.randomUUID(), 'blueprint', 'luna'), 429)).reason, 'FAST_DAILY_LIMIT')
})

test('provider liability reconciles once after restart without crediting unreserved funds', async () => {
  const f = fixture(); await f.seed(); const id = crypto.randomUUID()
  await f.call('/reserve', request(id)); await f.call('/studio-dispatch', { id, fingerprint }); await f.call('/settle', { id, state: 'failed' })
  f.restart()
  assert.equal((await f.call('/studio-current', {})).job.fundingSource, PAID_POINTS_FUNDING)
  const before = f.values(), results = await Promise.all(Array.from({ length: 8 }, () => f.call('/reconcile-studio-provider', { id, receipt: proof(id) })))
  assert.equal(results.filter(value => value.repeated === false).length, 1)
  assert.ok(results.every(value => value.releasedCents === 0 && value.retainedCents === 43))
  assert.equal(f.values().get(PROVIDER), before.get(PROVIDER)); assert.equal(f.values().get('balance'), before.get('balance'))
  const snapshot = await f.call('/generation-funding')
  assert.equal(snapshot.jobs.scanned, 1); assert.equal(snapshot.jobs.fundingEvidence.unknownAmountRecords, 0)
  assert.deepEqual(snapshot.paidMembershipLiability, { version: 1, jobs: 1, unresolvedJobs: 0, maximumLiabilityCents: 43 })
})

test('undispatched Blueprint completion cannot persist output or falsely complete a paid job', async () => {
  const f = fixture(); await f.seed(); const id = crypto.randomUUID()
  await f.call('/reserve', request(id, 'blueprint', 'sol'))
  const before = f.values()
  assert.equal((await f.call('/settle', { id, state: 'completed' })).settled, false)
  assert.deepEqual(f.values(), before)
})


test('a real older-grant reversal cannot dispatch holds exceeding the remaining balance', async () => {
  const f = fixture(); await f.seed()
  await f.call('/grant', { id: 'in_older_topup', credits: 500 }, 200, false)
  const ids: string[] = []
  for (let index = 0; index < 7; index++) { const id = crypto.randomUUID(); ids.push(id); await f.call('/reserve', request(id)) }
  await f.call('/revoke', { id: 'in_older_topup', credits: 500 }, 200, false)
  assert.equal(f.values().get('balance'), 1500); assert.equal(f.values().get('customer-reserved-credits:v1'), 1750)
  const before = f.values()
  assert.equal((await f.call('/studio-dispatch', { id: ids[0], fingerprint })).dispatch, false)
  assert.deepEqual(f.values(), before)
  await f.call('/settle', { id: ids[6], state: 'failed' })
  assert.equal((await f.call('/studio-dispatch', { id: ids[0], fingerprint })).dispatch, true)
})


test('all paid Blueprint models retain failed-cost holds and accept only exact terminal usage', async () => {
  for (const model of ['luna', 'sol', 'astra'] as const) for (const evidenceMode of ['valid', 'missing', 'wrong-model', 'wrong-account', 'timeout']) {
    const f = fixture(); await f.seed(); const id = crypto.randomUUID(), cap = MODEL_ECONOMICS[model].maxProviderCents
    await f.call('/reserve', request(id, 'blueprint', model))
    const dispatch = await f.call('/blueprint-dispatch', { id, fingerprint })
    const evidence = { revision: 'blueprint-terminal-usage-v1', accountId: evidenceMode === 'wrong-account' ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : ACCOUNT,
      requestId: id, fingerprint, model: evidenceMode === 'wrong-model' ? 'gpt-6-sol' : MODEL_ECONOMICS[model].model,
      dispatchDeadline: dispatch.deadline, dispatchedAt: NOW, receivedAt: NOW, maxOutputTokens: 4000, reservedCents: cap,
      providerResponseId: 'resp_paid_fixture', providerStatus: 'incomplete', incompleteReason: 'max_output_tokens', inputTokens: 1000, outputTokens: 100, totalTokens: 1100 }
    if (evidenceMode === 'timeout') { f.advance(600001); assert.equal((await f.call('/blueprint-status', { id })).refunded, false) }
    else await f.call('/settle', { id, state: 'failed', ...(evidenceMode === 'missing' ? {} : { blueprintTerminalUsage: evidence }) })
    const job = f.values().get(PAID_POINTS_JOB_PREFIX + id) as any
    assert.equal(job.state, 'failed'); assert.deepEqual(job.pointSettlement, { version: 1, state: 'pending-cost', heldPoints: MODEL_ECONOMICS[model].creditsPerGeneration, chargedPoints: 0 }); assert.equal(f.values().get('balance'), 1500); assert.equal(f.values().get(PROVIDER), 0)
    assert.equal(job.providerLiability.state, evidenceMode === 'valid' ? 'bounded' : 'unresolved')
    assert.equal(job.providerLiability.maximumLiabilityCents, evidenceMode === 'valid' ? blueprintRetainedCents(model, 1000, 100) : cap)
    const before = f.values(); await f.call('/settle', { id, state: 'failed' }); assert.deepEqual(f.values(), before)
  }
})

test('each explicit Studio tier reconciles the reviewed cap without releasing legacy reserve', async () => {
  for (const pricing of Object.values(STUDIO_PRICING)) {
    const f = fixture(); await f.seed(); const id = crypto.randomUUID()
    await f.call('/reserve', request(id, 'studio', 'astra', pricing)); await f.call('/studio-dispatch', { id, fingerprint })
    await f.call('/settle', { id, state: 'completed' })
    const receipt = { ...proof(id), policyRevision: 'astra-low-tiered-v1', capMicroUsd: pricing.maxProviderCents * 10000 }
    const result = await f.call('/reconcile-studio-provider', { id, receipt })
    assert.equal(result.releasedCents, 0); assert.equal(result.retainedCents, 43)
    assert.equal(f.values().get('balance'), 1500 - pricing.points); assert.equal(f.values().get(PROVIDER), 0)
  }
})

test('malformed or unproven memberships never advertise the paid-points policy', async () => {
  for (const mutation of [{ plan: ['creator'] }, { terminal: 'true' }, { terminal: 1 }, { revision: '1' }, { revision: -1 }, { grantId: 'in_missing' }]) {
    const f = fixture(); await f.seed(); f.patch('subscription', { ...(f.values().get('subscription') as object), ...mutation })
    const status = await f.call('/status')
    assert.notEqual(status.paidGenerationPolicy, PAID_POINTS_POLICY)
    assert.equal((await f.call('/reserve', request(crypto.randomUUID()), 429)).allowed, false)
  }
  const malformed = fixture(); await malformed.seed(); malformed.patch('subscription', { ...(malformed.values().get('subscription') as object), until: Infinity })
  await malformed.call('/status', undefined, 503)
  const f = fixture(); await f.seed(); f.patch('grant:in_points', { credits: 1500, revoked: 0 })
  assert.notEqual((await f.call('/status')).paidGenerationPolicy, PAID_POINTS_POLICY)
})

test('1500 paid points exhaust exactly at the catalogue prices without a daily or monthly attempt counter', async () => {
  for (const [channel, model, pricing, expected] of [
    ['blueprint', 'luna', undefined, 100], ['blueprint', 'sol', undefined, 30], ['blueprint', 'astra', undefined, 6],
    ['studio', 'astra', undefined, 6], ['studio', 'astra', STUDIO_PRICING.standard, 6], ['studio', 'astra', STUDIO_PRICING.extended, 3],
  ] as const) {
    const f = fixture(); await f.seed()
    f.patch('creator-astra:in_points', 999)
    for (let index = 0; index < expected; index++) assert.equal((await f.call('/reserve', request(crypto.randomUUID(), channel, model, pricing))).allowed, true)
    assert.equal((await f.call('/reserve', request(crypto.randomUUID(), channel, model, pricing), 429)).reason, 'CREDITS_EXHAUSTED')
    assert.equal((await f.call('/status')).availableCredits, 0)
    assert.equal(f.values().get(PROVIDER), 0); assert.equal(f.values().get('creator-astra:in_points'), 999)
  }
})


test('new paid policy requires exact consent before any financial write; existing commitments remain recoverable', async () => {
  const f = fixture(); await f.seed(); const id = crypto.randomUUID(), before = f.values()
  for (const policy of [undefined, 'paid-membership-points-v2', ['paid-membership-held-points-v1']]) {
    assert.equal((await f.call('/reserve', { ...request(id), paidPointsPolicy: policy }, 429)).allowed, false)
    assert.deepEqual(f.values(), before)
  }
  await f.call('/reserve', request(id))
  assert.equal((await f.call('/reserve', { ...request(id), paidPointsPolicy: undefined })).repeated, true)
  assert.equal((await f.call('/status')).reservedCredits, 250)
})

test('owned pending-cost review pages remain bounded, complete and read-only after restart', async () => {
  const f = fixture(); await f.seed()
  const ids: string[] = []
  for (let index = 1; index <= 20; index++) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; ids.push(id)
    await f.call('/reserve', request(id, 'blueprint', 'luna')); await f.call('/blueprint-dispatch', { id, fingerprint }); await f.call('/settle', { id, state: 'failed' })
  }
  f.restart(); const before = f.values(), received: string[] = []; let cursor: string | null = null
  do {
    const snapshot = await f.call('/generation-funding' + (cursor ? '?pendingAfter=' + cursor : '')), page = snapshot.pendingCostReviews
    assert.ok(page.items.length <= 8); assert.ok(['partial', 'complete'].includes(page.scanStatus))
    for (const item of page.items) { assert.equal(item.heldPoints, 15); assert.equal(item.channel, 'blueprint'); assert.equal(item.model, 'luna'); received.push(item.id) }
    cursor = page.nextCursor
    assert.equal(page.hasMore, cursor !== null)
  } while (cursor)
  assert.deepEqual(received, ids); assert.deepEqual(f.values(), before)
  for (const query of ['?pendingAfter=other-account', '?pendingAfter=' + ids[0] + '&pendingAfter=' + ids[1], '?accountId=' + ACCOUNT]) await f.call('/generation-funding' + query, undefined, 400)
  assert.deepEqual(f.values(), before)
})
