import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import P0GameLab from '../components/P0GameLab'
import PlanetsWorld from '../components/PlanetsWorld'
import '../components/WorldTabs.css'
import { PORTALS, getPortalById } from '../config/portals'
import { foundationForPath } from '../config/foundations'

export default function PortalPage() {
  const { portalId } = useParams()
  const { pathname } = useLocation()
  const [loadedFrame, setLoadedFrame] = useState('')
  useEffect(() => {
    if (pathname === '/chess') window.location.replace('https://teslaeco.github.io/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/');
  }, [pathname]);
  const legacy = portalId ? getPortalById(portalId) : undefined
  if (legacy) return <Navigate to={legacy.route} replace />
  const app = foundationForPath(pathname)
  if (!app) return <Navigate to="/" replace />
  const chessShop = pathname === '/chess/shop'
  const planets = app.route === '/planets'
  const nativeShop = pathname === '/shop'
  return <main className="portal-page foundation-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="World portals">
        {PORTALS.map(portal => <Link key={portal.id} to={portal.route}
          className={portal.id === app.id ? 'active' : ''}>{portal.shortTitle}</Link>)}
        <Link to="/terra" className={app.route === '/terra' ? 'active' : ''}>Earth observation</Link>
      </nav>
    </header>
    {planets ? <PlanetsWorld /> : nativeShop ? <P0GameLab surface="shop" /> : <>
      <div className="foundation-heading">
        <h1>{chessShop ? 'Chess · Boards and pieces shop' : app.title}</h1>
        <a href={app.original} target="_blank" rel="noreferrer" className="button-link">Open original ↗</a>
      </div>
      <nav className="foundation-actions" aria-label="Application tools">
        {(app.route === '/chess' || chessShop) && <>
          <Link to="/chess" aria-current={!chessShop ? 'page' : undefined}>Play chess</Link>
          <Link to="/chess/shop" aria-current={chessShop ? 'page' : undefined}>Shop boards and pieces</Link>
          <Link to="/make">Check production requirements</Link>
        </>}
        {app.route === '/iss' && <Link to="/terra">Open Earth observation →</Link>}
        {app.route === '/terra' && <Link to="/iss">← Return to the ISS station</Link>}
        {app.route === '/lab' && <><Link to="/builder">WORLDIFACT scene editor</Link><Link to="/shop">Shop →</Link></>}
        {app.route === '/shop' && !chessShop && <><Link to="/make">Manufacturing audit</Link><Link to="/lab">Studio behind the shop →</Link></>}
      </nav>
      {app.hosting === 'connected' && <p className="foundation-note">
        Your original application opens below. If it asks you to sign in or does not appear,
        use “Open original” to access your saved projects in a separate tab.
      </p>}
      {app.route === '/terra' && <p className="foundation-note">
        <strong>EARTH OBSERVATION</strong> · Check each image’s source and acquisition date. The ISS repair game is a separate simulation.
      </p>}
      {chessShop && <p className="foundation-note">
        Use the existing design studio for a board or piece. Download available models there and check their production requirements before ordering. Direct chess-to-catalog transfer is not connected yet.
      </p>}
      {app.route === '/chess' ? <p>Opening the original Chess Cube website. <a href={app.original}>Open Chess Cube</a></p> : <div className="foundation-frame-shell">
        {loadedFrame !== app.frame && <p className="foundation-loading" role="status">Opening {app.title}…</p>}
        <iframe key={app.frame} src={app.frame} title={app.title} className="foundation-frame"
          allow="fullscreen; clipboard-write" allowFullScreen
          onLoad={() => setLoadedFrame(app.frame)} />
      </div>}
    </>}
  </main>
}
