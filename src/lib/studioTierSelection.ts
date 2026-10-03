import { STUDIO_PRICING, STUDIO_PRICING_REVISION, type StudioBudgetTier } from './studioPricing.ts'
import type { StudioInput, StudioJob, StudioStatus } from './studioProtocol.ts'

/** An advertised price is usable only after the exact server contract is ready. */
export function studioTiersReady(status: StudioStatus | null): boolean {
  return status?.ready === true && status.detailedReady === true && status.tiersReady === true && status.pricingRevision === STUDIO_PRICING_REVISION
}

export function studioBudgetSelection(tier: StudioBudgetTier, accepted: boolean): Pick<StudioInput, 'budgetTier' | 'acceptedPoints' | 'pricingRevision'> {
  if (tier === 'extended' && !accepted) throw new Error('Accept 500 points for this exact draft before starting the extended model budget.')
  return { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: tier, acceptedPoints: STUDIO_PRICING[tier].points }
}

/** Consent is tied to one render-stable input revision, never to a recovered job. */
export function hasStudioBudgetConsent(tier: StudioBudgetTier, acceptedRevision: object | null, currentRevision: object): boolean {
  return tier === 'standard' || acceptedRevision === currentRevision
}

export function studioBudgetFailureAdvice(job: StudioJob | null): string | null {
  if (job?.failureCode !== 'MODEL_BUDGET_EXCEEDED') return null
  return job.pricing?.tier === 'extended'
    ? 'Simplify this draft before starting another explicit attempt. No automatic paid retry was started.'
    : 'Simplify this draft, or select and explicitly accept the 500-point budget when available. No automatic upgrade or paid retry was started.'
}
