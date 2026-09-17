import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import './ShopPage.css'

/** The WORLDIFACT document stays open; the original Studio owns its own session. */
export default function ShopPage() {
  const generatorUrl = REFERENCE_LINKS.modelGenerator
  const [revision, setRevision] = useState(0)
  const reloadStudio = () => {
    // Only an explicit, confirmed click may replace this frame. A focus event,
    // sign-in tab, timer or iframe load must never discard unsent work.
    if (window.confirm('Reload the Studio view? Unsent text or selected photos in this view may be lost. This does not cancel a server job or start a new generation.')) {
      setRevision(value => value + 1)
    }
  }

  return <main className="portal-page froge-shop-page">
    <div className="froge-shop-controls">
      <header className="froge-shop-heading">
        <Link to="/" className="froge-shop-return" data-testid="return-to-worldifact">← Back to WORLDIFACT</Link>
        <h1>Froge MPC 2 · 3D Studio</h1>
        <details className="froge-shop-worlds">
          <summary>Other worlds</summary>
          <nav aria-label="World portals">
            {PORTALS.map(portal => <Link key={portal.id} to={portal.route}
              aria-current={portal.id === 'enchanted-ai-shop' ? 'page' : undefined}>{portal.shortTitle}</Link>)}
          </nav>
        </details>
      </header>
      <div className="froge-shop-actions" aria-label="Studio access">
        <a className="froge-shop-open" data-testid="open-full-generator" href={generatorUrl}
          target="_blank" rel="noopener noreferrer">Sign in / open Studio in a new tab ↗</a>
        <button type="button" data-testid="reload-studio" onClick={reloadStudio}>Reload Studio view</button>
      </div>
      <p id="froge-session-help" className="froge-shop-help">WORLDIFACT stays open here. If the Studio asks you to sign in, use the separate tab, then return here. Reload only after saving your work.</p>
    </div>

    <div className="froge-shop-viewport">
      {/* This cross-origin sandbox deliberately omits top-navigation permission.
          It preserves the host/return toolbar even when Studio changes its pages.
          Normal cookies/session rules still apply; this is not an auth bypass. */}
      <iframe key={revision} title="Froge MPC 2 Studio — 3D model generator"
        src={generatorUrl} className="froge-shop-frame" loading="eager"
        referrerPolicy="no-referrer" allow="clipboard-write; microphone"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
        aria-describedby="froge-session-help froge-access-boundary" />
    </div>

    <details className="froge-shop-notes">
      <summary>Connection help and model review</summary>
      <p id="froge-access-boundary">If sign-in still fails in this view, use the Studio in its separate tab; this WORLDIFACT tab and its return link remain available. Opening that tab does not guarantee that your browser will share its session with the embedded view.</p>
      <p>External tool · original application. No replacement generator, automatic generation or credential transfer. The Studio retains its own accounts, saved models and API limits. MAKE/manufacturing approval is separate.</p>
      <nav className="froge-shop-actions" aria-label="Project tools">
        <Link to="/lab">AI Game Lab</Link>
        <Link to="/make">Manufacturing validation</Link>
        <Link to="/control">Platform connections</Link>
      </nav>
    </details>
  </main>
}
