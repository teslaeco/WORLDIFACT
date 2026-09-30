import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import LoadingFallback from './components/LoadingFallback'
import AccountStatusBar from './components/AccountStatusBar'
import { useAccount } from './lib/account'
import { clearAvatarAssets, loadAvatarBytes } from './lib/avatarAsset'

const PrivateGameLab = lazy(async () => import('./pages/PrivateGameLab'))
const HomePage = lazy(async () => import('./pages/HomePage'))
const PortalPage = lazy(async () => import('./pages/PortalPage'))
const InfoPage = lazy(async () => import('./pages/InfoPage'))
const WorkbenchPage = lazy(async () => import('./pages/WorkbenchPage'))
const ControlPage = lazy(async () => import('./pages/ControlPage'))
const AccountPage = lazy(async () => import('./pages/AccountPage'))
const CreditsPage = lazy(async () => import('./pages/CreditsPage'))
const InvoicePaymentPage = lazy(async () => import('./pages/InvoicePaymentPage'))
const ModelsPage = lazy(async () => import('./pages/ModelsPage'))
const ResetPasswordPage = lazy(async () => import('./pages/ResetPasswordPage'))

function AvatarPreload() {
  const { pathname } = useLocation()
  const { user } = useAccount()
  // Use the login transition to prepare the exact original, not a low-detail copy.
  useEffect(() => {
    clearAvatarAssets()
    if (user && pathname === '/world') void loadAvatarBytes('queen').catch(() => { /* The world offers explicit retry. */ })
    return clearAvatarAssets
  }, [user?.id, pathname])
  return null
}

export default function App() {
  return (
    <>
    <AvatarPreload />
    <AccountStatusBar />
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<AccountPage />} />
        <Route path="/world" element={<HomePage />} />
        <Route path="/login" element={<AccountPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/credits" element={<CreditsPage />} />
        <Route path="/account/payment" element={<InvoicePaymentPage />} />
        <Route path="/account/models" element={<ModelsPage />} />
        <Route path="/account/reset" element={<ResetPasswordPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/portal/:portalId" element={<PortalPage />} />
        {['/chess', '/iss', '/planets', '/terra', '/shop'].map(path => (
          <Route key={path} path={path} element={<PortalPage />} />
        ))}
        <Route path="/chess/shop" element={<Navigate to="/shop" replace />} />
        <Route path="/lab" element={<PrivateGameLab />} />
        <Route path="/builder" element={<PrivateGameLab />} />
        <Route path="/make" element={<WorkbenchPage kind="make" />} />
        <Route path="/privacy" element={<InfoPage kind="privacy" />} />
        <Route path="/terms" element={<InfoPage kind="terms" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="legal-nav" aria-label="Project information">
        <Link to="/login">Account</Link>
        <Link to="/account/models">My models</Link>
        <a href="/blog/astra-vs-meshy-rim/">Astra vs Meshy: rim case study</a>
        <a href="/compare/mcc/">MCC cabinet: Astra and Meshy evidence</a>
        <Link to="/control">Platform connections</Link>
        <Link to="/privacy">Privacy and data</Link>
        <Link to="/terms">Preview terms</Link>
        <a href="https://github.com/teslaeco/WORLDIFACT" target="_blank" rel="noreferrer">Source and licences ↗</a>
      </nav>
    </Suspense>
    </>
  )
}
