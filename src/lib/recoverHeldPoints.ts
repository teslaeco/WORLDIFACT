import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'
import { PAID_POINTS_FUNDING, POINT_COST_WAIVED_DETAIL, isPointSettlement, type PointSettlement } from './paidPointsFunding.ts'
import { isStudioPricing, type StudioPricing } from './studioPricing.ts'

export type HeldPointsReview = { id: string; channel: 'studio' | 'blueprint'; model: GenerationModel; state: 'held' | 'pending-cost'; heldPoints: number }
export type HeldPointsRecovery = { state: 'pending' | 'failed' | 'completed'; detail: string; pointSettlement?: PointSettlement }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const MAX_RESPONSE_BYTES = 131_072
const CHECK_TIMEOUT_MS = 270_000
const INVALID = 'This held request could not be verified. Keep its request ID for manual review; no refund or final point charge is confirmed.'
const UNCONFIRMED = 'Point settlement is unconfirmed. Manual review is required if final provider cost cannot be verified. No refund or final point charge is confirmed.'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
class HeldPointsRecoveryError extends Error {}
const invalid = (): never => { throw new HeldPointsRecoveryError(INVALID) }

function validateReview(item: HeldPointsReview): void {
  if (!object(item) || typeof item.id !== 'string' || !UUID.test(item.id) || !['studio', 'blueprint'].includes(item.channel) ||
      !['luna', 'sol', 'astra'].includes(item.model) || !['held', 'pending-cost'].includes(item.state) ||
      !Number.isSafeInteger(item.heldPoints) || !(item.channel === 'studio' && item.model === 'astra' && item.heldPoints === 500 || item.heldPoints === MODEL_CATALOG[item.model].creditsPerGeneration)) invalid()
}
function normalizedState(state: unknown, channel: 'studio' | 'blueprint'): HeldPointsRecovery['state'] {
  if (typeof state !== 'string') return invalid()
  if (state === 'failed' || channel === 'studio' && state === 'cancelled') return 'failed'
  if (state === 'completed' && channel === 'blueprint' || state === 'succeeded' && channel === 'studio') return 'completed'
  if (state === 'pending' || channel === 'blueprint' && state === 'reserved' || channel === 'studio' && ['queued', 'generating', 'retrying', 'building'].includes(state)) return 'pending'
  return invalid()
}
function checkedSettlement(value: unknown, state: HeldPointsRecovery['state'], points: number, allowWaived = false): PointSettlement {
  if (!isPointSettlement(value, points) || (value.state === 'waived' ? !allowWaived || state !== 'failed' : state === 'pending' ? value.state !== 'held' : state === 'completed' ? value.state !== 'charged' : !['pending-cost', 'released'].includes(value.state))) return invalid()
  return { ...value }
}
function outcome(state: HeldPointsRecovery['state'], pointSettlement?: PointSettlement): HeldPointsRecovery {
  const detail = !pointSettlement ? UNCONFIRMED
    : pointSettlement.state === 'waived' ? POINT_COST_WAIVED_DETAIL
    : pointSettlement.state === 'pending-cost' ? `${pointSettlement.heldPoints} points remain held pending provider-cost review. No points have been charged or released. Manual review is needed if final provider cost cannot be confirmed; checking an unchanged cost-limit receipt does not establish final spending.`
    : pointSettlement.state === 'held' ? `${pointSettlement.heldPoints} points remain held for this existing request. Generation is not yet settled. No replacement generation was started.`
    : pointSettlement.state === 'released' ? 'The held points were released. No points were charged for this failed request.'
    : `The existing request completed. ${pointSettlement.chargedPoints} points were charged.`
  return { state, detail, ...(pointSettlement ? { pointSettlement } : {}) }
}
function pricing(value: Record<string, unknown>, item: HeldPointsReview): StudioPricing | undefined {
  if (!Object.hasOwn(value, 'pricing')) return undefined
  if (!isStudioPricing(value.pricing) || item.model !== 'astra' || value.pricing.points !== item.heldPoints) return invalid()
  return { ...value.pricing }
}
const pricingKey = (value: StudioPricing | undefined) => value ? `${value.revision}:${value.tier}:${value.points}:${value.maxProviderCents}` : ''

/** Bound even a custom transport or body reader that ignores abort. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) abort()
  })
}
async function readJson(fetcher: typeof fetch, path: string, signal: AbortSignal, ticket?: string): Promise<Record<string, unknown>> {
  signal.throwIfAborted()
  const response = await abortable(fetcher(path, {
    method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
    ...(ticket ? { headers: { 'X-WORLDIFACT-Job': ticket } } : {}),
  }), signal)
  if (response.redirected || !response.ok || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') ||
      Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {})
    if (response.status === 401 || response.status === 403) throw new HeldPointsRecoveryError('Sign in to the original account to check this held request. No replacement was started.')
    return invalid()
  }
  const reader = response.body?.getReader()
  if (!reader) return invalid()
  let bytes = 0, text = ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for (;;) {
      const chunk = await abortable(reader.read(), signal)
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) return invalid()
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    signal.throwIfAborted()
    const value: unknown = JSON.parse(text)
    if (!object(value)) return invalid()
    return value
  } catch {
    void reader.cancel().catch(() => {})
    signal.throwIfAborted()
    return invalid()
  } finally { try { reader.releaseLock() } catch { /* The aborted read is already closed. */ } }
}

