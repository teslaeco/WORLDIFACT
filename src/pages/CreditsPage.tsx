import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountRequest, useAccount, type AccountUser } from '../lib/account'
import { paymentErrorMessage } from '../lib/paymentError'
import BillingRecovery from '../components/BillingRecovery'
import CreditToolsPanel from '../components/CreditToolsPanel'
import { onCachedBillingReturn, planPaymentAddress, planPaymentNotice } from '../lib/planPayment'
import './CreditsPage.css'

type PlanId = 'creator' | 'pro' | 'studio'
const PLAN_NAMES: Record<PlanId, string> = { creator: 'Creator SOL', pro: 'Pro ASTRA', studio: 'Studio ASTRA' }
const isPlanId = (value: unknown): value is PlanId => value === 'creator' || value === 'pro' || value === 'studio'
type Balance = { credits: number; reservedCredits?: number; availableCredits?: number; generationCost: number; generationCosts?: { sol: number; astra: number }; subscriptionGrant: number; subscription: { active: boolean; plan?: PlanId; expiresAt: string | null }; free: { fastRemaining: number; fastResetAt: string | null; slowRemaining: number; slowResetAt: string }; billingReview: boolean }
type PlanOffer = { id: PlanId; name: string; amountCents: number; credits: number; allowedModels: readonly string[]; checkoutReady: boolean; blockedReason?: string | null }
type Billing = { portalReady?: boolean; planChangeReady?: boolean; checkoutReady: boolean; topupReady: boolean; cardReady: boolean; googlePay: 'eligible_devices' | 'unavailable'; mode: 'test' | 'live' | null; subscriptionInterval: 'month' | null; generationCosts?: { sol: number; astra: number }; plans?: Record<PlanId, PlanOffer> }
type PayPal = { ready: boolean; mode: 'sandbox' | 'live' | null }
type Snapshot = { owner: string | null; balance: Balance | null; billing: Billing | null; paypal: PayPal | null }
type PaymentAction = 'plan' | 'card' | 'google' | 'paypal' | 'portal' | 'change' | 'capture'
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
  const signInHref = `/login?next=${encodeURIComponent(`/account/credits${search.toString() ? `?${search.toString()}` : ''}`)}`
  const owner = user?.id ?? null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<PaymentAction | null>(null)
  const [notice, setNotice] = useState<PaymentNotice>(null)
  const [understandsPack, setUnderstandsPack] = useState(false)
  const [purchaseKind, setPurchaseKind] = useState<'subscription' | 'topup'>('subscription')
  const [explicitPlan, setExplicitPlan] = useState<PlanId | null>(null)
  const loadVersion = useRef(0), actionVersion = useRef(0), actionLock = useRef(false)
  // Results are scoped to their account, including the first render after signing out.
  const current = snapshot?.owner === owner ? snapshot : null
  const balance = current?.balance, billing = current?.billing, paypal = current?.paypal
  const activePlan = balance?.subscription.active && isPlanId(balance.subscription.plan) ? balance.subscription.plan : null
  // Follow the verified membership until the customer chooses an offer. The
  // account-keyed content resets this choice when the signed-in identity changes.
  const selectedPlan = explicitPlan ?? activePlan ?? 'creator'

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

  useEffect(() => onCachedBillingReturn(window, () => {
    actionVersion.current++
    actionLock.current = false
    setBusy(null)
    setError('')
    setChecking(true)
    void refresh()
  }), [refresh])

  const member = balance?.subscription.active === true
  const canManage = !!user && !loading && !busy
  const canBuy = !!user && !!balance && !balance.billingReview && !checking && !loading && !busy
  const canBuyPack = canBuy && (member || understandsPack) && search.get('paypal') !== 'return'
  const membershipReady = billing?.plans?.[selectedPlan]?.checkoutReady === true && billing.subscriptionInterval === 'month'
  const paypalReturn = search.get('paypal') === 'return'
  const orderId = search.get('token') ?? ''
  const validOrder = /^[A-Z0-9]{10,36}$/.test(orderId)
  const cancelled = search.get('paypal') === 'cancel' || search.get('paypal') === 'cancelled' || search.get('billing') === 'cancelled'

  function canOpenPlan(id: PlanId) {
    if (!user || !balance || checking || loading || busy) return false
    if (member && (balance.subscription.plan ?? 'creator') === id) return billing?.portalReady === true
    return !balance.billingReview && billing?.plans?.[id]?.checkoutReady === true
  }

  function openPlan(id: PlanId) {
    if (!canOpenPlan(id)) return
    setExplicitPlan(id)
    setPurchaseKind('subscription')
    void checkout('plan', { kind: 'subscription', plan: id })
  }

  async function checkout(action: Exclude<PaymentAction, 'capture'>, choice?: { kind?: 'subscription' | 'topup'; plan?: PlanId }) {
    const checkoutKind = choice?.kind ?? purchaseKind
    const checkoutPlan = choice?.plan ?? selectedPlan
    const checkoutRecurring = checkoutKind === 'subscription'
    const checkoutReady = checkoutRecurring ? billing?.plans?.[checkoutPlan]?.checkoutReady === true : billing?.topupReady === true
    const checkoutCanBuy = checkoutRecurring ? canBuy && !member && search.get('paypal') !== 'return' : canBuyPack
    if (actionLock.current || (action === 'plan' ? !canOpenPlan(checkoutPlan) : action === 'portal' ? !canManage : action === 'change' ? !canBuy || !member || !billing?.planChangeReady || !checkoutReady : !canBuy || !checkoutCanBuy)) return
    if ((action === 'paypal' && (checkoutRecurring || !paypal?.ready)) || (['card', 'google'].includes(action) && action !== 'portal' && !checkoutReady)) return
    actionLock.current = true
    const version = ++actionVersion.current
    setBusy(action); setError(''); setNotice(null)
    try {
      const result = await accountRequest(action === 'plan' ? '/api/billing/plan-payment' : action === 'paypal' ? '/api/billing/paypal/order' : action === 'portal' ? '/api/billing/portal' : action === 'change' ? '/api/billing/change-plan' : '/api/billing/checkout', action === 'paypal' || action === 'portal' ? {} : action === 'change' || action === 'plan' ? { plan: checkoutPlan } : { kind: checkoutKind, ...(checkoutKind === 'subscription' ? { plan: checkoutPlan } : {}) })
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
      if (action === 'plan') {
        const text = planPaymentNotice(result.state)
        if (text) {
          setNotice({ tone: 'pending', text })
          await refresh()
          if (version === actionVersion.current) { setBusy(null); actionLock.current = false }
          return
        }
        window.location.assign(planPaymentAddress(result.url, result.destination))
        return
      }
      window.location.assign(checkoutAddress(result.url, action === 'paypal' ? 'paypal' : action === 'portal' || action === 'change' ? 'portal' : 'stripe'))
    } catch (error) {
      if (version !== actionVersion.current) return
      setError(paymentErrorMessage(error))
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
    <header><Link to="/" className="credits-wordmark">WORLDIFAKT</Link><Link to={user ? '/account' : signInHref}>{user ? user.displayName : 'Sign in'} ↗</Link></header>
    <section className="credits-heading"><span>CHOOSE QUALITY · KEEP COSTS CONTROLLED</span><h1>Sol for speed.<br /><em>Astra when quality matters.</em></h1><p>Free accounts share a SOL / LUNA draft allowance. Active paid Creator, Pro and Studio members can request models while enough points are available for each request. Per-job API cost limits, account billing checks and runtime availability still apply.</p></section>
    {user && balance && <section className="credits-balance" aria-label="Your account balance">
      <div><span>YOUR CREDITS</span><strong>{balance.credits.toLocaleString()}</strong><small>{(balance.reservedCredits ?? 0) > 0
        ? `${(balance.reservedCredits ?? 0).toLocaleString()} points held for requests or pending cost review · ${(balance.availableCredits ?? balance.credits).toLocaleString()} available`
        : `${Math.floor(Math.max(0, balance.credits) / 50)} SOL attempts from points${activePlan ? ` or ${Math.floor(Math.max(0, balance.credits) / 250)} ASTRA attempts` : ''} · check current generation availability in the Shop`}</small></div>
      <div><span>MEMBERSHIP</span><strong>{activePlan ? PLAN_NAMES[activePlan] : member ? 'Active membership · plan unverified' : 'Free'}</strong><small>{balance.subscription.expiresAt ? `Current period ends ${new Date(balance.subscription.expiresAt).toLocaleDateString()}` : 'Daily free generations included'}</small></div>
      <button onClick={() => { setError(''); setChecking(true); void refresh() }} disabled={!!busy || checking}>{checking ? 'Refreshing…' : 'Refresh balance'}</button>
    </section>}
    <CreditToolsPanel account={balance} checking={checking || loading} signedIn={!!user} />
    {!loading && !user && <div className="credits-signin"><div><strong>Your ideas, one account.</strong><p>Sign in before purchasing. Confirmed credits go to your WORLDIFAKT account.</p></div><Link className="credits-action secondary" to={signInHref}>Sign in or create an account ↗</Link></div>}
    {error && <div className="credits-error" role="alert"><p>{error}</p>{!busy && <button className="credits-manage" disabled={checking} onClick={() => { setError(''); setChecking(true); void refresh() }}>Recheck account and payment options</button>}</div>}
    {notice && <p className={`credits-pending ${notice.tone === 'success' ? 'credits-success' : ''}`} role="status">{notice.text}</p>}
    {cancelled && !notice && <p className="credits-pending" role="status">You returned from checkout without confirming here. Check your balance and payment history before trying again.</p>}
    {search.get('billing') === 'processing' && <p className="credits-pending" role="status">Your checkout has returned. Credits appear only after payment is confirmed. Refresh your balance in a moment; please do not pay again while confirmation is pending.</p>}
    {paypalReturn && <section className="credits-return" aria-label="Check your PayPal payment"><div><span className="credits-plan-tag">RETURNED FROM PAYPAL</span><h2>Check your credit purchase.</h2><p>$29.99 USD · 1,500 credits · one-time purchase. This pack does not activate membership or unlock SLOW downloads.</p><p>Use the same WORLDIFAKT account you used to start checkout. This checks an existing payment or completes the payment you approved in PayPal.</p></div><button className="credits-action" disabled={!canBuy || !validOrder || !paypal?.ready} onClick={() => void capturePayPal()}>{busy === 'capture' ? 'Checking payment…' : 'Check $29.99 USD PayPal payment'}</button>{!validOrder && <p className="credits-return-error" role="alert">This payment return link is incomplete. Check your PayPal transaction before starting another purchase.</p>}</section>}
    {(checking || loading) && <p className="credits-pending" role="status">Checking your account and available payment options…</p>}
    {!checking && !membershipReady && !billing?.topupReady && !paypal?.ready && <p className="credits-pending" role="status">Secure checkout is being prepared. Purchasing is not available yet.</p>}
    {(billing?.mode === 'test' || paypal?.mode === 'sandbox') && <p className="credits-pending" role="status">{billing?.mode === 'test' ? 'Card / Google Pay checkout is in test mode. ' : ''}{paypal?.mode === 'sandbox' ? 'PayPal checkout is in sandbox mode. ' : ''}Test payments are not real purchases.</p>}
    {balance?.billingReview && <p className="credits-error" role="alert">Purchasing is paused while your payment history is reviewed.</p>}
    <section className="credits-plans" aria-label="Generation plans">
      <article><span className="credits-plan-tag">EXPLORE</span><h2>Free SOL / LUNA</h2><div className="credits-price"><strong>$0</strong><span>Try WORLDIFACT without exposing the platform to Astra costs.</span></div><ul><li><b>2 shared SOL / LUNA draft attempts</b> in every rolling 24 hours when funded SOL capacity is available</li><li>FAST draft downloads included</li><li><b>No free Astra fallback</b> — if SOL capacity is unavailable, no expensive Astra request is silently charged</li></ul>{balance && <div className="credits-remaining">Personal allowance: {balance.free.fastRemaining} shared drafts; funded capacity is checked at submission</div>}<Link className="credits-action secondary" to={user ? '/shop' : signInHref}>{user ? 'Create with SOL' : 'Create a free account'} ↗</Link></article>
      {([
        ['creator','Creator SOL','$29.99','1,500 credits','Example point mix: 2 standard ASTRA + 20 SOL, or 6 standard ASTRA attempts','LUNA 15 · SOL 50 · ASTRA from 250 points; available points required'],
        ['pro','Pro ASTRA','$99.99','4,500 credits','Example point use: 90 SOL, 300 LUNA or 18 standard ASTRA attempts','LUNA 15 · SOL 50 · ASTRA from 250 points; available points required'],
        ['studio','Studio ASTRA','$149.99','7,500 credits','Example point use: 150 SOL, 500 LUNA or 30 standard ASTRA attempts','LUNA 15 · SOL 50 · ASTRA from 250 points; available points required'],
      ] as const).map(([id,name,price,credits,capacity,models]) => <article
        key={id}
        className={`credits-selectable-plan${selectedPlan === id && purchaseKind === 'subscription' ? ' credits-featured' : ''}`}
        tabIndex={canOpenPlan(id) ? 0 : -1}
        aria-label={`Open secure billing for ${name}`}
        aria-disabled={!canOpenPlan(id)}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button,a')) return
          openPlan(id)
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
          event.preventDefault()
          openPlan(id)
        }}
      >
        <span className="credits-plan-tag">{id.toUpperCase()}{activePlan === id ? ' · YOUR ACTIVE PLAN' : ''}</span>
        <h2>{name}</h2>
        <div className="credits-price"><div><strong>{price}</strong><b> USD / month</b></div><span>{credits} every confirmed paid month</span></div>
        <ul><li><b>{capacity}</b></li><li>{models}</li><li>These are examples, not fixed generation-count quotas. All active paid plans support ASTRA without an additional monthly attempt quota. Available points and per-job API cost limits still apply; successful output is not guaranteed.</li></ul>
        {billing?.plans?.[id]?.blockedReason === 'ASTRA_COST_GUARD_REQUIRED' && <p className="credits-method-note">ASTRA purchasing is temporarily paused while the live generation and export check is completed. No payment will be taken for an unavailable plan.</p>}
        <p className="credits-method-note">Confirmed plan credits are added to your existing balance, never substituted for it. Opening payment does not add credits.</p>
        <button className="credits-action" disabled={!canOpenPlan(id)} onClick={() => openPlan(id)}>{busy === 'plan' && selectedPlan === id ? 'Opening secure payment…' : member && (balance?.subscription.plan??'creator')===id ? 'Manage current subscription ↗' : billing?.plans?.[id]?.checkoutReady===false ? 'Temporarily unavailable · no charge' : `Subscribe ${price} / month ↗`}</button>
      </article>)}
      <article>
        <span className="credits-plan-tag">TOP-UP</span><h2>1,500 extra credits</h2>
        <div className="credits-price"><div><strong>$29.99</strong><b> USD once</b></div><span>No automatic renewal</span></div>
        <ul><li>30 extra SOL generations</li><li>Astra needs active paid membership, enough available points and runtime availability. Creator, Pro and Studio can use added points without a separate monthly attempt quota; per-job API cost limits still apply.</li><li>Top-up alone does not unlock ASTRA or membership-only access</li></ul>
        {!member && <label><input type="checkbox" checked={understandsPack} disabled={!user || !!busy} onChange={event => setUnderstandsPack(event.target.checked)} /><span>I understand this adds credits only and does not unlock ASTRA.</span></label>}
        <button className="credits-action secondary" disabled={!canBuyPack || !billing?.topupReady} onClick={() => { setPurchaseKind('topup'); void checkout('card', { kind: 'topup' }) }}>{busy === 'card' && purchaseKind === 'topup' ? 'Opening secure checkout…' : 'Buy $29.99 top-up'} ↗</button>
        <button className="credits-action credits-paypal" disabled={!canBuyPack || !paypal?.ready} onClick={() => { setPurchaseKind('topup'); void checkout('paypal', { kind: 'topup' }) }}>{busy === 'paypal' ? 'Opening PayPal…' : 'Pay once with PayPal'} ↗</button>
      </article>
      {user && member && billing?.checkoutReady && <article><span className="credits-plan-tag">ACTIVE</span><h2>{balance?.subscription.plan ? `Current plan: ${balance.subscription.plan.toUpperCase()}` : 'Manage membership'}</h2><p>Existing subscribers keep their current price until they explicitly change plan. Use Stripe billing management to cancel or update payment details.</p><button className="credits-manage" disabled={!canManage} onClick={() => void checkout('portal')}>{busy === 'portal' ? 'Opening account…' : 'Manage subscription'}</button></article>}
    </section>
    <BillingRecovery enabled={!!user && !loading} onRefresh={refresh} />
    <section className="credits-trust" aria-label="Payment privacy"><strong>Secure checkout. Private payment details.</strong><p>Card and wallet details are entered with the payment provider. WORLDIFAKT does not collect your full card number or display the seller’s bank account details.</p></section>
    <p className="credits-footnote">FAST is the SOL path. Detailed ASTRA uses 250 points for the standard model budget or 500 points for the extended budget when that option is verified as available and explicitly accepted. Standard describes one model's budget, not your membership plan; upgrading to Pro does not automatically select the 500-point budget. Astra blueprints remain 250 points. Attempt counts above illustrate how one points grant can be used; they are not fixed generation-count quotas. Active paid members can keep requesting models while enough points remain available, with per-job API cost limits and service readiness checks. For example, the existing 1,500-credit Creator grant covers two standard Astra attempts plus twenty Sol attempts; other point mixes are allowed. WORLDIFACT never silently falls back from SOL to ASTRA when the cheaper route is unavailable. A GAME model still needs separate validation for physical manufacturing.</p>
    <footer><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/world">Back to the portals →</Link></footer>
  </main>
}
