import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingFallback from '../components/LoadingFallback'
import PortalCardsNav from '../components/PortalCardsNav'

const StartingWorld = lazy(async () => import('../components/StartingWorld'))

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <main>
      <section className="hero-copy">
        <h1>WORLDIFACT — AI Worlds Made Real</h1>
        <p>
          Enter a calm valley, approach the river portal, and open five connected worlds that link gameplay,
          Earth-observation storytelling, AI-assisted design, and real manufacturing workflows.
        </p>
      </section>
      <Suspense fallback={<LoadingFallback message="Loading 3D starting world…" />}>
        <StartingWorld onPortalOpen={(portalId) => navigate(`/portal/${portalId}`)} />
      </Suspense>
      <section className="accessibility-panel">
        <h2>Accessible portal selection</h2>
        <p>Use this keyboard and screen-reader friendly navigation if 3D controls are unavailable.</p>
        <PortalCardsNav />
      </section>
    </main>
  )
}
