export type GenerationAccountSnapshot = { account: unknown; billing: unknown; authenticationRequired: boolean }
export type GenerationFundingCheck = { checked: number; reconciled: number; unresolved: number; nextCursor: string | null; hasMore: boolean; paidGenerationRequested: false }
export const GENERATION_ACCOUNT_TIMEOUT_MS = 40_000
type ReadTimers = { setTimeout: (callback: () => void, delay: number) => number; clearTimeout: (id: number) => void }
const readTimers: ReadTimers = { setTimeout: (callback, delay) => Number(setTimeout(callback, delay)), clearTimeout: id => clearTimeout(id) }

/** Reconcile the signed-in membership from existing Stripe payment evidence.
 * This status action cannot create a checkout, payment or subscription.
 */
export function syncGenerationMembership(fetcher: typeof fetch, signal: AbortSignal, timers: ReadTimers = readTimers): Promise<'synced' | 'unavailable' | 'signin'> {
  return new Promise(resolve => {
    const controller = new AbortController()
    let finished = false
    let timeout: number
    const finish = (result: 'synced' | 'unavailable' | 'signin') => {
      if (finished) return
      finished = true; timers.clearTimeout(timeout); signal.removeEventListener('abort', cancel); resolve(result)
    }
    const cancel = () => { controller.abort(); finish('unavailable') }
    timeout = timers.setTimeout(cancel, 10_000)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) { cancel(); return }
    void (async () => {
      const response = await fetcher('/api/billing/recovery', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
      if (response.status === 401) { finish('signin'); return }
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { finish('unavailable'); return }
      const text = await response.text()
      if (text.length > 4096) { finish('unavailable'); return }
      const value = JSON.parse(text)
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          !['active', 'none', 'processing', 'review', 'payment_required'].includes(value.state) ||
          typeof value.canManage !== 'boolean' || typeof value.canRetry !== 'boolean' ||
          value.state === 'active' && !['creator', 'pro', 'studio'].includes(value.activePlan)) { finish('unavailable'); return }
      // Never trust this response as a credit balance or open any returned URL.
      // The caller must read authenticated entitlements again after settlement.
      finish('synced')
    })().catch(() => finish('unavailable'))
  })
}

/** A single read-only snapshot feeds both the displayed quote and admission UI. */
export async function readGenerationAccount(fetcher: typeof fetch, signal: AbortSignal, onPartial?: (value: GenerationAccountSnapshot) => void, timers: ReadTimers = readTimers): Promise<GenerationAccountSnapshot> {
  const snapshot: GenerationAccountSnapshot = { account: null, billing: null, authenticationRequired: false }
  const read = async (path: string, requestSignal = signal) => {
    const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: requestSignal })
    if (!response.ok) return { value: null, authenticationRequired: response.status === 401 }
    if (!response.headers.get('content-type')?.includes('application/json')) return { value: null, authenticationRequired: false }
    const text = await response.text()
    if (text.length > 16384) return { value: null, authenticationRequired: false }
    try { return { value: JSON.parse(text) as unknown, authenticationRequired: false } }
    catch { return { value: null, authenticationRequired: false } }
  }
  // Billing is auxiliary to an authenticated funding refusal. Bound both its
  // headers and body even when a transport does not settle on abort, so it
  // cannot prevent the safe historical-funding check from running.
  const billingController = new AbortController()
  const billing = new Promise<{ value: unknown; authenticationRequired: boolean }>(resolve => {
    const unavailable = { value: null, authenticationRequired: false }
    const timeout = timers.setTimeout(() => { billingController.abort(); resolve(unavailable) }, 10_000)
    void read('/api/billing/status', AbortSignal.any([signal, billingController.signal]))
      .then(resolve, () => resolve(unavailable)).finally(() => timers.clearTimeout(timeout))
  })
  await Promise.allSettled([
    read('/api/account/entitlements').then(account => { snapshot.account = account.value; snapshot.authenticationRequired = account.authenticationRequired; onPartial?.({ ...snapshot }) }),
    billing.then(value => { snapshot.billing = value.value; onPartial?.({ ...snapshot }) }),
  ])
  signal.throwIfAborted()
  return snapshot
}

/** Checks only sealed, already-finished liabilities. This cannot create a model. */
export async function reconcileGenerationFunding(fetcher: typeof fetch, signal: AbortSignal, cursor: string | null): Promise<GenerationFundingCheck> {
  const response = await fetcher('/api/studio/reconcile-budget', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor }) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Funding review could not be verified.')
  const text = await response.text()
  if (text.length > 2048) throw new Error('Funding review could not be verified.')
  const value = JSON.parse(text) as GenerationFundingCheck
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.paidGenerationRequested !== false ||
    ![value.checked, value.reconciled, value.unresolved].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 8) ||
    value.reconciled + value.unresolved > value.checked || typeof value.hasMore !== 'boolean' ||
    (value.hasMore ? typeof value.nextCursor !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.nextCursor) || (cursor !== null && value.nextCursor <= cursor) : value.nextCursor !== null))
    throw new Error('Funding review could not be verified.')
  signal.throwIfAborted()
  return value
}
