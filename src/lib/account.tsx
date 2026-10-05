import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccountServiceError } from './paymentError'
import { reconcileShopSessionAccount, shopSessionStorage } from './shopSessionDraft'

export type AccountUser = { id: string; email: string; displayName: string }
type AccountState = { user: AccountUser | null; loading: boolean; error: string; refresh: () => Promise<AccountUser | null>; signOut: () => Promise<void> }
const AccountContext = createContext<AccountState | null>(null)
// The shared client covers up to three bounded provider steps (password reset)
// plus request overhead; ordinary session recovery needs at most two.
const ACCOUNT_REQUEST_TIMEOUT_MS = 80_000

export async function accountRequest(path: string, input?: unknown) {
  const response = await fetch(path, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: input === undefined ? undefined : { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(ACCOUNT_REQUEST_TIMEOUT_MS) })
  const data = await response.json()
  if (!response.ok) throw new AccountServiceError(typeof data.error === 'string' ? data.error : 'The account service is temporarily unavailable.', response.status, data.diagnostic)
  return data
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0), signingOut = useRef(false)
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    try {
      const result = await accountRequest('/api/account/session')
      if (version !== requestVersion.current || signingOut.current) return null
      const next = result.user && typeof result.user.id === 'string' ? result.user as AccountUser : null
      reconcileShopSessionAccount(shopSessionStorage(), next?.id ?? null)
      setUser(next); setError(''); return next
    } catch (e) {
      if (version === requestVersion.current && !signingOut.current) { setUser(null); setError(e instanceof Error ? e.message : 'Could not check your session.') }
      return null
    } finally { if (version === requestVersion.current && !signingOut.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const version = requestVersion
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 240_000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { version.current++; window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [refresh])
  const signOut = useCallback(async () => {
    signingOut.current = true; requestVersion.current++
    try {
      await accountRequest('/api/account/logout', {})
      reconcileShopSessionAccount(shopSessionStorage(), null)
      setUser(null); setError(''); setLoading(false)
    } finally { requestVersion.current++; signingOut.current = false }
  }, [])
  return <AccountContext value={{ user, loading, error, refresh, signOut }}>{children}</AccountContext>
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('AccountProvider is required.')
  return context
}
