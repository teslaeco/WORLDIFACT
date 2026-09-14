import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import AssetWorkflowPanel from '../components/AssetWorkflowPanel'
import { PORTALS, getPortalById } from '../config/portals'
import { getOptionalExternalDemoUrl } from '../lib/env'
import type { AssetRecord } from '../types/worldifact'

const shopAssets: AssetRecord[] = [
  {
    id: 'shop-game-vase',
    name: 'Decorative River Vase',
    target: 'GAME',
    readiness: 'game-ready',
    format: 'GLB + PBR textures',
    notes: 'Optimized LOD and PBR maps for interactive scenes.',
  },
  {
    id: 'shop-make-vase',
    name: 'Decorative River Vase',
    target: 'MAKE',
    readiness: 'validation-required',
    format: 'STEP candidate',
    notes: 'Requires wall-thickness and manifold checks before fabrication.',
  },
]

const labAssets: AssetRecord[] = [
  {
    id: 'lab-mech',
    name: 'Valley Rover Mk-I',
    target: 'GAME',
    readiness: 'concept',
    format: 'FBX prototype',
    notes: 'Placeholder rig and movement scripts in DEMO mode.',
  },
  {
    id: 'lab-door',
    name: 'Research Lab Airlock Door',
    target: 'MAKE',
    readiness: 'manufacturing-reviewed',
    format: 'DXF + CNC notes',
    notes: 'Reviewed for process constraints and component connectivity.',
  },
]

const planetStops = [
  'Mercury Relay Cliffs',
  'Venus Cloud Foundry',
  'Earth Orbit Relay',
  'Mars Iceworks Basin',
  'Jupiter Magnet Storm Deck',
  'Saturn Ringline Pass',
  'Uranus Cryo Drift',
  'Neptune Aurora Forge',
]

const archiveModels = [
  { id: 'chr-01', name: 'Scout Character', type: 'Character', status: 'DEMO local asset' },
  { id: 'veh-03', name: 'River Survey Bike', type: 'Vehicle', status: 'DEMO local asset' },
  { id: 'bld-02', name: 'Modular Habitat Block', type: 'Building', status: 'DEMO local asset' },
  { id: 'obj-11', name: 'Irrigation Gate', type: 'Environment', status: 'DEMO local asset' },
]

export default function PortalPage() {
  const { portalId } = useParams()
  const portal = portalId ? getPortalById(portalId) : undefined
  const [prompt, setPrompt] = useState('')
  const [materialCategory, setMaterialCategory] = useState('Bioplastic')
  const [referenceFileName, setReferenceFileName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sceneItems, setSceneItems] = useState<string[]>([])

  const filteredArchive = useMemo(() => {
    return archiveModels.filter((model) => model.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [searchTerm])

  if (!portal) {
    return <Navigate to="/" replace />
  }

  const externalDemoUrl = getOptionalExternalDemoUrl(portal.externalDemoEnv)

  return (
    <main className="portal-page">
      <header>
        <Link to="/" className="back-link">
          ← Back to valley
        </Link>
        <h1>{portal.title}</h1>
        <p>{portal.description}</p>
      </header>

      {portal.id === 'chess-cube-512-ai' ? (
        <section>
          <h2>8×8×8 strategy space</h2>
          <p>
            This portal demonstrates AI-vs-player matches, custom piece libraries and board-topology experiments for a
            true 3D chess cube.
          </p>
          {externalDemoUrl ? (
            <p>
              External demo: <a href={externalDemoUrl}>Open verified Chess Cube demo</a>
            </p>
          ) : (
            <p>
              External demo URL not configured. Set <code>VITE_WORLDIFACT_CHESS_DEMO_URL</code> in your environment if
              a verified URL is available.
            </p>
          )}
        </section>
      ) : null}

      {portal.id === 'terra-fix-iss' ? (
        <section>
          <h2>Simulation and Earth observation</h2>
          <p>
            <strong>Simulation mode:</strong> Play repair scenarios, route resources and stabilize ISS subsystems.
          </p>
          <p>
            <strong>Observation mode:</strong> Browse clearly labeled Earth-observation references and mission context.
            Generated imagery in this demo is never presented as satellite evidence.
          </p>
        </section>
      ) : null}

      {portal.id === '8-planets-in-8-days' ? (
        <section>
          <h2>Eight worlds, eight restoration arcs</h2>
          <ol>
            {planetStops.map((planet) => (
              <li key={planet}>{planet}</li>
            ))}
          </ol>
          <p>
            Each planet has distinct hazards, gravity behavior, traversal tools and restoration goals for the platform
            campaign.
          </p>
        </section>
      ) : null}

      {portal.id === 'enchanted-ai-shop' ? (
        <>
          <section className="demo-badge">DEMO: Local prototype interface (no live manufacturer connection)</section>
          <section className="shop-grid">
            <label>
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe your object for generation"
                rows={4}
              />
            </label>
            <label>
              Reference image (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setReferenceFileName(event.target.files?.[0]?.name ?? '')}
              />
              <small>{referenceFileName ? `Selected: ${referenceFileName}` : 'No file selected'}</small>
            </label>
            <label>
              Material category
              <select value={materialCategory} onChange={(event) => setMaterialCategory(event.target.value)}>
                <option>Bioplastic</option>
                <option>Metal</option>
                <option>Wood Composite</option>
                <option>Resin</option>
              </select>
            </label>
          </section>
          <section className="split-review">
            <article>
              <h3>Geometry review</h3>
              <p>DEMO mesh validation queue: edge continuity, watertightness and component grouping.</p>
              <p>Status: validation-required</p>
            </article>
            <article>
              <h3>Appearance review</h3>
              <p>DEMO material stack preview with separate roughness and metallic channels.</p>
              <p>Status: game-ready preview candidate</p>
            </article>
          </section>
          <AssetWorkflowPanel assets={shopAssets} />
        </>
      ) : null}

      {portal.id === 'ai-game-lab' ? (
        <>
          <section className="demo-badge">DEMO: Local generation provider (no remote model generation connected)</section>
          <section className="lab-controls">
            <label>
              Prompt input
              <input
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Generate a storm-ready rover and modular lab"
              />
            </label>
            <div className="status-list" role="status" aria-live="polite">
              <span>Provider mode: DEMO</span>
              <span>Generation status: idle (no backend connected)</span>
              <span>Future support: driveable vehicles, enterable buildings, interactive doors</span>
            </div>
          </section>
          <section>
            <h3>Searchable model archive</h3>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search archive"
              aria-label="Search model archive"
            />
            <ul className="archive-list">
              {filteredArchive.map((model) => (
                <li key={model.id}>
                  <div>
                    <strong>{model.name}</strong>
                    <span>
                      {model.type} · {model.status}
                    </span>
                  </div>
                  <button type="button" onClick={() => setSceneItems((items) => [...items, model.name])}>
                    Add to Scene
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Scene list</h3>
            {sceneItems.length > 0 ? (
              <ol>
                {sceneItems.map((item, index) => (
                  <li key={`${item}-${index + 1}`}>{item}</li>
                ))}
              </ol>
            ) : (
              <p>No assets placed yet.</p>
            )}
          </section>
          <AssetWorkflowPanel assets={labAssets} />
        </>
      ) : null}

      <footer>
        <h2>All portals</h2>
        <ul>
          {PORTALS.map((item) => (
            <li key={item.id}>
              <Link to={item.route}>{item.title}</Link>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  )
}
