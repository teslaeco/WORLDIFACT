import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { OvernightTestClient, OVERNIGHT_PANEL_EXPIRES, OVERNIGHT_PANEL_SLOTS } from '../src/lib/overnightTestClient.ts'
import { BlueprintClient, BLUEPRINT_RECOVERY_KEY } from '../src/lib/blueprintClient.ts'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX } from '../src/lib/studioClient.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-06T05:00:00.000Z')
const END = Date.parse('2026-10-06T12:00:00.000Z')
const APPROVAL = 'api-tests-20261006-044444-usd4'
const PROMPT = 'A small silver observatory with an open arched doorway'
type Slot = 'astra-1' | 'astra-2' | 'sol' | 'luna'
type Call = { path: string; method: string; init: RequestInit }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { values: Map<string, string>; writes: string[] }

function store(): Store {
  const values = new Map<string, string>(), writes: string[] = []
  return { values, writes, getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push(key); values.set(key, value) },
    removeItem(key) { writes.push(key); values.delete(key) } }
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function status(overrides: Record<string, unknown> = {}) {
  return { commitments: [], accountContract: 'approved-test-account-v1', available: true, approvalId: APPROVAL, expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400,
    committedCents: 0, remainingCents: 400,
    attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true, ...overrides }
}
async function result(seed: string, model = 'gpt-6.1-sol') {
  const blueprint = demoBlueprint(PROMPT)
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint),
    requestId: await blueprintRequestId(seed), model, limitation: 'Inert fixture; no paid provider request.',
    delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_overnight_client_fixture', receivedAt: new Date(NOW).toISOString(),
      blueprintSha256: createHash('sha256').update(JSON.stringify(blueprint)).digest('hex'), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
}
function fixture(storage = store(), account = OWNER) {
  const calls: Call[] = [], receipts = new Map<string, { id: string; ticket: string; createdAt: string }>()
  const blueprints = new Map<string, unknown>()
  let active = true, now = NOW, jobState = 'building', downloadAllowed = true
  let custom: ((call: Call) => Promise<Response | undefined> | Response | undefined) | undefined
  const fetcher = (async (url, init = {}) => {
    const call = { path: String(url), method: init.method ?? 'GET', init }; calls.push(call)
    assert.equal(init.credentials, 'same-origin', 'Only the existing same-origin browser session is used')
    assert.equal(init.redirect, 'error', 'Redirects must not forward a receipt or attempt')
    const headers = new Headers(init.headers)
    for (const header of ['Authorization', 'Cookie', 'X-WORLDIFACT-Owner', 'X-WORLDIFACT-Verified-Account', 'X-API-Key'])
      assert.equal(headers.has(header), false, `No ${header} may be supplied by the panel`)
    assert.equal(call.path.startsWith('/api/'), true)
    assert.equal(call.path.includes('?'), false)
    const overridden = await custom?.(call)
    if (overridden) return overridden
    if (call.path === '/api/studio/current') return Response.json({ accountContract: 'approved-test-account-v1', current: null })
    if (call.path === '/api/overnight-tests/status' && call.method === 'GET') return Response.json(status())
    if (call.path === '/api/overnight-tests/blueprint' && call.method === 'POST') {
      const seed = headers.get('X-WORLDIFACT-Request')!
      assert.match(seed, /^[a-f0-9-]{36}$/)
      const envelope = JSON.parse(String(init.body)); assert.equal(envelope.expectedAccountId, account); assert.equal(envelope.testContract, 'approved-test-account-v1'); const payload = envelope.input
      assert.equal(payload.prompt, PROMPT)
      assert.equal(payload.providerModel, payload.model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-luna')
      const generated = await result(seed, payload.providerModel); blueprints.set(seed, generated)
      return Response.json(generated)
    }
    const blueprint = /^\/api\/blueprint\/requests\/([a-f0-9-]{36})$/.exec(call.path)
    if (blueprint && call.method === 'GET') return Response.json({ state: 'completed', result: blueprints.get(blueprint[1]) })
    if (call.path === '/api/overnight-tests/studio/prepare' && call.method === 'POST') {
      const id = crypto.randomUUID(), receipt = { id, createdAt: new Date(NOW).toISOString(), ticket: `${id}.${NOW}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
      receipts.set(id, receipt); return Response.json(receipt)
    }
    if (call.path === '/api/overnight-tests/studio/jobs' && call.method === 'POST') {
      const id = headers.get('X-WORLDIFACT-Idempotency-Key')!
      assert.equal(headers.get('X-WORLDIFACT-Job'), receipts.get(id)?.ticket)
      return Response.json({ job: { id, state: jobState, downloadAllowed } })
    }
    const job = /^\/api\/studio\/jobs\/([a-f0-9-]{36})(\/model)?$/.exec(call.path)
    if (job && call.method === 'GET') {
      assert.equal(headers.get('X-WORLDIFACT-Job'), receipts.get(job[1])?.ticket)
      return job[2] ? new Response(detailedGLBFixture(), { headers: { 'Content-Type': 'model/gltf-binary' } })
        : Response.json({ job: { id: job[1], state: jobState, downloadAllowed } })
    }
    throw new Error(`Unexpected inert request: ${call.method} ${call.path}`)
  }) as typeof fetch
  const make = (id = account) => new OvernightTestClient(storage, fetcher, id, () => active, () => now)
  return { storage, calls, receipts, blueprints, fetcher, make, client: make(),
    intercept: (handler: typeof custom) => { custom = handler }, logout: () => { active = false },
    time: (value: number) => { now = value }, job: (state: string, allow = true) => { jobState = state; downloadAllowed = allow } }
}
function row(client: OvernightTestClient, slot: Slot) { return client.rows().find(value => value.slot === slot)! }
function posts(f: ReturnType<typeof fixture>) { return f.calls.filter(call => call.method === 'POST') }

test('the panel exposes exactly four fixed attempts and the fixed technical expiry', () => {
  assert.equal(OVERNIGHT_PANEL_EXPIRES, '2026-10-06T12:00:00.000Z')
  assert.deepEqual(OVERNIGHT_PANEL_SLOTS.map(({ id, workflow, capCents, points }) => ({ id, workflow, capCents, points })), [
    { id: 'astra-1', workflow: 'detailed-astra', capCents: 175, points: 250 },
    { id: 'astra-2', workflow: 'detailed-astra', capCents: 175, points: 250 },
    { id: 'sol', workflow: 'blueprint-sol', capCents: 35, points: 50 },
    { id: 'luna', workflow: 'blueprint-luna', capCents: 10, points: 15 },
  ])
})

test('opening, local rows and status are read-only and do not allocate a receipt', async () => {
  const f = fixture()
  assert.equal(f.calls.length, 0); assert.equal(f.storage.writes.length, 0)
  assert.deepEqual(f.client.rows().map(item => item.state), ['empty', 'empty', 'empty', 'empty'])
  assert.deepEqual(await f.client.status(), status())
  assert.deepEqual(f.calls.map(({ path, method }) => [path, method]), [['/api/overnight-tests/status', 'GET']])
  assert.equal(f.storage.writes.length, 0)
})

test('status rejects unknown, incomplete, inconsistent funding and over-quota records', async () => {
  const missing = status(); delete (missing as Partial<typeof missing>).remainingCents
  const invalid = [null, [], {}, missing, { available: false }, status({ unexpected: true }),
    status({ available: 'true' }), status({ approvalId: 'another-approval' }), status({ expiresAt: '2026-10-07T04:00:00.000Z' }),
    status({ totalCents: 401 }), status({ noRecycling: false }), status({ committedCents: 1, remainingCents: 399 }),
    status({ committedCents: -1, remainingCents: 401 }), status({ committedCents: 0.5, remainingCents: 399.5 }),
    status({ committedCents: 35, remainingCents: 400, attempts: { 'detailed-astra': 0, 'blueprint-sol': 1, 'blueprint-luna': 0 } }),
    status({ attempts: { 'detailed-astra': 0, 'blueprint-sol': 0 } }),
    status({ attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0, extra: 0 } }),
    status({ attempts: { 'detailed-astra': 0, 'blueprint-sol': '0', 'blueprint-luna': 0 } }),
    status({ committedCents: 525, remainingCents: -125, attempts: { 'detailed-astra': 3, 'blueprint-sol': 0, 'blueprint-luna': 0 } }),
    status({ committedCents: 70, remainingCents: 330, attempts: { 'detailed-astra': 0, 'blueprint-sol': 2, 'blueprint-luna': 0 } }),
  ]
  for (const value of invalid) {
    const f = fixture(); f.intercept(() => Response.json(value))
    await assert.rejects(f.client.status(), `Status must fail closed: ${JSON.stringify(value)}`)
    await assert.rejects(f.client.start('sol', PROMPT))
    assert.equal(posts(f).length, 0); assert.equal(f.storage.writes.length, 0)
  }
})

test('status rejects unauthorized, non-owner, redirected, non-JSON and oversized responses', async () => {
  const responses = [() => Response.json({ available: false }, { status: 401 }),
    () => Response.json({ available: false }, { status: 403 }),
    () => new Response(null, { status: 302, headers: { Location: 'https://example.invalid/' } }),
    () => new Response(JSON.stringify(status()), { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(' '.repeat(70_000) + JSON.stringify(status()), { headers: { 'Content-Type': 'application/json' } }),
    () => { const response = Response.json(status()); Object.defineProperty(response, 'redirected', { value: true }); return response },
  ]
  for (const response of responses) {
    const f = fixture(); f.intercept(() => response())
    await assert.rejects(f.client.status()); await assert.rejects(f.client.start('luna', PROMPT))
    assert.equal(posts(f).length, 0); assert.equal(f.storage.writes.length, 0)
  }
})

test('unavailable status and exhausted selected workflow reject before any preparation or generation POST', async () => {
  const cases: [Slot, Record<string, unknown>][] = [
    ['sol', { available: false }],
    ['sol', { committedCents: 35, remainingCents: 365, attempts: { 'detailed-astra': 0, 'blueprint-sol': 1, 'blueprint-luna': 0 } }],
    ['luna', { committedCents: 10, remainingCents: 390, attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 1 } }],
    ['astra-2', { committedCents: 350, remainingCents: 50, attempts: { 'detailed-astra': 2, 'blueprint-sol': 0, 'blueprint-luna': 0 } }],
  ]
  for (const [slot, update] of cases) {
    const f = fixture(); f.intercept(() => Response.json(status(update)))
    await assert.rejects(f.client.start(slot, PROMPT)); assert.equal(posts(f).length, 0)
  }
})

for (const slot of ['sol', 'luna'] as const) test(`${slot} uses only the dedicated explicit route once and preserves its original recovery ID`, async () => {
  const f = fixture(); await f.client.start(slot, PROMPT)
  assert.deepEqual(f.calls.map(({ path, method }) => [path, method]), [
    ['/api/overnight-tests/status', 'GET'], ['/api/studio/current', 'GET'], ['/api/overnight-tests/blueprint', 'POST'],
  ])
  const original = row(f.client, slot)
  assert.equal(original.state, 'completed'); assert.ok(original.id); assert.ok(original.result)
  const request = posts(f)[0], originalId = new Headers(request.init.headers).get('X-WORLDIFACT-Request')
  assert.equal(original.id, originalId)
  await assert.rejects(f.client.start(slot, PROMPT + ' changed'))
  const restored = f.make(); assert.equal(row(restored, slot).id, originalId)
  await restored.recover(slot)
  assert.equal(row(restored, slot).id, originalId); assert.equal(row(restored, slot).state, 'completed')
  assert.equal(f.calls.at(-1)?.path, `/api/blueprint/requests/${originalId}`)
  assert.equal(f.calls.at(-1)?.method, 'GET'); assert.equal(posts(f).length, 1)
})

test('detailed attempts use dedicated prepare and submit routes while recovery uses the original GET', async () => {
  const f = fixture(); await f.client.start('astra-1', PROMPT)
  assert.deepEqual(f.calls.map(({ path, method }) => [path, method]), [
    ['/api/overnight-tests/status', 'GET'], ['/api/studio/current', 'GET'], ['/api/overnight-tests/studio/prepare', 'POST'], ['/api/overnight-tests/studio/jobs', 'POST'],
  ])
  const original = row(f.client, 'astra-1'); assert.equal(original.state, 'pending'); assert.ok(original.id)
  const submitted = posts(f)[1]
  assert.equal(new Headers(submitted.init.headers).get('X-WORLDIFACT-Idempotency-Key'), original.id)
  assert.equal(JSON.parse(String(submitted.init.body)).input.prompt, PROMPT)
  const restored = f.make(); f.job('succeeded')
  await restored.recover('astra-1')
  assert.equal(row(restored, 'astra-1').state, 'completed'); assert.equal(row(restored, 'astra-1').id, original.id)
  assert.equal(f.calls.at(-1)?.path, `/api/studio/jobs/${original.id}`)
  await assert.rejects(restored.start('astra-1', PROMPT)); assert.equal(posts(f).length, 2)
})

test('simultaneous starts and all other buttons remain locked while an attempt is pending', async () => {
  const f = fixture(), entered = deferred(), release = deferred()
  f.intercept(async call => { if (call.path.endsWith('/status')) { entered.resolve(); await release.promise } })
  const first = f.client.start('astra-1', PROMPT); await entered.promise
  for (const slot of ['astra-1', 'astra-2', 'sol', 'luna'] as const) await assert.rejects(f.client.start(slot, PROMPT))
  release.resolve(); await first
  assert.equal(posts(f).length, 2)
  for (const slot of ['astra-1', 'astra-2', 'sol', 'luna'] as const) await assert.rejects(f.client.start(slot, PROMPT))
  assert.equal(posts(f).length, 2)
  await assert.rejects(f.make().start('sol', PROMPT)); assert.equal(posts(f).length, 2)
})

test('expiry rejects before start and again after status but before the first POST', async () => {
  for (const atBoundary of [false, true]) {
    const f = fixture()
    if (atBoundary) f.intercept(call => { if (call.path.endsWith('/status')) f.time(END) })
    else f.time(END)
    await assert.rejects(f.client.start('sol', PROMPT)); assert.equal(posts(f).length, 0)
    assert.equal(f.storage.writes.length, 0)
  }
})

test('expiry between detailed preparation and submission prevents the paid POST and retains any original receipt', async () => {
  const f = fixture()
  f.intercept(call => { if (call.path.endsWith('/prepare')) f.time(END) })
  await f.client.start('astra-1', PROMPT).catch(() => undefined)
  assert.deepEqual(posts(f).map(call => call.path), ['/api/overnight-tests/studio/prepare'])
  const original = row(f.client, 'astra-1').id
  await assert.rejects(f.client.start('astra-1', PROMPT)); assert.equal(posts(f).length, 1)
  if (original) assert.equal(row(f.make(), 'astra-1').id, original)
})

test('logout during the initial status GET prevents every next POST and any client storage writes', async () => {
  const f = fixture(); f.intercept(call => { if (call.path.endsWith('/status')) f.logout() })
  await assert.rejects(f.client.start('astra-1', PROMPT)); assert.equal(posts(f).length, 0)
  assert.equal(f.storage.writes.length, 0)
  await assert.rejects(f.client.status()); assert.equal(f.calls.length, 1)
})

test('logout during prepare prevents submission and stale receipt writes', async () => {
  const f = fixture(); f.intercept(call => { if (call.path.endsWith('/prepare')) f.logout() })
  await assert.rejects(f.client.start('astra-1', PROMPT))
  assert.deepEqual(posts(f).map(call => call.path), ['/api/overnight-tests/studio/prepare'])
  assert.equal(f.storage.writes.length, 0)
})

test('logout during a provider response preserves pre-submission evidence without completing or writing stale data', async () => {
  for (const slot of ['astra-1', 'sol'] as const) {
    const f = fixture(); let snapshot: [string, string][] = [], writes = 0
    f.intercept(call => {
      if (call.path === '/api/overnight-tests/blueprint' || call.path === '/api/overnight-tests/studio/jobs') {
        snapshot = [...f.storage.values]; writes = f.storage.writes.length; f.logout()
      }
    })
    await assert.rejects(f.client.start(slot, PROMPT))
    assert.ok(snapshot.length > 0, 'The original receipt must already be durable before paid submission')
    assert.deepEqual([...f.storage.values], snapshot); assert.equal(f.storage.writes.length, writes)
    assert.equal(posts(f).length, slot === 'sol' ? 1 : 2)
  }
})

test('logout while status JSON is arriving is checked after decoding and cannot authorize preparation', async () => {
  const f = fixture()
  f.intercept(call => call.path.endsWith('/status') ? new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(status()))); f.logout(); controller.close() },
  }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'application/json' } }) : undefined)
  await assert.rejects(f.client.start('luna', PROMPT)); assert.equal(posts(f).length, 0)
  assert.equal(f.storage.writes.length, 0)
})

test('after expiry, recovery verifies the account contract and reads only the same detailed job', async () => {
  const f = fixture(); await f.client.start('astra-1', PROMPT)
  const id = row(f.client, 'astra-1').id; f.time(END + 1); f.job('succeeded')
  const previous = f.calls.length, restored = f.make(); await restored.recover('astra-1')
  assert.deepEqual(f.calls.slice(previous).map(({ path, method }) => [path, method]), [['/api/overnight-tests/status', 'GET'], [`/api/studio/jobs/${id}`, 'GET']])
  assert.equal(row(restored, 'astra-1').id, id); assert.equal(row(restored, 'astra-1').state, 'completed')
  assert.equal(posts(f).length, 2)
})

test('an admission-rejected blueprint remains failed across reload and can never become a fresh replacement', async () => {
  const f = fixture()
  f.intercept(call => call.path === '/api/overnight-tests/blueprint'
    ? Response.json({ noCharge: true, failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }, { status: 429 }) : undefined)
  await assert.rejects(f.client.start('sol', PROMPT))
  const original = row(f.client, 'sol'); assert.equal(original.state, 'failed'); assert.ok(original.id)
  const restored = f.make(); assert.equal(row(restored, 'sol').state, 'failed')
  await assert.rejects(restored.start('sol', PROMPT + ' revised'))
  await restored.recover('sol').catch(() => undefined)
  assert.equal(row(restored, 'sol').id, original.id); assert.equal(posts(f).length, 1)
})

test('detailed admission rejection and terminal worker failure never permit a fresh receipt in that slot', async () => {
  for (const admission of [true, false]) {
    const f = fixture()
    if (admission) f.intercept(call => call.path === '/api/overnight-tests/studio/jobs'
      ? Response.json({ error: 'No overnight slot remains.' }, { status: 429 }) : undefined)
    else f.job('failed')
    await f.client.start('astra-1', PROMPT).catch(() => undefined)
    const original = row(f.client, 'astra-1'); assert.equal(original.state, 'failed'); assert.ok(original.id)
    const restored = f.make(); await restored.recover('astra-1').catch(() => undefined)
    await assert.rejects(restored.start('astra-1', PROMPT + ' revised'))
    assert.equal(row(restored, 'astra-1').id, original.id); assert.equal(posts(f).length, 2)
  }
})

test('ordinary receipts remain untouched and test receipts are isolated by account, run and slot', async () => {
  const storage = store(), ordinary = new Map([
    [BLUEPRINT_RECOVERY_KEY, JSON.stringify({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', fingerprint: 'e'.repeat(64), model: 'sol', state: 'completed', createdAt: NOW })],
    [STUDIO_RECEIPT_KEY, JSON.stringify({ receipt: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', createdAt: new Date(NOW).toISOString(), ticket: `ffffffff-ffff-4fff-8fff-ffffffffffff.${NOW}.${'f'.repeat(64)}.${'a'.repeat(64)}` }, prompt: 'Old ordinary request', startedAt: new Date(NOW).toISOString(), rejection: 'Definite admission refusal', rejectionCode: 'PROVIDER_BUDGET_EXHAUSTED' })],
    [STUDIO_RECEIPT_HISTORY_PREFIX + 'existing', 'ordinary-history'], ['unrelated-model', 'keep'],
  ])
  for (const [key, value] of ordinary) storage.values.set(key, value)
  const f = fixture(storage); f.job('succeeded')
  await f.client.start('astra-1', PROMPT); await f.client.start('astra-2', PROMPT)
  await f.client.start('sol', PROMPT); await f.client.start('luna', PROMPT)
  for (const [key, value] of ordinary) assert.equal(storage.values.get(key), value)
  assert.equal(new Set(f.client.rows().map(item => item.id)).size, 4)
  assert.deepEqual(f.make(OTHER).rows().map(item => item.state), ['empty', 'empty', 'empty', 'empty'])
  for (const key of storage.writes) {
    assert.equal(ordinary.has(key), false); assert.ok(key.includes(OWNER)); assert.ok(key.includes(APPROVAL))
    assert.ok(['astra-1', 'astra-2', 'sol', 'luna'].some(slot => key.includes(slot)))
  }
  assert.equal(posts(f).length, 6)
})

test('storage failures cannot dispatch an unretained blueprint or detailed job', async () => {
  for (const slot of ['sol', 'astra-1'] as const) {
    const storage = store(); storage.setItem = () => { throw new Error('Inert storage failure') }
    const f = fixture(storage); await assert.rejects(f.client.start(slot, PROMPT))
    assert.equal(posts(f).some(call => ['/api/overnight-tests/blueprint', '/api/overnight-tests/studio/jobs'].includes(call.path)), false)
  }
})

test('download rejects a blueprint or unverified pending detailed job without an artifact request', async () => {
  const f = fixture(); await f.client.start('sol', PROMPT)
  await assert.rejects(f.client.download('sol'))
  await f.client.start('astra-1', PROMPT); await assert.rejects(f.client.download('astra-1'))
  assert.equal(f.calls.some(call => call.path.endsWith('/model')), false)
})

test('verified detailed download uses the same artifact GET, validates the GLB and never posts', async () => {
  const f = fixture(); f.job('succeeded'); await f.client.start('astra-1', PROMPT)
  const id = row(f.client, 'astra-1').id, before = posts(f).length
  await f.client.download('astra-1')
  assert.equal(f.calls.at(-1)?.path, `/api/studio/jobs/${id}/model`)
  assert.equal(f.calls.at(-1)?.method, 'GET'); assert.equal(posts(f).length, before)
  f.intercept(call => call.path.endsWith('/model') ? new Response('not a GLB') : undefined)
  await assert.rejects(f.client.download('astra-1')); assert.equal(posts(f).length, before)
})

test('a successful job with explicitly denied download cannot fetch its artifact', async () => {
  const f = fixture(); f.job('succeeded', false); await f.client.start('astra-1', PROMPT)
  await assert.rejects(f.client.download('astra-1'))
  assert.equal(f.calls.some(call => call.path.endsWith('/model')), false)
})

test('logout during delayed response-body decoding cannot persist a receipt or completed provider result', async () => {
  for (const phase of ['prepare', 'blueprint', 'jobs'] as const) {
    const f = fixture(); let snapshot: [string, string][] = [], writes = 0
    f.intercept(async call => {
      if (call.path !== `/api/overnight-tests/${phase === 'blueprint' ? 'blueprint' : 'studio/' + phase}`) return
      const id = new Headers(call.init.headers).get('X-WORLDIFACT-Idempotency-Key') ?? crypto.randomUUID()
      const value = phase === 'prepare'
        ? { id, createdAt: new Date(NOW).toISOString(), ticket: `${id}.${NOW}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
        : phase === 'jobs' ? { job: { id, state: 'succeeded', downloadAllowed: true } }
          : await result(new Headers(call.init.headers).get('X-WORLDIFACT-Request')!)
      return new Response(new ReadableStream({ pull(controller) {
        snapshot = [...f.storage.values]; writes = f.storage.writes.length
        f.logout(); controller.enqueue(new TextEncoder().encode(JSON.stringify(value))); controller.close()
      } }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'application/json' } })
    })
    await assert.rejects(f.client.start(phase === 'blueprint' ? 'sol' : 'astra-1', PROMPT))
    assert.deepEqual([...f.storage.values], snapshot); assert.equal(f.storage.writes.length, writes)
    assert.equal(posts(f).length, phase === 'jobs' ? 2 : 1)
  }
})

