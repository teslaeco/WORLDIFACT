import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementEnv, type EntitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { STUDIO_PRICING, type StudioPricing } from '../src/lib/studioPricing.ts'
import { validateTerminalBudgetReceipt, type TerminalBudgetReceipt } from '../server/studioBudgetReceipt.ts'
import { providerReserveCents } from '../server/generationEconomics.ts'

const NOW = Date.parse('2026-10-03T12:00:00Z'), PROVIDER = 'provider-budget-cents:v1'
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', APPROVAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fingerprint = 'a'.repeat(64)
const receipt = (jobId: string, pricing?: StudioPricing, liability = 420001): TerminalBudgetReceipt => ({
  revision: 'worldifact-terminal-budget-v1', jobId, model: 'gpt-6-astra',
  policyRevision: pricing ? 'astra-low-tiered-v1' : 'astra-low-reconciled-v2',
  capMicroUsd: (pricing ? pricing.maxProviderCents * 10_000 : 1750000) as TerminalBudgetReceipt['capMicroUsd'],
  maximumLiabilityMicroUsd: liability, sealed: true, sealId: 'b'.repeat(64),
})
function fixture(support = false) {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (store: EntitlementStorage) => Promise<T>) {
      const next = queue.then(async () => {
        const draft = structuredClone(values)
        const tx: EntitlementStorage = { async get<V>(key: string) { return structuredClone(draft.get(key)) as V | undefined },
          async put(key, value) { draft.set(key, structuredClone(value)) }, transaction: async fn => fn(tx) }
        const result = await callback(tx)
        values.clear(); for (const [key, value] of draft) values.set(key, value)
        return result
      })
      queue = next.catch(() => undefined); return next
    },
  }
  const approval = { version: 1, accountId: USER, approvalId: APPROVAL, amountCents: 175,
    issuedAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW + 1000).toISOString() }
  const config = { ENABLE_ASTRA_PLANS: 'true', ...(support ? { WORLDIFACT_ASTRA_SUPPORT_ONCE: JSON.stringify(approval),
    WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT: JSON.stringify({ ...approval, approvalId: undefined, grantId: APPROVAL }) } : {}) }
  let object = new AccountEntitlements({ storage }, config, () => NOW)
  const headers = { 'X-WORLDIFACT-Verified-Account': USER, 'X-WORLDIFACT-Support-Approval': APPROVAL }
  const call = async (path: string, body?: unknown) => {
    const response = await object.fetch(new Request('https://fixture.internal' + path, { headers,
      method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    return { status: response.status, data: await response.json() as Record<string, unknown> }
  }
  const env: EntitlementEnv = { ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get: () => object } }
  return { values, call, env,
    async fund(credits = 1500) {
      await call('/grant', { id: 'in_tiers', credits, subscriptionId: 'sub_tiers' })
      await call('/subscription', { id: 'sub_tiers', active: true, until: NOW + 86_400_000, revision: 1, plan: 'pro', grantId: 'in_tiers' })
    },
    reserve: (id: string, pricing?: StudioPricing) => call('/reserve', { id, channel: 'studio', profile: 'slow', fingerprint, ...(pricing ? { pricing } : {}) }),
    dispatch: (id: string) => call('/studio-dispatch', { id, fingerprint }),
    settle: (id: string, state = 'failed') => call('/settle', { id, state }),
    reconcile: (id: string, proof: TerminalBudgetReceipt) => call('/reconcile-studio-provider', { id, receipt: proof }),
    job: (id: string) => values.get(`job:${id}`) as Record<string, unknown>,
    async status() { return (await call('/status')).data as unknown as EntitlementStatus },
    restart() { object = new AccountEntitlements({ storage }, config, () => NOW) },
  }
}

test('legacy Studio terms reserve the exact points and cap, expose saved terms, and settle once', async () => {
  for (const pricing of Object.values(STUDIO_PRICING)) for (const state of ['completed', 'failed']) {
    const f = fixture(), id = crypto.randomUUID(); await f.fund()
    const reserve = (await f.reserve(id, pricing)).data
    assert.equal(reserve.allowed, true); assert.equal(reserve.cost, pricing.points); assert.deepEqual(reserve.pricing, pricing)
    assert.equal(f.values.get(PROVIDER), 1050 - pricing.maxProviderCents)
    assert.equal(f.values.get('balance'), 1500); assert.equal(f.values.get('customer-reserved-credits:v1'), pricing.points)
    const status = await f.status(); assert.equal(status.availableCredits, 1500 - pricing.points)
    assert.deepEqual((await f.call('/job', { id })).data.pricing, pricing)
    assert.deepEqual(((await f.call('/studio-current', {})).data.job as Record<string, unknown>).pricing, pricing)
    await f.dispatch(id)
    await Promise.all(Array.from({ length: 8 }, () => f.settle(id, state)))
    assert.equal(f.values.get('balance'), state === 'completed' ? 1500 - pricing.points : 1500)
    assert.equal(f.values.get('customer-reserved-credits:v1'), 0)
    assert.equal(f.values.get(PROVIDER), 1050 - pricing.maxProviderCents, 'Dispatched liability remains held until authenticated evidence')
    await f.settle(id, state === 'completed' ? 'failed' : 'completed')
    assert.equal(f.values.get('balance'), state === 'completed' ? 1500 - pricing.points : 1500)
  }
})

test('tier terms are immutable across idempotent replay and legacy175 stays distinct from standard200', async () => {
  for (const pricing of [undefined, ...Object.values(STUDIO_PRICING)]) {
    const f = fixture(), id = crypto.randomUUID(); await f.fund(); await f.reserve(id, pricing)
    const before = structuredClone([...f.values]); f.restart()
    assert.equal((await f.reserve(id, pricing)).data.repeated, true)
    for (const changed of [undefined, ...Object.values(STUDIO_PRICING)].filter(value => value !== pricing))
      assert.equal((await f.reserve(id, changed)).data.reason, 'JOB_PRICING_MISMATCH')
    assert.deepEqual([...f.values], before)
    assert.equal(f.values.get(PROVIDER), 1050 - (pricing?.maxProviderCents ?? 175))
  }
})

test('forged caps, partial terms and wrong routes cannot acquire holds or funding', async () => {
  const f = fixture(); await f.fund(); const before = structuredClone([...f.values])
  for (const pricing of [null, {}, { ...STUDIO_PRICING.standard, points: 500 }, { ...STUDIO_PRICING.extended, points: 250 },
    { ...STUDIO_PRICING.extended, maxProviderCents: 200 }, { ...STUDIO_PRICING.standard, extra: true }, { ...STUDIO_PRICING.standard, revision: 'future' }]) {
    const response = await f.call('/reserve', { id: crypto.randomUUID(), channel: 'studio', profile: 'slow', fingerprint, pricing })
    assert.equal(response.status, 400); assert.deepEqual([...f.values], before)
  }
  for (const fields of [{ channel: 'blueprint', profile: 'slow', fingerprint }, { channel: 'studio', profile: 'fast', fingerprint }, { channel: 'studio', profile: 'slow' }]) {
    assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), ...fields, pricing: STUDIO_PRICING.standard })).status, 400)
    assert.deepEqual([...f.values], before)
  }
})

