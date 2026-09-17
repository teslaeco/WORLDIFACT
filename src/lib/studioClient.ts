import { JOB_DETAILS, STUDIO_MODEL_LIMIT, FAST_DRAFT_PROFILE, generationProfile, type StudioInput, type StudioReceipt, type StudioJob, type StudioStatus } from './studioProtocol.ts'
import { canSubmitNewDraft } from './studioDraft.ts'

export const STUDIO_RECEIPT_KEY = 'worldifact-studio-current-v1'
export const STUDIO_RECEIPT_HISTORY_PREFIX = 'worldifact-studio-receipt-v1:'
export type SavedStudioJob = { receipt: StudioReceipt; prompt: string; startedAt: string; generationProfile?: typeof FAST_DRAFT_PROFILE }
export type ReceiptStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Fetcher = typeof fetch
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function readReceipt(value: unknown): StudioReceipt {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.ticket !== 'string' ||
    !new RegExp(`^${value.id}\\.[0-9]{13}\\.[a-f0-9]{64}\\.[a-f0-9]{64}$`).test(value.ticket) ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid job receipt. No generation was submitted.')
  return { id: value.id, ticket: value.ticket, createdAt: value.createdAt }
}
export function readSavedStudioJob(store: ReceiptStore): SavedStudioJob | null {
  const text = store.getItem(STUDIO_RECEIPT_KEY)
  if (!text) return null
  const value: unknown = JSON.parse(text)
  if (!object(value) || typeof value.prompt !== 'string' || value.prompt.length > 4000 || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) throw new Error('The saved job receipt is damaged. Do not submit a duplicate job.')
  const profile = generationProfile(value.generationProfile)
  return { receipt: readReceipt(value.receipt), prompt: value.prompt, startedAt: value.startedAt,
    ...(profile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}) }
}
export function parseStudioJob(value: unknown, id: string): StudioJob {
  if (!object(value) || !object(value.job) || value.job.id !== id || typeof value.job.state !== 'string' || !Object.hasOwn(JOB_DETAILS, value.job.state)) throw new Error('The response does not belong to the current model. The previous model will not be substituted.')
  const state = value.job.state as StudioJob['state']
  return { id, state, detail: JOB_DETAILS[state] }
}
async function responseJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server did not return JSON. Your model was not replaced.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The server response is empty.')
  let text = '', count = 0
  const decoder = new TextDecoder()
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    count += next.value.byteLength
    if (count > 32_768) { await reader.cancel(); throw new Error('The status response is too large.') }
    text += decoder.decode(next.value, { stream: true })
  }
  const value: unknown = JSON.parse(text + decoder.decode())
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error.slice(0, 600) : `Request failed (${response.status}).`)
  return value
}
const accessHeaders = (owner: string): Record<string, string> => owner ? { 'X-WORLDIFACT-Owner': owner } : {}
export async function checkStudio(fetcher: Fetcher = fetch, owner = ''): Promise<StudioStatus> {
  const response = await fetcher('/api/studio/status', { headers: accessHeaders(owner), cache: 'no-store', signal: AbortSignal.timeout(40_000) })
  const value = await responseJson(response)
  if (!object(value) || typeof value.ready !== 'boolean' || typeof value.reason !== 'string' || typeof value.photoReady !== 'boolean' || typeof value.oracle !== 'string') throw new Error('The Studio status could not be verified.')
  return { ...value, fastReady: value.fastReady === true } as unknown as StudioStatus
}

/** The selected receipt belongs to one submitted job, not the editable form.
 * A later job requires an explicit start with a confirmed terminal selection.
 */
export class StudioCoordinator {
  private saved: SavedStudioJob | null = null
  private confirmedJob: StudioJob | null = null
  private submitting = false
  private store: ReceiptStore
  private fetcher: Fetcher
  constructor(store: ReceiptStore, fetcher: Fetcher = fetch) {
    this.store = store
    this.fetcher = fetcher.bind(globalThis)
  }
  get current() { return this.saved }
  restore() { this.saved = readSavedStudioJob(this.store); this.confirmedJob = null; return this.saved }
  private preserveReceipt(saved: SavedStudioJob) {
    const key = STUDIO_RECEIPT_HISTORY_PREFIX + saved.receipt.id, text = JSON.stringify(saved)
    const existing = this.store.getItem(key)
    if (existing !== null && existing !== text) throw new Error('A different receipt is already retained for this model. Nothing was overwritten.')
    if (existing === null) this.store.setItem(key, text)
    if (this.store.getItem(key) !== text) throw new Error('The previous receipt could not be retained. No new model was submitted.')
  }
  async start(input: StudioInput, onPrepared: (saved: SavedStudioJob) => void, owner = '', replaceCompleted = false): Promise<StudioJob> {
    if (this.submitting || (this.saved && (!replaceCompleted || !canSubmitNewDraft(this.saved.receipt.id, this.confirmedJob))))
      throw new Error('A job is already selected. Recover it instead of sending another paid request.')
    this.submitting = true
    const previous = this.saved
    // Capture once before awaiting: later draft edits cannot change this intent.
    const body = JSON.stringify(input), snapshot = JSON.parse(body) as StudioInput
    try {
      const prepared = await this.fetcher('/api/studio/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...accessHeaders(owner) }, body, signal: AbortSignal.timeout(45_000),
      })
      const receipt = readReceipt(await responseJson(prepared))
      if (previous?.receipt.id === receipt.id) throw new Error('A new model requires a new receipt. The previous model was not changed.')
      const saved: SavedStudioJob = { receipt, prompt: snapshot.prompt, startedAt: new Date().toISOString(),
        ...(snapshot.generationProfile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}) }
      if (previous) this.preserveReceipt(previous)
      this.store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(saved))
      if (this.store.getItem(STUDIO_RECEIPT_KEY) !== JSON.stringify(saved)) throw new Error('The browser could not retain your receipt. No paid request was submitted.')
      this.saved = saved; this.confirmedJob = null
      onPrepared(saved)
      try {
        const result = await this.fetcher('/api/studio/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': receipt.ticket, ...accessHeaders(owner) },
          body, signal: AbortSignal.timeout(45_000),
        })
        const job = parseStudioJob(await responseJson(result), receipt.id)
        this.confirmedJob = job
        return job
      } catch {
        return { id: receipt.id, state: 'pending', detail: JOB_DETAILS.pending }
      }
    } finally { this.submitting = false }
  }
  async poll(saved = this.saved): Promise<StudioJob> {
    if (!saved) throw new Error('No job receipt is selected.')
    const response = await this.fetcher(`/api/studio/jobs/${saved.receipt.id}`, {
      headers: { 'X-WORLDIFACT-Job': saved.receipt.ticket }, cache: 'no-store', signal: AbortSignal.timeout(40_000),
    })
    const job = parseStudioJob(await responseJson(response), saved.receipt.id)
    if (this.saved?.receipt.id === job.id) this.confirmedJob = job
    return job
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
      const next = await reader.read()
      if (next.done) break
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
    this.store.removeItem(STUDIO_RECEIPT_KEY)
    this.saved = null; this.confirmedJob = null
  }
}