test('logout during recovery does not write or expose a completed result for the old account', async () => {
  const f = fixture(); await f.client.start('sol', PROMPT)
  const original = row(f.client, 'sol').id, before = [...f.storage.values], writes = f.storage.writes.length
  f.intercept(call => { if (call.path === `/api/blueprint/requests/${original}`) f.logout() })
  const restored = f.make(); await assert.rejects(restored.recover('sol'))
  assert.deepEqual([...f.storage.values], before); assert.equal(f.storage.writes.length, writes)
  assert.throws(() => restored.rows()); assert.equal(posts(f).length, 1)
})

test('a malformed, foreign or unverified generation cannot complete or replace the saved request', async () => {
  for (const shape of ['wrong-id', 'wrong-model', 'no-evidence'] as const) {
    const f = fixture()
    f.intercept(async call => {
      if (call.path !== '/api/overnight-tests/blueprint') return
      const seed = new Headers(call.init.headers).get('X-WORLDIFACT-Request')!
      const generated = await result(shape === 'wrong-id' ? crypto.randomUUID() : seed, shape === 'wrong-model' ? 'gpt-6-luna' : 'gpt-6.1-sol')
      if (shape === 'no-evidence') delete (generated as Partial<typeof generated>).evidence
      return Response.json(generated)
    })
    await assert.rejects(f.client.start('sol', PROMPT))
    const saved = row(f.client, 'sol'); assert.equal(saved.state, 'pending'); assert.ok(saved.id); assert.equal(saved.result, undefined)
    await assert.rejects(f.make().start('sol', PROMPT)); assert.equal(posts(f).length, 1)
  }
})

