import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountRequest, useAccount, type AccountUser } from '../lib/account'
import './CreditsPage.css'

type Balance = { credits: number; generationCost: number; subscriptionGrant: number; subscription: { active: boolean; expiresAt: string | null }; free: { fastRemaining: number; fastResetAt: string | null; slowRemaining: number; slowResetAt: string }; billingReview: boolean }
type Billing = { checkoutReady: boolean; topupReady: boolean; cardReady: boolean; googlePay: 'eligible_devices' | 'unavailable'; mode: 'test' | 'live' | null; subscriptionInterval: 'month' | 'year' | null }
type PayPal = { ready: boolean; mode: 'sandbox' | 'live' | null }
type Snapshot = { owner: string | null; balance: Balance | null; billing: Billing | null; paypal: PayPal | null }
type PaymentAction = 'card' | 'google' | 'paypal' | 'subscription' | 'portal' | 'capture'
type PaymentNotice = { tone: 'success' | 'pending'; text: string } | null

function checkoutAddress(value: unknown, provider: 'stripe' | 'paypal' | 'portal') {
  if (typeof value !== 'string') throw new Error('Invalid checkout address.')
  const url = new URL(value)
  const hosts = provider === 'paypal' ? ['www.paypal.com', 'www.sandbox.paypal.com'] : provider === 'portal' ? ['billing.stripe.com'] : ['checkout.stripe.com']
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) throw new Error('Invalid checkout address.')
  return url.href
}

export default function CreditsPage() {
  const { user, loading } = useAccount()
  // Remount on account changes so payment messages and pending actions never cross accounts.
  return <CreditsContent key={user?.id ?? 'anonymous'} user={user} loading={loading} />
}

