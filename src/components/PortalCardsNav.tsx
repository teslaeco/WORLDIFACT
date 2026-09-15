import { Link } from 'react-router-dom'
import { PORTALS } from '../config/portals'

export default function PortalCardsNav() {
  return (
    <nav className="portal-nav" aria-label="Portal destinations">
      {PORTALS.map((portal) => (
        <Link key={portal.id} to={portal.route} className="portal-nav-card">
          <span className="portal-nav-title">{portal.title}</span>
          <span>{portal.tagline}</span>
        </Link>
      ))}
    </nav>
  )
}
