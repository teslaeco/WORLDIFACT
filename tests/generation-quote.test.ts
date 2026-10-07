import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteGeneration } from '../src/lib/generationQuote.ts'
import { MODEL_ECONOMICS } from '../server/generationEconomics.ts'
import { ADMISSION_FAILURE_CODES, ADMISSION_FAILURE_DETAILS } from '../src/lib/generationAdmission.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
const account = { credits: 1500, generationCosts: { sol: 50, astra: 250 }, subscription: { active: true, plan: 'creator' }, free: { fastRemaining: 2 }, billingReview: false }
const billing = { plans: { creator: { checkoutReady: true }, pro: { checkoutReady: true }, studio: { checkoutReady: true } } }
test('displayed point rates match server economics and show the exact post-reservation balance', () => {
  const sol = quoteGeneration('sol', account, billing, true)
  assert.equal(sol.points, MODEL_ECONOMICS.sol.creditsPerGeneration); assert.equal(sol.after, 1450)
  const astra = quoteGeneration('astra', { ...account, subscription: { active: true, plan: 'pro' } }, billing, true)
  assert.equal(astra.points, MODEL_ECONOMICS.astra.creditsPerGeneration); assert.equal(astra.after, 1250)
})
test('free allowance is conditional on funding; it never becomes Astra access', () => {
  const free = { ...account, credits: 0, subscription: { active: false } }
  assert.equal(quoteGeneration('sol', free, billing, true).points, 0)
  assert.match(quoteGeneration('sol', free, billing, true).message, /shared promotional pool/)
  assert.equal(quoteGeneration('astra', free, billing, true).state, 'blocked')
  assert.equal(quoteGeneration('sol', { ...free, free: { fastRemaining: 0 } }, billing, true).state, 'blocked')
})
test('top-up does not invent Astra entitlement and unavailable billing cannot advertise a live Astra plan', () => {
  assert.equal(quoteGeneration('astra', { ...account, subscription: { active: false } }, billing, true).state, 'blocked')
  const pro = { ...account, subscription: { active: true, plan: 'pro' } }
  assert.equal(quoteGeneration('astra', pro, {}, true).state, 'blocked')
  assert.equal(quoteGeneration('astra', pro, { plans: { pro: { blockedReason: 'ASTRA_COST_GUARD_REQUIRED' } } }, true).state, 'blocked')
})
test('missing or stale identity and altered prices never fabricate a current charge or balance', () => {
  assert.equal(quoteGeneration('sol', account, billing, false).state, 'signin')
  assert.equal(quoteGeneration('sol', null, billing, true).points, null)
  assert.equal(quoteGeneration('sol', { ...account, generationCosts: { sol: 1, astra: 250 } }, billing, true).state, 'pending')
  assert.equal(quoteGeneration('sol', { ...account, credits: 49 }, billing, true).after, null)
  assert.equal(quoteGeneration('sol', { ...account, billingReview: true }, billing, true).state, 'blocked')
})

test('active cloud hold reduces only spendable points without pretending the balance was charged',()=>{
  const pro={...account,credits:1500,reservedCredits:250,availableCredits:1250,subscription:{active:true,plan:'pro'}}
  const quote=quoteGeneration('astra',pro,billing,true)
  assert.equal(quote.state,'credits')
  assert.equal(quote.after,1000)
  assert.match(quote.message,/250 points are already reserved/)
  assert.equal(quoteGeneration('astra',{...pro,availableCredits:200},billing,true).state,'blocked')
})

test('high points do not override authenticated provider funding or Creator quota denials', () => {
  const funded = { ...account, credits: 3000, subscription: { active: true, plan: 'pro' }, generationCosts: { sol: 50, astra: 250, luna: 15 } }
  for (const model of ['astra', 'sol', 'luna'] as const) {
    for (const reason of ADMISSION_FAILURE_CODES) {
      const current = { ...funded, generationAdmission: { [model]: { allowed: false, reason, detail: 'PRIVATE_LEDGER_VALUE' } } }
      const quote = quoteGeneration(model, current, billing, true)
      assert.equal(quote.state, 'blocked')
      assert.equal(quote.after, null)
      assert.equal(quote.message, ADMISSION_FAILURE_DETAILS[reason])
      assert.equal(quote.reason, reason)
      assert.doesNotMatch(quote.message, /PRIVATE_LEDGER_VALUE|refund|released/i)
    }
  }
  const negative = { ...funded, credits: -50, billingReview: true, generationAdmission: { astra: { allowed: false, reason: 'BILLING_REVIEW_REQUIRED' } } }
  assert.equal(quoteGeneration('astra', negative, billing, true).message, ADMISSION_FAILURE_DETAILS.BILLING_REVIEW_REQUIRED)
})

