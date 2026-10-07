import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { AccountEntitlements, entitlementApi, type EntitlementStorage } from '../server/entitlements.ts'
import { evaluateOwnerReserveAdjustment, OWNER_RESERVE_ADJUSTMENT_KEY, ownerReserveAdjustmentLedgerRoute,
  type OwnerReserveAdjustmentAuthority } from '../server/ownerReserveAdjustment.ts'
import { OWNER_RESERVE_ADJUSTMENT_APPROVAL, readOwnerReserveAdjustmentResponse } from '../src/lib/ownerReserveAdjustment.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-07T07:00:00Z'), RESERVE = 'provider-budget-cents:v1', HELD = 'customer-reserved-credits:v1'
const URL = 'https://worldifact.test/api/account/owner-reserve-adjustment'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const authority: OwnerReserveAdjustmentAuthority = Object.freeze({ ownerAccountSha256: digest(OWNER), stripeCustomerSha256: digest('cus_SyntheticOwner'), subscriptionSha256: digest('sub_SyntheticShared'),
  invoiceSha256: Object.freeze([digest('in_SyntheticCreator'), digest('in_SyntheticPro')]) as readonly [string, string], authorizationReferenceSha256: digest('Synthetic approval, no real authorization') })
const code = (result: Awaited<ReturnType<typeof evaluateOwnerReserveAdjustment>>) => 'code' in result.body ? result.body.code : undefined
const seed = (extra: Record<string, unknown> = {}) => ({ balance: 1440, [RESERVE]: 63, [HELD]: 0, customer: 'cus_SyntheticOwner',
  'grant:in_SyntheticCreator': { credits: 1500, revoked: 0, subscriptionId: 'sub_SyntheticShared' },
  'grant:in_SyntheticPro': { credits: 4500, revoked: 0, subscriptionId: 'sub_SyntheticShared' },
  subscription: { active: true, id: 'sub_SyntheticPro', plan: 'pro' }, 'job:synthetic-history': { state: 'failed', privatePrompt: 'Do not disclose' },
  'support-astra-once:v1': { consumed: true }, 'overnight-api-test-budget:v1': { historical: 'unmodified' }, ...extra })
function fixture(extra: Record<string, unknown> = {}) {
  let tail: Promise<unknown> = Promise.resolve()
  const values = new Map<string, unknown>(Object.entries(seed(extra))), writes: string[] = [], reads: string[] = []
  const faults = { write: null as string | null, loseResponse: false, list: null as unknown }
  const storage: EntitlementStorage = {
    async get() { throw new Error('Reads must be inside the transaction') },
    async put() { throw new Error('Writes must be inside the transaction') },
    transaction<T>(callback: (tx: EntitlementStorage) => Promise<T>): Promise<T> {
      const next = tail.then(async () => {
        const pending = structuredClone(values), changed: string[] = []
        const tx: EntitlementStorage = {
          async get<T>(key: string) { reads.push(key); return structuredClone(pending.get(key)) as T | undefined },
          async list<T>({ prefix, limit }: { prefix: string; limit: number }) {
            return (faults.list ?? new Map([...pending].filter(([key]) => key.startsWith(prefix)).slice(0, limit))) as Map<string, T>
          },
          async put(key, value) {
            assert.ok([RESERVE, OWNER_RESERVE_ADJUSTMENT_KEY].includes(key), 'Only the reserve and immutable adjustment audit may change')
            pending.set(key, structuredClone(value)); changed.push(key)
            if (faults.write === key) { faults.write = null; throw new Error('Synthetic post-write failure') }
          },
          async transaction() { throw new Error('No nested transactions') },
        }
        const result = await callback(tx)
        values.clear(); for (const [key, value] of pending) values.set(key, value)
        writes.push(...changed)
        if (faults.loseResponse) { faults.loseResponse = false; throw new Error('Synthetic lost acknowledgement') }
        return result
      })
      tail = next.catch(() => undefined); return next
    },
  }
  const call = (apply = false, account: unknown = OWNER, approved: OwnerReserveAdjustmentAuthority | null = authority, now = NOW) =>
    storage.transaction(tx => evaluateOwnerReserveAdjustment(tx, account, apply, approved, now))
  return { storage, values, writes, reads, faults, call }
}

