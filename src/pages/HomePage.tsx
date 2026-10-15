import { lazy, Suspense, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingFallback from "../components/LoadingFallback";
import WorldifactLogo from "../components/WorldifactLogo";
import BrandShowcase from "../components/BrandShowcase";
import { getPortalById } from "../config/portals";
import { useAccount } from "../lib/account";
const StartingWorld = lazy(() => import("../components/StartingWorld"));
export default function HomePage() {
  const { user } = useAccount();
  const navigate = useNavigate(),
    open = useCallback((id: string) => navigate(getPortalById(id)?.route ?? "/"), [navigate]);
  return (
    <main className="home-world">
      <header className="home-header">
        <Link to="/world" className="brand">
          <WorldifactLogo /><span className="brand-name">WORLDIFAKT<span>AI Worlds Made Real</span></span>
        </Link>
        <Link className="button-link" to={user ? "/account/credits" : "/login"}>{user ? "My account" : "Sign in"}</Link>
        <Link className="button-link" to="/lab">Open Game Lab →</Link>
      </header>
      <div className="home-intro">
        <span className="eyebrow">TERRAFORMING PLANET</span>
        <h1>A world worth building.</h1>
        <p>Explore the green meadow. Follow the river to a portal. Move with the joystick; drag to look around.</p>
      </div>
      <Suspense fallback={<LoadingFallback message="Opening Riverlight meadow…" />}>
        <StartingWorld onPortalOpen={open} />
      </Suspense>
      <BrandShowcase />
      <footer className="site-footer">
        AI environment art · DEMO gameplay{" "}
        <span>Games, Earth observation and creation in one world.</span>
      </footer>
    </main>
  );
}
