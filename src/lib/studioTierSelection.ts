import { STUDIO_PRICING, STUDIO_PRICING_REVISION, type StudioBudgetTier } from './studioPricing.ts'
import type { StudioInput, StudioJob, StudioStatus } from './studioProtocol.ts'

/** An advertised price is usable only after the exact server contract is ready. */
export function studioTiersReady(status: StudioStatus | null): boolean {
  return status?.ready === true && status.detailedReady === true && status.tiersReady === true && status.pricingRevision === STUDIO_PRICING_REVISION &&
    (status.newJobPolicy === undefined || status.newJobPolicy === 'tiered-v1')
}

export function studioBudgetSelection(tier: StudioBudgetTier, accepted: boolean): Pick<StudioInput, 'budgetTier' | 'acceptedPoints' | 'pricingRevision'> {
  if (tier === 'extended' && !accepted) throw new Error('Accept 500 points for this exact draft before starting the extended model budget.')
  return { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: tier, acceptedPoints: STUDIO_PRICING[tier].points }
}

/** Consent is tied to one render-stable input revision, never to a recovered job. */
export function hasStudioBudgetConsent(tier: StudioBudgetTier, acceptedRevision: object | null, currentRevision: object): boolean {
  return tier === 'standard' || acceptedRevision === currentRevision
}

export function studioBudgetFailureAdvice(job: StudioJob | null, _tiersAvailable = true): string | null {
  if (job?.state !== 'failed' || job.failureCode !== 'MODEL_BUDGET_EXCEEDED') return null
  // A guarded reservation failure does not prove an over-complex prompt, a
  // missing private candidate, or that spending more would complete the model.
  // Keep this execution explanation independent of the financial settlement.
  return 'The worker stopped because its next API request did not fit the remaining model budget. This request has no completed, verified model for the preview or completed-model gallery. Keep this job ID for review. Recovery checks the same request without starting another generation.'
}
