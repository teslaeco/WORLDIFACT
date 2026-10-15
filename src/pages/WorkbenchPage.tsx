import { lazy, Suspense } from 'react'
import { Link, Navigate } from 'react-router-dom'
import LoadingFallback from '../components/LoadingFallback'
import '../components/WorldTabs.css'

const ManufacturingPanel = lazy(() => import('../components/ManufacturingPanel'))

export default function WorkbenchPage({ kind }: { kind: 'builder' | 'make' }) {
  if (kind === 'builder') return <Navigate to="/account/worlds" replace />
  return <main className="portal-page">
    <header className="portal-header">
      <Link to="/world" className="brand">WORLDIFAKT<span>← Back to the meadow</span></Link>
      <nav aria-label="Workshop navigation">
        <Link to="/lab">AI Game Lab</Link><Link to="/shop">Shop</Link>
        <Link to="/account/worlds">My World · Scene editor</Link><Link to="/make">Manufacturing audit</Link><Link to="/account/models">My models</Link>
      </nav>
    </header>
    <Suspense fallback={<LoadingFallback message="Opening the workbench…" />}>
      {<>
        <h1>Manufacturing audit</h1>
        <p>Check original model files, materials and supplier requirements before ordering.</p>
        <ManufacturingPanel />
      </>}
    </Suspense>
  </main>
}
