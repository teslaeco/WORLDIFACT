"""Apply the reviewed invoice-return UI. No network, credentials or account mutations."""
from pathlib import Path

def once(s, before, after):
    if s.count(before) != 1:
        raise RuntimeError('Expected one anchor: ' + before[:100])
    return s.replace(before, after, 1)

p = Path('server/billing.ts'); s = p.read_text()
s = once(s, '  STRIPE_SECRET_KEY?: string', '  STRIPE_SECRET_KEY?: string\n  /** Public Stripe.js key. Optional; hosted invoice recovery remains intact until configured. */\n  STRIPE_PUBLISHABLE_KEY?: string')
s = once(s, "    const response = { state: 'payment_required',", "    const response = { invoiceId, state: 'payment_required',")
s = once(s, "if (action === 'retry') return json({ ...response, url: address, destination: 'invoice', requiresConfirmation: true })", "if (action === 'retry') return json({ ...response, url: invoiceFormKey(env) ? `/account/payment?plan=${invoicePlan}` : address, destination: invoiceFormKey(env) ? 'worldifact' : 'invoice', requiresConfirmation: true })")
s = once(s, "  return json({ state: allowance.subscription.active ? 'active' : 'processing', canManage: true, canRetry: false,\n    activePlan:", "  return json({ state: allowance.subscription.active ? 'active' : 'processing', canManage: true, canRetry: false,\n    paidInvoiceId: exactInvoice(env, invoice) ? invoiceId : null,\n    activePlan:")
s = once(s, 'export async function billingApi(', r'''function invoiceFormKey(env: BillingEnv): string | null {
  const key = env.STRIPE_PUBLISHABLE_KEY?.trim() ?? ''
  return new RegExp(`^pk_${env.STRIPE_MODE}_[A-Za-z0-9_]{12,200}$`).test(key) ? key : null
}

/** Read the ORIGINAL invoice PaymentIntent. This route never creates/confirms/pays a charge. */
async function invoicePayment(request: Request, env: BillingEnv, user: AccountUser, fetcher: typeof fetch) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
  const input = object(JSON.parse(await boundedText(request, 1024)))
  if (Object.keys(input).some(k => !['plan', 'action', 'invoiceId'].includes(k)) || typeof input.plan !== 'string'
    || !['creator', 'pro', 'studio'].includes(input.plan) || !['prepare', 'status'].includes(String(input.action))
    || input.invoiceId !== undefined && !resourceId(input.invoiceId, 'in')) return json({ error: 'Invalid payment request.' }, 400)
  const plan = input.plan as PlanId
  const headers = new Headers(request.headers); headers.delete('Content-Length')
  const recovered = await recoverBilling(new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ action: 'status' }) }), env, user, fetcher)
  if (!recovered.ok) return recovered
  const recovery = object(await recovered.json())
  if (recovery.state === 'active' && recovery.activePlan === plan && resourceId(recovery.paidInvoiceId, 'in')
    && (!input.invoiceId || input.invoiceId === recovery.paidInvoiceId)) return json({ phase: 'confirmed', invoiceId: recovery.paidInvoiceId, plan })
  if (recovery.state !== 'payment_required' || recovery.plan !== plan || !resourceId(recovery.invoiceId, 'in')
    || input.invoiceId && input.invoiceId !== recovery.invoiceId) return json({ phase: 'review' })
  const key = invoiceFormKey(env)
  if (!key) return json({ phase: 'hosted_only' })
  const stored = await entitlementCall<{ customer: string | null }>(env, user.id, '/billing')
  const invoice = await stripe(env, `/invoices/${recovery.invoiceId}?expand[]=payment_intent`, fetcher)
  const pi = object(invoice.payment_intent), lines = array(object(invoice.lines).data), line = lines[0], offer = subscriptionOffer(env, plan)
  // Re-read after recovery to detect an invoice changed or settled between requests.
  if (invoice.id !== recovery.invoiceId || idOf(invoice.customer) !== stored.customer || invoice.status !== 'open'
    || invoice.paid !== false || invoice.amount_paid !== 0 || invoice.amount_remaining !== offer.amountCents
    || invoice.amount_due !== offer.amountCents || invoice.total !== offer.amountCents || invoice.currency !== 'usd'
    || lines.length !== 1 || object(invoice.lines).has_more === true || line.quantity !== 1 || line.proration === true
    || line.amount !== offer.amountCents || line.currency !== 'usd'
    || (idOf(line.price) || idOf(object(object(line.pricing).price_details).price)) !== subscriptionPriceId(env, plan)
    || !resourceId(pi.id, 'pi') || pi.livemode !== (env.STRIPE_MODE === 'live') || idOf(pi.customer) !== stored.customer
    || pi.amount !== offer.amountCents || pi.currency !== 'usd' || !Array.isArray(pi.payment_method_types)
    || pi.payment_method_types.length !== 1 || pi.payment_method_types[0] !== 'card'
    || pi.invoice !== undefined && idOf(pi.invoice) !== invoice.id
    || !['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(String(pi.status))) return json({ phase: 'review' })
  const result = { phase: 'payment_required', invoiceId: invoice.id, plan, amountCents: offer.amountCents, currency: 'USD' }
  if (input.action === 'status') return json(result)
  if (typeof pi.client_secret !== 'string' || !pi.client_secret.startsWith(`${pi.id}_secret_`) || pi.client_secret.length > 300) return json({ phase: 'review' })
  // This is a customer-scoped PaymentIntent client secret, not the backend API key.
  // Send it only to the verified account over this authenticated, no-store endpoint.
  return json({ ...result, publishableKey: key, clientSecret: pi.client_secret })
}

export async function billingApi(''')
s = once(s, "    // One authenticated plan-card action", "    if (url.pathname === '/api/billing/invoice-payment') return await invoicePayment(request, env, user, fetcher)\n    // One authenticated plan-card action")
s = once(s, "    portalReady: config.ready", "    invoicePaymentReady: config.ready && !!invoiceFormKey(env),\n    portalReady: config.ready")
p.write_text(s)

