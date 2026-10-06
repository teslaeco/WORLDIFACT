import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  OVERNIGHT_TEST_APPROVAL, OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE,
  OVERNIGHT_TEST_ISSUED, OVERNIGHT_TEST_EXPIRES, overnightTestAuthority,
  overnightTestConfig, matchesOvernightTestClaim,
} from '../server/overnightTestBudget.ts'
import {
  AccountEntitlements, reserveUserGeneration, markStudioDispatch,
  type EntitlementEnv, type EntitlementStorage,
} from '../server/entitlements.ts'
import { OvernightTestClient, readOvernightPanelStatus } from '../src/lib/overnightTestClient.ts'
import { BLUEPRINT_RECOVERY_KEY } from '../src/lib/blueprintClient.ts'
import { STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX } from '../src/lib/studioClient.ts'

// These dates intentionally do not derive from production constants: the fresh
// authorization must never revive, reset or relabel the expired overnight run.
const APPROVAL = 'api-tests-20261006-044444-usd4'
const NAMESPACE = APPROVAL + ':v1'
const ISSUED = '2026-10-06T04:44:44.000Z'
const EXPIRES = '2026-10-06T12:00:00.000Z'
const START = Date.parse(ISSUED), END = Date.parse(EXPIRES)
const OLD_APPROVAL = 'overnight-api-tests-20261005-usd4'
const OLD_NAMESPACE = OLD_APPROVAL + ':v1'
const OLD_ISSUED = '2026-10-05T21:08:49.000Z'
const OLD_EXPIRES = '2026-10-06T04:00:00.000Z'
const OLD_AT = Date.parse('2026-10-05T22:00:00.000Z')
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ACCOUNT = 'account:v1:' + OWNER
const JOB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const FINGERPRINT = 'a'.repeat(64)
const PROVIDER = 'provider-budget-cents:v1'
const HISTORICAL_KEYS = ['support-astra-once:v1', 'support-astra-supplemental:v1', 'support-astra-repaired-mcc:v1', 'project-astra-mcc-budget:v1']
const HISTORICAL_NAMES = ['astra-support-once:v1', 'astra-support-supplemental:v1', 'astra-support-repaired-mcc:v1', 'project-astra-mcc-once:v1']
const config = (patch: Record<string, unknown> = {}) => ({
  version: 1, approvalId: APPROVAL, accountId: OWNER, issuedAt: ISSUED, expiresAt: EXPIRES, totalCents: 400, ...patch,
})
const oldConfig = () => config({ approvalId: OLD_APPROVAL, issuedAt: OLD_ISSUED, expiresAt: OLD_EXPIRES })
const selector = () => ({ version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-05T11:00:00.000Z',
  maxProviderCents: 175, maxAttempts: 1, fingerprint: 'b'.repeat(64) })