test('unknown or malformed admission cannot expose raw details or advertise spendable generation', () => {
  const funded = { ...account, credits: 3000, subscription: { active: true, plan: 'pro' } }
  const invalid = [undefined, null, [], 'PRIVATE_LEDGER_VALUE', {}, { astra: null },
    { astra: { allowed: false } }, { astra: { allowed: 'false', reason: 'CREDITS_EXHAUSTED' } },
    { astra: { allowed: false, reason: 'PRIVATE_LEDGER_VALUE' } },
    { astra: { allowed: false, reason: ['CREDITS_EXHAUSTED'] } },
    { astra: { allowed: true, reason: 'PROVIDER_BUDGET_EXHAUSTED' } },
    { astra: { allowed: true, reason: 'PRIVATE_LEDGER_VALUE' } }]
  for (const generationAdmission of invalid) {
    const quote = quoteGeneration('astra', { ...funded, generationAdmission }, billing, true)
    assert.equal(quote.state, 'pending')
    assert.equal(quote.points, null)
    assert.equal(quote.after, null)
    assert.equal(quote.reason, undefined)
    assert.doesNotMatch(quote.message, /PRIVATE_LEDGER_VALUE|3000|refund|released/i)
  }
})

test('an allowed admission still verifies costs and legacy accounts retain the existing quote', () => {
  const funded = { ...account, credits: 3000, subscription: { active: true, plan: 'pro' } }
  const generationAdmission = { astra: { allowed: true } }
  const legacy = quoteGeneration('astra', funded, billing, true)
  assert.equal(legacy.state, 'credits')
  assert.equal(legacy.after, 2750)
  assert.deepEqual(quoteGeneration('astra', { ...funded, generationAdmission }, billing, true), legacy)
  assert.equal(quoteGeneration('astra', { ...funded, generationAdmission, generationCosts: { sol: 50, astra: 1 } }, billing, true).state, 'pending')
  assert.equal(quoteGeneration('astra', { ...funded, generationAdmission }, billing, false).state, 'signin')
})

test('detailed tier quotes use exact tier admission while blueprint remains 250 points', async () => {
  const { STUDIO_PRICING } = await import('../src/lib/studioPricing.ts')
  const funded = { ...account, credits: 700, subscription: { active: true, plan: 'pro' },
    generationAdmission: { astra: { allowed: true } }, studioAdmission: { allowed: true, tiers: {
      standard: { allowed: true, pricing: STUDIO_PRICING.standard }, extended: { allowed: true, pricing: STUDIO_PRICING.extended },
    } } }
  assert.equal(quoteGeneration('astra', funded, billing, true, true, 'standard').after, 450)
  const extended = quoteGeneration('astra', funded, billing, true, true, 'extended')
  assert.equal(extended.points, 500); assert.equal(extended.after, 200)
  assert.equal(quoteGeneration('astra', funded, billing, true, false, 'extended').points, 250)
  assert.equal(quoteGeneration('astra', { ...funded, availableCredits: 499 }, billing, true, true, 'extended').reason, 'CREDITS_EXHAUSTED')
  const refused = { ...funded, studioAdmission: { ...funded.studioAdmission, tiers: { ...funded.studioAdmission.tiers,
    extended: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.extended } } } }
  assert.equal(quoteGeneration('astra', refused, billing, true, true, 'standard').state, 'credits')
  assert.equal(quoteGeneration('astra', refused, billing, true, true, 'extended').reason, 'PROVIDER_BUDGET_EXHAUSTED')
  for (const pricing of [undefined, STUDIO_PRICING.standard, { ...STUDIO_PRICING.extended, points: 250 }, { ...STUDIO_PRICING.extended, revision: 'old-policy' }]) {
    const stale = { ...funded, studioAdmission: { tiers: { extended: { allowed: true, pricing } } } }
    const quote = quoteGeneration('astra', stale, billing, true, true, 'extended')
    assert.equal(quote.state, 'pending'); assert.equal(quote.points, null); assert.equal(quote.after, null)
  }
})

