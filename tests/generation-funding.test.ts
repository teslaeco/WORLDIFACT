import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serialize } from 'node:v8'
import { AccountEntitlements, entitlementApi, type EntitlementStorage } from '../server/entitlements.ts'
import { readGenerationFundingSnapshot, readGenerationFundingEvidenceQuery, isStoredInvoiceReference, type GenerationFundingSnapshot } from '../src/lib/generationFunding.ts'
import { handle } from '../server/worker.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'

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

test('funded Creator, Pro and Studio all admit Astra without a retired monthly counter or new-sale requirement', async () => {
  for (const plan of ['creator', 'pro', 'studio']) {
    const f = fixture({ balance: 500, [budgetKey]: 175,
      subscription: { id: 'sub_PaidFixture', active: true, plan, until: NOW + 86400000, revision: 1, grantId: 'in_PaidFixture' },
      'creator-astra:in_PaidFixture': 6,
      usage: { fast: [], slow: [{ id: 'old-one', at: NOW }, { id: 'old-two', at: NOW }, { id: 'old-three', at: NOW }] },
    })
    const before = serialize(f.values)
    const readStatus = async () => (await (await f.object.fetch(new Request('https://internal/status'))).json()) as Record<string, any>
    const funded = await readStatus()
    assert.equal(funded.subscription.plan, plan)
    assert.equal(funded.generationAdmission.astra.allowed, true)
    assert.equal(funded.studioAdmission.allowed, true)
    assert.equal(funded.creatorAstra.remaining, null)
    assert.equal(funded.creatorAstra.maximum, null)
    assert.equal(quoteGeneration('astra', funded, { plans: { pro: { checkoutReady: false }, studio: { checkoutReady: false } } }, true, true).state, 'credits')
    assert.deepEqual(serialize(f.values), before)
    assert.equal(f.values.get('creator-astra:in_PaidFixture'), 6)
    f.values.set(budgetKey, 63)
    const unfunded = await readStatus()
    assert.equal(unfunded.generationAdmission.astra.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(quoteGeneration('astra', unfunded, null, true, true).reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(f.writes(), 0)
  }
})

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
  const read = async (query = '') => {
    const before = serialize(values), response = await object.fetch(new Request(`https://internal/generation-funding${query}`))
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

const storedQuery = '?evidence=stored-v1'

test('stored evidence is opt-in, reads only bounded owned records and leaves the default response bytes unchanged', async () => {
  const f = fixture({ balance: 1440, [budgetKey]: 63, customer: 'cus_SyntheticPrivate',
    'grant:in_SyntheticCreator': { credits: 1500, revoked: 0, subscriptionId: 'sub_SyntheticOldPlan' },
    'grant:in_SyntheticPro': { credits: 3000, revoked: 0, subscriptionId: 'sub_SyntheticCurrentPlan' },
    'grant:in_SyntheticReversed': { credits: 1500, revoked: 1500 },
    'grant:in_SyntheticTombstone': { credits: 0, revoked: 1500 },
    'grant:pi_SyntheticTopup': { credits: 1000, revoked: 0 },
    subscription: { id: 'sub_SyntheticCurrentPlan', plan: 'pro', active: true },
    [jobKey(1)]: studio({ prompt: 'synthetic-private-prompt' }),
  })
  const original = JSON.stringify(await f.read())
  const result = await f.read(`${storedQuery}&invoice=in_SyntheticCreator&invoice=in_SyntheticMissing`)
  const { storedEvidence, ...withoutEvidence } = result
  assert.equal(JSON.stringify(withoutEvidence), original)
  assert.equal(JSON.stringify(await f.read()), original, 'Repeated opt-in reads cannot alter old consumers or seed funding')
  assert.deepEqual(storedEvidence?.invoiceGrants, { scanLimit: 64, scanned: 4, partial: false, scanStatus: 'complete',
    states: { present: 2, revoked: 2, unverifiable: 0 }, creditedPoints: 6000, revokedPoints: 3000 })
  assert.deepEqual(storedEvidence?.requestedInvoices, [
    { invoiceReference: 'in_SyntheticCreator', state: 'present', reason: null, creditedPoints: 1500, revokedPoints: 0, subscriptionLinked: true },
    { invoiceReference: 'in_SyntheticMissing', state: 'missing', reason: null, creditedPoints: null, revokedPoints: null, subscriptionLinked: false },
  ])
  assert.equal(storedEvidence?.stripeCustomerLinked, true); assert.equal(storedEvidence?.stripeCustomerStatus, 'known')
  assert.equal(storedEvidence?.source, 'stored-credit-records')
  assert.equal(result.customerPoints.balance, 1440); assert.equal(result.providerBudget.unreservedCents, 63)
  assert.deepEqual(f.listCalls, [{ prefix: 'job:', limit: 256 }, { prefix: 'grant:in_', limit: 64 }, { prefix: 'job:', limit: 256 }, { prefix: 'job:', limit: 256 }])
  assert.deepEqual(f.reads.slice(5, 13), ['balance', heldKey, budgetKey, 'support-astra-once:v1', 'support-astra-supplemental:v1', 'customer', 'grant:in_SyntheticCreator', 'grant:in_SyntheticMissing'])
  assert.doesNotMatch(JSON.stringify(result), /cus_SyntheticPrivate|in_SyntheticPro|in_SyntheticReversed|in_SyntheticTombstone|pi_SyntheticTopup|sub_Synthetic|synthetic-private-prompt|subscriptionId|jobId|receipt/)
  assert.equal(f.writes(), 0)
})

test('requested invoice reads distinguish absent records, reversal tombstones, invalid records and unavailable reads', async () => {
  for (const [raw, expected] of [
    [{ credits: 250, revoked: 0 }, { state: 'present', reason: null, creditedPoints: 250, revokedPoints: 0, subscriptionLinked: false }],
    [{ credits: 250, revoked: 125 }, { state: 'revoked', reason: null, creditedPoints: 250, revokedPoints: 125, subscriptionLinked: false }],
    [{ credits: 0, revoked: 3000 }, { state: 'revoked', reason: null, creditedPoints: 0, revokedPoints: 3000, subscriptionLinked: false }],
    [undefined, { state: 'missing', reason: null, creditedPoints: null, revokedPoints: null, subscriptionLinked: false }],
  ] as const) {
    const f = fixture(raw === undefined ? {} : { 'grant:in_SyntheticLookup': raw })
    assert.deepEqual((await f.read(`${storedQuery}&invoice=in_SyntheticLookup`)).storedEvidence?.requestedInvoices,
      [{ invoiceReference: 'in_SyntheticLookup', ...expected }])
  }
  const malformed = [null, false, [], 'private-raw-grant', {}, { credits: 1500 }, { credits: 1500, revoked: -1 },
    { credits: '1500', revoked: 0 }, { credits: 0, revoked: 0 }, { credits: 1500, revoked: 1501 },
    { credits: 1_000_001, revoked: 0 }, { credits: 0, revoked: 1_000_001 }, { credits: Infinity, revoked: 0 },
    { credits: 1500, revoked: 0, subscriptionId: undefined }, { credits: 1500, revoked: 0, subscriptionId: 'cus_SyntheticWrongType' },
    { credits: 1500, revoked: 0, subscriptionId: `sub_${'a'.repeat(181)}` }, { credits: 1500, revoked: 0, secret: 'private-field' }]
  for (const raw of malformed) {
    const result = await fixture({ 'grant:in_SyntheticLookup': raw }).read(`${storedQuery}&invoice=in_SyntheticLookup`)
    assert.deepEqual(result.storedEvidence?.requestedInvoices, [{ invoiceReference: 'in_SyntheticLookup', state: 'unverifiable',
      reason: 'invalid-record', creditedPoints: null, revokedPoints: null, subscriptionLinked: false }])
    assert.deepEqual(result.storedEvidence?.invoiceGrants.states, { present: 0, revoked: 0, unverifiable: 1 })
    assert.equal(result.storedEvidence?.invoiceGrants.creditedPoints, 0)
    assert.doesNotMatch(JSON.stringify(result), /private-raw|private-field|cus_SyntheticWrongType/)
  }
  const unavailable = fixture(), get = unavailable.storage.get
  unavailable.storage.get = async <T>(key: string) => { if (key === 'grant:in_SyntheticLookup') throw new Error('private-lookup-failure'); return get<T>(key) }
  const result = await unavailable.read(`${storedQuery}&invoice=in_SyntheticLookup&invoice=in_SyntheticAbsent`)
  assert.deepEqual(result.storedEvidence?.requestedInvoices, [
    { invoiceReference: 'in_SyntheticLookup', state: 'unverifiable', reason: 'unavailable', creditedPoints: null, revokedPoints: null, subscriptionLinked: false },
    { invoiceReference: 'in_SyntheticAbsent', state: 'missing', reason: null, creditedPoints: null, revokedPoints: null, subscriptionLinked: false },
  ])
  assert.doesNotMatch(JSON.stringify(result), /private-lookup/)
})

test('invoice scans stop at 64 without listing identifiers; exact requested references remain independently verifiable', async () => {
  const rows = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`grant:in_Synthetic${String(index).padStart(3, '0')}`, { credits: 10, revoked: 0 }]))
  const f = fixture(rows)
  const result = await f.read(`${storedQuery}&invoice=in_Synthetic069`)
  assert.deepEqual(result.storedEvidence?.invoiceGrants, { scanLimit: 64, scanned: 64, partial: true, scanStatus: 'partial',
    states: { present: 64, revoked: 0, unverifiable: 0 }, creditedPoints: 640, revokedPoints: 0 })
  assert.equal(result.storedEvidence?.requestedInvoices[0].state, 'present', 'A reference outside the truncated scan is read directly')
  assert.equal(JSON.stringify(result).match(/in_Synthetic\d+/g)?.length, 1, 'No discovered invoice IDs are returned')
  assert.deepEqual(f.listCalls, [{ prefix: 'grant:in_', limit: 64 }, { prefix: 'job:', limit: 256 }])
  const exactly = fixture(Object.fromEntries(Object.entries(rows).slice(0, 64)))
  assert.equal((await exactly.read(storedQuery)).storedEvidence?.invoiceGrants.partial, true)
  const oversized = fixture(), list = oversized.storage.list!
  oversized.storage.list = async <T>(options: { prefix: string; limit: number }) => options.prefix === 'grant:in_' ? new Map(Object.entries(rows)) as Map<string, T> : list<T>(options)
  assert.equal((await oversized.read(storedQuery)).storedEvidence?.invoiceGrants.scanned, 64)
  const wrongKeys = fixture(), wrongList = wrongKeys.storage.list!
  wrongKeys.storage.list = async <T>(options: { prefix: string; limit: number }) => options.prefix === 'grant:in_' ? new Map([
    ['grant:pi_SyntheticForeignType', { credits: 1500, revoked: 0 }], ['grant:in_Synthetic_invalid', { credits: 1500, revoked: 0 }],
    [`grant:in_${'a'.repeat(181)}`, { credits: 1500, revoked: 0 }],
  ]) as Map<string, T> : wrongList<T>(options)
  assert.deepEqual((await wrongKeys.read(storedQuery)).storedEvidence?.invoiceGrants.states, { present: 0, revoked: 0, unverifiable: 3 })
})