const oldClaim = (patch: Record<string, unknown> = {}) => ({
  version: 1, source: 'overnight-test', approvalId: OLD_APPROVAL, accountId: OWNER, jobId: JOB,
  fingerprint: FINGERPRINT, workflow: 'detailed-astra', model: 'gpt-6-astra', capCents: 175,
  claimedAt: OLD_AT, expiresAt: OLD_EXPIRES, ...patch,
})
const oldPool = () => ({ version: 1, authority: oldConfig(), committedCents: 395, claims: [
  oldClaim(), oldClaim({ jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
  oldClaim({ jobId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', workflow: 'blueprint-sol', model: 'gpt-6.1-sol', capCents: 35 }),
  oldClaim({ jobId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', workflow: 'blueprint-luna', model: 'gpt-6-luna', capCents: 10 }),
] })

// Real application admission and Durable Object routing, with synthetic account
// identity, private local storage and no network/provider implementation.
function ledgers(explicit?: Record<string, unknown>) {
  const stores = new Map<string, Map<string, unknown>>()
  const calls: { name: string; path: string }[] = [], writes: { name: string; key: string }[] = []
  const historical = Object.fromEntries(HISTORICAL_KEYS.map(key => [key, { consumed: true, marker: key }]))
  const project = { ...selector(), source: 'project', attemptsUsed: 1, reservedCents: 175,
    jobId: '11111111-1111-4111-8111-111111111111', at: Date.parse('2026-10-05T10:01:00.000Z') }
  stores.set(ACCOUNT, new Map(Object.entries({ balance: 2055, [PROVIDER]: 98, ...historical, 'project-astra-mcc-budget:v1': project })))
  stores.set(OLD_NAMESPACE, new Map([[OVERNIGHT_TEST_STATE, oldPool()]]))
  for (const name of HISTORICAL_NAMES) stores.set(name, new Map(Object.entries({ ...historical, 'project-astra-mcc-budget:v1': project })))
  const objects = new Map<string, AccountEntitlements>()
  const env: EntitlementEnv = { ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', ENABLE_ASTRA_PLANS: 'true', ACCOUNT_LEDGER_MODE: 'live',
    WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(selector()),
    ...(explicit ? { WORLDIFACT_OVERNIGHT_TEST_BUDGET: JSON.stringify(explicit) } : {}),
  }
  const ensure = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)!
  }
  const storage = (name: string): EntitlementStorage => {
    const values = ensure(name)
    let tail: Promise<unknown> = Promise.resolve()
    const access = (target: Map<string, unknown>): EntitlementStorage => ({
      async get<T>(key: string) { return structuredClone(target.get(key)) as T | undefined },
      async put(key, value) {
        assert.equal(name === OLD_NAMESPACE || HISTORICAL_NAMES.includes(name) || key === PROVIDER || HISTORICAL_KEYS.includes(key), false,
          'Fresh approval must not write expired authority, old grants or ordinary provider cents')
        writes.push({ name, key }); target.set(key, structuredClone(value))
      },
      transaction<T>(fn: (tx: EntitlementStorage) => Promise<T>) {
        const next = tail.then(async () => {
          const draft = structuredClone(values), result = await fn(access(draft))
          values.clear(); for (const [key, value] of draft) values.set(key, value)
          return result
        })
        tail = next.catch(() => undefined); return next
      },
    })
    return access(values)
  }
  const fetchInternal = async (name: string, request: Request) => {
    calls.push({ name, path: new URL(request.url).pathname })
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: storage(name), id: { toString: () => name } }, env, () => Date.now()))
    return objects.get(name)!.fetch(request)
  }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: id => ({ fetch: request => fetchInternal(String(id), request) }) }
  const call = (name: string, path: string, body?: unknown) => fetchInternal(name, new Request('https://inert.invalid' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'X-WORLDIFACT-Verified-Account': OWNER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }))
  const pool = () => ensure(NAMESPACE).get(OVERNIGHT_TEST_STATE) as { committedCents: number; claims: Record<string, unknown>[] } | undefined
  const preserved = () => structuredClone([
    [OLD_NAMESPACE, [...ensure(OLD_NAMESPACE)]], ...HISTORICAL_NAMES.map(name => [name, [...ensure(name)]]),
    [ACCOUNT, [...ensure(ACCOUNT)].filter(([key]) => key === PROVIDER || HISTORICAL_KEYS.includes(key))],
  ])
  return { env, stores, calls, writes, ensure, call, pool, preserved }
}

test('fresh authority fixes the new approval window and cannot accept or rotate the old authority', () => {
  assert.equal(OVERNIGHT_TEST_APPROVAL, APPROVAL)
  assert.equal(OVERNIGHT_TEST_NAMESPACE, NAMESPACE)
  assert.equal(OVERNIGHT_TEST_ISSUED, ISSUED)
  assert.equal(OVERNIGHT_TEST_EXPIRES, EXPIRES)
  const valid = overnightTestConfig(JSON.stringify(config()), OWNER, 'live', START)
  assert.deepEqual(valid, config())
  const env = { WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(selector()) }
  assert.deepEqual(overnightTestAuthority(env, OWNER, START), valid, 'Historical MCC config selects identity only; its 175c and one attempt do not authorize the new spend')
  for (const at of [OLD_AT, START, END, END + 86_400_000])
    assert.equal(overnightTestConfig(JSON.stringify(oldConfig()), OWNER, 'live', at, true), null)
  for (const invalid of [oldConfig(), config({ approvalId: APPROVAL + '-rotated' }), config({ issuedAt: '2026-10-06T04:44:43.999Z' }),
    config({ issuedAt: '2026-10-06T04:44:44.001Z' }), config({ expiresAt: '2026-10-06T12:00:00.001Z' }), config({ expiresAt: '2026-10-07T12:00:00.000Z' })]) {
    assert.equal(overnightTestAuthority({ ...env, WORLDIFACT_OVERNIGHT_TEST_BUDGET: JSON.stringify(invalid) }, OWNER, START), null,
      'An explicit stale or changed policy must not fall through to the account selector')
  }
  assert.equal(matchesOvernightTestClaim(oldClaim(), valid!, JOB, FINGERPRINT, 'detailed-astra', START), false)
  assert.equal(matchesOvernightTestClaim(oldClaim({ approvalId: APPROVAL }), valid!, JOB, FINGERPRINT, 'detailed-astra', START), false,
    'Relabelling an expired claim cannot give it a new time window')
})

