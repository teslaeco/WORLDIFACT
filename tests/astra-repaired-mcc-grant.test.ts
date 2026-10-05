import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AccountEntitlements, entitlementApi, entitlementCall, entitlementStatus,
  reserveUserGeneration, settleUserGeneration, pendingUserStudioProvider, reconcileUserStudioProvider,
  type EntitlementEnv, type EntitlementStatus, type EntitlementStorage,
} from '../server/entitlements.ts'
import type { AccountEnv } from '../server/accounts.ts'
import type { AstraSupportIdentity } from '../server/astraSupportOnce.ts'
import type { TerminalBudgetReceipt } from '../server/studioBudgetReceipt.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'

// Synthetic, serialized Durable Object fixtures only. No live services or account data.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GRANT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NEXT_GRANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const EMAIL = 'synthetic-repaired-mcc@example.invalid'
const NOW = Date.parse('2026-10-05T10:00:00.000Z'), DAY = 86_400_000
const GLOBAL = 'astra-support-repaired-mcc:v1', MARKER = 'support-astra-repaired-mcc:v1'
const ORIGINAL_GLOBAL = 'astra-support-once:v1', ORIGINAL = 'support-astra-once:v1'
const SUPPLEMENTAL_GLOBAL = 'astra-support-supplemental:v1', SUPPLEMENTAL = 'support-astra-supplemental:v1'
const PROVIDER = 'provider-budget-cents:v1', HELD = 'customer-reserved-credits:v1'
const VERIFIED = 'X-WORLDIFACT-Verified-Account', FINGERPRINT = 'a'.repeat(64)
const config = (patch: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, accountId: OWNER, grantId: GRANT, issuedAt: new Date(NOW - 60_000).toISOString(),
  expiresAt: new Date(NOW + 60 * 60_000).toISOString(), amountCents: 175, fingerprint: FINGERPRINT, ...patch,
})
function emailConfig(patch: Record<string, unknown> = {}) {
  const value = JSON.parse(config()) as Record<string, unknown>; delete value.accountId
  return JSON.stringify({ ...value, accountEmail: EMAIL, ...patch })
}
function oldConfig(kind: 'original' | 'supplemental') {
  const value = JSON.parse(config()) as Record<string, unknown>; delete value.fingerprint; value.grantId = NEXT_GRANT
  if (kind === 'original') { value.approvalId = value.grantId; delete value.grantId }
  return JSON.stringify(value)
}
type SupportStatus = EntitlementStatus & { astraRepairedMccGrant?: { available: boolean; consumed: boolean; maximumProviderCents: number } }
type FixtureEnv = EntitlementEnv & AccountEnv & { WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT?: string; ENABLE_ASTRA_PLANS: string }
type Store = {
  values: Map<string, unknown>; storage: EntitlementStorage; writes: { key: string; value: unknown }[]
  forbiddenWrites: Set<string>; attemptedForbiddenWrites: string[]; failKey?: string
  beforeTransaction?: () => Promise<void>; beforeRead?: (key: string) => Promise<void>; beforeWrite?: (key: string) => Promise<void>
}
function fixture(options: {
  config?: string | null; mode?: string; seed?: Record<string, unknown>; globalSeed?: Record<string, unknown>
  originalConfig?: string; supplementalConfig?: string; originalSeed?: Record<string, unknown>; supplementalSeed?: Record<string, unknown>
  identity?: AstraSupportIdentity; astraEnabled?: boolean; allowProviderWrites?: boolean
} = {}) {
  let now = NOW
  const stores = new Map<string, Store>(), objects = new Map<string, AccountEntitlements>()
  const requests: { name: string; path: string; method: string; header: string | null }[] = []
  const env: FixtureEnv = {
    ENABLE_ASTRA_PLANS: String(options.astraEnabled !== false), ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ...(options.mode === undefined ? {} : { ACCOUNT_LEDGER_MODE: options.mode }),
    ...(options.config === null ? {} : { WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT: options.config ?? config() }),
    ...(options.originalConfig === undefined ? {} : { WORLDIFACT_ASTRA_SUPPORT_ONCE: options.originalConfig }),
    ...(options.supplementalConfig === undefined ? {} : { WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT: options.supplementalConfig }),
  }
  const nameFor = (account = OWNER) => `${env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'}:${account.toLowerCase()}`
  const ensure = (name: string) => {
    let store = stores.get(name)
    if (!store) {
      const values = new Map<string, unknown>(Object.entries(
        name === GLOBAL ? options.globalSeed ?? {} : name === ORIGINAL_GLOBAL ? options.originalSeed ?? {} : name === SUPPLEMENTAL_GLOBAL ? options.supplementalSeed ?? {} : {
          balance: 1500,
          subscription: { id: 'sub_Synthetic', active: true, until: NOW + 30 * DAY, revision: 1, plan: 'creator', grantId: 'in_Synthetic' },
          'grant:in_Synthetic': { credits: 1500, revoked: 0, subscriptionId: 'sub_Synthetic' },
          [PROVIDER]: 0, ...options.seed,
        }))
      let tail: Promise<unknown> = Promise.resolve()
      const record: Store = {
        values, writes: [], forbiddenWrites: new Set(options.allowProviderWrites ? [] : [PROVIDER]), attemptedForbiddenWrites: [],
        storage: undefined as unknown as EntitlementStorage,
      }
      const write = async (target: Map<string, unknown>, writes: Store['writes'], key: string, value: unknown) => {
        await record.beforeWrite?.(key)
        if (record.forbiddenWrites.has(key)) { record.attemptedForbiddenWrites.push(key); throw new Error('Forbidden historical ledger write') }
        if (record.failKey === key) throw new Error('Synthetic write failure')
        target.set(key, structuredClone(value)); writes.push({ key, value: structuredClone(value) })
      }
      const list = <T>(target: Map<string, unknown>, options: { prefix: string; startAfter?: string; limit: number }) => new Map(
        [...target].filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter))
          .sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value) as T]),
      )
      const storage: EntitlementStorage = {
        async get<T>(key: string) { await record.beforeRead?.(key); return structuredClone(values.get(key)) as T | undefined },
        async put(key, value) { await write(values, record.writes, key, value) },
        async list<T>(options: { prefix: string; startAfter?: string; limit: number }) { return list<T>(values, options) },
        transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
          const next = tail.then(async () => {
            const before = record.beforeTransaction; record.beforeTransaction = undefined; await before?.()
            const draft = structuredClone(values), pending: Store['writes'] = []
            const transaction: EntitlementStorage = {
              async get<V>(key: string) { await record.beforeRead?.(key); return structuredClone(draft.get(key)) as V | undefined },
              async put(key, value) { await write(draft, pending, key, value) },
              async list<V>(options: { prefix: string; startAfter?: string; limit: number }) { return list<V>(draft, options) },
              transaction: async fn => fn(transaction),
            }
            const result = await callback(transaction)
            values.clear(); for (const [key, value] of draft) values.set(key, value)
            record.writes.push(...pending); return result
          })
          tail = next.catch(() => undefined); return next
        },
      }
      record.storage = storage; stores.set(name, record); store = record
    }
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: store.storage }, env, () => now))
    return { store, object: objects.get(name)! }
  }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) {
    const name = String(id)
    return { async fetch(request) {
      requests.push({ name, path: new URL(request.url).pathname, method: request.method, header: request.headers.get(VERIFIED) })
      return ensure(name).object.fetch(request)
    } }
  } }
  const direct = async (path: string, body?: unknown, header?: string, account = OWNER) => {
    const response = await ensure(nameFor(account)).object.fetch(new Request(`https://synthetic.internal${path}`, {
      method: body === undefined ? 'GET' : 'POST', ...(header === undefined ? {} : { headers: { [VERIFIED]: header } }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
    return { status: response.status, data: await response.json() as Record<string, unknown> }
  }
  return {
    env, requests, direct, store: (account = OWNER) => ensure(nameFor(account)).store,
    globalStore: () => ensure(GLOBAL).store, originalStore: () => ensure(ORIGINAL_GLOBAL).store, supplementalStore: () => ensure(SUPPLEMENTAL_GLOBAL).store,
    status: (account = OWNER, identity = options.identity) => entitlementStatus(env, account, identity) as Promise<SupportStatus>,
    reserve: (id = crypto.randomUUID(), account = OWNER, identity = options.identity, fingerprint = FINGERPRINT) => reserveUserGeneration(env, account, id, 'slow', 'astra', fingerprint, 'standard', { channel: 'studio', prompt: 'Synthetic cabinet fixture', supportIdentity: identity, repairedMccInputEligible: true }),
    restart() { objects.clear() }, setNow(value: number) { now = value },
  }
}
const input = (patch: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), profile: 'slow', model: 'astra', channel: 'studio', fingerprint: FINGERPRINT, repairedMccInputEligible: true, ...patch })
const snapshot = (store: Store) => structuredClone([...store.values])
function assertPrivate(value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of [OWNER, OTHER, EMAIL, GRANT, NEXT_GRANT, 'accountEmail', 'emailVerified', 'accountId', 'grantId', 'repairedMccClaim', 'WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT', PROVIDER])
    assert.equal(text.includes(secret), false, `Public projection leaked ${secret}`)
}
function gate() {
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), wait = new Promise<void>(resolve => { release = resolve })
  return { entered, release, pause: async () => { enter(); await wait } }
}

