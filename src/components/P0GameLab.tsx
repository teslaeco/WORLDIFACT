import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Group } from 'three'
import StartingWorld from './StartingWorld'
import OracleModelPreview from './OracleModelPreview'
import { demoBlueprint, localSceneResult, meadowBlueprint, validateGenerationResult } from '../lib/blueprint'
import type { GenerationResult, WorldBlueprint } from '../lib/blueprint'
import { saveArchive } from '../lib/archive'
import { routeForPortal } from '../lib/portalRouting'
import { createWorldObject, disposeObject } from '../lib/worldGeometry'
import { DEMO_EXAMPLES } from '../lib/demoExamples'
import { REFERENCE_LINKS } from '../config/references'

function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

type Health = { generationReady?: boolean; accessRequired?: boolean; publicPilot?: boolean; model?: string | null }
type OracleJobGate = { mode?: string; prompt?: string; image?: string; artifactRead?: string; note?: string }
type OracleJob = { id: string; state: string; detail?: string }
type OracleArtifact = { jobId: string; blob: Blob; url: string; sha256: string; provenance: string }
type StudioSurface = 'lab' | 'shop'
type BusyKind = 'astra' | 'oracle' | null

type Props = {
  surface?: StudioSurface
}

function parseOracleJob(value: unknown, expectedId: string): OracleJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Oracle returned an invalid job response.')
  const job = value as Record<string, unknown>
  if (job.id !== expectedId || typeof job.state !== 'string') throw new Error('Oracle returned an invalid job response.')
  return { id: expectedId, state: job.state, ...(typeof job.detail === 'string' ? { detail: job.detail } : {}) }
}