test('unexpected underlying routes or methods cannot escape the dedicated transport allowlist', async t => {
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  for (const [Constructor, method, slot, routes] of [
    [StudioCoordinator, 'start', 'astra-1', [
      ['/api/studio/current', 'DELETE'], ['/api/studio/current', 'GET'], ['/api/studio/prepare?ordinary=1', 'POST'],
      ['/api/blueprint', 'POST'], ['https://example.invalid/api/studio/jobs', 'POST'], [`/api/studio/jobs/${id}/exports/obj`, 'GET'],
    ]],
    [BlueprintClient, 'submit', 'sol', [
      ['/api/blueprint?ordinary=1', 'POST'], ['/api/studio/prepare', 'POST'], ['/api/blueprint', 'PUT'],
      ['https://example.invalid/api/blueprint', 'POST'], [`/api/blueprint/requests/${id}?ticket=ignored`, 'GET'],
    ]],
  ] as const) {
    for (const [path, verb] of routes) {
      const mocked = t.mock.method(Constructor.prototype, method as never, async function (this: { fetcher: typeof fetch }) {
        return this.fetcher(path, { method: verb })
      })
      try {
        const f = fixture(); await assert.rejects(f.client.start(slot, PROMPT))
        assert.deepEqual(f.calls.map(({ path: target, method: verb }) => [target, verb]), [['/api/overnight-tests/status', 'GET'], ['/api/studio/current', 'GET']])
        assert.equal(f.storage.writes.length, 0)
      } finally { mocked.mock.restore() }
    }
  }
})