Path('src/lib/invoicePayment.ts').write_text(r'''export type InvoicePlan = 'creator' | 'pro' | 'studio'
export function invoiceFormAddress(value: unknown, destination: unknown): string | null {
  if (destination !== 'worldifact') return null
  if (typeof value !== 'string' || !/^\/account\/payment\?plan=(creator|pro|studio)$/.test(value)) throw new Error('Unverified invoice form address')
  return value
}
export function invoiceReturnSearch(search: string): { plan: InvoicePlan; invoiceId?: string; cleanSearch: string } | null {
  const values = new URLSearchParams(search), plan = values.get('plan'), invoice = values.get('invoice')
  if (values.getAll('plan').length !== 1 || !['creator', 'pro', 'studio'].includes(plan ?? '') || values.getAll('invoice').length > 1
    || invoice !== null && !/^in_[A-Za-z0-9_]{1,180}$/.test(invoice)) return null
  const clean = new URLSearchParams({ plan: plan! }); if (invoice) clean.set('invoice', invoice)
  return { plan: plan as InvoicePlan, ...(invoice ? { invoiceId: invoice } : {}), cleanSearch: '?' + clean }
}
export function verifiedInvoiceReturn(result: Record<string, unknown>, plan: InvoicePlan, invoiceId?: string): boolean {
  return result.phase === 'confirmed' && result.plan === plan && typeof result.invoiceId === 'string'
    && /^in_[A-Za-z0-9_]{1,180}$/.test(result.invoiceId) && (!invoiceId || result.invoiceId === invoiceId)
}
''')
p = Path('src/lib/planPayment.ts'); s = p.read_text(); s = "import { invoiceFormAddress } from './invoicePayment'\n" + s
s = once(s, '  const hosts:', "  const local = invoiceFormAddress(value, destination); if (local) return local\n  const hosts:"); p.write_text(s)
p = Path('src/components/BillingRecovery.tsx'); s = p.read_text(); s = "import { invoiceFormAddress } from '../lib/invoicePayment'\n" + s
s = once(s, "  if (typeof value !== 'string'", "  const local = invoiceFormAddress(value, destination); if (local) return local\n  if (typeof value !== 'string'"); p.write_text(s)

