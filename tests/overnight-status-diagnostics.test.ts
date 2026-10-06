import test from 'node:test'
import assert from 'node:assert/strict'
import { OvernightTestClient } from '../src/lib/overnightTestClient.ts'
import {
  OVERNIGHT_TEST_DIAGNOSTICS, OvernightTestStatusError, isOvernightTestDiagnostic,
  overnightTestDiagnostic, type OvernightTestDiagnostic,
} from '../src/lib/overnightTestDiagnostics.ts'
import {
  overnightTestAuthority, overnightTestStatusDiagnostic, OVERNIGHT_TEST_NAMESPACE,
  OVERNIGHT_TEST_STATE, type OvernightTestEnv,
} from '../server/overnightTestBudget.ts'
import { AccountEntitlements, entitlementApi, type EntitlementEnv, type EntitlementStorage } from '../server/entitlements.ts'
import type { AccountEnv } from '../server/accounts.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-06T05:00:00.000Z')
const ISSUED = '2026-10-06T04:44:44.000Z', EXPIRES = '2026-10-06T12:00:00.000Z'
const APPROVAL = 'api-tests-20261006-044444-usd4'
const PRIVATE = 'synthetic-private-upstream-detail'
const STATUS_URL = 'https://worldifact.test/api/overnight-tests/status'
const config = () => ({ version: 1, approvalId: APPROVAL, accountId: OWNER, issuedAt: ISSUED, expiresAt: EXPIRES, totalCents: 400 })
const selector = () => ({ version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-05T11:00:00.000Z',
  maxProviderCents: 175, maxAttempts: 1, fingerprint: 'a'.repeat(64) })
const status = () => ({ available: true, approvalId: APPROVAL, expiresAt: EXPIRES, totalCents: 400,
  committedCents: 0, remainingCents: 400, attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true })
const noReceipts = {
  getItem(): never { throw new Error('A status read must not read receipts') },
  setItem(): never { throw new Error('A status read must not write receipts') },
  removeItem(): never { throw new Error('A status read must not remove receipts') },
}
const client = (fetcher: typeof fetch) => new OvernightTestClient(noReceipts, fetcher, OWNER, () => true, () => NOW)
const hasNoPrivateData = (value: unknown) => {
  const text = JSON.stringify(value)
  for (const forbidden of [OWNER, OTHER, PRIVATE, 'accountId', 'fingerprint', 'WORLDIFACT_', 'issuedAt'])
    assert.equal(text.includes(forbidden), false, forbidden)
}
async function rejectsDiagnostic(fetcher: typeof fetch, expected: OvernightTestDiagnostic) {
  await assert.rejects(client(fetcher).status(), (error: unknown) => {
    assert.ok(error instanceof OvernightTestStatusError)
    assert.equal(error.diagnostic, expected)
    assert.equal(error.message, `The temporary test status could not be verified. Diagnostic: ${expected}.`)
    assert.equal(overnightTestDiagnostic(error), expected)
    hasNoPrivateData({ ...error, message: error.message })
    return true
  })
}

test('status preserves the Window-style fetch receiver and performs only the same-origin GET', async () => {
  let calls = 0
  const rawFetch = async function (this: unknown, input: Parameters<typeof fetch>[0], init?: RequestInit) {
    assert.equal(this, globalThis, 'Browser native fetch requires its original global receiver')
    calls++
    assert.equal(input, '/api/overnight-tests/status')
    assert.equal(init?.method, 'GET')
    assert.equal(init.credentials, 'same-origin')
    assert.equal(init.redirect, 'error')
    assert.equal(init.cache, 'no-store')
    assert.equal(init.body, undefined)
    return Response.json(status())
  }
  assert.deepEqual(await client(rawFetch).status(), status())
  assert.equal(calls, 1)
})

