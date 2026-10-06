import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { handle, type Env } from '../server/worker.ts'
import type { StudioEnv } from '../server/studio.ts'
import { AccountEntitlements, reserveUserGeneration, markStudioDispatch, type EntitlementStorage } from '../server/entitlements.ts'
import { OVERNIGHT_TEST_APPROVAL, OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE, type OvernightTestClaim } from '../server/overnightTestBudget.ts'
import { TEST_ACCOUNT_CONTRACT, TEST_ACCOUNT_HEADER, TEST_CONTRACT_HEADER } from '../src/lib/testAccountContract.ts'
import { inputDigest, prepareStudioInput, validateStudioInput, type StudioInput, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { blueprintFingerprint, blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { detailedGLBFixture, detailedHealthFixture } from './detailed-studio-fixture.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-06T05:00:00Z'), END = Date.parse('2026-10-06T12:00:00Z')
const ORIGIN = 'https://worldifact.test', ACCOUNT = `account:v1:${OWNER}`, PROVIDER = 'provider-budget-cents:v1'
const oldKeys = ['support-astra-once:v1', 'support-astra-supplemental:v1', 'support-astra-repaired-mcc:v1', 'project-astra-mcc-budget:v1']
const oldNames = ['astra-support-once:v1', 'astra-support-supplemental:v1', 'astra-support-repaired-mcc:v1', 'project-astra-mcc-once:v1']
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Private offline silver tower', purpose: 'figurine', textureMaxSize: 2048, photos: [] }
const headers = (account = OWNER): Record<string, string> => ({ [TEST_ACCOUNT_HEADER]: account, [TEST_CONTRACT_HEADER]: TEST_ACCOUNT_CONTRACT })
const envelope = (value: unknown, account = OWNER) => ({ testContract: TEST_ACCOUNT_CONTRACT, expectedAccountId: account, input: value })
const blueprintInput = (model: 'sol' | 'luna' = 'sol') => ({ worldId: 'ai-game-lab', prompt: 'Private offline silver tower', model, providerModel: model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-luna', mode: 'live' })
const selector = () => JSON.stringify({ version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-05T11:00:00.000Z', maxProviderCents: 175, maxAttempts: 1, fingerprint: 'a'.repeat(64) })
type Store = { values: Map<string, unknown>; storage: EntitlementStorage; writes: string[] }
type Pool = { committedCents: number; claims: OvernightTestClaim[] }
type ContractStatus = { accountContract: string; approvalId: string; expiresAt: string; commitments: { jobId: string; workflow: string; capCents: number }[];
  attempts: Record<string, number>; totalCents: number; committedCents: number; remainingCents: number; noRecycling: boolean; available: boolean }
type CurrentResponse = { accountContract?: string; current: { receipt: StudioReceipt; fundingSource: string } }
type JobResponse = { job: { id: string; state: string; downloadAllowed: boolean } }
const readJson = async <T = Record<string, unknown>>(response: Response): Promise<T> => response.json() as Promise<T>

/** Every dependency is inert. Actual Worker routing and Durable Object admission
 * run in memory; an unexpected outbound route is a test failure, never a fetch. */
function fixture() {
  const stores = new Map<string, Store>(), objects = new Map<string, AccountEntitlements>()
  const internal: { name: string; path: string }[] = [], external: string[] = []
  const oracleBodies: Record<string, unknown>[] = [], providerBodies: Record<string, unknown>[] = []
  const calls = { oraclePost: 0, provider: 0, ordinaryReserve: 0, testReserve: 0, poolClaim: 0, globalReserve: 0 }
  let oracleState = 'building'
  const env: Env & StudioEnv = {
    OPENAI_API_KEY: 'inert-only', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6.1-sol', ENABLE_PAID_GENERATION: 'true', ENABLE_ASTRA_PLANS: 'true',
    ENABLE_STUDIO_JOBS: 'true', PUBLIC_PILOT: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', STUDIO_NEW_JOB_POLICY: 'legacy-usd175-v1', GENERATION_REQUEST_LIMIT: 'unlimited',
    OWNER_ACCESS_TOKEN: 'inert-test-owner-'.repeat(4), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'inert-only', WORLDIFACT_ASTRA_PROJECT_BUDGET: selector(),
    GENERATION_LIMITER: { async limit() { return { success: true } } }, ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request) {
      if (new URL(request.url).pathname === '/status') return Response.json({ used: 0, unlimited: true, limit: null, remaining: null, enabled: true, expiresAt: null })
      calls.globalReserve++; return Response.json({ allowed: true })
    } }) },
  }
  const ensure = (name: string): Store => {
    if (stores.has(name)) return stores.get(name)!
    const seed: Record<string, unknown> = name.startsWith('account:') ? {
      balance: 2055, [PROVIDER]: 98, subscription: { id: 'sub_inert', active: true, until: END + 86_400_000, revision: 1, plan: 'pro' },
      ...Object.fromEntries(oldKeys.map(key => [key, { consumed: true, immutable: key }])),
    } : oldNames.includes(name) ? Object.fromEntries(oldKeys.map(key => [key, { consumed: true, immutable: `global-${key}` }])) : {}
    const values = new Map(Object.entries(seed))
    if (name === ACCOUNT || name === 'project-astra-mcc-once:v1') values.set('project-astra-mcc-budget:v1', {
      ...JSON.parse(selector()), source: 'project', attemptsUsed: 1, reservedCents: 175, jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', at: NOW - 86_400_000,
    })
    let tail: Promise<unknown> = Promise.resolve()
    const store: Store = { values, storage: undefined as unknown as EntitlementStorage, writes: [] }
    const access = (target: Map<string, unknown>): EntitlementStorage => ({
      async get<T>(key: string) { return structuredClone(target.get(key)) as T | undefined },
      async put(key, value) {
        store.writes.push(key)
        if (key === PROVIDER || oldKeys.includes(key)) throw new Error('Attempted change to historical financial authority')
        target.set(key, structuredClone(value))
      },
      async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
        return new Map([...target].filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter))
          .sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value)])) as Map<string, T>
      },
      transaction<T>(fn: (tx: EntitlementStorage) => Promise<T>) {
        const next = tail.then(async () => { const draft = structuredClone(values), result = await fn(access(draft)); values.clear(); for (const [key, value] of draft) values.set(key, value); return result })
        tail = next.catch(() => undefined); return next
      },
    })
    store.storage = access(values); stores.set(name, store); return store
  }
  ;[ACCOUNT, `account:v1:${OTHER}`, OVERNIGHT_TEST_NAMESPACE, ...oldNames].forEach(ensure)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: opaque => ({ async fetch(request) {
    const name = String(opaque), path = new URL(request.url).pathname; internal.push({ name, path })
    if (path === '/reserve') calls.ordinaryReserve++
    if (path === '/reserve-overnight-test') calls.testReserve++
    if (path === '/overnight-test-claim') calls.poolClaim++
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: ensure(name).storage, id: { toString: () => name } }, env))
    return objects.get(name)!.fetch(request)
  } }) }
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer owner-token') return Response.json({ id: OWNER, email: 'owner@example.invalid' })
      if (token === 'Bearer other-token') return Response.json({ id: OTHER, email: 'other@example.invalid' })
      return Response.json({}, { status: 401 })
    }
    external.push(`${init?.method ?? 'GET'} ${path}`)
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs') { calls.oraclePost++; const body = JSON.parse(String(init?.body)); oracleBodies.push(body); return Response.json({ id: body.id, state: oracleState }) }
    if (/^\/v1\/jobs\/[^/]+\/model$/.test(path)) { const bytes = detailedGLBFixture(); return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }) }
    if (/^\/v1\/jobs\/[^/]+$/.test(path)) return Response.json({ id: path.split('/')[3], state: oracleState })
    if (path === '/v1/responses/input_tokens') return Response.json({ object: 'response.input_tokens', input_tokens: 1000 })
    assert.equal(path, '/v1/responses', `Unexpected inert route: ${path}`); calls.provider++
    const body = JSON.parse(String(init?.body)); providerBodies.push(body)
    const blueprint = demoBlueprint('Offline silver tower')
    return Response.json({ id: 'resp_inert_contract_fixture', model: body.model, status: 'completed', usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec: assetSpecForBlueprint(blueprint) }) }] }] })
  }) as typeof fetch
  const request = (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}, token: string | null = 'owner-token') => handle(new Request(ORIGIN + path, {
    method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Cookie: `__Host-worldifact-access=${token}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  const prepare = async (value: unknown = input) => {
    const response = await request('/api/overnight-tests/studio/prepare', 'POST', envelope(value), headers())
    assert.equal(response.status, 200, await response.clone().text()); return response.json() as Promise<StudioReceipt>
  }
  const submit = (receipt: StudioReceipt, value: unknown = input) => request('/api/overnight-tests/studio/jobs', 'POST', envelope(value), { ...headers(), ...receiptHeaders(receipt) })
  const direct = (model: 'sol' | 'luna' = 'sol', seed = crypto.randomUUID(), value = blueprintInput(model)) => request('/api/overnight-tests/blueprint', 'POST', envelope(value), { ...headers(), 'X-WORLDIFACT-Request': seed })
  const snapshot = () => structuredClone([...stores].map(([name, store]) => [name, [...store.values]]))
  const protectedSnapshot = () => structuredClone([...stores].map(([name, store]) => [name, [...store.values].filter(([key]) => key === PROVIDER || oldKeys.includes(key))]))
  return { env, calls, stores, ensure, internal, external, oracleBodies, providerBodies, request, prepare, submit, direct, snapshot, protectedSnapshot,
    pool: () => ensure(OVERNIGHT_TEST_NAMESPACE).values.get(OVERNIGHT_TEST_STATE) as Pool | undefined,
    completeOracle: () => { oracleState = 'succeeded' },
  }
}
const receiptHeaders = (receipt: StudioReceipt) => ({ 'X-WORLDIFACT-Job': receipt.ticket, 'X-WORLDIFACT-Idempotency-Key': receipt.id })
function frozenClock(t: TestContext) { t.mock.timers.enable({ apis: ['Date'], now: NOW }) }
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Historical v1 ticket bytes, without invoking the new POST handshake. Only
 * unchanged internal admission/dispatch functions seed the already-started job. */
async function seedLegacyAstra(f: ReturnType<typeof fixture>) {
  const id = crypto.randomUUID(), canonical = validateStudioInput(input)
  const fingerprint = sha256(`WORLDIFACT-ACCOUNT-JOB-v1:${OWNER}:${sha256(`${OVERNIGHT_TEST_APPROVAL}:${await inputDigest(canonical)}`)}`)
  const payload = `${id}.${NOW - 60_000}.${fingerprint}`
  const ticket = `${payload}.${createHmac('sha256', f.env.OWNER_ACCESS_TOKEN!).update(`WORLDIFACT-STUDIO-RECEIPT-v1:${payload}:account:${OWNER}`).digest('hex')}`
  assert.equal((await reserveUserGeneration(f.env, OWNER, id, 'slow', 'astra', fingerprint, 'standard', { channel: 'studio', prompt: input.prompt, overnightTest: true })).allowed, true)
  assert.equal((await markStudioDispatch(f.env, OWNER, id, fingerprint)).dispatch, true)
  return { id, ticket, createdAt: new Date(NOW - 60_000).toISOString() }
}
async function assertDenied(response: Response) {
  assert.ok(response.status >= 400 && response.status < 500, await response.clone().text())
  const value = await response.json() as Record<string, unknown>
  for (const key of ['current', 'job', 'result', 'commitments', 'credits', 'subscription', 'ticket', 'accountContract']) assert.equal(Object.hasOwn(value, key), false, `Refusal leaked ${key}`)
  assert.doesNotMatch(JSON.stringify(value), /Private offline|aaaaaaaa-aaaa|bbbbbbbb-bbbb|fingerprint|data:image/)
}

test('status requires both exact headers; account/current negotiate only on matched headers and preserve legacy reads', async t => {
  frozenClock(t); const f = fixture()
  for (const path of ['/api/account/entitlements', '/api/studio/current']) {
    const legacy = await f.request(path); assert.equal(legacy.status, 200)
    assert.equal(Object.hasOwn(await readJson(legacy), 'accountContract'), false)
    const expected = await f.request(path, 'GET', undefined, headers()); assert.equal(expected.status, 200)
    assert.equal((await readJson(expected)).accountContract, 'approved-test-account-v1')
  }
  const status = await f.request('/api/overnight-tests/status', 'GET', undefined, headers()); assert.equal(status.status, 200)
  assert.deepEqual((await readJson(status)).commitments, [])
  for (const badHeaders of [{}, { [TEST_ACCOUNT_HEADER]: OWNER }, { [TEST_CONTRACT_HEADER]: TEST_ACCOUNT_CONTRACT },
    { ...headers(), [TEST_CONTRACT_HEADER]: 'approved-test-account-v0' }, headers(OTHER), headers('not-an-account')]) {
    const before = f.snapshot(), internal = f.internal.length, external = f.external.length
    await assertDenied(await f.request('/api/overnight-tests/status', 'GET', undefined, badHeaders))
    if (Object.keys(badHeaders).length) for (const path of ['/api/account/entitlements', '/api/studio/current', '/api/account/generation-funding'])
      await assertDenied(await f.request(path, 'GET', undefined, badHeaders))
    assert.deepEqual(f.snapshot(), before); assert.equal(f.internal.length, internal); assert.equal(f.external.length, external)
  }
  assert.equal(f.pool(), undefined)
})

test('a switched cookie denies every owned read and test start before claims, account reads or dispatch', async t => {
  frozenClock(t); const f = fixture(), receipt = await seedLegacyAstra(f), seed = crypto.randomUUID()
  for (const [expected, token] of [[OWNER, 'other-token'], [OTHER, 'owner-token']] as const) {
    const before = f.snapshot(), calls = structuredClone(f.calls), internal = f.internal.length, external = f.external.length
    for (const path of ['/api/overnight-tests/status', '/api/account/entitlements', '/api/studio/current', '/api/studio/library', '/api/account/generation-funding',
      `/api/studio/jobs/${receipt.id}`, `/api/studio/jobs/${receipt.id}/model`, `/api/blueprint/requests/${seed}`])
      await assertDenied(await f.request(path, 'GET', undefined, { ...headers(expected), ...receiptHeaders(receipt) }, token))
    for (const [path, body] of [['/api/overnight-tests/studio/prepare', input], ['/api/overnight-tests/studio/jobs', input], ['/api/overnight-tests/blueprint', blueprintInput()]] as const)
      await assertDenied(await f.request(path, 'POST', envelope(body, expected), { ...headers(expected), ...receiptHeaders(receipt), 'X-WORLDIFACT-Request': seed }, token))
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.calls, calls); assert.equal(f.internal.length, internal); assert.equal(f.external.length, external)
  }
})

test('missing, partial, wrong-version and mismatched POST envelopes never admit an old or mixed client', async t => {
  frozenClock(t); const f = fixture(), receipt = await f.prepare()
  const cases: { wrap: (body: unknown) => unknown; extra: Record<string, string> }[] = [
    { wrap: (body: unknown) => body, extra: {} },
    { wrap: (body: unknown) => body, extra: headers() },
    { wrap: envelope, extra: {} },
    { wrap: envelope, extra: { [TEST_ACCOUNT_HEADER]: OWNER } },
    { wrap: envelope, extra: { [TEST_CONTRACT_HEADER]: TEST_ACCOUNT_CONTRACT } },
    { wrap: envelope, extra: { ...headers(), [TEST_CONTRACT_HEADER]: 'approved-test-account-v0' } },
    { wrap: (body: unknown) => ({ ...envelope(body), testContract: 'approved-test-account-v0' }), extra: headers() },
    { wrap: (body: unknown) => envelope(body, OTHER), extra: headers() },
    { wrap: (body: unknown) => ({ ...envelope(body), bypass: true }), extra: headers() },
    { wrap: (body: unknown) => ({ expectedAccountId: OWNER, input: body }), extra: headers() },
    { wrap: () => envelope([]), extra: headers() },
  ]
  for (const candidate of cases) for (const [path, body] of [['/api/overnight-tests/studio/prepare', input], ['/api/overnight-tests/studio/jobs', input], ['/api/overnight-tests/blueprint', blueprintInput()]] as const) {
    const before = f.snapshot(), calls = structuredClone(f.calls), external = f.external.length
    await assertDenied(await f.request(path, 'POST', candidate.wrap(body), { ...candidate.extra, ...receiptHeaders(receipt) }))
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.calls, calls); assert.equal(f.external.length, external)
  }
})

test('new POST envelopes fail the unchanged original route grammars, including an old prepared ticket', async t => {
  frozenClock(t); const f = fixture(), receipt = await seedLegacyAstra(f), before = f.snapshot(), calls = structuredClone(f.calls)
  for (const [path, body] of [['/api/studio/prepare', input], ['/api/studio/jobs', input], ['/api/blueprint', blueprintInput()]] as const)
    await assertDenied(await f.request(path, 'POST', envelope(body), { ...headers(), ...receiptHeaders(receipt) }))
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.calls, calls); assert.equal(f.external.length, 0)
})

test('full and manifest Studio negotiation retain canonical purpose, ordered references, fingerprint and one dispatch', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot()
  const jpeg = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
  const full: StudioInput = { ...input, prompt: '  Private carved terrain arch  ', purpose: 'terrain', textureMaxSize: 4096,
    photos: ['front', 'left'].map((view, index) => ({ name: ` private-${index}.jpg `, view: view as 'front' | 'left', subject: ' shared stone arch ', textureMaxSize: 4096, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` })) }
  const canonical = validateStudioInput(full), direct = await f.prepare(full), manifest = await f.prepare(await prepareStudioInput(full))
  const expectedHash = sha256(`WORLDIFACT-ACCOUNT-JOB-v1:${OWNER}:${sha256(`${OVERNIGHT_TEST_APPROVAL}:${await inputDigest(canonical)}`)}`)
  assert.equal(direct.ticket.split('.')[2], expectedHash); assert.equal(manifest.ticket.split('.')[2], expectedHash)
  assert.equal(f.pool(), undefined); assert.equal(f.calls.testReserve + f.calls.oraclePost, 0)
  for (const changed of [{ ...full, purpose: 'object' }, { ...full, photos: full.photos.slice(1) }, { ...full, photos: full.photos.map(photo => ({ ...photo, subject: 'changed subject' })) }]) {
    await assertDenied(await f.submit(manifest, changed)); assert.equal(f.pool(), undefined)
  }
  assert.equal((await f.submit(manifest, full)).status, 202)
  assert.equal((await f.submit(manifest, canonical)).status, 202)
  assert.equal(f.calls.oraclePost, 1); assert.equal(f.pool()?.committedCents, 175)
  const sent = f.oracleBodies[0]
  assert.equal(sent.id, manifest.id); assert.match(String(sent.prompt), /^Private carved terrain arch\n/); assert.match(String(sent.prompt), /editable 3D terrain/)
  assert.deepEqual(sent.photos, canonical.photos.map(photo => photo.view === 'left' ? { ...photo, view: 'side' } : photo))
  assert.match(String(sent.agentInstructions), /Reference 1: front; Reference 2: left/)
  assert.equal(f.pool()?.claims[0].fingerprint, expectedHash); assert.deepEqual(f.protectedSnapshot(), before); assert.equal(f.calls.ordinaryReserve, 0)
})