Path('src/lib/stripeInvoiceForm.ts').write_text(r'''// Stripe.js is loaded from Stripe, never bundled or proxied by WORLDIFACT.
type PaymentElement = { mount: (node: HTMLElement) => void; destroy: () => void; on: (name: 'ready', cb: () => void) => void }
type Elements = { create: (name: 'payment') => PaymentElement }
type Result = { error?: unknown; paymentIntent?: { status?: string } }
export type StripeInstance = { elements: (options: { clientSecret: string }) => Elements; confirmPayment: (options: { elements: Elements; confirmParams: { return_url: string }; redirect: 'if_required' }) => Promise<Result> }
type StripeFactory = (key: string) => StripeInstance | null
let loaded: Promise<StripeFactory> | null = null
export function loadInvoiceStripe(): Promise<StripeFactory> {
  const factory = () => (window as Window & { Stripe?: StripeFactory }).Stripe
  if (factory()) return Promise.resolve(factory()!)
  if (loaded) return loaded
  loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://js.stripe.com/v3/'; script.async = true
    const timer = setTimeout(() => { script.remove(); loaded = null; reject(new Error('Stripe loading timed out')) }, 15000)
    script.onload = () => { clearTimeout(timer); const value = factory(); if (value) resolve(value); else { loaded = null; reject(new Error('Stripe unavailable')) } }
    script.onerror = () => { clearTimeout(timer); script.remove(); loaded = null; reject(new Error('Stripe unavailable')) }
    document.head.appendChild(script)
  })
  return loaded
}
''')

