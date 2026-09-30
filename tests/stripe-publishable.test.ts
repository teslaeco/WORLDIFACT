import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyStripePublishable, syncStripePublishable, publishableSetupError } from '../scripts/connect-stripe-publishable.ts'

function fixture() {
  const env = { STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture_public_123456', STRIPE_SECRET_KEY: 'sk_live_fixture_secret_123456', STRIPE_CONFIG_SOURCE: 'cloudflare' }
  const pi = { id: 'pi_Fixture', client_secret: 'pi_Fixture_secret_fake', customer: 'cus_Owner', livemode: true, status: 'succeeded', amount: 9999, currency: 'usd' }
  const invoice = { id: 'in_Fixture', customer: 'cus_Owner', livemode: true, paid: true, status: 'paid', amount_paid: 9999, amount_remaining: 0, currency: 'usd', billing_reason: 'subscription_update', payment_intent: pi }
  const state = { account: { id: 'acct_1UIG9ABrIVB6dkxN', country: 'PL', charges_enabled: true, email: 'owner@example.test' }, customers: { has_more: false, data: [{ id: 'cus_Owner', livemode: true }] }, invoices: { data: [invoice] }, publicRead: { ...pi }, fail: '' }
  const calls: { url: URL; options: RequestInit }[] = []
  const fetcher = (async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options })
    assert.equal(url.origin, 'https://api.stripe.com'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    if (state.fail === 'transport') throw new Error('sensitive provider text sk_live_do_not_log')
    if (state.fail === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })
    if (state.fail === 'large') return new Response('x'.repeat(262145), { headers: { 'Content-Type': 'application/json' } })
    if (url.pathname === '/v1/account') return Response.json(state.account)
    if (url.pathname === '/v1/customers') return Response.json(state.customers)
    if (url.pathname === '/v1/invoices') return Response.json(state.invoices)
    if (url.pathname === '/v1/invoices/in_Fixture') {
      assert.equal(new Headers(options.headers).get('Stripe-Version'), '2024-06-20')
      assert.equal(url.searchParams.get('expand[]'), 'payment_intent'); return Response.json(invoice)
    }
    if (url.pathname === '/v1/payment_intents/pi_Fixture') {
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer ' + env.STRIPE_PUBLISHABLE_KEY.trim())
      assert.equal(url.searchParams.get('client_secret'), pi.client_secret)
      return state.fail === 'public' ? Response.json({ error: { message: 'private details' } }, { status: 401 }) : Response.json(state.publicRead)
    }
    throw new Error('Unexpected path')
  }) as typeof fetch
  return { env, pi, invoice, state, calls, fetcher }
}

test('read-only verifier pairs both keys using only the already-paid original intent', async () => {
  const f = fixture(), result = await verifyStripePublishable(f.env, f.fetcher)
  assert.equal(result.status, 'PUBLISHABLE_KEY_VERIFIED_READ_ONLY'); assert.equal(result.paymentRequested, false)
  assert.equal(f.calls.length, 5); assert.ok(f.calls.every(c => c.options.method === 'GET'))
  assert.doesNotMatch(JSON.stringify(result), /pk_live_|sk_live_|_secret_|cus_|pi_|email/)
})
test('test/secret/malformed keys fail before any provider call', async () => {
  for (const key of ['', 'pk_test_fixture123456', 'sk_live_fixture_secret_123456', 'rk_live_fixture_restricted123456', 'pk_live_a\nmalformed', 'pk_live_' + 'a'.repeat(201)]) {
    const f = fixture(); f.env.STRIPE_PUBLISHABLE_KEY = key
    await assert.rejects(() => verifyStripePublishable(f.env, f.fetcher))
    assert.equal(f.calls.length, 0)
  }
})
test('wrong merchant or ambiguous owner lookup stops before requesting invoice secrets', async () => {
  for (const scenario of ['account', 'country', 'customer', 'pagination']) {
    const f = fixture()
    if (scenario === 'account') f.state.account.id = 'acct_Other'
    if (scenario === 'country') f.state.account.country = 'XX'
    if (scenario === 'customer') f.state.customers.data.push({ id: 'cus_Duplicate', livemode: true })
    if (scenario === 'pagination') f.state.customers.has_more = true
    await assert.rejects(() => verifyStripePublishable(f.env, f.fetcher)); assert.ok(f.calls.length <= 2)
  }
})
test('unsettled invoice, other customer, wrong amount or incompatible API cannot activate a key', async () => {
  for (const scenario of ['paid', 'customer', 'amount', 'intent', 'intent_customer', 'intent_mode', 'intent_state']) {
    const f = fixture()
    if (scenario === 'paid') f.invoice.paid = false
    if (scenario === 'customer') f.invoice.customer = 'cus_Other'
    if (scenario === 'amount') f.invoice.amount_paid = 100
    if (scenario === 'intent') f.invoice.payment_intent = null as any
    if (scenario === 'intent_customer') f.pi.customer = 'cus_Other'
    if (scenario === 'intent_mode') f.pi.livemode = false
    if (scenario === 'intent_state') f.pi.status = 'requires_payment_method'
    let writes = 0
    await assert.rejects(() => syncStripePublishable(f.env, f.fetcher, () => { writes++ }))
    assert.equal(writes, 0); assert.ok(f.calls.length <= 4)
  }
})
test('only matching public-key response may authorize deployment sync', async () => {
  for (const scenario of ['denied', 'id', 'status', 'mode', 'amount']) {
    const f = fixture(); let uploads = 0
    if (scenario === 'denied') f.state.fail = 'public'
    if (scenario === 'id') f.state.publicRead.id = 'pi_Other'
    if (scenario === 'status') f.state.publicRead.status = 'processing'
    if (scenario === 'mode') f.state.publicRead.livemode = false
    if (scenario === 'amount') f.state.publicRead.amount = 1
    await assert.rejects(() => syncStripePublishable(f.env, f.fetcher, () => { uploads++ }))
    assert.equal(uploads, 0)
  }
})
test('approved deployment payload contains only the normalized public key, preserving Stripe secrets and prices', async () => {
  const f = fixture(); f.env.STRIPE_PUBLISHABLE_KEY = '  ' + f.env.STRIPE_PUBLISHABLE_KEY + '\n'
  let uploads = 0
  const result = await syncStripePublishable(f.env, f.fetcher, (payload, childEnv) => {
    uploads++; assert.deepEqual(payload, { STRIPE_PUBLISHABLE_KEY: f.env.STRIPE_PUBLISHABLE_KEY.trim() })
    assert.equal(childEnv.STRIPE_PUBLISHABLE_KEY, undefined); assert.equal(childEnv.STRIPE_CONFIG_SOURCE, 'cloudflare')
  })
  assert.equal(uploads, 1); assert.equal(result.status, 'PUBLISHABLE_KEY_SYNCED')
})
test('redirects, large responses and private exception text never leak or trigger a sync', async () => {
  for (const failure of ['redirect', 'large', 'transport']) {
    const f = fixture(); f.state.fail = failure; let uploads = 0
    try { await syncStripePublishable(f.env, f.fetcher, () => { uploads++ }); assert.fail('expected rejection') }
    catch (error) { assert.doesNotMatch(publishableSetupError(error), /sk_live_|pk_live_|private details|evil\.test|sensitive provider/) }
    assert.equal(uploads, 0); assert.equal(f.calls.length, 1)
  }
  assert.doesNotMatch(publishableSetupError(new Error('sk_live_secret')), /sk_live_/)
})
