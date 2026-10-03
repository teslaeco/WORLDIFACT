import { validateGenerationResult, type GenerationResult } from '../src/lib/blueprint.ts'
import { privateWorldStore } from './privateWorldStore.ts'
import type { BudgetNamespace } from './budget.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { MODEL_ECONOMICS, PLAN_CATALOG, modelAllowed, type PlanId, type GenerationModel } from './generationEconomics.ts'
import { STUDIO_FAILURE_CODES, STUDIO_SUBMISSION_GRACE_MS, type StudioFailureCode, type StudioQualityProfile } from '../src/lib/studioProtocol.ts'
import type { AdmissionFailureCode } from '../src/lib/generationAdmission.ts'
import { STUDIO_PRICING, isStudioPricing, type StudioPricing, type StudioBudgetTier } from '../src/lib/studioPricing.ts'
import { astraSupportApproval, ASTRA_SUPPORT_ONCE_KEY, ASTRA_SUPPORT_NAMESPACE, ASTRA_SUPPORT_CENTS, type AstraSupportApproval, type AstraSupportClaim, type AstraSupportIdentity } from './astraSupportOnce.ts'
import { astraSupplementalGrant, matchesAstraSupplementalClaim, ASTRA_SUPPLEMENTAL_KEY, ASTRA_SUPPLEMENTAL_NAMESPACE, ASTRA_SUPPLEMENTAL_CENTS, type AstraSupplementalGrant, type AstraSupplementalClaim } from './astraSupplementalGrant.ts'
import { validateTerminalBudgetReceipt, type TerminalBudgetReceipt } from './studioBudgetReceipt.ts'

