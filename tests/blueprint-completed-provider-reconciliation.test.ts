import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { MODEL_CATALOG, blueprintReservationMicroUsd, type GenerationModel } from '../src/lib/modelCatalog.ts'
const NOW = Date.parse('2026-10-03T20:00:00Z'), PROVIDER = 'provider-budget-cents:v1', fingerprint = 'a'.repeat(64)
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), n => n.toString(16).padStart(2, '0')).join('')
function fixture() {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve(), fail = false
  const storageFor = (data: Map<string, unknown>): EntitlementStorage => ({
    async get<T>(key: string) { return structuredClone(data.get(key)) as T | undefined },
    async put(key, value) { if (fail && key.startsWith('job:') && (value as Record<string, unknown>).blueprintProviderReconciliation) throw new Error('Inert marker-write failure'); data.set(key, structuredClone(value)) },
    async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      return new Map([...data].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter)).slice(0, options.limit)) as Map<string, T>
    },
    transaction<T>(callback: (tx: EntitlementStorage) => Promise<T>) {
      const run = queue.then(async () => { const staged = structuredClone(data); const result = await callback(storageFor(staged)); data.clear(); for (const [key, value] of staged) data.set(key, value); return result })
      queue = run.catch(() => undefined); return run
    },
  })
  let ledger = new AccountEntitlements({ storage: storageFor(values) }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW)
  const call = async (path: string, body: unknown) => { const response = await ledger.fetch(new Request('https://ledger.test' + path, { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, value: await response.json() as Record<string, unknown> } }
  const fund = async () => { await call('/grant', { id: 'in_fixture', credits: 4500, subscriptionId: 'sub_fixture' }); await call('/subscription', { id: 'sub_fixture', active: true, until: NOW + 86400000, revision: 1, plan: 'pro', grantId: 'in_fixture' }) }
  const completed = async (model: GenerationModel = 'sol', legacy = false) => {
    const id = crypto.randomUUID()
    await call('/reserve', { id, channel: 'blueprint', model, profile: model === 'astra' ? 'slow' : 'fast', fingerprint, ...(!legacy ? { blueprintDispatch: 'fenced-v1' } : {}) })
    if (!legacy) assert.equal((await call('/blueprint-dispatch', { id, fingerprint })).value.dispatch, true)
    const blueprint = demoBlueprint('An inert green tower'), result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model: MODEL_CATALOG[model].model, limitation: 'Inert fixture with no provider calls', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
      evidence: { providerResponseId: 'resp_fixture', receivedAt: new Date(NOW).toISOString(), blueprintSha256: await hash(blueprint), inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } }
    assert.equal((await call('/blueprint-complete', { id, result })).value.saved, true)
    if (legacy) { const row = values.get(`job:${id}`) as Record<string, unknown>; delete row.channel; delete row.updatedAt }
    return id
  }
  return { values, call, fund, completed, reconcile: (id: string) => call('/reconcile-blueprint-provider', { id }), fault: (enabled: boolean) => { fail = enabled }, restart: () => { ledger = new AccountEntitlements({ storage: storageFor(values) }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW) } }
}

test('completed paid Blueprint recovers only a conservative whole-output ceiling once across models, legacy rows and replay', async () => {
  for (const model of ['luna', 'sol', 'astra'] as const) for (const legacy of [false, true]) {
    const f = fixture(); await f.fund(); const id = await f.completed(model, legacy), before = structuredClone([...f.values])
    const retained = Math.ceil(blueprintReservationMicroUsd(model, 1000, 4000) / 10000), released = MODEL_CATALOG[model].maxProviderCents - retained
    const results = await Promise.all(Array.from({ length: 12 }, () => f.reconcile(id)))
    assert.equal(results.filter(reply => reply.value.repeated === false).length, 1)
    assert.ok(results.every(reply => reply.value.reconciled === true && reply.value.retainedCents === retained && reply.value.releasedCents === released))
    assert.equal(f.values.get(PROVIDER), 3150 - retained)
    for (const [key, value] of before) if (key !== PROVIDER && key !== `job:${id}`) assert.deepEqual(f.values.get(key), value, key)
    assert.equal(f.values.get('balance'), 4500 - MODEL_CATALOG[model].creditsPerGeneration)
    f.restart(); assert.equal((await f.reconcile(id)).value.repeated, true)
    assert.equal((await f.call('/blueprint-dispatch', { id, fingerprint })).value.dispatch, false)
  }
})

