import { lazy, Suspense } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PORTALS, getPortalById } from "../config/portals";
import { getOptionalExternalDemoUrl } from "../lib/env";
import LoadingFallback from "../components/LoadingFallback";
const WorldStudio = lazy(() => import("../components/WorldStudio"));
const ManufacturingPanel = lazy(
  () => import("../components/ManufacturingPanel"),
);
const planets = [
  "Mercury Relay Cliffs",
  "Venus Cloud Foundry",
  "Earth Orbit Relay",
  "Mars Iceworks Basin",
  "Jupiter Magnet Storm Deck",
  "Saturn Ringline Pass",
  "Uranus Cryo Drift",
  "Neptune Aurora Forge",
];
export default function PortalPage() {
  const { portalId } = useParams(),
    portal = portalId ? getPortalById(portalId) : undefined;
  if (!portal) return <Navigate to="/" replace />;
  const external = getOptionalExternalDemoUrl(portal.externalDemoEnv);
  return (
    <main className="portal-page">
      <header className="portal-header">
        <Link to="/" className="brand">
          WORLDIFACT <span>← Mirror Lake</span>
        </Link>
        <nav>
          {PORTALS.map((p) => (
            <Link
              key={p.id}
              className={p.id === portal.id ? "active" : ""}
              to={p.route}
            >
              {p.shortTitle}
            </Link>
          ))}
        </nav>
      </header>
      {portal.id === "ai-game-lab" ? (
        <Suspense fallback={<LoadingFallback message="Opening Game Lab…" />}>
          <WorldStudio />
        </Suspense>
      ) : portal.id === "enchanted-ai-shop" ? (
        <>
          <div className="studio-heading">
            <div>
              <span className="eyebrow">ENCHANTED AI SHOP</span>
              <h1>From world to workbench.</h1>
            </div>
            <span className="pill">PRODUCTION VALIDATION REQUIRED</span>
          </div>
          <p>
            Compare manufacturing scenarios, track required repairs, and prepare
            a candidate for supplier review.
          </p>
          <Suspense fallback={<LoadingFallback message="Opening MAKE workbench…" />}>
            <ManufacturingPanel />
          </Suspense>
          <Link className="button-link" to="/portal/ai-game-lab">
            Open the 3D Game Lab →
          </Link>
        </>
      ) : (
        <>
          <div className="studio-heading">
            <div>
              <span className="eyebrow">PORTAL PREVIEW · PLANNED</span>
              <h1>{portal.title}</h1>
              <p>{portal.description}</p>
            </div>
          </div>
          {portal.id === "chess-cube-512-ai" ? (
            <section>
              <h2>512 squares. Eight levels.</h2>
              <p>
                This portal is a preview. The 8×8×8 chess engine, AI matches and
                custom pieces are separate integration work.
              </p>
              {external ? (
                <a href={external}>Open external chess demo</a>
              ) : (
                <p className="muted">
                  A playable chess integration is not connected yet.
                </p>
              )}
            </section>
          ) : null}
          {portal.id === "terra-fix-iss" ? (
            <div className="workflow-pair">
              <article>
                <span className="eyebrow">SIMULATION · PLANNED</span>
                <h2>Fix ISS</h2>
                <p>
                  Inspect a damaged station, isolate faults and complete a
                  restoration mission. This WORLDIFACT portal does not yet
                  contain the repair game.
                </p>
              </article>
              <article>
                <span className="eyebrow">REAL DATA · EXTERNAL PROJECT</span>
                <h2>Terra observation</h2>
                <p>
                  Visit the separate Earth-observation project. Its data sources
                  and dates must be checked in that application; the generated
                  WORLDIFACT valley is game scenery.
                </p>
                <a
                  href="https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Terra observation ↗
                </a>
              </article>
            </div>
          ) : null}
          {portal.id === "8-planets-in-8-days" ? (
            <section>
              <h2>Restoration routes</h2>
              <p>
                These are planned levels; platform gameplay is not integrated
                yet.
              </p>
              <ol className="planet-list">
                {planets.map((p, i) => (
                  <li key={p}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {p}
                    <small>PLANNED</small>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <Link className="button-link" to="/portal/ai-game-lab">
            Create a playable prototype in the Game Lab →
          </Link>
        </>
      )}
      <footer className="site-footer">
        Terraforming Planet · WORLDIFACT{" "}
        <span>GAME and MAKE have separate validation.</span>
      </footer>
    </main>
  );
}
