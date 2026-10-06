import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, STUDIO_LIBRARY_SCAN_LIMIT, type EntitlementStorage } from '../server/entitlements.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import type { StudioLibraryModel, StudioLibraryPage } from '../src/lib/studioProtocol.ts'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-05T12:00:00Z'), TTL = 15 * 60_000
const idFor = (index: number) => `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
const completed = (overrides: Record<string, unknown> = {}) => ({ channel: 'studio', state: 'completed', fingerprint: 'a'.repeat(64),
  prompt: 'Saved MCC model', profile: 'slow', kind: 'credits', cost: 250, at: NOW - 60_000, updatedAt: NOW - 30_000, ...overrides })

function fixture() {
  const rows = new Map<string, Map<string, unknown>>([[alice, new Map()], [bob, new Map()]])
  for (const values of rows.values()) {
    values.set('balance', 2305)
    values.set('subscription', { active: true, until: NOW + 86_400_000, id: 'sub_existing', revision: 1 })
    values.set('billingHold', false)
  }
  const ledgerRequests: { account: string; method: string; path: string }[] = []
  const lists: { account: string; prefix: string; startAfter?: string; limit: number }[] = []
  const reads: string[] = [], external: string[] = [], qualityReads: string[] = []
  let qualityResponse = () => Response.json({}, { status: 404 })
  let writes = 0, transactions = 0, artifactStatus = 200
  const objects = new Map<string, AccountEntitlements>()
  for (const [account, values] of rows) {
    const storage: EntitlementStorage = {
      async get<T>(key: string) { reads.push(key); return structuredClone(values.get(key)) as T | undefined },
      async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
        lists.push({ account, ...options })
        return new Map([...values].filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter))
          .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value) as T]))
      },
      async put() { writes++; throw new Error('Library cannot write any account or funds data') },
      async transaction() { transactions++; throw new Error('Library must only call storage get/list') },
    }
    objects.set(account, new AccountEntitlements({ storage }, {}, () => Date.now()))
  }
  const env: StudioEnv = {
    OWNER_ACCESS_TOKEN: 'library-test-secret-'.repeat(3), ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'test-private-oracle',
    ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName() { throw new Error('No budget access from library') }, get() { throw new Error('No budget access from library') } },
    ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get(name) {
      const account = String(name).replace(/^account:(?:sandbox:v1|v1):/, '')
      const object = objects.get(account)
      assert.ok(object, 'Only verified account namespaces may be read')
      return { async fetch(request: Request) {
        ledgerRequests.push({ account, method: request.method, path: new URL(request.url).pathname })
        assert.equal(request.method, 'GET', 'No finance, settlement, reconciliation or current-job POSTs')
        assert.match(new URL(request.url).pathname, /^\/studio-library(?:\/|$)/)
        return object.fetch(request)
      } }
    } },
  }
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      const account = token === 'Bearer alice-token' ? alice : token === 'Bearer bob-token' ? bob : null
      return Response.json(account ? { id: account, email: `${account === alice ? 'alice' : 'bob'}@example.test` } : {}, { status: account ? 200 : 401 })
    }
    assert.equal(init?.method ?? 'GET', 'GET')
    if (url.pathname.endsWith('/quality')) {
      qualityReads.push(url.pathname)
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-private-oracle')
      assert.equal(init?.redirect, 'manual')
      assert.ok(init?.signal)
      return qualityResponse()
    }
    external.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    assert.match(url.pathname, /^\/v1\/jobs\/[a-f0-9-]+\/model$/)
    if (artifactStatus !== 200) return Response.json({ error: 'Missing artifact' }, { status: artifactStatus })
    const bytes = detailedGLBFixture()
    return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } })
  }
  const call = (path = '/api/studio/library', options: { user?: 'alice' | 'bob' | null; method?: string; ticket?: string; origin?: string; body?: unknown } = {}) => {
    const user = options.user === undefined ? 'alice' : options.user
    return studioApi(new Request(origin + path, { method: options.method ?? 'GET', headers: {
      Origin: options.origin ?? origin, ...(user ? { Cookie: `__Host-worldifact-access=${user}-token` } : {}),
      ...(options.ticket ? { 'X-WORLDIFACT-Job': options.ticket } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) }), env, fetcher)
  }
  return { env, rows, ledgerRequests, lists, reads, external, qualityReads, quality: (response: () => Response) => { qualityResponse = response }, call,
    model: async (id: string) => (await (await call(`/api/studio/library/${id}`)).json() as { model: StudioLibraryModel }).model,
    page: async (cursor?: string) => await (await call(`/api/studio/library${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)).json() as StudioLibraryPage,
    artifactStatus: (status: number) => { artifactStatus = status },
    assertReadOnly() { assert.equal(writes, 0); assert.equal(transactions, 0) },
  }
}

