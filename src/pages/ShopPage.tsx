import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import OracleModelPreview from '../components/OracleModelPreview'
import ShopManufacturingOptions from '../components/ShopManufacturingOptions'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import { StudioCoordinator, checkStudio, type SavedStudioJob } from '../lib/studioClient'
import { prepareStudioPhoto } from '../lib/studioPhotos'
import { listStudioModels, readStudioModel, saveStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { mayExportCurrentJob, type StudioPreviewIdentity } from '../lib/studioView'
import { canSubmitNewDraft } from '../lib/studioDraft'
import { inspectGLB } from '../lib/glb'
import { DEFAULT_DIMENSIONS_MM, type ClientDimensions } from '../lib/shopManufacturing'
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
  const [dimensions, setDimensions] = useState<ClientDimensions>(DEFAULT_DIMENSIONS_MM)
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
        if (mounted.current && token === epoch.current) { setArchive(entries); setNotice('Your preview is ready.') }
      } catch (e) { if (mounted.current && token === epoch.current) setNotice(e instanceof Error ? e.message : 'The preview is ready, but local recovery storage is unavailable.') }
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
    if (!files || flags.photos || flags.submit) return
    if (photos.length + files.length > 3) { setError('Use at most three views of the same object.'); return }
    flags.photos = true; setPhotoBusy(true); setError('')
    if (fast) setProfile('standard')
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
  const prepareIssDraft = (nextPrompt: string) => {
    if (operations.current.submit || operations.current.photos) return
    setPrompt(nextPrompt)
    setPurpose('object')
    setProfile('standard')
    setTextureLimit(4096)
    setError('')
    setNotice('ISS manufacturing-repair instructions loaded internally. Nothing was generated or ordered.')
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
    <header className="native-shop-nav"><Link to="/" className="native-shop-back">← Back to WORLDIFACT</Link><strong>AI Shop</strong><nav aria-label="World portals">{PORTALS.map(portal => <Link key={portal.id} to={portal.route}>{portal.shortTitle}</Link>)}</nav></header>
    <section className="native-shop-workspace" aria-label="Create and preview a 3D product">
      <div className="native-shop-preview">
        <span className="eyebrow">3D PREVIEW</span>
        {preview ? <>
          {preview.url ? <OracleModelPreview url={preview.url} label="Your 3D product preview" targetDimensionsMm={[dimensions.xMm, dimensions.yMm, dimensions.zMm]} customerMode /> : <p role="status">This preview could not be displayed. Your generation result is preserved.</p>}
          <small hidden data-testid="result-description">Submitted description: {preview.label}</small>
          <p className="shop-preview-dimensions">Preview size: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>
        </> : saved ? <div className="native-shop-progress" role="status"><h2>{job?.state === 'failed' ? 'We could not finish this model' : 'Preparing your model…'}</h2><p>{job?.state === 'failed' ? 'Your description is still saved. You can retry without creating a different order.' : 'Please keep this page open. Your preview will appear here when it is ready.'}</p><p>Elapsed: {Math.floor(seconds / 60)}m {seconds % 60}s</p></div> : <>
          {!sampleMissing ? <img className="native-shop-sample" src={`${EXAMPLE_ORIGIN}/assets/model-${sampleView}.webp`} alt="Example 3D product preview" referrerPolicy="no-referrer" onError={() => setSampleMissing(true)} /> : <p>The example preview is temporarily unavailable. You can still create your own model.</p>}
          <div className="native-shop-views">{['front', 'left', 'back', 'face'].map(view => <button key={view} type="button" aria-pressed={sampleView === view} onClick={() => { setSampleView(view); setSampleMissing(false) }}>{view === 'left' ? 'Left side' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <small>Example only. Your own generated preview replaces it after generation succeeds.</small>
        </>}
        {saved && <div className="native-shop-actions shop-internal-only" hidden><button type="button" disabled={busy || artifactBusy} onClick={() => job?.state === 'succeeded' ? void loadResult(saved) : setRetry(v => v + 1)}>Recover this job / reload result</button>{canExport && <>{saved.generationProfile !== FAST_DRAFT_PROFILE && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('pbr')}>Download available PBR textures</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('fbx')}>FBX</button></>}<button type="button" disabled={artifactBusy} onClick={() => void exportFile('blend')}>Blender</button></>}</div>}
      </div>
      <div className="native-shop-form">
        <span className="eyebrow">CREATE YOUR PRODUCT</span><h1>Describe it.<br />See it in 3D.</h1>
        <p>Describe the object you want and optionally add up to three reference images. Model generation is free for customers during this experimental test phase.</p>
        <p id="studio-draft-help" role="status">{saved ? previousFinished ? 'You can describe your next model while the current preview stays unchanged.' : 'You can prepare the next idea while the current model is being completed.' : 'No payment is taken when you create a model.'}</p>
        <button type="button" data-testid="clear-studio-draft" disabled={busy || photoBusy} onClick={clearDraft}>Clear description</button>
        <button type="button" className="shop-internal-only" hidden disabled={busy || photoBusy} onClick={clearDraft}>Clear next-model draft</button>
        <form onSubmit={generate} aria-describedby="studio-draft-help">
          <div className="shop-internal-only" hidden>
            <label htmlFor="studio-mode">Generation mode</label>
            <select id="studio-mode" value={profile} disabled={busy || photoBusy} onChange={e => {
              const next = generationProfile(e.target.value)
              if (next === FAST_DRAFT_PROFILE && (!status?.fastReady || photos.length || purpose === 'terrain')) return
              setProfile(next)
              if (next === FAST_DRAFT_PROFILE) setTextureLimit(2048)
            }}><option value="standard">STANDARD · current quality workflow</option><option value={FAST_DRAFT_PROFILE} disabled={!status?.fastReady || !!photos.length || purpose === 'terrain'}>FAST DRAFT · simple text-only object</option></select>
            <small>STANDARD is unchanged. FAST becomes selectable only when the connected worker confirms its verified profile. A shorter timeout is not proof of a faster model.</small>
            <label htmlFor="studio-purpose">Purpose</label><select id="studio-purpose" value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as StudioInput['purpose'])}><option value="figurine">Figurine or chess piece</option><option value="game">Game asset</option><option value="terrain" disabled={fast}>Terrain or relief</option><option value="object">Custom object</option></select>
            <label htmlFor="studio-texture">Requested texture-size ceiling</label><select id="studio-texture" value={textureLimit} disabled={busy || !!photos.length || photoBusy || fast} onChange={e => setTextureLimit(Number(e.target.value) as TextureLimit)}><option value={2048}>Up to 2K</option><option value={4096}>Up to 4K</option><option value={8192} disabled>Up to 8K · coming soon</option></select>
          </div>
          <label htmlFor="studio-prompt">Describe your model</label><textarea ref={promptInput} id="studio-prompt" value={prompt} maxLength={4000} rows={6} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: a realistic chess knight with a stable base, smooth material and clean details." required />
          <label className="native-shop-upload" htmlFor="studio-photos">{photoBusy ? 'Preparing reference images…' : `Add reference images · JPG / PNG / WebP · ${photos.length}/3`}</label><input id="studio-photos" type="file" className="native-shop-file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || photoBusy || photos.length >= 3} onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} /><small>Use up to three views of the same object. Adding a reference image switches this job to STANDARD quality automatically.</small>
          <div className="native-shop-photos">{photos.map((photo, index) => <div key={`${index}-${photo.name}`}><img src={photo.dataUrl} alt={`Your reference ${index + 1}: ${photo.view}`} /><label>Reference {index + 1} view<select disabled={busy || photoBusy} value={photo.view} onChange={e => setPhotos(items => items.map((item, i) => i === index ? { ...item, view: e.target.value as StudioPhoto['view'] } : item))}>{PHOTO_VIEWS.map(view => <option key={view} value={view}>{view.replace('_', ' ')}</option>)}</select></label><button type="button" disabled={busy || photoBusy} onClick={() => setPhotos(items => items.filter((_, i) => i !== index))}>Remove reference {index + 1}</button></div>)}</div>
          <button className="native-shop-generate" type="submit" disabled={!canGenerate}>{busy ? 'Creating your model…' : fast ? 'Generate FAST 3D model + materials · free' : 'Generate 3D model + materials · free'}</button><small>No customer payment is taken at generation. Manufacturing and delivery are a separate purchase step.</small>
        </form>
        <div className="shop-customer-status" role="status"><strong>{checking ? 'Checking availability…' : status?.ready ? 'Free generation available' : 'Generation temporarily unavailable'}</strong><p>{status?.ready ? 'You can create a model now.' : 'You can still prepare your description and photos. Try again shortly.'}</p><button type="button" disabled={checking} onClick={() => void refresh()}>Refresh availability</button></div>
        <div className="native-shop-connection shop-internal-only" hidden role="status"><strong>{checking ? 'Checking connection…' : status?.ready ? 'Connector ready' : 'Generation not ready'}</strong><p>{status ? REASONS[status.reason] || 'Generation status requires review.' : 'A read-only check is required before a paid request can start.'}</p>{status?.allowance && <p>Approved remaining attempts: <b>{status.allowance.remaining}</b> · already reserved: {status.allowance.used}</p>}</div>
        {status?.reason === 'OWNER_ACCESS_REQUIRED' && <label className="shop-internal-only" hidden>Existing owner access code<input type="password" autoComplete="off" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Not an OpenAI API key" /></label>}
        {error && <p className="native-shop-error" role="alert">We could not complete that step. Please try again.</p>}{notice && <p role="status">{notice}</p>}
        <p className="shop-beta-note"><strong>Experimental beta.</strong> Manufacturing requires a real production review before an order can be completed. Delivery times can change if the supplier requests another safety or geometry check.</p>
      </div>
    </section>
    <ShopManufacturingOptions dimensions={dimensions} hasGeneratedModel={!!preview && preview.origin === 'job'} onDimensionsChange={setDimensions} onPrepareIssDraft={prepareIssDraft} />
    <section className="shop-internal-only" hidden aria-labelledby="studio-archive-title"><h2 id="studio-archive-title">Your models · device archive</h2><p>Completed originals are saved on this device, not automatically published to a store. Clearing browser storage removes this archive; keep explicit file backups.</p><label>Find a saved model<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions" /></label><div className="native-shop-archive">{archive.filter(item => item.prompt.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id}><strong>{item.prompt}</strong><small>{(item.byteLength / 1048576).toFixed(1)} MB · UNREVIEWED</small><button type="button" disabled={busy || (!!saved && !terminal(job?.state)) || artifactBusy} onClick={() => void openArchived(item)}>Open saved model</button></article>)}</div>{archive.length === 0 && <p>No models saved on this device yet. Existing private Froge archives have not been copied or deleted.</p>}</section>
    <footer className="shop-customer-footer"><Link to="/">WORLDIFACT</Link><p>Customer storefront · experimental beta. Payment and automated supplier settlement are not connected yet.</p><a className="shop-internal-only" hidden href={REFERENCE_LINKS.modelGenerator} target="_blank" rel="noopener noreferrer">Original Froge Studio</a></footer>
  </main>
}