test('diagnostics accept only the finite codes and refuse error lookalikes or arbitrary private strings', () => {
  for (const code of OVERNIGHT_TEST_DIAGNOSTICS) {
    assert.equal(isOvernightTestDiagnostic(code), true)
    assert.equal(overnightTestDiagnostic(new OvernightTestStatusError(code)), code)
  }
  for (const value of [undefined, null, OWNER, PRIVATE, 'TEST_UNRECOGNIZED', 'test_pool_read_unavailable',
    'TEST_POOL_READ_UNAVAILABLE ', { diagnostic: 'TEST_POOL_READ_UNAVAILABLE' }, ['TEST_POOL_READ_UNAVAILABLE']])
    assert.equal(isOvernightTestDiagnostic(value), false)
  for (const error of [new Error(PRIVATE + OWNER), PRIVATE, OWNER, { diagnostic: 'TEST_POOL_READ_UNAVAILABLE' }, { code: PRIVATE }])
    assert.equal(overnightTestDiagnostic(error), 'TEST_STATUS_RESPONSE_INVALID')
})

test('client distinguishes HTTP auth, rate limit, and allowlisted server diagnostics without forwarding upstream text', async () => {
  for (const [http, diagnostic] of [[401, 'TEST_SIGN_IN_REQUIRED'], [429, 'TEST_STATUS_RATE_LIMITED'], [503, 'TEST_STATUS_RESPONSE_INVALID']] as const) {
    for (const invalid of [undefined, PRIVATE, OWNER, 'TEST_UPSTREAM_SECRET', { code: 'TEST_POOL_READ_UNAVAILABLE' }])
      await rejectsDiagnostic(async () => Response.json({ diagnostic: invalid, error: PRIVATE, code: OWNER }, { status: http }), diagnostic)
    await rejectsDiagnostic(async () => new Response(PRIVATE, { status: http, headers: { 'Content-Type': 'text/plain' } }), diagnostic)
  }
  for (const diagnostic of ['TEST_POOL_NAMESPACE_MISMATCH', 'TEST_POOL_READ_UNAVAILABLE', 'TEST_SELECTOR_MISSING',
    'TEST_SELECTOR_BINDING_TYPE', 'TEST_SELECTOR_INVALID', 'TEST_EXPLICIT_CONFIG_INVALID'] as const)
    await rejectsDiagnostic(async () => Response.json({ diagnostic, error: PRIVATE, code: OWNER }, { status: 503 }), diagnostic)
})

test('client distinguishes transport failures from malformed, interrupted, and oversized status responses', async () => {
  await rejectsDiagnostic(async () => { throw new TypeError('Illegal invocation ' + PRIVATE + OWNER) }, 'TEST_STATUS_TRANSPORT_FAILED')
  for (const response of [
    () => new Response('{broken ' + PRIVATE, { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ ...status(), accountId: OWNER }),
    () => Response.json({ ...status(), committedCents: 1 }),
    () => Response.json({ diagnostic: 'TEST_POOL_READ_UNAVAILABLE', error: PRIVATE }),
    () => Response.json(null),
    () => new Response(null, { status: 204 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(PRIVATE)) } }), { headers: { 'Content-Type': 'application/json' } }),
  ]) await rejectsDiagnostic(async () => response(), 'TEST_STATUS_RESPONSE_INVALID')
  let cancelled = false
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(8193))) },
    cancel() { cancelled = true },
  })
  await rejectsDiagnostic(async () => new Response(oversized, { headers: { 'Content-Type': 'application/json' } }), 'TEST_STATUS_RESPONSE_INVALID')
  assert.equal(cancelled, true, 'Oversized response must stop consuming its body')
})

