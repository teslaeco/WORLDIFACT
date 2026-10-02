import { validateGenerationResult, type GenerationResult } from '../src/lib/blueprint.ts'
import { privateWorldStore } from './privateWorldStore.ts'
import type { BudgetNamespace } from './budget.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { MODEL_ECONOMICS, PLAN_CATALOG, modelAllowed, type PlanId, type GenerationModel } from './generationEconomics.ts'
import { STUDIO_FAILURE_CODES, type StudioFailureCode, type StudioQualityProfile } from '../src/lib/studioProtocol.ts'

export interface EntitlementEnv {
  ACCOUNT_ENTITLEMENTS?: BudgetNamespace
  ENFORCE_ACCOUNT_ENTITLEMENTS?: string
  ACCOUNT_LEDGER_MODE?: string
}
export interface EntitlementStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>): Promise<T>
}
export type GenerationKind = 'fast' | 'slow'
type Usage = { id: string; at: number }
type Subscription = { id: string; until: number; active: boolean; revision: number; plan?: PlanId; grantId?: string; terminal?: boolean }
type Job = { fingerprint?: string; prompt?: string; channel?: 'studio' | 'blueprint'; model?: GenerationModel; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; profile: GenerationKind; at: number; updatedAt?: number; cost: number; kind: 'free' | 'credits'; billingMode?: 'hold-v1'; state: 'reserved' | 'completed' | 'failed' }
export type Reservation = { allowed: boolean; repeated?: boolean; cost?: number; kind?: 'free' | 'credits'; reason?: string; state?: Job['state']; held?: boolean }
export type JobAccess = { owned: boolean; downloadAllowed: boolean; previewOnly: boolean; profile?: GenerationKind; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; state?: Job['state']; at?: number; updatedAt?: number; cost?: number; held?: boolean }
export type CurrentStudioJob = { id: string; fingerprint: string; prompt: string; at: number; updatedAt: number; state: Job['state']; cost: number; held: boolean; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode }
type Grant = { credits: number; revoked: number; subscriptionId?: string }
type Checkout = { id: string; created: number; plan?: PlanId; url?: string; expiresAt?: number; sessionId?: string }
type PayPalCheckout = { id: string; created: number; orderId?: string; url?: string }
export interface EntitlementStatus {
  credits: number
  reservedCredits: number
  availableCredits: number
  generationCost: 50
  generationCosts: { sol: 50; astra: 250; luna?: 15 }
  subscriptionGrant: number
  subscription: { active: boolean; plan: PlanId; expiresAt: string | null }
  free: { fastRemaining: number; fastResetAt: string | null; slowRemaining: number; slowResetAt: string }
  slowDownloadRequiresSubscription: true
  billingReview: boolean
  creatorAstra: { active: boolean; remaining: number; maximum: 6; recommended: 2; pointsForTwo: 500 }
}
export const ACCOUNT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const JOB_ID = ACCOUNT_ID
const DAY = 86_400_000
const CUSTOMER_RESERVED_CREDITS = 'customer-reserved-credits:v1'
const CURRENT_STUDIO_JOB = 'current-studio-job:v1'
const stripeId = /^(?:cus|sub|evt|in|cs|pi|ch)_[A-Za-z0-9_]{1,180}$/
const paypalId = /^[A-Z0-9]{10,40}$/
const grantId = (value: unknown): value is string => typeof value === 'string' && (stripeId.test(value) || /^pp_[A-Z0-9]{10,40}$/.test(value))
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
const active = (subscription: Subscription | undefined, now: number) => !!subscription?.active && subscription.until > now
const validInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value)
export class EntitlementError extends Error {
  status: number
  constructor(message: string, status = 503) { super(message); this.status = status }
}
async function balance(storage: EntitlementStorage) {
  const value = await storage.get<number>('balance') ?? 0
  if (!validInteger(value)) throw new Error('Invalid balance')
  return value
}

