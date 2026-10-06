import { Link } from 'react-router-dom'
import StudioGallery from '../components/StudioGallery'
import { useAccount } from '../lib/account'

export default function ModelsPage() {
  const { user, loading } = useAccount()
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
      <Link to="/login?next=%2Faccount%2Fmodels">Sign in →</Link>
    </section> : <>
      <h1>My 3D models</h1>
      <p>Signed in as {user.displayName || user.email}. The current gallery stores completed GLB files in this browser; it is not yet cross-device cloud storage.</p>
      <StudioGallery />
    </>}
  </main>
}
