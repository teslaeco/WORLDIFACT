import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { accountRequest, useAccount } from '../lib/account'
import { safeAccountDestination } from '../lib/accountDestination'
import { accountOAuthError } from '../lib/accountOAuthError'
import BrandShowcase from '../components/BrandShowcase'
import './AccountPage.css'

const CosmicLoginScene = lazy(() => import('../components/CosmicLoginScene'))
type Tab = 'login' | 'register' | 'recover'
const futureProviders = [{ name: 'Apple', mark: '●' }, { name: 'Xbox', mark: 'X' }, { name: 'PlayStation', mark: 'PS' }, { name: 'Steam', mark: '◎' }]

export default function AccountPage() {
  const account = useAccount(), navigate = useNavigate(), location = useLocation()
  const destination = safeAccountDestination(new URLSearchParams(location.search).get('next'))
  const oauth = new URLSearchParams(location.search).get('oauth')
  const [tab, setTab] = useState<Tab>('login')
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'success'>(oauth === 'success' ? 'submitting' : 'idle')
  const [googleReady, setGoogleReady] = useState<boolean | null>(null)
  const [notice, setNotice] = useState(''), [error, setError] = useState(oauth === 'error' ? accountOAuthError(new URLSearchParams(location.search).get('reason')) : '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    let active = true
    void accountRequest('/api/account/config').then(result => { if (active) setGoogleReady(result.googleReady === true) }).catch(() => { if (active) setGoogleReady(false) })
    return () => { active = false }
  }, [])
  const enter = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setPhase('success')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(() => navigate(destination, { replace: true }), reduced ? 100 : 2800)
  }, [destination, navigate])
  const refresh = account.refresh
  useEffect(() => {
    let active = true
    if (oauth === 'success') {
      void refresh().then(user => {
        if (!active) return
        if (user) enter()
        else { setError('Your session could not be confirmed. Please sign in again.'); setPhase('idle') }
      })
    }
    return () => { active = false }
  }, [oauth, refresh, enter])
  function changeTab(next: Tab) { if (phase !== 'idle') return; setTab(next); setError(''); setNotice('') }
  async function googleSignIn() {
    if (phase !== 'idle' || !googleReady) return
    setPhase('submitting'); setError(''); setNotice('')
    try {
      const result = await accountRequest('/api/account/oauth/google', { next: destination })
      const url = new URL(result.url)
      if (url.origin !== 'https://oiezgikconcyjvdeshdh.supabase.co' || url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.searchParams.get('provider') !== 'google') throw new Error('Google sign-in could not be opened. Please try again.')
      window.location.assign(url.href)
    } catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in is temporarily unavailable.'); setPhase('idle') }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (phase !== 'idle') return
    const form = new FormData(event.currentTarget)
    setPhase('submitting'); setError(''); setNotice('')
    try {
      const email = String(form.get('email') || '').trim(), password = String(form.get('password') || '')
      if (tab === 'recover') {
        await accountRequest('/api/account/recover', { email }); setNotice('If this email has an account, a password reset link is on its way.'); setPhase('idle'); return
      }
      const result = await accountRequest(`/api/account/${tab}`, { email, password,
        ...(tab === 'register' ? { displayName: String(form.get('displayName') || '').trim(), acceptTerms: form.get('terms') === 'on' } : {}) })
      if (tab === 'register' && result.confirmationRequired) {
        setNotice('Check your email to confirm your account. Then sign in here with the same email and password.'); setTab('login'); setPhase('idle'); return
      }
      const verified = await account.refresh()
      if (!verified) throw new Error('Your session could not be confirmed. Please sign in again.')
      enter()
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); setPhase('idle') }
  }
  return <main className={`account-universe account-phase-${phase}`}>
    <Suspense fallback={<div className="account-scene-loading" aria-hidden="true" />}><CosmicLoginScene phase={phase} /></Suspense>
    <header className="account-header">
      <Link to="/login" className="account-brand" aria-label="WORLDIFAKT sign in"><span className="account-wordmark" data-text="WORLDIFAKT">WORLDIFAKT</span><small>AI WORLDS MADE REAL</small></Link>
      <Link to="/world" className="account-guest">Explore as a guest <span aria-hidden="true">↗</span></Link>
    </header>
    <div className="account-layout">
      <section className="account-hero" aria-label="WORLDIFAKT universe">
        <span className="account-kicker">FIVE WORLDS · ONE ACCOUNT</span>
        <h1>Your next world <br />starts here<span>.</span></h1>
        <p>Play. Create. Bring your ideas to life.</p>
        <div className="account-scene-caption"><span>THE WORLDIFAKT CORE</span><small>Ideas in motion. Worlds waiting for you.</small></div>
      </section>
      <section className="account-card" aria-labelledby="account-title" aria-busy={phase === 'submitting'}>
        <span className="account-card-eyebrow">ENTER WORLDIFAKT</span>
        {account.user ? <>
          <h2 id="account-title">Welcome back,<br />{account.user.displayName || 'explorer'}.</h2>
          <p className="account-card-copy">Your worlds are ready when you are.</p>
          <button className="account-primary" disabled={phase !== 'idle'} onClick={enter}>{phase === 'success' ? 'Opening your world…' : 'Enter the world'} <span aria-hidden="true">↗</span></button>
          <Link className="account-secondary" to="/account/credits">View credits & membership</Link>
          <button className="account-text-button" disabled={phase !== 'idle'} onClick={() => void account.signOut().catch(e => setError(String(e.message)))}>Sign out</button>
        </> : <>
          <h2 id="account-title">{tab === 'register' ? 'Create your account.' : tab === 'recover' ? 'Find your way back.' : 'Welcome, explorer.'}</h2>
          {tab === 'recover' ? <p className="account-card-copy">We will email you a secure reset link.</p> : <>
            <div className="account-tabs" role="tablist" aria-label="Account action">
              <button role="tab" aria-selected={tab === 'login'} disabled={phase !== 'idle'} onClick={() => changeTab('login')}>Sign in</button>
              <button role="tab" aria-selected={tab === 'register'} disabled={phase !== 'idle'} onClick={() => changeTab('register')}>Create account</button>
            </div>
            <button type="button" className="account-google" disabled={phase !== 'idle' || !googleReady} onClick={() => void googleSignIn()}><span className="account-google-mark" aria-hidden="true">G</span><span>Continue with Google</span><span aria-hidden="true">↗</span></button>
            {googleReady === false && <p className="account-provider-status">Google sign-in is being configured. You can use email below.</p>}
            <div className="account-divider"><span>or continue with email</span></div>
          </>}
          <form onSubmit={submit}>
            {tab === 'register' && <label>Explorer name<input name="displayName" autoComplete="nickname" required minLength={2} maxLength={50} placeholder="Your name in the worlds" disabled={phase !== 'idle'} /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={phase !== 'idle'} /></label>
            {tab !== 'recover' && <label>Password<input name="password" type="password" autoComplete={tab === 'register' ? 'new-password' : 'current-password'} required minLength={tab === 'register' ? 12 : 1} maxLength={128} placeholder={tab === 'register' ? 'At least 12 characters' : 'Your password'} disabled={phase !== 'idle'} /></label>}
            {tab === 'login' && <button type="button" className="account-forgot" disabled={phase !== 'idle'} onClick={() => changeTab('recover')}>Forgot password?</button>}
            {tab === 'register' && <label className="account-terms"><input name="terms" type="checkbox" required disabled={phase !== 'idle'} /><span>I agree to the <Link to="/terms">terms</Link> and have read the <Link to="/privacy">privacy notice</Link>.</span></label>}
            <button className="account-primary" disabled={phase !== 'idle'}>{phase === 'submitting' ? 'Connecting…' : phase === 'success' ? 'Opening your world…' : tab === 'register' ? 'Create account' : tab === 'recover' ? 'Send reset link' : 'Sign in & explore'}<span aria-hidden="true">↗</span></button>
            {tab === 'recover' && <button type="button" className="account-text-button" onClick={() => changeTab('login')}>Back to sign in</button>}
          </form>
          {tab !== 'recover' && <div className="account-provider-grid" aria-label="More sign-in providers coming soon">{futureProviders.map(provider => <button key={provider.name} className="account-provider-soon" disabled><span className="account-provider-mark" aria-hidden="true">{provider.mark}</span><span>{provider.name}</span><small lang="pl">wkrótce dostępne</small></button>)}</div>}
        </>}
        {notice && <p role="status" className="account-notice">{notice}</p>}
        {error && <p role="alert" className="account-error">{error}</p>}
        <details className="account-free-note"><summary>Start creating for free <span aria-hidden="true">+</span></summary><p>2 FAST generations per 24h, with downloads.<br />1 SLOW generation per day. SLOW downloads require a subscription.</p><p>Membership: $29.99/month · 1,500 credits.<br />50 credits per paid generation · 30 models per grant.</p><Link to="/account/credits">Explore membership →</Link></details>
      </section>
    </div>
    <BrandShowcase />
    <footer className="account-about"><span>BUILT FROM CURIOSITY.</span><p>WORLDIFAKT brings games, Earth observation and AI creation into one playable universe. Created for the OpenAI × Product Hunt challenge and born from a passion for AI. Have fun exploring our portals.</p><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer>
    {phase === 'success' && <span className="account-success-status" role="status">Signed in. Opening your world…</span>}
  </main>
}