function CreditsContent({ user, loading }: { user: AccountUser | null; loading: boolean }) {
  const [search, setSearch] = useSearchParams()
  const owner = user?.id ?? null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<PaymentAction | null>(null)
  const [notice, setNotice] = useState<PaymentNotice>(null)
  const [understandsPack, setUnderstandsPack] = useState(false)
  const loadVersion = useRef(0), actionVersion = useRef(0), actionLock = useRef(false)
  // Results are scoped to their account, including the first render after signing out.
  const current = snapshot?.owner === owner ? snapshot : null
  const balance = current?.balance, billing = current?.billing, paypal = current?.paypal

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current
    const results = await Promise.allSettled([
      accountRequest('/api/billing/status') as Promise<Billing>,
      accountRequest('/api/billing/paypal/status') as Promise<PayPal>,
      owner ? accountRequest('/api/account/entitlements') as Promise<Balance> : Promise.resolve(null),
    ])
    if (version !== loadVersion.current) return
    setSnapshot({ owner,
      billing: results[0].status === 'fulfilled' ? results[0].value : null,
      paypal: results[1].status === 'fulfilled' ? results[1].value : null,
      balance: results[2].status === 'fulfilled' ? results[2].value : null,
    })
    if (results[2].status === 'rejected') setError('Your balance is temporarily unavailable. Refresh before making a purchase.')
    else if (results[0].status === 'rejected' && results[1].status === 'rejected') setError('Payment options are temporarily unavailable. Please try again later.')
    setChecking(false)
  }, [owner])

  const cancelRequests = useCallback(() => { loadVersion.current++; actionVersion.current++; actionLock.current = false }, [])
  // Synchronize external account/payment availability; state updates occur after network completion.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void refresh(); return cancelRequests }, [refresh, cancelRequests])

  const member = balance?.subscription.active === true
  const canBuy = !!user && !!balance && !balance.billingReview && !checking && !loading && !busy
  const canBuyPack = canBuy && (member || understandsPack) && search.get('paypal') !== 'return'
  const membershipReady = billing?.checkoutReady === true && ['month', 'year'].includes(billing.subscriptionInterval ?? '')
  const paypalReturn = search.get('paypal') === 'return'
  const orderId = search.get('token') ?? ''
  const validOrder = /^[A-Z0-9]{10,36}$/.test(orderId)
  const cancelled = search.get('paypal') === 'cancel' || search.get('paypal') === 'cancelled' || search.get('billing') === 'cancelled'

  async function checkout(action: Exclude<PaymentAction, 'capture'>) {
    if (actionLock.current || !canBuy || (['card', 'google', 'paypal'].includes(action) && !canBuyPack)) return
    if ((action === 'paypal' && !paypal?.ready) || (['card', 'google'].includes(action) && !billing?.topupReady) || (action === 'subscription' && !membershipReady)) return
    actionLock.current = true
    const version = ++actionVersion.current
    setBusy(action); setError(''); setNotice(null)
    try {
      const result = await accountRequest(action === 'paypal' ? '/api/billing/paypal/order' : action === 'portal' ? '/api/billing/portal' : '/api/billing/checkout', action === 'paypal' || action === 'portal' ? {} : { kind: action === 'subscription' ? 'subscription' : 'topup' })
      if (version !== actionVersion.current) return
      if (action === 'paypal' && result.status) {
        if (result.status === 'COMPLETED' && result.credited === true) setNotice({ tone: 'success', text: 'Your previous PayPal payment is confirmed and its 1,500-credit purchase has been applied. No new checkout was opened.' })
        else if (result.status === 'PENDING') setNotice({ tone: 'pending', text: 'Your previous PayPal payment is still processing. No new checkout was opened. Check your balance and PayPal transaction before trying again.' })
        else if (result.status === 'REVERSED') setNotice({ tone: 'pending', text: 'Your previous PayPal payment was reversed. Please check the transaction in PayPal.' })
        else throw new Error('Payment could not be confirmed.')
        await refresh()
        if (version === actionVersion.current) { setBusy(null); actionLock.current = false }
        return
      }
      window.location.assign(checkoutAddress(result.url, action === 'paypal' ? 'paypal' : action === 'portal' ? 'portal' : 'stripe'))
    } catch {
      if (version !== actionVersion.current) return
      setError('Secure checkout could not be opened. Please try again later.')
      setBusy(null); actionLock.current = false
    }
  }

  async function capturePayPal() {
    if (actionLock.current || !canBuy || !validOrder || !paypal?.ready) return
    actionLock.current = true
    const version = ++actionVersion.current
    setBusy('capture'); setError(''); setNotice(null)
    try {
      const result = await accountRequest('/api/billing/paypal/capture', { orderId })
      if (version !== actionVersion.current) return
      if (result.status === 'COMPLETED' && result.credited === true) {
        setNotice({ tone: 'success', text: 'Payment confirmed. Your 1,500-credit purchase has been applied to your account.' })
        const next = new URLSearchParams(search); next.delete('paypal'); next.delete('token'); next.delete('PayerID')
        setSearch(next, { replace: true })
      } else if (result.status === 'PENDING') {
        setNotice({ tone: 'pending', text: 'PayPal is still processing your payment. No credits are available from this purchase yet. Check this payment again later; do not start a new purchase.' })
      } else if (result.status === 'REVERSED') {
        setNotice({ tone: 'pending', text: 'This payment was reversed. It does not provide spendable credits. Please check the transaction in PayPal.' })
      } else throw new Error('Payment could not be confirmed.')
      await refresh()
    } catch {
      if (version !== actionVersion.current) return
      setError('We could not confirm this payment yet. Sign in to the account used for the purchase and try confirming it again. Do not make another payment.')
    } finally {
      if (version === actionVersion.current) { setBusy(null); actionLock.current = false }
    }
  }

  return <main className="credits-page">
    <header><Link to="/" className="credits-wordmark">WORLDIFACT</Link><Link to={user ? '/account' : '/login'}>{user ? user.displayName : 'Sign in'} ↗</Link></header>
    <section className="credits-heading"><span>MAKE ROOM FOR YOUR NEXT IDEA</span><h1>More worlds.<br /><em>More possibilities.</em></h1><p>Explore for free, or add 1,500 credits for $30 USD. One simple price. Thirty more opportunities to create.</p></section>
    {user && balance && <section className="credits-balance" aria-label="Your account balance">
      <div><span>YOUR CREDITS</span><strong>{balance.credits.toLocaleString()}</strong><small>{Math.floor(Math.max(0, balance.credits) / 50)} credit-funded generations available</small></div>
      <div><span>MEMBERSHIP</span><strong>{member ? 'Active' : 'Free'}</strong><small>{balance.subscription.expiresAt ? `Current period ends ${new Date(balance.subscription.expiresAt).toLocaleDateString()}` : 'Daily free generations included'}</small></div>
      <button onClick={() => { setError(''); setChecking(true); void refresh() }} disabled={!!busy || checking}>{checking ? 'Refreshing…' : 'Refresh balance'}</button>
    </section>}
    {!loading && !user && <div className="credits-signin"><div><strong>Your ideas, one account.</strong><p>Sign in before purchasing. Confirmed credits go to your WORLDIFACT account.</p></div><Link className="credits-action secondary" to="/login">Sign in or create an account ↗</Link></div>}
    {error && <div className="credits-error" role="alert"><p>{error}</p>{!busy && <button className="credits-manage" disabled={checking} onClick={() => { setError(''); setChecking(true); void refresh() }}>Recheck account and payment options</button>}</div>}
    {notice && <p className={`credits-pending ${notice.tone === 'success' ? 'credits-success' : ''}`} role="status">{notice.text}</p>}
    {cancelled && !notice && <p className="credits-pending" role="status">You returned from checkout without confirming here. Check your balance and payment history before trying again.</p>}
    {search.get('billing') === 'processing' && <p className="credits-pending" role="status">Your checkout has returned. Credits appear only after payment is confirmed. Refresh your balance in a moment; please do not pay again while confirmation is pending.</p>}
    {paypalReturn && <section className="credits-return" aria-label="Check your PayPal payment"><div><span className="credits-plan-tag">RETURNED FROM PAYPAL</span><h2>Check your credit purchase.</h2><p>$30 USD · 1,500 credits · one-time purchase. This pack does not activate membership or unlock SLOW downloads.</p><p>Use the same WORLDIFACT account you used to start checkout. This checks an existing payment or completes the payment you approved in PayPal.</p></div><button className="credits-action" disabled={!canBuy || !validOrder || !paypal?.ready} onClick={() => void capturePayPal()}>{busy === 'capture' ? 'Checking payment…' : 'Check $30 USD PayPal payment'}</button>{!validOrder && <p className="credits-return-error" role="alert">This payment return link is incomplete. Check your PayPal transaction before starting another purchase.</p>}</section>}
    {(checking || loading) && <p className="credits-pending" role="status">Checking your account and available payment options…</p>}
    {!checking && !billing?.topupReady && !paypal?.ready && <p className="credits-pending" role="status">The $30 USD credit pack is being prepared. Purchasing is not available yet.</p>}
    {(billing?.mode === 'test' || paypal?.mode === 'sandbox') && <p className="credits-pending" role="status">{billing?.mode === 'test' ? 'Card / Google Pay checkout is in test mode. ' : ''}{paypal?.mode === 'sandbox' ? 'PayPal checkout is in sandbox mode. ' : ''}Test payments are not real purchases.</p>}
    {balance?.billingReview && <p className="credits-error" role="alert">Purchasing is paused while your payment history is reviewed.</p>}
    <section className="credits-plans" aria-label="Generation plans">
      <article><span className="credits-plan-tag">EXPLORE</span><h2>Free</h2><div className="credits-price"><strong>$0</strong><span>Get to know your creative tools.</span></div><ul><li><b>2 FAST generations</b> in every rolling 24 hours</li><li>Download your FAST 3D drafts</li><li><b>1 SLOW generation</b> per UTC calendar day</li><li>SLOW downloads require active membership</li></ul>{balance && <div className="credits-remaining">Available now: {balance.free.fastRemaining} FAST · {balance.free.slowRemaining} SLOW</div>}<Link className="credits-action secondary" to={user ? '/shop' : '/login'}>{user ? 'Create a model' : 'Create a free account'} ↗</Link></article>
      <article className="credits-featured"><span className="credits-plan-tag">YOUR NEXT 30 CREATIONS</span><h2>1,500-credit pack</h2><div className="credits-price"><div><strong>$30</strong><b>USD</b></div><span>One-time payment · no automatic renewal</span></div><div className="credits-math"><strong>30</strong><span>generations with available textures<br />50 credits each · $1 per generation</span></div><ul><li>Use credits for FAST or SLOW generation</li><li>Credits are added after confirmed payment</li><li>Top up again whenever you need more</li></ul><div className="credits-access-note" id="credits-access-note"><strong>A credit pack adds credits only.</strong><p>It does not activate membership. FAST downloads are included; SLOW downloads require a separate active membership.</p>{!member && <label><input type="checkbox" checked={understandsPack} disabled={!user || !!busy} onChange={event => setUnderstandsPack(event.target.checked)} /><span>I understand that this pack does not unlock SLOW downloads.</span></label>}</div><div className="credits-payment-options" aria-describedby="credits-access-note"><button className="credits-action" disabled={!canBuyPack || !billing?.cardReady || !billing?.topupReady} onClick={() => void checkout('card')}>{busy === 'card' ? 'Opening secure checkout…' : 'Pay $30 USD by card'} ↗</button><button className="credits-action secondary" disabled={!canBuyPack || billing?.googlePay !== 'eligible_devices' || !billing?.topupReady} onClick={() => void checkout('google')}>{busy === 'google' ? 'Opening secure checkout…' : 'Google Pay via checkout'} ↗</button><button className="credits-action credits-paypal" disabled={!canBuyPack || !paypal?.ready} onClick={() => void checkout('paypal')}>{busy === 'paypal' ? 'Opening PayPal…' : 'Pay $30 USD with PayPal'} ↗</button></div><p className="credits-method-note">Google Pay appears in secure checkout on supported devices and browsers. You can also choose a card there. Only currently available methods can be selected.</p></article>
      <article><span className="credits-plan-tag">UNLOCK SLOW DOWNLOADS</span><h2>Membership</h2>{membershipReady ? <div className="credits-price"><div><strong>$30</strong><b>USD / {billing!.subscriptionInterval}</b></div><span>Renews every {billing!.subscriptionInterval} until cancelled</span></div> : <div className="credits-membership-state">{member ? 'Your membership is active' : 'Awaiting launch'}<p>The billing period will be shown before subscriptions become available.</p></div>}<ul><li><b>1,500 credits</b> per paid subscription period</li><li><b>30 generations</b> at 50 credits each</li><li>Download completed SLOW models and their available textures</li><li>Your account works across all five WORLDIFACT portal routes</li></ul><button className="credits-action secondary" disabled={!canBuy || !membershipReady || member} onClick={() => void checkout('subscription')}>{member ? 'Membership active' : membershipReady ? 'Choose membership' : 'Subscriptions available soon'} ↗</button>{user && member && billing?.checkoutReady && <button className="credits-manage" disabled={!canBuy} onClick={() => void checkout('portal')}>{busy === 'portal' ? 'Opening account…' : 'Manage subscription'}</button>}</article>
    </section>
    <section className="credits-trust" aria-label="Payment privacy"><strong>Secure checkout. Private payment details.</strong><p>Card and wallet details are entered with the payment provider. WORLDIFACT does not collect your full card number or display the seller’s bank account details.</p></section>
    <p className="credits-footnote">FAST creates an Astra-guided procedural draft. SLOW uses the detailed model pipeline; texture availability depends on the generated result. The current free SLOW result is retained on the server; its image preview is not yet available. A GAME model still needs separate validation for physical manufacturing.</p>
    <footer><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/">Back to the portals →</Link></footer>
  </main>
}
