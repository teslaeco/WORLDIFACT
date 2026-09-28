import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteGeneration } from '../src/lib/generationQuote.ts'
import { MODEL_ECONOMICS } from '../server/generationEconomics.ts'
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
