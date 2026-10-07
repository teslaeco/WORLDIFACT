import { detailedAssemblyGLBFixture, detailedHealthFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { demoBlueprint, assetSpecForBlueprint } from '../src/lib/blueprint.ts'
import { createHash } from 'node:crypto'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { type StudioInput, type StudioJob } from '../src/lib/studioProtocol.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A detailed blue chess rook', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
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
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', ENABLE_ASTRA_PLANS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: storage() as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const users = new Map<string, AccountEntitlements>()
  let clientPolicy: string | null = 'paid-membership-held-points-v1'
  let reservationDenial: string | undefined
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) { const key = String(id); if (!users.has(key)) users.set(key, new AccountEntitlements({ storage: storage() }, env, () => Date.now())); const object = users.get(key)!; return { fetch: (request: Request) => reservationDenial && new URL(request.url).pathname === '/generation-v3/reserve' ? Promise.resolve(Response.json({ allowed: false, reason: reservationDenial }, { status: 429 })) : object.fetch(request) } } }
  let modelStatus: 'draft' | 'reviewed' | undefined, qualityFailure = false
  let quality: Record<string, unknown> = { revision: 6, state: 'succeeded', hasModel: true, modelStatus: 'draft', automaticQualityAccepted: false, agent: {}, agentUsage: { completed: false, error_code: null }, visualReview: { assessment_completed: false, accepted: false, status: 'not_completed' } }
  let budgetLiability: number | null = null
  let qualityReads = 0
  let runtimeOverrides: Record<string, unknown> = {}, invalidModel = false, denseModel = false, failureDetail = '', lastPayload: Record<string, any> | null = null
  let posts = 0, artifacts = 0, loss = false, busy = false, state: StudioJob['state'] = 'succeeded', status404 = false
  let statusFailure: 'http' | 'rate-limit' | 'transport' | 'malformed' | null = null
  let artifactFailure = false, artifactHttpStatus = 0, artifactGate: Promise<void> | undefined
  let artifactResponse: (() => Response) | undefined
  let submissionRejection: { status: number; body: unknown } | undefined
  let healthGate: Promise<void> | undefined, statusGate: Promise<void> | undefined, healthReads = 0, statusReads = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer alice-token') return Response.json({ id: alice, email: 'alice@example.test' })
      if (token === 'Bearer bob-token') return Response.json({ id: bob, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    if (path === '/v1/health') { healthReads++; await healthGate; return Response.json({ ...detailedHealthFixture, ...runtimeOverrides }) }
    if (path === '/v1/jobs') {
      posts++
      lastPayload = JSON.parse(String(init?.body))
      if (loss) throw new Error('Unconfirmed transport acceptance')
      if (busy) return Response.json({ error: 'Serwer wykonuje poprzedni model. Poczekaj na wynik lub anuluj tamto zlecenie.' }, { status: 409 })
      if (submissionRejection) return Response.json(submissionRejection.body, { status: submissionRejection.status })
      return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' })
    }
    if (path.endsWith('/budget')) return budgetLiability === null ? Response.json({}, { status: 404 }) : Response.json({ revision: 'worldifact-terminal-budget-v1', jobId: path.split('/').at(-2), model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: budgetLiability, sealed: true, sealId: 'b'.repeat(64) })
    if (path.endsWith('/quality')) { qualityReads++; return qualityFailure ? Response.json({}, { status: 503 }) : Response.json(quality) }
    if (/\/model$|\/exports\//.test(path)) {
      artifacts++
      await artifactGate
      if (artifactResponse) return artifactResponse()
      if (artifactFailure) throw new TypeError('Simulated artifact transport failure')
      if (artifactHttpStatus) return Response.json({ error: 'Temporary artifact availability' }, { status: artifactHttpStatus })
      const bytes = invalidModel ? new Uint8Array(24) : denseModel ? detailedAssemblyGLBFixture(12,2400,4) : detailedGLBFixture()
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } })
    }
    statusReads++; await statusGate
    if (statusFailure === 'http') return Response.json({ error: 'Temporarily unavailable' }, { status: 503 })
    if (statusFailure === 'rate-limit') return Response.json({ error: 'Slow down' }, { status: 429 })
    if (statusFailure === 'transport') throw new TypeError('Simulated status transport failure')
    if (statusFailure === 'malformed') return Response.json({ id: 'not-this-job', state: 'building' })
    if (status404) return Response.json({}, { status: 404 })
    return Response.json({ id: path.split('/').pop(), state, detail: failureDetail, ...(modelStatus ? { modelStatus } : {}) })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, user: 'alice' | 'bob' | null = 'alice') => {
    const jobId = ticket?.replace(/^held\./, '').split('.')[0]
    return studioApi(new Request(origin + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(clientPolicy ? { 'X-WORLDIFACT-Paid-Points-Policy': clientPolicy } : {}), ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}),
        ...(method === 'POST' && path === '/api/studio/jobs' && jobId ? { 'X-WORLDIFACT-Idempotency-Key': jobId } : {}),
        ...(user ? { Cookie: `__Host-worldifact-access=${user}-token` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, fetcher)
  }
  const prepare = async () => await (await call('/api/studio/prepare', 'POST', input)).json() as { id: string; ticket: string }
  const subscribe = async () => {
    await entitlementCall(env, alice, '/grant', { id: 'in_subscription', credits: 4500, subscriptionId: 'sub_test' })
    await entitlementCall(env, alice, '/subscription', { id: 'sub_test', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_subscription' })
  }
  return { env, fetcher, call, prepare, subscribe, policy: (value: string | null) => { clientPolicy = value }, state: (value: StudioJob['state']) => { state = value }, liability: (value: number | null) => { budgetLiability = value }, denyReservation: (reason: string) => { reservationDenial = reason }, setHealth: (overrides: Record<string, unknown>) => { runtimeOverrides = overrides }, sent: () => lastPayload, invalid: () => { invalidModel = true }, dense: () => { denseModel = true }, costFailure: () => { state = 'failed'; failureDetail = 'ASTRA budget guard stopped before another API call. PRIVATE_KEY'; }, posts: () => posts, artifacts: () => artifacts, fail: () => { state = 'failed' },
    quality: (value: Record<string, unknown> = {}) => { modelStatus = 'draft'; quality = { ...quality, ...value } },
    qualityFailure: (value: boolean) => { qualityFailure = value }, qualityReads: () => qualityReads,
    statusFailure: (value: typeof statusFailure) => { statusFailure = value },
    artifactFailure: (value: boolean) => { artifactFailure = value },
    artifactHttpStatus: (value: number) => { artifactHttpStatus = value },
    artifactGate: (value: Promise<void> | undefined) => { artifactGate = value },
    artifactResponse: (value: (() => Response) | undefined) => { artifactResponse = value },
    rejectSubmission: (status: number, body: unknown) => { submissionRejection = { status, body } },
    cancel: () => { state = 'cancelled' },
    healthGate: (value: Promise<void> | undefined) => { healthGate = value }, healthReads: () => healthReads,
    statusGate: (value: Promise<void> | undefined) => { statusGate = value }, statusReads: () => statusReads,
    missing: (value = true) => { status404 = value },
    busy: () => { busy = true }, lose: () => { loss = true; status404 = true } }
}


const held = (state: 'held' | 'pending-cost' = 'pending-cost') => ({ version: 1, state, heldPoints: 250, chargedPoints: 0 })
const released = { version: 1, state: 'released', heldPoints: 0, chargedPoints: 0 }
const charged = { version: 1, state: 'charged', heldPoints: 0, chargedPoints: 250 }

test('post-dispatch Studio rejection reports the retained hold immediately and never starts a replacement', async () => {
  for (const code of [400, 409, 422, 429]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    f.rejectSubmission(code, { error: 'Inert worker refusal' }); f.fail()
    const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket), body = await response.json() as any
    assert.equal(response.status, code); assert.equal(body.requestId, receipt.id); assert.equal(body.state, 'failed')
    assert.deepEqual(body.pointSettlement, held()); assert.match(body.error, /Manual cost review/); assert.doesNotMatch(body.error, /points (?:were |have been )?(?:released|returned|refunded)/i)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    const replay = await (await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).json() as any
    assert.equal(replay.job.state, 'failed'); assert.deepEqual(replay.job.pointSettlement, held()); assert.equal(f.posts(), 1)
  }
})

test('first authenticated zero-cost recovery releases points immediately, while a positive bound needs review', async () => {
  for (const liability of [0, 420001]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.fail(); f.liability(liability)
    const job = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
    assert.deepEqual(job.pointSettlement, liability === 0 ? released : held())
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, liability === 0 ? 0 : 250)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    if (liability > 0) assert.match(job.detail, /Manual cost review/)
    f.state('succeeded')
    if (liability === 0) {
      const again = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
      assert.equal(again.state, 'failed'); assert.deepEqual(again.pointSettlement, released); assert.equal(f.artifacts(), 0)
    }
  }
})

