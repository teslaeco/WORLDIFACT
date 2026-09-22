import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { accountRequest, useAccount } from '../lib/account'
import WorldifactLogo from '../components/WorldifactLogo'
import './AccountPage.css'

const CosmicLoginScene = lazy(() => import('../components/CosmicLoginScene'))
type Tab = 'login' | 'register' | 'recover'

export default function AccountPage() {
  const account = useAccount(), navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [notice, setNotice] = useState(''), [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function changeTab(next: Tab) { if (phase !== 'idle') return; setTab(next); setError(''); setNotice('') }
  function enter() {
    setPhase('success')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(() => navigate('/', { replace: true }), reduced ? 100 : 2800)
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
      <Link to="/" className="account-brand"><WorldifactLogo /><span>WORLDIFACT<small>AI WORLDS MADE REAL</small></span></Link>
      <Link to="/" className="account-guest">Explore as a guest <span aria-hidden="true">↗</span></Link>
    </header>
    <div className="account-layout">
      <section className="account-hero" aria-label="WORLDIFACT universe">
        <span className="account-kicker">FIVE WORLDS · ONE IDENTITY</span>
        <h1>Your next world<br />starts here<span>.</span></h1>
        <p>Play. Create. Bring your ideas to life.</p>
        <div className="account-scene-caption"><span>THE WORLDIFACT CORE</span><small>Original FORGE sculpture · living light</small></div>
      </section>
      <section className="account-card" aria-labelledby="account-title">
        <span className="account-card-eyebrow">WELCOME TO WORLDIFACT</span>
        {account.user ? <>
          <h2 id="account-title">Welcome back,<br />{account.user.displayName || 'explorer'}.</h2>
          <p className="account-card-copy">Your WORLDIFACT and Chess Cube identity is ready.</p>
          <button className="account-primary" disabled={phase !== 'idle'} onClick={enter}>Enter the world <span aria-hidden="true">↗</span></button>
          <Link className="account-secondary" to="/account/credits">View credits & membership</Link>
          <button className="account-text-button" disabled={phase !== 'idle'} onClick={() => void account.signOut().catch(e => setError(String(e.message)))}>Sign out</button>
        </> : <>
          <h2 id="account-title">{tab === 'register' ? 'Create your identity.' : tab === 'recover' ? 'Find your way back.' : 'Welcome, explorer.'}</h2>
          <p className="account-card-copy">{tab === 'recover' ? 'We will email you a secure reset link.' : 'One account for WORLDIFACT and Chess Cube 512 AI.'}</p>
          {tab !== 'recover' && <div className="account-tabs" role="tablist" aria-label="Account action">
            <button role="tab" aria-selected={tab === 'login'} disabled={phase !== 'idle'} onClick={() => changeTab('login')}>Sign in</button>
            <button role="tab" aria-selected={tab === 'register'} disabled={phase !== 'idle'} onClick={() => changeTab('register')}>Create account</button>
          </div>}
          <form onSubmit={submit}>
            {tab === 'register' && <label>Explorer name<input name="displayName" autoComplete="nickname" required minLength={2} maxLength={50} placeholder="Your name in the worlds" disabled={phase !== 'idle'} /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={phase !== 'idle'} /></label>
            {tab !== 'recover' && <label>Password<input name="password" type="password" autoComplete={tab === 'register' ? 'new-password' : 'current-password'} required minLength={tab === 'register' ? 12 : 1} maxLength={128} placeholder={tab === 'register' ? 'At least 12 characters' : 'Your password'} disabled={phase !== 'idle'} /></label>}
            {tab === 'login' && <button type="button" className="account-forgot" disabled={phase !== 'idle'} onClick={() => changeTab('recover')}>Forgot password?</button>}
            {tab === 'register' && <label className="account-terms"><input name="terms" type="checkbox" required disabled={phase !== 'idle'} /><span>I agree to the <Link to="/terms">terms</Link> and have read the <Link to="/privacy">privacy notice</Link>.</span></label>}
            <button className="account-primary" disabled={phase !== 'idle'}>{phase === 'submitting' ? 'Connecting…' : phase === 'success' ? 'Opening your world…' : tab === 'register' ? 'Create account' : tab === 'recover' ? 'Send reset link' : 'Sign in & explore'}<span aria-hidden="true">↗</span></button>
            {tab === 'recover' && <button type="button" className="account-text-button" onClick={() => changeTab('login')}>Back to sign in</button>}
          </form>
          <div className="account-chess-note"><span aria-hidden="true">♜</span><p>Already play Chess Cube?<br /><strong>Use your existing email and password.</strong></p></div>
        </>}
        {notice && <p role="status" className="account-notice">{notice}</p>}
        {error && <p role="alert" className="account-error">{error}</p>}
        <div className="account-free-note"><span>FREE TO EXPLORE</span><p>2 FAST generations per 24h, with downloads.<br />1 SLOW generation per day. SLOW downloads require a subscription.</p><Link to="/account/credits">Explore membership →</Link></div>
      </section>
    </div>
    <footer className="account-about"><span>BUILT FROM CURIOSITY.</span><p>WORLDIFACT is a playable universe of games, Earth observation and AI creation. Created for the OpenAI × Product Hunt challenge, born from a passion for AI and a belief that ideas can become something real. Enjoy your journey through our portals.</p><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer>
    {phase === 'success' && <span className="account-success-status" role="status">Signed in. Opening the portal world…</span>}
  </main>
}
