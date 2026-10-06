import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { boundBlueprintProviderModel } from '../server/blueprintModelBinding.ts'
import { MODEL_CATALOG, blueprintReservationMicroUsd } from '../src/lib/modelCatalog.ts'
import { assetSpecForBlueprint, demoBlueprint, validateGenerationResult } from '../src/lib/blueprint.ts'
import { handle, type Env } from '../server/worker.ts'

const fingerprint = 'a'.repeat(64)
function fixture() {
  const saved = new Map<string, unknown>()
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(saved.get(key)) as T | undefined },
    async put(key, value) { saved.set(key, structuredClone(value)) },
    async transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const result = queue.then(() => callback(storage)); queue = result.catch(() => {}); return result
    },
  }
  const account = new AccountEntitlements({ storage })
  const call = async (path: string, body: unknown) => {
    const response = await account.fetch(new Request('https://entitlement.internal' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }))
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  return { saved, call }
}
function result(id: string, model: string) {
  const blueprint = demoBlueprint('A small blue tower')
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model,
    limitation: 'Inert migration fixture. No provider request.',
    delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_sol61_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'b'.repeat(64), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
}
const reservation = (id: string) => ({ id, profile: 'fast', model: 'sol', fingerprint, channel: 'blueprint', blueprintDispatch: 'fenced-v1' })

test('Sol 6.1 preserves customer points, 35-cent ceiling and conservative long-context regional reservation', () => {
  assert.equal(MODEL_CATALOG.sol.model, 'gpt-6.1-sol')
  assert.equal(MODEL_CATALOG.sol.label, 'GPT-6.1 Sol')
  assert.equal(MODEL_CATALOG.sol.creditsPerGeneration, 50)
  assert.equal(MODEL_CATALOG.sol.maxProviderCents, 35)
  assert.equal(blueprintReservationMicroUsd('sol', 1000), 3048 * 6 + 4000 * 17)
  // Official standard long-context cache-write+regional input=5.5/M; output=16.5/M.
  assert.ok(blueprintReservationMicroUsd('sol', 1000) >= 3048 * 5.5 + 4000 * 16.5)
})

test('new Sol admission binds exact 6.1 identity and rejects an old-model response', async () => {
  const f = fixture(), id = crypto.randomUUID()
  await f.call('/grant', { id: 'in_sol61', credits: 1500 })
  const reserved = await f.call('/reserve', { ...reservation(id), providerModel: 'gpt-6.1-sol' })
  assert.equal(reserved.status, 200); assert.equal(reserved.body.providerModel, 'gpt-6.1-sol'); assert.equal(reserved.body.cost, 50)
  assert.equal((f.saved.get('job:' + id) as { blueprintProviderModel: string }).blueprintProviderModel, 'gpt-6.1-sol')
  const wrong = await f.call('/blueprint-complete', { id, result: result(id, 'gpt-6-sol') })
  assert.equal(wrong.body.saved, false); assert.equal(f.saved.has('blueprint-result:' + id), false)
  assert.equal((await f.call('/blueprint-complete', { id, result: result(id, 'gpt-6.1-sol') })).body.saved, true)
  assert.equal(f.saved.get('balance'), 1450)
})

test('old markerless Sol reservation completes only with its historical model and recovers unchanged', async () => {
  const f = fixture(), id = crypto.randomUUID()
  await f.call('/grant', { id: 'in_old_sol', credits: 1500 })
  await f.call('/reserve', reservation(id))
  assert.equal(Object.hasOwn(f.saved.get('job:' + id) as object, 'blueprintProviderModel'), false)
  assert.equal((await f.call('/blueprint-complete', { id, result: result(id, 'gpt-6.1-sol') })).body.saved, false)
  const original = result(id, 'gpt-6-sol')
  assert.equal((await f.call('/blueprint-complete', { id, result: original })).body.saved, true)
  const replay = await f.call('/reserve', { ...reservation(id), providerModel: 'gpt-6.1-sol' })
  assert.equal(replay.body.repeated, true)
  assert.deepEqual((await f.call('/blueprint-status', { id })).body.result, original)
  assert.equal(f.saved.get('balance'), 1450)
})

