import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  STUDIO_BUDGET_TIERS, STUDIO_PRICING, STUDIO_PRICING_REVISION,
  isStudioPricing, studioPricingFor, validateStudioPricingSelection,
} from '../src/lib/studioPricing.ts'
import {
  FAST_DRAFT_PROFILE, STUDIO_FAILURE_CODES, STUDIO_FAILURE_DETAILS, inputDigest,
  oracleStudioPayload, prepareStudioInput, validateStudioInput, validateStudioPrepareManifest, type StudioInput,
} from '../src/lib/studioProtocol.ts'

const id = '33333333-3333-4333-8333-333333333333'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A blue chess rook', purpose: 'object', textureMaxSize: 4096, photos: [] }
const standard = { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: 'standard' } as const
const extended = { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: 'extended', acceptedPoints: 500 } as const

test('current Studio prices are exact immutable contracts with no caller-defined ceiling', () => {
  assert.deepEqual(STUDIO_BUDGET_TIERS, ['standard', 'extended'])
  assert.deepEqual(STUDIO_PRICING, {
    standard: { revision: 'studio-pricing-v1', tier: 'standard', points: 250, maxProviderCents: 200 },
    extended: { revision: 'studio-pricing-v1', tier: 'extended', points: 500, maxProviderCents: 400 },
  })
  assert.ok(Object.isFrozen(STUDIO_PRICING))
  for (const pricing of Object.values(STUDIO_PRICING)) {
    assert.ok(Object.isFrozen(pricing))
    assert.ok(isStudioPricing(JSON.parse(JSON.stringify(pricing))))
    for (const bad of [
      { ...pricing, revision: 'studio-pricing-v2' }, { ...pricing, tier: 'unlimited' },
      { ...pricing, points: String(pricing.points) }, { ...pricing, maxProviderCents: String(pricing.maxProviderCents) },
      { ...pricing, maxProviderCents: pricing.maxProviderCents + 1 }, { ...pricing, override: true },
    ]) assert.equal(isStudioPricing(bad), false)
  }
  for (const bad of [null, undefined, [], 'standard', { tier: 'standard' }]) assert.equal(isStudioPricing(bad), false)
  assert.equal(studioPricingFor(standard), STUDIO_PRICING.standard)
  assert.equal(studioPricingFor(extended), STUDIO_PRICING.extended)
})

test('extended Studio requires explicit exact 500-point acceptance and a current price revision', () => {
  assert.deepEqual(validateStudioPricingSelection(standard), standard)
  assert.deepEqual(validateStudioPricingSelection({ ...standard, acceptedPoints: 250 }), { ...standard, acceptedPoints: 250 })
  assert.deepEqual(validateStudioPricingSelection(extended), extended)
  for (const bad of [
    { budgetTier: 'extended' }, { ...extended, acceptedPoints: undefined }, { ...extended, acceptedPoints: 250 },
    { ...extended, acceptedPoints: '500' }, { ...extended, acceptedPoints: 501 }, { ...extended, acceptedPoints: true },
    { ...standard, acceptedPoints: 500 }, { ...standard, budgetTier: 'premium' },
    { ...standard, pricingRevision: undefined }, { ...standard, pricingRevision: 'studio-pricing-v0' },
    { pricingRevision: STUDIO_PRICING_REVISION }, { acceptedPoints: 250 },
  ]) {
    assert.throws(() => validateStudioInput({ ...input, ...bad }))
    assert.throws(() => studioPricingFor(bad))
  }
  assert.throws(() => validateStudioInput({ ...input, ...extended, maxProviderCents: 999 }))
  assert.throws(() => validateStudioInput({ ...input, ...extended, studioPricing: STUDIO_PRICING.extended }))
})