test('preview is read-only; a single apply writes exactly 112 cents and immutable privacy-preserving audit', async () => {
  const f = fixture(), before = structuredClone(f.values)
  const preview = await f.call(); assert.equal(preview.status, 200)
  const projected = readOwnerReserveAdjustmentResponse(preview.body)
  assert.equal(projected.status, 'preview'); assert.equal(projected.appliedAt, null)
  assert.equal(projected.after.reserveCents - projected.before.reserveCents, 112)
  assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  const applied = await f.call(true)
  assert.equal(applied.status, 200); assert.equal(readOwnerReserveAdjustmentResponse(applied.body).status, 'applied')
  const audit = f.values.get(OWNER_RESERVE_ADJUSTMENT_KEY) as Record<string, unknown>
  assert.equal(audit.authorizationReferenceSha256, authority.authorizationReferenceSha256)
  assert.equal(audit.generationStarted, false); assert.equal(audit.appliedAt, NOW)
  assert.deepEqual(f.writes, [RESERVE, OWNER_RESERVE_ADJUSTMENT_KEY]); assert.equal(f.values.get(RESERVE), 175)
  for (const [key, value] of before) if (key !== RESERVE) assert.deepEqual(f.values.get(key), value, key)
  assert.doesNotMatch(JSON.stringify(audit), /cus_Synthetic|in_Synthetic|sub_Synthetic|aaaaaaaa-aaaa|privatePrompt/)
  assert.doesNotMatch(JSON.stringify(applied.body), /Sha256|cus_|in_|sub_|account|authorizationReference/)
})

test('repeated and concurrent attempts are one-use even after balance, billing and payment changes', async () => {
  const f = fixture()
  const results = await Promise.all(Array.from({ length: 20 }, () => f.call(true)))
  assert.equal(results.filter(result => result.status === 200 && result.body.status === 'applied').length, 1)
  assert.equal(results.filter(result => result.status === 200 && result.body.status === 'already-applied').length, 19)
  const saved = structuredClone(f.values.get(OWNER_RESERVE_ADJUSTMENT_KEY))
  f.values.set(RESERVE, 0); f.values.set('balance', 1190); f.values.set(HELD, 250); f.values.set('billingHold', true)
  f.values.set('customer', 'cus_Changed'); f.values.delete('grant:in_SyntheticCreator')
  const before = structuredClone(f.values)
  for (const apply of [false, true]) {
    const replay = await f.call(apply)
    assert.equal(replay.status, 200); assert.equal(readOwnerReserveAdjustmentResponse(replay.body).status, 'already-applied')
    assert.equal(readOwnerReserveAdjustmentResponse(replay.body).appliedAt, NOW)
  }
  assert.deepEqual(f.values, before); assert.deepEqual(f.values.get(OWNER_RESERVE_ADJUSTMENT_KEY), saved); assert.equal(f.writes.length, 2)
})

test('each write failure rolls back; an uncertain successful acknowledgement cannot duplicate the adjustment', async () => {
  for (const key of [RESERVE, OWNER_RESERVE_ADJUSTMENT_KEY]) {
    const f = fixture(), before = structuredClone(f.values); f.faults.write = key
    await assert.rejects(f.call(true), /post-write failure/)
    assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
    assert.equal((await f.call(true)).status, 200)
  }
  const f = fixture(); f.faults.loseResponse = true
  await assert.rejects(f.call(true), /lost acknowledgement/)
  assert.equal(readOwnerReserveAdjustmentResponse((await f.call(true)).body).status, 'already-applied')
  assert.equal(f.values.get(RESERVE), 175); assert.equal(f.writes.length, 2)
})

test('missing, changed or malformed baseline never reseeds or changes any ledger record', async () => {
  for (const extra of [
    { [RESERVE]: undefined }, { [RESERVE]: 62 }, { [RESERVE]: 64 }, { [RESERVE]: 175 }, { [RESERVE]: '63' },
    { balance: undefined }, { balance: 1439 }, { balance: 1441 }, { balance: '1440' },
    { [HELD]: 1 }, { [HELD]: -1 }, { [HELD]: null }, { [HELD]: '0' },
    { billingHold: true }, { billingHold: null }, { billingHold: 0 }, { billingHold: 'false' },
  ]) {
    const f = fixture(extra), before = structuredClone(f.values)
    for (const apply of [false, true]) assert.deepEqual(await f.call(apply), { status: 409, body: { error: 'Owner reserve adjustment cannot be applied.', code: 'BASELINE_CHANGED' } })
    assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  const f = fixture(); f.values.delete(HELD)
  assert.equal((await f.call()).status, 200, 'Absent held aggregate means effective zero, without writing a seed')
  assert.equal(f.values.has(HELD), false)
})

test('exact owner and customer plus both positive unreversed invoice grants are mandatory', async () => {
  for (const account of [OTHER, null, '', 123, {}, OWNER + ' ']) {
    const f = fixture(); assert.deepEqual(await f.call(true, account), { status: 403, body: { error: 'This adjustment is unavailable.' } })
    assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, [])
  }
  assert.equal((await fixture().call(false, OWNER.toUpperCase())).status, 200)
  for (const extra of [{ customer: undefined }, { customer: 'cus_Other' }, { customer: null },
    { 'grant:in_SyntheticCreator': undefined }, { 'grant:in_SyntheticPro': undefined },
    ...[null, {}, { credits: 0, revoked: 0 }, { credits: 1500, revoked: 1 }, { credits: 1500, revoked: -1 },
      { credits: 1500, revoked: 0 }, { credits: 1499, revoked: 0, subscriptionId: 'sub_SyntheticShared' },
      { credits: 1500, revoked: 0, subscriptionId: 'sub_Other' },
      { credits: '1500', revoked: 0 }, { credits: 1500, revoked: 0, extra: true }, { credits: 1500, revoked: 0, subscriptionId: 'not-a-subscription' }]
      .map(value => ({ 'grant:in_SyntheticCreator': value })),
  ]) {
    const f = fixture(extra), before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'PAYMENT_BINDING_INVALID')
    assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  for (const list of [[], {}, new Map(Array.from({ length: 64 }, (_, i) => [`grant:in_Fixture${i}`, { credits: 1, revoked: 0 }])), new Map([['wrong-key', {}]])]) {
    const f = fixture(); f.faults.list = list
    assert.equal(code(await f.call(true)), 'PAYMENT_BINDING_INVALID'); assert.deepEqual(f.writes, [])
  }
})

