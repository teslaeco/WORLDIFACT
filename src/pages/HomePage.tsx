import { lazy, Suspense, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingFallback from "../components/LoadingFallback";
import PortalCardsNav from "../components/PortalCardsNav";
import WorldifactLogo from "../components/WorldifactLogo";
import { getPortalById } from "../config/portals";
const StartingWorld = lazy(() => import("../components/StartingWorld"));
export default function HomePage() {
  const navigate = useNavigate(),
    open = useCallback((id: string) => navigate(getPortalById(id)?.route ?? "/"), [navigate]);
  return (
    <main className="home-world">
      <header className="home-header">
        <Link to="/" className="brand">
          <WorldifactLogo /><span className="brand-name">WORLDIFACT<span>AI Worlds Made Real</span></span>
        </Link>
        <Link className="button-link" to="/control">Manage worlds</Link>
        <Link className="button-link" to="/lab">
          Open Game Lab →
        </Link>
      </header>
      <div className="home-intro">
        <span className="eyebrow">TERRAFORMING PLANET</span>
        <h1>A world worth building.</h1>
        <p>
          Explore the green meadow. Follow the river to a portal. Move with the joystick; drag to look around.
        </p>
      </div>
      <Suspense fallback={<LoadingFallback message="Opening Riverlight meadow…" />}>
        <StartingWorld onPortalOpen={open} />
      </Suspense>
      <section className="accessibility-panel">
        <div className="section-heading">
          <h2>Five portals. One shared world.</h2>
          <span>Open any portal directly</span>
        </div>
        <PortalCardsNav />
      </section>
      <section className="product-hunt-panel" aria-labelledby="product-hunt-title">
        <div className="product-hunt-heading">
          <div>
            <span className="eyebrow">PRODUCT HUNT</span>
            <h2 id="product-hunt-title">WORLDIFACT community feedback</h2>
          </div>
          <a
            className="button-link"
            href="https://www.producthunt.com/posts/worldifact"
            target="_blank"
            rel="noreferrer"
          >
            Open Product Hunt ↗
          </a>
        </div>
        <p>
          Read the launch conversation and share feedback on what WORLDIFACT should improve next.
        </p>
        <div className="product-hunt-embed">
          <iframe
            title="WORLDIFACT comments on Product Hunt"
            src="https://cards.producthunt.com/cards/comments/5874571?v=1"
            width="500"
            height="405"
            frameBorder="0"
            scrolling="no"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </section>
      <footer className="site-footer">
        AI environment art · DEMO gameplay{" "}
        <span>Games, Earth observation and creation in one world.</span>
      </footer>
    </main>
  );
}
