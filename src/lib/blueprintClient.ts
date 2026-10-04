import { validateGenerationResult, type GenerationResult } from './blueprint.ts'
import { blueprintFingerprint, blueprintRequestId } from './blueprintRequest.ts'

export const BLUEPRINT_RECOVERY_KEY = 'worldifact:blueprint-recovery:v1'
export type BlueprintRecovery = { id: string; fingerprint: string; model: string; state: 'pending' | 'completed' | 'failed'; createdAt: number }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Payload = { prompt: string; model: string; [key: string]: unknown }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** Only recovery metadata is stored on this device: no images, prompt or token. */
export class BlueprintClient {
  private store: Store
  private fetcher: typeof fetch
  constructor(store: Store, fetcher: typeof fetch) { this.store = store; this.fetcher = (input, init) => fetcher(input, init) }
  current(): BlueprintRecovery | null {
    const raw = this.store.getItem(BLUEPRINT_RECOVERY_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as BlueprintRecovery
    if (!value || !uuid.test(value.id) || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !['sol', 'luna', 'astra'].includes(value.model) || !['pending', 'completed', 'failed'].includes(value.state) || !Number.isSafeInteger(value.createdAt)) throw new Error('Generation recovery metadata needs review. No new paid request was started.')
    return value
  }
  private save(record: BlueprintRecovery) { this.store.setItem(BLUEPRINT_RECOVERY_KEY, JSON.stringify(record)) }
  reset() {
    if (this.current()?.state === 'pending') throw new Error('Recover the pending request before starting a new paid attempt.')
    this.store.removeItem(BLUEPRINT_RECOVERY_KEY)
  }
  private async accept(value: unknown, record: BlueprintRecovery): Promise<GenerationResult> {
    const result = validateGenerationResult(value)
    if (result.requestId !== await blueprintRequestId(record.id) || result.mode !== 'LIVE' || result.model !== `gpt-6-${record.model}` || !result.evidence || !result.delivery) throw new Error('The response did not contain verified model and delivery evidence. Recover this same request; do not pay for a replacement.')
    this.save({ ...record, state: 'completed' })
    return result
  }
  async recover(signal?: AbortSignal): Promise<GenerationResult> {
    const record = this.current()
    if (!record) throw new Error('There is no saved blueprint request to recover.')
    const response = await this.fetcher(`/api/blueprint/requests/${record.id}`, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('Your generation status is temporarily unavailable. Sign in to the original account and recover this request; no replacement was started.')
    const status = await response.json() as { state?: string; result?: unknown; refunded?: boolean }
    if (status.state === 'completed' && status.result) return this.accept(status.result, record)
    if (status.state === 'failed' && status.refunded === true) {
      this.save({ ...record, state: 'failed' })
      throw new Error('This attempt failed. Its reserved customer points or free allowance have been returned. Start a new attempt only when you choose to.')
    }
    throw new Error('This request is pending or its acceptance is not yet confirmed. Recover the same request; no second generation or charge has been started.')
  }
  async submit(payload: Payload, signal?: AbortSignal): Promise<GenerationResult> {
    const fingerprint = await blueprintFingerprint(payload), previous = this.current()
    if (previous?.state === 'pending' && previous.fingerprint !== fingerprint) throw new Error('Different inputs cannot replace a pending paid request. Recover the existing request first.')
    if (previous?.state === 'pending' || previous?.fingerprint === fingerprint) return this.recover(signal)
    const record: BlueprintRecovery = { id: crypto.randomUUID(), fingerprint, model: payload.model, state: 'pending', createdAt: Date.now() }
    this.save(record) // Fail closed if durable browser recovery storage is unavailable.
    const response = await this.fetcher('/api/blueprint', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': record.id }, signal,
      body: JSON.stringify(payload),
    })
    const decoded: unknown = await response.json()
    const body: Record<string, unknown> = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : {}
    if (response.ok) return this.accept(body, record)
    if (body?.noCharge === true) {
      this.save({ ...record, state: 'failed' })
      throw new Error(String(body.error || 'The request was rejected before points were reserved.'))
    }
    // Read-only reconciliation is safe even when a POST response was lost or a
    // settlement response is uncertain. Never resubmit with a fresh UUID here.
    try { return await this.recover() }
    catch (e) { throw new Error(`${typeof body?.error === 'string' ? body.error + ' ' : ''}${e instanceof Error ? e.message : 'Recover the same request.'}`) }
  }
}
