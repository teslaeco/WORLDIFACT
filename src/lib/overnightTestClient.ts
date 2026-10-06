import { BlueprintClient, type BlueprintRecovery } from './blueprintClient.ts'
import type { GenerationResult } from './blueprint.ts'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, type ReceiptStore } from './studioClient.ts'
import type { StudioJob } from './studioProtocol.ts'
import { inspectGLB } from './glb.ts'
import { isOvernightTestDiagnostic, OvernightTestStatusError, type OvernightTestDiagnostic } from './overnightTestDiagnostics.ts'

export const OVERNIGHT_PANEL_EXPIRES = '2026-10-06T12:00:00.000Z'
const approval = 'api-tests-20261006-044444-usd4'
export const OVERNIGHT_PANEL_SLOTS = Object.freeze([
  { id: 'astra-1', label: 'Detailed Astra · attempt 1', workflow: 'detailed-astra', capCents: 175, points: 250 },
  { id: 'astra-2', label: 'Detailed Astra · attempt 2', workflow: 'detailed-astra', capCents: 175, points: 250 },
  { id: 'sol', label: 'GPT-6.1 Sol blueprint', workflow: 'blueprint-sol', capCents: 35, points: 50 },
  { id: 'luna', label: 'GPT-6 Luna blueprint', workflow: 'blueprint-luna', capCents: 10, points: 15 },
] as const)
export type OvernightPanelSlot = typeof OVERNIGHT_PANEL_SLOTS[number]['id']
type Workflow = typeof OVERNIGHT_PANEL_SLOTS[number]['workflow']
export type OvernightPanelStatus = { available: boolean; approvalId: string; expiresAt: string; totalCents: 400; committedCents: number; remainingCents: number; attempts: Record<Workflow, number>; noRecycling: true }
export type OvernightPanelRow = { slot: OvernightPanelSlot; id?: string; state: 'empty' | 'pending' | 'completed' | 'failed'; detail: string; job?: StudioJob; result?: GenerationResult; startedAt?: number }
type SlotClient = { studio?: StudioCoordinator; blueprint?: BlueprintClient; job?: StudioJob; result?: GenerationResult }
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key))
const workflowLimits = { 'detailed-astra': 2, 'blueprint-sol': 1, 'blueprint-luna': 1 }

export function readOvernightPanelStatus(value: unknown): OvernightPanelStatus {
  const invalid = () => new Error('The temporary test allowance could not be verified. No new test was started.')
  if (!object(value) || !exact(value, ['available', 'approvalId', 'expiresAt', 'totalCents', 'committedCents', 'remainingCents', 'attempts', 'noRecycling']) ||
      typeof value.available !== 'boolean' || value.approvalId !== approval || value.expiresAt !== OVERNIGHT_PANEL_EXPIRES || value.totalCents !== 400 || value.noRecycling !== true ||
      !object(value.attempts) || !exact(value.attempts, Object.keys(workflowLimits))) throw invalid()
  const counts = value.attempts
  for (const workflow of Object.keys(workflowLimits) as Workflow[])
    if (!Number.isSafeInteger(counts[workflow]) || Number(counts[workflow]) < 0 || Number(counts[workflow]) > workflowLimits[workflow]) throw invalid()
  const total = Number(counts['detailed-astra']) * 175 + Number(counts['blueprint-sol']) * 35 + Number(counts['blueprint-luna']) * 10
  if (value.committedCents !== total || value.remainingCents !== 400 - total || value.available && total === 395) throw invalid()
  return value as OvernightPanelStatus
}

/** Visible operator controls reuse the app's HttpOnly same-origin cookies.
 * No access token is read, stored, exposed or accepted by this controller. */