test('old explicit config and old claim fail actual admission without reserving a fresh slot or changing history', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START })
  const stale = ledgers(oldConfig()), staleBefore = stale.preserved()
  await assert.rejects(reserveUserGeneration(stale.env, OWNER, crypto.randomUUID(), 'slow', 'astra', FINGERPRINT, 'standard',
    { overnightTest: true, channel: 'studio' }), /unavailable or expired/)
  assert.equal(stale.calls.length, 0); assert.equal(stale.writes.length, 0); assert.deepEqual(stale.preserved(), staleBefore)
  const fresh = ledgers(), before = fresh.preserved()
  const denied = await fresh.call(ACCOUNT, '/reserve-overnight-test', {
    id: JOB, profile: 'slow', model: 'astra', channel: 'studio', fingerprint: FINGERPRINT, overnightTestClaim: oldClaim(),
  })
  assert.equal(denied.status, 429); assert.deepEqual(await denied.json(), { allowed: false, reason: 'ACCOUNT_REQUEST_CONFLICT' })
  assert.equal(fresh.writes.length, 0); assert.equal(fresh.pool(), undefined); assert.deepEqual(fresh.preserved(), before)
})

test('an expired pool record copied into the new namespace is rejected rather than reset or migrated', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START })
  const f = ledgers(), occupied = oldPool(), before = f.preserved()
  f.ensure(NAMESPACE).set(OVERNIGHT_TEST_STATE, structuredClone(occupied))
  await assert.rejects(reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), 'fast', 'sol', FINGERPRINT, 'standard',
    { overnightTest: true, channel: 'blueprint', providerModel: 'gpt-6.1-sol', blueprintDispatch: 'fenced-v1' }), /authority is unavailable/)
  assert.equal(f.writes.length, 0)
  assert.deepEqual(f.ensure(NAMESPACE).get(OVERNIGHT_TEST_STATE), occupied)
  assert.deepEqual(f.preserved(), before)
  assert.equal(f.calls.some(call => call.path === '/reserve' || call.path === '/reserve-overnight-test'), false)
})

test('new pool commitments coexist with fully consumed old run, consumed grants and the unchanged ordinary 98c', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START })
  const f = ledgers(), before = f.preserved()
  const request = { jobId: crypto.randomUUID(), fingerprint: FINGERPRINT, workflow: 'blueprint-sol' }
  for (const name of [OLD_NAMESPACE, APPROVAL + ':rotated', ACCOUNT]) {
    const denied = await f.call(name, '/overnight-test-claim', request)
    assert.equal(denied.status, 403)
  }
  assert.equal(f.writes.length, 0)
  const detailed = await reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), 'slow', 'astra', FINGERPRINT, 'standard',
    { overnightTest: true, channel: 'studio' })
  const sol = await reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), 'fast', 'sol', FINGERPRINT, 'standard',
    { overnightTest: true, channel: 'blueprint', providerModel: 'gpt-6.1-sol', blueprintDispatch: 'fenced-v1' })
  assert.equal(detailed.allowed, true); assert.equal(sol.allowed, true)
  assert.equal(detailed.fundingSource, APPROVAL); assert.equal(sol.fundingSource, APPROVAL)
  assert.equal(f.pool()?.committedCents, 210); assert.equal(f.pool()?.claims.length, 2)
  assert.ok(f.pool()!.claims.every(claim => claim.approvalId === APPROVAL && claim.claimedAt === START))
  assert.deepEqual(f.preserved(), before)
  assert.equal(f.ensure(ACCOUNT).get(PROVIDER), 98)
  assert.equal(f.ensure(ACCOUNT).get('balance'), 2005)
  assert.equal(f.ensure(ACCOUNT).get('customer-reserved-credits:v1'), 250)
  assert.equal(f.calls.some(call => call.path === '/reserve'), false)
  assert.ok(f.writes.filter(write => write.key === OVERNIGHT_TEST_STATE).every(write => write.name === NAMESPACE))
})