async function reservedCredits(storage: EntitlementStorage) {
  const value = await storage.get<number>(CUSTOMER_RESERVED_CREDITS) ?? 0
  if (!validInteger(value) || value < 0) throw new Error('Invalid reserved credits')
  return value
}
async function changeReservedCredits(storage: EntitlementStorage, delta: number) {
  const next = await reservedCredits(storage) + delta
  if (!Number.isSafeInteger(next) || next < 0) throw new Error('Invalid reserved credits')
  await storage.put(CUSTOMER_RESERVED_CREDITS, next)
  return next
}
async function settleReservedJob(storage: EntitlementStorage, id: string, job: Job, next: 'completed' | 'failed', now: number, failureCode?: StudioFailureCode) {
  if (job.state !== 'reserved') return { settled: true, repeated: true }
  if (job.cost) {
    if (job.billingMode === 'hold-v1') {
      await changeReservedCredits(storage, -job.cost)
      if (next === 'completed') await storage.put('balance', await balance(storage) - job.cost)
    } else if (next === 'failed') {
      // Legacy jobs were debited at reservation time; preserve refund semantics.
      await storage.put('balance', await balance(storage) + job.cost)
    }
  } else if (next === 'failed') {
    const free = await usage(storage, now)
    free[job.profile] = free[job.profile].filter(item => item.id !== id)
    await storage.put('usage', free)
  }
  await storage.put(`job:${id}`, { ...job, state: next, updatedAt: now, ...(next === 'failed' && failureCode ? { failureCode } : {}) })
  return { settled: true, repeated: false }
}

// Separate from customer credits: a failed job may refund credits, never API spend.
// Initialize once from remaining legacy credits; all later funding is in the same
// transaction as a verified grant. These cents reserve worst-case provider cost,
// not measured invoices. No restart, date rollover or credit refund replenishes them.
const PROVIDER_BUDGET = 'provider-budget-cents:v1'
async function providerBudget(storage: EntitlementStorage, legacyCredits: number) {
  const stored = await storage.get<number>(PROVIDER_BUDGET)
  if (stored !== undefined) {
    if (!Number.isSafeInteger(stored)) throw new Error('Invalid provider budget')
    return stored
  }
  const initial = Math.floor(Math.max(0, legacyCredits) * 7 / 10)
  if (!Number.isSafeInteger(initial)) throw new Error('Invalid provider budget')
  await storage.put(PROVIDER_BUDGET, initial)
  return initial
}
async function changeProviderBudget(storage: EntitlementStorage, legacyCredits: number, deltaCents: number) {
  const next = await providerBudget(storage, legacyCredits) + deltaCents
  if (!Number.isSafeInteger(next)) throw new Error('Invalid provider budget')
  await storage.put(PROVIDER_BUDGET, next)
}
async function usage(storage: EntitlementStorage, now: number) {
  const value = await storage.get<{ fast: Usage[]; slow: Usage[] }>('usage') ?? { fast: [], slow: [] }
  return {
    fast: value.fast.filter(item => item.at > now - DAY),
    slow: value.slow.filter(item => Math.floor(item.at / DAY) === Math.floor(now / DAY)),
  }
}
async function status(storage: EntitlementStorage, now: number, astraEnabled = false): Promise<EntitlementStatus> {
  const [credits, reserved, free, subscription, billingHold] = await Promise.all([balance(storage), reservedCredits(storage), usage(storage, now), storage.get<Subscription>('subscription'), storage.get<boolean>('billingHold')])
  const plan: PlanId = subscription?.plan ?? 'creator'
  const period = subscription?.grantId ?? `${subscription?.id ?? 'none'}:${subscription?.until ?? 0}`
  const used = await storage.get<number>(`creator-astra:${period}`) ?? 0
  if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid Astra period quota')
  return {
    creatorAstra: { active: astraEnabled && active(subscription, now), remaining: Math.max(0, 6 - used), maximum: 6, recommended: 2, pointsForTwo: 500 },
    credits, reservedCredits: reserved, availableCredits: credits - reserved, generationCost: 50, generationCosts: { sol: 50, astra: 250, luna: 15 }, subscriptionGrant: PLAN_CATALOG[plan].credits,
    subscription: { active: active(subscription, now), plan, expiresAt: subscription?.until ? new Date(subscription.until).toISOString() : null },
    free: { fastRemaining: Math.max(0, 2 - free.fast.length), fastResetAt: free.fast.length ? new Date(Math.min(...free.fast.map(item => item.at)) + DAY).toISOString() : null,
      slowRemaining: 0, slowResetAt: new Date((Math.floor(now / DAY) + 1) * DAY).toISOString() },
    slowDownloadRequiresSubscription: true, billingReview: credits < 0 || billingHold === true,
  }
}

