import test from 'node:test'
import assert from 'node:assert/strict'
import { readArchive, saveArchive } from '../src/lib/archive.ts'
import { assetSpecForBlueprint, demoBlueprint, type GenerationResult } from '../src/lib/blueprint.ts'
import { readSavedStudioJob, STUDIO_RECEIPT_KEY, StudioCoordinator } from '../src/lib/studioClient.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'

function memory() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } }
}

function generation(model: string, requestId: string): GenerationResult {
  const blueprint = demoBlueprint('An offline blue tower')
  return { mode: 'LIVE', provenance: 'GENERATED', model, requestId, blueprint,
    assetSpec: assetSpecForBlueprint(blueprint), limitation: 'Offline compatibility fixture.',
    evidence: { providerResponseId: 'resp_mcc_compatibility_fixture', receivedAt: '2026-10-06T11:00:00.000Z',
      blueprintSha256: 'b'.repeat(64), inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    delivery: { kind: 'procedural-blueprint', referenceCount: 4, fallbackUsed: false } }
}

test('historical workbench DEMO saves preserve both historical and current model evidence', () => {
  const storage = memory()
  const originals = ['gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra'].map((model, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    createdAt: '2026-10-06T11:00:00.000Z', result: generation(model, `mcc-compatibility-${i}`),
  }))
  storage.setItem('worldifact.worlds.v1', JSON.stringify(originals))
  assert.deepEqual(readArchive(storage), originals)
  const demo: GenerationResult = { mode: 'DEMO', provenance: 'MOCK', model: null,
    requestId: 'local-mcc-compatibility-fixture', limitation: 'Deterministic offline test; no provider call.',
    blueprint: demoBlueprint('A red rover') }
  saveArchive(demo, storage)
  assert.deepEqual(readArchive(storage).slice(1), originals)
  assert.deepEqual(JSON.parse(storage.getItem('worldifact.worlds.v1')!).slice(1), originals)
})

test('historical generator restoration retains saved priced receipt terms without a submission', () => {
  const storage = memory(), id = '00000000-0000-4000-8000-000000000050'
  const pricing = Object.values(STUDIO_PRICING).find(value => value.points === 500)!
  assert.ok(pricing)
  const original = { receipt: { id, ticket: `${id}.1791284400000.${'a'.repeat(64)}.${'b'.repeat(64)}`,
    createdAt: '2026-10-06T11:00:00.000Z', pricing }, pricing,
    prompt: 'Offline preserved model', startedAt: '2026-10-06T11:00:00.000Z' }
  const text = JSON.stringify(original)
  storage.setItem(STUDIO_RECEIPT_KEY, text)
  let calls = 0
  const coordinator = new StudioCoordinator(storage, (async () => { calls++; throw Error('No network operation is expected') }) as typeof fetch)
  assert.deepEqual(readSavedStudioJob(storage), original)
  assert.deepEqual(coordinator.restore(), original)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), text)
  assert.equal(calls, 0)
})
