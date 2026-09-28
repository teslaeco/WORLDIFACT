export type GenerationModel = 'sol' | 'astra'

export const MODEL_ECONOMICS = Object.freeze({
  sol: Object.freeze({
    model: 'gpt-6-sol',
    creditsPerGeneration: 50,
    maxProviderCents: 35,
  }),
  astra: Object.freeze({
    model: 'gpt-6-astra',
    creditsPerGeneration: 250,
    maxProviderCents: 175,
  }),
} satisfies Record<GenerationModel, { model: string; creditsPerGeneration: number; maxProviderCents: number }>)

export const PLAN_RESERVES_BPS = Object.freeze({
  paymentAndFx: 500,
  infrastructure: 1500,
  freePromotion: 500,
  refundsAndRisk: 500,
  minimumProfit: 3000,
})

export const FREE_PROMO_POLICY = Object.freeze({
  model: 'sol' as const,
  maxProviderCents: 15,
  paidTierFallback: 'demo' as const,
})

export const PLAN_CATALOG = Object.freeze({
  creator: Object.freeze({
    name: 'Creator SOL',
    amountCents: 2999,
    credits: 1500,
    allowedModels: ['sol'] as const,
  }),
  pro: Object.freeze({
    name: 'Pro ASTRA',
    amountCents: 9999,
    credits: 4500,
    allowedModels: ['sol', 'astra'] as const,
  }),
  studio: Object.freeze({
    name: 'Studio ASTRA',
    amountCents: 14999,
    credits: 7500,
    allowedModels: ['sol', 'astra'] as const,
  }),
})

export type PlanId = keyof typeof PLAN_CATALOG

const ceilBps = (amountCents: number, bps: number) => Math.ceil(amountCents * bps / 10_000)

export function providerReserveCents(credits: number) {
  // Both paid model policies reserve exactly 0.7 cents of provider spend per credit:
  // SOL:   $0.35 / 50 credits
  // ASTRA: $1.75 / 250 credits
  return Math.ceil(credits * 7 / 10)
}

export function planEconomics(planId: PlanId) {
  const plan = PLAN_CATALOG[planId]
  const provider = providerReserveCents(plan.credits)
  const paymentAndFx = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.paymentAndFx)
  const infrastructure = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.infrastructure)
  const freePromotion = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.freePromotion)
  const refundsAndRisk = ceilBps(plan.amountCents, PLAN_RESERVES_BPS.refundsAndRisk)
  const reserved = provider + paymentAndFx + infrastructure + freePromotion + refundsAndRisk
  const profit = plan.amountCents - reserved
  const marginBps = Math.floor(profit * 10_000 / plan.amountCents)
  return {
    ...plan,
    provider,
    paymentAndFx,
    infrastructure,
    freePromotion,
    refundsAndRisk,
    profit,
    marginBps,
    fundedFreeSolJobs: Math.floor(freePromotion / FREE_PROMO_POLICY.maxProviderCents),
  }
}

export function modelAllowed(planId: PlanId, model: GenerationModel) {
  return PLAN_CATALOG[planId].allowedModels.includes(model as never)
}
