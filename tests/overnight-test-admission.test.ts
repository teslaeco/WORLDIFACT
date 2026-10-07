import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import type { StudioEnv } from '../server/studio.ts'
import { handle, type Env } from '../server/worker.ts'
import { AccountEntitlements, reserveUserGeneration, settleUserGeneration, markStudioDispatch, reconcileUserStudioProvider, type EntitlementStorage } from '../server/entitlements.ts'
import { OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE, OVERNIGHT_TEST_APPROVAL } from '../server/overnightTestBudget.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
import { OvernightTestClient } from '../src/lib/overnightTestClient.ts'
import { TEST_ACCOUNT_CONTRACT, TEST_ACCOUNT_HEADER, TEST_CONTRACT_HEADER } from '../src/lib/testAccountContract.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-06T05:00:00Z'), END = Date.parse('2026-10-06T12:00:00Z')
const ORIGIN = 'https://worldifact.test', ACCOUNT = 'account:v1:' + OWNER, PROVIDER = 'provider-budget-cents:v1'
const oldKeys = ['support-astra-once:v1', 'support-astra-supplemental:v1', 'support-astra-repaired-mcc:v1', 'project-astra-mcc-budget:v1']
const oldNames = ['astra-support-once:v1', 'astra-support-supplemental:v1', 'astra-support-repaired-mcc:v1', 'project-astra-mcc-once:v1']
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'An offline detailed silver tower', purpose: 'figurine', textureMaxSize: 2048, photos: [] }
const selector = () => JSON.stringify({ version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-05T11:00:00.000Z', maxProviderCents: 175, maxAttempts: 1, fingerprint: 'a'.repeat(64) })
type Store = { values: Map<string, unknown>; storage: EntitlementStorage; attemptedProtectedWrites: string[]; beforeTransaction?: () => Promise<void>; beforeRead?: (key: string) => Promise<void>; beforeWrite?: (key: string) => Promise<void> }
function fixture() {
  const stores = new Map<string, Store>(), objects = new Map<string, AccountEntitlements>()
  const calls = { oraclePost: 0, provider: 0, count: 0, ordinaryReserve: 0, testReserve: 0, poolClaim: 0 }
  let upstreamFailure = false, countFailure = false, oracleLoss = false, legacyAccount = false
  let afterInternal: ((name: string, path: string, response: Response) => Promise<Response>) | undefined
  const env: Env & StudioEnv = { OPENAI_API_KEY: 'inert-only', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6.1-sol',
    ENABLE_PAID_GENERATION: 'true', ENABLE_ASTRA_PLANS: 'true', ENABLE_STUDIO_JOBS: 'true', PUBLIC_PILOT: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    STUDIO_NEW_JOB_POLICY: 'legacy-usd175-v1', GENERATION_REQUEST_LIMIT: 'unlimited',
    OWNER_ACCESS_TOKEN: 'inert-test-owner-'.repeat(4), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'inert-only',
    WORLDIFACT_ASTRA_PROJECT_BUDGET: selector(),
    GENERATION_LIMITER: { async limit() { return { success: true } } }, ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request) { return new URL(request.url).pathname === '/status'
      ? Response.json({ used: 0, unlimited: true, limit: null, remaining: null, enabled: true, expiresAt: null }) : Response.json({ allowed: true }) } }) } }
  const ensure = (name: string): Store => {
    if (stores.has(name)) return stores.get(name)!
    const seed: Record<string, unknown> = name.startsWith('account:') ? { balance: 2055, [PROVIDER]: 98, ...Object.fromEntries(oldKeys.map(key => [key, { immutable: key }])) }
      : oldNames.includes(name) ? Object.fromEntries(oldKeys.map(key => [key, { immutable: 'global-' + key }])) : {}
    const values = new Map(Object.entries(seed));
    if (name === ACCOUNT || name === 'project-astra-mcc-once:v1') values.set('project-astra-mcc-budget:v1', { ...JSON.parse(selector()), source: 'project', attemptsUsed: 1, reservedCents: 175, jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', at: Date.parse('2026-10-05T10:01:00Z') });
    let tail: Promise<unknown> = Promise.resolve()
    const record: Store = { values, storage: undefined as unknown as EntitlementStorage, attemptedProtectedWrites: [] }
    const access = (target: Map<string, unknown>): EntitlementStorage => ({
      async get<T>(key: string) { await record.beforeRead?.(key); return structuredClone(target.get(key)) as T | undefined },
      async put(key, value) {
        await record.beforeWrite?.(key)
        if (key === PROVIDER || oldKeys.includes(key)) { record.attemptedProtectedWrites.push(key); throw new Error('Protected historical write') }
        target.set(key, structuredClone(value))
      },
      async list<T>(options: { prefix: string; startAfter?: string; limit: number }) { return new Map([...target].filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit)) as Map<string, T> },
      transaction<T>(fn: (tx: EntitlementStorage) => Promise<T>) {
        const next = tail.then(async () => { const hook = record.beforeTransaction; record.beforeTransaction = undefined; await hook?.()
          const draft = structuredClone(values), result = await fn(access(draft)); values.clear(); for (const [key, value] of draft) values.set(key, value); return result })
        tail = next.catch(() => undefined); return next
      },
    })
    record.storage = access(values); stores.set(name, record); return record
  }
  ensure(ACCOUNT); oldNames.forEach(ensure)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: opaque => ({ async fetch(request) {
    const name = String(opaque), path = new URL(request.url).pathname.replace(/^\/generation-v3(?=\/)/, '')
    if (path === '/reserve') calls.ordinaryReserve++
    if (path === '/reserve-overnight-test') { calls.testReserve++; if (legacyAccount) return Response.json({ error: 'Legacy endpoint missing' }, { status: 404 }) }
    if (path === '/overnight-test-claim') calls.poolClaim++
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: ensure(name).storage, id: { toString: () => name } }, env))
    const response = await objects.get(name)!.fetch(request)
    return afterInternal ? afterInternal(name, path, response) : response
  } }) }
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer owner-token') return Response.json({ id: OWNER, email: 'owner@example.invalid' })
      if (token === 'Bearer other-token') return Response.json({ id: OTHER, email: 'other@example.invalid' })
      return Response.json({}, { status: 401 })
    }
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs') { calls.oraclePost++; if (oracleLoss) throw new Error('Inert acceptance uncertainty'); return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' }) }
    if (path.startsWith('/v1/jobs/')) return Response.json({ id: path.split('/')[3], state: 'building' })
    if (path === '/v1/responses/input_tokens') { calls.count++; return countFailure ? Response.json({}, { status: 403 }) : Response.json({ object: 'response.input_tokens', input_tokens: 1000 }) }
    assert.equal(path, '/v1/responses'); calls.provider++
    if (upstreamFailure) return Response.json({ error: 'Inert failure' }, { status: 500 })
    const body = JSON.parse(String(init?.body)), blueprint = demoBlueprint('Offline silver tower')
    return Response.json({ id: 'resp_overnight_fixture', model: body.model, status: 'completed', usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec: assetSpecForBlueprint(blueprint) }) }] }] })
  }) as typeof fetch
  const request = (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}, token: string | null = 'owner-token') => {
    const testRoute = path.startsWith('/api/overnight-tests/')
    const wire = testRoute && method === 'POST' && body && typeof body === 'object' && !Object.hasOwn(body, 'testContract')
      ? { testContract: TEST_ACCOUNT_CONTRACT, expectedAccountId: OWNER, input: body } : body
    const headers = new Headers({ Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Cookie: '__Host-worldifact-access=' + token } : {}),
      ...(testRoute ? { [TEST_ACCOUNT_HEADER]: OWNER, [TEST_CONTRACT_HEADER]: TEST_ACCOUNT_CONTRACT } : {}) })
    for (const [key, value] of Object.entries(extra)) headers.set(key, value)
    return handle(new Request(ORIGIN + path, {
      method, headers,
      ...(wire === undefined ? {} : { body: JSON.stringify(wire) }),
    }), env, fetcher)
  }
  const direct = (model = 'sol', seed = crypto.randomUUID(), path = '/api/overnight-tests/blueprint') => request(path, 'POST', {
    worldId: 'ai-game-lab', prompt: 'Offline silver tower', model, providerModel: model === 'sol' ? 'gpt-6.1-sol' : model === 'luna' ? 'gpt-6-luna' : 'gpt-6-astra', mode: 'live',
  }, { 'X-WORLDIFACT-Request': seed })
  const prepare = async (path = '/api/overnight-tests/studio/prepare', body = input) => {
    const response = await request(path, 'POST', body); assert.equal(response.status, 200, await response.clone().text())
    return response.json() as Promise<{ id: string; ticket: string }>
  }
  const submit = (receipt: { id: string; ticket: string }, path = '/api/overnight-tests/studio/jobs', body = input) => request(path, 'POST', body, { 'X-WORLDIFACT-Job': receipt.ticket, 'X-WORLDIFACT-Idempotency-Key': receipt.id })
  const pool = () => ensure(OVERNIGHT_TEST_NAMESPACE).values.get(OVERNIGHT_TEST_STATE) as { committedCents: number; claims: unknown[] } | undefined
  const protectedSnapshot = () => structuredClone([...[...ensure(ACCOUNT).values].filter(([key]) => key === PROVIDER || oldKeys.includes(key)), ...oldNames.map(name => [name, [...ensure(name).values]])])
  return { env, calls, stores, ensure, request, direct, prepare, submit, pool, protectedSnapshot,
    after: (hook: typeof afterInternal) => { afterInternal = hook }, failProvider: () => { upstreamFailure = true }, failCount: () => { countFailure = true }, loseOracle: () => { oracleLoss = true }, useLegacyAccount: () => { legacyAccount = true } }
}
function frozenClock(t: TestContext) { t.mock.timers.enable({ apis: ['Date'], now: NOW }) }

