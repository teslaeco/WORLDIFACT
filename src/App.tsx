import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import LoadingFallback from './components/LoadingFallback'

const HomePage = lazy(async () => import('./pages/HomePage'))
const PortalPage = lazy(async () => import('./pages/PortalPage'))
const ShopPage = lazy(async () => import('./pages/ShopPage'))
const InfoPage = lazy(async () => import('./pages/InfoPage'))
const WorkbenchPage = lazy(async () => import('./pages/WorkbenchPage'))
const ControlPage = lazy(async () => import('./pages/ControlPage'))

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/portal/:portalId" element={<PortalPage />} />
        {['/chess', '/chess/shop', '/iss', '/planets', '/terra'].map(path => (
          <Route key={path} path={path} element={<PortalPage />} />
        ))}
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/lab" element={<WorkbenchPage kind="builder" />} />
        <Route path="/builder" element={<WorkbenchPage kind="builder" />} />
        <Route path="/make" element={<WorkbenchPage kind="make" />} />
        <Route path="/privacy" element={<InfoPage kind="privacy" />} />
        <Route path="/terms" element={<InfoPage kind="terms" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="legal-nav" aria-label="Project information">
        <Link to="/control">Platform connections</Link>
        <Link to="/privacy">Privacy and data</Link>
        <Link to="/terms">Preview terms</Link>
        <a href="https://github.com/teslaeco/WORLDIFACT" target="_blank" rel="noreferrer">Source and licences ↗</a>
      </nav>
    </Suspense>
  )
}
