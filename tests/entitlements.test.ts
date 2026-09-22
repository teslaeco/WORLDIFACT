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
  const env: BillingEnv = { ...f.env, ENABLE_BILLING: 'true', ACCOUNT_LEDGER_MODE: 'sandbox', STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_Worldifact', STRIPE_SUBSCRIPTION_PRICE_ID: 'price_Subscription', STRIPE_SUBSCRIPTION_INTERVAL: 'month', STRIPE_TOPUP_PRICE_ID: 'price_Topup', STRIPE_TOPUP_CREDITS: '1500', BILLING_PUBLIC_ORIGIN: 'https://worldifact.test', ACCOUNT_LIMITER: { async limit() { return { success: true } } } }
  const subscription = { livemode: false, id: 'sub_fixture', customer: 'cus_fixture', metadata: { worldifact_uid: USER }, status: 'active', current_period_end: Math.floor(f.now() / 1000) + 31 * 86400, latest_invoice: 'in_fixture', items: { data: [{ price: { id: 'price_Subscription' }, quantity: 1 }] } }
  const invoice = { livemode: false, id: 'in_fixture', subscription: 'sub_fixture', customer: 'cus_fixture', paid: true, status: 'paid', amount_paid: 2999, total: 2999, currency: 'usd', billing_reason: 'subscription_create', lines: { data: [{ price: { id: 'price_Subscription' }, quantity: 1, amount: 2999, currency: 'usd' }] } }
  const session = { livemode: false, id: 'cs_fixture', amount_total: 2999, currency: 'usd', client_reference_id: USER, customer: 'cus_fixture', payment_intent: 'pi_fixture', status: 'complete', payment_status: 'paid', mode: 'payment', metadata: { worldifact_uid: USER, worldifact_kind: 'topup', worldifact_credits: '1500' } }
  const price = { livemode: false, id: 'price_Topup', active: true, unit_amount: 2999, currency: 'usd', type: 'one_time', billing_scheme: 'per_unit' }
  const subscriptionPrice = { ...price, id: 'price_Subscription', unit_amount: 2999, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }
  const lineItems = { data: [{ price: { id: 'price_Topup' }, quantity: 1, amount_total: 2999, currency: 'usd' }] }
  const seen: string[] = []
  const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input); seen.push(url)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER, email: 'player@example.test' })
    if (url.endsWith('/prices/price_Topup')) return Response.json(price)
    if (url.endsWith('/prices/price_Subscription')) return Response.json(subscriptionPrice)
    if (url.endsWith('/subscriptions/sub_fixture')) return Response.json(subscription)
    if (url.endsWith('/invoices/in_fixture')) return Response.json(invoice)
    if (url.endsWith('/checkout/sessions/cs_fixture')) return Response.json(session)
    if (url.includes('/checkout/sessions/cs_fixture/line_items')) return Response.json(lineItems)
    if (url.endsWith('/charges/ch_fixture')) return Response.json({ livemode: false, id: 'ch_fixture', customer: 'cus_fixture', invoice: 'in_fixture', amount_refunded: 2999 })
    throw new Error(`Unexpected test request: ${url}`)
  }) as typeof fetch
  return { ...f, env, subscription, invoice, session, price, subscriptionPrice, lineItems, fetcher, seen }
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
test('Stripe refuses redirected reads and checkout POSTs without forwarding secrets or following Location', async () => {
  for (const status of [301, 302, 303, 307, 308]) for (const phase of ['price', 'checkout']) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    const calls: string[] = []; let cancelled = false
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/v1/user')) return f.fetcher(input, init)
      calls.push(url)
      assert.equal(new URL(url).origin, 'https://api.stripe.com')
      assert.equal(init?.redirect, 'manual')
      const redirectHere = phase === 'price' ? url.endsWith('/prices/price_Topup') : url.endsWith('/checkout/sessions')
      if (redirectHere) {
        const body = new ReadableStream({ cancel() { cancelled = true } })
        return new Response(body, { status, headers: { Location: 'https://attacker.invalid/collect?private=redirect-detail' } })
      }
      return f.fetcher(input, init)
    }) as typeof fetch
    const response = await billingApi(checkoutRequest('topup'), f.env, fetcher)
    assert.equal(response?.status, 502)
    assert.equal(calls.length, phase === 'price' ? 1 : 2)
    assert.equal(cancelled, true)
    assert.equal(response?.headers.get('Location'), null)
    const text = await response!.text()
    assert.doesNotMatch(text, /attacker|redirect-detail|sk_test|Bearer|api\.stripe/)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
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
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
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

