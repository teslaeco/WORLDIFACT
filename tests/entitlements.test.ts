import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, entitlementStatus, reserveUserGeneration, settleUserGeneration, userJobAccess, type EntitlementStorage, type EntitlementEnv } from '../server/entitlements.ts'
import { billingApi, verifyStripeSignature, type BillingEnv } from '../server/billing.ts'

const USER = 'b8867f90-8703-4d20-b97e-4b6b4c24d142'
const OTHER = '84d69075-9be3-4b70-b32c-b87bb714cae9'
const id = () => crypto.randomUUID()
function fixture() {
  let now = Date.parse('2026-09-21T12:00:00Z')
  const objects = new Map<string, AccountEntitlements>()
  const stores = new Map<string, EntitlementStorage>()
  const env: EntitlementEnv = {
    ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get: key => {
      const name = String(key)
      if (!objects.has(name)) {
        const data = new Map<string, unknown>(); let previous: Promise<unknown> = Promise.resolve()
        const storage: EntitlementStorage = {
          async get<T>(key: string) { return structuredClone(data.get(key)) as T | undefined },
          async put(key, value) { data.set(key, structuredClone(value)) },
          transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) { const current = previous.then(() => callback(storage)); previous = current.catch(() => undefined); return current },
        }
        stores.set(name, storage)
        objects.set(name, new AccountEntitlements({ storage }, {}, () => now))
      }
      return objects.get(name)!
    } },
  }
  return { env, setNow: (value: number) => { now = value }, now: () => now, recreate: () => { for (const [name, storage] of stores) objects.set(name, new AccountEntitlements({ storage }, {}, () => now)) } }
}
async function grant(env: EntitlementEnv, credits = 1500, grantId = 'in_fixture') {
  await entitlementCall(env, USER, '/grant', { id: grantId, credits, subscriptionId: 'sub_fixture' })
}
async function subscribe(env: EntitlementEnv, now: number, extra = {}) {
  await entitlementCall(env, USER, '/subscription', { id: 'sub_fixture', until: now + 31 * 86_400_000, active: true, revision: now, grantId: 'in_fixture', ...extra })
}