// Reject invalid authority through the DO/helper boundary, not just its parser.
test('repaired MCC requires exact bounded configuration including an immutable lowercase fingerprint', async () => {
  const complete = JSON.parse(config()) as Record<string, unknown>
  const bad: [string, string | null][] = [
    ['absent', null], ['empty', ''], ['invalid JSON', '{'], ['null', 'null'], ['array', '[]'], ['oversized', ' '.repeat(2048) + config()],
    ['version', config({ version: 2 })], ['string version', config({ version: '1' })], ['account', config({ accountId: 'invalid' })], ['grant', config({ grantId: 'invalid' })],
    ['underfunded', config({ amountCents: 174 })], ['overfunded', config({ amountCents: 176 })], ['multiple attempts', config({ amountCents: 350 })], ['string amount', config({ amountCents: '175' })],
    ['fingerprint type', config({ fingerprint: 17 })], ['fingerprint case', config({ fingerprint: 'A'.repeat(64) })], ['fingerprint length', config({ fingerprint: 'a'.repeat(63) })],
    ['extra field', config({ quantity: 2 })], ['dual identity', config({ accountEmail: EMAIL })],
    ['expired', config({ expiresAt: new Date(NOW).toISOString() })], ['future', config({ issuedAt: new Date(NOW + 1).toISOString() })],
    ['overlong window', config({ issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + DAY + 1).toISOString() })],
    ['noncanonical date', config({ issuedAt: '2026-10-05T09:59:00Z' })], ['numeric date', config({ expiresAt: NOW + DAY })],
  ]
  for (const key of Object.keys(complete)) { const value = { ...complete }; delete value[key]; bad.push([`missing ${key}`, JSON.stringify(value)]) }
  for (const [label, raw] of bad) {
    const f = fixture({ config: raw }), before = snapshot(f.store())
    assert.notEqual((await f.status()).astraRepairedMccGrant?.available, true, label)
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED', label)
    assert.deepEqual(snapshot(f.store()), before, label)
    assert.equal(f.globalStore().values.has(MARKER), false, label)
    assert.deepEqual(f.store().attemptedForbiddenWrites, [], label)
  }
})

test('one repaired MCC attempt holds 250 points and binds full evidence without any provider write', async () => {
  for (const mode of [undefined, 'live']) for (const provider of [0, 1, 174]) {
    const f = fixture({ mode, seed: { [PROVIDER]: provider } }), store = f.store(), job = crypto.randomUUID()
    assert.deepEqual((await f.status()).astraRepairedMccGrant, { available: true, consumed: false, maximumProviderCents: 175 })
    assert.deepEqual(await f.reserve(job), { allowed: true, repeated: false, cost: 250, kind: 'credits', held: true })
    const claim = { ...JSON.parse(config()), jobId: job, at: NOW }
    assert.deepEqual(store.values.get(MARKER), claim)
    assert.deepEqual(f.globalStore().values.get(MARKER), claim)
    const saved = store.values.get(`job:${job}`) as Record<string, unknown>
    assert.equal(saved.repairedMccGrantId, GRANT); assert.deepEqual(saved.repairedMccClaim, claim)
    assert.equal(saved.studioProviderReservation, undefined)
    assert.equal(store.values.get('balance'), 1500); assert.equal(store.values.get(HELD), 250)
    assert.equal(store.values.get(PROVIDER), provider); assert.deepEqual(store.attemptedForbiddenWrites, [])
    assert.deepEqual(store.values.get('grant:in_Synthetic'), { credits: 1500, revoked: 0, subscriptionId: 'sub_Synthetic' })
    assert.deepEqual([...store.values.keys()].filter(key => key.startsWith('grant:')), ['grant:in_Synthetic'])
    assert.deepEqual((await f.status()).astraRepairedMccGrant, { available: false, consumed: true, maximumProviderCents: 175 })
  }
})

