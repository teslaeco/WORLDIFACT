import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasStudioBudgetConsent, studioBudgetFailureAdvice, studioBudgetSelection, studioTiersReady } from '../src/lib/studioTierSelection.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
import type { StudioJob, StudioStatus } from '../src/lib/studioProtocol.ts'

test('tier controls need exact readiness and consent belongs to one current draft revision', () => {
  const ready = { ready: true, detailedReady: true, tiersReady: true, pricingRevision: STUDIO_PRICING_REVISION } as StudioStatus
  assert.equal(studioTiersReady(ready), true)
  for (const status of [null, { ...ready, ready: false }, { ...ready, detailedReady: false }, { ...ready, tiersReady: undefined }, { ...ready, tiersReady: 'true' }, { ...ready, pricingRevision: 'future-pricing' }])
    assert.equal(studioTiersReady(status as StudioStatus | null), false)
  const original = {}, edited = {}
  assert.equal(hasStudioBudgetConsent('extended', null, original), false)
  assert.equal(hasStudioBudgetConsent('extended', original, original), true)
  assert.equal(hasStudioBudgetConsent('extended', original, edited), false)
  assert.throws(() => studioBudgetSelection('extended', false), /Accept 500 points/)
  assert.deepEqual(studioBudgetSelection('extended', true), { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: 'extended', acceptedPoints: 500 })
})

test('complexity advice belongs only to structured per-model budget failure', () => {
  const job = { id: 'fixture', state: 'failed', detail: 'ignored' } as StudioJob
  for (const failureCode of ['ASTRA_COST_LIMIT', 'PROVIDER_BUDGET_EXHAUSTED', 'ORACLE_JOB_FAILED'] as const)
    assert.equal(studioBudgetFailureAdvice({ ...job, failureCode }), null)
  assert.match(studioBudgetFailureAdvice({ ...job, failureCode: 'MODEL_BUDGET_EXCEEDED', pricing: STUDIO_PRICING.standard })!, /explicitly accept the 500-point budget/)
  assert.doesNotMatch(studioBudgetFailureAdvice({ ...job, failureCode: 'MODEL_BUDGET_EXCEEDED', pricing: STUDIO_PRICING.extended })!, /500/)
})