test('legacy inputs retain exact canonical bytes and omit new pricing from the Oracle wire payload', async () => {
  const oldBytes = '{"worldId":"enchanted-ai-shop","prompt":"A blue chess rook","purpose":"object","textureMaxSize":4096,"photos":[]}'
  const canonical = validateStudioInput({ ...input, generationProfile: 'standard', pricingRevision: undefined, budgetTier: undefined, acceptedPoints: undefined })
  assert.equal(JSON.stringify(canonical), oldBytes)
  assert.equal(await inputDigest(canonical), createHash('sha256').update(oldBytes).digest('hex'))
  const payload = oracleStudioPayload(id, canonical)
  assert.deepEqual(Object.keys(payload).sort(), ['agentInstructions', 'id', 'prompt'])
  assert.ok('agentInstructions' in payload)
  assert.match(payload.agentInstructions!, /existing per-job USD 1\.75 guard/)
})

test('selection, current revision and exact price acceptance remain bound to prepare and full input hashes', async () => {
  const cases = [input, { ...input, ...standard }, { ...input, ...standard, acceptedPoints: 250 as const }, { ...input, ...extended }]
  const digests = new Set<string>()
  for (const value of cases) {
    const canonical = validateStudioInput(value)
    const manifest = await prepareStudioInput(value)
    assert.deepEqual(validateStudioPrepareManifest(manifest), manifest)
    assert.equal(manifest.inputDigest, await inputDigest(canonical))
    assert.equal(manifest.pricingRevision, value.pricingRevision)
    assert.equal(manifest.budgetTier, value.budgetTier)
    assert.equal(manifest.acceptedPoints, value.acceptedPoints)
    digests.add(manifest.inputDigest)
  }
  assert.equal(digests.size, cases.length, 'Changing either selected price or explicit consent invalidates the prepared input commitment')
  const manifest = await prepareStudioInput({ ...input, ...extended })
  for (const patch of [
    { acceptedPoints: undefined }, { acceptedPoints: 250 }, { pricingRevision: undefined },
    { pricingRevision: 'future-price' }, { budgetTier: 'unlimited' }, { maxProviderCents: 401 },
  ]) assert.throws(() => validateStudioPrepareManifest({ ...manifest, ...patch }))
})

test('Oracle receives only validated fixed Studio terms and instructions respect the selected ceiling', () => {
  for (const selection of [standard, extended]) {
    const payload = oracleStudioPayload(id, validateStudioInput({ ...input, ...selection }))
    assert.ok('agentInstructions' in payload)
    assert.deepEqual(payload.studioPricing, STUDIO_PRICING[selection.budgetTier])
    assert.match(payload.agentInstructions!, new RegExp(`USD ${selection.budgetTier === 'standard' ? '2\\.00' : '4\\.00'} guard`))
    assert.doesNotMatch(payload.agentInstructions!, /USD 1\.75 guard/)
  }
  assert.throws(() => oracleStudioPayload(id, { ...input, ...extended, acceptedPoints: undefined }))
})

test('detailed Studio pricing cannot be attached to FAST generation or preparation', async () => {
  const fast: StudioInput = { ...input, generationProfile: FAST_DRAFT_PROFILE, textureMaxSize: 2048 }
  const payload = oracleStudioPayload(id, validateStudioInput(fast))
  assert.equal('studioPricing' in payload, false)
  const manifest = await prepareStudioInput(fast)
  for (const selection of [standard, extended]) {
    assert.throws(() => validateStudioInput({ ...fast, ...selection }))
    assert.throws(() => validateStudioPrepareManifest({ ...manifest, ...selection }))
  }
})

test('model-budget refusal describes request reservation without inferring complexity or settlement', () => {
  assert.ok(STUDIO_FAILURE_CODES.includes('MODEL_BUDGET_EXCEEDED'))
  assert.match(STUDIO_FAILURE_DETAILS.MODEL_BUDGET_EXCEEDED, /could not reserve the next API request/)
  assert.match(STUDIO_FAILURE_DETAILS.MODEL_BUDGET_EXCEEDED, /no automatic retry/)
  assert.doesNotMatch(STUDIO_FAILURE_DETAILS.MODEL_BUDGET_EXCEEDED, /too elaborate|points were released|invoice|larger budget/)
  assert.doesNotMatch(STUDIO_FAILURE_DETAILS.ASTRA_COST_LIMIT, /too elaborate/)
})