test('null/malformed authority and pre-approval time fail closed without touching storage', async () => {
  for (const approved of [null, {} as OwnerReserveAdjustmentAuthority, { ...authority, invoiceSha256: [authority.invoiceSha256[0], authority.invoiceSha256[0]] } as OwnerReserveAdjustmentAuthority,
    { ...authority, ownerAccountSha256: 'invalid' }, { ...authority, authorizationReferenceSha256: '' }, { ...authority, injected: true }]) {
    const f = fixture(); assert.equal((await f.call(true, OWNER, approved)).status, 403); assert.deepEqual(f.reads, [])
  }
  for (const now of [0, Date.parse('2026-10-07T06:29:59Z'), NaN, Infinity, NOW + 0.1]) {
    const f = fixture(); assert.equal((await f.call(true, OWNER, authority, now)).status, 403); assert.deepEqual(f.reads, [])
  }
})

test('corrupt applied marker is never overwritten or interpreted as a fresh approval', async () => {
  const source = fixture(); await source.call(true)
  const audit = source.values.get(OWNER_RESERVE_ADJUSTMENT_KEY) as Record<string, unknown>
  for (const marker of [null, false, {}, { ...audit, extra: true }, { ...audit, amountCents: 113 }, { ...audit, generationStarted: true },
    { ...audit, authorizationReferenceSha256: 'f'.repeat(64) }, { ...audit, ownerAccountSha256: digest(OTHER) }, { ...audit, stripeCustomerSha256: digest('cus_Other') },
    { ...audit, invoiceSha256: [...authority.invoiceSha256].reverse() }, { ...audit, subscriptionSha256: digest('sub_Other') }, { ...audit, before: { reserveCents: 62, points: 1440, heldPoints: 0 } },
    { ...audit, appliedAt: NOW + 1 }, { ...audit, appliedAt: 0 }, { ...audit, status: 'applied' },
  ]) {
    const f = fixture({ [OWNER_RESERVE_ADJUSTMENT_KEY]: marker }), before = structuredClone(f.values)
    for (const apply of [false, true]) assert.equal(code(await f.call(apply)), 'AUDIT_INVALID')
    assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
})

test('shared response reader refuses expanded, contradictory and coerced output', async () => {
  const f = fixture(), valid = (await f.call()).body
  for (const patch of [{ extra: true }, { status: ['preview'] }, { amountCents: '112' }, { amountCents: 113 }, { appliedAt: NOW },
    { generationStarted: true }, { approvalId: 'different' }, { after: { reserveCents: 176, points: 1440, heldPoints: 0 } },
    { before: { reserveCents: 63, points: 1440, heldPoints: 1 } }]) assert.throws(() => readOwnerReserveAdjustmentResponse({ ...valid, ...patch }))
  for (const value of [null, false, [], {}, { ...valid, status: 'applied', appliedAt: null }]) assert.throws(() => readOwnerReserveAdjustmentResponse(value))
})

test('public boundary requires ordinary verified cookie, same-origin access, strict method/query and rate protection', async () => {
  let calls = 0, ledgerCalls = 0
  const fetcher = (async (input, init) => {
    assert.equal(String(input), 'https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/user'); assert.equal(init?.method, 'GET'); calls++
    return Response.json({ id: OWNER })
  }) as typeof fetch
  const env = { ACCOUNT_LIMITER: { async limit({ key }: { key: string }) { assert.equal(key, `account:owner-reserve-adjustment:${OWNER}`); return { success: true } } },
    ACCOUNT_ENTITLEMENTS: { idFromName: (name: string) => name, get() { ledgerCalls++; throw new Error('No synthetic owner is approved in production') } } }
  const headers = { Cookie: '__Host-worldifact-access=synthetic-owner-token' }
  const cases: [Request, number][] = [
    [new Request(URL), 401], [new Request(URL, { headers: { Authorization: 'Bearer not-a-cookie' } }), 401],
    [new Request(URL, { method: 'DELETE' }), 405], [new Request(URL + '?accountId=' + OWNER, { headers }), 400],
    [new Request(URL, { headers: { ...headers, Origin: 'https://evil.test' } }), 403],
    [new Request(URL, { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } }), 403],
    [new Request(URL, { method: 'POST', headers, body: '{}' }), 403],
    [new Request(URL, { headers: { ...headers, 'X-WORLDIFACT-Verified-Account': OTHER } }), 403],
  ]
  for (const [request, status] of cases) {
    const result = await entitlementApi(request, env, fetcher)
    assert.equal(result?.status, status); assert.equal(result?.headers.get('Cache-Control'), 'private, no-store'); assert.equal(result?.headers.get('Vary'), 'Cookie')
    assert.doesNotMatch(await result!.text(), /112|1440|175|Sha256|approvalId/)
  }
  assert.equal(calls, 1); assert.equal(ledgerCalls, 0)
  for (const [limiter, status] of [[undefined, 503], [{ async limit() { return { success: false } } }, 429], [{ async limit() { throw new Error('private-limiter-error') } }, 503]] as const) {
    const result = await entitlementApi(new Request(URL, { headers }), { ...env, ACCOUNT_LIMITER: limiter }, fetcher)
    assert.equal(result?.status, status); assert.doesNotMatch(await result!.text(), /private-limiter-error/)
  }
})

