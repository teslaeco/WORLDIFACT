import assert from 'node:assert/strict'
import test from 'node:test'
import { FREE_PROMO_POLICY, MODEL_ECONOMICS, PLAN_CATALOG, PLAN_RESERVES_BPS, modelAllowed, planEconomics, providerReserveCents } from '../server/generationEconomics.ts'

test('Astra is priced at exactly five times the SOL credit and provider ceiling', () => {
  assert.equal(MODEL_ECONOMICS.astra.creditsPerGeneration, MODEL_ECONOMICS.sol.creditsPerGeneration * 5)
  assert.equal(MODEL_ECONOMICS.astra.maxProviderCents, MODEL_ECONOMICS.sol.maxProviderCents * 5)
  assert.equal(MODEL_ECONOMICS.sol.model, 'gpt-6.1-sol')
  assert.equal(MODEL_ECONOMICS.astra.model, 'gpt-6-astra')
})

test('every proposed paid plan keeps at least a 30 percent worst-case reserved margin', () => {
  for (const id of Object.keys(PLAN_CATALOG) as Array<keyof typeof PLAN_CATALOG>) {
    const economics = planEconomics(id)
    assert.ok(economics.profit > 0, id)
    assert.ok(economics.marginBps >= PLAN_RESERVES_BPS.minimumProfit, `${id}: ${economics.marginBps} bps`)
  }
})

test('provider reserve is identical per credit regardless of allowed model mix', () => {
  assert.equal(providerReserveCents(1500), 1050)
  assert.equal(providerReserveCents(4500), 3150)
  assert.equal(providerReserveCents(7500), 5250)
})

test('Creator catalogue includes Astra without increasing its provider reserve; runtime gating is tested separately', () => {
  assert.equal(modelAllowed('creator', 'sol'), true)
  assert.equal(modelAllowed('creator', 'astra'), true)
  assert.equal(modelAllowed('pro', 'astra'), true)
  assert.equal(modelAllowed('studio', 'astra'), true)
})

test('free SOL spend is revenue-funded and never silently falls back to paid provider work', () => {
  assert.equal(FREE_PROMO_POLICY.model, 'sol')
  assert.equal(FREE_PROMO_POLICY.maxProviderCents, 15)
  assert.equal(FREE_PROMO_POLICY.paidTierFallback, 'demo')
  assert.equal(planEconomics('creator').fundedFreeSolJobs, 10)
  assert.equal(planEconomics('pro').fundedFreeSolJobs, 33)
  assert.equal(planEconomics('studio').fundedFreeSolJobs, 50)
})
