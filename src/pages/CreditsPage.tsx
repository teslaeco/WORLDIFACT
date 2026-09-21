import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountRequest, useAccount } from '../lib/account'
import './CreditsPage.css'

type Balance = { credits: number; generationCost: number; subscriptionGrant: number; subscription: { active: boolean; expiresAt: string | null }; free: { fastRemaining: number; fastResetAt: string | null; slowRemaining: number; slowResetAt: string }; billingReview: boolean }
type Billing = { checkoutReady: boolean; topupReady: boolean; topupCredits: number | null; reason: string; mode: 'test' | 'live' | null }
export default function CreditsPage() {
  const { user, loading } = useAccount()
  const [balance, setBalance] = useState<Balance | null>(null), [billing, setBilling] = useState<Billing | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function refresh() {
    setError('')
    try {
      setBilling(await accountRequest('/api/billing/status'))
      if (user) setBalance(await accountRequest('/api/account/entitlements'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Account details are unavailable.') }
  }
  useEffect(() => { void refresh() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function checkout(kind: 'subscription' | 'topup' | 'portal') {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await accountRequest(kind === 'portal' ? '/api/billing/portal' : '/api/billing/checkout', kind === 'portal' ? {} : { kind })
      const url = new URL(result.url)
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('The checkout address could not be verified.')
      window.location.assign(url.href)
    } catch (e) { setError(e instanceof Error ? e.message : 'Checkout is unavailable.'); setBusy(false) }
  }
  const enabled = billing?.checkoutReady === true
  return <main className="credits-page">
    <header><Link to="/" className="credits-wordmark">WORLDIFACT</Link><Link to="/login">{user ? user.displayName : 'Sign in'} ↗</Link></header>
    <section className="credits-heading"><span>YOUR CREATIVE SPACE</span><h1>More worlds.<br /><em>More possibilities.</em></h1><p>Keep exploring for free. Unlock SLOW downloads and create with credits when you subscribe.</p></section>
    {user && balance && <section className="credits-balance" aria-label="Your account balance">
      <div><span>YOUR CREDITS</span><strong>{balance.credits.toLocaleString()}</strong><small>{Math.floor(Math.max(0, balance.credits) / 50)} credit-funded generations available</small></div>
      <div><span>MEMBERSHIP</span><strong>{balance.subscription.active ? 'Active' : 'Free'}</strong><small>{balance.subscription.expiresAt ? `Current period ends ${new Date(balance.subscription.expiresAt).toLocaleDateString()}` : 'Start with the daily free allowance'}</small></div>
      <button onClick={() => void refresh()} disabled={busy}>Refresh balance</button>
    </section>}
    {error && <p className="credits-error" role="alert">{error}</p>}
    {!enabled && <p className="credits-pending" role="status">Subscriptions and top-ups are being prepared. Prices and secure checkout will appear here when purchasing is available.</p>}
    {billing?.mode === 'test' && <p className="credits-pending" role="status">Test checkout only. No real payment or production membership is offered in test mode.</p>}
    <section className="credits-plans" aria-label="Generation plans">
      <article><span className="credits-plan-tag">EXPLORE</span><h2>Free</h2><p>Discover your next idea.</p><ul><li><b>2 FAST generations</b> in every rolling 24 hours</li><li>Download your FAST 3D drafts</li><li><b>1 SLOW generation</b> per UTC calendar day</li><li>SLOW downloads unlock with an active subscription</li></ul>{balance && <div className="credits-remaining">Available now: {balance.free.fastRemaining} FAST · {balance.free.slowRemaining} SLOW</div>}<Link className="credits-action secondary" to={user ? '/shop' : '/login'}>{user ? 'Create a model' : 'Create a free account'} ↗</Link></article>
      <article className="credits-featured"><span className="credits-plan-tag">CREATE</span><h2>Membership</h2><p><b>1,500 credits</b> per paid subscription period.</p><div className="credits-math"><strong>30</strong><span>generations<br />50 credits each</span></div><ul><li>FAST and SLOW creation</li><li>Download completed SLOW models and available textures</li><li>All five WORLDIFACT portal routes share your account</li><li>Top up when you need more credits</li></ul><button className="credits-action" disabled={!enabled || !user || busy || loading || balance?.subscription.active} onClick={() => void checkout('subscription')}>{balance?.subscription.active ? 'Membership active' : enabled ? 'Choose membership' : 'Purchasing available soon'} ↗</button></article>
      <article><span className="credits-plan-tag">KEEP GOING</span><h2>Credit top-up</h2><p>Add more room for your ideas.</p><ul><li>50 credits per generation</li><li>Credits are added after confirmed payment</li><li>Failed generations return your allowance or credits</li><li>SLOW downloads still require active membership</li></ul><button className="credits-action secondary" disabled={!billing?.topupReady || !user || !balance?.subscription.active || busy || loading} onClick={() => void checkout('topup')}>{billing?.topupReady ? `Buy ${billing.topupCredits?.toLocaleString()} credits` : 'Top-ups available soon'} ↗</button>{user && balance?.subscription.active && enabled && <button className="credits-manage" disabled={busy} onClick={() => void checkout('portal')}>Manage subscription</button>}</article>
    </section>
    <p className="credits-footnote">FAST creates an Astra-guided procedural draft. SLOW uses the detailed model pipeline; texture availability depends on the generated result. The current free SLOW result is retained on the server; its image preview is not yet available. A GAME model still needs separate validation for physical manufacturing.</p>
    <footer><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/">Back to the portals →</Link></footer>
  </main>
}
