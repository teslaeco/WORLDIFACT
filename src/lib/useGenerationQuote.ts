import type { StudioBudgetTier } from './studioPricing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from './account'
import { GENERATION_ACCOUNT_TIMEOUT_MS, readGenerationAccount, reconcileGenerationFunding, type GenerationAccountSnapshot } from './generationAccount'
import { quoteGeneration, type GenerationQuote, type QuotedModel } from './generationQuote'

type Request = { owner: string | null; loading: boolean; busy: boolean; revision: number }
type Snapshot = GenerationAccountSnapshot & { request: Request; settled: boolean; fundingReview?: string }
export type GenerationQuoteState = { quote: GenerationQuote; checking: boolean; canRefresh: boolean; refresh: () => void; fundingReview?: string; reconciling?: boolean }

export function useGenerationQuote(model: QuotedModel, busy = false, detailed = false, budgetTier?: StudioBudgetTier): GenerationQuoteState {
  const { user, loading } = useAccount()
  const owner = user?.id ?? null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const [reconciliationRequest, setReconciliationRequest] = useState<Request | null>(null)
  const fundingCursor = useRef<{ owner: string; cursor: string | null } | null>(null)
  const selected = useRef({ model, detailed, budgetTier })
  useEffect(() => { selected.current = { model, detailed, budgetTier } }, [model, detailed, budgetTier])
  // A new identity, balance revision or operation invalidates the previous
  // snapshot during render, before effects or a late response can reuse it.
  const request = useMemo(() => ({ owner, loading, busy, revision }), [owner, loading, busy, revision])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
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
    let fundingReview: string | undefined
    let timeout: number
    let totalTimeout: number
    const settle = () => {
      if (closed) return
      closed = true; window.clearTimeout(timeout); window.clearTimeout(totalTimeout)
      setSnapshot({ ...latest, request, settled: true, fundingReview }); setReconciliationRequest(null)
    }
    // Auth may take up to 25 seconds. Each read/check has a finite deadline,
    // and UI settlement does not depend on a failed fetch honoring abort.
    const deadline = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => { settle(); controller.abort() }, GENERATION_ACCOUNT_TIMEOUT_MS)
    }
    const updatePartial = (value: GenerationAccountSnapshot) => {
      if (!closed) { latest = value; setSnapshot({ ...latest, request, settled: false, fundingReview }) }
    }
    totalTimeout = window.setTimeout(() => { settle(); controller.abort() }, 90_000)
    const timers = { setTimeout: (callback: () => void, delay: number) => window.setTimeout(callback, delay), clearTimeout: (id: number) => window.clearTimeout(id) }
    deadline()
    void (async () => {
      latest = await readGenerationAccount(fetch, controller.signal, updatePartial, timers)
      if (closed || latest.authenticationRequired) return
      const choice = selected.current
      if (quoteGeneration(choice.model, latest.account, latest.billing, true, choice.detailed, choice.budgetTier).reason !== 'PROVIDER_BUDGET_EXHAUSTED') return
      setReconciliationRequest(request)
      fundingReview = 'Earlier-model funding could not be fully checked. Your existing funding limit remains in effect; refresh to try the check again.'
      deadline()
      const cursor = fundingCursor.current?.owner === request.owner ? fundingCursor.current.cursor : null
      const checked = await reconcileGenerationFunding(fetch, controller.signal, cursor)
      if (closed) return
      fundingCursor.current = { owner: request.owner!, cursor: checked.nextCursor }
      fundingReview = checked.checked === 0
        ? checked.hasMore
          ? 'No eligible earlier model reservations were found in this batch. Refresh availability to check the next batch; no new model or payment will be started.'
          : 'No eligible earlier model reservations were found for this funding check. No unused funding was confirmed or returned; the current account funding limit still applies.'
        : checked.hasMore
          ? 'This batch of earlier models was checked. Refresh availability to check the next batch; no new model or payment will be started.'
        : checked.unresolved > 0
          ? 'Earlier models were checked. Unverified or incurred provider costs remain reserved; only proven unused funding can be returned.'
          : 'Earlier models were checked for proven unused funding. No new model or payment was started.'
      deadline()
      const refreshed = await readGenerationAccount(fetch, controller.signal, undefined, timers)
      // A transport failure must not replace a known funding denial with an
      // unknown balance. A real auth failure still removes the old allowance.
      if (!closed && (refreshed.account !== null || refreshed.authenticationRequired)) latest = refreshed
    })().catch(() => {}).finally(settle)
    return () => { closed = true; controller.abort(); window.clearTimeout(timeout); window.clearTimeout(totalTimeout) }
  }, [request])
  const current = owner && snapshot?.request === request ? snapshot : null
  const checking = loading || busy || (!!owner && current?.settled !== true)
  const reconciling = checking && reconciliationRequest === request
  const currentQuote = quoteGeneration(model, current?.account, current?.billing, !!owner && !current?.authenticationRequired, detailed, budgetTier)
  const quote = loading || busy
    ? { state: 'pending' as const, points: null, after: null, message: loading ? 'Checking your account before generation.' : 'Checking current cost after this request. No new generation can start yet.' }
    : checking && currentQuote.reason !== 'PROVIDER_BUDGET_EXHAUSTED' ? { state: 'pending' as const, points: null, after: null, message: reconciling ? 'Checking proven unused funding from earlier models. This does not start a new model or payment.' : 'Checking your current points and model funding. No generation has started.' }
    : currentQuote
  return { quote, checking, reconciling, fundingReview: current?.fundingReview, canRefresh: !!owner && !loading && !busy && !checking, refresh }
}
