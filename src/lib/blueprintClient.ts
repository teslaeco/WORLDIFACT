import { validateGenerationResult, type GenerationResult } from './blueprint.ts'
import { blueprintFingerprint, blueprintRequestId } from './blueprintRequest.ts'
import { blueprintModel, MODEL_CATALOG } from './modelCatalog.ts'
import { blueprintAdmissionDetail, isAdmissionFailureCode, type AdmissionFailureCode } from './generationAdmission.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_POLICY_HEADER, PAID_POINTS_FUNDING, isPointSettlement, type PointSettlement } from './paidPointsFunding.ts'

export const BLUEPRINT_RECOVERY_KEY = 'worldifact:blueprint-recovery:v1'
export const BLUEPRINT_RECOVERY_ARCHIVE_KEY = `${BLUEPRINT_RECOVERY_KEY}:held-history`
export const BLUEPRINT_PENDING_COST_DETAIL = 'Points remain held pending provider-cost review. No points have been charged or released. Manual review is needed if final provider cost cannot be confirmed.'
const UNCONFIRMED_FAILED_SETTLEMENT = 'Generation failed. Point settlement is unconfirmed. No refund or final charge is confirmed. Manual review is required.'
const UNVERIFIED_SETTLEMENT = 'Point settlement needs review. Recover this same request; no refund or final charge is confirmed.'
export type BlueprintRecovery = { providerModel?: string; id: string; fingerprint: string; model: string; state: 'pending' | 'completed' | 'failed'; createdAt: number; failureCode?: AdmissionFailureCode; fundingPolicy?: typeof PAID_POINTS_FUNDING; pointSettlementUnconfirmed?: true; pointSettlement?: PointSettlement }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Payload = { prompt: string; model: string; [key: string]: unknown }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Fixed copy only: provider errors cannot claim an unverified refund or charge. */
export function blueprintRecoveryDetail(record: BlueprintRecovery): string {
  if (record.pointSettlementUnconfirmed === true) return UNCONFIRMED_FAILED_SETTLEMENT
  let settlement: PointSettlement | undefined
  try { settlement = validateSettlement(record, record, record.state) }
  catch { return UNVERIFIED_SETTLEMENT }
  if (settlement) {
    if (settlement.state === 'pending-cost') return BLUEPRINT_PENDING_COST_DETAIL
    if (settlement.state === 'held') return `${settlement.heldPoints} points are held for this request. Point settlement is not yet final.`
    if (settlement.state === 'released') return 'This attempt failed. Its held points were released; no points were charged.'
    return `This attempt completed. ${settlement.chargedPoints} points were charged.`
  }
  if (record.failureCode) return blueprintAdmissionDetail(record.failureCode)
  return record.state === 'failed' ? 'This saved attempt is finished. Explicitly prepare a new attempt when ready; no replacement was started.' : 'Recovery does not start another paid generation.'
}

function validateRecovery(value: unknown): BlueprintRecovery {
  if (!object(value) || Object.keys(value).some(key => !['providerModel', 'id', 'fingerprint', 'model', 'state', 'createdAt', 'failureCode', 'fundingPolicy', 'pointSettlementUnconfirmed', 'pointSettlement'].includes(key)) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !['sol', 'luna', 'astra'].includes(String(value.model)) || !['pending', 'completed', 'failed'].includes(String(value.state)) || !Number.isSafeInteger(value.createdAt) || (value.failureCode !== undefined && (!isAdmissionFailureCode(value.failureCode) || value.state !== 'failed'))) throw new Error('Generation recovery metadata needs review. No new paid request was started.')
  if (Object.hasOwn(value, 'providerModel') && value.providerModel !== `gpt-6-${value.model}` && !(value.model === 'sol' && value.providerModel === 'gpt-6.1-sol')) throw new Error('Saved provider model identity needs review. No new paid request was started.')
  if (Object.hasOwn(value, 'fundingPolicy') && value.fundingPolicy !== PAID_POINTS_FUNDING) throw new Error(UNVERIFIED_SETTLEMENT)
  if (Object.hasOwn(value, 'pointSettlementUnconfirmed') && (value.pointSettlementUnconfirmed !== true || value.fundingPolicy !== PAID_POINTS_FUNDING || value.state !== 'failed' || Object.hasOwn(value, 'pointSettlement') || Object.hasOwn(value, 'failureCode'))) throw new Error(UNVERIFIED_SETTLEMENT)
  if (value.fundingPolicy && value.state !== 'pending' && !Object.hasOwn(value, 'pointSettlement') && value.pointSettlementUnconfirmed !== true) throw new Error(UNVERIFIED_SETTLEMENT)
  if (Object.hasOwn(value, 'pointSettlement')) validateSettlement(value, value as unknown as BlueprintRecovery, value.state as BlueprintRecovery['state'])
  return value as unknown as BlueprintRecovery
}

