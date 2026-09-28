import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
function fixture() {
  const values = new Map<string, unknown>(); let queue = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(run: (storage: EntitlementStorage) => Promise<T>): Promise<T> {
      const next = queue.then(() => run(storage)); queue = next.then(() => {}, () => {}); return next
    },
  }
  const ledger = new AccountEntitlements({ storage })
  const call = async (path: string, value?: unknown) => {
    const response = await ledger.fetch(new Request('https://internal' + path, { method: value === undefined ? 'GET' : 'POST', ...(value === undefined ? {} : { body: JSON.stringify(value) }) }))
    return { status: response.status, value: await response.json() as Record<string, unknown> }
  }
  return { values, call }
}
test('Luna and Terra debit their own prices, and a replay cannot change model', async () => {
  const f = fixture()
  await f.call('/grant', { id: 'in_fixture', credits: 1500 })
  const id = crypto.randomUUID()
  assert.equal((await f.call('/reserve', { id, profile: 'fast', model: 'luna' })).value.cost, 5)
  assert.equal((await f.call('/status')).value.credits, 1495)
  assert.equal((await f.call('/reserve', { id, profile: 'fast', model: 'terra' })).value.allowed, false)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model: 'terra' })).value.cost, 60)
  assert.equal((await f.call('/status')).value.credits, 1435)
  assert.equal(f.values.get('provider-budget-cents:v1'), 1050 - 3 - 42)
})
test('changing budget model does not multiply personal free trials or unlock Astra', async () => {
  const f = fixture()
  for (const model of ['sol', 'luna']) assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model })).value.cost, 0)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model: 'terra' })).value.allowed, false)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'slow', model: 'astra' })).value.allowed, false)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model: 'astra' })).status, 400)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model: '__proto__' })).status, 400)
})
test('refunded points do not restore provider funds, including cheap-model retries', async () => {
  const f = fixture(); await f.call('/grant', { id: 'in_fixture', credits: 50 })
  const id = crypto.randomUUID()
  await Promise.all(Array.from({ length: 8 }, () => f.call('/reserve', { id, profile: 'fast', model: 'luna' })))
  assert.equal((await f.call('/status')).value.credits, 45)
  await f.call('/settle', { id, state: 'failed' })
  assert.equal((await f.call('/status')).value.credits, 50)
  assert.equal(f.values.get('provider-budget-cents:v1'), 32)
})