test('new starts begin exactly at consent and both model dispatch paths close at noon without extending authority', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START - 1 })
  const f = ledgers(), before = f.preserved(), first = crypto.randomUUID()
  const reserveAstra = (id: string) => reserveUserGeneration(f.env, OWNER, id, 'slow', 'astra', FINGERPRINT, 'standard', { overnightTest: true, channel: 'studio' })
  await assert.rejects(reserveAstra(first), /unavailable or expired/)
  assert.equal(f.writes.length, 0)
  t.mock.timers.setTime(START)
  assert.equal((await reserveAstra(first)).allowed, true)
  assert.equal((await markStudioDispatch(f.env, OWNER, first, FINGERPRINT)).dispatch, true)
  t.mock.timers.setTime(END - 1)
  const second = crypto.randomUUID(), sol = crypto.randomUUID()
  assert.equal((await reserveAstra(second)).allowed, true)
  assert.equal((await reserveUserGeneration(f.env, OWNER, sol, 'fast', 'sol', FINGERPRINT, 'standard',
    { overnightTest: true, channel: 'blueprint', providerModel: 'gpt-6.1-sol', blueprintDispatch: 'fenced-v1' })).allowed, true)
  const committed = structuredClone(f.pool()), writeCount = f.writes.length
  for (const at of [END, END + 1, END + 86_400_000]) {
    t.mock.timers.setTime(at)
    assert.deepEqual(await markStudioDispatch(f.env, OWNER, second, FINGERPRINT), { dispatch: false })
    const blueprint = await f.call(ACCOUNT, '/blueprint-dispatch', { id: sol, fingerprint: FINGERPRINT })
    assert.deepEqual(await blueprint.json(), { dispatch: false })
    await assert.rejects(reserveAstra(crypto.randomUUID()), /unavailable or expired/)
    const status = await f.call(NAMESPACE, '/overnight-test-status'), data = readOvernightPanelStatus(await status.json())
    assert.equal(status.status, 200); assert.equal(data.available, false); assert.equal(data.expiresAt, EXPIRES)
    assert.equal(data.approvalId, APPROVAL); assert.equal(data.committedCents, 385)
  }
  assert.equal(f.writes.length, writeCount); assert.deepEqual(f.pool(), committed); assert.deepEqual(f.preserved(), before)
})

function panelStatus(patch: Record<string, unknown> = {}) {
  return { available: true, approvalId: APPROVAL, expiresAt: EXPIRES, totalCents: 400, committedCents: 0, remainingCents: 400,
    attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true, ...patch }
}
function panel() {
  const oldPrefix = `worldifact:overnight-tests:v1:${OLD_APPROVAL}:${OWNER}:`
  const values = new Map<string, string>([
    [BLUEPRINT_RECOVERY_KEY, 'ordinary blueprint receipt'], [STUDIO_RECEIPT_KEY, 'ordinary studio receipt'],
    [STUDIO_RECEIPT_HISTORY_PREFIX + JOB, 'ordinary receipt history'],
    [oldPrefix + 'sol:' + BLUEPRINT_RECOVERY_KEY, JSON.stringify({ id: JOB, fingerprint: FINGERPRINT, model: 'sol', state: 'pending', createdAt: OLD_AT })],
    [oldPrefix + 'astra-1:' + STUDIO_RECEIPT_KEY, 'original overnight receipt'],
    [oldPrefix + 'astra-1:' + STUDIO_RECEIPT_HISTORY_PREFIX + JOB, 'original overnight history'],
  ])
  const reads: string[] = [], writes: string[] = [], calls: string[] = []
  const storage = { getItem: (key: string) => { reads.push(key); return values.get(key) ?? null },
    setItem: (key: string, value: string) => { writes.push(key); values.set(key, value) },
    removeItem: () => { throw new Error('No receipt can be removed during renewal') } }
  let now = START, status = panelStatus(), expireAfterStatus = false
  const fetcher = (async (input, init = {}) => {
    const path = String(input), method = init.method ?? 'GET'
    calls.push(method + ' ' + path)
    if (method === 'GET' && path === '/api/overnight-tests/status') {
      if (expireAfterStatus) now = END
      return Response.json(status)
    }
    assert.equal(method, 'POST'); assert.equal(path, '/api/overnight-tests/blueprint')
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error')
    throw new Error('Inert lost response after local receipt persistence')
  }) as typeof fetch
  const make = () => new OvernightTestClient(storage, fetcher, OWNER, () => true, () => now)
  return { values, reads, writes, calls, make, setTime: (value: number) => { now = value },
    setStatus: (value: ReturnType<typeof panelStatus>) => { status = value }, expireOnStatus: () => { expireAfterStatus = true } }
}

