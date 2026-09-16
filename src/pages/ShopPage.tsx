import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import OracleModelPreview from '../components/OracleModelPreview'
import { PORTALS } from '../config/portals'
import { routeForPortal } from '../lib/portalRouting'
import './ShopPage.css'

const SAVED_JOB_KEY = 'worldifact-shop-oracle-job-v3'

type Gate = { mode?: 'PUBLIC_PILOT' | 'OWNER_ONLY' | 'BLOCKED'; note?: string; budget?: string }
type Job = { id: string; state: string; detail?: string }
type SavedJob = { id: string; prompt: string; createdAt: string }
type Artifact = { jobId: string; blob: Blob; url: string; sha256: string; provenance: string }

const terminal = new Set(['failed', 'cancelled'])
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

function readSavedJob(): SavedJob | null {
  try {
    const raw = localStorage.getItem(SAVED_JOB_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SavedJob>
    if (typeof value.id !== 'string' || typeof value.prompt !== 'string' || typeof value.createdAt !== 'string') return null
    if (!/^[a-f0-9-]{36}$/.test(value.id)) return null
    return value as SavedJob
  } catch { return null }
}
function saveJob(job: SavedJob) { try { localStorage.setItem(SAVED_JOB_KEY, JSON.stringify(job)) } catch { /* recovery remains in-memory */ } }
function clearSavedJob() { try { localStorage.removeItem(SAVED_JOB_KEY) } catch { /* ignore */ } }

function parseJob(value: unknown, expectedId: string): Job {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Oracle returned an invalid job response.')
  const job = value as Record<string, unknown>
  if (job.id !== expectedId || typeof job.state !== 'string') throw new Error('Oracle returned an invalid job response.')
  return { id: expectedId, state: job.state, ...(typeof job.detail === 'string' ? { detail: job.detail } : {}) }
}

export default function ShopPage() {
  const navigate = useNavigate()
  const [gate, setGate] = useState<Gate>({ mode: 'BLOCKED' })
  const [prompt, setPrompt] = useState('Create a detailed collectible dinosaur figurine with readable anatomy, clean materials and a stable display base.')
  const [ownerCode, setOwnerCode] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [savedJob, setSavedJob] = useState<SavedJob | null>(() => readSavedJob())
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Checking MCP2 Oracle / Blender connection…')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const generatorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/oracle/jobs/status', { cache: 'no-store', signal: abort.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(value => {
        const next = (value && typeof value === 'object' ? value : { mode: 'BLOCKED' }) as Gate
        setGate(next)
        setMessage(next.mode === 'PUBLIC_PILOT'
          ? 'OpenAI + Blender ready. The active WORLDIFACT Shop uses the MPC2 job flow.'
          : next.mode === 'OWNER_ONLY'
            ? 'Oracle + Blender ready for owner access.'
            : next.note || 'REAL 3D generation is currently locked.')
      })
      .catch(() => { if (!abort.signal.aborted) setMessage('Could not read generator status. Retry in a moment.') })
    return () => abort.abort()
  }, [])

  useEffect(() => {
    if (window.location.hash === '#generator') generatorRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  useEffect(() => () => {
    controller.current?.abort()
    if (artifact?.url) URL.revokeObjectURL(artifact.url)
  }, [artifact])

  function authHeaders() {
    const headers: Record<string, string> = {}
    if (gate.mode === 'OWNER_ONLY') headers['X-WORLDIFACT-Owner'] = ownerCode.trim()
    return headers
  }

  async function fetchModel(jobId: string, signal: AbortSignal) {
    setMessage('Model ready. Loading the GLB into the MPC2-style viewer…')
    for (let attempt = 0; attempt < 48; attempt++) {
      try {
        const response = await fetch(`/api/oracle/jobs/${jobId}/model`, {
          headers: { ...authHeaders(), Accept: 'model/gltf-binary' }, cache: 'no-store', signal,
        })
        if (response.ok) {
          const blob = await response.blob()
          if (blob.size < 20) throw new Error('Generated GLB is unexpectedly empty.')
          const url = URL.createObjectURL(blob)
          setArtifact({
            jobId, blob, url,
            sha256: response.headers.get('X-WORLDIFACT-SHA256') || 'server hash unavailable',
            provenance: response.headers.get('X-WORLDIFACT-Provenance') || 'GENERATED-UNREVIEWED',
          })
          clearSavedJob(); setSavedJob(null)
          setMessage('New model loaded in the 3D preview. Nothing was downloaded automatically.')
          return
        }
        if (![409, 429, 502, 503, 504].includes(response.status)) {
          const body = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error || `GLB loading failed (HTTP ${response.status}).`)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        setMessage('Connection to the model was interrupted. Retrying the same finished job; no new paid request is sent.')
      }
      await sleep(5000, signal)
    }
    throw new Error('The job finished, but the GLB could not be read yet. Resume this same job later; do not start another paid job.')
  }

  async function pollSavedJob(target: SavedJob) {
    if (gate.mode === 'BLOCKED') throw new Error('REAL 3D generation is locked right now. The saved job was not deleted.')
    if (gate.mode === 'OWNER_ONLY' && (ownerCode.trim().length < 32 || ownerCode.trim().length > 256)) throw new Error('Enter the owner generation code to resume this saved job.')
    const abort = controller.current ?? new AbortController()
    controller.current = abort
    let current: Job = { id: target.id, state: 'recovering', detail: 'Recovering saved job…' }
    setJob(current)
    for (let attempt = 0; attempt < 144; attempt++) {
      try {
        const response = await fetch(`/api/oracle/jobs/${target.id}`, {
          headers: { ...authHeaders(), Accept: 'application/json' }, cache: 'no-store', signal: abort.signal,
        })
        if (response.ok) {
          const body = await response.json() as { job?: unknown }
          current = parseJob(body.job, target.id)
          setJob(current)
          if (current.state === 'succeeded') { await fetchModel(target.id, abort.signal); return }
          if (terminal.has(current.state)) { clearSavedJob(); setSavedJob(null); throw new Error(current.detail || `Oracle job ${current.state}.`) }
          setMessage(`Oracle job: ${current.state}. Astra / Blender is still working…`)
        } else if ([429, 502, 503, 504].includes(response.status)) {
          setMessage('Status temporarily unavailable. Retrying the same Oracle job without starting another paid request.')
        } else {
          const body = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error || `Job status failed (HTTP ${response.status}).`)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        setMessage('Mobile network interrupted. The same Oracle job remains active; retrying its saved ID.')
      }
      await sleep(5000, abort.signal)
    }
    throw new Error('The saved job is still not finished. Resume it later; no second job was started.')
  }

  async function resumeJob(target: SavedJob) {
    if (busy) return
    setBusy(true); setError(''); setArtifact(null)
    controller.current = new AbortController()
    setMessage('Resuming the same MCP2 Oracle job. No new paid POST will be sent.')
    try { await pollSavedJob(target) }
    catch (e) { setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped checking. The Oracle job may continue on the server.' : e instanceof Error ? e.message : 'Could not recover the job.') }
    finally { setBusy(false); controller.current = null }
  }

  async function generate() {
    if (busy) return
    setError('')
    if (gate.mode === 'BLOCKED') { setError(gate.note || 'REAL 3D generation is locked.'); return }
    if (gate.mode === 'OWNER_ONLY' && (ownerCode.trim().length < 32 || ownerCode.trim().length > 256)) { setError('Enter the owner generation code.'); return }
    const text = prompt.trim()
    if (text.length < 3 || text.length > 2000) { setError('Use a prompt between 3 and 2000 characters.'); return }
    const previous = readSavedJob()
    if (previous) { setSavedJob(previous); setError('A previous REAL 3D job is saved. Resume it first instead of spending another generation.'); return }

    const id = crypto.randomUUID()
    const target = { id, prompt: text, createdAt: new Date().toISOString() }
    saveJob(target); setSavedJob(target)
    setBusy(true); setArtifact(null); setJob({ id, state: 'submitting', detail: 'Submitting one job…' })
    setMessage('Submitting exactly one MCP2-style REAL 3D job. The POST is never automatically repeated.')
    controller.current = new AbortController()
    try {
      try {
        const response = await fetch('/api/oracle/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: text }),
          signal: controller.current.signal,
        })
        const body = await response.json().catch(() => null) as { error?: string; job?: unknown } | null
        if (response.ok) setJob(parseJob(body?.job, id))
        else { clearSavedJob(); setSavedJob(null); throw new Error(body?.error || `Oracle job submission failed (HTTP ${response.status}).`) }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        if (e instanceof Error && !/fetch|network|load|connection/i.test(e.message)) throw e
        setMessage('Submit response was lost. Checking the SAME saved job ID instead of sending another paid POST.')
      }
      await pollSavedJob(target)
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped checking. Resume the saved job later without a second paid POST.' : e instanceof Error ? e.message : 'REAL 3D generation failed.')
    } finally { setBusy(false); controller.current = null }
  }

  function explicitDownload() {
    if (!artifact) return
    const url = URL.createObjectURL(artifact.blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `WORLDIFACT-${artifact.jobId}.glb`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return <main className="portal-page foundation-page mpc2-shop-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="World portals">
        {PORTALS.map(portal => <Link key={portal.id} to={portal.route} className={portal.id === 'enchanted-ai-shop' ? 'active' : ''}>{portal.shortTitle}</Link>)}
        <Link to="/terra">Earth observation</Link>
      </nav>
    </header>

    <section className="mpc2-shop" ref={generatorRef} id="generator">
      <div className="mpc2-shop-intro">
        <div>
          <span className="eyebrow">ENCHANTED AI SHOP · MPC2 GENERATOR</span>
          <h1>Powiedz, co tworzymy.</h1>
          <p>To jest aktywny generator przeniesiony z Froge MPC2: prompt → Astra → Oracle → Blender → GLB → podgląd 3D.</p>
        </div>
        <span className="pill">{gate.mode === 'PUBLIC_PILOT' ? 'OpenAI + Blender ready' : gate.mode === 'OWNER_ONLY' ? 'Owner generator ready' : 'Generation locked'}</span>
      </div>

      <div className="mpc2-shop-layout">
        <section className="mpc2-command" aria-label="MPC2 3D generator controls">
          <label className="mpc2-prompt-label" htmlFor="mpc2-prompt">Co mam stworzyć?</label>
          <textarea id="mpc2-prompt" rows={6} maxLength={2000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Np. realistyczna figurka dinozaura, pojazd, budynek albo element świata gry…" />
          <div className="mpc2-prompt-meta"><span>Prompt do Astra + Blender</span><span>{prompt.length}/2000</span></div>
          {gate.mode === 'OWNER_ONLY' ? <label>Owner generation code<input type="password" autoComplete="off" value={ownerCode} disabled={busy} onChange={e => setOwnerCode(e.target.value)} /></label> : null}

          <div className="mpc2-connection" role="status">
            <strong>{gate.mode === 'BLOCKED' ? 'Generator chwilowo zablokowany' : 'OpenAI + Blender gotowe'}</strong>
            <p>{message}</p>
            <small>WORLDIFACT uses the reviewed MCP2 Oracle/Blender connector. Reference-image → REAL 3D remains blocked until verified end-to-end.</small>
          </div>

          {savedJob ? <button className="mpc2-primary" disabled={busy} onClick={() => void resumeJob(savedJob)}>Wznów ostatni model · bez nowego płatnego requestu</button> : null}
          <button className="mpc2-primary" disabled={busy || gate.mode === 'BLOCKED' || !!savedJob} onClick={() => void generate()}>{busy ? 'Generowanie w toku…' : 'Generuj model 3D'}</button>
          {busy ? <button onClick={() => controller.current?.abort()}>Zatrzymaj sprawdzanie · job może działać dalej</button> : null}

          {job ? <div className={`mpc2-job state-${job.state}`} role="status">
            <strong>{job.state === 'succeeded' ? 'Model gotowy' : terminal.has(job.state) ? 'Zlecenie zakończone' : 'Pracuję nad modelem'}</strong>
            <p>{prompt}</p>
            <p><b>{job.state}</b>{job.detail ? ` · ${job.detail}` : ''}</p>
            <small>Job {job.id}</small>
          </div> : null}
          {error ? <p role="alert" className="studio-error">{error}</p> : null}
        </section>

        <section className="mpc2-preview" aria-label="3D model preview">
          <div className="mpc2-preview-heading"><small>{artifact ? 'TWÓJ MODEL' : 'OBSZAR ROBOCZY'}</small><h2>{artifact ? 'Wygenerowany model 3D' : 'Twój model pojawi się tutaj'}</h2></div>
          <div className="mpc2-preview-stage">
            {artifact ? <OracleModelPreview url={artifact.url} label="REAL generated Astra + Blender GLB" /> : <div className="mpc2-empty-preview"><strong>3D result appears here</strong><p>Po zakończeniu joba GLB zostanie wczytany tutaj. Nic nie pobiera się automatycznie.</p></div>}
          </div>
          {artifact ? <div className="mpc2-preview-actions"><button className="mpc2-primary" onClick={explicitDownload}>Pobierz wygenerowany GLB</button></div> : null}
        </section>
      </div>

      {artifact ? <section className="generation-evidence"><span className="eyebrow">REAL 3D MODEL OUTPUT</span><p><strong>LIVE · {artifact.provenance}</strong></p><p>{artifact.blob.size.toLocaleString()} bytes · SHA-256 <code>{artifact.sha256}</code></p><p><small>Generated model only. MAKE/manufacturing suitability still requires validation.</small></p></section> : null}
    </section>

    <section className="accessibility-panel"><div className="section-heading"><h2>Pięć światów</h2><span>Wróć do dowolnego portalu WORLDIFACT</span></div><div className="portal-grid">{PORTALS.filter(p => p.id !== 'enchanted-ai-shop').map(p => <button key={p.id} onClick={() => navigate(routeForPortal(p.id))}>{p.shortTitle}</button>)}</div></section>
  </main>
}