test('unavailable or invalid optional scans and customer linkage never masquerade as complete absence', async () => {
  const noList = fixture({ 'grant:in_SyntheticPresent': { credits: 5, revoked: 0 } }); delete noList.storage.list
  const direct = await noList.read(`${storedQuery}&invoice=in_SyntheticPresent`)
  assert.equal(direct.storedEvidence?.invoiceGrants.scanStatus, 'unavailable')
  assert.equal(direct.storedEvidence?.requestedInvoices[0].state, 'present')
  for (const malformed of [{ raw: 'private-list' }, undefined]) {
    const f = fixture(), originalList = f.storage.list!
    f.storage.list = async <T>(options: { prefix: string; limit: number }) => {
      if (options.prefix === 'grant:in_') {
        if (malformed === undefined) throw new Error('private-list-failure')
        return malformed as unknown as Map<string, T>
      }
      return originalList<T>(options)
    }
    const result = await f.read(storedQuery)
    assert.equal(result.storedEvidence?.invoiceGrants.scanStatus, malformed === undefined ? 'unavailable' : 'invalid')
    assert.equal(result.storedEvidence?.invoiceGrants.partial, true)
    assert.equal(result.jobs.scanStatus, 'complete')
    assert.doesNotMatch(JSON.stringify(result), /private-list/)
  }
  for (const customer of [undefined, null, {}, '', 'cus_Synthetic_bad', `cus_${'a'.repeat(181)}`, 'sub_SyntheticWrongType']) {
    const result = await fixture(customer === undefined ? {} : { customer }).read(storedQuery)
    assert.equal(result.storedEvidence?.stripeCustomerLinked, false)
    assert.equal(result.storedEvidence?.stripeCustomerStatus, customer === undefined ? 'known' : 'invalid')
  }
  const failed = fixture(), get = failed.storage.get
  failed.storage.get = async <T>(key: string) => { if (key === 'customer') throw new Error('private-customer-failure'); return get<T>(key) }
  const failedResult = await failed.read(storedQuery)
  assert.equal(failedResult.storedEvidence?.stripeCustomerLinked, false)
  assert.equal(failedResult.storedEvidence?.stripeCustomerStatus, 'unavailable')
  const jobsUnavailable = fixture(), originalList = jobsUnavailable.storage.list!
  jobsUnavailable.storage.list = async <T>(options: { prefix: string; limit: number }) => {
    if (options.prefix === 'job:') throw new Error('private-job-scan-failure')
    return originalList<T>(options)
  }
  assert.equal((await jobsUnavailable.read(storedQuery)).jobs.scanStatus, 'unavailable')
})