test('internal request parser rejects extra amounts, identities, duplicates and malformed bodies before storage', async () => {
  const f = fixture()
  for (const body of ['{}', 'null', '[]', '{', JSON.stringify({ approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL, amountCents: 112 }),
    JSON.stringify({ approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL, accountId: OWNER }),
    `{"approvalId":"${OWNER_RESERVE_ADJUSTMENT_APPROVAL}","approvalId":"${OWNER_RESERVE_ADJUSTMENT_APPROVAL}"}`, ' '.repeat(257),
    '{"approvalId":"different"}', JSON.stringify({ approvalId: [OWNER_RESERVE_ADJUSTMENT_APPROVAL] })]) {
    const request = new Request('https://entitlements.internal/owner-reserve-adjustment', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Verified-Account': OWNER }, body })
    assert.equal((await ownerReserveAdjustmentLedgerRoute(request, f.storage, {}, true, NOW)).status, 400)
  }
  for (const contentType of ['', 'text/plain', 'application/json; charset=latin1']) {
    const request = new Request('https://entitlements.internal/owner-reserve-adjustment', { method: 'POST', headers: { 'Content-Type': contentType }, body: JSON.stringify({ approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL }) })
    assert.equal((await ownerReserveAdjustmentLedgerRoute(request, f.storage, {}, true, NOW)).status, 400)
  }
  assert.deepEqual(f.writes, []); assert.deepEqual(f.reads, [])
})

test('internal production route requires matching live account namespace and cannot be widened through env', async () => {
  const f = fixture(), namespace = { idFromName: (name: string) => name, get() { throw new Error('No network') } }
  for (const name of [undefined, 'account:sandbox:v1:' + OWNER, 'account:v1:' + OTHER, 'overnight-budget', 'account:v1:' + OWNER]) {
    const object = new AccountEntitlements({ storage: f.storage, ...(name ? { id: { toString: () => name } } : {}) }, {
      ACCOUNT_ENTITLEMENTS: namespace, WORLDIFACT_OWNER_RESERVE_ADJUSTMENT: JSON.stringify(authority), WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(authority),
    }, () => NOW)
    const result = await object.fetch(new Request('https://entitlements.internal/owner-reserve-adjustment', { headers: { 'X-WORLDIFACT-Verified-Account': OWNER } }))
    assert.equal(result.status, 403); assert.deepEqual(await result.json(), { error: 'This adjustment is unavailable.' })
  }
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, [])
  const source = await readFile(new globalThis.URL('../server/ownerReserveAdjustment.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /env\.WORLDIFACT_|\/grant|\/reserve|\/generate|fetcher\(/)
  assert.match(source, /storage\.transaction\(tx => evaluateOwnerReserveAdjustment/)
})