test('read diagnostics classify private binding failures while authority stays strict and configuration stays unchanged', () => {
  const selected = { WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(selector()) }
  const cases: [Record<string, unknown>, OvernightTestDiagnostic][] = [
    [{}, 'TEST_SELECTOR_MISSING'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: selector() }, 'TEST_SELECTOR_BINDING_TYPE'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify({ ...selector(), maxAttempts: 2 }) }, 'TEST_SELECTOR_INVALID'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: PRIVATE }, 'TEST_SELECTOR_INVALID'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify({ ...selector(), accountId: OTHER }) }, 'TEST_ACCOUNT_NOT_APPROVED'],
    [{ ...selected, WORLDIFACT_OVERNIGHT_TEST_BUDGET: config() }, 'TEST_EXPLICIT_BINDING_TYPE'],
    [{ ...selected, WORLDIFACT_OVERNIGHT_TEST_BUDGET: JSON.stringify({ ...config(), approvalId: 'overnight-api-tests-20261005-usd4' }) }, 'TEST_EXPLICIT_CONFIG_INVALID'],
    [{ ...selected, WORLDIFACT_OVERNIGHT_TEST_BUDGET: '' }, 'TEST_EXPLICIT_CONFIG_INVALID'],
    [{ ...selected, WORLDIFACT_OVERNIGHT_TEST_BUDGET: JSON.stringify({ ...config(), accountId: OTHER }) }, 'TEST_EXPLICIT_CONFIG_INVALID'],
    [{ ...selected, ACCOUNT_LEDGER_MODE: 'demo' }, 'TEST_LEDGER_NOT_LIVE'],
  ]
  for (const [value, expected] of cases) {
    const before = structuredClone(value), env = Object.freeze(value) as OvernightTestEnv
    assert.equal(overnightTestAuthority(env, OWNER, NOW), null)
    assert.equal(overnightTestStatusDiagnostic(env, OWNER, NOW), expected)
    assert.equal(overnightTestAuthority(env, OWNER, NOW, true), null)
    assert.deepEqual(env, before)
    hasNoPrivateData(expected)
  }
  assert.deepEqual(overnightTestAuthority(selected, OWNER, NOW), config())
  assert.equal(overnightTestStatusDiagnostic(selected, OWNER, NOW), null)
  assert.equal(overnightTestStatusDiagnostic(selected, OWNER, Date.parse(ISSUED) - 1), 'TEST_WINDOW_NOT_STARTED')
  assert.equal(overnightTestStatusDiagnostic(selected, OWNER, NaN), 'TEST_WINDOW_NOT_STARTED')
  assert.equal(overnightTestStatusDiagnostic(selected, OWNER, Date.parse(EXPIRES)), null, 'Expired status is a permitted historical read')
  assert.equal(overnightTestAuthority(selected, OWNER, Date.parse(EXPIRES)), null, 'Historical read cannot reopen spending')
})

