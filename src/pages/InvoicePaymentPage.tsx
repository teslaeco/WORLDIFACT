import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  async function submit(event: FormEvent) {
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
