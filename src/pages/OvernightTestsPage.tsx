/* eslint-disable react/refs -- Invalidate owner-bound async work during the account transition render, before effect cleanup. */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { exportBlueprintGlb } from '../lib/blueprintExport'
import { inspectGLB } from '../lib/glb'
import { OVERNIGHT_PANEL_EXPIRES, OVERNIGHT_PANEL_SLOTS, OvernightTestClient, type OvernightPanelRow, type OvernightPanelStatus } from '../lib/overnightTestClient'
import { formatStudioGenerationDuration } from '../lib/studioProtocol'
import './OvernightTestsPage.css'

type Slot = typeof OVERNIGHT_PANEL_SLOTS[number]
type Operation = 'status' | 'start' | 'recover' | 'download'
type Session = {
  client: OvernightTestClient
  active: () => boolean
  busy: boolean
  status: OvernightPanelStatus | null
  urls: Set<string>
  timers: Set<number>
}
const ATTEMPT_LIMITS = { 'detailed-astra': 2, 'blueprint-sol': 1, 'blueprint-luna': 1 } as const
const money = (cents: number) => `USD ${(cents / 100).toFixed(2)}`
const expired = (status: OvernightPanelStatus, now: number) => now >= Math.min(Date.parse(status.expiresAt), Date.parse(OVERNIGHT_PANEL_EXPIRES))
const canStart = (status: OvernightPanelStatus, slot: Slot, now: number) => status.available && !expired(status, now) &&
  status.remainingCents >= slot.capCents && status.attempts[slot.workflow] < ATTEMPT_LIMITS[slot.workflow]

