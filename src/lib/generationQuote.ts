import { STUDIO_PRICING, type StudioBudgetTier } from './studioPricing.ts'
import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'
import { ADMISSION_FAILURE_DETAILS, isAdmissionFailureCode, type AdmissionFailureCode } from './generationAdmission.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING } from './paidPointsFunding.ts'
export type QuotedModel = GenerationModel
export type GenerationQuote = { state: 'pending' | 'signin' | 'free' | 'credits' | 'blocked'; points: number | null; after: number | null; message: string; reason?: AdmissionFailureCode; fundingSource?: typeof PAID_POINTS_FUNDING }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export type GenerationBalance = { total: number; held: number; available: number }
/** Reject incomplete or inconsistent account amounts instead of inventing funds. */
export function readGenerationBalance(account: unknown): GenerationBalance | undefined {
  const value = object(account)
  if (!integer(value.credits) || !integer(value.reservedCredits) || !integer(value.availableCredits) ||
      value.reservedCredits > value.credits || value.availableCredits !== value.credits - value.reservedCredits) return undefined
  return { total: value.credits, held: value.reservedCredits, available: value.availableCredits }
}
/** Non-binding display only. The server rechecks identity, model and funds atomically. */
export function quoteGeneration(model: QuotedModel, account: unknown, billing: unknown, signedIn: boolean, detailed = false, budgetTier?: StudioBudgetTier): GenerationQuote {
  if (!signedIn) return { state: 'signin', points: null, after: null, message: 'Sign in to check your points and funded free allowance.' }
  const value = object(account), subscription = object(value.subscription), free = object(value.free), costs = object(value.generationCosts)
  const tier = detailed && model === 'astra' ? budgetTier : undefined
  const points = tier ? STUDIO_PRICING[tier].points : MODEL_CATALOG[model].creditsPerGeneration
  const pendingAdmission = (): GenerationQuote => ({ state: 'pending', points: null, after: null, message: 'Your current generation availability could not be verified. No payment is inferred.' })
  // A new or malformed funding contract cannot be reinterpreted as legacy
  // admission. Only genuinely absent historical markers retain that fallback.
  if (Object.hasOwn(value, 'paidGenerationPolicy') && value.paidGenerationPolicy !== PAID_POINTS_POLICY &&
      value.paidGenerationPolicy !== 'paid-membership-no-quota-v1') return pendingAdmission()
  const pointsPolicy = value.paidGenerationPolicy === PAID_POINTS_POLICY
  const pointsFunded = pointsPolicy && subscription.active === true && typeof subscription.plan === 'string' && ['creator', 'pro', 'studio'].includes(subscription.plan)
  let admissionVerified = false
  if (tier) {
    const admission = object(object(object(value.studioAdmission).tiers)[tier]), pricing = object(admission.pricing), expected = STUDIO_PRICING[tier]
    if (pricing.revision !== expected.revision || pricing.tier !== tier || pricing.points !== expected.points || pricing.maxProviderCents !== expected.maxProviderCents) return pendingAdmission()
    if (admission.allowed === false && isAdmissionFailureCode(admission.reason))
      return { state: 'blocked', points, after: null, message: ADMISSION_FAILURE_DETAILS[admission.reason], reason: admission.reason }
    if (admission.allowed !== true || admission.reason !== undefined) return pendingAdmission()
    admissionVerified = true
  }
  // New authenticated status can explain a refusal even when the displayed
  // point balance is high. Older servers omit this field and retain old checks.
  if (!tier && Object.hasOwn(value, 'generationAdmission')) {
    const admission = detailed && model === 'astra' && Object.hasOwn(value, 'studioAdmission') ? object(value.studioAdmission) : object(object(value.generationAdmission)[model])
    if (admission.allowed === false && isAdmissionFailureCode(admission.reason))
      return { state: 'blocked', points, after: null, message: ADMISSION_FAILURE_DETAILS[admission.reason], reason: admission.reason }
    if (admission.allowed !== true || admission.reason !== undefined)
      return { state: 'pending', points: null, after: null, message: 'Your current generation availability could not be verified. No payment is inferred.' }
    admissionVerified = true
  }
  if (!integer(value.credits) || typeof subscription.active !== 'boolean' || costs.sol !== 50 || costs.astra !== 250 || (model === 'luna' && costs.luna !== 15))
    return { state: 'pending', points: null, after: null, message: 'Your current balance and generation cost could not be verified. No payment is inferred.' }
  if (value.billingReview !== false) return { state: 'blocked', points: null, after: null, message: 'Your account needs billing review before another generation.' }
  // The versioned policy must come with this model's authenticated admission
  // and a complete spendable balance. Membership alone never changes funding.
  if (pointsPolicy && (!admissionVerified || !integer(value.reservedCredits) || !integer(value.availableCredits) ||
      value.availableCredits !== value.credits - value.reservedCredits)) return pendingAdmission()
  const spendable = integer(value.availableCredits) ? value.availableCredits : value.credits
  if (model === 'astra') {
    if (pointsPolicy ? !pointsFunded : !subscription.active || !['creator', 'pro', 'studio'].includes(String(subscription.plan)))
      return { state: 'blocked', points, after: null, message: 'ASTRA requires an active Creator, Pro or Studio plan. A top-up alone does not unlock ASTRA.' }
    if (pointsPolicy || value.paidGenerationPolicy === 'paid-membership-no-quota-v1') {
      // A current authenticated admission checks runtime and funded spend. Sales
      // availability and the retired Creator counter do not gate paid generation.
      if (!admissionVerified) return pendingAdmission()
    } else {
      // Keep old-server guards during a mixed deployment or stale response.
      const plans = object(object(billing).plans), pro = object(plans.pro), studio = object(plans.studio)
      if (pro.blockedReason === 'ASTRA_COST_GUARD_REQUIRED' || studio.blockedReason === 'ASTRA_COST_GUARD_REQUIRED')
        return { state: 'blocked', points, after: null, message: 'ASTRA sales await a successful live generation/export test. The Oracle guard is installed; no automatic model substitution.' }
      if (subscription.plan === 'creator' && (object(value.creatorAstra).active !== true || !integer(object(value.creatorAstra).remaining) || Number(object(value.creatorAstra).remaining) < 1))
        return { state: 'blocked', points, after: null, message: 'This account response still uses the previous Creator ASTRA allowance. Refresh availability to check the current policy; no generation has started.' }
      if (object(plans[String(subscription.plan)]).checkoutReady !== true)
        return { state: 'blocked', points, after: null, message: 'ASTRA availability could not be verified. Your points are unchanged.' }
    }
  }
  if (model !== 'astra' && !subscription.active && spendable === 0) {
    if (!integer(free.fastRemaining)) return { state: 'pending', points: null, after: null, message: 'Your free allowance could not be verified.' }
    return free.fastRemaining > 0
      ? { state: 'free', points: 0, after: 0, message: `One free ${model.toUpperCase()} attempt: 0 points. SOL and LUNA share the daily allowance; the shared promotional pool is checked at submission.` }
      : { state: 'blocked', points, after: null, message: 'Your personal free allowance is used. Wait for its reset or use prepaid credits.' }
  }
  if (spendable < points) return { state: 'blocked', points, after: null, message: 'Not enough available points for this model. No generation has started.', reason: 'CREDITS_EXHAUSTED' }
  return { state: 'credits', points, after: spendable - points, ...(pointsFunded ? { fundingSource: PAID_POINTS_FUNDING } : {}), message: integer(value.reservedCredits) && value.reservedCredits > 0
    ? `One explicit attempt. ${value.reservedCredits} points are already reserved for ${pointsFunded ? 'earlier requests, including any pending cost review' : 'an active cloud job'}; this quote uses only currently available points.`
    : pointsFunded ? 'One explicit attempt. Points are held before dispatch and remain unavailable until the result or verified failure cost is settled. Generation never starts a card or subscription charge.'
    : 'One explicit attempt. Detailed Studio jobs hold points until a valid model completes; generation never starts a card or subscription charge.' }
}