test('account library is authenticated, same-origin, GET-only, and never accepts an account selector', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture()
  f.rows.get(alice)!.set(`job:${idFor(1)}`, completed())
  f.rows.get(bob)!.set(`job:${idFor(2)}`, completed({ prompt: 'Bob private model' }))
  assert.equal((await f.call(undefined, { user: null })).status, 401)
  assert.equal(f.ledgerRequests.length, 0)
  assert.equal((await f.call(undefined, { origin: 'https://other.test' })).status, 403)
  assert.equal((await f.call(undefined, { method: 'POST' })).status, 405)
  for (const query of [`userId=${bob}`, `id=${idFor(1)}`, 'limit=1000', 'cursor=&cursor=', 'cursor=', 'cursor=not-signed'])
    assert.equal((await f.call(`/api/studio/library?${query}`)).status, 400, query)
  const response = await f.call(undefined, { user: 'bob' })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const bobPage = await response.json() as StudioLibraryPage
  assert.equal(bobPage.accountId, bob)
  assert.deepEqual(bobPage.models.map(model => model.id), [idFor(2)])
  const bobModel = await (await f.call(`/api/studio/library/${idFor(2)}`, { user: 'bob' })).json() as { accountId: string; model: StudioLibraryModel }
  assert.equal(bobModel.accountId, bob)
  assert.equal(bobModel.model.id, idFor(2))
  assert.equal((await f.call(`/api/studio/library/${idFor(1)}`, { user: 'bob' })).status, 404)
  assert.equal((await f.call(`/api/studio/library/${idFor(1)}?userId=${alice}`)).status, 400)
  assert.equal((await f.call('/api/studio/library/not-a-job')).status, 400)
  assert.equal((await f.call(`/api/studio/library/${idFor(1)}`, { method: 'POST' })).status, 405)
  assert.equal(f.external.length, 0)
  f.assertReadOnly()
})

test('current completed model is discovered from all 58 account rows after the latest-job pointer was dismissed', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), values = f.rows.get(alice)!, latest = idFor(58)
  for (let i = 1; i <= 58; i++) values.set(`job:${idFor(i)}`, completed({ state: i === 58 || i === 8 ? 'completed' : 'failed', updatedAt: NOW - 60_000 + i * 100 }))
  values.set('current-studio-job:v1', { id: '' })
  const before = structuredClone([...values]), page = await f.page()
  assert.equal(page.accountId, alice)
  assert.equal(page.models[0].id, latest)
  assert.equal(page.models[0].review, 'UNREVIEWED')
  assert.equal(page.models[0].downloadAllowed, true)
  assert.equal(page.models[0].createdAt, new Date(NOW - 60_000).toISOString())
  assert.match(page.models[0].receipt.ticket, new RegExp(`^library\\.${latest}\\.${NOW}\\.[a-f0-9]{64}\\.[a-f0-9]{64}$`))
  assert.equal(page.hasMore, false)
  assert.equal(page.nextCursor, null)
  assert.equal(f.lists.length, 1)
  assert.equal(f.lists[0].limit, STUDIO_LIBRARY_SCAN_LIMIT)
  assert.ok(!f.reads.includes('current-studio-job:v1'))
  assert.deepEqual([...values], before)
  assert.equal(f.external.length, 0, 'Opening metadata must never read model bytes, health or provider status')
  assert.equal(f.qualityReads.length, 0, 'Library listing must never fan out to Oracle quality metadata')
  assert.doesNotMatch(JSON.stringify(page), /providerBudget|balance|subscription|supportApproval|fingerprint|trycloudflare|apiToken/)
  f.assertReadOnly()
})