test('unverified historical failures, Studio, free, support, missing usage and mismatched results retain every reserved cent', async () => {
  const variants: [string, (job: Record<string, unknown>, result: Record<string, unknown>) => void][] = [
    ['failed', j => { j.state = 'failed' }], ['bare Studio', j => { delete j.fingerprint; delete j.channel }], ['Studio channel', j => { j.channel = 'studio' }],
    ['hold-v1 Studio', j => { j.billingMode = 'hold-v1' }], ['free', j => { j.kind = 'free'; j.cost = 0 }], ['support', j => { j.supportApprovalId = crypto.randomUUID() }],
    ['supplemental', j => { j.supplementalGrantId = crypto.randomUUID() }], ['wrong cost', j => { j.cost = 250 }], ['unknown field', j => { j.unknown = true }],
    ['ready dispatch', j => { j.blueprintDispatch = 'ready-v1' }], ['released reservation', j => { (j.blueprintProviderReservation as Record<string, unknown>).state = 'released' }],
    ['wrong request', (_, r) => { r.requestId = crypto.randomUUID() }], ['wrong model', (_, r) => { r.model = 'gpt-6-astra' }],
    ['missing delivery', (_, r) => { delete r.delivery }], ['hash mismatch', (_, r) => { (r.evidence as Record<string, unknown>).blueprintSha256 = 'b'.repeat(64) }],
    ['no usage', (_, r) => { Object.assign(r.evidence as object, { inputTokens: null, outputTokens: null, totalTokens: null }) }],
    ['long context', (_, r) => { Object.assign(r.evidence as object, { inputTokens: 32769, outputTokens: 100, totalTokens: 32869 }) }],
    ['excess output', (_, r) => { Object.assign(r.evidence as object, { inputTokens: 1000, outputTokens: 4001, totalTokens: 5001 }) }],
    ['bad total', (_, r) => { (r.evidence as Record<string, unknown>).totalTokens = 2 }],
    ['past response', (_, r) => { (r.evidence as Record<string, unknown>).receivedAt = new Date(NOW - 1).toISOString() }],
    ['future response', (_, r) => { (r.evidence as Record<string, unknown>).receivedAt = new Date(NOW + 1).toISOString() }],
    ['corrupt marker', j => { j.blueprintProviderReconciliation = null }],
  ]
  for (const [label, mutate] of variants) {
    const f = fixture(); await f.fund(); const id = await f.completed()
    mutate(f.values.get(`job:${id}`) as Record<string, unknown>, f.values.get(`blueprint-result:${id}`) as Record<string, unknown>)
    const before = structuredClone([...f.values]), reply = await f.reconcile(id)
    assert.equal(reply.value.reconciled, false, label); assert.deepEqual([...f.values], before, label)
  }
  const f = fixture(); await f.fund(); const id = await f.completed(); f.values.delete(`blueprint-result:${id}`)
  const before = structuredClone([...f.values]); assert.equal((await f.reconcile(id)).value.reconciled, false); assert.deepEqual([...f.values], before)
})

test('ledger credit and immutable proof roll back together; replay with modified evidence or missing funding cannot reseed', async () => {
  const f = fixture(); await f.fund(); const id = await f.completed(), before = structuredClone([...f.values])
  f.fault(true); assert.equal((await f.reconcile(id)).status, 503); assert.deepEqual([...f.values], before)
  f.fault(false); assert.equal((await f.reconcile(id)).value.reconciled, true)
  const result = f.values.get(`blueprint-result:${id}`) as Record<string, unknown>
  ;(result.evidence as Record<string, unknown>).providerResponseId = 'resp_different'
  const after = structuredClone([...f.values]); assert.equal((await f.reconcile(id)).value.reconciled, false); assert.deepEqual([...f.values], after)
  for (const value of [undefined, NaN, Number.MAX_SAFE_INTEGER]) {
    const g = fixture(); await g.fund(); const next = await g.completed()
    if (value === undefined) g.values.delete(PROVIDER); else g.values.set(PROVIDER, value)
    const snapshot = structuredClone([...g.values]); assert.equal((await g.reconcile(next)).status, 503); assert.deepEqual([...g.values], snapshot)
  }
})

test('mixed funded history pages cap all recovery candidates together and preserve the old Studio-only contract', async () => {
  const f = fixture(); await f.fund()
  for (let i = 0; i < 10; i++) await f.completed('sol', true)
  const old = await f.call('/studio-provider-pending', {})
  assert.deepEqual(old.value, { ids: [], nextCursor: null, hasMore: false })
  const first = await f.call('/provider-reconciliation-pending', {})
  assert.equal((first.value.ids as string[]).length + (first.value.blueprintIds as string[]).length, 8)
  assert.equal(first.value.hasMore, true)
  const second = await f.call('/provider-reconciliation-pending', { cursor: first.value.nextCursor })
  assert.equal((second.value.blueprintIds as string[]).length, 2); assert.equal(second.value.hasMore, false)
})

test('a reversed payment stays a debt after only verified unused Blueprint funding is returned', async () => {
  const f = fixture(); await f.fund(); const id = await f.completed()
  await f.call('/revoke', { id: 'in_fixture', credits: 4500, review: true })
  assert.equal(f.values.get(PROVIDER), -35)
  await f.reconcile(id)
  assert.equal(f.values.get(PROVIDER), -9); assert.equal(f.values.get('balance'), -50); assert.equal(f.values.get('billingHold'), true)
})