for (const slot of ['sol', 'luna', 'astra-1'] as const) test(`visible ${slot} client reaches the actual reviewed Worker pool without ordinary funding`, async t => {
  frozenClock(t)
  const f = fixture(), before = f.protectedSnapshot(), data = new Map<string, string>(), calls: string[] = []
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const fetcher = (async (path: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(path)}`)
    assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.redirect, 'error')
    return f.request(String(path), init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined, Object.fromEntries(new Headers(init?.headers)))
  }) as typeof fetch
  const client = new OvernightTestClient(storage, fetcher, OWNER, () => true)
  assert.equal((await client.status()).committedCents, 0)
  const row = await client.start(slot, 'Offline silver tower')
  assert.equal(row.state, slot === 'astra-1' ? 'pending' : 'completed')
  assert.equal(f.pool()?.committedCents, slot === 'astra-1' ? 175 : slot === 'sol' ? 35 : 10)
  assert.equal(f.calls.oraclePost, slot === 'astra-1' ? 1 : 0)
  assert.equal(f.calls.provider, slot === 'astra-1' ? 0 : 1)
  assert.deepEqual(f.protectedSnapshot(), before)
  const restored = new OvernightTestClient(storage, fetcher, OWNER, () => true)
  await restored.recover(slot)
  assert.equal(restored.rows().find(item => item.slot === slot)?.id, row.id)
  assert.equal(calls.filter(path => path.startsWith('POST')).length, slot === 'astra-1' ? 2 : 1)
  assert.ok(calls.filter(path => path.startsWith('POST')).every(path => path.includes('/api/overnight-tests/')))
})

test('two detailed, one Sol and one Luna reserve395c while ordinary98c and every old claim remain untouched', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot()
  const first = await f.prepare(), second = await f.prepare()
  assert.equal((await f.submit(first)).status, 202); assert.equal((await f.submit(second)).status, 202)
  assert.equal((await f.direct('sol')).status, 200); assert.equal((await f.direct('luna')).status, 200)
  assert.equal(f.pool()?.committedCents, 395); assert.equal(f.pool()?.claims.length, 4)
  assert.equal((await f.direct('sol')).status, 429); assert.equal((await f.direct('luna')).status, 429)
  const third = await f.prepare(); assert.equal((await f.submit(third)).status, 429)
  assert.deepEqual(f.protectedSnapshot(), before); assert.equal(f.calls.ordinaryReserve, 0)
  assert.deepEqual([f.calls.oraclePost, f.calls.provider], [2, 2]); assert.equal(f.ensure(ACCOUNT).values.get('balance'), 1990)
  assert.equal(f.ensure(ACCOUNT).values.get('customer-reserved-credits:v1'), 500)
  for (const store of f.stores.values()) assert.deepEqual(store.attemptedProtectedWrites, [])
})

test('failed and preflight-rejected tests return customer points but never recycle overnight commitments', async t => {
  frozenClock(t)
  for (const failure of ['provider', 'count']) {
    const f = fixture(), before = f.protectedSnapshot(); failure === 'provider' ? f.failProvider() : f.failCount()
    assert.equal((await f.direct()).status, failure === 'provider' ? 502 : 503)
    assert.equal(f.pool()?.committedCents, 35); assert.equal(f.ensure(ACCOUNT).values.get('balance'), 2055)
    assert.equal((await f.direct()).status, 429); assert.equal(f.pool()?.committedCents, 35)
    assert.equal(f.calls.provider, failure === 'provider' ? 1 : 0); assert.deepEqual(f.protectedSnapshot(), before)
  }
})

test('completed direct replay and uncertain detailed replay cannot consume another slot or dispatch again', async t => {
  frozenClock(t); const f = fixture(), seed = crypto.randomUUID()
  const response = await f.direct('sol', seed), original = await response.json()
  assert.deepEqual(await (await f.direct('sol', seed)).json(), original)
  assert.equal(f.calls.provider, 1); assert.equal(f.pool()?.committedCents, 35)
  const receipt = await f.prepare(); f.loseOracle(); assert.equal((await f.submit(receipt)).status, 202)
  assert.equal((await f.submit(receipt)).status, 202)
  assert.equal(f.calls.oraclePost, 1); assert.equal(f.pool()?.committedCents, 210)
})

test('lost global acknowledgement keeps capacity and exact retry resumes without ordinary funding', async t => {
  frozenClock(t); const f = fixture(), receipt = await f.prepare(); let lost = true
  f.after(async (name, path, response) => { if (name === OVERNIGHT_TEST_NAMESPACE && path === '/overnight-test-claim' && lost) { lost = false; throw new Error('Inert committed acknowledgement loss') } return response })
  assert.equal((await f.submit(receipt)).status, 503); assert.equal(f.pool()?.committedCents, 175)
  assert.equal(f.ensure(ACCOUNT).values.get('customer-reserved-credits:v1'), undefined)
  assert.equal((await f.submit(receipt)).status, 202); assert.equal(f.pool()?.committedCents, 175); assert.equal(f.calls.oraclePost, 1)
})

test('a legacy account object rejects the dedicated funding route without an ordinary debit or provider call', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot()
  f.useLegacyAccount()
  assert.equal((await f.direct()).status, 503); assert.equal(f.calls.provider, 0); assert.equal(f.calls.ordinaryReserve, 0)
  assert.equal(f.ensure(ACCOUNT).values.get('balance'), 2055); assert.equal([...f.ensure(ACCOUNT).values.keys()].some(key => key.startsWith('job:')), false)
  assert.deepEqual(f.protectedSnapshot(), before)
})

test('operator intent cannot fall through unknown paths, unsupported models, foreign accounts or absent authority', async t => {
  frozenClock(t)
  for (const mode of ['unknown-path', 'astra-blueprint', 'foreign', 'anonymous', 'missing', 'invalid']) {
    const f = fixture(), before = f.protectedSnapshot(); let response: Response
    if (mode === 'unknown-path') response = await f.request('/api/overnight-tests/anything', 'POST', {})
    else if (mode === 'astra-blueprint') response = await f.direct('astra')
    else if (mode === 'foreign' || mode === 'anonymous') response = await f.request('/api/overnight-tests/studio/prepare', 'POST', input, {}, mode === 'foreign' ? 'other-token' : null)
    else { if (mode === 'missing') delete f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET; else f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = '{}'; response = await f.direct() }
    assert.ok(response.status >= 400, mode); assert.equal(f.calls.provider + f.calls.oraclePost + f.calls.ordinaryReserve, 0)
    assert.equal(f.pool(), undefined); assert.deepEqual(f.protectedSnapshot(), before)
  }
})

test('normal and overnight prepared Studio receipts cannot change expense source', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot()
  const overnight = await f.prepare(), ordinary = await f.prepare('/api/studio/prepare')
  assert.equal((await f.submit(overnight, '/api/studio/jobs')).status, 409)
  assert.equal((await f.submit(ordinary)).status, 409)
  assert.equal(f.pool(), undefined); assert.equal(f.calls.ordinaryReserve, 0); assert.equal(f.calls.oraclePost, 0)
  assert.deepEqual(f.protectedSnapshot(), before)
})

test('existing normal service admission cannot borrow the private overnight pool', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot(), normal = await f.prepare('/api/studio/prepare')
  assert.equal((await f.submit(normal, '/api/studio/jobs')).status, 429)
  assert.equal(f.pool(), undefined); assert.equal(f.calls.oraclePost, 0); assert.deepEqual(f.protectedSnapshot(), before)
})

test('expiry blocks fresh claims and dispatch while existing status recovery remains read-only', async t => {
  frozenClock(t); const f = fixture(), receipt = await f.prepare(), before = f.protectedSnapshot()
  const id = crypto.randomUUID(), fingerprint = 'b'.repeat(64)
  const reserved = await reserveUserGeneration(f.env, OWNER, id, 'slow', 'astra', fingerprint, 'standard', { channel: 'studio', overnightTest: true })
  assert.equal(reserved.allowed, true); t.mock.timers.setTime(END)
  assert.deepEqual(await markStudioDispatch(f.env, OWNER, id, fingerprint), { dispatch: false })
  assert.equal((await f.submit(receipt)).status, 403); assert.equal((await f.direct()).status, 503)
  const status = await f.request('/api/overnight-tests/status'); assert.equal(status.status, 200)
  const body = await status.json() as { available: boolean; committedCents: number }
  assert.equal(body.available, false); assert.equal(body.committedCents, 175)
  assert.deepEqual(f.protectedSnapshot(), before); assert.equal(f.calls.provider + f.calls.oraclePost, 0)
})

test('a delayed dispatch acknowledgement cannot cross the fixed cutoff', async t => {
  frozenClock(t); const f = fixture()
  f.after(async (_name, path, response) => { if (path === '/blueprint-dispatch') t.mock.timers.setTime(END); return response })
  assert.equal((await f.direct()).status, 409); assert.equal(f.calls.provider, 0); assert.equal(f.pool()?.committedCents, 35)
  assert.equal(f.ensure(ACCOUNT).values.get('balance'), 2055)
})

test('account admission queued beyond expiry cannot place customer holds', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot()
  f.ensure(ACCOUNT).beforeTransaction = async () => { t.mock.timers.setTime(END) }
  const reserved = await reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), 'slow', 'astra', 'c'.repeat(64), 'standard', { channel: 'studio', overnightTest: true })
  assert.equal(reserved.allowed, false); assert.equal(f.ensure(ACCOUNT).values.get('customer-reserved-credits:v1'), undefined)
  assert.equal(f.pool()?.committedCents, 175); assert.deepEqual(f.protectedSnapshot(), before)
})

test('ordinary reconciliation cannot reclaim a test commitment or credit the ordinary98c record', async t => {
  frozenClock(t); const f = fixture(), before = f.protectedSnapshot(), id = crypto.randomUUID(), fingerprint = 'd'.repeat(64)
  assert.equal((await reserveUserGeneration(f.env, OWNER, id, 'slow', 'astra', fingerprint, 'standard', { channel: 'studio', overnightTest: true })).allowed, true)
  await markStudioDispatch(f.env, OWNER, id, fingerprint); await settleUserGeneration(f.env, OWNER, id, 'failed')
  const proof = { revision: 'worldifact-terminal-budget-v1', jobId: id, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 0, sealed: true, sealId: 'e'.repeat(64) } as const
  assert.equal((await reconcileUserStudioProvider(f.env, OWNER, id, proof)).reconciled, false)
  assert.equal(f.pool()?.committedCents, 175); assert.deepEqual(f.protectedSnapshot(), before); assert.equal(f.ensure(ACCOUNT).values.get('balance'), 2055)
  assert.equal(f.ensure(ACCOUNT).values.get('customer-reserved-credits:v1'), 0)
})

test('read-only test status is authenticated, rate-protected and does not initialize the pool', async t => {
  frozenClock(t); const f = fixture()
  const status = await f.request('/api/overnight-tests/status'); assert.equal(status.status, 200)
  const body = await status.json() as { committedCents: number; remainingCents: number; approvalId: string }
  assert.equal(body.committedCents, 0); assert.equal(body.remainingCents, 400); assert.equal(body.approvalId, OVERNIGHT_TEST_APPROVAL)
  assert.equal(f.pool(), undefined)
  assert.equal((await f.request('/api/overnight-tests/status', 'GET', undefined, {}, null)).status, 401)
  f.env.ACCOUNT_LIMITER = { async limit() { return { success: false } } }
  assert.equal((await f.request('/api/overnight-tests/status')).status, 429)
})

for (const during of ['read', 'write']) test(`expiry during account ${during} cannot commit a new customer hold`, async t => {
  frozenClock(t); const f = fixture(), before = structuredClone([...f.ensure(ACCOUNT).values])
  if (during === 'read') f.ensure(ACCOUNT).beforeRead = async key => { if (key === 'balance') t.mock.timers.setTime(END) }
  else f.ensure(ACCOUNT).beforeWrite = async key => { if (key === 'customer-reserved-credits:v1') t.mock.timers.setTime(END) }
  await assert.rejects(reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), 'slow', 'astra', 'f'.repeat(64), 'standard', { channel: 'studio', overnightTest: true }))
  assert.deepEqual([...f.ensure(ACCOUNT).values], before)
  assert.equal(f.pool()?.committedCents, 175); assert.equal(f.calls.oraclePost + f.calls.provider, 0)
})

test('a corrupt mixed-source row cannot override a rejected overnight dispatch deadline', async t => {
  frozenClock(t); t.mock.timers.setTime(END - 1); const f = fixture(), id = crypto.randomUUID(), fingerprint = 'b'.repeat(64)
  assert.equal((await reserveUserGeneration(f.env, OWNER, id, 'slow', 'astra', fingerprint, 'standard', { channel: 'studio', overnightTest: true })).allowed, true)
  const project = { version: 1, accountId: OWNER, issuedAt: '2026-10-05T21:00:00.000Z', expiresAt: '2026-10-06T06:00:00.000Z', maxProviderCents: 175, maxAttempts: 1, fingerprint }
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = JSON.stringify(project)
  const record = { ...project, source: 'project', attemptsUsed: 1, reservedCents: 175, jobId: id, at: END - 1 }
  const job = f.ensure(ACCOUNT).values.get('job:' + id) as Record<string, unknown>
  job.overnightTest = null; job.projectBudget = record
  f.ensure(ACCOUNT).values.set('project-astra-mcc-budget:v1', record)
  t.mock.timers.setTime(END)
  const before = structuredClone([...f.ensure(ACCOUNT).values])
  assert.deepEqual(await markStudioDispatch(f.env, OWNER, id, fingerprint), { dispatch: false })
  assert.deepEqual([...f.ensure(ACCOUNT).values], before); assert.equal(f.pool()?.committedCents, 175)
})

test('generic account objects cannot initialize extra overnight pools', async t => {
  frozenClock(t); const f = fixture(), object = f.env.ACCOUNT_ENTITLEMENTS!.get(ACCOUNT)
  const response = await object.fetch(new Request('https://entitlements.internal/overnight-test-claim', { method: 'POST',
    headers: { 'X-WORLDIFACT-Verified-Account': OWNER }, body: JSON.stringify({ jobId: crypto.randomUUID(), fingerprint: 'a'.repeat(64), workflow: 'detailed-astra' }) }))
  assert.equal(response.status, 403); assert.equal(f.ensure(ACCOUNT).values.has(OVERNIGHT_TEST_STATE), false); assert.equal(f.pool(), undefined)
})
