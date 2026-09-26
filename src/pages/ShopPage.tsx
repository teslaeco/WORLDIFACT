import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import OracleModelPreview from '../components/OracleModelPreview'
import DemoShopPreview from '../components/DemoShopPreview'
import ShopManufacturingOptions from '../components/ShopManufacturingOptions'
import ProjectAttachmentPicker from '../components/ProjectAttachmentPicker'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import { StudioCoordinator, checkStudio, type SavedStudioJob } from '../lib/studioClient'
import { prepareStudioPhoto } from '../lib/studioPhotos'
import { listStudioModels, readStudioModel, saveStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { mayExportCurrentJob, type StudioPreviewIdentity } from '../lib/studioView'
import { canSubmitNewDraft } from '../lib/studioDraft'
import { inspectGLB } from '../lib/glb'
import { DEFAULT_DIMENSIONS_MM, type ClientDimensions } from '../lib/shopManufacturing'
import { validateGenerationResult, type GenerationResult } from '../lib/blueprint'
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
  READY: 'The existing Oracle/Blender connector is ready for an explicit generation request. Model quality is not yet verified.',
}
const terminal = (state?: string) => ['succeeded', 'failed', 'cancelled'].includes(state || '')
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
type Preview = StudioPreviewIdentity & { blob: Blob; url: string; warning: string }
async function checkAstraReady(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
  const value = await response.json() as { generationReady?: unknown }
  return value.generationReady === true
}

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
  const [dimensionsEnabled, setDimensionsEnabled] = useState(false)
  const [demoPrompt, setDemoPrompt] = useState('')
  const [fastPrompt, setFastPrompt] = useState('')
  const [fastResult, setFastResult] = useState<GenerationResult | null>(null)
  const [astraReady, setAstraReady] = useState(false)
  const fast = profile === FAST_DRAFT_PROFILE
  const fastAvailable = astraReady
  const previousFinished = canSubmitNewDraft(saved?.receipt.id, job)

  const clearPreview = () => {
    epoch.current++
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    setPreview(null)
    return epoch.current
  }
  const dismissFinishedJob = () => {
    const client = coordinator.current
    if (!client || !saved || !terminal(job?.state) || operations.current.submit || operations.current.artifact) return
    try {
      client.clearSelection()
      clearPreview()
      setSaved(null)
      setJob(null)
      setSeconds(0)
      setError('')
      setNotice('The previous finished/failed job receipt was archived. Your description is still here and you can generate a new model now.')
      promptInput.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The previous job could not be cleared safely.')
    }
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
  const applyStatus = (value: StudioStatus) => {
    setStatus(value)
  }
  const refresh = async () => {
    const flags = operations.current
    if (flags.status) return
    flags.status = true; setChecking(true)
    const [studioCheck, astraCheck] = await Promise.allSettled([checkStudio(fetch, owner), checkAstraReady(fetch)])
    if (mounted.current) {
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      setAstraReady(astraCheck.status === 'fulfilled' && astraCheck.value)
      if (studioCheck.status === 'fulfilled' || (astraCheck.status === 'fulfilled' && astraCheck.value)) setError('')
      else setError('Generation services are temporarily unavailable. Your draft is preserved.')
    }
    flags.status = false
    if (mounted.current) setChecking(false)
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
    Promise.allSettled([checkStudio(), checkAstraReady()]).then(([studioCheck, astraCheck]) => {
      if (closed) return
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      setAstraReady(astraCheck.status === 'fulfilled' && astraCheck.value)
      if (studioCheck.status === 'rejected' && !(astraCheck.status === 'fulfilled' && astraCheck.value))
        setError('The generation services are unavailable. You can still prepare your description and use the local DEMO preview.')
    }).finally(() => { if (!closed) { flags.status = false; setChecking(false) } })
    listStudioModels().then(value => { if (!closed) setArchive(value) }).catch(() => {})
    return () => { closed = true; mounted.current = false; version.current++; if (urls.current) URL.revokeObjectURL(urls.current) }
  }, [])

  const loadResult = async (selected: SavedStudioJob, known?: StudioJob) => {
    const flags = operations.current, client = coordinator.current
    if (!client || flags.artifact || flags.submit) return
    flags.artifact = true; setArtifactBusy(true); setError('')
    const token = clearPreview()
    try {
      // A completed owned GLB is both the preview source and a customer export.
      // Ownership is enforced by the signed receipt/account on the server.
      const confirmed = known || (status?.accountRequired ? await client.poll(selected) : undefined)
      if (confirmed && mounted.current) setJob(confirmed)
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
        if (value.reconciliationRequired) { setNotice(value.detail); return }
        if (value.state === 'succeeded') { void loadResult(selected, value); return }
        if (value.state === 'failed' || value.state === 'cancelled') {
          setSeconds(0)
          try {
            client.clearSelection()
            setSaved(null)
            setJob(null)
            setNotice(value.detail !== JOB_DETAILS[value.state] ? value.detail : 'The previous failed/cancelled job was archived automatically. Your description is preserved and a new model can be started now.')
          } catch {
            setJob(value)
          }
          return
        }
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
    if (!saved || terminal(job?.state) || job?.reconciliationRequired) return
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(saved.startedAt)) / 1000)))
    tick(); const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [saved, job?.state, job?.reconciliationRequired])

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    const flags = operations.current, client = coordinator.current
    if (flags.submit || flags.photos || flags.artifact || !previousFinished) return

    if (fast) {
      if (!fastAvailable || photos.length || purpose === 'terrain' || prompt.trim().length < 3 || prompt.length > 2000) return
      flags.submit = true; setBusy(true); setError(''); setNotice(''); setDemoPrompt('')
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 40_000)
      try {
        const response = await fetch('/api/blueprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': crypto.randomUUID() },
          signal: controller.signal,
          body: JSON.stringify({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), mode: 'live' }),
        })
        const body = await response.json()
        if (!response.ok) {
          if ([429, 503].includes(response.status)) setAstraReady(false)
          throw new Error(body?.error || 'FAST Astra draft could not be generated.')
        }
        const result = validateGenerationResult(body)
        if (result.mode !== 'LIVE' || result.provenance !== 'GENERATED') throw new Error('FAST did not return verified LIVE Astra evidence.')
        clearPreview()
        if (mounted.current) {
          setFastPrompt(prompt.trim())
          setFastResult(result)
          setNotice('FAST · LIVE Astra specification ready. The visible 3D is a lightweight procedural draft, not an Oracle production mesh; use SLOW · QUALITY for the detailed model workflow.')
        }
      } catch (e) {
        if (mounted.current) setError(e instanceof Error && e.name === 'AbortError' ? 'FAST generation timed out. Your previous preview is unchanged.' : e instanceof Error ? e.message : 'FAST generation failed.')
      } finally {
        window.clearTimeout(timeout)
        flags.submit = false
        if (mounted.current) setBusy(false)
      }
      return
    }

    if (!status?.ready || !client || (photos.length && !status.photoReady)) return
    flags.submit = true; setBusy(true); setError(''); setNotice(''); setDemoPrompt(''); setFastResult(null); setFastPrompt('')
    try {
      const input = validateStudioInput({ worldId: 'enchanted-ai-shop', prompt, purpose, textureMaxSize: textureLimit, photos })
      const value = await client.start(input, record => {
        if (mounted.current) {
          clearPreview(); setSaved(record)
          setJob({ id: record.receipt.id, state: 'pending', detail: JOB_DETAILS.pending })
        }
      }, owner, true)
      if (mounted.current) setJob(value)
    } catch (e) {
      if (mounted.current) {
        const message = e instanceof Error ? e.message : 'Could not prepare the job. Inputs and the previous result are preserved.'
        setError(message)
        if (/allowance|exhausted|unavailable/i.test(message) && prompt.trim().length >= 3) {
          setDemoPrompt(prompt.trim())
          setNotice('LIVE detailed 3D generation is unavailable, so a clearly labelled local DEMO preview is shown instead. No second paid request was made.')
        }
      }
    }
    finally { flags.submit = false; if (mounted.current) setBusy(false) }
  }
  const previewDemo = () => {
    const value = prompt.trim()
    if (busy || photoBusy || value.length < 3) return
    setFastResult(null)
    setFastPrompt('')
    setDemoPrompt(value)
    setError('')
    setNotice('DEMO · MOCK local procedural preview. No GPT-6 Astra, Oracle or paid generation request was made.')
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
  const exportFile = async (format: 'model' | 'pbr' | 'fbx' | 'blend') => {
    const flags = operations.current
    if (flags.artifact || !saved || !mayExportCurrentJob(saved.receipt.id, job?.state, preview) || !coordinator.current) return
    flags.artifact = true; setArtifactBusy(true); setError('')
    try {
      if (format !== 'model') setNotice(format === 'pbr'
        ? 'Checking the saved model and preparing its texture ZIP (PBR maps when present) if needed. No new AI generation is submitted.'
        : 'Checking the saved Blender job and preparing a missing export if possible. No new AI generation is submitted.')
      const blob = await coordinator.current.artifact(format, saved)
      download(blob, `WORLDIFACT-${saved.receipt.id}.${format === 'pbr' ? 'textures.zip' : format === 'model' ? 'glb' : format}`)
      if (mounted.current) setNotice(`${format === 'model' ? 'GLB' : format === 'pbr' ? 'Textures ZIP' : format.toUpperCase()} download started. Use downloaded files for downstream/B2B review; manufacturing readiness still requires separate validation.`)
    }
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
  const canGenerate = !busy && !photoBusy && !artifactBusy && previousFinished && prompt.trim().length >= 3 &&
    (fast ? fastAvailable && !photos.length && purpose !== 'terrain' && prompt.length <= 2000
      : !!coordinator.current && !!status?.ready && (!photos.length || status.photoReady))
  const canExport = mayExportCurrentJob(saved?.receipt.id, job?.state, preview)
  const activeReady = fast ? fastAvailable : status?.ready === true

  return <main className="portal-page native-shop">
    <header className="native-shop-nav"><Link to="/world" className="native-shop-back">← Back to WORLDIFAKT</Link><strong>AI Shop</strong><Link to="/account/credits">Account & credits</Link><nav aria-label="World portals">{PORTALS.map(portal => <Link key={portal.id} to={portal.route}>{portal.shortTitle}</Link>)}</nav></header>
    <section className="native-shop-workspace" aria-label="Create and preview a 3D product">
      <div className="native-shop-preview">
        <span className="eyebrow">3D PREVIEW</span>
        {fastResult ? <>
          <DemoShopPreview prompt={fastPrompt} mode="live-fast" allowDownload />
          <small hidden data-testid="fast-result-description">{fastResult.assetSpec?.summary ?? fastResult.blueprint.title}</small>
          {dimensionsEnabled && <p className="shop-preview-dimensions">FAST draft target: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
          <small>FAST uses a generated Astra specification plus local procedural geometry. For a detailed Oracle/Blender GLB with reference images, use SLOW · QUALITY.</small>
        </> : demoPrompt ? <>
          <DemoShopPreview prompt={demoPrompt} />
          {dimensionsEnabled && <p className="shop-preview-dimensions">Preview size target: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
          <small>This DEMO preview is not a generated production mesh and is not manufacturing-ready.</small>
        </> : preview ? <>
          {preview.url ? <OracleModelPreview url={preview.url} label="Your 3D product preview" targetDimensionsMm={dimensionsEnabled ? [dimensions.xMm, dimensions.yMm, dimensions.zMm] : undefined} customerMode /> : <p role="status">This preview could not be displayed. Your generation result is preserved.</p>}
          <small hidden data-testid="result-description">Submitted description: {preview.label}</small>
          {dimensionsEnabled && <p className="shop-preview-dimensions">Preview size: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
        </> : saved ? <div className="native-shop-progress" role="status">
          <h2>{job?.reconciliationRequired ? 'Model needs a status review' : job?.state === 'succeeded' ? 'Your SLOW model is ready' : job?.state === 'failed' ? 'Previous model did not finish' : job?.state === 'cancelled' ? 'Previous model was cancelled' : 'Preparing your model…'}</h2>
          <p>{job?.reconciliationRequired ? job.detail : terminal(job?.state)
            ? 'That job is finished. Your description is preserved; completed owned files remain downloadable for transfer and B2B review.'
            : 'Please keep this page open. Your preview will appear here when it is ready.'}</p>
          {!terminal(job?.state) && !job?.reconciliationRequired && <p>Elapsed: {Math.floor(seconds / 60)}m {seconds % 60}s</p>}
          {terminal(job?.state) && job?.state !== 'succeeded' && <button type="button" onClick={dismissFinishedJob}>Start a new model</button>}
        </div> : <>
          {!sampleMissing ? <img className="native-shop-sample" src={`${EXAMPLE_ORIGIN}/assets/model-${sampleView}.webp`} alt="Example 3D product preview" referrerPolicy="no-referrer" onError={() => setSampleMissing(true)} /> : <p>The example preview is temporarily unavailable. You can still create your own model.</p>}
          <div className="native-shop-views">{['front', 'left', 'back', 'face'].map(view => <button key={view} type="button" aria-pressed={sampleView === view} onClick={() => { setSampleView(view); setSampleMissing(false) }}>{view === 'left' ? 'Left side' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <small>Example only. Your own generated preview replaces it after generation succeeds.</small>
        </>}
        {saved && <div className="native-shop-actions"><button type="button" disabled={busy || artifactBusy} onClick={() => job?.state === 'succeeded' ? void loadResult(saved) : setRetry(v => v + 1)}>Recover this job / reload result</button>{canExport && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('model')}>Download model · GLB</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('pbr')}>Download / prepare PBR / textures ZIP</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('fbx')}>Download / prepare FBX</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('blend')}>Download / prepare Blender</button></>}</div>}
      </div>
      <div className="native-shop-form">
        <span className="eyebrow">CREATE YOUR PRODUCT</span><h1>Describe it.<br />See it in 3D.</h1>
        <p>Describe your object and optionally add up to three reference images. The account plan includes 2 free FAST generations per 24 hours and 1 free SLOW generation per day.</p>
        {status && !status.accountRequired && <small>Account limits are awaiting server activation. The existing experimental generation window remains in effect.</small>}
        <p id="studio-draft-help" role="status">{saved ? previousFinished ? 'You can describe your next model while the current preview stays unchanged.' : 'You can prepare the next idea while the current model is being completed.' : 'Completed owned models can be downloaded for transfer and B2B review. Manufacturing approval remains separate.'}</p>
        <button type="button" data-testid="clear-studio-draft" disabled={busy || photoBusy} onClick={clearDraft}>Clear description</button>
        <button type="button" className="shop-internal-only" hidden disabled={busy || photoBusy} onClick={clearDraft}>Clear next-model draft</button>
        <form onSubmit={generate} aria-describedby="studio-draft-help">
          <fieldset className="shop-generation-modes" disabled={busy || photoBusy}>
            <legend>Choose generation mode</legend>
            <div className="shop-generation-mode-grid">
              <button type="button" className="shop-generation-mode" aria-pressed={!fast} onClick={() => { setProfile('standard'); if (textureLimit === 2048) setTextureLimit(4096) }}>
                <strong>SLOW · QUALITY</strong>
                <span>Full quality workflow · reference images · up to 4K</span>
              </button>
              <button type="button" className="shop-generation-mode" aria-pressed={fast} disabled={!fastAvailable || !!photos.length || purpose === 'terrain'} onClick={() => { setProfile(FAST_DRAFT_PROFILE); setTextureLimit(2048) }}>
                <strong>FAST · DRAFT</strong>
                <span>GPT-6 Astra procedural draft · text-only · usually seconds</span>
              </button>
            </div>
            <small>{!fastAvailable ? 'FAST is waiting for the public GPT-6 Astra LIVE service. SLOW · QUALITY can still use the Oracle/Blender workflow when it is ready.' : photos.length ? 'FAST is text-only in this version. Your reference images are kept for SLOW · QUALITY.' : purpose === 'terrain' ? 'FAST does not support terrain in this Shop revision. Use SLOW · QUALITY.' : fast && prompt.length > 2000 ? 'Shorten FAST text to 2000 characters or switch to SLOW · QUALITY.' : fast ? 'FAST sends one server-side GPT-6 Astra request and builds a lightweight procedural 3D draft from the validated result. Use SLOW · QUALITY for detailed Oracle/Blender output.' : 'SLOW · QUALITY uses the detailed Oracle/Blender workflow. FAST is the lighter Astra procedural draft.'}</small>
          </fieldset>
          <div className="shop-internal-only" hidden>
            <label htmlFor="studio-mode">Generation mode</label>
            <select id="studio-mode" value={profile} disabled={busy || photoBusy} onChange={e => {
              const next = generationProfile(e.target.value)
              if (next === FAST_DRAFT_PROFILE && (!fastAvailable || photos.length || purpose === 'terrain')) return
              setProfile(next)
              if (next === FAST_DRAFT_PROFILE) setTextureLimit(2048)
            }}><option value="standard">STANDARD · current quality workflow</option><option value={FAST_DRAFT_PROFILE} disabled={!fastAvailable || !!photos.length || purpose === 'terrain'}>FAST DRAFT · Astra procedural</option></select>
            <small>STANDARD remains the detailed Oracle/Blender path. FAST uses the public server-side Astra blueprint path and a local procedural preview; it does not claim an Oracle mesh.</small>
            <label htmlFor="studio-purpose">Purpose</label><select id="studio-purpose" value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as StudioInput['purpose'])}><option value="figurine">Figurine or chess piece</option><option value="game">Game asset</option><option value="terrain" disabled={fast}>Terrain or relief</option><option value="object">Custom object</option></select>
            <label htmlFor="studio-texture">Requested texture-size ceiling</label><select id="studio-texture" value={textureLimit} disabled={busy || !!photos.length || photoBusy || fast} onChange={e => setTextureLimit(Number(e.target.value) as TextureLimit)}><option value={2048}>Up to 2K</option><option value={4096}>Up to 4K</option><option value={8192} disabled>Up to 8K · coming soon</option></select>
          </div>
          <label htmlFor="studio-prompt">Describe your model</label><textarea ref={promptInput} id="studio-prompt" value={prompt} maxLength={fast ? 2000 : 4000} rows={6} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: a realistic chess knight with a stable base, smooth material and clean details." required />
          <label className="native-shop-upload" htmlFor="studio-photos">{fast ? 'Reference images require the standard quality path' : photoBusy ? 'Preparing reference images…' : `Add reference images · JPG / PNG / WebP · ${photos.length}/3`}</label><input id="studio-photos" type="file" className="native-shop-file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || photoBusy || fast || photos.length >= 3} onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} /><small>Use up to three views of the same object.</small>
          <div className="native-shop-photos">{photos.map((photo, index) => <div key={`${index}-${photo.name}`}><img src={photo.dataUrl} alt={`Your reference ${index + 1}: ${photo.view}`} /><label>Reference {index + 1} view<select disabled={busy || photoBusy} value={photo.view} onChange={e => setPhotos(items => items.map((item, i) => i === index ? { ...item, view: e.target.value as StudioPhoto['view'] } : item))}>{PHOTO_VIEWS.map(view => <option key={view} value={view}>{view.replace('_', ' ')}</option>)}</select></label><button type="button" disabled={busy || photoBusy} onClick={() => setPhotos(items => items.filter((_, i) => i !== index))}>Remove reference {index + 1}</button></div>)}</div>
          <ProjectAttachmentPicker scope="shop" disabled={busy || photoBusy} />
          <button className="native-shop-generate" type="submit" disabled={!canGenerate}>{busy ? 'Creating your model…' : fast ? 'Generate FAST 3D draft · Astra' : 'Generate SLOW model + materials'}</button><small>Free limits: 2 FAST per rolling 24 hours; 1 SLOW per UTC day. A subscription adds 1,500 credits; credit generations cost 50 each (30 generations). Subscription is required for SLOW downloads. Manufacturing and delivery are separate.</small>
        </form>
        <div className="shop-customer-status" role="status"><strong>{checking ? 'Checking availability…' : activeReady ? fast ? 'FAST Astra generation available' : 'SLOW quality generation available' : 'Generation temporarily unavailable'}</strong><p>{activeReady ? fast ? 'FAST creates a generated Astra specification and lightweight procedural 3D draft.' : 'SLOW creates the detailed model through the Oracle/Blender workflow.' : 'You can still test the Shop with the local DEMO preview while the selected LIVE path is unavailable.'}</p>{!activeReady && <button type="button" className="native-shop-demo-button" disabled={busy || photoBusy || prompt.trim().length < 3} onClick={previewDemo}>Preview DEMO · no API cost</button>}<button type="button" disabled={checking} onClick={() => void refresh()}>Refresh availability</button></div>
        <div className="native-shop-connection shop-internal-only" hidden role="status"><strong>{checking ? 'Checking connection…' : status?.ready ? 'Connector ready' : 'Generation not ready'}</strong><p>{status ? REASONS[status.reason] || 'Generation status requires review.' : 'A read-only check is required before a paid request can start.'}</p>{status?.allowance && <p>Approved remaining attempts: <b>{status.allowance.remaining}</b> · already reserved: {status.allowance.used}</p>}</div>
        {status?.reason === 'OWNER_ACCESS_REQUIRED' && <label className="shop-internal-only" hidden>Existing owner access code<input type="password" autoComplete="off" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Not an OpenAI API key" /></label>}
        {error && <p className="native-shop-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <p className="shop-beta-note"><strong>Experimental beta.</strong> Manufacturing requires a real production review before an order can be completed. Delivery times can change if the supplier requests another safety or geometry check.</p>
      </div>
    </section>
    <ShopManufacturingOptions dimensions={dimensions} dimensionsEnabled={dimensionsEnabled} hasGeneratedModel={!!preview && preview.origin === 'job'} onDimensionsChange={setDimensions} onDimensionsEnabledChange={setDimensionsEnabled} onPrepareIssDraft={prepareIssDraft} />
    <section className="shop-internal-only" hidden aria-labelledby="studio-archive-title"><h2 id="studio-archive-title">Your models · device archive</h2><p>Completed originals are saved on this device, not automatically published to a store. Clearing browser storage removes this archive; keep explicit file backups.</p><label>Find a saved model<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions" /></label><div className="native-shop-archive">{archive.filter(item => item.prompt.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id}><strong>{item.prompt}</strong><small>{(item.byteLength / 1048576).toFixed(1)} MB · UNREVIEWED</small><button type="button" disabled={busy || (!!saved && !terminal(job?.state)) || artifactBusy} onClick={() => void openArchived(item)}>Open saved model</button></article>)}</div>{archive.length === 0 && <p>No models saved on this device yet. Existing private Froge archives have not been copied or deleted.</p>}</section>
    <footer className="shop-customer-footer"><Link to="/world">WORLDIFAKT</Link><p>Experimental beta. Subscription and credit purchases require the payment service to be configured. Manufacturing orders require a separate production review.</p><a className="shop-internal-only" hidden href={REFERENCE_LINKS.modelGenerator} target="_blank" rel="noopener noreferrer">Original Froge Studio</a></footer>
  </main>
}
