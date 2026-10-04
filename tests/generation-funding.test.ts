import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serialize } from 'node:v8'
import { AccountEntitlements, entitlementApi, type EntitlementStorage } from '../server/entitlements.ts'
import { readGenerationFundingSnapshot, type GenerationFundingSnapshot } from '../src/lib/generationFunding.ts'
import { handle } from '../server/worker.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-04T18:00:00Z')
const budgetKey = 'provider-budget-cents:v1'
const heldKey = 'customer-reserved-credits:v1'
const url = 'https://worldifact.test/api/account/generation-funding'
const jobKey = (index: number) => `job:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const reservation = (state = 'reserved', amountCents = 175) => ({ version: 1, source: 'ordinary', state, amountCents })
const studio = (extra: Record<string, unknown> = {}) => ({ channel: 'studio', profile: 'slow', kind: 'credits', cost: 250, billingMode: 'hold-v1',
  fingerprint: 'a'.repeat(64), at: NOW - 1000, updatedAt: NOW, state: 'failed', studioDispatch: 'ready-v1', ...extra })
const blueprint = (extra: Record<string, unknown> = {}) => ({ channel: 'blueprint', profile: 'fast', kind: 'credits', cost: 50,
  fingerprint: 'b'.repeat(64), at: NOW - 1000, updatedAt: NOW, state: 'completed', ...extra })

function fixture(seed: Record<string, unknown> = {}, listOverride?: unknown) {
  const values = new Map(Object.entries(seed)), reads: string[] = [], listCalls: unknown[] = []
  let writes = 0, transactions = 0, insideTransaction = false
  const storage: EntitlementStorage & { delete(key: string): Promise<boolean> } = {
    async get<T>(key: string) { assert.equal(insideTransaction, true); reads.push(key); return structuredClone(values.get(key)) as T | undefined },
    async put() { writes++; throw new Error('A funding read attempted storage.put') },
    async delete() { writes++; throw new Error('A funding read attempted storage.delete') },
    async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      assert.equal(insideTransaction, true); listCalls.push(options)
      if (listOverride !== undefined) return listOverride as Map<string, T>
      return new Map([...values].filter(([key]) => key.startsWith(options.prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value)])) as Map<string, T>
    },
    async transaction<T>(callback: (store: EntitlementStorage) => Promise<T>) {
      transactions++; insideTransaction = true
      try { return await callback(storage) } finally { insideTransaction = false }
    },
  }
  const object = new AccountEntitlements({ storage }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW)
  const read = async () => {
    const before = serialize(values), response = await object.fetch(new Request('https://internal/generation-funding'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(writes, 0)
    assert.deepEqual(serialize(values), before, 'Every stored byte, including unrelated billing records, stays unchanged')
    return readGenerationFundingSnapshot(await response.json())
  }
  return { values, storage, object, read, reads, listCalls, writes: () => writes, transactions: () => transactions }
}

test('funding read preserves storage and distinguishes exact negative/zero pools from missing or invalid values', async () => {
  for (const amount of [-175, 0, 174, 175, 900]) {
    const f = fixture({ balance: 3000, [heldKey]: 250, [budgetKey]: amount, customer: 'cus_private', 'grant:in_private': { credits: 3000 } })
    const result = await f.read()
    assert.deepEqual(result.customerPoints, { status: 'known', balance: 3000, held: 250, available: 2750 })
    assert.deepEqual(result.providerBudget, { status: 'known', unreservedCents: amount, legacyDerivedFallbackCents: null })
    assert.deepEqual(result.ordinaryAstraMinimumCents, { blueprint: 175, unpricedDetailed: 175 })
    assert.equal(f.transactions(), 1)
    assert.deepEqual(f.listCalls, [{ prefix: 'job:', limit: 256 }])
    assert.deepEqual(f.reads, ['balance', heldKey, budgetKey, 'support-astra-once:v1', 'support-astra-supplemental:v1'])
    assert.doesNotMatch(JSON.stringify(result), /cus_private|in_private|subscription|admission|customer-reserved|provider-budget-cents/)
  }
  const missing = fixture({ balance: 3000 })
  assert.deepEqual((await missing.read()).providerBudget, { status: 'uninitialized', unreservedCents: null, legacyDerivedFallbackCents: 2100 })
  assert.equal(missing.values.has(budgetKey), false, 'A legacy fallback must never be seeded')
  assert.deepEqual((await fixture().read()).customerPoints, { status: 'known', balance: 0, held: 0, available: 0 })
  for (const invalid of [NaN, Infinity, null, '175', {}, Number.MAX_SAFE_INTEGER + 1])
    assert.deepEqual((await fixture({ [budgetKey]: invalid }).read()).providerBudget, { status: 'invalid', unreservedCents: null, legacyDerivedFallbackCents: null })
  const invalid = await fixture({ balance: 'private-value', [heldKey]: -2 }).read()
  assert.deepEqual(invalid.customerPoints, { status: 'invalid', balance: null, held: null, available: null })
  assert.equal(invalid.providerBudget.legacyDerivedFallbackCents, null)
})

test('funding evidence sums recognized ordinary markers and bound receipts without pricing historical unknowns', async () => {
  const receiptJobId = jobKey(5).slice(4)
  const receipt = { revision: 'worldifact-terminal-budget-v1', jobId: receiptJobId, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2',
    capMicroUsd: 1750000, maximumLiabilityMicroUsd: 100001, sealed: true, sealId: 'c'.repeat(64) }
  const f = fixture({ balance: 3000, [budgetKey]: 27,
    [jobKey(1)]: studio({ state: 'reserved', studioProviderReservation: reservation() }),
    [jobKey(2)]: studio({ studioProviderReservation: reservation('released') }),
    [jobKey(3)]: studio({ failureCode: 'STUDIO_ALLOWANCE_UNAVAILABLE' }),
    [jobKey(4)]: blueprint(),
    [jobKey(5)]: studio({ studioProviderReservation: reservation(), studioProviderReconciliation: { receipt, originalReservedCents: 175, retainedCents: 11, releasedCents: 164, at: NOW } }),
    [jobKey(6)]: studio({ supportApprovalId: OWNER }),
    [jobKey(7)]: blueprint({ blueprintProviderReconciliation: { retainedCents: 1, releasedCents: 999999 } }),
    [jobKey(8)]: blueprint({ state: 'reserved', blueprintDispatch: 'ready-v1', blueprintProviderReservation: reservation('reserved', 35) }),
    'support-astra-once:v1': { privateAccountId: OWNER, privateApproval: 'never-return' },
  })
  const result = await f.read()
  assert.deepEqual(result.jobs.states, { reserved: 2, completed: 2, failed: 4, unknown: 0 })
  assert.deepEqual(result.jobs.routes, { studio: 5, blueprint: 3, legacyBlueprint: 0, unknown: 0 })
  assert.deepEqual(result.jobs.evidence, { ordinaryTerminalStudioPending: 1, ordinaryCompletedBlueprintPending: 1, legacyReadyWithoutReservation: 1,
    legacyAllowanceRefusalCandidates: 1, supportGrantRecords: 1, markedReconciled: 2, unknown: 0 })
  assert.deepEqual(result.jobs.fundingEvidence, { unresolvedOrdinaryReservations: { records: 2, cents: 210 }, recordedPreDispatchReleases: { records: 1, cents: 175 },
    recordedStudioReconciliations: { records: 1, releasedCents: 164, retainedLiabilityCents: 11 }, unknownAmountRecords: 3 })
  assert.deepEqual(result.supportGrantClaims, { originalRecordPresent: true, supplementalRecordPresent: false })
  assert.equal(result.providerBudget.unreservedCents, 27, 'Historical sums never replace the actual current pool')
  assert.doesNotMatch(JSON.stringify(result), /never-return|999999|sealId|receipt|jobId|aaaaaaa|fingerprint/)
})

test('invalid markers and forged receipts remain unknown, with no false released or retained amount', async () => {
  const cases: Record<string, unknown>[] = [
    { studioProviderReservation: reservation('released', 350) },
    { studioProviderReservation: { ...reservation('released'), extra: true } },
    { state: 'completed', studioProviderReservation: reservation('released') },
    { studioDispatch: 'claimed-v1', studioDispatchUntil: NOW, studioProviderReservation: reservation('released') },
    { studioProviderReservation: null },
    { studioProviderReconciliation: { releasedCents: 175, retainedCents: 0 } },
    { cost: 251, studioProviderReservation: reservation() },
  ]
  for (const extra of cases) {
    const result = await fixture({ [jobKey(1)]: studio(extra) }).read()
    assert.deepEqual(result.jobs.fundingEvidence, { unresolvedOrdinaryReservations: { records: 0, cents: 0 }, recordedPreDispatchReleases: { records: 0, cents: 0 },
      recordedStudioReconciliations: { records: 0, releasedCents: 0, retainedLiabilityCents: 0 }, unknownAmountRecords: 1 })
  }
  for (const extra of [{ studioDispatchUntil: undefined }, { studioProviderReservation: undefined }, { studioProviderReconciliation: undefined }, { supportApprovalId: OWNER }, { state: 'completed' }, { failureCode: 'SUBMISSION_NOT_ACCEPTED' }]) {
    const result = await fixture({ [jobKey(1)]: studio({ failureCode: 'STUDIO_ALLOWANCE_UNAVAILABLE', ...extra }) }).read()
    assert.equal(result.jobs.evidence.legacyAllowanceRefusalCandidates, 0)
  }
  const older = studio({ failureCode: 'STUDIO_ALLOWANCE_UNAVAILABLE' }) as Record<string, unknown>
  delete older.studioDispatch
  assert.equal((await fixture({ [jobKey(1)]: older }).read()).jobs.evidence.legacyAllowanceRefusalCandidates, 1)
  const claimed = studio({ failureCode: 'STUDIO_ALLOWANCE_UNAVAILABLE', studioDispatch: 'claimed-v1', studioDispatchUntil: NOW })
  assert.equal((await fixture({ [jobKey(1)]: claimed }).read()).jobs.evidence.legacyAllowanceRefusalCandidates, 0)
})

test('job scanning is bounded, missing or malformed lists are explicit, and corrupt rows cannot disclose raw state', async () => {
  const seed = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [jobKey(index), studio({ prompt: 'secret-prompt-do-not-return' })]))
  const result = await fixture(seed).read()
  assert.equal(result.jobs.scanned, 256); assert.equal(result.jobs.partial, true); assert.equal(result.jobs.scanStatus, 'partial')
  assert.doesNotMatch(JSON.stringify(result), /secret-prompt|00000000/)
  const exact = await fixture(Object.fromEntries(Object.entries(seed).slice(0, 256))).read()
  assert.equal(exact.jobs.partial, true, 'A full page conservatively remains partial without reading row 257')
  assert.equal((await fixture({}, new Map(Object.entries(seed))).read()).jobs.scanned, 256, 'An oversized storage response cannot bypass the scan bound')
  const noList = fixture(); delete noList.storage.list
  assert.equal((await noList.read()).jobs.scanStatus, 'unavailable')
  const badMap = await fixture({ [budgetKey]: 29 }, { secret: 'raw-private-state' }).read()
  assert.equal(badMap.providerBudget.unreservedCents, 29); assert.equal(badMap.jobs.scanStatus, 'invalid'); assert.equal(badMap.jobs.partial, true)
  const malformed = await fixture({ [jobKey(1)]: null, [jobKey(2)]: ['secret-array'], [jobKey(3)]: studio({ privateProviderKey: 'secret-key' }),
    'job:private-non-uuid': studio(), [jobKey(4)]: studio({ model: '__proto__' }) }).read()
  assert.equal(malformed.jobs.evidence.unknown, 5)
  assert.doesNotMatch(JSON.stringify(malformed), /raw-private|secret-|privateProviderKey|__proto__/)
})

test('normal Worker route performs only the auth GET and owned read transaction with all other calls forbidden', async () => {
  const f = fixture({ balance: 900, [budgetKey]: 73, [jobKey(1)]: studio({ failureCode: 'STUDIO_ALLOWANCE_UNAVAILABLE' }) })
  const before = serialize(f.values), calls: string[] = [], requests: string[] = []
  const fetcher = (async (input, init) => {
    assert.equal(String(input), 'https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/user')
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); calls.push(String(input))
    return Response.json({ id: OWNER })
  }) as typeof fetch
  const env = { ACCOUNT_LIMITER: { async limit() { return { success: true } } }, ACCOUNT_ENTITLEMENTS: {
    idFromName(name: string) { assert.equal(name, `account:v1:${OWNER}`); return name }, get() { return { async fetch(request: Request) {
      assert.equal(request.method, 'GET'); assert.equal(request.url, 'https://entitlements.internal/generation-funding'); requests.push(request.url)
      return f.object.fetch(request)
    } } },
  } }
  const response = await handle(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-owner-token' } }), env, fetcher)
  assert.equal(response.status, 200)
  assert.equal(readGenerationFundingSnapshot(await response.json()).providerBudget.unreservedCents, 73)
  assert.equal(calls.length, 1); assert.equal(requests.length, 1); assert.equal(f.transactions(), 1); assert.equal(f.writes(), 0)
  assert.deepEqual(serialize(f.values), before)
})

test('public funding read uses verified ownership only, GET-only auth/internal calls, sandbox isolation and private caching', async () => {
  const own = fixture({ balance: 3000, [budgetKey]: 19 }), other = fixture({ balance: 9999, [budgetKey]: 8888 })
  const names: string[] = [], upstream: string[] = [], methods: string[] = [], limits: string[] = []
  const env = { ACCOUNT_LEDGER_MODE: 'sandbox', ACCOUNT_LIMITER: { async limit({ key }: { key: string }) { limits.push(key); return { success: true } } },
    ACCOUNT_ENTITLEMENTS: { idFromName(name: string) { names.push(name); return name }, get(id: unknown) { assert.equal(id, `account:sandbox:v1:${OWNER}`); return { async fetch(request: Request) {
      methods.push(request.method); assert.equal(new URL(request.url).pathname, '/generation-funding'); assert.equal(request.body, null)
      assert.equal(request.headers.get('X-WORLDIFACT-Verified-Account'), OWNER); return own.object.fetch(request)
    } } } } }
  const fetcher = (async (input, init) => { upstream.push(String(input)); assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); return Response.json({ id: OWNER }) }) as typeof fetch
  assert.equal((await entitlementApi(new Request(url, { headers: { 'X-WORLDIFACT-Verified-Account': OTHER } }), env, fetcher))?.status, 401)
  assert.deepEqual(upstream, []); assert.deepEqual(names, [])
  for (const query of [`?userId=${OTHER}`, `?accountId=${OTHER}`, '?cursor=private'])
    assert.equal((await entitlementApi(new Request(url + query), env, fetcher))?.status, 400)
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    const response = await entitlementApi(new Request(url, { method }), env, fetcher)
    assert.equal(response?.status, 405); assert.equal(response?.headers.get('allow'), 'GET')
    assert.equal((await own.object.fetch(new Request('https://internal/generation-funding', { method }))).status, 405)
  }
  assert.equal(own.transactions(), 0)
  const response = await entitlementApi(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-owner-token', 'X-WORLDIFACT-Verified-Account': OTHER,
    'X-WORLDIFACT-Support-Available': 'true', 'X-WORLDIFACT-Support-Approval': 'forged' } }), env, fetcher)
  assert.equal(response?.status, 200); assert.equal(response?.headers.get('cache-control'), 'private, no-store'); assert.equal(response?.headers.get('vary'), 'Cookie')
  assert.equal(readGenerationFundingSnapshot(await response!.json()).providerBudget.unreservedCents, 19)
  assert.deepEqual(names, [`account:sandbox:v1:${OWNER}`]); assert.deepEqual(methods, ['GET']); assert.deepEqual(limits, [`account:generation-funding:${OWNER}`])
  assert.equal(upstream.length, 1); assert.match(upstream[0], /\/auth\/v1\/user$/)
  assert.equal(other.transactions(), 0); assert.equal(own.writes(), 0)
})

test('funding read fails closed for rate/auth/storage errors and never forwards raw error text', async () => {
  let objects = 0
  const headers = { Cookie: '__Host-worldifact-access=synthetic-owner-token' }
  const fetcher = (async () => Response.json({ id: OWNER })) as typeof fetch
  const namespace = { idFromName: (name: string) => name, get() { objects++; throw new Error('secret-storage-error') } }
  for (const [limiter, status] of [[undefined, 503], [{ async limit() { return { success: false } } }, 429], [{ async limit() { throw new Error('secret-limiter-error') } }, 503]] as const) {
    const response = await entitlementApi(new Request(url, { headers }), { ACCOUNT_ENTITLEMENTS: namespace, ACCOUNT_LIMITER: limiter }, fetcher)
    assert.equal(response?.status, status); assert.doesNotMatch(await response!.text(), /secret-/)
  }
  assert.equal(objects, 0)
  const env = { ACCOUNT_ENTITLEMENTS: namespace, ACCOUNT_LIMITER: { async limit() { return { success: true } } } }
  const response = await entitlementApi(new Request(url, { headers }), env, fetcher)
  assert.equal(response?.status, 503); assert.doesNotMatch(await response!.text(), /secret-/)
  for (const extra of [{ 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.test' }])
    assert.equal((await entitlementApi(new Request(url, { headers: { ...headers, ...extra } }), env, fetcher))?.status, 403)
})

test('the shared reader rejects expanded, unbounded or inconsistent snapshots', async () => {
  const valid = await fixture({ balance: 3000, [budgetKey]: 14 }).read()
  const invalid: ((snapshot: GenerationFundingSnapshot & Record<string, unknown>) => void)[] = [
    snapshot => { snapshot.rawReceipt = { secret: 'private' } },
    snapshot => { snapshot.providerBudget.unreservedCents = Infinity },
    snapshot => { snapshot.providerBudget.status = 'uninitialized' },
    snapshot => { snapshot.providerBudget.status = ['known'] as unknown as 'known' },
    snapshot => { snapshot.customerPoints.status = ['known'] as unknown as 'known' },
    snapshot => { snapshot.jobs.scanStatus = ['complete'] as unknown as 'complete' },
    snapshot => { snapshot.jobs.scanned = 257 },
    snapshot => { snapshot.jobs.partial = true },
    snapshot => { snapshot.jobs.states.completed = 1 },
    snapshot => { snapshot.customerPoints.available = 0 },
    snapshot => { snapshot.jobs.fundingEvidence.unresolvedOrdinaryReservations.cents = 175 },
  ]
  for (const mutate of invalid) {
    const snapshot = structuredClone(valid) as GenerationFundingSnapshot & Record<string, unknown>; mutate(snapshot)
    assert.throws(() => readGenerationFundingSnapshot(snapshot), /unrecognized snapshot/)
  }
})