for (const model of ['sol', 'luna'] as const) test(`${model} negotiates exact provider wire identity and preserves the existing idempotency/fingerprint`, async t => {
  frozenClock(t); const f = fixture(), seed = crypto.randomUUID(), original = blueprintInput(model), before = f.protectedSnapshot()
  const response = await f.direct(model, seed); assert.equal(response.status, 200, await response.clone().text())
  const result = await readJson<{ requestId: string; model: string }>(response), jobId = await blueprintRequestId(seed)
  assert.equal(result.requestId, jobId); assert.equal(result.model, original.providerModel); assert.equal(f.providerBodies[0].model, original.providerModel)
  assert.equal(f.pool()?.claims[0].jobId, jobId)
  assert.equal(f.pool()?.claims[0].fingerprint, await blueprintFingerprint({ worldId: original.worldId, prompt: original.prompt, model, deliverable: 'procedural-blueprint', references: [], providerModel: original.providerModel, overnightTest: OVERNIGHT_TEST_APPROVAL }))
  assert.deepEqual(await (await f.direct(model, seed)).json(), result)
  await assertDenied(await f.direct(model, seed, { ...original, prompt: 'Changed private prompt' }))
  for (const extra of [{}, headers()]) {
    const recovered = await f.request(`/api/blueprint/requests/${seed}`, 'GET', undefined, extra)
    assert.equal(recovered.status, 200); assert.deepEqual((await readJson(recovered)).result, result)
  }
  assert.equal(f.calls.provider, 1); assert.equal(f.pool()?.claims.length, 1); assert.equal(f.pool()?.committedCents, model === 'sol' ? 35 : 10)
  assert.equal(f.calls.ordinaryReserve, 0); assert.deepEqual(f.protectedSnapshot(), before)
})