export interface EntitlementEnv {
  ACCOUNT_ENTITLEMENTS?: BudgetNamespace
  ENFORCE_ACCOUNT_ENTITLEMENTS?: string
  ACCOUNT_LEDGER_MODE?: string
  WORLDIFACT_ASTRA_SUPPORT_ONCE?: string
  WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT?: string
}
export interface EntitlementStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  list?<T>(options: { prefix: string; startAfter?: string; limit: number }): Promise<Map<string, T>>
  transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>): Promise<T>
}
export type GenerationKind = 'fast' | 'slow'
type Usage = { id: string; at: number }
type Subscription = { id: string; until: number; active: boolean; revision: number; plan?: PlanId; grantId?: string; terminal?: boolean }
type StudioProviderReservation = { version: 1; source: 'ordinary'; amountCents: number; state: 'reserved' | 'released' }
type StudioProviderReconciliation = { receipt: TerminalBudgetReceipt; originalReservedCents: 175 | 200 | 400; retainedCents: number; releasedCents: number; at: number }
type Job = { pricing?: StudioPricing; fingerprint?: string; prompt?: string; channel?: 'studio' | 'blueprint'; model?: GenerationModel; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; supportApprovalId?: string; supplementalGrantId?: string; profile: GenerationKind; at: number; updatedAt?: number; cost: number; kind: 'free' | 'credits'; billingMode?: 'hold-v1'; state: 'reserved' | 'completed' | 'failed'; studioDispatch?: 'ready-v1' | 'claimed-v1'; studioDispatchUntil?: number; studioProviderReservation?: StudioProviderReservation; studioProviderReconciliation?: StudioProviderReconciliation; blueprintDispatch?: 'ready-v1' | 'claimed-v1'; blueprintDispatchUntil?: number; blueprintProviderReservation?: StudioProviderReservation }
export type Reservation = { pricing?: StudioPricing; allowed: boolean; repeated?: boolean; cost?: number; kind?: 'free' | 'credits'; reason?: string; state?: Job['state']; held?: boolean; supportEligible?: boolean; supplementalEligible?: boolean }
export type JobAccess = { fingerprint?: string; pricing?: StudioPricing; owned: boolean; downloadAllowed: boolean; previewOnly: boolean; profile?: GenerationKind; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; state?: Job['state']; at?: number; updatedAt?: number; cost?: number; held?: boolean; studioDispatchUntil?: number; providerBudgetPending?: true }
export type StudioProviderReconciliationPage = { ids: string[]; nextCursor: string | null; hasMore: boolean }
export type StudioProviderReconciliationResult = { reconciled: boolean; repeated?: boolean; releasedCents?: number; retainedCents?: number; reason?: string }
type StudioDispatchClaim = { dispatch: false } | { dispatch: true; deadline: number }
export const STUDIO_DISPATCH_WINDOW_MS = 30_000
export const STUDIO_ORACLE_TIMEOUT_MS = 25_000
export const BLUEPRINT_DISPATCH_WINDOW_MS = 30_000
const BLUEPRINT_JOB_WINDOW_MS = 10 * 60_000
export type CurrentStudioJob = { pricing?: StudioPricing; id: string; fingerprint: string; prompt: string; at: number; updatedAt: number; state: Job['state']; cost: number; held: boolean; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode }
export type ClosedMissingStudioJob = { closed: boolean; state: Job['state']; fingerprintMatches: boolean; failureCode?: StudioFailureCode }
type Grant = { credits: number; revoked: number; subscriptionId?: string }
type Checkout = { id: string; created: number; plan?: PlanId; url?: string; expiresAt?: number; sessionId?: string }
type PayPalCheckout = { id: string; created: number; orderId?: string; url?: string }
export interface EntitlementStatus {
  generationAdmission: Record<GenerationModel, { allowed: boolean; reason?: AdmissionFailureCode }>
  studioAdmission: { allowed: boolean; reason?: AdmissionFailureCode; tiers: Record<StudioBudgetTier, { allowed: boolean; reason?: AdmissionFailureCode; pricing: StudioPricing }> }
  astraSupportOnce?: { available: boolean; consumed: boolean; maximumProviderCents: 175 }
  astraSupplementalGrant?: { available: boolean; consumed: boolean; maximumProviderCents: 175 }
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
function studioDispatchUntil(job: Job): number | undefined {
  return job.studioDispatch === 'claimed-v1' && Number.isSafeInteger(job.studioDispatchUntil) && Number(job.studioDispatchUntil) > job.at && Number(job.studioDispatchUntil) <= job.at + STUDIO_SUBMISSION_GRACE_MS ? job.studioDispatchUntil : undefined
}
function reservationTerms(job: Job): { points: number; maxProviderCents: number } | null {
  if (!Object.hasOwn(job, 'pricing')) {
    const economics = MODEL_ECONOMICS[job.model ?? (job.profile === 'fast' ? 'sol' : 'astra')]
    return economics ? { points: economics.creditsPerGeneration, maxProviderCents: economics.maxProviderCents } : null
  }
  return isStudioPricing(job.pricing) && job.channel === 'studio' && job.profile === 'slow' &&
    (job.model === undefined || job.model === 'astra') ? job.pricing : null
}
function samePricing(left: StudioPricing | undefined, right: StudioPricing | undefined): boolean {
  return left === undefined && right === undefined || isStudioPricing(left) && isStudioPricing(right) &&
    left.revision === right.revision && left.tier === right.tier && left.points === right.points && left.maxProviderCents === right.maxProviderCents
}
function terminalOrdinaryAstraReservation(job: Job): boolean {
  const terms = reservationTerms(job)
  if (!terms) return false
  if (!['failed', 'completed'].includes(job.state) || job.channel !== 'studio' || job.profile !== 'slow' ||
      (job.model !== undefined && job.model !== 'astra') || job.kind !== 'credits' || job.billingMode !== 'hold-v1' || job.cost !== terms.points ||
      typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint) || !Number.isSafeInteger(job.at) || job.at <= 0 ||
      !Number.isSafeInteger(job.updatedAt) || Number(job.updatedAt) < job.at || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId')) return false
  if (Object.hasOwn(job, 'studioDispatch') && job.studioDispatch !== 'ready-v1' && job.studioDispatch !== 'claimed-v1') return false
  if (job.studioDispatch === 'claimed-v1' ? studioDispatchUntil(job) === undefined : Object.hasOwn(job, 'studioDispatchUntil')) return false
  if (!Object.hasOwn(job, 'studioProviderReservation')) {
    if (Object.hasOwn(job, 'pricing')) return false
    // The historical hold-v1 Studio writer (8a38d1f) was introduced after the
    // provider ledger (73ff4e7). Its ordinary paid Astra admission atomically
    // debited exactly 175 cents before writing this 250-point held job. Support
    // writers always recorded their distinct IDs and are excluded above.
    // Older credit-debit jobs, free tombstones and incomplete rows are excluded.
    const historicalFields = ['fingerprint', 'prompt', 'channel', 'model', 'qualityProfile', 'failureCode', 'profile', 'at', 'updatedAt',
      'cost', 'kind', 'billingMode', 'state', 'studioDispatch', 'studioDispatchUntil', 'studioProviderReconciliation']
    return Object.keys(job).every(key => historicalFields.includes(key))
  }
  const reservation = job.studioProviderReservation
  return !!reservation && typeof reservation === 'object' && !Array.isArray(reservation) && Object.keys(reservation).length === 4 &&
    reservation.version === 1 && reservation.source === 'ordinary' && reservation.amountCents === terms.maxProviderCents && reservation.state === 'reserved'
}
function providerBudgetPending(job: Job): boolean {
  return !Object.hasOwn(job, 'studioProviderReconciliation') && terminalOrdinaryAstraReservation(job)
}
function validProviderReconciliation(value: unknown, id: string, job: Job): value is StudioProviderReconciliation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const saved = value as StudioProviderReconciliation
  return Object.keys(saved).length === 5 && validateTerminalBudgetReceipt(saved.receipt, id, job.pricing ?? null) && saved.originalReservedCents === reservationTerms(job)?.maxProviderCents &&
    saved.retainedCents === Math.ceil(saved.receipt.maximumLiabilityMicroUsd / 10_000) && saved.releasedCents === saved.originalReservedCents - saved.retainedCents &&
    Number.isSafeInteger(saved.at) && saved.at > 0
}
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
  let providerReservation = job.studioProviderReservation
  const economics = reservationTerms(job)
  if (next === 'failed' && job.channel === 'studio' && job.kind === 'credits' && job.billingMode === 'hold-v1' &&
      job.studioDispatch === 'ready-v1' && job.studioDispatchUntil === undefined && job.supportApprovalId === undefined && job.supplementalGrantId === undefined &&
      typeof job.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(job.fingerprint) && economics && job.cost === economics.points &&
      providerReservation && typeof providerReservation === 'object' && !Array.isArray(providerReservation) && Object.keys(providerReservation).length === 4 &&
      providerReservation.version === 1 && providerReservation.source === 'ordinary' && providerReservation.state === 'reserved' && providerReservation.amountCents === economics.maxProviderCents) {
    // Only new ordinary-funded reservations carry this proof of the debit.
    // Settlement and dispatch claim share this transaction: ready-v1 proves no
    // Oracle POST was permitted, and the terminal row fences every later claim.
    // Never infer unused funding from failure, a 404, legacy rows or support.
    const remaining = await storage.get<number>(PROVIDER_BUDGET)
    if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(Number(remaining) + providerReservation.amountCents)) throw new Error('Invalid provider reservation release')
    await storage.put(PROVIDER_BUDGET, Number(remaining) + providerReservation.amountCents)
    providerReservation = { ...providerReservation, state: 'released' }
  }
  let blueprintReservation = job.blueprintProviderReservation
  if (next === 'failed' && job.channel === 'blueprint' && job.kind === 'credits' && job.billingMode === undefined &&
      job.blueprintDispatch === 'ready-v1' && job.blueprintDispatchUntil === undefined && !Object.hasOwn(job, 'pricing') &&
      job.supportApprovalId === undefined && job.supplementalGrantId === undefined &&
      typeof job.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(job.fingerprint) && economics && job.cost === economics.points &&
      blueprintReservation && typeof blueprintReservation === 'object' && !Array.isArray(blueprintReservation) && Object.keys(blueprintReservation).length === 4 &&
      blueprintReservation.version === 1 && blueprintReservation.source === 'ordinary' && blueprintReservation.state === 'reserved' && blueprintReservation.amountCents === economics.maxProviderCents) {
    // New writer evidence only: no paid /responses call can occur before this
    // same transaction grants one-use dispatch. A failed ready row fences any
    // delayed caller; an uncertain claimed call keeps its full provider debit.
    const remaining = await storage.get<number>(PROVIDER_BUDGET)
    if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(Number(remaining) + blueprintReservation.amountCents)) throw new Error('Invalid blueprint reservation release')
    await storage.put(PROVIDER_BUDGET, Number(remaining) + blueprintReservation.amountCents)
    blueprintReservation = { ...blueprintReservation, state: 'released' }
  }
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
  await storage.put(`job:${id}`, { ...job, ...(providerReservation ? { studioProviderReservation: providerReservation } : {}), ...(blueprintReservation ? { blueprintProviderReservation: blueprintReservation } : {}), state: next, updatedAt: now, ...(next === 'failed' && failureCode ? { failureCode } : {}) })
  return { settled: true, repeated: false }
}

