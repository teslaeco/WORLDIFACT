import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { IMAGE_MODELS, IMAGE_TERMS, parseImageInput, type ImageInput, type ImageJob, type ImageModel } from '../lib/imageGeneration'
import './ImageGenerator.css'

async function imageRequest(path: string, input?: unknown) {
  const response = await fetch(path, { method: input ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: input ? { 'Content-Type': 'application/json' } : undefined, body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.timeout(input ? 210_000 : 20_000) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Image service is unavailable. Check your library before trying again.')
  return value
}

export function ImageGenerator({ prompt, stage, onSettled }: { prompt: string; stage: HTMLElement | null; onSettled: () => void }) {
  const { user, loading } = useAccount()
  const [model, setModel] = useState<ImageModel>(IMAGE_MODELS[0])
  const [ready, setReady] = useState(false), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [jobs, setJobs] = useState<ImageJob[]>([]), [selected, setSelected] = useState<ImageJob | null>(null)
  const [preview, setPreview] = useState(''), [previewError, setPreviewError] = useState('')
  const [retryInput, setRetryInput] = useState<ImageInput | null>(null)
  const settlementCallback = useRef(onSettled)
  useEffect(() => { settlementCallback.current = onSettled }, [onSettled])
  const lifecycle = useRef(0), submitting = useRef(false), selectedId = useRef<string | null>(null)
  const owner = user?.id, pendingKey = owner ? `worldifact:image-request:v1:${owner}` : ''
  const reload = useCallback(async () => {
    if (!owner) return
    const epoch = lifecycle.current
    setError('')
    try {
      const [status, library] = await Promise.all([imageRequest('/api/images/status'), imageRequest('/api/images')])
      if (epoch !== lifecycle.current) return
      const entries = library.jobs as ImageJob[]
      if (!Array.isArray(entries)) throw new Error('Image library is unavailable.')
      setReady(status.ready === true && status.terms?.revision === IMAGE_TERMS.revision && status.terms?.points === IMAGE_TERMS.points)
      const saved = sessionStorage.getItem(pendingKey)
      const pendingInput = saved ? parseImageInput(JSON.parse(saved), true) : null
      const pending = pendingInput?.id ?? ''
      setRetryInput(pendingInput)
      // A lost POST acknowledgement is recovery-only. Never automatically submit the saved ID.
      const original = pending ? entries.find(job => job.id === pending) : undefined
      if (pending && !original) {
        setChecked(false)
        throw new Error('Your last image request has not appeared yet. Reload its status before starting another; no automatic retry will be sent.')
      }
      if (original && original.settlement !== 'held') { sessionStorage.removeItem(pendingKey); setRetryInput(null); if (original.recovery) settlementCallback.current() }
      setJobs(entries)
      const next = entries.find(job => job.id === selectedId.current) ?? entries.find(job => job.settlement === 'held') ?? entries[0] ?? null
      selectedId.current = next?.id ?? null; setSelected(next); setChecked(true)
    } catch (e) { if (epoch === lifecycle.current) { setChecked(false); setError(e instanceof Error ? e.message : 'Image library is unavailable.') } }
  }, [owner, pendingKey])
  useEffect(() => {
    lifecycle.current++; submitting.current = false; selectedId.current = null
    setSelected(null); setJobs([]); setPreview(''); setError(''); setBusy(false); setChecked(false); setReady(false); setRetryInput(null)
    if (owner) void reload()
    return () => { lifecycle.current++ }
  }, [owner, reload])
  useEffect(() => {
    setPreview(''); setPreviewError('')
    if (!owner || selected?.state !== 'completed') return
    let alive = true, objectUrl = ''
    const controller = new AbortController()
    void fetch(`/api/images/${selected.id}/file`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('Could not load the saved image. Reload to recover the same file.')
        const blob = await response.blob()
        if (alive) { objectUrl = URL.createObjectURL(blob); setPreview(objectUrl) }
      }).catch(e => { if (alive) setPreviewError(e instanceof Error ? e.message : 'Preview unavailable.') })
    return () => { alive = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [owner, selected])
  const held = jobs.some(job => job.settlement === 'held')
  async function generate() {
    if (!owner || loading || submitting.current || !checked || !ready || held || prompt.trim().length < 3 || prompt.length > 4000) return
    await send({ id: crypto.randomUUID(), prompt, model, acceptedPoints: IMAGE_TERMS.points, revision: IMAGE_TERMS.revision })
  }
  async function send(input: ImageInput) {
    if (!owner || loading || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    const epoch = lifecycle.current, id = input.id
    try {
      // Persist before the POST, so navigation or a lost response cannot silently create another attempt.
      sessionStorage.setItem(pendingKey, JSON.stringify(input)); setRetryInput(input)
      const response = await fetch('/api/images', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(210_000),
        body: JSON.stringify(input) })
      const result = await response.json()
      if (!response.ok) {
        // These responses precede dispatch. A 5xx/network error must be recovered from the library.
        if ([400, 401, 402, 403, 409, 415, 429].includes(response.status)) { sessionStorage.removeItem(pendingKey); if (epoch === lifecycle.current) setRetryInput(null) }
        throw new Error(result.error || 'Image status could not be confirmed. Reload your image library.')
      }
      if (!result.job || result.job.id !== id) throw new Error('Image response could not be confirmed. Reload your image library.')
      if (result.job.settlement !== 'held') { sessionStorage.removeItem(pendingKey); if (epoch === lifecycle.current) setRetryInput(null) }
      if (epoch !== lifecycle.current) return
      selectedId.current = id; setChecked(true); setSelected(result.job); setJobs(previous => [result.job, ...previous.filter(job => job.id !== id)])
      onSettled()
    } catch (e) {
      if (epoch === lifecycle.current) { setError(e instanceof Error ? e.message : 'Check your image library before another request.'); setChecked(false) }
    } finally { if (epoch === lifecycle.current) { submitting.current = false; setBusy(false) } }
  }
  const display = <div className="image-generation-stage">
    <div className="shop-stage-heading"><span>Your images</span><span>GPT IMAGE 2.5</span></div>
    {!owner || loading ? <p>Sign in to view your private image library.</p> : <>
      {preview ? <><img className="image-generation-preview" src={preview} alt={selected?.prompt || 'Your generated image'} /><a className="image-download" href={preview} download={`worldifact-${selected?.id}.png`}>Download PNG</a></> :
        <div className="image-generation-empty"><h2>{busy ? 'Creating your image…' : selected?.state === 'completed' ? 'Loading your saved image…' : 'A new perspective.'}</h2><p>{busy ? 'You can return to this image library to recover the result.' : 'Describe your idea and generate a picture.'}</p></div>}
      {previewError && <p role="alert">{previewError}</p>}
      {selected && <p role="status">{selected.state === 'completed' ? `Saved to your account · ${selected.points} points charged.` : selected.detail || `Generation in progress · ${selected.points} points held. Reload to check this same request.`}</p>}
      <div className="image-library"><h3>My images</h3><button type="button" disabled={busy} onClick={() => void reload()}>Reload library · no charge</button>
        {jobs.length === 0 && <p>Your completed graphics will be saved here.</p>}
        {jobs.map(job => <button className="image-library-entry" type="button" key={job.id} aria-pressed={selected?.id === job.id} onClick={() => { selectedId.current = job.id; setSelected(job) }}><strong>{job.prompt.slice(0, 100)}</strong><span>{job.state} · {new Date(job.at).toLocaleString()}</span></button>)}
      </div>
    </>}
  </div>
  return <>
    <div className="image-generation-controls">
      <label>Image model<select value={model} disabled={busy} onChange={e => setModel(e.target.value as ImageModel)}><option value={IMAGE_MODELS[0]}>GPT Image 2.5 Flare · faster</option><option value={IMAGE_MODELS[1]}>GPT Image 2.5 Sunburst · finer detail</option></select></label>
      <p>{IMAGE_TERMS.points} points · one PNG · 1024 × 1024 · medium quality</p><small>Text to image. The reference photos in 3D settings are not sent in this mode.</small>
      {!user ? <p><Link to="/account">Sign in to generate images</Link></p> : <>
        {checked && !ready && <p role="status">Image generation is temporarily unavailable.</p>}
        {held && <p role="status">An image request is still open. Reload its status before starting another.</p>}
        <button type="button" className="native-shop-generate" disabled={busy || loading || !checked || !ready || held || prompt.trim().length < 3 || prompt.length > 4000} onClick={() => void generate()}>{busy ? 'Creating image…' : `Generate image · ${IMAGE_TERMS.points} points`}</button>
        <small>{IMAGE_TERMS.points} points are held when you start and charged when the image is saved. A confirmed provider refusal releases them. An uncertain result stays held for review.</small>
      </>}
      {retryInput && !busy && <button type="button" disabled={loading} onClick={() => void send(retryInput)}>Recover original request · {retryInput.acceptedPoints}-point original terms</button>}
      {error && <p className="native-shop-error" role="alert">{error}</p>}
    </div>
    {stage ? createPortal(display, stage) : null}
  </>
}