test('renewed local receipt namespace preserves old pending run and ordinary receipts through lost response and reload', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START })
  const f = panel(), preserved = new Map(f.values), client = f.make()
  assert.deepEqual(client.rows().map(row => row.state), ['empty', 'empty', 'empty', 'empty'])
  await assert.rejects(client.start('sol', 'A synthetic observatory'), /Inert lost response/)
  const row = client.rows().find(value => value.slot === 'sol')!
  assert.equal(row.state, 'pending'); assert.ok(row.id); assert.notEqual(row.id, JOB)
  for (const [key, value] of preserved) assert.equal(f.values.get(key), value)
  assert.ok(f.writes.length > 0)
  assert.ok(f.writes.every(key => key.startsWith(`worldifact:overnight-tests:v1:${APPROVAL}:${OWNER}:sol:`)))
  assert.ok(f.reads.every(key => !preserved.has(key)), 'The fresh panel must not recover, reinterpret or disclose old-run or ordinary receipts')
  const restored = f.make()
  assert.equal(restored.rows().find(value => value.slot === 'sol')?.id, row.id)
  await assert.rejects(restored.start('sol', 'A replacement observatory'), /Recover existing requests first/)
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1)
})

test('panel rejects old approval, mismatched cutoff, and starts outside the renewed fixed window before any POST', async () => {
  for (const patch of [{ approvalId: OLD_APPROVAL, expiresAt: OLD_EXPIRES }, { approvalId: APPROVAL + ':rotated' },
    { expiresAt: '2026-10-06T12:00:00.001Z' }]) {
    assert.throws(() => readOvernightPanelStatus(panelStatus(patch)))
    const f = panel(); f.setStatus(panelStatus(patch))
    await assert.rejects(f.make().start('sol', 'A synthetic observatory'))
    assert.equal(f.writes.length, 0); assert.equal(f.calls.some(call => call.startsWith('POST')), false)
  }
  for (const at of [START - 1, END, END + 1, END + 86_400_000]) {
    const f = panel(); f.setTime(at)
    await assert.rejects(f.make().start('sol', 'A synthetic observatory'), /window is closed/)
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0)
  }
  const late = panel(); late.setTime(END - 1); late.expireOnStatus()
  await assert.rejects(late.make().start('sol', 'A synthetic observatory'), /window is closed/)
  assert.deepEqual(late.calls, ['GET /api/overnight-tests/status']); assert.equal(late.writes.length, 0)
})

test('visible cutoff copy identifies the implementation limit rather than attributing noon to the user', () => {
  const source = readFileSync(new URL('../src/pages/OvernightTestsPage.tsx', import.meta.url), 'utf8')
  const paragraph = source.split('<p>').map(value => value.split('</p>')[0]).find(value => value.includes('<time dateTime={OVERNIGHT_PANEL_EXPIRES}>'))
  assert.ok(paragraph, 'The visible paid-window paragraph must identify its fixed cutoff')
  assert.match(paragraph, /implementation cutoff/i)
  assert.match(paragraph, /(?:not (?:a |the )?user[ -](?:stated|requested|set) deadline|not (?:a |the )?deadline (?:specified|set|requested|stated) by (?:you|the user))/i)
  assert.match(paragraph, /12:00 UTC/)
})