test('current paid membership policy removes Creator quota and checkout gates, without expanding free or top-up access', () => {
  const current = { ...account, paidGenerationPolicy: 'paid-membership-no-quota-v1', creatorAstra: { active: true, remaining: null, maximum: null }, generationAdmission: { astra: { allowed: true } } }
  for (const plan of ['creator', 'pro', 'studio']) {
    for (const unavailableSales of [null, {}, { plans: { pro: { blockedReason: 'ASTRA_COST_GUARD_REQUIRED' }, [plan]: { checkoutReady: false } } }]) {
      const quote = quoteGeneration('astra', { ...current, subscription: { active: true, plan }, creatorAstra: { active: false, remaining: 0 } }, unavailableSales, true)
      assert.equal(quote.state, 'credits'); assert.equal(quote.points, 250); assert.equal(quote.after, 1250)
    }
  }
  for (const subscription of [{ active: false, plan: 'creator' }, { active: true, plan: 'invented' }])
    assert.equal(quoteGeneration('astra', { ...current, subscription }, null, true).state, 'blocked')
  assert.equal(quoteGeneration('astra', { ...current, availableCredits: 249 }, null, true).reason, 'CREDITS_EXHAUSTED')
  assert.equal(quoteGeneration('astra', { ...current, billingReview: true }, null, true).state, 'blocked')
  assert.equal(quoteGeneration('astra', current, null, false).state, 'signin')
})

test('new policy requires an explicit current admission and preserves all funded/runtime denials', () => {
  const current = { ...account, paidGenerationPolicy: 'paid-membership-no-quota-v1' }
  assert.equal(quoteGeneration('astra', current, billing, true).state, 'pending')
  for (const reason of ['PROVIDER_BUDGET_EXHAUSTED', 'ASTRA_RUNTIME_DISABLED', 'BILLING_REVIEW_REQUIRED'] as const) {
    const quote = quoteGeneration('astra', { ...current, generationAdmission: { astra: { allowed: false, reason } } }, billing, true)
    assert.equal(quote.reason, reason); assert.equal(quote.after, null)
  }
  for (const paidGenerationPolicy of [undefined, 'funded-credits-v1', 'unknown-future-policy']) {
    assert.equal(quoteGeneration('astra', { ...current, paidGenerationPolicy, creatorAstra: { active: true, remaining: 0 }, generationAdmission: { astra: { allowed: true } } }, billing, true).state, 'pending')
  }
  assert.equal(quoteGeneration('astra', { ...account, creatorAstra: { active: true, remaining: 0 }, generationAdmission: { astra: { allowed: true } } }, billing, true).state, 'blocked')
})

test('paid Creator exact detailed tier admission keeps 250/500 prices and explicit funding denials', async () => {
  const { STUDIO_PRICING } = await import('../src/lib/studioPricing.ts')
  const current = { ...account, paidGenerationPolicy: 'paid-membership-no-quota-v1', studioAdmission: { tiers: {
    standard: { allowed: true, pricing: STUDIO_PRICING.standard },
    extended: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.extended },
  } } }
  assert.equal(quoteGeneration('astra', current, null, true, true, 'standard').after, 1250)
  const extended = quoteGeneration('astra', current, null, true, true, 'extended')
  assert.equal(extended.points, 500); assert.equal(extended.reason, 'PROVIDER_BUDGET_EXHAUSTED')
})

const pointsAccount = { ...account, paidGenerationPolicy: PAID_POINTS_POLICY, credits: 1190, reservedCredits: 0, availableCredits: 1190,
  generationCosts: { luna: 15, sol: 50, astra: 250 }, creatorAstra: { active: false, remaining: 0 },
  generationAdmission: { luna: { allowed: true }, sol: { allowed: true }, astra: { allowed: true } },
  studioAdmission: { allowed: true, tiers: {
    standard: { allowed: true, pricing: STUDIO_PRICING.standard }, extended: { allowed: true, pricing: STUDIO_PRICING.extended },
  } } }

test('explicit points policy quotes all paid plans and model budgets without a reserve or new-sale dependency', () => {
  for (const plan of ['creator', 'pro', 'studio']) {
    const current = { ...pointsAccount, subscription: { active: true, plan } }
    for (const model of ['luna', 'sol', 'astra'] as const) {
      const quote = quoteGeneration(model, current, null, true)
      assert.equal(quote.state, 'credits'); assert.equal(quote.fundingSource, PAID_POINTS_FUNDING)
      assert.equal(quote.after, 1190 - MODEL_ECONOMICS[model].creditsPerGeneration)
    }
    for (const tier of ['standard', 'extended'] as const) {
      const quote = quoteGeneration('astra', current, null, true, true, tier)
      assert.equal(quote.state, 'credits'); assert.equal(quote.points, STUDIO_PRICING[tier].points)
      assert.equal(quote.after, 1190 - STUDIO_PRICING[tier].points); assert.equal(quote.fundingSource, PAID_POINTS_FUNDING)
    }
    assert.equal(quoteGeneration('astra', current, null, true, true).fundingSource, PAID_POINTS_FUNDING)
  }
})