export default function OvernightTestsPage() {
  const { user, loading } = useAccount()
  const owner = !loading ? user?.id ?? null : null
  const lifecycle = useRef({ owner, epoch: 0 })
  // Invalidate old actions during render, before effect cleanup, including a
  // same-account session refresh. Late async results cannot cross this boundary.
  if (lifecycle.current.owner !== owner) {
    lifecycle.current.owner = owner
    lifecycle.current.epoch++
  }
  const epoch = lifecycle.current.epoch
  const sessionRef = useRef<Session | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<OvernightPanelStatus | null>(null)
  const [rows, setRows] = useState<OvernightPanelRow[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<Operation | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now)
  const current = session?.active() ? session : null
  const verified = current && status ? status : null
  const hasExpired = verified ? expired(verified, now) : false
  const validPrompt = prompt.trim().length >= 3 && prompt.trim().length <= 2000

  async function refresh(scope: Session | null = sessionRef.current) {
    if (!scope?.active() || scope.busy) return
    scope.busy = true
    scope.status = null
    setStatus(null)
    setBusy('status')
    setError('')
    setNotice('')
    try {
      const next = await scope.client.status()
      if (!scope.active()) return
      const nextRows = scope.client.rows()
      scope.status = next
      setStatus(next)
      setRows(nextRows)
      setNow(Date.now())
    } catch {
      if (scope.active()) setError('The owner-only test budget could not be verified. Sign in with the approved account, then refresh. No paid request was sent by this budget check.')
    } finally {
      scope.busy = false
      if (scope.active()) setBusy(null)
    }
  }

  // Synchronize the imperative receipt controller and storage availability with the account lifecycle.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!owner) return
    let closed = false
    const active = () => !closed && lifecycle.current.owner === owner && lifecycle.current.epoch === epoch
    let scope: Session
    try {
      scope = { client: new OvernightTestClient(window.localStorage, fetch, owner, active), active, busy: false, status: null, urls: new Set(), timers: new Set() }
    } catch {
      setError('This browser cannot preserve test receipts. Enable local storage before starting any paid test.')
      return () => { closed = true }
    }
    sessionRef.current = scope
    setSession(scope)
    setStatus(null)
    setRows([])
    setPrompt('')
    setNotice('')
    // Opening/reloading this page only reads the authenticated budget. Recovery
    // and every paid start require a separate explicit button press.
    void refresh(scope)
    const timer = window.setInterval(() => { if (active()) setNow(Date.now()) }, 1000)
    return () => {
      closed = true
      if (sessionRef.current === scope) sessionRef.current = null
      window.clearInterval(timer)
      for (const timer of scope.timers) window.clearTimeout(timer)
      for (const url of scope.urls) URL.revokeObjectURL(url)
      scope.timers.clear()
      scope.urls.clear()
    }
  }, [owner, epoch])

  async function operate(kind: Exclude<Operation, 'status'>, slot: Slot) {
    const scope = sessionRef.current
    if (!scope?.active() || scope.busy || !scope.status) return
    let savedRows: OvernightPanelRow[]
    try { savedRows = scope.client.rows() }
    catch {
      scope.status = null
      setStatus(null)
      setError('Saved test receipts could not be read. Restore browser storage access before continuing; no new request was started.')
      return
    }
    const row = savedRows.find(value => value.slot === slot.id)
    if (kind === 'start' && savedRows.some(value => value.state === 'pending')) return
    // This clock read runs only in an explicit event, including a stale pre-expiry handler.
    // eslint-disable-next-line react/purity
    if (kind === 'start' && (!validPrompt || !canStart(scope.status, slot, Date.now()) || (row && row.state !== 'empty'))) return
    if (kind !== 'start' && (!row?.id || row.state === 'empty')) return
    if (kind === 'download' && row?.state !== 'completed') return
    scope.busy = true
    setBusy(kind)
    setError('')
    setNotice('')
    try {
      if (kind === 'start') {
        await scope.client.start(slot.id, prompt.trim())
        if (!scope.active()) return
        setRows(scope.client.rows())
        // Refresh the displayed committed total after the explicit start. This
        // is a read, and cannot retry or replace the submitted request.
        scope.status = null
        setStatus(null)
        const next = await scope.client.status()
        if (!scope.active()) return
        scope.status = next
        setStatus(next)
      } else if (kind === 'recover') {
        await scope.client.recover(slot.id)
      } else {
        const blob = slot.workflow === 'detailed-astra' ? await scope.client.download(slot.id)
          : row?.result ? new Blob([await exportBlueprintGlb(row.result.blueprint)], { type: 'model/gltf-binary' }) : null
        if (!scope.active()) return
        if (!blob) throw new Error('No model is available.')
        const bytes = await blob.arrayBuffer()
        if (!scope.active()) return
        inspectGLB(bytes)
        const url = URL.createObjectURL(blob)
        scope.urls.add(url)
        const link = document.createElement('a')
        link.href = url
        link.download = `WORLDIFACT-overnight-${slot.id}${slot.workflow === 'detailed-astra' ? '-original' : '-procedural-GAME'}.glb`
        try {
          document.body.appendChild(link)
          link.click()
        } finally {
          link.remove()
          const timer = window.setTimeout(() => { URL.revokeObjectURL(url); scope.urls.delete(url); scope.timers.delete(timer) }, 10_000)
          scope.timers.add(timer)
        }
        setNotice('The GLB download was requested. Keep the original file and request ID for review. Structural validation is not visual or manufacturing approval.')
      }
    } catch {
      if (scope.active()) setError(kind === 'download'
        ? 'The same model could not be downloaded or did not pass the local GLB check. Keep its request ID and recover the same request. No new generation was started.'
        : kind === 'recover' ? 'The same request could not be checked. Its saved receipt is preserved. Use Recover same request again; this does not submit a replacement.'
          : 'The paid start or its confirmation could not be completed. Check the saved slot and refresh the budget, then recover the same request if present. No automatic retry was made.')
    } finally {
      scope.busy = false
      if (scope.active()) {
        try { setRows(scope.client.rows()) }
        catch {
          scope.status = null
          setStatus(null)
          setError('Saved test receipts could not be read. Restore browser storage access and refresh the test budget before continuing.')
        }
        setNow(Date.now())
        setBusy(null)
      }
    }
  }

  return <main className="portal-page overnight-tests">
    <header className="portal-header">
      <Link to="/account" className="brand">WORLDIFACT<span>← Back to account</span></Link>
      <nav aria-label="Test panel navigation"><Link to="/account/models">My models</Link><Link to="/shop">Ordinary generator</Link></nav>
    </header>
    <section className="overnight-intro" aria-labelledby="overnight-title">
      <p className="overnight-eyebrow">OWNER ONLY · TEMPORARY PAID TESTS</p>
      <h1 id="overnight-title">One-time generation tests</h1>
      <p>This isolated panel uses your existing signed-in session. It has no API key or access-code field.</p>
      <p className="overnight-warning">Testing only. Opening, refreshing or returning to this page never starts a paid generation. Ordinary generator funding is unchanged and the ordinary generator may remain unavailable.</p>
      <p>Four fixed slots: 2 detailed ASTRA attempts, 1 SOL blueprint and 1 LUNA blueprint. Maximum matrix commitment: USD 3.95 within the USD 4.00 ceiling. Failed or unused commitments are never recycled.</p>
      <p>The technical cutoff for new paid tests is <time dateTime={OVERNIGHT_PANEL_EXPIRES}>6 October 2026 at 12:00 UTC</time>. This is an implementation cutoff, not a deadline specified by the user. Tests stop earlier when the required checks finish or the budget is committed; the window never extends automatically.</p>
    </section>
    {loading ? <p role="status">Checking your signed-in account…</p> : !user ? <section className="overnight-gate">
      <h2>Sign in to check owner access</h2>
      <p>Only the approved owner can view test receipts and use this temporary pool.</p>
      <Link to="/login?next=%2Faccount%2Fovernight-tests">Sign in →</Link>
    </section> : <>
      <div className="overnight-refresh"><button type="button" onClick={() => { void refresh() }} disabled={!current || !!busy}>Refresh test budget</button>
        {busy && <span role="status">{busy === 'status' ? 'Checking the test budget…' : busy === 'start' ? 'Submitting this explicit paid attempt…' : busy === 'recover' ? 'Reading the same saved request…' : 'Checking the same GLB for download…'}</span>}
      </div>
      {error && <p className="overnight-error" role="alert">{error}</p>}
      {notice && current && <p role="status">{notice}</p>}
      {verified && <>
        <section className="overnight-budget" aria-label="Verified test budget">
          <h2>{hasExpired ? 'Paid test window expired' : verified.available ? 'Owner test budget verified' : 'New paid tests unavailable'}</h2>
          <dl><div><dt>Ceiling</dt><dd>{money(verified.totalCents)}</dd></div><div><dt>Committed</dt><dd>{money(verified.committedCents)}</dd></div><div><dt>Remaining ceiling</dt><dd>{money(verified.remainingCents)}</dd></div></dl>
          <p>Attempts committed: ASTRA {verified.attempts['detailed-astra']}/2 · SOL {verified.attempts['blueprint-sol']}/1 · LUNA {verified.attempts['blueprint-luna']}/1.</p>
          <p>{hasExpired || !verified.available ? 'New starts are disabled. Saved requests can still be explicitly recovered and downloaded when available.' : 'Each Start paid button commits one separate slot. Existing slots cannot be reset or replaced.'}</p>
          <p>Amounts are provider-spend ceilings, not proof of actual cost. Points shown below are the workflow price; the server remains authoritative for account admission.</p>
        </section>
        {!hasExpired && verified.available && <div className="overnight-prompt">
          <label htmlFor="overnight-prompt">Description for the next explicit test</label>
          <textarea id="overnight-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} minLength={3} maxLength={2000} disabled={!!busy} rows={5} aria-describedby="overnight-prompt-help" />
          <p id="overnight-prompt-help">Use 3–2,000 characters. This description applies only when you press a Start paid button. Changing it does not alter a saved request.</p>
        </div>}
        {rows.some(row => row.state === 'pending') && <p role="status">Recover the pending saved request before starting another slot. Recovery only reads that same request.</p>}
        <div className="overnight-slots">
          {OVERNIGHT_PANEL_SLOTS.map(slot => {
            const row = rows.find(value => value.slot === slot.id)
            const state = row?.state ?? 'empty'
            return <article key={slot.id} className="overnight-slot" aria-labelledby={`overnight-${slot.id}`}>
              <p className="overnight-eyebrow">{slot.workflow === 'detailed-astra' ? 'DETAILED ASTRA / BLENDER' : 'PROCEDURAL BLUEPRINT'}</p>
              <h2 id={`overnight-${slot.id}`}>{slot.label}</h2>
              <p>{money(slot.capCents)} provider cap · {slot.points} points · one fixed attempt</p>
              <p className="overnight-state">{state === 'empty' ? 'Not started' : state === 'pending' ? 'Saved request · recovery available' : state === 'completed' ? 'Result returned · review required' : 'Attempt ended · receipt preserved'}</p>
              {row?.detail && <p>{row.detail}</p>}
              {row?.id && <p className="overnight-request">Request ID: <span>{row.id}</span></p>}
              {row?.job && <p>Last reported worker stage: {row.job.state}{row.job.generationTiming ? ` · Worker execution: ${formatStudioGenerationDuration(row.job.generationTiming)}` : ''}</p>}
              {row?.result && <div className="overnight-result"><p>{row.result.blueprint.title}</p><p>Returned model: {row.result.model}. Blueprint-derived procedural GAME geometry; this is not a detailed mesh or manufacturing-approved file.</p></div>}
              <div className="overnight-actions">
                {state === 'empty' ? <button type="button" onClick={() => { void operate('start', slot) }} disabled={!!busy || rows.some(value => value.state === 'pending') || !validPrompt || !canStart(verified, slot, now)}>Start paid {slot.label} · {money(slot.capCents)} cap · {slot.points} points</button>
                  : row?.id && <button type="button" onClick={() => { void operate('recover', slot) }} disabled={!!busy}>Recover same request · {slot.label}</button>}
                {state === 'completed' && row?.id && (slot.workflow === 'detailed-astra' ? row.job?.downloadAllowed : row.result) && <button type="button" onClick={() => { void operate('download', slot) }} disabled={!!busy}>{slot.workflow === 'detailed-astra' ? 'Download same model' : 'Download returned blueprint GLB'} · {slot.label}</button>}
              </div>
            </article>
          })}
        </div>
      </>}
    </>}
  </main>
}