Path('src/pages/InvoicePaymentPage.tsx').write_text(r'''import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { accountRequest, useAccount } from '../lib/account'
import { invoiceReturnSearch, verifiedInvoiceReturn } from '../lib/invoicePayment'
import { loadInvoiceStripe, type StripeInstance } from '../lib/stripeInvoiceForm'
import './CreditsPage.css'

export default function InvoicePaymentPage() {
  const { user, loading } = useAccount(), location = useLocation()
  const target = invoiceReturnSearch(location.search)
  // Drop Stripe redirect parameters and all untrusted fields before loading Stripe.js.
  useEffect(() => {
    if (target) window.history.replaceState(null, '', '/account/payment' + target.cleanSearch)
  }, [target?.cleanSearch])
  if (loading) return <main className="credits-page"><p>Checking your account…</p></main>
  if (!target) return <main className="credits-page"><p>Invalid payment return. No payment was started.</p><Link to="/account/credits">Back to billing</Link></main>
  if (!user) return <main className="credits-page"><p>Sign in to the account used for this invoice.</p><Link to={'/login?next=' + encodeURIComponent('/account/payment' + target.cleanSearch)}>Sign in</Link></main>
  return <InvoiceForm key={user.id + ':' + target.cleanSearch} target={target} />
}
function InvoiceForm({ target }: { target: NonNullable<ReturnType<typeof invoiceReturnSearch>> }) {
  const mount = useRef<HTMLDivElement>(null), lock = useRef(false), alive = useRef(true)
  const runtime = useRef<{ stripe: StripeInstance; elements: ReturnType<StripeInstance['elements']>; invoiceId: string } | null>(null)
  const [message, setMessage] = useState('Checking the existing invoice…'), [ready, setReady] = useState(false), [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    alive.current = true; let disposed = false; let destroy: (() => void) | undefined
    async function prepare() {
      try {
        const result = await accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'prepare', ...(target.invoiceId ? { invoiceId: target.invoiceId } : {}) })
        if (disposed) return
        if (verifiedInvoiceReturn(result, target.plan, target.invoiceId)) { window.location.replace('/?billing=processing'); return }
        if (result.phase !== 'payment_required') { setMessage(result.phase === 'hosted_only' ? 'The in-app payment form is not activated yet. Use the existing secure invoice payment from billing.' : 'This invoice changed or needs review. Your existing credits are unchanged.'); return }
        if (typeof result.clientSecret !== 'string' || typeof result.publishableKey !== 'string' || typeof result.invoiceId !== 'string' || !Number.isSafeInteger(result.amountCents) || result.amountCents <= 0) throw new Error('Invalid payment context')
        const factory = await loadInvoiceStripe(); if (disposed || !mount.current) return
        const stripe = factory(result.publishableKey); if (!stripe) throw new Error('Stripe unavailable')
        const elements = stripe.elements({ clientSecret: result.clientSecret }), element = elements.create('payment')
        destroy = () => element.destroy()
        runtime.current = { stripe, elements, invoiceId: result.invoiceId }
        element.on('ready', () => { if (!disposed) setReady(true) }); element.mount(mount.current)
        setAmount(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(result.amountCents / 100))
        setMessage('Complete the existing invoice below. No second subscription is created. Your card details go directly to Stripe.')
      } catch { if (!disposed) setMessage('The payment form could not be loaded. Return to billing or check again; no payment was started.') }
    }
    void prepare()
    return () => { disposed = true; alive.current = false; runtime.current = null; destroy?.() }
  }, [target.plan, target.invoiceId, revision])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const current = runtime.current
    if (!current || !ready || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const state = await accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'status', invoiceId: current.invoiceId })
      if (!alive.current) return
      if (verifiedInvoiceReturn(state, target.plan, current.invoiceId)) { window.location.replace('/?billing=processing'); return }
      if (state.phase !== 'payment_required' || state.invoiceId !== current.invoiceId) throw new Error('Invoice changed')
      const returnUrl = new URL('/account/payment', window.location.origin); returnUrl.search = new URLSearchParams({ plan: target.plan, invoice: current.invoiceId }).toString()
      // Only this explicit user submission confirms the ORIGINAL Stripe PaymentIntent.
      const result = await current.stripe.confirmPayment({ elements: current.elements, confirmParams: { return_url: returnUrl.href }, redirect: 'if_required' })
      if (!alive.current) return
      if (result.error) { setMessage('Payment was not confirmed. Check your card or bank authorization, then try again.'); return }
      const confirmed = await accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'status', invoiceId: current.invoiceId })
      if (!alive.current) return
      if (verifiedInvoiceReturn(confirmed, target.plan, current.invoiceId)) window.location.replace('/?billing=processing')
      else { setReady(false); setMessage('Stripe is still confirming the payment. Do not pay again. Choose Check payment status to return after confirmation.') }
    } catch { if (alive.current) { setReady(false); setMessage('Payment status is uncertain. Do not pay again. Check payment status or return to billing. Your existing points have not been replaced.') } }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <main className="credits-page"><header><Link to="/">WORLDIFACT</Link><Link to="/account/credits">Back to billing</Link></header>
    <section className="credits-return" style={{ maxWidth: 640, margin: '80px auto' }}><h1>Complete your {target.plan.toUpperCase()} payment</h1>
      <p role="status">{message}</p><form onSubmit={event => void submit(event)}><div ref={mount} /><button className="credits-action" type="submit" disabled={!ready || busy}>{busy ? 'Confirming with Stripe…' : `Pay ${amount} securely`}</button></form>
      <button type="button" className="credits-manage" disabled={busy} onClick={() => { setReady(false); setRevision(v => v + 1) }}>Check payment status</button>
      <p>Confirmed credits are added once to your existing balance. You return to WORLDIFACT after server confirmation.</p>
    </section></main>
}
''')
p = Path('src/App.tsx'); s = p.read_text()
s = once(s, "const CreditsPage = lazy(async () => import('./pages/CreditsPage'))", "const CreditsPage = lazy(async () => import('./pages/CreditsPage'))\nconst InvoicePaymentPage = lazy(async () => import('./pages/InvoicePaymentPage'))")
s = once(s, '        <Route path="/account/credits" element={<CreditsPage />} />', '        <Route path="/account/credits" element={<CreditsPage />} />\n        <Route path="/account/payment" element={<InvoicePaymentPage />} />'); p.write_text(s)