// Inert authentication and storage surround the actual public API and Durable
// Object route. Unexpected calls, writes or transactions are observable failures.
function apiFixture(options: { stored?: unknown; readError?: boolean; objectName?: string } = {}) {
  const calls = { auth: 0, limit: 0, pool: 0, reads: 0, writes: 0, transactions: 0, unexpectedFetches: 0 }
  const storage: EntitlementStorage = {
    async get<T>(key: string) {
      calls.reads++; assert.equal(key, OVERNIGHT_TEST_STATE)
      if (options.readError) throw new Error(PRIVATE + OWNER)
      return structuredClone(options.stored) as T | undefined
    },
    async put() { calls.writes++; throw new Error('Status must not write') },
    async transaction() { calls.transactions++; throw new Error('Status must not claim') },
  }
  const env: AccountEnv & EntitlementEnv = {
    SUPABASE_URL: 'https://syntheticfixture.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_syntheticfixture',
    ACCOUNT_LEDGER_MODE: 'live', WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(selector()),
    ACCOUNT_LIMITER: { async limit({ key }) {
      calls.limit++; assert.equal(key, 'account:generation-funding:' + OWNER); return { success: true }
    } },
  }
  env.ACCOUNT_ENTITLEMENTS = {
    idFromName(name) { assert.equal(name, OVERNIGHT_TEST_NAMESPACE); return name },
    get(id) {
      assert.equal(String(id), OVERNIGHT_TEST_NAMESPACE)
      return { async fetch(request) {
        calls.pool++
        assert.equal(request.method, 'GET')
        assert.equal(new URL(request.url).pathname, '/overnight-test-status')
        assert.equal(request.headers.get('X-WORLDIFACT-Verified-Account'), OWNER)
        return object.fetch(request)
      } }
    },
  }
  const object = new AccountEntitlements({ storage, id: { toString: () => options.objectName ?? OVERNIGHT_TEST_NAMESPACE } }, env, () => NOW)
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input) !== 'https://syntheticfixture.supabase.co/auth/v1/user') { calls.unexpectedFetches++; throw new Error('Unexpected provider or other request') }
    calls.auth++
    assert.equal(init?.method, 'GET')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-access-fixture')
    return Response.json({ id: OWNER })
  }
  const request = (authenticated = true) => new Request(STATUS_URL, { headers: authenticated ? { Cookie: '__Host-worldifact-access=synthetic-access-fixture' } : {} })
  const read = (authenticated = true, authFetcher = fetcher) => entitlementApi(request(authenticated), env, authFetcher)
  const unchanged = () => {
    assert.equal(calls.writes, 0); assert.equal(calls.transactions, 0); assert.equal(calls.unexpectedFetches, 0)
  }
  return { env, calls, object, read, unchanged }
}
async function apiDiagnostic(response: Response | null, http: number, diagnostic: OvernightTestDiagnostic) {
  assert.ok(response)
  assert.equal(response.status, http)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('vary'), 'Cookie')
  const body = await response.json() as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), ['diagnostic', 'error'])
  assert.equal(body.diagnostic, diagnostic)
  hasNoPrivateData(body)
}

test('public status authenticates before limiting and distinguishes unavailable authentication or protection', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const f = apiFixture()
  await apiDiagnostic(await f.read(false), 401, 'TEST_SIGN_IN_REQUIRED')
  assert.equal(f.calls.auth, 0); assert.equal(f.calls.limit, 0)
  await apiDiagnostic(await f.read(true, async () => Response.json({ error: PRIVATE }, { status: 401 })), 401, 'TEST_SIGN_IN_REQUIRED')
  await apiDiagnostic(await f.read(true, async () => { throw new Error(PRIVATE + OWNER) }), 503, 'TEST_AUTH_UNAVAILABLE')
  assert.equal(f.calls.limit, 0)
  delete f.env.ACCOUNT_LIMITER
  await apiDiagnostic(await f.read(), 503, 'TEST_STATUS_PROTECTION_UNAVAILABLE')
  f.env.ACCOUNT_LIMITER = { async limit() { throw new Error(PRIVATE) } }
  await apiDiagnostic(await f.read(), 503, 'TEST_STATUS_PROTECTION_UNAVAILABLE')
  f.env.ACCOUNT_LIMITER = { async limit() { return { success: false } } }
  await apiDiagnostic(await f.read(), 429, 'TEST_STATUS_RATE_LIMITED')
  assert.equal(f.calls.pool, 0); assert.equal(f.calls.reads, 0); f.unchanged()
})

test('public status emits configuration and binding diagnostics before any pool access', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  for (const [patch, expected] of [
    [{ ACCOUNT_ENTITLEMENTS: undefined }, 'TEST_POOL_BINDING_MISSING'],
    [{ ACCOUNT_LEDGER_MODE: 'demo' }, 'TEST_LEDGER_NOT_LIVE'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: undefined }, 'TEST_SELECTOR_MISSING'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: selector() }, 'TEST_SELECTOR_BINDING_TYPE'],
    [{ WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify({ ...selector(), accountId: OTHER }) }, 'TEST_ACCOUNT_NOT_APPROVED'],
    [{ WORLDIFACT_OVERNIGHT_TEST_BUDGET: config() }, 'TEST_EXPLICIT_BINDING_TYPE'],
    [{ WORLDIFACT_OVERNIGHT_TEST_BUDGET: PRIVATE }, 'TEST_EXPLICIT_CONFIG_INVALID'],
  ] as const) {
    const f = apiFixture(); Object.assign(f.env, patch)
    await apiDiagnostic(await f.read(), 503, expected)
    assert.equal(f.calls.auth, 1); assert.equal(f.calls.limit, 1); assert.equal(f.calls.pool, 0); f.unchanged()
  }
})

