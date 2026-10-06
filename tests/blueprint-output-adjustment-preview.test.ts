import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, previewCompletedBlueprintOutputAdjustment, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { BLUEPRINT_RECONCILIATION_TERMS, blueprintRetainedCents } from '../server/blueprintTerminalUsage.ts'

const NOW = Date.parse('2026-10-05T20:00:00Z')
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), n => n.toString(16).padStart(2, '0')).join('')
async function evidence(model: 'luna' | 'sol' | 'astra' = 'sol', outputTokens = 100, legacy = false) {
  const id = crypto.randomUUID(), terms = BLUEPRINT_RECONCILIATION_TERMS[model], blueprint = demoBlueprint('An inert historical tower')
  const result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model: terms.model,
    limitation: 'Inert read-only evidence fixture', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_historical_fixture', receivedAt: new Date(NOW - 1000).toISOString(), blueprintSha256: await hash(blueprint), inputTokens: 1000, outputTokens, totalTokens: 1000 + outputTokens } }
  const retained = blueprintRetainedCents(model, 1000)
  const job: Record<string, unknown> = { fingerprint: 'a'.repeat(64), ...(model === 'luna' ? { model } : {}), profile: model === 'astra' ? 'slow' : 'fast', at: NOW - 2000,
    cost: terms.points, kind: 'credits', state: 'completed',
    ...(!legacy ? { channel: 'blueprint', updatedAt: NOW - 1000, blueprintDispatch: 'claimed-v1', blueprintDispatchUntil: NOW + 28000,
      blueprintProviderReservation: { version: 1, source: 'ordinary', amountCents: terms.capCents, state: 'reserved' } } : {}),
    blueprintProviderReconciliation: { revision: 'blueprint-bounded-output-v1', model, resultSha256: await hash(result), originalReservedCents: terms.capCents,
      retainedCents: retained, releasedCents: terms.capCents - retained, at: NOW - 500 } }
  return { id, job, result }
}
test('pure historical preview calculates an output-based upper bound without mutating evidence', async () => {
  for (const model of ['luna', 'sol', 'astra'] as const) for (const legacy of [false, true]) for (const output of [0, 100, 4000]) {
    const f = await evidence(model, output, legacy), before = structuredClone(f), terms = BLUEPRINT_RECONCILIATION_TERMS[model]
    const expected = blueprintRetainedCents(model, 1000) - Math.ceil((3048 * terms.inputRate + output * terms.outputRate) / 10000)
    assert.equal(await previewCompletedBlueprintOutputAdjustment(f.id, f.job, f.result, NOW), expected)
    assert.deepEqual(f, before)
  }
})
test('ineligible, corrupt, new-model and incomplete historical evidence yields no inferred adjustment', async () => {
  const variants: [string, (f: Awaited<ReturnType<typeof evidence>>) => void][] = [
    ['failed job', f => { f.job.state = 'failed' }], ['reserved job', f => { f.job.state = 'reserved' }],
    ['Studio', f => { f.job.channel = 'studio' }], ['free', f => { f.job.kind = 'free'; f.job.cost = 0 }],
    ['support', f => { f.job.supportApprovalId = crypto.randomUUID() }], ['project', f => { f.job.projectBudget = {} }],
    ['supplemental', f => { f.job.supplementalGrantId = crypto.randomUUID() }], ['repaired grant', f => { f.job.repairedMccGrantId = crypto.randomUUID() }],
    ['no v1 marker', f => { delete f.job.blueprintProviderReconciliation }],
    ['failed marker', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).revision = 'blueprint-failed-output-v1' }],
    ['unknown marker field', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).extra = true }],
    ['wrong prior retained', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).retainedCents = 8 }],
    ['wrong original cap', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).originalReservedCents = 175 }],
    ['wrong prior released', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).releasedCents = 35 }],
    ['wrong prior model', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).model = 'astra' }],
    ['future marker', f => { (f.job.blueprintProviderReconciliation as Record<string, unknown>).at = NOW + 1 }],
    ['future completion', f => { f.job.updatedAt = NOW + 1 }],
    ['marker before completion', f => { f.job.updatedAt = NOW - 100 }],
    ['missing stored result', f => { f.result = undefined as never }], ['wrong ID', f => { f.id = crypto.randomUUID() }],
    ['unreviewed new provider model', f => { f.result.model = 'gpt-6.1-sol' }],
    ['new provider binding', f => { f.job.blueprintProviderModel = 'gpt-6.1-sol' }],
    ['wrong hash', f => { f.result.evidence.blueprintSha256 = 'b'.repeat(64) }],
    ['modified result', f => { f.result.limitation = 'Changed immutable result' }],
    ['invalid usage', f => { f.result.evidence.inputTokens = -1 }], ['missing usage', f => { f.result.evidence.outputTokens = null as never }],
    ['wrong total', f => { f.result.evidence.totalTokens = 2 }], ['over output ceiling', f => { f.result.evidence.outputTokens = 4001; f.result.evidence.totalTokens = 5001 }],
    ['future response', f => { f.result.evidence.receivedAt = new Date(NOW + 1).toISOString() }],
    ['ready dispatch', f => { f.job.blueprintDispatch = 'ready-v1' }],
    ['released reservation', f => { (f.job.blueprintProviderReservation as Record<string, unknown>).state = 'released' }],
  ]
  for (const [label, mutate] of variants) {
    const f = await evidence(); mutate(f); const before = structuredClone(f)
    assert.equal(await previewCompletedBlueprintOutputAdjustment(f.id, f.job, f.result, NOW), null, label)
    assert.deepEqual(f, before, label)
  }
})
test('funding snapshot bounds read-only historical preview to32 rows and exposes only aggregate potential', async () => {
  const values = new Map<string, unknown>(), reads: string[] = []
  for (let index = 0; index < 33; index++) {
    const f = await evidence(); values.set('job:' + f.id, f.job); values.set('blueprint-result:' + f.id, f.result)
  }
  const before = structuredClone([...values])
  const storage: EntitlementStorage = {
    async get<T>(key: string) { reads.push(key); return structuredClone(values.get(key)) as T | undefined },
    async put() { throw new Error('Read-only projection must not write') },
    async list<T>(options: { prefix: string; limit: number }) { return new Map([...values].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)) as Map<string, T> },
    transaction: callback => callback(storage),
  }
  const ledger = new AccountEntitlements({ storage }, {}, () => NOW)
  const response = await ledger.fetch(new Request('https://ledger.test/generation-funding'))
  assert.equal(response.status, 200)
  const snapshot = await response.json() as { jobs: { blueprintOutputAdjustment: unknown } }
  assert.deepEqual(snapshot.jobs.blueprintOutputAdjustment, { scanLimit: 32, checked: 32, candidates: 32, potentialCents: 224, unavailable: 0, partial: true })
  assert.equal(reads.filter(key => key.startsWith('blueprint-result:')).length, 32)
  assert.deepEqual([...values], before)
  assert.doesNotMatch(JSON.stringify(snapshot), /resp_historical|inputTokens|outputTokens|fingerprint|An inert historical/)
})
test('optional historic result-read failure is unavailable without changing the ledger or whole snapshot availability', async () => {
  const f = await evidence(), values = new Map<string, unknown>([['job:' + f.id, f.job]])
  const storage: EntitlementStorage = {
    async get<T>(key: string) { if (key.startsWith('blueprint-result:')) throw new Error('Inert read failure'); return values.get(key) as T | undefined },
    async put() { throw new Error('No writes') },
    async list<T>() { return values as Map<string, T> }, transaction: callback => callback(storage),
  }
  const ledger = new AccountEntitlements({ storage }, {}, () => NOW), before = structuredClone([...values])
  const response = await ledger.fetch(new Request('https://ledger.test/generation-funding'))
  assert.equal(response.status, 200)
  const snapshot = await response.json() as { jobs: { blueprintOutputAdjustment: unknown } }
  assert.deepEqual(snapshot.jobs.blueprintOutputAdjustment, { scanLimit: 32, checked: 1, candidates: 0, potentialCents: 0, unavailable: 1, partial: false })
  assert.deepEqual([...values], before)
})
