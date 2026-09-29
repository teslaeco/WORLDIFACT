import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MODEL_CATALOG, type DraftModel, type GenerationModel } from '../lib/modelCatalog'
import OracleModelPreview from '../components/OracleModelPreview'
import DemoShopPreview from '../components/DemoShopPreview'
import ShopManufacturingOptions from '../components/ShopManufacturingOptions'
import ProjectAttachmentPicker from '../components/ProjectAttachmentPicker'
import StudioGallery from '../components/StudioGallery'
import GenerationCostNotice from '../components/GenerationCostNotice'
import LiveSolPreview from '../components/LiveSolPreview'
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
import { JOB_DETAILS, PHOTO_VIEWS, STUDIO_POLL_MS, FAST_DRAFT_PROFILE, generationProfile, type GenerationProfile, type StudioInput, type StudioPhoto, type StudioJob, type StudioStatus, type TextureLimit } from '../lib/studioProtocol'
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
async function checkGenerationReady(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { sol: false, astra: false }
  const value = await response.json() as { generationReady?: unknown; model?: unknown; qualityModel?: unknown; astraBlueprintReady?: unknown }
  return {
    sol: value.generationReady === true && value.model === 'gpt-6-sol',
    astra: value.generationReady === true && value.qualityModel === 'gpt-6-astra' && value.astraBlueprintReady === true,
  }
}