// Separate from customer credits: a failed job may refund credits, never API spend.
// Initialize once from remaining legacy credits; all later funding is in the same
// transaction as a verified grant. These cents reserve worst-case provider cost,
// not measured invoices. No restart, date rollover or credit refund replenishes them.
// Provably unspent funding can be released by a fenced pre-dispatch failure or
// by an immutable authenticated terminal Oracle receipt. Unknown spend is held.
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
async function status(storage: EntitlementStorage, now: number, astraEnabled = false, support: AstraSupportApproval | null = null, globalAvailable = false, globalConsumed = false,
  supplemental: AstraSupplementalGrant | null = null, supplementalGlobalAvailable = false, supplementalGlobalConsumed = false, originalSupportConfigured = support !== null): Promise<EntitlementStatus> {
  const [credits, reserved, free, subscription, billingHold] = await Promise.all([balance(storage), reservedCredits(storage), usage(storage, now), storage.get<Subscription>('subscription'), storage.get<boolean>('billingHold')])
  const plan: PlanId = subscription?.plan ?? 'creator'
  const period = subscription?.grantId ?? `${subscription?.id ?? 'none'}:${subscription?.until ?? 0}`
  const used = await storage.get<number>(`creator-astra:${period}`) ?? 0
  if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid Astra period quota')
  // Read-only projection of the same admission order as /reserve. Never seed,
  // replenish or reveal the internal provider ledger while reading an account.
  const storedProviderBudget = await storage.get<number>(PROVIDER_BUDGET)
  const providerRemaining = storedProviderBudget === undefined ? Math.floor(Math.max(0, credits) * 7 / 10) : storedProviderBudget
  const supportConsumed = support ? globalConsumed || await storage.get(ASTRA_SUPPORT_ONCE_KEY) !== undefined : false
  const supportAvailable = !!support && globalAvailable && !supportConsumed && Number.isSafeInteger(providerRemaining) && providerRemaining >= 0
  // Match reserve's conservative precedence even if the original global claim
  // is unavailable: an unresolved original account grant cannot spend this one.
  let supplementalConsumed = false, supplementalAvailable = false
  if (supplemental) {
    try {
      const originalPending = originalSupportConfigured && await storage.get(ASTRA_SUPPORT_ONCE_KEY) === undefined
      supplementalConsumed = supplementalGlobalConsumed || await storage.get(ASTRA_SUPPLEMENTAL_KEY) !== undefined
      supplementalAvailable = supplementalGlobalAvailable && !supplementalConsumed && !originalPending && Number.isSafeInteger(providerRemaining) && providerRemaining >= 0
    } catch { supplemental = null } // Optional grant lookups never hide ordinary admission.
  }
  const subscriptionActive = active(subscription, now)
  const admission = (model: GenerationModel, detailed = false, pricing?: StudioPricing): { allowed: boolean; reason?: AdmissionFailureCode } => {
    const blocked = (reason: AdmissionFailureCode) => ({ allowed: false, reason })
    if (credits < 0 || billingHold === true) return blocked('BILLING_REVIEW_REQUIRED')
    if (model === 'astra' && (!subscriptionActive || !modelAllowed(plan, 'astra') || (plan === 'creator' && !astraEnabled))) return blocked('ASTRA_PLAN_REQUIRED')
    if (model === 'astra' && plan === 'creator' && used >= 6) return blocked('CREATOR_ASTRA_PERIOD_LIMIT')
    const paid = subscriptionActive || credits > 0
    if (paid && credits - reserved < (pricing?.points ?? MODEL_ECONOMICS[model].creditsPerGeneration)) return blocked('CREDITS_EXHAUSTED')
    if (!paid && model === 'astra') return blocked('FREE_SOL_ONLY')
    if (!paid && free.fast.length >= 2) return blocked('FAST_DAILY_LIMIT')
    if (paid && !Number.isSafeInteger(providerRemaining)) return blocked('ACCOUNT_ADMISSION_UNAVAILABLE')
    if (paid && providerRemaining < (pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents) && !(model === 'astra' && detailed && !pricing && (supportAvailable || supplementalAvailable))) return blocked('PROVIDER_BUDGET_EXHAUSTED')
    return { allowed: true }
  }
  return {
    generationAdmission: { luna: admission('luna'), sol: admission('sol'), astra: admission('astra') },
    studioAdmission: { ...admission('astra', true), tiers: {
      standard: { ...admission('astra', true, STUDIO_PRICING.standard), pricing: STUDIO_PRICING.standard },
      extended: { ...admission('astra', true, STUDIO_PRICING.extended), pricing: STUDIO_PRICING.extended },
    } },
    ...(support ? { astraSupportOnce: { available: supportAvailable && admission('astra', true).allowed, consumed: supportConsumed, maximumProviderCents: ASTRA_SUPPORT_CENTS } } : {}),
    ...(supplemental ? { astraSupplementalGrant: { available: supplementalAvailable && admission('astra', true).allowed, consumed: supplementalConsumed, maximumProviderCents: ASTRA_SUPPLEMENTAL_CENTS } } : {}),
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
  private supportEnv: EntitlementEnv
  constructor(state: { storage: EntitlementStorage }, env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now; this.astraEnabled = !!env && typeof env === 'object' && (env as { ENABLE_ASTRA_PLANS?: string }).ENABLE_ASTRA_PLANS === 'true'; this.supportEnv = env && typeof env === 'object' ? env as EntitlementEnv : {} }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname, now = this.now()
    try {
      const support = () => astraSupportApproval(this.supportEnv.WORLDIFACT_ASTRA_SUPPORT_ONCE, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now(), request.headers.get('X-WORLDIFACT-Verified-Email'))
      const supplemental = () => astraSupplementalGrant(this.supportEnv.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now(), request.headers.get('X-WORLDIFACT-Verified-Email'))
      if (path === '/astra-support-status' && request.method === 'GET') {
        const approved = support(), consumed = approved ? await this.storage.get(ASTRA_SUPPORT_ONCE_KEY) !== undefined : false
        return json({ available: !!approved && !consumed, consumed })
      }
      if (path === '/astra-supplemental-status' && request.method === 'GET') {
        const approved = supplemental(), consumed = approved ? await this.storage.get(ASTRA_SUPPLEMENTAL_KEY) !== undefined : false
        return json({ available: !!approved && !consumed, consumed })
      }
      if (path === '/private-worlds' && request.method === 'POST') return privateWorldStore(request, this.storage, now)
      if (path === '/status' && request.method === 'GET') return json(await this.storage.transaction(storage => status(storage, now, this.astraEnabled,
        request.headers.get('X-WORLDIFACT-Support-Status') === 'known' ? support() : null,
        request.headers.get('X-WORLDIFACT-Support-Available') === 'true', request.headers.get('X-WORLDIFACT-Support-Consumed') === 'true',
        request.headers.get('X-WORLDIFACT-Supplemental-Status') === 'known' ? supplemental() : null,
        request.headers.get('X-WORLDIFACT-Supplemental-Available') === 'true', request.headers.get('X-WORLDIFACT-Supplemental-Consumed') === 'true', !!support())))
      if (path === '/billing' && request.method === 'GET') return json({ customer: await this.storage.get<string>('customer') ?? null })
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
      const raw = await request.text()
      if (raw.length > (path === '/blueprint-complete' ? 120_000 : 8192)) return json({ error: 'Invalid internal request' }, 400)
      const input = JSON.parse(raw) as Record<string, unknown>
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid internal request' }, 400)
      if (path === '/astra-supplemental-claim') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) || typeof input.id !== 'string' || !JOB_ID.test(input.id) ||
          typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return json({ approved: false }, 400)
        const id = input.id, fingerprint = input.fingerprint
        return json(await this.storage.transaction(async storage => {
          const existing = await storage.get(ASTRA_SUPPLEMENTAL_KEY)
          const approved = supplemental(), claimedAt = this.now()
          if (!approved) return { approved: false }
          if (existing !== undefined) return matchesAstraSupplementalClaim(existing, approved, claimedAt, id, fingerprint)
            ? { approved: true, claim: existing } : { approved: false }
          const claim: AstraSupplementalClaim = { ...approved, jobId: id, fingerprint, at: claimedAt }
          if (!matchesAstraSupplementalClaim(claim, approved, claimedAt, id, fingerprint)) return { approved: false }
          await storage.put(ASTRA_SUPPLEMENTAL_KEY, claim)
          return { approved: true, claim }
        }))
      }
      if (path === '/astra-support-claim') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id','fingerprint'].includes(key)) || typeof input.id !== 'string' || !JOB_ID.test(input.id) ||
          typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return json({ approved: false }, 400)
        return json(await this.storage.transaction(async storage => {
          const approved = support()
          if (!approved) return { approved: false }
          const existing = await storage.get<AstraSupportClaim & { accountId: string; issuedAt: string; expiresAt: string }>(ASTRA_SUPPORT_ONCE_KEY)
          if (existing !== undefined) {
            const matches = !!existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length === 9 &&
              Object.keys(existing).every(key => ['version','accountId','approvalId','amountCents','jobId','fingerprint','at','issuedAt','expiresAt'].includes(key)) &&
              existing.version === 1 && existing.amountCents === ASTRA_SUPPORT_CENTS && existing.accountId === approved.accountId &&
              existing.approvalId === approved.approvalId && existing.jobId === input.id && existing.fingerprint === input.fingerprint &&
              existing.issuedAt === approved.issuedAt && existing.expiresAt === approved.expiresAt && Number.isSafeInteger(existing.at) &&
              existing.at >= Date.parse(approved.issuedAt) && existing.at < Date.parse(approved.expiresAt) && existing.at <= this.now()
            return { approved: matches, ...(matches ? { approvalId: approved.approvalId } : {}) }
          }
          await storage.put(ASTRA_SUPPORT_ONCE_KEY, { version: 1, accountId: approved.accountId, approvalId: approved.approvalId, amountCents: ASTRA_SUPPORT_CENTS,
            jobId: input.id, fingerprint: input.fingerprint, at: this.now(), issuedAt: approved.issuedAt, expiresAt: approved.expiresAt })
          return { approved: true, approvalId: approved.approvalId }
        }))
      }
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
          updatedAt: job.updatedAt ?? job.at, state: job.state, cost: job.cost, ...(job.pricing ? { pricing: job.pricing } : {}), held: job.billingMode === 'hold-v1' && job.state === 'reserved',
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
      if (path === '/studio-close-missing') {
        if (Object.keys(input).some(key => !['id', 'fingerprint', 'issued'].includes(key)) ||
            typeof input.id !== 'string' || !JOB_ID.test(input.id) || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
            !Number.isSafeInteger(input.issued) || Number(input.issued) <= 0)
          return json({ error: 'Invalid missing submission' }, 400)
        const id = input.id, fingerprint = input.fingerprint, issued = Number(input.issued)
        return json(await this.storage.transaction(async storage => {
          const existing = await storage.get<Job>(`job:${id}`)
          if (existing) return { closed: false, state: existing.state, fingerprintMatches: existing.fingerprint === fingerprint,
            ...(existing.failureCode ? { failureCode: existing.failureCode } : {}) } satisfies ClosedMissingStudioJob
          // Read the clock inside the transaction, after any queued reservation.
          const closedAt = this.now()
          if (closedAt - issued < STUDIO_SUBMISSION_GRACE_MS) throw new Error('Submission recovery window has not elapsed')
          const tombstone: Job = { fingerprint, channel: 'studio', profile: 'slow', at: issued, updatedAt: closedAt,
            cost: 0, kind: 'free', state: 'failed', failureCode: 'MISSING_SUBMISSION' }
          await storage.put(`job:${id}`, tombstone)
          // No hold, charge, refund, provider-budget change or current-pointer
          // replacement. This only fences the exact signed absent submission.
          return { closed: true, state: 'failed', fingerprintMatches: true, failureCode: 'MISSING_SUBMISSION' } satisfies ClosedMissingStudioJob
        }))
      }
      if (path === '/blueprint-dispatch') {
        if (Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) ||
            typeof input.id !== 'string' || !JOB_ID.test(input.id) || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))
          return json({ error: 'Invalid Blueprint dispatch commitment' }, 400)
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${input.id}`)
          if (!job || job.channel !== 'blueprint' || job.fingerprint !== input.fingerprint || job.state !== 'reserved' || job.blueprintDispatch !== 'ready-v1') return { dispatch: false }
          const claimedAt = this.now()
          if (!Number.isSafeInteger(job.at) || claimedAt < job.at || claimedAt >= job.at + BLUEPRINT_JOB_WINDOW_MS) return { dispatch: false }
          const deadline = Math.min(claimedAt + BLUEPRINT_DISPATCH_WINDOW_MS, job.at + BLUEPRINT_JOB_WINDOW_MS)
          await storage.put(`job:${input.id}`, { ...job, blueprintDispatch: 'claimed-v1', blueprintDispatchUntil: deadline })
          return { dispatch: true, deadline }
        }))
      }
      if (path === '/studio-dispatch') {
        if (Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) ||
            typeof input.id !== 'string' || !JOB_ID.test(input.id) || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))
          return json({ error: 'Invalid Studio dispatch commitment' }, 400)
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${input.id}`)
          if (!job || job.channel !== 'studio' || job.fingerprint !== input.fingerprint || job.state !== 'reserved' || job.studioDispatch !== 'ready-v1') return { dispatch: false }
          const claimedAt = this.now()
          if (!Number.isSafeInteger(job.at) || claimedAt < job.at || claimedAt >= job.at + STUDIO_SUBMISSION_GRACE_MS) return { dispatch: false }
          const deadline = Math.min(claimedAt + STUDIO_DISPATCH_WINDOW_MS, job.at + STUDIO_SUBMISSION_GRACE_MS)
          // One-use fence, atomic with terminal settlement. A lost response is
          // recovery-only; a delayed acknowledgement cannot launch after this
          // bounded deadline. Legacy rows cannot acquire dispatch permission.
          await storage.put(`job:${input.id}`, { ...job, studioDispatch: 'claimed-v1', studioDispatchUntil: deadline })
          return { dispatch: true, deadline }
        }))
      }
      if (path === '/reserve') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id) || !['fast', 'slow'].includes(String(input.profile))) return json({ error: 'Invalid generation' }, 400)
        if (input.fingerprint !== undefined && (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))) return json({ error: 'Invalid request fingerprint' }, 400)
        const fingerprint = input.fingerprint as string | undefined
        const channel = input.channel === undefined ? 'blueprint' : String(input.channel)
        if (Object.hasOwn(input, 'blueprintDispatch') && (input.blueprintDispatch !== 'fenced-v1' || channel !== 'blueprint' || !fingerprint))
          return json({ error: 'Invalid Blueprint dispatch protocol' }, 400)
        const fencedBlueprint = input.blueprintDispatch === 'fenced-v1'
        if (!['blueprint','studio'].includes(channel)) return json({ error: 'Invalid generation channel' }, 400)
        const prompt = input.prompt === undefined ? undefined : String(input.prompt)
        if (prompt !== undefined && (prompt.length < 3 || prompt.length > 4000)) return json({ error: 'Invalid generation prompt' }, 400)
        const qualityProfile = input.qualityProfile === undefined ? 'standard' : String(input.qualityProfile)
        if (!['standard','industrial-electrical-cabinet-v1','reference-character-v1'].includes(qualityProfile)) return json({ error: 'Invalid generation quality profile' }, 400)
        const id = input.id, profile = input.profile as GenerationKind
        const requestedModel = input.model ?? (profile === 'fast' ? 'sol' : 'astra')
        if (!['luna', 'sol', 'astra'].includes(String(requestedModel)) || (profile === 'slow') !== (requestedModel === 'astra')) return json({ error: 'Invalid model for generation route' }, 400)
        const selectedModel = requestedModel as GenerationModel
        if (Object.hasOwn(input, 'pricing') && (!isStudioPricing(input.pricing) || channel !== 'studio' || selectedModel !== 'astra' || !fingerprint))
          return json({ error: 'Invalid Studio pricing terms' }, 400)
        const pricing = input.pricing as StudioPricing | undefined
        const result = await this.storage.transaction(async storage => {
          const existing = await storage.get<Job>(`job:${id}`)
          if (existing && existing.fingerprint !== fingerprint) return { allowed: false, repeated: true, reason: 'REQUEST_PAYLOAD_MISMATCH' }
          if (existing?.state === 'failed' && existing.failureCode === 'MISSING_SUBMISSION')
            return { allowed: false, repeated: true, state: existing.state, cost: 0, kind: existing.kind, reason: 'JOB_ALREADY_FAILED' }
          if (existing && existing.profile === profile && (existing.model ?? (existing.profile === 'fast' ? 'sol' : 'astra')) !== selectedModel) return { allowed: false, reason: 'JOB_MODEL_MISMATCH' }
          if (existing && (existing.qualityProfile ?? 'standard') !== qualityProfile) return { allowed: false, reason: 'JOB_QUALITY_PROFILE_MISMATCH' }
          if (existing && !samePricing(existing.pricing, pricing)) return { allowed: false, repeated: true, reason: 'JOB_PRICING_MISMATCH' }
          if (existing && (existing.channel ?? 'blueprint') !== channel) return { allowed: false, reason: 'JOB_CHANNEL_MISMATCH' }
          if (existing) return existing.profile !== profile
            ? { allowed: false, reason: 'JOB_PROFILE_MISMATCH' }
            : { allowed: existing.state !== 'failed', repeated: true, state: existing.state, cost: existing.cost, kind: existing.kind, ...(existing.pricing ? { pricing: existing.pricing } : {}), ...(existing.state === 'failed' ? { reason: 'JOB_ALREADY_FAILED' } : {}) }
          const credits = await balance(storage), heldCredits = await reservedCredits(storage), subscription = await storage.get<Subscription>('subscription')
          if (credits < 0 || await storage.get<boolean>('billingHold') === true) return { allowed: false, reason: 'BILLING_REVIEW_REQUIRED' }
          const subscriptionActive = active(subscription, now)
          const plan: PlanId = subscriptionActive ? subscription?.plan ?? 'creator' : 'creator'
          const model = selectedModel
          const cost = pricing?.points ?? MODEL_ECONOMICS[model].creditsPerGeneration
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
          let supportApprovalId: string | undefined
          let supplementalGrantId: string | undefined
          let studioProviderReservation: StudioProviderReservation | undefined
          let blueprintProviderReservation: StudioProviderReservation | undefined
          if (paid) {
            const remaining = await providerBudget(storage, credits)
            const ceiling = pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents
            const candidate = model === 'astra' && channel === 'studio' && fingerprint && remaining >= 0 && ceiling === ASTRA_SUPPORT_CENTS ? support() : null
            const claim = candidate ? await storage.get(ASTRA_SUPPORT_ONCE_KEY) : undefined
            const approved = candidate && claim === undefined && request.headers.get('X-WORLDIFACT-Support-Approval') === candidate.approvalId
            const supplementalCandidate = remaining < ceiling && model === 'astra' && channel === 'studio' && fingerprint && remaining >= 0 && ceiling === ASTRA_SUPPLEMENTAL_CENTS &&
              !(candidate && claim === undefined) ? supplemental() : null
            const supplementalMarker = supplementalCandidate ? await storage.get(ASTRA_SUPPLEMENTAL_KEY) : undefined
            const supplementalHeader = request.headers.get('X-WORLDIFACT-Supplemental-Claim')
            const supplementalClaim: unknown = supplementalHeader && supplementalHeader.length <= 2048 ? JSON.parse(supplementalHeader) : null
            const supplementalApproved = !!supplementalCandidate && supplementalMarker === undefined && matchesAstraSupplementalClaim(supplementalClaim, supplementalCandidate, this.now(), id, fingerprint!)
            if (remaining < ceiling && !approved && !supplementalApproved) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED',
              ...(candidate && claim === undefined ? { supportEligible: true } : {}), ...(supplementalCandidate && supplementalMarker === undefined ? { supplementalEligible: true } : {}) }
            if (approved) {
              // The singleton marker is independent of approval ID. Changing
              // configuration, replaying, restarting or failure cannot refill it.
              const record: AstraSupportClaim = { version: 1, approvalId: candidate.approvalId, amountCents: ASTRA_SUPPORT_CENTS, jobId: id, fingerprint: fingerprint!, at: this.now() }
              await storage.put(ASTRA_SUPPORT_ONCE_KEY, record)
              supportApprovalId = candidate.approvalId
            }
            if (supplementalApproved) {
              // Copy the full immutable global provenance into the same atomic
              // transaction as the hold and job, never into the original key.
              await storage.put(ASTRA_SUPPLEMENTAL_KEY, supplementalClaim)
              supplementalGrantId = supplementalCandidate.grantId
            }
            // Exactly +175 funding and -175 reservation, without an unsafe
            // intermediate integer or replenishing the pre-existing balance.
            await storage.put(PROVIDER_BUDGET, approved || supplementalApproved ? remaining : remaining - ceiling)
            if (channel === 'studio' && fingerprint && !approved && !supplementalApproved)
              studioProviderReservation = { version: 1, source: 'ordinary', amountCents: ceiling, state: 'reserved' }
            if (channel === 'blueprint' && fingerprint && fencedBlueprint)
              blueprintProviderReservation = { version: 1, source: 'ordinary', amountCents: ceiling, state: 'reserved' }
          }
          const cloudHold = paid && channel === 'studio'
          const job: Job = { ...(pricing ? { pricing } : {}), ...(fingerprint ? { fingerprint } : {}), ...(prompt ? { prompt } : {}), ...(supportApprovalId ? { supportApprovalId } : {}), ...(supplementalGrantId ? { supplementalGrantId } : {}), ...(studioProviderReservation ? { studioProviderReservation } : {}), ...(blueprintProviderReservation ? { blueprintProviderReservation } : {}), ...(channel === 'blueprint' && fingerprint && fencedBlueprint ? { blueprintDispatch: 'ready-v1' as const } : {}), channel: channel as 'studio' | 'blueprint', ...(model === 'luna' ? { model } : {}), ...(qualityProfile !== 'standard' ? { qualityProfile: qualityProfile as StudioQualityProfile } : {}), profile, at: now, updatedAt: now, cost: paid ? cost : 0, kind: paid ? 'credits' : 'free', ...(cloudHold ? { billingMode: 'hold-v1' as const } : {}), state: 'reserved', ...(channel === 'studio' ? { studioDispatch: 'ready-v1' as const } : {}) }
          if (cloudHold) await changeReservedCredits(storage, cost)
          else if (paid) await storage.put('balance', credits - cost)
          else { free.fast.push({ id, at: now }); await storage.put('usage', free) }
          if (creatorAstra) await storage.put(`creator-astra:${period}`, used + 1)
          await storage.put(`job:${id}`, job)
          if (channel === 'studio') await storage.put(CURRENT_STUDIO_JOB, { id })
          return { allowed: true, repeated: false, cost: job.cost, kind: job.kind, held: cloudHold, ...(job.pricing ? { pricing: job.pricing } : {}) }
        })
        return json(result, result.allowed ? 200 : 429)
      }
      if (path === '/studio-provider-pending') {
        if (Object.keys(input).some(key => key !== 'cursor') ||
            input.cursor !== undefined && input.cursor !== null && (typeof input.cursor !== 'string' || !JOB_ID.test(input.cursor)))
          return json({ error: 'Invalid reconciliation cursor' }, 400)
        // Only this verified account's existing records are enumerated. Reading
        // a page neither seeds funding nor infers payment from an old failure.
        if (!this.storage.list) throw new Error('Account history listing unavailable')
        const entries = await this.storage.list<Job>({ prefix: 'job:', ...(input.cursor ? { startAfter: `job:${input.cursor}` } : {}), limit: 64 })
        const ids: string[] = []
        let cursor: string | null = null, consumed = 0
        for (const [key, job] of entries) {
          if (!/^job:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) throw new Error('Invalid account job key')
          cursor = key.slice(4); consumed++
          // Older writers accepted uppercase UUIDs. Preserve their exact key
          // for pagination, but Oracle's receipt protocol accepts lowercase IDs.
          if (cursor === cursor.toLowerCase() && job && typeof job === 'object' && !Array.isArray(job) && providerBudgetPending(job)) ids.push(cursor)
          if (ids.length === 8) break
        }
        const hasMore = consumed < entries.size || entries.size === 64
        return json({ ids, nextCursor: hasMore ? cursor : null, hasMore } satisfies StudioProviderReconciliationPage)
      }
      if (path === '/reconcile-studio-provider') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'receipt'].includes(key)) ||
            typeof input.id !== 'string' || !validateTerminalBudgetReceipt(input.receipt, input.id))
          return json({ reconciled: false, reason: 'INVALID_RECEIPT' }, 400)
        const id = input.id, receipt = input.receipt
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { reconciled: false, reason: 'NOT_OWNED' }
          if (!terminalOrdinaryAstraReservation(job)) return { reconciled: false, reason: 'INELIGIBLE_RESERVATION' }
          if (!validateTerminalBudgetReceipt(receipt, id, job.pricing ?? null)) return { reconciled: false, reason: 'RECEIPT_PRICING_MISMATCH' }
          if (Object.hasOwn(job, 'studioProviderReconciliation')) {
            const saved = job.studioProviderReconciliation
            if (!validProviderReconciliation(saved, id, job)) return { reconciled: false, reason: 'UNVERIFIED_RECONCILIATION' }
            if (Object.keys(receipt).some(key => receipt[key as keyof TerminalBudgetReceipt] !== saved.receipt[key as keyof TerminalBudgetReceipt]))
              return { reconciled: false, reason: 'RECEIPT_CONFLICT' }
            return { reconciled: true, repeated: true, releasedCents: saved.releasedCents, retainedCents: saved.retainedCents }
          }
          const originalReservedCents = receipt.capMicroUsd / 10_000 as 175 | 200 | 400
          const retainedCents = Math.ceil(receipt.maximumLiabilityMicroUsd / 10_000), releasedCents = originalReservedCents - retainedCents
          const remaining = await storage.get<number>(PROVIDER_BUDGET)
          if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(Number(remaining) + releasedCents)) throw new Error('Invalid provider reconciliation')
          // No lazy seed, customer credit change, grant, quota reset or paid call.
          // Rounding liability UP keeps uncertain/legacy Oracle holds funded.
          const reconciledAt = this.now()
          if (!Number.isSafeInteger(reconciledAt) || reconciledAt <= 0) throw new Error('Invalid reconciliation time')
          const reconciliation: StudioProviderReconciliation = { receipt, originalReservedCents, retainedCents, releasedCents, at: reconciledAt }
          await storage.put(PROVIDER_BUDGET, Number(remaining) + releasedCents)
          await storage.put(`job:${id}`, { ...job, studioProviderReconciliation: reconciliation })
          return { reconciled: true, repeated: false, releasedCents, retainedCents }
        }))
      }
      if (path === '/settle' || path === '/job') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid job' }, 400)
        const id = input.id
        if (path === '/job') {
          const job = await this.storage.get<Job>(`job:${id}`)
          if (!job) return json({ owned: false, downloadAllowed: false, previewOnly: false })
          const subscription = await this.storage.get<Subscription>('subscription')
          const allowed = job.state === 'completed' && (job.profile === 'fast' || active(subscription, now)) && await balance(this.storage) >= 0 && await this.storage.get<boolean>('billingHold') !== true
          const dispatchUntil = studioDispatchUntil(job)
          return json({ owned: true, ...(job.fingerprint ? { fingerprint: job.fingerprint } : {}), downloadAllowed: allowed, previewOnly: job.profile === 'slow' && !active(subscription, now), profile: job.profile, ...(job.qualityProfile ? { qualityProfile: job.qualityProfile } : {}), ...(job.failureCode ? { failureCode: job.failureCode } : {}), state: job.state, at: job.at, updatedAt: job.updatedAt ?? job.at, cost: job.cost, ...(job.pricing ? { pricing: job.pricing } : {}), held: job.billingMode === 'hold-v1' && job.state === 'reserved', ...(dispatchUntil ? { studioDispatchUntil: dispatchUntil } : {}), ...(providerBudgetPending(job) ? { providerBudgetPending: true } : {}) })
        }
        if (!['completed', 'failed'].includes(String(input.state))) return json({ error: 'Invalid settlement' }, 400)
        const next = input.state as 'completed' | 'failed'
        if (input.failureCode !== undefined && (next !== 'failed' || !STUDIO_FAILURE_CODES.includes(input.failureCode as StudioFailureCode))) return json({ error: 'Invalid failure diagnostic' }, 400)
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { settled: false, reason: 'NOT_OWNED' }
          // A 404 snapshot can predate a claim which won this same transaction
          // queue. Recheck the dispatch tail atomically with missing-job closure;
          // real Oracle terminal failures retain their existing settlement path.
          const dispatchUntil = studioDispatchUntil(job)
          if (job.state === 'reserved' && next === 'failed' && input.failureCode === 'ORACLE_JOB_MISSING' && dispatchUntil && this.now() < dispatchUntil + STUDIO_ORACLE_TIMEOUT_MS)
            return { settled: false }
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
type SupportContext = { identity?: AstraSupportIdentity; available?: boolean; consumed?: boolean; approvalId?: string; statusKnown?: boolean;
  supplemental?: { available?: boolean; consumed?: boolean; statusKnown?: boolean; claim?: AstraSupplementalClaim } }
