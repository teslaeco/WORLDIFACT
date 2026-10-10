import PromotionRedemption from '../components/PromotionRedemption'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountRequest, useAccount, type AccountUser } from '../lib/account'
import { paymentErrorMessage } from '../lib/paymentError'
import BillingRecovery from '../components/BillingRecovery'
import { readGenerationBalance } from '../lib/generationQuote'
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
  const [tab, setTab] = useState<'plans' | 'code'>('plans')
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

  const visibleBalance = !checking && !loading ? readGenerationBalance(balance) : undefined

  return <main className="credits-page credits-compact">
    <header><Link to="/" className="credits-wordmark">WORLDIFAKT</Link><Link to={user ? '/account' : signInHref}>{user ? user.displayName : 'Sign in'} ↗</Link></header>
    <h1>Subscriptions & points</h1>
    <section className="credits-balance" aria-label="Your account balance">
      <div><span>AVAILABLE POINTS</span><strong>{visibleBalance ? visibleBalance.available.toLocaleString() : user ? '…' : '—'}</strong></div>
      <div><span>MEMBERSHIP</span><b>{activePlan ? PLAN_NAMES[activePlan] : member ? 'Active' : 'Free'}</b></div>
      {user && <button onClick={() => { setError(''); setChecking(true); void refresh() }} disabled={!!busy || checking}>{checking ? 'Refreshing…' : 'Refresh balance'}</button>}
    </section>
    {!loading && !user && <Link className="credits-action" to={signInHref}>Sign in</Link>}
    <div className="credits-tabs" role="tablist" aria-label="Account tools">
      {(['plans', 'code'] as const).map(id => <button key={id} id={`credits-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`credits-panel-${id}`} tabIndex={tab === id ? 0 : -1}
        onClick={() => setTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'plans' : event.key === 'End' ? 'code' : tab === 'plans' ? 'code' : 'plans'
          setTab(next); document.getElementById(`credits-tab-${next}`)?.focus()
        }}>{id === 'plans' ? 'Subscriptions' : 'Enter code'}</button>)}
    </div>
    <section id="credits-panel-code" role="tabpanel" aria-labelledby="credits-tab-code" hidden={tab !== 'code'}>
      <PromotionRedemption accountId={user?.id ?? null} onRedeemed={async () => { await refresh(); window.dispatchEvent(new Event('worldifact:balance-changed')) }} />
    </section>
    {error && <div className="credits-error" role="alert"><p>{error}</p>{!busy && <button className="credits-manage" disabled={checking} onClick={() => { setError(''); setChecking(true); void refresh() }}>Recheck account and payment options</button>}</div>}
    {notice && <p className={`credits-pending ${notice.tone === 'success' ? 'credits-success' : ''}`} role="status">{notice.text}</p>}
    {cancelled && !notice && <p className="credits-pending" role="status">You returned from checkout without confirming here. Check your balance and payment history before trying again.</p>}
    {search.get('billing') === 'processing' && <p className="credits-pending" role="status">Your checkout has returned. Credits appear only after payment is confirmed. Refresh your balance in a moment; please do not pay again while confirmation is pending.</p>}
    {paypalReturn && <section className="credits-return" aria-label="Check your PayPal payment"><div><span className="credits-plan-tag">RETURNED FROM PAYPAL</span><h2>Check your credit purchase.</h2><p>$29.99 USD · 1,500 credits · one-time purchase. This pack does not activate membership or unlock SLOW downloads.</p><p>Use the same WORLDIFAKT account you used to start checkout. This checks an existing payment or completes the payment you approved in PayPal.</p></div><button className="credits-action" disabled={!canBuy || !validOrder || !paypal?.ready} onClick={() => void capturePayPal()}>{busy === 'capture' ? 'Checking payment…' : 'Check $29.99 USD PayPal payment'}</button>{!validOrder && <p className="credits-return-error" role="alert">This payment return link is incomplete. Check your PayPal transaction before starting another purchase.</p>}</section>}
    {(checking || loading) && <p className="credits-pending" role="status">Checking your account and available payment options…</p>}
    {!checking && !membershipReady && !billing?.topupReady && !paypal?.ready && <p className="credits-pending" role="status">Secure checkout is being prepared. Purchasing is not available yet.</p>}
    {(billing?.mode === 'test' || paypal?.mode === 'sandbox') && <p className="credits-pending" role="status">{billing?.mode === 'test' ? 'Card / Google Pay checkout is in test mode. ' : ''}{paypal?.mode === 'sandbox' ? 'PayPal checkout is in sandbox mode. ' : ''}Test payments are not real purchases.</p>}
    {balance?.billingReview && <p className="credits-error" role="alert">Purchasing is paused while your payment history is reviewed.</p>}
    <section id="credits-panel-plans" role="tabpanel" aria-labelledby="credits-tab-plans" hidden={tab !== 'plans'}>
    <section className="credits-plans" aria-label="Generation plans">
      {([
        ['creator','Creator SOL','$29.99','1,500'],
        ['pro','Pro ASTRA','$99.99','4,500'],
        ['studio','Studio ASTRA','$149.99','7,500'],
      ] as const).map(([id,name,price,credits]) => <article key={id}
        className={`credits-selectable-plan${selectedPlan === id && purchaseKind === 'subscription' ? ' credits-featured' : ''}`}
        tabIndex={canOpenPlan(id) ? 0 : -1} aria-label={`Open secure billing for ${name}`} aria-disabled={!canOpenPlan(id)}
        onClick={event => { if (!(event.target as HTMLElement).closest('button,a')) openPlan(id) }}
        onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openPlan(id) } }}>
        <div><span className="credits-plan-tag">{id.toUpperCase()}{activePlan === id ? ' · YOUR ACTIVE PLAN' : ''}</span><h2>{name}</h2><small>{credits} points / month</small></div>
        <div className="credits-price"><strong>{price}</strong><small>USD / month</small></div>
        <button className="credits-action" disabled={!canOpenPlan(id)} onClick={() => openPlan(id)}>{busy === 'plan' && selectedPlan === id ? 'Opening…' : member && (balance?.subscription.plan??'creator')===id ? 'Manage subscription' : billing?.plans?.[id]?.checkoutReady===false ? 'Unavailable' : 'Select plan'}</button>
      </article>)}
    </section>
    <details className="credits-extra"><summary>More options</summary>
      <p>Free: $0 · 2 shared SOL / LUNA drafts per day, when available.</p>
      <Link to={user ? '/shop' : signInHref}>Open generator ↗</Link>
      <h2>1,500 extra credits</h2><p>$29.99 USD once · no renewal. Points only; no membership.</p>
      {!member && <label><input type="checkbox" checked={understandsPack} disabled={!user || !!busy} onChange={event => setUnderstandsPack(event.target.checked)} /> I understand this does not unlock ASTRA.</label>}
      <div className="credits-topup-actions"><button className="credits-action secondary" disabled={!canBuyPack || !billing?.topupReady} onClick={() => { setPurchaseKind('topup'); void checkout('card', { kind: 'topup' }) }}>Buy $29.99 top-up ↗</button>
      <button className="credits-action secondary" disabled={!canBuyPack || !paypal?.ready} onClick={() => { setPurchaseKind('topup'); void checkout('paypal', { kind: 'topup' }) }}>Pay once with PayPal ↗</button></div>
    </details>
    </section>
    {user && <details className="credits-extra"><summary>Account details & payments</summary>
      {visibleBalance && <p>{visibleBalance.held.toLocaleString()} points reserved · {visibleBalance.total.toLocaleString()} total.</p>}
      <Link to="/account/generation-funding">Review reserved requests ↗</Link>
      {balance?.subscription.expiresAt && <p>Current period ends {new Date(balance.subscription.expiresAt).toLocaleDateString()}</p>}
      <BillingRecovery enabled={!!user && !loading} onRefresh={refresh} />
    </details>}
    <footer><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/world">Back to the portals →</Link></footer>
  </main>
}
