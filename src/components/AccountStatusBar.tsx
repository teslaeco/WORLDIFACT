import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { checkoutHomeDestination, checkoutReturnNotice, fetchAccountBalance, type VisibleBalance } from '../lib/accountBalance'
import './AccountStatusBar.css'

export default function AccountStatusBar() {
  const { user, loading } = useAccount()
  // Old account balances and late requests must never be displayed for a new account.
  return <AccountStatusContent key={user?.id ?? 'anonymous'} signedIn={!!user} loading={loading} />
}
function AccountStatusContent({ signedIn, loading }: { signedIn: boolean; loading: boolean }) {
  const location = useLocation(), navigate = useNavigate()
  const [balance, setBalance] = useState<VisibleBalance | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const returning = new URLSearchParams(location.search).get('billing') === 'processing'
  const destination = checkoutHomeDestination(location.pathname, location.search)
  useEffect(() => { if (destination) navigate(destination, { replace: true }) }, [destination, navigate])

  useEffect(() => {
    if (!signedIn || loading) return
    let closed = false, running = false
    let controller: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const quickUntil = returning ? Date.now() + 60_000 : 0
    const schedule = () => { if (!closed) timer = setTimeout(() => void refresh(), Date.now() < quickUntil ? 5000 : 30_000) }
    async function refresh() {
      if (closed || running) return
      if (timer) clearTimeout(timer)
      if (document.visibilityState === 'hidden') { schedule(); return }
      running = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 15_000)
      try {
        const next = await fetchAccountBalance(controller.signal)
        if (!closed) { setBalance(next); setError('') }
      } catch (e) {
        if (!closed) { setBalance(null); setError(e instanceof Error ? e.message : 'Your credits are temporarily unavailable.') }
      } finally { clearTimeout(timeout); running = false; schedule() }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const onRefresh = () => { void refresh() }
    void refresh()
    window.addEventListener('focus', onRefresh)
    window.addEventListener('worldifact:balance-changed', onRefresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      controller?.abort()
      window.removeEventListener('focus', onRefresh)
      window.removeEventListener('worldifact:balance-changed', onRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn, loading, location.pathname, returning, revision])

  const notice = checkoutReturnNotice(balance)
  const signIn = returning ? `/login?next=${encodeURIComponent('/?billing=processing')}` : '/login'
  function dismissReturn() {
    const search = new URLSearchParams(location.search); search.delete('billing')
    navigate({ pathname: location.pathname, search: search.toString() ? `?${search}` : '', hash: location.hash }, { replace: true })
  }
  return <aside className="account-status-bar" aria-label="Account and credit balance">
    <div className="account-status-row">
      <Link to="/" className="account-status-brand">WORLDIFACT</Link>
      <div className="account-status-tools">
        <Link to={signedIn ? '/account/credits' : signIn} className="account-status-credits" aria-live="polite">
          <span>Credits</span><strong>{loading ? 'Checking…' : !signedIn ? 'Sign in' : balance ? balance.credits.toLocaleString() : error ? 'Unavailable' : 'Checking…'}</strong>
        </Link>
        {signedIn && balance && <span className="account-status-free">Free: <b>{balance.fastRemaining} FAST</b> · <b>{balance.slowRemaining} SLOW</b></span>}
        {signedIn && <button type="button" className="account-status-refresh" onClick={() => setRevision(value => value + 1)} aria-label="Refresh credit balance">Refresh</button>}
      </div>
    </div>
    {signedIn && error && <p className="account-status-error" role="status">{error}</p>}
    {returning && <section className={`account-status-return ${notice.tone === 'success' && signedIn ? 'is-confirmed' : ''}`} aria-label="Welcome back from checkout">
      <p role="status">{signedIn ? notice.text : 'Welcome back to WORLDIFACT! Sign in to the account used at checkout to check your membership and credits. Please do not pay again while confirmation is pending.'}</p>
      <div><Link to={signedIn ? '/shop' : signIn}>{signedIn ? 'Create a model' : 'Sign in'}</Link><Link to="/account/credits">View account</Link><button type="button" onClick={dismissReturn} aria-label="Dismiss checkout welcome">Close</button></div>
    </section>}
  </aside>
}
