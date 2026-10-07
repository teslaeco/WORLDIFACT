import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { handle as oldHandle } from './fixtures/sol61-legacy-worker.ts'
import { BlueprintClient, BLUEPRINT_RECOVERY_KEY } from '../src/lib/blueprintClient.ts'
import { BlueprintClient as OldClient } from './fixtures/sol61-legacy-client.ts'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { blueprintFingerprint, blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'

const origin = 'https://worldifact.test', user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const payload = { worldId: 'ai-game-lab', prompt: 'A blue silver tower', mode: 'live', model: 'sol' }
function browser() {
  const values = new Map<string, string>()
  return { values, store: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } }
}
function result(id: string, model: string) {
  const blueprint = demoBlueprint(payload.prompt)
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model,
    limitation: 'Offline mixed-deployment fixture; no live request.', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_mixed_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'b'.repeat(64), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
}
async function fixture() {
  const values = new Map<string, unknown>(), calls = { reserve: 0, count: 0, provider: 0, post: 0, get: 0 }
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    async transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) { const result = queue.then(() => callback(storage)); queue = result.catch(() => {}); return result },
  }
  const env: Env = { OPENAI_API_KEY: 'inert-fixture-only', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6.1-sol',
    ENABLE_PAID_GENERATION: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: value => value, get: () => ({ async fetch() { return Response.json({ allowed: true }) } }) } }
  const ledger = new AccountEntitlements({ storage }, env)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: value => value, get: () => ({ async fetch(request) { if (new URL(request.url).pathname === '/generation-v3/reserve') calls.reserve++; return ledger.fetch(request) } }) }
  const call = async (path: string, body: unknown) => ledger.fetch(new Request('https://ledger.internal' + path, { method: 'POST', body: JSON.stringify(body) }))
  await call('/grant', { id: 'in_mixed_fixture', credits: 1500 })
  const provider = (async (input: unknown, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: user, email: 'fixture@example.test' })
    if (path === '/v1/responses/input_tokens') { calls.count++; return Response.json({ object: 'response.input_tokens', input_tokens: 100 }) }
    assert.equal(path, '/v1/responses'); calls.provider++
    const sent = JSON.parse(String(init?.body)), blueprint = demoBlueprint(payload.prompt)
    return Response.json({ id: 'resp_mixed_fixture', model: sent.model, status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec: assetSpecForBlueprint(blueprint) }) }] }] })
  }) as typeof fetch
  const transport = (old = false) => (async (input: unknown, init?: RequestInit) => {
    calls[init?.method === 'POST' ? 'post' : 'get']++
    const headers = new Headers(init?.headers); headers.set('Cookie', '__Host-worldifact-access=inert-token')
    return (old ? oldHandle : handle)(new Request(origin + String(input), { ...init, headers }), old ? { ...env, OPENAI_FAST_MODEL: 'gpt-6-sol' } : env, provider)
  }) as typeof fetch
  const legacyPost = (id: string, body = payload) => transport()('/api/blueprint', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': id }, body: JSON.stringify(body) })
  const seed = async (complete: boolean) => {
    const id = crypto.randomUUID(), requestId = await blueprintRequestId(id)
    const fingerprint = await blueprintFingerprint({ worldId: payload.worldId, prompt: payload.prompt, model: 'sol', deliverable: 'procedural-blueprint', references: [] })
    await call('/reserve', { id: requestId, fingerprint, model: 'sol', profile: 'fast', channel: 'blueprint', blueprintDispatch: 'fenced-v1' })
    const original = result(requestId, 'gpt-6-sol')
    if (complete) assert.equal((await (await call('/blueprint-complete', { id: requestId, result: original })).json() as { saved: boolean }).saved, true)
    return { id, original, metadata: { id, fingerprint: await blueprintFingerprint(payload), model: 'sol', state: 'pending', createdAt: Date.now() } }
  }
  return { values, calls, transport, seed, legacyPost }
}

test('actual legacy client against current Worker refuses before reservation and refresh requires an explicit reset', async () => {
  const f = await fixture(), b = browser(), before = structuredClone([...f.values])
  const old = new OldClient(b.store, f.transport())
  await assert.rejects(old.submit(payload), /No provider generation was submitted/)
  assert.equal(old.current()?.state, 'failed'); assert.equal(old.current()?.failureCode, 'ACCOUNT_ADMISSION_UNAVAILABLE'); assert.equal(Object.hasOwn(old.current()!, 'providerModel'), false)
  assert.deepEqual([...f.values], before); assert.deepEqual(f.calls, { reserve: 0, count: 0, provider: 0, post: 1, get: 0 })
  const current = new BlueprintClient(b.store, f.transport())
  await assert.rejects(current.submit(payload), /No provider generation was submitted/)
  await assert.rejects(current.recover(), /No provider generation was submitted/)
  assert.deepEqual(f.calls, { reserve: 0, count: 0, provider: 0, post: 1, get: 0 })
  current.reset()
  assert.equal((await current.submit(payload)).model, 'gpt-6.1-sol')
  assert.deepEqual(f.calls, { reserve: 1, count: 1, provider: 1, post: 2, get: 0 })
})

test('current client against actual legacy Worker refuses the body contract without any paid work or GET loop', async () => {
  const f = await fixture(), b = browser(), before = structuredClone([...f.values]), client = new BlueprintClient(b.store, f.transport(true))
  await assert.rejects(client.submit(payload), /supported WORLDIFACT portal/)
  assert.equal(client.current()?.state, 'failed'); assert.equal(client.current()?.failureCode, 'ACCOUNT_ADMISSION_UNAVAILABLE'); assert.equal(client.current()?.providerModel, 'gpt-6.1-sol')
  assert.deepEqual([...f.values], before)
  await assert.rejects(new BlueprintClient(b.store, f.transport(true)).submit(payload), /No provider generation was submitted/)
  assert.deepEqual(f.calls, { reserve: 0, count: 0, provider: 0, post: 1, get: 0 })
})

test('legacy POST only recovers an existing owned old result with matching historical fingerprint', async () => {
  const f = await fixture(), seeded = await f.seed(true), before = structuredClone([...f.values])
  const existing = await f.legacyPost(seeded.id)
  assert.equal(existing.status, 200); assert.deepEqual(await existing.json(), seeded.original)
  const conflict = await f.legacyPost(seeded.id, { ...payload, prompt: 'Different tower' })
  assert.equal(conflict.status, 409); assert.equal((await conflict.json() as { result?: unknown }).result, undefined)
  const unknown = await f.legacyPost(crypto.randomUUID())
  assert.equal(unknown.status, 409); assert.equal((await unknown.json() as { noCharge?: boolean }).noCharge, true)
  assert.deepEqual([...f.values], before); assert.equal(f.calls.reserve, 0); assert.equal(f.calls.provider, 0); assert.equal(f.calls.count, 0)
})

test('legacy completed and pending browser receipts remain GET-only across refresh without relabeling', async () => {
  for (const completed of [true, false]) {
    const f = await fixture(), seeded = await f.seed(completed), b = browser(), before = structuredClone([...f.values])
    b.values.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify(seeded.metadata))
    const current = new BlueprintClient(b.store, f.transport())
    if (completed) assert.equal((await current.submit(payload)).model, 'gpt-6-sol')
    else { await assert.rejects(current.submit(payload), /pending/); assert.equal(current.current()?.state, 'pending'); assert.throws(() => current.reset(), /Recover/); }
    assert.deepEqual([...f.values], before); assert.deepEqual(f.calls, { reserve: 0, count: 0, provider: 0, post: 0, get: 1 })
  }
})