test('status and funding reads are read-only before and after consumption and never lazy-seed provider funding', async () => {
  const f = fixture()
  for (let consumed = 0; consumed < 2; consumed++) {
    const store = f.store(), global = f.globalStore(), before = snapshot(store), globalBefore = snapshot(global)
    const writes = store.writes.length, globalWrites = global.writes.length
    for (let n = 0; n < 3; n++) {
      assertPrivate(await f.status())
      assertPrivate(await entitlementCall(f.env, OWNER, '/generation-funding'))
    }
    assert.deepEqual(snapshot(store), before); assert.deepEqual(snapshot(global), globalBefore)
    assert.equal(store.writes.length, writes); assert.equal(global.writes.length, globalWrites)
    if (!consumed) await f.reserve()
  }
  const unseeded = fixture(); unseeded.store().values.delete(PROVIDER)
  const before = snapshot(unseeded.store())
  await unseeded.status(); await entitlementCall(unseeded.env, OWNER, '/generation-funding')
  assert.deepEqual(snapshot(unseeded.store()), before); assert.deepEqual(unseeded.store().attemptedForbiddenWrites, [])
})

test('runtime, credit holds, billing review, provider debt and corrupt ledgers cannot consume repaired authority', async () => {
  const cases = [
    { astraEnabled: false, reason: 'ASTRA_RUNTIME_DISABLED' },
    { seed: { billingHold: true }, reason: 'BILLING_REVIEW_REQUIRED' },
    { seed: { balance: 249 }, reason: 'CREDITS_EXHAUSTED' },
    { seed: { [HELD]: 1251 }, reason: 'CREDITS_EXHAUSTED' },
    { seed: { [PROVIDER]: -1 }, reason: 'PROVIDER_BUDGET_EXHAUSTED' },
  ]
  for (const options of cases) {
    const f = fixture(options), before = snapshot(f.store())
    assert.equal((await f.reserve()).reason, options.reason)
    assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().values.has(MARKER), false)
  }
  for (const provider of [NaN, Infinity, 0.5, '0']) {
    const f = fixture({ seed: { [PROVIDER]: provider } }), before = snapshot(f.store())
    assert.equal((await f.direct('/reserve', input(), OWNER)).status, 503)
    assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().values.has(MARKER), false)
  }
})

test('sandbox and absent, forged or different verified identities cannot obtain the allowance', async () => {
  for (const mode of ['sandbox']) {
    const f = fixture({ mode })
    assert.equal((await f.reserve()).allowed, false); assert.equal((await f.status()).astraRepairedMccGrant, undefined)
    assert.equal(f.globalStore().values.has(MARKER), false)
  }
  const invalid = fixture({ mode: 'invalid' })
  await assert.rejects(invalid.reserve(), /ledger mode is invalid/)
  assert.equal(invalid.globalStore().values.has(MARKER), false)
  const f = fixture(), before = snapshot(f.store())
  for (const header of [undefined, OTHER, 'invalid']) {
    assert.equal((await f.direct('/reserve', input(), header)).data.allowed, false)
    assert.equal((await f.direct('/status', undefined, header)).data.astraRepairedMccGrant, undefined)
  }
  assert.equal((await f.reserve(crypto.randomUUID(), OTHER)).allowed, false)
  assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().values.has(MARKER), false)
  assert.equal((await f.reserve()).allowed, true)
})

test('only exact unpriced standard-quality Studio Astra fingerprints qualify and mismatches leave no claim', async () => {
  const f = fixture(), before = snapshot(f.store())
  for (const patch of [
    { repairedMccInputEligible: undefined }, { repairedMccInputEligible: false }, { channel: 'blueprint' }, { channel: undefined }, { profile: 'fast', model: 'sol' }, { profile: 'fast', model: 'luna' },
    { profile: 'fast' }, { model: 'sol' }, { fingerprint: undefined }, { fingerprint: 'b'.repeat(64) },
    { fingerprint: 'A'.repeat(64) }, { qualityProfile: 'industrial-electrical-cabinet-v1' }, { qualityProfile: 'reference-character-v1' },
    { pricing: STUDIO_PRICING.standard }, { pricing: STUDIO_PRICING.extended },
  ]) {
    const result = await f.direct('/reserve', input(patch), OWNER)
    assert.notEqual(result.data.allowed, true, JSON.stringify(patch))
    assert.notEqual(result.data.repairedMccEligible, true, JSON.stringify(patch))
    assert.deepEqual(snapshot(f.store()), before)
  }
  assert.equal((await f.reserve(crypto.randomUUID(), OWNER, undefined, 'b'.repeat(64))).allowed, false)
  assert.equal(f.globalStore().values.has(MARKER), false)
  assert.equal((await f.reserve()).allowed, true)
})

