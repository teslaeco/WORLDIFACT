import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, entitlementStatus, markStudioDispatch, reserveUserGeneration, settleUserGeneration, STUDIO_DISPATCH_WINDOW_MS, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { STUDIO_SUBMISSION_GRACE_MS, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const operationPath = (request: Request) => new URL(request.url).pathname.replace(/^\/generation-v3(?=\/)/, '')

const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const fingerprint = 'a'.repeat(64), origin = 'https://worldifact.test'
const input = { worldId: 'enchanted-ai-shop', prompt: 'A detailed blue rook', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
function storage(): EntitlementStorage {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (value: EntitlementStorage) => Promise<T>) { const next = queue.then(() => callback(store)); queue = next.catch(() => {}); return next },
  }
  return store
}
function fixture() {
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'owner-test-'.repeat(5), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'test-oracle',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: storage() as BudgetStorage }, env)
  const stores = new Map<string, EntitlementStorage>(), objects = new Map<string, AccountEntitlements>()
  let pauseBudget: Promise<void> | undefined, pauseClaim: Promise<void> | undefined, loseClaim = false, claimReply: unknown = undefined, loseOracle = false
  const budgetReached = deferred(), claimReached = deferred()
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => ({ async fetch(request) {
    const response = await budget.fetch(request)
    if (new URL(request.url).pathname === '/reserve-studio') { budgetReached.resolve(); await pauseBudget }
    return response
  } }) }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(key) {
    const name = String(key)
    if (!stores.has(name)) stores.set(name, storage())
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: stores.get(name)! }, { ENABLE_ASTRA_PLANS: 'true' }, () => Date.now()))
    return { async fetch(request) {
      // These fences retain historical reserve-backed funding. Only creation uses
      // the legacy writer; dispatch, settlement and recovery use current v3 routes.
      const legacyReservation = new URL(request.url).pathname === '/generation-v3/reserve'
        ? new Request(new URL('/reserve', request.url), request) : request
      const response = await objects.get(name)!.fetch(legacyReservation)
      if (operationPath(request) === '/studio-dispatch') {
        claimReached.resolve(); await pauseClaim
        if (loseClaim) throw new Error('Uncertain dispatch acknowledgement')
        if (claimReply !== undefined) return Response.json(claimReply)
      }
      return response
    } }
  } }
  let posts = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: new Headers(init?.headers).get('Authorization') === 'Bearer bob-token' ? bob : alice, email: 'fixture@example.test' })
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs') {
      posts++
      if (loseOracle) throw new Error('Uncertain Oracle acceptance')
      return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' })
    }
    return Response.json({}, { status: 404 })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, user = 'alice') => studioApi(new Request(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Host-worldifact-access=${user}-token`, ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  const fund = async () => {
    await entitlementCall(env, alice, '/grant', { id: 'in_dispatch', credits: 1500, subscriptionId: 'sub_dispatch' })
    await entitlementCall(env, alice, '/subscription', { id: 'sub_dispatch', until: Date.now() + 86400000, active: true, revision: 1, plan: 'creator', grantId: 'in_dispatch' })
    // Preserve historical audit data even when generation no longer uses it.
    await stores.get(`account:v1:${alice}`)!.put('creator-astra:in_dispatch', 6)
  }
  const account = () => stores.get(`account:v1:${alice}`)!
  const counters = async () => ({ balance: await account().get('balance'), held: await account().get('customer-reserved-credits:v1'),
    provider: await account().get('provider-budget-cents:v1'), creator: await account().get('creator-astra:in_dispatch'),
    global: (await (await budget.fetch(new Request('https://budget.internal/status'))).json() as { used: number }).used })
  const reserve = (id: string) => reserveUserGeneration(env, alice, id, 'slow', undefined, fingerprint, 'standard', { channel: 'studio' })
  return { env, call, fund, account, counters, reserve, posts: () => posts, recreate: () => objects.clear(), budgetReached, claimReached,
    prepare: async () => { const response = await call('/api/studio/prepare', 'POST', input); assert.equal(response.status, 200); return await response.json() as StudioReceipt },
    pauseBudget: (value: Promise<void>) => { pauseBudget = value }, pauseClaim: (value: Promise<void>) => { pauseClaim = value },
    loseClaim: () => { loseClaim = true }, claimReply: (value: unknown) => { claimReply = value }, loseOracle: () => { loseOracle = true } }
}

test('dispatch claim is account/fingerprint bound, one-use under concurrency, and durable across recreation', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID()
  await f.reserve(id)
  assert.equal((await f.account().get<Record<string, unknown>>(`job:${id}`))!.fundingMode, undefined, 'The fixture must retain historical reserve-backed accounting')
  assert.equal(await f.account().get(`paid-points-job:v2:${id}`), undefined)
  const before = await f.counters()
  assert.deepEqual(await markStudioDispatch(f.env, bob, id, fingerprint), { dispatch: false })
  assert.deepEqual(await markStudioDispatch(f.env, alice, id, 'b'.repeat(64)), { dispatch: false })
  const claims = await Promise.all(Array.from({ length: 12 }, () => markStudioDispatch(f.env, alice, id, fingerprint)))
  assert.equal(claims.filter(value => value.dispatch).length, 1)
  assert.deepEqual(await f.counters(), before, 'Dispatch has no financial side effects')
  f.recreate()
  assert.deepEqual(await markStudioDispatch(f.env, alice, id, fingerprint), { dispatch: false })
  const replay = await f.reserve(id)
  assert.equal(replay.repeated, true)
  assert.deepEqual(await markStudioDispatch(f.env, alice, id, fingerprint), { dispatch: false })
  assert.deepEqual(await f.counters(), before)
})

test('only newly tracked, financially reserved Studio rows can claim dispatch', async () => {
  const f = fixture(); await f.fund()
  for (const variant of ['unknown', 'legacy', 'blueprint', 'failed', 'completed', 'malformed'] as const) {
    const id = crypto.randomUUID()
    if (variant !== 'unknown') {
      await f.reserve(id)
      const job = await f.account().get<Record<string, unknown>>(`job:${id}`)
      if (variant === 'legacy') { delete job!.studioDispatch; await f.account().put(`job:${id}`, job) }
      if (variant === 'blueprint') await f.account().put(`job:${id}`, { ...job, channel: 'blueprint' })
      if (variant === 'malformed') await f.account().put(`job:${id}`, { ...job, studioDispatch: { stage: 'ready-v1' } })
      if (variant === 'failed' || variant === 'completed') await settleUserGeneration(f.env, alice, id, variant)
    }
    const jobBefore = await f.account().get(`job:${id}`), before = await f.counters()
    assert.deepEqual(await markStudioDispatch(f.env, alice, id, fingerprint), { dispatch: false }, variant)
    assert.deepEqual(await f.account().get(`job:${id}`), jobBefore)
    assert.deepEqual(await f.counters(), before)
  }
})

test('dispatch endpoint rejects malformed or expanded internal input before mutation', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
  const object = f.env.ACCOUNT_ENTITLEMENTS!.get(f.env.ACCOUNT_ENTITLEMENTS!.idFromName(`account:v1:${alice}`))
  const before = await f.account().get(`job:${id}`)
  for (const body of [{ id }, { id, fingerprint: 'bad' }, { id: 'bad', fingerprint }, { id, fingerprint: fingerprint.toUpperCase() },
    { id, fingerprint, state: 'reserved' }, { id, fingerprint, studioDispatch: 'ready-v1' }, { id, fingerprint, userId: bob }]) {
    const response = await object.fetch(new Request('https://entitlements.internal/studio-dispatch', { method: 'POST', body: JSON.stringify(body) }))
    assert.equal(response.status, 400)
    assert.deepEqual(await f.account().get(`job:${id}`), before)
  }
  assert.equal((await markStudioDispatch(f.env, alice, id, fingerprint)).dispatch, true)
})

test('a terminal 404 poll wins while the original submission waits for global budget and fences its late POST', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(), gate = deferred()
  f.pauseBudget(gate.promise)
  const submitting = f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.budgetReached.promise
  assert.deepEqual(await f.counters(), { balance: 1500, held: 250, provider: 875, creator: 6, global: 1 })
  const now = Date.now
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    const poll = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(poll.job.state, 'failed'); assert.equal(poll.job.failureCode, 'ORACLE_JOB_MISSING')
    gate.resolve()
    const result = await (await submitting).json() as { job: StudioJob; recoveryOnly: boolean }
    assert.equal(result.job.state, 'failed'); assert.equal(result.recoveryOnly, true)
    assert.equal(f.posts(), 0)
    assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 1050, creator: 6, global: 1 }, 'A new ordinary reservation releases only its fenced, never-dispatched provider funding; historical quota data remains unchanged')
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(f.posts(), 0, 'An exact replay cannot replace a fenced submission')
  } finally { gate.resolve(); await submitting; Date.now = now }
})

test('global allowance rejection releases a new ordinary reservation before any dispatch claim or Oracle POST', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(), original = f.env.GENERATION_BUDGET!
  f.env.GENERATION_BUDGET = { idFromName: name => original.idFromName(name), get(key) {
    const object = original.get(key)
    return { fetch: request => new URL(request.url).pathname === '/reserve-studio'
      ? Promise.resolve(Response.json({ allowed: false, reason: 'exhausted' }, { status: 429 }))
      : object.fetch(request) }
  } }
  const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(response.status, 429)
  assert.equal((await response.json() as { failureCode: string }).failureCode, 'STUDIO_ALLOWANCE_UNAVAILABLE')
  assert.equal(f.posts(), 0)
  assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 1050, creator: 6, global: 0 })
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(f.posts(), 0)
  assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 1050, creator: 6, global: 0 })
})

test('a dispatch claim whose acknowledgement arrives after terminal closure cannot send its original POST or a replacement', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(), gate = deferred()
  f.pauseClaim(gate.promise)
  const submitting = f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.claimReached.promise
  const now = Date.now
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    const poll = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(poll.job.state, 'failed')
    await Promise.all(Array.from({ length: 4 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
    assert.equal(f.posts(), 0)
    gate.resolve()
    const result = await (await submitting).json() as { job: StudioJob }
    assert.equal(result.job.state, 'failed', 'The delayed dispatch acknowledgement cannot outlive the terminal settlement')
    assert.equal(f.posts(), 0)
    assert.deepEqual(await markStudioDispatch(f.env, alice, receipt.id, receipt.ticket.split('.')[2]), { dispatch: false })
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(f.posts(), 0)
    assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 875, creator: 6, global: 1 })
  } finally { gate.resolve(); await submitting; Date.now = now }
})

test('lost or malformed dispatch acknowledgement never sends Oracle work or retries the claim', async () => {
  for (const reply of [undefined, null, { dispatch: 'true' }, { dispatch: true }, { dispatch: true, deadline: '123' },
    { dispatch: true, deadline: Number.MAX_SAFE_INTEGER + 1 }, { dispatch: true, deadline: Date.now() + STUDIO_DISPATCH_WINDOW_MS * 4 },
    { dispatch: true, deadline: Date.now() + 10_000, extra: true }, { dispatch: false, extra: true }]) {
    const f = fixture(); await f.fund(); const receipt = await f.prepare()
    if (reply === undefined) f.loseClaim(); else f.claimReply(reply)
    const result = await (await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'pending')
    assert.equal(f.posts(), 0)
    f.recreate()
    await Promise.all(Array.from({ length: 4 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
    assert.equal(f.posts(), 0)
    const account = await entitlementStatus(f.env, alice)
    assert.equal(account.reservedCredits, 250)
    assert.deepEqual(await f.counters(), { balance: 1500, held: 250, provider: 875, creator: 6, global: 1 })
  }
})

test('uncertain Oracle acceptance retains the claim and recovers only the exact original job', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(); f.loseOracle()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.recreate()
  await Promise.all(Array.from({ length: 6 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
  const poll = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(poll.job.state, 'pending'); assert.equal(f.posts(), 1)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket, 'bob')).status, 401)
  assert.equal((await f.call('/api/studio/jobs', 'POST', { ...input, prompt: 'Changed model' }, receipt.ticket)).status, 409)
  assert.equal(f.posts(), 1)
  assert.deepEqual(await f.counters(), { balance: 1500, held: 250, provider: 875, creator: 6, global: 1 })
})

test('a claim near the five-minute boundary keeps 404 recovery pending through the POST timeout tail, then blocks a stale acknowledgement', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(), budgetGate = deferred(), claimGate = deferred()
  f.pauseBudget(budgetGate.promise); f.pauseClaim(claimGate.promise)
  const submitting = f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.budgetReached.promise
  const job = await f.account().get<{ at: number }>(`job:${receipt.id}`), now = Date.now
  try {
    Date.now = () => job!.at + STUDIO_SUBMISSION_GRACE_MS - 1000
    budgetGate.resolve(); await f.claimReached.promise
    const claimed = await f.account().get<{ studioDispatchUntil: number }>(`job:${receipt.id}`)
    assert.equal(claimed!.studioDispatchUntil, job!.at + STUDIO_SUBMISSION_GRACE_MS)
    Date.now = () => claimed!.studioDispatchUntil + 1000
    const withinTail = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(withinTail.job.state, 'pending', 'The old reservation grace cannot close an in-flight dispatch window')
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(f.posts(), 0)
    Date.now = () => claimed!.studioDispatchUntil + 25_000
    const terminal = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(terminal.job.state, 'failed'); assert.equal(terminal.job.failureCode, 'ORACLE_JOB_MISSING')
    claimGate.resolve()
    const result = await (await submitting).json() as { job: StudioJob }
    assert.equal(result.job.state, 'failed'); assert.equal(f.posts(), 0)
    assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 875, creator: 6, global: 1 })
  } finally { budgetGate.resolve(); claimGate.resolve(); await submitting; Date.now = now }
})

test('claim minting cannot reopen a reservation past submission grace or close to the whole-job watchdog', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
  const job = await f.account().get<{ at: number }>(`job:${id}`), now = Date.now, before = await f.counters()
  try {
    for (const age of [STUDIO_SUBMISSION_GRACE_MS, 35 * 60_000 - 1000, 35 * 60_000 + 1000]) {
      Date.now = () => job!.at + age
      assert.deepEqual(await markStudioDispatch(f.env, alice, id, fingerprint), { dispatch: false })
      assert.deepEqual(await f.counters(), before)
    }
    const retained = await f.account().get<Record<string, unknown>>(`job:${id}`)
    assert.equal(retained!.studioDispatch, 'ready-v1'); assert.equal(retained!.studioDispatchUntil, undefined)
  } finally { Date.now = now }
})

test('a queued dispatch claim rechecks submission expiry inside the atomic transaction', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
  const job = await f.account().get<{ at: number }>(`job:${id}`), now = Date.now, gate = deferred(), entered = deferred()
  const preceding = f.account().transaction(async () => { entered.resolve(); await gate.promise })
  await entered.promise
  const claim = markStudioDispatch(f.env, alice, id, fingerprint)
  try {
    Date.now = () => job!.at + STUDIO_SUBMISSION_GRACE_MS
    gate.resolve(); await preceding
    assert.deepEqual(await claim, { dispatch: false })
    assert.equal((await f.account().get<{ studioDispatch: string }>(`job:${id}`))!.studioDispatch, 'ready-v1')
  } finally { gate.resolve(); await preceding; await claim; Date.now = now }
})

test('a stale pre-claim 404 snapshot cannot settle through a dispatch tail which won before its settlement transaction', async () => {
  const f = fixture(); await f.fund(); const receipt = await f.prepare(), budgetGate = deferred(), snapshotGate = deferred(), snapshotRead = deferred()
  f.pauseBudget(budgetGate.promise)
  const submitting = f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.budgetReached.promise
  const job = await f.account().get<{ at: number }>(`job:${receipt.id}`), now = Date.now
  const namespace = f.env.ACCOUNT_ENTITLEMENTS!
  let jobReads = 0
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: name => namespace.idFromName(name), get(key) {
    const object = namespace.get(key)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (operationPath(request) === '/job' && ++jobReads === 2) { snapshotRead.resolve(); await snapshotGate.promise }
      return response
    } }
  } }
  let polling: Promise<Response> | undefined
  try {
    Date.now = () => job!.at + STUDIO_SUBMISSION_GRACE_MS - 1000
    polling = f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    await snapshotRead.promise
    budgetGate.resolve(); await submitting
    assert.equal(f.posts(), 1, 'The original dispatch starts before any terminal closure')
    Date.now = () => job!.at + STUDIO_SUBMISSION_GRACE_MS + 1000
    snapshotGate.resolve()
    const observed = await (await polling).json() as { job: StudioJob; reconciledMissing?: boolean }
    assert.equal(observed.reconciledMissing, undefined)
    assert.equal(observed.job.state, 'pending', 'The atomic settlement check overrides the stale read-only expiry decision')
    assert.equal(observed.job.failureCode, undefined)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    Date.now = () => job!.at + STUDIO_SUBMISSION_GRACE_MS + 25_000
    const terminal = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(terminal.job.state, 'failed'); assert.equal(terminal.job.failureCode, 'ORACLE_JOB_MISSING')
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(f.posts(), 1)
    assert.deepEqual(await f.counters(), { balance: 1500, held: 0, provider: 875, creator: 6, global: 1 })
  } finally { budgetGate.resolve(); snapshotGate.resolve(); await submitting; await polling; Date.now = now }
})
