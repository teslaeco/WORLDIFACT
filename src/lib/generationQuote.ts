import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'
import { ADMISSION_FAILURE_DETAILS, isAdmissionFailureCode, type AdmissionFailureCode } from './generationAdmission.ts'
export type QuotedModel = GenerationModel
export type GenerationQuote = { state: 'pending' | 'signin' | 'free' | 'credits' | 'blocked'; points: number | null; after: number | null; message: string; reason?: AdmissionFailureCode }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
/** Non-binding display only. The server rechecks identity, model and funds atomically. */
export function quoteGeneration(model: QuotedModel, account: unknown, billing: unknown, signedIn: boolean, detailed = false): GenerationQuote {
  if (!signedIn) return { state: 'signin', points: null, after: null, message: 'Sign in to check your points and funded free allowance.' }
  const value = object(account), subscription = object(value.subscription), free = object(value.free), costs = object(value.generationCosts)
  const points = MODEL_CATALOG[model].creditsPerGeneration
  // New authenticated status can explain a refusal even when the displayed
  // point balance is high. Older servers omit this field and retain old checks.
  if (Object.hasOwn(value, 'generationAdmission')) {
    const admission = detailed && model === 'astra' && Object.hasOwn(value, 'studioAdmission') ? object(value.studioAdmission) : object(object(value.generationAdmission)[model])
    if (admission.allowed === false && isAdmissionFailureCode(admission.reason))
      return { state: 'blocked', points, after: null, message: ADMISSION_FAILURE_DETAILS[admission.reason], reason: admission.reason }
    if (admission.allowed !== true || admission.reason !== undefined)
      return { state: 'pending', points: null, after: null, message: 'Your current generation availability could not be verified. No payment is inferred.' }
  }
  if (!integer(value.credits) || typeof subscription.active !== 'boolean' || costs.sol !== 50 || costs.astra !== 250 || (model === 'luna' && costs.luna !== 15))
    return { state: 'pending', points: null, after: null, message: 'Your current balance and generation cost could not be verified. No payment is inferred.' }
  if (value.billingReview !== false) return { state: 'blocked', points: null, after: null, message: 'Your account needs billing review before another generation.' }
  const spendable = integer(value.availableCredits) ? value.availableCredits : value.credits
  if (model === 'astra') {
    const plans = object(object(billing).plans), pro = object(plans.pro), studio = object(plans.studio)
    if (pro.blockedReason === 'ASTRA_COST_GUARD_REQUIRED' || studio.blockedReason === 'ASTRA_COST_GUARD_REQUIRED')
      return { state: 'blocked', points, after: null, message: 'ASTRA sales await a successful live generation/export test. The Oracle guard is installed; no automatic model substitution.' }
    if (!subscription.active || !['creator', 'pro', 'studio'].includes(String(subscription.plan)))
      return { state: 'blocked', points, after: null, message: 'ASTRA requires an active Creator, Pro or Studio plan. A top-up alone does not unlock ASTRA.' }
    if (subscription.plan === 'creator' && (object(value.creatorAstra).active !== true || !integer(object(value.creatorAstra).remaining) || Number(object(value.creatorAstra).remaining) < 1))
      return { state: 'blocked', points, after: null, message: 'Creator ASTRA needs active runtime verification and an unused monthly slot (up to six). Two attempts use 500 of your existing points, not bonus credits.' }
    if (object(plans[String(subscription.plan)]).checkoutReady !== true)
      return { state: 'blocked', points, after: null, message: 'ASTRA availability could not be verified. Your points are unchanged.' }
  }
  if (model !== 'astra' && !subscription.active && spendable === 0) {
    if (!integer(free.fastRemaining)) return { state: 'pending', points: null, after: null, message: 'Your free allowance could not be verified.' }
    return free.fastRemaining > 0
      ? { state: 'free', points: 0, after: 0, message: `One free ${model.toUpperCase()} attempt: 0 points. SOL and LUNA share the daily allowance; the shared promotional pool is checked at submission.` }
      : { state: 'blocked', points, after: null, message: 'Your personal free allowance is used. Wait for its reset or use prepaid credits.' }
  }
  if (spendable < points) return { state: 'blocked', points, after: null, message: 'Not enough available points for this model. No generation has started.', reason: 'CREDITS_EXHAUSTED' }
  return { state: 'credits', points, after: spendable - points, message: integer(value.reservedCredits) && value.reservedCredits > 0
    ? `One explicit attempt. ${value.reservedCredits} points are already reserved for an active cloud job; this quote uses only currently available points.`
    : 'One explicit attempt. Detailed Studio jobs hold points until a valid model completes; generation never starts a card or subscription charge.' }
}
