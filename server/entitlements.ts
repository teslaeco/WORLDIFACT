import { validateGenerationResult, type GenerationResult } from '../src/lib/blueprint.ts'
import { privateWorldStore } from './privateWorldStore.ts'
import type { BudgetNamespace } from './budget.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { MODEL_ECONOMICS, PLAN_CATALOG, type PlanId, type GenerationModel } from './generationEconomics.ts'
import { STUDIO_FAILURE_CODES, STUDIO_SUBMISSION_GRACE_MS, type StudioFailureCode, type StudioQualityProfile } from '../src/lib/studioProtocol.ts'
import type { AdmissionFailureCode } from '../src/lib/generationAdmission.ts'
import { STUDIO_PRICING, isStudioPricing, type StudioPricing, type StudioBudgetTier } from '../src/lib/studioPricing.ts'
import { astraSupportApproval, ASTRA_SUPPORT_ONCE_KEY, ASTRA_SUPPORT_NAMESPACE, ASTRA_SUPPORT_CENTS, type AstraSupportApproval, type AstraSupportClaim, type AstraSupportIdentity } from './astraSupportOnce.ts'
import { astraSupplementalGrant, matchesAstraSupplementalClaim, ASTRA_SUPPLEMENTAL_KEY, ASTRA_SUPPLEMENTAL_NAMESPACE, ASTRA_SUPPLEMENTAL_CENTS, type AstraSupplementalGrant, type AstraSupplementalClaim } from './astraSupplementalGrant.ts'
import { astraRepairedMccGrant, matchesAstraRepairedMccClaim, ASTRA_REPAIRED_MCC_KEY, ASTRA_REPAIRED_MCC_NAMESPACE, ASTRA_REPAIRED_MCC_CENTS, type AstraRepairedMccGrant, type AstraRepairedMccClaim } from './astraRepairedMccGrant.ts'
import { astraProjectBudget, matchesAstraProjectBudgetRecord, matchesAstraProjectScope, isAstraProjectBudgetRecord, persistedAstraProjectBudget, ASTRA_PROJECT_BUDGET_KEY, ASTRA_PROJECT_BUDGET_NAMESPACE, ASTRA_PROJECT_BUDGET_CENTS, type AstraProjectBudget, type AstraProjectBudgetRecord } from './astraProjectBudget.ts'
import { overnightTestPoolRoute, overnightTestAuthority, overnightTestStatusDiagnostic, overnightWorkflow, matchesOvernightTestClaim, isOvernightTestClaim, OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_APPROVAL, OVERNIGHT_TEST_WORKFLOWS, type OvernightTestClaim } from './overnightTestBudget.ts'
import { isOvernightTestDiagnostic, type OvernightTestDiagnostic } from '../src/lib/overnightTestDiagnostics.ts'
import { TEST_ACCOUNT_CONTRACT, hasTestAccountHeaders, testAccountMatches } from '../src/lib/testAccountContract.ts'
import { validateTerminalBudgetReceipt, type TerminalBudgetReceipt } from './studioBudgetReceipt.ts'
import { boundBlueprintProviderModel } from './blueprintModelBinding.ts'
import { isStoredInvoiceReference, readGenerationFundingEvidenceQuery, type GenerationFundingSnapshot, type StoredGenerationFundingEvidence } from '../src/lib/generationFunding.ts'
import { BLUEPRINT_RECONCILIATION_TERMS, blueprintRetainedCents, validateBlueprintTerminalUsage, type BlueprintTerminalUsage } from './blueprintTerminalUsage.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING, isPointSettlement, type PointSettlement } from '../src/lib/paidPointsFunding.ts'
import { PAID_POINTS_ROUTE_PREFIX, generationPath, paidPointsStorage } from './paidPointsStorage.ts'
import { failedHoldWaiverApi, failedHoldWaiverLedgerRoute } from './failedHoldWaiver.ts'
import { ownerReserveAdjustmentApi, ownerReserveAdjustmentLedgerRoute } from './ownerReserveAdjustment.ts'

export interface EntitlementEnv {
  ACCOUNT_ENTITLEMENTS?: BudgetNamespace
  ENFORCE_ACCOUNT_ENTITLEMENTS?: string
  ACCOUNT_LEDGER_MODE?: string
  ENABLE_ASTRA_PLANS?: string
  WORLDIFACT_ASTRA_SUPPORT_ONCE?: string
  WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT?: string
  WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT?: string
  WORLDIFACT_ASTRA_PROJECT_BUDGET?: string
  WORLDIFACT_OVERNIGHT_TEST_BUDGET?: string
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
type FailedBlueprintProviderReconciliation = { revision: 'blueprint-failed-output-v1'; evidence: BlueprintTerminalUsage; originalReservedCents: number; retainedCents: number; releasedCents: number; at: number }
type BlueprintProviderReconciliation = { revision: 'blueprint-bounded-output-v1'; model: GenerationModel; resultSha256: string; originalReservedCents: number; retainedCents: number; releasedCents: number; at: number } | FailedBlueprintProviderReconciliation
type StudioProviderReconciliation = { receipt: TerminalBudgetReceipt; originalReservedCents: 175 | 200 | 400; retainedCents: number; releasedCents: number; at: number }
type PaidProviderLiability = { version: 1; source: 'paid-membership'; capCents: number; maximumLiabilityCents: number; state: 'unsubmitted' | 'unresolved' | 'bounded'; evidence?: { kind: 'undispatched'; at: number } | { kind: 'studio-terminal'; receipt: TerminalBudgetReceipt; at: number } | { kind: 'blueprint-output'; resultSha256: string; at: number } | { kind: 'blueprint-failure'; usage: BlueprintTerminalUsage; at: number } }
type Job = { pointSettlement?: PointSettlement; fundingMode?: typeof PAID_POINTS_FUNDING; providerLiability?: PaidProviderLiability; overnightTest?: OvernightTestClaim; blueprintProviderModel?: string; pricing?: StudioPricing; fingerprint?: string; prompt?: string; channel?: 'studio' | 'blueprint'; model?: GenerationModel; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; supportApprovalId?: string; supplementalGrantId?: string; repairedMccGrantId?: string; repairedMccClaim?: AstraRepairedMccClaim; projectBudget?: AstraProjectBudgetRecord; profile: GenerationKind; at: number; updatedAt?: number; cost: number; kind: 'free' | 'credits'; billingMode?: 'hold-v1'; state: 'reserved' | 'completed' | 'failed'; studioDispatch?: 'ready-v1' | 'claimed-v1'; studioDispatchUntil?: number; studioProviderReservation?: StudioProviderReservation; studioProviderReconciliation?: StudioProviderReconciliation; blueprintDispatch?: 'ready-v1' | 'claimed-v1'; blueprintDispatchUntil?: number; blueprintProviderReservation?: StudioProviderReservation; blueprintProviderReconciliation?: BlueprintProviderReconciliation }
export type Reservation = { pointSettlement?: PointSettlement; fundingSource?: typeof PAID_POINTS_FUNDING | typeof OVERNIGHT_TEST_APPROVAL; providerModel?: string; pricing?: StudioPricing; allowed: boolean; repeated?: boolean; cost?: number; kind?: 'free' | 'credits'; reason?: string; state?: Job['state']; held?: boolean; supportEligible?: boolean; supplementalEligible?: boolean; repairedMccEligible?: boolean; projectBudgetEligible?: boolean }
export type JobAccess = { channel?: 'studio' | 'blueprint'; model?: GenerationModel; pointSettlement?: PointSettlement; fingerprint?: string; pricing?: StudioPricing; owned: boolean; downloadAllowed: boolean; previewOnly: boolean; profile?: GenerationKind; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode; state?: Job['state']; at?: number; updatedAt?: number; cost?: number; held?: boolean; studioDispatchUntil?: number; providerBudgetPending?: true }
export type StudioProviderReconciliationPage = { ids: string[]; blueprintIds: string[]; nextCursor: string | null; hasMore: boolean }
export type OwnedStudioLibraryModel = { id: string; fingerprint: string; prompt: string; at: number; completedAt: number; downloadAllowed: boolean }
type OwnedStudioLibraryPage = { models: OwnedStudioLibraryModel[]; nextCursor: string | null; hasMore: boolean }
export const STUDIO_LIBRARY_SCAN_LIMIT = 64
export type StudioProviderReconciliationResult = { pointSettlement?: PointSettlement; reconciled: boolean; repeated?: boolean; releasedCents?: number; retainedCents?: number; reason?: string }
type StudioDispatchClaim = { dispatch: false } | { dispatch: true; deadline: number }
export const STUDIO_DISPATCH_WINDOW_MS = 30_000
export const STUDIO_ORACLE_TIMEOUT_MS = 25_000
export const BLUEPRINT_DISPATCH_WINDOW_MS = 30_000
const BLUEPRINT_JOB_WINDOW_MS = 10 * 60_000
export type CurrentStudioJob = { pointSettlement?: PointSettlement; fundingSource?: 'ordinary' | typeof PAID_POINTS_FUNDING | typeof OVERNIGHT_TEST_APPROVAL | 'unknown'; pricing?: StudioPricing; id: string; fingerprint: string; prompt: string; at: number; updatedAt: number; state: Job['state']; cost: number; held: boolean; qualityProfile?: StudioQualityProfile; failureCode?: StudioFailureCode }
export type ClosedMissingStudioJob = { closed: boolean; state: Job['state']; fingerprintMatches: boolean; failureCode?: StudioFailureCode }
type Grant = { credits: number; revoked: number; subscriptionId?: string }
type Checkout = { id: string; created: number; plan?: PlanId; url?: string; expiresAt?: number; sessionId?: string }
type PayPalCheckout = { id: string; created: number; orderId?: string; url?: string }
export interface EntitlementStatus {
  paidGenerationPolicy: 'paid-membership-no-quota-v1' | typeof PAID_POINTS_POLICY
  generationAdmission: Record<GenerationModel, { allowed: boolean; reason?: AdmissionFailureCode }>
  studioAdmission: { allowed: boolean; reason?: AdmissionFailureCode; tiers: Record<StudioBudgetTier, { allowed: boolean; reason?: AdmissionFailureCode; pricing: StudioPricing }> }
  astraSupportOnce?: { available: boolean; consumed: boolean; maximumProviderCents: 175 }
  astraSupplementalGrant?: { available: boolean; consumed: boolean; maximumProviderCents: 175 }
  astraRepairedMccGrant?: { available: boolean; consumed: boolean; maximumProviderCents: 175 }
  astraProjectBudget?: { available: boolean; committed: boolean; maximumProviderCents: 175; maxAttempts: 1 }
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
  creatorAstra: { active: boolean; remaining: null; maximum: null; recommended: 2; pointsForTwo: 500 }
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
const libraryCursorKey = (value: unknown): value is string => typeof value === 'string' && value.startsWith('job:') && value.length <= 2048
function completedLibraryJob(value: unknown, now: number): value is Job & { fingerprint: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const job = value as Job
  return job.channel === 'studio' && job.state === 'completed' && ['fast', 'slow'].includes(job.profile) &&
    ['free', 'credits'].includes(job.kind) && validInteger(job.cost) && job.cost >= 0 &&
    typeof job.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(job.fingerprint) &&
    validInteger(job.at) && job.at > 0 && job.at <= now &&
    (job.updatedAt === undefined || validInteger(job.updatedAt) && job.updatedAt >= job.at && job.updatedAt <= now) &&
    (job.prompt === undefined || typeof job.prompt === 'string' && job.prompt.trim().length >= 3 && job.prompt.length <= 4000) &&
    (job.pricing === undefined || isStudioPricing(job.pricing)) && job.failureCode === undefined
}
async function libraryPermissions(storage: EntitlementStorage, now: number) {
  const [subscription, credits, billingHold] = await Promise.all([
    storage.get<Subscription>('subscription'), balance(storage), storage.get<boolean>('billingHold'),
  ])
  return { subscribed: active(subscription, now), clear: credits >= 0 && billingHold !== true }
}
function libraryModel(id: string, job: Job & { fingerprint: string }, permissions: { subscribed: boolean; clear: boolean }): OwnedStudioLibraryModel {
  return { id, fingerprint: job.fingerprint, prompt: job.prompt ?? 'Recovered cloud model', at: job.at,
    completedAt: job.updatedAt ?? job.at, downloadAllowed: permissions.clear && (job.profile === 'fast' || permissions.subscribed) }
}
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

async function paidMembership(storage: EntitlementStorage, subscription: Subscription | undefined, now: number): Promise<boolean> {
  if (!subscription || subscription.active !== true || subscription.terminal !== undefined && subscription.terminal !== false ||
      !Number.isSafeInteger(subscription.revision) || subscription.revision < 0 || !Number.isSafeInteger(subscription.until) || subscription.until <= now ||
      typeof subscription.plan !== 'string' || !Object.hasOwn(PLAN_CATALOG, subscription.plan) ||
      typeof subscription.id !== 'string' || !/^sub_[A-Za-z0-9]{1,180}$/.test(subscription.id) ||
      typeof subscription.grantId !== 'string' || !/^in_[A-Za-z0-9_]{1,180}$/.test(subscription.grantId)) return false
  const grant = await storage.get<Grant>(`grant:${subscription.grantId}`)
  return !!grant && typeof grant === 'object' && !Array.isArray(grant) && Object.keys(grant).length === 3 &&
    Object.keys(grant).every(key => ['credits', 'revoked', 'subscriptionId'].includes(key)) &&
    Number.isSafeInteger(grant.credits) && grant.credits > 0 && grant.credits <= 1_000_000 && grant.revoked === 0 && grant.subscriptionId === subscription.id
}
/** Strict isolated writer contract. No ordinary reservation may accompany an
 * unreserved provider liability, and unknown modes never fall back to legacy. */
export function paidPointsJob(value: unknown, id?: string): value is Job & { fundingMode: typeof PAID_POINTS_FUNDING; providerLiability: PaidProviderLiability } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const job = value as Job, marker = job.providerLiability, terms = reservationTerms(job)
  const fields = ['pointSettlement', 'fundingMode', 'providerLiability', 'blueprintProviderModel', 'pricing', 'fingerprint', 'prompt', 'channel', 'model', 'qualityProfile',
    'failureCode', 'profile', 'at', 'updatedAt', 'cost', 'kind', 'billingMode', 'state', 'studioDispatch', 'studioDispatchUntil', 'blueprintDispatch', 'blueprintDispatchUntil']
  if (job.fundingMode !== PAID_POINTS_FUNDING || Object.keys(job).some(key => !fields.includes(key)) || !terms || job.kind !== 'credits' || job.cost !== terms.points || !isPointSettlement(job.pointSettlement, job.cost) ||
      !(job.state === 'reserved' && job.pointSettlement.state === 'held' || job.state === 'completed' && job.pointSettlement.state === 'charged' || job.state === 'failed' && ['pending-cost', 'released', 'waived'].includes(job.pointSettlement.state)) ||
      !['reserved', 'completed', 'failed'].includes(job.state) || !['fast', 'slow'].includes(job.profile) ||
      !Number.isSafeInteger(job.at) || job.at <= 0 || !Number.isSafeInteger(job.updatedAt) || Number(job.updatedAt) < job.at ||
      typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint) || !marker || typeof marker !== 'object' || Array.isArray(marker) ||
      Object.keys(marker).some(key => !['version', 'source', 'capCents', 'maximumLiabilityCents', 'state', 'evidence'].includes(key)) ||
      marker.version !== 1 || marker.source !== 'paid-membership' || marker.capCents !== terms.maxProviderCents ||
      !Number.isSafeInteger(marker.maximumLiabilityCents) || marker.maximumLiabilityCents < 0 || marker.maximumLiabilityCents > marker.capCents ||
      !['unsubmitted', 'unresolved', 'bounded'].includes(marker.state)) return false
  const model = job.model ?? (job.profile === 'fast' ? 'sol' : 'astra')
  if (typeof model !== 'string' || !Object.hasOwn(MODEL_ECONOMICS, model) || (model === 'astra') !== (job.profile === 'slow') ||
      job.prompt !== undefined && (typeof job.prompt !== 'string' || job.prompt.length < 3 || job.prompt.length > 4000) ||
      job.qualityProfile !== undefined && !['standard', 'industrial-electrical-cabinet-v1', 'reference-character-v1'].includes(job.qualityProfile) ||
      job.failureCode !== undefined && (job.state !== 'failed' || !STUDIO_FAILURE_CODES.includes(job.failureCode))) return false
  const dispatch = job.channel === 'studio' ? job.studioDispatch : job.blueprintDispatch
  const until = job.channel === 'studio' ? job.studioDispatchUntil : job.blueprintDispatchUntil
  if (job.channel === 'studio' ? job.profile !== 'slow' || job.billingMode !== 'hold-v1' || job.blueprintDispatch !== undefined :
      job.channel !== 'blueprint' || job.billingMode !== 'hold-v1' || job.studioDispatch !== undefined || job.pricing !== undefined || !boundBlueprintProviderModel(job)) return false
  if (!['ready-v1', 'claimed-v1'].includes(String(dispatch)) || (dispatch === 'ready-v1' ? until !== undefined : !Number.isSafeInteger(until) || Number(until) <= job.at || Number(until) > job.at + (job.channel === 'studio' ? STUDIO_SUBMISSION_GRACE_MS : BLUEPRINT_JOB_WINDOW_MS))) return false
  if (job.pointSettlement?.state === 'waived' && (job.channel !== 'studio' || job.cost !== 250 || marker.capCents !== 175 || marker.state !== 'bounded' || marker.maximumLiabilityCents <= 0 || marker.evidence?.kind !== 'studio-terminal')) return false
  if (job.pointSettlement?.state === 'released' && (marker.state !== 'bounded' || marker.maximumLiabilityCents !== 0)) return false
  if (job.pointSettlement?.state === 'pending-cost' && marker.state === 'bounded' && marker.maximumLiabilityCents === 0) return false
  if (marker.state === 'unsubmitted') return job.state === 'reserved' && dispatch === 'ready-v1' && marker.maximumLiabilityCents === 0 && !Object.hasOwn(marker, 'evidence')
  if (marker.state === 'unresolved') return dispatch === 'claimed-v1' && marker.maximumLiabilityCents === marker.capCents && !Object.hasOwn(marker, 'evidence')
  const proof = marker.evidence
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || !Number.isSafeInteger(proof.at) || proof.at < job.at || !['completed', 'failed'].includes(job.state)) return false
  if (proof.kind === 'undispatched') return Object.keys(proof).length === 2 && job.state === 'failed' && dispatch === 'ready-v1' && marker.maximumLiabilityCents === 0
  if (proof.kind === 'studio-terminal') return Object.keys(proof).length === 3 && job.channel === 'studio' && dispatch === 'claimed-v1' && validateTerminalBudgetReceipt(proof.receipt, id ?? proof.receipt?.jobId, job.pricing ?? null) && marker.maximumLiabilityCents === Math.ceil(proof.receipt.maximumLiabilityMicroUsd / 10_000)
  if (proof.kind === 'blueprint-output') return Object.keys(proof).length === 3 && job.channel === 'blueprint' && job.state === 'completed' && dispatch === 'claimed-v1' && /^[a-f0-9]{64}$/.test(proof.resultSha256)
  return proof.kind === 'blueprint-failure' && Object.keys(proof).length === 3 && job.channel === 'blueprint' && ['failed', 'completed'].includes(job.state) && validateBlueprintTerminalUsage(proof.usage) && (id === undefined || proof.usage.requestId === id) && dispatch === 'claimed-v1' && proof.usage.fingerprint === job.fingerprint &&
    proof.usage.model === boundBlueprintProviderModel(job) && proof.usage.dispatchDeadline === job.blueprintDispatchUntil && proof.usage.reservedCents === marker.capCents &&
    proof.usage.dispatchedAt >= job.at && proof.usage.receivedAt <= proof.at && marker.maximumLiabilityCents === blueprintRetainedCents(job.model ?? (job.profile === 'fast' ? 'sol' : 'astra'), proof.usage.inputTokens, proof.usage.outputTokens)
}
function paidLiabilityPending(job: Job) {
  return paidPointsJob(job) && job.providerLiability.state === 'unresolved' && ['completed', 'failed'].includes(job.state)
}

