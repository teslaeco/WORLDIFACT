import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import OracleModelPreview from '../components/OracleModelPreview'
import ShopMakePanel, { ISS_PRINT_PRESET } from '../components/ShopMakePanel'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import { StudioCoordinator, checkStudio, type SavedStudioJob } from '../lib/studioClient'
import { prepareStudioPhoto } from '../lib/studioPhotos'
import { listStudioModels, readStudioModel, saveStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { mayExportCurrentJob, previewFileName, type StudioPreviewIdentity } from '../lib/studioView'
import { canSubmitNewDraft } from '../lib/studioDraft'
import { inspectGLB } from '../lib/glb'
import { JOB_DETAILS, PHOTO_VIEWS, STUDIO_POLL_MS, FAST_DRAFT_PROFILE, generationProfile, validateStudioInput, type GenerationProfile, type StudioInput, type StudioPhoto, type StudioJob, type StudioStatus, type TextureLimit } from '../lib/studioProtocol'
import './ShopPage.css'

const EXAMPLE_ORIGIN = 'https://forge-studio-public.terraformingplanet.chatgpt.site'
const REASONS: Record<string, string> = {
  DISABLED_OR_EXPIRED: 'The server generation window is disabled or expired. You can edit the next model below; only paid submission is disabled.',
  RECEIPT_SECRET_MISSING: 'The server receipt service needs configuration. You can still edit your draft.',
  ALLOWANCE_UNAVAILABLE: 'The server could not read the remaining allowance. It will not guess or start a paid job. Draft editing remains available.',
  ALLOWANCE_EXHAUSTED: 'The approved cumulative generation allowance is exhausted. Existing models can still be recovered and new drafts remain editable. More paid capacity requires separate activation.',
  ORACLE_NOT_READY: 'The existing Oracle/Blender worker is not confirming readiness. You can still prepare a draft without submitting a model request.',
  OWNER_ACCESS_REQUIRED: 'This window requires the existing owner access code for generation. This is not your OpenAI API key or a ChatGPT login.',
  READY: 'The existing Oracle/Blender connector and remaining allowance are ready for an explicit generation request. Model quality is not yet verified.',
}
const terminal = (state?: string) => ['succeeded', 'failed', 'cancelled'].includes(state || '')
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
type Preview = StudioPreviewIdentity & { blob: Blob; url: string; warning: string }

/** Draft inputs are separate from the immutable submitted job and its result. */
export default function ShopPage() {
  const coordinator = useRef<StudioCoordinator | null>(null)
  const mounted = useRef(false), epoch = useRef(0), objectUrl = useRef('')
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const operations = useRef({ submit: false, artifact: false, photos: false, status: false })
  const [prompt, setPrompt] = useState('')
  const [purpose, setPurpose] = useState<StudioInput['purpose']>('figurine')
  const [textureLimit, setTextureLimit] = useState<TextureLimit>(4096)
  const [profile, setProfile] = useState<GenerationProfile>('standard')
  const [photos, setPhotos] = useState<StudioPhoto[]>([])
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saved, setSaved] = useState<SavedStudioJob | null>(null)
  const [job, setJob] = useState<StudioJob | null>(null)
  const [retry, setRetry] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [artifactBusy, setArtifactBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [archive, setArchive] = useState<StudioArchiveEntry[]>([])
  const [search, setSearch] = useState('')
  const [sampleView, setSampleView] = useState('front')
  const [sampleMissing, setSampleMissing] = useState(false)
  const fast = profile === FAST_DRAFT_PROFILE
  const previousFinished = canSubmitNewDraft(saved?.receipt.id, job)

  const clearPreview = () => {
    epoch.current++
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    setPreview(null)
    return epoch.current
  }
  const showBlob = async (blob: Blob, identity: StudioPreviewIdentity, token: number) => {
    let warning = ''
    try { inspectGLB(await blob.arrayBuffer()) }
    catch (e) { warning = e instanceof Error ? e.message : 'This GLB cannot be safely previewed on this device.' }
    if (!mounted.current || token !== epoch.current) return
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    const url = warning ? '' : URL.createObjectURL(blob)
    objectUrl.current = url
    setPreview({ ...identity, blob, url, warning })
  }
  const refresh = async () => {
    const flags = operations.current
    if (flags.status) return
    flags.status = true; setChecking(true)
    try { const value = await checkStudio(fetch, owner); if (mounted.current) { setStatus(value); setError('') } }
    catch (e) { if (mounted.current) { setStatus(null); setError(e instanceof Error ? e.message : 'Connection check failed.') } }
    finally { flags.status = false; if (mounted.current) setChecking(false) }
  }
  useEffect(() => {
    mounted.current = true
    let closed = false
    const version = epoch, urls = objectUrl, flags = operations.current
    try {
      const client = new StudioCoordinator(window.localStorage)
      const restored = client.restore()
      coordinator.current = client
      if (restored) {
        setSaved(restored); setPrompt(restored.prompt)
        setProfile(restored.generationProfile || 'standard')
        if (restored.generationProfile === FAST_DRAFT_PROFILE) setTextureLimit(2048)
        setJob({ id: restored.receipt.id, state: 'pending', detail: JOB_DETAILS.pending })
      }
    } catch (e) {
      coordinator.current = null
      setError(e instanceof Error ? e.message : 'Recovery storage is unavailable. Generation is paused.')
    }
    flags.status = true; setChecking(true)
    checkStudio().then(value => { if (!closed) setStatus(value) })
      .catch(() => { if (!closed) setError('The server status is unavailable. You can still prepare your description and images.') })
      .finally(() => { if (!closed) { flags.status = false; setChecking(false) } })
    listStudioModels().then(value => { if (!closed) setArchive(value) }).catch(() => {})
    return () => { closed = true; mounted.current = false; version.current++; if (urls.current) URL.revokeObjectURL(urls.current) }
  }, [])

  const loadResult = async (selected: SavedStudioJob) => {
    const flags = operations.current, client = coordinator.current
    if (!client || flags.artifact || flags.submit) return
    flags.artifact = true; setArtifactBusy(true); setError('')
    const token = clearPreview()
    try {
      const blob = await client.artifact('model', selected)
      if (!mounted.current || token !== epoch.current) return
      await showBlob(blob, { id: selected.receipt.id, origin: 'job', label: selected.prompt }, token)
      try {
        await saveStudioModel(selected, blob)
        const entries = await listStudioModels()
        if (mounted.current && token === epoch.current) { setArchive(entries); setNotice('Original GLB and embedded materials saved on this device. Not published or approved for sale.') }
      } catch (e) { if (mounted.current && token === epoch.current) setNotice(e instanceof Error ? e.message : 'Save failed. Download the original model to keep it.') }
    } catch (e) { if (mounted.current && token === epoch.current) setError(e instanceof Error ? e.message : 'Could not load the model. Retry the same result.') }
    finally { flags.artifact = false; if (mounted.current && token === epoch.current) setArtifactBusy(false) }
  }
  useEffect(() => {
    if (!saved || !coordinator.current) return
    const selected = saved, client = coordinator.current
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, failures = 0
    const poll = async () => {
      if (stopped) return
      if (operations.current.submit) { timer = setTimeout(poll, 1500); return }
      try {
        const value = await client.poll(selected)
        if (stopped) return
        failures = 0; setJob(value); setError('')
        if (value.state === 'succeeded') { void loadResult(selected); return }
        if (terminal(value.state)) return
      } catch (e) {
        if (stopped) return
        failures++; setError(e instanceof Error ? e.message : 'Status temporarily unavailable. Recover the same job.')
        if (failures >= 4) return
      }
      if (!stopped) timer = setTimeout(poll, STUDIO_POLL_MS * Math.min(failures + 1, 3))
    }
    timer = setTimeout(poll, 1500)
    return () => { stopped = true; if (timer) clearTimeout(timer) }
    // Draft edits must not restart the selected job's request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.receipt.id, retry])
  useEffect(() => {
    if (!saved || terminal(job?.state)) return
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(saved.startedAt)) / 1000)))
    tick(); const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [saved, job?.state])

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    const flags = operations.current, client = coordinator.current
    if (flags.submit || flags.photos || flags.artifact || !previousFinished || !status?.ready || !client || (fast && !status.fastReady)) return
    flags.submit = true; setBusy(true); setError(''); setNotice('')
    try {
      const input = validateStudioInput({ worldId: 'enchanted-ai-shop', prompt, purpose, textureMaxSize: textureLimit, photos, ...(fast ? { generationProfile: FAST_DRAFT_PROFILE } : {}) })
      const value = await client.start(input, record => {
        if (mounted.current) {
          // Do not discard the prior preview or receipt just because a draft
          // changed, or because free preparation failed on an allowance check.
          clearPreview(); setSaved(record)
          setJob({ id: record.receipt.id, state: 'pending', detail: JOB_DETAILS.pending })
        }
      }, owner, true)
      if (mounted.current) setJob(value)
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Could not prepare the job. Inputs and the previous result are preserved.') }
    finally { flags.submit = false; if (mounted.current) setBusy(false) }
  }
  const addPhotos = async (files: FileList | null) => {
    const flags = operations.current
    if (!files || flags.photos || flags.submit || fast) return
    if (photos.length + files.length > 3) { setError('Use at most three views of the same object.'); return }
    flags.photos = true; setPhotoBusy(true); setError('')
    try {
      const additions: StudioPhoto[] = [], views = ['front', 'side', 'back'] as const
      for (const file of Array.from(files)) additions.push(await prepareStudioPhoto(file, textureLimit, views[photos.length + additions.length]))
      if (mounted.current) setPhotos(previous => [...previous, ...additions])
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Photo preparation failed.') }
    finally { flags.photos = false; if (mounted.current) setPhotoBusy(false) }
  }
  const clearDraft = () => {
    if (operations.current.submit || operations.current.photos) return
    if ((prompt || photos.length) && !window.confirm('Clear only the new description and reference images? The displayed model, archive and recovery receipt stay unchanged.')) return
    setPrompt(''); setPhotos([]); setError('')
    promptInput.current?.focus()
  }
  const loadIssPreset = () => {
    if (operations.current.submit || operations.current.photos || artifactBusy) return
    setProfile('standard')
    setPurpose('object')
    setTextureLimit(4096)
    setPrompt(ISS_PRINT_PRESET)
    setError('')
    setNotice('ISS print-prep preset loaded as a draft only. Review any existing reference images before you explicitly generate; loading the preset does not spend anything.')
    promptInput.current?.focus()
  }
  const exportFile = async (format: 'pbr' | 'fbx' | 'blend') => {
    const flags = operations.current
    if (flags.artifact || !saved || !mayExportCurrentJob(saved.receipt.id, job?.state, preview) || !coordinator.current) return
    if (saved.generationProfile === FAST_DRAFT_PROFILE && format !== 'blend') return
    flags.artifact = true; setArtifactBusy(true)
    try { const blob = await coordinator.current.artifact(format, saved); download(blob, `WORLDIFACT-${saved.receipt.id}.${format === 'pbr' ? 'textures.zip' : format}`) }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'This export is not available on the connected worker.') }
    finally { flags.artifact = false; if (mounted.current) setArtifactBusy(false) }
  }
  const openArchived = async (item: StudioArchiveEntry) => {
    const flags = operations.current
    if (flags.submit || flags.artifact || (saved && !terminal(job?.state))) return
    flags.artifact = true; setArtifactBusy(true); setError('')
    const token = clearPreview()
    try { await showBlob(await readStudioModel(item.id), { id: item.id, origin: 'archive', label: item.prompt }, token) }
    catch (e) { if (mounted.current && token === epoch.current) setError(e instanceof Error ? e.message : 'Archived model could not be opened.') }
    finally { flags.artifact = false; if (mounted.current && token === epoch.current) setArtifactBusy(false) }
  }
  const canGenerate = !!coordinator.current && !!status?.ready && (!fast || status.fastReady === true) && (!photos.length || status.photoReady) && !busy && !photoBusy && !artifactBusy && previousFinished && prompt.trim().length >= 3
  const canExport = mayExportCurrentJob(saved?.receipt.id, job?.state, preview)

  return <main className="portal-page native-shop">
    <header className="native-shop-nav"><Link to="/" className="native-shop-back">← Back to WORLDIFACT</Link><strong>AI Shop · 3D Studio</strong><nav aria-label="World portals">{PORTALS.map(portal => <Link key={portal.id} to={portal.route}>{portal.shortTitle}</Link>)}</nav></header>
    <section className="native-shop-workspace" aria-label="Create and review a 3D model">
      <div className="native-shop-preview">
        <span className="eyebrow">{preview?.origin === 'archive' ? 'ARCHIVED MODEL · UNREVIEWED' : saved || preview ? saved?.generationProfile === FAST_DRAFT_PROFILE ? 'FAST DRAFT · NOT VISUALLY REVIEWED' : 'YOUR MODEL JOB · REVIEW REQUIRED' : 'EXISTING FORGE CHARACTER · EXAMPLE ONLY'}</span>
        {preview ? <>
          {preview.url ? <OracleModelPreview url={preview.url} label={preview.label} /> : <p role="status">{preview.warning} The original GLB is preserved for explicit download.</p>}
          <small>Model ID: {preview.id}</small><small data-testid="result-description">Submitted description: {preview.label}</small>
          <button type="button" onClick={() => download(preview.blob, previewFileName(preview))}>Download GLB + embedded materials · {(preview.blob.size / 1048576).toFixed(1)} MB</button>
        </> : saved ? <div className="native-shop-progress" role="status"><h2>{artifactBusy ? 'Loading your generated model…' : job?.state === 'failed' ? 'This job needs attention' : 'Your model job'}</h2><p>{job?.detail || JOB_DETAILS.pending}</p><p>Elapsed: {Math.floor(seconds / 60)}m {seconds % 60}s · no invented progress percentage</p><p>Job: <code>{saved.receipt.id}</code></p></div> : <>
          {!sampleMissing ? <img className="native-shop-sample" src={`${EXAMPLE_ORIGIN}/assets/model-${sampleView}.webp`} alt="Existing FORGE character in a two-tone dress, with a living and skull half-face. This is an example, not a new generation." referrerPolicy="no-referrer" onError={() => setSampleMissing(true)} /> : <p>The existing character preview is unavailable. The generation form remains usable.</p>}
          <div className="native-shop-views">{['front', 'left', 'back', 'face'].map(view => <button key={view} type="button" aria-pressed={sampleView === view} onClick={() => { setSampleView(view); setSampleMissing(false) }}>{view === 'left' ? 'Left side' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <small>The earlier half-skull character is kept as a reference display. Your new result replaces this example only after its own job succeeds.</small>
        </>}
        {saved && <div className="native-shop-actions"><button type="button" disabled={busy || artifactBusy} onClick={() => job?.state === 'succeeded' ? void loadResult(saved) : setRetry(v => v + 1)}>Recover this job / reload result</button>{canExport && <>{saved.generationProfile !== FAST_DRAFT_PROFILE && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('pbr')}>Download available PBR textures</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('fbx')}>FBX</button></>}<button type="button" disabled={artifactBusy} onClick={() => void exportFile('blend')}>Blender</button></>}</div>}
      </div>
      <div className="native-shop-form">
        <span className="eyebrow">CREATE SOMETHING OF YOUR OWN</span><h1>From your idea<br />to a 3D model.</h1>
        <p>Describe an object or add its reference views. The existing Oracle / Astra / Blender worker builds the model; WORLDIFACT shows its result here.</p>
        <p id="studio-draft-help" role="status">{saved ? previousFinished ? 'Next model draft: edit the description and mode freely. Your displayed model and its downloads remain unchanged until you explicitly submit another job.' : 'You can prepare the next draft while this job is being checked or completed. A second job cannot start until the current one finishes.' : 'Draft editing is free and stays available even when paid generation is disabled.'}</p>
        <button type="button" data-testid="clear-studio-draft" disabled={busy || photoBusy} onClick={clearDraft}>Clear next-model draft</button>
        <form onSubmit={generate} aria-describedby="studio-draft-help">
          <label htmlFor="studio-mode">Generation mode</label>
          <select id="studio-mode" value={profile} disabled={busy || photoBusy} onChange={e => {
            const next = generationProfile(e.target.value)
            if (next === FAST_DRAFT_PROFILE && (!status?.fastReady || photos.length || purpose === 'terrain')) return
            setProfile(next)
            if (next === FAST_DRAFT_PROFILE) setTextureLimit(2048)
          }}><option value="standard">STANDARD · current quality workflow</option><option value={FAST_DRAFT_PROFILE} disabled={!status?.fastReady || !!photos.length || purpose === 'terrain'}>FAST DRAFT · simple text-only object</option></select>
          <small>{fast ? 'FAST target: 1–2 minutes, not a guarantee. One compact build, up to 2K maps. Visual review and optional formats are deferred; no automatic paid fallback.' : 'STANDARD is unchanged. FAST becomes selectable only when the connected worker confirms its verified profile. A shorter timeout is not proof of a faster model.'}</small>
          <label htmlFor="studio-prompt">Describe your next model</label><textarea ref={promptInput} id="studio-prompt" value={prompt} maxLength={4000} rows={6} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: a realistic skull study with ivory bone materials, a stable base and clearly defined teeth." required />
          <label htmlFor="studio-purpose">Purpose</label><select id="studio-purpose" value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as StudioInput['purpose'])}><option value="figurine">Figurine or chess piece</option><option value="game">Game asset</option><option value="terrain" disabled={fast}>Terrain or relief</option><option value="object">Custom object</option></select>
          <label htmlFor="studio-texture">Requested texture-size ceiling</label><select id="studio-texture" value={textureLimit} disabled={busy || !!photos.length || photoBusy || fast} onChange={e => setTextureLimit(Number(e.target.value) as TextureLimit)}><option value={2048}>Up to 2K</option><option value={4096}>Up to 4K</option><option value={8192} disabled>Up to 8K · available soon</option></select><small>2K and 4K are available request ceilings. 8K is shown as coming soon and cannot be selected. References are never upscaled; actual texture quality depends on the worker and source images.</small>
          <label className="native-shop-upload" htmlFor="studio-photos">{fast ? 'Reference images require STANDARD mode' : photoBusy ? 'Preparing reference images…' : 'Add reference images · JPG / PNG / WebP'}</label><input id="studio-photos" type="file" className="native-shop-file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || photoBusy || fast} onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} /><small>Up to 3 views of the same object. Maximum 12 MB per original and 6 MB combined after preparation.</small>
          <div className="native-shop-photos">{photos.map((photo, index) => <div key={`${index}-${photo.name}`}><img src={photo.dataUrl} alt={`Your reference ${index + 1}: ${photo.view}`} /><label>Reference {index + 1} view<select disabled={busy || photoBusy} value={photo.view} onChange={e => setPhotos(items => items.map((item, i) => i === index ? { ...item, view: e.target.value as StudioPhoto['view'] } : item))}>{PHOTO_VIEWS.map(view => <option key={view} value={view}>{view.replace('_', ' ')}</option>)}</select></label><button type="button" disabled={busy || photoBusy} onClick={() => setPhotos(items => items.filter((_, i) => i !== index))}>Remove reference {index + 1}</button></div>)}</div>
          <button className="native-shop-generate" type="submit" disabled={!canGenerate}>{busy ? 'Submitting this model…' : fast ? 'Generate FAST draft + materials' : 'Generate 3D model + materials'}</button><small>Only this button submits a new paid job. Editing, switching mode, loading the ISS preset and clearing the draft do not generate anything or change your saved models.</small>
        </form>
        <div className="native-shop-connection" role="status"><strong>{checking ? 'Checking connection…' : status?.ready ? 'Connector ready' : 'Generation not ready'}</strong><p>{status ? REASONS[status.reason] || 'Generation status requires review.' : 'A read-only check is required before a paid request can start.'}</p>{status?.allowance && <p>Approved remaining attempts: <b>{status.allowance.remaining}</b> · already reserved: {status.allowance.used}</p>}{photos.length > 0 && status && !status.photoReady && <p>Photo input has not been confirmed on this worker. The images will not be silently ignored.</p>}<button type="button" disabled={checking} onClick={() => void refresh()}>Check connection · no generation</button></div>
        {status?.reason === 'OWNER_ACCESS_REQUIRED' && <label>Existing owner access code<input type="password" autoComplete="off" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Not an OpenAI API key" /><small>Held only in this page's memory. Then check the connection again.</small></label>}
        {error && <p className="native-shop-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <p><strong>MAKE: validation required.</strong> A finished GLB is not manufacturing approval. Review geometry, dimensions, materials and licensing before sale.</p>
      </div>
    </section>
    <ShopMakePanel onUseIssPreset={loadIssPreset} disabled={busy || photoBusy || artifactBusy || !previousFinished} />
    <section aria-labelledby="studio-archive-title"><h2 id="studio-archive-title">Your models · device archive</h2><p>Completed originals are saved on this device, not automatically published to a store. Clearing browser storage removes this archive; keep explicit file backups.</p><label>Find a saved model<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions" /></label><div className="native-shop-archive">{archive.filter(item => item.prompt.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id}><strong>{item.prompt}</strong><small>{(item.byteLength / 1048576).toFixed(1)} MB · UNREVIEWED</small><button type="button" disabled={busy || (!!saved && !terminal(job?.state)) || artifactBusy} onClick={() => void openArchived(item)}>Open saved model</button></article>)}</div>{archive.length === 0 && <p>No models saved on this device yet. Existing private Froge archives have not been copied or deleted.</p>}</section>
    <footer><Link to="/lab">AI Game Lab</Link> · <Link to="/make">Manufacturing review</Link> · <Link to="/control">Platform connections</Link> · <a href={REFERENCE_LINKS.modelGenerator} target="_blank" rel="noopener noreferrer">Original Froge Studio ↗</a><p>Same-origin WORLDIFACT interface connected to the existing worker. The original hosted Studio is unchanged; there is no embedded login or automatic redirect.</p></footer>
  </main>
}