test('Monthly checkout requires cancellation configuration and portal sessions remain bound to the account', async () => {
  const missing = billingFixture()
  delete missing.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
  const status = await (await billingApi(new Request('https://worldifact.test/api/billing/status'), missing.env, missing.fetcher))!.json() as Record<string, unknown>
  assert.equal(status.checkoutReady, false)
  assert.equal(status.topupReady, true)
  assert.equal((await billingApi(checkoutRequest('subscription'), missing.env, missing.fetcher))?.status, 503)
  assert.ok(!missing.seen.some(url => url.startsWith('https://api.stripe.com/')))
  for (const mismatch of [null, 'customer', 'configuration'] as const) {
    const f = billingFixture()
    await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith('/billing_portal/sessions')) {
        const params = new URLSearchParams(String(init?.body))
        assert.equal(params.get('customer'), 'cus_fixture')
        assert.equal(params.get('configuration'), 'bpc_Worldifact')
        assert.equal(params.get('return_url'), 'https://worldifact.test/account/credits')
        return Response.json({ livemode: false, customer: mismatch === 'customer' ? 'cus_foreign' : 'cus_fixture', configuration: mismatch === 'configuration' ? 'bpc_default' : 'bpc_Worldifact', url: 'https://billing.stripe.com/p/session/test' })
      }
      return f.fetcher(input, init)
    }) as typeof fetch
    const request = new Request('https://worldifact.test/api/billing/portal', { method: 'POST', headers: checkoutRequest('subscription').headers })
    const response = await billingApi(request, f.env, fetcher)
    assert.equal(response?.status, mismatch ? 503 : 200)
    if (mismatch) assert.ok(!(await response!.text()).includes('https://billing.stripe.com'))
  }
})
test('Subscription checkout refuses an existing past-due Stripe subscription even if local activation is absent', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  let created = 0
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
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
    if (url.endsWith('/checkout/sessions') && init?.method === 'POST') {
      const headers = new Headers(init.headers); keys.add(headers.get('Idempotency-Key')!)
      checkoutId = new URLSearchParams(String(init.body)).get('metadata[worldifact_checkout_id]')!
      return Response.json({ ...f.session, metadata: { ...f.session.metadata, worldifact_checkout_id: checkoutId }, url: 'https://checkout.stripe.com/c/pay/test_fixture', expires_at: Math.floor(f.now() / 1000) + 86400 })
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

test('One-time pack readiness does not require a recurring price or unapproved interval', async () => {
  const f = billingFixture()
  delete f.env.STRIPE_SUBSCRIPTION_INTERVAL
  delete f.env.STRIPE_SUBSCRIPTION_PRICE_ID
  f.env.STRIPE_TOPUP_CREDITS = '1000000'
  const response = await billingApi(new Request('https://worldifact.test/api/billing/status'), f.env, f.fetcher)
  const status = await response!.json() as Record<string, unknown>
  assert.deepEqual(status.price, { amount: 2999, currency: 'USD', credits: 1500, kind: 'one_time' })
  assert.deepEqual(status.subscriptionPrice, { amount: 2999, currency: 'USD', credits: 1500, kind: 'subscription', interval: 'month' })
  assert.equal(status.status, 'CONFIGURED')
  assert.equal(status.topupReady, true)
  assert.equal(status.cardReady, true)
  assert.equal(status.googlePay, 'eligible_devices')
  assert.equal(status.checkoutReady, false)
  assert.equal(status.subscriptionInterval, null)
  assert.equal(status.topupCredits, 1500)
  assert.equal(f.seen.length, 0)
  assert.equal((await billingApi(checkoutRequest('subscription'), f.env, f.fetcher))?.status, 503)
  assert.equal(f.seen.some(url => url.startsWith('https://api.stripe.com/')), false)
})

test('Stripe test payments cannot reach the live account ledger and live mode rejects sandbox storage', async () => {
  for (const [mode, ledger] of [['test', undefined], ['test', 'live'], ['live', 'sandbox']] as const) {
    const f = billingFixture()
    f.env.STRIPE_MODE = mode; f.env.STRIPE_SECRET_KEY = `sk_${mode}_fixture`; f.env.ACCOUNT_LEDGER_MODE = ledger
    const status = await (await billingApi(new Request('https://worldifact.test/api/billing/status'), f.env, f.fetcher))!.json() as Record<string, unknown>
    assert.equal(status.topupReady, false)
    assert.equal(status.checkoutReady, false)
    assert.equal((await billingApi(checkoutRequest('topup'), f.env, f.fetcher))?.status, 503)
    assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher))?.status, 503)
    assert.equal(f.seen.length, 0)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})