test('late success requires owned model validation and charges a pending hold only once', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.fail()
  assert.deepEqual((await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job.pointSettlement, held())
  const ordinaryCallback = await entitlementCall<any>(f.env, alice, '/settle', { id: receipt.id, state: 'completed' })
  assert.equal(ordinaryCallback.settled, false)
  f.state('succeeded'); f.artifactHttpStatus(503)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).status, 502)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
  f.artifactHttpStatus(0)
  const result = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
  assert.equal(result.state, 'succeeded'); assert.deepEqual(result.pointSettlement, charged)
  for (let index = 0; index < 4; index++) await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250); assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0); assert.equal(f.posts(), 1)
  f.liability(0)
  await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
})

test('browser-injected late completion and invalid artifacts cannot finalize a failed point hold', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.fail()
  await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  const injected = await f.call('/api/studio/jobs', 'POST', { ...input, validatedLateCompletion: 'existing-model-v1', pointSettlement: charged }, receipt.ticket)
  assert.ok([202, 400, 409].includes(injected.status)); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
  f.state('succeeded'); f.invalid()
  const job = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
  assert.equal(job.state, 'failed'); assert.deepEqual(job.pointSettlement, held())
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})

test('whole-job timeout retains full points and a late validated completion uses the same receipt', async t => {
  const start = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: start })
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.lose()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  t.mock.timers.setTime(start + 36 * 60_000)
  const timed = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
  assert.equal(timed.state, 'failed'); assert.deepEqual(timed.pointSettlement, held())
  f.missing(false); f.state('succeeded')
  const late = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
  assert.equal(late.state, 'succeeded'); assert.deepEqual(late.pointSettlement, charged); assert.equal(f.posts(), 1)
})


