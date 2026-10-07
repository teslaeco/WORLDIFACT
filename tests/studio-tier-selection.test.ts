import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasStudioBudgetConsent, studioBudgetFailureAdvice, studioBudgetSelection, studioTiersReady } from '../src/lib/studioTierSelection.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
import type { StudioJob, StudioStatus } from '../src/lib/studioProtocol.ts'

test('tier controls need exact readiness and consent belongs to one current draft revision', () => {
  const ready = { ready: true, detailedReady: true, tiersReady: true, pricingRevision: STUDIO_PRICING_REVISION } as StudioStatus
  assert.equal(studioTiersReady(ready), true)
  for (const status of [null, { ...ready, ready: false }, { ...ready, detailedReady: false }, { ...ready, tiersReady: undefined }, { ...ready, tiersReady: 'true' }, { ...ready, pricingRevision: 'future-pricing' }, { ...ready, newJobPolicy: 'legacy-usd175-v1' }, { ...ready, newJobPolicy: null }, { ...ready, newJobPolicy: 'future-policy' }])
    assert.equal(studioTiersReady(status as StudioStatus | null), false)
  const original = {}, edited = {}
  assert.equal(hasStudioBudgetConsent('extended', null, original), false)
  assert.equal(hasStudioBudgetConsent('extended', original, original), true)
  assert.equal(hasStudioBudgetConsent('extended', original, edited), false)
  assert.throws(() => studioBudgetSelection('extended', false), /Accept 500 points/)
  assert.deepEqual(studioBudgetSelection('extended', true), { pricingRevision: STUDIO_PRICING_REVISION, budgetTier: 'extended', acceptedPoints: 500 })
})

test('budget-stop explanation distinguishes missing completed output from financial settlement and prompt complexity', () => {
  const job = { id: 'fixture', state: 'failed', detail: 'ignored' } as StudioJob
  for (const failureCode of ['ASTRA_COST_LIMIT', 'PROVIDER_BUDGET_EXHAUSTED', 'ORACLE_JOB_FAILED'] as const)
    assert.equal(studioBudgetFailureAdvice({ ...job, failureCode }), null)
  for (const pricing of [undefined, STUDIO_PRICING.standard, STUDIO_PRICING.extended]) {
    for (const tiersAvailable of [true, false]) {
      const detail = studioBudgetFailureAdvice({ ...job, failureCode: 'MODEL_BUDGET_EXCEEDED', pricing }, tiersAvailable)
      assert.match(detail!, /next API request did not fit the remaining model budget/)
      assert.match(detail!, /no completed, verified model for the preview or completed-model gallery/)
      assert.match(detail!, /same request without starting another generation/)
      assert.doesNotMatch(detail!, /[Ss]implify|[Cc]omplex|500|upgrade|points were released|charged|artifact.*(deleted|missing)/)
    }
  }
  for (const state of ['pending', 'queued', 'building', 'succeeded', 'cancelled'] as const)
    assert.equal(studioBudgetFailureAdvice({ ...job, state, failureCode: 'MODEL_BUDGET_EXCEEDED' }), null)
})