test('two controllers sharing receipts cannot overlap same-slot or different-slot starts or queue a paid action', async () => {
  assert.equal(typeof navigator.locks.request, 'function', 'Use Node\'s real Web Locks implementation')
  for (const otherSlot of ['sol', 'luna'] as const) {
    const f = fixture(), entered = deferred(), release = deferred(), other = f.make()
    f.intercept(async call => { if (call.path.endsWith('/status')) { entered.resolve(); await release.promise } })
    const first = f.client.start('sol', PROMPT); await entered.promise
    let secondState = 'waiting'
    const second = other.start(otherSlot, PROMPT).then(() => { secondState = 'completed' }, () => { secondState = 'rejected' })
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.equal(secondState, 'rejected', 'The competing explicit action must refuse immediately, not wait for a lock')
      assert.equal(f.calls.length, 1); assert.equal(posts(f).length, 0)
    } finally { release.resolve(); await Promise.all([first, second]) }
    assert.equal(posts(f).length, 1)
    assert.equal(row(other, 'sol').id, row(f.client, 'sol').id)
    if (otherSlot === 'luna') assert.equal(row(other, 'luna').state, 'empty')
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(posts(f).length, 1, 'Releasing the first lock must never launch a delayed second attempt')
  }
})

test('missing cross-tab locking support fails closed before status, receipt allocation or any paid POST', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    for (const slot of ['astra-1', 'sol', 'luna'] as const) {
      const f = fixture(); await assert.rejects(f.client.start(slot, PROMPT))
      assert.equal(f.calls.length, 0); assert.equal(f.storage.writes.length, 0)
    }
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor)
    else Reflect.deleteProperty(navigator, 'locks')
  }
})


