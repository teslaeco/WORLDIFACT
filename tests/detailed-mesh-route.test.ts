import test from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { DETAILED_MESH_PROFILE, detailedRuntimeSafe, detailedStatusReady } from '../src/lib/detailedMesh.ts'
import { validateStudioInput, oracleStudioPayload, inputDigest, type PhotoView, type StudioInput } from '../src/lib/studioProtocol.ts'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, readSavedStudioJob } from '../src/lib/studioClient.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { referenceJpeg, reviewedOracleHealth, triangleGlb } from './fixtures/detailedOracle.ts'

const origin = 'https://worldifact.test', uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sideViews: PhotoView[] = ['front', 'left', 'right', 'back']
const input = (count = 3, length = 3005): StudioInput => validateStudioInput({ worldId: 'enchanted-ai-shop',
  prompt: ('Create a detailed adult heroine. ' + 'costume '.repeat(600)).slice(0, length),
  purpose: 'game', textureMaxSize: 4096, deliveryProfile: DETAILED_MESH_PROFILE,
  photos: Array.from({ length: count }, (_, i) => ({ name: `view-${i}.jpg`, view: sideViews[i % 4], dataUrl: referenceJpeg, textureMaxSize: 4096 })),
})
function memory() {
  const data = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(data.get(key)) as T | undefined },
    async put(key, value) { data.set(key, structuredClone(value)) },
    transaction<T>(fn: (s: EntitlementStorage) => Promise<T>) { const next = queue.then(() => fn(storage)); queue = next.catch(() => {}); return next },
  }
  return { storage, data }
}
async function fixture() {
  const account = memory(), pool = memory(), browser = new Map<string, string>()
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'fixture-owner-'.repeat(4), ORACLE_ENDPOINT: 'https://fixture.trycloudflare.com',
    ORACLE_API_TOKEN: 'fixture-not-a-real-token', PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true',
    ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', GENERATION_LIMITER: { async limit() { return { success: true } } },
  }
  const ledger = new AccountEntitlements({ storage: account.storage }, env)
  const budget = new GenerationBudget({ storage: pool.storage as BudgetStorage }, env)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: () => ledger }
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  await entitlementCall(env, uid, '/grant', { id: 'in_detailed_fixture', credits: 4500, subscriptionId: 'sub_Detailed' })
  await entitlementCall(env, uid, '/subscription', { id: 'sub_Detailed', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_detailed_fixture' })
  let oracleHealth: Record<string, unknown> = { ...reviewedOracleHealth }, posts = 0, artifactReads = 0, lost = false, responseState = 'queued'
  let submission: ReturnType<typeof oracleStudioPayload> | undefined
  const provider = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: uid, email: 'fixture@example.test' })
    if (path === '/v1/health') return Response.json(oracleHealth)
    if (path === '/v1/jobs') { posts++; submission = JSON.parse(String(init?.body)); return Response.json({ id: submission!.id, state: 'queued' }, { status: 202 }) }
    if (path.endsWith('/model')) { artifactReads++; const bytes = triangleGlb(); return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }) }
    if (path.startsWith('/v1/jobs/')) return Response.json({ id: path.split('/').at(-1), state: responseState })
    throw new Error('Unexpected fixture route: ' + path)
  }) as typeof fetch
  const transport = (async (url: string | URL | Request, init: RequestInit = {}) => {
    assert.notEqual(String(url), '/api/blueprint', 'Detailed generation must never use the blueprint substitute')
    const headers = new Headers(init.headers); headers.set('Origin', origin); headers.set('Cookie', '__Host-worldifact-access=fixture-session')
    const r = await studioApi(new Request(origin + url, { ...init, headers }), env, provider)
    if (String(url) === '/api/studio/jobs' && lost) { lost = false; throw new TypeError('Fixture: response lost after upstream acceptance') }
    return r
  }) as typeof fetch
  const store = { getItem: (k: string) => browser.get(k) ?? null, setItem: (k: string, v: string) => { browser.set(k, v) }, removeItem: (k: string) => { browser.delete(k) } }
  const client = new StudioCoordinator(store, transport)
  return { env, store, client, transport, account, pool, submission: () => submission!, posts: () => posts, artifactReads: () => artifactReads,
    health: (patch: Record<string, unknown>) => { oracleHealth = { ...oracleHealth, ...patch } },
    lose: () => { lost = true }, finish: (state = 'succeeded') => { responseState = state },
    credits: async () => (await entitlementStatus(env, uid)).credits }
}

