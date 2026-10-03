import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementApi, type EntitlementStorage, type EntitlementStatus } from '../server/entitlements.ts'

const now = Date.parse('2026-10-01T12:00:00Z')
function fixture(seed: Record<string, unknown> = {}, enabled = true) {
  const values = new Map(Object.entries(seed))
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(f: (s: EntitlementStorage) => Promise<T>) { const next = queue.then(() => f(storage)); queue = next.catch(() => {}); return next },
  }
  const object = new AccountEntitlements({ storage }, { ENABLE_ASTRA_PLANS: String(enabled) }, () => now)
  const call = async (path: string, body?: unknown) => (await object.fetch(new Request('https://internal' + path, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))).json() as Promise<Record<string, any>>
  return { values, call, object, status: async () => await call('/status') as EntitlementStatus }
}
const subscription = { id: 'sub_fixture', active: true, until: now + 86_400_000, revision: 1, plan: 'pro', grantId: 'in_fixture' }
const base = { balance: 3000, subscription, 'provider-budget-cents:v1': 2100 }

test('authenticated admission projection distinguishes a funded balance from exhausted provider or points without writes', async () => {
  for (const [extra, reason] of [
    [{ 'provider-budget-cents:v1': 174 }, 'PROVIDER_BUDGET_EXHAUSTED'],
    [{ billingHold: true }, 'BILLING_REVIEW_REQUIRED'],
    [{ 'customer-reserved-credits:v1': 2800 }, 'CREDITS_EXHAUSTED'],
    [{ subscription: { ...subscription, active: false } }, 'ASTRA_PLAN_REQUIRED'],
  ] as const) {
    const f = fixture({ ...base, ...extra }), before = structuredClone([...f.values])
    const status = await f.status()
    assert.equal(status.credits, 3000)
    assert.deepEqual(status.generationAdmission.astra, { allowed: false, reason })
    assert.deepEqual([...f.values], before, 'Reading eligibility must not change any counter')
    assert.equal(JSON.stringify(status).includes('provider-budget'), false)
    const reserved = await f.call('/reserve', { id: crypto.randomUUID(), profile: 'slow' })
    assert.equal(reserved.reason, reason, 'Projected denial matches authoritative reservation order')
    assert.deepEqual([...f.values], before, 'A denied admission must not reserve points/provider capacity')
  }
})

test('a legacy eligibility read does not initialize budget and mirrors reserve for each model', async () => {
  for (const model of ['luna', 'sol', 'astra'] as const) {
    const f = fixture({ balance: 3000, subscription })
    const before = structuredClone([...f.values]), status = await f.status()
    assert.deepEqual(status.generationAdmission[model], { allowed: true })
    assert.deepEqual([...f.values], before)
    const result = await f.call('/reserve', { id: crypto.randomUUID(), model, profile: model === 'astra' ? 'slow' : 'fast' })
    assert.equal(result.allowed, true)
  }
})

test('free eligibility and disabled runtime gate match reservation without implying Astra access', async () => {
  const free = fixture()
  assert.deepEqual((await free.status()).generationAdmission.sol, { allowed: true })
  assert.deepEqual((await free.status()).generationAdmission.astra, { allowed: false, reason: 'ASTRA_PLAN_REQUIRED' })
  for (let i = 0; i < 2; i++) await free.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })
  assert.deepEqual((await free.status()).generationAdmission.sol, { allowed: false, reason: 'FAST_DAILY_LIMIT' })
  for (const plan of ['creator', 'pro', 'studio']) {
    const disabled = fixture({ ...base, subscription: { ...subscription, plan } }, false)
    assert.deepEqual((await disabled.status()).generationAdmission.astra, { allowed: false, reason: 'ASTRA_RUNTIME_DISABLED' })
    assert.equal((await disabled.call('/reserve', { id: crypto.randomUUID(), profile: 'slow' })).reason, 'ASTRA_RUNTIME_DISABLED')
  }
})

test('invalid provider state stays unverifiable and is never seeded by account reads', async () => {
  const f = fixture({ ...base, 'provider-budget-cents:v1': NaN }), before = structuredClone([...f.values])
  assert.deepEqual((await f.status()).generationAdmission.astra, { allowed: false, reason: 'ACCOUNT_ADMISSION_UNAVAILABLE' })
  assert.deepEqual([...f.values], before)
})

test('eligibility is served only for the verified account, ignores caller-supplied identity, and stays private', async () => {
  const f = fixture({ ...base, 'provider-budget-cents:v1': 0 })
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const names: string[] = []
  const env = { ACCOUNT_ENTITLEMENTS: { idFromName(name: string) { names.push(name); return name }, get() { return f.object } } }
  let authReads = 0
  const fetcher = (async () => { authReads++; return Response.json({ id: owner }) }) as typeof fetch
  const url = `https://worldifact.test/api/account/entitlements?userId=${other}`
  assert.equal((await entitlementApi(new Request(url), env, fetcher))?.status, 401)
  assert.equal(authReads, 0)
  assert.deepEqual(names, [])
  const response = await entitlementApi(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-access-fixture' } }), env, fetcher)
  assert.equal(response?.status, 200)
  assert.equal(response?.headers.get('cache-control'), 'private, no-store')
  const result = await response!.json() as EntitlementStatus
  assert.deepEqual(result.generationAdmission.astra, { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' })
  assert.deepEqual(names, [`account:v1:${owner}`])
  assert.equal(JSON.stringify(result).includes('provider-budget-cents'), false)
})