test('Sol compatibility recovery cannot inspect an account before checking a supplied expectation', async t => {
  frozenClock(t); const f = fixture(), { providerModel: _providerModel, ...oldSol } = blueprintInput(), seed = crypto.randomUUID()
  const before = f.snapshot()
  for (const path of ['/api/overnight-tests/blueprint', '/api/blueprint']) {
    const response = await f.request(path, 'POST', path.includes('overnight-tests') ? envelope(oldSol) : oldSol, { ...headers(), 'X-WORLDIFACT-Request': seed }, 'other-token')
    await assertDenied(response)
  }
  assert.equal(f.internal.length, 0, 'Expected-account mismatch must precede legacy Sol recovery reads')
  assert.deepEqual(f.snapshot(), before); assert.equal(f.calls.provider + f.calls.oraclePost, 0)
})

test('status commitments expose only exact fixed job IDs, workflows and caps, without resetting any consumed allowance', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot(), first = await f.prepare(), second = await f.prepare(), solSeed = crypto.randomUUID(), lunaSeed = crypto.randomUUID()
  assert.equal((await f.submit(first)).status, 202); assert.equal((await f.submit(second)).status, 202)
  assert.equal((await f.direct('sol', solSeed)).status, 200); assert.equal((await f.direct('luna', lunaSeed)).status, 200)
  const poolBefore = structuredClone(f.pool()), calls = structuredClone(f.calls)
  const response = await f.request('/api/overnight-tests/status', 'GET', undefined, headers()); assert.equal(response.status, 200)
  const status = await readJson<ContractStatus>(response)
  assert.equal(status.accountContract, TEST_ACCOUNT_CONTRACT); assert.equal(status.approvalId, 'api-tests-20261006-044444-usd4'); assert.equal(status.expiresAt, '2026-10-06T12:00:00.000Z')
  assert.deepEqual(status.commitments, [
    { jobId: first.id, workflow: 'detailed-astra', capCents: 175 }, { jobId: second.id, workflow: 'detailed-astra', capCents: 175 },
    { jobId: await blueprintRequestId(solSeed), workflow: 'blueprint-sol', capCents: 35 }, { jobId: await blueprintRequestId(lunaSeed), workflow: 'blueprint-luna', capCents: 10 },
  ])
  assert.deepEqual(status.attempts, { 'detailed-astra': 2, 'blueprint-sol': 1, 'blueprint-luna': 1 })
  assert.deepEqual([status.totalCents, status.committedCents, status.remainingCents, status.noRecycling, status.available], [400, 395, 5, true, false])
  assert.doesNotMatch(JSON.stringify(status), /prompt|fingerprint|accountId|account_id|aaaaaaaa-aaaa|private-reference/i)
  assert.deepEqual(f.calls, calls); assert.deepEqual(f.pool(), poolBefore)
  const third = await f.prepare(); await assertDenied(await f.submit(third)); await assertDenied(await f.direct('sol')); await assertDenied(await f.direct('luna'))
  t.mock.timers.setTime(END)
  const expired = await f.request('/api/overnight-tests/status', 'GET', undefined, headers())
  assert.equal(expired.status, 200); assert.deepEqual((await readJson(expired)).commitments, status.commitments)
  assert.deepEqual(f.pool(), poolBefore); assert.deepEqual(f.protectedSnapshot(), before)
  assert.equal(f.calls.oraclePost, 2); assert.equal(f.calls.provider, 2); assert.equal(f.calls.ordinaryReserve, 0)
})