test('only well-formed completed Studio records with an existing fingerprint enter the library', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), values = f.rows.get(alice)!
  const invalid = [null, [], 'legacy', {}, completed({ state: 'reserved' }), completed({ state: 'failed' }), completed({ state: 'cancelled' }),
    completed({ fingerprint: undefined }), completed({ fingerprint: 'wrong' }), completed({ channel: undefined }), completed({ channel: 'blueprint' }),
    completed({ at: 'yesterday' }), completed({ at: -1 }), completed({ at: NOW + 1 }), completed({ updatedAt: NaN }), completed({ updatedAt: NOW - 90_000 }),
    completed({ prompt: {} }), completed({ prompt: '' }), completed({ prompt: 'a'.repeat(4001) }), completed({ profile: 'unknown' }),
    completed({ kind: 'unknown' }), completed({ cost: -1 }), completed({ pricing: {} }), completed({ failureCode: 'INVALID_MODEL_OUTPUT' })]
  invalid.forEach((value, i) => values.set(`job:${idFor(i + 1)}`, value))
  values.set('job:malformed-key', completed())
  values.set('job:ABCDEFAB-1111-4111-8111-111111111111', completed())
  values.set(`job:${idFor(60)}`, completed())
  assert.deepEqual((await f.page()).models.map(model => model.id), [idFor(60)])
  for (let i = 0; i < invalid.length; i++) assert.equal((await f.call(`/api/studio/library/${idFor(i + 1)}`)).status, 404)
  assert.equal(f.external.length, 0)
  f.assertReadOnly()
})

test('bounded signed pagination advances empty pages through a large history without losing later completed jobs', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), values = f.rows.get(alice)!
  for (let i = 1; i <= 260; i++) values.set(`job:${idFor(i)}`, completed({ state: i > 192 ? 'completed' : 'failed' }))
  let cursor: string | undefined, count = 0
  const found: string[] = [], cursors = new Set<string>()
  do {
    const page = await f.page(cursor)
    assert.ok(page.models.length <= 64)
    if (count < 3) { assert.deepEqual(page.models, []); assert.equal(page.hasMore, true) }
    found.push(...page.models.map(model => model.id))
    if (page.hasMore) {
      assert.ok(page.nextCursor)
      assert.match(page.nextCursor, /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/)
      assert.ok(!cursors.has(page.nextCursor))
      cursors.add(page.nextCursor)
    } else assert.equal(page.nextCursor, null)
    cursor = page.nextCursor ?? undefined
    count++
    assert.ok(count <= 5)
  } while (cursor)
  assert.equal(count, 5)
  assert.deepEqual(new Set(found), new Set(Array.from({ length: 68 }, (_, i) => idFor(i + 193))))
  assert.equal(found.length, 68)
  assert.ok(f.lists.every(list => list.limit === 64))
  assert.equal(f.external.length, 0)
  f.assertReadOnly()
})

test('library cursors reject tampering, another account, another purpose and expiry before a storage scan', async t => {
  let now = NOW
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), values = f.rows.get(alice)!
  for (let i = 1; i <= 65; i++) values.set(`job:${idFor(i)}`, completed())
  const first = await f.page(), cursor = first.nextCursor!
  const calls = f.ledgerRequests.length
  const tokens = [cursor.slice(0, -1) + (cursor.endsWith('a') ? 'b' : 'a'), `a${cursor}`, 'x'.repeat(12_001), first.models[0].receipt.ticket]
  for (const token of tokens) assert.equal((await f.call(`/api/studio/library?cursor=${encodeURIComponent(token)}`)).status, 400)
  assert.equal((await f.call(`/api/studio/library?cursor=${encodeURIComponent(cursor)}`, { user: 'bob' })).status, 400)
  now = NOW - 30_001
  assert.equal((await f.call(`/api/studio/library?cursor=${encodeURIComponent(cursor)}`)).status, 400)
  now = NOW + TTL
  assert.equal((await f.call(`/api/studio/library?cursor=${encodeURIComponent(cursor)}`)).status, 400)
  assert.equal(f.ledgerRequests.length, calls)
  assert.equal(f.external.length, 0)
  f.assertReadOnly()
})

