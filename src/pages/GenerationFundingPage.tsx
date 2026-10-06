import { useEffect, useState } from 'react'
import { loadGenerationFunding } from '../lib/loadGenerationFunding'
import type { GenerationFundingSnapshot } from '../lib/generationFunding'
import './GenerationFundingPage.css'

const money = (cents: number | null) => cents === null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

/** Mounted outside App/account/billing hooks so page entry cannot run recovery. */
export default function GenerationFundingPage() {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<GenerationFundingSnapshot | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'stale' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (!current) return
      current = false; controller.abort(); setSnapshot(null); setPhase('error'); setError('The read timed out. No recovery or generation was requested.')
    }, 20_000)
    const invalidate = () => {
      current = false; controller.abort(); window.clearTimeout(timer)
      setSnapshot(null); setPhase('stale'); setError('')
    }
    const visibility = () => { if (document.visibilityState === 'hidden') invalidate() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate() }
    window.addEventListener('focus', invalidate)
    window.addEventListener('pagehide', invalidate)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visibility)
    void loadGenerationFunding(controller.signal).then(value => {
      if (current) { setSnapshot(value); setPhase('ready'); setError('') }
    }, failure => {
      if (current) { setSnapshot(null); setPhase('error'); setError(failure instanceof Error ? failure.message : 'The read-only snapshot is unavailable.') }
    }).finally(() => window.clearTimeout(timer))
    return () => {
      current = false; controller.abort(); window.clearTimeout(timer)
      window.removeEventListener('focus', invalidate); window.removeEventListener('pagehide', invalidate); window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [revision])
  const readAgain = () => { setSnapshot(null); setPhase('loading'); setError(''); setRevision(value => value + 1) }
  return <main className="generation-funding-page">
    <a href="/account">WORLDIFACT account</a>
    <h1>Generation funding</h1>
    <p>This page only reads your account. It does not start a model, recover funds, open a payment or change your points.</p>
    {phase === 'loading' && <p role="status">Reading the current signed-in account…</p>}
    {phase === 'stale' && <p role="status">The page was left or the active account may have changed. Read again to inspect the current account.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={phase === 'loading'} onClick={readAgain}>Read current funding · no changes</button>
    {snapshot && <>
      <dl>
        <dt>Customer points</dt><dd>{snapshot.customerPoints.balance ?? 'Unknown'}</dd>
        <dt>Points held for jobs</dt><dd>{snapshot.customerPoints.held ?? 'Unknown'}</dd>
        <dt>Available customer points</dt><dd>{snapshot.customerPoints.available ?? 'Unknown'}</dd>
        <dt>Recorded unreserved API funding</dt><dd>{money(snapshot.providerBudget.unreservedCents)} ({snapshot.providerBudget.status})</dd>
        <dt>Ordinary Astra blueprint requirement</dt><dd>{money(snapshot.ordinaryAstraMinimumCents.blueprint)}</dd>
        <dt>Ordinary Astra/Blender requirement</dt><dd>{money(snapshot.ordinaryAstraMinimumCents.unpricedDetailed)}</dd>
      </dl>
      <p>Points and API funding are separate. The recorded pool is not an OpenAI invoice. These ordinary requirements do not evaluate a separate support allowance or authorize generation.</p>
      {snapshot.providerBudget.status === 'uninitialized' && <p>The provider record is absent. Its legacy calculation would be {money(snapshot.providerBudget.legacyDerivedFallbackCents)}; this read has not created it.</p>}
      {snapshot.jobs.blueprintOutputAdjustment && <section aria-labelledby="blueprint-usage-review-title">
        <h2 id="blueprint-usage-review-title">Stored blueprint usage review · read only</h2>
        <p>{snapshot.jobs.blueprintOutputAdjustment.candidates} verified records may support an additional {money(snapshot.jobs.blueprintOutputAdjustment.potentialCents)} of unused API reserve. No funds have been returned by this read.</p>
        <p>Checked {snapshot.jobs.blueprintOutputAdjustment.checked} older reconciliation records; {snapshot.jobs.blueprintOutputAdjustment.unavailable} could not be verified. {snapshot.jobs.blueprintOutputAdjustment.partial ? 'This assessment is incomplete.' : 'The bounded assessment completed.'} Unverifiable records remain unknown.</p>
        <p>This compares stored final output usage with the original conservative reservation and historical model rates. It is not a provider invoice, an applied refund or approval to start another model.</p>
      </section>}
      <h2>Reservation evidence</h2>
      <p>Scanned {snapshot.jobs.scanned} records; scan status: {snapshot.jobs.scanStatus}. {snapshot.jobs.partial ? 'The scan is incomplete.' : 'The bounded scan completed.'} Amounts below cover recognized evidence in this scan only. Unknown records are not assumed free, spent, or refundable.</p>
      <pre aria-label="Read-only reservation evidence">{JSON.stringify(snapshot.jobs, null, 2)}</pre>
      <p>Original support claim present: {snapshot.supportGrantClaims.originalRecordPresent ? 'yes' : 'no'}. Additional support claim present: {snapshot.supportGrantClaims.supplementalRecordPresent ? 'yes' : 'no'}. Presence does not prove current availability.</p>
    </>}
  </main>
}
