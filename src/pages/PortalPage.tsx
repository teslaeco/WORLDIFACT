import { useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import PlanetsWorld from '../components/PlanetsWorld'
import PortalAstraGenerator from '../components/PortalAstraGenerator'
import ShopPage from './ShopPage'
import '../components/WorldTabs.css'
import { PORTALS, getPortalById } from '../config/portals'
import { foundationForPath } from '../config/foundations'
import { useAccount } from '../lib/account'

export default function PortalPage() {
  const { user } = useAccount()
  const { portalId } = useParams()
  const { pathname } = useLocation()
  const [loadedFrame, setLoadedFrame] = useState('')
  const legacy = portalId ? getPortalById(portalId) : undefined
  if (legacy) return <Navigate to={legacy.route} replace />
  if (pathname === '/chess/shop') return <Navigate to="/shop" replace />
  const app = foundationForPath(pathname)
  if (!app) return <Navigate to="/" replace />

  if (app.route === '/shop') return <>
    <ShopPage />
    <details open className="portal-generator-drawer portal-page">
      <summary>Create a world blueprint with GPT-6 Astra</summary>
      <PortalAstraGenerator worldId="enchanted-ai-shop" title="Enchanted AI Shop" />
    </details>
  </>

  const planets = app.route === '/planets'
  const worldId = app.id as 'chess-cube-512-ai' | 'terra-fix-iss' | '8-planets-in-8-days'
  return <main className="portal-page foundation-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="World portals">
        {PORTALS.map(portal => <Link key={portal.id} to={portal.route}
          className={portal.id === app.id ? 'active' : ''}>{portal.shortTitle}</Link>)}
        <Link to="/terra" className={app.route === '/terra' ? 'active' : ''}>Earth observation</Link>
      </nav>
    </header>
    <div className="foundation-heading">
      <h1>{app.title}</h1>
      <a href={app.original} target="_blank" rel="noopener noreferrer" className="button-link">Open original ↗</a>
    </div>
    <nav className="foundation-actions" aria-label="Application tools">
      {app.route === '/chess' && <>
        <Link to="/chess" aria-current="page">Play chess</Link>
        <Link to="/chess/shop">Shop boards and pieces</Link>
        <Link to="/make">Check production requirements</Link>
      </>}
      {app.route === '/iss' && <Link to="/terra">Open Earth observation →</Link>}
      {app.route === '/terra' && <Link to="/iss">← Return to the ISS station</Link>}
    </nav>

    {app.route === '/terra' && <p className="foundation-note">
      <strong>EARTH OBSERVATION</strong> · Check each image’s source and acquisition date. The ISS repair game is a separate simulation.
    </p>}

    {planets ? <PlanetsWorld /> : app.route === '/chess' ? <section className="foundation-frame-shell world-primary-frame chess-launch" aria-label="Chess Cube launcher">
      <div>
        <span className="eyebrow">CHESS CUBE 512 AI</span>
        <h2>Play Chess Cube 512 AI</h2>
        <p>Step into eight levels of chess. Open the full-screen game with your shared WORLDIFACT identity, or explore as a guest.</p>
        <div className="foundation-actions">
          <a className="button-link" href={user ? '/apps/chess/index.html' : `${app.frame}?guest=1`}>Launch Chess Cube 512 AI →</a>
          {!user && <Link to="/login">Sign in with your Chess Cube account</Link>}
          <a href={app.original} target="_blank" rel="noopener noreferrer">Open original public build ↗</a>
        </div>
        <small>{user ? 'Your shared identity is used in this WORLDIFACT copy. The original external website manages its own browser session.' : 'Guest play is available without an account.'}</small>
      </div>
    </section> : <div className="foundation-frame-shell world-primary-frame">
      {loadedFrame !== app.frame && <p className="foundation-loading" role="status">Opening {app.title}…</p>}
      <iframe key={app.frame} src={app.frame} title={app.title} className="foundation-frame"
        allow="fullscreen; clipboard-write" allowFullScreen
        onLoad={() => setLoadedFrame(app.frame)} />
    </div>}

    {app.route === '/iss' && <section className="foundation-note" aria-label="ISS preservation mission">
      <strong>LIVE SIMULATION · PRESERVATION CONCEPT</strong>
      <p>Terra — Fix ISS is a repair simulation created to explore the idea that the International Space Station can be maintained, studied and considered for preservation as a heritage object of humanity. It is a game and engineering-learning concept, not NASA endorsement and not proof that preserving the complete station in orbit is technically feasible.</p>
      <p><strong>Sales starting soon.</strong> We are refining the model and manufacturing validation before public sales open.</p>
      <p><strong>PLANNED:</strong> We plan to allocate part of future sales revenue to promotion and awareness supporting the ISS preservation campaign. <a href="https://c.org/QkbzHd5kWN" target="_blank" rel="noopener noreferrer">Open the petition ↗</a></p>
    </section>}

    {app.hosting === 'connected' && <p className="foundation-note">
      The reviewed application above is the primary world. Use “Open original” only for saved projects or features that require the separate original host.
    </p>}

    {app.route !== '/terra' && <details open className="portal-generator-drawer">
      <summary>Create inside this world with GPT-6 Astra</summary>
      <PortalAstraGenerator worldId={worldId} title={app.title} />
    </details>}
  </main>
}
