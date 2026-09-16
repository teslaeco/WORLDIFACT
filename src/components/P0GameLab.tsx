import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Group } from 'three'
import StartingWorld from './StartingWorld'
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

type Health = { generationReady?: boolean; accessRequired?: boolean; publicPilot?: boolean; model?: string | null }

export default function P0GameLab() {
  const navigate = useNavigate()
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() => meadowBlueprint())
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [health, setHealth] = useState<Health>({})
  const [prompt, setPrompt] = useState('Design a solar exploration workshop with a rover beside a restored forest.')
  const [image, setImage] = useState<string | null>(null)
  const [accessCode, setAccessCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(v => setHealth(v || {}))
      .catch(() => setHealth({ generationReady: false }))
  }, [])
  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [busy])

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
      'DEMO / MOCK local scene. No GPT-6 Astra request was made; MAKE remains validation-required.',
    )
    setPrompt(input)
    setBlueprint(demo.blueprint)
    setResult(demo)
  }

  async function generateLive() {
    if (busy) return
    setBusy(true); setSeconds(0); setError('')
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
      window.clearTimeout(timeout); abort.current = null; setBusy(false)
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
        download(new Blob([output as ArrayBuffer], { type: 'model/gltf-binary' }), 'WORLDIFACT-GAME-procedural.glb')
      } finally { disposeObject(scene) }
    } catch { setError('GAME GLB export failed; the generated scene is still available.') }
  }

  const spec = result?.assetSpec
  const live = result?.mode === 'LIVE' && result.provenance === 'GENERATED'
  return <div className="studio">
    <div className="studio-heading">
      <div><span className="eyebrow">AI GAME LAB · P0</span><h1>Ideas become playable worlds.</h1></div>
      <span className="pill">{health.generationReady ? (health.publicPilot ? 'LIVE public Astra pilot' : 'LIVE Astra preview') : 'DEMO only'}</span>
    </div>
    <nav className="world-tabs" aria-label="AI Game Lab views">
      <span className="active" aria-current="page">WORLDIFACT P0</span>
      <a href={REFERENCE_LINKS.gameLabPublic} target="_blank" rel="noreferrer">World #5 · Forge Studio ↗</a>
      <a href={REFERENCE_LINKS.gameLabSource} target="_blank" rel="noreferrer">ForgeMCP source ↗</a>
    </nav>
    <p><strong>PROMPT / IMAGE → GPT-6 ASTRA → WORLD BLUEPRINT + ASSET SPEC → SCENE CHANGE → GAME / MAKE</strong></p>
    <p className="result-note">You are already inside AI Game Lab. Its portal is marked YOU ARE HERE; the other four portals open their worlds.</p>
    <div className="studio-layout">
      <div className="studio-scene">
        <StartingWorld blueprint={blueprint} activePortalId="ai-game-lab" onPortalOpen={(id) => navigate(routeForPortal(id))} />
        <div className="scene-toolbar">
          <button onClick={exportGameGlb}>Export GAME · procedural GLB</button>
          <button onClick={() => download(new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' }), 'WORLDIFACT-WorldBlueprint.json')}>Download WorldBlueprint</button>
          {spec ? <button onClick={() => download(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), 'WORLDIFACT-AssetSpec.json')}>Download AssetSpec</button> : null}
        </div>
      </div>
      <aside className="creator-panel">
        <span className="eyebrow">WORLD INPUT</span>
        <label>Prompt<textarea rows={6} maxLength={2000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} /></label>
        <div className="prompt-presets" aria-label="No-cost demo examples">
          {DEMO_EXAMPLES.map(example => <button key={example.id} type="button" disabled={busy} onClick={() => generateDemo(example.prompt)}>{example.label}</button>)}
        </div>
        <label>Reference image · optional<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void pickImage(e.target.files?.[0])} /></label>
        {image ? <><img className="reference-preview" src={image} alt="Selected reference" /><button disabled={busy} onClick={() => setImage(null)}>Remove reference</button></> : null}
        {health.accessRequired ? <label>Preview access code<input type="password" autoComplete="off" value={accessCode} disabled={busy} onChange={e => setAccessCode(e.target.value)} /><small>Temporary maker preview gate; a hard-capped public pilot does not require login.</small></label> : null}
        <button className="primary" disabled={busy || !health.generationReady} onClick={() => void generateLive()}>{busy ? `Astra working · ${seconds}s` : 'Create with GPT-6 Astra'}</button>
        <button disabled={busy} onClick={() => generateDemo()}>Try DEMO locally · no API cost</button>
        {busy ? <button onClick={() => abort.current?.abort()}>Cancel</button> : null}
        {error ? <p role="alert" className="error">{error}</p> : null}
        {!health.generationReady ? <p className="result-note">LIVE Astra is currently blocked by the exhausted pilot quota. DEMO works locally and is clearly labelled MOCK.</p> : null}
      </aside>
    </div>
    <section className="generation-evidence" aria-label="World generation result">
      <span className="eyebrow">WORLD OUTPUT</span>
      {!result ? <p>No result yet. The current scene is the starting state.</p> : <>
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