test('new model binding cannot cross model or detailed-route boundaries', async () => {
  const f = fixture()
  for (const body of [
    { ...reservation(crypto.randomUUID()), providerModel: 'gpt-6-sol' },
    { ...reservation(crypto.randomUUID()), model: 'luna', providerModel: 'gpt-6.1-sol' },
    { ...reservation(crypto.randomUUID()), profile: 'slow', model: 'astra', channel: 'studio', providerModel: 'gpt-6.1-sol' },
  ]) assert.equal((await f.call('/reserve', body)).status, 400)
  assert.equal(f.saved.size, 0)
  assert.equal(boundBlueprintProviderModel({ profile: 'fast' }), 'gpt-6-sol')
  assert.equal(boundBlueprintProviderModel({ profile: 'fast', blueprintProviderModel: 'gpt-6.1-sol' }), 'gpt-6.1-sol')
  assert.equal(boundBlueprintProviderModel({ profile: 'slow', blueprintProviderModel: 'gpt-6.1-sol' }), null)
  assert.equal(boundBlueprintProviderModel({ profile: 'fast', blueprintProviderModel: undefined }), null)
})

test('old and new result provenance stays distinct and unknown new slugs fail closed', () => {
  for (const model of ['gpt-6-sol', 'gpt-6.1-sol']) assert.equal(validateGenerationResult(result(crypto.randomUUID(), model)).model, model)
  assert.throws(() => validateGenerationResult(result(crypto.randomUUID(), 'gpt-6.1-astra')), /provenance/)
})

test('health publishes reviewed Sol 6.1 and independent Luna readiness without calling a provider', async () => {
  const env: Env = { OPENAI_API_KEY: 'inert-test-only', ENABLE_PAID_GENERATION: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: value => value, get: () => ({ async fetch() { return Response.json({ used: 0, unlimited: true, limit: null, remaining: null, enabled: true }) } }) } }
  const never = (async () => { throw new Error('No external provider call permitted') }) as typeof fetch
  const health = await (await handle(new Request('https://worldifact.test/api/health'), env, never)).json() as Record<string, unknown>
  assert.equal(health.model, 'gpt-6.1-sol'); assert.equal(health.lunaBlueprintReady, true); assert.deepEqual(health.draftModels, ['sol', 'luna'])
  const old = await (await handle(new Request('https://worldifact.test/api/health'), { ...env, OPENAI_FAST_MODEL: 'gpt-6-sol' }, never)).json() as Record<string, unknown>
  assert.equal(old.generationReady, false); assert.equal(old.lunaBlueprintReady, false)
})

test('browser recovery preserves old model identity while new submissions persist exact Sol 6.1', async () => {
  const { BlueprintClient, BLUEPRINT_RECOVERY_KEY } = await import('../src/lib/blueprintClient.ts')
  const { blueprintRequestId } = await import('../src/lib/blueprintRequest.ts')
  const saved = new Map<string, string>()
  const store = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) }, removeItem: (key: string) => { saved.delete(key) } }
  const oldId = crypto.randomUUID(), oldResult = result(await blueprintRequestId(oldId), 'gpt-6-sol')
  saved.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify({ id: oldId, fingerprint, model: 'sol', state: 'pending', createdAt: Date.now() }))
  const methods: string[] = []
  const client = new BlueprintClient(store, (async (_url: unknown, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET')
    if (init?.method !== 'POST') return Response.json({ state: 'completed', result: oldResult })
    const id = new Headers(init.headers).get('X-WORLDIFACT-Request')!
    return Response.json(result(await blueprintRequestId(id), 'gpt-6.1-sol'))
  }) as typeof fetch)
  assert.equal((await client.recover()).model, 'gpt-6-sol')
  assert.equal(Object.hasOwn(client.current()!, 'providerModel'), false)
  client.reset()
  assert.equal((await client.submit({ model: 'sol', prompt: 'A new blue tower' })).model, 'gpt-6.1-sol')
  assert.equal(client.current()!.providerModel, 'gpt-6.1-sol')
  assert.deepEqual(methods, ['GET', 'POST'])
  saved.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify({ ...client.current(), providerModel: 'gpt-6.1-astra' }))
  assert.throws(() => client.current(), /identity needs review/)
})

test('prospective failed liability uses bounded actual output while the completed v1 default stays unchanged', async () => {
  const { blueprintRetainedCents } = await import('../server/blueprintTerminalUsage.ts')
  assert.equal(blueprintRetainedCents('sol', 1000), 9)
  assert.equal(blueprintRetainedCents('astra', 1000), 27)
  assert.equal(blueprintRetainedCents('luna', 1000, 100), 1)
  assert.equal(blueprintRetainedCents('sol', 1000, 100), 2)
  assert.equal(blueprintRetainedCents('astra', 1000, 100), 5)
  assert.equal(blueprintRetainedCents('sol', 0, 0), 2)
  for (const input of [-1, 0.5, NaN, Infinity, 32769]) assert.throws(() => blueprintRetainedCents('sol', input, 100), /bounds/)
  for (const output of [-1, 0.5, NaN, Infinity, 4001]) assert.throws(() => blueprintRetainedCents('sol', 1000, output), /bounds/)
})
