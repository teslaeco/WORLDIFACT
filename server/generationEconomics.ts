import { MODEL_CATALOG, type GenerationModel } from '../src/lib/modelCatalog.ts'
export type { GenerationModel } from '../src/lib/modelCatalog.ts'
export const MODEL_ECONOMICS = MODEL_CATALOG
export const PLAN_RESERVES_BPS = Object.freeze({ paymentAndFx: 500, infrastructure: 1500, freePromotion: 500, refundsAndRisk: 500, minimumProfit: 3000 })
export const FREE_PROMO_POLICY = Object.freeze({ model: 'sol' as const, allowedModels: ['sol', 'luna'] as const, maxProviderCents: 15, paidTierFallback: 'demo' as const })
export const PLAN_CATALOG = Object.freeze({
  creator: Object.freeze({ name: 'Creator SOL', amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna', 'astra'] as const }),
  pro: Object.freeze({ name: 'Pro ASTRA', amountCents: 9999, credits: 4500, allowedModels: ['sol', 'luna', 'astra'] as const }),
  studio: Object.freeze({ name: 'Studio ASTRA', amountCents: 14999, credits: 7500, allowedModels: ['sol', 'luna', 'astra'] as const }),
})
export type PlanId = keyof typeof PLAN_CATALOG
const ceilBps = (amountCents: number, bps: number) => Math.ceil(amountCents * bps / 10000)
export function providerReserveCents(credits: number) {
  if (!Number.isSafeInteger(credits) || credits < 0) throw new Error('Invalid credit grant')
  // A single upper bound funds any permitted mix: Luna 10/15, Sol 35/50,
  // Astra 175/250 cents per credit. Never reset this budget on point refunds.
  return Math.ceil(credits * 7 / 10)
}
export function planEconomics(planId: PlanId) {
  const plan = PLAN_CATALOG[planId], provider = providerReserveCents(plan.credits)
  const paymentAndFx = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.paymentAndFx)
  const infrastructure = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.infrastructure)
  const freePromotion = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.freePromotion)
  const refundsAndRisk = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.refundsAndRisk)
  const profit = plan.amountCents - provider - paymentAndFx - infrastructure - freePromotion - refundsAndRisk
  return { ...plan, provider, paymentAndFx, infrastructure, freePromotion, refundsAndRisk, profit,
    marginBps: Math.floor(profit * 10000 / plan.amountCents), fundedFreeSolJobs: Math.floor(freePromotion / FREE_PROMO_POLICY.maxProviderCents) }
}
export function modelAllowed(planId: PlanId, model: GenerationModel) { return PLAN_CATALOG[planId].allowedModels.includes(model as never) }
