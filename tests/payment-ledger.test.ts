import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, type EntitlementEnv, type EntitlementStorage } from '../server/entitlements.ts'
import { handle } from '../server/worker.ts'

function ledger() {
  const entries = new Map<string, unknown>()
  let queued: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(entries.get(key)) as T | undefined },
    async put(key, value) { entries.set(key, structuredClone(value)) },
    transaction<T>(fn: (storage: EntitlementStorage) => Promise<T>) { const next = queued.then(() => fn(storage)); queued = next.catch(() => undefined); return next },
  }
  let object = new AccountEntitlements({ storage })
  return {
    async call(path: string, body?: unknown) {
      const response = await object.fetch(new Request(`https://ledger.test${path}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
      return { status: response.status, data: await response.json() as { id: string; url: string; saved: boolean; owned: boolean; cleared: boolean; credits: number; cost: number; billingReview: boolean; reason: string; downloadAllowed: boolean; subscription: { active: boolean } } }
    },
    restart() { object = new AccountEntitlements({ storage }) },
  }
}
const ORDER = '1AB23456CD789012E'
const CAPTURE = 'pp_9AB23456CD789012E'
test('Worker routes independent payment status endpoints and never enables unconfigured checkout', async () => {
  const noFetch = (async () => { throw new Error('No provider call expected') }) as typeof fetch
  const stripe = await handle(new Request('https://worldifact.test/api/billing/status'), {}, noFetch)
  const paypal = await handle(new Request('https://worldifact.test/api/billing/paypal/status'), {}, noFetch)
  assert.equal(stripe.status, 200)
  assert.equal(paypal.status, 200)
  const stripeStatus = await stripe.json() as { topupReady: boolean; price: { amount: number; currency: string; credits: number }; subscriptionPrice: { amount: number; currency: string; credits: number } }
  assert.equal(stripeStatus.topupReady, false)
  for (const price of [stripeStatus.price, stripeStatus.subscriptionPrice]) {
    assert.equal(price.amount, 2999)
    assert.equal(price.currency, 'USD')
    assert.equal(price.credits, 1500)
  }
  const status = await paypal.json() as { ready: boolean; amount: string; currency: string; credits: number; hostedButtonId: string; hostedButtonReady: boolean }
  assert.equal(status.amount, '29.99')
  assert.equal(status.currency, 'USD')
  assert.equal(status.credits, 1500)
  assert.equal(status.ready, false)
  assert.equal(status.hostedButtonId, 'N4DCJJHHW747S')
  assert.equal(status.hostedButtonReady, false)
  assert.equal((await handle(new Request('https://worldifact.test/api/billing/paypal/order', { method: 'POST' }), {}, noFetch)).status, 503)
})
test('Sandbox and live ledger namespaces cannot share credits, customer IDs or order state', async () => {
  const requested: string[] = []
  const env: EntitlementEnv = { ACCOUNT_ENTITLEMENTS: {
    idFromName(name) { requested.push(name); return name },
    get() { return { fetch: async () => Response.json({ credits: 0 }) } },
  } }
  const uid = 'b8867f90-8703-4d20-b97e-4b6b4c24d142'
  await entitlementCall(env, uid, '/status')
  await entitlementCall({ ...env, ACCOUNT_LEDGER_MODE: 'sandbox' }, uid, '/status')
  await entitlementCall({ ...env, ACCOUNT_LEDGER_MODE: 'live' }, uid, '/status')
  assert.equal(requested[0], requested[2])
  assert.notEqual(requested[0], requested[1])
  await assert.rejects(() => entitlementCall({ ...env, ACCOUNT_LEDGER_MODE: 'invalid' }, uid, '/status'))
})
test('PayPal concurrent reservations bind one order, survive restart, and retain purchase ownership after clearing', async () => {
  const a = ledger(), b = ledger()
  const attempts = await Promise.all(Array.from({ length: 12 }, () => a.call('/paypal-reserve', {})))
  assert.equal(new Set(attempts.map(value => value.data.id)).size, 1)
  const id = attempts[0].data.id
  const url = `https://www.sandbox.paypal.com/checkoutnow?token=${ORDER}`
  assert.equal((await a.call('/paypal-order', { id, orderId: ORDER, url })).data.saved, true)
  assert.equal((await a.call('/paypal-order', { id, orderId: '2AB23456CD789012E', url: 'https://www.sandbox.paypal.com/checkoutnow?token=2AB23456CD789012E' })).data.saved, false)
  a.restart()
  assert.equal((await a.call('/paypal-reserve', {})).data.url, url)
  assert.equal((await b.call('/paypal-get', { orderId: ORDER })).data.owned, false)
  assert.equal((await a.call('/paypal-clear', { id: crypto.randomUUID() })).data.cleared, false)
  assert.equal((await a.call('/paypal-clear', { id })).data.cleared, true)
  assert.equal((await a.call('/paypal-get', { orderId: ORDER })).data.id, id)
  assert.notEqual((await a.call('/paypal-reserve', {})).data.id, id)
})
test('PayPal checkout ledger rejects foreign URLs, credentials, token mismatch and path injection', async () => {
  const a = ledger(), id = (await a.call('/paypal-reserve', {})).data.id
  for (const url of [`https://attacker.test/checkoutnow?token=${ORDER}`, `https://www.paypal.com@attacker.test/checkoutnow?token=${ORDER}`, `https://user@www.paypal.com/checkoutnow?token=${ORDER}`, `https://www.paypal.com/checkoutnow?token=OTHER`, `https://www.paypal.com/other?token=${ORDER}`]) {
    assert.equal((await a.call('/paypal-order', { id, orderId: ORDER, url })).status, 400)
  }
  assert.equal((await a.call('/paypal-get', { orderId: '../capture' })).status, 400)
})
test('One-time PayPal credit grant does not activate SLOW downloads and cannot be replayed after refund', async () => {
  const a = ledger(), id = crypto.randomUUID()
  for (let i = 0; i < 3; i++) await a.call('/grant', { id: CAPTURE, credits: 1500 })
  assert.equal((await a.call('/status')).data.credits, 1500)
  assert.equal((await a.call('/status')).data.subscription.active, false)
  assert.equal((await a.call('/reserve', { id, profile: 'slow' })).data.cost, 50)
  await a.call('/settle', { id, state: 'completed' })
  assert.equal((await a.call('/job', { id })).data.downloadAllowed, false)
  await a.call('/revoke', { id: CAPTURE, credits: 1500 })
  await a.call('/grant', { id: CAPTURE, credits: 1500 })
  assert.equal((await a.call('/status')).data.credits, -50)
})
test('Disputed payment puts nonnegative account balance on hold; reversed-before-paid leaves a tombstone', async () => {
  const a = ledger()
  await a.call('/grant', { id: 'pp_8AB23456CD789012E', credits: 1500 })
  await a.call('/revoke', { id: CAPTURE, credits: 1500, review: true })
  await a.call('/grant', { id: CAPTURE, credits: 1500 })
  assert.equal((await a.call('/status')).data.credits, 1500)
  assert.equal((await a.call('/status')).data.billingReview, true)
  assert.equal((await a.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).data.reason, 'BILLING_REVIEW_REQUIRED')
})
