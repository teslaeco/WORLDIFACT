import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { validatePrivateWorld, WORLD_ID, type PrivateWorld, type SavedWorld } from '../lib/privateWorld'
import { DEFAULT_GAME_TUNING, parseGameLabPrompt, validateGameTuning, type GameTuning } from '../lib/gameLabTuning'
import './PrivateGameLab.css'
import './GameLabPlaytest.css'

const WorldCanvas = lazy(() => import('../components/PrivateWorldCanvas'))
type Summary = { id: string; name: string; revision: number; updatedAt: string }

async function readApi(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', ...init })
  const body = await response.json() as Record<string, unknown>
  if (!response.ok || body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : 'The world service is unavailable.')
  return body
}

export default function GameLabPlaytest() {
  const { user, loading } = useAccount()
  const owner = user?.id ?? null
  const [worldList, setWorldList] = useState<Summary[]>([])
  const [selectedWorld, setSelectedWorld] = useState('')
  const [world, setWorld] = useState<PrivateWorld | null>(null)
  const [revision, setRevision] = useState(0)
  const [settings, setSettings] = useState<GameTuning>({ ...DEFAULT_GAME_TUNING })
  const [dirty, setDirty] = useState(false)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('Increase speed to 120 km/h, steering 65%')
  const [message, setMessage] = useState('Open a world saved in My World to test your game.')
  const [error, setError] = useState('')
  const [point] = useState({ x: -8, z: 0 })
  const selectedRef = useRef('')
  const ownerRef = useRef(owner)
  const settingsRevision = useRef(0)
  ownerRef.current = owner
  selectedRef.current = selectedWorld

  useEffect(() => {
    const controller = new AbortController()
    setWorld(null); setWorldList([]); setSelectedWorld(''); setDirty(false); setRunning(false); setRevision(0)
    setSettings({ ...DEFAULT_GAME_TUNING }); settingsRevision.current++
    setError('')
    if (!owner) return () => controller.abort()
    void readApi('/api/worlds', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || ownerRef.current !== owner) return
      const list = Array.isArray(result.worlds) ? result.worlds.filter((item): item is Summary => {
        if (!item || typeof item !== 'object') return false
        const value = item as Record<string, unknown>
        return typeof value.id === 'string' && WORLD_ID.test(value.id) && typeof value.name === 'string' &&
          typeof value.revision === 'number' && typeof value.updatedAt === 'string'
      }) : []
      setWorldList(list)
      const requested = new URLSearchParams(window.location.search).get('world')
      setSelectedWorld(list.find(item => item.id === requested)?.id ?? list[0]?.id ?? '')
      if (!list.length) setMessage('No saved worlds yet. Create a scene in My World, save it, and return to Game Lab.')
    }).catch(err => { if (!controller.signal.aborted && ownerRef.current === owner) setError(err instanceof Error ? err.message : 'Cannot read your world list.') })
    return () => controller.abort()
  }, [owner])

  useEffect(() => {
    const controller = new AbortController()
    setWorld(null); setRunning(false); setDirty(false); setRevision(0)
    setError('')
    if (!owner || !WORLD_ID.test(selectedWorld)) return () => controller.abort()
    const actor = owner, id = selectedWorld
    void readApi('/api/worlds/' + encodeURIComponent(id), { signal: controller.signal }).then(body => {
      if (controller.signal.aborted || ownerRef.current !== actor || selectedRef.current !== id) return
      const record = body as unknown as SavedWorld
      const doc = validatePrivateWorld(record.document)
      if (doc.id !== id || !Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error('Saved world revision is invalid.')
      setWorld(doc); setRevision(record.revision); setSettings(validateGameTuning(doc.gameplay ?? DEFAULT_GAME_TUNING))
      settingsRevision.current++
      setMessage('Loaded "' + doc.name + '". This is a playable test of your saved scene, not an exported application.')
    }).catch(err => { if (!controller.signal.aborted && ownerRef.current === actor) setError(err instanceof Error ? err.message : 'Could not load this world.') })
    return () => controller.abort()
  }, [owner, selectedWorld])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const changeSettings = (next: GameTuning) => {
    try { setSettings(validateGameTuning(next)); settingsRevision.current++; setDirty(true); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Invalid settings.') }
  }
  const applyPrompt = (event: FormEvent) => {
    event.preventDefault()
    try { const update = parseGameLabPrompt(prompt, settings); changeSettings(update.settings); setMessage(update.changes.join(', ') + ' updated locally · 0 AI points. Save settings when ready.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unsupported instruction.') }
  }
  const saveSettings = async () => {
    if (!owner || !world || !dirty || busy) return
    const actor = owner, worldId = world.id, version = settingsRevision.current, proposed = { ...world, gameplay: validateGameTuning(settings) }
    setBusy(true); setError('')
    try {
      const body = await readApi('/api/worlds/' + encodeURIComponent(worldId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: proposed, expectedRevision: revision }), signal: AbortSignal.timeout(18000),
      })
      const record = body as unknown as SavedWorld
      if (ownerRef.current !== actor || selectedRef.current !== worldId) return
      if (record.revision !== revision + 1 || JSON.stringify(validatePrivateWorld(record.document)) !== JSON.stringify(validatePrivateWorld(proposed)))
        throw new Error('The server did not confirm your exact settings. They remain on this device.')
      setRevision(record.revision); setWorld(proposed)
      if (version === settingsRevision.current) setDirty(false)
      setMessage('Playtest configuration saved privately with this world. No game export or server build was started.')
    } catch (err) {
      if (ownerRef.current === actor && selectedRef.current === worldId) setError(err instanceof Error ? err.message : 'Settings could not be saved.')
    } finally { if (ownerRef.current === actor && selectedRef.current === worldId) setBusy(false) }
  }
  const chooseWorld = (id: string) => {
    if (id === selectedWorld || !worldList.some(item => item.id === id)) return
    if (dirty && !window.confirm('Discard unsaved playtest settings and open another world?')) return
    setSelectedWorld(id)
    window.history.replaceState(window.history.state, '', '/lab?world=' + encodeURIComponent(id))
  }
  const canPlay = Boolean(owner && world && world.id === selectedWorld && !loading)
  return <main className="game-lab" data-testid="game-lab-playtest">
    <header className="game-lab-header">
      <Link className="game-lab-brand" to="/world">WORLDIFACT <small>← Six portals</small></Link>
      <nav aria-label="Game Lab navigation"><Link to="/account/worlds" onClick={event => { if (dirty && !window.confirm('Leave with unsaved playtest settings?')) event.preventDefault() }}>My World · Editor</Link><Link to="/shop">AI Shop</Link><Link to="/account/credits">Plans</Link></nav>
    </header>
    <section className="game-lab-hero">
      <div><span className="game-lab-label">AI GAME LAB · PLAYTEST</span><h1>Build in My World. Play here.</h1><p>Import a saved world, test its scene and vehicles, then tune the game without paying for simple local adjustments.</p></div>
      <span className="game-lab-phase">PLAYTEST · EXPERIMENTAL</span>
    </section>
    <div className="game-lab-topbar">
      <label>Game project<select data-testid="game-lab-project" value={selectedWorld} disabled={!owner || busy} onChange={event => chooseWorld(event.target.value)}>
        {!worldList.length && <option value="">No saved worlds</option>}
        {worldList.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <button type="button" disabled={!canPlay || busy} onClick={() => setRunning(current => !current)}>{running ? '■ Stop test' : '▶ Play game'}</button>
      <button type="button" disabled={!canPlay || busy || !dirty} onClick={() => void saveSettings()}>{busy ? 'Saving…' : dirty ? 'Save game settings *' : 'Settings saved'}</button>
      <Link className="game-lab-link" to="/account/worlds">Edit scene in My World →</Link>
    </div>
    {!owner && <p role="status">Sign in to load worlds and models from your personal library. <Link to="/login">Sign in →</Link></p>}
    <div className="game-lab-layout">
      <section className="game-lab-stage" aria-label="Game test viewport">
        {canPlay && world ? <Suspense fallback={<p className="game-lab-loading">Preparing the 3D scene…</p>}>
          <WorldCanvas owner={owner} world={world} playing={running} selected={null} point={point} onPick={() => {}} onMessage={setMessage} vehicleMode={settings.vehicleMode} gameplay={settings} />
        </Suspense> : <div className="game-lab-placeholder"><h2>Your playtest viewport</h2><p>Save a world in My World and select it here. This panel doesn't create worlds or charge AI points.</p><Link to="/account/worlds">Open My World →</Link></div>}
        <p className="game-lab-status" role="status">{message}</p>{error && <p className="game-lab-error" role="alert">{error}</p>}
      </section>
      <aside className="game-lab-controls">
        <span className="game-lab-label">CONTROLS AND RENDERING</span>
        <label className="game-lab-checkbox"><input type="checkbox" checked={settings.vehicleMode} disabled={!canPlay} onChange={event => changeSettings({ ...settings, vehicleMode: event.target.checked })} /> Drive vehicle · car / rover test</label>
        <label>Vehicle top speed · {settings.speedKmh} km/h (simulation target)<input type="range" min="10" max="300" step="10" value={settings.speedKmh} disabled={!canPlay} onChange={event => changeSettings({ ...settings, speedKmh: Number(event.target.value) })} /></label>
        <label>Steering sensitivity · {settings.steeringPercent}%<input type="range" min="10" max="100" step="5" value={settings.steeringPercent} disabled={!canPlay} onChange={event => changeSettings({ ...settings, steeringPercent: Number(event.target.value) })} /></label>
        <label>Rendering<select value={settings.renderQuality} disabled={!canPlay} onChange={event => changeSettings({ ...settings, renderQuality: event.target.value as GameTuning['renderQuality'] })}><option value="eco">Eco · mobile</option><option value="balanced">Balanced</option><option value="quality">Quality · desktop</option></select></label>
        <form onSubmit={applyPrompt}><label>Game instructions<textarea maxLength={320} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Increase speed to 220 km/h, steering 65%, render high quality" /></label><button type="submit" disabled={!canPlay}>Apply local prompt · 0 points</button></form>
        <p className="game-lab-hint">WASD / arrows to move, steer or drive; on phones use the on-screen arrows. This parser supports bounded speed, steering, mode and graphics settings. Complex game logic and AI scripting are not live yet.</p>
      </aside>
    </div>
    <section className="game-lab-export" aria-label="Subscriber game exports">
      <div><span className="game-lab-label">PAID SUBSCRIPTION · BUILD SERVICE</span><h2>Download your playable game</h2><p>Windows, Linux and Android packaging requires an isolated build server, signed/validated artifacts and a server-side subscription check. These builds are BLOCKED until that pipeline is tested; no download or payment is attempted here.</p></div>
      <div className="game-lab-platforms"><button disabled title="Build pipeline not yet ready">Windows .exe · PLANNED</button><button disabled title="Build pipeline not yet ready">Linux · PLANNED</button><button disabled title="Build pipeline not yet ready">Android .apk · PLANNED</button></div>
      <p className="game-lab-hint">Future exports will be available only to paid subscribers after server verification. Individual AI Shop GLB exports are separate and unchanged.</p>
    </section>
  </main>
}