test('a corrupt durable pool produces no commitments or replacement authority', async t => {
  frozenClock(t); const f = fixture(); await seedLegacyAstra(f)
  const corrupt = structuredClone(f.pool()!); corrupt.claims[0].capCents = 1
  f.ensure(OVERNIGHT_TEST_NAMESPACE).values.set(OVERNIGHT_TEST_STATE, corrupt)
  const before = f.snapshot(), calls = structuredClone(f.calls)
  const response = await f.request('/api/overnight-tests/status', 'GET', undefined, headers()); assert.equal(response.status, 503)
  const value = await readJson(response); assert.equal(Object.hasOwn(value, 'commitments'), false); assert.equal(Object.hasOwn(value, 'accountContract'), false)
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.calls, calls)
})

test('a pre-handshake approved Astra claim keeps its exact legacy receipt, GET recovery and model download', async t => {
  frozenClock(t); const f = fixture(), historical = await seedLegacyAstra(f), fingerprint = historical.ticket.split('.')[2]
  const poolBefore = structuredClone(f.pool()), protectedBefore = f.protectedSnapshot(), calls = structuredClone(f.calls)
  for (const extra of [{}, headers()]) {
    const response = await f.request(`/api/studio/jobs/${historical.id}`, 'GET', undefined, { ...extra, ...receiptHeaders(historical) })
    assert.equal(response.status, 200); assert.equal((await readJson<JobResponse>(response)).job.id, historical.id)
    const currentResponse = await f.request('/api/studio/current', 'GET', undefined, extra)
    if (Object.keys(extra).length) {
      assert.equal(currentResponse.status, 200)
      const current = await readJson<CurrentResponse>(currentResponse); assert.equal(current.current.receipt.id, historical.id)
      assert.equal(current.current.receipt.ticket.split('.')[2], fingerprint); assert.equal(current.current.fundingSource, OVERNIGHT_TEST_APPROVAL)
      assert.equal(current.accountContract, TEST_ACCOUNT_CONTRACT)
    } else {
      assert.equal(currentResponse.status, 409); await assertDenied(currentResponse)
    }
  }
  f.completeOracle()
  const completed = await f.request(`/api/studio/jobs/${historical.id}`, 'GET', undefined, receiptHeaders(historical))
  assert.equal(completed.status, 200); const completedJob = (await readJson<JobResponse>(completed)).job
  assert.equal(completedJob.id, historical.id); assert.equal(completedJob.state, 'succeeded'); assert.equal(completedJob.downloadAllowed, true)
  const settled = f.snapshot(), balance = f.ensure(ACCOUNT).values.get('balance')
  assert.equal(balance, 1805)
  t.mock.timers.setTime(END + 1)
  for (const extra of [{}, headers()]) {
    const download = await f.request(`/api/studio/jobs/${historical.id}/model`, 'GET', undefined, { ...extra, ...receiptHeaders(historical) })
    assert.equal(download.status, 200); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), detailedGLBFixture())
    const recovered = await f.request(`/api/studio/jobs/${historical.id}`, 'GET', undefined, { ...extra, ...receiptHeaders(historical) })
    assert.equal(recovered.status, 200); assert.equal((await readJson<JobResponse>(recovered)).job.id, historical.id)
  }
  const internal = f.internal.length, external = f.external.length
  await assertDenied(await f.request(`/api/studio/jobs/${historical.id}`, 'GET', undefined, { ...headers(), ...receiptHeaders(historical) }, 'other-token'))
  await assertDenied(await f.request(`/api/studio/jobs/${historical.id}/model`, 'GET', undefined, { ...headers(), ...receiptHeaders(historical) }, 'other-token'))
  assert.equal(f.internal.length, internal); assert.equal(f.external.length, external)
  assert.deepEqual(f.pool(), poolBefore); assert.deepEqual(f.protectedSnapshot(), protectedBefore); assert.deepEqual(f.calls, calls); assert.deepEqual(f.snapshot(), settled)
  assert.equal(f.calls.oraclePost + f.calls.provider, 0); assert.equal(f.pool()?.claims[0].fingerprint, fingerprint)
})

