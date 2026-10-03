import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASTRA_GUARD_EXPIRY, detailedRuntime } from '../src/lib/detailedStudio.ts'
import { STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const now = 1790740000000
const standard = { tier: 'standard', points: 250, maxProviderCents: 200 }
const extended = { tier: 'extended', points: 500, maxProviderCents: 400 }
const ready = {
  ...detailedHealthFixture,
  studioPricingRevision: STUDIO_PRICING_REVISION,
  studioPricingMaintenance: false,
  studioPricingTiers: [standard, extended],
}
function unavailable(patch: Record<string, unknown>) {
  const result = detailedRuntime({ ...ready, ...patch }, now)
  assert.equal(result.tiersReady, false, JSON.stringify(patch))
  assert.equal('pricingRevision' in result, false, 'Unconfirmed pricing must never be advertised as current')
}

test('both exact reviewed Studio tiers and an explicit inactive maintenance flag advertise current pricing', () => {
  const expected = { costGuardReady: true, outputPolicyReady: true, tiersReady: true, pricingRevision: STUDIO_PRICING_REVISION }
  assert.deepEqual(detailedRuntime(ready, now), expected)
  assert.deepEqual(detailedRuntime({ ...ready, studioPricingTiers: [extended, standard] }, now), expected)
  assert.deepEqual(detailedRuntime(detailedHealthFixture, now), { costGuardReady: true, outputPolicyReady: true, tiersReady: false })
})

test('missing, stale, or coercible pricing revision and maintenance claims fail closed', () => {
  for (const revision of [undefined, null, '', 'studio-pricing-v0', 'studio-pricing-v2', true, [STUDIO_PRICING_REVISION]])
    unavailable({ studioPricingRevision: revision })
  for (const maintenance of [undefined, null, true, 'false', 0, '', []])
    unavailable({ studioPricingMaintenance: maintenance })
})

test('tier health requires each exact tier once and rejects missing, duplicate, or extra entries', () => {
  for (const tiers of [
    undefined, null, {}, 'standard,extended', [], [standard], [extended],
    [standard, standard], [extended, extended], [standard, extended, standard],
    [standard, null], [standard, []], [standard, 'extended'],
    [standard, { ...extended, tier: 'premium' }],
  ]) unavailable({ studioPricingTiers: tiers })
})

test('spoofed tier prices, swapped caps, type coercion, and extra inner fields never enable new pricing', () => {
  for (const index of [0, 1]) {
    const original = index === 0 ? standard : extended
    for (const bad of [
      { ...original, points: original.points + 1 }, { ...original, points: String(original.points) },
      { ...original, points: index === 0 ? 500 : 250 }, { ...original, points: undefined },
      { ...original, maxProviderCents: index === 0 ? 400 : 200 }, { ...original, maxProviderCents: 175 },
      { ...original, maxProviderCents: String(original.maxProviderCents) }, { ...original, maxProviderCents: undefined },
      { ...original, maxProviderCents: Number.POSITIVE_INFINITY },
      { ...original, revision: STUDIO_PRICING_REVISION }, { ...original, acceptedPoints: original.points },
      { ...original, tier: [original.tier] },
    ]) {
      const tiers = [standard, extended]
      tiers[index] = bad as typeof standard
      unavailable({ studioPricingTiers: tiers })
    }
  }
})

test('current pricing cannot bypass readiness, reviewed output policy, model identity, or guard expiry', () => {
  for (const patch of [
    { ready: false }, { codexReady: false }, { provider: 'other' }, { model: 'gpt-6-sol' },
    { connectorVersion: 32 }, { connectorVersion: '33' }, { astraBudgetRevision: 'future-budget' },
    { astraBudgetMaxUsd: 4 }, { astraBudgetPreflight: undefined }, { astraBudgetExpiry: ASTRA_GUARD_EXPIRY + 1 },
    { astraOutputPolicy: 'unreviewed-policy' }, { astraReasoningEffort: 'high' },
    { astraMaxOutputTokens: 32000 }, { astraUsageSettlement: 'estimated' },
  ]) unavailable(patch)
  const expired = detailedRuntime(ready, ASTRA_GUARD_EXPIRY * 1000)
  assert.equal(expired.tiersReady, false)
  assert.equal('pricingRevision' in expired, false)
})
