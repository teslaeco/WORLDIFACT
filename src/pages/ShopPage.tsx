import { Link } from 'react-router-dom'
import { PORTALS } from '../config/portals'
import { REFERENCE_LINKS } from '../config/references'
import './ShopPage.css'

/** Navigation and embedding only. The original Studio owns generation and data. */
export default function ShopPage() {
  const generatorUrl = REFERENCE_LINKS.modelGenerator
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
      <span className="eyebrow">AI SHOP · EXTERNAL 3D GENERATOR</span>
      <h1 id="froge-shop-title">Froge MPC 2 Studio</h1>
      <p>The original studio for creating 3D models from descriptions and reference images. Use the existing generator, settings and saved work — not a replacement demo.</p>
      <div className="froge-shop-actions">
        <a className="froge-shop-open" data-testid="open-full-generator" href={generatorUrl}
          target="_blank" rel="noopener noreferrer">Open full 3D generator ↗</a>
        <a className="froge-shop-same-tab" href={generatorUrl} target="_self" rel="noreferrer">Open in this tab →</a>
      </div>
      <p id="froge-embed-help" className="froge-shop-help">If the embedded studio is blank or asks you to sign in, open the full generator above. Sign-in and model generation stay in the original Studio.</p>
    </section>

    <section className="froge-shop-embed-section" aria-labelledby="froge-embed-title">
      <h2 id="froge-embed-title">Create your 3D model</h2>
      <div className="froge-shop-embed-shell">
        {/* Cross-origin load/error events do not prove that this app is usable.
            Keep the direct links above the frame at all times. Never replace
            or reload an active Studio session on a timer or a load event. */}
        <iframe title="Froge MPC 2 Studio — original 3D model generator"
          src={generatorUrl} className="froge-shop-frame" loading="eager"
          referrerPolicy="no-referrer" allow="clipboard-write; microphone; fullscreen"
          aria-describedby="froge-embed-help" />
      </div>
    </section>

    <aside className="froge-shop-notes" aria-label="Generator integration information">
      <p><strong>External tool · owner-reported working.</strong> This page connects to the existing hosted app. WORLDIFACT does not copy its accounts, archive, API keys or model files, and does not start a generation when you open this page.</p>
      <p>Generate and download inside the Studio. Its own account permissions, API usage and limits apply. An exported model still needs visual review; MAKE/manufacturing approval is separate.</p>
      <div className="froge-shop-actions">
        <Link to="/lab">AI Game Lab</Link>
        <Link to="/make">Manufacturing validation</Link>
        <Link to="/control">Platform connections</Link>
      </div>
    </aside>
  </main>
}
