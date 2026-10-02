import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from './account'
import { readGenerationAccount, type GenerationAccountSnapshot } from './generationAccount'
import { quoteGeneration, type GenerationQuote, type QuotedModel } from './generationQuote'

type Request = { owner: string | null; loading: boolean; busy: boolean; revision: number }
type Snapshot = GenerationAccountSnapshot & { request: Request }
export type GenerationQuoteState = { quote: GenerationQuote; checking: boolean; canRefresh: boolean; refresh: () => void }

export function useGenerationQuote(model: QuotedModel, busy = false, detailed = false): GenerationQuoteState {
  const { user, loading } = useAccount()
  const owner = user?.id ?? null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  // A new identity, balance revision or operation invalidates the previous
  // snapshot during render, before effects or a late response can reuse it.
  const request = useMemo(() => ({ owner, loading, busy, revision }), [owner, loading, busy, revision])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    window.addEventListener('worldifact:balance-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('worldifact:balance-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  useEffect(() => {
    if (!request.owner || request.loading || request.busy) return
    const controller = new AbortController()
    let closed = false
    // Timeout failure must settle the UI; an aborted request is not a quote.
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    readGenerationAccount(fetch, controller.signal)
      .then(value => { if (!closed) setSnapshot({ ...value, request }) })
      .catch(() => { if (!closed) setSnapshot({ request, account: null, billing: null, authenticationRequired: false }) })
      .finally(() => window.clearTimeout(timeout))
    return () => { closed = true; controller.abort(); window.clearTimeout(timeout) }
  }, [request])
  const current = owner && snapshot?.request === request ? snapshot : null
  const checking = loading || busy || (!!owner && !current)
  const quote = loading || busy
    ? { state: 'pending' as const, points: null, after: null, message: loading ? 'Checking your account before generation.' : 'Checking current cost after this request. No new generation can start yet.' }
    : quoteGeneration(model, current?.account, current?.billing, !!owner && !current?.authenticationRequired, detailed)
  return { quote, checking, canRefresh: !!owner && !loading && !busy && !checking, refresh }
}