function samePricing(left: StudioPricing | undefined, right: StudioPricing | undefined): boolean {
  return left === undefined && right === undefined || isStudioPricing(left) && isStudioPricing(right) &&
    left.revision === right.revision && left.tier === right.tier && left.points === right.points && left.maxProviderCents === right.maxProviderCents
}
function terminalOrdinaryAstraReservation(job: Job): boolean {
  if (Object.hasOwn(job, 'fundingMode') || Object.hasOwn(job, 'providerLiability')) return false
  if (Object.hasOwn(job, 'overnightTest')) return false
  const terms = reservationTerms(job)
  if (!terms) return false
  if (!['failed', 'completed'].includes(job.state) || job.channel !== 'studio' || job.profile !== 'slow' ||
      (job.model !== undefined && job.model !== 'astra') || job.kind !== 'credits' || job.billingMode !== 'hold-v1' || job.cost !== terms.points ||
      typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint) || !Number.isSafeInteger(job.at) || job.at <= 0 ||
      !Number.isSafeInteger(job.updatedAt) || Number(job.updatedAt) < job.at || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') || Object.hasOwn(job, 'repairedMccGrantId') || Object.hasOwn(job, 'repairedMccClaim') || Object.hasOwn(job, 'projectBudget')) return false
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
  return job.channel === 'studio' && paidLiabilityPending(job) || !Object.hasOwn(job, 'studioProviderReconciliation') && terminalOrdinaryAstraReservation(job)
}
function validProviderReconciliation(value: unknown, id: string, job: Job): value is StudioProviderReconciliation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const saved = value as StudioProviderReconciliation
  return Object.keys(saved).length === 5 && validateTerminalBudgetReceipt(saved.receipt, id, job.pricing ?? null) && saved.originalReservedCents === reservationTerms(job)?.maxProviderCents &&
    saved.retainedCents === Math.ceil(saved.receipt.maximumLiabilityMicroUsd / 10_000) && saved.releasedCents === saved.originalReservedCents - saved.retainedCents &&
    Number.isSafeInteger(saved.at) && saved.at > 0
}
function completedOrdinaryBlueprint(job: Job): GenerationModel | null {
  const fields = ['fingerprint', 'channel', 'model', 'profile', 'at', 'updatedAt', 'cost', 'kind', 'state',
    'blueprintDispatch', 'blueprintDispatchUntil', 'blueprintProviderReservation', 'blueprintProviderReconciliation', 'blueprintProviderModel']
  if (!job || typeof job !== 'object' || Array.isArray(job) || Object.keys(job).some(key => !fields.includes(key)) ||
      job.state !== 'completed' || job.kind !== 'credits' || !['fast', 'slow'].includes(job.profile) ||
      Object.hasOwn(job, 'channel') && job.channel !== 'blueprint' ||
      typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint) || !Number.isSafeInteger(job.at) || job.at <= 0 ||
      Object.hasOwn(job, 'updatedAt') && (!Number.isSafeInteger(job.updatedAt) || Number(job.updatedAt) < job.at)) return null
  const model = job.model ?? (job.profile === 'fast' ? 'sol' : 'astra')
  if (!boundBlueprintProviderModel(job) || !Object.hasOwn(BLUEPRINT_RECONCILIATION_TERMS, model) || (model === 'astra') !== (job.profile === 'slow') || job.cost !== BLUEPRINT_RECONCILIATION_TERMS[model].points) return null
  if (Object.hasOwn(job, 'blueprintDispatch')) {
    if (job.channel !== 'blueprint' || job.blueprintDispatch !== 'claimed-v1' || !Number.isSafeInteger(job.blueprintDispatchUntil) ||
        Number(job.blueprintDispatchUntil) <= job.at || Number(job.blueprintDispatchUntil) > job.at + BLUEPRINT_JOB_WINDOW_MS) return null
  } else if (Object.hasOwn(job, 'blueprintDispatchUntil')) return null
  if (Object.hasOwn(job, 'blueprintProviderReservation')) {
    const reservation = job.blueprintProviderReservation
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation) || Object.keys(reservation).length !== 4 ||
        reservation.version !== 1 || reservation.source !== 'ordinary' || reservation.state !== 'reserved' || reservation.amountCents !== BLUEPRINT_RECONCILIATION_TERMS[model].capCents ||
        job.blueprintDispatch !== 'claimed-v1') return null
  }
  return model
}
const sha256Json = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), n => n.toString(16).padStart(2, '0')).join('')
async function reconcileCompletedBlueprint(storage: EntitlementStorage, id: string, now: number): Promise<StudioProviderReconciliationResult> {
  const job = await storage.get<Job>(`job:${id}`)
  const pointsFunded = paidPointsJob(job, id) && job.channel === 'blueprint' && job.state === 'completed'
  const model = pointsFunded ? job.model ?? (job.profile === 'fast' ? 'sol' : 'astra') : job ? completedOrdinaryBlueprint(job) : null
  if (!job || !model) return { reconciled: false, reason: 'INELIGIBLE_BLUEPRINT' }
  let result: GenerationResult
  try { result = validateGenerationResult(await storage.get(`blueprint-result:${id}`)) }
  catch { return { reconciled: false, reason: 'UNVERIFIED_BLUEPRINT_RESULT' } }
  const usage = result.evidence, receivedAt = usage ? Date.parse(usage.receivedAt) : NaN
  // The saved-result writer (d3a7dd5) postdates funded admission (73ff4e7).
  // It permits exactly one default-tier provider response, max4000 output,
  // without paid tools. A completed result is durable and cannot dispatch again.
  // A bare old Studio row or a failure label does not establish this proof.
  if (result.mode !== 'LIVE' || result.requestId !== id || result.model !== boundBlueprintProviderModel(job) ||
      result.delivery?.kind !== 'procedural-blueprint' || !usage || !Number.isSafeInteger(usage.inputTokens) ||
      !Number.isSafeInteger(usage.outputTokens) || !Number.isSafeInteger(usage.totalTokens) ||
      Number(usage.inputTokens) < 0 || Number(usage.inputTokens) > 32768 || Number(usage.outputTokens) < 0 || Number(usage.outputTokens) > 4000 ||
      usage.totalTokens !== Number(usage.inputTokens) + Number(usage.outputTokens) ||
      !Number.isSafeInteger(now) || now < job.at || receivedAt < job.at || receivedAt > now ||
      Object.hasOwn(job, 'updatedAt') && receivedAt > Number(job.updatedAt) ||
      await sha256Json(result.blueprint) !== usage.blueprintSha256) return { reconciled: false, reason: 'UNVERIFIED_BLUEPRINT_USAGE' }
  // Keep the ENTIRE 4000-token output ceiling and 2048 input framing margin;
  // no invoice, cache discount or zero-cost inference is needed for this bound.
  const terms = BLUEPRINT_RECONCILIATION_TERMS[model], originalReservedCents = terms.capCents
  const retainedCents = blueprintRetainedCents(model, Number(usage.inputTokens))
  if (retainedCents > originalReservedCents) return { reconciled: false, reason: 'UNVERIFIED_BLUEPRINT_LIABILITY' }
  const releasedCents = originalReservedCents - retainedCents, resultSha256 = await sha256Json(result)
  if (pointsFunded && paidPointsJob(job)) {
    const proof = job.providerLiability.evidence
    if (proof) return proof.kind === 'blueprint-output' && proof.resultSha256 === resultSha256 && job.providerLiability.maximumLiabilityCents === retainedCents
      ? { reconciled: true, repeated: true, retainedCents, releasedCents: 0 } : { reconciled: false, reason: 'RECEIPT_CONFLICT' }
    if (job.providerLiability.state !== 'unresolved') return { reconciled: false, reason: 'INELIGIBLE_BLUEPRINT' }
    await storage.put(`job:${id}`, { ...job, providerLiability: { ...job.providerLiability, state: 'bounded', maximumLiabilityCents: retainedCents,
      evidence: { kind: 'blueprint-output', resultSha256, at: now } } })
    return { reconciled: true, repeated: false, retainedCents, releasedCents: 0 }
  }
  if (Object.hasOwn(job, 'blueprintProviderReconciliation')) {
    const saved = job.blueprintProviderReconciliation
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.keys(saved).length !== 7 ||
        saved.revision !== 'blueprint-bounded-output-v1' || saved.model !== model || saved.resultSha256 !== resultSha256 ||
        saved.originalReservedCents !== originalReservedCents || saved.retainedCents !== retainedCents || saved.releasedCents !== releasedCents ||
        !Number.isSafeInteger(saved.at) || saved.at < receivedAt || saved.at > now) return { reconciled: false, reason: 'UNVERIFIED_BLUEPRINT_RECONCILIATION' }
    return { reconciled: true, repeated: true, retainedCents, releasedCents }
  }
  const remaining = await storage.get<number>(PROVIDER_BUDGET)
  if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(Number(remaining) + releasedCents)) throw new Error('Invalid blueprint funding reconciliation')
  const reconciliation: BlueprintProviderReconciliation = { revision: 'blueprint-bounded-output-v1', model, resultSha256, originalReservedCents, retainedCents, releasedCents, at: now }
  await storage.put(PROVIDER_BUDGET, Number(remaining) + releasedCents)
  await storage.put(`job:${id}`, { ...job, blueprintProviderReconciliation: reconciliation })
  return { reconciled: true, repeated: false, retainedCents, releasedCents }
}
/** Read-only counterfactual for already reconciled historical completed output.
 * It neither changes a v1 receipt nor authorizes any customer/provider credit. */