test('FAST free quota is atomic, rolls over after24h, and survives Durable Object recreation', async () => {
  const { env, now, setNow, recreate } = fixture()
  const responses = await Promise.all(Array.from({ length: 16 }, () => reserveUserGeneration(env, USER, id(), 'fast')))
  assert.equal(responses.filter(result => result.allowed).length, 2)
  assert.equal((await entitlementStatus(env, USER)).free.fastRemaining, 0)
  recreate()
  assert.equal((await reserveUserGeneration(env, USER, id(), 'fast')).allowed, false)
  setNow(now() + 86_400_000)
  assert.equal((await entitlementStatus(env, USER)).free.fastRemaining, 2)
  assert.equal((await reserveUserGeneration(env, USER, id(), 'fast')).allowed, true)
})
test('SLOW resets at UTC midnight while FAST retains its rolling24h window', async () => {
  const { env, setNow } = fixture()
  setNow(Date.parse('2026-09-21T23:59:00Z'))
  assert.equal((await reserveUserGeneration(env, USER, id(), 'slow')).allowed, true)
  assert.equal((await reserveUserGeneration(env, USER, id(), 'slow')).reason, 'SLOW_DAILY_LIMIT')
  await reserveUserGeneration(env, USER, id(), 'fast')
  setNow(Date.parse('2026-09-22T00:00:00Z'))
  assert.equal((await reserveUserGeneration(env, USER, id(), 'slow')).allowed, true)
  assert.equal((await entitlementStatus(env, USER)).free.fastRemaining, 1)
})
test('A1500-credit subscription buys exactly30 generations under concurrency; replay never charges twice', async () => {
  const { env, now } = fixture()
  await grant(env); await subscribe(env, now())
  const job = id()
  const repeated = await Promise.all(Array.from({ length: 10 }, () => reserveUserGeneration(env, USER, job, 'slow')))
  assert.equal(repeated.filter(result => result.repeated === false).length, 1)
  assert.equal((await entitlementStatus(env, USER)).credits, 1450)
  assert.equal((await reserveUserGeneration(env, USER, job, 'fast')).allowed, false)
  const rest = await Promise.all(Array.from({ length: 35 }, () => reserveUserGeneration(env, USER, id(), 'fast')))
  assert.equal(rest.filter(result => result.allowed).length, 29)
  assert.equal((await entitlementStatus(env, USER)).credits, 0)
  assert.equal((await reserveUserGeneration(env, USER, id(), 'slow')).reason, 'CREDITS_EXHAUSTED')
})
test('Only explicit failure refunds a reservation, once; completed jobs are terminal', async () => {
  const { env, now } = fixture()
  await grant(env); await subscribe(env, now())
  const failed = id(), success = id()
  await reserveUserGeneration(env, USER, failed, 'slow')
  await Promise.all(Array.from({ length: 8 }, () => settleUserGeneration(env, USER, failed, 'failed')))
  assert.equal((await entitlementStatus(env, USER)).credits, 1500)
  assert.equal((await reserveUserGeneration(env, USER, failed, 'slow')).allowed, false)
  await reserveUserGeneration(env, USER, success, 'slow')
  await settleUserGeneration(env, USER, success, 'completed')
  await settleUserGeneration(env, USER, success, 'failed')
  assert.equal((await entitlementStatus(env, USER)).credits, 1450)
})
test('Free FAST downloads, SLOW paywall and ownership are enforced on server account identity', async () => {
  const { env, now, setNow } = fixture(), fast = id(), slow = id()
  await reserveUserGeneration(env, USER, fast, 'fast'); await reserveUserGeneration(env, USER, slow, 'slow')
  assert.equal((await userJobAccess(env, USER, fast)).downloadAllowed, false)
  await settleUserGeneration(env, USER, fast, 'completed'); await settleUserGeneration(env, USER, slow, 'completed')
  assert.equal((await userJobAccess(env, USER, fast)).downloadAllowed, true)
  assert.equal((await userJobAccess(env, USER, slow)).previewOnly, true)
  assert.equal((await userJobAccess(env, OTHER, slow)).owned, false)
  await grant(env); await subscribe(env, now())
  assert.equal((await userJobAccess(env, USER, slow)).downloadAllowed, true)
  setNow(now() + 32 * 86_400_000)
  assert.equal((await userJobAccess(env, USER, slow)).downloadAllowed, false)
  assert.equal((await userJobAccess(env, USER, fast)).downloadAllowed, true)
})
test('Failed free attempts return only their own quota; foreign job IDs cannot refund another account', async () => {
  const { env } = fixture(), job = id()
  await reserveUserGeneration(env, USER, job, 'fast')
  assert.equal((await settleUserGeneration(env, OTHER, job, 'failed')).settled, false)
  assert.equal((await entitlementStatus(env, USER)).free.fastRemaining, 1)
  await settleUserGeneration(env, USER, job, 'failed')
  assert.equal((await entitlementStatus(env, USER)).free.fastRemaining, 2)
})
test('Replayed purchase grants and reversals are idempotent, including refund-before-payment order', async () => {
  const { env, now } = fixture()
  await Promise.all(Array.from({ length: 8 }, () => grant(env)))
  await subscribe(env, now())
  assert.equal((await entitlementStatus(env, USER)).credits, 1500)
  await reserveUserGeneration(env, USER, id(), 'fast')
  await Promise.all(Array.from({ length: 8 }, () => entitlementCall(env, USER, '/revoke', { id: 'in_fixture', credits: 1500 })))
  assert.equal((await entitlementStatus(env, USER)).credits, -50)
  assert.equal((await entitlementStatus(env, USER)).subscription.active, false)
  await grant(env); await subscribe(env, now(), { revision: now() + 1 })
  assert.equal((await entitlementStatus(env, USER)).credits, -50)
  assert.equal((await entitlementStatus(env, USER)).subscription.active, false)
  await entitlementCall(env, OTHER, '/revoke', { id: 'pi_reversefirst', credits: 500 })
  await entitlementCall(env, OTHER, '/grant', { id: 'pi_reversefirst', credits: 500 })
  assert.equal((await entitlementStatus(env, OTHER)).credits, 0)
})
test('Pending and paid events in the same second activate correctly; stale and terminal cancellation do not reactivate', async () => {
  const { env, now } = fixture()
  await subscribe(env, now(), { active: false })
  await grant(env); await subscribe(env, now())
  assert.equal((await entitlementStatus(env, USER)).subscription.active, true)
  await subscribe(env, now(), { active: false, terminal: true, revision: now() + 1000 })
  await subscribe(env, now())
  await subscribe(env, now(), { revision: now() + 2000 })
  assert.equal((await entitlementStatus(env, USER)).subscription.active, false)
})