test('stale browser policy cannot create a new paid hold, while its existing receipt can still recover', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  for (const policy of [null, 'paid-membership-points-v2', 'unknown']) {
    f.policy(policy)
    const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(response.status, 429); assert.equal(f.posts(), 0)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    assert.equal((await entitlementCall<any>(f.env, alice, '/job', { id: receipt.id })).owned, false)
  }
  f.policy('paid-membership-held-points-v1')
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.policy(null); f.fail()
  const recovered = (await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as any).job
  assert.deepEqual(recovered.pointSettlement, held()); assert.equal(f.posts(), 1)
})


test('selected owned held Studio jobs recover fresh receipts without changing the current pointer or provider calls', async () => {
  const f = fixture(); await f.subscribe(); const first = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, first.ticket); f.fail()
  await f.call(`/api/studio/jobs/${first.id}`, 'GET', undefined, first.ticket)
  const second = await f.prepare(); await f.call('/api/studio/jobs', 'POST', input, second.ticket)
  const before = await entitlementStatus(f.env, alice), reads = f.statusReads(), posts = f.posts()
  const current = await entitlementCall<any>(f.env, alice, '/studio-current', {})
  const selectedResponse = await f.call('/api/studio/current?job=' + first.id), selected = await selectedResponse.json() as any
  assert.equal(selectedResponse.status, 200); assert.equal(selected.current.receipt.id, first.id); assert.deepEqual(selected.current.pointSettlement, held())
  assert.equal(f.posts(), posts); assert.equal(f.statusReads(), reads)
  assert.deepEqual(await entitlementStatus(f.env, alice), before)
  assert.deepEqual(await entitlementCall<any>(f.env, alice, '/studio-current', {}), current)
  assert.equal((await f.call('/api/studio/current?job=' + first.id, 'GET', undefined, undefined, 'bob')).status, 404)
  assert.equal((await f.call('/api/studio/current?job=' + first.id + '&accountId=' + alice)).status, 400)
  assert.equal((await f.call('/api/studio/current?job=not-a-uuid')).status, 400)
})


