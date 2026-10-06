import { STUDIO_PRICING, type StudioBudgetTier } from '../lib/studioPricing'
import { hasStudioBudgetConsent, studioBudgetFailureAdvice, studioBudgetSelection, studioTiersReady } from '../lib/studioTierSelection'
import { detailedUnavailable, DETAILED_REFERENCE_LIMIT } from '../lib/detailedStudio'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MODEL_CATALOG, type DraftModel, type GenerationModel } from '../lib/modelCatalog'
import OracleModelPreview from '../components/OracleModelPreview'
import GenerationProgressOrb from '../components/GenerationProgressOrb'
import DemoShopPreview from '../components/DemoShopPreview'
import ShopManufacturingOptions from '../components/ShopManufacturingOptions'
import ProjectAttachmentPicker from '../components/ProjectAttachmentPicker'
import StudioGallery from '../components/StudioGallery'
import GenerationCostNotice, { nextGenerationQuoteMessage } from '../components/GenerationCostNotice'
import LiveSolPreview from '../components/LiveSolPreview'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import { StudioCoordinator, checkStudio, type SavedStudioJob } from '../lib/studioClient'
import { prepareStudioPhoto } from '../lib/studioPhotos'
import { listStudioModels, readStudioModel, saveStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { mayExportCurrentJob, type StudioPreviewIdentity } from '../lib/studioView'
import { canSubmitNewDraft } from '../lib/studioDraft'
import { useAccount } from '../lib/account'
import { useGenerationQuote } from '../lib/useGenerationQuote'
import { inspectGLB } from '../lib/glb'
import { DEFAULT_DIMENSIONS_MM, type ClientDimensions } from '../lib/shopManufacturing'
import { type GenerationResult } from '../lib/blueprint'
import { formatStudioGenerationDuration, JOB_DETAILS, PHOTO_VIEWS, STUDIO_POLL_MS, FAST_DRAFT_PROFILE, generationProfile, type GenerationProfile, type StudioInput, type StudioPhoto, type StudioJob, type StudioStatus, type TextureLimit } from '../lib/studioProtocol'
import { blueprintAdmissionDetail, isAdmissionFailureCode } from '../lib/generationAdmission'
import { BlueprintClient, type BlueprintRecovery } from '../lib/blueprintClient'
import { BLUEPRINT_PROMPT_LIMIT, BLUEPRINT_REFERENCE_LIMIT, BLUEPRINT_REFERENCE_BYTES, blueprintDelivery, blueprintReferences, type BlueprintDelivery } from '../lib/blueprintRequest'
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
  link.href = url; link.download = name; link.hidden = true
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
type Preview = StudioPreviewIdentity & { blob: Blob; url: string; warning: string }
async function checkGenerationReady(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { sol: false, luna: false, astra: false }
  const value = await response.json() as { generationReady?: unknown; model?: unknown; qualityModel?: unknown; astraBlueprintReady?: unknown; lunaBlueprintReady?: unknown; draftModels?: unknown }
  return {
    sol: value.generationReady === true && value.model === 'gpt-6.1-sol',
    luna: value.generationReady === true && (value.lunaBlueprintReady === true || (value.lunaBlueprintReady === undefined && Array.isArray(value.draftModels) && value.draftModels.includes('luna'))),
    astra: value.generationReady === true && value.qualityModel === 'gpt-6-astra' && value.astraBlueprintReady === true,
  }
}

/** Draft inputs are separate from the immutable submitted job and its result. */
export default function ShopPage() {
  const location = useLocation()
  const { user, loading: accountLoading } = useAccount()
  const accountOwner = user?.id ?? null
  const pendingCharacter = useRef(typeof location.state?.worldPrompt === 'string' && location.state.worldPrompt.length <= BLUEPRINT_PROMPT_LIMIT ? location.state.worldPrompt : '')
  const coordinator = useRef<StudioCoordinator | null>(null)
  const mounted = useRef(false), epoch = useRef(0), objectUrl = useRef('')
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const deliveryInput = useRef<HTMLSelectElement>(null)
  const operations = useRef({ submit: false, artifact: false, photos: false, status: false })
  const [prompt, setPrompt] = useState('')
  const [purpose, setPurpose] = useState<StudioInput['purpose']>('figurine')
  const [textureLimit, setTextureLimit] = useState<TextureLimit>(4096)
  const [profile, setProfile] = useState<GenerationProfile>('standard')
  const [cheapModel, setCheapModel] = useState<DraftModel>('sol')
  const [budgetTier, setBudgetTier] = useState<StudioBudgetTier>('standard')
  const [acceptedBudgetRevision, setAcceptedBudgetRevision] = useState<object | null>(null)
  const [photos, setPhotos] = useState<StudioPhoto[]>([])
  const [deliverable, setDeliverable] = useState<BlueprintDelivery>('procedural-blueprint')
  const blueprintClient = useRef<BlueprintClient | null>(null)
  const [recoveryOwner, setRecoveryOwner] = useState<{ id: string; owner: string } | null>(null)
  const [recovery, setRecovery] = useState<BlueprintRecovery | null>(null)
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saved, setSaved] = useState<SavedStudioJob | null>(null)
  const [job, setJob] = useState<StudioJob | null>(null)
  const [cloudChecking, setCloudChecking] = useState(true)
  const [discoveredOwner, setDiscoveredOwner] = useState<string | null>(null)
  const [recoveryError, setRecoveryError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [retry, setRetry] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [artifactBusy, setArtifactBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [persistedPreview, setPersistedPreview] = useState<{ jobId: string; blob: Blob } | null>(null)
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
  const [lunaReady, setLunaReady] = useState(false)
  const [astraReady, setAstraReady] = useState(false)
  const fast = profile === FAST_DRAFT_PROFILE
  const fastAvailable = cheapModel === 'luna' ? lunaReady : solReady
  const previousFinished = canSubmitNewDraft(saved?.receipt.id, job)
  const detailed = blueprintDelivery({ prompt, deliverable }, photos.length) === 'detailed-mesh'
  const detailedProblem = detailed ? (fast ? 'Select Astra for a detailed model. The selected model will never be upgraded automatically.' : detailedUnavailable(status, photos.length)) : null
  const tiersReady = studioTiersReady(status)
  const selectedTier = detailed && tiersReady ? budgetTier : undefined
  const draftBudgetRevision = useMemo(() => ({ prompt, purpose, textureLimit, photos, profile, deliverable, budgetTier, accountOwner, owner, tiersReady, pricingRevision: status?.pricingRevision }), [prompt, purpose, textureLimit, photos, profile, deliverable, budgetTier, accountOwner, owner, tiersReady, status?.pricingRevision])
  const budgetAccepted = hasStudioBudgetConsent(budgetTier, acceptedBudgetRevision, draftBudgetRevision)
  const selectedPoints = selectedTier ? STUDIO_PRICING[selectedTier].points : 250
  const accountQuote = useGenerationQuote(fast ? cheapModel : 'astra', busy, detailed, selectedTier)
  const accountReady = accountQuote.quote.state === 'credits' || accountQuote.quote.state === 'free'
  const fundingBlocked = accountQuote.quote.state === 'blocked' && accountQuote.quote.reason === 'PROVIDER_BUDGET_EXHAUSTED'
  const recoveryAccountMismatch = !!accountOwner && !!saved && recoveryOwner?.id === saved.receipt.id && recoveryOwner.owner !== accountOwner
  const savedJob = saved && job?.id === saved.receipt.id ? job : null
  const savedStatusUnknown = savedJob?.state === 'failed' && !savedJob.failureCode && savedJob.detail !== JOB_DETAILS.failed
  const savedStatusLabel = savedStatusUnknown || !savedJob ? 'unknown' : savedJob.reconciliationRequired ? 'needs a status review' : savedJob.state === 'pending' ? 'awaiting acceptance confirmation' : savedJob.state
  const receiptDate = saved && Number.isFinite(Date.parse(saved.receipt.createdAt)) ? new Date(saved.receipt.createdAt) : null
  const detailedAvailabilityMessage = detailedProblem ? `Next generation: ${detailedProblem}` : null
  const cloudRecoveryPending = cloudChecking || accountLoading || recoveryAccountMismatch || (!!accountOwner && !saved && discoveredOwner !== accountOwner)
  const currentRequestMessage = busy ? 'Wait for the submitted request to be confirmed before generating again.' : !previousFinished && saved ? `Recover selected job ${saved.receipt.id} before starting another generation.` : recovery?.state === 'pending' ? `Recover blueprint request ${recovery.id} before starting another generation.` : null
  const photoLimit = DETAILED_REFERENCE_LIMIT
  const updateCredits = () => { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('worldifact:balance-changed')) }

  const clearPreview = () => {
    epoch.current++
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    setPreview(null)
    setPersistedPreview(null)
    return epoch.current
  }
  const dismissFinishedJob = async () => {
    const client = coordinator.current
    if (!client || !saved || !terminal(job?.state) || operations.current.submit || operations.current.artifact) return
    try {
      await client.dismissCurrent(owner)
      clearPreview()
      setSaved(null)
      setDiscoveredOwner(accountOwner)
      setJob(null)
      setSeconds(0)
      setError('')
      setNotice('The finished cloud job was archived. Your description is still here and you can explicitly start a new model.')
      promptInput.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The finished cloud job could not be dismissed safely.')
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
    flags.status = true; setChecking(true); accountQuote.refresh()
    const [studioCheck, generationCheck] = await Promise.allSettled([checkStudio(fetch, owner), checkGenerationReady(fetch)])
    if (mounted.current) {
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      if (generationCheck.status === 'fulfilled') { setSolReady(generationCheck.value.sol); setLunaReady(generationCheck.value.luna); setAstraReady(generationCheck.value.astra) }
      else { setSolReady(false); setLunaReady(false); setAstraReady(false) }
      if (studioCheck.status === 'fulfilled' || (generationCheck.status === 'fulfilled' && (generationCheck.value.sol || generationCheck.value.luna || generationCheck.value.astra))) setServiceError('')
      else setServiceError('Generation services are temporarily unavailable. Your draft is preserved.')
    }
    flags.status = false
    if (mounted.current) setChecking(false)
  }
  useEffect(() => {
    mounted.current = true
    let closed = false
    const version = epoch, urls = objectUrl, flags = operations.current
    try {
      const directClient = new BlueprintClient(window.localStorage, fetch)
      blueprintClient.current = directClient
      setRecovery(directClient.current())
      const client = new StudioCoordinator(window.localStorage)
      const restored = client.restore()
      coordinator.current = client
      if (restored) {
        setSaved(restored); setPrompt(restored.prompt)
        setProfile(restored.generationProfile || 'standard')
        setDeliverable(restored.generationProfile === FAST_DRAFT_PROFILE ? 'procedural-blueprint' : 'detailed-mesh')
        if (restored.generationProfile === FAST_DRAFT_PROFILE) setTextureLimit(2048)
        setJob({ id: restored.receipt.id, state: 'pending', detail: JOB_DETAILS.pending })
        setCloudChecking(false)
      }
    } catch (e) {
      coordinator.current = null
      setRecoveryError(e instanceof Error ? e.message : 'Recovery storage is unavailable. Generation is paused.')
    }
    flags.status = true; setChecking(true)
    Promise.allSettled([checkStudio(), checkGenerationReady()]).then(([studioCheck, generationCheck]) => {
      if (closed) return
      if (studioCheck.status === 'fulfilled') applyStatus(studioCheck.value)
      else setStatus(null)
      if (generationCheck.status === 'fulfilled') { setSolReady(generationCheck.value.sol); setLunaReady(generationCheck.value.luna); setAstraReady(generationCheck.value.astra) }
      else { setSolReady(false); setLunaReady(false); setAstraReady(false) }
      if (studioCheck.status === 'rejected' && !(generationCheck.status === 'fulfilled' && (generationCheck.value.sol || generationCheck.value.luna || generationCheck.value.astra)))
        setServiceError('The generation services are unavailable. You can still prepare your description and use the local DEMO preview.')
    }).finally(() => { if (!closed) { flags.status = false; setChecking(false) } })
    listStudioModels().then(value => { if (!closed) setArchive(value) }).catch(() => {})
    return () => { closed = true; mounted.current = false; version.current++; if (urls.current) URL.revokeObjectURL(urls.current) }
  }, [])

  useEffect(() => {
    const client = coordinator.current
    if (accountLoading || !client) return
    if (!accountOwner) {
      setCloudChecking(false)
      setDiscoveredOwner(null)
      setRecoveryError('Sign in to recover your account models and check generation availability. Your draft and saved receipts are preserved.')
      return
    }
    if (client.current) { setCloudChecking(false); setRecoveryError(''); return }
    let closed = false, failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    setCloudChecking(true); setRecoveryError('')
    const recoverCloud = async () => {
      try {
        const recovered = await client.recoverCurrent('', controller.signal)
        if (closed) return
        if (recovered) {
          setSaved(recovered.saved); setPrompt(value => value || recovered.saved.prompt)
          setProfile(recovered.saved.generationProfile || 'standard')
          setDeliverable(recovered.saved.generationProfile === FAST_DRAFT_PROFILE ? 'procedural-blueprint' : 'detailed-mesh')
          setJob(recovered.job)
          setNotice('Recovered your active cloud model. No new generation or point charge was started.')
        } else if (pendingCharacter.current) {
          const characterPrompt = pendingCharacter.current
          setPrompt(value => value || characterPrompt)
          setNotice('Character brief copied from your private world. Review model and points before generating.')
          pendingCharacter.current = ''
        }
        setRecoveryError(''); setDiscoveredOwner(accountOwner); setCloudChecking(false)
      } catch (e) {
        if (closed) return
        const authRequired = e && typeof e === 'object' && 'status' in e && e.status === 401
        setRecoveryError(authRequired ? 'Sign in again to recover your account models. No new generation was started; your draft and saved receipts are preserved.' : e instanceof Error ? e.message : 'Cloud recovery is temporarily unavailable. No new generation was started.')
        // Health success cannot clear a failed account lookup. Retry only GET;
        // unavailable discovery never unlocks a new paid submission.
        failures++
        timer = setTimeout(recoverCloud, Math.min(120_000, 5_000 * (2 ** Math.min(failures, 4))))
      }
    }
    void recoverCloud()
    return () => { closed = true; controller.abort(); if (timer) clearTimeout(timer) }
  }, [accountLoading, accountOwner])

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
        if (mounted.current && token === epoch.current) setPersistedPreview({ jobId: selected.receipt.id, blob })
        const entries = await listStudioModels()
        if (mounted.current && token === epoch.current) { setArchive(entries); setNotice('Your preview is ready.') }
      } catch (e) { if (mounted.current && token === epoch.current) setNotice(e instanceof Error ? e.message : 'The preview is ready, but local recovery storage is unavailable.') }
    } catch (e) { if (mounted.current && token === epoch.current) setError(e instanceof Error ? e.message : 'Could not load the model. Retry the same result.') }
    finally { flags.artifact = false; if (mounted.current && token === epoch.current) setArtifactBusy(false) }
  }
  useEffect(() => {
    if (!saved || !coordinator.current || accountLoading || !accountOwner) return
    if (recoveryOwner?.id === saved.receipt.id && recoveryOwner.owner !== accountOwner) {
      setRecoveryError('Sign in to the original account to recover this model. The same receipt and current preview are preserved.')
      return
    }
    if (recoveryOwner?.id !== saved.receipt.id) setRecoveryOwner({ id: saved.receipt.id, owner: accountOwner })
    const selected = saved, client = coordinator.current
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, failures = 0
    const poll = async () => {
      if (stopped) return
      if (operations.current.submit) { timer = setTimeout(poll, 1500); return }
      try {
        const value = await client.poll(selected)
        if (stopped) return
        failures = 0; setJob(value); setError('')
        if (value.reconciliationRequired) {
          setNotice('')
          setSeconds(0)
          if (value.state === 'succeeded' && value.downloadAllowed) { updateCredits(); void loadResult(selected, value); return }
          if (!stopped) timer = setTimeout(poll, 60_000)
          return
        }
        if (value.state === 'succeeded') { updateCredits(); void loadResult(selected, value); return }
        if (value.state === 'failed' || value.state === 'cancelled') {
          updateCredits()
          setSeconds(0)
          // Keep the terminal cloud job selected until the user explicitly
          // dismisses it. This prevents the UI from falling back to the sample
          // image and makes the refund/failure state visible and recoverable.
          // The selected-job panel owns this detail; a generic notice beside
          // the next quote would wrongly look like a new-request failure.
          setNotice('')
          return
        }
      } catch (e) {
        if (stopped) return
        failures++
        setError(e instanceof Error ? e.message : 'Status temporarily unavailable. The same cloud job will keep retrying.')
        setNotice('Cloud status is temporarily unavailable. WORLDIFACT will keep recovering this exact job; do not start another paid generation.')
        if (!stopped) timer = setTimeout(poll, Math.min(120_000, 5_000 * (2 ** Math.min(failures, 4))))
        return
      }
      if (!stopped) timer = setTimeout(poll, STUDIO_POLL_MS)
    }
    timer = setTimeout(poll, 1500)
    return () => { stopped = true; if (timer) clearTimeout(timer) }
    // Draft edits must not restart the selected job's request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.receipt.id, retry, accountLoading, accountOwner, recoveryOwner])
  useEffect(() => {
    if (!saved || terminal(job?.state) || job?.reconciliationRequired) return
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(saved.startedAt)) / 1000)))
    tick(); const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [saved, job?.state, job?.reconciliationRequired])

  const applyBlueprint = (result: GenerationResult, submittedPrompt: string) => {
    clearPreview()
    if (!mounted.current) return
    setFastPrompt(submittedPrompt)
    setFastResult(result)
    setRecovery(blueprintClient.current?.current() ?? null)
    setNotice('AI specification ready. The GLB contains local procedural geometry, not a detailed character or faithful reference reconstruction. Your request can be recovered without paying again.')
  }
  const recoverBlueprint = async () => {
    if (operations.current.submit || !blueprintClient.current) return
    operations.current.submit = true; setBusy(true); setError('')
    try { applyBlueprint(await blueprintClient.current.recover(), 'Recovered account result. The original private prompt is not stored on this device.') }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Recovery is temporarily unavailable.') }
    finally {
      operations.current.submit = false
      if (mounted.current) { setBusy(false); setRecovery(blueprintClient.current.current()); updateCredits() }
    }
  }
  const newBlueprintAttempt = () => {
    if (operations.current.submit || recovery?.state === 'pending' || !blueprintClient.current) return
    if (!window.confirm('Start a NEW paid attempt on your next Generate click? Recovering the existing result costs no additional points.')) return
    try { blueprintClient.current.reset(); setRecovery(null); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Recovery could not be cleared.') }
  }
  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    const flags = operations.current, directClient = blueprintClient.current
    if (cloudRecoveryPending || flags.status || flags.submit || flags.photos || flags.artifact || !previousFinished || !directClient) return
    if (!accountReady) { setError(nextGenerationQuoteMessage(accountQuote.quote)); return }
    if (recovery?.state === 'pending') { setError('Recover the pending blueprint request before starting another model.'); return }
    if (detailed) {
      const client = coordinator.current
      if (detailedProblem || !client) { setError(detailedProblem || 'Model recovery storage is unavailable. No generation was started.'); return }
      if (budgetTier === 'extended' && (!tiersReady || !budgetAccepted)) { setError('Review and explicitly accept 500 points for this draft before generating.'); return }
      if (prompt.trim().length < 3 || prompt.length > Math.min(BLUEPRINT_PROMPT_LIMIT, status?.promptMaxLength ?? 0)) return
      flags.submit = true; setBusy(true); setError(''); setNotice('')
      try {
        const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: prompt.trim(), purpose, textureMaxSize: textureLimit, photos: photos.map(photo => ({ ...photo })), ...(selectedTier ? studioBudgetSelection(selectedTier, budgetAccepted) : {}) }
        const created = await client.start(input, selected => {
          if (!mounted.current) return
          clearPreview(); setFastResult(null); setFastPrompt(''); setDemoPrompt(''); setAcceptedBudgetRevision(null)
          setSaved(selected); setJob({ id: selected.receipt.id, state: 'pending', detail: JOB_DETAILS.pending }); setSeconds(0)
          setNotice('Uploading your description and reference images once. Generation has not been confirmed yet. Keep this page open until the upload is accepted.')
        }, owner, !!saved)
        if (mounted.current) { setJob(created); setNotice(terminal(created.state) || created.reconciliationRequired ? '' : created.detail) }
      } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'The detailed model request could not be confirmed. Recover this same job.') }
      finally { flags.submit = false; if (mounted.current) { setBusy(false); updateCredits() } }
      return
    }
    const selectedModel: GenerationModel = fast ? cheapModel : 'astra'
    const selectedReady = selectedModel === 'astra' ? astraReady : selectedModel === 'luna' ? lunaReady : solReady
    if (!selectedReady || prompt.trim().length < 3 || prompt.length > BLUEPRINT_PROMPT_LIMIT || (selectedModel !== 'astra' && photos.length) || photos.length > BLUEPRINT_REFERENCE_LIMIT) return
    flags.submit = true; setBusy(true); setError(''); setNotice(''); setDemoPrompt('')
    const controller = new AbortController()
    // Includes preflight and durable settlement. A client timeout never means a new job.
    const timeout = window.setTimeout(() => controller.abort(), selectedModel === 'astra' ? 95_000 : 65_000)
    const submittedPrompt = prompt.trim()
    try {
      const references = blueprintReferences({ references: photos.map(photo => ({ dataUrl: photo.dataUrl, view: photo.view })) })
      const result = await directClient.submit({ worldId: 'enchanted-ai-shop', prompt: submittedPrompt, mode: 'live', model: selectedModel, deliverable: 'procedural-blueprint', references }, controller.signal)
      applyBlueprint(result, submittedPrompt)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error && e.name === 'AbortError' ? 'The connection timed out. Recover this same request below; do not start a second paid generation.' : e instanceof Error ? e.message : 'Generation failed. Recover this same request.')
    } finally {
      window.clearTimeout(timeout)
      flags.submit = false
      if (mounted.current) { setBusy(false); setRecovery(directClient.current()); updateCredits() }
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
    if (photos.length + files.length > DETAILED_REFERENCE_LIMIT) { setError('The detailed worker accepts up to four reference views. Add one to four photos; none will be silently omitted.'); return }
    flags.photos = true; setPhotoBusy(true); setError('')
    try {
      const additions: StudioPhoto[] = [], views = ['front', 'left', 'right', 'back', 'detail', 'other'] as const
      for (const file of Array.from(files)) additions.push(await prepareStudioPhoto(file, textureLimit, views[photos.length + additions.length]))
      const all = [...photos, ...additions]
      blueprintReferences({ references: all.map(photo => ({ dataUrl: photo.dataUrl, view: photo.view })) })
      if (mounted.current) { setPhotos(all); setDeliverable('detailed-mesh'); setNotice('All selected views are retained for Astra/Blender. Review availability and cost, then start one explicit model job. Uploading does not generate or charge.') }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Photo preparation failed.') }
    finally { flags.photos = false; if (mounted.current) setPhotoBusy(false) }
  }
  const clearDraft = () => {
    if (operations.current.submit || operations.current.photos) return
    if ((prompt || photos.length) && !window.confirm('Clear only the new description and reference images? The displayed model, archive and recovery receipt stay unchanged.')) return
    setPrompt(''); setPhotos([]); setDeliverable('procedural-blueprint'); setError('')
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
    flags.artifact = true; setArtifactBusy(true); setError('')
    try {
      // A loaded current-job GLB has already passed the rights and identity
      // checks. Download those exact bytes without spending another GET slot.
      const blob = format === 'model' && preview?.origin === 'job' && preview.id === saved.receipt.id && preview.blob.size
        ? preview.blob : await coordinator.current.artifact(format, saved)
      download(blob, `WORLDIFACT-${saved.receipt.id}.${format === 'pbr' ? 'textures.zip' : format === 'model' ? 'glb' : format}`)
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
  const canGenerate = accountReady && !cloudRecoveryPending && !checking && !busy && !photoBusy && !artifactBusy && previousFinished && prompt.trim().length >= 3 && prompt.length <= BLUEPRINT_PROMPT_LIMIT && recovery?.state !== 'pending' &&
    (detailed ? !detailedProblem && (budgetTier === 'standard' || (tiersReady && budgetAccepted)) && prompt.length <= (status?.promptMaxLength ?? 0) : fast ? fastAvailable && !photos.length && purpose !== 'terrain' : astraReady && photos.length <= BLUEPRINT_REFERENCE_LIMIT)
  const progressArtifact = saved && preview?.origin === 'job' && preview.id === saved.receipt.id && !preview.warning && persistedPreview?.jobId === saved.receipt.id && persistedPreview.blob === preview.blob
    ? { jobId: saved.receipt.id, validated: true, saved: true } : undefined
  const canExport = mayExportCurrentJob(saved?.receipt.id, job?.state, preview) && job?.downloadAllowed !== false
  const runtimeReady = detailed ? !detailedProblem : fast ? fastAvailable : astraReady
  const activeReady = runtimeReady && accountReady && !cloudRecoveryPending && !currentRequestMessage

  return <main className="portal-page native-shop">
    <header className="native-shop-nav"><Link to="/world" className="native-shop-back">← Back to WORLDIFAKT</Link><strong>AI Shop</strong><Link to="/account/models">My models</Link><Link to="/account/credits">Account & credits</Link><nav aria-label="World portals">{PORTALS.map(portal => <Link key={portal.id} to={portal.route}>{portal.shortTitle}</Link>)}</nav></header>
    <section className="native-shop-workspace" data-working={busy || (!!saved && !terminal(savedJob?.state))} aria-label="Create and preview a 3D product">
      <div className="native-shop-preview">
        <span className="eyebrow">3D PREVIEW</span>
        {(busy || recovery?.failureCode) && (preview || fastResult || demoPrompt) && <p role="status"><strong>Previous preview preserved.</strong> {recovery?.failureCode ? <>The rejected request did not create this model. {blueprintAdmissionDetail(recovery.failureCode)}</> : 'The current request does not have a new preview yet.'}</p>}
        {cloudRecoveryPending && !saved ? <div className="native-shop-progress" role="status"><h2>{accountLoading ? 'Checking your account…' : recoveryError ? 'Cloud recovery needs attention' : 'Checking your cloud job…'}</h2><p>{recoveryError || 'WORLDIFACT is checking whether this account already has a model in progress. This never starts a new generation or point charge.'}</p></div> : fastResult ? <>
          <LiveSolPreview result={fastResult} prompt={fastPrompt} />
          <small hidden data-testid="fast-result-description">{fastResult.assetSpec?.summary ?? fastResult.blueprint.title}</small>
          {dimensionsEnabled && <p className="shop-preview-dimensions">FAST draft target: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
          <small>This result is a procedural blueprint, not a faithful image-to-mesh reconstruction. Choose Detailed 3D model for the separate Astra/Blender workflow.</small>
        </> : demoPrompt ? <>
          <DemoShopPreview prompt={demoPrompt} />
          {dimensionsEnabled && <p className="shop-preview-dimensions">Preview size target: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
          <small>This DEMO preview is not a generated production mesh and is not manufacturing-ready.</small>
        </> : preview ? <>
          {preview.url ? <OracleModelPreview url={preview.url} label="Your 3D product preview" targetDimensionsMm={dimensionsEnabled ? [dimensions.xMm, dimensions.yMm, dimensions.zMm] : undefined} customerMode /> : <p role="status">This preview could not be displayed. Your generation result is preserved.</p>}
          <small hidden data-testid="result-description">Submitted description: {preview.label}</small>
          {dimensionsEnabled && <p className="shop-preview-dimensions">Preview size: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b></p>}
        </> : saved ? <div className="native-shop-progress">
          <GenerationProgressOrb visualOnly job={savedStatusUnknown || !savedJob ? { id: saved.receipt.id, state: 'pending', detail: 'Recover the same saved request to verify its current state. No new generation is started.', reconciliationRequired: true } : savedJob} trackedSeconds={!terminal(savedJob?.state) && !savedJob?.reconciliationRequired ? seconds : undefined} />
          <p style={{ overflowWrap: 'anywhere' }}>Selected saved job: {saved.receipt.id} · Status: {savedStatusLabel}</p>
          <h2>{job?.reconciliationRequired ? 'Model needs a status review' : job?.state === 'succeeded' ? 'Your SLOW model is ready' : savedStatusUnknown ? 'Saved request needs a recovery check' : isAdmissionFailureCode(job?.failureCode) ? 'Generation was not started' : job?.failureCode === 'MISSING_SUBMISSION' ? 'The upload was not confirmed' : job?.state === 'failed' ? 'Saved request did not finish' : job?.state === 'cancelled' ? 'Saved request was cancelled' : busy ? 'Uploading your model request…' : job?.state === 'pending' ? 'Checking whether your request was accepted…' : 'Preparing your model…'}</h2>
          <p>{job?.reconciliationRequired ? job.detail : job?.state === 'succeeded' && job.downloadAllowed === false
            ? 'Model and texture downloads require an active subscription. Your result is preserved; a protected image preview is not available on this worker yet.'
            : terminal(job?.state)
            ? job?.state === 'succeeded' ? 'Your model is complete. Recover this job to reload the same result.' : job?.state === 'cancelled' ? job.detail : job && (job.failureCode || job.detail !== JOB_DETAILS[job.state]) ? job.detail : 'That job is finished, but its original failure reason was not saved. Keep the job ID below for diagnosis. Your description is preserved; no automatic retry was started.'
            : busy ? 'Your description and photos are being uploaded. This receipt identifies your request; it does not yet confirm that generation has started.'
            : job?.state === 'pending' ? JOB_DETAILS.pending : 'The generator accepted this job. Return to this browser to recover the same job; no second generation is needed.'}</p>
          {job?.state === 'succeeded' && job.downloadAllowed === false && <Link to="/account/credits">View subscription & credits</Link>}
          {terminal(job?.state) && job?.state !== 'succeeded' && <button type="button" onClick={() => void dismissFinishedJob()}>Start a new model</button>}
        </div> : busy && !recovery ? <div className="native-shop-progress" role="status"><h2>Submitting your blueprint request…</h2><p>No result for this request is displayed yet. Keep this page open while its status is confirmed.</p></div> : recovery ? <div className="native-shop-progress" role="status">
          <h2>{recovery.failureCode ? 'Generation was not started' : recovery.state === 'failed' ? 'Previous blueprint attempt did not finish' : recovery.state === 'completed' ? 'Your blueprint result can be recovered' : 'Checking whether your blueprint request was accepted…'}</h2>
          <p>{recovery.failureCode ? blueprintAdmissionDetail(recovery.failureCode) : 'No result for this request is displayed. Recover the same request below; this does not start another paid generation.'}</p>
          <p>Request ID: {recovery.id}{recovery.failureCode && <> · Reason: {recovery.failureCode}</>}</p>
        </div> : <>
          {!sampleMissing ? <img className="native-shop-sample" src={`${EXAMPLE_ORIGIN}/assets/model-${sampleView}.webp`} alt="Example 3D product preview" referrerPolicy="no-referrer" onError={() => setSampleMissing(true)} /> : <p>The example preview is temporarily unavailable. You can still create your own model.</p>}
          <div className="native-shop-views">{['front', 'left', 'back', 'face'].map(view => <button key={view} type="button" aria-pressed={sampleView === view} onClick={() => { setSampleView(view); setSampleMissing(false) }}>{view === 'left' ? 'Left side' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <small>Example only. Your own generated preview replaces it after generation succeeds.</small>
        </>}
        {saved && terminal(savedJob?.state) && <p className="shop-recorded-generation-time">Recorded worker generation time: <strong>{formatStudioGenerationDuration(savedJob?.generationTiming)}</strong> · Excludes upload and queue time.</p>}
        {saved && progressArtifact && savedJob?.state === 'succeeded' && <GenerationProgressOrb compact job={savedJob} artifact={progressArtifact} />}
        {saved && <p>{(job?.pricing ?? saved.pricing) ? `Original job: ${(job?.pricing ?? saved.pricing)!.points} points · ${(job?.pricing ?? saved.pricing)!.tier} model budget. Recovery does not change this price.` : 'Original job price is retained by the server; this recovery view does not apply the next draft’s price.'}</p>}
        {studioBudgetFailureAdvice(job, tiersReady) && <p>{studioBudgetFailureAdvice(job, tiersReady)}</p>}
        {saved && <div className="native-shop-actions"><button type="button" disabled={busy || artifactBusy} onClick={() => job?.state === 'succeeded' ? void loadResult(saved) : setRetry(v => v + 1)}>Recover this job / reload result</button>{canExport && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('model')}>Download model · GLB</button>{saved.generationProfile !== FAST_DRAFT_PROFILE && <><button type="button" disabled={artifactBusy} onClick={() => void exportFile('pbr')}>Download available PBR textures</button><button type="button" disabled={artifactBusy} onClick={() => void exportFile('fbx')}>FBX</button></>}<button type="button" disabled={artifactBusy} onClick={() => void exportFile('blend')}>Blender</button></>}</div>}
      </div>
      <div className="native-shop-form">
        <span className="eyebrow">WORLDIFACT STUDIO</span><h1>Turn your idea<br />into 3D.</h1>
        <p>Describe your model, add references if needed, then choose what to create.</p>
        {status && !status.accountRequired && <small>Account limits are awaiting server activation. The existing experimental generation window remains in effect.</small>}
        <p id="studio-draft-help" role="status">{saved ? 'You can prepare the next idea while the saved request and preview stay unchanged. Check that request’s status separately.' : 'Review the selected model and its current cost before generating.'}</p>
        <button type="button" data-testid="clear-studio-draft" disabled={busy || photoBusy} onClick={clearDraft}>Clear description</button>
        <button type="button" className="shop-internal-only" hidden disabled={busy || photoBusy} onClick={clearDraft}>Clear next-model draft</button>
        <form onSubmit={generate} aria-describedby="studio-draft-help">
          <label htmlFor="studio-prompt">Describe your model · Prompt</label><textarea ref={promptInput} id="studio-prompt" value={prompt} aria-describedby="studio-prompt-count" aria-invalid={prompt.length > BLUEPRINT_PROMPT_LIMIT} rows={6} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: a compact MCC cabinet procedural concept with white panels and turquoise controls." required />
          <p id="studio-prompt-count" role="status">{prompt.length}/{BLUEPRINT_PROMPT_LIMIT} characters. Full text is preserved; shorten it before submitting when over the limit.</p>
          <label className="native-shop-upload" htmlFor="studio-photos">{fast ? 'Reference images require the standard quality path' : photoBusy ? 'Preparing reference images…' : `Add ASTRA references · JPG / PNG / WebP · ${photos.length}/${photoLimit}`}</label><input id="studio-photos" type="file" className="native-shop-file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || photoBusy || fast || photos.length >= photoLimit} onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} /><small>Up to four reference views for a detailed model: front / left / right / back. One, two or three are also accepted. Every accepted view is transmitted. Combined prepared size: {BLUEPRINT_REFERENCE_BYTES / 1048576} MB. Sol/Luna remain text-only.</small>
          <div className="native-shop-photos">{photos.map((photo, index) => <div key={`${index}-${photo.name}`}><img src={photo.dataUrl} alt={`Your reference ${index + 1}: ${photo.view}`} /><label>Reference {index + 1} view<select disabled={busy || photoBusy} value={photo.view} onChange={e => setPhotos(items => items.map((item, i) => i === index ? { ...item, view: e.target.value as StudioPhoto['view'] } : item))}>{PHOTO_VIEWS.map(view => <option key={view} value={view}>{view.replace('_', ' ')}</option>)}</select></label><button type="button" disabled={busy || photoBusy} onClick={() => setPhotos(items => items.filter((_, i) => i !== index))}>Remove reference {index + 1}</button></div>)}</div>
          <ProjectAttachmentPicker scope="shop" disabled={busy || photoBusy} />
          <label htmlFor="studio-deliverable">What should be delivered?</label>
          <select ref={deliveryInput} id="studio-deliverable" value={deliverable} disabled={busy || photoBusy} onChange={e => setDeliverable(e.target.value as BlueprintDelivery)}>
            <option value="procedural-blueprint">Procedural concept only — simple shapes, not a faithful reconstruction</option>
            <option value="detailed-mesh">Detailed 3D model — Astra + Blender</option>
          </select>
          {!fast && !detailed && <details className="shop-detailed-choice"><summary>About detailed 3D models</summary>
            <button type="button" data-testid="choose-detailed-model" disabled={busy || photoBusy} onClick={() => { if (!operations.current.submit && !operations.current.photos) { setDeliverable('detailed-mesh'); deliveryInput.current?.focus() } }}>Use detailed 3D model · Astra + Blender</button>
            <small>Select the model workflow for an editable 3D mesh. This only changes your draft; review the cost and press Generate separately.</small>
          </details>}
          <div className="shop-model-picker" role="group" aria-labelledby="studio-mode-label">
            <label id="studio-mode-label" htmlFor="studio-mode">AI model · Model AI</label>
            <select id="studio-mode" value={fast && cheapModel === 'luna' ? 'luna' : profile} disabled={busy || photoBusy} onChange={e => {
              const next = e.target.value === 'luna' ? FAST_DRAFT_PROFILE : generationProfile(e.target.value)
              const nextModel = e.target.value === 'luna' ? 'luna' : 'sol'
              if (next === FAST_DRAFT_PROFILE && (!(nextModel === 'luna' ? lunaReady : solReady) || photos.length || purpose === 'terrain')) return
              setCheapModel(nextModel)
              setProfile(next)
              if (next === FAST_DRAFT_PROFILE) { setDeliverable('procedural-blueprint'); setTextureLimit(2048) }
            }}><option value="standard">GPT-6 ASTRA — {selectedPoints} points per job</option><option value={FAST_DRAFT_PROFILE} disabled={!solReady || !!photos.length || purpose === 'terrain'}>GPT-6.1 SOL — 50 points / paid generation</option><option value="luna" disabled={!lunaReady || !!photos.length || purpose === 'terrain'}>GPT-6 LUNA — 15 points / paid generation</option></select>
          </div>
          <p className="shop-model-guidance">{detailed ? 'Detailed models use Astra + Blender. Sol and Luna create procedural concepts only.' : 'Sol and Luna are text-only procedural drafts. Astra also supports image references.'} {!solReady && !lunaReady ? 'Sol/Luna generation is awaiting verified worker readiness.' : !solReady ? 'Sol is awaiting verified worker readiness.' : !lunaReady ? 'Luna is awaiting verified worker readiness.' : ''}</p>
          <div className="shop-internal-only" hidden>
            <small>Detailed models use the signed Astra/Blender job route. Procedural concepts use the separate blueprint route. Both preserve their own recovery identifiers.</small>
            <label htmlFor="studio-purpose">Purpose</label><select id="studio-purpose" value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as StudioInput['purpose'])}><option value="figurine">Figurine or chess piece</option><option value="game">Game asset</option><option value="terrain" disabled={fast}>Terrain or relief</option><option value="object">Custom object</option></select>
            <label htmlFor="studio-texture">Requested texture-size ceiling</label><select id="studio-texture" value={textureLimit} disabled={busy || !!photos.length || photoBusy || fast} onChange={e => setTextureLimit(Number(e.target.value) as TextureLimit)}><option value={2048}>Up to 2K</option><option value={4096}>Up to 4K</option><option value={8192} disabled>Up to 8K · coming soon</option></select>
          </div>
          {detailed && status?.newJobPolicy === 'legacy-usd175-v1' && <p>One Astra/Blender model: 250 points on success, with the original USD 1.75 API budget. A failed model can still incur API costs. Existing jobs keep their saved price.</p>}
          {detailed && !tiersReady && budgetTier === 'extended' && <div role="status"><p>The selected 500-point budget is no longer available. No generation started. Choose the standard budget explicitly to continue when it is available.</p><button type="button" disabled={busy || photoBusy} onClick={() => { setBudgetTier('standard'); setAcceptedBudgetRevision(null) }}>Use standard model budget · 250 points</button></div>}
          {detailed && tiersReady && <fieldset disabled={busy || photoBusy} className="studio-budget-options">
            <legend>Detailed model budget</legend>
            <label htmlFor="studio-budget-tier">Points for one explicit model attempt</label>
            <select id="studio-budget-tier" value={budgetTier} onChange={e => { setBudgetTier(e.target.value as StudioBudgetTier); setAcceptedBudgetRevision(null) }}>
              <option value="standard">Standard model budget · 250 points</option>
              <option value="extended">Extended model budget · 500 points</option>
            </select>
            <p>Standard is the budget for one model, not your membership plan. Pro members can keep the 250-point budget. Higher complexity may need the 500-point budget. This is not a measurement of this draft. Choosing a higher budget does not guarantee completion or quality.</p>
            {budgetTier === 'extended' && <label htmlFor="studio-budget-consent"><input id="studio-budget-consent" type="checkbox" checked={budgetAccepted} onChange={e => setAcceptedBudgetRevision(e.target.checked ? draftBudgetRevision : null)} />I explicitly accept 500 points for one attempt with this description and these reference images.</label>}
            <p>No automatic upgrade, paid retry or additional debit. Editing this draft requires a new 500-point acceptance.</p>
          </fieldset>}
          {detailed && (detailedProblem || accountReady) && <p className={detailedProblem ? "native-shop-error" : "shop-beta-note"} role="status">{detailedAvailabilityMessage || (!accountReady ? nextGenerationQuoteMessage(accountQuote.quote) : cloudRecoveryPending ? recoveryError || 'Checking your account models before a new request can start.' : currentRequestMessage || "Astra/Blender is ready for one explicit model request. All attached views will be used. Output quality must be reviewed; uploading or refreshing never starts a paid job.")}</p>}
          {recovery && <div role="status"><p>Request {recovery.id} · {recovery.state}. Recovering it does not start another paid generation.</p>{recovery.failureCode && <p>{blueprintAdmissionDetail(recovery.failureCode)}</p>}<button type="button" disabled={busy} onClick={() => void recoverBlueprint()}>Recover same request · no extra charge</button>{recovery.state !== 'pending' && <button type="button" disabled={busy} onClick={newBlueprintAttempt}>Start a new paid attempt</button>}</div>}
          {detailedProblem && <p><strong>Next generation unavailable.</strong> Existing requests keep their own status and price.</p>}<GenerationCostNotice model={fast ? cheapModel : 'astra'} busy={busy} detailed={detailed} budgetTier={selectedTier} accountQuote={accountQuote} />
          <button className="native-shop-generate" type={fundingBlocked ? 'button' : 'submit'} disabled={fundingBlocked ? !accountQuote.canRefresh || busy || photoBusy || artifactBusy || checking : !canGenerate} onClick={fundingBlocked ? () => { if (accountQuote.canRefresh && !busy && !photoBusy && !artifactBusy && !checking) void refresh() } : undefined}>{fundingBlocked ? accountQuote.checking ? 'Checking generation funding…' : 'Check generation funding · no charge' : busy ? 'Checking model request…' : detailed ? budgetTier === 'extended' && !tiersReady ? 'Review model budget availability' : `Generate Astra/Blender model · ${selectedPoints} points` : fast ? `Generate ${MODEL_CATALOG[cheapModel].label} draft · ${MODEL_CATALOG[cheapModel].creditsPerGeneration} points or funded free allowance` : 'Generate GPT-6 Astra blueprint · 250 points'}</button><details className="shop-generation-help"><summary>Plans, free drafts and limits</summary><small>Free: up to 2 shared Sol/Luna drafts per rolling 24 hours when funded capacity is available. Paid Luna uses 15 points, Sol 50 and Astra blueprints 250. Detailed Astra uses the selected model budget. Astra requires eligible membership and verified runtime activation. There is no free Astra fallback. Manufacturing and delivery are separate.</small></details>
        </form>
        {saved && <details className="shop-customer-status shop-saved-details" aria-label="Saved Shop request"><summary>Saved request details</summary>
          <p><strong>Saved Shop request selected on this device.</strong> This may differ from your newest account model. <Link to="/account/models">Open account model library →</Link></p>
          <p className="native-shop-job-diagnostic" style={{ overflowWrap: 'anywhere' }}>Job ID: {saved.receipt.id} · Last known status: {savedStatusLabel}{savedJob?.failureCode && <> · Reason: {savedJob.failureCode}</>}</p>
          <p>Receipt created: {receiptDate ? <time dateTime={saved.receipt.createdAt}>{receiptDate.toLocaleString(undefined, { timeZoneName: 'short' })}</time> : 'Unknown'}. This is not the generation start time.</p>
          <p>Recorded worker generation time: {formatStudioGenerationDuration(savedJob?.generationTiming)} · Excludes upload and queue time.</p>
          {!terminal(savedJob?.state) && !savedJob?.reconciliationRequired && <p>Elapsed since this request was tracked: {Math.floor(seconds / 60)}m {seconds % 60}s · Includes waiting; not worker generation time.</p>}
          {savedJob && <p className={savedJob.state === 'failed' && !savedStatusUnknown ? 'native-shop-error' : undefined}>{savedJob.detail}</p>}
          {accountOwner && !accountLoading && !recoveryAccountMismatch && recoveryOwner?.id === saved.receipt.id && <details><summary>Saved request description</summary><p>{saved.prompt}</p></details>}
        </details>}
        <details className="shop-customer-status shop-availability-details"><summary>Generation availability</summary><div role="status"><strong>{checking || accountQuote.checking ? 'Checking availability…' : !accountReady ? accountQuote.quote.state === 'signin' ? 'Sign in to generate' : 'Next generation is unavailable for this account' : cloudRecoveryPending ? 'Resolve cloud recovery before generating' : currentRequestMessage ? 'Next generation is waiting for the selected request' : detailed ? activeReady ? 'Astra/Blender model generation available' : 'Astra/Blender awaiting readiness' : activeReady ? fast ? `${MODEL_CATALOG[cheapModel].label} draft generation available` : 'ASTRA blueprint generation available' : 'Generation temporarily unavailable'}</strong><p>{!accountReady ? nextGenerationQuoteMessage(accountQuote.quote) : cloudRecoveryPending ? recoveryError || 'Checking for an existing model before another generation can start.' : currentRequestMessage ? currentRequestMessage : detailed ? detailedAvailabilityMessage || 'Your explicit request starts one signed model job. Recovery and downloads never start another generation.' : activeReady ? fast ? `${MODEL_CATALOG[cheapModel].label} creates a validated specification and a lightweight procedural 3D draft.` : 'ASTRA creates a validated premium specification and a procedural downloadable GAME GLB in one bounded call.' : 'You can still test the Shop with the local DEMO preview while the selected LIVE path is unavailable.'}</p>{!activeReady && !detailed && <button type="button" className="native-shop-demo-button" disabled={busy || photoBusy || prompt.trim().length < 3} onClick={previewDemo}>Preview DEMO · no API cost</button>}<button type="button" disabled={checking || accountQuote.checking} onClick={() => void refresh()}>Refresh availability</button></div></details>
        <div className="native-shop-connection shop-internal-only" hidden role="status"><strong>{checking ? 'Checking connection…' : status?.ready ? 'Connector ready' : 'Generation not ready'}</strong><p>{status ? REASONS[status.reason] || 'Generation status requires review.' : 'A read-only check is required before a paid request can start.'}</p>{status?.allowance && <p>Approved remaining attempts: <b>{status.allowance.remaining}</b> · already reserved: {status.allowance.used}</p>}</div>
        {status?.reason === 'OWNER_ACCESS_REQUIRED' && <label className="shop-internal-only" hidden>Existing owner access code<input type="password" autoComplete="off" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Not an OpenAI API key" /></label>}
        {recoveryError && <p className="native-shop-error" role="alert">{recoveryError}</p>}{serviceError && <p className="native-shop-error" role="alert">{serviceError}</p>}{error && <p className="native-shop-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <p><a href="/compare/mcc/">See the real MCC cabinet comparison →</a></p>
        <p className="shop-beta-note"><strong>Experimental beta.</strong> Manufacturing requires a real production review before an order can be completed. Delivery times can change if the supplier requests another safety or geometry check.</p>
      </div>
    </section>
    <StudioGallery compact />
    <ShopManufacturingOptions dimensions={dimensions} dimensionsEnabled={dimensionsEnabled} hasGeneratedModel={!!preview && preview.origin === 'job'} onDimensionsChange={setDimensions} onDimensionsEnabledChange={setDimensionsEnabled} onPrepareIssDraft={prepareIssDraft} />
    <section className="shop-internal-only" hidden aria-labelledby="studio-archive-title"><h2 id="studio-archive-title">Your models · device archive</h2><p>Completed originals are saved on this device, not automatically published to a store. Clearing browser storage removes this archive; keep explicit file backups.</p><label>Find a saved model<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions" /></label><div className="native-shop-archive">{archive.filter(item => item.prompt.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id}><strong>{item.prompt}</strong><small>{(item.byteLength / 1048576).toFixed(1)} MB · UNREVIEWED</small><button type="button" disabled={busy || (!!saved && !terminal(job?.state)) || artifactBusy} onClick={() => void openArchived(item)}>Open saved model</button></article>)}</div>{archive.length === 0 && <p>No models saved on this device yet. Existing private Froge archives have not been copied or deleted.</p>}</section>
    <footer className="shop-customer-footer"><Link to="/world">WORLDIFAKT</Link><p>Experimental beta. Subscription and credit purchases require the payment service to be configured. Manufacturing orders require a separate production review.</p><a className="shop-internal-only" hidden href={REFERENCE_LINKS.modelGenerator} target="_blank" rel="noopener noreferrer">Original Froge Studio</a></footer>
  </main>
}
