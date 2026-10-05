import { Link, useSearchParams } from 'react-router-dom'
import StudioGallery from '../components/StudioGallery'
import { useAccount } from '../lib/account'

export default function ModelsPage() {
  const { user, loading } = useAccount()
  const [searchParams] = useSearchParams()
  const requestedModelId = searchParams.get('model') || ''
  return <main className="portal-page">
    <header className="portal-header">
      <Link to="/world" className="brand">WORLDIFAKT<span>← Back to the meadow</span></Link>
      <nav aria-label="Account navigation">
        <Link to="/account">Account</Link>
        <Link to="/account/credits">Credits & membership</Link>
        <Link to="/shop">AI Shop</Link>
        <Link to="/lab">Game Lab</Link>
      </nav>
    </header>
    {loading ? <p role="status">Checking your account…</p> : !user ? <section className="studio-gallery">
      <h1>My 3D models</h1>
      <p>Sign in to open the model gallery from your WORLDIFACT account.</p>
      <Link to={`/login?next=${encodeURIComponent(`/account/models${requestedModelId ? `?model=${encodeURIComponent(requestedModelId)}` : ''}`)}`}>Sign in →</Link>
    </section> : <>
      <h1>My 3D models</h1>
      <p>Signed in as {user.displayName || user.email}. Completed Studio models on your account are available across devices. Older device copies remain available in the browser where they were saved.</p>
      <StudioGallery requestedModelId={requestedModelId} />
    </>}
  </main>
}
