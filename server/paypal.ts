import { accountsConfigured, getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { ACCOUNT_ID, entitlementCall, entitlementStatus, EntitlementError, type EntitlementEnv } from './entitlements.ts'

/** Orders v2 is account-bound. A static Hosted Button cannot establish that binding. */
export interface PayPalEnv extends AccountEnv, EntitlementEnv {
  ENABLE_PAYPAL_BILLING?: string
  PAYPAL_MODE?: string
  PAYPAL_CLIENT_ID?: string
  PAYPAL_CLIENT_SECRET?: string
  PAYPAL_WEBHOOK_ID?: string
  PAYPAL_MERCHANT_ID?: string
  BILLING_PUBLIC_ORIGIN?: string
}
export const PAYPAL_HOSTED_BUTTON_ID = 'N4DCJJHHW747S'
const CREDIT_PACK = { credits: 1500, amount: '29.99', currency: 'USD' } as const
type Json = Record<string, unknown>
type Attempt = { id: string; created: number; orderId?: string; url?: string; repeated: boolean }
type Owned = { owned: boolean; id?: string }
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const array = (value: unknown): Json[] => Array.isArray(value) ? value.map(object) : []
const paypalId = (value: unknown): value is string => typeof value === 'string' && /^[A-Z0-9]{10,36}$/.test(value)
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } })
function configuration(env: PayPalEnv) {
  const mode = env.PAYPAL_MODE === 'live' || env.PAYPAL_MODE === 'sandbox' ? env.PAYPAL_MODE : null
  let origin: string | null = null
  try { const url = new URL(env.BILLING_PUBLIC_ORIGIN ?? ''); if (url.protocol === 'https:' && url.origin === env.BILLING_PUBLIC_ORIGIN && !url.username && !url.password) origin = url.origin } catch { /* Fail closed. */ }
  const credential = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,512}$/.test(value)
  const ledgerMatches = mode === 'sandbox' ? env.ACCOUNT_LEDGER_MODE === 'sandbox' : !env.ACCOUNT_LEDGER_MODE || env.ACCOUNT_LEDGER_MODE === 'live'
  const ready = env.ENABLE_PAYPAL_BILLING === 'true' && env.ENFORCE_ACCOUNT_ENTITLEMENTS === 'true' && !!env.ACCOUNT_ENTITLEMENTS && accountsConfigured(env) && !!(env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER) && !!origin && !!mode && ledgerMatches && credential(env.PAYPAL_CLIENT_ID) && credential(env.PAYPAL_CLIENT_SECRET) && paypalId(env.PAYPAL_WEBHOOK_ID) && typeof env.PAYPAL_MERCHANT_ID === 'string' && /^[A-Z0-9]{13}$/.test(env.PAYPAL_MERCHANT_ID)
  return { ready, mode, origin, base: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' }
}
type Config = ReturnType<typeof configuration>
async function boundedJson(value: Request | Response, maximum: number): Promise<Json> {
  if (Number(value.headers.get('Content-Length')) > maximum) throw new EntitlementError('Payment request is too large.', 413)
  const reader = value.body?.getReader()
  if (!reader) throw new EntitlementError('Invalid payment response.', 400)
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > maximum) throw new EntitlementError('Payment request is too large.', 413); chunks.push(next.value) }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON')
    return body as Json
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof EntitlementError) throw error; throw new EntitlementError('Invalid payment response.', 400) }
}
/** Credentials and the bearer token stay inside one server-side request. */
function provider(env: PayPalEnv, config: Config, fetcher: typeof fetch) {
  let token: Promise<string> | undefined
  async function bearer() {
    if (!token) token = (async () => {
      const response = await fetcher(config.base + '/v1/oauth2/token', {
        // Refuse redirects explicitly; workerd does not support redirect: 'error'.
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12_000),
        headers: { Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: 'grant_type=client_credentials',
      })
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new EntitlementError('PayPal is temporarily unavailable.', 502) }
      if (!response.ok) { await response.body?.cancel(); throw new EntitlementError('PayPal is temporarily unavailable.', 502) }
      const body = await boundedJson(response, 16_384)
      if (body.token_type !== 'Bearer' || typeof body.access_token !== 'string' || !/^[A-Za-z0-9._~-]{10,4096}$/.test(body.access_token)) throw new EntitlementError('PayPal authorization could not be confirmed.', 502)
      return body.access_token
    })()
    return token
  }
  return async (path: string, body?: Json, requestId?: string): Promise<Json> => {
    const access = await bearer()
    const response = await fetcher(config.base + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${access}`, Accept: 'application/json', Prefer: 'return=representation', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new EntitlementError('PayPal could not confirm this payment. Retry the same payment later.', 502) }
    if (!response.ok) { await response.body?.cancel(); throw new EntitlementError('PayPal could not confirm this payment. Retry the same payment later.', 502) }
    return boundedJson(response, 256_000)
  }
}
type Provider = ReturnType<typeof provider>
const amountMatches = (value: unknown) => object(value).currency_code === CREDIT_PACK.currency && object(value).value === CREDIT_PACK.amount
function validateOrder(order: Json, env: PayPalEnv, orderId: string, uid?: string) {
  const units = array(order.purchase_units), unit = units[0]
  if (order.id !== orderId || order.intent !== 'CAPTURE' || units.length !== 1 || !unit || !amountMatches(unit.amount) || object(unit.payee).merchant_id !== env.PAYPAL_MERCHANT_ID || typeof unit.custom_id !== 'string' || !ACCOUNT_ID.test(unit.custom_id) || (uid && unit.custom_id !== uid))
    throw new EntitlementError('Payment account or credit pack could not be verified.', 409)
  return { unit, uid: unit.custom_id }
}
async function ownership(env: PayPalEnv, uid: string, orderId: string) {
  const owned = await entitlementCall<Owned>(env, uid, '/paypal-get', { orderId })
  if (!owned.owned || !owned.id || !ACCOUNT_ID.test(owned.id)) throw new EntitlementError('This payment does not belong to this account.', 403)
  return owned as { owned: true; id: string }
}
function validateInvoice(unit: Json, attemptId: string) {
  // A server-generated invoice also makes cross-attempt mix-ups fail closed.
  if (unit.invoice_id !== `wf-${attemptId}`) throw new EntitlementError('Payment reference could not be verified.', 409)
}
function approvalUrl(order: Json, config: Config) {
  const link = array(order.links).find(item => ['approve', 'payer-action'].includes(String(item.rel)))
  if (typeof link?.href !== 'string') throw new EntitlementError('PayPal checkout could not be confirmed.', 502)
  const url = new URL(link.href)
  const host = config.mode === 'live' ? 'www.paypal.com' : 'www.sandbox.paypal.com'
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.hash || url.pathname !== '/checkoutnow' || url.searchParams.getAll('token').length !== 1 || url.searchParams.get('token') !== order.id)
    throw new EntitlementError('PayPal checkout address could not be confirmed.', 502)
  return url.href
}
async function createOrder(env: PayPalEnv, config: Config, uid: string, api: Provider) {
  const attempt = await entitlementCall<Attempt>(env, uid, '/paypal-reserve', {})
  if (!ACCOUNT_ID.test(attempt.id) || !Number.isSafeInteger(attempt.created)) throw new EntitlementError('Payment reservation could not be confirmed.')
  if (attempt.orderId) {
    await ownership(env, uid, attempt.orderId)
    const order = await api(`/v2/checkout/orders/${attempt.orderId}`), { unit } = validateOrder(order, env, attempt.orderId, uid)
    validateInvoice(unit, attempt.id)
    if (order.status === 'VOIDED') {
      await entitlementCall(env, uid, '/paypal-clear', { id: attempt.id })
      return json({ error: 'The previous checkout is closed. Start a new payment.' }, 409)
    }
    if (order.status === 'COMPLETED') return json(await settleOrder(env, attempt.orderId, uid, api))
    if (!['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'APPROVED'].includes(String(order.status))) throw new EntitlementError('The previous payment requires review.', 409)
    return json({ url: approvalUrl(order, config), orderId: attempt.orderId })
  }
  // PayPal's default idempotency retention is six hours. An unknown older
  // creation is held for reconciliation, never retried with a fresh key.
  if (Date.now() - attempt.created > 5 * 60 * 60_000) throw new EntitlementError('The previous payment requires support review before another checkout.', 409)
  const order = await api('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ custom_id: uid, invoice_id: `wf-${attempt.id}`, description: 'WORLDIFACT — 1500 generation credits', payee: { merchant_id: env.PAYPAL_MERCHANT_ID }, amount: { currency_code: CREDIT_PACK.currency, value: CREDIT_PACK.amount } }],
    payment_source: { paypal: { experience_context: { brand_name: 'WORLDIFACT', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: `${config.origin}/account/credits?paypal=return`, cancel_url: `${config.origin}/account/credits?paypal=cancelled` } } },
  }, attempt.id.replace(/-/g, '') + '-c')
  if (!paypalId(order.id)) throw new EntitlementError('PayPal order could not be confirmed.', 502)
  // Some create responses are minimal; fetch the authoritative full order.
  const fresh = await api(`/v2/checkout/orders/${order.id}`), { unit } = validateOrder(fresh, env, order.id, uid)
  validateInvoice(unit, attempt.id)
  const url = approvalUrl(fresh, config)
  const saved = await entitlementCall<{ saved: boolean }>(env, uid, '/paypal-order', { id: attempt.id, orderId: order.id, url })
  if (!saved.saved) throw new EntitlementError('Payment could not be linked. Please retry the same payment.', 409)
  return json({ url, orderId: order.id })
}
function captureOrderId(capture: Json) { return object(object(capture.supplementary_data).related_ids).order_id }
function validateCapture(capture: Json, captureId: string, orderId: string, unit: Json, env: PayPalEnv) {
  const captures = array(object(unit.payments).captures)
  if (capture.id !== captureId || !amountMatches(capture.amount) || captureOrderId(capture) !== orderId || object(capture.payee).merchant_id !== env.PAYPAL_MERCHANT_ID || captures.length !== 1 || captures[0].id !== captureId || !amountMatches(captures[0].amount))
    throw new EntitlementError('Captured payment could not be verified.', 409)
}
function reversed(capture: Json, unit: Json) {
  const refund = object(object(capture.seller_receivable_breakdown).total_refunded_amount)
  return ['REFUNDED', 'PARTIALLY_REFUNDED', 'DECLINED', 'DENIED', 'REVERSED', 'FAILED'].includes(String(capture.status)) || array(object(unit.payments).refunds).length > 0 || (typeof refund.value === 'string' && Number(refund.value) > 0)
}
async function reconcileCapture(env: PayPalEnv, captureId: string, api: Provider, expectedUid?: string, expectedOrderId?: string, forceReversal = false, review = false) {
  const capture = await api(`/v2/payments/captures/${captureId}`), orderId = captureOrderId(capture)
  if (!paypalId(orderId) || (expectedOrderId && expectedOrderId !== orderId)) throw new EntitlementError('Payment order could not be verified.', 409)
  const order = await api(`/v2/checkout/orders/${orderId}`), { unit, uid } = validateOrder(order, env, orderId, expectedUid)
  const owned = await ownership(env, uid, orderId)
  validateInvoice(unit, owned.id)
  validateCapture(capture, captureId, orderId, unit, env)
  if (forceReversal || reversed(capture, unit)) {
    await entitlementCall(env, uid, '/revoke', { id: `pp_${captureId}`, credits: CREDIT_PACK.credits, ...(review ? { review: true } : {}) })
    await entitlementCall(env, uid, '/paypal-clear', { id: owned.id })
    return { status: 'REVERSED', credited: false, reviewRequired: review }
  }
  if (order.status !== 'COMPLETED' || capture.status !== 'COMPLETED' || capture.final_capture !== true || array(object(unit.payments).captures)[0].status !== 'COMPLETED') return { status: 'PENDING', credited: false }
  const grant = await entitlementCall<{ granted: boolean; repeated: boolean; revoked: boolean }>(env, uid, '/grant', { id: `pp_${captureId}`, credits: CREDIT_PACK.credits })
  await entitlementCall(env, uid, '/paypal-clear', { id: owned.id })
  return { status: grant.revoked ? 'REVERSED' : 'COMPLETED', credited: !grant.revoked && (grant.granted || grant.repeated), repeated: grant.repeated }
}
async function settleOrder(env: PayPalEnv, orderId: string, uid: string, api: Provider) {
  const owned = await ownership(env, uid, orderId)
  const before = await api(`/v2/checkout/orders/${orderId}`), { unit } = validateOrder(before, env, orderId, uid)
  validateInvoice(unit, owned.id)
  if (before.status === 'APPROVED') {
    // Never send browser-supplied amounts, merchant IDs or ownership metadata.
    await api(`/v2/checkout/orders/${orderId}/capture`, {}, owned.id.replace(/-/g, '') + '-p')
  } else if (before.status !== 'COMPLETED') return { status: 'PENDING', credited: false }
  // A POST response is not a credit grant. Re-fetch both order and capture.
  const fresh = await api(`/v2/checkout/orders/${orderId}`), current = validateOrder(fresh, env, orderId, uid)
  validateInvoice(current.unit, owned.id)
  const captures = array(object(current.unit.payments).captures)
  if (captures.length !== 1 || !paypalId(captures[0].id)) return { status: 'PENDING', credited: false }
  return reconcileCapture(env, captures[0].id, api, uid, orderId)
}
function signatureInput(request: Request, config: Config) {
  const headers = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'].map(name => request.headers.get(name))
  if (headers.some(value => !value || value.length > 1024)) throw new EntitlementError('Invalid PayPal webhook signature.', 400)
  const [auth_algo, cert_url, transmission_id, transmission_sig, transmission_time] = headers as string[]
  let cert: URL
  try { cert = new URL(cert_url) } catch { throw new EntitlementError('Invalid PayPal webhook signature.', 400) }
  // No certificate URL is fetched by WORLDIFACT. Limit it even when delegating
  // signature verification to PayPal; never accept arbitrary callback hosts.
  const hosts = config.mode === 'live' ? ['api.paypal.com', 'api-m.paypal.com'] : ['api.sandbox.paypal.com', 'api-m.sandbox.paypal.com']
  if (!hosts.includes(cert.hostname) || cert.protocol !== 'https:' || cert.port || cert.username || cert.password || cert.search || cert.hash || !/^\/v1\/notifications\/certs\/[A-Za-z0-9_-]+$/.test(cert.pathname) || !/^[A-Za-z0-9]{1,100}$/.test(auth_algo) || transmission_id.length > 50 || transmission_sig.length > 500 || transmission_time.length > 100 || !Number.isFinite(Date.parse(transmission_time))) throw new EntitlementError('Invalid PayPal webhook signature.', 400)
  return { auth_algo, cert_url, transmission_id, transmission_sig, transmission_time }
}
function refundCaptureId(resource: Json, config: Config) {
  const related = object(object(resource.supplementary_data).related_ids).capture_id
  if (paypalId(related)) return related
  // Refund events contain an up link to the capture. Parse the identifier,
  // never issue requests to an event-provided URL.
  for (const link of array(resource.links)) {
    if (link.rel !== 'up' || typeof link.href !== 'string') continue
    try {
      const url = new URL(link.href), match = url.pathname.match(/^\/v2\/payments\/captures\/([A-Z0-9]{10,36})$/)
      const origins = config.mode === 'live' ? ['https://api-m.paypal.com', 'https://api.paypal.com'] : ['https://api-m.sandbox.paypal.com', 'https://api.sandbox.paypal.com']
      if (origins.includes(url.origin) && !url.username && !url.password && !url.search && !url.hash && match) return match[1]
    } catch { /* Ignore invalid links. */ }
  }
  return null
}
async function webhook(request: Request, env: PayPalEnv, config: Config, api: Provider) {
  const signature = signatureInput(request, config), event = await boundedJson(request, 256_000)
  if (typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{5,100}$/.test(event.id) || typeof event.event_type !== 'string') return json({ error: 'Invalid payment event.' }, 400)
  const verified = await api('/v1/notifications/verify-webhook-signature', { ...signature, webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event })
  if (verified.verification_status !== 'SUCCESS') return json({ error: 'Invalid PayPal webhook signature.' }, 400)
  const type = event.event_type, resource = object(event.resource)
  if (type === 'CHECKOUT.ORDER.APPROVED') {
    if (!paypalId(resource.id)) return json({ error: 'Invalid approved order.' }, 400)
    const order = await api(`/v2/checkout/orders/${resource.id}`), { uid } = validateOrder(order, env, resource.id)
    // Complete an approved order even if the payer closed the return page.
    // settleOrder checks the persisted binding before any capture mutation.
    if ((await entitlementStatus(env, uid)).billingReview) return json({ error: 'This payment requires support review.' }, 409)
    await settleOrder(env, resource.id, uid, api)
  } else if (['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.REVERSED'].includes(type)) {
    if (!paypalId(resource.id)) return json({ error: 'Invalid capture event.' }, 400)
    await reconcileCapture(env, resource.id, api, undefined, undefined, ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.REVERSED'].includes(type))
  } else if (type === 'PAYMENT.CAPTURE.REFUNDED') {
    const captureId = refundCaptureId(resource, config)
    if (!captureId) return json({ error: 'Refund reference requires review.' }, 409)
    await reconcileCapture(env, captureId, api, undefined, undefined, true)
  } else if (['CUSTOMER.DISPUTE.CREATED', 'CUSTOMER.DISPUTE.UPDATED', 'CUSTOMER.DISPUTE.RESOLVED'].includes(type)) {
    if (typeof resource.dispute_id !== 'string' || !/^[A-Z0-9-]{5,80}$/.test(resource.dispute_id)) return json({ error: 'Invalid dispute reference.' }, 400)
    const dispute = await api(`/v1/customer/disputes/${resource.dispute_id}`), transactions = array(dispute.disputed_transactions)
    if (dispute.dispute_id !== resource.dispute_id || !transactions.length || transactions.length > 10) throw new EntitlementError('Payment dispute requires review.', 409)
    for (const transaction of transactions) {
      if (!paypalId(transaction.seller_transaction_id)) throw new EntitlementError('Payment dispute requires review.', 409)
      // Even a subsequently won dispute is reconciled manually: late delivery
      // must never automatically restore a previously revoked credit grant.
      await reconcileCapture(env, transaction.seller_transaction_id, api, undefined, undefined, true, true)
    }
  }
  return json({ received: true })
}
export async function paypalApi(request: Request, env: PayPalEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/billing/paypal/')) return null
  const config = configuration(env), action = url.pathname.slice('/api/billing/paypal/'.length)
  if (action === 'status' && request.method === 'GET') return json({ ready: config.ready, mode: config.mode, hostedButtonId: PAYPAL_HOSTED_BUTTON_ID, hostedButtonReady: false, credits: CREDIT_PACK.credits, amount: CREDIT_PACK.amount, currency: CREDIT_PACK.currency, recurring: false, reason: config.ready ? '1500 credits for USD 29.99. Credits require a verified completed PayPal payment.' : 'PayPal checkout needs merchant API credentials, a verified webhook and account protection. No payment is enabled.' })
  if (!['order', 'capture', 'webhook'].includes(action)) return json({ error: 'PayPal route not found.' }, 404)
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!config.ready) return json({ status: 'BLOCKED', error: 'PayPal payments are not configured. No checkout or charge was created.' }, 503)
  try {
    const api = provider(env, config, fetcher)
    if (action === 'webhook') return await webhook(request, env, config, api)
    if (request.headers.get('Origin') !== url.origin || url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Same-origin request required.' }, 403)
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in before opening billing.' }, 401)
    const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
    if (!limiter || !(await limiter.limit({ key: `billing:paypal:${user.id}` })).success) return json({ error: 'Billing request limit reached.' }, limiter ? 429 : 503)
    const input = await boundedJson(request, 1024)
    if ((await entitlementStatus(env, user.id)).billingReview) return json({ error: 'This billing account requires support review.' }, 409)
    if (action === 'order') {
      if (Object.keys(input).length) return json({ error: 'This credit pack has a fixed price.' }, 400)
      return await createOrder(env, config, user.id, api)
    }
    if (Object.keys(input).length !== 1 || !paypalId(input.orderId)) return json({ error: 'Provide a valid order reference.' }, 400)
    // Ownership is checked before even obtaining a PayPal access token.
    return json(await settleOrder(env, input.orderId, user.id, api))
  } catch (error) {
    return json({ error: error instanceof EntitlementError ? error.message : 'PayPal could not be confirmed. Retry the same payment later.' }, error instanceof EntitlementError ? error.status : 503)
  }
}