test('owned Blueprint stored-ID recovery needs no local seed, never admits work, and rejects other accounts or channels', async () => {
  const f = fixture(); await f.subscribe(); const id = crypto.randomUUID(), fingerprint = 'a'.repeat(64)
  await entitlementCall(f.env, alice, '/reserve', { id, fingerprint, profile: 'fast', channel: 'blueprint', model: 'sol', providerModel: 'gpt-6.1-sol',
    blueprintDispatch: 'fenced-v1', paidPointsPolicy: 'paid-membership-held-points-v1' })
  await entitlementCall(f.env, alice, '/blueprint-dispatch', { id, fingerprint }); await entitlementCall(f.env, alice, '/settle', { id, state: 'failed' })
  const recover = (job = id, user = 'alice', query = '?stored=held-points-v1') => handle(new Request(origin + '/api/blueprint/requests/' + job + query,
    { headers: { Origin: origin, Cookie: `__Host-worldifact-access=${user}-token` } }), f.env as Env, f.fetcher)
  const before = await entitlementStatus(f.env, alice), response = await recover(), value = await response.json() as any
  assert.equal(response.status, 200); assert.equal(value.requestId, id); assert.equal(value.model, 'sol'); assert.equal(value.state, 'failed'); assert.equal(value.refunded, false)
  assert.deepEqual(value.pointSettlement, { version: 1, state: 'pending-cost', heldPoints: 50, chargedPoints: 0 })
  assert.deepEqual(await entitlementStatus(f.env, alice), before); assert.equal(f.posts(), 0); assert.equal(f.statusReads(), 0); assert.equal(f.artifacts(), 0)
  assert.equal((await recover(id, 'bob')).status, 404)
  assert.equal((await recover(id, 'alice', '?stored=held-points-v1&accountId=' + alice)).status, 400)
  assert.equal((await recover(id, 'alice', '?stored=held-points-v1&stored=held-points-v1')).status, 400)
  const studio = crypto.randomUUID()
  await entitlementCall(f.env, alice, '/reserve', { id: studio, fingerprint, profile: 'slow', channel: 'studio', prompt: 'Inert held Studio fixture', paidPointsPolicy: 'paid-membership-held-points-v1', requiredFundingMode: 'paid-membership-held-points-v1' })
  assert.equal((await recover(studio)).status, 404)
  const blueprint = demoBlueprint('Recovered inert native result')
  const result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model: 'gpt-6.1-sol',
    limitation: 'Synthetic response only', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_stored_recovery', receivedAt: new Date().toISOString(), blueprintSha256: createHash('sha256').update(JSON.stringify(blueprint)).digest('hex'), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
  await entitlementCall(f.env, alice, '/blueprint-complete', { id, result })
  const complete = await (await recover()).json() as any
  assert.equal(complete.state, 'completed'); assert.equal(complete.result.requestId, id)
  assert.deepEqual(complete.pointSettlement, { version: 1, state: 'charged', heldPoints: 0, chargedPoints: 50 })
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4450); assert.equal(f.posts(), 0)
})

