import type { StudioBudgetTier } from './studioPricing'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from './account'
import { GENERATION_ACCOUNT_TIMEOUT_MS, readGenerationAccount, type GenerationAccountSnapshot } from './generationAccount'
import { quoteGeneration, type GenerationQuote, type QuotedModel } from './generationQuote'

type Request = { owner: string | null; loading: boolean; busy: boolean; revision: number }
type Snapshot = GenerationAccountSnapshot & { request: Request; settled: boolean }
export type GenerationQuoteState = { quote: GenerationQuote; checking: boolean; canRefresh: boolean; refresh: () => void }

export function useGenerationQuote(model: QuotedModel, busy = false, detailed = false, budgetTier?: StudioBudgetTier): GenerationQuoteState {
  const { user, loading } = useAccount()
  const owner = user?.id ?? null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  // A new identity, balance revision or operation invalidates the previous
  // snapshot during render, before effects or a late response can reuse it.
  const request = useMemo(() => ({ owner, loading, busy, revision }), [owner, loading, busy, revision])
  const refresh = useCallback(() => { setRevision(value => value + 1) }, [])
  useEffect(() => {
    // Mobile app switching and back-forward cache restoration need not fire
    // focus. Invalidate the old allowance before accepting another submission.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh() }
    window.addEventListener('worldifact:balance-changed', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('worldifact:balance-changed', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])
  useEffect(() => {
    if (!request.owner || request.loading || request.busy) return
    const controller = new AbortController()
    let closed = false
    let latest: GenerationAccountSnapshot = { account: null, billing: null, authenticationRequired: false }
    const settle = () => {
      if (closed) return
      closed = true; window.clearTimeout(timeout)
      setSnapshot({ ...latest, request, settled: true })
    }
    // Auth may take up to 25 seconds. The read has a finite deadline,
    // and UI settlement does not depend on a failed fetch honoring abort.
    const timeout = window.setTimeout(() => { settle(); controller.abort() }, GENERATION_ACCOUNT_TIMEOUT_MS)
    const updatePartial = (value: GenerationAccountSnapshot) => {
      if (!closed) { latest = value; setSnapshot({ ...latest, request, settled: false }) }
    }
    const timers = { setTimeout: (callback: () => void, delay: number) => window.setTimeout(callback, delay), clearTimeout: (id: number) => window.clearTimeout(id) }
    // Quoting reads the current authenticated allowance only. Membership and
    // historical funding recovery belong to their explicit account/job flows.
    void (async () => {
      latest = await readGenerationAccount(fetch, controller.signal, updatePartial, timers)
    })().catch(() => {}).finally(settle)
    return () => { closed = true; controller.abort(); window.clearTimeout(timeout) }
  }, [request])
  const current = owner && snapshot?.request === request ? snapshot : null
  const checking = loading || busy || (!!owner && current?.settled !== true)
  const currentQuote = quoteGeneration(model, current?.account, current?.billing, !!owner && !current?.authenticationRequired, detailed, budgetTier)
  const quote = loading || busy
    ? { state: 'pending' as const, points: null, after: null, message: loading ? 'Checking your account before generation.' : 'Checking current cost after this request. No new generation can start yet.' }
    : checking && currentQuote.reason !== 'PROVIDER_BUDGET_EXHAUSTED' ? { state: 'pending' as const, points: null, after: null, message: 'Checking your current points and model funding. No generation has started.' }
    : currentQuote
  return { quote, checking, canRefresh: !!owner && !loading && !busy && !checking, refresh }
}