/** Draft inputs are separate from the immutable submitted job and its result. */
export default function ShopPage() {
  const location = useLocation()
  const pendingCharacter = useRef(typeof location.state?.worldPrompt === 'string' && location.state.worldPrompt.length <= 2000 ? location.state.worldPrompt : '')
  const coordinator = useRef<StudioCoordinator | null>(null)
  const mounted = useRef(false), epoch = useRef(0), objectUrl = useRef('')
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const operations = useRef({ submit: false, artifact: false, photos: false, status: false })
  const [prompt, setPrompt] = useState('')
  const [purpose, setPurpose] = useState<StudioInput['purpose']>('figurine')
  const [textureLimit, setTextureLimit] = useState<TextureLimit>(4096)
  const [profile, setProfile] = useState<GenerationProfile>('standard')
  const [cheapModel, setCheapModel] = useState<DraftModel>('sol')
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
  const [solReady, setSolReady] = useState(false)
  const [astraReady, setAstraReady] = useState(false)
  const fast = profile === FAST_DRAFT_PROFILE
  const fastAvailable = solReady
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
    const [studioCheck, generationCheck] = await Promise.allSettled([checkStudio(fetch, owner), checkGenerationReady(fetch)])
    if (mounted.current) {
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      if (generationCheck.status === 'fulfilled') { setSolReady(generationCheck.value.sol); setAstraReady(generationCheck.value.astra) }
      else { setSolReady(false); setAstraReady(false) }
      if (studioCheck.status === 'fulfilled' || (generationCheck.status === 'fulfilled' && (generationCheck.value.sol || generationCheck.value.astra))) setError('')
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
      if (!restored && pendingCharacter.current) { setPrompt(pendingCharacter.current); setNotice('Character brief copied from your private world. Review model and points before generating.'); pendingCharacter.current = '' }
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
    Promise.allSettled([checkStudio(), checkGenerationReady()]).then(([studioCheck, generationCheck]) => {
      if (closed) return
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      if (generationCheck.status === 'fulfilled') { setSolReady(generationCheck.value.sol); setAstraReady(generationCheck.value.astra) }
      else { setSolReady(false); setAstraReady(false) }
      if (studioCheck.status === 'rejected' && !(generationCheck.status === 'fulfilled' && (generationCheck.value.sol || generationCheck.value.astra)))
        setError('The generation services are unavailable. You can still prepare your description and use the local DEMO preview.')
    }).finally(() => { if (!closed) { flags.status = false; setChecking(false) } })
    listStudioModels().then(value => { if (!closed) setArchive(value) }).catch(() => {})
    return () => { closed = true; mounted.current = false; version.current++; if (urls.current) URL.revokeObjectURL(urls.current) }
  }, [])

  const loadResult = async (selected: SavedStudioJob, known?: StudioJob) => {
    const flags = operations.current, client = coordinator.current
    if (!client || flags.artifact || flags.submit) return
    if (known?.downloadAllowed === false) {
      setNotice('Your SLOW model is complete and preserved. An active subscription is required to download the model and textures. A protected image preview is not available on the connected worker yet.')
      return
    }
    flags.artifact = true; setArtifactBusy(true); setError('')
    const token = clearPreview()
    try {
      // A GLB preview contains the downloadable original. Check server rights
      // before loading it; a free SLOW result stays on the worker.
      const confirmed = known || (status?.accountRequired ? await client.poll(selected) : undefined)
      if (confirmed && mounted.current) setJob(confirmed)
      if (confirmed?.downloadAllowed === false) {
        setNotice('Your SLOW model is complete and preserved. Subscribe to download it. Protected image preview is currently unavailable.')
        return
      }
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
    const flags = operations.current
    if (flags.submit || flags.photos || flags.artifact || !previousFinished) return

    const selectedModel: GenerationModel = fast ? cheapModel : 'astra'
    const selectedReady = selectedModel === 'astra' ? astraReady : solReady
    if (!selectedReady || prompt.trim().length < 3 || prompt.length > 2000 || (selectedModel !== 'astra' && photos.length) || photos.length > 1) return
    flags.submit = true; setBusy(true); setError(''); setNotice(''); setDemoPrompt('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), selectedModel === 'astra' ? 70_000 : 45_000)
    try {
      const response = await fetch('/api/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': crypto.randomUUID() },
        signal: controller.signal,
        body: JSON.stringify({
          worldId: 'enchanted-ai-shop',
          prompt: prompt.trim(),
          mode: 'live',
          model: selectedModel,
          ...(selectedModel === 'astra' && photos[0] ? { image: photos[0].dataUrl } : {}),
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        if ([429, 503].includes(response.status)) {
          if (selectedModel === 'astra') setAstraReady(false)
          else setSolReady(false)
        }
        throw new Error(body?.error || `${MODEL_CATALOG[selectedModel].label} could not generate this blueprint.`)
      }
      const result = validateGenerationResult(body)
      if (result.model !== MODEL_CATALOG[selectedModel].model) throw new Error('The provider did not honor your selected model. No replacement request was sent.')
      if (result.mode !== 'LIVE' || result.provenance !== 'GENERATED') throw new Error('The selected model did not return verified LIVE evidence.')
      clearPreview()
      if (mounted.current) {
        setFastPrompt(prompt.trim())
        setFastResult(result)
        setNotice(selectedModel === 'astra'
          ? 'GPT-6 ASTRA blueprint/specification ready. The downloadable GLB is generated locally from the validated Astra result. Detailed multi-call Oracle/Blender mesh generation remains a separate beta path.'
          : `${MODEL_CATALOG[selectedModel].label} specification ready. The visible 3D is a lightweight procedural draft.`)
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error && e.name === 'AbortError' ? `${MODEL_CATALOG[selectedModel].label} generation timed out. Your previous preview is unchanged.` : e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      window.clearTimeout(timeout)
      flags.submit = false
      if (mounted.current) setBusy(false)
    }
  }
  const previewDemo = () => {
    const value = prompt.trim()
    if (busy || photoBusy || value.length < 3) return
    setFastResult(null)
    setFastPrompt('')
    setDemoPrompt(value)
    setError('')
    setNotice('DEMO · MOCK local procedural preview. No OpenAI, Oracle or paid generation request was made.')
  }
  const addPhotos = async (files: FileList | null) => {
    const flags = operations.current
    if (!files || flags.photos || flags.submit || fast) return
    if (photos.length + files.length > 1) { setError('Use one reference image for the bounded ASTRA blueprint path.'); return }
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
    if (job?.downloadAllowed === false || (saved.generationProfile === FAST_DRAFT_PROFILE && !['model', 'blend'].includes(format))) return
    flags.artifact = true; setArtifactBusy(true)
    try { const blob = await coordinator.current.artifact(format, saved); download(blob, `WORLDIFACT-${saved.receipt.id}.${format === 'pbr' ? 'textures.zip' : format === 'model' ? 'glb' : format}`) }
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
  const canGenerate = !busy && !photoBusy && !artifactBusy && previousFinished && prompt.trim().length >= 3 && prompt.length <= 2000 &&
    (fast ? fastAvailable && !photos.length && purpose !== 'terrain' : astraReady && photos.length <= 1)
  const canExport = mayExportCurrentJob(saved?.receipt.id, job?.state, preview) && job?.downloadAllowed !== false
  const activeReady = fast ? fastAvailable : astraReady

  return <main className="portal-page native-shop">
    <header className="native-shop-nav"><Link to="/world" className="native-shop-back">← Back to WORLDIFAKT</Link><strong>AI Shop</strong><Link to="/account/models">My models</Link><Link to="/account/credits">Account & credits</Link><nav aria-label="World portals">{PORTALS.map(portal => <Link key={portal.id} to={portal.route}>{portal.shortTitle}</Link>)}</nav></header>
    <section className="native-shop-workspace" aria-label="Create and preview a 3D product">
      <div className="native-shop-preview">
        <span className="eyebrow">3D PREVIEW</span>
        {fastResult ? <>
          <LiveSolPreview result={fastResult} prompt={fastPrompt} />
          <small hidden data-testid="fast-result-description">{fastResult.assetSpec?.summary ?? fastResult.blueprint.title}</small>
          {dimensionsEnabled && <p className="shop-preview-dimensions">FAST draft target: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
          <small>FAST uses a generated Sol specification plus local procedural geometry. For a detailed Oracle/Blender GLB with reference images, use SLOW · QUALITY.</small>
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
          <p>{job?.reconciliationRequired ? job.detail : job?.state === 'succeeded' && job.downloadAllowed === false
            ? 'Model and texture downloads require an active subscription. Your result is preserved; a protected image preview is not available on this worker yet.'
            : terminal(job?.state)
            ? 'That job is finished. Your description is preserved; start a new model below instead of waiting on this old receipt.'
            : 'Please keep this page open. Your preview will appear here when it is ready.'}</p>
          {job?.state === 'succeeded' && job.downloadAllowed === false && <Link to="/account/credits">View subscription & credits</Link>}
          {!terminal(job?.state) && !job?.reconciliationRequired && <p>Elapsed: {Math.floor(seconds / 60)}m {seconds % 60}s</p>}
          {terminal(job?.state) && job?.state !== 'succeeded' && <button type="button" onClick={dismissFinishedJob}>Start a new model</button>}
        </div> : <>
          {!sampleMissing ? <img className="native-shop-sample" src={`${EXAMPLE_ORIGIN}/assets/model-${sampleView}.webp`} alt="Example 3D product preview" referrerPolicy="no-referrer" onError={() => setSampleMissing(true)} /> : <p>The example preview is temporarily unavailable. You can still create your own model.</p>}
          <div className="native-shop-views">{['front', 'left', 'back', 'face'].map(view => <button key={view} type="button" aria-pressed={sampleView === view} onClick={() => { setSampleView(view); setSampleMissing(false) }}>{view === 'left' ? 'Left side' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <small>Example only. Your own generated preview replaces it after generation succeeds.</small>
        </>}
        {saved && <div className="native-shop-actions"><button type="button" disabled={busy || artifactBusy} onClick={() => job?.state === 'succeeded' ? void loadResult(saved) : setRetry(v => v + 1)}>Recover this job / reload result</button>{canExport && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('model')}>Download model · GLB</button>{saved.generationProfile !== FAST_DRAFT_PROFILE && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('pbr')}>Download available PBR textures</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('fbx')}>FBX</button></>}<button type="button" disabled={artifactBusy} onClick={() => void exportFile('blend')}>Blender</button></>}</div>}
      </div>
      <div className="native-shop-form">
        <span className="eyebrow">CREATE YOUR PRODUCT</span><h1>Describe it.<br />See it in 3D.</h1><p><a href="/compare/mcc/">See the real MCC cabinet comparison: WORLDIFACT and Meshy →</a></p>
        <p>Describe your object and optionally add one reference image. Free accounts can share up to 2 Sol or Luna drafts per rolling 24 hours when funded capacity is available. Paid Astra uses one bounded server-side call and requires eligible membership.</p>
        {status && !status.accountRequired && <small>Account limits are awaiting server activation. The existing experimental generation window remains in effect.</small>}
        <p id="studio-draft-help" role="status">{saved ? previousFinished ? 'You can describe your next model while the current preview stays unchanged.' : 'You can prepare the next idea while the current model is being completed.' : 'Eligible free Sol or Luna drafts include GLB downloads. Astra costs 250 points on eligible Creator, Pro and Studio accounts after verified runtime activation.'}</p>
        <button type="button" data-testid="clear-studio-draft" disabled={busy || photoBusy} onClick={clearDraft}>Clear description</button>
        <button type="button" className="shop-internal-only" hidden disabled={busy || photoBusy} onClick={clearDraft}>Clear next-model draft</button>
        <form onSubmit={generate} aria-describedby="studio-draft-help">
          <fieldset className="shop-generation-modes" disabled={busy || photoBusy}>
            <legend>Choose generation mode</legend>
            <p>Choose the AI model before generating. One click starts one job; the selected model is never upgraded automatically.</p>
            <div className="shop-generation-mode-grid">
              <button type="button" className="shop-generation-mode" aria-label="Select GPT-6 Astra, 250 points per generation" aria-pressed={!fast} onClick={() => { setProfile('standard'); if (textureLimit === 2048) setTextureLimit(4096) }}>
                <strong>ASTRA · QUALITY BLUEPRINT</strong>
                <span>GPT-6 ASTRA · 250 points / generation</span>
                <span>Single bounded Astra call · 1 reference image · procedural GAME GLB</span>
              </button>
              <button type="button" className="shop-generation-mode" aria-label="Select GPT-6 Sol, 50 points per paid generation" aria-pressed={fast} disabled={!fastAvailable || !!photos.length || purpose === 'terrain'} onClick={() => { setProfile(FAST_DRAFT_PROFILE); setTextureLimit(2048) }}>
                <strong>FAST · DRAFT</strong>
                <span>GPT-6 SOL · 50 points / paid generation</span>
                <span>GPT-6 Sol procedural draft · text-only · usually seconds</span>
              </button>
            </div>
            <small>{!fastAvailable ? 'FAST is waiting for the verified GPT-6 Sol worker. ASTRA blueprint availability is checked separately.' : photos.length ? 'FAST is text-only in this version. Your reference images are kept for SLOW · QUALITY.' : purpose === 'terrain' ? 'FAST does not support terrain in this Shop revision. Use ASTRA · QUALITY BLUEPRINT.' : fast && prompt.length > 2000 ? 'Shorten FAST text to 2000 characters or switch to ASTRA · QUALITY BLUEPRINT.' : fast ? 'FAST sends one server-side GPT-6 Sol request and builds a lightweight procedural 3D draft from the validated result. Use ASTRA · QUALITY BLUEPRINT for the premium specification path.' : 'ASTRA creates the premium validated blueprint/spec in one bounded provider call. The downloadable GAME GLB is procedural; the separate multi-call Oracle/Blender mesh workflow remains beta.'}</small>
          </fieldset>
          <div className="shop-model-picker" role="group" aria-labelledby="studio-mode-label">
            <label id="studio-mode-label" htmlFor="studio-mode">AI model · Model AI</label>
            <select id="studio-mode" value={fast && cheapModel === 'luna' ? 'luna' : profile} disabled={busy || photoBusy} onChange={e => {
              const next = e.target.value === 'luna' ? FAST_DRAFT_PROFILE : generationProfile(e.target.value)
              setCheapModel(e.target.value === 'luna' ? 'luna' : 'sol')
              if (next === FAST_DRAFT_PROFILE && (!fastAvailable || photos.length || purpose === 'terrain')) return
              setProfile(next)
              if (next === FAST_DRAFT_PROFILE) setTextureLimit(2048)
            }}><option value="standard">GPT-6 ASTRA — 250 points · bounded blueprint</option><option value={FAST_DRAFT_PROFILE} disabled={!fastAvailable || !!photos.length || purpose === 'terrain'}>GPT-6 SOL — 50 points / paid generation</option><option value="luna" disabled={!fastAvailable || !!photos.length || purpose === 'terrain'}>GPT-6 LUNA — 15 points / paid generation</option></select>
          </div>
          <div className="shop-internal-only" hidden>
            <small>ASTRA standard selection uses the bounded server-side blueprint/spec path. Historical Oracle/Blender receipts remain recoverable, but new multi-call Oracle mesh jobs are not started from this customer form.</small>
            <label htmlFor="studio-purpose">Purpose</label><select id="studio-purpose" value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as StudioInput['purpose'])}><option value="figurine">Figurine or chess piece</option><option value="game">Game asset</option><option value="terrain" disabled={fast}>Terrain or relief</option><option value="object">Custom object</option></select>
            <label htmlFor="studio-texture">Requested texture-size ceiling</label><select id="studio-texture" value={textureLimit} disabled={busy || !!photos.length || photoBusy || fast} onChange={e => setTextureLimit(Number(e.target.value) as TextureLimit)}><option value={2048}>Up to 2K</option><option value={4096}>Up to 4K</option><option value={8192} disabled>Up to 8K · coming soon</option></select>
          </div>
          <GenerationCostNotice model={fast ? cheapModel : 'astra'} busy={busy} />
          <label htmlFor="studio-prompt">Describe your model · Prompt</label><textarea ref={promptInput} id="studio-prompt" value={prompt} maxLength={2000} rows={6} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: a realistic chess knight with a stable base, smooth material and clean details." required />
          <label className="native-shop-upload" htmlFor="studio-photos">{fast ? 'Reference images require the standard quality path' : photoBusy ? 'Preparing reference images…' : `Add one ASTRA reference image · JPG / PNG / WebP · ${photos.length}/1`}</label><input id="studio-photos" type="file" className="native-shop-file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || photoBusy || fast || photos.length >= 1} onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} /><small>ASTRA blueprint accepts one reference image in this release. Sol/Luna remain text-only.</small>
          <div className="native-shop-photos">{photos.map((photo, index) => <div key={`${index}-${photo.name}`}><img src={photo.dataUrl} alt={`Your reference ${index + 1}: ${photo.view}`} /><label>Reference {index + 1} view<select disabled={busy || photoBusy} value={photo.view} onChange={e => setPhotos(items => items.map((item, i) => i === index ? { ...item, view: e.target.value as StudioPhoto['view'] } : item))}>{PHOTO_VIEWS.map(view => <option key={view} value={view}>{view.replace('_', ' ')}</option>)}</select></label><button type="button" disabled={busy || photoBusy} onClick={() => setPhotos(items => items.filter((_, i) => i !== index))}>Remove reference {index + 1}</button></div>)}</div>
          <ProjectAttachmentPicker scope="shop" disabled={busy || photoBusy} />
          <button className="native-shop-generate" type="submit" disabled={!canGenerate}>{busy ? 'Creating your model…' : fast ? `Generate ${MODEL_CATALOG[cheapModel].label} draft · ${MODEL_CATALOG[cheapModel].creditsPerGeneration} points or funded free allowance` : 'Generate GPT-6 Astra blueprint · 250 points'}</button><small>Free: up to 2 shared Sol/Luna drafts per rolling 24 hours when funded capacity is available. Paid Luna uses 15 points, Sol 50 and Astra 250. Astra requires eligible membership and verified runtime activation. There is no free Astra fallback. Manufacturing and delivery are separate.</small>
        </form>
        <div className="shop-customer-status" role="status"><strong>{checking ? 'Checking availability…' : activeReady ? fast ? 'FAST Sol generation available' : 'ASTRA blueprint generation available' : 'Generation temporarily unavailable'}</strong><p>{activeReady ? fast ? 'FAST creates a generated Sol specification and lightweight procedural 3D draft.' : 'ASTRA creates a validated premium specification and a procedural downloadable GAME GLB in one bounded call.' : 'You can still test the Shop with the local DEMO preview while the selected LIVE path is unavailable.'}</p>{!activeReady && <button type="button" className="native-shop-demo-button" disabled={busy || photoBusy || prompt.trim().length < 3} onClick={previewDemo}>Preview DEMO · no API cost</button>}<button type="button" disabled={checking} onClick={() => void refresh()}>Refresh availability</button></div>
        <div className="native-shop-connection shop-internal-only" hidden role="status"><strong>{checking ? 'Checking connection…' : status?.ready ? 'Connector ready' : 'Generation not ready'}</strong><p>{status ? REASONS[status.reason] || 'Generation status requires review.' : 'A read-only check is required before a paid request can start.'}</p>{status?.allowance && <p>Approved remaining attempts: <b>{status.allowance.remaining}</b> · already reserved: {status.allowance.used}</p>}</div>
        {status?.reason === 'OWNER_ACCESS_REQUIRED' && <label className="shop-internal-only" hidden>Existing owner access code<input type="password" autoComplete="off" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Not an OpenAI API key" /></label>}
        {error && <p className="native-shop-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <p className="shop-beta-note"><strong>Experimental beta.</strong> Manufacturing requires a real production review before an order can be completed. Delivery times can change if the supplier requests another safety or geometry check.</p>
      </div>
    </section>
    <StudioGallery compact />
    <ShopManufacturingOptions dimensions={dimensions} dimensionsEnabled={dimensionsEnabled} hasGeneratedModel={!!preview && preview.origin === 'job'} onDimensionsChange={setDimensions} onDimensionsEnabledChange={setDimensionsEnabled} onPrepareIssDraft={prepareIssDraft} />
    <section className="shop-internal-only" hidden aria-labelledby="studio-archive-title"><h2 id="studio-archive-title">Your models · device archive</h2><p>Completed originals are saved on this device, not automatically published to a store. Clearing browser storage removes this archive; keep explicit file backups.</p><label>Find a saved model<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions" /></label><div className="native-shop-archive">{archive.filter(item => item.prompt.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id}><strong>{item.prompt}</strong><small>{(item.byteLength / 1048576).toFixed(1)} MB · UNREVIEWED</small><button type="button" disabled={busy || (!!saved && !terminal(job?.state)) || artifactBusy} onClick={() => void openArchived(item)}>Open saved model</button></article>)}</div>{archive.length === 0 && <p>No models saved on this device yet. Existing private Froge archives have not been copied or deleted.</p>}</section>
    <footer className="shop-customer-footer"><Link to="/world">WORLDIFAKT</Link><p>Experimental beta. Subscription and credit purchases require the payment service to be configured. Manufacturing orders require a separate production review.</p><a className="shop-internal-only" hidden href={REFERENCE_LINKS.modelGenerator} target="_blank" rel="noopener noreferrer">Original Froge Studio</a></footer>
  </main>
}
