import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { AccountEntitlements, entitlementApi, paidPointsJob, type EntitlementStorage } from '../server/entitlements.ts'
import { evaluateFailedHoldWaiver, failedHoldWaiverLedgerRoute, FAILED_HOLD_WAIVER_KEY, type FailedHoldWaiverAuthority } from '../server/failedHoldWaiver.ts'
import { paidPointsStorage, PAID_POINTS_JOB_PREFIX } from '../server/paidPointsStorage.ts'
import { FAILED_HOLD_WAIVER_APPROVAL, readFailedHoldWaiverResponse, requestFailedHoldWaiver } from '../src/lib/failedHoldWaiver.ts'
import { isPointSettlement } from '../src/lib/paidPointsFunding.ts'
import { NOW, OWNER, OTHER, HELD, RESERVE, IDS, authority, fixtureSeed, digest } from './fixtures/failed-hold-waiver.ts'
const URL = 'https://worldifact.test/api/account/failed-hold-waiver'
const allowedWrites = IDS.map(id => PAID_POINTS_JOB_PREFIX + id).concat(HELD, FAILED_HOLD_WAIVER_KEY)
function fixture() {
  let queue: Promise<unknown> = Promise.resolve()
  const values = new Map<string, any>(Object.entries(fixtureSeed())), writes: string[] = [], reads: string[] = []
  const faults = { key: '', lost: false }
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T },
    async put() { throw new Error('Only native transaction writes allowed') },
    transaction<T>(callback: (tx: EntitlementStorage) => Promise<T>): Promise<T> {
      const pending = queue.then(async () => {
        const draft = structuredClone(values), changes: string[] = []
        const tx: EntitlementStorage = {
          async get<T>(key: string) { reads.push(key); return structuredClone(draft.get(key)) as T },
          async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...draft].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T> },
          async put(key, value) { assert.ok(allowedWrites.includes(key)); draft.set(key, structuredClone(value)); changes.push(key); if (faults.key === key) { faults.key = ''; throw new Error('Post-write fault') } },
          async transaction() { throw new Error('No nested transaction') },
        }
        const result = await callback(tx)
        values.clear(); for (const [key, value] of draft) values.set(key, value)
        writes.push(...changes)
        if (faults.lost) { faults.lost = false; throw new Error('Lost acknowledgement') }
        return result
      })
      queue = pending.catch(() => {}); return pending
    },
  }
  const call = (apply = false, account: unknown = OWNER, approved: FailedHoldWaiverAuthority | null = authority, now = NOW) => storage.transaction(tx => evaluateFailedHoldWaiver(tx, account, apply, approved, now, paidPointsJob))
  return { values, writes, reads, faults, storage, call }
}
const code = (value: Awaited<ReturnType<typeof evaluateFailedHoldWaiver>>) => 'code' in value.body ? value.body.code : undefined

test('exact incident preview is read-only; application releases holds without changing balance, failures, terms or provider evidence', async () => {
  const f = fixture(), before = structuredClone(f.values)
  for (const id of IDS) assert.equal(paidPointsJob(f.values.get(PAID_POINTS_JOB_PREFIX + id), id), true)
  const preview = readFailedHoldWaiverResponse((await f.call()).body)
  assert.equal(preview.status, 'preview'); assert.equal(preview.appliedAt, null); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  const applied = readFailedHoldWaiverResponse((await f.call(true)).body)
  assert.equal(applied.status, 'applied'); assert.equal(applied.releasedPoints, 1000); assert.equal(applied.providerLiabilityCents, 324)
  assert.deepEqual(f.writes, allowedWrites)
  assert.equal(f.values.get('balance'), 1190); assert.equal(f.values.get(HELD), 0)
  assert.equal(f.values.get(RESERVE), before.get(RESERVE))
  for (const [key, value] of before) {
    if (key.startsWith(PAID_POINTS_JOB_PREFIX)) {
      assert.deepEqual(f.values.get(key), { ...value, pointSettlement: { version: 1, state: 'waived', heldPoints: 0, chargedPoints: 0, approvalId: FAILED_HOLD_WAIVER_APPROVAL } })
      assert.equal(paidPointsJob(f.values.get(key), key.slice(PAID_POINTS_JOB_PREFIX.length)), true)
    } else if (key !== HELD) assert.deepEqual(f.values.get(key), value, key)
  }
  const audit = f.values.get(FAILED_HOLD_WAIVER_KEY)
  assert.equal(audit.authorizationReferenceSha256, authority.authorizationReferenceSha256)
  assert.deepEqual(audit.jobs.map((job: any) => job.idSha256), authority.jobs.map(job => job.idSha256))
  assert.doesNotMatch(JSON.stringify(applied), /00000000|Sha256|prompt|cus_|sealId|authorization/)
  assert.doesNotMatch(JSON.stringify(audit), /Inert private fixture prompt|cus_Fixture|sealId/)
})

