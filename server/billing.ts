import { getVerifiedAccount, type AccountEnv, type AccountUser } from './accounts.ts'
import { ACCOUNT_ID, entitlementCall, entitlementStatus, EntitlementError, type EntitlementEnv } from './entitlements.ts'

export interface BillingEnv extends AccountEnv, EntitlementEnv {
  ENABLE_BILLING?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_MODE?: string
  STRIPE_SUBSCRIPTION_PRICE_ID?: string
  STRIPE_SUBSCRIPTION_INTERVAL?: string
  STRIPE_TOPUP_PRICE_ID?: string
  /** Up to ten previously approved fixed-pack prices, for existing payment settlement and reversals only. */
  STRIPE_PREVIOUS_TOPUP_PRICE_IDS?: string
  /** Legacy setting; the approved credit pack is fixed in server code. */
  STRIPE_TOPUP_CREDITS?: string
  BILLING_PUBLIC_ORIGIN?: string
}
// Pin both API calls and the configured webhook endpoint to this documented version.
export const STRIPE_API_VERSION = '2024-06-20'
export const CREDIT_PACK = Object.freeze({ amount: 3000, currency: 'USD', credits: 1500, kind: 'one_time' as const })
type Json = Record<string, unknown>
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const array = (value: unknown): Json[] => Array.isArray(value) ? value.map(object) : []
const idOf = (value: unknown) => typeof value === 'string' ? value : typeof object(value).id === 'string' ? object(value).id as string : ''
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
const priceId = (value: unknown) => typeof value === 'string' && /^price_[A-Za-z0-9]{1,180}$/.test(value)
const resourceId = (value: unknown, prefix: string) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,180}$`).test(value)
function previousTopupPrices(env: BillingEnv): string[] | null {
  if (!env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS) return []
  if (env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS.length > 1900) return null
  const ids = env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS.split(',').map(value => value.trim())
  return ids.length <= 10 && ids.every(priceId) && new Set(ids).size === ids.length ? ids : null
}
function billingConfig(env: BillingEnv) {
  let origin: string | null = null
  try { const url = new URL(env.BILLING_PUBLIC_ORIGIN ?? ''); if (url.protocol === 'https:' && url.origin === env.BILLING_PUBLIC_ORIGIN && !url.username && !url.password) origin = url.origin } catch { /* Fail closed. */ }
  const mode = env.STRIPE_MODE, modeValid = mode === 'test' || mode === 'live'
  const ledgerModeMatches = mode === 'test' ? env.ACCOUNT_LEDGER_MODE === 'sandbox' : env.ACCOUNT_LEDGER_MODE === undefined || env.ACCOUNT_LEDGER_MODE === 'live'
  const interval = ['month', 'year'].includes(env.STRIPE_SUBSCRIPTION_INTERVAL ?? '') ? env.STRIPE_SUBSCRIPTION_INTERVAL as 'month' | 'year' : null
  const ready = env.ENABLE_BILLING === 'true' && env.ENFORCE_ACCOUNT_ENTITLEMENTS === 'true' && !!env.ACCOUNT_ENTITLEMENTS && !!origin && modeValid && ledgerModeMatches && !!env.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`) && !!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')
  return { ready, origin, topup: ready && priceId(env.STRIPE_TOPUP_PRICE_ID) && previousTopupPrices(env) !== null, subscription: ready && priceId(env.STRIPE_SUBSCRIPTION_PRICE_ID) && !!interval, interval, mode: modeValid ? mode : null }
}
async function boundedText(value: Request | Response, maximum: number) {
  if (Number(value.headers.get('Content-Length')) > maximum) throw new EntitlementError('Billing request is too large.', 413)
  const reader = value.body?.getReader()
  if (!reader) return ''
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > maximum) throw new EntitlementError('Billing request is too large.', 413); chunks.push(next.value) }
  } catch (error) { await reader.cancel(); throw error }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