test('unknown amount provenance groups only recognized metadata and never infers missing models or provider costs', async () => {
  const legacy = blueprint({ model: 'sol', cost: 20 }) as Record<string, unknown>; delete legacy.channel
  const f = fixture({
    [jobKey(1)]: studio({ model: 'astra', at: NOW - 3000, cost: 250 }),
    [jobKey(2)]: studio({ model: 'astra', at: NOW - 2000, cost: 275 }),
    [jobKey(3)]: studio({ cost: 250, prompt: 'synthetic-private-unknown-prompt' }),
    [jobKey(4)]: blueprint({ model: 'sol', cost: 50 }), [jobKey(5)]: legacy,
    [jobKey(6)]: null, [jobKey(7)]: studio({ model: 'unrecognized-model' }),
    [jobKey(8)]: studio({ cost: 1_000_001 }), [jobKey(9)]: studio({ at: NOW + 1000, updatedAt: NOW + 1000 }),
    [jobKey(10)]: studio({ supportApprovalId: OWNER }), [jobKey(11)]: blueprint({ kind: 'free', cost: 0 }),
    [jobKey(12)]: studio({ privateReceipt: { amount: 999999 } }), [jobKey(13)]: studio({ updatedAt: NOW + 1000 }),
    [jobKey(14)]: studio({ studioProviderReservation: reservation() }),
  })
  const result = await f.read(storedQuery), provenance = result.storedEvidence!.unknownAmountProvenance
  assert.equal(result.jobs.fundingEvidence.unknownAmountRecords, 11)
  assert.deepEqual(provenance, { records: 11, classifiedRecords: 5, unclassifiedRecords: 6, groups: [
    { route: 'studio', model: 'astra', state: 'failed', records: 2, recordedPointCosts: 525, earliestAt: NOW - 3000, latestAt: NOW - 2000 },
    { route: 'studio', model: 'unknown', state: 'failed', records: 1, recordedPointCosts: 250, earliestAt: NOW - 1000, latestAt: NOW - 1000 },
    { route: 'blueprint', model: 'sol', state: 'completed', records: 1, recordedPointCosts: 50, earliestAt: NOW - 1000, latestAt: NOW - 1000 },
    { route: 'legacyBlueprint', model: 'sol', state: 'completed', records: 1, recordedPointCosts: 20, earliestAt: NOW - 1000, latestAt: NOW - 1000 },
  ] })
  assert.deepEqual(f.listCalls, [{ prefix: 'grant:in_', limit: 64 }, { prefix: 'job:', limit: 256 }], 'Provenance reuses the existing job scan')
  assert.doesNotMatch(JSON.stringify(provenance), /cents|spend|refund|receipt|jobId|00000000|prompt|fingerprint|unrecognized-model/)
  assert.equal(result.jobs.fundingEvidence.unresolvedOrdinaryReservations.cents, 175)
  const capped = await fixture(Object.fromEntries(Array.from({ length: 300 }, (_, index) => [jobKey(index), studio()]))).read(storedQuery)
  assert.equal(capped.storedEvidence?.unknownAmountProvenance.records, 256)
  assert.equal(capped.storedEvidence?.unknownAmountProvenance.groups[0].records, 256)
  assert.equal(capped.jobs.partial, true)
})