test('concurrent apply is one-use; replay after later spending cannot replenish balance or held aggregate', async () => {
  const f = fixture(), replies = await Promise.all([f.call(true), f.call(true)])
  assert.deepEqual(replies.map(reply => readFailedHoldWaiverResponse(reply.body).status).sort(), ['already-applied', 'applied'])
  f.values.set('balance', 440); f.values.set(HELD, 250); f.values.set('billingHold', true)
  const before = structuredClone(f.values)
  for (const apply of [false, true]) assert.equal(readFailedHoldWaiverResponse((await f.call(apply)).body).status, 'already-applied')
  assert.deepEqual(f.values, before); assert.equal(f.writes.length, 6)
})

test('all six post-write failures roll back atomically; lost acknowledgement is safely recoverable by read', async () => {
  for (const key of allowedWrites) {
    const f = fixture(), before = structuredClone(f.values); f.faults.key = key
    await assert.rejects(f.call(true), /Post-write/); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  const f = fixture(); f.faults.lost = true
  await assert.rejects(f.call(true), /Lost acknowledgement/)
  const before = structuredClone(f.values)
  assert.equal(readFailedHoldWaiverResponse((await f.call()).body).status, 'already-applied')
  assert.deepEqual(f.values, before)
})

test('wrong owner, malformed authority, stale balance and partial jobs fail before any writes', async () => {
  for (const owner of [null, OTHER, {}, '', OWNER + ' ']) {
    const f = fixture(); assert.equal((await f.call(true, owner)).status, 403); assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, [])
  }
  for (const approved of [null, {} as FailedHoldWaiverAuthority, { ...authority, jobs: authority.jobs.slice(1) }, { ...authority, jobs: Array(4).fill(authority.jobs[0]) }, { ...authority, extra: true }]) {
    const f = fixture(); assert.equal((await f.call(true, OWNER, approved)).status, 403); assert.deepEqual(f.reads, [])
  }
  for (const [key, value] of [['balance', 1189], ['balance', '1190'], [HELD, 999], [HELD, undefined], ['billingHold', true], ['billingHold', null]] as const) {
    const f = fixture(); f.values.set(key, value); const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'BASELINE_CHANGED'); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  for (const now of [0, NaN, NOW + 0.1]) assert.equal((await fixture().call(true, OWNER, authority, now)).status, 403)
  for (const id of IDS) {
    const f = fixture(); f.values.delete(PAID_POINTS_JOB_PREFIX + id); const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'JOB_BINDING_INVALID'); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
})

test('changed ID, timestamp, point price, completed/released state, receipt, liability or legacy fence fail closed', async () => {
  const mutations = [
    (job: any) => { job.at++ }, (job: any) => { job.state = 'completed' }, (job: any) => { job.cost = 249 },
    (job: any) => { job.pointSettlement = { version: 1, state: 'released', heldPoints: 0, chargedPoints: 0 } },
    (job: any) => { job.pointSettlement.state = 'waived'; job.pointSettlement.heldPoints = 0; job.pointSettlement.approvalId = FAILED_HOLD_WAIVER_APPROVAL },
    (job: any) => { job.providerLiability.state = 'unresolved' },
    (job: any) => { job.providerLiability.evidence.receipt.sealed = false },
    (job: any) => { job.providerLiability.evidence.receipt.jobId = IDS[1] },
    (job: any) => { job.providerLiability.maximumLiabilityCents = 82; job.providerLiability.evidence.receipt.maximumLiabilityMicroUsd = 820000 },
  ]
  for (const mutation of mutations) {
    const f = fixture(); mutation(f.values.get(PAID_POINTS_JOB_PREFIX + IDS[0])); const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'JOB_BINDING_INVALID'); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  for (const mode of ['id', 'fence', 'extra-hold']) {
    const f = fixture()
    if (mode === 'id') { const job = f.values.get(PAID_POINTS_JOB_PREFIX + IDS[0]); f.values.delete(PAID_POINTS_JOB_PREFIX + IDS[0]); f.values.set(PAID_POINTS_JOB_PREFIX + OTHER, job) }
    if (mode === 'fence') f.values.get('job:' + IDS[0]).state = 'reserved'
    if (mode === 'extra-hold') f.values.set('job:' + OTHER, { state: 'reserved', billingMode: 'hold-v1', kind: 'credits', cost: 1 })
    const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'JOB_BINDING_INVALID'); assert.deepEqual(f.values, before)
  }
})