test('a public entitlement read uses authenticated identity and never returns private grant configuration', async () => {
  const f = fixture(), url = 'https://worldifact.test/api/account/entitlements'
  let reads = 0
  const foreign = (async () => { reads++; return Response.json({ id: OTHER }) }) as typeof fetch
  const anonymous = await entitlementApi(new Request(url, { headers: { [VERIFIED]: OWNER } }), f.env, foreign)
  assert.equal(anonymous?.status, 401); assert.equal(reads, 0)
  const response = await entitlementApi(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-cookie', [VERIFIED]: OWNER } }), f.env, foreign)
  assert.equal(response?.status, 200); assert.equal(response?.headers.get('Cache-Control'), 'private, no-store')
  const publicStatus = await response!.json() as SupportStatus
  assert.equal(publicStatus.astraRepairedMccGrant, undefined); assertPrivate(publicStatus)
  assert.ok(f.requests.every(call => call.header === OTHER))
  const owner = (async () => Response.json({ id: OWNER })) as typeof fetch
  const owned = await entitlementApi(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-cookie' } }), f.env, owner)
  assertPrivate(await owned!.json())
  const job = crypto.randomUUID(); await f.reserve(job)
  assertPrivate(await entitlementCall(f.env, OWNER, '/job', { id: job }))
  assertPrivate(await entitlementCall(f.env, OWNER, '/studio-current', {}))
})

test('same-account races admit one job; exact concurrent replays add no hold or claim', async () => {
  const f = fixture(), ids = Array.from({ length: 10 }, () => crypto.randomUUID())
  const results = await Promise.all(ids.map(id => f.reserve(id)))
  assert.equal(results.filter(result => result.allowed).length, 1)
  const winner = ids[results.findIndex(result => result.allowed)], before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
  const replays = await Promise.all(Array.from({ length: 12 }, () => f.reserve(winner)))
  assert.ok(replays.every(result => result.allowed && result.repeated && result.cost === 250))
  assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  assert.equal(f.store().values.get(HELD), 250); assert.equal(f.globalStore().writes.length, 1)
})

test('email-scoped races across accounts produce one global winner and cannot transfer a consumed grant', async () => {
  const identity = { email: EMAIL, emailVerified: true }, f = fixture({ config: emailConfig(), identity })
  const ids = [crypto.randomUUID(), crypto.randomUUID()]
  const results = await Promise.all([f.reserve(ids[0], OWNER), f.reserve(ids[1], OTHER)])
  assert.equal(results.filter(result => result.allowed).length, 1)
  const winner = results[0].allowed ? OWNER : OTHER, loser = winner === OWNER ? OTHER : OWNER
  assert.equal(f.store(winner).values.get(HELD), 250); assert.equal(f.store(loser).values.get(HELD), undefined)
  assert.equal(f.globalStore().writes.length, 1)
  const claim = structuredClone(f.globalStore().values.get(MARKER)), before = snapshot(f.store(loser))
  for (const raw of [emailConfig(), emailConfig({ grantId: NEXT_GRANT }), config({ accountId: loser, grantId: NEXT_GRANT })]) {
    f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = raw; f.restart()
    assert.equal((await f.reserve(ids[results.findIndex(result => result.allowed)], loser)).allowed, false)
    assert.equal((await f.reserve(crypto.randomUUID(), loser)).allowed, false)
    assert.deepEqual(snapshot(f.store(loser)), before); assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  }
})

test('email scope requires verified authoritative email and a single canonical identity field', async () => {
  for (const identity of [undefined, { email: EMAIL }, { email: EMAIL, emailVerified: false }, { email: 'other@example.invalid', emailVerified: true }]) {
    const f = fixture({ config: emailConfig(), identity })
    assert.equal((await f.status()).astraRepairedMccGrant, undefined); assert.equal((await f.reserve()).allowed, false)
    assert.equal(f.globalStore().values.has(MARKER), false)
  }
  for (const raw of [emailConfig({ accountId: OWNER }), emailConfig({ accountEmail: 'invalid' }), emailConfig({ accountEmail: ` ${EMAIL}` })]) {
    const f = fixture({ config: raw, identity: { email: EMAIL, emailVerified: true } })
    assert.equal((await f.reserve()).allowed, false); assert.equal(f.globalStore().values.has(MARKER), false)
  }
  const f = fixture({ config: emailConfig(), identity: { email: EMAIL.toUpperCase(), emailVerified: true } })
  assert.equal((await f.reserve()).allowed, true)
  const claim = f.globalStore().values.get(MARKER) as Record<string, unknown>
  assert.equal(claim.accountId, OWNER); assert.equal(Object.hasOwn(claim, 'accountEmail'), false)
})

test('every existing local or global repaired marker is consumed, including malformed stored values', async () => {
  for (const marker of [null, false, 0, {}, { version: 1 }, { grantId: NEXT_GRANT }]) for (const location of ['local', 'global']) {
    const f = fixture(location === 'local' ? { seed: { [MARKER]: marker } } : { globalSeed: { [MARKER]: marker } })
    const before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
    assert.deepEqual((await f.status()).astraRepairedMccGrant, { available: false, consumed: true, maximumProviderCents: 175 })
    assert.equal((await f.reserve()).allowed, false)
    assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  }
})

test('configuration rotation, removal, restart and expiry never mint a second allowance', async () => {
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  const before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
  for (const raw of [config({ grantId: NEXT_GRANT }), config({ fingerprint: 'b'.repeat(64) }), undefined, config()]) {
    f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = raw; f.restart()
    assert.equal((await f.reserve()).allowed, false); assert.equal((await f.reserve(job)).repeated, true)
    assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  }
  f.setNow(NOW + 2 * 60 * 60_000); f.restart()
  assert.equal((await f.reserve()).allowed, false); assert.equal((await f.reserve(job)).repeated, true)
  assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(snapshot(f.globalStore()), globalBefore)
})

test('an unused allowance expires before admission, across account/global transaction waits and during global marker reads', async () => {
  for (const boundary of ['before', 'account transaction', 'global transaction', 'global marker']) {
    const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) })
    const before = snapshot(f.store()), global = f.globalStore()
    if (boundary === 'before') f.setNow(NOW + 1)
    if (boundary === 'global marker') global.beforeRead = async key => {
      if (key === MARKER) { global.beforeRead = undefined; f.setNow(NOW + 1) }
    }
    if (boundary.endsWith('transaction')) {
      const deferred = gate(), target = boundary === 'account transaction' ? f.store() : global
      target.beforeTransaction = deferred.pause
      const pending = f.reserve()
      await deferred.entered; f.setNow(NOW + 1); deferred.release()
      assert.equal((await pending).allowed, false, boundary)
    } else assert.equal((await f.reserve()).allowed, false, boundary)
    assert.deepEqual(snapshot(f.store()), before, boundary)
    assert.equal(global.values.has(MARKER), false, boundary)
  }
})

