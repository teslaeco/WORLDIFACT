import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StartingWorld from './StartingWorld'
import { demoBlueprint, localSceneResult, meadowBlueprint, validateGenerationResult } from '../lib/blueprint'
import type { GenerationResult, WorldBlueprint } from '../lib/blueprint'
import { routeForPortal } from '../lib/portalRouting'
import './PortalAstraGenerator.css'

type WorldId =
  | 'chess-cube-512-ai'
  | 'terra-fix-iss'
  | '8-planets-in-8-days'
  | 'enchanted-ai-shop'
  | 'ai-game-lab'

type Health = {
  generationReady?: boolean
  accessRequired?: boolean
  publicPilot?: boolean
  model?: string | null
}

const MAX_REFERENCE_BYTES = 6 * 1024 * 1024
const DEFAULT_PROMPTS: Record<WorldId, string> = {
  'chess-cube-512-ai': 'Design a playable 8×8×8 chess arena asset with a clear board silhouette, safe readable geometry and a GAME plan.',
  'terra-fix-iss': 'Design an ISS repair-training scene that explores maintenance and preservation without claiming real current ISS failures or proven preservation feasibility.',
  '8-planets-in-8-days': 'Design a planetary exploration checkpoint with hazards, restoration technology and a clear platforming route.',
  'enchanted-ai-shop': 'Design a distinctive product concept for a 3D preview with separate GAME and validation-required MAKE plans.',
  'ai-game-lab': 'Design a reusable game-world scene with a character-scale landmark, vehicle or building and clear GAME and MAKE plans.',
}

export default function PortalAstraGenerator({ worldId, title }: { worldId: WorldId; title: string }) {
  const navigate = useNavigate()
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() => meadowBlueprint())
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [health, setHealth] = useState<Health>({})
  const [prompt, setPrompt] = useState(DEFAULT_PROMPTS[worldId])
  const [image, setImage] = useState<string | null>(null)
  const [accessCode, setAccessCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setHealth(value || {}) })
      .catch(() => { if (!controller.signal.aborted) setHealth({ generationReady: false }) })
    return () => controller.abort()
  }, [])

  async function chooseImage(file?: File) {
    setError('')
    setImage(null)
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_REFERENCE_BYTES) {
      setError('Choose PNG, JPEG or WebP up to 6 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.onerror = () => setError('Reference image could not be read.')
    reader.readAsDataURL(file)
  }

  function generateDemo() {
    if (busy || prompt.trim().length < 3) return
    const demo = localSceneResult(
      demoBlueprint(`${title}: ${prompt}`),
      'DEMO / MOCK local scene. No GPT-6 Astra request was made; MAKE remains validation-required.',
    )
    setBlueprint(demo.blueprint)
    setResult(demo)
    setError('')
  }

  async function generateLive() {
    if (busy) return
    const previous = blueprint
    setBusy(true)
    setError('')
    const controller = new AbortController()
    abort.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 40_000)
    try {
      if (!health.generationReady) throw new Error('LIVE Astra generation is not available right now. Use the labelled DEMO fallback.')
      if (prompt.trim().length < 3 || prompt.length > 2000) throw new Error('Use a prompt between 3 and 2000 characters.')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (health.accessRequired) {
        if (accessCode.trim().length < 32) throw new Error('Enter the preview access code.')
        headers['X-WORLDIFACT-Access'] = accessCode.trim()
      }
      const response = await fetch('/api/blueprint', {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ worldId, prompt, image, mode: 'live' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Astra generation failed; the previous scene is unchanged.')
      const validated = validateGenerationResult(body)
      if (validated.mode !== 'LIVE' || validated.provenance !== 'GENERATED') throw new Error('The server did not return verified LIVE evidence.')
      setBlueprint(validated.blueprint)
      setResult(validated)
    } catch (reason) {
      setBlueprint(previous)
      setError(reason instanceof Error && reason.name === 'AbortError' ? 'Generation timed out; the previous scene is unchanged.' : reason instanceof Error ? reason.message : 'Generation failed.')
    } finally {
      window.clearTimeout(timeout)
      abort.current = null
      setBusy(false)
    }
  }

  const live = result?.mode === 'LIVE' && result.provenance === 'GENERATED'
  return <section className="portal-astra" aria-label={`${title} Astra generator`}>
    <div className="portal-astra-head">
      <div><span className="eyebrow">GPT-6 ASTRA · {worldId}</span><h2>Create inside this portal</h2></div>
      <span className={`pill ${live ? 'live' : ''}`}>{live ? 'LIVE · GENERATED' : result ? 'DEMO · MOCK' : health.generationReady ? 'LIVE READY' : 'DEMO READY'}</span>
    </div>
    <p>One shared server-side Astra workflow turns this portal prompt into a validated WorldBlueprint + AssetSpec. GAME is a procedural preview; MAKE always requires external validation.</p>
    <div className="portal-astra-layout">
      <div className="portal-astra-preview">
        <StartingWorld blueprint={blueprint} activePortalId={worldId} onPortalOpen={id => navigate(routeForPortal(id))} />
      </div>
      <div className="portal-astra-controls">
        <label>Portal prompt<textarea rows={5} maxLength={2000} value={prompt} disabled={busy} onChange={event => setPrompt(event.target.value)} /></label>
        <label>Reference image · optional · max 6 MB<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void chooseImage(event.target.files?.[0]) }} /></label>
        <label className="scan-input">Scan with phone camera · BETA<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => { void chooseImage(event.target.files?.[0]) }} /></label>
        {image && <div className="portal-astra-reference"><img src={image} alt="Selected portal reference" /><button type="button" disabled={busy} onClick={() => setImage(null)}>Remove image</button></div>}
        {health.accessRequired && <label>Preview access code<input type="password" autoComplete="off" value={accessCode} disabled={busy} onChange={event => setAccessCode(event.target.value)} /></label>}
        <div className="portal-astra-buttons">
          <button className="primary" type="button" disabled={busy || !health.generationReady} onClick={() => { void generateLive() }}>{busy ? 'Astra working…' : 'Generate with Astra'}</button>
          <button type="button" disabled={busy} onClick={generateDemo}>Try DEMO · no API cost</button>
          {busy && <button type="button" onClick={() => abort.current?.abort()}>Stop waiting</button>}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {result && <div className="portal-astra-result">
          <strong>{live ? 'LIVE · GENERATED' : 'DEMO · MOCK'}</strong>
          <span>{result.assetSpec?.name ?? result.blueprint.title}</span>
          <small>GAME: procedural preview · MAKE: VALIDATION REQUIRED</small>
        </div>}
      </div>
    </div>
  </section>
}
