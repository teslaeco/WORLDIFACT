import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import OracleModelPreview from '../components/OracleModelPreview'
import { PORTALS } from '../config/portals'
import { routeForPortal } from '../lib/portalRouting'

const SAVED_JOB_KEY = 'worldifact-shop-oracle-job-v2'

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

function saveJob(job: SavedJob) {
  try { localStorage.setItem(SAVED_JOB_KEY, JSON.stringify(job)) } catch { /* recovery remains in-memory */ }
}
function clearSavedJob() {
  try { localStorage.removeItem(SAVED_JOB_KEY) } catch { /* ignore storage failures */ }
}

function parseJob(value: unknown, expectedId: string): Job {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Oracle returned an invalid job response.')
  const job = value as Record<string, unknown>
  if (job.id !== expectedId || typeof job.state !== 'string') throw new Error('Oracle returned an invalid job response.')
  return { id: expectedId, state: job.state, ...(typeof job.detail === 'string' ? { detail: job.detail } : {}) }
}

export default function ShopPage() {
  const navigate = useNavigate()
  const [gate, setGate] = useState<Gate>({ mode: 'BLOCKED' })
  const [prompt, setPrompt] = useState('Create a detailed collectible dinosaur figurine for a game world, stable on a display base.')
  const [ownerCode, setOwnerCode] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Checking REAL 3D generator…')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const saved = useMemo(() => readSavedJob(), [job?.id])

  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/oracle/jobs/status', { cache: 'no-store', signal: abort.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(value => {
        const next = (value && typeof value === 'object' ? value : { mode: 'BLOCKED' }) as Gate
        setGate(next)
        setMessage(next.mode === 'PUBLIC_PILOT' ? 'REAL 3D generator ready.' : next.mode === 'OWNER_ONLY' ? 'REAL 3D generator ready for owner access.' : next.note || 'REAL 3D generation is currently locked.')
      })
      .catch(() => { if (!abort.signal.aborted) setMessage('Could not read generator status. Retry in a moment.') })
    return () => abort.abort()
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
    setMessage('Model is ready. Loading the same GLB into the page…')
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
            jobId,
            blob,
            url,
            sha256: response.headers.get('X-WORLDIFACT-SHA256') || 'server hash unavailable',
            provenance: response.headers.get('X-WORLDIFACT-Provenance') || 'GENERATED-UNREVIEWED',
          })
          clearSavedJob()
          setMessage('REAL 3D model loaded. Nothing was downloaded automatically.')
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
    throw new Error('The job finished, but the GLB could not be read yet. Use Resume last job later; do not start another paid job.')
  }

  async function resumeJob(savedJob: SavedJob) {
    if (busy) return
    if (gate.mode === 'BLOCKED') { setError('REAL 3D generation is locked right now. The saved job was not deleted.'); return }
    if (gate.mode === 'OWNER_ONLY' && (ownerCode.trim().length < 32 || ownerCode.trim().length > 256)) {
      setError('Enter the owner generation code to resume this saved job.'); return
    }
    setBusy(true); setError(''); setArtifact(null)
    const abort = new AbortController(); controller.current = abort
    setMessage('Resuming the same Oracle job. No new paid POST will be sent.')
    try {
      let current: Job = { id: savedJob.id, state: 'recovering', detail: 'Recovering saved job…' }
      setJob(current)
      for (let attempt = 0; attempt < 144; attempt++) {
        try {
          const response = await fetch(`/api/oracle/jobs/${savedJob.id}`, {
            headers: { ...authHeaders(), Accept: 'application/json' }, cache: 'no-store', signal: abort.signal,
          })
          if (response.ok) {
            const body = await response.json() as { job?: unknown }
            current = parseJob(body.job, savedJob.id)
            setJob(current)
            if (current.state === 'succeeded') { await fetchModel(savedJob.id, abort.signal); return }
            if (terminal.has(current.state)) { clearSavedJob(); throw new Error(current.detail || `Oracle job ${current.state}.`) }
            setMessage(`Oracle job: ${current.state}. Waiting for Astra + Blender…`)
          } else if (![429, 502, 503, 504].includes(response.status)) {
            const body = await response.json().catch(() => null) as { error?: string } | null
            throw new Error(body?.error || `Job status failed (HTTP ${response.status}).`)
          } else {
            setMessage('Status temporarily unavailable. Retrying the same job without starting another paid request.')
          }
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') throw e
          setMessage('Network interrupted. The Oracle job may still be running; retrying the same ID.')
        }
        await sleep(5000, abort.signal)
      }
      throw new Error('The saved job is still not finished. You can resume it again later; no second job was started.')
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped checking. The Oracle job may continue on the server.' : e instanceof Error ? e.message : 'Could not recover the job.')
    } finally { setBusy(false); controller.current = null }
  }

  async function generate() {
    if (busy) return
    setError('')
    if (gate.mode === 'BLOCKED') { setError(gate.note || 'REAL 3D generation is locked.'); return }
    if (gate.mode === 'OWNER_ONLY' && (ownerCode.trim().length < 32 || ownerCode.trim().length > 256)) {
      setError('Enter the owner generation code.'); return
    }
    const text = prompt.trim()
    if (text.length < 3 || text.length > 2000) { setError('Use a prompt between 3 and 2000 characters.'); return }
    const previous = readSavedJob()
    if (previous) { setError('A previous REAL 3D job is saved. Resume it first instead of spending another generation.'); return }

    const id = crypto.randomUUID()
    const savedJob = { id, prompt: text, createdAt: new Date().toISOString() }
    saveJob(savedJob)
    setBusy(true); setArtifact(null); setJob({ id, state: 'submitting', detail: 'Submitting one job…' })
    setMessage('Submitting one REAL 3D job. This POST is never automatically repeated.')
    const abort = new AbortController(); controller.current = abort
    try {
      let accepted = false
      try {
        const response = await fetch('/api/oracle/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: text }),
          signal: abort.signal,
        })
        const body = await response.json().catch(() => null) as { error?: string; job?: unknown } | null
        if (response.ok) {
          setJob(parseJob(body?.job, id)); accepted = true
        } else {
          clearSavedJob()
          throw new Error(body?.error || `Oracle job submission failed (HTTP ${response.status}).`)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        if (e instanceof Error && !/fetch|network|load|connection/i.test(e.message)) throw e
        setMessage('The submit response was lost. Checking the same job ID instead of sending the paid POST again.')
      }
      if (!accepted) setJob({ id, state: 'recovering', detail: 'Checking whether Oracle accepted the original request…' })
      await resumeJob(savedJob)
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped checking. The saved job can be resumed without a second paid POST.' : e instanceof Error ? e.message : 'REAL 3D generation failed.')
      setBusy(false); controller.current = null
    }
  }

  function explicitDownload() {
    if (!artifact) return
    const url = URL.createObjectURL(artifact.blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `WORLDIFACT-${artifact.jobId}.glb`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return <main className="portal-page foundation-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="World portals">
        {PORTALS.map(portal => <Link key={portal.id} to={portal.route} className={portal.id === 'enchanted-ai-shop' ? 'active' : ''}>{portal.shortTitle}</Link>)}
        <Link to="/terra">Earth observation</Link>
      </nav>
    </header>

    <section className="studio">
      <div className="studio-heading">
        <div><span className="eyebrow">ENCHANTED AI SHOP · REAL 3D</span><h1>Prompt → Astra → Blender → model in the page.</h1></div>
        <span className="pill">{gate.mode === 'PUBLIC_PILOT' ? 'REAL 3D hard-capped pilot' : gate.mode === 'OWNER_ONLY' ? 'Owner pilot' : 'Generation locked'}</span>
      </div>
      <p className="result-note">This is the active generator. The old FORGE page is an archive/export reference and is not used for generation here.</p>
      <div className="studio-layout">
        <div className="studio-scene">
          {artifact ? <OracleModelPreview url={artifact.url} label="REAL generated Astra + Blender GLB" /> : <div className="webgl-fallback"><h2>3D result appears here</h2><p>Nothing downloads automatically. After the job succeeds the GLB is loaded into this viewer.</p></div>}
          {artifact ? <div className="scene-toolbar"><button onClick={explicitDownload}>Download generated GLB</button></div> : null}
        </div>
        <aside className="creator-panel">
          <span className="eyebrow">MODEL INPUT</span>
          <label>Prompt<textarea rows={7} maxLength={2000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} /></label>
          <small>Reference-image → REAL Blender generation stays disabled until that input is verified end-to-end. Text prompts generate REAL 3D.</small>
          {gate.mode === 'OWNER_ONLY' ? <label>Owner generation code<input type="password" autoComplete="off" value={ownerCode} disabled={busy} onChange={e => setOwnerCode(e.target.value)} /></label> : null}
          {saved ? <button className="primary" disabled={busy} onClick={() => void resumeJob(saved)}>Resume last job · no new paid request</button> : null}
          <button className="primary" disabled={busy || gate.mode === 'BLOCKED' || !!saved} onClick={() => void generate()}>{busy ? `Working · ${job?.state || 'checking'}` : 'Generate REAL 3D model · Astra + Blender'}</button>
          {busy ? <button onClick={() => controller.current?.abort()}>Stop checking · job may continue</button> : null}
          <p role="status" className="result-note">{message}</p>
          {job ? <p className="result-note">Job <code>{job.id.slice(0, 8)}…</code> · <strong>{job.state}</strong>{job.detail ? ` · ${job.detail}` : ''}</p> : null}
          {error ? <p role="alert" className="error">{error}</p> : null}
        </aside>
      </div>
      {artifact ? <section className="generation-evidence"><span className="eyebrow">REAL 3D MODEL OUTPUT</span><p><strong>LIVE · {artifact.provenance}</strong></p><p>{artifact.blob.size.toLocaleString()} bytes · SHA-256 <code>{artifact.sha256}</code></p><p><small>Generated model only. MAKE/manufacturing suitability still requires validation.</small></p></section> : null}
    </section>

    <section className="accessibility-panel"><div className="section-heading"><h2>Return to the worlds</h2><span>Portal routes stay inside WORLDIFACT</span></div><div className="portal-grid">{PORTALS.filter(p => p.id !== 'enchanted-ai-shop').map(p => <button key={p.id} onClick={() => navigate(routeForPortal(p.id))}>{p.shortTitle}</button>)}</div></section>
  </main>
}
