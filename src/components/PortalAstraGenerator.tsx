import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StartingWorld from './StartingWorld'
import GenerationCostNotice from './GenerationCostNotice'
import { demoBlueprint, localSceneResult, meadowBlueprint } from '../lib/blueprint'
import type { GenerationResult, WorldBlueprint } from '../lib/blueprint'
import { blueprintReferences, BLUEPRINT_REFERENCE_LIMIT, type BlueprintReference } from '../lib/blueprintRequest'
import { ScopedBlueprintClient, type ScopedBlueprintRecovery } from '../lib/scopedBlueprintClient'
import { blueprintAdmissionDetail } from '../lib/generationAdmission'
import { MODEL_CATALOG, type GenerationModel } from '../lib/modelCatalog'
import { useAccount } from '../lib/account'
import { useGenerationQuote } from '../lib/useGenerationQuote'
import { routeForPortal } from '../lib/portalRouting'
import './PortalAstraGenerator.css'

type WorldId = 'chess-cube-512-ai' | 'terra-fix-iss' | '8-planets-in-8-days' | 'enchanted-ai-shop' | 'ai-game-lab'
type Health = { generationReady?: boolean; accessRequired?: boolean; model?: string | null; qualityModel?: string | null; astraBlueprintReady?: boolean; draftModels?: string[] }
type Scope = { owner: string | null; worldId: WorldId }
type Session = { scope: Scope; client: ScopedBlueprintClient | null; recovery: ScopedBlueprintRecovery | null; problem: string }
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024
const DEFAULT_PROMPTS: Record<WorldId, string> = {
  'chess-cube-512-ai': 'Design a playable 8×8×8 chess arena asset with a clear board silhouette, safe readable geometry and a GAME plan.',
  'terra-fix-iss': 'Design an ISS repair-training scene that explores maintenance and preservation without claiming real current ISS failures or proven preservation feasibility.',
  '8-planets-in-8-days': 'Design a planetary exploration checkpoint with hazards, restoration technology and a clear platforming route.',
  'enchanted-ai-shop': 'Design a distinctive product concept for a 3D preview with separate GAME and validation-required MAKE plans.',
  'ai-game-lab': 'Design a reusable game-world scene with a landmark, vehicle or building and clear GAME and MAKE plans.',
}
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Generation could not be checked. Recover the same request before starting another.'