test('public evidence requests use only the verified session account and never consult the account owning a submitted reference', async () => {
  const own = fixture({ balance: 100, customer: 'cus_SyntheticOwner', 'grant:in_SyntheticOwned': { credits: 100, revoked: 0 } })
  const other = fixture({ balance: 9999, customer: 'cus_SyntheticOther', 'grant:in_SyntheticOther': { credits: 9999, revoked: 0 } })
  const names: string[] = [], requests: Request[] = [], limits: string[] = [], calls: string[] = []
  const env = { ACCOUNT_LEDGER_MODE: 'sandbox', ACCOUNT_LIMITER: { async limit({ key }: { key: string }) { limits.push(key); return { success: true } } },
    ACCOUNT_ENTITLEMENTS: { idFromName(name: string) { names.push(name); return name }, get(id: unknown) {
      assert.equal(id, `account:sandbox:v1:${OWNER}`)
      return { async fetch(request: Request) { requests.push(request); return own.object.fetch(request) } }
    } } }
  const fetcher = (async (input, init) => {
    assert.equal(String(input), 'https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/user')
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); calls.push(String(input)); return Response.json({ id: OWNER })
  }) as typeof fetch
  const headers = { Cookie: '__Host-worldifact-access=synthetic-owner-token', 'X-WORLDIFACT-Verified-Account': OTHER }
  const response = await handle(new Request(`${url}${storedQuery}&invoice=in_SyntheticOwned&invoice=in_SyntheticOther`, { headers }), env, fetcher)
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie')
  const result = readGenerationFundingSnapshot(await response.json())
  assert.equal(result.storedEvidence?.requestedInvoices[0].state, 'present')
  assert.equal(result.storedEvidence?.requestedInvoices[1].state, 'missing', 'Foreign reference possession reveals only absence from the signed-in account')
  assert.equal(result.storedEvidence?.invoiceGrants.scanned, 1)
  assert.deepEqual(names, [`account:sandbox:v1:${OWNER}`]); assert.deepEqual(limits, [`account:generation-funding:${OWNER}`])
  assert.equal(requests.length, 1); assert.equal(calls.length, 1)
  assert.equal(requests[0].url, `https://entitlements.internal/generation-funding${storedQuery}&invoice=in_SyntheticOwned&invoice=in_SyntheticOther`)
  assert.equal(requests[0].method, 'GET'); assert.equal(requests[0].body, null)
  assert.equal(requests[0].headers.get('X-WORLDIFACT-Verified-Account'), OWNER)
  assert.deepEqual([...requests[0].headers.keys()], ['x-worldifact-verified-account'])
  assert.equal(own.writes(), 0); assert.equal(other.transactions(), 0); assert.equal(other.writes(), 0)
  assert.doesNotMatch(JSON.stringify(result), /cus_Synthetic|9999/)
})

