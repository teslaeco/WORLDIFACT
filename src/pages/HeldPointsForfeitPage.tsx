import { useEffect, useRef, useState } from 'react'
import { requestHeldPointsForfeit, type HeldPointsForfeitResponse } from '../lib/heldPointsForfeit'
import './GenerationFundingPage.css'

/** Standalone account operation: page entry reads only; no billing or recovery hooks. */
export default function HeldPointsForfeitPage() {
  const [snapshot, setSnapshot] = useState<HeldPointsForfeitResponse | null>(null)
  const [phase, setPhase] = useState<'reading' | 'ready' | 'applying' | 'stale' | 'error'>('reading')
  const [error, setError] = useState('')
  const lifecycle = useRef({ epoch: 0, mounted: false, busy: false, controller: null as AbortController | null })
  async function request(apply: boolean) {
    const state = lifecycle.current
    if (!state.mounted || state.busy || apply && snapshot?.status !== 'preview') return
    state.busy = true
    const epoch = ++state.epoch, controller = new AbortController()
    state.controller = controller
    setSnapshot(null); setError(''); setPhase(apply ? 'applying' : 'reading')
    const timer = window.setTimeout(() => {
      if (!state.mounted || epoch !== state.epoch) return
      state.epoch++; state.busy = false; controller.abort(); setPhase('error')
      setError(apply ? 'The result is unconfirmed. The forfeiture may have completed. Read its status before taking further action.' : 'The status read timed out. No forfeiture was requested.')
    }, 20_000)
    try {
      const value = await requestHeldPointsForfeit(apply, controller.signal)
      if (state.mounted && epoch === state.epoch) { setSnapshot(value); setPhase('ready') }
    } catch (failure) {
      if (state.mounted && epoch === state.epoch) {
        setPhase('error')
        setError(apply ? 'The result is unconfirmed. Read its status before taking further action.' : failure instanceof Error ? failure.message : 'The forfeiture status is unavailable.')
      }
    } finally {
      window.clearTimeout(timer)
      if (epoch === state.epoch) { state.busy = false; state.controller = null }
    }
  }
  useEffect(() => {
    const state = lifecycle.current
    state.mounted = true
    const invalidate = () => {
      state.epoch++; state.busy = false; state.controller?.abort(); state.controller = null
      setSnapshot(null); setPhase('stale'); setError('')
    }
    const visibility = () => { if (document.visibilityState === 'hidden') invalidate() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate() }
    window.addEventListener('focus', invalidate); window.addEventListener('pagehide', invalidate); window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visibility)
    void request(false)
    return () => {
      state.mounted = false; state.epoch++; state.busy = false; state.controller?.abort()
      window.removeEventListener('focus', invalidate); window.removeEventListener('pagehide', invalidate); window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  const busy = phase === 'reading' || phase === 'applying'
  return <main className="generation-funding-page">
    <a href="/account/generation-funding">Read current generation funding</a>
    <h1>Close approved held points</h1>
    <p>Forfeit 1,000 points held by four failed requests, without a refund. Available points stay at 190; held points become zero.</p>
    <p>Request history, provider costs, subscriptions and private codes remain unchanged. No generation starts.</p>
    {busy && <p role="status">{phase === 'applying' ? 'Recording the approved forfeiture once…' : 'Reading the current account and forfeiture status…'}</p>}
    {phase === 'stale' && <p role="status">This page was left or the session may have changed. Read the status again before taking action.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void request(false)}>Read forfeiture status · no changes</button>
    {snapshot?.status === 'preview' && <section aria-label="Approved forfeiture preview">
      <p>The approved account and all four held requests match. No forfeiture has been applied.</p>
      <button type="button" disabled={busy} onClick={() => void request(true)}>Forfeit 1,000 held points · keep 190 available</button>
    </section>}
    {snapshot && snapshot.status !== 'preview' && <section aria-label="Immutable forfeiture receipt">
      <h2>{snapshot.status === 'applied' ? 'Forfeiture recorded' : 'Forfeiture already recorded'}</h2>
      <p>The 1,000-point forfeiture was recorded at {new Date(snapshot.appliedAt!).toISOString()}. At that time, available points stayed at 190, total points changed from 1,190 to 190 and held points from 1,000 to 0. These are the original audit values; later spending can change your current balance.</p>
      <p>The forfeiture cannot be applied again. No model was started by this action.</p>
      <a href="/account/credits">Open subscriptions</a>
    </section>}
  </main>
}