test('every caller rejects a remote commitment even when a local no-charge receipt could mask its count', async () => {
  for (const withLocalRejection of [false, true]) {
    const f = fixture()
    if (withLocalRejection) {
      const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      const receipt = { id, createdAt: new Date(NOW).toISOString(), ticket: `${id}.${NOW}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
      f.storage.values.set(`worldifact:overnight-tests:v1:${APPROVAL}:${OWNER}:astra-1:${STUDIO_RECEIPT_KEY}`, JSON.stringify({ receipt, prompt: PROMPT, startedAt: receipt.createdAt, rejection: 'The submission was refused before generation.' }))
    }
    f.intercept(call => call.path.endsWith('/status') ? Response.json(status({ committedCents: 175, remainingCents: 225, attempts: { 'detailed-astra': 1, 'blueprint-sol': 0, 'blueprint-luna': 0 }, commitments: [{ jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', workflow: 'detailed-astra', capCents: 175 }] })) : undefined)
    await assert.rejects(f.client.start(withLocalRejection ? 'astra-2' : 'astra-1', PROMPT), /missing a committed test receipt/)
    assert.equal(posts(f).length, 0)
  }
})

test('invalid recovery credentials stay uncertain and cannot unlock another test slot', async () => {
  const f = fixture(); await f.client.start('astra-1', PROMPT)
  f.intercept(call => /^\/api\/studio\/jobs\//.test(call.path) ? Response.json({ error: 'The job receipt is not valid.' }, { status: 401 }) : undefined)
  await f.client.recover('astra-1')
  assert.equal(row(f.client, 'astra-1').state, 'pending')
  assert.equal(row(f.client, 'astra-1').uncertain, true)
  await assert.rejects(f.client.start('astra-2', PROMPT))
  await assert.rejects(f.client.runOrdinaryAllocation(async () => { throw Error('Must not run') }))
  assert.equal(posts(f).length, 2)
})

test('ordinary starts re-read another tab’s pending test under the shared no-queue lock', async () => {
  const f = fixture(), another = f.make()
  await another.start('astra-1', PROMPT)
  let ordinaryStarts = 0
  await assert.rejects(f.client.runOrdinaryAllocation(async () => { ordinaryStarts++ }))
  assert.equal(ordinaryStarts, 0)
  assert.equal(posts(f).length, 2)
})

test('ordinary use without test history retains compatibility when Web Locks are unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    const f = fixture()
    assert.equal(await f.client.runOrdinaryAllocation(async () => 'ordinary'), 'ordinary')
    assert.equal(f.calls.length, 0)
    await assert.rejects(f.client.start('astra-1', PROMPT))
  } finally { if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else Reflect.deleteProperty(navigator, 'locks') }
})


test('standalone panel allocation checks ordinary pending and uncertain work before every test POST', async () => {
  for (const scenario of ['blueprint', 'studio', 'remote-current', 'unknown-source'] as const) {
    const f = fixture()
    const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    if (scenario === 'blueprint') f.storage.values.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify({ id, fingerprint: 'e'.repeat(64), model: 'sol', state: 'pending', createdAt: NOW }))
    if (scenario === 'studio') {
      const receipt = { id, createdAt: new Date(NOW).toISOString(), ticket: `${id}.${NOW}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
      f.receipts.set(id, receipt)
      f.storage.values.set(STUDIO_RECEIPT_KEY, JSON.stringify({ receipt, prompt: PROMPT, startedAt: receipt.createdAt }))
    }
    if (scenario === 'remote-current' || scenario === 'unknown-source') f.intercept(call => call.path === '/api/studio/current' ? Response.json({ accountContract: 'approved-test-account-v1', current: { fundingSource: scenario === 'unknown-source' ? 'unknown' : 'ordinary', financialState: scenario === 'unknown-source' ? 'failed' : 'reserved' } }) : undefined)
    const snapshot = new Map(f.storage.values)
    await assert.rejects(f.client.start('astra-1', PROMPT))
    assert.equal(posts(f).length, 0)
    assert.deepEqual(f.storage.values, snapshot)
  }
})