test('extended admission atomically requires500 available points and400 existing provider cents', async () => {
  for (const [credits, provider, reason] of [[499, 400, 'CREDITS_EXHAUSTED'], [500, 399, 'PROVIDER_BUDGET_EXHAUSTED']] as const) {
    const f = fixture(); await f.fund(credits); f.values.set(PROVIDER, provider); const before = structuredClone([...f.values])
    assert.equal((await f.reserve(crypto.randomUUID(), STUDIO_PRICING.extended)).data.reason, reason)
    assert.equal((await f.status()).studioAdmission.tiers.extended.reason, reason)
    assert.deepEqual([...f.values], before)
  }
  const f = fixture(); await f.fund(1000)
  assert.equal(f.values.get(PROVIDER), 700)
  const results = await Promise.all(Array.from({ length: 12 }, () => f.reserve(crypto.randomUUID(), STUDIO_PRICING.extended)))
  assert.equal(results.filter(value => value.data.allowed).length, 1)
  assert.ok(results.filter(value => !value.data.allowed).every(value => value.data.reason === 'PROVIDER_BUDGET_EXHAUSTED'))
  assert.equal(f.values.get('balance'), 1000); assert.equal(f.values.get('customer-reserved-credits:v1'), 500); assert.equal(f.values.get(PROVIDER), 300)
})