p = Path('tests/billing-recovery.test.ts'); s = p.read_text()
s = once(s, "    if (url.endsWith('/v1/invoices/in_Upgrade'))", "    if (url.includes('/v1/invoices/in_Upgrade?')) return Response.json(invoice)\n    if (url.endsWith('/v1/invoices/in_Upgrade'))")
s += r'''

function formFixture() {
  const f = fixture(); f.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_invoice_form_fixture'
  f.invoice.payment_intent = { id: 'pi_Original', invoice: 'in_Upgrade', livemode: false, customer, amount: 9999, currency: 'usd', status: 'requires_payment_method', payment_method_types: ['card'], client_secret: 'pi_Original_secret_fixture' }
  return f
}
const form = (f: ReturnType<typeof fixture>, body: Json = { plan: 'pro', action: 'prepare' }) => f.call('status', body, 'https://worldifact.test', '/api/billing/invoice-payment')
test('configured invoice form receives only the original owned PaymentIntent with no Stripe writes', async () => {
  const f = formFixture(), response = await form(f), body = await response!.json() as Json
  assert.equal(response?.status, 200); assert.equal(body.phase, 'payment_required'); assert.equal(body.clientSecret, 'pi_Original_secret_fixture'); assert.equal(body.publishableKey, f.env.STRIPE_PUBLISHABLE_KEY)
  assert.equal(body.invoiceId, 'in_Upgrade'); assert.equal(f.map.get('balance'), 605); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  const status = await (await form(f, { plan: 'pro', action: 'status', invoiceId: 'in_Upgrade' }))!.json() as Json
  assert.equal(status.clientSecret, undefined); assert.equal(status.publishableKey, undefined)
})
test('invoice payment rejects foreign intent, amount, mode, partial payment and unsupported methods', async () => {
  for (const change of ['customer', 'amount', 'mode', 'partial', 'method', 'secret', 'invoice']) {
    const f = formFixture(), pi = f.invoice.payment_intent
    if (change === 'customer') pi.customer = 'cus_Other'
    if (change === 'amount') pi.amount = 1
    if (change === 'mode') pi.livemode = true
    if (change === 'partial') { f.invoice.amount_paid = 100; f.invoice.amount_remaining = 9899 }
    if (change === 'method') pi.payment_method_types = ['us_bank_account']
    if (change === 'secret') pi.client_secret = 'pi_Other_secret_fixture'
    if (change === 'invoice') pi.invoice = 'in_Other'
    const body = await (await form(f))!.json() as Json
    assert.equal(body.clientSecret, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('missing or wrong-mode public key preserves working hosted invoice recovery', async () => {
  for (const key of [undefined, 'pk_live_fixture_wrong_mode_123', 'sk_test_not_publishable']) {
    const f = formFixture(); f.env.STRIPE_PUBLISHABLE_KEY = key
    const body = await (await f.call('retry'))!.json() as Json
    assert.equal(body.destination, 'invoice'); assert.equal(body.url, f.invoice.hosted_invoice_url)
    assert.equal((await (await form(f))!.json() as Json).phase, 'hosted_only')
  }
})
test('configured matching plan card opens only the same-origin invoice form', async () => {
  const f = formFixture(), body = await (await choosePlan(f, 'pro'))!.json() as Json
  assert.equal(body.destination, 'worldifact'); assert.equal(body.url, '/account/payment?plan=pro'); assert.equal(body.clientSecret, undefined)
})
test('payment return requires the matching paid invoice and adds the grant once', async () => {
  const f = formFixture()
  assert.notEqual((await (await form(f, { plan: 'pro', action: 'status', invoiceId: 'in_Upgrade' }))!.json() as Json).phase, 'confirmed')
  f.subscription.pending_update = null; f.subscription.items.data[0].price = 'price_Pro'
  Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: 9999, amount_remaining: 0 })
  for (let i = 0; i < 2; i++) assert.equal((await (await form(f, { plan: 'pro', action: 'status', invoiceId: 'in_Upgrade' }))!.json() as Json).phase, 'confirmed')
  assert.equal(f.map.get('balance'), 5105)
  assert.equal((await (await form(f, { plan: 'pro', action: 'status', invoiceId: 'in_Other' }))!.json() as Json).phase, 'review')
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('invoice form refuses extra client fields, foreign origins and unsigned users', async () => {
  const f = formFixture()
  assert.equal((await form(f, { plan: 'pro', action: 'prepare', customer }))?.status, 400)
  assert.equal((await f.call('status', { plan: 'pro', action: 'prepare' }, 'https://evil.test', '/api/billing/invoice-payment'))?.status, 403)
  f.state.authenticated = false; assert.equal((await form(f))?.status, 401)
  assert.equal(f.calls.filter(c => c.url.includes('api.stripe.com')).length, 0)
})
'''; p.write_text(s)