export default function P0GameLab({ surface = 'lab' }: Props) {
  const navigate = useNavigate()
  const shop = surface === 'shop'
  const currentPortalId = shop ? 'enchanted-ai-shop' : 'ai-game-lab'
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() => meadowBlueprint())
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [health, setHealth] = useState<Health>({})
  const [oracleGate, setOracleGate] = useState<OracleJobGate | null>(null)
  const [oracleJob, setOracleJob] = useState<OracleJob | null>(null)
  const [oracleArtifact, setOracleArtifact] = useState<OracleArtifact | null>(null)
  const [ownerAccess, setOwnerAccess] = useState('')
  const [prompt, setPrompt] = useState(shop
    ? 'Design a blue solar rover collectible for a game world and a display concept.'
    : 'Design a solar exploration workshop with a rover beside a restored forest.')
  const [image, setImage] = useState<string | null>(null)
  const [accessCode, setAccessCode] = useState('')
  const [busyKind, setBusyKind] = useState<BusyKind>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const busy = busyKind !== null

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(v => setHealth(v || {}))
      .catch(() => { if (!controller.signal.aborted) setHealth({ generationReady: false }) })
    if (shop) {
      fetch('/api/oracle/jobs/status', { cache: 'no-store', signal: controller.signal })
        .then(r => r.ok ? r.json() : null)
        .then(v => setOracleGate(v || { mode: 'BLOCKED' }))
        .catch(() => { if (!controller.signal.aborted) setOracleGate({ mode: 'BLOCKED' }) })
    }
    return () => controller.abort()
  }, [shop])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [busy])

  useEffect(() => () => {
    if (oracleArtifact?.url) URL.revokeObjectURL(oracleArtifact.url)
  }, [oracleArtifact])

  async function pickImage(file?: File) {
    setError(''); setImage(null)
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setError('Choose PNG, JPEG or WebP up to 1 MB.'); return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.onerror = () => setError('Reference image could not be read.')
    reader.readAsDataURL(file)
  }

  function generateDemo(input = prompt) {
    if (busy) return
    setError('')
    if (input.trim().length < 3 || input.length > 2000) {
      setError('Use a prompt between 3 and 2000 characters.')
      return
    }
    const demo = localSceneResult(
      demoBlueprint(input),
      shop
        ? 'DEMO / MOCK local product concept. No GPT-6 Astra request was made; no order was placed and MAKE remains validation-required.'
        : 'DEMO / MOCK local scene. No GPT-6 Astra request was made; MAKE remains validation-required.',
    )
    setPrompt(input)
    setBlueprint(demo.blueprint)
    setResult(demo)
  }

  async function generateLive() {
    if (busy) return
    setBusyKind('astra'); setSeconds(0); setError('')
    const controller = new AbortController(); abort.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 40_000)
    try {
      if (!health.generationReady) throw new Error('LIVE Astra is not enabled yet. Use the no-cost DEMO button instead.')
      if (prompt.trim().length < 3 || prompt.length > 2000) throw new Error('Use a prompt between 3 and 2000 characters.')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (health.accessRequired) {
        if (accessCode.trim().length < 32) throw new Error('Enter the preview access code.')
        headers['X-WORLDIFACT-Access'] = accessCode.trim()
      }
      const response = await fetch('/api/blueprint', {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ prompt, image, mode: 'live' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Astra generation failed; the previous scene is unchanged.')
      const validated = validateGenerationResult(body)
      if (validated.mode !== 'LIVE' || validated.provenance !== 'GENERATED') throw new Error('The server did not return verified LIVE evidence.')
      setBlueprint(validated.blueprint); setResult(validated)
      try { saveArchive(validated) } catch { /* portable downloads remain available */ }
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? 'Generation timed out; the previous scene is unchanged.' : e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      window.clearTimeout(timeout); abort.current = null; setBusyKind(null)
    }
  }

  async function generateOracleModel() {
    if (busy || !shop) return
    setError('')
    const publicPilot = oracleGate?.mode === 'PUBLIC_PILOT'
    const ownerOnly = oracleGate?.mode === 'OWNER_ONLY'
    if (!publicPilot && !ownerOnly) {
      setError('REAL 3D model generation is still blocked by the production safety gate.')
      return
    }
    if (prompt.trim().length < 3 || prompt.length > 2000) {
      setError('Use a prompt between 3 and 2000 characters.')
      return
    }
    if (image) {
      setError('The reviewed Oracle connector currently accepts prompt-only 3D jobs. Remove the reference image for a REAL model job; image-to-model remains BLOCKED_UNVERIFIED.')
      return
    }
    const owner = ownerAccess.trim()
    if (ownerOnly && (owner.length < 32 || owner.length > 256)) {
      setError('Enter the owner generation code (32–256 characters). It is not saved in browser storage.')
      return
    }

    setBusyKind('oracle'); setSeconds(0); setOracleJob(null)
    const controller = new AbortController(); abort.current = controller
    const id = crypto.randomUUID()
    if (ownerOnly) setOwnerAccess('')
    const authHeaders = ownerOnly ? { 'X-WORLDIFACT-Owner': owner } : {}
    try {
      const submit = await fetch('/api/oracle/jobs', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: prompt.trim() }),
      })
      const submitted = await submit.json() as { error?: string; job?: unknown }
      if (!submit.ok) throw new Error(submitted.error || `Oracle job submission failed (HTTP ${submit.status}).`)
      let job = parseOracleJob(submitted.job, id)
      setOracleJob(job)

      for (let attempt = 0; job.state !== 'succeeded' && attempt < 80; attempt++) {
        if (['failed', 'cancelled'].includes(job.state)) throw new Error(job.detail || `Oracle job ${job.state}.`)
        await wait(6000, controller.signal)
        let status: Response
        try {
          status = await fetch(`/api/oracle/jobs/${id}`, {
            headers: { ...authHeaders, Accept: 'application/json' },
            cache: 'no-store', signal: controller.signal,
          })
        } catch (networkError) {
          if (!navigator.onLine) {
            setOracleJob({ ...job, detail: 'Connection lost on this phone. Oracle may still be generating; retrying the same job.' })
            continue
          }
          throw networkError
        }
        const statusBody = await status.json() as { error?: string; job?: unknown }
        if (!status.ok) {
          if (status.status >= 500 || status.status === 429) {
            setOracleJob({ ...job, detail: 'Status temporarily unavailable. Retrying the same Oracle job without starting a new paid request.' })
            continue
          }
          throw new Error(statusBody.error || `Oracle job status failed (HTTP ${status.status}).`)
        }
        job = parseOracleJob(statusBody.job, id)
        setOracleJob(job)
      }
      if (job.state !== 'succeeded') throw new Error(`Oracle job is still ${job.state} after 8 minutes. The server job may continue, but no second paid job was started.`)

      const modelResponse = await fetch(`/api/oracle/jobs/${id}/model`, {
        headers: { ...authHeaders, Accept: 'model/gltf-binary' },
        cache: 'no-store', signal: controller.signal,
      })
      if (!modelResponse.ok) {
        const modelError = await modelResponse.json().catch(() => null) as { error?: string } | null
        throw new Error(modelError?.error || `Generated GLB is unavailable (HTTP ${modelResponse.status}).`)
      }
      const blob = await modelResponse.blob()
      if (blob.size < 20) throw new Error('Generated GLB is unexpectedly empty.')
      const url = URL.createObjectURL(blob)
      const sha256 = modelResponse.headers.get('X-WORLDIFACT-SHA256') || 'server-verified hash unavailable to browser'
      const provenance = modelResponse.headers.get('X-WORLDIFACT-Provenance') || 'GENERATED-UNREVIEWED'
      setOracleArtifact({ jobId: id, blob, url, sha256, provenance })
      setResult(null)
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? '3D generation was cancelled in this browser. No second paid request was started.' : e instanceof Error ? e.message : '3D model generation failed.')
    } finally {
      abort.current = null; setBusyKind(null)
    }
  }

  async function exportGameGlb() {
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
      const scene = new Group(); scene.name = blueprint.title
      scene.userData = { target: 'GAME', provenance: result?.provenance ?? 'MOCK', manufacturing: 'NOT_VALIDATED' }
      for (const object of blueprint.objects) scene.add(createWorldObject(object))
      try {
        const output = await new GLTFExporter().parseAsync(scene, { binary: true })
        download(new Blob([output as ArrayBuffer], { type: 'model/gltf-binary' }), shop ? 'WORLDIFACT-SHOP-GAME-procedural.glb' : 'WORLDIFACT-GAME-procedural.glb')
      } finally { disposeObject(scene) }
    } catch { setError('GAME GLB export failed; the generated scene is still available.') }
  }

  const spec = result?.assetSpec
  const live = result?.mode === 'LIVE' && result.provenance === 'GENERATED'
  const realModel = shop ? oracleArtifact : null
  const publicOraclePilot = shop && oracleGate?.mode === 'PUBLIC_PILOT'
  const ownerOraclePilot = shop && oracleGate?.mode === 'OWNER_ONLY'
  return <div className="studio">
    <div className="studio-heading">
      <div>
        <span className="eyebrow">{shop ? 'ENCHANTED AI SHOP · MCP2 GENERATOR PORT' : 'AI GAME LAB · P0'}</span>
        <h1>{shop ? 'Create a real 3D model, or preview a no-cost concept.' : 'Ideas become playable worlds.'}</h1>
      </div>
      <span className="pill">{publicOraclePilot ? 'REAL 3D public hard-capped pilot' : ownerOraclePilot ? 'REAL 3D owner pilot available' : health.generationReady ? (health.publicPilot ? 'LIVE public Astra pilot' : 'LIVE Astra preview') : 'DEMO only'}</span>
    </div>
    {shop ? <nav className="world-tabs" aria-label="Enchanted AI Shop views">
      <span className="active" aria-current="page">WORLDIFACT Shop Studio</span>
      <a href={REFERENCE_LINKS.shopLegacy} target="_blank" rel="noreferrer">Legacy Forge Studio · brief export only ↗</a>
      <Link to="/make">Manufacturing audit</Link>
      <Link to="/lab">AI Game Lab</Link>
    </nav> : <nav className="world-tabs" aria-label="AI Game Lab views">
      <span className="active" aria-current="page">WORLDIFACT P0</span>
      <a href={REFERENCE_LINKS.gameLabPublic} target="_blank" rel="noreferrer">World #5 · Forge Studio ↗</a>
      <a href={REFERENCE_LINKS.gameLabSource} target="_blank" rel="noreferrer">ForgeMCP source ↗</a>
      <Link to="/shop">AI Shop</Link>
    </nav>}
    <p><strong>{shop
      ? 'PROMPT → GPT-6 ASTRA / MCP2 ORACLE CONNECTOR → BLENDER JOB → REAL GLB → IN-PAGE 3D PREVIEW → EXPLICIT DOWNLOAD · IMAGE-TO-MODEL PENDING CONNECTOR VALIDATION'
      : 'PROMPT / IMAGE → GPT-6 ASTRA → WORLD BLUEPRINT + ASSET SPEC → SCENE CHANGE → GAME / MAKE'}</strong></p>
    <p className="result-note">{shop
      ? 'This Shop now uses the proven MCP2 generation pattern: submit one job, keep polling that same job even after mobile connection problems, load the GLB into the viewer, and never auto-download it. The old Forge page remains only a legacy brief-export reference.'
      : 'You are already inside AI Game Lab. Its portal is marked YOU ARE HERE; the other four portals open their worlds.'}</p>
    <div className="studio-layout">
      <div className="studio-scene">
        {realModel
          ? <OracleModelPreview url={realModel.url} label="REAL generated MCP2 Oracle Blender GLB preview" />
          : <StartingWorld blueprint={blueprint} activePortalId={currentPortalId} onPortalOpen={(id) => navigate(routeForPortal(id))} />}
        <div className="scene-toolbar">
          {realModel ? <>
            <button onClick={() => download(realModel.blob, `WORLDIFACT-Shop-${realModel.jobId}.glb`)}>Download REAL generated GLB</button>
            <button onClick={() => setOracleArtifact(null)}>Return to concept scene</button>
          </> : <>
            <button onClick={exportGameGlb}>Export GAME · procedural GLB</button>
            <button onClick={() => download(new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' }), shop ? 'WORLDIFACT-Shop-WorldBlueprint.json' : 'WORLDIFACT-WorldBlueprint.json')}>Download WorldBlueprint</button>
            {spec ? <button onClick={() => download(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), shop ? 'WORLDIFACT-Shop-AssetSpec.json' : 'WORLDIFACT-AssetSpec.json')}>Download AssetSpec</button> : null}
          </>}
        </div>
      </div>
      <aside className="creator-panel">
        <span className="eyebrow">{shop ? 'PRODUCT INPUT' : 'WORLD INPUT'}</span>
        <label>Prompt<textarea rows={6} maxLength={2000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} /></label>
        <div className="prompt-presets" aria-label="No-cost demo examples">
          {DEMO_EXAMPLES.map(example => <button key={example.id} type="button" disabled={busy} onClick={() => generateDemo(example.prompt)}>{example.label}</button>)}
        </div>
        <label>Reference image · optional<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void pickImage(e.target.files?.[0])} /></label>
        {image ? <><img className="reference-preview" src={image} alt="Selected reference" /><button disabled={busy} onClick={() => setImage(null)}>Remove reference</button></> : null}
        {shop && image ? <small>Reference-image understanding works only on the Astra blueprint path today. REAL Oracle/Blender model jobs are prompt-only until image input is verified end-to-end.</small> : !health.generationReady && image ? <small>The selected image is shown locally, but the no-cost DEMO uses the text prompt only. Image understanding requires a future LIVE Astra allowance.</small> : null}

        {shop ? <>
          <span className="eyebrow">REAL 3D · ASTRA + MCP2 ORACLE + BLENDER</span>
          {publicOraclePilot ? <>
            <button className="primary" disabled={busy || !!image} onClick={() => void generateOracleModel()}>{busyKind === 'oracle' ? `REAL 3D · ${oracleJob?.state || 'starting'} · ${seconds}s` : 'Generate REAL 3D model · Astra + Blender'}</button>
            <small>No owner code is needed during this short public hard-capped pilot. The shared cumulative ceiling still controls cost.</small>
          </> : ownerOraclePilot ? <>
            <label>Owner generation code<input type="password" minLength={32} maxLength={256} autoComplete="off" value={ownerAccess} disabled={busy} onChange={e => setOwnerAccess(e.target.value)} /><small>Used only for this model job and cleared from the field when generation starts.</small></label>
            <button className="primary" disabled={busy || !!image} onClick={() => void generateOracleModel()}>{busyKind === 'oracle' ? `REAL 3D · ${oracleJob?.state || 'starting'} · ${seconds}s` : 'Generate REAL 3D model · Astra + Blender'}</button>
          </> : <button className="primary" disabled>REAL 3D generation locked</button>}
          <p className="result-note">{publicOraclePilot
            ? 'One reviewed public MCP2-style Oracle/Blender job can use the remaining hard-capped reservation. The GLB appears here first; nothing downloads automatically.'
            : ownerOraclePilot
              ? 'The server can submit a prompt-only Oracle/Blender job. The GLB is fetched into the page and rendered first; downloading remains an explicit action.'
              : oracleGate?.note || 'Production Oracle model writes are disabled until an explicit cost-approved pilot is enabled.'}</p>
          {oracleJob ? <p role="status" className="result-note">Oracle job: <strong>{oracleJob.state}</strong>{oracleJob.detail ? ` · ${oracleJob.detail}` : ''}</p> : null}
        </> : null}

        {health.accessRequired ? <label>Preview access code<input type="password" autoComplete="off" value={accessCode} disabled={busy} onChange={e => setAccessCode(e.target.value)} /><small>Temporary maker preview gate; a hard-capped public pilot does not require login.</small></label> : null}
        <button className={shop ? '' : 'primary'} disabled={busy || !health.generationReady} onClick={() => void generateLive()}>{busyKind === 'astra' ? `Astra working · ${seconds}s` : shop ? 'Create Astra product specification' : 'Create with GPT-6 Astra'}</button>
        <button disabled={busy} onClick={() => generateDemo()}>{shop ? 'Generate DEMO concept · no download' : 'Try DEMO locally · no API cost'}</button>
        {busy ? <button onClick={() => abort.current?.abort()}>Cancel current generation</button> : null}
        {error ? <p role="alert" className="error">{error}</p> : null}
        {!health.generationReady ? <p className="result-note">LIVE Astra blueprint generation is currently blocked by the exhausted pilot quota. DEMO remains local and clearly labelled MOCK.</p> : null}
      </aside>
    </div>

    {realModel ? <section className="generation-evidence" aria-label="Real generated model evidence">
      <span className="eyebrow">REAL 3D MODEL OUTPUT</span>
      <p><strong>LIVE · {realModel.provenance}</strong> · Oracle job <code>{realModel.jobId}</code></p>
      <p>Server-validated GLB: {realModel.blob.size.toLocaleString()} bytes. SHA-256: <code>{realModel.sha256}</code></p>
      <p><small>This is a generated 3D artifact, not a manufacturing approval. Geometry, likeness, topology, textures, scale and MAKE suitability still require review.</small></p>
    </section> : null}

    <section className="generation-evidence" aria-label={shop ? 'Product concept result' : 'World generation result'}>
      <span className="eyebrow">{shop ? 'PRODUCT CONCEPT OUTPUT' : 'WORLD OUTPUT'}</span>
      {!result ? <p>{shop ? (realModel ? 'A REAL GLB is shown above. Astra/DEMO specification output is separate.' : 'No concept specification yet. DEMO can preview a local concept without downloading a file.') : 'No result yet. The current scene is the starting state.'}</p> : <>
        <p><strong>{live ? 'LIVE · GENERATED' : 'DEMO · MOCK'}</strong>{live ? ` · ${result.model} · request ${result.requestId.slice(0, 12)}…` : ' · local no-cost fallback'}</p>
        <div className="workflow-pair">
          <article><span className="eyebrow">GAME · {live ? 'GENERATED SPEC' : 'MOCK SPEC'} / PROCEDURAL PREVIEW</span><h3>{spec?.name ?? result.blueprint.title}</h3><p>{spec?.game.gameplayRole}</p><p>{spec?.game.materialPlan}</p><p>{spec?.game.animationPlan}</p></article>
          <article><span className="eyebrow">MAKE · BLOCKED / VALIDATION REQUIRED</span><h3>{spec?.make.materialCandidate ?? 'No MAKE candidate'}</h3>{spec ? <><p>{spec.make.dimensionsMm.x} × {spec.make.dimensionsMm.y} × {spec.make.dimensionsMm.z} mm · {spec.make.processCandidate}</p><ul>{spec.make.constraints.map(c => <li key={c}>{c}</li>)}</ul></> : null}</article>
        </div>
        <details><summary>Inspect WorldBlueprint</summary><pre>{JSON.stringify(result.blueprint, null, 2)}</pre></details>
        <details><summary>Inspect AssetSpec</summary><pre>{JSON.stringify(result.assetSpec, null, 2)}</pre></details>
        {live && result.evidence ? <details><summary>Provider evidence</summary><p>{result.evidence.receivedAt} · {result.evidence.totalTokens ?? 'usage unavailable'} tokens</p><p>Blueprint SHA-256: {result.evidence.blueprintSha256}</p></details> : null}
        <p><small>{result.limitation}</small></p>
      </>}
    </section>
  </div>
}