export async function previewCompletedBlueprintOutputAdjustment(id: string, value: unknown, storedResult: unknown, now: number): Promise<number | null> {
  if (!JOB_ID.test(id) || !Number.isSafeInteger(now) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const job = value as Job, model = completedOrdinaryBlueprint(job)
  if (!model || Object.hasOwn(job, 'blueprintProviderModel') || now < job.at || Object.hasOwn(job, 'updatedAt') && Number(job.updatedAt) > now) return null
  const saved = job.blueprintProviderReconciliation
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.keys(saved).length !== 7 || saved.revision !== 'blueprint-bounded-output-v1') return null
  let result: GenerationResult
  try { result = validateGenerationResult(storedResult) } catch { return null }
  const terms = BLUEPRINT_RECONCILIATION_TERMS[model], evidence = result.evidence
  const receivedAt = evidence ? Date.parse(evidence.receivedAt) : NaN
  // Exact immutable historical model only. New model bindings or pricing must
  // be reviewed separately and must never reinterpret an old completed debit.
  if (result.mode !== 'LIVE' || result.requestId !== id || result.model !== terms.model || result.delivery?.kind !== 'procedural-blueprint' ||
      !evidence || !Number.isSafeInteger(evidence.inputTokens) || !Number.isSafeInteger(evidence.outputTokens) || !Number.isSafeInteger(evidence.totalTokens) ||
      Number(evidence.inputTokens) < 0 || Number(evidence.inputTokens) > 32768 || Number(evidence.outputTokens) < 0 || Number(evidence.outputTokens) > 4000 ||
      evidence.totalTokens !== Number(evidence.inputTokens) + Number(evidence.outputTokens) ||
      !Number.isSafeInteger(receivedAt) || receivedAt < job.at || receivedAt > now ||
      Object.hasOwn(job, 'updatedAt') && receivedAt > Number(job.updatedAt) ||
      await sha256Json(result.blueprint) !== evidence.blueprintSha256) return null
  const oldRetained = blueprintRetainedCents(model, Number(evidence.inputTokens))
  if (oldRetained > terms.capCents || saved.model !== model || saved.originalReservedCents !== terms.capCents || saved.retainedCents !== oldRetained ||
      saved.releasedCents !== terms.capCents - oldRetained || saved.resultSha256 !== await sha256Json(result) ||
      !Number.isSafeInteger(saved.at) || saved.at < receivedAt || saved.at < Number(job.updatedAt ?? job.at) || saved.at > now) return null
  const outputBound = Math.ceil(((Number(evidence.inputTokens) + 2048) * terms.inputRate + Number(evidence.outputTokens) * terms.outputRate) / 10_000)
  const potentialCents = oldRetained - outputBound
  return Number.isSafeInteger(potentialCents) && potentialCents >= 0 ? potentialCents : null
}
function failedBlueprintLiability(job: Job, evidence: unknown, accountId: string | null, id: string, now: number) {
  // Explicit current ordinary writer only. This is not a historical failure scan.
  const model = completedOrdinaryBlueprint({ ...job, state: 'completed' })
  if (!model || !['reserved', 'failed'].includes(job.state) || job.channel !== 'blueprint' ||
      recordedOrdinaryReservation(job)?.state !== 'reserved' || !validateBlueprintTerminalUsage(evidence) ||
      evidence.accountId !== accountId?.toLowerCase() || evidence.requestId !== id || evidence.fingerprint !== job.fingerprint ||
      evidence.model !== boundBlueprintProviderModel(job) || evidence.reservedCents !== job.blueprintProviderReservation?.amountCents ||
      evidence.dispatchDeadline !== job.blueprintDispatchUntil || evidence.dispatchedAt < job.at ||
      !Number.isSafeInteger(now) || evidence.receivedAt > now) return null
  const originalReservedCents = evidence.reservedCents, retainedCents = blueprintRetainedCents(model, evidence.inputTokens, evidence.outputTokens)
  if (retainedCents > originalReservedCents) return null
  return { originalReservedCents, retainedCents, releasedCents: originalReservedCents - retainedCents }
}
function validFailedBlueprintReconciliation(job: Job, accountId: string | null, id: string, now: number): boolean {
  const saved = job.blueprintProviderReconciliation
  if (job.state !== 'failed' || !saved || typeof saved !== 'object' || Array.isArray(saved) || Object.keys(saved).length !== 6 ||
      saved.revision !== 'blueprint-failed-output-v1') return false
  const liability = failedBlueprintLiability(job, saved.evidence, accountId, id, now)
  return !!liability && saved.originalReservedCents === liability.originalReservedCents && saved.retainedCents === liability.retainedCents &&
    saved.releasedCents === liability.releasedCents && Number.isSafeInteger(saved.at) && saved.at >= saved.evidence.receivedAt &&
    saved.at <= now && saved.at === job.updatedAt
}
export class EntitlementError extends Error {
  status: number
  testDiagnostic?: OvernightTestDiagnostic
  constructor(message: string, status = 503, testDiagnostic?: OvernightTestDiagnostic) { super(message); this.status = status; this.testDiagnostic = testDiagnostic }
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
async function settleReservedJob(storage: EntitlementStorage, id: string, job: Job, next: 'completed' | 'failed', now: number, failureCode?: StudioFailureCode, validatedLateCompletion = false) {
  if (Object.hasOwn(job, 'fundingMode') && !paidPointsJob(job, id)) throw new Error('Unknown settlement funding mode')
  if (paidPointsJob(job, id)) {
    const point = job.pointSettlement!
    if (point.state === 'charged' || point.state === 'released' || point.state === 'waived') return { settled: true, repeated: true, pointSettlement: point }
    if (job.state === 'failed' && next === 'failed') return { settled: true, repeated: true, pointSettlement: point }
    if (next === 'completed' && (job.providerLiability.state === 'unsubmitted' || job.state === 'failed' && !validatedLateCompletion)) return { settled: false, pointSettlement: point }
    let providerLiability = job.providerLiability
    const release = next === 'failed' && providerLiability.state === 'unsubmitted'
    if (release) providerLiability = { ...providerLiability, state: 'bounded', maximumLiabilityCents: 0, evidence: { kind: 'undispatched', at: now } }
    const pointSettlement: PointSettlement = { version: 1, state: next === 'completed' ? 'charged' : release ? 'released' : 'pending-cost',
      heldPoints: next === 'failed' && !release ? job.cost : 0, chargedPoints: next === 'completed' ? job.cost : 0 }
    if (next === 'completed' || release) await changeReservedCredits(storage, -job.cost)
    if (next === 'completed') await storage.put('balance', await balance(storage) - job.cost)
    const terminal: Job = { ...job, state: next, updatedAt: now, pointSettlement, providerLiability,
      ...(next === 'failed' && failureCode ? { failureCode } : {}) }
    if (next === 'completed') delete terminal.failureCode
    await storage.put(`job:${id}`, terminal)
    return { settled: true, repeated: false, pointSettlement }
  }
  if (job.state !== 'reserved') return { settled: true, repeated: true }
  let providerReservation = job.studioProviderReservation
  const economics = reservationTerms(job)
  if (next === 'failed' && !Object.hasOwn(job, 'overnightTest') && job.channel === 'studio' && job.kind === 'credits' && job.billingMode === 'hold-v1' &&
      job.studioDispatch === 'ready-v1' && job.studioDispatchUntil === undefined && job.supportApprovalId === undefined && job.supplementalGrantId === undefined && !Object.hasOwn(job, 'repairedMccGrantId') && !Object.hasOwn(job, 'repairedMccClaim') && !Object.hasOwn(job, 'projectBudget') &&
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
  if (next === 'failed' && !Object.hasOwn(job, 'overnightTest') && job.channel === 'blueprint' && job.kind === 'credits' && job.billingMode === undefined &&
      job.blueprintDispatch === 'ready-v1' && job.blueprintDispatchUntil === undefined && !Object.hasOwn(job, 'pricing') &&
      job.supportApprovalId === undefined && job.supplementalGrantId === undefined && !Object.hasOwn(job, 'repairedMccGrantId') && !Object.hasOwn(job, 'repairedMccClaim') && !Object.hasOwn(job, 'projectBudget') &&
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
const FUNDING_SCAN_LIMIT = 256
const FUNDING_JOB_FIELDS = ['overnightTest', 'pricing', 'fingerprint', 'prompt', 'channel', 'model', 'qualityProfile', 'failureCode', 'supportApprovalId',
  'supplementalGrantId', 'repairedMccGrantId', 'repairedMccClaim', 'projectBudget', 'profile', 'at', 'updatedAt', 'cost', 'kind', 'billingMode', 'state', 'studioDispatch', 'studioDispatchUntil',
  'studioProviderReservation', 'studioProviderReconciliation', 'blueprintDispatch', 'blueprintDispatchUntil', 'blueprintProviderReservation', 'blueprintProviderReconciliation', 'blueprintProviderModel']
function fundingJob(value: unknown): value is Job {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const job = value as Job
  return Object.keys(job).every(key => FUNDING_JOB_FIELDS.includes(key)) && ['reserved', 'completed', 'failed'].includes(job.state) &&
    ['fast', 'slow'].includes(job.profile) && ['credits', 'free'].includes(job.kind) && Number.isSafeInteger(job.at) && job.at > 0 &&
    Number.isSafeInteger(job.cost) && job.cost >= 0 && (!Object.hasOwn(job, 'updatedAt') || Number.isSafeInteger(job.updatedAt) && Number(job.updatedAt) >= job.at) &&
    (!Object.hasOwn(job, 'model') || typeof job.model === 'string' && ['luna', 'sol', 'astra'].includes(job.model)) &&
    (!Object.hasOwn(job, 'channel') || job.channel === 'studio' || job.channel === 'blueprint') &&
    (!Object.hasOwn(job, 'blueprintProviderModel') || job.channel === 'blueprint' && !!boundBlueprintProviderModel(job)) &&
    (!Object.hasOwn(job, 'fingerprint') || typeof job.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(job.fingerprint)) &&
    (!Object.hasOwn(job, 'prompt') || typeof job.prompt === 'string' && job.prompt.length <= 4000) &&
    (!Object.hasOwn(job, 'overnightTest') || isOvernightTestClaim(job.overnightTest)) &&
    (!Object.hasOwn(job, 'billingMode') || job.billingMode === 'hold-v1')
}
/** Recognize only the explicit ordinary reservation writer. Historical markerless rows stay unknown. */
function recordedOrdinaryReservation(job: Job): StudioProviderReservation | null {
  if (Object.hasOwn(job, 'overnightTest')) return null
  if (job.kind !== 'credits' || typeof job.fingerprint !== 'string' || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') || Object.hasOwn(job, 'repairedMccGrantId') || Object.hasOwn(job, 'repairedMccClaim') || Object.hasOwn(job, 'projectBudget') ||
      !Number.isSafeInteger(job.updatedAt) || Number(job.updatedAt) < job.at) return null
  const terms = reservationTerms(job), model = job.model ?? (job.profile === 'slow' ? 'astra' : 'sol')
  if (!terms || job.cost !== terms.points || (model === 'astra') !== (job.profile === 'slow')) return null
  let marker: StudioProviderReservation | undefined, dispatch: Job['studioDispatch'], dispatchValid: boolean
  if (job.channel === 'studio') {
    if (job.profile !== 'slow' || model !== 'astra' || job.billingMode !== 'hold-v1' || Object.hasOwn(job, 'blueprintProviderReservation') || Object.hasOwn(job, 'blueprintProviderReconciliation') ||
        Object.hasOwn(job, 'blueprintDispatch') || Object.hasOwn(job, 'blueprintDispatchUntil')) return null
    marker = job.studioProviderReservation; dispatch = job.studioDispatch
    dispatchValid = dispatch === 'ready-v1' ? !Object.hasOwn(job, 'studioDispatchUntil') : dispatch === 'claimed-v1' && studioDispatchUntil(job) !== undefined
  } else if (job.channel === 'blueprint') {
    if (Object.hasOwn(job, 'billingMode') || Object.hasOwn(job, 'pricing') || Object.hasOwn(job, 'studioProviderReservation') || Object.hasOwn(job, 'studioProviderReconciliation') ||
        Object.hasOwn(job, 'studioDispatch') || Object.hasOwn(job, 'studioDispatchUntil')) return null
    marker = job.blueprintProviderReservation; dispatch = job.blueprintDispatch
    dispatchValid = dispatch === 'ready-v1' ? !Object.hasOwn(job, 'blueprintDispatchUntil') : dispatch === 'claimed-v1' && Number.isSafeInteger(job.blueprintDispatchUntil) &&
      Number(job.blueprintDispatchUntil) > job.at && Number(job.blueprintDispatchUntil) <= job.at + BLUEPRINT_JOB_WINDOW_MS
  } else return null
  if (!dispatchValid || !marker || typeof marker !== 'object' || Array.isArray(marker) || Object.keys(marker).length !== 4 ||
      marker.version !== 1 || marker.source !== 'ordinary' || marker.amountCents !== terms.maxProviderCents || !['reserved', 'released'].includes(marker.state)) return null
  if (marker.state === 'released' && (job.state !== 'failed' || dispatch !== 'ready-v1')) return null
  return marker
}
/** A stored grant is evidence of ledger bookkeeping, never independent proof of a Stripe payment. */
function storedInvoiceGrant(value: unknown): Grant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const grant = value as Grant
  const keys = ['credits', 'revoked', ...(Object.hasOwn(value, 'subscriptionId') ? ['subscriptionId'] : [])]
  if (Object.keys(grant).length !== keys.length || Object.keys(grant).some(key => !keys.includes(key)) ||
      !validInteger(grant.credits) || grant.credits < 0 || grant.credits > 1_000_000 || !validInteger(grant.revoked) || grant.revoked < 0 || grant.revoked > 1_000_000 ||
      grant.credits === 0 && grant.revoked === 0 || grant.credits > 0 && grant.revoked > grant.credits ||
      Object.hasOwn(grant, 'subscriptionId') && (typeof grant.subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]{1,180}$/.test(grant.subscriptionId))) return null
  return grant
}

async function storedGenerationFundingEvidence(storage: Pick<EntitlementStorage, 'get' | 'list'>, invoices: string[]): Promise<StoredGenerationFundingEvidence> {
  const result: StoredGenerationFundingEvidence = {
    version: 1, source: 'stored-credit-records', stripeCustomerLinked: false, stripeCustomerStatus: 'unavailable',
    invoiceGrants: { scanLimit: 64, scanned: 0, partial: true, scanStatus: 'unavailable',
      states: { present: 0, revoked: 0, unverifiable: 0 }, creditedPoints: 0, revokedPoints: 0 },
    requestedInvoices: [], unknownAmountProvenance: { records: 0, classifiedRecords: 0, unclassifiedRecords: 0, groups: [] },
  }
  try {
    const customer = await storage.get('customer')
    result.stripeCustomerLinked = typeof customer === 'string' && /^cus_[A-Za-z0-9]{1,180}$/.test(customer)
    result.stripeCustomerStatus = customer === undefined || result.stripeCustomerLinked ? 'known' : 'invalid'
  } catch { /* Unavailable linkage is never reported as a known absent customer. */ }
  for (const invoiceReference of invoices) {
    const check: StoredGenerationFundingEvidence['requestedInvoices'][number] = {
      invoiceReference, state: 'unverifiable', reason: 'unavailable', creditedPoints: null, revokedPoints: null, subscriptionLinked: false,
    }
    try {
      const raw = await storage.get(`grant:${invoiceReference}`)
      const grant = storedInvoiceGrant(raw)
      if (raw === undefined) { check.state = 'missing'; check.reason = null }
      else if (!grant) check.reason = 'invalid-record'
      else {
        check.state = grant.revoked > 0 ? 'revoked' : 'present'; check.reason = null
        check.creditedPoints = grant.credits; check.revokedPoints = grant.revoked; check.subscriptionLinked = Object.hasOwn(grant, 'subscriptionId')
      }
    } catch { /* A failed lookup cannot establish that a grant is missing. */ }
    result.requestedInvoices.push(check)
  }
  if (!storage.list) return result
  let entries: Map<string, unknown>
  try { entries = await storage.list<unknown>({ prefix: 'grant:in_', limit: 64 }) }
  catch { return result }
  const grants = result.invoiceGrants
  if (!(entries instanceof Map)) { grants.scanStatus = 'invalid'; return result }
  grants.partial = entries.size >= grants.scanLimit
  grants.scanStatus = grants.partial ? 'partial' : 'complete'
  for (const [key, raw] of entries) {
    if (grants.scanned === grants.scanLimit) break
    grants.scanned++
    const grant = typeof key === 'string' && key.startsWith('grant:') && isStoredInvoiceReference(key.slice(6)) ? storedInvoiceGrant(raw) : null
    if (!grant) { grants.states.unverifiable++; continue }
    grants.states[grant.revoked > 0 ? 'revoked' : 'present']++
    grants.creditedPoints += grant.credits; grants.revokedPoints += grant.revoked
  }
  return result
}

/** Group only existing validated metadata. Missing model is unknown, not inferred from profile. */
function addUnknownAmountProvenance(evidence: StoredGenerationFundingEvidence | undefined, job: Job | null, now: number) {
  if (!evidence) return
  const provenance = evidence.unknownAmountProvenance
  provenance.records++
  if (!job || job.at > now || job.at > 8_640_000_000_000_000 || job.cost > 1_000_000 || Object.hasOwn(job, 'updatedAt') && Number(job.updatedAt) > now) {
    provenance.unclassifiedRecords++; return
  }
  const route = job.channel ?? 'legacyBlueprint', model = job.model ?? 'unknown', state = job.state
  let group = provenance.groups.find(value => value.route === route && value.model === model && value.state === state)
  if (!group) {
    group = { route, model, state, records: 0, recordedPointCosts: 0, earliestAt: job.at, latestAt: job.at }
    provenance.groups.push(group)
  }
  group.records++; group.recordedPointCosts += job.cost
  group.earliestAt = Math.min(group.earliestAt, job.at); group.latestAt = Math.max(group.latestAt, job.at)
  provenance.classifiedRecords++
}


function generationFundingQuery(params: URLSearchParams) {
  const remaining = new URLSearchParams(params), cursors = remaining.getAll('pendingAfter')
  if (cursors.length > 1 || cursors.length === 1 && !JOB_ID.test(cursors[0])) throw new Error('Invalid pending cost cursor')
  remaining.delete('pendingAfter')
  return { evidence: readGenerationFundingEvidenceQuery(remaining), pendingAfter: cursors[0] }
}
async function pendingCostReviews(storage: Pick<EntitlementStorage, 'get' | 'list'>, after?: string) {
  const items: { id: string; channel: 'studio' | 'blueprint'; model: GenerationModel; at: number; state: 'held' | 'pending-cost'; heldPoints: number }[] = []
  if (!storage.list) return { version: 1, items, nextCursor: null, hasMore: false, scanStatus: 'unavailable' }
  let entries: Map<string, Job>
  try { entries = await storage.list<Job>({ prefix: 'job:', ...(after ? { startAfter: `job:${after}` } : {}), limit: 64 }) }
  catch { return { version: 1, items, nextCursor: null, hasMore: false, scanStatus: 'unavailable' } }
  let cursor: string | null = null, consumed = 0
  for (const [key, job] of entries) {
    if (!key.startsWith('job:') || !JOB_ID.test(key.slice(4)) || after && key <= `job:${after}` || cursor && key <= `job:${cursor}`) return { version: 1, items: [], nextCursor: null, hasMore: false, scanStatus: 'unavailable' }
    cursor = key.slice(4); consumed++
    if (paidPointsJob(job, cursor) && job.pointSettlement && job.pointSettlement.heldPoints > 0) {
      items.push({ id: cursor, channel: job.channel!, model: job.model ?? (job.profile === 'fast' ? 'sol' : 'astra'), at: job.at, state: job.pointSettlement.state as 'held' | 'pending-cost', heldPoints: job.pointSettlement.heldPoints })
      if (items.length === 8) break
    }
  }
  const hasMore = consumed < entries.size || entries.size === 64
  return { version: 1, items, nextCursor: hasMore ? cursor : null, hasMore, scanStatus: hasMore ? 'partial' : 'complete' }
}

/** This projection can only read; it deliberately cannot call lazy initialization, settlement or provider services. */
async function generationFundingSnapshot(storage: Pick<EntitlementStorage, 'get' | 'list'>, accountId: string | null, now: number, invoices?: string[], pendingAfter?: string, includePending = false): Promise<GenerationFundingSnapshot> {
  const [rawBalance, rawHeld, rawBudget, originalClaim, supplementalClaim] = await Promise.all([
    storage.get('balance'), storage.get(CUSTOMER_RESERVED_CREDITS), storage.get(PROVIDER_BUDGET),
    storage.get(ASTRA_SUPPORT_ONCE_KEY), storage.get(ASTRA_SUPPLEMENTAL_KEY),
  ])
  const credits = rawBalance === undefined ? 0 : validInteger(rawBalance) ? Number(rawBalance) : null
  const held = rawHeld === undefined ? 0 : validInteger(rawHeld) && Number(rawHeld) >= 0 ? Number(rawHeld) : null
  const available = credits !== null && held !== null && Number.isSafeInteger(credits - held) ? credits - held : null
  const fallback = rawBudget === undefined && credits !== null ? Math.floor(Math.max(0, credits) * 7 / 10) : null
  const snapshot: GenerationFundingSnapshot = {
    version: 1, readOnly: true, currency: 'USD',
    customerPoints: { status: available === null ? 'invalid' : 'known', balance: credits, held, available },
    providerBudget: { status: rawBudget === undefined ? 'uninitialized' : validInteger(rawBudget) ? 'known' : 'invalid',
      unreservedCents: validInteger(rawBudget) ? Number(rawBudget) : null, legacyDerivedFallbackCents: fallback !== null && Number.isSafeInteger(fallback) ? fallback : null },
    ordinaryAstraMinimumCents: { blueprint: 175, unpricedDetailed: 175 },
    jobs: { scanLimit: FUNDING_SCAN_LIMIT, scanned: 0, partial: true, scanStatus: 'unavailable',
      states: { reserved: 0, completed: 0, failed: 0, unknown: 0 }, routes: { studio: 0, blueprint: 0, legacyBlueprint: 0, unknown: 0 },
      evidence: { ordinaryTerminalStudioPending: 0, ordinaryCompletedBlueprintPending: 0, legacyReadyWithoutReservation: 0, legacyAllowanceRefusalCandidates: 0, supportGrantRecords: 0, markedReconciled: 0, unknown: 0 },
      fundingEvidence: { unresolvedOrdinaryReservations: { records: 0, cents: 0 }, recordedPreDispatchReleases: { records: 0, cents: 0 },
        recordedStudioReconciliations: { records: 0, releasedCents: 0, retainedLiabilityCents: 0 }, unknownAmountRecords: 0 } },
    supportGrantClaims: { originalRecordPresent: originalClaim !== undefined, supplementalRecordPresent: supplementalClaim !== undefined },
  }
  if (includePending) Object.assign(snapshot, { pendingCostReviews: await pendingCostReviews(storage, pendingAfter) })
  const paidLiability = { version: 1 as const, jobs: 0, unresolvedJobs: 0, maximumLiabilityCents: 0 }
  Object.assign(snapshot, { paidMembershipLiability: paidLiability })
  const outputAdjustment = { scanLimit: 32 as const, checked: 0, candidates: 0, potentialCents: 0, unavailable: 0, partial: true }
  Object.assign(snapshot.jobs, { blueprintOutputAdjustment: outputAdjustment })
  if (invoices !== undefined) snapshot.storedEvidence = await storedGenerationFundingEvidence(storage, invoices)
  if (!storage.list) return snapshot
  let entries: Map<string, unknown>
  try { entries = await storage.list<unknown>({ prefix: 'job:', limit: FUNDING_SCAN_LIMIT }) }
  catch (error) { if (invoices !== undefined) return snapshot; throw error }
  const jobs = snapshot.jobs
  if (!(entries instanceof Map)) { jobs.scanStatus = 'invalid'; return snapshot }
  jobs.partial = entries.size >= FUNDING_SCAN_LIMIT
  jobs.scanStatus = jobs.partial ? 'partial' : 'complete'
  outputAdjustment.partial = jobs.partial
  for (const [key, value] of entries) {
    if (jobs.scanned === FUNDING_SCAN_LIMIT) break
    jobs.scanned++
    if (typeof key !== 'string' || !/^job:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key) || !fundingJob(value) && !paidPointsJob(value, key.slice(4))) {
      jobs.states.unknown++; jobs.routes.unknown++; jobs.evidence.unknown++; jobs.fundingEvidence.unknownAmountRecords++
      addUnknownAmountProvenance(snapshot.storedEvidence, null, now)
      continue
    }
    const job = value, id = key.slice(4), evidence = jobs.evidence, amounts = jobs.fundingEvidence
    jobs.states[job.state]++
    jobs.routes[job.channel ?? 'legacyBlueprint']++
    if (paidPointsJob(job, id)) {
      paidLiability.jobs++; paidLiability.maximumLiabilityCents += job.providerLiability.maximumLiabilityCents
      if (job.providerLiability.state === 'unresolved') paidLiability.unresolvedJobs++
      continue
    }
    const supportRecord = Object.hasOwn(job, 'overnightTest') || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') || Object.hasOwn(job, 'repairedMccGrantId') || Object.hasOwn(job, 'repairedMccClaim') || Object.hasOwn(job, 'projectBudget')
    const marked = Object.hasOwn(job, 'studioProviderReconciliation') || Object.hasOwn(job, 'blueprintProviderReconciliation')
    const failedBlueprintMarked = job.blueprintProviderReconciliation?.revision === 'blueprint-failed-output-v1' ||
      job.channel === 'blueprint' && job.state === 'failed' && Object.hasOwn(job, 'blueprintProviderReconciliation')
    const failedBlueprintVerified = failedBlueprintMarked && validFailedBlueprintReconciliation(job, accountId, id, now)
    if (job.state === 'completed' && job.blueprintProviderReconciliation?.revision === 'blueprint-bounded-output-v1') {
      if (outputAdjustment.checked === outputAdjustment.scanLimit) outputAdjustment.partial = true
      else {
        outputAdjustment.checked++
        let potential: number | null = null
        try { potential = await previewCompletedBlueprintOutputAdjustment(id, job, await storage.get(`blueprint-result:${id}`), now) } catch { /* Optional unreadable evidence stays unavailable. */ }
        if (potential === null) outputAdjustment.unavailable++
        else if (potential > 0) { outputAdjustment.candidates++; outputAdjustment.potentialCents += potential }
      }
    }
    const studioPending = id === id.toLowerCase() && providerBudgetPending(job)
    const blueprintPending = !Object.hasOwn(job, 'blueprintProviderReconciliation') && completedOrdinaryBlueprint(job) !== null
    if (supportRecord && !Object.hasOwn(job, 'projectBudget') && !Object.hasOwn(job, 'overnightTest')) evidence.supportGrantRecords++
    if (marked && (!failedBlueprintMarked || failedBlueprintVerified)) evidence.markedReconciled++
    if (failedBlueprintMarked && !failedBlueprintVerified) evidence.unknown++
    if (studioPending) evidence.ordinaryTerminalStudioPending++
    if (blueprintPending) evidence.ordinaryCompletedBlueprintPending++
    if (job.channel === 'studio' && job.studioDispatch === 'ready-v1' && !Object.hasOwn(job, 'studioProviderReservation') && !supportRecord) evidence.legacyReadyWithoutReservation++
    if (studioPending && job.state === 'failed' && job.failureCode === 'STUDIO_ALLOWANCE_UNAVAILABLE' && (!Object.hasOwn(job, 'studioDispatch') || job.studioDispatch === 'ready-v1') &&
        !Object.hasOwn(job, 'studioProviderReservation') && !Object.hasOwn(job, 'studioDispatchUntil')) evidence.legacyAllowanceRefusalCandidates++
    let knownAmount = false
    if (!supportRecord && terminalOrdinaryAstraReservation(job) && (!Object.hasOwn(job, 'studioProviderReservation') || recordedOrdinaryReservation(job) !== null) && !Object.hasOwn(job, 'blueprintProviderReconciliation') &&
        validProviderReconciliation(job.studioProviderReconciliation, id, job)) {
      const saved = job.studioProviderReconciliation
      amounts.recordedStudioReconciliations.records++
      amounts.recordedStudioReconciliations.releasedCents += saved.releasedCents
      amounts.recordedStudioReconciliations.retainedLiabilityCents += saved.retainedCents
      knownAmount = true
    } else if (failedBlueprintVerified) {
      // Known verified evidence, already counted in markedReconciled. It is not
      // a Studio receipt or an unresolved full reservation in this projection.
      knownAmount = true
    } else if (!marked) {
      const marker = recordedOrdinaryReservation(job)
      if (marker) {
        const bucket = marker.state === 'released' ? amounts.recordedPreDispatchReleases : amounts.unresolvedOrdinaryReservations
        bucket.records++; bucket.cents += marker.amountCents; knownAmount = true
      }
    }
    if (!knownAmount && !supportRecord && job.kind === 'credits') {
      amounts.unknownAmountRecords++
      addUnknownAmountProvenance(snapshot.storedEvidence, job, now)
    }
    if (!supportRecord && !marked && !studioPending && !blueprintPending && !knownAmount) evidence.unknown++
  }
  return snapshot
}
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
  supplemental: AstraSupplementalGrant | null = null, supplementalGlobalAvailable = false, supplementalGlobalConsumed = false, originalSupportConfigured = support !== null,
  repaired: AstraRepairedMccGrant | null = null, repairedGlobalAvailable = false, repairedGlobalConsumed = false, originalConfigured = false, supplementalConfigured = false, repairedNow: () => number = () => now, project: AstraProjectBudget | null = null, projectGlobalAvailable = false, projectGlobalCommitted = false, pointsProtocol = false): Promise<EntitlementStatus> {
  const [credits, reserved, free, subscription, billingHold] = await Promise.all([balance(storage), reservedCredits(storage), usage(storage, now), storage.get<Subscription>('subscription'), storage.get<boolean>('billingHold')])
  const plan: PlanId = subscription?.plan ?? 'creator'
  // Historical Creator counters remain untouched for audit. Admission now uses
  // existing funded credits, never a plan-specific attempt allowance.
  // Read-only projection of the same admission order as /reserve. Never seed,
  // replenish or reveal the internal provider ledger while reading an account.
  const storedProviderBudget = await storage.get<number>(PROVIDER_BUDGET).catch(() => NaN)
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
  let repairedConsumed = false, repairedAvailable = false
  if (repaired) {
    try {
      const [old, extra, claimed] = await Promise.all([storage.get(ASTRA_SUPPORT_ONCE_KEY), storage.get(ASTRA_SUPPLEMENTAL_KEY), storage.get(ASTRA_REPAIRED_MCC_KEY)])
      const earlierPending = originalConfigured && old === undefined || supplementalConfigured && extra === undefined ||
        !!old && typeof old === 'object' && 'approvalId' in old && old.approvalId === repaired.grantId ||
        !!extra && typeof extra === 'object' && 'grantId' in extra && extra.grantId === repaired.grantId
      repairedConsumed = repairedGlobalConsumed || claimed !== undefined
      repairedAvailable = repairedGlobalAvailable && !repairedConsumed && !earlierPending && repairedNow() < Date.parse(repaired.expiresAt) && Number.isSafeInteger(providerRemaining) && providerRemaining >= 0
    } catch { repaired = null }
  }
  let projectCommitted = false, projectAvailable = false
  if (project) {
    try {
      const [record, pointer] = await Promise.all([storage.get(ASTRA_PROJECT_BUDGET_KEY), storage.get<{ id: string }>(CURRENT_STUDIO_JOB)])
      const current = pointer ? await storage.get<Job>(`job:${pointer.id}`) : undefined
      projectCommitted = projectGlobalCommitted || record !== undefined
      projectAvailable = projectGlobalAvailable && !projectCommitted && current?.state !== 'reserved' &&
        repairedNow() < Date.parse(project.expiresAt) && Number.isSafeInteger(providerRemaining) && providerRemaining >= 0
    } catch { project = null }
  }
  const subscriptionActive = active(subscription, now)
  const pointsMembership = pointsProtocol && await paidMembership(storage, subscription, now)
  const admission = (model: GenerationModel, detailed = false, pricing?: StudioPricing): { allowed: boolean; reason?: AdmissionFailureCode } => {
    const blocked = (reason: AdmissionFailureCode) => ({ allowed: false, reason })
    if (credits < 0 || billingHold === true) return blocked('BILLING_REVIEW_REQUIRED')
    // ASTRA generation is available to every signed-in account regardless of membership plan.
    // Runtime, points and provider-spend guards remain authoritative.
    if (model === 'astra' && !astraEnabled) return blocked('ASTRA_RUNTIME_DISABLED')
    const paid = subscriptionActive || credits > 0
    if (paid && credits - reserved < (pricing?.points ?? MODEL_ECONOMICS[model].creditsPerGeneration)) return blocked('CREDITS_EXHAUSTED')
    if (!paid && model === 'astra') return blocked('FREE_SOL_ONLY')
    if (!paid && free.fast.length >= 2) return blocked('FAST_DAILY_LIMIT')
    if (paid && !pointsMembership && !Number.isSafeInteger(providerRemaining)) return blocked('ACCOUNT_ADMISSION_UNAVAILABLE')
    if (paid && !pointsMembership && providerRemaining < (pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents) && !(model === 'astra' && detailed && !pricing && (supportAvailable || supplementalAvailable || repairedAvailable || projectAvailable))) return blocked('PROVIDER_BUDGET_EXHAUSTED')
    return { allowed: true }
  }
  return {
    paidGenerationPolicy: pointsMembership ? PAID_POINTS_POLICY : 'paid-membership-no-quota-v1',
    generationAdmission: { luna: admission('luna'), sol: admission('sol'), astra: admission('astra') },
    studioAdmission: { ...admission('astra', true), tiers: {
      standard: { ...admission('astra', true, STUDIO_PRICING.standard), pricing: STUDIO_PRICING.standard },
      extended: { ...admission('astra', true, STUDIO_PRICING.extended), pricing: STUDIO_PRICING.extended },
    } },
    ...(support ? { astraSupportOnce: { available: supportAvailable && admission('astra', true).allowed, consumed: supportConsumed, maximumProviderCents: ASTRA_SUPPORT_CENTS } } : {}),
    ...(supplemental ? { astraSupplementalGrant: { available: supplementalAvailable && admission('astra', true).allowed, consumed: supplementalConsumed, maximumProviderCents: ASTRA_SUPPLEMENTAL_CENTS } } : {}),
    ...(repaired ? { astraRepairedMccGrant: { available: repairedAvailable && admission('astra', true).allowed, consumed: repairedConsumed, maximumProviderCents: ASTRA_REPAIRED_MCC_CENTS } } : {}),
    ...(project ? { astraProjectBudget: { available: projectAvailable && admission('astra', true).allowed, committed: projectCommitted, maximumProviderCents: ASTRA_PROJECT_BUDGET_CENTS, maxAttempts: 1 as const } } : {}),
    creatorAstra: { active: astraEnabled && subscriptionActive, remaining: null, maximum: null, recommended: 2, pointsForTwo: 500 },
    credits, reservedCredits: reserved, availableCredits: credits - reserved, generationCost: 50, generationCosts: { sol: 50, astra: 250, luna: 15 }, subscriptionGrant: PLAN_CATALOG[plan].credits,
    subscription: { active: active(subscription, now), plan, expiresAt: subscription?.until ? new Date(subscription.until).toISOString() : null },
    free: { fastRemaining: Math.max(0, 2 - free.fast.length), fastResetAt: free.fast.length ? new Date(Math.min(...free.fast.map(item => item.at)) + DAY).toISOString() : null,
      slowRemaining: 0, slowResetAt: new Date((Math.floor(now / DAY) + 1) * DAY).toISOString() },
    slowDownloadRequiresSubscription: true, billingReview: credits < 0 || billingHold === true,
  }
}