test('expiry during account marker lookup retains the earlier global claim but admits no job', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) })
  const before = snapshot(f.store()), namespace = f.env.ACCOUNT_ENTITLEMENTS!
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
    const object = namespace.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === GLOBAL && request.method === 'POST') {
        const store = f.store()
        store.beforeRead = async key => { if (key === MARKER) { store.beforeRead = undefined; f.setNow(NOW + 1) } }
      }
      return response
    } }
  } }
  assert.equal((await f.reserve()).allowed, false)
  assert.deepEqual(snapshot(f.store()), before)
  assert.ok(f.globalStore().values.has(MARKER)); assert.equal(f.store().values.has(MARKER), false)
  assert.equal(f.globalStore().writes.length, 1)
})

test('expiry or configuration changes while a global acknowledgement is delayed cannot authorize account admission', async () => {
  for (const change of ['expiry', 'fingerprint', 'grantId', 'issuedAt', 'expiresAt']) {
    const f = fixture(), before = snapshot(f.store()), namespace = f.env.ACCOUNT_ENTITLEMENTS!, deferred = gate()
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        if (String(id) === GLOBAL && request.method === 'POST') await deferred.pause()
        return response
      } }
    } }
    const pending = f.reserve(); await deferred.entered
    const claim = structuredClone(f.globalStore().values.get(MARKER))
    if (change === 'expiry') f.setNow(NOW + 2 * 60 * 60_000)
    else f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = config({ [change]: change === 'fingerprint' ? 'b'.repeat(64) : change === 'grantId' ? NEXT_GRANT : new Date(change === 'issuedAt' ? NOW - 60_001 : NOW + 2 * 60 * 60_000).toISOString() })
    deferred.release()
    assert.equal((await pending.catch(() => ({ allowed: false }))).allowed, false, change)
    assert.deepEqual(snapshot(f.store()), before, change); assert.deepEqual(f.globalStore().values.get(MARKER), claim, change)
    assert.equal(f.globalStore().writes.length, 1, change)
  }
})

test('global write failure stops once without creating an account hold or pretending admission succeeded', async () => {
  const f = fixture(), job = crypto.randomUUID(), before = snapshot(f.store())
  f.globalStore().failKey = MARKER
  await assert.rejects(f.reserve(job), /could not be confirmed|temporarily unavailable/)
  assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().values.has(MARKER), false)
  assert.equal(f.requests.filter(call => call.name === GLOBAL && call.method === 'POST').length, 1)
  assert.equal(f.requests.filter(call => call.path === '/reserve').length, 1)
  f.globalStore().failKey = undefined
  assert.equal((await f.reserve(job)).allowed, true)
  assert.equal(f.globalStore().writes.length, 1)
})

test('lost global acknowledgement never retries admission automatically and only the exact job can recover', async () => {
  const f = fixture(), job = crypto.randomUUID(), before = snapshot(f.store()), namespace = f.env.ACCOUNT_ENTITLEMENTS!
  let dropped = false
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
    const object = namespace.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === GLOBAL && request.method === 'POST' && !dropped) {
        dropped = true; throw new Error('Synthetic lost acknowledgement after global commit')
      }
      return response
    } }
  } }
  await assert.rejects(f.reserve(job), /could not be confirmed/)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.requests.filter(call => call.name === GLOBAL && call.method === 'POST').length, 1)
  assert.equal(f.requests.filter(call => call.path === '/reserve').length, 1)
  const claim = structuredClone(f.globalStore().values.get(MARKER)); assert.ok(claim)
  assert.equal((await f.reserve()).allowed, false)
  assert.equal((await f.reserve(job, OWNER, undefined, 'b'.repeat(64))).allowed, false)
  assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  assert.equal((await f.reserve(job)).allowed, true)
  assert.deepEqual(f.globalStore().values.get(MARKER), claim); assert.equal(f.globalStore().writes.length, 1)
  assert.equal(f.store().values.get(HELD), 250)
})

test('account transaction rollback does not recycle a globally claimed repaired allowance', async () => {
  const f = fixture(), job = crypto.randomUUID(), store = f.store(), before = snapshot(store)
  store.failKey = `job:${job}`
  await assert.rejects(f.reserve(job), /temporarily unavailable/)
  assert.deepEqual(snapshot(store), before); assert.equal(store.values.has(MARKER), false)
  const claim = structuredClone(f.globalStore().values.get(MARKER)); assert.ok(claim)
  assert.equal((await f.reserve()).allowed, false)
  store.failKey = undefined
  assert.equal((await f.reserve(job)).allowed, true)
  assert.equal(store.values.get(HELD), 250); assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  assert.equal(f.globalStore().writes.length, 1); assert.deepEqual(store.attemptedForbiddenWrites, [])
})

test('lost account acknowledgement recovers committed accounting without another claim or point hold', async () => {
  const f = fixture(), job = crypto.randomUUID(), namespace = f.env.ACCOUNT_ENTITLEMENTS!
  let dropped = false
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
    const object = namespace.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === `account:v1:${OWNER}` && new URL(request.url).pathname === '/reserve' && !dropped) {
        const result = await response.clone().json() as { allowed?: boolean }
        if (result.allowed) { dropped = true; throw new Error('Synthetic lost acknowledgement after account commit') }
      }
      return response
    } }
  } }
  await assert.rejects(f.reserve(job), /temporarily unavailable/)
  assert.equal(f.requests.filter(call => call.path === '/reserve').length, 2, 'One eligibility read plus one account claim; no automatic retry')
  const before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
  assert.equal(f.store().values.get(HELD), 250)
  assert.equal((await f.reserve(job)).repeated, true)
  assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  assert.equal((await f.reserve()).allowed, false)
})