test('Restricted Stripe keys retain mode isolation and provider permissions', async () => {
  for (const mode of ['test', 'live'] as const) for (const prefix of ['sk', 'rk', 'pk']) for (const keyMode of ['test', 'live']) {
    const f = billingFixture()
    f.env.STRIPE_MODE = mode
    f.env.ACCOUNT_LEDGER_MODE = mode === 'test' ? 'sandbox' : 'live'
    f.env.STRIPE_SECRET_KEY = ` \n${prefix}_${keyMode}_fixture\n `
    const status = await (await billingApi(new Request('https://worldifact.test/api/billing/status'), f.env, f.fetcher))!.json() as Record<string, unknown>
    assert.equal(status.topupReady, prefix !== 'pk' && mode === keyMode)
    assert.equal(f.seen.length, 0)
  }
  const f = billingFixture()
  f.env.STRIPE_SECRET_KEY = ' \nrk_test_fixture\n '
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  let providerCalls = 0
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).startsWith('https://api.stripe.com/')) {
      providerCalls++
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer rk_test_fixture')
      return Response.json({ error: { message: 'private permission details' } }, { status: 403 })
    }
    return f.fetcher(input, init)
  }) as typeof fetch
  const response = await billingApi(checkoutRequest('topup'), f.env, fetcher)
  assert.equal(response?.status, 502)
  assert.equal(providerCalls, 1)
  assert.ok(!(await response!.text()).includes('private permission details'))
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})

test('A signed-in free account can buy one fixed card pack with eligible Google Pay wallets', async () => {
  const f = billingFixture()
  delete f.env.STRIPE_SUBSCRIPTION_PRICE_ID; delete f.env.STRIPE_SUBSCRIPTION_INTERVAL
  await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  let params: URLSearchParams | undefined
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (String(input).endsWith('/checkout/sessions') && init?.method === 'POST') {
      params = new URLSearchParams(String(init.body))
      return Response.json({ ...f.session, status: 'open', payment_status: 'unpaid', metadata: { ...f.session.metadata, worldifact_checkout_id: params.get('metadata[worldifact_checkout_id]') }, url: 'https://checkout.stripe.com/c/pay/test_fixture', expires_at: Math.floor(f.now() / 1000) + 86400 })
    }
    return f.fetcher(input, init)
  }) as typeof fetch
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
  assert.equal((await billingApi(checkoutRequest('topup'), f.env, fetcher))?.status, 200)
  assert.equal(params!.get('mode'), 'payment')
  assert.equal(params!.get('payment_method_types[0]'), 'card')
  assert.equal(params!.get('line_items[0][price]'), 'price_Topup')
  assert.equal(params!.get('line_items[0][quantity]'), '1')
  assert.equal(params!.get('metadata[worldifact_credits]'), '1500')
  assert.equal(params!.get('allow_promotion_codes'), 'false')
  assert.equal(params!.get('success_url'), 'https://worldifact.test/account/credits?billing=processing')
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})

test('Browser price, credit and identity injection is rejected before any Stripe call', async () => {
  for (const extra of [{ credits: 1000000 }, { amount: 1 }, { currency: 'eur' }, { uid: OTHER }, { price: 'price_Cheap' }]) {
    const f = billingFixture()
    const request = checkoutRequest('topup')
    const forged = new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify({ kind: 'topup', ...extra }) })
    assert.equal((await billingApi(forged, f.env, f.fetcher))?.status, 400)
    assert.equal(f.seen.some(url => url.startsWith('https://api.stripe.com/')), false)
  }
})

test('Monthly membership checkout accepts USD 29.99 and rejects the obsolete amount', async () => {
  for (const amount of [2999, 3000]) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    let params: URLSearchParams | undefined
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input)
      if (url.includes('/subscriptions?')) return Response.json({ data: [], has_more: false })
      if (url.endsWith('/checkout/sessions') && init?.method === 'POST') {
        params = new URLSearchParams(String(init.body))
        return Response.json({ ...f.session, mode: 'subscription', amount_total: amount, status: 'open', payment_status: 'unpaid', metadata: { ...f.session.metadata, worldifact_kind: 'subscription', worldifact_checkout_id: params.get('metadata[worldifact_checkout_id]') }, url: 'https://checkout.stripe.com/c/pay/test_fixture', expires_at: Math.floor(f.now() / 1000) + 86400 })
      }
      return f.fetcher(input, init)
    }) as typeof fetch
    const response = await billingApi(checkoutRequest('subscription'), f.env, fetcher)
    assert.equal(response?.status, amount === 2999 ? 200 : 503)
    assert.equal(params!.get('mode'), 'subscription')
    assert.equal(params!.get('line_items[0][price]'), 'price_Subscription')
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
    assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
  }
})

