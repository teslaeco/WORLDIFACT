import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'
export type QuotedModel = GenerationModel
export type GenerationQuote = { state: 'pending' | 'signin' | 'free' | 'credits' | 'blocked'; points: number | null; after: number | null; message: string }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && typeof value === 'number' && value >= 0

/** Display only. The server must reserve allowance again before any provider work. */
export function quoteGeneration(model: QuotedModel, account: unknown, billing: unknown, signedIn: boolean): GenerationQuote {
  if (!signedIn) return { state: 'signin', points: null, after: null, message: 'Sign in to check your points and funded free allowance.' }
  const value = object(account), subscription = object(value.subscription), free = object(value.free), costs = object(value.generationCosts)
  if (!integer(value.credits) || typeof subscription.active !== 'boolean' || costs[model] !== MODEL_CATALOG[model].creditsPerGeneration)
    return { state: 'pending', points: null, after: null, message: 'Your current balance and generation cost could not be verified. No payment is inferred.' }
  if (value.billingReview !== false)
    return { state: 'blocked', points: null, after: null, message: 'Your account needs billing review before another generation.' }
  const points = MODEL_CATALOG[model].creditsPerGeneration
  if (model === 'astra') {
    const plans = object(object(billing).plans), pro = object(plans.pro), studio = object(plans.studio)
    if (pro.blockedReason === 'ASTRA_COST_GUARD_REQUIRED' || studio.blockedReason === 'ASTRA_COST_GUARD_REQUIRED')
      return { state: 'blocked', points, after: null, message: 'ASTRA purchasing is paused until live generation and export validation passes. No payment or automatic SOL substitution.' }
    if (!subscription.active || !['pro', 'studio'].includes(String(subscription.plan)))
      return { state: 'blocked', points, after: null, message: 'ASTRA currently requires an active Pro or Studio plan. A one-time top-up alone does not unlock ASTRA.' }
    if (object(plans[String(subscription.plan)]).checkoutReady !== true)
      return { state: 'blocked', points, after: null, message: 'ASTRA availability could not be verified. Your points are unchanged.' }
  }
  if (model !== 'astra' && !subscription.active && value.credits === 0) {
    if (!integer(free.fastRemaining)) return { state: 'pending', points: null, after: null, message: 'Free SOL allowance could not be verified.' }
    return free.fastRemaining > 0
      ? { state: 'free', points: 0, after: 0, message: 'One funded free draft attempt: 0 points. The shared promotional pool is checked by the server at submission.' }
      : { state: 'blocked', points, after: null, message: 'Your personal free allowance is used. Wait for its reset or buy prepaid SOL credits without a subscription.' }
  }
  if (value.credits < points) return { state: 'blocked', points, after: null, message: 'Not enough points for this model. No generation has started.' }
  return { state: 'credits', points, after: value.credits - points, message: 'One explicit generation attempt. Points are reserved by the server; this button does not start a subscription or charge a card.' }
}