test('detailed readiness requires both current monetary guard and reconciled output policy', () => {
  const now = Date.parse('2026-09-30T12:00:00Z')
  assert.equal(detailedRuntimeSafe(reviewedOracleHealth, now), true)
  for (const patch of [{ ready: false }, { codexReady: false }, { provider: 'other' }, { model: 'gpt-6-sol' },
    { connectorVersion: 32 }, { connectorVersion: '33' }, { astraBudgetMaxUsd: 4 }, { astraBudgetRevision: 'stale' },
    { astraBudgetPreflight: null }, { astraBudgetExpiry: 1799999999 }, { astraOutputPolicy: undefined },
    { astraReasoningEffort: 'high' }, { astraMaxOutputTokens: 5000 }, { astraUsageSettlement: 'unknown' }, { promptMaxLength: 2000 }])
    assert.equal(detailedRuntimeSafe({ ...reviewedOracleHealth, ...patch }, now), false, JSON.stringify(patch))
  assert.equal(detailedRuntimeSafe(reviewedOracleHealth, 1793145600 * 1000), false)
  const ready = { ready: true, detailedMeshReady: true, detailedMeshProfile: DETAILED_MESH_PROFILE, detailedMeshMaxPhotos: 4, detailedMeshPromptLimit: 4000 }
  assert.equal(detailedStatusReady(ready), true)
  for (const patch of [{ ready: false }, { detailedMeshReady: undefined }, { detailedMeshProfile: 'unreviewed' }, { detailedMeshMaxPhotos: 6 }, { detailedMeshPromptLimit: 4400 }])
    assert.equal(detailedStatusReady({ ...ready, ...patch }), false)
})
for (const count of [0, 1, 3, 4]) test(`versioned detailed protocol preserves a full 4,000-character brief and ${count} images`, async () => {
  const source = input(count, 4000), before = JSON.stringify(source), id = crypto.randomUUID(), payload = oracleStudioPayload(id, source)
  assert.equal(source.prompt.length, 4000); assert.equal(payload.prompt, source.prompt)
  assert.ok('agentInstructions' in payload && payload.agentInstructions && payload.agentInstructions.length < 12000)
  assert.deepEqual((payload.photos ?? []).map(photo => photo.dataUrl), source.photos.map(photo => photo.dataUrl))
  assert.deepEqual((payload.photos ?? []).map(photo => photo.view), ['front', 'side', 'side', 'back'].slice(0, count))
  for (let i = 0; i < count; i++) assert.ok(payload.agentInstructions!.includes(`Reference ${i + 1}: ${sideViews[i]}.`))
  assert.equal(JSON.stringify(source), before, 'Transport adaptation never mutates signed inputs')
  assert.equal(await inputDigest(source), await inputDigest(validateStudioInput(source)))
})
test('new protocol is explicitly versioned; legacy receipts retain their previous canonical payload', () => {
  const { deliveryProfile: _profile, ...legacy } = input(0)
  const oldPayload = oracleStudioPayload(crypto.randomUUID(), legacy)
  assert.ok(oldPayload.prompt.startsWith(legacy.prompt + '\n\nWORLDIFACT output:'))
  assert.equal(Object.hasOwn(validateStudioInput(legacy), 'deliveryProfile'), false)
  assert.throws(() => input(5), /four/)
  assert.throws(() => validateStudioInput({ ...input(), deliveryProfile: ['reference-mesh-v1'] }))
  assert.throws(() => validateStudioInput({ ...input(), generationProfile: 'fast-draft-v1' }))
  assert.throws(() => input(1, 4001))
})
for (const defect of ['disabled', 'old-output-policy', 'wrong-cost', 'photo-unavailable']) test(`${defect} blocks detailed work before reserving any points or sending Oracle jobs`, async () => {
  const f = await fixture()
  if (defect === 'disabled') f.env.ENABLE_STUDIO_JOBS = 'false'
  if (defect === 'old-output-policy') f.health({ astraOutputPolicy: undefined })
  if (defect === 'wrong-cost') f.health({ astraBudgetMaxUsd: 4 })
  if (defect === 'photo-unavailable') f.health({ photoInput: false })
  await assert.rejects(f.client.start(input(), () => {}))
  assert.equal(f.posts(), 0); assert.equal(await f.credits(), 4500)
  assert.equal(f.store.getItem(STUDIO_RECEIPT_KEY), null)
  assert.equal([...f.account.data.keys()].filter(k => k.startsWith('job:')).length, 0)
  const status = await (await f.transport('/api/studio/status')).json() as Record<string, unknown>
  if (defect !== 'photo-unavailable') assert.equal(detailedStatusReady(status), false)
})
test('guard is rechecked between free preparation and paid submission', async () => {
  const f = await fixture(), data = input()
  const prepared = await f.transport('/api/studio/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  assert.equal(prepared.status, 200); assert.equal(await f.credits(), 4500)
  const receipt = await prepared.json() as { ticket: string }
  f.health({ astraOutputPolicy: 'old-output' })
  const r = await f.transport('/api/studio/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': receipt.ticket }, body: JSON.stringify(data) })
  assert.equal(r.status, 503); assert.equal(f.posts(), 0); assert.equal(await f.credits(), 4500)
})
test('actual client, Worker and ledgers send three character references once, recover and return the original GLB', async () => {
  const f = await fixture(), data = input()
  const result = await f.client.start(data, saved => {
    assert.equal(readSavedStudioJob(f.store)?.receipt.id, saved.receipt.id)
    assert.equal(f.posts(), 0, 'Recovery is durable before the only upstream job POST')
  })
  assert.equal(result.state, 'queued'); assert.equal(f.posts(), 1); assert.equal(await f.credits(), 4250)
  const submitted = f.submission(); assert.ok('photos' in submitted)
  assert.equal(submitted.prompt, data.prompt); assert.equal(submitted.photos?.length, 3)
  assert.deepEqual(submitted.photos?.map(p => p.view), ['front', 'side', 'side'])
  await assert.rejects(f.client.start(data, () => {}), /already selected/)
  const saved = f.client.current!
  const replay = await f.transport('/api/studio/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': saved.receipt.ticket }, body: JSON.stringify(data) })
  assert.equal(replay.status, 202); assert.equal(f.posts(), 1)
  f.finish()
  assert.equal((await f.client.poll()).state, 'succeeded')
  const blob = await f.client.artifact('model'), bytes = await blob.arrayBuffer()
  inspectGLB(bytes)
  assert.deepEqual(new Uint8Array(bytes), triangleGlb())
  assert.equal(f.artifactReads(), 1); assert.equal(await f.credits(), 4250)
  assert.equal(f.posts(), 1)
})
test('lost detailed submit response and reload recover the same paid job with GET only', async () => {
  const f = await fixture(); f.lose()
  assert.equal((await f.client.start(input(), () => {})).state, 'pending')
  const recovered = new StudioCoordinator(f.store, f.transport), saved = recovered.restore()
  assert.equal(saved?.deliveryProfile, DETAILED_MESH_PROFILE)
  f.finish(); assert.equal((await recovered.poll()).state, 'succeeded')
  await recovered.artifact('model')
  assert.equal(f.posts(), 1); assert.equal(await f.credits(), 4250)
})
test('confirmed detailed failure refunds customer credits once but cannot renew provider allowance', async () => {
  const f = await fixture(); await f.client.start(input(), () => {})
  const budget = f.account.data.get('provider-budget-cents:v1')
  f.finish('failed')
  await f.client.poll(); await f.client.poll()
  assert.equal(await f.credits(), 4500)
  assert.equal(f.account.data.get('provider-budget-cents:v1'), budget)
  assert.equal(f.posts(), 1)
})

test('a policy change after preparation is a definitive no-charge failure, not an endless pending receipt', async () => {
  const f = await fixture()
  const result = await f.client.start(input(), () => { f.health({ astraOutputPolicy: 'old-output' }) })
  assert.equal(result.state, 'failed'); assert.equal(f.posts(), 0); assert.equal(await f.credits(), 4500)
  const restored = new StudioCoordinator(f.store, f.transport)
  restored.restore(); assert.equal((await restored.poll()).state, 'failed')
  assert.equal([...f.account.data.keys()].filter(k => k.startsWith('job:')).length, 0)
})