test('current funding source is approved only for the exact historical claim, ordinary if absent and unknown if malformed', async t => {
  frozenClock(t); const f = fixture(), receipt = await seedLegacyAstra(f), key = `job:${receipt.id}`, values = f.ensure(ACCOUNT).values
  const original = structuredClone(values.get(key)) as Record<string, unknown>, claim = original.overnightTest as OvernightTestClaim
  for (const [change, expected] of [
    [claim, OVERNIGHT_TEST_APPROVAL], [undefined, 'ordinary'], [null, 'unknown'], [{ ...claim, capCents: 400 }, 'unknown'],
    [{ ...claim, jobId: crypto.randomUUID() }, 'unknown'], [{ ...claim, accountId: OTHER }, 'unknown'], [{ ...claim, fingerprint: 'f'.repeat(64) }, 'unknown'],
    [{ ...claim, workflow: 'blueprint-sol', model: 'gpt-6.1-sol', capCents: 35 }, 'unknown'],
  ] as const) {
    const job = { ...original }; if (change === undefined) delete job.overnightTest; else job.overnightTest = change
    values.set(key, job); const before = f.snapshot(), calls = structuredClone(f.calls)
    const response = await f.request('/api/studio/current', 'GET', undefined, headers()); assert.equal(response.status, 200)
    assert.equal((await readJson<CurrentResponse>(response)).current.fundingSource, expected)
    const legacy = await f.request('/api/studio/current')
    if (expected === 'ordinary') {
      assert.equal(legacy.status, 200)
      const current = await readJson<CurrentResponse>(legacy); assert.equal(current.current.receipt.id, receipt.id); assert.equal(current.accountContract, undefined)
    } else {
      assert.equal(legacy.status, 409); await assertDenied(legacy)
    }
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.calls, calls)
  }
})