test('a zero-proof read racing validated completion reports one consistent final generation and financial state', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.fail(); f.liability(0)
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { reached = resolve })
  const guardedFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (new URL(String(input)).pathname.endsWith('/budget')) { reached(); await gate }
    return f.fetcher(input, init)
  }) as typeof fetch
  const poll = studioApi(new Request(origin + `/api/studio/jobs/${receipt.id}`, { headers: { Origin: origin, Cookie: '__Host-worldifact-access=alice-token', 'X-WORLDIFACT-Job': receipt.ticket } }), f.env, guardedFetch)
  await entered
  try { await entitlementCall(f.env, alice, '/settle', { id: receipt.id, state: 'completed', validatedLateCompletion: 'existing-model-v1' }) }
  finally { release() }
  const job = (await (await poll).json() as any).job
  assert.equal(job.state, 'succeeded'); assert.deepEqual(job.pointSettlement, charged)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250); assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
})


test('held receipts are cryptographically separated from unchanged legacy signatures and bind fresh admission', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  assert.match(receipt.ticket, /^held\./)
  const payload = receipt.ticket.slice(5).split('.').slice(0, 3).join('.'), signature = Uint8Array.from(Buffer.from(receipt.ticket.split('.').at(-1)!, 'hex'))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(f.env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = (domain: string, value: string) => new TextEncoder().encode(`${domain}:${value}:account:${alice}`)
  assert.equal(await crypto.subtle.verify('HMAC', key, signature, bytes('WORLDIFACT-STUDIO-RECEIPT-v1', payload)), false, 'Stripping held. cannot yield a valid old signature')
  assert.equal(await crypto.subtle.verify('HMAC', key, signature, bytes('WORLDIFACT-STUDIO-HELD-POINTS-RECEIPT-v1', payload)), true)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket.slice(5))).status, 401)
  assert.equal(f.posts(), 0); assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
  f.policy(null); const legacy = await f.prepare()
  assert.doesNotMatch(legacy.ticket, /^held\./)
  const legacyParts = legacy.ticket.split('.'), legacySignature = Uint8Array.from(Buffer.from(legacyParts[3], 'hex'))
  assert.equal(await crypto.subtle.verify('HMAC', key, legacySignature, bytes('WORLDIFACT-STUDIO-RECEIPT-v1', legacyParts.slice(0, 3).join('.'))), true)
  f.policy('paid-membership-held-points-v1')
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, legacy.ticket)).status, 429, 'A legacy prepared ticket cannot create new-policy held work')
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, 'held.' + legacy.ticket)).status, 401)
  assert.equal(f.posts(), 0)
  const ledger = f.env.ACCOUNT_ENTITLEMENTS!.get(f.env.ACCOUNT_ENTITLEMENTS!.idFromName('account:v1:' + alice))
  const old = await ledger.fetch(new Request('https://entitlements.internal/reserve', { method: 'POST', body: JSON.stringify({ id: legacy.id, fingerprint: legacyParts[2], profile: 'slow', channel: 'studio', prompt: input.prompt }) }))
  assert.equal(old.status, 200); f.fail()
  const recovered = await f.call(`/api/studio/jobs/${legacy.id}`, 'GET', undefined, legacy.ticket)
  assert.equal(recovered.status, 200); assert.equal((await recovered.json() as any).job.pointSettlement, undefined)
})

test('a held receipt cannot silently downgrade to legacy funding when membership expires before submission', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await entitlementCall(f.env, alice, '/subscription', { id: 'sub_test', active: false, until: 0, revision: 2, plan: 'pro' })
  const before = await entitlementStatus(f.env, alice)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 429)
  assert.equal(f.posts(), 0); assert.deepEqual(await entitlementStatus(f.env, alice), before)
  assert.equal((await entitlementCall<any>(f.env, alice, '/job', { id: receipt.id })).owned, false)
})
