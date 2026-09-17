import { useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import PlanetsWorld from '../components/PlanetsWorld'
import PortalAstraGenerator from '../components/PortalAstraGenerator'
import ShopPage from './ShopPage'
import '../components/WorldTabs.css'
import { PORTALS, getPortalById } from '../config/portals'
import { foundationForPath } from '../config/foundations'

export default function PortalPage() {
  const { portalId } = useParams()
  const { pathname } = useLocation()
  const [loadedFrame, setLoadedFrame] = useState('')
  const legacy = portalId ? getPortalById(portalId) : undefined
  if (legacy) return <Navigate to={legacy.route} replace />
  if (pathname === '/chess/shop') return <Navigate to="/shop" replace />
  const app = foundationForPath(pathname)
  if (!app) return <Navigate to="/" replace />

  if (app.route === '/shop') return <>
    <div className="portal-page">
      <PortalAstraGenerator worldId="enchanted-ai-shop" title="Enchanted AI Shop" />
    </div>
    <ShopPage />
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

    {app.route !== '/terra' && <PortalAstraGenerator worldId={worldId} title={app.title} />}

    {app.route === '/iss' && <section className="foundation-note" aria-label="ISS preservation mission">
      <strong>LIVE SIMULATION · PRESERVATION CONCEPT</strong>
      <p>Terra — Fix ISS is a repair simulation created to explore the idea that the International Space Station can be maintained, studied and considered for preservation as a heritage object of humanity. It is a game and engineering-learning concept, not NASA endorsement and not proof that preserving the complete station in orbit is technically feasible.</p>
      <p><strong>Sales starting soon.</strong> We are refining the model and manufacturing validation before public sales open.</p>
      <p><strong>PLANNED:</strong> We plan to allocate part of future sales revenue to promotion and awareness supporting the ISS preservation campaign. <a href="https://c.org/QkbzHd5kWN" target="_blank" rel="noopener noreferrer">Open the petition ↗</a></p>
    </section>}

    {app.hosting === 'connected' && <p className="foundation-note">
      Your original application opens below. If it asks you to sign in or does not appear,
      use “Open original” to access your saved projects in a separate tab.
    </p>}
    {app.route === '/terra' && <p className="foundation-note">
      <strong>EARTH OBSERVATION</strong> · Check each image’s source and acquisition date. The ISS repair game is a separate simulation.
    </p>}
    {planets ? <PlanetsWorld /> : <div className="foundation-frame-shell">
      {loadedFrame !== app.frame && <p className="foundation-loading" role="status">Opening {app.title}…</p>}
      <iframe key={app.frame} src={app.frame} title={app.title} className="foundation-frame"
        allow="fullscreen; clipboard-write" allowFullScreen
        onLoad={() => setLoadedFrame(app.frame)} />
    </div>}
  </main>
}
