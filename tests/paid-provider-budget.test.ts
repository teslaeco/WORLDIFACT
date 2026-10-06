import { historicalInternalUrl } from '../server/historicalDataBoundary.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'

function fixture(legacyCredits = 0) {
  const values = new Map<string, unknown>([['balance', legacyCredits]])
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(fn: (s: EntitlementStorage) => Promise<T>) { const next = queue.then(() => fn(storage)); queue = next.catch(() => {}); return next },
  }
  let object = new AccountEntitlements({ storage })
  const call = async (path: string, body?: unknown) => {
    const response = await object.fetch(new Request(historicalInternalUrl('https://internal', path), { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    return { status: response.status, data: await response.json() as Record<string, unknown> }
  }
  return { values, call, restart: () => { object = new AccountEntitlements({ storage }) } }
}

test('thirty failed paid attempts cannot turn returned customer credits into unlimited provider spend', async () => {
  const f = fixture()
  await f.call('/grant', { id: 'in_Paid', credits: 1500 })
  for (let i = 0; i < 30; i++) {
    const id = crypto.randomUUID()
    assert.equal((await f.call('/reserve', { id, profile: 'fast' })).data.allowed, true)
    await f.call('/settle', { id, state: 'failed' })
  }
  assert.equal((await f.call('/status')).data.credits, 1500)
  assert.equal(f.values.get('provider-budget-cents:v1'), 0)
  f.restart()
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).data.reason, 'PROVIDER_BUDGET_EXHAUSTED')
  await f.call('/grant', { id: 'in_Paid', credits: 1500 })
  assert.equal(f.values.get('provider-budget-cents:v1'), 0, 'A replayed purchase cannot reset spent funds')
  await f.call('/grant', { id: 'in_NewPayment', credits: 1500 })
  assert.equal(f.values.get('provider-budget-cents:v1'), 1050)
})

test('legacy funding is seeded once; concurrent replays debit only one provider reservation', async () => {
  const f = fixture(1500), id = crypto.randomUUID()
  const replies = await Promise.all(Array.from({ length: 12 }, () => f.call('/reserve', { id, profile: 'fast' })))
  assert.equal(replies.filter(r => r.data.repeated === false).length, 1)
  assert.equal(f.values.get('provider-budget-cents:v1'), 1015)
  await f.call('/settle', { id, state: 'failed' })
  f.restart()
  await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })
  assert.equal(f.values.get('provider-budget-cents:v1'), 980)
})

test('payment reversals remove provider funding once; reversal-before-payment never funds work', async () => {
  const f = fixture()
  await f.call('/grant', { id: 'in_Refund', credits: 1500 })
  const id = crypto.randomUUID()
  await f.call('/reserve', { id, profile: 'fast' })
  await f.call('/settle', { id, state: 'failed' })
  await f.call('/revoke', { id: 'in_Refund', credits: 1500 })
  assert.equal(f.values.get('provider-budget-cents:v1'), -35)
  await f.call('/revoke', { id: 'in_Refund', credits: 1500 })
  await f.call('/grant', { id: 'in_Refund', credits: 1500 })
  assert.equal(f.values.get('provider-budget-cents:v1'), -35)
  const before = fixture()
  await before.call('/revoke', { id: 'in_ReversedFirst', credits: 1500 })
  await before.call('/grant', { id: 'in_ReversedFirst', credits: 1500 })
  assert.equal(before.values.get('provider-budget-cents:v1'), undefined)
})

test('a corrupt budget never becomes fresh funding', async () => {
  const f = fixture(1500)
  f.values.set('provider-budget-cents:v1', NaN)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).status, 503)
  assert.equal((await f.call('/status')).data.credits, 1500)
})
