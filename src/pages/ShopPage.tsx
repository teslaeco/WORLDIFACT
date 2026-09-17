import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import './ShopPage.css'

/** Open the actual hosted Studio as a document, never as an authenticated iframe. */
export default function ShopPage() {
  const generatorUrl = REFERENCE_LINKS.modelGenerator
  const opening = useRef(false)

  useEffect(() => {
    // Only navigate our own top-level document. An embedded WORLDIFACT must
    // leave top-level navigation to the user's explicit anchor click below.
    if (opening.current || window.self !== window.top) return
    opening.current = true
    try {
      // Replace /shop so Back does not immediately redirect into Studio again.
      window.location.replace(generatorUrl)
    } catch {
      // Navigation can be denied by an embedding host/browser. Keep both links
      // usable; never retry on a timer, change cookies, or request API secrets.
    }
  }, [generatorUrl])

  return <main className="portal-page froge-shop-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="World portals">
        {PORTALS.map(portal => <Link key={portal.id} to={portal.route}
          aria-current={portal.id === 'enchanted-ai-shop' ? 'page' : undefined}
          className={portal.id === 'enchanted-ai-shop' ? 'active' : ''}>{portal.shortTitle}</Link>)}
      </nav>
    </header>

    <section className="froge-shop-launch" aria-labelledby="froge-shop-title">
      <span className="eyebrow">AI SHOP · ORIGINAL 3D STUDIO</span>
      <h1 id="froge-shop-title">Open your Froge MPC 2 Studio</h1>
      <p role="status">Opening the original generator in the full browser window. If it does not open automatically, use the button below.</p>
      <div className="froge-shop-actions">
        <a className="froge-shop-open" data-testid="open-full-generator" href={generatorUrl}
          target="_top" rel="noreferrer">Open 3D generator →</a>
        <a href={generatorUrl} target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a>
      </div>
      <p className="froge-shop-help">The embedded Studio has been removed from this page. Sign in to your existing Froge account in the original Studio to use its saved connection, reference images and models.</p>
    </section>

    <aside className="froge-shop-notes" aria-label="Generator integration information">
      <p><strong>External tool · original application.</strong> This opens the exact hosted Studio selected by the owner. It does not install an older source snapshot, reconnect Oracle, copy credentials or start a generation.</p>
      <p>The Studio retains its own account permissions, saved work and API usage limits. MAKE/manufacturing approval is separate.</p>
      <div className="froge-shop-actions">
        <Link to="/lab">AI Game Lab</Link>
        <Link to="/make">Manufacturing validation</Link>
        <Link to="/control">Platform connections</Link>
      </div>
    </aside>
  </main>
}