export default function PortalAstraGenerator({ worldId, title }: { worldId: WorldId; title: string }) {
  const navigate = useNavigate()
  const { user, loading } = useAccount()
  const scope = useMemo<Scope>(() => ({ owner: user?.id ?? null, worldId }), [user?.id, worldId])
  const currentScope = useRef(scope), accountLoading = useRef(loading), mounted = useRef(false)
  currentScope.current = scope; accountLoading.current = loading
  const active = () => mounted.current && currentScope.current === scope && !accountLoading.current
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() => meadowBlueprint())
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [resultRequest, setResultRequest] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [health, setHealth] = useState<Health>({})
  const [healthRevision, setHealthRevision] = useState(0)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPTS[worldId])
  // SOL was the old endpoint default. A premium model requires an explicit choice.
  const [selectedModel, setSelectedModel] = useState<GenerationModel>('sol')
  const [references, setReferences] = useState<BlueprintReference[]>([])
  const [referenceError, setReferenceError] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const access = useRef(accessCode); access.current = accessCode
  const [busy, setBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<{ scope: Scope; controller: AbortController } | null>(null)
  const fileOperation = useRef<{ scope: Scope; readers: Set<FileReader> } | null>(null)
  const accountQuote = useGenerationQuote(selectedModel, busy)
  const current = session?.scope === scope ? session : null
  const recovery = current?.recovery ?? null
  const modelReady = health.generationReady === true && (selectedModel === 'astra'
    ? health.qualityModel === MODEL_CATALOG.astra.model && health.astraBlueprintReady === true
    : health.model === MODEL_CATALOG.sol.model && (selectedModel === 'sol' || health.draftModels?.includes('luna') === true))
  const fundingBlocked = accountQuote.quote.state === 'blocked' && accountQuote.quote.reason === 'PROVIDER_BUDGET_EXHAUSTED'
  const funded = !accountQuote.checking && ['free', 'credits'].includes(accountQuote.quote.state)
  const canGenerate = !!current?.client && !current.problem && !recovery && !busy && !fileBusy && !referenceError && !loading && funded && modelReady && prompt.trim().length >= 3 && prompt.length <= 2000 && (selectedModel === 'astra' || !references.length) && (!health.accessRequired || accessCode.trim().length >= 32)

  useEffect(() => {
    mounted.current = true
    setBlueprint(meadowBlueprint()); setResult(null); setResultRequest(null)
    setPrompt(DEFAULT_PROMPTS[worldId]); setSelectedModel('sol'); setReferences([]); setReferenceError(''); setAccessCode(''); setError(''); setBusy(false); setFileBusy(false)
    let client: ScopedBlueprintClient | null = null
    const sync = () => {
      if (currentScope.current !== scope || !mounted.current) return
      try {
        const saved = client?.current() ?? null
        setSession({ scope, client, recovery: saved, problem: '' })
        if (saved) setSelectedModel(saved.model as GenerationModel)
      } catch (reason) { setSession({ scope, client: null, recovery: null, problem: message(reason) }) }
    }
    try {
      if (scope.owner) client = new ScopedBlueprintClient(window.localStorage, (input, init) => {
        const headers = new Headers(init?.headers)
        if (init?.method === 'POST' && access.current.trim()) headers.set('X-WORLDIFACT-Access', access.current.trim())
        return fetch(input, { ...init, headers })
      }, scope.owner, `portal:${worldId}`, active)
      sync()
    } catch (reason) { setSession({ scope, client: null, recovery: null, problem: message(reason) }) }
    window.addEventListener('storage', sync)
    return () => {
      mounted.current = false
      window.removeEventListener('storage', sync)
      if (operation.current?.scope === scope) { operation.current.controller.abort(); operation.current = null }
      if (fileOperation.current?.scope === scope) { for (const reader of fileOperation.current.readers) reader.abort(); fileOperation.current = null }
    }
  }, [scope])

  useEffect(() => {
    const controller = new AbortController()
    setHealth({})
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setHealth(value || {}) })
      .catch(() => { if (!controller.signal.aborted) setHealth({}) })
      .finally(() => window.clearTimeout(timeout))
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [scope, healthRevision])

  async function chooseImages(files: FileList | null) {
    if (!active() || operation.current || fileOperation.current || !files?.length) return
    if (selectedModel !== 'astra') { setReferenceError('Choose GPT-6 Astra explicitly before adding references. Sol and Luna are text-only.'); return }
    const batch = Array.from(files)
    if (batch.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_REFERENCE_BYTES)) {
      setReferenceError('Choose PNG, JPEG or WebP up to 6 MB combined. The selected batch was not added.'); return
    }
    if (references.length + batch.length > BLUEPRINT_REFERENCE_LIMIT) { setReferenceError('Use up to six reference images. The selected batch was not added.'); return }
    // Existing references already passed exact data-URL validation. Count their
    // decoded sizes without allocating more copies before reading a new batch.
    const acceptedBytes = references.reduce((total, reference) => total +
      (reference.dataUrl.length - reference.dataUrl.indexOf(',') - 1) * 3 / 4 -
      (reference.dataUrl.endsWith('==') ? 2 : reference.dataUrl.endsWith('=') ? 1 : 0), 0)
    if (acceptedBytes + batch.reduce((total, file) => total + file.size, 0) > MAX_REFERENCE_BYTES) {
      setReferenceError('Reference images exceed the combined 6 MB limit. Compress the selected batch; accepted images are preserved.'); return
    }
    const task = { scope, readers: new Set<FileReader>() }
    fileOperation.current = task; setFileBusy(true); setReferenceError('')
    try {
      const added = await Promise.all(batch.map(file => new Promise<BlueprintReference>((resolve, reject) => {
        const reader = new FileReader(); task.readers.add(reader)
        reader.onload = () => resolve({ dataUrl: String(reader.result), view: 'other' })
        reader.onerror = () => reject(new Error('A reference image could not be read. The selected batch was not added.'))
        reader.onabort = () => reject(new Error('Reference loading was interrupted.'))
        reader.readAsDataURL(file)
      })))
      const accepted = blueprintReferences({ references: [...references, ...added] })
      if (active() && fileOperation.current === task) setReferences(accepted)
    } catch (reason) { if (active() && fileOperation.current === task) setReferenceError(message(reason)) }
    finally {
      if (fileOperation.current === task) { fileOperation.current = null; if (active()) setFileBusy(false) }
    }
  }

  function generateDemo() {
    if (!active() || operation.current || fileOperation.current || recovery?.state === 'pending' || prompt.trim().length < 3) return
    const demo = localSceneResult(demoBlueprint(`${title}: ${prompt}`), 'DEMO / MOCK local scene. No API request was made; references were not analyzed; MAKE remains validation-required.')
    setBlueprint(demo.blueprint); setResult(demo); setResultRequest(null); setError('')
  }

  async function runRequest(recoverOnly: boolean) {
    const client = current?.client
    if (!active() || !client || current.problem || operation.current || fileOperation.current || (recoverOnly ? !recovery : !canGenerate)) return
    const task = { scope, controller: new AbortController() }
    operation.current = task; setBusy(true); setError('')
    // A local deadline ends waiting only. The durable identity always survives.
    const timeout = window.setTimeout(() => task.controller.abort(), recoverOnly ? 15000 : selectedModel === 'astra' ? 95000 : 65000)
    try {
      const proposal = recoverOnly ? await client.recover(task.controller.signal) : await client.submit({
        worldId, prompt: prompt.trim(), mode: 'live', model: selectedModel, deliverable: 'procedural-blueprint', references: blueprintReferences({ references }),
      }, { worldId, blueprint }, task.controller.signal)
      if (!active() || operation.current !== task) return
      setBlueprint(proposal.result.blueprint); setResult(proposal.result); setResultRequest(client.current()!.id)
    } catch (reason) {
      if (active() && operation.current === task) setError(task.controller.signal.aborted
        ? 'Stopped waiting. The request may still finish. Recover the same request; no replacement was started. The previous preview is preserved.' : message(reason))
    } finally {
      window.clearTimeout(timeout)
      if (operation.current === task) {
        operation.current = null
        if (active()) {
          setBusy(false)
          try { setSession({ scope, client, recovery: client.current(), problem: '' }) }
          catch (reason) { setSession({ scope, client: null, recovery: null, problem: message(reason) }) }
          window.dispatchEvent(new Event('worldifact:balance-changed'))
        }
      }
    }
  }

  function prepareNewAttempt() {
    if (!active() || !current?.client || operation.current || fileOperation.current) return
    try {
      const saved = current.client.current()
      if (!saved || saved.state === 'pending') return
      if (!window.confirm('Prepare a new paid attempt? The finished request will leave this portal’s recovery controls. Your previous preview stays visible. Generating again will require a separate click at the displayed cost.')) return
      current.client.reset(true)
      setSession({ ...current, recovery: null }); setError(''); accountQuote.refresh()
    } catch (reason) { setError(message(reason)) }
  }

  const live = result?.mode === 'LIVE' && result.provenance === 'GENERATED'
  const previous = !!result && (busy || !!error || (recovery ? resultRequest !== recovery.id : resultRequest !== null))
  const controlsLocked = busy || fileBusy
  return <section className="portal-astra" aria-label={`${title} blueprint generator`}>
    <div className="portal-astra-head">
      <div><span className="eyebrow">PORTAL BLUEPRINT · {worldId}</span><h2>Create inside this portal</h2></div>
      <span className={`pill ${live ? 'live' : ''}`}>{live ? 'LIVE · GENERATED' : result ? 'DEMO · MOCK' : 'LOCAL STARTER PREVIEW'}</span>
    </div>
    <p>The selected model creates a validated WorldBlueprint + AssetSpec and a procedural GAME preview. This is not detailed reference reconstruction; MAKE always requires external validation.</p>
    <div className="portal-astra-layout">
      <div className="portal-astra-preview">
        <StartingWorld blueprint={blueprint} activePortalId={worldId} onPortalOpen={id => navigate(routeForPortal(id))} />
      </div>
      <div className="portal-astra-controls">
        <label>Generation model<select aria-label="Generation model" value={selectedModel} disabled={controlsLocked || !!recovery} onChange={event => {
          if (!active() || operation.current || fileOperation.current || recovery) return
          const model = event.target.value
          if (!['luna', 'sol', 'astra'].includes(model)) return
          if (model !== 'astra' && references.length) { setReferenceError('Remove all accepted references explicitly before choosing a text-only model.'); return }
          setSelectedModel(model as GenerationModel)
        }}>{(['luna', 'sol', 'astra'] as const).map(model => <option key={model} value={model}>{MODEL_CATALOG[model].label} · {MODEL_CATALOG[model].creditsPerGeneration} points per paid generation</option>)}</select></label>
        <GenerationCostNotice model={selectedModel} busy={busy} accountQuote={accountQuote} />
        <label>Portal prompt<textarea rows={5} maxLength={2000} value={prompt} disabled={controlsLocked || !!recovery} onChange={event => { if (!operation.current && !fileOperation.current && !recovery) setPrompt(event.target.value) }} /></label>
        <label>Reference images · Astra only · max 6 MB combined<input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={controlsLocked || !!recovery || selectedModel !== 'astra'} onChange={event => { void chooseImages(event.target.files); event.target.value = '' }} /></label>
        <label className="scan-input">Scan with phone camera · BETA · Astra only<input type="file" accept="image/*" capture="environment" disabled={controlsLocked || !!recovery || selectedModel !== 'astra'} onChange={event => { void chooseImages(event.target.files); event.target.value = '' }} /></label>
        {references.map((reference, index) => <div className="portal-astra-reference" key={index}><img src={reference.dataUrl} alt={`Selected portal reference ${index + 1}`} /><button type="button" disabled={controlsLocked || !!recovery} onClick={() => { if (!operation.current && !fileOperation.current && !recovery) { setReferences(values => values.filter((_, position) => position !== index)); setReferenceError('') } }}>Remove reference {index + 1}</button></div>)}
        {referenceError && <p role="alert">{referenceError} <button type="button" disabled={controlsLocked || !!recovery} onClick={() => setReferenceError('')}>Keep only accepted references</button></p>}
        {fileBusy && <small>Reading every selected reference…</small>}
        {health.accessRequired && <label>Preview access code<input type="password" autoComplete="off" value={accessCode} disabled={controlsLocked || !!recovery} onChange={event => setAccessCode(event.target.value)} /></label>}
        {recovery && <div className="portal-astra-result" aria-live="polite">
          <strong>{recovery.state === 'pending' ? 'Saved request · recover before another attempt' : recovery.state === 'failed' ? 'Previous attempt closed' : 'Previous attempt completed'}</strong>
          <span>{MODEL_CATALOG[recovery.model as GenerationModel].label} · Request {recovery.id}</span>
          {recovery.failureCode && <small>{blueprintAdmissionDetail(recovery.failureCode)}</small>}
          <button type="button" disabled={controlsLocked || loading || !current?.client} onClick={() => { void runRequest(true) }}>Recover same request · no new charge</button>
          {recovery.state !== 'pending' && <button type="button" disabled={controlsLocked} onClick={prepareNewAttempt}>Prepare new paid attempt…</button>}
        </div>}
        <div className="portal-astra-buttons">
          <button className="primary" type="button" disabled={fundingBlocked ? controlsLocked || loading || !accountQuote.canRefresh : !canGenerate} onClick={() => { if (fundingBlocked) { if (active() && !controlsLocked && accountQuote.canRefresh) { setHealthRevision(value => value + 1); accountQuote.refresh() } return } void runRequest(false) }}>{fundingBlocked ? accountQuote.checking ? 'Checking generation funding…' : 'Check generation funding · no charge' : busy ? 'Checking saved generation…' : `Generate ${MODEL_CATALOG[selectedModel].label} blueprint`}</button>
          <button type="button" disabled={controlsLocked || recovery?.state === 'pending' || prompt.trim().length < 3} onClick={generateDemo}>Generate DEMO · no API cost</button>
          {busy && <button type="button" onClick={() => operation.current?.controller.abort()}>Stop waiting</button>}
          <button type="button" disabled={controlsLocked} onClick={() => { setHealthRevision(value => value + 1); accountQuote.refresh() }}>Refresh availability</button>
        </div>
        <small>{!modelReady ? 'The selected model’s LIVE availability is not verified. DEMO is a separate local action.' : !funded ? accountQuote.quote.message : 'One explicit request at the displayed cost. No automatic model upgrade or DEMO substitution.'}</small>
        {(error || current?.problem) && <p role="alert" className="error">{error || current?.problem}</p>}
        {result && <div className="portal-astra-result" data-testid="portal-result">
          {previous && <strong>Previous preview preserved</strong>}
          <strong>{live ? 'LIVE · GENERATED' : 'DEMO · MOCK'}{live && ` · ${result.model}`}</strong>
          <span>{result.assetSpec?.name ?? result.blueprint.title}</span>
          <small>GAME: procedural preview · MAKE: VALIDATION REQUIRED</small>
        </div>}
      </div>
    </div>
  </section>
}