test('malformed global acknowledgements are rejected after commit without retrying or allocating account authority', async () => {
  for (const transform of [
    () => ({ approved: true }),
    (value: Record<string, unknown>) => ({ ...value, extra: true }),
    (value: Record<string, unknown>) => ({ ...value, claim: { ...value.claim as Record<string, unknown>, fingerprint: 'b'.repeat(64) } }),
    (value: Record<string, unknown>) => ({ ...value, claim: { ...value.claim as Record<string, unknown>, at: NOW + 2 * 60 * 60_000 } }),
  ]) {
    const f = fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!, before = snapshot(f.store())
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        return String(id) === GLOBAL && request.method === 'POST' && response.ok
          ? Response.json(transform(await response.json() as Record<string, unknown>)) : response
      } }
    } }
    await assert.rejects(f.reserve(), /could not be confirmed/)
    assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().writes.length, 1)
    assert.equal(f.requests.filter(call => call.path === '/reserve').length, 1)
  }
})

test('malformed successful account acknowledgements fail closed and preserve the committed hold for recovery', async () => {
  for (const bad of [
    { allowed: true }, { allowed: true, repeated: false, cost: 0, kind: 'free', held: false },
    { allowed: true, repeated: false, cost: 250, kind: 'credits', held: false },
    { allowed: true, repeated: true, cost: 250, kind: 'credits', held: true, state: 'failed' },
  ]) {
    const f = fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID()
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        if (String(id) === `account:v1:${OWNER}` && new URL(request.url).pathname === '/reserve' && response.ok) {
          const value = await response.clone().json() as { allowed?: boolean }
          if (value.allowed) return Response.json(bad)
        }
        return response
      } }
    } }
    await assert.rejects(f.reserve(job), /could not be confirmed|temporarily unavailable/)
    assert.equal(f.store().values.get(HELD), 250); assert.equal(f.globalStore().writes.length, 1)
    assert.deepEqual(f.store().attemptedForbiddenWrites, [])
    assert.equal(f.requests.filter(call => call.path === '/reserve').length, 2)
  }
})

test('pending global claims cannot be revived by edited configuration windows, fingerprints or malformed evidence', async () => {
  const patches = [
    { at: NOW + 1 }, { at: NOW - DAY }, { at: 0.5 }, { at: String(NOW) }, { extra: true },
    { fingerprint: 'b'.repeat(64) }, { accountId: OTHER }, { jobId: OTHER }, { grantId: NEXT_GRANT },
  ]
  for (const patch of patches) {
    const f = fixture(), job = crypto.randomUUID(), before = snapshot(f.store())
    f.store().failKey = `job:${job}`; await assert.rejects(f.reserve(job)); f.store().failKey = undefined
    const corrupted = { ...f.globalStore().values.get(MARKER) as Record<string, unknown>, ...patch }
    f.globalStore().values.set(MARKER, corrupted); f.restart()
    assert.equal((await f.reserve(job)).allowed, false, JSON.stringify(patch))
    assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(f.globalStore().values.get(MARKER), corrupted)
  }
  for (const patch of [
    { issuedAt: new Date(NOW - 60_001).toISOString() }, { expiresAt: new Date(NOW + 2 * 60 * 60_000).toISOString() },
    { fingerprint: 'b'.repeat(64) }, { grantId: NEXT_GRANT },
  ]) {
    const f = fixture(), job = crypto.randomUUID(), before = snapshot(f.store())
    f.store().failKey = `job:${job}`; await assert.rejects(f.reserve(job)); f.store().failKey = undefined
    const claim = structuredClone(f.globalStore().values.get(MARKER))
    f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = config(patch); f.restart()
    assert.equal((await f.reserve(job)).allowed, false)
    assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  }
})

test('old local/global claims and ordinary provider cents remain byte-identical through repaired reservation and failure', async () => {
  const historicalOriginal = { version: 1, approvalId: NEXT_GRANT, amountCents: 175, jobId: OTHER, fingerprint: 'e'.repeat(64), at: NOW - 1000 }
  const historicalSupplemental = { ...JSON.parse(oldConfig('supplemental')), jobId: OTHER, fingerprint: 'f'.repeat(64), at: NOW - 2000 }
  const f = fixture({ originalConfig: oldConfig('original'), supplementalConfig: oldConfig('supplemental'),
    seed: { [ORIGINAL]: historicalOriginal, [SUPPLEMENTAL]: historicalSupplemental, [PROVIDER]: 37 },
    originalSeed: { [ORIGINAL]: { ...historicalOriginal, accountId: OWNER } }, supplementalSeed: { [SUPPLEMENTAL]: historicalSupplemental },
  })
  const stores = [f.store(), f.originalStore(), f.supplementalStore()]
  for (const store of stores) for (const key of [ORIGINAL, SUPPLEMENTAL, PROVIDER]) store.forbiddenWrites.add(key)
  const original = snapshot(f.originalStore()), supplemental = snapshot(f.supplementalStore())
  const local = [ORIGINAL, SUPPLEMENTAL, PROVIDER, 'grant:in_Synthetic', 'subscription'].map(key => [key, JSON.stringify(f.store().values.get(key))])
  const job = crypto.randomUUID(); assert.equal((await f.reserve(job)).allowed, true)
  await settleUserGeneration(f.env, OWNER, job, 'failed', 'ASTRA_COST_LIMIT')
  assert.deepEqual(snapshot(f.originalStore()), original); assert.deepEqual(snapshot(f.supplementalStore()), supplemental)
  for (const [key, value] of local) assert.equal(JSON.stringify(f.store().values.get(key!)), value, key)
  for (const store of stores) assert.deepEqual(store.attemptedForbiddenWrites, [])
  assert.equal(f.store().values.get('balance'), 1500); assert.equal(f.store().values.get(HELD), 0)
  assert.equal((await f.reserve()).allowed, false)
})

test('configured original or supplemental authority without a local marker always blocks repaired fallthrough', async () => {
  for (const kind of ['original', 'supplemental'] as const) for (const globalOnly of [false, true]) {
    const namespace = kind === 'original' ? ORIGINAL_GLOBAL : SUPPLEMENTAL_GLOBAL
    const marker = kind === 'original' ? ORIGINAL : SUPPLEMENTAL
    const options = kind === 'original'
      ? { originalConfig: oldConfig(kind), ...(globalOnly ? { originalSeed: { [marker]: { uncertain: true } } } : {}) }
      : { supplementalConfig: oldConfig(kind), ...(globalOnly ? { supplementalSeed: { [marker]: { uncertain: true } } } : {}) }
    const f = fixture({ ...options, allowProviderWrites: true })
    assert.notEqual((await f.status()).astraRepairedMccGrant?.available, true)
    const result = await f.reserve()
    assert.equal(result.allowed, !globalOnly)
    assert.equal(f.store().values.has(MARKER), false); assert.equal(f.globalStore().writes.length, 0)
    assert.ok(f.requests.some(call => call.name === namespace && call.method === 'POST'))
  }
})

