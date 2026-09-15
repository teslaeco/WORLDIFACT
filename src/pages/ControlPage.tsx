import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FOUNDATIONS } from '../config/foundations'
import './control.css'

type Status = { checkedAt: string; cloudflare: string; openai: string; oracle: string; ownerChecks: boolean }
type OracleWorlds = {
  checkedAt: string
  oracle: string
  connectorVersion?: number
  characterStandard?: number
  provider?: string
  model?: string
  worlds: { id: string; oracle: string }[]
  evidence?: string
}

const labels: Record<string, string> = {
  RESPONDING: 'Worker responding', KEY_CONFIGURED: 'Key configured; no live generation proof',
  NOT_CONFIGURED: 'Not configured in WORLDIFACT', CONFIGURED_NOT_CHECKED: 'Configured; connection not checked',
  MODEL_ACCESS_VERIFIED: 'Model access verified; generation not tested', CHECK_FAILED: 'Check failed',
  INVALID_METADATA: 'Unexpected model response', INVALID_HEALTH_RESPONSE: 'Unexpected connector response',
  CONNECTOR_READY: 'Connector ready for shared world services', CONNECTOR_NOT_READY: 'Connector reports not ready',
}
const editors = [
  { url: 'https://github.dev/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer', label: 'Open source editor', note: 'GitHub sign-in and repository write access are required. Publish through the original repository.' },
  { url: 'https://github.dev/teslaeco/WORLDIFACT/tree/main/public/apps/iss', label: 'Edit station source', note: 'The station source is in WORLDIFACT. Commit and review changes; the main branch deploys automatically.' },
  { note: 'World and asset editing remains in the original signed-in FORGE application. Its owner identity and storage have not been migrated.' },
  { note: 'Use the original signed-in shop for its existing editing functions. Catalog storage and publishing permissions remain with that application.' },
  { url: 'https://github.dev/teslaeco/Froge-MPC-2-test', label: 'Open Froge source editor', note: 'The repository is public. Its code is a separate snapshot; editing it does not automatically update the current Sites release.' },
]

export default function ControlPage() {
  const [state, setState] = useState<Status | null>(null)
  const [oracleWorlds, setOracleWorlds] = useState<OracleWorlds | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [owner, setOwner] = useState('')
  const [evidence, setEvidence] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/platform', { signal: abort.signal, cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error('Platform status unavailable')
      const data = await r.json() as Status
      if (typeof data.ownerChecks !== 'boolean' || typeof data.checkedAt !== 'string') throw new Error('Invalid platform response')
      setState(data)
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Status unavailable') })

    fetch('/api/platform/oracle-worlds', { signal: abort.signal, cache: 'no-store' }).then(async r => {
      const data = await r.json() as OracleWorlds
      if (!Array.isArray(data.worlds) || typeof data.oracle !== 'string') throw new Error('Invalid Oracle bridge response')
      setOracleWorlds(data)
    }).catch(() => { if (!abort.signal.aborted) setOracleWorlds(null) })
    return () => abort.abort()
  }, [])
  async function check() {
    setBusy(true); setError(''); setEvidence('')
    try {
      const r = await fetch('/api/platform/check', { method: 'POST',
        headers: { 'X-WORLDIFACT-Owner': owner }, signal: AbortSignal.timeout(22000) })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || 'Connection check failed')
      setState(previous => previous ? { ...previous, ...result } : previous)
      setEvidence(result.evidence)
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection check failed') }
    finally { setBusy(false); setOwner('') }
  }
  return <main className="control-page">
    <Link to="/">← Back to WORLDIFACT</Link>
    <span className="eyebrow">PLATFORM CONTROL</span><h1>Five worlds. One starting point.</h1>
    <p>Open each world, access its existing editing tools and check the shared services.</p>
    <section className="control-services" aria-label="Connection status">
      {(['cloudflare', 'openai', 'oracle'] as const).map(service => <article key={service}>
        <h2>{service === 'openai' ? 'OpenAI' : service === 'oracle' ? 'Oracle · Blender' : 'Cloudflare'}</h2>
        <p>{state ? labels[state[service]] || 'Unknown status' : 'Reading status…'}</p>
      </article>)}
    </section>
    <p>Connection checks never generate models, images or paid AI responses. The scene editor remains available in DEMO mode.</p>
    {state && <small>Last status: {new Date(state.checkedAt).toLocaleString()}</small>}
    <details className="control-owner"><summary>Owner connection checks</summary>
      {state?.ownerChecks ? <form onSubmit={e => { e.preventDefault(); void check() }}>
        <label>Owner access code<input type="password" value={owner} minLength={32} maxLength={256}
          autoComplete="off" required onChange={e => setOwner(e.target.value)} /></label>
        <button disabled={busy}>{busy ? 'Checking…' : 'Check OpenAI and Oracle'}</button>
        <p>The code is cleared after the check and is never saved in browser storage.</p>
      </form> : <p>Owner diagnostics require a separate OWNER_ACCESS_TOKEN server secret. Oracle also requires its current endpoint and a valid connector credential. No connection is assumed from an old address.</p>}
      <a href="https://github.com/teslaeco/WORLDIFACT/blob/main/docs/PLATFORM_CONNECTIONS.md" target="_blank" rel="noreferrer">Setup and migration checklist ↗</a>
    </details>
    {error && <p role="alert">{error}</p>}{evidence && <p role="status">{evidence}</p>}
    <div className="control-worlds">
      {FOUNDATIONS.slice(0, 5).map((world, i) => {
        const bridge = oracleWorlds?.worlds.find(item => item.id === world.id)
        return <article key={world.id}>
          <span className="eyebrow">WORLD {i + 1}</span><h2>{world.title}</h2>
          <p className={`oracle-world-status ${bridge?.oracle === 'CONNECTOR_READY' ? 'ready' : ''}`}>
            <strong>Oracle bridge:</strong> {bridge ? labels[bridge.oracle] || bridge.oracle : 'Checking shared backend…'}
            {oracleWorlds?.connectorVersion ? ` · connector v${oracleWorlds.connectorVersion}` : ''}
            {oracleWorlds?.characterStandard ? ` · character standard ${oracleWorlds.characterStandard}` : ''}
            {oracleWorlds?.provider ? ` · ${oracleWorlds.provider}` : ''}
            {oracleWorlds?.model ? ` · ${oracleWorlds.model}` : ''}
          </p>
          <p>{editors[i].note}</p>
          <div className="control-actions"><Link className="button-link" to={world.route}>Open world</Link>
            <a href={world.original} target="_blank" rel="noreferrer">Open original / sign in ↗</a>
            {editors[i].url && <a href={editors[i].url} target="_blank" rel="noreferrer">{editors[i].label} ↗</a>}
          </div>
        </article>
      })}
    </div>
    <section className="control-owner"><h2>Shared tools</h2><div className="control-actions">
      <Link to="/builder">Edit a WORLDIFACT scene</Link><Link to="/make">Check manufacturing requirements</Link>
      <Link to="/terra">Earth observations</Link>
      <a href="https://github.com/teslaeco/WORLDIFACT/actions" target="_blank" rel="noreferrer">Deployment history ↗</a>
    </div><p>Oracle is one shared backend for the five WORLDIFACT worlds. This bridge currently proves authenticated health only; job creation and shared publishing stay disabled until their write paths are reviewed and enabled explicitly.</p></section>
  </main>
}