test('corrupt audit or any post-waiver job change cannot be accepted, repaired or applied again', async () => {
  const good = fixture(); await good.call(true)
  const original = structuredClone(good.values), audit = original.get(FAILED_HOLD_WAIVER_KEY)
  for (const change of [null, {}, { ...audit, extra: true }, { ...audit, ownerAccountSha256: digest(OTHER) },
    { ...audit, authorizationReferenceSha256: 'f'.repeat(64) }, { ...audit, appliedAt: NOW + 1 }, { ...audit, releasedPoints: 1001 },
    { ...audit, jobs: [...audit.jobs].reverse() }, { ...audit, jobs: audit.jobs.slice(0, 3) },
  ]) {
    const f = fixture(); f.values.clear(); for (const [key, value] of structuredClone(original)) f.values.set(key, value)
    f.values.set(FAILED_HOLD_WAIVER_KEY, change); const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'AUDIT_INVALID'); assert.deepEqual(f.values, before); assert.deepEqual(f.writes, [])
  }
  for (const mode of ['missing', 'state', 'prompt', 'receipt', 'fence']) {
    const f = fixture(); await f.call(true); const job = f.values.get(PAID_POINTS_JOB_PREFIX + IDS[0])
    if (mode === 'missing') f.values.delete(PAID_POINTS_JOB_PREFIX + IDS[0])
    if (mode === 'state') job.pointSettlement = { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 }
    if (mode === 'prompt') job.prompt = 'Changed original terms'
    if (mode === 'receipt') job.providerLiability.evidence.receipt.sealId = 'f'.repeat(64)
    if (mode === 'fence') f.values.get('job:' + IDS[0]).updatedAt++
    const before = structuredClone(f.values)
    assert.equal(code(await f.call(true)), 'AUDIT_INVALID'); assert.deepEqual(f.values, before); assert.equal(f.writes.length, 6)
  }
})

test('waived settlement strictly requires its approval marker and immutable failed positive-liability job', async () => {
  const good = { version: 1, state: 'waived', heldPoints: 0, chargedPoints: 0, approvalId: FAILED_HOLD_WAIVER_APPROVAL }
  assert.equal(isPointSettlement(good, 250), true)
  for (const patch of [{ approvalId: undefined }, { approvalId: 'other' }, { heldPoints: 250 }, { chargedPoints: 250 }, { state: 'released' }, { extra: true }]) assert.equal(isPointSettlement({ ...good, ...patch }, 250), false)
  const f = fixture(), original = f.values.get(PAID_POINTS_JOB_PREFIX + IDS[0])
  const waived = { ...original, pointSettlement: good }
  assert.equal(paidPointsJob(waived, IDS[0]), true)
  for (const patch of [{ state: 'completed' }, { channel: 'blueprint' }, { providerLiability: { ...original.providerLiability, maximumLiabilityCents: 0 } }]) assert.equal(paidPointsJob({ ...waived, ...patch }, IDS[0]), false)
  f.values.set(PAID_POINTS_JOB_PREFIX + IDS[0], waived)
  await assert.rejects(paidPointsStorage(f.storage, paidPointsJob).get('job:' + IDS[0]), /Unverified failed-hold waiver/)
  await assert.rejects(paidPointsStorage(f.storage, paidPointsJob).put('job:' + IDS[0], waived), /immutable/)
})

