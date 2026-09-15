import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import LoadingFallback from './components/LoadingFallback'

const HomePage = lazy(async () => import('./pages/HomePage'))
const PortalPage = lazy(async () => import('./pages/PortalPage'))
const InfoPage = lazy(async () => import('./pages/InfoPage'))

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/portal/:portalId" element={<PortalPage />} />
        <Route path="/privacy" element={<InfoPage kind="privacy" />} />
        <Route path="/terms" element={<InfoPage kind="terms" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="legal-nav" aria-label="Project information">
        <Link to="/privacy">Privacy and data</Link>
        <Link to="/terms">Preview terms</Link>
        <a href="https://github.com/teslaeco/WORLDIFACT" target="_blank" rel="noreferrer">Source and licences ↗</a>
      </nav>
    </Suspense>
  )
}