test('stored-evidence query validation rejects expanded, duplicate, malformed and oversized requests before account access', async () => {
  const f = fixture(), calls: string[] = []
  const fetcher = (async (input) => { calls.push(String(input)); throw new Error('Authentication should not be contacted') }) as typeof fetch
  const invalid = ['?evidence=', '?evidence=stored-v2', '?evidence=stored-v1&evidence=stored-v1', '?invoice=in_SyntheticOne',
    `${storedQuery}&invoice=`, `${storedQuery}&invoice=pi_SyntheticWrongType`, `${storedQuery}&invoice=IN_SyntheticWrongPrefix`,
    `${storedQuery}&invoice=in_Synthetic_bad`, `${storedQuery}&invoice=in_Synthetic%20Bad`, `${storedQuery}&invoice=in_%2Fprivate`,
    `${storedQuery}&invoice=in_${'a'.repeat(181)}`, `${storedQuery}&invoice=in_SyntheticOne&invoice=in_SyntheticOne`,
    `${storedQuery}&invoice=in_SyntheticOne&invoice=in_SyntheticTwo&invoice=in_SyntheticThree`,
    `${storedQuery}&accountId=${OTHER}`, `${storedQuery}&userId=${OTHER}`, `${storedQuery}&key=grant:in_SyntheticOther`,
    `${storedQuery}&cursor=secret`, `${storedQuery}&limit=1000`, `${storedQuery}&__proto__=polluted`]
  for (const query of invalid) {
    assert.throws(() => readGenerationFundingEvidenceQuery(new URLSearchParams(query)), /Invalid stored evidence query/)
    assert.equal((await entitlementApi(new Request(url + query, { headers: { Cookie: '__Host-worldifact-access=synthetic-token' } }), {}, fetcher))?.status, 400)
    assert.equal((await f.object.fetch(new Request(`https://internal/generation-funding${query}`))).status, 400)
  }
  assert.deepEqual(calls, []); assert.equal(f.transactions(), 0); assert.deepEqual(f.reads, []); assert.equal(f.writes(), 0)
  assert.deepEqual(readGenerationFundingEvidenceQuery(new URLSearchParams('evidence=stored-v1&invoice=in_A&invoice=in_B')), { invoices: ['in_A', 'in_B'] })
  assert.equal(readGenerationFundingEvidenceQuery(new URLSearchParams()), null)
  assert.equal(isStoredInvoiceReference(`in_${'a'.repeat(180)}`), true)
  assert.equal(isStoredInvoiceReference(['in_Synthetic']), false)
  assert.equal((await entitlementApi(new Request('https://worldifact.test/api/overnight-tests/status?evidence=stored-v1'), {}, fetcher))?.status, 400)
})

