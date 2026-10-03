import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billingApi, type BillingEnv } from '../server/billing.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'

const uid = '11111111-1111-4111-8111-111111111111', customer = 'cus_Recovery', subId = 'sub_Recovery'
type Json = Record<string, any>
function fixture() {
  const now = Math.floor(Date.now() / 1000), end = now + 86400
  const map = new Map<string, unknown>([['balance', 605], ['customer', customer], ['grant:in_Base', { credits: 1500, revoked: 0, subscriptionId: subId }], ['subscription', { id: subId, plan: 'creator', until: end * 1000, active: false, revision: 1 }]])
  const storage: EntitlementStorage = { async get<T>(key: string) { return map.get(key) as T | undefined }, async put(key, value) { map.set(key, value) }, async transaction(fn) { return fn(storage) } }
  const env: BillingEnv = { ENABLE_BILLING: 'true', ENABLE_ASTRA_PLANS: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', ACCOUNT_LEDGER_MODE: 'sandbox', STRIPE_SECRET_KEY: 'sk_test_fixture_local', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_MODE: 'test', STRIPE_SUBSCRIPTION_PRICE_ID: 'price_Creator', STRIPE_PRO_PRICE_ID: 'price_Pro', STRIPE_STUDIO_PRICE_ID: 'price_Studio', STRIPE_SUBSCRIPTION_INTERVAL: 'month', STRIPE_TOPUP_PRICE_ID: 'price_Topup', STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_Management', STRIPE_PLAN_CHANGE_CONFIGURATION_ID: 'bpc_Changes', BILLING_PUBLIC_ORIGIN: 'https://worldifact.test', ACCOUNT_LIMITER: { async limit() { return { success: true } } }, ACCOUNT_ENTITLEMENTS: { idFromName: n => n, get: () => ({ fetch: r => new AccountEntitlements({ storage }, env).fetch(r) }) } }
  const subscription: Json = { id: subId, customer, livemode: false, status: 'active', metadata: { worldifact_uid: uid }, current_period_end: end, items: { data: [{ id: 'si_Recovery', quantity: 1, price: 'price_Creator' }] }, latest_invoice: 'in_Upgrade', pending_update: { subscription_items: [{ id: 'si_Recovery', quantity: 1, price: { id: 'price_Pro' } }] } }
  const base: Json = { id: 'in_Base', customer, subscription: subId, livemode: false, paid: true, status: 'paid', amount_paid: 2999, amount_due: 2999, amount_remaining: 0, total: 2999, currency: 'usd', billing_reason: 'subscription_create', lines: { data: [{ price: 'price_Creator', quantity: 1, amount: 2999, currency: 'usd', period: { start: now - 86400, end } }] } }
  const invoice: Json = { id: 'in_Upgrade', customer, subscription: subId, livemode: false, paid: false, status: 'open', amount_paid: 0, amount_due: 9999, amount_remaining: 9999, total: 9999, currency: 'usd', billing_reason: 'subscription_update', hosted_invoice_url: 'https://invoice.stripe.com/i/fixture', lines: { data: [{ price: 'price_Pro', quantity: 1, amount: 9999, currency: 'usd', period: { start: now, end: end + 86400 } }] } }
  const state = { subscriptions: [subscription], more: false, history: [base], authenticated: true, portalUrl: 'https://billing.stripe.com/p/session/fixture' }
  const calls: { url: string; method: string; body: string }[] = []
  const fetcher = (async (input: unknown, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET'; calls.push({ url, method, body: String(init?.body ?? '') })
    if (url.endsWith('/auth/v1/user')) return state.authenticated ? Response.json({ id: uid, email: 'fixture@example.test', user_metadata: { name: 'Fixture' } }) : Response.json({}, { status: 401 })
    if (url.includes('/v1/subscriptions?')) return Response.json({ data: state.subscriptions, has_more: state.more })
    if (url.endsWith('/v1/subscriptions/' + subId)) return Response.json(subscription)
    if (url.includes('/v1/invoices?')) return Response.json({ data: state.history, has_more: false })
    if (url.endsWith('/v1/invoices/in_Upgrade')) return Response.json(invoice)
    if (url.endsWith('/v1/invoices/in_Base')) return Response.json(base)
    if (url.includes('/v1/prices/')) { const id = url.split('/').pop()!; return Response.json({ id, livemode: false, active: true, unit_amount: id === 'price_Creator' ? 2999 : id === 'price_Studio' ? 14999 : 9999, currency: 'usd', type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }) }
    if (url.endsWith('/v1/checkout/sessions')) {
      const body = new URLSearchParams(String(init?.body)), plan = body.get('metadata[worldifact_plan]') ?? 'creator'
      return Response.json({ id: 'cs_Fresh', livemode: false, url: 'https://checkout.stripe.com/c/pay/fixture', status: 'open', payment_status: 'unpaid', expires_at: now + 3600,
        amount_total: plan === 'studio' ? 14999 : plan === 'pro' ? 9999 : 2999, currency: 'usd', mode: 'subscription', customer,
        client_reference_id: uid, metadata: { worldifact_uid: uid, worldifact_kind: 'subscription', worldifact_plan: plan, worldifact_checkout_id: body.get('metadata[worldifact_checkout_id]') } })
    }
    if (url.endsWith('/v1/billing_portal/sessions')) { const body = new URLSearchParams(String(init?.body)); return Response.json({ id: 'bps_Recovery', livemode: false, customer: { id: customer }, configuration: { id: body.get('configuration') }, url: state.portalUrl }) }
    throw new Error('Unexpected provider operation ' + method + ' ' + url)
  }) as typeof fetch
  const call = (action = 'status', body: Json = { action }, origin = 'https://worldifact.test', path = '/api/billing/recovery') => billingApi(new Request('https://worldifact.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: '__Host-worldifact-access=fixture-token' }, body: JSON.stringify(body) }), env, fetcher)
  return { map, env, calls, subscription, base, invoice, state, call, fetcher }
}

test('failed Pro upgrade restores only paid Creator period without duplicating credits or charging', async () => {
  const f = fixture()
  for (let i = 0; i < 2; i++) {
    const response = await f.call(); assert.equal(response?.status, 200)
    const body = await response!.json() as Json
    assert.equal(body.state, 'payment_required'); assert.equal(body.amountCents, 9999); assert.equal(body.activePlan, 'creator'); assert.equal(body.url, undefined)
  }
  const balance = await entitlementStatus(f.env, uid)
  assert.equal(balance.credits, 605); assert.equal(balance.subscription.active, true); assert.equal(balance.subscription.plan, 'creator')
  assert.equal(f.map.has('grant:in_Upgrade'), false); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('retry reopens only the existing verified invoice, without a Stripe write', async () => {
  const f = fixture(), response = await f.call('retry'), body = await response!.json() as Json
  assert.equal(response?.status, 200); assert.equal(body.url, f.invoice.hosted_invoice_url); assert.equal(body.destination, 'invoice'); assert.equal(body.requiresConfirmation, true)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('changed card uses payment-method portal deep link, even with a billing hold', async () => {
  const f = fixture(); f.map.set('billingHold', true)
  const response = await f.call('card'); assert.equal(response?.status, 200)
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 1); assert.match(writes[0].url, /billing_portal\/sessions$/)
  const params = new URLSearchParams(writes[0].body)
  assert.equal(params.get('customer'), customer); assert.equal(params.get('flow_data[type]'), 'payment_method_update')
  assert.equal(params.get('flow_data[after_completion][redirect][return_url]'), 'https://worldifact.test/account/credits?billing=returned')
  assert.equal(f.map.get('balance'), 605)
})
test('confirmed upgraded invoice grants Pro credits once, never from a return URL', async () => {
  const f = fixture(); f.subscription.pending_update = null; f.subscription.items.data[0].price = 'price_Pro'
  Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: 9999, amount_remaining: 0 })
  for (let i = 0; i < 2; i++) assert.equal((await f.call())?.status, 200)
  const balance = await entitlementStatus(f.env, uid)
  assert.equal(balance.credits, 5105); assert.equal(balance.subscription.active, true); assert.equal(balance.subscription.plan, 'pro')
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('existing status recovery repairs paid Pro points with a stale Creator projection without adding funding', async () => {
  const f = fixture(), revision = Math.floor(Date.now() / 1000) * 1000
  f.subscription.pending_update = null; f.subscription.items.data[0].price = 'price_Pro'
  Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: 9999, amount_remaining: 0 })
  f.map.set('subscription', { ...(f.map.get('subscription') as Json), active: true, revision })
  // Payment and membership are separate durable calls. A delayed event may
  // commit its idempotent grant while a newer Creator snapshot rejects its plan.
  assert.equal((await entitlementCall<{ granted: boolean }>(f.env, uid, '/grant', { id: 'in_Upgrade', credits: 4500, subscriptionId: subId })).granted, true)
  assert.deepEqual(await entitlementCall(f.env, uid, '/subscription', { id: subId, active: true, until: f.subscription.current_period_end * 1000, revision: revision - 1000, plan: 'pro', grantId: 'in_Upgrade' }), { updated: false })
  assert.equal((await entitlementStatus(f.env, uid)).subscription.plan, 'creator')
  const credits = f.map.get('balance'), funding = f.map.get('provider-budget-cents:v1')
  for (let i = 0; i < 2; i++) {
    assert.equal((await (await f.call())!.json() as Json).activePlan, 'pro')
    assert.equal((await entitlementStatus(f.env, uid)).subscription.plan, 'pro')
    assert.equal(f.map.get('balance'), credits)
    assert.equal(f.map.get('provider-budget-cents:v1'), funding)
  }
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('a retried paid-upgrade webhook repairs an interrupted membership write without repeating its grant', async () => {
  const f = fixture()
  f.subscription.pending_update = null; f.subscription.items.data[0].price = 'price_Pro'
  Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: 9999, amount_remaining: 0 })
  const get = f.env.ACCOUNT_ENTITLEMENTS!.get
  let failMembershipWrite = true
  f.env.ACCOUNT_ENTITLEMENTS!.get = id => {
    const ledger = get(id)
    return { fetch: request => {
      if (new URL(request.url).pathname === '/subscription' && failMembershipWrite) {
        failMembershipWrite = false
        return Promise.resolve(Response.json({ error: 'Synthetic interrupted write' }, { status: 503 }))
      }
      return ledger.fetch(request)
    } }
  }
  const webhook = async () => {
    const created = Math.floor(Date.now() / 1000)
    const payload = JSON.stringify({ id: 'evt_UpgradeRetry', type: 'invoice.paid', created, livemode: false, data: { object: { id: 'in_Upgrade' } } })
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(f.env.STRIPE_WEBHOOK_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${created}.${payload}`))).toString('hex')
    return billingApi(new Request('https://worldifact.test/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${created},v1=${signature}`, 'Content-Type': 'application/json' }, body: payload }), f.env, f.fetcher)
  }
  assert.equal((await webhook())?.status, 503)
  assert.equal(f.map.get('balance'), 5105)
  assert.equal((await entitlementStatus(f.env, uid)).subscription.plan, 'creator')
  const funding = f.map.get('provider-budget-cents:v1')
  for (let i = 0; i < 2; i++) assert.equal((await webhook())?.status, 200)
  assert.equal((await entitlementStatus(f.env, uid)).subscription.plan, 'pro')
  assert.equal(f.map.get('balance'), 5105)
  assert.equal(f.map.get('provider-budget-cents:v1'), funding)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('an incomplete first payment has recovery but no paid access or credits', async () => {
  const f = fixture(); f.subscription.status = 'incomplete'; f.subscription.pending_update = null; f.subscription.items.data[0].price = 'price_Pro'; f.invoice.billing_reason = 'subscription_create'; f.state.history = []
  const body = await (await f.call('retry'))!.json() as Json
  assert.equal(body.canRetry, true); assert.equal(body.activePlan, null); assert.equal(f.map.get('balance'), 605)
  assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
})
test('expired or canceled subscriptions cannot reopen an old invoice', async () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    const f = fixture(); f.subscription.status = status
    const body = await (await f.call('retry'))!.json() as Json
    assert.equal(body.state, 'none'); assert.equal(body.canRetry, false); assert.equal(body.url, undefined)
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('voided pending-upgrade invoice is not payable and preserves verified base access', async () => {
  const f = fixture(); f.invoice.status = 'void'; f.invoice.amount_remaining = 0; f.subscription.pending_update = null
  const body = await (await f.call('retry'))!.json() as Json
  assert.equal(body.state, 'active'); assert.equal(body.url, undefined); assert.equal(f.map.get('balance'), 605)
})
test('old paid periods, refunded grants and mismatched history do not restore access', async () => {
  for (const change of ['expired', 'refund', 'foreign']) {
    const f = fixture()
    if (change === 'expired') f.base.lines.data[0].period.end -= 86400
    if (change === 'refund') f.map.set('grant:in_Base', { credits: 1500, revoked: 1500, subscriptionId: subId })
    if (change === 'foreign') f.base.customer = 'cus_Other'
    await f.call()
    assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
    assert.equal(f.map.get('balance'), 605)
  }
})
test('foreign customer, UID, invoice, unknown plan, multiple subscriptions or truncated list fail closed', async () => {
  for (const change of ['customer', 'uid', 'invoice', 'plan', 'multiple', 'truncated']) {
    const f = fixture()
    if (change === 'customer') f.subscription.customer = 'cus_Other'
    if (change === 'uid') f.subscription.metadata.worldifact_uid = '22222222-2222-4222-8222-222222222222'
    if (change === 'invoice') f.invoice.customer = 'cus_Other'
    if (change === 'plan') f.subscription.items.data[0].price = 'price_Unknown'
    if (change === 'multiple') f.state.subscriptions.push(structuredClone(f.subscription))
    if (change === 'truncated') f.state.more = true
    const body = await (await f.call('retry'))!.json() as Json
    assert.equal(body.state, 'review'); assert.equal(body.url, undefined); assert.equal(body.canRetry, false)
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('invoice amount and destination tampering never yields a payment link', async () => {
  for (const change of ['amount', 'foreign-host', 'credentials', 'port']) {
    const f = fixture()
    if (change === 'amount') f.invoice.total = 10000
    if (change === 'foreign-host') f.invoice.hosted_invoice_url = 'https://invoice.stripe.com.evil.test/i/fixture'
    if (change === 'credentials') f.invoice.hosted_invoice_url = 'https://user@invoice.stripe.com/i/fixture'
    if (change === 'port') f.invoice.hosted_invoice_url = 'https://invoice.stripe.com:8443/i/fixture'
    const response = await f.call('retry'), body = await response!.json() as Json
    assert.equal(body.url, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('recovery requires authentication, same-origin and refuses client-supplied resource IDs', async () => {
  const f = fixture()
  assert.equal((await f.call('retry', { action: 'retry' }, 'https://evil.test'))?.status, 403)
  assert.equal((await f.call('retry', { action: 'retry', customer: 'cus_Other' }))?.status, 400)
  assert.equal((await f.call('retry', { action: 'retry', invoice: 'in_Other' }))?.status, 400)
  f.state.authenticated = false; assert.equal((await f.call())?.status, 401)
  assert.equal(f.calls.filter(c => c.url.includes('api.stripe.com')).length, 0)
})
test('recovery without a linked customer does not create a customer, checkout or subscription', async () => {
  const f = fixture(); f.map.delete('customer')
  const body = await (await f.call())!.json() as Json
  assert.equal(body.state, 'none'); assert.equal(body.canManage, false)
  assert.equal(f.calls.filter(c => c.url.includes('api.stripe.com')).length, 0)
})


test('an expired void upgrade can be reviewed again for the SAME paid subscription', async () => {
  const f = fixture(); f.invoice.status = 'void'; f.invoice.amount_remaining = 0; f.subscription.pending_update = null
  await f.call()
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 200)
  const writes = f.calls.filter(c => c.method === 'POST')
  assert.equal(writes.length, 1); assert.match(writes[0].url, /billing_portal\/sessions$/)
  const body = new URLSearchParams(writes[0].body)
  assert.equal(body.get('flow_data[type]'), 'subscription_update_confirm')
  assert.equal(body.get('flow_data[subscription_update_confirm][subscription]'), subId)
  assert.equal(body.get('flow_data[subscription_update_confirm][items][0][price]'), 'price_Pro')
  assert.equal(f.map.get('balance'), 605)
})
test('an open unpaid upgrade still cannot open a second plan-change confirmation', async () => {
  const f = fixture(); await f.call(); f.subscription.pending_update = null
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 409); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('void invoice alone cannot authorize a plan change from a stale active ledger', async () => {
  const f = fixture(); f.invoice.status = 'void'; f.invoice.amount_remaining = 0; f.subscription.pending_update = null; f.state.history = []
  const previous = f.map.get('subscription') as Json
  f.map.set('subscription', { ...previous, active: true, grantId: 'in_Base' })
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 409); assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('terminal Stripe state clears a phantom active membership after a missed webhook', async () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    const f = fixture(); f.subscription.status = status
    const previous = f.map.get('subscription') as Json
    f.map.set('subscription', { ...previous, active: true, grantId: 'in_Base' })
    const response = await f.call(); assert.equal(response?.status, 200)
    assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
    assert.equal(f.map.get('balance'), 605); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})


const choosePlan = (f: ReturnType<typeof fixture>, plan: string) => f.call('status', { plan }, 'https://worldifact.test', '/api/billing/plan-payment')
test('plan card resumes the same failed Pro payment directly, including stale Free UI state', async () => {
  const f = fixture()
  for (let i = 0; i < 3; i++) {
    const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
    assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(body.url, f.invoice.hosted_invoice_url)
  }
  assert.equal(f.map.get('balance'), 605); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('Studio card with a failed Pro upgrade opens Studio confirmation on the SAME subscription', async () => {
  const f = fixture(), beforeInvoice = structuredClone(f.invoice), beforePending = structuredClone(f.subscription.pending_update)
  const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'portal'); assert.equal(body.requiresConfirmation, true)
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 1)
  assert.match(writes[0].url, /billing_portal\/sessions$/)
  const params = new URLSearchParams(writes[0].body)
  assert.equal(params.get('flow_data[type]'), 'subscription_update_confirm')
  assert.equal(params.get('flow_data[subscription_update_confirm][subscription]'), subId)
  assert.equal(params.get('flow_data[subscription_update_confirm][items][0][price]'), 'price_Studio')
  assert.deepEqual(f.invoice, beforeInvoice); assert.deepEqual(f.subscription.pending_update, beforePending); assert.equal(f.map.get('balance'), 605)
})
test('Studio card retries a failed Studio invoice instead of presenting Pro payment', async () => {
  const f = fixture(); f.subscription.pending_update.subscription_items[0].price.id = 'price_Studio'
  f.invoice.lines.data[0].price = 'price_Studio'; f.invoice.lines.data[0].amount = 14999
  Object.assign(f.invoice, { total: 14999, amount_due: 14999, amount_remaining: 14999 })
  const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(body.amountCents, 14999)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('Pro and Studio paid grants add to 605 once; revisiting the same plan never purchases again', async () => {
  for (const [plan, price, amount, credits] of [['pro', 'price_Pro', 9999, 4500], ['studio', 'price_Studio', 14999, 7500]] as const) {
    const f = fixture(); f.subscription.pending_update = null; f.subscription.items.data[0].price = price
    f.invoice.lines.data[0].price = price; f.invoice.lines.data[0].amount = amount
    Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: amount, total: amount, amount_due: amount, amount_remaining: 0 })
    for (let i = 0; i < 2; i++) {
      const r = await choosePlan(f, plan), body = await r!.json() as Json
      assert.equal(r?.status, 200); assert.equal(body.destination, 'portal')
      assert.equal((await entitlementStatus(f.env, uid)).credits, 605 + credits)
    }
    assert.equal(f.calls.filter(c => c.method === 'POST').every(c => c.url.endsWith('/billing_portal/sessions')), true)
  }
})
test('expired unpaid upgrade opens a fresh customer confirmation, not a stale invoice', async () => {
  const f = fixture(); f.subscription.pending_update = null; f.invoice.status = 'void'; f.invoice.amount_remaining = 0
  const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'portal'); assert.equal(f.map.get('balance'), 605)
})
test('no open subscription opens and reuses a single new checkout for the requested plan', async () => {
  const f = fixture(); f.state.subscriptions = []; f.map.delete('subscription')
  for (let i = 0; i < 2; i++) {
    const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
    assert.equal(r?.status, 200); assert.equal(body.destination, 'checkout'); assert.equal(body.url, 'https://checkout.stripe.com/c/pay/fixture')
  }
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 1)
  assert.equal(new URLSearchParams(writes[0].body).get('line_items[0][price]'), 'price_Studio'); assert.equal(f.map.get('balance'), 605)
})
test('an incomplete first subscription resumes payment even without paid membership', async () => {
  const f = fixture(); f.subscription.status = 'incomplete'; f.subscription.pending_update = null
  f.subscription.items.data[0].price = 'price_Pro'; f.invoice.billing_reason = 'subscription_create'; f.state.history = []
  const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(f.map.get('balance'), 605)
  const other = await choosePlan(f, 'studio'), otherBody = await other!.json() as Json
  assert.equal(other?.status, 200); assert.equal(otherBody.state, 'payment_required_other'); assert.equal(otherBody.url, undefined)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('billing hold, foreign ownership and duplicate subscriptions do not become new payments', async () => {
  for (const change of ['hold', 'foreign', 'multiple']) {
    const f = fixture()
    if (change === 'hold') f.map.set('billingHold', true)
    if (change === 'foreign') f.subscription.customer = 'cus_Other'
    if (change === 'multiple') f.state.subscriptions.push(structuredClone(f.subscription))
    const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
    assert.equal(body.state, 'review'); assert.equal(body.url, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('changing a pending plan rejects partial payment, wrong item, proration and scheduled changes', async () => {
  for (const change of ['partial', 'item', 'proration', 'schedule', 'cancel']) {
    const f = fixture()
    if (change === 'partial') { f.invoice.amount_paid = 100; f.invoice.amount_remaining = 9899 }
    if (change === 'item') f.subscription.pending_update.subscription_items[0].id = 'si_Other'
    if (change === 'proration') f.invoice.lines.data[0].proration = true
    if (change === 'schedule') f.subscription.schedule = 'sub_sched_Fixture'
    if (change === 'cancel') f.subscription.cancel_at_period_end = true
    const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
    assert.equal(body.url, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0); assert.equal(f.map.get('balance'), 605)
  }
})
test('plan action validates identity, origin, target and body before Stripe operations', async () => {
  const f = fixture()
  assert.equal((await choosePlan(f, 'enterprise'))?.status, 400)
  assert.equal((await f.call('status', { plan: 'pro', customer: 'cus_Other' }, 'https://worldifact.test', '/api/billing/plan-payment'))?.status, 400)
  assert.equal((await f.call('status', { plan: 'pro' }, 'https://evil.test', '/api/billing/plan-payment'))?.status, 403)
  f.state.authenticated = false; assert.equal((await choosePlan(f, 'pro'))?.status, 401)
  assert.equal(f.calls.filter(c => c.url.includes('api.stripe.com')).length, 0)
})