/** One internal Durable Object per verified existing Chess account UUID. No passwords or identity database. */
export class AccountEntitlements {
  private storage: EntitlementStorage
  private now: () => number
  private astraEnabled: boolean
  constructor(state: { storage: EntitlementStorage }, env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now; this.astraEnabled = !!env && typeof env === 'object' && (env as { ENABLE_ASTRA_PLANS?: string }).ENABLE_ASTRA_PLANS === 'true' }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname, now = this.now()
    try {
      if (path === '/private-worlds' && request.method === 'POST') return privateWorldStore(request, this.storage, now)
      if (path === '/status' && request.method === 'GET') return json(await this.storage.transaction(storage => status(storage, now, this.astraEnabled)))
      if (path === '/billing' && request.method === 'GET') return json({ customer: await this.storage.get<string>('customer') ?? null })
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
      const raw = await request.text()
      if (raw.length > (path === '/blueprint-complete' ? 120_000 : 8192)) return json({ error: 'Invalid internal request' }, 400)
      const input = JSON.parse(raw) as Record<string, unknown>
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid internal request' }, 400)
      if (path === '/blueprint-status' || path === '/blueprint-complete') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid blueprint identifier' }, 400)
        const id = input.id
        let result: GenerationResult | undefined
        if (path === '/blueprint-complete') {
          result = validateGenerationResult(input.result)
          if (result.mode !== 'LIVE' || !result.evidence || !result.delivery || result.requestId !== id) return json({ error: 'Missing verified blueprint evidence' }, 400)
        }
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job?.fingerprint) return { state: 'unknown', owned: false }
          // A stopped synchronous Worker cannot leave customer points reserved forever.
          // Completion and timeout reconciliation race in this same atomic transaction.
          if (job.state === 'reserved' && now - job.at > 10 * 60_000) {
            await settleReservedJob(storage, id, job, 'failed', now)
            return { state: 'failed', refunded: true }
          }
          if (result && job.state === 'reserved') {
            const expected = job.model === 'luna' ? 'gpt-6-luna' : job.profile === 'slow' ? 'gpt-6-astra' : 'gpt-6-sol'
            if (result.model !== expected) return { state: job.state, saved: false }
            await storage.put(`blueprint-result:${id}`, result)
            await settleReservedJob(storage, id, job, 'completed', now)
            return { state: 'completed', saved: true, result }
          }
          return { state: job.state, refunded: job.state === 'failed', ...(job.state === 'completed' ? { result: await storage.get<GenerationResult>(`blueprint-result:${id}`) } : {}) }
        }))
      }
      if (path === '/studio-current') {
        const pointer = await this.storage.get<{ id: string }>(CURRENT_STUDIO_JOB)
        if (!pointer?.id || !JOB_ID.test(pointer.id)) return json({ job: null })
        const job = await this.storage.get<Job>(`job:${pointer.id}`)
        if (!job || job.channel !== 'studio' || !job.fingerprint || !/^[a-f0-9]{64}$/.test(job.fingerprint)) return json({ job: null })
        return json({ job: { id: pointer.id, fingerprint: job.fingerprint, prompt: job.prompt ?? 'Recovered cloud model', at: job.at,
          updatedAt: job.updatedAt ?? job.at, state: job.state, cost: job.cost, held: job.billingMode === 'hold-v1' && job.state === 'reserved',
          ...(job.qualityProfile ? { qualityProfile: job.qualityProfile } : {}), ...(job.failureCode ? { failureCode: job.failureCode } : {}) } satisfies CurrentStudioJob })
      }
      if (path === '/studio-current-clear') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid job' }, 400)
        return json(await this.storage.transaction(async storage => {
          const pointer = await storage.get<{ id: string }>(CURRENT_STUDIO_JOB)
          if (!pointer || pointer.id !== input.id) return { cleared: false }
          await storage.put(CURRENT_STUDIO_JOB, { id: '' })
          return { cleared: true }
        }))
      }
      if (path === '/reserve') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id) || !['fast', 'slow'].includes(String(input.profile))) return json({ error: 'Invalid generation' }, 400)
        if (input.fingerprint !== undefined && (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))) return json({ error: 'Invalid request fingerprint' }, 400)
        const fingerprint = input.fingerprint as string | undefined
        const channel = input.channel === undefined ? 'blueprint' : String(input.channel)
        if (!['blueprint','studio'].includes(channel)) return json({ error: 'Invalid generation channel' }, 400)
        const prompt = input.prompt === undefined ? undefined : String(input.prompt)
        if (prompt !== undefined && (prompt.length < 3 || prompt.length > 4000)) return json({ error: 'Invalid generation prompt' }, 400)
        const qualityProfile = input.qualityProfile === undefined ? 'standard' : String(input.qualityProfile)
        if (!['standard','industrial-electrical-cabinet-v1','reference-character-v1'].includes(qualityProfile)) return json({ error: 'Invalid generation quality profile' }, 400)
        const id = input.id, profile = input.profile as GenerationKind
        const requestedModel = input.model ?? (profile === 'fast' ? 'sol' : 'astra')
        if (!['luna', 'sol', 'astra'].includes(String(requestedModel)) || (profile === 'slow') !== (requestedModel === 'astra')) return json({ error: 'Invalid model for generation route' }, 400)
        const selectedModel = requestedModel as GenerationModel
        const result = await this.storage.transaction(async storage => {
          const existing = await storage.get<Job>(`job:${id}`)
          if (existing && existing.fingerprint !== fingerprint) return { allowed: false, repeated: true, reason: 'REQUEST_PAYLOAD_MISMATCH' }
          if (existing && existing.profile === profile && (existing.model ?? (existing.profile === 'fast' ? 'sol' : 'astra')) !== selectedModel) return { allowed: false, reason: 'JOB_MODEL_MISMATCH' }
          if (existing && (existing.qualityProfile ?? 'standard') !== qualityProfile) return { allowed: false, reason: 'JOB_QUALITY_PROFILE_MISMATCH' }
          if (existing && (existing.channel ?? 'blueprint') !== channel) return { allowed: false, reason: 'JOB_CHANNEL_MISMATCH' }
          if (existing) return existing.profile !== profile
            ? { allowed: false, reason: 'JOB_PROFILE_MISMATCH' }
            : { allowed: existing.state !== 'failed', repeated: true, state: existing.state, cost: existing.cost, kind: existing.kind, ...(existing.state === 'failed' ? { reason: 'JOB_ALREADY_FAILED' } : {}) }
          const credits = await balance(storage), heldCredits = await reservedCredits(storage), subscription = await storage.get<Subscription>('subscription')
          if (credits < 0 || await storage.get<boolean>('billingHold') === true) return { allowed: false, reason: 'BILLING_REVIEW_REQUIRED' }
          const subscriptionActive = active(subscription, now)
          const plan: PlanId = subscriptionActive ? subscription?.plan ?? 'creator' : 'creator'
          const model = selectedModel
          const cost = MODEL_ECONOMICS[model].creditsPerGeneration
          if (model === 'astra' && (!subscriptionActive || !modelAllowed(plan, 'astra'))) return { allowed: false, reason: 'ASTRA_PLAN_REQUIRED' }
          const creatorAstra = model === 'astra' && plan === 'creator'
          const period = subscription?.grantId ?? `${subscription?.id ?? 'none'}:${subscription?.until ?? 0}`
          const used = creatorAstra ? await storage.get<number>(`creator-astra:${period}`) ?? 0 : 0
          if (creatorAstra && !this.astraEnabled) return { allowed: false, reason: 'ASTRA_PLAN_REQUIRED' }
          if (creatorAstra && (!Number.isSafeInteger(used) || used < 0 || used >= 6)) return { allowed: false, reason: 'CREATOR_ASTRA_PERIOD_LIMIT' }
          const paid = subscriptionActive || credits > 0
          if (paid && credits - heldCredits < cost) return { allowed: false, reason: 'CREDITS_EXHAUSTED' }
          const free = await usage(storage, now)
          if (!paid && profile === 'slow') return { allowed: false, reason: 'FREE_SOL_ONLY' }
          if (!paid && free.fast.length >= 2) return { allowed: false, reason: 'FAST_DAILY_LIMIT' }
          if (paid) {
            const remaining = await providerBudget(storage, credits)
            const ceiling = MODEL_ECONOMICS[model].maxProviderCents
            if (remaining < ceiling) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
            await storage.put(PROVIDER_BUDGET, remaining - ceiling)
          }
          const cloudHold = paid && channel === 'studio'
          const job: Job = { ...(fingerprint ? { fingerprint } : {}), ...(prompt ? { prompt } : {}), channel: channel as 'studio' | 'blueprint', ...(model === 'luna' ? { model } : {}), ...(qualityProfile !== 'standard' ? { qualityProfile: qualityProfile as StudioQualityProfile } : {}), profile, at: now, updatedAt: now, cost: paid ? cost : 0, kind: paid ? 'credits' : 'free', ...(cloudHold ? { billingMode: 'hold-v1' as const } : {}), state: 'reserved' }
          if (cloudHold) await changeReservedCredits(storage, cost)
          else if (paid) await storage.put('balance', credits - cost)
          else { free.fast.push({ id, at: now }); await storage.put('usage', free) }
          if (creatorAstra) await storage.put(`creator-astra:${period}`, used + 1)
          await storage.put(`job:${id}`, job)
          if (channel === 'studio') await storage.put(CURRENT_STUDIO_JOB, { id })
          return { allowed: true, repeated: false, cost: job.cost, kind: job.kind, held: cloudHold }
        })
        return json(result, result.allowed ? 200 : 429)
      }
      if (path === '/settle' || path === '/job') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid job' }, 400)
        const id = input.id
        if (path === '/job') {
          const job = await this.storage.get<Job>(`job:${id}`)
          if (!job) return json({ owned: false, downloadAllowed: false, previewOnly: false })
          const subscription = await this.storage.get<Subscription>('subscription')
          const allowed = job.state === 'completed' && (job.profile === 'fast' || active(subscription, now)) && await balance(this.storage) >= 0 && await this.storage.get<boolean>('billingHold') !== true
          return json({ owned: true, downloadAllowed: allowed, previewOnly: job.profile === 'slow' && !active(subscription, now), profile: job.profile, ...(job.qualityProfile ? { qualityProfile: job.qualityProfile } : {}), ...(job.failureCode ? { failureCode: job.failureCode } : {}), state: job.state, at: job.at, updatedAt: job.updatedAt ?? job.at, cost: job.cost, held: job.billingMode === 'hold-v1' && job.state === 'reserved' })
        }
        if (!['completed', 'failed'].includes(String(input.state))) return json({ error: 'Invalid settlement' }, 400)
        const next = input.state as 'completed' | 'failed'
        if (input.failureCode !== undefined && (next !== 'failed' || !STUDIO_FAILURE_CODES.includes(input.failureCode as StudioFailureCode))) return json({ error: 'Invalid failure diagnostic' }, 400)
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { settled: false, reason: 'NOT_OWNED' }
          // Terminal results are immutable. Transport uncertainty MUST NOT call /settle failed.
          return settleReservedJob(storage, id, job, next, now, input.failureCode as StudioFailureCode | undefined)
        }))
      }
      if (path === '/customer') {
        if (typeof input.customer !== 'string' || !/^cus_[A-Za-z0-9]{1,180}$/.test(input.customer)) return json({ error: 'Invalid customer' }, 400)
        const customer = input.customer
        return json(await this.storage.transaction(async storage => {
          const existing = await storage.get<string>('customer')
          if (existing && existing !== customer) return { saved: false }
          await storage.put('customer', customer); return { saved: true }
        }))
      }
      if (path === '/grant') {
        if (!grantId(input.id) || !validInteger(input.credits) || (input.credits as number) < 1 || (input.credits as number) > 1_000_000) return json({ error: 'Invalid grant' }, 400)
        const id = input.id, credits = input.credits as number
        return json(await this.storage.transaction(async storage => {
          const prior = await storage.get<Grant>(`grant:${id}`)
          // A reversal received before its original grant is a tombstone, never a new credit grant.
          if (prior) return { granted: false, repeated: true, revoked: prior.revoked > 0 }
          const previousBalance = await balance(storage)
          const next = previousBalance + credits
          if (!Number.isSafeInteger(next)) throw new Error('Invalid balance')
          await changeProviderBudget(storage, previousBalance, Math.floor(credits * 7 / 10))
          await storage.put('balance', next)
          await storage.put(`grant:${id}`, { credits, revoked: 0, ...(typeof input.subscriptionId === 'string' ? { subscriptionId: input.subscriptionId } : {}) })
          return { granted: true, repeated: false, revoked: false }
        }))
      }
      if (path === '/revoke') {
        if (!grantId(input.id) || !validInteger(input.credits) || (input.credits as number) < 1 || (input.credits as number) > 1_000_000) return json({ error: 'Invalid reversal' }, 400)
        const id = input.id, credits = input.credits as number
        return json(await this.storage.transaction(async storage => {
          const grant = await storage.get<Grant>(`grant:${id}`)
          if (input.review === true) await storage.put('billingHold', true)
          if (!grant) { await storage.put(`grant:${id}`, { credits: 0, revoked: credits }); return { revoked: true, repeated: false } }
          const target = Math.min(grant.credits, credits), difference = Math.max(0, target - grant.revoked)
          if (!difference) return { revoked: false, repeated: true }
          const previousBalance = await balance(storage)
          await changeProviderBudget(storage, previousBalance, -Math.ceil(difference * 7 / 10))
          await storage.put('balance', previousBalance - difference)
          await storage.put(`grant:${id}`, { ...grant, revoked: target })
          if (grant.subscriptionId) {
            const subscription = await storage.get<Subscription>('subscription')
            if (subscription?.id === grant.subscriptionId && subscription.grantId === id) await storage.put('subscription', { ...subscription, active: false })
          }
          return { revoked: true, repeated: false }
        }))
      }
      if (path === '/subscription') {
        if (typeof input.id !== 'string' || !/^sub_[A-Za-z0-9]{1,180}$/.test(input.id) || !validInteger(input.until) || (input.until as number) < 0 || !validInteger(input.revision) || typeof input.active !== 'boolean') return json({ error: 'Invalid subscription' }, 400)
        const plan: PlanId = ['creator', 'pro', 'studio'].includes(String(input.plan)) ? input.plan as PlanId : 'creator'
        const next: Subscription = { id: input.id, until: input.until as number, active: input.active, revision: input.revision as number, plan, terminal: input.terminal === true, ...(typeof input.grantId === 'string' ? { grantId: input.grantId } : {}) }
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Subscription>('subscription')
          if (previous && previous.id !== next.id && !next.active) return { updated: false }
          if (next.active) {
            const grant = typeof input.grantId === 'string' ? await storage.get<Grant>(`grant:${input.grantId}`) : undefined
            if (!grant || grant.credits < 1 || grant.revoked > 0) return { updated: false }
          }
          // Stripe events have second precision. Pending -> paid can share a timestamp;
          // only a terminal cancellation (or a separately revoked grant) blocks activation.
          if (previous && (previous.revision > next.revision || (previous.id === next.id && previous.terminal && !next.terminal))) return { updated: false }
          await storage.put('subscription', next); return { updated: true }
        }))
      }
      if (path === '/paypal-reserve') {
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          // Do not rotate an uncertain create/capture attempt just because time passed.
          // PayPal's idempotency window is shorter than our ownership record lifetime.
          if (previous) return { ...previous, repeated: true }
          const value: PayPalCheckout = { id: crypto.randomUUID(), created: now }
          await storage.put('paypal:checkout', value)
          return { ...value, repeated: false }
        }))
      }
      if (path === '/paypal-order') {
        if (typeof input.id !== 'string' || !ACCOUNT_ID.test(input.id) || typeof input.orderId !== 'string' || !paypalId.test(input.orderId) || typeof input.url !== 'string') return json({ error: 'Invalid PayPal order' }, 400)
        const url = new URL(input.url)
        if (url.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== '/checkoutnow' || url.searchParams.get('token') !== input.orderId) return json({ error: 'Invalid PayPal checkout address' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          if (!previous || previous.id !== input.id || (previous.orderId && previous.orderId !== input.orderId)) return { saved: false }
          const historical = await storage.get<{ id: string }>(`paypal:order:${input.orderId}`)
          if (historical && historical.id !== input.id) return { saved: false }
          await storage.put(`paypal:order:${input.orderId}`, { id: input.id })
          await storage.put('paypal:checkout', { ...previous, orderId: input.orderId, url: input.url })
          return { saved: true }
        }))
      }
      if (path === '/paypal-get') {
        if (typeof input.orderId !== 'string' || !paypalId.test(input.orderId)) return json({ error: 'Invalid PayPal order' }, 400)
        const owned = await this.storage.get<{ id: string }>(`paypal:order:${input.orderId}`)
        return json(owned ? { owned: true, id: owned.id } : { owned: false })
      }
      if (path === '/paypal-clear') {
        if (typeof input.id !== 'string' || !ACCOUNT_ID.test(input.id)) return json({ error: 'Invalid PayPal checkout' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          if (!previous || previous.id !== input.id) return { cleared: false }
          await storage.put('paypal:checkout', null)
          return { cleared: true }
        }))
      }
      if (path === '/checkout-reserve') {
        if (!['subscription', 'topup'].includes(String(input.kind))) return json({ error: 'Invalid checkout' }, 400)
        const kind = input.kind as string
        const plan: PlanId | undefined = kind === 'subscription' ? (['creator', 'pro', 'studio'].includes(String(input.plan)) ? input.plan as PlanId : 'creator') : undefined
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${kind}`)
          const previousPlan = previous?.plan ?? (kind === 'subscription' ? 'creator' : undefined)
          if (previous && previousPlan === plan && (previous.expiresAt ?? previous.created + DAY) > now) return { ...previous, ...(previousPlan ? { plan: previousPlan } : {}), repeated: true }
          const value: Checkout = { id: crypto.randomUUID(), created: now, ...(plan ? { plan } : {}) }
          await storage.put(`checkout:${kind}`, value)
          return { ...value, repeated: false }
        }))
      }
      if (path === '/checkout-finish') {
        if (!['subscription', 'topup'].includes(String(input.kind)) || typeof input.id !== 'string' || typeof input.url !== 'string' || !/^https:\/\/checkout\.stripe\.com\//.test(input.url) || !validInteger(input.expiresAt) || (input.expiresAt as number) <= now || typeof input.sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{1,180}$/.test(input.sessionId)) return json({ error: 'Invalid checkout' }, 400)
        const plan: PlanId | undefined = input.kind === 'subscription' ? (['creator', 'pro', 'studio'].includes(String(input.plan)) ? input.plan as PlanId : 'creator') : undefined
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${input.kind}`)
          const previousPlan = previous?.plan ?? (input.kind === 'subscription' ? 'creator' : undefined)
          if (!previous || previous.id !== input.id || previousPlan !== plan) return { saved: false }
          await storage.put(`checkout:${input.kind}`, { ...previous, url: input.url, expiresAt: input.expiresAt, sessionId: input.sessionId }); return { saved: true }
        }))
      }
      if (path === '/checkout-clear') {
        if (!['subscription', 'topup'].includes(String(input.kind)) || typeof input.id !== 'string') return json({ error: 'Invalid checkout' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${input.kind}`)
          if (!previous || previous.id !== input.id) return { cleared: false }
          await storage.put(`checkout:${input.kind}`, { ...previous, created: 0, expiresAt: 0 }); return { cleared: true }
        }))
      }
      return json({ error: 'Not found' }, 404)
    } catch { return json({ error: 'Account allowance unavailable' }, 503) }
  }
}

/** This helper is server-only. Never accept a uid from a request parameter or body. */
export async function entitlementCall<T>(env: EntitlementEnv, userId: string, path: string, body?: unknown): Promise<T> {
  if (!ACCOUNT_ID.test(userId)) throw new EntitlementError('A verified account is required.', 401)
  if (!env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('Account allowances are not configured.')
  if (env.ACCOUNT_LEDGER_MODE !== undefined && !['sandbox', 'live'].includes(env.ACCOUNT_LEDGER_MODE)) throw new EntitlementError('Account ledger mode is invalid.')
  // Sandbox balances, customers, captures and subscriptions can never become live
  // simply by switching provider API credentials. Preserve existing live IDs.
  const prefix = env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${prefix}:${userId.toLowerCase()}`))
  let response: Response
  try { response = await object.fetch(new Request(`https://entitlements.internal${path}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })) }
  catch { throw new EntitlementError('Account allowances are temporarily unavailable.') }
  if (!response.ok && !(path === '/reserve' && response.status === 429)) throw new EntitlementError('Account allowances are temporarily unavailable.')
  return response.json() as Promise<T>
}
export const entitlementStatus = (env: EntitlementEnv, userId: string) => entitlementCall<EntitlementStatus>(env, userId, '/status')
export const reserveUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, profile: GenerationKind, model?: GenerationModel, fingerprint?: string, qualityProfile?: StudioQualityProfile, metadata?: { channel?: 'studio' | 'blueprint'; prompt?: string }) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile, ...(model ? { model } : {}), ...(fingerprint ? { fingerprint } : {}), ...(qualityProfile && qualityProfile !== 'standard' ? { qualityProfile } : {}), ...(metadata?.channel ? { channel: metadata.channel } : {}), ...(metadata?.prompt ? { prompt: metadata.prompt } : {}) })
export const settleUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, state: 'completed' | 'failed', failureCode?: StudioFailureCode) => entitlementCall<{ settled: boolean; repeated?: boolean }>(env, userId, '/settle', { id: jobId, state, ...(failureCode ? { failureCode } : {}) })
export const userJobAccess = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<JobAccess>(env, userId, '/job', { id: jobId })
export const currentUserStudioJob = (env: EntitlementEnv, userId: string) => entitlementCall<{ job: CurrentStudioJob | null }>(env, userId, '/studio-current', {})
export const clearCurrentUserStudioJob = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<{ cleared: boolean }>(env, userId, '/studio-current-clear', { id: jobId })
export async function entitlementApi(request: Request, env: AccountEnv & EntitlementEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/account/entitlements') return null
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your allowance.' }, 401)
    return json(await entitlementStatus(env, user.id))
  } catch (error) { return json({ error: error instanceof EntitlementError ? error.message : 'Account allowances are unavailable.' }, error instanceof EntitlementError ? error.status : 503) }
}
