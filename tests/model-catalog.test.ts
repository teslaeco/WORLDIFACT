import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_CATALOG, GENERATION_COSTS, blueprintModel, reserveBlueprintMicroUsd } from '../src/lib/modelCatalog.ts'
import { modelAllowed, planEconomics, providerReserveCents } from '../server/generationEconomics.ts'

test('verified model IDs, especially Terra, are not guessed from a family name', () => {
  assert.equal(MODEL_CATALOG.terra.model, 'gpt-5.6-terra')
  assert.equal(blueprintModel('gpt-6-luna'), 'luna')
  assert.equal(blueprintModel('gpt-5.6-terra'), 'terra')
  assert.throws(() => blueprintModel('gpt-6-terra'))
  assert.throws(() => blueprintModel('gpt-6-astra'))
  assert.throws(() => blueprintModel('__proto__'))
  assert.deepEqual(GENERATION_COSTS, { sol: 50, astra: 250, luna: 5, terra: 60 })
})
test('no model mix can exceed the prepaid per-credit provider allowance', () => {
  for (const value of Object.values(MODEL_CATALOG)) {
    assert.ok(value.maxProviderCents <= providerReserveCents(value.creditsPerGeneration))
  }
  assert.ok(modelAllowed('creator', 'luna')); assert.ok(modelAllowed('creator', 'terra'))
  assert.equal(modelAllowed('creator', 'astra'), false)
  for (const id of ['creator', 'pro', 'studio'] as const) assert.ok(planEconomics(id).marginBps >= 3000)
})
test('cost preflight rounds upwards including fractional Luna rates and rejects hidden large context', () => {
  for (const id of ['sol', 'luna', 'terra'] as const) {
    const quote = reserveBlueprintMicroUsd(id, 1000)
    assert.ok(Number.isSafeInteger(quote) && quote > 0)
    assert.ok(quote <= MODEL_CATALOG[id].maxProviderCents * 10000)
  }
  assert.throws(() => reserveBlueprintMicroUsd('sol', 65537))
  assert.throws(() => reserveBlueprintMicroUsd('sol', -1))
  assert.throws(() => reserveBlueprintMicroUsd('sol', 1, 100000))
  assert.ok(reserveBlueprintMicroUsd('terra', 1000) > reserveBlueprintMicroUsd('sol', 1000))
})