test('a fresh library receipt reads only its owned artifact and cannot be replayed for status or generation', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), id = idFor(1)
  f.rows.get(alice)!.set(`job:${id}`, completed())
  f.rows.get(bob)!.set(`job:${id}`, completed())
  const model = await f.model(id), ticket = model.receipt.ticket
  const before = structuredClone([...f.rows.get(alice)!])
  assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket, user: 'bob' })).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${idFor(2)}/model`, { ticket })).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${id}`, { ticket })).status, 401)
  assert.equal((await f.call('/api/studio/jobs', { ticket, method: 'POST', body: { prompt: 'A duplicate model' } })).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket: ticket.slice('library.'.length) })).status, 401)
  assert.equal(f.external.length, 0)
  const response = await f.call(`/api/studio/jobs/${id}/model`, { ticket })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type')!, /model\/gltf-binary/)
  assert.ok((await response.arrayBuffer()).byteLength > 20)
  assert.deepEqual(f.external, [`GET /v1/jobs/${id}/model`])
  assert.deepEqual([...f.rows.get(alice)!], before)
  assert.ok(f.ledgerRequests.every(request => request.method === 'GET'))
  f.assertReadOnly()
})

test('library artifact access rechecks revoked, failed, malformed, changed and deleted owned rows without Oracle recovery', async t => {
  t.mock.method(Date, 'now', () => NOW)
  for (const replacement of [undefined, null, completed({ state: 'failed' }), completed({ state: 'reserved' }), completed({ fingerprint: undefined }),
    completed({ fingerprint: 'b'.repeat(64) }), completed({ channel: 'blueprint' })]) {
    const f = fixture(), values = f.rows.get(alice)!, id = idFor(1)
    values.set(`job:${id}`, completed())
    const ticket = (await f.model(id)).receipt.ticket
    if (replacement === undefined) values.delete(`job:${id}`)
    else values.set(`job:${id}`, replacement)
    assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket })).status, 403)
    assert.equal(f.external.length, 0)
    f.assertReadOnly()
  }
})

test('library receipt expiration is explicit and an authenticated GET refreshes that same completed model', async t => {
  let now = NOW
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), id = idFor(1)
  f.rows.get(alice)!.set(`job:${id}`, completed())
  const old = await f.model(id)
  now = NOW - 30_001
  assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket: old.receipt.ticket })).status, 401)
  now = NOW + TTL
  const expired = await f.call(`/api/studio/jobs/${id}/model`, { ticket: old.receipt.ticket })
  assert.equal(expired.status, 401)
  assert.equal((await expired.json() as { code: string }).code, 'STUDIO_LIBRARY_RECEIPT_EXPIRED')
  assert.equal(f.external.length, 0)
  const fresh = await f.model(id)
  assert.equal(fresh.id, old.id)
  assert.notEqual(fresh.receipt.ticket, old.receipt.ticket)
  assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket: fresh.receipt.ticket })).status, 200)
  f.assertReadOnly()
})

test('existing membership and debt permissions remain authoritative on list, refresh and download', async t => {
  t.mock.method(Date, 'now', () => NOW)
  for (const [key, value] of [['subscription', { active: false, until: NOW + 86_400_000 }], ['balance', -1], ['billingHold', true]] as const) {
    const f = fixture(), values = f.rows.get(alice)!, id = idFor(1)
    values.set(`job:${id}`, completed())
    const ticket = (await f.model(id)).receipt.ticket
    values.set(key, value)
    assert.equal((await f.page()).models[0].downloadAllowed, false)
    assert.equal((await f.model(id)).downloadAllowed, false)
    assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket })).status, 403)
    assert.equal(f.external.length, 0)
    f.assertReadOnly()
  }
  const f = fixture(), values = f.rows.get(alice)!, id = idFor(1)
  values.set(`job:${id}`, completed({ profile: 'fast' }))
  values.delete('subscription')
  assert.equal((await f.model(id)).downloadAllowed, true, 'Existing completed FAST permission remains unchanged')
  f.assertReadOnly()
})

test('a missing provider artifact reports unavailability without deleting metadata, refunding or starting a job', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), values = f.rows.get(alice)!, id = idFor(1)
  values.set(`job:${id}`, completed())
  const model = await f.model(id), before = structuredClone([...values])
  f.artifactStatus(404)
  assert.equal((await f.call(`/api/studio/jobs/${id}/model`, { ticket: model.receipt.ticket })).status, 404)
  assert.deepEqual((await f.page()).models.map(item => item.id), [id])
  assert.deepEqual([...values], before)
  assert.deepEqual(f.external, [`GET /v1/jobs/${id}/model`])
  f.assertReadOnly()
})

