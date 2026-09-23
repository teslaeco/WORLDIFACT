import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import LoadingFallback from './components/LoadingFallback'
import AccountStatusBar from './components/AccountStatusBar'

const HomePage = lazy(async () => import('./pages/HomePage'))
const PortalPage = lazy(async () => import('./pages/PortalPage'))
const InfoPage = lazy(async () => import('./pages/InfoPage'))
const WorkbenchPage = lazy(async () => import('./pages/WorkbenchPage'))
const ControlPage = lazy(async () => import('./pages/ControlPage'))
const AccountPage = lazy(async () => import('./pages/AccountPage'))
const CreditsPage = lazy(async () => import('./pages/CreditsPage'))
const ResetPasswordPage = lazy(async () => import('./pages/ResetPasswordPage'))

export default function App() {
  return (
    <>
    <AccountStatusBar />
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<AccountPage />} />
        <Route path="/world" element={<HomePage />} />
        <Route path="/login" element={<AccountPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/credits" element={<CreditsPage />} />
        <Route path="/account/reset" element={<ResetPasswordPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/portal/:portalId" element={<PortalPage />} />
        {['/chess', '/iss', '/planets', '/terra', '/shop'].map(path => (
          <Route key={path} path={path} element={<PortalPage />} />
        ))}
        <Route path="/chess/shop" element={<Navigate to="/shop" replace />} />
        <Route path="/lab" element={<WorkbenchPage kind="builder" />} />
        <Route path="/builder" element={<WorkbenchPage kind="builder" />} />
        <Route path="/make" element={<WorkbenchPage kind="make" />} />
        <Route path="/privacy" element={<InfoPage kind="privacy" />} />
        <Route path="/terms" element={<InfoPage kind="terms" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="legal-nav" aria-label="Project information">
        <Link to="/login">Account</Link>
        <a href="/blog/astra-vs-meshy-rim/">Astra vs Meshy: rim case study</a>
        <Link to="/control">Platform connections</Link>
        <Link to="/privacy">Privacy and data</Link>
        <Link to="/terms">Preview terms</Link>
        <a href="https://github.com/teslaeco/WORLDIFACT" target="_blank" rel="noreferrer">Source and licences ↗</a>
      </nav>
    </Suspense>
    </>
  )
}
