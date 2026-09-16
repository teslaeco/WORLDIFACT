import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import LoadingFallback from '../components/LoadingFallback'
import '../components/WorldTabs.css'

const P0GameLab = lazy(() => import('../components/P0GameLab'))
const ManufacturingPanel = lazy(() => import('../components/ManufacturingPanel'))

export default function WorkbenchPage({ kind }: { kind: 'builder' | 'make' }) {
  return <main className="portal-page">
    <header className="portal-header">
      <Link to="/" className="brand">WORLDIFACT<span>← Back to the meadow</span></Link>
      <nav aria-label="Workshop navigation">
        <Link to="/lab">AI Game Lab</Link><Link to="/shop">Shop</Link>
        <Link to="/builder">Scene editor</Link><Link to="/make">Manufacturing audit</Link>
      </nav>
    </header>
    <Suspense fallback={<LoadingFallback message="Opening the workbench…" />}>
      {kind === 'builder' ? <P0GameLab /> : <>
        <h1>Manufacturing audit</h1>
        <p>Check original model files, materials and supplier requirements before ordering.</p>
        <ManufacturingPanel />
      </>}
    </Suspense>
  </main>
}