function overnightJobExpiry(job: Job, id: string, accountId: string | null, env: EntitlementEnv, now: number): number {
  if (!Object.hasOwn(job, 'overnightTest')) return Infinity
  const authority = overnightTestAuthority(env, accountId, now), model = job.model ?? (job.profile === 'fast' ? 'sol' : 'astra')
  const workflow = overnightWorkflow(job.channel, model)
  if (!authority || !workflow || !job.fingerprint || job.kind !== 'credits' || job.cost !== MODEL_ECONOMICS[model].creditsPerGeneration ||
      Object.hasOwn(job, 'pricing') || Object.hasOwn(job, 'projectBudget') || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') ||
      Object.hasOwn(job, 'repairedMccGrantId') || Object.hasOwn(job, 'studioProviderReservation') || Object.hasOwn(job, 'blueprintProviderReservation') ||
      !matchesOvernightTestClaim(job.overnightTest, authority, id, job.fingerprint, workflow, now) ||
      (job.channel === 'studio' ? job.billingMode !== 'hold-v1' : job.billingMode !== undefined || boundBlueprintProviderModel(job) !== OVERNIGHT_TEST_WORKFLOWS[workflow].model)) return 0
  return Date.parse(authority.expiresAt)
}
async function overnightPoolCall(env: EntitlementEnv, userId: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const statusRead = path === '/overnight-test-status'
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS || env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') throw new EntitlementError('Live account test funding is unavailable.', 503,
    statusRead ? !ACCOUNT_ID.test(userId) ? 'TEST_ACCOUNT_NOT_APPROVED' : !env.ACCOUNT_ENTITLEMENTS ? 'TEST_POOL_BINDING_MISSING' : 'TEST_LEDGER_NOT_LIVE' : undefined)
  if (statusRead) {
    const diagnostic = overnightTestStatusDiagnostic(env, userId, Date.now())
    if (diagnostic) throw new EntitlementError('The temporary test configuration could not be verified.', 503, diagnostic)
  }
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(OVERNIGHT_TEST_NAMESPACE))
  let response: Response
  try { response = await object.fetch(new Request('https://entitlements.internal' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: internalHeaders(userId), ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })) }
  catch (error) { if (!statusRead) throw error; throw new EntitlementError('The overnight test authority is unavailable.', 503, 'TEST_POOL_REQUEST_FAILED') }
  if (!response.ok && !statusRead) throw new EntitlementError('The overnight test authority is unavailable.')
  const result = await response.json() as Record<string, unknown>
  if (!response.ok) throw new EntitlementError('The overnight test authority is unavailable.', 503,
    statusRead ? isOvernightTestDiagnostic(result?.diagnostic) ? result.diagnostic : 'TEST_POOL_REQUEST_FAILED' : undefined)
  return result
}