function validateSettlement(body: Record<string, unknown>, record: BlueprintRecovery, state: BlueprintRecovery['state']): PointSettlement | undefined {
  if (!Object.hasOwn(body, 'pointSettlement')) {
    if (record.pointSettlement || record.fundingPolicy) throw new Error(UNVERIFIED_SETTLEMENT)
    return undefined
  }
  const settlement = body.pointSettlement
  if (!isPointSettlement(settlement, MODEL_CATALOG[blueprintModel(record.model)].creditsPerGeneration) ||
    (state === 'failed' ? !['pending-cost', 'released'].includes(settlement.state) : state === 'completed' ? settlement.state !== 'charged' : settlement.state !== 'held') ||
    (body.noCharge === true && settlement.state !== 'released') || (body.refunded === true && settlement.state !== 'released')) throw new Error(UNVERIFIED_SETTLEMENT)
  return settlement
}

/** Only recovery metadata is stored on this device: no images, prompt or token. */
export class BlueprintClient {
  private store: Store
  private fetcher: typeof fetch
  constructor(store: Store, fetcher: typeof fetch) { this.store = store; this.fetcher = (input, init) => fetcher(input, init) }
  current(): BlueprintRecovery | null {
    const raw = this.store.getItem(BLUEPRINT_RECOVERY_KEY)
    return raw ? validateRecovery(JSON.parse(raw)) : null
  }
  archived(): BlueprintRecovery[] {
    const raw = this.store.getItem(BLUEPRINT_RECOVERY_ARCHIVE_KEY)
    if (!raw) return []
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) throw new Error('Saved held-point requests need review. No new paid request was started.')
    const records = values.map(validateRecovery)
    if (records.some(record => record.state !== 'failed' || !(record.pointSettlementUnconfirmed || record.pointSettlement && ['pending-cost', 'released'].includes(record.pointSettlement.state))) || new Set(records.map(record => record.id)).size !== records.length) throw new Error('Saved held-point requests need review. No new paid request was started.')
    return records
  }
  private save(record: BlueprintRecovery) { this.store.setItem(BLUEPRINT_RECOVERY_KEY, JSON.stringify(record)) }
  private saveArchived(record: BlueprintRecovery) {
    const records = this.archived(), index = records.findIndex(value => value.id === record.id)
    if (index < 0) records.push(record)
    else {
      const previous = records[index]
      if (previous.fingerprint !== record.fingerprint || previous.model !== record.model || previous.providerModel !== record.providerModel || previous.createdAt !== record.createdAt || previous.fundingPolicy !== record.fundingPolicy) throw new Error('Saved request identity needs review. No replacement was started.')
      if (previous.pointSettlement?.state === 'released' && record.pointSettlement?.state !== 'released') throw new Error('This saved point review was already settled. Recover its existing reference before continuing.')
      records[index] = record
    }
    this.store.setItem(BLUEPRINT_RECOVERY_ARCHIVE_KEY, JSON.stringify(records))
  }
  reset() {
    const record = this.current()
    if (record?.state === 'pending') throw new Error('Recover the pending request before starting a new paid attempt.')
    // Persist before clearing. A full/unavailable store must never lose a held UUID.
    if (record?.pointSettlement?.state === 'pending-cost' || record?.pointSettlementUnconfirmed) this.saveArchived(record)
    this.store.removeItem(BLUEPRINT_RECOVERY_KEY)
  }
  private async accept(value: unknown, record: BlueprintRecovery, settlementBody?: Record<string, unknown>): Promise<GenerationResult> {
    if (record.state === 'failed') throw new Error(UNVERIFIED_SETTLEMENT)
    const raw = object(value) ? value : {}, pointSettlement = validateSettlement(settlementBody ?? raw, record, 'completed')
    // Settlement is receipt metadata, not part of the immutable generated asset.
    const asset = { ...raw }
    if (!settlementBody) delete asset.pointSettlement
    const result = validateGenerationResult(asset)
    if (result.requestId !== await blueprintRequestId(record.id) || result.mode !== 'LIVE' || result.model !== (record.providerModel ?? `gpt-6-${record.model}`) || !result.evidence || !result.delivery) throw new Error('The response did not contain verified model and delivery evidence. Recover this same request; do not pay for a replacement.')
    this.save({ ...record, state: 'completed', ...(pointSettlement ? { pointSettlement } : {}) })
    return result
  }
  private async recoverRecord(record: BlueprintRecovery, signal?: AbortSignal, archived = false): Promise<GenerationResult> {
    if (record.state === 'failed' && record.pointSettlement?.state !== 'pending-cost' && !record.pointSettlementUnconfirmed) throw new Error(blueprintRecoveryDetail(record))
    const response = await this.fetcher(`/api/blueprint/requests/${record.id}`, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('Your generation status is temporarily unavailable. Sign in to the original account and recover this request; no replacement was started.')
    const decoded: unknown = await response.json(), status = object(decoded) ? decoded : {}
    if (status.requestId !== undefined && status.requestId !== await blueprintRequestId(record.id)) throw new Error(UNVERIFIED_SETTLEMENT)
    if (status.state === 'completed' && status.result && !archived) return this.accept(status.result, record, status)
    if (record.state === 'completed' && status.state !== 'completed') throw new Error(UNVERIFIED_SETTLEMENT)
    if (status.state === 'failed') {
      if (!Object.hasOwn(status, 'pointSettlement') && record.fundingPolicy) {
        const failed = { ...record, state: 'failed' as const, pointSettlementUnconfirmed: true as const }
        if (record.pointSettlement) throw new Error(UNVERIFIED_SETTLEMENT)
        if (archived) this.saveArchived(failed); else this.save(failed)
        throw new Error(UNCONFIRMED_FAILED_SETTLEMENT)
      }
      const pointSettlement = validateSettlement(status, record, 'failed')
      if (pointSettlement) {
        const failed = { ...record, state: 'failed' as const, pointSettlement }
        delete failed.pointSettlementUnconfirmed
        if (archived) this.saveArchived(failed); else this.save(failed)
        throw new Error(blueprintRecoveryDetail(failed))
      }
      if (status.refunded === true) {
        this.save({ ...record, state: 'failed' })
        throw new Error('This attempt failed. Its reserved customer points or free allowance have been returned. Start a new attempt only when you choose to.')
      }
    }
    if (Object.hasOwn(status, 'pointSettlement') || record.pointSettlement || record.fundingPolicy) {
      if (status.state !== 'pending' || record.state === 'failed') throw new Error(UNVERIFIED_SETTLEMENT)
      const pointSettlement = validateSettlement(status, record, 'pending')
      this.save({ ...record, pointSettlement })
    }
    throw new Error('This request is pending or its acceptance is not yet confirmed. Recover the same request; no second generation or charge has been started.')
  }
  async recover(signal?: AbortSignal): Promise<GenerationResult> {
    const record = this.current()
    if (!record) throw new Error('There is no saved blueprint request to recover.')
    return this.recoverRecord(record, signal)
  }
  async recoverArchived(id: string, signal?: AbortSignal): Promise<void> {
    const record = this.archived().find(value => value.id === id)
    if (!record) throw new Error('There is no saved held-point request with that identity.')
    await this.recoverRecord(record, signal, true)
  }
  async submit(payload: Payload, signal?: AbortSignal, fundingPolicy?: string): Promise<GenerationResult> {
    signal?.throwIfAborted()
    if (fundingPolicy !== undefined && fundingPolicy !== PAID_POINTS_FUNDING) throw new Error(UNVERIFIED_SETTLEMENT)
    const providerModel = MODEL_CATALOG[blueprintModel(payload.model)].model
    const wirePayload = { ...payload, providerModel }
    const fingerprint = await blueprintFingerprint(wirePayload), previous = this.current()
    if (previous?.state === 'failed') return this.recover(signal)
    // Old receipts retain their old fingerprint and exact provider expectation.
    // A matching legacy attempt is recovery-only across a deployment boundary.
    if (previous && !Object.hasOwn(previous, 'providerModel') && previous.fingerprint === await blueprintFingerprint(payload)) return this.recover(signal)
    if (previous?.state === 'pending' && previous.fingerprint !== fingerprint) throw new Error('Different inputs cannot replace a pending paid request. Recover the existing request first.')
    if (previous?.state === 'pending' || previous?.fingerprint === fingerprint) return this.recover(signal)
    this.archived() // Do not start a replacement while saved hold metadata is corrupt.
    // Cancellation before allocation is known not to have submitted anything.
    signal?.throwIfAborted()
    const record: BlueprintRecovery = { providerModel, id: crypto.randomUUID(), fingerprint, model: payload.model, state: 'pending', createdAt: Date.now(), ...(fundingPolicy === PAID_POINTS_FUNDING ? { fundingPolicy } : {}) }
    this.save(record) // Fail closed if durable browser recovery storage is unavailable.
    const response = await this.fetcher('/api/blueprint', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': record.id, ...(record.fundingPolicy ? { [PAID_POINTS_POLICY_HEADER]: PAID_POINTS_POLICY } : {}) }, signal,
      body: JSON.stringify(wirePayload),
    })
    const decoded: unknown = await response.json()
    const body = object(decoded) ? decoded : {}
    if (response.ok) return this.accept(body, record)
    if (Object.hasOwn(body, 'pointSettlement')) {
      if (body.requestId !== undefined && body.requestId !== await blueprintRequestId(record.id)) throw new Error(UNVERIFIED_SETTLEMENT)
      const state = object(body.pointSettlement) && body.pointSettlement.state === 'held' ? 'pending' : 'failed'
      if (body.state !== undefined && body.state !== state) throw new Error(UNVERIFIED_SETTLEMENT)
      const pointSettlement = validateSettlement(body, record, state)
      const updated: BlueprintRecovery = { ...record, state, pointSettlement }
      this.save(updated)
      throw new Error(blueprintRecoveryDetail(updated))
    }
    if (record.fundingPolicy) {
      if (body.state === 'failed') {
        this.save({ ...record, state: 'failed', pointSettlementUnconfirmed: true })
        throw new Error(UNCONFIRMED_FAILED_SETTLEMENT)
      }
      throw new Error(UNVERIFIED_SETTLEMENT)
    }
    if (body.noCharge === true) {
      const failureCode = isAdmissionFailureCode(body.failureCode) ? body.failureCode : 'ACCOUNT_ADMISSION_UNAVAILABLE'
      this.save({ ...record, state: 'failed', failureCode })
      throw new Error(isAdmissionFailureCode(body.failureCode) ? blueprintAdmissionDetail(failureCode) : String(body.error || 'The request was rejected before points were reserved.'))
    }
    // Read-only reconciliation is safe even when a POST response was lost or a
    // settlement response is uncertain. Never resubmit with a fresh UUID here.
    return this.recover()
  }
}
