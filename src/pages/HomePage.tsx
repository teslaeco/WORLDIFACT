import { lazy, Suspense, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingFallback from "../components/LoadingFallback";
import PortalCardsNav from "../components/PortalCardsNav";
const StartingWorld = lazy(() => import("../components/StartingWorld"));
export default function HomePage() {
  const navigate = useNavigate(),
    open = useCallback((id: string) => navigate(`/portal/${id}`), [navigate]);
  return (
    <main className="home-world">
      <header className="home-header">
        <Link to="/" className="brand">
          WORLDIFACT<span>AI Worlds Made Real</span>
        </Link>
        <Link className="button-link" to="/portal/ai-game-lab">
          Open Game Lab →
        </Link>
      </header>
      <div className="home-intro">
        <span className="eyebrow">TERRAFORMING PLANET</span>
        <h1>A world worth building.</h1>
        <p>
          Follow the river. Find your portal. Make something that belongs here.
        </p>
      </div>
      <Suspense fallback={<LoadingFallback message="Opening the valley…" />}>
        <StartingWorld onPortalOpen={open} />
      </Suspense>
      <section className="accessibility-panel">
        <div className="section-heading">
          <h2>Five portals. One shared world.</h2>
          <span>Open any portal directly</span>
        </div>
        <PortalCardsNav />
      </section>
      <footer className="site-footer">
        Playable world: DEMO · procedural scenery{" "}
        <span>Original models and live AI require separate connections.</span>
      </footer>
    </main>
  );
}