async function stripe(env: BillingEnv, path: string, fetcher: typeof fetch, params?: URLSearchParams, key?: string): Promise<Json> {
  const response = await fetcher(`https://api.stripe.com/v1${path}`, {
    method: params ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_API_VERSION, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(params ? { body: params.toString() } : {}),
  })
  if (!response.ok) { await response.body?.cancel(); throw new EntitlementError('Billing could not be confirmed. Please retry the same action later.', 502) }
  const body = object(JSON.parse(await boundedText(response, 256_000)))
  // List envelopes lack livemode; every resource response must explicitly match the selected mode.
  if ((!Array.isArray(body.data) || body.livemode !== undefined) && body.livemode !== (env.STRIPE_MODE === 'live')) throw new EntitlementError('Billing mode mismatch.', 503)
  return body
}
async function customerFor(env: BillingEnv, user: AccountUser, fetcher: typeof fetch) {
  const stored = await entitlementCall<{ customer: string | null }>(env, user.id, '/billing')
  if (stored.customer) return stored.customer
  const customer = await stripe(env, '/customers', fetcher, new URLSearchParams({ email: user.email, 'metadata[worldifact_uid]': user.id }), `wf-customer-v1-${user.id}`)
  if (!resourceId(customer.id, 'cus')) throw new EntitlementError('Billing customer was not confirmed.')
  const saved = await entitlementCall<{ saved: boolean }>(env, user.id, '/customer', { customer: customer.id })
  if (!saved.saved) throw new EntitlementError('Billing customer could not be linked.')
  return customer.id as string
}
async function verifiedPrice(env: BillingEnv, kind: 'subscription' | 'topup', fetcher: typeof fetch, allowArchived = false, settlementPriceId?: string) {
  const id = settlementPriceId ?? (kind === 'subscription' ? env.STRIPE_SUBSCRIPTION_PRICE_ID : env.STRIPE_TOPUP_PRICE_ID)
  if (!priceId(id)) throw new EntitlementError('This payment option is not configured.')
  const price = await stripe(env, `/prices/${id}`, fetcher)
  if (price.id !== id || (!allowArchived && price.active !== true) || price.unit_amount !== CREDIT_PACK.amount || price.currency !== 'usd' || (kind === 'subscription' ? price.type !== 'recurring' : price.type !== 'one_time')) throw new EntitlementError('The configured price must be exactly USD 30.00 for 1500 credits.')
  // Unknown periods, quantities and tiers are not silently turned into a different offer.
  if (price.billing_scheme !== 'per_unit' || price.transform_quantity != null || (kind === 'subscription' && (!billingConfig(env).interval || object(price.recurring).interval !== billingConfig(env).interval || object(price.recurring).interval_count !== 1 || object(price.recurring).usage_type !== 'licensed'))) throw new EntitlementError('The configured billing interval needs operator review.')
  return price
}
export async function verifyStripeSignature(payload: string, signature: string, secret: string, now = Date.now()) {
  if (signature.length > 2048 || !secret.startsWith('whsec_')) return false
  const parts = signature.split(',').map(part => part.trim().split('='))
  const timestamps = parts.filter(([name]) => name === 't')
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0][1] ?? '')) return false
  const stamp = Number(timestamps[0][1])
  if (Math.abs(now / 1000 - stamp) > 300) return false
  const signatures = parts.filter(([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/i.test(value ?? ''))
  if (!signatures.length) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const [, value] of signatures) {
    const bytes = new Uint8Array(value.match(/../g)!.map(part => parseInt(part, 16)))
    if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${stamp}.${payload}`))) return true
  }
  return false
}
function uidFor(value: Json) {
  const uid = object(value.metadata).worldifact_uid
  return typeof uid === 'string' && ACCOUNT_ID.test(uid) ? uid : null
}
function subscriptionOf(invoice: Json) {
  return idOf(invoice.subscription) || idOf(object(object(invoice.parent).subscription_details).subscription)
}
function matchingLines(invoice: Json, price: string | undefined) {
  const lines = object(invoice.lines)
  if (lines.has_more === true) throw new EntitlementError('The subscription invoice requires review.', 502)
  return array(lines.data).filter(line => (idOf(line.price) || idOf(object(object(line.pricing).price_details).price)) === price && line.proration !== true)
}
function exactInvoice(env: BillingEnv, invoice: Json) {
  const lines = matchingLines(invoice, env.STRIPE_SUBSCRIPTION_PRICE_ID)
  return invoice.paid === true && invoice.status === 'paid' && invoice.amount_paid === CREDIT_PACK.amount && invoice.total === CREDIT_PACK.amount && invoice.currency === 'usd'
    && array(object(invoice.lines).data).length === 1 && lines.length === 1 && lines[0].quantity === 1 && lines[0].amount === CREDIT_PACK.amount && lines[0].currency === 'usd'
    && ['subscription_create', 'subscription_cycle'].includes(String(invoice.billing_reason))
}
async function checkCustomer(env: BillingEnv, uid: string, value: unknown) {
  const customer = idOf(value)
  if (!resourceId(customer, 'cus')) throw new EntitlementError('Billing customer was not confirmed.', 400)
  const stored = await entitlementCall<{ customer: string | null }>(env, uid, '/billing')
  if (stored.customer !== customer) throw new EntitlementError('Billing account does not match.', 400)
}
async function syncSubscription(env: BillingEnv, subscription: Json, revision: number, fetcher: typeof fetch) {
  const uid = uidFor(subscription)
  if (!uid || !resourceId(subscription.id, 'sub')) return
  await checkCustomer(env, uid, subscription.customer)
  const items = array(object(subscription.items).data)
  const item = items.find(item => idOf(item.price) === env.STRIPE_SUBSCRIPTION_PRICE_ID)
  if (!item || items.length !== 1 || item.quantity !== 1 || object(subscription.items).has_more === true) return
  const end = Number(item.current_period_end ?? subscription.current_period_end) * 1000
  const invoiceId = idOf(subscription.latest_invoice)
  let paid = false, grantId: string | undefined
  if (billingConfig(env).subscription && resourceId(invoiceId, 'in') && subscription.status === 'active') {
    await verifiedPrice(env, 'subscription', fetcher, true)
    const invoice = await stripe(env, `/invoices/${invoiceId}`, fetcher)
    paid = exactInvoice(env, invoice) && subscriptionOf(invoice) === subscription.id
    if (paid) {
      await checkCustomer(env, uid, invoice.customer)
      grantId = invoiceId
      // Subscription events may beat invoice.paid or arrive after a missed delivery.
      // The same verified invoice ID is the grant key across both paths.
      await entitlementCall(env, uid, '/grant', { id: invoiceId, credits: 1500, subscriptionId: subscription.id })
    }
  }
  await entitlementCall(env, uid, '/subscription', { id: subscription.id, active: paid && subscription.status === 'active' && Number.isSafeInteger(end), until: Number.isSafeInteger(end) ? end : 0, revision, grantId, terminal: ['canceled', 'incomplete_expired'].includes(String(subscription.status)) })
}
async function invoicePaid(env: BillingEnv, invoice: Json, revision: number, fetcher: typeof fetch) {
  if (!billingConfig(env).subscription || !exactInvoice(env, invoice)) return
  await verifiedPrice(env, 'subscription', fetcher, true)
  const subId = subscriptionOf(invoice)
  if (!resourceId(subId, 'sub') || !resourceId(invoice.id, 'in')) return
  const subscription = await stripe(env, `/subscriptions/${subId}`, fetcher), uid = uidFor(subscription)
  const items = array(object(subscription.items).data)
  if (!uid || items.length !== 1 || items[0].quantity !== 1 || idOf(items[0].price) !== env.STRIPE_SUBSCRIPTION_PRICE_ID || object(subscription.items).has_more === true) return
  await checkCustomer(env, uid, invoice.customer)
  await checkCustomer(env, uid, subscription.customer)
  await entitlementCall(env, uid, '/grant', { id: invoice.id, credits: 1500, subscriptionId: subId })
  await syncSubscription(env, subscription, revision, fetcher)
}
async function topupSession(env: BillingEnv, session: Json, fetcher: typeof fetch, reverse = false) {
  const uid = uidFor(session), paymentId = idOf(session.payment_intent)
  if (!uid || session.mode !== 'payment' || object(session.metadata).worldifact_kind !== 'topup' || !resourceId(paymentId, 'pi') || !resourceId(session.id, 'cs')) return
  if (session.livemode !== (env.STRIPE_MODE === 'live') || session.amount_total !== CREDIT_PACK.amount || session.currency !== 'usd' || session.client_reference_id !== uid) throw new EntitlementError('Top-up payment could not be verified.', 400)
  if (!reverse && (session.payment_status !== 'paid' || session.status !== 'complete')) return
  await checkCustomer(env, uid, session.customer)
  const lines = await stripe(env, `/checkout/sessions/${session.id}/line_items?limit=2`, fetcher), items = array(lines.data)
  const previous = previousTopupPrices(env), actualPriceId = idOf(items[0]?.price)
  if (!previous || lines.has_more === true || items.length !== 1 || ![env.STRIPE_TOPUP_PRICE_ID, ...previous].includes(actualPriceId) || items[0].quantity !== 1 || items[0].amount_total !== CREDIT_PACK.amount || items[0].currency !== 'usd' || object(session.metadata).worldifact_credits !== String(CREDIT_PACK.credits)) throw new EntitlementError('Top-up product could not be verified.', 400)
  // New purchases use only the current price. Settlement and reversals can retain an explicitly
  // allowlisted historical price, but still require its authoritative fixed USD 30 pack details.
  await verifiedPrice(env, 'topup', fetcher, true, actualPriceId)
  await entitlementCall(env, uid, reverse ? '/revoke' : '/grant', { id: paymentId, credits: CREDIT_PACK.credits })
  await clearCheckout(env, uid, session)
}
async function clearCheckout(env: BillingEnv, uid: string, session: Json) {
  const metadata = object(session.metadata)
  if (typeof metadata.worldifact_checkout_id === 'string' && ['subscription', 'topup'].includes(String(metadata.worldifact_kind)))
    await entitlementCall(env, uid, '/checkout-clear', { kind: metadata.worldifact_kind, id: metadata.worldifact_checkout_id })
}
async function reverseCharge(env: BillingEnv, charge: Json, fetcher: typeof fetch) {
  // Any partial refund or open dispute revokes the whole affected grant. Human reconciliation can restore a won dispute.
  if (!(Number(charge.amount_refunded) > 0 || charge.disputed === true)) return
  const invoiceId = idOf(charge.invoice)
  if (resourceId(invoiceId, 'in')) {
    const invoice = await stripe(env, `/invoices/${invoiceId}`, fetcher), subId = subscriptionOf(invoice)
    if (!resourceId(subId, 'sub') || matchingLines(invoice, env.STRIPE_SUBSCRIPTION_PRICE_ID).length !== 1) return
    const subscription = await stripe(env, `/subscriptions/${subId}`, fetcher), uid = uidFor(subscription)
    if (!uid) return
    await checkCustomer(env, uid, charge.customer)
    await checkCustomer(env, uid, invoice.customer)
    await checkCustomer(env, uid, subscription.customer)
    await entitlementCall(env, uid, '/revoke', { id: invoiceId, credits: 1500 })
    return
  }
  const paymentId = idOf(charge.payment_intent)
  if (!resourceId(paymentId, 'pi')) return
  const sessions = await stripe(env, `/checkout/sessions?payment_intent=${paymentId}&limit=2`, fetcher)
  if (sessions.has_more === true || array(sessions.data).length !== 1) return
  const session = array(sessions.data)[0]
  if (idOf(session.payment_intent) !== paymentId || idOf(session.customer) !== idOf(charge.customer)) throw new EntitlementError('Refund account does not match.', 400)
  await topupSession(env, session, fetcher, true)
}
async function webhook(request: Request, env: BillingEnv, fetcher: typeof fetch) {
  const payload = await boundedText(request, 256_000)
  if (!await verifyStripeSignature(payload, request.headers.get('Stripe-Signature') ?? '', env.STRIPE_WEBHOOK_SECRET ?? '')) return json({ error: 'Invalid webhook signature.' }, 400)
  const event = object(JSON.parse(payload)), value = object(object(event.data).object)
  if (!resourceId(event.id, 'evt') || event.livemode !== (env.STRIPE_MODE === 'live') || !Number.isSafeInteger(event.created)) return json({ error: 'Invalid billing event.' }, 400)
  const revision = Number(event.created) * 1000
  // Re-fetch from Stripe: a signed delayed event must never resurrect outdated subscription state.
  if (event.type === 'invoice.paid' && resourceId(value.id, 'in')) await invoicePaid(env, await stripe(env, `/invoices/${value.id}`, fetcher), revision, fetcher)
  else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(String(event.type)) && resourceId(value.id, 'cs')) {
    const session = await stripe(env, `/checkout/sessions/${value.id}`, fetcher)
    await topupSession(env, session, fetcher)
  }
  else if (event.type === 'checkout.session.expired' && resourceId(value.id, 'cs')) {
    const session = await stripe(env, `/checkout/sessions/${value.id}`, fetcher), uid = uidFor(session)
    if (uid && session.status === 'expired') { await checkCustomer(env, uid, session.customer); await clearCheckout(env, uid, session) }
  }
  else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(String(event.type)) && resourceId(value.id, 'sub')) await syncSubscription(env, await stripe(env, `/subscriptions/${value.id}`, fetcher), revision, fetcher)
  else if (event.type === 'charge.refunded' && resourceId(value.id, 'ch')) await reverseCharge(env, await stripe(env, `/charges/${value.id}`, fetcher), fetcher)
  else if (['charge.dispute.created', 'charge.dispute.updated'].includes(String(event.type)) && resourceId(value.charge, 'ch')) await reverseCharge(env, await stripe(env, `/charges/${value.charge}`, fetcher), fetcher)
  return json({ received: true })
}
export async function billingApi(request: Request, env: BillingEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/billing/')) return null
  const config = billingConfig(env)
  if (url.pathname === '/api/billing/status' && request.method === 'GET') return json({ status: config.subscription || config.topup ? 'CONFIGURED' : 'BLOCKED', checkoutReady: config.subscription, topupReady: config.topup, mode: config.mode, subscriptionInterval: config.interval, subscriptionCredits: CREDIT_PACK.credits, generationCost: 50, modelsPerSubscriptionGrant: 30, topupCredits: CREDIT_PACK.credits, price: CREDIT_PACK, cardReady: config.topup || config.subscription, googlePay: config.topup || config.subscription ? 'eligible_devices' : 'unavailable', reason: config.topup || config.subscription ? 'Card checkout and eligible Google Pay wallets use Stripe. Credits are granted only after verified payment. Recurring billing requires a configured interval.' : 'Card checkout requires payment settings. Recurring billing also requires an explicitly configured month or year interval.' })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!config.ready) return json({ status: 'BLOCKED', error: 'Payments are not configured. No checkout or charge was created.' }, 503)
  try {
    if (url.pathname === '/api/billing/webhook') return await webhook(request, env, fetcher)
    if (request.headers.get('Origin') !== url.origin || url.origin !== config.origin) return json({ error: 'Same-origin request required.' }, 403)
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in before opening billing.' }, 401)
    const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
    if (!limiter || !(await limiter.limit({ key: `billing:${user.id}` })).success) return json({ error: 'Billing request limit reached.' }, limiter ? 429 : 503)
    if (url.pathname === '/api/billing/portal') {
      const stored = await entitlementCall<{ customer: string | null }>(env, user.id, '/billing')
      if (!stored.customer) return json({ error: 'There is no billing account to manage yet.' }, 409)
      const session = await stripe(env, '/billing_portal/sessions', fetcher, new URLSearchParams({ customer: stored.customer, return_url: `${config.origin}/account/credits` }))
      if (typeof session.url !== 'string' || !session.url.startsWith('https://billing.stripe.com/')) throw new EntitlementError('Billing portal was not confirmed.')
      return json({ url: session.url })
    }
    if (url.pathname !== '/api/billing/checkout') return json({ error: 'Not found.' }, 404)
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
    const input = object(JSON.parse(await boundedText(request, 1024)))
    if (Object.keys(input).some(key => key !== 'kind') || !['subscription', 'topup'].includes(String(input.kind))) return json({ error: 'Choose subscription or topup.' }, 400)
    const kind = input.kind as 'subscription' | 'topup', allowance = await entitlementStatus(env, user.id)
    if (allowance.billingReview) return json({ error: 'This billing account requires support review.' }, 409)
    if (kind === 'subscription' && !config.subscription) return json({ error: 'Subscriptions are unavailable until the billing interval and price are configured.' }, 503)
    if (kind === 'subscription' && allowance.subscription.active) return json({ error: 'A subscription is already active. Use Manage billing or buy more credits.' }, 409)
    if (kind === 'topup' && !config.topup) return json({ error: 'Credit packs are not configured.' }, 503)
    const price = await verifiedPrice(env, kind, fetcher), customer = await customerFor(env, user, fetcher)
    if (kind === 'subscription') {
      const existing = await stripe(env, `/subscriptions?customer=${customer}&status=all&limit=100`, fetcher)
      if (existing.has_more === true || array(existing.data).some(item => !['canceled', 'incomplete_expired'].includes(String(item.status))))
        return json({ error: 'A subscription or payment is already present. Open Manage billing instead of starting another.' }, 409)
    }
    const attempt = await entitlementCall<{ id: string; created: number; url?: string }>(env, user.id, '/checkout-reserve', { kind })
    if (attempt.url) return json({ url: attempt.url, mode: config.mode })
    const params = new URLSearchParams({ mode: kind === 'subscription' ? 'subscription' : 'payment', customer,
      'line_items[0][price]': price.id as string, 'line_items[0][quantity]': '1', client_reference_id: user.id,
      'metadata[worldifact_uid]': user.id, 'metadata[worldifact_kind]': kind,
      'metadata[worldifact_checkout_id]': attempt.id,
      // Stripe-hosted card Checkout presents Google Pay only for eligible devices/accounts.
      'payment_method_types[0]': 'card', allow_promotion_codes: 'false',
      success_url: `${config.origin}/account/credits?billing=processing`, cancel_url: `${config.origin}/account/credits?billing=cancelled`,
    })
    if (kind === 'subscription') params.set('subscription_data[metadata][worldifact_uid]', user.id)
    else { params.set('metadata[worldifact_credits]', String(CREDIT_PACK.credits)); params.set('payment_intent_data[metadata][worldifact_uid]', user.id); params.set('payment_intent_data[metadata][worldifact_kind]', 'topup') }
    const session = await stripe(env, '/checkout/sessions', fetcher, params, `wf-checkout-${user.id}-${attempt.id}`)
    if (typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/') || !resourceId(session.id, 'cs') || !Number.isSafeInteger(session.expires_at) || session.amount_total !== CREDIT_PACK.amount || session.currency !== 'usd' || session.mode !== (kind === 'subscription' ? 'subscription' : 'payment') || idOf(session.customer) !== customer || session.client_reference_id !== user.id || uidFor(session) !== user.id || object(session.metadata).worldifact_kind !== kind || object(session.metadata).worldifact_checkout_id !== attempt.id) throw new EntitlementError('Checkout price or account was not confirmed.')
    await entitlementCall(env, user.id, '/checkout-finish', { kind, id: attempt.id, url: session.url, sessionId: session.id, expiresAt: Number(session.expires_at) * 1000 })
    return json({ url: session.url, mode: config.mode })
  } catch (error) { return json({ error: error instanceof EntitlementError ? error.message : 'Billing is temporarily unavailable. No account credit was inferred from this response.' }, error instanceof EntitlementError ? error.status : 503) }
}
