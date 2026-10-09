import { useEffect, useRef, useState } from 'react'
import { requestFailedHoldWaiver, type FailedHoldWaiverResponse } from '../lib/failedHoldWaiver'
import './GenerationFundingPage.css'

/** Standalone account operation: page entry reads only; no billing or recovery hooks. */
export default function FailedHoldWaiverPage() {
  const [snapshot, setSnapshot] = useState<FailedHoldWaiverResponse | null>(null)
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
      setError(apply ? 'The result is unconfirmed. The waiver may have completed. Read its status before taking further action.' : 'The status read timed out. No waiver was requested.')
    }, 20_000)
    try {
      const value = await requestFailedHoldWaiver(apply, controller.signal)
      if (state.mounted && epoch === state.epoch) { setSnapshot(value); setPhase('ready') }
    } catch (failure) {
      if (state.mounted && epoch === state.epoch) {
        setPhase('error')
        setError(apply ? 'The result is unconfirmed. Read its status before taking further action.' : failure instanceof Error ? failure.message : 'The waiver status is unavailable.')
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
    <h1>Approved failed-model point waiver</h1>
    <p>This one-time correction releases 1,000 points held by four specific failed model requests in the approved account. WORLDIFACT absorbs their API costs. Their failure history and provider usage records are preserved.</p>
    <p>The approved account snapshot is 1,190 total points, 1,000 held and 190 available. Releasing these holds leaves 1,190 available. The recorded $3.24 provider liability is a conservative upper bound, not a new charge or an invoice.</p>
    <p>This correction does not generate a model. Any further generation requires its own approved price and API limit.</p>
    {busy && <p role="status">{phase === 'applying' ? 'Recording the approved waiver once…' : 'Reading the current account and waiver status…'}</p>}
    {phase === 'stale' && <p role="status">This page was left or the session may have changed. Read the status again before taking action.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void request(false)}>Read waiver status · no changes</button>
    {snapshot?.status === 'preview' && <section aria-label="Approved waiver preview">
      <p>The approved account and all four held requests match. No waiver has been applied.</p>
      <button type="button" disabled={busy} onClick={() => void request(true)}>Release the approved 1,000 held points once</button>
    </section>}
    {snapshot && snapshot.status !== 'preview' && <section aria-label="Immutable waiver receipt">
      <h2>{snapshot.status === 'applied' ? 'Waiver recorded' : 'Waiver already recorded'}</h2>
      <p>The 1,000-point waiver was recorded at {new Date(snapshot.appliedAt!).toISOString()}. At that time, available points changed from 190 to 1,190 and held points from 1,000 to 0. These are the original audit values; later spending can change your current balance.</p>
      <p>The waiver cannot be applied again. No model was started by this action.</p>
      <a href="/shop">Open AI Shop</a>
    </section>}
  </main>
}
