/** Fixed customer prices and provider ceilings for new detailed Studio jobs.
 * Historical jobs retain the terms recorded when their reservation was made. */
export const STUDIO_PRICING_REVISION = 'studio-pricing-v1' as const
export const STUDIO_BUDGET_TIERS = ['standard', 'extended'] as const
export type StudioBudgetTier = typeof STUDIO_BUDGET_TIERS[number]
export const STUDIO_PRICING = Object.freeze({
  standard: Object.freeze({ revision: STUDIO_PRICING_REVISION, tier: 'standard', points: 250, maxProviderCents: 200 } as const),
  extended: Object.freeze({ revision: STUDIO_PRICING_REVISION, tier: 'extended', points: 500, maxProviderCents: 400 } as const),
})
export type StudioPricing = typeof STUDIO_PRICING[StudioBudgetTier]
export type StudioPricingSelection = { pricingRevision?: typeof STUDIO_PRICING_REVISION; budgetTier?: StudioBudgetTier; acceptedPoints?: 250 | 500 }

/** Consent is supplied by the caller and is never inferred from a tier choice.
 * Omitted fields stay omitted so historical canonical input hashes do not change. */
export function validateStudioPricingSelection(value: { pricingRevision?: unknown; budgetTier?: unknown; acceptedPoints?: unknown }): StudioPricingSelection {
  const { pricingRevision, budgetTier, acceptedPoints } = value
  if (budgetTier !== undefined && budgetTier !== 'standard' && budgetTier !== 'extended')
    throw new Error('Choose a supported Studio budget tier.')
  if (budgetTier === undefined && (pricingRevision !== undefined || acceptedPoints !== undefined))
    throw new Error('Choose a Studio budget tier before accepting its price.')
  if (budgetTier !== undefined && pricingRevision !== STUDIO_PRICING_REVISION)
    throw new Error('Refresh the current Studio price before starting a generation.')
  const pricing = STUDIO_PRICING[budgetTier ?? 'standard']
  if (acceptedPoints !== undefined && acceptedPoints !== pricing.points)
    throw new Error('The accepted points must exactly match the selected Studio price.')
  if (budgetTier === 'extended' && acceptedPoints !== 500)
    throw new Error('Explicitly accept 500 points before starting an extended Studio generation.')
  return { ...(budgetTier === undefined ? {} : { pricingRevision: STUDIO_PRICING_REVISION, budgetTier }), ...(acceptedPoints === undefined ? {} : { acceptedPoints: acceptedPoints as 250 | 500 }) }
}

export function studioPricingFor(value: { pricingRevision?: unknown; budgetTier?: unknown; acceptedPoints?: unknown } = {}): StudioPricing {
  const selection = validateStudioPricingSelection(value)
  return STUDIO_PRICING[selection.budgetTier ?? 'standard']
}

/** Stored/current pricing is an exact contract, never an arbitrary client cap. */
export function isStudioPricing(value: unknown): value is StudioPricing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (Object.keys(item).sort().join(',') !== 'maxProviderCents,points,revision,tier' || (item.tier !== 'standard' && item.tier !== 'extended')) return false
  const pricing = STUDIO_PRICING[item.tier]
  return item.revision === pricing.revision && item.points === pricing.points && item.maxProviderCents === pricing.maxProviderCents
}