test('real pool reads distinguish unreadable storage, malformed state and wrong namespace without mutation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  for (const [options, expected] of [
    [{ readError: true }, 'TEST_POOL_READ_UNAVAILABLE'],
    [{ stored: { authority: config(), accountId: OWNER, error: PRIVATE } }, 'TEST_POOL_STATE_INVALID'],
    [{ stored: null }, 'TEST_POOL_STATE_INVALID'],
    [{ objectName: 'account:v1:' + OWNER }, 'TEST_POOL_NAMESPACE_MISMATCH'],
  ] as const) {
    const f = apiFixture(options)
    await apiDiagnostic(await f.read(), 503, expected)
    assert.equal(f.calls.pool, 1)
    assert.equal(f.calls.reads, expected === 'TEST_POOL_NAMESPACE_MISMATCH' ? 0 : 1)
    f.unchanged()
  }
  const f = apiFixture()
  for (let count = 0; count < 2; count++) {
    const response = await f.read()
    assert.equal(response?.status, 200)
    const body = await response!.json()
    assert.deepEqual(body, status()); hasNoPrivateData(body)
  }
  assert.equal(f.calls.reads, 2); f.unchanged()
})

test('public status sanitizes failed pool responses and propagates only fixed server diagnostics', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  for (const diagnostic of [PRIVATE, OWNER, 'TEST_UNKNOWN', { code: 'TEST_POOL_READ_UNAVAILABLE' }, 'TEST_POOL_READ_UNAVAILABLE']) {
    const f = apiFixture()
    f.env.ACCOUNT_ENTITLEMENTS!.get = () => ({ async fetch() {
      return Response.json({ error: PRIVATE, accountId: OWNER, code: OTHER, diagnostic }, { status: 503 })
    } })
    await apiDiagnostic(await f.read(), 503, diagnostic === 'TEST_POOL_READ_UNAVAILABLE' ? diagnostic : 'TEST_POOL_REQUEST_FAILED')
    f.unchanged()
  }
  for (const fetch of [async () => { throw new Error(PRIVATE + OWNER) }, async () => new Response(PRIVATE, { status: 503 })]) {
    const f = apiFixture(); f.env.ACCOUNT_ENTITLEMENTS!.get = () => ({ fetch })
    await apiDiagnostic(await f.read(), 503, 'TEST_POOL_REQUEST_FAILED'); f.unchanged()
  }
})

test('wrong-namespace claim denial stays unchanged and does not acquire status-only diagnostics', async () => {
  const f = apiFixture({ objectName: 'account:v1:' + OWNER })
  for (const [path, method] of [['/overnight-test-status', 'GET'], ['/overnight-test-claim', 'POST']] as const) {
    const response = await f.object.fetch(new Request('https://entitlements.internal' + path, { method,
      headers: { 'X-WORLDIFACT-Verified-Account': OWNER }, ...(method === 'POST' ? { body: JSON.stringify({ jobId: OTHER, workflow: 'blueprint-sol', fingerprint: 'b'.repeat(64) }) } : {}) }))
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'Wrong overnight budget namespace.',
      ...(method === 'GET' ? { diagnostic: 'TEST_POOL_NAMESPACE_MISMATCH' } : {}) })
  }
  assert.equal(f.calls.reads, 0); f.unchanged()
})