test('public and ledger boundaries refuse wrong account, namespace, method, origin, queries and missing protection', async () => {
  let ledgerCalls = 0, authCalls = 0
  const fetcher = (async () => { authCalls++; return Response.json({ id: OWNER }) }) as typeof fetch
  const namespace = { idFromName: (name: string) => name, get() { ledgerCalls++; throw new Error('Synthetic owner is not production authority') } }
  const headers = { Cookie: '__Host-worldifact-access=synthetic-token' }
  const env = { ACCOUNT_ENTITLEMENTS: namespace, ACCOUNT_LIMITER: { async limit() { return { success: true } } } }
  for (const [request, status] of [
    [new Request(URL), 401], [new Request(URL, { method: 'DELETE' }), 405], [new Request(URL + '?account=' + OWNER), 400],
    [new Request(URL, { headers: { ...headers, Origin: 'https://evil.test' } }), 403],
    [new Request(URL, { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } }), 403],
    [new Request(URL, { method: 'POST', headers, body: '{}' }), 403],
    [new Request(URL, { headers: { ...headers, 'X-WORLDIFACT-Verified-Account': OTHER } }), 403],
  ] as const) {
    const result = await entitlementApi(request, env, fetcher)
    assert.equal(result?.status, status); assert.equal(result?.headers.get('Cache-Control'), 'private, no-store'); assert.equal(result?.headers.get('Vary'), 'Cookie')
    assert.doesNotMatch(await result!.text(), /1190|1000|324|Sha256|approvalId/)
  }
  assert.equal(authCalls, 1); assert.equal(ledgerCalls, 0)
  for (const [limiter, status] of [[undefined, 503], [{ async limit() { return { success: false } } }, 429]] as const) assert.equal((await entitlementApi(new Request(URL, { headers }), { ...env, ACCOUNT_LIMITER: limiter }, fetcher))?.status, status)
  const f = fixture()
  for (const name of [undefined, 'account:v1:' + OTHER, 'account:sandbox:v1:' + OWNER, 'account:v1:' + OWNER]) {
    const ledger = new AccountEntitlements({ storage: f.storage, ...(name ? { id: { toString: () => name } } : {}) }, { ACCOUNT_ENTITLEMENTS: namespace }, () => NOW)
    for (const path of ['/failed-hold-waiver', '/generation-v3/failed-hold-waiver']) assert.equal((await ledger.fetch(new Request('https://entitlements.internal' + path, { headers: { 'X-WORLDIFACT-Verified-Account': OWNER } }))).status, 403)
  }
  assert.deepEqual(f.writes, []); assert.deepEqual(f.reads, [])
})

test('strict apply parser rejects duplicate keys, client amounts/accounts/jobs and malformed bounded body', async () => {
  const f = fixture()
  for (const body of ['{}', 'null', '[]', '{', JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL, releasedPoints: 1000 }),
    JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL, account: OWNER }), JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL, jobs: IDS }),
    `{"approvalId":"${FAILED_HOLD_WAIVER_APPROVAL}","approvalId":"${FAILED_HOLD_WAIVER_APPROVAL}"}`, ' '.repeat(257), '{"approvalId":"other"}']) {
    assert.equal((await failedHoldWaiverLedgerRoute(new Request('https://entitlements.internal/generation-v3/failed-hold-waiver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), f.storage, {}, true, paidPointsJob, NOW)).status, 400)
  }
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, [])
  const source = await readFile(new globalThis.URL('../server/failedHoldWaiver.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /env\.WORLDIFACT_|fetcher\(|\/generate|\/grant|\/reserve/)
})

test('client validates exact public response and never retries an uncertain apply', async () => {
  const valid = (await fixture().call()).body
  for (const patch of [{ extra: true }, { providerLiabilityCents: 0 }, { preservesProviderLiability: false }, { releasedPoints: '1000' }, { appliedAt: NOW }, { generationStarted: true }, { after: { balance: 2190, held: 0, available: 2190 } }]) assert.throws(() => readFailedHoldWaiverResponse({ ...valid, ...patch }))
  let calls = 0
  const fetcher = (async (_url: unknown, init?: RequestInit) => { calls++; assert.equal(init?.method, 'POST'); assert.equal(init?.body, JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL })); throw new Error('Acknowledgement lost') }) as typeof fetch
  await assert.rejects(requestFailedHoldWaiver(true, new AbortController().signal, fetcher)); assert.equal(calls, 1)
  await assert.rejects(requestFailedHoldWaiver(true, new AbortController().signal, (async () => Response.json(valid)) as typeof fetch), /could not be verified/)
})