/** Explicit one-shot, same-account recovery. No POST, UUID allocation, storage,
 * pointer changes, model replacement, or use of a server-supplied URL. */
export async function recoverHeldPoints(fetcher: typeof fetch, item: HeldPointsReview, signal?: AbortSignal): Promise<HeldPointsRecovery> {
  validateReview(item)
  const checkSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]) : AbortSignal.timeout(CHECK_TIMEOUT_MS)
  try { return await checkExistingRequest(fetcher, item, checkSignal) }
  catch (error) {
    if (checkSignal.aborted) throw new HeldPointsRecoveryError('The same-request check was interrupted. No new generation was started.')
    if (error instanceof HeldPointsRecoveryError) throw error
    return invalid()
  }
}

async function checkExistingRequest(fetcher: typeof fetch, item: HeldPointsReview, checkSignal: AbortSignal): Promise<HeldPointsRecovery> {
  if (item.channel === 'blueprint') {
    const value = await readJson(fetcher, `/api/blueprint/requests/${item.id}?stored=held-points-v1`, checkSignal)
    if (value.requestId !== item.id || value.model !== item.model || value.owned === false || value.conflict === true) return invalid()
    const state = normalizedState(value.state, 'blueprint')
    if (!Object.hasOwn(value, 'pointSettlement')) return outcome(state)
    const settlement = checkedSettlement(value.pointSettlement, state, item.heldPoints)
    if (value.refunded !== undefined && (typeof value.refunded !== 'boolean' || value.refunded !== (settlement.state === 'released'))) return invalid()
    return outcome(state, settlement)
  }
  const selected = await readJson(fetcher, `/api/studio/current?job=${item.id}`, checkSignal)
  const current = selected.current
  if (!object(current) || current.fundingSource !== PAID_POINTS_FUNDING || !object(current.receipt)) return invalid()
  const receipt = current.receipt
  const ticketBody = typeof receipt.ticket === 'string' && receipt.ticket.startsWith('held.') ? receipt.ticket.slice('held.'.length) : receipt.ticket
  if (receipt.id !== item.id || typeof receipt.ticket !== 'string' || typeof ticketBody !== 'string' || !new RegExp(`^${item.id}\\.[0-9]{13}\\.[a-f0-9]{64}\\.[a-f0-9]{64}$`).test(ticketBody) ||
      typeof receipt.createdAt !== 'string' || !Number.isFinite(Date.parse(receipt.createdAt)) || Date.parse(receipt.createdAt) !== Number(ticketBody.split('.')[1]) ||
      typeof current.financialState !== 'string' || !['reserved', 'completed', 'failed'].includes(current.financialState)) return invalid()
  const terms = pricing(current, item), receiptTerms = pricing(receipt, item)
  if (pricingKey(terms) !== pricingKey(receiptTerms) || item.heldPoints === 500 && terms?.tier !== 'extended') return invalid()
  const financialState = current.financialState === 'reserved' ? 'pending' : current.financialState as 'completed' | 'failed'
  const selectedSettlement = checkedSettlement(current.pointSettlement, financialState, item.heldPoints, current.financialState === 'failed')
  if (current.reservedPoints !== selectedSettlement.heldPoints) return invalid()
  // The authenticated owned snapshot already establishes this final incident
  // waiver. It needs no signed job recovery or further provider-cost check.
  if (selectedSettlement.state === 'waived') {
    if (current.owned === false || current.conflict === true || current.refunded === true) return invalid()
    return outcome('failed', selectedSettlement)
  }
  const value = await readJson(fetcher, `/api/studio/jobs/${item.id}`, checkSignal, receipt.ticket)
  if (!object(value.job) || value.job.id !== item.id) return invalid()
  const state = normalizedState(value.job.state, 'studio'), statusTerms = pricing(value.job, item)
  if (pricingKey(statusTerms) !== pricingKey(terms)) return invalid()
  if (!Object.hasOwn(value.job, 'pointSettlement')) return outcome(state)
  const finalSettlement = checkedSettlement(value.job.pointSettlement, state, item.heldPoints, value.job.state === 'failed')
  if (finalSettlement.state === 'waived' && (value.job.refunded === true || value.job.reconciliationRequired === true || value.job.downloadAllowed === true || value.job.previewAvailable === true)) return invalid()
  if (['charged', 'released'].includes(selectedSettlement.state) && finalSettlement.state !== selectedSettlement.state || selectedSettlement.state === 'pending-cost' && finalSettlement.state === 'held') return invalid()
  return outcome(state, finalSettlement)
}
