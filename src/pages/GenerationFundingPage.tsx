import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fundingReadPath, loadGenerationFunding } from '../lib/loadGenerationFunding'
import type { GenerationFundingSnapshot } from '../lib/generationFunding'
import { recoverHeldPoints, type HeldPointsReview } from '../lib/recoverHeldPoints'
import './GenerationFundingPage.css'

const money = (cents: number | null) => cents === null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

/** Mounted outside App/account/billing hooks so page entry cannot run recovery. */
export default function GenerationFundingPage() {
  const [readRequest, setReadRequest] = useState<{ invoiceReferences: string[]; pendingAfter?: string } | null>({ invoiceReferences: [] })
  const [snapshot, setSnapshot] = useState<GenerationFundingSnapshot | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'stale' | 'error'>('loading')
  const [error, setError] = useState('')
  const [invoiceInput, setInvoiceInput] = useState('')
  const [reviewResult, setReviewResult] = useState<{ id: string; state: 'loading' | 'done' | 'error'; detail: string } | null>(null)
  const reviewOperation = useRef<AbortController | null>(null)
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timer = readRequest ? window.setTimeout(() => {
      if (!current) return
      current = false; controller.abort(); setSnapshot(null); setPhase('error'); setError('The read timed out. No recovery or generation was requested.')
    }, 20_000) : undefined
    const invalidate = () => {
      current = false; controller.abort(); window.clearTimeout(timer)
      reviewOperation.current?.abort(); reviewOperation.current = null; setReviewResult(null)
      setSnapshot(null); setPhase('stale'); setError(''); setInvoiceInput(''); setReadRequest(null)
    }
    const visibility = () => { if (document.visibilityState === 'hidden') invalidate() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate() }
    window.addEventListener('focus', invalidate)
    window.addEventListener('pagehide', invalidate)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visibility)
    if (readRequest) void loadGenerationFunding(controller.signal, undefined, { storedEvidence: true, ...readRequest }).then(value => {
      if (current) { setSnapshot(value); setPhase('ready'); setError('') }
    }, failure => {
      if (current) { setSnapshot(null); setPhase('error'); setError(failure instanceof Error ? failure.message : 'The read-only snapshot is unavailable.') }
    }).finally(() => window.clearTimeout(timer))
    return () => {
      current = false; controller.abort(); window.clearTimeout(timer)
      reviewOperation.current?.abort(); reviewOperation.current = null
      window.removeEventListener('focus', invalidate); window.removeEventListener('pagehide', invalidate); window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [readRequest])
  const readAgain = () => {
    const references = invoiceInput.trim() ? invoiceInput.trim().split(/[\s,]+/) : []
    try { fundingReadPath({ storedEvidence: true, invoiceReferences: references }) }
    catch (failure) { setSnapshot(null); setPhase('error'); setError(failure instanceof Error ? failure.message : 'Invoice references could not be verified.'); return }
    setReadRequest({ invoiceReferences: references }); setSnapshot(null); setPhase('loading'); setError('')
    setReviewResult(null)
  }
  const checkHeldRequest = async (item: HeldPointsReview) => {
    if (reviewOperation.current || phase !== 'ready') return
    const controller = new AbortController(); reviewOperation.current = controller
    setReviewResult({ id: item.id, state: 'loading', detail: 'Checking this original request. No new generation is started.' })
    try {
      const result = await recoverHeldPoints(fetch, item, controller.signal)
      if (reviewOperation.current === controller) setReviewResult({ id: item.id, state: 'done', detail: result.detail })
    } catch (failure) {
      if (reviewOperation.current === controller) setReviewResult({ id: item.id, state: 'error', detail: failure instanceof Error ? failure.message : 'This same request could not be verified. Keep its ID for review.' })
    } finally { if (reviewOperation.current === controller) reviewOperation.current = null }
  }
  const checkInvoices = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); readAgain() }
  return <main className="generation-funding-page">
    <a href="/account">WORLDIFACT account</a>
    <h1>Generation funding</h1>
    <p>Opening this page only reads your account. It does not start a model or payment. An explicit check of a saved request reads that same job and may record its verified settlement; it never starts a replacement.</p>
    {phase === 'loading' && <p role="status">Reading the current signed-in account…</p>}
    {phase === 'stale' && <p role="status">The page was left or the active account may have changed. Read again to inspect the current account.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={phase === 'loading'} onClick={readAgain}>Read current funding · no changes</button>
    <form onSubmit={checkInvoices} aria-label="Read stored invoice records">
      <label htmlFor="funding-invoice-references">Optional invoice IDs · this signed-in account only</label>
      <input id="funding-invoice-references" value={invoiceInput} maxLength={400} autoComplete="off" spellCheck={false}
        disabled={phase === 'loading'} placeholder="One or two Stripe invoice IDs, starting with in_"
        onChange={event => { setInvoiceInput(event.target.value); setSnapshot(null); setPhase('stale'); setError('') }} />
      <p>Separate two IDs with a space or comma. This checks stored credit records only; it does not contact Stripe, recover credits or charge a payment.</p>
      <button type="submit" disabled={phase === 'loading'}>Check invoice records · read only</button>
    </form>
    {snapshot && <>
      <dl>
        <dt>Customer points</dt><dd>{snapshot.customerPoints.balance ?? 'Unknown'}</dd>
        <dt>Points held for jobs or cost review</dt><dd>{snapshot.customerPoints.held ?? 'Unknown'}</dd>
        <dt>Available customer points</dt><dd>{snapshot.customerPoints.available ?? 'Unknown'}</dd>
        <dt>Recorded unreserved legacy API funding</dt><dd>{money(snapshot.providerBudget.unreservedCents)} ({snapshot.providerBudget.status})</dd>
        <dt>Legacy Astra blueprint reserve requirement</dt><dd>{money(snapshot.ordinaryAstraMinimumCents.blueprint)}</dd>
        <dt>Legacy Astra/Blender reserve requirement</dt><dd>{money(snapshot.ordinaryAstraMinimumCents.unpricedDetailed)}</dd>
      </dl>
      <p>The recorded reserve is not an OpenAI invoice or a generation quote. New requests admitted under the paid-membership points policy use available points without this separate account reserve. Earlier jobs retain their original funding terms. This read does not verify your current generation policy, service readiness or a separate support allowance; check generation availability in the Shop.</p>
      <p>Held points can include failed requests awaiting verified API cost. They are not a final charge or refund and cannot be spent on another request. If authoritative final usage is unavailable, manual cost review is required; rereading an unchanged cost-limit receipt does not resolve that uncertainty. Other requests can use the remaining available points.</p>
      {snapshot.pendingCostReviews && <section aria-labelledby="pending-cost-reviews-title">
        <h2 id="pending-cost-reviews-title">Account requests with held points</h2>
        <p>These references come from your signed-in account, even if this browser no longer has their receipts. Reading this list does not retry generation or settle charges. Keep the request ID for status or manual cost review.</p>
        {snapshot.pendingCostReviews.items.map(item => <div key={item.id}><p>Request ID: {item.id}</p><p>At last account read: {item.channel === 'studio' ? 'Detailed model' : 'Blueprint'} · {item.model.toUpperCase()} · {item.heldPoints} points held · {item.state === 'pending-cost' ? 'Generation ended · manual cost review required' : 'Generation result not yet settled'} · <time dateTime={new Date(item.at).toISOString()}>{new Date(item.at).toISOString()}</time></p>
          <button type="button" disabled={phase !== 'ready' || reviewResult?.state === 'loading'} onClick={() => void checkHeldRequest(item)}>Check this request · no new generation</button>
          {reviewResult?.id === item.id && <p role="status">{reviewResult.detail}{reviewResult.state === 'done' && ' Read current funding again to refresh the account snapshot.'}</p>}
        </div>)}
        <p>{snapshot.pendingCostReviews.scanStatus === 'unavailable' ? 'Account review references could not be read. Their absence is not established.' : snapshot.pendingCostReviews.hasMore ? 'More account records remain. Read the next page to continue.' : snapshot.pendingCostReviews.items.length ? 'This account review scan has reached its end.' : 'No pending cost reviews were found on this page.'}</p>
        {snapshot.pendingCostReviews.hasMore && <button type="button" disabled={phase === 'loading'} onClick={() => {
          const pendingAfter = snapshot.pendingCostReviews?.nextCursor
          if (!pendingAfter) return
          setReadRequest({ invoiceReferences: readRequest?.invoiceReferences ?? [], pendingAfter }); setSnapshot(null); setPhase('loading'); setError(''); setReviewResult(null)
        }}>Read next review page · no changes</button>}
      </section>}
      {snapshot.paidMembershipLiability && <section aria-labelledby="paid-points-liability-title">
        <h2 id="paid-points-liability-title">Paid-membership model liability · read only</h2>
        <p>{snapshot.paidMembershipLiability.jobs} points-funded jobs in this scan; {snapshot.paidMembershipLiability.unresolvedJobs} dispatched jobs still lack confirmed bounded terminal usage. Their full recorded model limits remain included until that usage is verified.</p>
        <p>Recorded maximum API liability across these jobs: {money(snapshot.paidMembershipLiability.maximumLiabilityCents)}. This is a conservative estimate, not an API invoice, customer points charge, account reserve or refundable amount. Jobs not yet dispatched contribute no API liability. {snapshot.jobs.partial ? 'The scan is incomplete.' : 'The bounded scan completed.'}</p>
      </section>}
      {snapshot.storedEvidence ? <section aria-labelledby="stored-credit-records-title">
        <h2 id="stored-credit-records-title">Stored purchase evidence · read only</h2>
        <p>Stripe account link: {snapshot.storedEvidence.stripeCustomerStatus !== 'known' ? 'unverifiable' : snapshot.storedEvidence.stripeCustomerLinked ? 'present' : 'not recorded'}.</p>
        <p>Invoice-credit records scanned: {snapshot.storedEvidence.invoiceGrants.scanned}; scan status: {snapshot.storedEvidence.invoiceGrants.scanStatus}.
          {' '}{snapshot.storedEvidence.invoiceGrants.partial ? 'The scan is incomplete.' : 'The bounded scan completed.'}</p>
        <p>Present: {snapshot.storedEvidence.invoiceGrants.states.present}; reversed: {snapshot.storedEvidence.invoiceGrants.states.revoked}; unverifiable: {snapshot.storedEvidence.invoiceGrants.states.unverifiable}.</p>
        <p>Recorded awards: {snapshot.storedEvidence.invoiceGrants.creditedPoints} points. Recorded reversals: {snapshot.storedEvidence.invoiceGrants.revokedPoints} points. These historical totals are not your remaining balance or independent proof of payment.</p>
        {snapshot.storedEvidence.requestedInvoices.map(record => <div key={record.invoiceReference}>
          <h3>{record.invoiceReference}</h3>
          <p>{record.state === 'present' ? 'Stored credit record present.' : record.state === 'missing' ? 'No stored credit record for this invoice in the current account.' : record.state === 'revoked' ? 'A reversed credit record exists. It is not a missing grant.' : 'This invoice record could not be verified. Its absence is not established.'}</p>
          {record.creditedPoints !== null && <p>Recorded award: {record.creditedPoints} points. Recorded reversal: {record.revokedPoints} points. Subscription link: {record.subscriptionLinked ? 'present' : 'not recorded'}.</p>}
        </div>)}
        <h3>Unknown-amount record provenance</h3>
        <p>{snapshot.storedEvidence.unknownAmountProvenance.classifiedRecords} of {snapshot.storedEvidence.unknownAmountProvenance.records} records have recognized stored metadata; {snapshot.storedEvidence.unknownAmountProvenance.unclassifiedRecords} remain unclassified. Recorded point costs and dates do not establish actual API spending or refundable funding.</p>
        <pre aria-label="Read-only stored record provenance">{JSON.stringify(snapshot.storedEvidence.unknownAmountProvenance.groups, null, 2)}</pre>
      </section> : <p>Stored invoice evidence is unavailable in this response. No missing credit record is inferred.</p>}
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