function internalHeaders(userId: string, support?: SupportContext) {
  return { 'X-WORLDIFACT-Verified-Account': userId.toLowerCase(),
    ...(support?.identity?.emailVerified === true ? { 'X-WORLDIFACT-Verified-Email': support.identity.email.toLowerCase() } : {}),
    ...(support?.statusKnown === true ? { 'X-WORLDIFACT-Support-Status': 'known' } : {}),
    ...(support?.available === true ? { 'X-WORLDIFACT-Support-Available': 'true' } : {}),
    ...(support?.consumed === true ? { 'X-WORLDIFACT-Support-Consumed': 'true' } : {}),
    ...(support?.approvalId ? { 'X-WORLDIFACT-Support-Approval': support.approvalId } : {}),
    ...(support?.supplemental?.statusKnown === true ? { 'X-WORLDIFACT-Supplemental-Status': 'known' } : {}),
    ...(support?.supplemental?.available === true ? { 'X-WORLDIFACT-Supplemental-Available': 'true' } : {}),
    ...(support?.supplemental?.consumed === true ? { 'X-WORLDIFACT-Supplemental-Consumed': 'true' } : {}),
    ...(support?.supplemental?.claim ? { 'X-WORLDIFACT-Supplemental-Claim': JSON.stringify(support.supplemental.claim) } : {}) }
}
export async function entitlementCall<T>(env: EntitlementEnv, userId: string, path: string, body?: unknown, support?: SupportContext): Promise<T> {
  if (!ACCOUNT_ID.test(userId)) throw new EntitlementError('A verified account is required.', 401)
  if (!env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('Account allowances are not configured.')
  if (env.ACCOUNT_LEDGER_MODE !== undefined && !['sandbox', 'live'].includes(env.ACCOUNT_LEDGER_MODE)) throw new EntitlementError('Account ledger mode is invalid.')
  // Sandbox balances, customers, captures and subscriptions can never become live
  // simply by switching provider API credentials. Preserve existing live IDs.
  const prefix = env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${prefix}:${userId.toLowerCase()}`))
  let response: Response
  try { response = await object.fetch(new Request(`https://entitlements.internal${path}`, { method: body === undefined ? 'GET' : 'POST', headers: internalHeaders(userId, support), ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })) }
  catch { throw new EntitlementError('Account allowances are temporarily unavailable.') }
  if (!response.ok && !(path === '/reserve' && response.status === 429)) throw new EntitlementError('Account allowances are temporarily unavailable.')
  return response.json() as Promise<T>
}
async function supportCall(env: EntitlementEnv, userId: string, identity?: AstraSupportIdentity, body?: { id: string; fingerprint: string }): Promise<{ available?: boolean; consumed?: boolean; approved?: boolean; approvalId?: string }> {
  if (!env.WORLDIFACT_ASTRA_SUPPORT_ONCE || (env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live')) return {}
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('A verified account allowance is required.')
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ASTRA_SUPPORT_NAMESPACE))
  try {
    const response = await object.fetch(new Request(`https://entitlements.internal/astra-support-${body ? 'claim' : 'status'}`, {
      method: body ? 'POST' : 'GET', headers: internalHeaders(userId, { identity }), ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    }))
    if (!response.ok) throw new Error('Unconfirmed support state')
    const result = await response.json() as Record<string, unknown>
    if (!result || typeof result !== 'object' || (body ? typeof result.approved !== 'boolean' || (result.approved && (typeof result.approvalId !== 'string' || !ACCOUNT_ID.test(result.approvalId)))
      : typeof result.available !== 'boolean' || typeof result.consumed !== 'boolean')) throw new Error('Invalid support state')
    return body ? { approved: result.approved === true, ...(result.approved ? { approvalId: String(result.approvalId) } : {}) } : { available: result.available === true, consumed: result.consumed === true }
  } catch { throw new EntitlementError('The one-time support allowance could not be confirmed. Keep the same job; do not start another.') }
}
async function supplementalCall(env: EntitlementEnv, userId: string, identity?: AstraSupportIdentity, body?: { id: string; fingerprint: string }): Promise<{ available?: boolean; consumed?: boolean; claim?: AstraSupplementalClaim }> {
  if (!env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT || (env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live')) return {}
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('A verified account allowance is required.')
  const configuration = env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ASTRA_SUPPLEMENTAL_NAMESPACE))
  try {
    const response = await object.fetch(new Request(`https://entitlements.internal/astra-supplemental-${body ? 'claim' : 'status'}`, {
      method: body ? 'POST' : 'GET', headers: internalHeaders(userId, { identity }), ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    }))
    if (!response.ok) throw new Error('Unconfirmed supplemental state')
    const result = await response.json() as Record<string, unknown>
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid supplemental state')
    if (!body) {
      if (Object.keys(result).length !== 2 || typeof result.available !== 'boolean' || typeof result.consumed !== 'boolean' || (result.available && result.consumed)) throw new Error('Invalid supplemental status')
      return { available: result.available, consumed: result.consumed }
    }
    if (result.approved === false && Object.keys(result).length === 1) return {}
    const claim = result.claim as AstraSupplementalClaim | undefined
    const approved = astraSupplementalGrant(configuration, userId, env.ACCOUNT_LEDGER_MODE, claim?.at as number, identity?.emailVerified === true ? identity.email : null)
    if (result.approved !== true || Object.keys(result).length !== 2 || !approved || !matchesAstraSupplementalClaim(claim, approved, claim?.at as number, body.id, body.fingerprint)) throw new Error('Invalid supplemental claim')
    // Account admission independently rechecks this complete original claim
    // against its current configuration and clock before making any hold.
    return { claim }
  } catch { throw new EntitlementError('The supplemental support allowance could not be confirmed. Keep the same job; do not start another.') }
}
export async function entitlementStatus(env: EntitlementEnv, userId: string, identity?: AstraSupportIdentity) {
  const [support, supplemental] = await Promise.all([
    supportCall(env, userId, identity).catch(() => ({} as { available?: boolean; consumed?: boolean })),
    supplementalCall(env, userId, identity).catch(() => ({} as { available?: boolean; consumed?: boolean })),
  ]) // Optional support cannot hide ordinary account availability.
  return entitlementCall<EntitlementStatus>(env, userId, '/status', undefined, { identity, available: support.available, consumed: support.consumed, statusKnown: typeof support.available === 'boolean',
    supplemental: { available: supplemental.available, consumed: supplemental.consumed, statusKnown: typeof supplemental.available === 'boolean' } })
}
export async function reserveUserGeneration(env: EntitlementEnv, userId: string, jobId: string, profile: GenerationKind, model?: GenerationModel, fingerprint?: string, qualityProfile?: StudioQualityProfile, metadata?: { channel?: 'studio' | 'blueprint'; prompt?: string; supportIdentity?: AstraSupportIdentity; pricing?: StudioPricing; blueprintDispatch?: 'fenced-v1' }) {
  const body = { id: jobId, profile, ...(model ? { model } : {}), ...(fingerprint ? { fingerprint } : {}), ...(qualityProfile && qualityProfile !== 'standard' ? { qualityProfile } : {}), ...(metadata?.channel ? { channel: metadata.channel } : {}), ...(metadata?.blueprintDispatch ? { blueprintDispatch: metadata.blueprintDispatch } : {}), ...(metadata?.prompt ? { prompt: metadata.prompt } : {}), ...(metadata?.pricing !== undefined ? { pricing: metadata.pricing } : {}) }
  const identity = metadata?.supportIdentity
  const initial = await entitlementCall<Reservation>(env, userId, '/reserve', body, { identity })
  if (initial.allowed || initial.reason !== 'PROVIDER_BUDGET_EXHAUSTED' || metadata?.pricing !== undefined || metadata?.channel !== 'studio' || profile !== 'slow' || (model !== undefined && model !== 'astra') || !fingerprint) return initial
  // Claim globally before adding account funding. Uncertain/failed account
  // admission never releases this claim; only this exact job can replay it.
  if (initial.supportEligible === true) {
    const claim = await supportCall(env, userId, identity, { id: jobId, fingerprint })
    if (!claim.approved) return initial
    return entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, approvalId: claim.approvalId })
  }
  // Never fall through after attempting the original grant. Its unconfirmed
  // or globally-only claim may still belong to this job.
  if (initial.supplementalEligible !== true) return initial
  const supplemental = await supplementalCall(env, userId, identity, { id: jobId, fingerprint })
  if (!supplemental.claim) return initial
  const reservation = await entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, supplemental: { claim: supplemental.claim } })
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation) || typeof reservation.allowed !== 'boolean' ||
      (reservation.allowed && (reservation.cost !== MODEL_ECONOMICS.astra.creditsPerGeneration || reservation.kind !== 'credits' ||
        Object.keys(reservation).length !== 5 || Object.keys(reservation).some(key => !['allowed', 'repeated', 'cost', 'kind', 'held', 'state'].includes(key)) ||
        !(reservation.repeated === false && reservation.held === true && reservation.state === undefined ||
          reservation.repeated === true && ['reserved', 'completed'].includes(String(reservation.state))))))
    throw new EntitlementError('The supplemental account reservation could not be confirmed. Keep the same job; do not start another.')
  return reservation
}
export const settleUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, state: 'completed' | 'failed', failureCode?: StudioFailureCode) => entitlementCall<{ settled: boolean; repeated?: boolean }>(env, userId, '/settle', { id: jobId, state, ...(failureCode ? { failureCode } : {}) })
export async function pendingUserStudioProvider(env: EntitlementEnv, userId: string, cursor: string | null = null): Promise<StudioProviderReconciliationPage> {
  const page = await entitlementCall<StudioProviderReconciliationPage>(env, userId, '/studio-provider-pending', { cursor })
  if (!page || typeof page !== 'object' || Array.isArray(page) || Object.keys(page).length !== 3 ||
      !Array.isArray(page.ids) || page.ids.length > 8 || page.ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) ||
      new Set(page.ids).size !== page.ids.length || typeof page.hasMore !== 'boolean' ||
      (page.hasMore ? typeof page.nextCursor !== 'string' || !JOB_ID.test(page.nextCursor) || (cursor !== null && page.nextCursor <= cursor) : page.nextCursor !== null))
    throw new EntitlementError('Account history could not be verified.')
  return page
}
export async function reconcileUserStudioProvider(env: EntitlementEnv, userId: string, jobId: string, receipt: TerminalBudgetReceipt): Promise<StudioProviderReconciliationResult> {
  if (!validateTerminalBudgetReceipt(receipt, jobId)) throw new EntitlementError('The terminal provider receipt could not be verified.')
  return entitlementCall<StudioProviderReconciliationResult>(env, userId, '/reconcile-studio-provider', { id: jobId, receipt })
}
export const userJobAccess = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<JobAccess>(env, userId, '/job', { id: jobId })
export const currentUserStudioJob = (env: EntitlementEnv, userId: string) => entitlementCall<{ job: CurrentStudioJob | null }>(env, userId, '/studio-current', {})
export const clearCurrentUserStudioJob = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<{ cleared: boolean }>(env, userId, '/studio-current-clear', { id: jobId })
export const closeMissingStudioJob = (env: EntitlementEnv, userId: string, jobId: string, fingerprint: string, issued: number) => entitlementCall<ClosedMissingStudioJob>(env, userId, '/studio-close-missing', { id: jobId, fingerprint, issued })
export async function markBlueprintDispatch(env: EntitlementEnv, userId: string, jobId: string, fingerprint: string): Promise<StudioDispatchClaim> {
  const value = await entitlementCall<unknown>(env, userId, '/blueprint-dispatch', { id: jobId, fingerprint })
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const claim = value as Record<string, unknown>
    if (claim.dispatch === false && Object.keys(claim).length === 1) return { dispatch: false }
    if (claim.dispatch === true && Object.keys(claim).length === 2 && Number.isSafeInteger(claim.deadline) && Number(claim.deadline) > 0 && Number(claim.deadline) <= Date.now() + BLUEPRINT_DISPATCH_WINDOW_MS)
      return { dispatch: true, deadline: Number(claim.deadline) }
  }
  throw new EntitlementError('The Blueprint dispatch acknowledgement could not be verified.')
}
export async function markStudioDispatch(env: EntitlementEnv, userId: string, jobId: string, fingerprint: string): Promise<StudioDispatchClaim> {
  const value = await entitlementCall<unknown>(env, userId, '/studio-dispatch', { id: jobId, fingerprint })
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const claim = value as Record<string, unknown>
    if (claim.dispatch === false && Object.keys(claim).length === 1) return { dispatch: false }
    if (claim.dispatch === true && Object.keys(claim).length === 2 && Number.isSafeInteger(claim.deadline) && Number(claim.deadline) > 0 && Number(claim.deadline) <= Date.now() + STUDIO_DISPATCH_WINDOW_MS)
      return { dispatch: true, deadline: Number(claim.deadline) }
  }
  throw new EntitlementError('The Studio dispatch acknowledgement could not be verified.')
}
export async function entitlementApi(request: Request, env: AccountEnv & EntitlementEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/account/entitlements') return null
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your allowance.' }, 401)
    return json(await entitlementStatus(env, user.id, user))
  } catch (error) { return json({ error: error instanceof EntitlementError ? error.message : 'Account allowances are unavailable.' }, error instanceof EntitlementError ? error.status : 503) }
}