test('metadata pagination and receipt refresh use the existing account read limit without consuming generation limits', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), counts = new Map<string, number>()
  f.env.GENERATION_LIMITER = { async limit() { throw new Error('Metadata reads must not use the three-per-minute generation limiter') } }
  f.env.ACCOUNT_LIMITER = { async limit({ key }) {
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return { success: counts.get(key)! <= 20 }
  } }
  for (let i = 1; i <= 260; i++) f.rows.get(alice)!.set(`job:${idFor(i)}`, completed())
  let cursor: string | undefined
  for (let page = 0; page < 5; page++) {
    const response = await f.call(`/api/studio/library${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
    assert.equal(response.status, 200)
    cursor = (await response.json() as StudioLibraryPage).nextCursor ?? undefined
  }
  for (let i = 0; i < 15; i++) assert.equal((await f.call(`/api/studio/library/${idFor(1)}`)).status, 200)
  const reads = f.ledgerRequests.length
  assert.equal((await f.call()).status, 429)
  assert.equal(f.ledgerRequests.length, reads)
  assert.deepEqual([...counts.keys()], [`studio-library:${alice}`])
  assert.equal((await f.call(undefined, { user: 'bob' })).status, 200, 'Another account has an independent bounded read allowance')
  assert.equal(f.external.length, 0)
  f.assertReadOnly()
})

test('selected owned library detail exposes only recorded worker duration and the list remains Oracle-free', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), id = idFor(1), values = f.rows.get(alice)!
  values.set(`job:${id}`, completed())
  const before = structuredClone([...values])
  f.quality(() => Response.json({ revision: 6, state: 'succeeded', timing: { total_seconds: 343.27, ai_seconds: 300, private: 'PRIVATE_REPORT' }, agent: { summary: 'PRIVATE_REPORT' } }))
  const page = await f.page()
  assert.equal(page.models[0].generationTiming, undefined)
  assert.equal(f.qualityReads.length, 0)
  assert.equal((await f.call(`/api/studio/library/${id}`, { user: 'bob' })).status, 404)
  assert.equal((await f.call(`/api/studio/library/${id}`, { user: null })).status, 401)
  assert.equal(f.qualityReads.length, 0, 'Ownership is verified before optional provider metadata')
  const model = await f.model(id)
  assert.deepEqual(model.generationTiming, { source: 'oracle-worker', durationSeconds: 343.27 })
  assert.deepEqual(f.qualityReads, [`/v1/jobs/${id}/quality`])
  assert.doesNotMatch(JSON.stringify(model), /PRIVATE_REPORT|ai_seconds|agent|total_seconds/)
  assert.equal(model.createdAt, page.models[0].createdAt)
  assert.equal(model.completedAt, page.models[0].completedAt)
  assert.equal(model.downloadAllowed, true)
  assert.deepEqual([...values], before)
  f.assertReadOnly()
})

test('missing, malformed, oversized and unavailable timing never hide an owned library result or change its permissions', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const f = fixture(), id = idFor(1), values = f.rows.get(alice)!
  values.set(`job:${id}`, completed())
  const reports: unknown[] = [null, [], {}, { revision: 6, state: 'succeeded' },
    ...[null, true, '343', -1, 86_401, NaN, Infinity, {}, []].map(total_seconds => ({ revision: 6, state: 'succeeded', timing: { total_seconds } })),
    { revision: 5, state: 'succeeded', timing: { total_seconds: 30 } },
    { revision: 6, state: ['succeeded'], timing: { total_seconds: 30 } },
    { revision: 6, state: 'building', timing: { total_seconds: 30 } },
    { revision: 6, state: 'succeeded', timing: [] }]
  const replies = [...reports.map(report => () => Response.json(report)),
    () => Response.json({}, { status: 503 }),
    () => { throw new TypeError('PRIVATE_TRANSPORT') },
    () => new Response('broken-json', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    () => Response.json({ private: 'x'.repeat(262_145) }),
    () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '262145' } })]
  const before = structuredClone([...values])
  for (const reply of replies) {
    f.quality(reply)
    const calls = f.qualityReads.length, model = await f.model(id)
    assert.equal(model.id, id)
    assert.equal(model.generationTiming, undefined)
    assert.equal(model.downloadAllowed, true)
    assert.equal(f.qualityReads.length, calls + 1, 'No automatic metadata retry')
  }
  f.quality(() => Response.json({ revision: 6, state: 'succeeded', timing: { total_seconds: 0 } }))
  assert.equal((await f.model(id)).generationTiming?.durationSeconds, 0, 'A later explicit read can obtain a formerly missing record')
  assert.deepEqual([...values], before)
  f.assertReadOnly()
})
