import { useCallback, useEffect, useState } from 'react'

type Availability = 'checking' | 'ready' | 'unconfigured' | 'error'
const CONFIG_TIMEOUT_MS = 10_000

/** Read-only capability checks never initiate a Google or account authorization. */
export function useGoogleSignInAvailability() {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<{ revision: number; state: Availability } | null>(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let closed = false
    const timeout = window.setTimeout(() => {
      closed = true
      setSnapshot({ revision, state: 'error' })
      controller.abort()
    }, CONFIG_TIMEOUT_MS)
    void fetch('/api/account/config', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Availability check failed')
        const value: unknown = await response.json()
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'googleReady') || typeof (value as { googleReady: unknown }).googleReady !== 'boolean')
          throw new Error('Invalid availability response')
        if (!closed) setSnapshot({ revision, state: (value as { googleReady: boolean }).googleReady ? 'ready' : 'unconfigured' })
      })
      .catch(() => { if (!closed) setSnapshot({ revision, state: 'error' }) })
      .finally(() => window.clearTimeout(timeout))
    return () => { closed = true; controller.abort(); window.clearTimeout(timeout) }
  }, [revision])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  // A retry invalidates the previous decision during render, before effects run.
  const state: Availability = snapshot?.revision === revision ? snapshot.state : 'checking'
  return { state, refresh }
}