Path('tests/invoice-return.test.ts').write_text(r'''import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceFormAddress, invoiceReturnSearch, verifiedInvoiceReturn } from '../src/lib/invoicePayment.ts'

test('invoice form accepts only a fixed same-origin route and known plan', () => {
  assert.equal(invoiceFormAddress('/account/payment?plan=pro', 'worldifact'), '/account/payment?plan=pro')
  for (const value of ['https://evil.test/account/payment?plan=pro', '//evil.test', '/account/payment?plan=pro&next=https://evil.test', '/account/payment?plan=unknown', '/account/payment?plan=pro#x']) assert.throws(() => invoiceFormAddress(value, 'worldifact'))
})
test('bank return drops client secrets, return targets and claimed credit counts', () => {
  const result = invoiceReturnSearch('?plan=pro&invoice=in_Owned&payment_intent_client_secret=do-not-keep&credits=999999&next=https://evil.test')
  assert.deepEqual(result, { plan: 'pro', invoiceId: 'in_Owned', cleanSearch: '?plan=pro&invoice=in_Owned' })
  for (const search of ['?plan=pro&plan=studio', '?plan=wrong', '?plan=pro&invoice=in_A&invoice=in_B', '?plan=pro&invoice=../foreign']) assert.equal(invoiceReturnSearch(search), null)
})
test('only a server-confirmed matching invoice authorizes the automatic home return', () => {
  const paid = { phase: 'confirmed', plan: 'pro', invoiceId: 'in_Owned' }
  assert.equal(verifiedInvoiceReturn(paid, 'pro', 'in_Owned'), true)
  for (const change of [{ phase: 'payment_required' }, { phase: 'processing' }, { plan: 'studio' }, { invoiceId: 'in_Other' }, { invoiceId: null }]) assert.equal(verifiedInvoiceReturn({ ...paid, ...change }, 'pro', 'in_Owned'), false)
})
''')
p = Path('docs/CONTEST_STATUS.md'); s = p.read_text()
p.write_text('''# 30 September 2026 — invoice-return and seller-data follow-up (NOT DEPLOYED)

The owner confirmed successful Pro payment and activated membership on Android. Connected Stripe reads independently confirmed that the original invoice was paid. No new payment was made by the assistant.

A read-only probe in run 36640589041 confirmed that appending return_url to the hosted invoice link did not produce an HTTP redirect or an embedded return setting. This is not a browser-level proof, and no automatic hosted-invoice redirect is claimed. Normal Checkout and portal returns already land back in WORLDIFACT; hosted-invoice recovery is a separate flow.

Prepared a same-invoice Stripe Payment Element page: the server authenticates the account, validates the exact original invoice and original PaymentIntent, and provides only that customer's scoped client secret. Only an explicit user submission invokes Stripe.js confirmation. The app returns home after independently verified settlement for the matching invoice, preserving additive/idempotent credit grants. No new subscription or PaymentIntent is created by this feature. Card data remains in Stripe Elements. Tests are synthetic; real bank authorization is NOT tested here.

BLOCKED for activation: the public STRIPE_PUBLISHABLE_KEY has not been provided/configured, and the new UI is not deployed. Without that key the currently working hosted-invoice recovery remains unchanged. Merge and production deployment need owner approval. No model or generation configuration is changed.

Seller-data request: Tesla Eco Sebastian Laskowski; Polish NIP 5811866931; keep the existing address unchanged. Live reads found the existing public seller name Worldifact and no merchant tax IDs/default tax IDs. An attempted tool write preparing an automatic merchant-settings update was blocked by platform safeguards. It was not retried through another path; seller settings and finalized invoices remain UNCHANGED. This is not a completed seller-data correction. Configure the seller name and Polish NIP (pl_nip, not the customer's tax ID and not inferred EU VAT registration) in Stripe Dashboard, make the merchant ID default, then verify a subsequent invoice. Existing finalized invoice tax IDs cannot be silently changed. No corrected tax document or second invoice was issued.

Sources: https://docs.stripe.com/invoicing/hosted-invoice-page ; https://docs.stripe.com/js/payment_intents/confirm_payment ; https://docs.stripe.com/tax/invoicing/tax-ids ; https://docs.stripe.com/api/accounts/update?api-version=2024-06-20 .

---

''' + s)
print('Prepared invoice return page. No credentials, payment, account setting or deployment changed.')