test('unknown or lost old-claim acknowledgements never spend repaired authority', async () => {
  for (const kind of ['original', 'supplemental'] as const) for (const mode of ['outage', 'lost acknowledgement']) {
    const target = kind === 'original' ? ORIGINAL_GLOBAL : SUPPLEMENTAL_GLOBAL
    const f = fixture(kind === 'original' ? { originalConfig: oldConfig(kind) } : { supplementalConfig: oldConfig(kind) })
    const namespace = f.env.ACCOUNT_ENTITLEMENTS!, before = snapshot(f.store())
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        if (String(id) === target && mode === 'outage') throw new Error('Synthetic old authority outage')
        const response = await object.fetch(request)
        if (String(id) === target && request.method === 'POST') throw new Error('Synthetic old acknowledgement loss')
        return response
      } }
    } }
    assert.notEqual((await f.status()).astraRepairedMccGrant?.available, true)
    await assert.rejects(f.reserve(), /could not be confirmed/)
    assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().writes.length, 0)
    assert.equal(f.store().values.has(MARKER), false)
  }
})

test('sufficient ordinary funds use existing economics and preserve all support authorities', async () => {
  for (const provider of [175, 350, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ originalConfig: oldConfig('original'), supplementalConfig: oldConfig('supplemental'), seed: { [PROVIDER]: provider }, allowProviderWrites: true })
    assert.equal((await f.reserve()).allowed, true)
    assert.equal(f.store().values.get(PROVIDER), provider - 175)
    for (const store of [f.originalStore(), f.supplementalStore(), f.globalStore()]) assert.equal(store.writes.length, 0)
    for (const key of [ORIGINAL, SUPPLEMENTAL, MARKER]) assert.equal(f.store().values.has(key), false)
  }
})

test('failed, cancelled and pre-dispatch rejected jobs release holds but never restore provider cents or support authority', async () => {
  for (const failure of ['ORACLE_JOB_FAILED', 'ORACLE_CANCELLED', 'ASTRA_COST_LIMIT', 'ORACLE_SUBMISSION_REJECTED'] as const) {
    const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
    const localClaim = structuredClone(f.store().values.get(MARKER)), globalClaim = snapshot(f.globalStore())
    await settleUserGeneration(f.env, OWNER, job, 'failed', failure)
    await settleUserGeneration(f.env, OWNER, job, 'failed', failure)
    await settleUserGeneration(f.env, OWNER, job, 'completed')
    assert.equal(f.store().values.get('balance'), 1500); assert.equal(f.store().values.get(HELD), 0)
    assert.equal(f.store().values.get(PROVIDER), 0); assert.deepEqual(f.store().attemptedForbiddenWrites, [])
    assert.deepEqual(f.store().values.get(MARKER), localClaim); assert.deepEqual(snapshot(f.globalStore()), globalClaim)
    assert.equal((await f.reserve(job)).reason, 'JOB_ALREADY_FAILED'); assert.equal((await f.reserve()).allowed, false)
  }
})

test('successful repaired work settles exactly 250 customer points once without returning any provider allowance', async () => {
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  await Promise.all(Array.from({ length: 8 }, () => settleUserGeneration(f.env, OWNER, job, 'completed')))
  await settleUserGeneration(f.env, OWNER, job, 'failed')
  assert.equal(f.store().values.get('balance'), 1250); assert.equal(f.store().values.get(HELD), 0)
  assert.equal(f.store().values.get(PROVIDER), 0); assert.deepEqual(f.store().attemptedForbiddenWrites, [])
  assert.equal((await f.reserve(job)).repeated, true); assert.equal((await f.reserve()).allowed, false)
  assert.equal(f.globalStore().writes.length, 1)
})

test('terminal reconciliation and funding projections never classify repaired jobs as ordinary refundable spend', async () => {
  for (const state of ['completed', 'failed'] as const) {
    const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
    await settleUserGeneration(f.env, OWNER, job, state)
    const before = snapshot(f.store())
    const receipt: TerminalBudgetReceipt = { revision: 'worldifact-terminal-budget-v1', jobId: job, model: 'gpt-6-astra',
      policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 0, sealed: true, sealId: 'b'.repeat(64) }
    assert.deepEqual(await reconcileUserStudioProvider(f.env, OWNER, job, receipt), { reconciled: false, reason: 'INELIGIBLE_RESERVATION' })
    assert.deepEqual(await pendingUserStudioProvider(f.env, OWNER), { ids: [], blueprintIds: [], nextCursor: null, hasMore: false })
    const access = await entitlementCall<Record<string, unknown>>(f.env, OWNER, '/job', { id: job })
    assert.equal(access.providerBudgetPending, undefined)
    const funding = await entitlementCall<{ jobs: { evidence: { supportGrantRecords: number; ordinaryTerminalStudioPending: number }; fundingEvidence: { unresolvedOrdinaryReservations: { records: number; cents: number }; recordedStudioReconciliations: { records: number } } } }>(f.env, OWNER, '/generation-funding')
    assert.equal(funding.jobs.evidence.supportGrantRecords, 1)
    assert.equal(funding.jobs.evidence.ordinaryTerminalStudioPending, 0)
    assert.deepEqual(funding.jobs.fundingEvidence.unresolvedOrdinaryReservations, { records: 0, cents: 0 })
    assert.equal(funding.jobs.fundingEvidence.recordedStudioReconciliations.records, 0)
    assert.deepEqual(snapshot(f.store()), before); assert.deepEqual(f.store().attemptedForbiddenWrites, [])
  }
})

