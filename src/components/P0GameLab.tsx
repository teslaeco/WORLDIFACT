import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Group } from 'three'
import StartingWorld from './StartingWorld'
import ShopPage from '../pages/ShopPage'
import { demoBlueprint, localSceneResult, meadowBlueprint } from '../lib/blueprint'
import type { GenerationResult, WorldBlueprint } from '../lib/blueprint'
import { readArchive, saveArchive } from '../lib/archive'
import { routeForPortal } from '../lib/portalRouting'
import { createWorldObject, disposeObject } from '../lib/worldGeometry'
import { DEMO_EXAMPLES } from '../lib/demoExamples'
import { REFERENCE_LINKS } from '../config/references'
import ProjectAttachmentPicker from './ProjectAttachmentPicker'
import GenerationCostNotice from './GenerationCostNotice'
import { MODEL_CATALOG, type DraftModel } from '../lib/modelCatalog'
import { exportProceduralGlb } from '../lib/proceduralGlb'
import { ScopedBlueprintClient, type ScopedBlueprintRecovery } from '../lib/scopedBlueprintClient'
import { useAccount } from '../lib/account'

const MAX_REFERENCE_BYTES = 6 * 1024 * 1024
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data), a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
type Health = { generationReady?: boolean; accessRequired?: boolean; publicPilot?: boolean; model?: string | null }
export default function P0GameLab({ surface = 'lab' }: { surface?: 'lab' | 'shop' }) {
  return surface === 'shop' ? <ShopPage /> : <WorldBlueprintLab />
}
function WorldBlueprintLab() {
  const navigate = useNavigate()
  const { user, loading: accountLoading } = useAccount()
  const owner = user?.id ?? null
  const activeOwner = useRef(owner)
  // Fence old handlers immediately when React observes a different account.
  // eslint-disable-next-line react/refs
  activeOwner.current = owner
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() => meadowBlueprint())
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [health, setHealth] = useState<Health>({})
  const [selectedModel, setSelectedModel] = useState<DraftModel>('sol')
  const [prompt, setPrompt] = useState('Design a solar exploration workshop with a rover beside a restored forest.')
  const [image, setImage] = useState<string | null>(null)
  const [accessCode, setAccessCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [recovery, setRecovery] = useState<ScopedBlueprintRecovery | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const client = useRef<ScopedBlueprintClient | null>(null)
  const inFlight = useRef(false)
  const generationRevision = useRef(0)
  const imageRevision = useRef(0)
  const readingImage = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    // Reset transient UI when the external account scope changes.
    // eslint-disable-next-line react/set-state-in-effect
    mounted.current = true; inFlight.current = false; setBusy(false); setImageBusy(false); setRecovery(null); client.current = null
    setBlueprint(meadowBlueprint()); setResult(null); setSelectedModel('sol')
    setPrompt('Design a solar exploration workshop with a rover beside a restored forest.')
    setImage(null); setAccessCode(''); setError(''); setSeconds(0); setHealth({})
    try {
      if (owner) {
        client.current = new ScopedBlueprintClient(window.localStorage, fetch, owner, 'historical-blueprint-lab', () => mounted.current && activeOwner.current === owner)
        setRecovery(client.current.current())
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Recovery storage is unavailable. No paid request can start.') }
    const controller = new AbortController()
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(v => { if (!controller.signal.aborted) setHealth(v || {}) })
      .catch(() => { if (!controller.signal.aborted) setHealth({ generationReady: false }) })
    const invalidate = () => { mounted.current = false; generationRevision.current++; imageRevision.current++; readingImage.current = false; controller.abort(); abort.current?.abort() }
    return invalidate
  }, [owner])
  useEffect(() => {
    if (!busy) return
    const started = Date.now(), timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [busy])
  async function pickImage(file?: File) {
    if (inFlight.current) return
    const revision = ++imageRevision.current
    setError(''); setImage(null); setImageBusy(false); readingImage.current = false
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_REFERENCE_BYTES) { setError('Choose PNG, JPEG or WebP up to 6 MB.'); return }
    setImageBusy(true); readingImage.current = true
    const reader = new FileReader()
    reader.onload = () => { if (mounted.current && revision === imageRevision.current) { setImage(String(reader.result)); setImageBusy(false); readingImage.current = false } }
    reader.onerror = () => { if (mounted.current && revision === imageRevision.current) { setError('Reference image could not be read.'); setImageBusy(false); readingImage.current = false } }
    reader.onabort = reader.onerror
    reader.readAsDataURL(file)
  }
  function generateDemo(input = prompt) {
    if (inFlight.current) return
    setError('')
    if (input.trim().length < 3 || input.length > 2000) { setError('Use a prompt between 3 and 2000 characters.'); return }
    const demo = localSceneResult(demoBlueprint(input), 'DEMO / MOCK local scene. No GPT-6 Astra request was made; MAKE remains validation-required.')
    setPrompt(input); setBlueprint(demo.blueprint); setResult(demo)
  }
  async function generateLive(recoverOnly = false) {
    if (inFlight.current || readingImage.current) return
    inFlight.current = true
    const generationId = ++generationRevision.current
    setBusy(true); setSeconds(0); setError('')
    const controller = new AbortController(); abort.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 40_000)
    try {
      // Keep durable recovery separate for each account and historical surface.
      // Reload/recovery never submits a replacement or changes model identity.
      if (!owner || accountLoading) throw new Error('Sign in before requesting or recovering a blueprint.')
      const headers: Record<string, string> = {}
      if (accessCode.trim()) headers['X-WORLDIFACT-Access'] = accessCode.trim()
      const transport = new ScopedBlueprintClient(window.localStorage, (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } }), owner, 'historical-blueprint-lab', () => mounted.current && activeOwner.current === owner)
      client.current = transport
      if (!recoverOnly) {
        if (image) throw new Error('Luna and Sol world blueprints use text only. Remove the reference, or open 3D models + textures for a detailed reference model.')
        if (transport.current()) throw new Error('Recover the saved request or explicitly prepare a new paid attempt first.')
        if (!health.generationReady) throw new Error('World blueprint generation is not enabled. The no-cost scene demo is still available.')
        if (prompt.trim().length < 3 || prompt.length > 2000) throw new Error('Use a prompt between 3 and 2000 characters.')
        if (health.accessRequired && accessCode.trim().length < 32) throw new Error('Enter the preview access code.')
      }
      const proposal = recoverOnly ? await transport.recover(controller.signal) : await transport.submit({ worldId: 'ai-game-lab', prompt, image, mode: 'live', model: selectedModel, deliverable: 'procedural-blueprint' }, blueprint, controller.signal)
      if (!mounted.current || activeOwner.current !== owner || generationId !== generationRevision.current || controller.signal.aborted) return
      const validated = proposal.result
      setBlueprint(validated.blueprint); setResult(validated)
      try { if (!readArchive().some(item => item.result.requestId === validated.requestId)) saveArchive(validated) } catch { setError('Scene ready. Device storage is unavailable; download your blueprint to keep it.') }
    } catch (e) { if (mounted.current && activeOwner.current === owner && generationId === generationRevision.current) setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped waiting. The previous scene is unchanged. Recover the same request; no replacement was started.' : e instanceof Error ? e.message : 'Generation failed.') }
    finally {
      window.clearTimeout(timeout)
      if (mounted.current && activeOwner.current === owner && generationId === generationRevision.current) {
        abort.current = null; inFlight.current = false; setBusy(false)
        try { setRecovery(client.current?.current() ?? null) } catch (e) { setError(e instanceof Error ? e.message : 'Recovery storage needs review.') }
      }
    }
  }
  function newAttempt() {
    if (inFlight.current || !client.current || !window.confirm('Prepare a NEW paid attempt for your next Generate click? Recovering the saved result costs no additional points.')) return
    try { client.current.reset(true); setRecovery(null); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Recovery could not be cleared.') }
  }
  function generatePrimary() {
    if (health.generationReady) { void generateLive(); return }
    generateDemo()
  }

  async function exportGameGlb() {
    try {
      const scene = new Group(); scene.name = blueprint.title
      scene.userData = { target: 'GAME', provenance: result?.provenance ?? 'MOCK', manufacturing: 'NOT_VALIDATED' }
      for (const object of blueprint.objects) scene.add(createWorldObject(object))
      try { const output = exportProceduralGlb(scene); download(new Blob([output as ArrayBuffer], { type: 'model/gltf-binary' }), 'WORLDIFACT-GAME-procedural.glb') }
      finally { disposeObject(scene) }
    } catch { setError('GAME GLB export failed; the generated scene is still available.') }
  }
  const spec = result?.assetSpec, live = result?.mode === 'LIVE' && result.provenance === 'GENERATED'
  return <div className="studio">
    <div className="studio-heading"><div><span className="eyebrow">AI GAME LAB · WORLD BLUEPRINTS</span><h1>Ideas become playable worlds.</h1></div><span className="pill">{health.generationReady ? `${MODEL_CATALOG[selectedModel].label} blueprint ready` : 'Local scene demo available'}</span></div>
    <nav className="world-tabs" aria-label="AI Game Lab views">
      <span className="active" aria-current="page">World scene</span>
      <Link to="/shop">3D models + textures →</Link>
      <a href={REFERENCE_LINKS.gameLabPublic} target="_blank" rel="noopener noreferrer">Original Froge Studio ↗</a>
      <a href={REFERENCE_LINKS.gameLabSource} target="_blank" rel="noopener noreferrer">Froge source ↗</a>
    </nav>
    <p><strong>World blueprint → procedural scene change → GAME / MAKE plan.</strong> For a new figurine, character or textured object, use <Link to="/shop">3D models + textures</Link>. Scene blueprints and detailed model generation are separate workflows.</p>
    <p className="result-note">You are already inside AI Game Lab. Its portal is marked YOU ARE HERE; the other four portals open their worlds.</p>
    <div className="studio-layout">
      <div className="studio-scene">
        <StartingWorld blueprint={blueprint} activePortalId="ai-game-lab" onPortalOpen={id => navigate(routeForPortal(id))} />
        <div className="scene-toolbar">
          <button onClick={exportGameGlb}>Export GAME · procedural GLB</button>
          <button onClick={() => download(new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' }), 'WORLDIFACT-WorldBlueprint.json')}>Download WorldBlueprint</button>
          {spec && <button onClick={() => download(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), 'WORLDIFACT-AssetSpec.json')}>Download AssetSpec</button>}
        </div>
      </div>
      <aside className="creator-panel">
        <span className="eyebrow">WORLD INPUT</span>
        <label>AI model<select value={selectedModel} disabled={busy} onChange={e => { if (e.target.value === "astra") navigate("/shop"); else setSelectedModel(e.target.value as DraftModel) }}><option value="luna">GPT-6 LUNA — 15 points</option><option value="sol">GPT-6.1 SOL — 50 points</option><option value="astra">GPT-6 ASTRA — 250 points · open detailed Studio</option></select></label>
        <GenerationCostNotice model={selectedModel} busy={busy} />
        <label>Prompt<textarea rows={6} maxLength={2000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} /></label>
        <div className="prompt-presets" aria-label="No-cost demo examples">{DEMO_EXAMPLES.map(example => <button key={example.id} type="button" disabled={busy} onClick={() => generateDemo(example.prompt)}>{example.label}</button>)}</div>
        <label>Reference image · optional · max 6 MB<input key={owner ?? "signed-out"} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void pickImage(e.target.files?.[0])} /></label>
        <label className="scan-input">Scan with phone camera · BETA<input key={owner ?? "signed-out"} type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => void pickImage(e.target.files?.[0])} /></label>
        {image && <><img className="reference-preview" src={image} alt="Selected reference" /><button disabled={busy} onClick={() => { imageRevision.current++; setImage(null); setImageBusy(false); readingImage.current = false }}>Remove reference</button></>}
        {image && <small>Luna and Sol world blueprints use text only. Remove this reference or open <Link to="/shop">3D models + textures</Link> for a detailed reference model.</small>}
        <ProjectAttachmentPicker scope="game-lab" disabled={busy} />
        {health.accessRequired && <label>Preview access code<input type="password" autoComplete="off" value={accessCode} disabled={busy} onChange={e => setAccessCode(e.target.value)} /></label>}
        <button className="primary" disabled={busy || imageBusy || prompt.trim().length < 3 || (health.generationReady && (!!recovery || !!image || !owner || accountLoading))} onClick={generatePrimary}>{busy ? `${MODEL_CATALOG[selectedModel].label} working · ${seconds}s` : health.generationReady ? `Generate world blueprint · ${MODEL_CATALOG[selectedModel].label}` : 'Generate DEMO world · no API cost'}</button>
        <button disabled={busy} onClick={() => generateDemo()}>Refresh DEMO locally</button>
        <Link to="/shop" className="button-link">Create a 3D model + textures →</Link>
        {busy && <button onClick={() => abort.current?.abort()}>Stop waiting in this browser</button>}
        {recovery && <div role="status"><p>Saved request · {recovery.state}. Recovery does not start another paid generation.</p><button disabled={busy || imageBusy} onClick={() => void generateLive(true)}>Recover same request · no extra charge</button>{recovery.state !== 'pending' && <button disabled={busy} onClick={newAttempt}>Prepare new paid attempt…</button>}</div>}
        {error && <p role="alert" className="error">{error}</p>}
        {!health.generationReady && <p className="result-note">World blueprint AI is currently gated. Detailed models use the separate Studio connection; the local scene demo remains MOCK.</p>}
      </aside>
    </div>
    <section className="generation-evidence" aria-label="World generation result"><span className="eyebrow">WORLD OUTPUT</span>
      {!result ? <p>No result yet. The current scene is the starting state.</p> : <>
        <p><strong>{live ? 'LIVE · GENERATED' : 'DEMO · MOCK'}</strong>{live ? ` · ${result.model} · request ${result.requestId.slice(0, 12)}…` : ' · local no-cost fallback'}</p>
        <div className="workflow-pair">
          <article><span className="eyebrow">GAME · {live ? 'GENERATED SPEC' : 'MOCK SPEC'} / PROCEDURAL PREVIEW</span><h3>{spec?.name ?? result.blueprint.title}</h3><p>{spec?.game.gameplayRole}</p><p>{spec?.game.materialPlan}</p><p>{spec?.game.animationPlan}</p></article>
          <article><span className="eyebrow">MAKE · BLOCKED / VALIDATION REQUIRED</span><h3>{spec?.make.materialCandidate ?? 'No MAKE candidate'}</h3>{spec && <><p>{spec.make.dimensionsMm.x} × {spec.make.dimensionsMm.y} × {spec.make.dimensionsMm.z} mm · {spec.make.processCandidate}</p><ul>{spec.make.constraints.map(c => <li key={c}>{c}</li>)}</ul></>}</article>
        </div>
        <details><summary>Inspect WorldBlueprint</summary><pre>{JSON.stringify(result.blueprint, null, 2)}</pre></details>
        <details><summary>Inspect AssetSpec</summary><pre>{JSON.stringify(result.assetSpec, null, 2)}</pre></details>
        {live && result.evidence && <details><summary>Provider evidence</summary><p>{result.evidence.receivedAt} · {result.evidence.totalTokens ?? 'usage unavailable'} tokens</p><p>Blueprint SHA-256: {result.evidence.blueprintSha256}</p></details>}
        <p><small>{result.limitation}</small></p>
      </>}
    </section>
  </div>
}