test('Checkout rejects a wrong catalog amount, currency or provider mode before creating a session', async () => {
  for (const variant of ['amount', 'currency', 'mode', 'missingMode', 'quantityTransform']) {
    const f = billingFixture()
    if (variant === 'amount') f.price.unit_amount = 3000
    if (variant === 'currency') f.price.currency = 'eur'
    if (variant === 'mode') f.price.livemode = true
    if (variant === 'missingMode') Reflect.deleteProperty(f.price, 'livemode')
    if (variant === 'quantityTransform') Object.assign(f.price, { transform_quantity: { divide_by: 2, round: 'up' } })
    assert.equal((await billingApi(checkoutRequest('topup'), f.env, f.fetcher))?.status, 503, variant)
    assert.equal(f.seen.some(url => url.endsWith('/checkout/sessions')), false)
  }
})

test('Checkout creation rechecks the returned total, currency and account before exposing a payment link', async () => {
  for (const changed of [{ amount_total: 3000 }, { currency: 'eur' }, { customer: 'cus_other' }, { client_reference_id: OTHER }, { livemode: true }]) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).endsWith('/checkout/sessions') && init?.method === 'POST') {
        const params = new URLSearchParams(String(init.body))
        return Response.json({ ...f.session, metadata: { ...f.session.metadata, worldifact_checkout_id: params.get('metadata[worldifact_checkout_id]') }, url: 'https://checkout.stripe.com/c/pay/test_fixture', expires_at: Math.floor(f.now() / 1000) + 86400, ...changed })
      }
      return f.fetcher(input, init)
    }) as typeof fetch
    const response = await billingApi(checkoutRequest('topup'), f.env, fetcher)
    assert.equal(response?.status, 503)
    assert.equal((await response!.json() as Record<string, unknown>).url, undefined)
  }
})

test('Paid top-ups reject wrong amount, currency, quantity, metadata credits and account binding', async () => {
  for (const variant of ['amount', 'currency', 'quantity', 'lineAmount', 'lineCurrency', 'credits', 'customer', 'reference', 'mode', 'unpaid', 'catalog']) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    if (variant === 'amount') f.session.amount_total = 3000
    if (variant === 'currency') f.session.currency = 'eur'
    if (variant === 'quantity') f.lineItems.data[0].quantity = 2
    if (variant === 'lineAmount') f.lineItems.data[0].amount_total = 1000
    if (variant === 'lineCurrency') f.lineItems.data[0].currency = 'eur'
    if (variant === 'credits') f.session.metadata.worldifact_credits = '1000000'
    if (variant === 'customer') f.session.customer = 'cus_other'
    if (variant === 'reference') f.session.client_reference_id = OTHER
    if (variant === 'mode') f.session.livemode = true
    if (variant === 'unpaid') f.session.payment_status = 'unpaid'
    if (variant === 'catalog') f.price.unit_amount = 100
    await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0, variant)
    assert.equal((await entitlementStatus(f.env, OTHER)).credits, 0, variant)
  }
})