test('points policy still requires exact current admissions, pricing, spendable points and valid holds', () => {
  for (const model of ['luna', 'sol', 'astra'] as const) {
    for (const generationAdmission of [undefined, {}, { [model]: { allowed: true, reason: 'CREDITS_EXHAUSTED' } }]) {
      const quote = quoteGeneration(model, { ...pointsAccount, generationAdmission }, null, true)
      assert.equal(quote.state, 'pending'); assert.equal(quote.after, null); assert.equal(quote.fundingSource, undefined)
    }
    for (const patch of [
      { availableCredits: undefined }, { availableCredits: NaN }, { availableCredits: -1 }, { availableCredits: 1191 },
      { reservedCredits: undefined }, { reservedCredits: -1 }, { reservedCredits: 1.5 }, { reservedCredits: 250 },
    ]) assert.equal(quoteGeneration(model, { ...pointsAccount, ...patch }, null, true).state, 'pending')
    const points = MODEL_ECONOMICS[model].creditsPerGeneration
    const exhausted = quoteGeneration(model, { ...pointsAccount, reservedCredits: 1190 - points + 1, availableCredits: points - 1 }, null, true)
    assert.equal(exhausted.reason, 'CREDITS_EXHAUSTED'); assert.equal(exhausted.fundingSource, undefined)
    const held = quoteGeneration(model, { ...pointsAccount, reservedCredits: 250, availableCredits: 940 }, null, true)
    assert.equal(held.after, 940 - points); assert.match(held.message, /250 points are already reserved/)
  }
  for (const pricing of [undefined, STUDIO_PRICING.standard, { ...STUDIO_PRICING.extended, maxProviderCents: 175 }])
    assert.equal(quoteGeneration('astra', { ...pointsAccount, studioAdmission: { tiers: { extended: { allowed: true, pricing } } } }, null, true, true, 'extended').state, 'pending')
})

test('points policy never overrides authenticated refusals or reclassifies legacy, free and top-up quotes', () => {
  for (const reason of ADMISSION_FAILURE_CODES) {
    const quote = quoteGeneration('astra', { ...pointsAccount, generationAdmission: { astra: { allowed: false, reason } } }, null, true)
    assert.equal(quote.state, 'blocked'); assert.equal(quote.reason, reason); assert.equal(quote.fundingSource, undefined)
  }
  assert.equal(quoteGeneration('astra', { ...pointsAccount, billingReview: true }, null, true).state, 'blocked')
  assert.equal(quoteGeneration('astra', pointsAccount, null, false).state, 'signin')
  const { paidGenerationPolicy: _policy, ...historical } = pointsAccount
  for (const legacy of [historical, { ...pointsAccount, paidGenerationPolicy: 'paid-membership-no-quota-v1' }]) {
    assert.equal(quoteGeneration('sol', legacy, billing, true).fundingSource, undefined)
    const quote = quoteGeneration('astra', { ...legacy, generationAdmission: { astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } } }, billing, true)
    assert.equal(quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
  }
  for (const subscription of [{ active: false, plan: 'creator' }, { active: true, plan: 'unknown' }, { active: true, plan: ['creator'] }])
    assert.equal(quoteGeneration('sol', { ...pointsAccount, subscription }, billing, true).fundingSource, undefined)
  const topup = { ...pointsAccount, subscription: { active: false, plan: 'creator' } }
  assert.equal(quoteGeneration('astra', topup, null, true).state, 'blocked')
  const free = { ...topup, credits: 0, availableCredits: 0 }
  assert.equal(quoteGeneration('sol', free, null, true).state, 'free')
  assert.equal(quoteGeneration('sol', free, null, true).fundingSource, undefined)
})

test('present unknown or malformed policy fails closed for allowed model and tier admissions while absent legacy policy remains compatible', () => {
  const { paidGenerationPolicy: _policy, ...historical } = pointsAccount
  const pro = { ...historical, subscription: { active: true, plan: 'pro' } }
  const routes = [
    ['luna', false, undefined], ['sol', false, undefined], ['astra', false, undefined],
    ['astra', true, undefined], ['astra', true, 'standard'], ['astra', true, 'extended'],
  ] as const
  for (const [model, detailed, tier] of routes) {
    assert.equal(quoteGeneration(model, pro, billing, true, detailed, tier).state, 'credits')
    for (const paidGenerationPolicy of [undefined, null, '', 2, true, {}, [], [PAID_POINTS_POLICY], 'funded-credits-v1', 'paid-membership-points-v3']) {
      const quote = quoteGeneration(model, { ...pro, paidGenerationPolicy }, billing, true, detailed, tier)
      assert.equal(quote.state, 'pending', `${model}/${tier ?? detailed}/${String(paidGenerationPolicy)}`)
      assert.equal(quote.points, null); assert.equal(quote.after, null); assert.equal(quote.reason, undefined); assert.equal(quote.fundingSource, undefined)
    }
  }
})
