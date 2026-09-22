import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paypalApi, type PayPalEnv } from '../server/paypal.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'

const USER = 'b8867f90-8703-4d20-b97e-4b6b4c24d142'
const OTHER = '84d69075-9be3-4b70-b32c-b87bb714cae9'
const ORDER = '25M43554V9523650M'
const CAPTURE = '74L756601X447022Y'
const MERCHANT = 'YXZY75W2GKDQE'
const BASE = 'https://api-m.sandbox.paypal.com'
type Json = Record<string, unknown>
const money = () => ({ currency_code: 'USD', value: '29.99' })
function request(action: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request('https://worldifact.test/api/billing/paypal/' + action, { method: 'POST', headers: { Origin: 'https://worldifact.test', Cookie: '__Host-worldifact-access=fixtureToken123', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
function event(type: string, resource: Json, headers: Record<string, string> = {}) {
  return new Request('https://worldifact.test/api/billing/paypal/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': BASE + '/v1/notifications/certs/CERTIFICATE-123', 'paypal-transmission-id': 'transmission-test', 'paypal-transmission-sig': 'fixtureSignature123', 'paypal-transmission-time': new Date().toISOString(), ...headers },
    body: JSON.stringify({ id: 'WH-FIXTURE-123456789', event_type: type, resource }),
  })
}
function fixture() {
  const objects = new Map<string, AccountEntitlements>()
  const stores = new Map<string, EntitlementStorage>()
  let authenticated = USER, signatureValid = true, createFails = false
  const seen: { url: string; method: string; body?: Json; headers: Headers }[] = []
  const unit = { custom_id: USER, invoice_id: '', payee: { merchant_id: MERCHANT }, amount: money(), payments: { captures: [] as Json[], refunds: [] as Json[] } }
  const order = { id: ORDER, status: 'APPROVED', intent: 'CAPTURE', purchase_units: [unit], links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + ORDER }] }
  const capture = { id: CAPTURE, status: 'COMPLETED', final_capture: true, amount: money(), payee: { merchant_id: MERCHANT }, supplementary_data: { related_ids: { order_id: ORDER } } }
  const dispute = { dispute_id: 'PP-D-FIXTURE123', disputed_transactions: [{ seller_transaction_id: CAPTURE }] }
  const env: PayPalEnv = {
    ENABLE_PAYPAL_BILLING: 'true', PAYPAL_MODE: 'sandbox', ACCOUNT_LEDGER_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'ServerAppIdFixture123', PAYPAL_CLIENT_SECRET: 'ServerSecretFixture123', PAYPAL_WEBHOOK_ID: '1234567890ABCDEF', PAYPAL_MERCHANT_ID: MERCHANT, BILLING_PUBLIC_ORIGIN: 'https://worldifact.test', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get: key => {
      const name = String(key)
      if (!objects.has(name)) {
        const data = new Map<string, unknown>(); let previous: Promise<unknown> = Promise.resolve()
        const storage: EntitlementStorage = {
          async get<T>(key: string) { return structuredClone(data.get(key)) as T | undefined },
          async put(key, value) { data.set(key, structuredClone(value)) },
          transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) { const current = previous.then(() => callback(storage)); previous = current.catch(() => undefined); return current },
        }
        stores.set(name, storage); objects.set(name, new AccountEntitlements({ storage }))
      }
      return objects.get(name)!
    } },
  }
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET', headers = new Headers(init?.headers)
    const body = init?.body && headers.get('Content-Type') === 'application/json' ? JSON.parse(String(init.body)) as Json : undefined
    seen.push({ url, method, body, headers })
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: authenticated, email: 'player@example.test' })
    assert.equal(new URL(url).origin, BASE)
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    if (url.endsWith('/v1/oauth2/token')) {
      assert.equal(headers.get('Authorization'), 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET))
      return Response.json({ token_type: 'Bearer', access_token: 'accessTokenFixture123' })
    }
    assert.equal(headers.get('Authorization'), 'Bearer accessTokenFixture123')
    if (url.endsWith('/v1/notifications/verify-webhook-signature')) return Response.json({ verification_status: signatureValid ? 'SUCCESS' : 'FAILURE' })
    if (url.endsWith('/v2/checkout/orders') && method === 'POST') {
      if (createFails) throw new Error('Simulated unknown creation outcome')
      const supplied = (body!.purchase_units as Json[])[0]
      unit.invoice_id = String(supplied.invoice_id); order.status = 'PAYER_ACTION_REQUIRED'
      return Response.json({ id: ORDER, status: order.status })
    }
    if (url.endsWith('/v2/checkout/orders/' + ORDER) && method === 'GET') return Response.json(order)
    if (url.endsWith('/v2/checkout/orders/' + ORDER + '/capture') && method === 'POST') {
      order.status = 'COMPLETED'; unit.payments.captures = [{ id: CAPTURE, status: 'COMPLETED', amount: money() }]
      return Response.json(order)
    }
    if (url.endsWith('/v2/payments/captures/' + CAPTURE)) return Response.json(capture)
    if (url.endsWith('/v1/customer/disputes/' + dispute.dispute_id)) return Response.json(dispute)
    throw new Error('Unexpected provider call: ' + url)
  }) as typeof fetch
  async function bind(uid = USER) {
    const attempt = await entitlementCall<{ id: string }>(env, uid, '/paypal-reserve', {})
    unit.custom_id = uid; unit.invoice_id = `wf-${attempt.id}`
    await entitlementCall(env, uid, '/paypal-order', { id: attempt.id, orderId: ORDER, url: order.links[0].href })
    return attempt.id
  }
  function complete() { order.status = 'COMPLETED'; unit.payments.captures = [{ id: CAPTURE, status: 'COMPLETED', amount: money() }] }
  return { env, fetcher, seen, unit, order, capture, bind, complete, setUser: (uid: string) => { authenticated = uid }, setSignature: (valid: boolean) => { signatureValid = valid }, setCreateFails: (value: boolean) => { createFails = value }, recreate: () => { for (const [name, storage] of stores) objects.set(name, new AccountEntitlements({ storage })) } }
}
test('PayPal fails closed without credentials, webhook, account protection or persistent ledger; status leaks no secrets', async () => {
  const f = fixture()
  for (const key of ['ENABLE_PAYPAL_BILLING', 'PAYPAL_MODE', 'ACCOUNT_LEDGER_MODE', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_MERCHANT_ID', 'ACCOUNT_LIMITER', 'ACCOUNT_ENTITLEMENTS', 'ENFORCE_ACCOUNT_ENTITLEMENTS', 'BILLING_PUBLIC_ORIGIN']) {
    const env = { ...f.env, [key]: undefined }
    const response = await paypalApi(request('order'), env, f.fetcher)
    assert.equal(response?.status, 503, key)
  }
  assert.equal(f.seen.length, 0)
  const response = await paypalApi(new Request('https://worldifact.test/api/billing/paypal/status'), f.env, f.fetcher)
  const status = await response!.json() as Json
  assert.equal(status.ready, true); assert.equal(status.amount, '29.99'); assert.equal(status.credits, 1500); assert.equal(status.recurring, false)
  assert.equal(status.hostedButtonId, 'N4DCJJHHW747S'); assert.equal(status.hostedButtonReady, false)
  const text = JSON.stringify(status)
  assert.equal(text.includes(f.env.PAYPAL_CLIENT_SECRET!), false); assert.equal(text.includes(f.env.PAYPAL_CLIENT_ID!), false)
})
test('PayPal rejects cross-origin, anonymous and browser-controlled pricing without payment API calls', async () => {
  const f = fixture()
  assert.equal((await paypalApi(request('order', {}, { Origin: 'https://attacker.test' }), f.env, f.fetcher))?.status, 403)
  assert.equal((await paypalApi(request('order', {}, { Cookie: '' }), f.env, f.fetcher))?.status, 401)
  assert.equal((await paypalApi(request('order', { amount: '0.01', credits: 999999 }), f.env, f.fetcher))?.status, 400)
  assert.equal(f.seen.filter(item => item.url.startsWith(BASE)).length, 0)
})
test('PayPal creates only the fixed USD 29.99 pack with server identity and no shipping; persisted checkout survives restart', async () => {
  const f = fixture()
  const result = await paypalApi(request('order'), f.env, f.fetcher)
  assert.equal(result?.status, 200)
  const created = f.seen.find(item => item.url.endsWith('/v2/checkout/orders') && item.method === 'POST')!
  const units = created.body!.purchase_units as Json[]
  assert.equal(units.length, 1); assert.deepEqual(units[0].amount, money()); assert.equal(units[0].custom_id, USER); assert.deepEqual(units[0].payee, { merchant_id: MERCHANT })
  const source = created.body!.payment_source as { paypal: { experience_context: Json } }
  assert.equal(source.paypal.experience_context.shipping_preference, 'NO_SHIPPING')
  assert.equal(source.paypal.experience_context.return_url, 'https://worldifact.test/account/credits?paypal=return')
  assert.equal(source.paypal.experience_context.cancel_url, 'https://worldifact.test/account/credits?paypal=cancelled')
  f.recreate()
  assert.equal((await paypalApi(request('order'), f.env, f.fetcher))?.status, 200)
  assert.equal(f.seen.filter(item => item.url.endsWith('/v2/checkout/orders') && item.method === 'POST').length, 1)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('Unknown PayPal create outcome retains its reservation and the same idempotency key', async () => {
  const f = fixture(); f.setCreateFails(true)
  assert.equal((await paypalApi(request('order'), f.env, f.fetcher))?.status, 503)
  f.setCreateFails(false); f.recreate()
  assert.equal((await paypalApi(request('order'), f.env, f.fetcher))?.status, 200)
  const creates = f.seen.filter(item => item.url.endsWith('/v2/checkout/orders') && item.method === 'POST')
  assert.equal(creates.length, 2); assert.equal(creates[0].headers.get('PayPal-Request-Id'), creates[1].headers.get('PayPal-Request-Id'))
})
test('Foreign or unbound PayPal orders are rejected before OAuth, order lookup or capture', async () => {
  const f = fixture(); await f.bind(OTHER)
  assert.equal((await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher))?.status, 403)
  assert.equal(f.seen.filter(item => item.url.startsWith(BASE)).length, 0)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('PayPal checks amount, currency, merchant, account and invoice before any capture mutation', async () => {
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.unit.amount.value = '30.00' },
    (f: ReturnType<typeof fixture>) => { f.unit.amount.currency_code = 'EUR' },
    (f: ReturnType<typeof fixture>) => { f.unit.payee.merchant_id = 'XXXXXXXXXXXXX' },
    (f: ReturnType<typeof fixture>) => { f.unit.custom_id = OTHER },
    (f: ReturnType<typeof fixture>) => { f.unit.invoice_id = 'wf-unrelated' },
  ]) {
    const f = fixture(); await f.bind(); mutation(f)
    assert.equal((await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher))?.status, 409)
    assert.equal(f.seen.some(item => item.url.endsWith('/capture') && item.method === 'POST'), false)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})
test('Completed PayPal capture is independently re-read and credited once across browser and webhook retries', async () => {
  const f = fixture(); await f.bind()
  const result = await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher)
  assert.equal(result?.status, 200); assert.equal((await result!.json() as Json).credited, true)
  assert.ok(f.seen.some(item => item.url.endsWith('/v2/payments/captures/' + CAPTURE) && item.method === 'GET'))
  f.recreate()
  await Promise.all(Array.from({ length: 5 }, () => paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)))
  const repeated = await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher)
  assert.equal(repeated?.status, 200); assert.equal((await repeated!.json() as Json).credited, true)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  assert.equal((await entitlementStatus(f.env, USER)).subscription.active, false)
  assert.equal(f.seen.filter(item => item.url.endsWith('/capture') && item.method === 'POST').length, 1)
})
test('Verified PayPal approval captures an owned order when the payer never returns to the browser page', async () => {
  const f = fixture(); await f.bind()
  assert.equal((await paypalApi(event('CHECKOUT.ORDER.APPROVED', { id: ORDER }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  assert.equal(f.seen.filter(item => item.url.endsWith('/capture') && item.method === 'POST').length, 1)
  await paypalApi(event('CHECKOUT.ORDER.APPROVED', { id: ORDER }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  assert.equal(f.seen.filter(item => item.url.endsWith('/capture') && item.method === 'POST').length, 1)
  const unbound = fixture()
  assert.equal((await paypalApi(event('CHECKOUT.ORDER.APPROVED', { id: ORDER }), unbound.env, unbound.fetcher))?.status, 403)
  assert.equal(unbound.seen.some(item => item.url.endsWith('/capture') && item.method === 'POST'), false)
})
test('Pending fresh capture never gets credits even if capture POST and order claim completion', async () => {
  const f = fixture(); await f.bind(); f.capture.status = 'PENDING'
  const response = await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher)
  assert.equal(response?.status, 200); assert.equal((await response!.json() as Json).status, 'PENDING')
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('Fresh capture merchant, amount, currency and order must independently match', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.capture.payee.merchant_id = 'XXXXXXXXXXXXX' },
    (f: ReturnType<typeof fixture>) => { f.capture.amount.value = '30.00' },
    (f: ReturnType<typeof fixture>) => { f.capture.amount.currency_code = 'EUR' },
    (f: ReturnType<typeof fixture>) => { f.capture.supplementary_data.related_ids.order_id = 'AAAAAAAAAAAAAAAAA' },
  ]) {
    const f = fixture(); await f.bind(); mutate(f)
    assert.equal((await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher))?.status, 409)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})
test('Unsigned, forged and arbitrary-certificate PayPal webhooks cannot mutate the ledger', async () => {
  const f = fixture(); await f.bind(); f.complete()
  assert.equal((await paypalApi(request('webhook', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: CAPTURE } }), f.env, f.fetcher))?.status, 400)
  assert.equal((await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }, { 'paypal-cert-url': 'https://attacker.test/key' }), f.env, f.fetcher))?.status, 400)
  assert.equal(f.seen.length, 0)
  f.setSignature(false)
  assert.equal((await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher))?.status, 400)
  assert.equal(f.seen.some(item => item.url.includes('/v2/')), false)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('Refunds revoke a grant once and stale completion events cannot restore refunded credits', async () => {
  const f = fixture(); await f.bind(); f.complete()
  await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 1500)
  // PayPal notifications can use the api host alias while our client uses api-m.
  const refund = { id: 'REFUND12345678901', links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + CAPTURE }] }
  await Promise.all(Array.from({ length: 4 }, () => paypalApi(event('PAYMENT.CAPTURE.REFUNDED', refund), f.env, f.fetcher)))
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('Refund-before-completion creates a tombstone, including later browser capture reconciliation', async () => {
  const f = fixture(); await f.bind(); f.complete()
  const response = await paypalApi(event('PAYMENT.CAPTURE.REFUNDED', { supplementary_data: { related_ids: { capture_id: CAPTURE } } }), f.env, f.fetcher)
  assert.equal(response?.status, 200)
  const reconciled = await paypalApi(request('capture', { orderId: ORDER }), f.env, f.fetcher)
  const outcome = await reconciled!.json() as Json
  assert.equal(outcome.status, 'REVERSED'); assert.equal(outcome.credited, false)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
test('Fresh partial refund and denied/reversed webhooks block credits even without prior completed event', async () => {
  for (const status of ['PARTIALLY_REFUNDED', 'REFUNDED', 'DECLINED', 'REVERSED']) {
    const f = fixture(); await f.bind(); f.complete(); f.capture.status = status
    assert.equal((await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher))?.status, 200)
    f.capture.status = 'COMPLETED'
    await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
  for (const type of ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REVERSED']) {
    const f = fixture(); await f.bind(); f.complete()
    await paypalApi(event(type, { id: CAPTURE }), f.env, f.fetcher)
    await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
    assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  }
})
test('PayPal disputes are re-read, revoke conservatively and require review without automatic restoration', async () => {
  const f = fixture(); await f.bind(); f.complete()
  await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
  assert.equal((await paypalApi(event('CUSTOMER.DISPUTE.CREATED', { dispute_id: 'PP-D-FIXTURE123' }), f.env, f.fetcher))?.status, 200)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  assert.equal((await entitlementStatus(f.env, USER)).billingReview, true)
  await paypalApi(event('CUSTOMER.DISPUTE.RESOLVED', { dispute_id: 'PP-D-FIXTURE123' }), f.env, f.fetcher)
  await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
  assert.equal((await paypalApi(request('order'), f.env, f.fetcher))?.status, 409)
})
test('PayPal webhooks cannot credit orders created outside the persisted WORLDIFACT ownership binding', async () => {
  const f = fixture(); f.complete(); f.unit.invoice_id = 'wf-' + crypto.randomUUID()
  assert.equal((await paypalApi(event('PAYMENT.CAPTURE.COMPLETED', { id: CAPTURE }), f.env, f.fetcher))?.status, 403)
  assert.equal((await entitlementStatus(f.env, USER)).credits, 0)
})