test('opt-in evidence preserves auth, origin, method and rate-limit protections without reaching stored records', async () => {
  const f = fixture(), calls: string[] = []
  const fetcher = (async (input) => { calls.push(String(input)); return Response.json({ id: OWNER }) }) as typeof fetch
  const env = { ACCOUNT_ENTITLEMENTS: { idFromName(name: string) { return name }, get() { throw new Error('No ledger read is permitted') } },
    ACCOUNT_LIMITER: { async limit() { return { success: false } } } }
  const headers = { Cookie: '__Host-worldifact-access=synthetic-token' }, requestUrl = `${url}${storedQuery}&invoice=in_SyntheticOne`
  assert.equal((await entitlementApi(new Request(requestUrl), env, fetcher))?.status, 401)
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    assert.equal((await entitlementApi(new Request(requestUrl, { method, headers }), env, fetcher))?.status, 405)
    assert.equal((await f.object.fetch(new Request(`https://internal/generation-funding${storedQuery}`, { method }))).status, 405)
  }
  for (const extra of [{ Origin: 'https://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }])
    assert.equal((await entitlementApi(new Request(requestUrl, { headers: { ...headers, ...extra } }), env, fetcher))?.status, 403)
  assert.deepEqual(calls, [])
  assert.equal((await entitlementApi(new Request(requestUrl, { headers }), env, fetcher))?.status, 429)
  assert.equal((await entitlementApi(new Request(requestUrl, { headers }), { ACCOUNT_ENTITLEMENTS: env.ACCOUNT_ENTITLEMENTS }, fetcher))?.status, 503)
  assert.equal(f.transactions(), 0); assert.equal(f.writes(), 0)
})

test('the stored-evidence reader rejects extra identifiers and inconsistent or unbounded summaries', async () => {
  const result = await fixture({ customer: 'cus_SyntheticOwner', 'grant:in_SyntheticOne': { credits: 1500, revoked: 0, subscriptionId: 'sub_SyntheticPlan' },
    [jobKey(1)]: studio(), [jobKey(2)]: null }).read(`${storedQuery}&invoice=in_SyntheticOne&invoice=in_SyntheticMissing`)
  const mutations: ((value: NonNullable<GenerationFundingSnapshot['storedEvidence']> & Record<string, unknown>) => void)[] = [
    value => { value.customerId = 'cus_SyntheticPrivate' }, value => { value.version = 2 as 1 },
    value => { value.source = 'stripe-payment-proof' as 'stored-credit-records' },
    value => { value.stripeCustomerStatus = ['known'] as unknown as 'known' },
    value => { value.stripeCustomerStatus = 'invalid' }, value => { value.stripeCustomerLinked = 'true' as unknown as boolean },
    value => { Object.assign(value.invoiceGrants, { invoiceIds: ['in_SyntheticPrivate'] }) },
    value => { value.invoiceGrants.scanned = 65 }, value => { value.invoiceGrants.scanLimit = 65 as 64 },
    value => { value.invoiceGrants.scanStatus = 'unavailable' }, value => { value.invoiceGrants.scanStatus = 'partial'; value.invoiceGrants.partial = true },
    value => { value.invoiceGrants.states.present = 2 }, value => { value.invoiceGrants.creditedPoints = 0 },
    value => { value.invoiceGrants.creditedPoints = 1_000_001 }, value => { value.invoiceGrants.revokedPoints = 1 },
    value => { value.requestedInvoices.push(value.requestedInvoices[0]) },
    value => { value.requestedInvoices[1].invoiceReference = value.requestedInvoices[0].invoiceReference },
    value => { value.requestedInvoices[0].invoiceReference = 'pi_SyntheticWrongType' },
    value => { value.requestedInvoices[0].invoiceReference = `in_${'a'.repeat(181)}` },
    value => { Object.assign(value.requestedInvoices[0], { subscriptionId: 'sub_SyntheticPrivate' }) },
    value => { value.requestedInvoices[0].creditedPoints = Infinity }, value => { value.requestedInvoices[0].revokedPoints = 1 },
    value => { value.requestedInvoices[0].reason = 'invalid-record' }, value => { value.requestedInvoices[0].state = 'missing' },
    value => { value.requestedInvoices[0].state = 'revoked' }, value => { value.requestedInvoices[1].creditedPoints = 0 },
    value => { value.requestedInvoices[1].subscriptionLinked = true },
    value => { value.requestedInvoices[1].state = 'unverifiable'; value.requestedInvoices[1].reason = ['unavailable'] as unknown as 'unavailable' },
    value => { value.unknownAmountProvenance.records = 1 }, value => { value.unknownAmountProvenance.classifiedRecords = 2 },
    value => { value.unknownAmountProvenance.unclassifiedRecords = 2 }, value => { value.unknownAmountProvenance.groups = [] },
    value => { value.unknownAmountProvenance.groups.push(value.unknownAmountProvenance.groups[0]) },
    value => { Object.assign(value.unknownAmountProvenance.groups[0], { jobId: jobKey(1).slice(4) }) },
    value => { value.unknownAmountProvenance.groups[0].model = '__proto__' as 'unknown' },
    value => { value.unknownAmountProvenance.groups[0].state = 'unknown' as 'failed' },
    value => { value.unknownAmountProvenance.groups[0].route = 'private-route' as 'studio' },
    value => { value.unknownAmountProvenance.groups[0].recordedPointCosts = 1_000_001 },
    value => { value.unknownAmountProvenance.groups[0].earliestAt = 0 },
    value => { value.unknownAmountProvenance.groups[0].latestAt = value.unknownAmountProvenance.groups[0].earliestAt - 1 },
    value => { value.unknownAmountProvenance.groups[0].latestAt = 8_640_000_000_000_001 },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(result); mutate(changed.storedEvidence! as NonNullable<GenerationFundingSnapshot['storedEvidence']> & Record<string, unknown>)
    assert.throws(() => readGenerationFundingSnapshot(changed), /unrecognized snapshot/)
  }
  const old = structuredClone(result); delete old.storedEvidence; delete old.jobs.blueprintOutputAdjustment
  assert.doesNotThrow(() => readGenerationFundingSnapshot(old), 'Older default responses retain their original accepted schema')
})
