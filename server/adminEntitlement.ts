import { isStudioPricing } from '../src/lib/studioPricing.ts'
import { validateTerminalBudgetReceipt } from './studioBudgetReceipt.ts'
import type { EntitlementStorage } from './entitlements.ts'
import { MODEL_ECONOMICS, type GenerationModel } from './generationEconomics.ts'

/** Private operator configuration. No HTTP registration or profile-derived role. */
export interface AdminEnv {
  WORLDIFACT_ADMIN_ENABLED?: string
  WORLDIFACT_ADMIN_ALLOCATION?: string
  ACCOUNT_LEDGER_MODE?: string
}
export interface AdminAllocation {
  version: 1
  accountId: string
  approvalId: string
  startsAt: number
  expiresAt: number
  maxProviderCents: number
  maxJobs: number
  models: GenerationModel[]
}
export interface AdminFunding { allocation: AdminAllocation; capCents: number }
export interface AdminBudget { allocation: AdminAllocation; committedCents: number; jobs: number }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const FIELDS = ['version', 'accountId', 'approvalId', 'startsAt', 'expiresAt', 'maxProviderCents', 'maxJobs', 'models']
export const ADMIN_JOB_PREFIX = 'admin-job:v1:'
export const ADMIN_FENCE = 'admin-fence-v1'
const PREFIX = 'admin-allocation:v1:'
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
export function validAdminAllocation(v: unknown): v is AdminAllocation {
  if (!record(v) || Object.keys(v).length !== FIELDS.length || Object.keys(v).some(k => !FIELDS.includes(k))) return false
  return v.version === 1 && typeof v.accountId === 'string' && UUID.test(v.accountId) && typeof v.approvalId === 'string' && UUID.test(v.approvalId) &&
    positive(v.startsAt) && positive(v.expiresAt) && v.expiresAt > v.startsAt && v.expiresAt - v.startsAt <= 31 * 86400000 &&
    positive(v.maxProviderCents) && v.maxProviderCents <= 100000 && positive(v.maxJobs) && v.maxJobs <= 1000 &&
    Array.isArray(v.models) && v.models.length > 0 && v.models.length <= 3 && new Set(v.models).size === v.models.length && v.models.every(m => ['sol', 'astra', 'luna'].includes(String(m)))
}
export function adminAllocation(env: AdminEnv, accountId: string | null, now: number): AdminAllocation | null {
  if (env.WORLDIFACT_ADMIN_ENABLED !== 'true' || !['live', 'sandbox'].includes(env.ACCOUNT_LEDGER_MODE ?? '') || !accountId ||
    !env.WORLDIFACT_ADMIN_ALLOCATION || env.WORLDIFACT_ADMIN_ALLOCATION.length > 2048) return null
  try {
    const v: unknown = JSON.parse(env.WORLDIFACT_ADMIN_ALLOCATION)
    return validAdminAllocation(v) && v.accountId === accountId.toLowerCase() && now >= v.startsAt && now < v.expiresAt ? v : null
  } catch { return null }
}
export const sameAllocation = (a: AdminAllocation, b: AdminAllocation) => FIELDS.every(k => JSON.stringify(a[k as keyof AdminAllocation]) === JSON.stringify(b[k as keyof AdminAllocation]))
export function validAdminFunding(value: unknown): value is AdminFunding {
  return record(value) && Object.keys(value).length === 2 && validAdminAllocation(value.allocation) && positive(value.capCents) && value.capCents <= value.allocation.maxProviderCents
}
export async function adminBudget(storage: Pick<EntitlementStorage, 'get'>, allocation: AdminAllocation): Promise<AdminBudget> {
  const saved = await storage.get<AdminBudget>(PREFIX + allocation.approvalId)
  if (saved === undefined) return { allocation, committedCents: 0, jobs: 0 }
  if (!record(saved) || Object.keys(saved).length !== 3 || !validAdminAllocation(saved.allocation) || !sameAllocation(saved.allocation, allocation) ||
    !Number.isSafeInteger(saved.committedCents) || saved.committedCents < 0 || saved.committedCents > allocation.maxProviderCents ||
    !Number.isSafeInteger(saved.jobs) || saved.jobs < 0 || saved.jobs > allocation.maxJobs) throw new Error('Admin allocation changed or unavailable')
  return saved
}
/** Caller MUST already hold the same transaction that persists the job. Never refund uncertain provider liability. */
export async function reserveAdminBudget(storage: EntitlementStorage, allocation: AdminAllocation, capCents: number): Promise<boolean> {
  const budget = await adminBudget(storage, allocation)
  if (!positive(capCents) || budget.jobs >= allocation.maxJobs || budget.committedCents + capCents > allocation.maxProviderCents) return false
  await storage.put(PREFIX + allocation.approvalId, { allocation, committedCents: budget.committedCents + capCents, jobs: budget.jobs + 1 })
  return true
}
export function adminDispatchAllowed(env: AdminEnv, accountId: string | null, funding: AdminFunding, model: GenerationModel, now: number) {
  const current = adminAllocation(env, accountId, now)
  return !!current && validAdminFunding(funding) && sameAllocation(current, funding.allocation) && current.models.includes(model)
}
export function adminJob(value: unknown): boolean {
  if (!record(value) || !validAdminFunding(value.adminFunding)) return false
  const fields = ['adminFunding','adminTerminalReceipt','fingerprint','channel','model','blueprintProviderModel','prompt','pricing','qualityProfile','profile','at','updatedAt','cost','kind','state','studioDispatch','studioDispatchUntil','blueprintDispatch','blueprintDispatchUntil','failureCode']
  if (Object.keys(value).some(k => !fields.includes(k)) || typeof value.model !== 'string' || !Object.hasOwn(MODEL_ECONOMICS, value.model) ||
    (value.profile === 'slow') !== (value.model === 'astra') || !['fast','slow'].includes(String(value.profile)) ||
    !value.adminFunding.allocation.models.includes(value.model as GenerationModel) || value.at === undefined ||
    Number(value.at) < value.adminFunding.allocation.startsAt || Number(value.at) >= value.adminFunding.allocation.expiresAt ||
    !positive(value.updatedAt) || value.updatedAt < Number(value.at)) return false
  if (value.pricing !== undefined && (!isStudioPricing(value.pricing) || value.channel !== 'studio' || value.model !== 'astra')) return false
  const cap = isStudioPricing(value.pricing) ? value.pricing.maxProviderCents : MODEL_ECONOMICS[value.model as GenerationModel].maxProviderCents
  if (value.adminFunding.capCents !== cap || value.channel === 'studio' && value.model !== 'astra') return false
  const dispatch = value.channel === 'studio' ? value.studioDispatch : value.blueprintDispatch
  const deadline = value.channel === 'studio' ? value.studioDispatchUntil : value.blueprintDispatchUntil
  if (!['ready-v1','claimed-v1'].includes(String(dispatch)) || (dispatch === 'ready-v1' ? deadline !== undefined : !positive(deadline) || deadline <= Number(value.at))) return false
  if (value.adminTerminalReceipt !== undefined && (value.channel !== 'studio' || !validateTerminalBudgetReceipt(value.adminTerminalReceipt, String((value.adminTerminalReceipt as Record<string,unknown>)?.jobId), isStudioPricing(value.pricing) ? value.pricing : null))) return false
  return value.cost === 0 && value.kind === 'credits' && value.billingMode === undefined && value.fundingMode === undefined && value.pointSettlement === undefined &&
    value.providerLiability === undefined && value.overnightTest === undefined && value.studioProviderReservation === undefined && value.blueprintProviderReservation === undefined &&
    value.projectBudget === undefined && value.supportApprovalId === undefined && value.supplementalGrantId === undefined && value.repairedMccClaim === undefined &&
    ['studio', 'blueprint'].includes(String(value.channel)) && ['reserved', 'completed', 'failed'].includes(String(value.state)) &&
    typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fingerprint) && positive(value.at)
}
export function adminFence(job: Record<string, unknown>) {
  return { fundingMode: ADMIN_FENCE, fingerprint: job.fingerprint, channel: job.channel, profile: job.profile, at: job.at, updatedAt: job.at,
    cost: 0, kind: 'free', state: 'failed', failureCode: 'MISSING_SUBMISSION' }
}
export function matchingAdminFence(v: unknown, job: Record<string, unknown>) {
  const expected = adminFence(job)
  return record(v) && Object.keys(v).length === Object.keys(expected).length && Object.entries(expected).every(([k, value]) => v[k] === value)
}
