import type { StudioStatus } from './studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from './studioPricing.ts'

export const DETAILED_REFERENCE_LIMIT = 4
export const ASTRA_GUARD_EXPIRY = 1793145600
export const ASTRA_OUTPUT_POLICY = 'astra-low-reconciled-v2'

/** A real runtime contract, never a claim of reference similarity or visual quality. */
export function detailedRuntime(value: Record<string, unknown>, now = Date.now()) {
  const costGuardReady = value.ready === true && value.codexReady === true && value.provider === 'openai' && value.model === 'gpt-6-astra' &&
    Number.isSafeInteger(value.connectorVersion) && Number(value.connectorVersion) >= 33 &&
    value.astraBudgetRevision === 'astra-usd175-v1' && value.astraBudgetMaxUsd === 1.75 &&
    value.astraBudgetPreflight === 'input-tokens' && value.astraBudgetExpiry === ASTRA_GUARD_EXPIRY && now < ASTRA_GUARD_EXPIRY * 1000
  const outputPolicyReady = costGuardReady && value.astraOutputPolicy === ASTRA_OUTPUT_POLICY && value.astraReasoningEffort === 'low' &&
    value.astraMaxOutputTokens === 16000 && value.astraUsageSettlement === 'authenticated-completed-only'
  const tiers = value.studioPricingTiers
  const tiersReady = outputPolicyReady && value.studioPricingRevision === STUDIO_PRICING_REVISION && value.studioPricingMaintenance === false &&
    Array.isArray(tiers) && tiers.length === 2 && Object.values(STUDIO_PRICING).every(expected => tiers.filter(item =>
      item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).sort().join(',') === 'maxProviderCents,points,tier' &&
      item.tier === expected.tier && item.points === expected.points && item.maxProviderCents === expected.maxProviderCents).length === 1)
  return { costGuardReady, outputPolicyReady, tiersReady, ...(tiersReady ? { pricingRevision: STUDIO_PRICING_REVISION } : {}) }
}

export function detailedUnavailable(status: StudioStatus | null, references: number): string | null {
  if (references > DETAILED_REFERENCE_LIMIT) return 'The detailed worker accepts up to four reference views. Remove extra views explicitly; no image will be silently omitted.'
  if (!status) return 'Checking the Astra/Blender worker. No generation or point reservation has started.'
  if (status.detailedReady === true && status.ready === true && (!references || status.photoReady)) return null
  if (status.reason === 'ASTRA_OUTPUT_POLICY_REQUIRED') return 'The detailed worker needs its reviewed output-policy update. No points were reserved. The procedural generator will not replace your model.'
  if (status.reason === 'ASTRA_COST_GUARD_REQUIRED') return 'The detailed worker did not confirm its current cost limit. No points were reserved.'
  if (status.reason === 'DISABLED_OR_EXPIRED') return 'Astra/Blender model generation is awaiting server activation. Your description and photos are unchanged; no points were reserved.'
  if (references && !status.photoReady) return 'The worker has not confirmed reference-image support. No image was discarded and no points were reserved.'
  return 'Astra/Blender is temporarily unavailable. Refresh availability to check again; no automatic paid retry or procedural replacement.'
}