/** One internal Durable Object per verified existing Chess account UUID. No passwords or identity database. */
export class AccountEntitlements {
  private storage: EntitlementStorage
  private now: () => number
  private astraEnabled: boolean
  private supportEnv: EntitlementEnv
  private overnightPoolNamespace = false
  private durableObjectId: string | null = null
  constructor(state: { storage: EntitlementStorage; id?: { toString(): string } }, env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now; this.astraEnabled = !!env && typeof env === 'object' && (env as { ENABLE_ASTRA_PLANS?: string }).ENABLE_ASTRA_PLANS === 'true'; this.supportEnv = env && typeof env === 'object' ? env as EntitlementEnv : {}
    try { this.durableObjectId = state.id?.toString() ?? null } catch { /* Unknown namespace cannot apply owner adjustments. */ }
    try { this.overnightPoolNamespace = !!state.id && !!this.supportEnv.ACCOUNT_ENTITLEMENTS && state.id.toString() === String(this.supportEnv.ACCOUNT_ENTITLEMENTS.idFromName(OVERNIGHT_TEST_NAMESPACE)) } catch { /* Unknown namespace never holds test funds. */ }
  }
  async fetch(request: Request): Promise<Response> {
    const requestedPath = new URL(request.url).pathname, pointsProtocol = requestedPath.startsWith(PAID_POINTS_ROUTE_PREFIX + '/')
    const path = pointsProtocol ? requestedPath.slice(PAID_POINTS_ROUTE_PREFIX.length) : requestedPath, now = this.now()
    if (pointsProtocol && !generationPath(path)) return json({ error: 'Unknown generation protocol operation' }, 404)
    const storage = pointsProtocol ? paidPointsStorage(this.storage, paidPointsJob) : this.storage
    try {
      if (path === '/failed-hold-waiver') {
        const account = request.headers.get('X-WORLDIFACT-Verified-Account')
        const matches = pointsProtocol && !!account && ACCOUNT_ID.test(account) && !!this.supportEnv.ACCOUNT_ENTITLEMENTS && this.durableObjectId !== null &&
          this.durableObjectId === String(this.supportEnv.ACCOUNT_ENTITLEMENTS.idFromName(`account:v1:${account.toLowerCase()}`))
        return await failedHoldWaiverLedgerRoute(request, this.storage, this.supportEnv, matches, paidPointsJob, now)
      }
      if (path === '/owner-reserve-adjustment') {
        const account = request.headers.get('X-WORLDIFACT-Verified-Account')
        const matches = !!account && ACCOUNT_ID.test(account) && !!this.supportEnv.ACCOUNT_ENTITLEMENTS && this.durableObjectId !== null &&
          this.durableObjectId === String(this.supportEnv.ACCOUNT_ENTITLEMENTS.idFromName(`account:v1:${account.toLowerCase()}`))
        return await ownerReserveAdjustmentLedgerRoute(request, storage, this.supportEnv, matches, now)
      }
      if (path === '/overnight-test-status' || path === '/overnight-test-claim') {
        if (!this.overnightPoolNamespace) return json({ error: 'Wrong overnight budget namespace.', ...(path === '/overnight-test-status' ? { diagnostic: 'TEST_POOL_NAMESPACE_MISMATCH' } : {}) }, 403)
        return (await overnightTestPoolRoute(request, storage, this.supportEnv, this.now))!
      }
      if (path === '/studio-library' || path.startsWith('/studio-library/')) {
        if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
        const params = new URL(request.url).searchParams
        if (path !== '/studio-library') {
          const id = path.slice('/studio-library/'.length)
          if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || params.size) return json({ error: 'Invalid library model.' }, 400)
          const job = await storage.get<unknown>(`job:${id}`)
          return json({ model: completedLibraryJob(job, now) ? libraryModel(id, job, await libraryPermissions(storage, now)) : null })
        }
        if ([...params.keys()].some(key => key !== 'after') || params.getAll('after').length > 1 ||
            params.has('after') && !libraryCursorKey(params.get('after'))) return json({ error: 'Invalid library cursor.' }, 400)
        if (!storage.list) throw new Error('Account history listing unavailable')
        // Read existing account rows only. No current-job pointer, migration,
        // status projection, funding seed, reconciliation or provider request.
        const after = params.get('after')
        const entries = await storage.list<unknown>({ prefix: 'job:', ...(after ? { startAfter: after } : {}), limit: STUDIO_LIBRARY_SCAN_LIMIT })
        const permissions = await libraryPermissions(storage, now)
        const models: OwnedStudioLibraryModel[] = []
        let cursor: string | null = null
        for (const [key, value] of entries) {
          if (!libraryCursorKey(key) || after && key <= after || cursor && key <= cursor) throw new Error('Invalid account history order')
          cursor = key
          if (/^job:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key) && completedLibraryJob(value, now))
            models.push(libraryModel(key.slice(4), value, permissions))
        }
        models.sort((a, b) => b.completedAt - a.completedAt || b.id.localeCompare(a.id))
        const hasMore = entries.size === STUDIO_LIBRARY_SCAN_LIMIT
        return json({ models, nextCursor: hasMore ? cursor : null, hasMore } satisfies OwnedStudioLibraryPage)
      }
      if (path === '/generation-funding') {
        if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
        let query: ReturnType<typeof generationFundingQuery>
        try { query = generationFundingQuery(new URL(request.url).searchParams) }
        catch { return json({ error: 'Invalid stored evidence query.' }, 400) }
        return json(await storage.transaction(storage => generationFundingSnapshot(storage, request.headers.get('X-WORLDIFACT-Verified-Account'), this.now(), query.evidence?.invoices, query.pendingAfter, pointsProtocol)))
      }
      const support = () => astraSupportApproval(this.supportEnv.WORLDIFACT_ASTRA_SUPPORT_ONCE, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now(), request.headers.get('X-WORLDIFACT-Verified-Email'))
      const supplemental = () => astraSupplementalGrant(this.supportEnv.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now(), request.headers.get('X-WORLDIFACT-Verified-Email'))
      const repaired = () => astraRepairedMccGrant(this.supportEnv.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now(), request.headers.get('X-WORLDIFACT-Verified-Email'))
      const project = () => astraProjectBudget(this.supportEnv.WORLDIFACT_ASTRA_PROJECT_BUDGET, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now())
      if (path === '/astra-project-budget-route' && request.method === 'GET') {
        const record = await storage.get(ASTRA_PROJECT_BUDGET_KEY)
        if (record !== undefined && !isAstraProjectBudgetRecord(record)) return json({ error: 'Project funding source is unavailable.' }, 503)
        const account = request.headers.get('X-WORLDIFACT-Verified-Account'), fingerprint = request.headers.get('X-WORLDIFACT-Project-Fingerprint')
        return json({ selected: matchesAstraProjectScope(record, account, fingerprint) || matchesAstraProjectScope(this.supportEnv.WORLDIFACT_ASTRA_PROJECT_BUDGET, account, fingerprint) })
      }
      if (path === '/astra-project-budget-status' && request.method === 'GET') {
        const committed = await storage.get(ASTRA_PROJECT_BUDGET_KEY) !== undefined
        const approved = project()
        return json({ available: !!approved && !committed, committed: !!approved && committed })
      }
      if (path === '/astra-support-status' && request.method === 'GET') {
        const approved = support(), consumed = approved ? await storage.get(ASTRA_SUPPORT_ONCE_KEY) !== undefined : false
        return json({ available: !!approved && !consumed, consumed })
      }
      if (path === '/astra-supplemental-status' && request.method === 'GET') {
        const approved = supplemental(), consumed = approved ? await storage.get(ASTRA_SUPPLEMENTAL_KEY) !== undefined : false
        return json({ available: !!approved && !consumed, consumed })
      }
      if (path === '/astra-repaired-mcc-status' && request.method === 'GET') {
        const consumed = await storage.get(ASTRA_REPAIRED_MCC_KEY) !== undefined
        const approved = repaired()
        return json({ available: !!approved && !consumed, consumed: !!approved && consumed })
      }
      if (path === '/private-worlds' && request.method === 'POST') return privateWorldStore(request, storage, now)
      if (path === '/status' && request.method === 'GET') return json(await storage.transaction(storage => status(storage, now, this.astraEnabled,
        request.headers.get('X-WORLDIFACT-Support-Status') === 'known' ? support() : null,
        request.headers.get('X-WORLDIFACT-Support-Available') === 'true', request.headers.get('X-WORLDIFACT-Support-Consumed') === 'true',
        request.headers.get('X-WORLDIFACT-Supplemental-Status') === 'known' ? supplemental() : null,
        request.headers.get('X-WORLDIFACT-Supplemental-Available') === 'true', request.headers.get('X-WORLDIFACT-Supplemental-Consumed') === 'true', !!support(),
        request.headers.get('X-WORLDIFACT-Repaired-Mcc-Status') === 'known' ? repaired() : null,
        request.headers.get('X-WORLDIFACT-Repaired-Mcc-Available') === 'true', request.headers.get('X-WORLDIFACT-Repaired-Mcc-Consumed') === 'true',
        !!this.supportEnv.WORLDIFACT_ASTRA_SUPPORT_ONCE, !!this.supportEnv.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT, this.now,
        request.headers.get('X-WORLDIFACT-Project-Budget-Status') === 'known' ? project() : null,
        request.headers.get('X-WORLDIFACT-Project-Budget-Available') === 'true', request.headers.get('X-WORLDIFACT-Project-Budget-Committed') === 'true', pointsProtocol)))
      if (path === '/billing' && request.method === 'GET') return json({ customer: await storage.get<string>('customer') ?? null })
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
      const raw = await request.text()
      if (raw.length > (path === '/blueprint-complete' ? 120_000 : 8192)) return json({ error: 'Invalid internal request' }, 400)
      const input = JSON.parse(raw) as Record<string, unknown>
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid internal request' }, 400)
      if (path === '/astra-project-budget-claim') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) || typeof input.id !== 'string' || !JOB_ID.test(input.id) ||
          typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return json({ approved: false }, 400)
        const id = input.id, fingerprint = input.fingerprint
        return json(await storage.transaction(async storage => {
          const existing = await storage.get(ASTRA_PROJECT_BUDGET_KEY)
          const approved = project(), claimedAt = this.now()
          if (!approved || approved.fingerprint !== fingerprint) return { approved: false }
          if (existing !== undefined) return matchesAstraProjectBudgetRecord(existing, approved, claimedAt, id, fingerprint)
            ? { approved: true, record: existing } : { approved: false }
          const record: AstraProjectBudgetRecord = { ...approved, source: 'project', attemptsUsed: 1, reservedCents: ASTRA_PROJECT_BUDGET_CENTS, jobId: id, at: claimedAt }
          if (!matchesAstraProjectBudgetRecord(record, approved, claimedAt, id, fingerprint)) return { approved: false }
          await storage.put(ASTRA_PROJECT_BUDGET_KEY, record)
          const current = project()
          // Persisted maximum capacity is never released after a late response.
          if (!current || !matchesAstraProjectBudgetRecord(record, current, this.now(), id, fingerprint)) return { approved: false }
          return { approved: true, record }
        }))
      }
      if (path === '/astra-repaired-mcc-claim') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) || typeof input.id !== 'string' || !JOB_ID.test(input.id) ||
          typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return json({ approved: false }, 400)
        const id = input.id, fingerprint = input.fingerprint
        return json(await storage.transaction(async storage => {
          const existing = await storage.get(ASTRA_REPAIRED_MCC_KEY)
          const approved = repaired(), claimedAt = this.now()
          if (!approved || approved.fingerprint !== fingerprint) return { approved: false }
          if (existing !== undefined) return matchesAstraRepairedMccClaim(existing, approved, claimedAt, id, fingerprint)
            ? { approved: true, claim: existing } : { approved: false }
          const claim: AstraRepairedMccClaim = { ...approved, jobId: id, at: claimedAt }
          if (!matchesAstraRepairedMccClaim(claim, approved, claimedAt, id, fingerprint)) return { approved: false }
          await storage.put(ASTRA_REPAIRED_MCC_KEY, claim)
          // A persisted claim is never removed after a late acknowledgement.
          if (!repaired() || this.now() >= Date.parse(claim.expiresAt)) return { approved: false }
          return { approved: true, claim }
        }))
      }
      if (path === '/astra-supplemental-claim') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) || typeof input.id !== 'string' || !JOB_ID.test(input.id) ||
          typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return json({ approved: false }, 400)
        const id = input.id, fingerprint = input.fingerprint
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job?.fingerprint) return { state: 'unknown', owned: false }
          if (path === '/blueprint-status' && (Object.hasOwn(input, 'fingerprint') && input.fingerprint !== job.fingerprint ||
              Object.hasOwn(input, 'expectedProviderModel') && input.expectedProviderModel !== boundBlueprintProviderModel(job)))
            return { state: job.state, owned: true, conflict: true }
          // Timeout closes generation; new paid points stay held for unresolved cost.
          // Completion and timeout race in this same atomic transaction.
          if (job.state === 'reserved' && now - job.at > 10 * 60_000 && (!result || !paidPointsJob(job))) {
            await settleReservedJob(storage, id, job, 'failed', now)
            const terminal = await storage.get<Job>(`job:${id}`)
            return { state: 'failed', refunded: terminal?.pointSettlement ? terminal.pointSettlement.state === 'released' : true, ...(terminal?.pointSettlement ? { pointSettlement: terminal.pointSettlement } : {}) }
          }
          if (result && (job.state === 'reserved' || job.pointSettlement?.state === 'pending-cost')) {
            if (paidPointsJob(job) && job.providerLiability.state === 'unsubmitted') return { state: job.state, saved: false }
            const expected = boundBlueprintProviderModel(job)
            if (result.model !== expected) return { state: job.state, saved: false }
            await storage.put(`blueprint-result:${id}`, result)
            await settleReservedJob(storage, id, job, 'completed', now, undefined, true)
            const completed = await storage.get<Job>(`job:${id}`)
            return { state: 'completed', saved: true, result, ...(completed?.pointSettlement ? { pointSettlement: completed.pointSettlement } : {}) }
          }
          return { state: job.state, refunded: job.pointSettlement ? job.pointSettlement.state === 'released' : job.state === 'failed', ...(job.pointSettlement ? { pointSettlement: job.pointSettlement } : {}), ...(job.state === 'completed' ? { result: await storage.get<GenerationResult>(`blueprint-result:${id}`) } : {}) }
        }))
      }
      if (path === '/studio-current') {
        if (Object.keys(input).some(key => key !== 'id') || input.id !== undefined && (typeof input.id !== 'string' || !JOB_ID.test(input.id))) return json({ error: 'Invalid owned Studio selection' }, 400)
        const pointer = input.id ? { id: input.id as string } : await storage.get<{ id: string }>(CURRENT_STUDIO_JOB)
        if (!pointer?.id || !JOB_ID.test(pointer.id)) return json({ job: null })
        const job = await storage.get<Job>(`job:${pointer.id}`)
        if (!job || input.id && !paidPointsJob(job, pointer.id) || job.channel !== 'studio' || !job.fingerprint || !/^[a-f0-9]{64}$/.test(job.fingerprint)) return json({ job: null })
        const fundingSource = paidPointsJob(job) ? PAID_POINTS_FUNDING : !Object.hasOwn(job, 'overnightTest') ? 'ordinary' : isOvernightTestClaim(job.overnightTest) &&
          job.overnightTest.jobId === pointer.id && job.overnightTest.accountId === request.headers.get('X-WORLDIFACT-Verified-Account') &&
          job.overnightTest.fingerprint === job.fingerprint && job.overnightTest.workflow === 'detailed-astra' ? OVERNIGHT_TEST_APPROVAL : 'unknown'
        return json({ job: { id: pointer.id, fundingSource, fingerprint: job.fingerprint, prompt: job.prompt ?? 'Recovered cloud model', at: job.at,
          updatedAt: job.updatedAt ?? job.at, state: job.state, cost: job.cost, ...(job.pricing ? { pricing: job.pricing } : {}), held: job.pointSettlement ? job.pointSettlement.heldPoints > 0 : job.billingMode === 'hold-v1' && job.state === 'reserved', ...(job.pointSettlement ? { pointSettlement: job.pointSettlement } : {}),
          ...(job.qualityProfile ? { qualityProfile: job.qualityProfile } : {}), ...(job.failureCode ? { failureCode: job.failureCode } : {}) } satisfies CurrentStudioJob })
      }
      if (path === '/studio-current-clear') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid job' }, 400)
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${input.id}`)
          if (!job || job.channel !== 'blueprint' || job.fingerprint !== input.fingerprint || job.state !== 'reserved' || job.blueprintDispatch !== 'ready-v1') return { dispatch: false }
          const claimedAt = this.now()
          const testExpiry = overnightJobExpiry(job, String(input.id), request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv, claimedAt)
          if (!Number.isSafeInteger(job.at) || claimedAt < job.at || claimedAt >= job.at + BLUEPRINT_JOB_WINDOW_MS || claimedAt >= testExpiry) return { dispatch: false }
          const deadline = Math.min(claimedAt + BLUEPRINT_DISPATCH_WINDOW_MS, job.at + BLUEPRINT_JOB_WINDOW_MS, testExpiry)
          if (paidPointsJob(job) && (!await paidMembership(storage, await storage.get<Subscription>('subscription'), claimedAt) || await storage.get('billingHold') === true || await balance(storage) < await reservedCredits(storage) || (job.profile === 'slow' && !this.astraEnabled))) return { dispatch: false }
          await storage.put(`job:${input.id}`, { ...job, ...(paidPointsJob(job) ? { providerLiability: { ...job.providerLiability, state: 'unresolved', maximumLiabilityCents: job.providerLiability.capCents } } : {}), blueprintDispatch: 'claimed-v1', blueprintDispatchUntil: deadline })
          return { dispatch: true, deadline }
        }))
      }
      if (path === '/studio-dispatch') {
        if (Object.keys(input).some(key => !['id', 'fingerprint'].includes(key)) ||
            typeof input.id !== 'string' || !JOB_ID.test(input.id) || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))
          return json({ error: 'Invalid Studio dispatch commitment' }, 400)
        return json(await storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${input.id}`)
          if (!job || job.channel !== 'studio' || job.fingerprint !== input.fingerprint || job.state !== 'reserved' || job.studioDispatch !== 'ready-v1') return { dispatch: false }
          const repairedJob = Object.hasOwn(job, 'repairedMccGrantId') || Object.hasOwn(job, 'repairedMccClaim')
          let repairedExpiry = overnightJobExpiry(job, String(input.id), request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv, this.now())
          if (Object.hasOwn(job, 'overnightTest') && this.now() >= repairedExpiry) return { dispatch: false }
          if (repairedJob) {
            const claim = job.repairedMccClaim, marker = await storage.get(ASTRA_REPAIRED_MCC_KEY)
            const grant = claim ? astraRepairedMccGrant(JSON.stringify({ version: claim.version, accountId: claim.accountId, grantId: claim.grantId,
              issuedAt: claim.issuedAt, expiresAt: claim.expiresAt, amountCents: claim.amountCents, fingerprint: claim.fingerprint }),
              request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now()) : null
            if (!claim || !grant || claim.accountId !== request.headers.get('X-WORLDIFACT-Verified-Account')?.toLowerCase() ||
                job.repairedMccGrantId !== claim.grantId || job.profile !== 'slow' || job.kind !== 'credits' || job.cost !== 250 || job.billingMode !== 'hold-v1' ||
                Object.hasOwn(job, 'pricing') || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') ||
                Object.hasOwn(job, 'studioProviderReservation') || (job.qualityProfile ?? 'standard') !== 'standard' ||
                !matchesAstraRepairedMccClaim(claim, grant, this.now(), String(input.id), String(input.fingerprint)) ||
                !matchesAstraRepairedMccClaim(marker, grant, this.now(), String(input.id), String(input.fingerprint)) || marker.at !== claim.at) return { dispatch: false }
            repairedExpiry = Math.min(repairedExpiry, Date.parse(claim.expiresAt))
          }
          const projectJob = Object.hasOwn(job, 'projectBudget')
          if (projectJob) {
            const record = job.projectBudget, marker = await storage.get(ASTRA_PROJECT_BUDGET_KEY)
            const approved = record ? persistedAstraProjectBudget(record, request.headers.get('X-WORLDIFACT-Verified-Account'), this.supportEnv.ACCOUNT_LEDGER_MODE, this.now()) : null
            if (!record || !approved || job.profile !== 'slow' || job.kind !== 'credits' || job.cost !== 250 || job.billingMode !== 'hold-v1' ||
                Object.hasOwn(job, 'pricing') || Object.hasOwn(job, 'supportApprovalId') || Object.hasOwn(job, 'supplementalGrantId') || repairedJob ||
                Object.hasOwn(job, 'studioProviderReservation') || (job.qualityProfile ?? 'standard') !== 'standard' ||
                !matchesAstraProjectBudgetRecord(record, approved, this.now(), String(input.id), String(input.fingerprint)) ||
                !matchesAstraProjectBudgetRecord(marker, approved, this.now(), String(input.id), String(input.fingerprint)) || marker.at !== record.at) return { dispatch: false }
            repairedExpiry = Math.min(repairedExpiry, Date.parse(record.expiresAt))
          }
          const claimedAt = this.now()
          if (!Number.isSafeInteger(job.at) || claimedAt < job.at || claimedAt >= job.at + STUDIO_SUBMISSION_GRACE_MS || claimedAt >= repairedExpiry) return { dispatch: false }
          const deadline = Math.min(claimedAt + STUDIO_DISPATCH_WINDOW_MS, job.at + STUDIO_SUBMISSION_GRACE_MS, repairedExpiry)
          // One-use fence, atomic with terminal settlement. A lost response is
          // recovery-only; a delayed acknowledgement cannot launch after this
          // bounded deadline. Legacy rows cannot acquire dispatch permission.
          if (paidPointsJob(job) && (!await paidMembership(storage, await storage.get<Subscription>('subscription'), claimedAt) || await storage.get('billingHold') === true || await balance(storage) < await reservedCredits(storage) || (job.profile === 'slow' && !this.astraEnabled))) return { dispatch: false }
          await storage.put(`job:${input.id}`, { ...job, ...(paidPointsJob(job) ? { providerLiability: { ...job.providerLiability, state: 'unresolved', maximumLiabilityCents: job.providerLiability.capCents } } : {}), studioDispatch: 'claimed-v1', studioDispatchUntil: deadline })
          if ((repairedJob || projectJob || job.overnightTest) && this.now() >= repairedExpiry) throw new Error('Bounded MCC dispatch expired before commit')
          return { dispatch: true, deadline }
        }))
      }
      if (path === '/reserve' || path === '/reserve-overnight-test') {
        const overnightRequest = path === '/reserve-overnight-test'
        if (!overnightRequest && Object.hasOwn(input, 'overnightTestClaim')) return json({ error: 'Wrong funding route' }, 400)
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
        const providerModel = input.providerModel
        if (Object.hasOwn(input, 'providerModel') && (channel !== 'blueprint' || !fencedBlueprint || !fingerprint || providerModel !== MODEL_ECONOMICS[selectedModel].model))
          return json({ error: 'Invalid Blueprint provider model binding' }, 400)
        if (Object.hasOwn(input, 'pricing') && (!isStudioPricing(input.pricing) || channel !== 'studio' || selectedModel !== 'astra' || !fingerprint))
          return json({ error: 'Invalid Studio pricing terms' }, 400)
        const pricing = input.pricing as StudioPricing | undefined
        const testAuthority = overnightRequest ? overnightTestAuthority(this.supportEnv, request.headers.get('X-WORLDIFACT-Verified-Account'), this.now()) : null
        const testWorkflow = overnightWorkflow(channel, selectedModel)
        const testClaim = input.overnightTestClaim
        if (overnightRequest && (!testAuthority || !testWorkflow || MODEL_ECONOMICS[selectedModel].model !== OVERNIGHT_TEST_WORKFLOWS[testWorkflow].model || MODEL_ECONOMICS[selectedModel].maxProviderCents !== OVERNIGHT_TEST_WORKFLOWS[testWorkflow].capCents || pricing !== undefined || input.projectBudgetInputEligible === true || input.repairedMccInputEligible === true ||
            !fingerprint || !matchesOvernightTestClaim(testClaim, testAuthority, id, fingerprint, testWorkflow, this.now())))
          return json({ allowed: false, reason: 'ACCOUNT_REQUEST_CONFLICT' }, 429)
        const overnightClaim = overnightRequest ? testClaim as OvernightTestClaim : undefined
        const result = await storage.transaction(async storage => {
          const existing = await storage.get<Job>(`job:${id}`)
          const currentTestAuthority = overnightRequest ? overnightTestAuthority(this.supportEnv, request.headers.get('X-WORLDIFACT-Verified-Account'), this.now()) : null
          if (overnightRequest && (!currentTestAuthority || !testWorkflow || !fingerprint || !matchesOvernightTestClaim(overnightClaim, currentTestAuthority, id, fingerprint, testWorkflow, this.now())))
            return { allowed: false, reason: 'ACCOUNT_ADMISSION_UNAVAILABLE' }
          if (existing && overnightRequest && (!existing.overnightTest || !matchesOvernightTestClaim(existing.overnightTest, currentTestAuthority!, id, fingerprint!, testWorkflow!, this.now()) || existing.overnightTest.claimedAt !== overnightClaim?.claimedAt)) return { allowed: false, repeated: true, reason: 'JOB_FUNDING_SOURCE_MISMATCH' }
          if (existing && existing.fingerprint !== fingerprint) return { allowed: false, repeated: true, reason: 'REQUEST_PAYLOAD_MISMATCH' }
          if (existing?.state === 'failed' && existing.failureCode === 'MISSING_SUBMISSION')
            return { allowed: false, repeated: true, state: existing.state, cost: 0, kind: existing.kind, reason: 'JOB_ALREADY_FAILED' }
          if (existing && existing.profile === profile && (existing.model ?? (existing.profile === 'fast' ? 'sol' : 'astra')) !== selectedModel) return { allowed: false, reason: 'JOB_MODEL_MISMATCH' }
          if (existing && (existing.qualityProfile ?? 'standard') !== qualityProfile) return { allowed: false, reason: 'JOB_QUALITY_PROFILE_MISMATCH' }
          if (existing && !samePricing(existing.pricing, pricing)) return { allowed: false, repeated: true, reason: 'JOB_PRICING_MISMATCH' }
          if (existing && (existing.channel ?? 'blueprint') !== channel) return { allowed: false, reason: 'JOB_CHANNEL_MISMATCH' }
          if (existing) return existing.profile !== profile
            ? { allowed: false, reason: 'JOB_PROFILE_MISMATCH' }
            : { allowed: existing.state !== 'failed' || existing.pointSettlement?.state === 'pending-cost', repeated: true, state: existing.state, cost: existing.cost, kind: existing.kind, ...(existing.pointSettlement ? { pointSettlement: existing.pointSettlement } : {}), ...(existing.fundingMode ? { fundingSource: existing.fundingMode } : existing.overnightTest ? { fundingSource: OVERNIGHT_TEST_APPROVAL } : {}), ...(existing.pricing ? { pricing: existing.pricing } : {}), ...(existing.state === 'failed' ? { reason: 'JOB_ALREADY_FAILED' } : {}) }
          const credits = await balance(storage), heldCredits = await reservedCredits(storage), subscription = await storage.get<Subscription>('subscription')
          if (credits < 0 || await storage.get<boolean>('billingHold') === true) return { allowed: false, reason: 'BILLING_REVIEW_REQUIRED' }
          const subscriptionActive = active(subscription, now)
          const model = selectedModel
          const cost = pricing?.points ?? MODEL_ECONOMICS[model].creditsPerGeneration
          // Do not gate ASTRA by membership plan. Runtime, points and provider-spend
          // guards below still protect the service and prevent unbounded API spend.
          if (model === 'astra' && !this.astraEnabled) return { allowed: false, reason: 'ASTRA_RUNTIME_DISABLED' }
          const paid = subscriptionActive || credits > 0
          const pointsMembership = pointsProtocol && !overnightRequest && !!fingerprint && (channel === 'studio' || fencedBlueprint) && await paidMembership(storage, subscription, this.now())
          if (input.requiredFundingMode !== undefined && (input.requiredFundingMode !== PAID_POINTS_FUNDING || channel !== 'studio' || !pointsMembership)) return { allowed: false, reason: 'ACCOUNT_ADMISSION_UNAVAILABLE' }
          if (pointsMembership && (input.paidPointsPolicy !== PAID_POINTS_POLICY || channel === 'studio' && input.requiredFundingMode !== PAID_POINTS_FUNDING)) return { allowed: false, reason: 'ACCOUNT_ADMISSION_UNAVAILABLE' }
          if (overnightRequest && !paid) return { allowed: false, reason: 'CREDITS_EXHAUSTED' }
          if (paid && credits - heldCredits < cost) return { allowed: false, reason: 'CREDITS_EXHAUSTED' }
          const free = await usage(storage, now)
          if (!paid && profile === 'slow') return { allowed: false, reason: 'FREE_SOL_ONLY' }
          if (!paid && free.fast.length >= 2) return { allowed: false, reason: 'FAST_DAILY_LIMIT' }
          let supportApprovalId: string | undefined
          let supplementalGrantId: string | undefined
          let repairedMccClaim: AstraRepairedMccClaim | undefined
          let projectBudgetRecord: AstraProjectBudgetRecord | undefined
          let studioProviderReservation: StudioProviderReservation | undefined
          let blueprintProviderReservation: StudioProviderReservation | undefined
          if (paid && !overnightRequest && !pointsMembership) {
            // Separate support/project attempts only read the ordinary ledger.
            // Only an actual ordinary reservation may initialize or debit it.
            const repairedConfiguration = repaired()
            const projectConfiguration = project()
            const projectMarker = await storage.get(ASTRA_PROJECT_BUDGET_KEY)
            if (input.projectBudgetInputEligible === true && projectMarker !== undefined && !isAstraProjectBudgetRecord(projectMarker))
              return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
            const projectSelected = request.headers.get('X-WORLDIFACT-Project-Budget-Selected') === 'true' || request.headers.has('X-WORLDIFACT-Project-Budget-Record') ||
              input.projectBudgetInputEligible === true && (matchesAstraProjectScope(projectMarker, request.headers.get('X-WORLDIFACT-Verified-Account'), fingerprint) ||
                matchesAstraProjectScope(this.supportEnv.WORLDIFACT_ASTRA_PROJECT_BUDGET, request.headers.get('X-WORLDIFACT-Verified-Account'), fingerprint))
            const readOnlyProvider = repairedConfiguration || projectSelected || request.headers.has('X-WORLDIFACT-Repaired-Mcc-Claim')
            const providerStored = readOnlyProvider ? await storage.get<number>(PROVIDER_BUDGET) : undefined
            const remaining = readOnlyProvider
              ? providerStored === undefined ? Math.floor(Math.max(0, credits) * 7 / 10) : providerStored
              : await providerBudget(storage, credits)
            if (!Number.isSafeInteger(remaining)) throw new Error('Invalid provider budget')
            const ceiling = pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents
            if (projectSelected) {
              // The exact approved draft exclusively uses its project source.
              // Neither available ordinary funding nor older grants can replace it.
              const pointer = await storage.get<{ id: string }>(CURRENT_STUDIO_JOB)
              const currentJob = pointer ? await storage.get<Job>(`job:${pointer.id}`) : undefined
              const candidate = projectConfiguration && remaining >= 0 && !pricing && ceiling === ASTRA_PROJECT_BUDGET_CENTS &&
                model === 'astra' && channel === 'studio' && profile === 'slow' && qualityProfile === 'standard' && input.projectBudgetInputEligible === true &&
                fingerprint === projectConfiguration.fingerprint && projectMarker === undefined && currentJob?.state !== 'reserved' ? projectConfiguration : null
              if (!candidate) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
              const header = request.headers.get('X-WORLDIFACT-Project-Budget-Record')
              const record: unknown = header && header.length <= 2048 ? JSON.parse(header) : null
              if (!header) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', ...(project() ? { projectBudgetEligible: true } : {}) }
              if (!matchesAstraProjectBudgetRecord(record, candidate, this.now(), id, fingerprint!)) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
              projectBudgetRecord = record
              await storage.put(ASTRA_PROJECT_BUDGET_KEY, projectBudgetRecord)
            } else {
              const candidate = model === 'astra' && channel === 'studio' && fingerprint && remaining >= 0 && ceiling === ASTRA_SUPPORT_CENTS ? support() : null
              const claim = candidate ? await storage.get(ASTRA_SUPPORT_ONCE_KEY) : undefined
              const approved = candidate && claim === undefined && request.headers.get('X-WORLDIFACT-Support-Approval') === candidate.approvalId
              const supplementalCandidate = remaining < ceiling && model === 'astra' && channel === 'studio' && fingerprint && remaining >= 0 && ceiling === ASTRA_SUPPLEMENTAL_CENTS &&
                !(candidate && claim === undefined) ? supplemental() : null
              const supplementalMarker = supplementalCandidate ? await storage.get(ASTRA_SUPPLEMENTAL_KEY) : undefined
              const supplementalHeader = request.headers.get('X-WORLDIFACT-Supplemental-Claim')
              const supplementalClaim: unknown = supplementalHeader && supplementalHeader.length <= 2048 ? JSON.parse(supplementalHeader) : null
              const supplementalApproved = !!supplementalCandidate && supplementalMarker === undefined && matchesAstraSupplementalClaim(supplementalClaim, supplementalCandidate, this.now(), id, fingerprint!)
              const repairedCandidate = repairedConfiguration && (remaining < ceiling || request.headers.has('X-WORLDIFACT-Repaired-Mcc-Claim')) && remaining >= 0 && !pricing && ceiling === ASTRA_REPAIRED_MCC_CENTS &&
                model === 'astra' && channel === 'studio' && profile === 'slow' && qualityProfile === 'standard' && input.repairedMccInputEligible === true &&
                fingerprint === repairedConfiguration.fingerprint && !approved && !supplementalApproved ? repairedConfiguration : null
              let repairedMarker: unknown, earlierPending = true
              if (repairedCandidate) {
                const [old, extra, marker] = await Promise.all([storage.get(ASTRA_SUPPORT_ONCE_KEY), storage.get(ASTRA_SUPPLEMENTAL_KEY), storage.get(ASTRA_REPAIRED_MCC_KEY)])
                repairedMarker = marker
                earlierPending = !!this.supportEnv.WORLDIFACT_ASTRA_SUPPORT_ONCE && old === undefined || !!this.supportEnv.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT && extra === undefined
                if (old && typeof old === 'object' && 'approvalId' in old && old.approvalId === repairedCandidate.grantId ||
                    extra && typeof extra === 'object' && 'grantId' in extra && extra.grantId === repairedCandidate.grantId) earlierPending = true
              }
              const repairedHeader = request.headers.get('X-WORLDIFACT-Repaired-Mcc-Claim')
              const repairedClaim: unknown = repairedHeader && repairedHeader.length <= 2048 ? JSON.parse(repairedHeader) : null
              const repairedApproved = !!repairedCandidate && !earlierPending && repairedMarker === undefined &&
                matchesAstraRepairedMccClaim(repairedClaim, repairedCandidate, this.now(), id, fingerprint!)
              if (request.headers.has('X-WORLDIFACT-Repaired-Mcc-Claim') && !repairedApproved) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
              if (remaining < ceiling && !approved && !supplementalApproved && !repairedApproved) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED',
                ...(candidate && claim === undefined ? { supportEligible: true } : {}), ...(supplementalCandidate && supplementalMarker === undefined ? { supplementalEligible: true } : {}),
                ...(repairedCandidate && !earlierPending && repairedMarker === undefined && repaired() ? { repairedMccEligible: true } : {}) }

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
              if (repairedApproved) {
                repairedMccClaim = repairedClaim as AstraRepairedMccClaim
                await storage.put(ASTRA_REPAIRED_MCC_KEY, repairedMccClaim)
              } else {
                // Preserve original and supplemental writers. The repaired
                // attempt never writes, seeds or recredits this ordinary key.
                await storage.put(PROVIDER_BUDGET, approved || supplementalApproved ? remaining : remaining - ceiling)
              }
              if (channel === 'studio' && fingerprint && !approved && !supplementalApproved && !repairedApproved)
                studioProviderReservation = { version: 1, source: 'ordinary', amountCents: ceiling, state: 'reserved' }
              if (channel === 'blueprint' && fingerprint && fencedBlueprint)
                blueprintProviderReservation = { version: 1, source: 'ordinary', amountCents: ceiling, state: 'reserved' }
            }
          }
          if (overnightClaim && (!testAuthority || !testWorkflow || !fingerprint || !matchesOvernightTestClaim(overnightClaim, testAuthority, id, fingerprint, testWorkflow, this.now()))) throw new Error('Overnight account admission expired before writes')
          const cloudHold = paid && (channel === 'studio' || pointsMembership)
          const job: Job = { ...(pointsMembership ? { fundingMode: PAID_POINTS_FUNDING, pointSettlement: { version: 1 as const, state: 'held' as const, heldPoints: cost, chargedPoints: 0 }, providerLiability: { version: 1 as const, source: 'paid-membership' as const, capCents: pricing?.maxProviderCents ?? MODEL_ECONOMICS[model].maxProviderCents, maximumLiabilityCents: 0, state: 'unsubmitted' as const } } : {}), ...(overnightClaim ? { overnightTest: overnightClaim } : {}), ...(typeof providerModel === 'string' ? { blueprintProviderModel: providerModel } : {}), ...(pricing ? { pricing } : {}), ...(fingerprint ? { fingerprint } : {}), ...(prompt ? { prompt } : {}), ...(supportApprovalId ? { supportApprovalId } : {}), ...(supplementalGrantId ? { supplementalGrantId } : {}), ...(repairedMccClaim ? { repairedMccGrantId: repairedMccClaim.grantId, repairedMccClaim } : {}), ...(projectBudgetRecord ? { projectBudget: projectBudgetRecord } : {}), ...(studioProviderReservation ? { studioProviderReservation } : {}), ...(blueprintProviderReservation ? { blueprintProviderReservation } : {}), ...(channel === 'blueprint' && fingerprint && fencedBlueprint ? { blueprintDispatch: 'ready-v1' as const } : {}), channel: channel as 'studio' | 'blueprint', ...(model === 'luna' ? { model } : {}), ...(qualityProfile !== 'standard' ? { qualityProfile: qualityProfile as StudioQualityProfile } : {}), profile, at: now, updatedAt: now, cost: paid ? cost : 0, kind: paid ? 'credits' : 'free', ...(cloudHold ? { billingMode: 'hold-v1' as const } : {}), state: 'reserved', ...(channel === 'studio' ? { studioDispatch: 'ready-v1' as const } : {}) }
          if (cloudHold) await changeReservedCredits(storage, cost)
          else if (paid) await storage.put('balance', credits - cost)
          else { free.fast.push({ id, at: now }); await storage.put('usage', free) }
          await storage.put(`job:${id}`, job)
          if (channel === 'studio') await storage.put(CURRENT_STUDIO_JOB, { id })
          if (repairedMccClaim) {
            const current = repaired()
            if (!current || !matchesAstraRepairedMccClaim(repairedMccClaim, current, this.now(), id, fingerprint!))
              throw new Error('Repaired MCC admission expired before account commit')
          }
          if (projectBudgetRecord) {
            const current = project()
            if (!current || !matchesAstraProjectBudgetRecord(projectBudgetRecord, current, this.now(), id, fingerprint!))
              throw new Error('Project budget admission expired before account commit')
          }
          if (overnightClaim && (!overnightTestAuthority(this.supportEnv, request.headers.get('X-WORLDIFACT-Verified-Account'), this.now()) || this.now() >= Date.parse(overnightClaim.expiresAt))) throw new Error('Overnight account admission expired before commit')
          return { allowed: true, repeated: false, cost: job.cost, kind: job.kind, held: cloudHold, ...(job.pointSettlement ? { pointSettlement: job.pointSettlement } : {}), ...(job.fundingMode ? { fundingSource: job.fundingMode } : job.overnightTest ? { fundingSource: OVERNIGHT_TEST_APPROVAL } : {}), ...(job.blueprintProviderModel ? { providerModel: job.blueprintProviderModel } : {}), ...(job.pricing ? { pricing: job.pricing } : {}) }
        })
        return json(result, result.allowed ? 200 : 429)
      }
      if (path === '/studio-provider-pending' || path === '/provider-reconciliation-pending') {
        if (Object.keys(input).some(key => key !== 'cursor') ||
            input.cursor !== undefined && input.cursor !== null && (typeof input.cursor !== 'string' || !JOB_ID.test(input.cursor)))
          return json({ error: 'Invalid reconciliation cursor' }, 400)
        // Only this verified account's existing records are enumerated. Reading
        // a page neither seeds funding nor infers payment from an old failure.
        if (!storage.list) throw new Error('Account history listing unavailable')
        const entries = await storage.list<Job>({ prefix: 'job:', ...(input.cursor ? { startAfter: `job:${input.cursor}` } : {}), limit: 64 })
        const ids: string[] = [], blueprintIds: string[] = []
        let cursor: string | null = null, consumed = 0
        for (const [key, job] of entries) {
          if (!/^job:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) throw new Error('Invalid account job key')
          cursor = key.slice(4); consumed++
          // Older writers accepted uppercase UUIDs. Preserve their exact key
          // for pagination, but Oracle's receipt protocol accepts lowercase IDs.
          if (cursor === cursor.toLowerCase() && job && typeof job === 'object' && !Array.isArray(job) && providerBudgetPending(job)) ids.push(cursor)
          if (path === '/provider-reconciliation-pending' && job && !Object.hasOwn(job, 'blueprintProviderReconciliation') && (completedOrdinaryBlueprint(job) || job.channel === 'blueprint' && job.state === 'completed' && paidLiabilityPending(job))) blueprintIds.push(cursor)
          if (ids.length + blueprintIds.length === 8) break
        }
        const hasMore = consumed < entries.size || entries.size === 64
        return json({ ids, ...(path === '/provider-reconciliation-pending' ? { blueprintIds } : {}), nextCursor: hasMore ? cursor : null, hasMore })
      }
      if (path === '/reconcile-blueprint-provider') {
        if (Object.keys(input).length !== 1 || typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid Blueprint reconciliation' }, 400)
        const id = input.id
        return json(await storage.transaction(storage => reconcileCompletedBlueprint(storage, id, this.now())))
      }
      if (path === '/reconcile-studio-provider') {
        if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['id', 'receipt'].includes(key)) ||
            typeof input.id !== 'string' || !validateTerminalBudgetReceipt(input.receipt, input.id))
          return json({ reconciled: false, reason: 'INVALID_RECEIPT' }, 400)
        const id = input.id, receipt = input.receipt
        return json(await storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { reconciled: false, reason: 'NOT_OWNED' }
          if (paidPointsJob(job, id)) {
            if (job.channel !== 'studio' || !['completed', 'failed'].includes(job.state) || !validateTerminalBudgetReceipt(receipt, id, job.pricing ?? null))
              return { reconciled: false, reason: 'INELIGIBLE_RESERVATION' }
            const proof = job.providerLiability.evidence, retainedCents = Math.ceil(receipt.maximumLiabilityMicroUsd / 10_000)
            if (proof) return proof.kind === 'studio-terminal' && Object.keys(receipt).every(key => receipt[key as keyof TerminalBudgetReceipt] === proof.receipt[key as keyof TerminalBudgetReceipt])
              ? { reconciled: true, repeated: true, retainedCents, releasedCents: 0 } : { reconciled: false, reason: 'RECEIPT_CONFLICT' }
            if (job.providerLiability.state !== 'unresolved') return { reconciled: false, reason: 'INELIGIBLE_RESERVATION' }
            let pointSettlement = job.pointSettlement!
            if (job.state === 'failed' && pointSettlement.state === 'pending-cost' && receipt.maximumLiabilityMicroUsd === 0) {
              await changeReservedCredits(storage, -job.cost)
              pointSettlement = { version: 1, state: 'released', heldPoints: 0, chargedPoints: 0 }
            }
            await storage.put(`job:${id}`, { ...job, pointSettlement, providerLiability: { ...job.providerLiability, state: 'bounded', maximumLiabilityCents: retainedCents,
              evidence: { kind: 'studio-terminal', receipt, at: this.now() } } })
            return { reconciled: true, repeated: false, retainedCents, releasedCents: 0, pointSettlement }
          }
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
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return json({ owned: false, downloadAllowed: false, previewOnly: false })
          const subscription = await storage.get<Subscription>('subscription')
          const allowed = job.state === 'completed' && (job.profile === 'fast' || active(subscription, now)) && await balance(storage) >= 0 && await storage.get<boolean>('billingHold') !== true
          const dispatchUntil = studioDispatchUntil(job)
          return json({ owned: true, ...(job.pointSettlement ? { channel: job.channel, model: job.model ?? (job.profile === 'fast' ? 'sol' : 'astra') } : {}), ...(job.fingerprint ? { fingerprint: job.fingerprint } : {}), downloadAllowed: allowed, previewOnly: job.profile === 'slow' && !active(subscription, now), profile: job.profile, ...(job.qualityProfile ? { qualityProfile: job.qualityProfile } : {}), ...(job.failureCode ? { failureCode: job.failureCode } : {}), state: job.state, at: job.at, updatedAt: job.updatedAt ?? job.at, cost: job.cost, ...(job.pricing ? { pricing: job.pricing } : {}), held: job.pointSettlement ? job.pointSettlement.heldPoints > 0 : job.billingMode === 'hold-v1' && job.state === 'reserved', ...(job.pointSettlement ? { pointSettlement: job.pointSettlement } : {}), ...(dispatchUntil ? { studioDispatchUntil: dispatchUntil } : {}), ...(providerBudgetPending(job) ? { providerBudgetPending: true } : {}) })
        }
        if (!['completed', 'failed'].includes(String(input.state))) return json({ error: 'Invalid settlement' }, 400)
        const next = input.state as 'completed' | 'failed'
        if (Object.hasOwn(input, 'validatedLateCompletion') && (next !== 'completed' || input.validatedLateCompletion !== 'existing-model-v1')) return json({ error: 'Invalid late completion evidence' }, 400)
        if (input.failureCode !== undefined && (next !== 'failed' || !STUDIO_FAILURE_CODES.includes(input.failureCode as StudioFailureCode))) return json({ error: 'Invalid failure diagnostic' }, 400)
        if (Object.hasOwn(input, 'blueprintTerminalUsage') && (next !== 'failed' || Object.hasOwn(input, 'failureCode'))) return json({ error: 'Invalid Blueprint usage settlement' }, 400)
        return json(await storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { settled: false, reason: 'NOT_OWNED' }
          // A 404 snapshot can predate a claim which won this same transaction
          // queue. Recheck the dispatch tail atomically with missing-job closure;
          // real Oracle terminal failures retain their existing settlement path.
          const dispatchUntil = studioDispatchUntil(job)
          if (job.state === 'reserved' && next === 'failed' && input.failureCode === 'ORACLE_JOB_MISSING' && dispatchUntil && this.now() < dispatchUntil + STUDIO_ORACLE_TIMEOUT_MS)
            return { settled: false }
          if (paidPointsJob(job, id) && job.state === 'reserved' && next === 'failed' && job.channel === 'blueprint' && job.providerLiability.state === 'unresolved') {
            const evidence = input.blueprintTerminalUsage, settledAt = this.now()
            if (validateBlueprintTerminalUsage(evidence) && evidence.accountId === request.headers.get('X-WORLDIFACT-Verified-Account')?.toLowerCase() &&
                evidence.requestId === id && evidence.fingerprint === job.fingerprint && evidence.model === boundBlueprintProviderModel(job) &&
                evidence.reservedCents === job.providerLiability.capCents && evidence.dispatchDeadline === job.blueprintDispatchUntil &&
                evidence.dispatchedAt >= job.at && evidence.receivedAt <= settledAt) {
              const model = job.model ?? (job.profile === 'fast' ? 'sol' : 'astra'), retained = blueprintRetainedCents(model, evidence.inputTokens, evidence.outputTokens)
              if (retained <= job.providerLiability.capCents) {
                const result = await settleReservedJob(storage, id, job, next, settledAt)
                const settled = await storage.get<Job>(`job:${id}`)
                await storage.put(`job:${id}`, { ...settled, providerLiability: { ...job.providerLiability, state: 'bounded', maximumLiabilityCents: retained,
                  evidence: { kind: 'blueprint-failure', usage: evidence, at: settledAt } } })
                return result
              }
            }
          }
          if (job.state === 'reserved' && next === 'failed' && !Object.hasOwn(job, 'blueprintProviderReconciliation')) {
            const settledAt = this.now(), evidence = input.blueprintTerminalUsage
            const liability = failedBlueprintLiability(job, evidence, request.headers.get('X-WORLDIFACT-Verified-Account'), id, settledAt)
            if (liability && validateBlueprintTerminalUsage(evidence)) {
              // This optional read precedes all writes. Its failure leaves
              // provider state untouched and must not cancel a points refund.
              const remaining = await storage.get<number>(PROVIDER_BUDGET).catch(() => undefined)
              if (Number.isSafeInteger(remaining) && Number.isSafeInteger(Number(remaining) + liability.releasedCents)) {
                const marker: FailedBlueprintProviderReconciliation = { revision: 'blueprint-failed-output-v1', evidence, ...liability, at: settledAt }
                // Refund points, persist proof and release only bounded unused
                // ordinary capacity together, or roll all of them back.
                const result = await settleReservedJob(storage, id, { ...job, blueprintProviderReconciliation: marker }, next, settledAt)
                await storage.put(PROVIDER_BUDGET, Number(remaining) + liability.releasedCents)
                return result
              }
              // An unusable provider ledger cannot cancel the existing points
              // refund. Preserve its bytes and unknown liability; never reseed.
            }
          }
          // Terminal results are immutable. Transport uncertainty MUST NOT call /settle failed.
          return settleReservedJob(storage, id, job, next, now, input.failureCode as StudioFailureCode | undefined, input.validatedLateCompletion === 'existing-model-v1' && job.channel === 'studio')
        }))
      }
      if (path === '/customer') {
        if (typeof input.customer !== 'string' || !/^cus_[A-Za-z0-9]{1,180}$/.test(input.customer)) return json({ error: 'Invalid customer' }, 400)
        const customer = input.customer
        return json(await storage.transaction(async storage => {
          const existing = await storage.get<string>('customer')
          if (existing && existing !== customer) return { saved: false }
          await storage.put('customer', customer); return { saved: true }
        }))
      }
      if (path === '/grant') {
        if (!grantId(input.id) || !validInteger(input.credits) || (input.credits as number) < 1 || (input.credits as number) > 1_000_000) return json({ error: 'Invalid grant' }, 400)
        const id = input.id, credits = input.credits as number
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        const owned = await storage.get<{ id: string }>(`paypal:order:${input.orderId}`)
        return json(owned ? { owned: true, id: owned.id } : { owned: false })
      }
      if (path === '/paypal-clear') {
        if (typeof input.id !== 'string' || !ACCOUNT_ID.test(input.id)) return json({ error: 'Invalid PayPal checkout' }, 400)
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
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
        return json(await storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${input.kind}`)
          const previousPlan = previous?.plan ?? (input.kind === 'subscription' ? 'creator' : undefined)
          if (!previous || previous.id !== input.id || previousPlan !== plan) return { saved: false }
          await storage.put(`checkout:${input.kind}`, { ...previous, url: input.url, expiresAt: input.expiresAt, sessionId: input.sessionId }); return { saved: true }
        }))
      }
      if (path === '/checkout-clear') {
        if (!['subscription', 'topup'].includes(String(input.kind)) || typeof input.id !== 'string') return json({ error: 'Invalid checkout' }, 400)
        return json(await storage.transaction(async storage => {
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
  supplemental?: { available?: boolean; consumed?: boolean; statusKnown?: boolean; claim?: AstraSupplementalClaim };
  repaired?: { available?: boolean; consumed?: boolean; statusKnown?: boolean; claim?: AstraRepairedMccClaim };
  project?: { selected?: boolean; available?: boolean; committed?: boolean; statusKnown?: boolean; record?: AstraProjectBudgetRecord } }
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
    ...(support?.supplemental?.claim ? { 'X-WORLDIFACT-Supplemental-Claim': JSON.stringify(support.supplemental.claim) } : {}),
    ...(support?.repaired?.statusKnown === true ? { 'X-WORLDIFACT-Repaired-Mcc-Status': 'known' } : {}),
    ...(support?.repaired?.available === true ? { 'X-WORLDIFACT-Repaired-Mcc-Available': 'true' } : {}),
    ...(support?.repaired?.consumed === true ? { 'X-WORLDIFACT-Repaired-Mcc-Consumed': 'true' } : {}),
    ...(support?.repaired?.claim ? { 'X-WORLDIFACT-Repaired-Mcc-Claim': JSON.stringify(support.repaired.claim) } : {}),
    ...(support?.project?.selected === true ? { 'X-WORLDIFACT-Project-Budget-Selected': 'true' } : {}),
    ...(support?.project?.statusKnown === true ? { 'X-WORLDIFACT-Project-Budget-Status': 'known' } : {}),
    ...(support?.project?.available === true ? { 'X-WORLDIFACT-Project-Budget-Available': 'true' } : {}),
    ...(support?.project?.committed === true ? { 'X-WORLDIFACT-Project-Budget-Committed': 'true' } : {}),
    ...(support?.project?.record ? { 'X-WORLDIFACT-Project-Budget-Record': JSON.stringify(support.project.record) } : {}) }
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
  try { response = await object.fetch(new Request(`https://entitlements.internal${generationPath(path) ? PAID_POINTS_ROUTE_PREFIX : ''}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: internalHeaders(userId, support), ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })) }
  catch { throw new EntitlementError('Account allowances are temporarily unavailable.') }
  if (!response.ok && !(['/reserve', '/reserve-overnight-test'].includes(path) && response.status === 429)) throw new EntitlementError('Account allowances are temporarily unavailable.')
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
async function repairedMccCall(env: EntitlementEnv, userId: string, identity?: AstraSupportIdentity, body?: { id: string; fingerprint: string }): Promise<{ available?: boolean; consumed?: boolean; claim?: AstraRepairedMccClaim }> {
  if (!env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT || (env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live')) return {}
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('A verified account allowance is required.')
  const configuration = env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ASTRA_REPAIRED_MCC_NAMESPACE))
  try {
    const response = await object.fetch(new Request(`https://entitlements.internal/astra-repaired-mcc-${body ? 'claim' : 'status'}`, {
      method: body ? 'POST' : 'GET', headers: internalHeaders(userId, { identity }), ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    }))
    if (!response.ok) throw new Error('Unconfirmed repaired MCC state')
    const result = await response.json() as Record<string, unknown>
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid repaired MCC state')
    if (!body) {
      if (Object.keys(result).length !== 2 || typeof result.available !== 'boolean' || typeof result.consumed !== 'boolean' || (result.available && result.consumed)) throw new Error('Invalid repaired MCC status')
      return { available: result.available, consumed: result.consumed }
    }
    if (result.approved === false && Object.keys(result).length === 1) return {}
    const claim = result.claim as AstraRepairedMccClaim | undefined
    const approved = astraRepairedMccGrant(configuration, userId, env.ACCOUNT_LEDGER_MODE, claim?.at as number, identity?.emailVerified === true ? identity.email : null)
    if (result.approved !== true || Object.keys(result).length !== 2 || !approved || !matchesAstraRepairedMccClaim(claim, approved, claim?.at as number, body.id, body.fingerprint)) throw new Error('Invalid repaired MCC claim')
    return { claim }
  } catch { throw new EntitlementError('The repaired MCC allowance could not be confirmed. Keep the same job; do not start another.') }
}
async function projectBudgetSelected(env: EntitlementEnv, userId: string, fingerprint: string): Promise<boolean> {
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('A verified account allowance is required.')
  if (env.ACCOUNT_LEDGER_MODE === 'sandbox') return false
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ASTRA_PROJECT_BUDGET_NAMESPACE))
  try {
    const response = await object.fetch(new Request('https://entitlements.internal/astra-project-budget-route', {
      headers: { ...internalHeaders(userId), 'X-WORLDIFACT-Project-Fingerprint': fingerprint }, signal: AbortSignal.timeout(5000),
    }))
    if (!response.ok) throw new Error('Unconfirmed project source')
    const result = await response.json() as Record<string, unknown>
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).length !== 1 || typeof result.selected !== 'boolean') throw new Error('Invalid project source')
    return result.selected
  } catch { throw new EntitlementError('The project funding source could not be confirmed. Keep the same job; do not start another.') }
}
async function projectBudgetCall(env: EntitlementEnv, userId: string, body?: { id: string; fingerprint: string }): Promise<{ available?: boolean; committed?: boolean; record?: AstraProjectBudgetRecord }> {
  if (!env.WORLDIFACT_ASTRA_PROJECT_BUDGET || (env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live')) return {}
  if (!ACCOUNT_ID.test(userId) || !env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('A verified account allowance is required.')
  const configuration = env.WORLDIFACT_ASTRA_PROJECT_BUDGET
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ASTRA_PROJECT_BUDGET_NAMESPACE))
  try {
    const response = await object.fetch(new Request(`https://entitlements.internal/astra-project-budget-${body ? 'claim' : 'status'}`, {
      method: body ? 'POST' : 'GET', headers: internalHeaders(userId), ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    }))
    if (!response.ok) throw new Error('Unconfirmed project budget')
    const result = await response.json() as Record<string, unknown>
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid project budget')
    if (!body) {
      if (Object.keys(result).length !== 2 || typeof result.available !== 'boolean' || typeof result.committed !== 'boolean' || (result.available && result.committed)) throw new Error('Invalid project budget status')
      return { available: result.available, committed: result.committed }
    }
    if (result.approved === false && Object.keys(result).length === 1) return {}
    const record = result.record as AstraProjectBudgetRecord | undefined
    const approved = astraProjectBudget(configuration, userId, env.ACCOUNT_LEDGER_MODE, record?.at as number)
    if (result.approved !== true || Object.keys(result).length !== 2 || !approved || !matchesAstraProjectBudgetRecord(record, approved, record?.at as number, body.id, body.fingerprint)) throw new Error('Invalid project budget record')
    return { record }
  } catch { throw new EntitlementError('The project budget could not be confirmed. Keep the same job; do not start another.') }
}
export async function entitlementStatus(env: EntitlementEnv, userId: string, identity?: AstraSupportIdentity) {
  const [support, supplemental, repaired, project] = await Promise.all([
    supportCall(env, userId, identity).catch(() => ({} as { available?: boolean; consumed?: boolean })),
    supplementalCall(env, userId, identity).catch(() => ({} as { available?: boolean; consumed?: boolean })),
    repairedMccCall(env, userId, identity).catch(() => ({} as { available?: boolean; consumed?: boolean })),
    projectBudgetCall(env, userId).catch(() => ({} as { available?: boolean; committed?: boolean })),
  ]) // Optional support cannot hide ordinary account availability.
  return entitlementCall<EntitlementStatus>(env, userId, '/status', undefined, { identity, available: support.available, consumed: support.consumed, statusKnown: typeof support.available === 'boolean',
    supplemental: { available: supplemental.available, consumed: supplemental.consumed, statusKnown: typeof supplemental.available === 'boolean' },
    repaired: { available: repaired.available, consumed: repaired.consumed, statusKnown: typeof repaired.available === 'boolean' },
    project: { available: project.available, committed: project.committed, statusKnown: typeof project.available === 'boolean' } })
}
export async function reserveUserGeneration(env: EntitlementEnv, userId: string, jobId: string, profile: GenerationKind, model?: GenerationModel, fingerprint?: string, qualityProfile?: StudioQualityProfile, metadata?: { requiredFundingMode?: typeof PAID_POINTS_FUNDING; paidPointsPolicy?: string | null; overnightTest?: boolean; providerModel?: string; channel?: 'studio' | 'blueprint'; prompt?: string; supportIdentity?: AstraSupportIdentity; pricing?: StudioPricing; blueprintDispatch?: 'fenced-v1'; repairedMccInputEligible?: boolean; projectBudgetInputEligible?: boolean }) {
  const body = { id: jobId, profile, ...(metadata?.paidPointsPolicy != null ? { paidPointsPolicy: metadata.paidPointsPolicy } : {}), ...(metadata?.requiredFundingMode ? { requiredFundingMode: metadata.requiredFundingMode } : {}), ...(metadata?.providerModel !== undefined ? { providerModel: metadata.providerModel } : {}), ...(metadata?.projectBudgetInputEligible === true ? { projectBudgetInputEligible: true } : {}), ...(metadata?.repairedMccInputEligible === true ? { repairedMccInputEligible: true } : {}), ...(model ? { model } : {}), ...(fingerprint ? { fingerprint } : {}), ...(qualityProfile && qualityProfile !== 'standard' ? { qualityProfile } : {}), ...(metadata?.channel ? { channel: metadata.channel } : {}), ...(metadata?.blueprintDispatch ? { blueprintDispatch: metadata.blueprintDispatch } : {}), ...(metadata?.prompt ? { prompt: metadata.prompt } : {}), ...(metadata?.pricing !== undefined ? { pricing: metadata.pricing } : {}) }
  if (metadata?.overnightTest) {
    const workflow = overnightWorkflow(metadata.channel, model ?? (profile === 'fast' ? 'sol' : 'astra'))
    if (env.ENFORCE_ACCOUNT_ENTITLEMENTS !== 'true' || !workflow || !fingerprint || metadata.pricing !== undefined || metadata.projectBudgetInputEligible || metadata.repairedMccInputEligible)
      throw new EntitlementError('This request is outside the approved overnight test scope.')
    const economics = MODEL_ECONOMICS[model ?? (profile === 'fast' ? 'sol' : 'astra')]
    if (economics.model !== OVERNIGHT_TEST_WORKFLOWS[workflow].model || economics.maxProviderCents !== OVERNIGHT_TEST_WORKFLOWS[workflow].capCents) throw new EntitlementError('The overnight model or price is not reviewed.')
    const authority = overnightTestAuthority(env, userId, Date.now())
    if (!authority) throw new EntitlementError('The overnight test authority is unavailable or expired.')
    const record = await overnightPoolCall(env, userId, '/overnight-test-claim', { jobId, fingerprint, workflow })
    if (record.approved !== true) return { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }
    if (!matchesOvernightTestClaim(record.claim, authority, jobId, fingerprint, workflow, Date.now())) throw new EntitlementError('The overnight test commitment could not be verified.')
    const reservation = await entitlementCall<Reservation>(env, userId, '/reserve-overnight-test', { ...body, overnightTestClaim: record.claim })
    if (reservation.allowed && (reservation.fundingSource !== OVERNIGHT_TEST_APPROVAL || reservation.kind !== 'credits' || reservation.cost !== MODEL_ECONOMICS[model ?? (profile === 'fast' ? 'sol' : 'astra')].creditsPerGeneration))
      throw new EntitlementError('The overnight account reservation could not be verified.')
    return reservation
  }
  const identity = metadata?.supportIdentity
  const pointsMember = metadata?.projectBudgetInputEligible === true && (await entitlementCall<EntitlementStatus>(env, userId, '/status')).paidGenerationPolicy === PAID_POINTS_POLICY
  const selected = !pointsMember && metadata?.projectBudgetInputEligible === true && metadata.channel === 'studio' && profile === 'slow' &&
    (model === undefined || model === 'astra') && !!fingerprint && metadata.pricing === undefined
    ? await projectBudgetSelected(env, userId, fingerprint) : false
  const initial = await entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, project: { selected } })
  if (initial.allowed || initial.reason !== 'PROVIDER_BUDGET_EXHAUSTED' || metadata?.pricing !== undefined || metadata?.channel !== 'studio' || profile !== 'slow' || (model !== undefined && model !== 'astra') || !fingerprint) return initial
  if (selected && initial.projectBudgetEligible === true && metadata?.projectBudgetInputEligible === true) {
    const project = await projectBudgetCall(env, userId, { id: jobId, fingerprint })
    if (!project.record) return initial
    const reservation = await entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, project: { record: project.record } })
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation) || typeof reservation.allowed !== 'boolean' ||
        (reservation.allowed && (reservation.cost !== 250 || reservation.kind !== 'credits' || Object.keys(reservation).length !== 5 ||
          Object.keys(reservation).some(key => !['allowed', 'repeated', 'cost', 'kind', 'held', 'state'].includes(key)) ||
          !(reservation.repeated === false && reservation.held === true && reservation.state === undefined ||
            reservation.repeated === true && ['reserved', 'completed'].includes(String(reservation.state))))))
      throw new EntitlementError('The project account reservation could not be confirmed. Keep the same job; do not start another.')
    return reservation
  }
  if (selected) return initial
  // Claim globally before adding account funding. Uncertain/failed account
  // admission never releases this claim; only this exact job can replay it.
  if (initial.supportEligible === true) {
    const claim = await supportCall(env, userId, identity, { id: jobId, fingerprint })
    if (!claim.approved) return initial
    return entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, approvalId: claim.approvalId })
  }
  // Never fall through after attempting the original grant. Its unconfirmed
  // or globally-only claim may still belong to this job.
  if (initial.supplementalEligible === true) {
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
  if (initial.repairedMccEligible !== true || metadata?.repairedMccInputEligible !== true) return initial
  const repaired = await repairedMccCall(env, userId, identity, { id: jobId, fingerprint })
  if (!repaired.claim) return initial
  const reservation = await entitlementCall<Reservation>(env, userId, '/reserve', body, { identity, repaired: { claim: repaired.claim } })
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation) || typeof reservation.allowed !== 'boolean' ||
      (reservation.allowed && (reservation.cost !== 250 || reservation.kind !== 'credits' || Object.keys(reservation).length !== 5 ||
        Object.keys(reservation).some(key => !['allowed', 'repeated', 'cost', 'kind', 'held', 'state'].includes(key)) ||
        !(reservation.repeated === false && reservation.held === true && reservation.state === undefined ||
          reservation.repeated === true && ['reserved', 'completed'].includes(String(reservation.state))))))
    throw new EntitlementError('The repaired MCC account reservation could not be confirmed. Keep the same job; do not start another.')
  return reservation
}
export const settleUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, state: 'completed' | 'failed', failureCode?: StudioFailureCode, validatedLateCompletion = false) => entitlementCall<{ settled: boolean; repeated?: boolean; pointSettlement?: PointSettlement }>(env, userId, '/settle', { id: jobId, state, ...(failureCode ? { failureCode } : {}), ...(validatedLateCompletion ? { validatedLateCompletion: 'existing-model-v1' } : {}) })
export const settleFailedBlueprint = (env: EntitlementEnv, userId: string, jobId: string, evidence: BlueprintTerminalUsage) => entitlementCall<{ settled: boolean; repeated?: boolean; pointSettlement?: PointSettlement }>(env, userId, '/settle', { id: jobId, state: 'failed', blueprintTerminalUsage: evidence })
export async function pendingUserStudioProvider(env: EntitlementEnv, userId: string, cursor: string | null = null): Promise<StudioProviderReconciliationPage> {
  const page = await entitlementCall<StudioProviderReconciliationPage>(env, userId, '/provider-reconciliation-pending', { cursor })
  if (!page || typeof page !== 'object' || Array.isArray(page) || Object.keys(page).length !== 4 ||
      !Array.isArray(page.ids) || page.ids.length > 8 || page.ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) ||
      !Array.isArray(page.blueprintIds) || page.ids.length + page.blueprintIds.length > 8 || page.blueprintIds.some(id => typeof id !== 'string' || !JOB_ID.test(id)) ||
      new Set([...page.ids, ...page.blueprintIds]).size !== page.ids.length + page.blueprintIds.length || typeof page.hasMore !== 'boolean' ||
      (page.hasMore ? typeof page.nextCursor !== 'string' || !JOB_ID.test(page.nextCursor) || (cursor !== null && page.nextCursor <= cursor) : page.nextCursor !== null))
    throw new EntitlementError('Account history could not be verified.')
  return page
}
export const reconcileUserBlueprintProvider = (env: EntitlementEnv, userId: string, id: string) => entitlementCall<StudioProviderReconciliationResult>(env, userId, '/reconcile-blueprint-provider', { id })
export async function reconcileUserStudioProvider(env: EntitlementEnv, userId: string, jobId: string, receipt: TerminalBudgetReceipt): Promise<StudioProviderReconciliationResult> {
  if (!validateTerminalBudgetReceipt(receipt, jobId)) throw new EntitlementError('The terminal provider receipt could not be verified.')
  return entitlementCall<StudioProviderReconciliationResult>(env, userId, '/reconcile-studio-provider', { id: jobId, receipt })
}
export const userJobAccess = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<JobAccess>(env, userId, '/job', { id: jobId })
export const userStudioLibrary = (env: EntitlementEnv, userId: string, after: string | null) => entitlementCall<OwnedStudioLibraryPage>(env, userId, `/studio-library${after ? `?after=${encodeURIComponent(after)}` : ''}`)
export const userStudioLibraryModel = (env: EntitlementEnv, userId: string, id: string) => entitlementCall<{ model: OwnedStudioLibraryModel | null }>(env, userId, `/studio-library/${id}`)
export const currentUserStudioJob = (env: EntitlementEnv, userId: string, id?: string) => entitlementCall<{ job: CurrentStudioJob | null }>(env, userId, '/studio-current', id ? { id } : {})
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
  if (new URL(request.url).pathname === '/api/account/failed-hold-waiver') return failedHoldWaiverApi(request, env, fetcher)
  if (new URL(request.url).pathname === '/api/account/owner-reserve-adjustment') return ownerReserveAdjustmentApi(request, env, fetcher)
  if (['/api/account/generation-funding', '/api/overnight-tests/status'].includes(new URL(request.url).pathname)) {
    const statusRead = new URL(request.url).pathname === '/api/overnight-tests/status'
    const reply = (value: unknown, code = 200) => Response.json(value, { status: code,
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', ...(code === 405 ? { Allow: 'GET' } : {}) } })
    if (request.method !== 'GET') return reply({ error: 'Use GET.' }, 405)
    let evidence: { invoices: string[] } | null = null, pendingAfter: string | undefined
    if (statusRead && new URL(request.url).search) return reply({ error: 'Query parameters are not supported.' }, 400)
    try { if (!statusRead) { const query = generationFundingQuery(new URL(request.url).searchParams); evidence = query.evidence; pendingAfter = query.pendingAfter } }
    catch { return reply({ error: 'Invalid stored evidence query.' }, 400) }
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)
      return reply({ error: 'Same-origin account access required.' }, 403)
    let diagnostic: OvernightTestDiagnostic = 'TEST_AUTH_UNAVAILABLE'
    try {
      const user = await getVerifiedAccount(request, env, fetcher)
      if (!user) return reply({ error: 'Sign in to view your generation funding.', ...(statusRead ? { diagnostic: 'TEST_SIGN_IN_REQUIRED' } : {}) }, 401)
      const expectedAccount = statusRead || hasTestAccountHeaders(request.headers)
      if (expectedAccount && !testAccountMatches(request.headers, user.id)) return reply({ error: 'The signed-in account does not match this test page. Refresh the account before continuing.', diagnostic: 'TEST_ACCOUNT_NOT_APPROVED' }, 403)
      diagnostic = 'TEST_STATUS_PROTECTION_UNAVAILABLE'
      const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
      if (!limiter) return reply({ error: 'Account protection is unavailable.', ...(statusRead ? { diagnostic } : {}) }, 503)
      if (!(await limiter.limit({ key: `account:generation-funding:${user.id.toLowerCase()}` })).success)
        return reply({ error: 'Please wait before reading generation funding again.', ...(statusRead ? { diagnostic: 'TEST_STATUS_RATE_LIMITED' } : {}) }, 429)
      diagnostic = 'TEST_POOL_REQUEST_FAILED'
      if (statusRead) return reply({ ...await overnightPoolCall(env, user.id, '/overnight-test-status'), accountContract: TEST_ACCOUNT_CONTRACT })
      const params = evidence ? new URLSearchParams([['evidence', 'stored-v1'], ...evidence.invoices.map((invoice): [string, string] => ['invoice', invoice])]) : new URLSearchParams()
      if (pendingAfter) params.set('pendingAfter', pendingAfter)
      const query = params.toString()
      return reply(await entitlementCall<GenerationFundingSnapshot>(env, user.id, `/generation-funding${query ? `?${query}` : ''}`))
    } catch (error) { return reply({ error: 'Generation funding is temporarily unavailable.', ...(statusRead ? {
      diagnostic: error instanceof EntitlementError && isOvernightTestDiagnostic(error.testDiagnostic) ? error.testDiagnostic : diagnostic,
    } : {}) }, 503) }
  }
  if (new URL(request.url).pathname !== '/api/account/entitlements') return null
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your allowance.' }, 401)
    const expectedAccount = hasTestAccountHeaders(request.headers)
    if (expectedAccount && !testAccountMatches(request.headers, user.id)) return json({ error: 'The signed-in account changed. Refresh before continuing.', diagnostic: 'TEST_ACCOUNT_NOT_APPROVED' }, 403)
    return json({ ...await entitlementStatus(env, user.id, user), ...(expectedAccount ? { accountContract: TEST_ACCOUNT_CONTRACT } : {}) })
  } catch (error) { return json({ error: error instanceof EntitlementError ? error.message : 'Account allowances are unavailable.' }, error instanceof EntitlementError ? error.status : 503) }
}