test('ordinary topups or provider-key removal between global claim and account admission never switch repaired funding', async () => {
  for (const provider of [175, 1000, undefined]) {
    const f = fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID()
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        if (String(id) === GLOBAL && request.method === 'POST') {
          if (provider === undefined) f.store().values.delete(PROVIDER)
          else f.store().values.set(PROVIDER, provider)
        }
        return response
      } }
    } }
    assert.equal((await f.reserve(job)).allowed, true)
    assert.equal(f.store().values.get(PROVIDER), provider)
    assert.equal(f.store().values.has(PROVIDER), provider !== undefined, 'Attached repaired funding must not lazy-seed a removed provider key')
    assert.deepEqual(f.store().attemptedForbiddenWrites, [])
    assert.equal(f.store().values.get(HELD), 250)
    assert.equal((f.store().values.get(`job:${job}`) as Record<string, unknown>).studioProviderReservation, undefined)
    assert.equal(f.globalStore().writes.length, 1)
  }
})

test('removed or changed config after global claim fails closed even when ordinary funds become sufficient', async () => {
  for (const configAfter of [undefined, '{', config({ fingerprint: 'b'.repeat(64) }), config({ grantId: NEXT_GRANT })]) {
    const f = fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID()
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        if (String(id) === GLOBAL && request.method === 'POST') {
          f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = configAfter
          f.store().values.set(PROVIDER, 1000)
        }
        return response
      } }
    } }
    assert.equal((await f.reserve(job).catch(() => ({ allowed: false }))).allowed, false)
    assert.equal(f.store().values.get(PROVIDER), 1000); assert.deepEqual(f.store().attemptedForbiddenWrites, [])
    assert.equal(f.store().values.has(`job:${job}`), false); assert.equal(f.store().values.has(HELD), false)
    assert.equal(f.store().values.has(MARKER), false); assert.equal(f.globalStore().values.has(MARKER), true)
    assert.equal(f.globalStore().writes.length, 1)
  }
})

test('expiry at global claim write preserves only consumed global authority; expiry at account writes rolls back every local mutation', async () => {
  for (const writeBoundary of ['global', MARKER, HELD, 'job', 'current-studio-job:v1']) {
    const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), job = crypto.randomUUID(), before = snapshot(f.store())
    const target = writeBoundary === 'global' ? f.globalStore() : f.store()
    const key = writeBoundary === 'global' ? MARKER : writeBoundary === 'job' ? `job:${job}` : writeBoundary
    target.beforeWrite = async written => { if (written === key) { target.beforeWrite = undefined; f.setNow(NOW + 1) } }
    assert.equal((await f.reserve(job).catch(() => ({ allowed: false }))).allowed, false, writeBoundary)
    assert.deepEqual(snapshot(f.store()), before, writeBoundary)
    assert.ok(f.globalStore().values.has(MARKER), writeBoundary)
    assert.deepEqual(f.store().attemptedForbiddenWrites, [], writeBoundary)
  }
})

test('dispatch needs valid identical full job and account claims even if both stored copies are corrupted identically', async () => {
  for (const patch of [
    { grantId: 'invalid' }, { grantId: GRANT.toUpperCase() }, { issuedAt: '2026-10-05T09:59:00Z' },
    { expiresAt: new Date(NOW + DAY + 1).toISOString() }, { issuedAt: new Date(NOW + 1).toISOString() },
    { at: NOW + 1 }, { amountCents: 350 }, { version: 2 }, { extra: true }, { accountId: OTHER },
  ]) {
    const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
    const saved = f.store().values.get(`job:${job}`) as Record<string, unknown>
    const corrupt = { ...saved.repairedMccClaim as Record<string, unknown>, ...patch }
    f.store().values.set(MARKER, structuredClone(corrupt))
    f.store().values.set(`job:${job}`, { ...saved, repairedMccGrantId: corrupt.grantId, repairedMccClaim: structuredClone(corrupt) })
    const before = snapshot(f.store())
    const result = await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, OWNER)
    assert.deepEqual(result.data, { dispatch: false }, JSON.stringify(patch)); assert.deepEqual(snapshot(f.store()), before)
  }
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  f.store().values.set(MARKER, { ...f.store().values.get(MARKER) as Record<string, unknown>, at: NOW - 1 })
  const before = snapshot(f.store())
  assert.deepEqual((await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, OWNER)).data, { dispatch: false })
  assert.deepEqual(snapshot(f.store()), before)
})

test('dispatch is one-use, account-bound and capped by the original grant expiry', async () => {
  const expires = NOW + 1000, f = fixture({ config: config({ expiresAt: new Date(expires).toISOString() }) }), job = crypto.randomUUID()
  await f.reserve(job)
  const before = snapshot(f.store())
  for (const header of [undefined, OTHER]) {
    assert.deepEqual((await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, header)).data, { dispatch: false })
    assert.deepEqual(snapshot(f.store()), before)
  }
  const result = await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, OWNER)
  assert.deepEqual(result.data, { dispatch: true, deadline: expires })
  assert.deepEqual((await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, OWNER)).data, { dispatch: false })
  assert.deepEqual(f.store().attemptedForbiddenWrites, [])
})

test('expiry across dispatch reads or writes cannot leave a usable dispatch claim', async () => {
  for (const boundary of ['marker read', 'job write']) {
    const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), job = crypto.randomUUID()
    await f.reserve(job); const before = snapshot(f.store()), store = f.store()
    if (boundary === 'marker read') store.beforeRead = async key => { if (key === MARKER) { store.beforeRead = undefined; f.setNow(NOW + 1) } }
    else store.beforeWrite = async key => { if (key === `job:${job}`) { store.beforeWrite = undefined; f.setNow(NOW + 1) } }
    const result = await f.direct('/studio-dispatch', { id: job, fingerprint: FINGERPRINT }, OWNER)
    assert.notEqual(result.data.dispatch, true, boundary)
    assert.deepEqual(snapshot(store), before, boundary)
  }
})

test('reusing an old approval UUID is never advertised or admitted as fresh repaired authority', async () => {
  for (const key of [ORIGINAL, SUPPLEMENTAL]) {
    const old = key === ORIGINAL ? { approvalId: GRANT } : { grantId: GRANT }
    const f = fixture({ seed: { [key]: old } }), before = snapshot(f.store())
    assert.notEqual((await f.status()).astraRepairedMccGrant?.available, true)
    assert.equal((await f.reserve()).allowed, false)
    assert.deepEqual(snapshot(f.store()), before); assert.equal(f.globalStore().writes.length, 0)
  }
})
