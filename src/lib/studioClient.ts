import { isStudioPricing, studioPricingFor, type StudioPricing } from './studioPricing.ts'
import { JOB_DETAILS, STUDIO_FAILURE_CODES, STUDIO_FAILURE_DETAILS, STUDIO_MODEL_LIMIT, STUDIO_RECONCILIATION_DETAIL, FAST_DRAFT_PROFILE, generationProfile, prepareStudioInput, readStudioGenerationTiming, studioPointsPending, studioPendingPointsDetail, validateStudioInput, type StudioInput, type StudioReceipt, type StudioJob, type StudioStatus } from './studioProtocol.ts'
import { canSubmitNewDraft } from './studioDraft.ts'
import { PAID_POINTS_FUNDING, PAID_POINTS_POLICY_HEADER, isPointSettlement, type PointSettlement } from './paidPointsFunding.ts'

// Upload is separate from provider execution: a large mobile request must not
// inherit the short status-request deadline. Photos are uploaded only once.
export const STUDIO_PREPARE_TIMEOUT_MS = 90_000
export const STUDIO_SUBMIT_TIMEOUT_MS = 180_000
// Account verification, status lookup, artifact verification and settlement all
// complete server-side before this status JSON is returned (25+25+180s plus DO reads).
export const STUDIO_POLL_TIMEOUT_MS = 270_000
export const STUDIO_CONNECTION_INTERRUPTED = 'The connection was interrupted while reading this job. Keep this receipt; recovery checks the same job without starting another generation.'
export const STUDIO_RECEIPT_KEY = 'worldifact-studio-current-v1'
export const STUDIO_RECEIPT_HISTORY_PREFIX = 'worldifact-studio-receipt-v1:'
export const STUDIO_COST_REVIEW_KEY = 'worldifact-studio-cost-review-v1:'
export type SavedStudioJob = { pricing?: StudioPricing; receipt: StudioReceipt; prompt: string; startedAt: string; rejection?: string; rejectionCode?: StudioJob['failureCode']; generationProfile?: typeof FAST_DRAFT_PROFILE; pointSettlement?: PointSettlement; fundingSource?: typeof PAID_POINTS_FUNDING }
export type ReceiptStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Fetcher = typeof fetch
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const receiptParts = (ticket: string) => (ticket.startsWith('held.') ? ticket.slice('held.'.length) : ticket).split('.')
export function readReceipt(value: unknown): StudioReceipt {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.ticket !== 'string' ||
    !new RegExp(`^(?:held\\.)?${value.id}\\.[0-9]{13}\\.[a-f0-9]{64}\\.[a-f0-9]{64}$`).test(value.ticket) ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid job receipt. No generation was submitted.')
  return { id: value.id, ticket: value.ticket, createdAt: value.createdAt, ...(isStudioPricing(value.pricing) ? { pricing: { ...value.pricing } } : {}) }
}
export function readSavedStudioJob(store: ReceiptStore): SavedStudioJob | null {
  const text = store.getItem(STUDIO_RECEIPT_KEY)
  if (!text) return null
  return parseSavedStudioJob(JSON.parse(text))
}
function parseSavedStudioJob(value: unknown): SavedStudioJob {
  if (!object(value) || typeof value.prompt !== 'string' || value.prompt.length > 4000 || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) throw new Error('The saved job receipt is damaged. Do not submit a duplicate job.')
  const profile = generationProfile(value.generationProfile)
  const receipt = readReceipt(value.receipt)
  if (Object.hasOwn(value, 'fundingSource') && value.fundingSource !== PAID_POINTS_FUNDING) throw new Error('The saved job funding policy needs review. No replacement request was started.')
  const pricing = isStudioPricing(value.pricing) ? value.pricing : receipt.pricing
  if (Object.hasOwn(value, 'pointSettlement') && !isPointSettlement(value.pointSettlement, pricing?.points ?? (profile === FAST_DRAFT_PROFILE ? 50 : 250))) throw new Error('The saved job point settlement needs review. Keep this receipt; no new generation was started.')
  return { receipt, prompt: value.prompt, startedAt: value.startedAt,
    ...(isStudioPricing(value.pricing) ? { pricing: { ...value.pricing } } : receipt.pricing ? { pricing: { ...receipt.pricing } } : {}),
    ...(typeof value.rejection === 'string' && value.rejection.length <= 600 ? { rejection: value.rejection } : {}),
    ...(STUDIO_FAILURE_CODES.includes(value.rejectionCode as NonNullable<StudioJob['failureCode']>) ? { rejectionCode: value.rejectionCode as StudioJob['failureCode'] } : {}),
    ...(profile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}),
    ...(isPointSettlement(value.pointSettlement) ? { pointSettlement: { ...value.pointSettlement } } : {}),
    ...(value.fundingSource === PAID_POINTS_FUNDING || receipt.ticket.startsWith('held.') ? { fundingSource: PAID_POINTS_FUNDING } : {}) }
}
export function parseStudioJob(value: unknown, id: string, expectedPoints?: number, expectedPaid = false): StudioJob {
  if (!object(value) || !object(value.job) || value.job.id !== id || typeof value.job.state !== 'string' || !Object.hasOwn(JOB_DETAILS, value.job.state)) throw new Error('The response does not belong to the current model. The previous model will not be substituted.')
  const state = value.job.state as StudioJob['state']
  const pricing = isStudioPricing(value.job.pricing) ? value.job.pricing : undefined
  if (Object.hasOwn(value.job, 'pointSettlement') && !isPointSettlement(value.job.pointSettlement, expectedPoints ?? pricing?.points ?? (expectedPaid ? 250 : undefined))) throw new Error('This job’s point settlement could not be verified. Keep its receipt for review; no charge or refund is inferred.')
  const pointSettlement = isPointSettlement(value.job.pointSettlement) ? { ...value.job.pointSettlement } : undefined
  if (pointSettlement && (state === 'succeeded' ? pointSettlement.state !== 'charged' : ['failed', 'cancelled'].includes(state)
    ? !['pending-cost', 'released'].includes(pointSettlement.state) : pointSettlement.state !== 'held')) throw new Error('This job’s generation and point settlement states disagree. Keep its receipt for review; no charge or refund is inferred.')
  const pointSettlementUnconfirmed = expectedPaid && !pointSettlement && ['failed', 'cancelled'].includes(state)
  const reconciliationRequired = value.job.reconciliationRequired === true
  const failureCode = state === 'failed' && STUDIO_FAILURE_CODES.includes(value.job.failureCode as NonNullable<StudioJob['failureCode']>) ? value.job.failureCode as StudioJob['failureCode'] : undefined
  const failureDetail = failureCode ? STUDIO_FAILURE_DETAILS[failureCode] : undefined
  const generationTiming = ['succeeded', 'failed', 'cancelled'].includes(state) ? readStudioGenerationTiming(value.job.generationTiming) : undefined
  return { id, state, ...(pricing ? { pricing: { ...pricing } } : {}), detail: pointSettlementUnconfirmed || studioPointsPending({ state, pointSettlement }) ? studioPendingPointsDetail(pointSettlement?.heldPoints) : reconciliationRequired ? STUDIO_RECONCILIATION_DETAIL : failureDetail || JOB_DETAILS[state], ...(failureCode ? { failureCode } : {}),
    ...(pointSettlementUnconfirmed ? { pointSettlementUnconfirmed: true } : {}),
    ...(pointSettlement ? { pointSettlement } : {}),
    ...(generationTiming ? { generationTiming } : {}),
    ...(reconciliationRequired ? { reconciliationRequired: true } : {}),
    ...(typeof value.job.downloadAllowed === 'boolean' ? { downloadAllowed: value.job.downloadAllowed } : {}),
    ...(typeof value.job.previewOnly === 'boolean' ? { previewOnly: value.job.previewOnly } : {}),
    ...(typeof value.job.previewAvailable === 'boolean' ? { previewAvailable: value.job.previewAvailable } : {}) }
}
class StudioResponseError extends Error {
  status: number
  failureCode?: StudioJob['failureCode']
  pointSettlement?: PointSettlement
  constructor(message: string, status: number, failureCode?: StudioJob['failureCode'], pointSettlement?: PointSettlement) { super(message); this.status = status; this.failureCode = failureCode; this.pointSettlement = pointSettlement }
}
async function responseJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server did not return JSON. Your model was not replaced.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The server response is empty.')
  let text = '', count = 0
  const decoder = new TextDecoder()
  try { for (;;) {
    const next = await reader.read()
    if (next.done) break
    count += next.value.byteLength
    if (count > 32_768) { await reader.cancel(); throw new Error('The status response is too large.') }
    text += decoder.decode(next.value, { stream: true })
  } } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof Error && (['AbortError', 'TimeoutError'].includes(error.name) || /BodyStreamBuffer.*aborted|body.*abort/i.test(error.message))) throw new Error(STUDIO_CONNECTION_INTERRUPTED)
    throw error
  }
  const value: unknown = JSON.parse(text + decoder.decode())
  if (!response.ok) {
    if (object(value) && Object.hasOwn(value, 'pointSettlement') && !isPointSettlement(value.pointSettlement)) throw new Error('This job’s point settlement could not be verified. Keep its receipt for review; no charge or refund is inferred.')
    const settlement = object(value) && isPointSettlement(value.pointSettlement) ? { ...value.pointSettlement } : undefined
    const failureCode = object(value) && STUDIO_FAILURE_CODES.includes(value.failureCode as NonNullable<StudioJob['failureCode']>) ? value.failureCode as StudioJob['failureCode'] : undefined
    throw new StudioResponseError(studioPointsPending({ state: 'failed', pointSettlement: settlement }) ? studioPendingPointsDetail(settlement!.heldPoints) : failureCode ? STUDIO_FAILURE_DETAILS[failureCode] : object(value) && typeof value.error === 'string' ? value.error.slice(0, 600) : `Request failed (${response.status}).`, response.status, failureCode, settlement)
  }
  return value
}
const accessHeaders = (owner: string): Record<string, string> => owner ? { 'X-WORLDIFACT-Owner': owner } : {}
export async function checkStudio(fetcher: Fetcher = fetch, owner = ''): Promise<StudioStatus> {
  const response = await fetcher('/api/studio/status', { headers: accessHeaders(owner), cache: 'no-store', signal: AbortSignal.timeout(40_000) })
  const value = await responseJson(response)
  if (!object(value) || typeof value.ready !== 'boolean' || typeof value.reason !== 'string' || typeof value.photoReady !== 'boolean' || typeof value.oracle !== 'string') throw new Error('The Studio status could not be verified.')
  return { ...value, fastReady: value.fastReady === true } as unknown as StudioStatus
}
/** A new job needs an explicit start; recovery never sends another paid POST. */
export class StudioCoordinator {
  private saved: SavedStudioJob | null = null
  private confirmedJob: StudioJob | null = null
  private rejectedJob: StudioJob | null = null
  private submitting = false
  private recovering = false
  private store: ReceiptStore
  private fetcher: Fetcher
  private reviewOwner: () => string | null
  constructor(store: ReceiptStore, fetcher: Fetcher = fetch, reviewOwner: () => string | null = () => '') { this.store = store; this.fetcher = fetcher.bind(globalThis); this.reviewOwner = reviewOwner }
  private reviewKey() { const owner = this.reviewOwner(); return owner === null ? null : STUDIO_COST_REVIEW_KEY + encodeURIComponent(owner) }
  private readCostReviews(key: string | null): SavedStudioJob[] {
    const raw = key && this.store.getItem(key)
    if (!raw) return []
    if (raw.length > 1_048_576) throw new Error('Saved cost review receipts need attention. No receipt was replaced.')
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values) || values.length > 1000) throw new Error('Saved cost review receipts need attention. No receipt was replaced.')
    const entries = values.map(parseSavedStudioJob)
    if (new Set(entries.map(entry => entry.receipt.id)).size !== entries.length || entries.some(entry => entry.pointSettlement ? !['held', 'pending-cost'].includes(entry.pointSettlement.state) : entry.fundingSource !== PAID_POINTS_FUNDING)) throw new Error('Saved cost review receipts need attention. No receipt was replaced.')
    return entries
  }
  pendingCostReviews(): SavedStudioJob[] { return this.readCostReviews(this.reviewKey()) }
  private rememberCostReview(saved: SavedStudioJob, job: StudioJob, key: string | null) {
    if ((!job.pointSettlement && !job.pointSettlementUnconfirmed) || !key) return
    // This local index is only a convenience. The authenticated account funding
    // read retains every unresolved hold; cache limits never become job quotas.
    try {
    const entries = this.readCostReviews(key), previous = entries.findIndex(entry => entry.receipt.id === saved.receipt.id)
    if (studioPointsPending(job)) {
      const retained: SavedStudioJob = { ...saved, fundingSource: PAID_POINTS_FUNDING, ...(job.pointSettlement ? { pointSettlement: job.pointSettlement } : {}) }
      this.preserveReceipt(retained)
      if (previous === -1) entries.push(retained); else entries[previous] = retained
    } else if (previous !== -1) entries.splice(previous, 1)
    else return
    const text = JSON.stringify(entries)
    if (entries.length > 1000 || text.length > 1_048_576) throw new Error('Saved cost review storage is full. Keep this receipt before starting another request.')
    this.store.setItem(key, text)
    if (this.store.getItem(key) !== text) throw new Error('The cost review receipt could not be retained. No replacement request was started.')
    } catch { /* Keep the active receipt and authoritative account review listing. */ }
  }
  async recoverCostReview(id: string): Promise<StudioJob> {
    const saved = this.pendingCostReviews().find(entry => entry.receipt.id === id)
    if (!saved) throw new Error('No held-point review receipt is saved for this account and job.')
    return this.poll(saved)
  }
  get current() { return this.saved }
  restore() {
    this.saved = readSavedStudioJob(this.store)
    this.rejectedJob = this.saved?.rejection ? { id: this.saved.receipt.id, ...(this.saved.pricing ? { pricing: this.saved.pricing } : {}), state: 'failed', detail: this.saved.rejectionCode ? STUDIO_FAILURE_DETAILS[this.saved.rejectionCode] : this.saved.rejection, ...(this.saved.rejectionCode ? { failureCode: this.saved.rejectionCode } : {}) } : null
    if (this.rejectedJob && this.saved?.pointSettlement) {
      this.rejectedJob.pointSettlement = this.saved.pointSettlement
      if (studioPointsPending(this.rejectedJob)) this.rejectedJob.detail = studioPendingPointsDetail(this.saved.pointSettlement.heldPoints)
    }
    if (this.rejectedJob && this.saved?.fundingSource === PAID_POINTS_FUNDING && !this.saved.pointSettlement) {
      this.rejectedJob.pointSettlementUnconfirmed = true; this.rejectedJob.detail = studioPendingPointsDetail()
    }
    this.confirmedJob = this.rejectedJob
    return this.saved
  }
  async recoverCurrent(owner = '', signal?: AbortSignal): Promise<{ saved: SavedStudioJob; job: StudioJob } | null> {
    if (this.saved) return { saved: this.saved, job: this.confirmedJob ?? { id: this.saved.receipt.id, state: 'pending', detail: JOB_DETAILS.pending, ...(this.saved.pricing ? { pricing: this.saved.pricing } : {}) } }
    if (this.recovering || this.submitting) throw new Error('Wait for cloud recovery or submission to finish before changing jobs.')
    this.recovering = true
    const reviewKey = this.reviewKey()
    try {
      const recoverySignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000)
      const response = await this.fetcher('/api/studio/current', { headers: accessHeaders(owner), cache: 'no-store', signal: recoverySignal })
      const value = await responseJson(response)
      recoverySignal.throwIfAborted()
      if (!object(value)) throw new Error('The cloud job recovery record is invalid.')
      if (value.current === null) return null
      if (!object(value.current) || typeof value.current.prompt !== 'string' || value.current.prompt.length > 4000 ||
        typeof value.current.startedAt !== 'string' || !Number.isFinite(Date.parse(value.current.startedAt)) ||
        !['reserved','completed','failed'].includes(String(value.current.financialState))) throw new Error('The cloud job recovery record is invalid.')
      const saved: SavedStudioJob = { receipt: readReceipt(value.current.receipt), prompt: value.current.prompt, startedAt: value.current.startedAt,
        ...(isStudioPricing(value.current.pricing) ? { pricing: { ...value.current.pricing } } : {}),
        ...(value.current.fundingSource === PAID_POINTS_FUNDING ? { fundingSource: PAID_POINTS_FUNDING } : {}) }
      if (!saved.pricing && saved.receipt.pricing) saved.pricing = saved.receipt.pricing
      const financial = String(value.current.financialState)
      const job = parseStudioJob({ job: { id: saved.receipt.id, state: financial === 'completed' ? 'succeeded' : financial === 'failed' ? 'failed' : 'pending',
        failureCode: value.current.failureCode, pricing: saved.pricing,
        ...(Object.hasOwn(value.current, 'pointSettlement') ? { pointSettlement: value.current.pointSettlement } : {}) } }, saved.receipt.id, saved.pricing?.points, saved.fundingSource === PAID_POINTS_FUNDING)
      if (job.pointSettlement) saved.pointSettlement = job.pointSettlement
      this.rememberCostReview(saved, job, reviewKey)
      this.store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(saved))
      if (this.store.getItem(STUDIO_RECEIPT_KEY) !== JSON.stringify(saved)) throw new Error('The recovered cloud receipt could not be stored. No new generation was started.')
      if (saved.pricing) job.pricing = saved.pricing
      const generationTiming = financial !== 'reserved' ? readStudioGenerationTiming(value.current.generationTiming) : undefined
      if (generationTiming) job.generationTiming = generationTiming
      this.saved = saved; this.confirmedJob = job; this.rejectedJob = null
      return { saved, job }
    } finally { this.recovering = false }
  }
  async dismissCurrent(owner = '') {
    if (!this.saved) return
    if (this.submitting) throw new Error('Wait for submission to finish before changing jobs.')
    const selected = this.saved
    this.preserveReceipt(selected)
    const response = await this.fetcher('/api/studio/current', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...accessHeaders(owner) },
      body: JSON.stringify({ id: selected.receipt.id }), signal: AbortSignal.timeout(20_000),
    })
    await responseJson(response)
    this.store.removeItem(STUDIO_RECEIPT_KEY)
    this.saved = null; this.confirmedJob = null; this.rejectedJob = null
  }
  private preserveReceipt(saved: SavedStudioJob) {
    let key = STUDIO_RECEIPT_HISTORY_PREFIX + saved.receipt.id
    const text = JSON.stringify(saved)
    let existing = this.store.getItem(key)
    if (existing !== null && existing !== text) {
      const conflict = () => new Error('A different or damaged receipt is already retained for this model. Nothing was overwritten.')
      let original: SavedStudioJob, revision: SavedStudioJob
      try { original = parseSavedStudioJob(JSON.parse(existing)); revision = parseSavedStudioJob(saved) }
      catch { throw conflict() }
      if (original.receipt.ticket === saved.receipt.ticket && original.prompt === saved.prompt && original.startedAt === saved.startedAt && JSON.stringify(original.pricing) === JSON.stringify(saved.pricing) && original.generationProfile === saved.generationProfile) return // The immutable original remains; review metadata is separately indexed.
      const [, originalIssued, originalFingerprint] = receiptParts(original.receipt.ticket)
      const [, issued, fingerprint] = receiptParts(revision.receipt.ticket)
      if (original.receipt.id !== revision.receipt.id || originalFingerprint !== fingerprint || originalIssued === issued || original.receipt.ticket.startsWith('held.') !== revision.receipt.ticket.startsWith('held.')) throw conflict()
      // Cloud recovery re-signs the same account-bound job at a new timestamp.
      // Keep the canonical history immutable and retain each credential revision.
      key += `:${issued}`
      existing = this.store.getItem(key)
      if (existing !== null && existing !== text) throw conflict()
    }
    if (existing === null) this.store.setItem(key, text)
    if (this.store.getItem(key) !== text) throw new Error('The previous receipt could not be retained. No new model was submitted.')
  }
  async start(input: StudioInput, onPrepared: (saved: SavedStudioJob) => void, owner = '', replaceCompleted = false, fundingSource?: typeof PAID_POINTS_FUNDING): Promise<StudioJob> {
    if (fundingSource !== undefined && fundingSource !== PAID_POINTS_FUNDING) throw new Error('The new request funding policy could not be verified.')
    const reviewKey = this.reviewKey()
    if (this.recovering) throw new Error('Wait for cloud recovery to finish before starting a new job.')
    if (this.submitting || (this.saved && (!replaceCompleted || !canSubmitNewDraft(this.saved.receipt.id, this.confirmedJob))))
      throw new Error('A job is already selected. Recover it instead of sending another paid request.')
    this.submitting = true
    const previous = this.saved
    try {
      const snapshot = validateStudioInput(input), body = JSON.stringify(snapshot)
      const prepareBody = JSON.stringify(await prepareStudioInput(snapshot))
      // The previous signed receipt proves existing access for the one approved
      // trial. It stays in a same-origin header, never a URL or a public log.
      const previousHeaders: Record<string, string> = previous ? { 'X-WORLDIFACT-Previous-Job': previous.receipt.ticket } : {}
      const fundingHeaders: Record<string, string> = fundingSource ? { [PAID_POINTS_POLICY_HEADER]: fundingSource } : {}
      const prepared = await this.fetcher('/api/studio/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...accessHeaders(owner), ...previousHeaders, ...fundingHeaders }, body: prepareBody, signal: AbortSignal.timeout(STUDIO_PREPARE_TIMEOUT_MS),
      })
      const receipt = readReceipt(await responseJson(prepared))
      if (receipt.ticket.startsWith('held.') !== (fundingSource === PAID_POINTS_FUNDING)) throw new Error('The prepared receipt did not confirm this request’s funding policy. No model was submitted.')
      if (snapshot.pricingRevision) {
        const expected = studioPricingFor(snapshot)
        if (!receipt.pricing || receipt.pricing.revision !== expected.revision || receipt.pricing.tier !== expected.tier || receipt.pricing.points !== expected.points || receipt.pricing.maxProviderCents !== expected.maxProviderCents)
          throw new Error('The prepared receipt did not confirm your selected model budget and points. No generation was submitted; review availability before trying again.')
      }
      if (previous?.receipt.id === receipt.id) throw new Error('A new model requires a new receipt. The previous model was not changed.')
      const saved: SavedStudioJob = { receipt, prompt: snapshot.prompt, startedAt: new Date().toISOString(),
        ...(fundingSource ? { fundingSource } : {}),
        ...(snapshot.pricingRevision ? { pricing: { ...studioPricingFor(snapshot) } } : {}),
        ...(snapshot.generationProfile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}) }
      if (previous) this.preserveReceipt(previous)
      this.store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(saved))
      if (this.store.getItem(STUDIO_RECEIPT_KEY) !== JSON.stringify(saved)) throw new Error('The browser could not retain your receipt. No paid request was submitted.')
      this.saved = saved; this.confirmedJob = null; this.rejectedJob = null; onPrepared(saved)
      try {
        const result = await this.fetcher('/api/studio/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': receipt.ticket, 'X-WORLDIFACT-Idempotency-Key': receipt.id, ...accessHeaders(owner), ...previousHeaders, ...fundingHeaders },
          body, signal: AbortSignal.timeout(STUDIO_SUBMIT_TIMEOUT_MS),
        })
        const job = parseStudioJob(await responseJson(result), receipt.id, saved.pricing?.points ?? (saved.generationProfile === FAST_DRAFT_PROFILE ? 50 : 250), saved.fundingSource === PAID_POINTS_FUNDING)
        if (!job.pricing && saved.pricing) job.pricing = saved.pricing
        this.rememberCostReview(saved, job, reviewKey)
        this.confirmedJob = job; return job
      } catch (error) {
        // An explicit validation/auth/quota rejection is not uncertain provider
        // acceptance. Keep it terminal so a denied account does not poll forever.
        if (error instanceof StudioResponseError && ([400, 401, 403, 409, 422, 429].includes(error.status) || error.failureCode !== undefined)) {
          if (error.pointSettlement && !isPointSettlement(error.pointSettlement, saved.pricing?.points ?? (saved.generationProfile === FAST_DRAFT_PROFILE ? 50 : 250))) return { id: receipt.id, state: 'pending', detail: 'The point settlement needs review. Recover this same request; no charge or refund is inferred.' }
          if (error.pointSettlement?.state === 'held') return { id: receipt.id, state: 'pending', pointSettlement: error.pointSettlement, detail: 'The points remain held while this request’s result is unconfirmed. Recover the same job; no charge, refund or replacement is inferred.' }
          if (error.pointSettlement?.state === 'charged') return { id: receipt.id, state: 'pending', detail: 'The response and point settlement disagree. Recover the same job; no charge or refund is inferred.' }
          this.rejectedJob = { id: receipt.id, ...(saved.pricing ? { pricing: saved.pricing } : {}), state: 'failed', detail: error.message, ...(error.failureCode ? { failureCode: error.failureCode } : {}), ...(error.pointSettlement ? { pointSettlement: error.pointSettlement } : {}) }
          if (saved.fundingSource === PAID_POINTS_FUNDING && !error.pointSettlement) { this.rejectedJob.pointSettlementUnconfirmed = true; this.rejectedJob.detail = studioPendingPointsDetail() }
          this.confirmedJob = this.rejectedJob
          this.saved = { ...saved, rejection: error.message, ...(error.failureCode ? { rejectionCode: error.failureCode } : {}), ...(error.pointSettlement ? { pointSettlement: error.pointSettlement } : {}) }
          this.rememberCostReview(this.saved, this.rejectedJob, reviewKey)
          try { this.store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(this.saved)) } catch { /* Explicit rejection is still terminal in this tab. */ }
          return this.rejectedJob
        }
        return { id: receipt.id, state: 'pending', detail: JOB_DETAILS.pending, ...(saved.pricing ? { pricing: saved.pricing } : {}) }
      }
    } finally { this.submitting = false }
  }
  async poll(saved = this.saved): Promise<StudioJob> {
    if (!saved) throw new Error('No job receipt is selected.')
    if (this.rejectedJob?.id === saved.receipt.id && !studioPointsPending(this.rejectedJob)) return this.rejectedJob
    const reviewKey = this.reviewKey()
    const response = await this.fetcher(`/api/studio/jobs/${saved.receipt.id}`, {
      headers: { 'X-WORLDIFACT-Job': saved.receipt.ticket }, cache: 'no-store', signal: AbortSignal.timeout(STUDIO_POLL_TIMEOUT_MS),
    })
    try {
      const job = parseStudioJob(await responseJson(response), saved.receipt.id, saved.pricing?.points ?? (saved.generationProfile === FAST_DRAFT_PROFILE ? 50 : 250), saved.fundingSource === PAID_POINTS_FUNDING || !!saved.pointSettlement)
      if (!job.pricing && saved.pricing) job.pricing = saved.pricing
      this.rememberCostReview(saved, job, reviewKey)
      if (this.saved?.receipt.id === job.id) this.confirmedJob = job
      return job
    } catch (error) {
      // A 403 ownership mismatch is different from an invalid signed receipt.
      // Older servers can emit it after an account-ledger row disappears. Stop
      // the endless timer and require same-job reconciliation; never POST again.
      const ownershipMismatch = error instanceof StudioResponseError && error.status === 403 &&
        error.message === 'This model belongs to a different account or has no account receipt.'
      if (ownershipMismatch && this.saved?.receipt.id === saved.receipt.id && !this.submitting) {
        const review: StudioJob = { id: saved.receipt.id, state: 'pending',
          detail: 'This signed job receipt needs account-ledger reconciliation. Recovery is paused on the same job; no new generation or point charge is started.',
          reconciliationRequired: true }
        this.confirmedJob = review
        return review
      }
      // These exact 401 responses reject the recovery credential itself. An
      // expired login, another account, a timeout, 404 or 5xx is NOT equivalent.
      const unusableReceipt = error instanceof StudioResponseError && error.status === 401 &&
        ['The job receipt is not valid.', 'This job receipt expired. Keep your saved model.'].includes(error.message)
      if (!unusableReceipt || this.saved?.receipt.id !== saved.receipt.id || this.submitting) throw error
      // Preserve the complete original before releasing the UI. This is a LOCAL
      // recovery failure, not an assertion that Oracle failed/cancelled the job.
      // No settlement, cancellation, refund, generation POST or signature bypass.
      this.preserveReceipt(saved)
      const rejected: StudioJob = { id: saved.receipt.id, state: 'failed',
        detail: 'The saved job receipt is no longer accepted. Its recovery record was preserved locally. The old model status is unknown; no model was deleted, cancelled or resubmitted. Your draft is kept. You can start a new model explicitly.' }
      this.rejectedJob = rejected; this.confirmedJob = rejected
      return rejected
    }
  }
  async artifact(format: 'model' | 'pbr' | 'fbx' | 'blend', saved = this.saved): Promise<Blob> {
    if (!saved) throw new Error('No job receipt is selected.')
    const path = format === 'model' ? 'model' : `exports/${format}`
    const response = await this.fetcher(`/api/studio/jobs/${saved.receipt.id}/${path}`, {
      headers: { 'X-WORLDIFACT-Job': saved.receipt.ticket }, cache: 'no-store', signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) { await responseJson(response); throw new Error('The artifact is unavailable.') }
    const maximum = format === 'model' ? STUDIO_MODEL_LIMIT : 512 * 1024 * 1024
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared && declared > maximum) { await response.body?.cancel(); throw new Error('This export is too large for this download.') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('The artifact has no content.')
    const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0
    for (;;) {
      const next = await reader.read(); if (next.done) break
      size += next.value.byteLength
      if (size > maximum) { await reader.cancel(); throw new Error('Artifact size limit exceeded.') }
      chunks.push(new Uint8Array(next.value))
    }
    if (!size || (declared && size !== declared)) throw new Error('The artifact download was interrupted. Retry this artifact, not generation.')
    return new Blob(chunks, { type: format === 'model' ? 'model/gltf-binary' : format === 'pbr' ? 'application/zip' : 'application/octet-stream' })
  }
  clearSelection() {
    if (this.submitting) throw new Error('Wait for submission to finish before changing jobs.')
    if (this.saved) this.preserveReceipt(this.saved)
    this.store.removeItem(STUDIO_RECEIPT_KEY); this.saved = null; this.confirmedJob = null; this.rejectedJob = null
  }
}