test('new prices never reseed or enlarge provider allocations or the legacy support grants', async () => {
  assert.equal(providerReserveCents(1500), 1050); assert.equal(providerReserveCents(4500), 3150); assert.equal(providerReserveCents(7500), 5250)
  const f = fixture(true); await f.fund(); f.values.set(PROVIDER, 175)
  const before = structuredClone([...f.values]), status = await f.status()
  assert.equal(status.studioAdmission.allowed, true)
  for (const pricing of Object.values(STUDIO_PRICING)) {
    assert.equal(status.studioAdmission.tiers[pricing.tier].reason, 'PROVIDER_BUDGET_EXHAUSTED')
    const denied = (await f.reserve(crypto.randomUUID(), pricing)).data
    assert.equal(denied.reason, 'PROVIDER_BUDGET_EXHAUSTED'); assert.equal(denied.supportEligible, undefined); assert.equal(denied.supplementalEligible, undefined)
  }
  f.restart(); assert.equal(f.values.get(PROVIDER), 175); assert.deepEqual([...f.values], before)
  assert.equal(f.values.get('support-astra-once:v1'), undefined); assert.equal(f.values.get('support-astra-supplemental:v1'), undefined)
  const id = crypto.randomUUID(); await f.reserve(id)
  assert.equal(f.values.get(PROVIDER), 175, 'The independently approved legacy175 support path is unchanged')
  assert.equal(f.job(id).supportApprovalId, APPROVAL)
  await f.dispatch(id); await f.settle(id)
  assert.equal((await f.reconcile(id, receipt(id, undefined, 0))).data.reason, 'INELIGIBLE_RESERVATION')
  assert.equal(f.values.get(PROVIDER), 175, 'Support funded jobs cannot receive an ordinary funding reconciliation')
})

test('terminal tier receipts bind stored cap and policy, round up liability, and return unused funds once', async () => {
  for (const pricing of Object.values(STUDIO_PRICING)) for (const liability of [0, 1, 9999, 10000, 10001, pricing.maxProviderCents * 10_000]) {
    const f = fixture(), id = crypto.randomUUID(); await f.fund(); await f.reserve(id, pricing); await f.dispatch(id); await f.settle(id)
    const before = structuredClone([...f.values])
    for (const wrong of [receipt(id), receipt(id, pricing.tier === 'standard' ? STUDIO_PRICING.extended : STUDIO_PRICING.standard)]) {
      assert.equal((await f.reconcile(id, wrong)).data.reason, 'RECEIPT_PRICING_MISMATCH'); assert.deepEqual([...f.values], before)
    }
    const proof = receipt(id, pricing, liability), retained = Math.ceil(liability / 10_000)
    assert.equal(validateTerminalBudgetReceipt(proof, id, pricing), true)
    assert.equal(validateTerminalBudgetReceipt(proof, id, null), false)
    const results = await Promise.all(Array.from({ length: 8 }, () => f.reconcile(id, proof)))
    assert.equal(results.filter(value => value.data.repeated === false).length, 1)
    assert.equal(f.values.get(PROVIDER), 1050 - retained)
    assert.equal(f.values.get('balance'), 1500); assert.equal(f.values.get('customer-reserved-credits:v1'), 0)
    const reconciled = f.job(id).studioProviderReconciliation as Record<string, unknown>
    assert.equal(reconciled.originalReservedCents, pricing.maxProviderCents)
    assert.equal(reconciled.retainedCents, retained); assert.equal(reconciled.releasedCents, pricing.maxProviderCents - retained)
    const after = structuredClone([...f.values])
    assert.equal((await f.reconcile(id, { ...proof, sealId: 'c'.repeat(64) })).data.reason, 'RECEIPT_CONFLICT')
    f.restart(); assert.equal((await f.reconcile(id, proof)).data.repeated, true); assert.deepEqual([...f.values], after)
    assert.equal(validateTerminalBudgetReceipt({ ...proof, maximumLiabilityMicroUsd: pricing.maxProviderCents * 10_000 + 1 }, id, pricing), false)
  }
})

test('a pre-dispatch tier failure and terminal receipt cannot return the same funding twice', async () => {
  for (const pricing of Object.values(STUDIO_PRICING)) {
    const f = fixture(), id = crypto.randomUUID(); await f.fund(); await f.reserve(id, pricing)
    await Promise.all(Array.from({ length: 8 }, (_, index) => index % 2 ? f.settle(id) : f.reconcile(id, receipt(id, pricing, 0))))
    assert.equal(f.values.get(PROVIDER), 1050); assert.equal(f.values.get('customer-reserved-credits:v1'), 0)
    assert.equal((await f.dispatch(id)).data.dispatch, false)
    assert.equal((await f.reconcile(id, receipt(id, pricing, 0))).data.reconciled, false)
    assert.equal(f.values.get(PROVIDER), 1050)
  }
})