export class OvernightTestClient {
  private clients = new Map<OvernightPanelSlot, SlotClient>()
  private busy = false
  private storage: ReceiptStore
  private fetcher: typeof fetch
  private accountId: string
  private active: () => boolean
  private now: () => number
  constructor(storage: ReceiptStore, fetcher: typeof fetch, accountId: string, active: () => boolean, now: () => number = Date.now) {
    if (!uuid.test(accountId)) throw new Error('Sign in to the approved account to view temporary tests.')
    this.storage = storage; this.fetcher = fetcher.bind(globalThis); this.accountId = accountId; this.active = active; this.now = now
  }
  private assertActive() { if (!this.active()) throw new Error('The account changed. Reopen this panel in the original account; no replacement was started.') }
  private assertWindow() {
    const now = this.now()
    if (!Number.isSafeInteger(now) || now < Date.parse('2026-10-06T04:44:44.000Z') || now >= Date.parse(OVERNIGHT_PANEL_EXPIRES))
      throw new Error('The temporary test window is closed. Existing requests can still be recovered.')
  }
  private slot(slot: OvernightPanelSlot) {
    const value = OVERNIGHT_PANEL_SLOTS.find(item => item.id === slot)
    if (!value) throw new Error('Unknown temporary test workflow.')
    return value
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    this.assertActive()
    const response = await this.fetcher(path, { ...init, credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
    this.assertActive()
    if (response.redirected) throw new Error('The test request was redirected. Recover the same request; no replacement was started.')
    return response
  }
  private client(slot: OvernightPanelSlot): SlotClient {
    this.assertActive(); this.slot(slot)
    const previous = this.clients.get(slot)
    if (previous) return previous
    const prefix = `worldifact:overnight-tests:v1:${approval}:${this.accountId}:${slot}:`
    const store: ReceiptStore = {
      getItem: key => { this.assertActive(); return this.storage.getItem(prefix + key) },
      setItem: (key, value) => {
        this.assertActive()
        const old = this.storage.getItem(prefix + key)
        if (old !== null) {
          const original = JSON.parse(old), next = JSON.parse(value)
          const originalId = key === STUDIO_RECEIPT_KEY ? original.receipt?.id : original.id
          const nextId = key === STUDIO_RECEIPT_KEY ? next.receipt?.id : next.id
          if (!originalId || originalId !== nextId) throw new Error('Another receipt already occupies this test slot. Recover it; no replacement was started.')
        }
        this.storage.setItem(prefix + key, value)
        if (this.storage.getItem(prefix + key) !== value) throw new Error('The test receipt could not be retained. No replacement was started.')
      },
      removeItem: () => { throw new Error('Temporary test receipts cannot be reset.') },
    }
    const fetcher: typeof fetch = (input, init = {}) => {
      this.assertActive()
      if (typeof input !== 'string') throw new Error('Unsupported test request.')
      const method = (init.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        this.assertWindow()
        const target = slot.startsWith('astra-')
          ? ({ '/api/studio/prepare': '/api/overnight-tests/studio/prepare', '/api/studio/jobs': '/api/overnight-tests/studio/jobs' } as Record<string, string>)[input]
          : input === '/api/blueprint' ? '/api/overnight-tests/blueprint' : undefined
        if (!target) throw new Error('Unsupported test submission. Ordinary funding is never used by this panel.')
        return this.request(target, init)
      }
      const allowed = slot.startsWith('astra-')
        ? /^\/api\/studio\/jobs\/[a-f0-9-]{36}(?:\/model)?$/.test(input)
        : /^\/api\/blueprint\/requests\/[a-f0-9-]{36}$/.test(input)
      if (method !== 'GET' || !allowed) throw new Error('Unsupported test recovery request.')
      return this.request(input, init)
    }
    const client: SlotClient = slot.startsWith('astra-') ? { studio: new StudioCoordinator(store, fetcher) } : { blueprint: new BlueprintClient(store, fetcher) }
    client.studio?.restore()
    this.clients.set(slot, client)
    return client
  }
  async status(): Promise<OvernightPanelStatus> {
    let diagnostic: OvernightTestDiagnostic = 'TEST_STATUS_TRANSPORT_FAILED'
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await this.request('/api/overnight-tests/status', { method: 'GET', signal: AbortSignal.timeout(40_000) })
      diagnostic = response.status === 401 ? 'TEST_SIGN_IN_REQUIRED' : response.status === 429 ? 'TEST_STATUS_RATE_LIMITED' : 'TEST_STATUS_RESPONSE_INVALID'
      if (!response.headers.get('content-type')?.includes('application/json') || !response.body) throw new OvernightTestStatusError(diagnostic)
      reader = response.body.getReader()
      const decoder = new TextDecoder(); let size = 0, text = ''
      for (;;) {
        const next = await reader.read(); this.assertActive()
        if (next.done) break
        size += next.value.byteLength
        if (size > 8192) throw new OvernightTestStatusError('TEST_STATUS_RESPONSE_INVALID')
        text += decoder.decode(next.value, { stream: true })
      }
      this.assertActive()
      const value: unknown = JSON.parse(text + decoder.decode())
      if (!response.ok) throw new OvernightTestStatusError(object(value) && isOvernightTestDiagnostic(value.diagnostic) ? value.diagnostic : diagnostic)
      return readOvernightPanelStatus(value)
    } catch (error) {
      await reader?.cancel().catch(() => {})
      throw error instanceof OvernightTestStatusError ? error : new OvernightTestStatusError(diagnostic)
    }
  }
  rows(): OvernightPanelRow[] {
    return OVERNIGHT_PANEL_SLOTS.map(({ id: slot }) => {
      const client = this.client(slot)
      if (client.studio) {
        const saved = client.studio.restore()
        if (!saved) return { slot, state: 'empty', detail: 'No request has been prepared in this test slot.' }
        if (client.job && client.job.id !== saved.receipt.id) client.job = undefined
        const job = client.job ?? (saved.rejection ? { id: saved.receipt.id, state: 'failed' as const, detail: 'This request was refused. Its original receipt is retained.', ...(saved.rejectionCode ? { failureCode: saved.rejectionCode } : {}) } : { id: saved.receipt.id, state: 'pending' as const, detail: 'Recover this same request to verify its current state.' })
        return { slot, id: saved.receipt.id, state: job.state === 'succeeded' ? 'completed' : ['failed', 'cancelled'].includes(job.state) ? 'failed' : 'pending', detail: job.detail, job, startedAt: Date.parse(saved.startedAt) }
      }
      const saved: BlueprintRecovery | null = client.blueprint!.current()
      return saved ? { slot, id: saved.id, state: saved.state, startedAt: saved.createdAt, ...(client.result ? { result: client.result } : {}),
        detail: saved.state === 'completed' ? 'Provider result confirmed. Recover the same request to reopen its model.' : saved.state === 'failed' ? 'This attempt is finished. Its saved admission or failure record is retained; no replacement will be submitted.' : 'Acceptance or completion is not yet confirmed. Recover this same request.' }
        : { slot, state: 'empty', detail: 'No request has been prepared in this test slot.' }
    })
  }
  private async locked<T>(action: () => Promise<T>, allocation = false): Promise<T> {
    this.assertActive()
    if (this.busy) throw new Error('A test operation is already in progress. No second request was started.')
    this.busy = true
    try {
      if (!allocation) return await action()
      const locks = globalThis.navigator?.locks
      if (!locks?.request) throw new Error('This browser cannot safely coordinate test starts across tabs. No paid request was submitted.')
      // No queue: a second click in another tab is a refusal, never a deferred
      // paid action. Hold the origin/account/run lock until submission finishes.
      return await locks.request(`worldifact:${approval}:${this.accountId}:allocation`, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is starting a test. Recover its receipt before trying another paid action.')
        this.assertActive()
        return action()
      })
    } finally { this.busy = false }
  }
  start(slot: OvernightPanelSlot, prompt: string): Promise<OvernightPanelRow> {
    return this.locked(async () => {
      const terms = this.slot(slot)
      this.assertWindow()
      if (typeof prompt !== 'string' || prompt.trim().length < 3 || prompt.length > 2000) throw new Error('Enter a description between 3 and 2000 characters.')
      const before = this.rows()
      if (before.some(row => row.slot === slot && row.state !== 'empty') || before.some(row => row.state === 'pending')) throw new Error('Recover existing requests first. This panel never replaces a saved test receipt.')
      const status = await this.status()
      this.assertActive(); this.assertWindow()
      if (!status.available || status.attempts[terms.workflow] >= workflowLimits[terms.workflow] || status.remainingCents < terms.capCents) throw new Error('This temporary workflow has no remaining test allowance.')
      if (this.rows().some(row => row.slot === slot && row.state !== 'empty' || row.state === 'pending')) throw new Error('Another request was saved while checking the test allowance. Recover it first.')
      const client = this.client(slot)
      if (client.studio) client.job = await client.studio.start({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), purpose: 'object', textureMaxSize: 4096, photos: [] }, () => {})
      else client.result = await client.blueprint!.submit({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), model: slot, mode: 'live', deliverable: 'procedural-blueprint' }, AbortSignal.timeout(180_000))
      this.assertActive()
      return this.rows().find(row => row.slot === slot)!
    }, true)
  }
  recover(slot: OvernightPanelSlot): Promise<OvernightPanelRow> {
    return this.locked(async () => {
      const client = this.client(slot)
      if (client.studio) client.job = await client.studio.poll()
      else client.result = await client.blueprint!.recover()
      this.assertActive()
      return this.rows().find(row => row.slot === slot)!
    })
  }
  download(slot: OvernightPanelSlot): Promise<Blob> {
    return this.locked(async () => {
      const client = this.client(slot)
      if (!client.studio || client.job?.state !== 'succeeded' || client.job.downloadAllowed !== true) throw new Error('Recover this same successful, downloadable detailed job before requesting its model.')
      const blob = await client.studio.artifact('model')
      this.assertActive(); inspectGLB(await blob.arrayBuffer()); this.assertActive()
      return blob
    })
  }
}