test('Recurring grants require the monthly interval, exact USD 29.99 invoice and one licensed interval', async () => {
  for (const variant of ['intervalUnset', 'unapprovedYear', 'wrongInterval', 'intervalCount', 'metered', 'amount', 'total', 'currency', 'lineAmount', 'quantity', 'extraLine', 'catalog', 'oldPrice']) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    if (variant === 'intervalUnset') delete f.env.STRIPE_SUBSCRIPTION_INTERVAL
    if (variant === 'unapprovedYear') { f.env.STRIPE_SUBSCRIPTION_INTERVAL = 'year'; f.subscriptionPrice.recurring.interval = 'year' }
    if (variant === 'wrongInterval') f.subscriptionPrice.recurring.interval = 'year'
    if (variant === 'intervalCount') f.subscriptionPrice.recurring.interval_count = 2
    if (variant === 'metered') f.subscriptionPrice.recurring.usage_type = 'metered'
    if (variant === 'amount') f.invoice.amount_paid = 3000
    if (variant === 'total') f.invoice.total = 3000
    if (variant === 'currency') f.invoice.currency = 'eur'
    if (variant === 'lineAmount') f.invoice.lines.data[0].amount = 3000
    if (variant === 'quantity') f.invoice.lines.data[0].quantity = 2
    if (variant === 'extraLine') f.invoice.lines.data.push({ ...f.invoice.lines.data[0], amount: 0 })
    if (variant === 'catalog') f.subscriptionPrice.unit_amount = 3000
    if (variant === 'oldPrice') { f.invoice.amount_paid = 3000; f.invoice.total = 3000; f.invoice.lines.data[0].amount = 3000 }
    await billingApi(await signedEvent('invoice.paid', { id: 'in_fixture' }), f.env, f.fetcher)
    await billingApi(await signedEvent('customer.subscription.updated', { id: 'sub_fixture' }), f.env, f.fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0, variant)
    assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false, variant)
  }
})

test('Top-up refund before payment creates a tombstone and archived product refunds remain idempotent', async () => {
  for (const refundFirst of [true, false]) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input)
      if (url.endsWith('/charges/ch_fixture')) return Response.json({ livemode: false, id: 'ch_fixture', customer: 'cus_fixture', payment_intent: 'pi_fixture', amount_refunded: 1 })
      if (url.includes('/checkout/sessions?payment_intent=')) return Response.json({ data: [f.session] })
      return f.fetcher(input, init)
    }) as typeof fetch
    if (!refundFirst) await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher)
    f.price.active = false
    for (let repeat = 0; repeat < 2; repeat++) assert.equal((await billingApi(await signedEvent('charge.refunded', { id: 'ch_fixture' }), f.env, fetcher))?.status, 200)
    f.price.active = true
    await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})

test('Archiving a price blocks new purchases but preserves fulfillment of an already paid pack', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  f.price.active = false
  assert.equal((await billingApi(checkoutRequest('topup'), f.env, f.fetcher))?.status, 503)
  assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
})

test('An explicitly allowlisted historical pack price supports settlement and refunds after price rotation', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  f.env.STRIPE_TOPUP_PRICE_ID = 'price_NewTopup'
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
    if (url.endsWith('/charges/ch_fixture')) return Response.json({ livemode: false, id: 'ch_fixture', customer: 'cus_fixture', payment_intent: 'pi_fixture', amount_refunded: 2999 })
    if (url.includes('/checkout/sessions?payment_intent=')) return Response.json({ data: [f.session] })
    return f.fetcher(input, init)
  }) as typeof fetch
  assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher))?.status, 400)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  f.env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS = 'price_Topup'
  f.price.active = false
  for (let i = 0; i < 2; i++) assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  delete f.env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS
  assert.equal((await billingApi(await signedEvent('charge.refunded', { id: 'ch_fixture' }), f.env, fetcher))?.status, 400)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  f.env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS = 'price_Topup'
  for (let i = 0; i < 2; i++) assert.equal((await billingApi(await signedEvent('charge.refunded', { id: 'ch_fixture' }), f.env, fetcher))?.status, 200)
  await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})

test('Historical pack allowlist rejects invalid or excessive IDs and cannot authorize a cheaper pack', async () => {
  for (const value of ['price_Topup,', 'price_Topup,price_Topup', 'price_Topup,../../prices', Array.from({ length: 11 }, (_, i) => `price_Old${i}`).join(',')]) {
    const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
    f.env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS = value
    assert.equal((await billingApi(checkoutRequest('topup'), f.env, f.fetcher))?.status, 503)
    assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher))?.status, 400)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  f.env.STRIPE_TOPUP_PRICE_ID = 'price_NewTopup'
  f.env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS = 'price_Topup'
  f.price.unit_amount = 1000
  assert.equal((await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher))?.status, 503)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})

test('One-time pack grants do not unlock subscription-only SLOW downloads', async () => {
  const f = billingFixture(); await entitlementCall(f.env, USER, '/customer', { customer: 'cus_fixture' })
  await billingApi(await signedEvent('checkout.session.completed', { id: 'cs_fixture' }), f.env, f.fetcher)
  const job = id()
  assert.equal((await reserveUserGeneration(f.env, USER, job, 'slow')).cost, 50)
  await settleUserGeneration(f.env, USER, job, 'completed')
  assert.equal((await userJobAccess(f.env, USER, job)).downloadAllowed, false)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1450)
})
