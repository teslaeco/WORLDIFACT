import { useEffect, useRef, useState } from 'react'
import { useAccount } from '../lib/account'
import { requestOwnerReserveAdjustment } from '../lib/ownerReserveAdjustmentClient'
import type { OwnerReserveAdjustmentResponse } from '../lib/ownerReserveAdjustment'
import './GenerationFundingPage.css'

export default function OwnerReserveAdjustmentPage() {
  const { user, loading } = useAccount()
  if (loading) return <main className="generation-funding-page"><p role="status">Checking the current account…</p></main>
  if (!user) return <main className="generation-funding-page"><h1>One-time reserve adjustment</h1><p>Sign in to the approved account to continue.</p><a href="/login">Sign in</a></main>
  return <OwnerReserveAdjustmentContent key={user.id} />
}

export function OwnerReserveAdjustmentContent() {
  const [snapshot, setSnapshot] = useState<OwnerReserveAdjustmentResponse | null>(null)
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
      setError(apply ? 'The result is unconfirmed. The adjustment may have completed. Read its status; do not repeat the application.' : 'The read timed out. No adjustment was requested.')
    }, 20_000)
    try {
      const value = await requestOwnerReserveAdjustment(apply, controller.signal)
      if (state.mounted && epoch === state.epoch) { setSnapshot(value); setPhase('ready') }
    } catch (failure) {
      if (state.mounted && epoch === state.epoch) { setPhase('error'); setError(apply ? 'The result is unconfirmed. Read its status before any further action.' : failure instanceof Error ? failure.message : 'The adjustment status is unavailable.') }
    } finally { window.clearTimeout(timer); if (epoch === state.epoch) { state.busy = false; state.controller = null } }
  }
  useEffect(() => {
    const state = lifecycle.current
    state.mounted = true
    const invalidate = () => { state.epoch++; state.busy = false; state.controller?.abort(); state.controller = null; setSnapshot(null); setPhase('stale'); setError('') }
    const visibility = () => { if (document.visibilityState === 'hidden') invalidate() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate() }
    window.addEventListener('focus', invalidate); window.addEventListener('pagehide', invalidate); window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visibility)
    // Entry is only a status read. Applying always requires the explicit button.
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
    <h1>One-time reserve adjustment</h1>
    <p>Approved allocation: $1.12 USD of internal API reserve, once, for this account only. This action adds no points, creates no subscription and makes no card charge.</p>
    <p>The approved baseline is 1,440 points, 0 held points and $0.63 reserve. It must still match exactly. The allocation raises the reserve to $1.75 and does not reset any earlier allowance.</p>
    <p>Applying this allocation does not start a model. One separately approved Astra test may use up to $1.75 of API funding and 250 points on success. This is not unlimited or ongoing funding.</p>
    {busy && <p role="status">{phase === 'applying' ? 'Applying the single approved allocation. Do not repeat the action…' : 'Reading adjustment status…'}</p>}
    {phase === 'stale' && <p role="status">This page was left or the session may have changed. Read the status again before taking action.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void request(false)}>Read adjustment status · no changes</button>
    {snapshot?.status === 'preview' && <section aria-label="Approved adjustment preview">
      <p>The approved baseline and stored payment bindings match. No allocation has been applied.</p>
      <button type="button" disabled={busy} onClick={() => void request(true)}>Apply approved $1.12 reserve once</button>
    </section>}
    {snapshot && snapshot.status !== 'preview' && <section aria-label="Immutable adjustment receipt">
      <h2>{snapshot.status === 'applied' ? 'Adjustment recorded' : 'Adjustment already recorded'}</h2>
      <p>The one-time $1.12 allocation was recorded at {new Date(snapshot.appliedAt!).toISOString()}. Its original reserve change was $0.63 → $1.75; points stayed 1,440 with 0 held. These are audit values, not a fresh balance.</p>
      <p>No model was started by this action. The allocation cannot be applied again.</p>
      <a href="/shop">Open AI Shop</a>
    </section>}
  </main>
}