const WEBHOOK_SECRET = 'whsec_fixture_only'
async function signedEvent(type: string, object: Record<string, unknown>, created = Math.floor(Date.now() / 1000), overrides = {}) {
  const payload = JSON.stringify({ id: `evt_${type.replace(/\W/g, '')}`, type, created, livemode: false, data: { object }, ...overrides })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${created}.${payload}`))), value => value.toString(16).padStart(2, '0')).join('')
  return new Request('https://worldifact.test/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${created},v1=${signature}`, 'Content-Type': 'application/json' }, body: payload })
}
function billingFixture() {
  const f = fixture()
  f.setNow(Date.now())
  const env: BillingEnv = { ...f.env, ENABLE_BILLING: 'true', STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SUBSCRIPTION_PRICE_ID: 'price_Subscription', STRIPE_TOPUP_PRICE_ID: 'price_Topup', STRIPE_TOPUP_CREDITS: '500', BILLING_PUBLIC_ORIGIN: 'https://worldifact.test', ACCOUNT_LIMITER: { async limit() { return { success: true } } } }
  const subscription = { id: 'sub_fixture', customer: 'cus_fixture', metadata: { worldifact_uid: USER }, status: 'active', current_period_end: Math.floor(f.now() / 1000) + 31 * 86400, latest_invoice: 'in_fixture', items: { data: [{ price: { id: 'price_Subscription' } }] } }
  const invoice = { id: 'in_fixture', subscription: 'sub_fixture', customer: 'cus_fixture', paid: true, status: 'paid', amount_paid: 1000, billing_reason: 'subscription_create', lines: { data: [{ price: { id: 'price_Subscription' }, quantity: 1 }] } }
  const session = { id: 'cs_fixture', customer: 'cus_fixture', payment_intent: 'pi_fixture', status: 'complete', payment_status: 'paid', mode: 'payment', metadata: { worldifact_uid: USER, worldifact_kind: 'topup', worldifact_credits: '500' } }
  const seen: string[] = []
  const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input); seen.push(url)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER, email: 'player@example.test' })
    if (url.endsWith('/subscriptions/sub_fixture')) return Response.json(subscription)
    if (url.endsWith('/invoices/in_fixture')) return Response.json(invoice)
    if (url.endsWith('/checkout/sessions/cs_fixture')) return Response.json(session)
    if (url.includes('/checkout/sessions/cs_fixture/line_items')) return Response.json({ data: [{ price: { id: 'price_Topup' }, quantity: 1 }] })
    if (url.endsWith('/charges/ch_fixture')) return Response.json({ id: 'ch_fixture', customer: 'cus_fixture', invoice: 'in_fixture', amount_refunded: 1000 })
    throw new Error(`Unexpected test request: ${url}`)
  }) as typeof fetch
  return { ...f, env, subscription, invoice, session, fetcher, seen }
}
test('Unconfigured checkout never calls a payment provider and unsigned webhook cannot grant credits', async () => {
  let calls = 0
  const response = await billingApi(new Request('https://worldifact.test/api/billing/checkout', { method: 'POST' }), {}, (async () => { calls++; throw new Error('Must not call') }) as typeof fetch)
  assert.equal(response?.status, 503); assert.equal(calls, 0)
  const { env, fetcher, seen } = billingFixture()
  const bad = await billingApi(new Request('https://worldifact.test/api/billing/webhook', { method: 'POST', body: '{}' }), env, fetcher)
  assert.equal(bad?.status, 400); assert.equal(seen.length, 0)
  assert.equal((await entitlementStatus(env, USER)).credits, 0)
})
test('Webhook signature rejects stale/tampered bodies and accepts supported key-rotation signatures', async () => {
  const request = await signedEvent('invoice.paid', { id: 'in_fixture' }), signature = request.headers.get('Stripe-Signature')!, body = await request.text()
  assert.equal(await verifyStripeSignature(body, signature, WEBHOOK_SECRET), true)
  assert.equal(await verifyStripeSignature(body + ' ', signature, WEBHOOK_SECRET), false)
  assert.equal(await verifyStripeSignature(body, signature, WEBHOOK_SECRET, Date.now() + 301_000), false)
  assert.equal(await verifyStripeSignature(body, signature + ',v1=' + '0'.repeat(64), WEBHOOK_SECRET), true)
})
test('Verified invoice is applied once across duplicate webhooks; refund revokes credits and slow downloads', async () => {
  const f = billingFixture()
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  for (let i = 0; i < 3; i++) assert.equal((await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, true)
  assert.equal((await billingApi(await signedEvent('charge.refunded', { id: 'ch_fixture' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
  await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
})
test('Unpaid, wrong-price and wrong-customer invoices never grant subscription credits', async () => {
  for (const variant of ['unpaid', 'price', 'customer']) {
    const f = billingFixture()
    await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    if (variant === 'unpaid') f.invoice.paid = false
    if (variant === 'price') f.invoice.lines.data[0].price.id = 'price_Unknown'
    if (variant === 'customer') f.invoice.customer = 'cus_other'
    await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})
test('A paid top-up creates one grant across completed and asynchronous-success events', async () => {
  const f = billingFixture()
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  for (const event of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) assert.equal((await billingApi(await signedEvent(event, { id: 'cs_fixture' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 500)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
})
test('A cancellation is read from Stripe and disables subscription downloads; webhook does not trust payload status', async () => {
  const f = billingFixture()
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher)
  f.subscription.status = 'canceled'
  await billingApi(await signedEvent('customer.subscription.updated', { id: 'sub_fixture', status: 'active' }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
})
test('Subscription update can reconcile a paid invoice before its webhook; later invoice delivery does not double-grant', async () => {
  const f = billingFixture()
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  assert.equal((await billingApi(await signedEvent('customer.subscription.updated', { id: 'sub_fixture' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, true)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
})
const checkoutRequest = (kind: string, origin = 'https://worldifact.test') => new Request('https://worldifact.test/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: '__Host-worldifact-access=fixture_access_token' }, body: JSON.stringify({ kind }) })
test('Subscription checkout refuses an existing past-due Stripe subscription even if local activation is absent', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  let created = 0
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
    if (url.includes('/prices/')) return Response.json({ id: 'price_Subscription', active: true, unit_amount: 1000, currency: 'eur', type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month' } })
    if (url.includes('/subscriptions?')) return Response.json({ data: [{ id: 'sub_previous', status: 'past_due' }] })
    if (url.endsWith('/checkout/sessions') && init?.method === 'POST') { created++; throw new Error('Duplicate subscription forbidden') }
    return f.fetcher(input, init)
  }) as typeof fetch
  assert.equal((await billingApi(checkoutRequest('subscription'), f.env, fetcher))?.status, 409)
  assert.equal(created, 0)
  assert.equal((await billingApi(checkoutRequest('subscription', 'https://attacker.test'), f.env, fetcher))?.status, 403)
})
test('Concurrent checkout clicks reuse one idempotency key; verified paid top-up opens a fresh purchase slot', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' }); await grant(f.env); await subscribe(f.env, f.now())
  const keys = new Set<string>(); let checkoutId = ''
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
    if (url.includes('/prices/')) return Response.json({ id: 'price_Topup', active: true, unit_amount: 1000, currency: 'eur', type: 'one_time', billing_scheme: 'per_unit' })
    if (url.endsWith('/checkout/sessions') && init?.method === 'POST') {
      const headers = new Headers(init.headers); keys.add(headers.get('Idempotency-Key')!)
      checkoutId = new URLSearchParams(String(init.body)).get('metadata[worldifact_checkout_id]')!
      return Response.json({ id: 'cs_fixture', url: 'https://checkout.stripe.com/c/pay/test_fixture', expires_at: Math.floor(f.now() / 1000) + 86400 })
    }
    return f.fetcher(input, init)
  }) as typeof fetch
  const results = await Promise.all(Array.from({ length: 5 }, () => billingApi(checkoutRequest('topup'), f.env, fetcher)))
  assert.equal(results.filter(result => result?.status === 200).length, 5)
  assert.equal(keys.size, 1)
  Object.assign(f.session.metadata, { worldifact_checkout_id: checkoutId })
  await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher)
  assert.equal((await billingApi(checkoutRequest('topup'), f.env, fetcher))?.status, 200)
  assert.equal(keys.size, 2)
})
