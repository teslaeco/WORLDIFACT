import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './mobile-hotfix.css'
import { AccountProvider } from './lib/account'
import GenerationFundingPage from './pages/GenerationFundingPage'
import FailedHoldWaiverPage from './pages/FailedHoldWaiverPage'

// Financial inspection must not mount normal account/billing recovery effects.
const readOnlyFunding = window.location.pathname === '/account/generation-funding'
const failedHoldWaiver = window.location.pathname === '/account/failed-hold-waiver'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {readOnlyFunding ? <GenerationFundingPage /> : failedHoldWaiver ? <FailedHoldWaiverPage /> : <AccountProvider><App /></AccountProvider>}
    </BrowserRouter>
  </StrictMode>,
)
