import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

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
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The account service is temporarily unavailable.')
  return data
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      const result = await accountRequest('/api/account/session')
      const next = result.user && typeof result.user.id === 'string' ? result.user as AccountUser : null
      setUser(next); setError(''); return next
    } catch (e) { setUser(null); setError(e instanceof Error ? e.message : 'Could not check your session.'); return null }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 240_000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [refresh])
  const signOut = useCallback(async () => { await accountRequest('/api/account/logout', {}); setUser(null) }, [])
  return <AccountContext value={{ user, loading, error, refresh, signOut }}>{children}</AccountContext>
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('AccountProvider is required.')
  return context
}
