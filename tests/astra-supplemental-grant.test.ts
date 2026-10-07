import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AccountEntitlements, entitlementApi, entitlementCall, entitlementStatus,
  reserveUserGeneration, settleUserGeneration,
  type EntitlementEnv, type EntitlementStatus, type EntitlementStorage, type Reservation,
} from '../server/entitlements.ts'
import { getVerifiedAccount, type AccountEnv } from '../server/accounts.ts'
import type { AstraSupportIdentity } from '../server/astraSupportOnce.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'

const operationPath = (request: Request) => new URL(request.url).pathname.replace(/^\/generation-v3(?=\/)/, '')

// Entirely synthetic, in-memory tests: no provider, billing service or production account.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EMAIL = 'synthetic-support@example.invalid'
const GLOBAL = 'astra-support-supplemental:v1'
const OLD_GLOBAL = 'astra-support-once:v1'
const OLD_MARKER = 'support-astra-once:v1'
const APPROVAL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NEXT_APPROVAL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = Date.parse('2026-10-02T12:00:00.000Z')
const DAY = 86_400_000
const PROVIDER = 'provider-budget-cents:v1'
const MARKER = 'support-astra-supplemental:v1'
const HELD = 'customer-reserved-credits:v1'
const VERIFIED = 'X-WORLDIFACT-Verified-Account'
const FINGERPRINT = 'a'.repeat(64)
const config = (patch: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, accountId: OWNER, grantId: APPROVAL,
  issuedAt: new Date(NOW - 60_000).toISOString(),
  expiresAt: new Date(NOW + 60 * 60_000).toISOString(), amountCents: 175, ...patch,
})
const emailConfig = (patch: Record<string, unknown> = {}) => {
  const value = JSON.parse(config()) as Record<string, unknown>
  delete value.accountId
  return JSON.stringify({ ...value, accountEmail: EMAIL, ...patch })
}
const legacyConfig = () => {
  const value = JSON.parse(config()) as Record<string, unknown>
  value.approvalId = NEXT_APPROVAL; delete value.grantId
  return JSON.stringify(value)
}
type SupportStatus = EntitlementStatus & { astraSupplementalGrant?: { available: boolean; consumed: boolean; maximumProviderCents: number } }
type FixtureEnv = EntitlementEnv & AccountEnv & { WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT?: string; ENABLE_ASTRA_PLANS: string }
type Store = {
  values: Map<string, unknown>
  storage: EntitlementStorage
  writes: { key: string; value: unknown }[]
  failKey?: string
  beforeTransaction?: () => Promise<void>
  beforeRead?: (key: string) => Promise<void>
}

function fixture(options: { config?: string | null; mode?: string; seed?: Record<string, unknown>; astraEnabled?: boolean; identity?: AstraSupportIdentity; globalSeed?: Record<string, unknown>; legacyConfig?: string; legacyGlobalSeed?: Record<string, unknown> } = {}) {
  let now = NOW
  const stores = new Map<string, Store>()
  const objects = new Map<string, AccountEntitlements>()
  const requests: { name: string; header: string | null; path: string }[] = []
  const names: string[] = []
  const env: FixtureEnv = {
    ENABLE_ASTRA_PLANS: String(options.astraEnabled !== false), ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ...(options.mode === undefined ? {} : { ACCOUNT_LEDGER_MODE: options.mode }),
    ...(options.legacyConfig === undefined ? {} : { WORLDIFACT_ASTRA_SUPPORT_ONCE: options.legacyConfig }),
    ...(options.config === null ? {} : { WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT: options.config ?? config() }),
  }
  const nameFor = (account = OWNER) => `${env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'}:${account.toLowerCase()}`
  const ensure = (name: string) => {
    let store = stores.get(name)
    if (!store) {
      const values = new Map<string, unknown>(Object.entries(name === GLOBAL ? options.globalSeed ?? {} : name === OLD_GLOBAL ? options.legacyGlobalSeed ?? {} : {
        balance: 1500,
        subscription: { id: 'sub_Synthetic', active: true, until: NOW + 30 * DAY, revision: 1, plan: 'creator', grantId: 'in_Synthetic' },
        'grant:in_Synthetic': { credits: 1500, revoked: 0, subscriptionId: 'sub_Synthetic' },
        [PROVIDER]: 0, ...options.seed,
      }))
      let tail: Promise<unknown> = Promise.resolve()
      const writes: Store['writes'] = []
      const record: Store = { values, writes, storage: undefined as unknown as EntitlementStorage }
      const storage: EntitlementStorage = {
        async get<T>(key: string) { await record.beforeRead?.(key); return structuredClone(values.get(key)) as T | undefined },
        async put(key, value) {
          if (record.failKey === key) throw new Error('Synthetic write failure')
          writes.push({ key, value: structuredClone(value) }); values.set(key, structuredClone(value))
        },
        transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
          const next = tail.then(async () => {
            const before = record.beforeTransaction
            record.beforeTransaction = undefined
            if (before) await before()
            // Copy-on-write plus serialization models durable atomic commit and rollback.
            const draft = structuredClone(values), pending: Store['writes'] = []
            const transaction: EntitlementStorage = {
              async get<V>(key: string) { await record.beforeRead?.(key); return structuredClone(draft.get(key)) as V | undefined },
              async put(key, value) {
                if (record.failKey === key) throw new Error('Synthetic write failure')
                pending.push({ key, value: structuredClone(value) }); draft.set(key, structuredClone(value))
              },
              transaction: async fn => fn(transaction),
            }
            const result = await callback(transaction)
            values.clear(); for (const [key, value] of draft) values.set(key, value)
            writes.push(...pending)
            return result
          })
          tail = next.catch(() => undefined)
          return next
        },
      }
      record.storage = storage; stores.set(name, record); store = record
    }
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: store.storage }, env, () => now))
    return { store, object: objects.get(name)! }
  }
  env.ACCOUNT_ENTITLEMENTS = {
    idFromName(name) { names.push(name); return name },
    get(id) {
      const name = String(id)
      return { async fetch(request) {
        requests.push({ name, header: request.headers.get(VERIFIED), path: operationPath(request) })
        // Historical support fixtures keep the legacy policy/readiness and writer.
        // Current v3 dispatch, settlement and recovery still read these legacy rows.
        const path = new URL(request.url).pathname
        const legacyAdmission = path === '/generation-v3/status' || path === '/generation-v3/reserve'
          ? new Request(new URL(operationPath(request), request.url), request) : request
        return ensure(name).object.fetch(legacyAdmission)
      } }
    },
  }
  const store = (account = OWNER) => ensure(nameFor(account)).store
  const direct = async (path: string, body?: unknown, header?: string, account = OWNER) => {
    const response = await ensure(nameFor(account)).object.fetch(new Request(`https://synthetic.internal${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(header === undefined ? {} : { headers: { [VERIFIED]: header } }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
    return { status: response.status, data: await response.json() as Record<string, unknown> }
  }
  return {
    env, requests, names, store, direct, globalStore: () => ensure(GLOBAL).store, legacyStore: () => ensure(OLD_GLOBAL).store,
    status: (account = OWNER, identity = options.identity) => entitlementStatus(env, account, identity) as Promise<SupportStatus>,
    reserve: (id = crypto.randomUUID(), account = OWNER, identity = options.identity) => reserveUserGeneration(env, account, id, 'slow', 'astra', FINGERPRINT, 'standard', { channel: 'studio', prompt: 'Synthetic cabinet fixture', supportIdentity: identity }),
    restart() { objects.clear() }, setNow(value: number) { now = value },
  }
}
const studioInput = (patch: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), profile: 'slow', model: 'astra', channel: 'studio', fingerprint: FINGERPRINT, ...patch })
const snapshot = (store: Store) => structuredClone([...store.values])
function assertPrivate(value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of [OWNER, OTHER, EMAIL, APPROVAL, NEXT_APPROVAL, 'accountEmail', 'emailVerified', 'accountId', 'grantId', 'WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT', 'provider-budget-cents']) {
    assert.equal(text.includes(secret), false, `Public result must not contain ${secret}`)
  }
}

// Exercise invalid configuration through the authoritative API rather than mirroring its parser.
test('supplemental support is inert without a complete, exact, bounded configuration', async () => {
  const complete = JSON.parse(config()) as Record<string, unknown>
  const invalid: [string, string | null][] = [
    ['missing', null], ['empty', ''], ['malformed JSON', '{'], ['null', 'null'], ['array', '[]'], ['string', '"enabled"'], ['oversized raw value', ' '.repeat(1024) + config()],
    ['wrong version', config({ version: 2 })], ['string version', config({ version: '1' })],
    ['invalid account', config({ accountId: 'synthetic-non-uuid' })], ['invalid approval', config({ grantId: 'synthetic-non-uuid' })],
    ['amount too small', config({ amountCents: 174 })], ['amount too large', config({ amountCents: 176 })],
    ['two reservations', config({ amountCents: 350 })], ['string amount', config({ amountCents: '175' })],
    ['fractional amount', config({ amountCents: 175.5 })], ['extra quantity', config({ quantity: 2 })],
    ['extra arbitrary key', config({ enabled: true })],
    ['expired', config({ expiresAt: new Date(NOW).toISOString() })],
    ['future issue', config({ issuedAt: new Date(NOW + 1).toISOString() })],
    ['reversed window', config({ issuedAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW - 2000).toISOString() })],
    ['oversized window', config({ issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW - 60_000 + DAY + 1).toISOString() })],
    ['invalid issue date', config({ issuedAt: 'not-a-date' })], ['invalid expiry date', config({ expiresAt: 'not-a-date' })],
    ['numeric issue date', config({ issuedAt: NOW - 60_000 })], ['numeric expiry date', config({ expiresAt: NOW + 60_000 })],
  ]
  for (const key of Object.keys(complete)) {
    const incomplete = { ...complete }; delete incomplete[key]
    invalid.push([`missing ${key}`, JSON.stringify(incomplete)])
  }
  for (const [label, raw] of invalid) {
    const f = fixture({ config: raw }), store = f.store(), before = snapshot(store)
    const status = await f.status(), result = await f.reserve()
    assert.deepEqual(status.generationAdmission.astra, { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, label)
    assert.notEqual(status.astraSupplementalGrant?.available, true, label)
    assert.equal(result.allowed, false, label)
    assert.equal(result.reason, 'PROVIDER_BUDGET_EXHAUSTED', label)
    assert.deepEqual(snapshot(store), before, label)
    assertPrivate(status); assertPrivate(result)
  }
})

test('default and explicit live ledgers admit exactly 175 support cents and preserve the normal 250-point hold', async () => {
  for (const mode of [undefined, 'live']) {
    const f = fixture({ mode, config: config({ issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + DAY).toISOString() }) })
    const store = f.store(), job = crypto.randomUUID(), paidGrant = structuredClone(store.values.get('grant:in_Synthetic'))
    assert.deepEqual((await f.status()).astraSupplementalGrant, { available: true, consumed: false, maximumProviderCents: 175 })
    assert.deepEqual(await f.reserve(job), { allowed: true, repeated: false, cost: 250, kind: 'credits', held: true })
    assert.equal((store.values.get(`job:${job}`) as Record<string, unknown>).fundingMode, undefined, 'The fixture must retain historical support-funded accounting')
    assert.equal(store.values.has(`paid-points-job:v2:${job}`), false)
    assert.equal(store.values.get('balance'), 1500)
    assert.equal(store.values.get(HELD), 250)
    assert.equal(store.values.get(PROVIDER), 0, 'Supplemental funding and this reservation leave paid funding unchanged')
    assert.equal(store.values.has('creator-astra:in_Synthetic'), false, 'Funded generation does not create a subscription quota')
    const marker = store.values.get(MARKER) as Record<string, unknown>
    assert.deepEqual(marker, { version: 1, accountId: OWNER, grantId: APPROVAL, amountCents: 175, jobId: job, fingerprint: FINGERPRINT, at: NOW, issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + DAY).toISOString() }, 'The durable claim must bind its source, job and request')
    assert.deepEqual(store.values.get('grant:in_Synthetic'), paidGrant)
    assert.deepEqual([...store.values.keys()].filter(key => key.startsWith('grant:')), ['grant:in_Synthetic'], 'Support does not impersonate a Stripe payment')
    const status = await f.status()
    assert.deepEqual(status.astraSupplementalGrant, { available: false, consumed: true, maximumProviderCents: 175 })
    assert.equal(status.availableCredits, 1250)
    assertPrivate(status)
    assert.ok(f.requests.every(request => request.header === OWNER), 'The server helper forwards the verified account, including status reads')
  }
})

test('support keeps existing paid budget intact instead of spending it or multiplying the support grant', async () => {
  for (const baseline of [0, 1, 174]) {
    const f = fixture({ seed: { [PROVIDER]: baseline } }), store = f.store()
    await f.reserve()
    assert.equal(store.values.get(PROVIDER), baseline)
    assert.ok(store.values.has(MARKER))
    assert.equal(store.writes.filter(write => write.key === MARKER).length, 1)
  }
})

test('sandbox, absent internal identity and another verified account cannot see or consume support', async () => {
  const sandbox = fixture({ mode: 'sandbox' }), sandboxBefore = snapshot(sandbox.store())
  assert.equal((await sandbox.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.equal((await sandbox.status()).astraSupplementalGrant, undefined)
  assert.deepEqual(snapshot(sandbox.store()), sandboxBefore)
  assert.ok(sandbox.names.every(name => name.startsWith('account:sandbox:v1:')))
  const f = fixture(), store = f.store(), before = snapshot(store)
  for (const header of [undefined, OTHER, 'not-a-uuid']) {
    const status = await f.direct('/status', undefined, header)
    assert.equal(status.data.astraSupplementalGrant, undefined)
    const result = await f.direct('/reserve', studioInput(), header)
    assert.equal(result.data.allowed, false)
    assert.deepEqual(snapshot(store), before)
  }
  const otherBefore = snapshot(f.store(OTHER))
  assert.equal((await f.status(OTHER)).astraSupplementalGrant, undefined)
  assert.equal((await f.reserve(crypto.randomUUID(), OTHER)).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.deepEqual(snapshot(f.store(OTHER)), otherBefore)
  assert.equal((await f.reserve()).allowed, true, 'Denied foreign calls do not consume the owner allowance')
})

test('public status ignores a forged support identity and only returns the authenticated account projection', async () => {
  const f = fixture()
  let authReads = 0
  const fetcher = (async () => { authReads++; return Response.json({ id: OTHER }) }) as typeof fetch
  const url = `https://worldifact.test/api/account/entitlements?userId=${OWNER}&accountId=${OWNER}`
  const anonymous = await entitlementApi(new Request(url, { headers: { [VERIFIED]: OWNER } }), f.env, fetcher)
  assert.equal(anonymous?.status, 401); assert.equal(authReads, 0); assert.deepEqual(f.names, [])
  const response = await entitlementApi(new Request(url, { headers: { Cookie: '__Host-worldifact-access=synthetic-support-access', [VERIFIED]: OWNER } }), f.env, fetcher)
  assert.equal(response?.status, 200)
  assert.equal(response?.headers.get('Cache-Control'), 'private, no-store')
  const result = await response!.json() as SupportStatus
  assert.equal(result.astraSupplementalGrant, undefined)
  assert.deepEqual(result.generationAdmission.astra, { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' })
  assert.deepEqual(f.names, [GLOBAL, `account:v1:${OTHER}`])
  assert.equal(f.requests[0].header, OTHER, 'Caller-controlled internal headers must not survive verified identity forwarding')
  assertPrivate(result)
})

test('support status peeks are read-only before use, after consumption and when legacy funding is unseeded', async () => {
  const f = fixture(), store = f.store()
  for (let stage = 0; stage < 2; stage++) {
    const before = snapshot(store), writes = store.writes.length, globalBefore = snapshot(f.globalStore()), globalWrites = f.globalStore().writes.length
    for (let i = 0; i < 5; i++) {
      const status = await f.status()
      assert.equal(status.astraSupplementalGrant?.available, stage === 0)
      assert.equal(status.astraSupplementalGrant?.consumed, stage !== 0)
      assert.equal(status.studioAdmission.allowed, stage === 0)
      assert.deepEqual(status.generationAdmission.astra, { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, 'Blueprint admission must not borrow detailed Studio support')
    }
    assert.deepEqual(snapshot(store), before); assert.equal(store.writes.length, writes)
    assert.deepEqual(snapshot(f.globalStore()), globalBefore); assert.equal(f.globalStore().writes.length, globalWrites)
    if (stage === 0) await f.reserve()
  }
  const legacy = fixture(), legacyStore = legacy.store(); legacyStore.values.delete(PROVIDER)
  const before = snapshot(legacyStore)
  await legacy.status()
  assert.deepEqual(snapshot(legacyStore), before)
  assert.equal(legacyStore.values.has(PROVIDER), false, 'An eligibility read may never initialize provider funding')
})

test('support does not bypass billing review, runtime activation, point holds or negative provider debt', async () => {
  const active = { id: 'sub_Synthetic', active: true, until: NOW + DAY, revision: 1, plan: 'creator', grantId: 'in_Synthetic' }
  const cases: { label: string; seed?: Record<string, unknown>; enabled?: boolean; reason: string }[] = [
    { label: 'billing review', seed: { billingHold: true }, reason: 'BILLING_REVIEW_REQUIRED' },
    { label: 'negative points', seed: { balance: -1 }, reason: 'BILLING_REVIEW_REQUIRED' },
    { label: 'disabled Creator Astra runtime', enabled: false, reason: 'ASTRA_RUNTIME_DISABLED' },
    { label: 'disabled Pro Astra runtime', seed: { subscription: { ...active, plan: 'pro' } }, enabled: false, reason: 'ASTRA_RUNTIME_DISABLED' },
    { label: 'disabled Studio Astra runtime', seed: { subscription: { ...active, plan: 'studio' } }, enabled: false, reason: 'ASTRA_RUNTIME_DISABLED' },
    { label: 'insufficient points', seed: { balance: 249 }, reason: 'CREDITS_EXHAUSTED' },
    { label: 'points already held', seed: { [HELD]: 1251 }, reason: 'CREDITS_EXHAUSTED' },
    { label: 'negative paid funding', seed: { [PROVIDER]: -1 }, reason: 'PROVIDER_BUDGET_EXHAUSTED' },
    { label: 'larger funding debt', seed: { [PROVIDER]: -175 }, reason: 'PROVIDER_BUDGET_EXHAUSTED' },
  ]
  for (const item of cases) {
    const f = fixture({ seed: item.seed, astraEnabled: item.enabled }), store = f.store(), before = snapshot(store)
    const status = await f.status(), result = await f.reserve()
    assert.deepEqual(status.generationAdmission.astra, { allowed: false, reason: item.reason }, item.label)
    assert.deepEqual(status.studioAdmission, { allowed: false, reason: item.reason, tiers: {
      standard: { allowed: false, reason: item.reason, pricing: STUDIO_PRICING.standard },
      extended: { allowed: false, reason: item.reason, pricing: STUDIO_PRICING.extended },
    } }, item.label)
    assert.equal(status.astraSupplementalGrant?.available, false, item.label)
    assert.equal(result.allowed, false, item.label); assert.equal(result.reason, item.reason, item.label)
    assert.deepEqual(snapshot(store), before, item.label)
    assert.equal(store.values.has(MARKER), false, item.label)
  }
})

test('active paid memberships ignore historical Creator quota while support remains one-use', async () => {
  for (const plan of ['creator', 'pro', 'studio']) {
    const subscription = { id: 'sub_Synthetic', active: true, until: NOW + DAY, revision: 1, plan, grantId: 'in_Synthetic' }
    const f = fixture({ seed: { subscription, 'creator-astra:in_Synthetic': 6 } }), store = f.store()
    const status = await f.status()
    assert.equal(status.studioAdmission.allowed, true)
    assert.equal(status.astraSupplementalGrant?.available, true)
    assert.equal((await f.reserve()).allowed, true)
    assert.equal(store.values.get(HELD), 250)
    assert.equal(store.values.get(PROVIDER), 0)
    assert.equal(store.values.get('creator-astra:in_Synthetic'), 6, 'Historical quota is preserved but cannot block funded member work')
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED', 'Removing the period quota cannot duplicate support authority')
    assert.equal((await f.status()).astraSupplementalGrant?.consumed, true)
  }
})

test('invalid durable provider state remains unavailable and cannot be repaired with support', async () => {
  for (const value of [NaN, Infinity, 0.5, '0']) {
    const f = fixture({ seed: { [PROVIDER]: value } }), store = f.store(), before = snapshot(store)
    assert.deepEqual((await f.status()).generationAdmission.astra, { allowed: false, reason: 'ACCOUNT_ADMISSION_UNAVAILABLE' })
    const response = await f.direct('/reserve', studioInput(), OWNER)
    assert.equal(response.status, 503)
    assert.deepEqual(snapshot(store), before)
  }
})

test('Blueprint, Sol, Luna and missing or invalid fingerprints never consume the Studio Astra claim', async () => {
  const f = fixture(), store = f.store(), before = snapshot(store)
  for (const input of [
    studioInput({ channel: 'blueprint' }), studioInput({ channel: undefined }),
    studioInput({ profile: 'fast', model: 'sol' }), studioInput({ profile: 'fast', model: 'luna' }),
    studioInput({ profile: 'fast', model: 'astra' }), studioInput({ profile: 'slow', model: 'sol' }),
    studioInput({ fingerprint: undefined }), studioInput({ fingerprint: 'invalid' }), studioInput({ fingerprint: 'A'.repeat(64) }),
  ]) {
    const result = await f.direct('/reserve', input, OWNER)
    assert.notEqual(result.data.allowed, true)
    assert.deepEqual(snapshot(store), before)
  }
  assert.equal((await f.reserve()).allowed, true)
})

test('two simultaneous eligible jobs share one atomic grant, while concurrent same-job replays add nothing', async () => {
  const f = fixture(), store = f.store(), jobs = [crypto.randomUUID(), crypto.randomUUID()]
  const results = await Promise.all(jobs.map(job => f.reserve(job)))
  assert.equal(results.filter(result => result.allowed).length, 1)
  assert.equal(results.filter(result => result.reason === 'PROVIDER_BUDGET_EXHAUSTED').length, 1)
  const winner = jobs[results.findIndex(result => result.allowed)], before = snapshot(store)
  const replays = await Promise.all(Array.from({ length: 12 }, () => f.reserve(winner)))
  assert.ok(replays.every(result => result.allowed && result.repeated && result.cost === 250))
  assert.deepEqual(snapshot(store), before)
  assert.equal(store.writes.filter(write => write.key === MARKER).length, 1)
  assert.equal(store.values.get(PROVIDER), 0); assert.equal(store.values.get(HELD), 250)
  assert.equal([...store.values.keys()].filter(key => key.startsWith('job:')).length, 1)
})

test('the bound job rejects fingerprint, channel, model and quality mutations without granting again', async () => {
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  const store = f.store(), before = snapshot(store)
  for (const patch of [
    { fingerprint: 'b'.repeat(64) }, { channel: 'blueprint' },
    { profile: 'fast', model: 'sol' }, { qualityProfile: 'reference-character-v1' },
  ]) {
    const result = await entitlementCall<Reservation>(f.env, OWNER, '/reserve', studioInput({ id: job, ...patch }))
    assert.equal(result.allowed, false)
    assert.deepEqual(snapshot(store), before)
  }
  assert.equal((await f.reserve(job)).repeated, true)
})

test('support cannot be reused after expiry, object restart, config removal or a new approval UUID', async () => {
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  const store = f.store(), claim = structuredClone(store.values.get(MARKER))
  for (const raw of [config({ grantId: NEXT_APPROVAL }), undefined, config()]) {
    f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = raw; f.restart()
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal((await f.reserve(job)).repeated, true)
    assert.deepEqual(store.values.get(MARKER), claim)
    assert.equal(store.values.get(PROVIDER), 0)
  }
  f.setNow(NOW + 2 * 60 * 60_000); f.restart()
  assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.equal((await f.reserve(job)).repeated, true)
  assert.deepEqual(store.values.get(MARKER), claim)
})

test('an unused grant expires at the reservation boundary and status never extends it', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) })
  const store = f.store(), before = snapshot(store)
  assert.equal((await f.status()).astraSupplementalGrant?.available, true)
  f.setNow(NOW + 1)
  assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.notEqual((await f.status()).astraSupplementalGrant?.available, true)
  assert.deepEqual(snapshot(store), before)
})

test('a queued reserve must recheck support expiry when its atomic transaction actually starts', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), store = f.store(), before = snapshot(store)
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  store.beforeTransaction = async () => { entered(); await gate }
  const pending = f.reserve()
  await ready; f.setNow(NOW + 1); release()
  assert.equal((await pending).reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.deepEqual(snapshot(store), before)
})

test('failed or cancelled jobs release customer points, never support authority or provider spend', async () => {
  for (const failureCode of ['ORACLE_JOB_FAILED', 'ORACLE_CANCELLED'] as const) {
    const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
    const store = f.store(), claim = structuredClone(store.values.get(MARKER))
    await settleUserGeneration(f.env, OWNER, job, 'failed', failureCode)
    assert.equal(store.values.get('balance'), 1500); assert.equal(store.values.get(HELD), 0)
    assert.equal(store.values.get(PROVIDER), 0); assert.deepEqual(store.values.get(MARKER), claim)
    assert.equal(store.values.has('creator-astra:in_Synthetic'), false, 'Funded generation does not create a subscription quota')
    assert.equal((await f.reserve(job)).reason, 'JOB_ALREADY_FAILED')
    f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = config({ grantId: NEXT_APPROVAL }); f.restart()
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal((await f.status()).astraSupplementalGrant?.consumed, true)
  }
})

test('successful support work settles the standard 250 points exactly once without a provider refill', async () => {
  const f = fixture(), job = crypto.randomUUID(); await f.reserve(job)
  await settleUserGeneration(f.env, OWNER, job, 'completed')
  await settleUserGeneration(f.env, OWNER, job, 'completed')
  await settleUserGeneration(f.env, OWNER, job, 'failed')
  assert.equal(f.store().values.get('balance'), 1250); assert.equal(f.store().values.get(HELD), 0)
  assert.equal(f.store().values.get(PROVIDER), 0)
  assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
})

test('a failed account write rolls back local accounting while permanently binding the global claim to the same job', async () => {
  const f = fixture(), store = f.store(), job = crypto.randomUUID(), before = snapshot(store)
  store.failKey = `job:${job}`
  await assert.rejects(f.reserve(job), /temporarily unavailable/)
  assert.deepEqual(snapshot(store), before)
  assert.equal(store.values.has(MARKER), false)
  const globalClaim = structuredClone(f.globalStore().values.get(MARKER))
  assert.ok(globalClaim)
  assert.equal((await f.reserve()).allowed, false, 'An uncertain admission never releases global authority to another job')
  assert.deepEqual(f.globalStore().values.get(MARKER), globalClaim)
  store.failKey = undefined
  assert.equal((await f.reserve(job)).allowed, true, 'Only the exact unadmitted job can resume its existing claim')
  assert.equal(store.values.get(HELD), 250); assert.equal(store.values.get(PROVIDER), 0)
  assert.deepEqual(f.globalStore().values.get(MARKER), globalClaim)
})

test('any existing singleton claim stays consumed, even when its historical value is malformed', async () => {
  for (const marker of [null, false, 0, {}, { version: 1 }, { grantId: NEXT_APPROVAL }]) {
    const f = fixture({ seed: { [MARKER]: marker } }), store = f.store(), before = snapshot(store)
    const status = await f.status()
    assert.deepEqual(status.astraSupplementalGrant, { available: false, consumed: true, maximumProviderCents: 175 })
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.deepEqual(snapshot(store), before, 'Malformed historical markers must not create fresh spending authority')
  }
})

test('ordinary funded Blueprint, Sol and Luna reservations do not claim or fund the separate Studio support', async () => {
  for (const [model, channel, providerCost] of [['astra', 'blueprint', 175], ['sol', 'studio', 35], ['luna', 'studio', 10]] as const) {
    const f = fixture({ seed: { [PROVIDER]: 350 } }), store = f.store()
    const ordinary = await reserveUserGeneration(f.env, OWNER, crypto.randomUUID(), model === 'astra' ? 'slow' : 'fast', model, FINGERPRINT, 'standard', { channel })
    assert.equal(ordinary.allowed, true)
    assert.equal(store.values.get(PROVIDER), 350 - providerCost)
    assert.equal(store.values.has(MARKER), false)
    assert.equal((await f.status()).astraSupplementalGrant?.available, true)
    assert.equal((await f.reserve()).allowed, true)
    assert.equal(store.values.get(PROVIDER), 350 - providerCost - 175)
    assert.equal(store.values.has(MARKER), false)
  }
})

test('turning on support cannot retroactively grant it to a replay of an already funded Studio job', async () => {
  const f = fixture({ config: null, seed: { [PROVIDER]: 175 } }), job = crypto.randomUUID(), store = f.store()
  await f.reserve(job)
  assert.equal(store.values.get(PROVIDER), 0); assert.equal(store.values.has(MARKER), false)
  f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = config(); f.restart()
  const before = snapshot(store)
  assert.equal((await f.reserve(job)).repeated, true)
  assert.deepEqual(snapshot(store), before)
  assert.equal((await f.reserve()).allowed, true)
  assert.equal(store.values.get(HELD), 500)
  assert.equal(store.values.get(PROVIDER), 0)
})

test('authenticated owner status and job recovery never expose private approval configuration', async () => {
  const f = fixture(), job = crypto.randomUUID(), store = f.store()
  const fetcher = (async () => Response.json({ id: OWNER })) as typeof fetch
  const request = () => new Request('https://worldifact.test/api/account/entitlements', { headers: { Cookie: '__Host-worldifact-access=synthetic-support-owner-access' } })
  const before = snapshot(store)
  const initial = await entitlementApi(request(), f.env, fetcher)
  assert.equal(initial?.status, 200)
  const projected = await initial!.json() as SupportStatus
  assert.deepEqual(projected.studioAdmission, { allowed: true, tiers: {
    standard: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.standard },
    extended: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.extended },
  } })
  assert.deepEqual(projected.generationAdmission.astra, { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' })
  assertPrivate(projected); assert.deepEqual(snapshot(store), before)
  await f.reserve(job)
  for (const [path, body] of [['/job', { id: job }], ['/studio-current', {}]] as const) {
    assertPrivate(await entitlementCall(f.env, OWNER, path, body))
  }
  const consumed = await entitlementApi(request(), f.env, fetcher)
  assert.equal(consumed?.status, 200)
  assertPrivate(await consumed!.json())
})

test('email-scoped support requires the exact authenticated and confirmed email, with exclusive identity keys', async () => {
  const invalid = [
    config({ accountEmail: EMAIL }), emailConfig({ accountId: OWNER }), emailConfig({ accountEmail: '' }),
    emailConfig({ accountEmail: 'not-an-email' }), emailConfig({ accountEmail: ` ${EMAIL}` }),
    emailConfig({ accountEmail: 175 }), emailConfig({ extra: true }),
  ]
  for (const raw of invalid) {
    const f = fixture({ config: raw, identity: { email: EMAIL, emailVerified: true } })
    assert.notEqual((await f.status()).astraSupplementalGrant?.available, true)
    assert.equal((await f.reserve()).allowed, false)
    assert.equal(f.store().values.has(MARKER), false); assert.equal(f.globalStore().values.has(MARKER), false)
  }
  for (const identity of [undefined, { email: EMAIL }, { email: EMAIL, emailVerified: false }, { email: 'different@example.invalid', emailVerified: true }]) {
    const f = fixture({ config: emailConfig(), identity })
    assert.equal((await f.status()).astraSupplementalGrant, undefined)
    assert.equal((await f.reserve()).reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(f.globalStore().values.has(MARKER), false)
  }
  const f = fixture({ config: emailConfig(), identity: { email: EMAIL.toUpperCase(), emailVerified: true } })
  assert.deepEqual((await f.status()).astraSupplementalGrant, { available: true, consumed: false, maximumProviderCents: 175 })
  assert.equal((await f.reserve()).allowed, true)
  assert.equal(f.store().values.get(PROVIDER), 0); assert.equal(f.store().values.get(HELD), 250)
  assertPrivate(await f.status())
})

test('only authoritative email_confirmed_at supplies private email proof; client metadata and incoming headers do not', async () => {
  const cookie = '__Host-worldifact-access=synthetic-proof-access'
  const cases = [
    { email_confirmed_at: undefined }, { email_confirmed_at: null }, { email_confirmed_at: '' },
    { email_confirmed_at: 'invalid' }, { email_confirmed_at: new Date(Date.now() + DAY).toISOString() },
    { email_confirmed_at: undefined, confirmed_at: new Date(NOW - DAY).toISOString(), phone_confirmed_at: new Date(NOW - DAY).toISOString() },
    { email_confirmed_at: undefined, emailVerified: true, email_verified: true, user_metadata: { email_verified: true, email: EMAIL } },
    { email_confirmed_at: new Date(NOW - DAY).toISOString(), is_anonymous: true },
  ]
  for (const patch of cases) {
    const f = fixture({ config: emailConfig() })
    const fetcher = (async () => Response.json({ id: OWNER, email: EMAIL, ...patch })) as typeof fetch
    const request = () => new Request('https://worldifact.test/api/account/entitlements', { headers: {
      Cookie: cookie, [VERIFIED]: OWNER, 'X-WORLDIFACT-Verified-Email': EMAIL,
      'X-WORLDIFACT-Support-Approval': APPROVAL, 'X-WORLDIFACT-Support-Available': 'true',
    } })
    const user = await getVerifiedAccount(request(), f.env, fetcher)
    assert.ok(user); assert.equal(user.emailVerified, false)
    assert.equal(Object.keys(user).includes('emailVerified'), false)
    const response = await entitlementApi(request(), f.env, fetcher)
    assert.equal(response?.status, 200)
    const status = await response!.json() as SupportStatus
    assert.equal(status.astraSupplementalGrant, undefined)
    assert.equal((await f.reserve(crypto.randomUUID(), OWNER, user)).allowed, false)
    assert.equal(f.globalStore().values.has(MARKER), false)
    assertPrivate(status)
  }
  const f = fixture({ config: emailConfig() })
  const fetcher = (async () => Response.json({ id: OWNER, email: EMAIL, email_confirmed_at: new Date(NOW - DAY).toISOString() })) as typeof fetch
  const request = new Request('https://worldifact.test/api/account/entitlements', { headers: { Cookie: cookie } })
  const user = await getVerifiedAccount(request, f.env, fetcher)
  assert.ok(user); assert.equal(user.emailVerified, true)
  assert.equal(Object.keys(user).includes('emailVerified'), false)
  assert.equal(JSON.stringify(user).includes('emailVerified'), false, 'Server proof must not enter public account/session JSON')
  const response = await entitlementApi(request, f.env, fetcher)
  const status = await response!.json() as SupportStatus
  assert.deepEqual(status.studioAdmission, { allowed: true, tiers: {
    standard: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.standard },
    extended: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', pricing: STUDIO_PRICING.extended },
  } }); assertPrivate(status)
  assert.equal((await f.reserve(crypto.randomUUID(), OWNER, user)).allowed, true)
})

test('the global claim prevents reuse after the same verified email moves to another account or configuration rotates', async () => {
  const identity = { email: EMAIL, emailVerified: true }
  const f = fixture({ config: emailConfig(), identity }), job = crypto.randomUUID()
  assert.equal((await f.reserve(job)).allowed, true)
  const globalClaim = structuredClone(f.globalStore().values.get(MARKER)), otherBefore = snapshot(f.store(OTHER))
  assert.deepEqual(globalClaim, { version: 1, accountId: OWNER, grantId: APPROVAL, amountCents: 175, jobId: job, fingerprint: FINGERPRINT, at: NOW, issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + 60 * 60_000).toISOString() })
  for (const raw of [emailConfig(), emailConfig({ grantId: NEXT_APPROVAL }), config({ accountId: OTHER, grantId: NEXT_APPROVAL })]) {
    f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = raw; f.restart()
    assert.deepEqual((await f.status(OTHER)).astraSupplementalGrant, { available: false, consumed: true, maximumProviderCents: 175 })
    assert.equal((await f.reserve(job, OTHER)).allowed, false, 'Same UUID and fingerprint cannot move the claim to another account')
    assert.equal((await f.reserve(crypto.randomUUID(), OTHER)).allowed, false)
    assert.deepEqual(snapshot(f.store(OTHER)), otherBefore)
    assert.deepEqual(f.globalStore().values.get(MARKER), globalClaim)
  }
})

test('concurrent accounts sharing a verified email can claim only one global reservation', async () => {
  const f = fixture({ config: emailConfig(), identity: { email: EMAIL, emailVerified: true } })
  const jobs = [crypto.randomUUID(), crypto.randomUUID()]
  const outcomes = await Promise.all([f.reserve(jobs[0], OWNER), f.reserve(jobs[1], OTHER)])
  assert.equal(outcomes.filter(result => result.allowed).length, 1)
  assert.equal(outcomes.filter(result => result.reason === 'PROVIDER_BUDGET_EXHAUSTED').length, 1)
  const winner = outcomes[0].allowed ? OWNER : OTHER, loser = winner === OWNER ? OTHER : OWNER
  assert.equal(f.store(winner).values.get(HELD), 250)
  assert.equal(f.store(loser).values.get(HELD), undefined)
  assert.equal(f.globalStore().writes.filter(write => write.key === MARKER).length, 1)
  assert.equal(f.store(OWNER).values.get(PROVIDER), 0); assert.equal(f.store(OTHER).values.get(PROVIDER), 0)
})

test('corrupt existing global claims fail closed without funding an account or creating a replacement', async () => {
  for (const marker of [null, false, 0, {}, { version: 1 }, { grantId: NEXT_APPROVAL }]) {
    const f = fixture({ globalSeed: { [MARKER]: marker } }), before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
    assert.deepEqual((await f.status()).astraSupplementalGrant, { available: false, consumed: true, maximumProviderCents: 175 })
    assert.equal((await f.reserve()).allowed, false)
    assert.deepEqual(snapshot(f.store()), before)
    assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  }
})

test('a global storage failure grants no points, provider funding or job reservation', async () => {
  const f = fixture(), job = crypto.randomUUID(), before = snapshot(f.store())
  f.globalStore().failKey = MARKER
  await assert.rejects(f.reserve(job), /could not be confirmed/)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.globalStore().values.has(MARKER), false)
  f.globalStore().failKey = undefined
  assert.equal((await f.reserve(job)).allowed, true)
  assert.equal(f.globalStore().writes.filter(write => write.key === MARKER).length, 1)
})

test('the global authority checks expiry after waiting for its own serialized transaction', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), before = snapshot(f.store())
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  f.globalStore().beforeTransaction = async () => { entered(); await gate }
  const pending = f.reserve()
  await ready; f.setNow(NOW + 1); release()
  assert.equal((await pending).allowed, false)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.globalStore().values.has(MARKER), false)
})

test('already funded jobs spend ordinary budget and leave support unused, including safe-integer boundaries', async () => {
  for (const baseline of [175, 350, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ seed: { [PROVIDER]: baseline } })
    assert.equal((await f.reserve()).allowed, true)
    assert.equal(f.store().values.get(PROVIDER), baseline - 175)
    assert.equal(f.store().values.has(MARKER), false)
    assert.equal(f.globalStore().values.has(MARKER), false)
  }
})

test('an unavailable optional support status preserves ordinary account availability without advertising support', async () => {
  for (const baseline of [0, 175]) {
    const f = fixture({ seed: { [PROVIDER]: baseline } }), before = snapshot(f.store()), namespace = f.env.ACCOUNT_ENTITLEMENTS!
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      return String(id) === GLOBAL ? { async fetch() { throw new Error('Synthetic global status outage') } } : namespace.get(id)
    } }
    const status = await f.status()
    assert.equal(status.credits, 1500); assert.equal(status.astraSupplementalGrant, undefined)
    assert.equal(status.generationAdmission.astra.allowed, baseline >= 175)
    assert.equal(status.studioAdmission.allowed, baseline >= 175)
    assert.deepEqual(snapshot(f.store()), before)
    assertPrivate(status)
  }
})

test('a lost global claim response stops without automatic ledger retry and preserves only the exact pending job', async () => {
  const f = fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID(), before = snapshot(f.store())
  let dropped = false
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
    const object = namespace.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === GLOBAL && request.method === 'POST' && !dropped) {
        dropped = true; throw new Error('Synthetic response loss after durable global commit')
      }
      return response
    } }
  } }
  await assert.rejects(f.reserve(job), /could not be confirmed/)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.requests.filter(request => request.path === '/reserve').length, 1, 'Uncertain global admission must not retry the account mutation automatically')
  const claim = structuredClone(f.globalStore().values.get(MARKER))
  assert.ok(claim)
  assert.equal((await f.reserve()).allowed, false)
  assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  assert.equal((await f.reserve(job)).allowed, true)
  assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  assert.equal(f.globalStore().writes.filter(write => write.key === MARKER).length, 1)
  assert.equal(f.store().values.get(HELD), 250)
})

test('a pending claim cannot be revived or changed by editing its original issue or expiry window', async () => {
  const f = fixture(), job = crypto.randomUUID(), store = f.store(), before = snapshot(store)
  store.failKey = `job:${job}`
  await assert.rejects(f.reserve(job))
  store.failKey = undefined
  const claim = structuredClone(f.globalStore().values.get(MARKER))
  for (const raw of [
    config({ issuedAt: new Date(NOW - 60_001).toISOString() }),
    config({ expiresAt: new Date(NOW + 60 * 60_000 + 1).toISOString() }),
  ]) {
    f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = raw; f.restart()
    assert.equal((await f.reserve(job)).allowed, false)
    assert.deepEqual(snapshot(store), before); assert.deepEqual(f.globalStore().values.get(MARKER), claim)
  }
  f.setNow(NOW + 2 * 60 * 60_000)
  f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = config({ expiresAt: new Date(NOW + 3 * 60 * 60_000).toISOString() }); f.restart()
  assert.equal((await f.reserve(job)).allowed, false, 'An extended configuration never revives the expired original claim')
  assert.deepEqual(snapshot(store), before); assert.deepEqual(f.globalStore().values.get(MARKER), claim)
})

test('a pending global record with malformed claim time or extra fields cannot authorize account funding', async () => {
  for (const patch of [{ at: NOW + 1 }, { at: NOW - DAY }, { at: NOW + 60 * 60_000 }, { at: 0.5 }, { at: String(NOW) }, { extra: true }]) {
    const f = fixture(), job = crypto.randomUUID(), store = f.store(), before = snapshot(store)
    store.failKey = `job:${job}`
    await assert.rejects(f.reserve(job))
    store.failKey = undefined
    const corrupt = { ...f.globalStore().values.get(MARKER) as Record<string, unknown>, ...patch }
    f.globalStore().values.set(MARKER, corrupt); f.restart()
    assert.equal((await f.reserve(job)).allowed, false)
    assert.deepEqual(snapshot(store), before)
    assert.deepEqual(f.globalStore().values.get(MARKER), corrupt)
  }
})

test('the new grant preserves consumed old global and account claims and historical funding byte for byte', async () => {
  const original = { version: 1, approvalId: NEXT_APPROVAL, amountCents: 175, jobId: OTHER, fingerprint: 'e'.repeat(64), at: NOW - 1000 }
  const globalOriginal = { ...original, accountId: OWNER, issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + DAY).toISOString() }
  const f = fixture({ legacyConfig: legacyConfig(), seed: { [OLD_MARKER]: original, [PROVIDER]: 37 }, legacyGlobalSeed: { [OLD_MARKER]: globalOriginal } })
  const oldGlobal = snapshot(f.legacyStore()), oldLocal = JSON.stringify(f.store().values.get(OLD_MARKER))
  assert.equal((await f.status()).studioAdmission.allowed, true)
  const job = crypto.randomUUID()
  assert.equal((await f.reserve(job)).allowed, true)
  await settleUserGeneration(f.env, OWNER, job, 'failed', 'ASTRA_COST_LIMIT')
  assert.deepEqual(snapshot(f.legacyStore()), oldGlobal)
  assert.equal(JSON.stringify(f.store().values.get(OLD_MARKER)), oldLocal)
  assert.equal(f.store().values.get(PROVIDER), 37)
  assert.equal(f.store().values.get('balance'), 1500)
  assert.equal(f.store().values.get(HELD), 0)
  assert.equal(f.legacyStore().writes.length, 0)
  assert.equal(f.store().writes.filter(w => w.key === OLD_MARKER).length, 0)
  assert.equal((await f.reserve()).allowed, false)
})

test('when both approvals are unused, one job consumes only the original authority', async () => {
  const f = fixture({ legacyConfig: legacyConfig() })
  assert.equal((await f.reserve()).allowed, true)
  assert.ok(f.store().values.has(OLD_MARKER))
  assert.ok(f.legacyStore().values.has(OLD_MARKER))
  assert.equal(f.store().values.has(MARKER), false)
  assert.equal(f.globalStore().values.has(MARKER), false)
  assert.equal(f.globalStore().writes.length, 0)
})

test('an old global-only claim cannot silently fall through into the new grant', async () => {
  const f = fixture({ legacyConfig: legacyConfig(), legacyGlobalSeed: { [OLD_MARKER]: { historical: 'uncertain' } } })
  const before = snapshot(f.store())
  assert.equal((await f.reserve()).allowed, false)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.globalStore().writes.length, 0)
})

test('an old claim response loss never consumes supplemental authority', async () => {
  const f = fixture({ legacyConfig: legacyConfig() }), ns = f.env.ACCOUNT_ENTITLEMENTS!
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
    const object = ns.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === OLD_GLOBAL && request.method === 'POST') throw new Error('Synthetic old claim acknowledgement loss')
      return response
    } }
  } }
  await assert.rejects(f.reserve(), /could not be confirmed/)
  assert.ok(f.legacyStore().values.has(OLD_MARKER))
  assert.equal(f.globalStore().writes.length, 0)
  assert.equal(f.store().values.has(MARKER), false)
  assert.equal(f.store().values.get(HELD), undefined)
})

test('ordinary funded work leaves both original and supplemental authorities untouched', async () => {
  const f = fixture({ legacyConfig: legacyConfig(), seed: { [PROVIDER]: 175 } })
  assert.equal((await f.reserve()).allowed, true)
  assert.equal(f.store().values.get(PROVIDER), 0)
  assert.equal(f.legacyStore().writes.length, 0)
  assert.equal(f.globalStore().writes.length, 0)
  assert.equal(f.store().values.has(OLD_MARKER), false)
  assert.equal(f.store().values.has(MARKER), false)
})

test('a delayed global acknowledgement cannot authorize a different configuration window', async () => {
  for (const changed of [
    config({ issuedAt: new Date(NOW - 60_001).toISOString() }),
    config({ expiresAt: new Date(NOW + 2 * 60 * 60_000).toISOString() }),
  ]) {
    const f = fixture(), ns = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID(), before = snapshot(f.store())
    let entered!: () => void, release!: () => void
    const ready = new Promise<void>(r => { entered = r }), gate = new Promise<void>(r => { release = r })
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
      const object = ns.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        if (String(id) === GLOBAL && request.method === 'POST') { entered(); await gate }
        return response
      } }
    } }
    const pending = f.reserve(job)
    await ready
    const claim = structuredClone(f.globalStore().values.get(MARKER))
    f.env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = changed
    release()
    const result = await pending.catch(() => ({ allowed: false }))
    assert.equal(result.allowed, false)
    assert.deepEqual(snapshot(f.store()), before)
    assert.deepEqual(f.globalStore().values.get(MARKER), claim)
    assert.equal(f.globalStore().writes.filter(w => w.key === MARKER).length, 1)
  }
})

test('lost account admission acknowledgement recovers only the same job without another grant or point hold', async () => {
  const f = fixture(), ns = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID()
  let dropped = false
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
    const object = ns.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === `account:v1:${OWNER}` && operationPath(request) === '/reserve' && response.ok && !dropped) {
        dropped = true; throw new Error('Synthetic acknowledgement loss after account commit')
      }
      return response
    } }
  } }
  await assert.rejects(f.reserve(job), /temporarily unavailable/)
  const before = snapshot(f.store()), globalBefore = snapshot(f.globalStore())
  assert.equal(f.store().values.get(HELD), 250)
  assert.equal((await f.reserve(job)).repeated, true)
  assert.deepEqual(snapshot(f.store()), before)
  assert.deepEqual(snapshot(f.globalStore()), globalBefore)
  assert.equal((await f.reserve()).allowed, false)
})

test('the actual Studio API submits concurrent replays only once under the new grant', async () => {
  const now = Date.now(), f = fixture({ config: config({ issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 60 * 60_000).toISOString() }) })
  f.setNow(now)
  const env: StudioEnv = { ...f.env, OWNER_ACCESS_TOKEN: 'synthetic-owner-test-'.repeat(5),
    ORACLE_ENDPOINT: 'https://synthetic.trycloudflare.com', ORACLE_API_TOKEN: 'synthetic-oracle-token',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
  }
  const budgetValues = new Map<string, unknown>()
  let budgetTail: Promise<unknown> = Promise.resolve()
  const budgetStorage: BudgetStorage = {
    async get<T>(key: string) { return structuredClone(budgetValues.get(key)) as T | undefined },
    async put(key, value) { budgetValues.set(key, structuredClone(value)) },
    transaction<T>(fn: (s: BudgetStorage) => Promise<T>) {
      const next = budgetTail.then(() => fn(budgetStorage)); budgetTail = next.catch(() => {}); return next
    },
  }
  const budget = new GenerationBudget({ storage: budgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  let oraclePosts = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: OWNER, email: EMAIL, email_confirmed_at: new Date(NOW - DAY).toISOString() })
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs' && init?.method === 'POST') { oraclePosts++; return Response.json({ id: JSON.parse(String(init.body)).id, state: 'building' }) }
    return Response.json({ error: 'missing' }, { status: 404 })
  }) as typeof fetch
  const input = { worldId: 'enchanted-ai-shop', prompt: 'Synthetic detailed green dragon', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
  const call = (path: string, body: unknown, ticket?: string) => studioApi(new Request('https://worldifact.test' + path, {
    method: 'POST', headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json', Cookie: '__Host-worldifact-access=synthetic-cookie',
      ...(ticket ? { 'X-WORLDIFACT-Job': ticket, 'X-WORLDIFACT-Idempotency-Key': ticket.split('.')[0] } : {}) }, body: JSON.stringify(body),
  }), env, fetcher)
  const preparedResponse = await call('/api/studio/prepare', input)
  assert.equal(preparedResponse?.status, 200, await preparedResponse?.clone().text())
  const prepared = await preparedResponse!.json() as { id: string; ticket: string }
  const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/studio/jobs', input, prepared.ticket)))
  assert.ok(results.every(r => r && r.status < 500))
  assert.equal(oraclePosts, 1)
  assert.equal(f.globalStore().writes.filter(w => w.key === MARKER).length, 1)
  assert.equal(f.store().values.get(HELD), 250)
  assert.equal(f.store().values.get(PROVIDER), 0)
})

test('an unknown original support status never advertises supplemental admission that reserve cannot honor', async () => {
  const f = fixture({ legacyConfig: legacyConfig() }), ns = f.env.ACCOUNT_ENTITLEMENTS!, before = snapshot(f.store())
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
    return String(id) === OLD_GLOBAL ? { async fetch() { throw new Error('Synthetic old authority outage') } } : ns.get(id)
  } }
  const status = await f.status()
  assert.equal(status.studioAdmission.allowed, false)
  assert.notEqual(status.astraSupplementalGrant?.available, true)
  await assert.rejects(f.reserve(), /could not be confirmed/)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(f.globalStore().writes.length, 0)
})

test('global marker lookup crossing expiry cannot allocate a new grant', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), before = snapshot(f.store())
  const global = f.globalStore()
  global.beforeRead = async key => { if (key === MARKER) { global.beforeRead = undefined; f.setNow(NOW + 1) } }
  assert.equal((await f.reserve()).allowed, false)
  assert.deepEqual(snapshot(f.store()), before)
  assert.equal(global.values.has(MARKER), false)
})

test('account marker lookup crossing expiry cannot consume a previously acknowledged grant', async () => {
  const f = fixture({ config: config({ expiresAt: new Date(NOW + 1).toISOString() }) }), before = snapshot(f.store()), ns = f.env.ACCOUNT_ENTITLEMENTS!
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
    const object = ns.get(id)
    return { async fetch(request) {
      const response = await object.fetch(request)
      if (String(id) === GLOBAL && request.method === 'POST') {
        const account = f.store()
        account.beforeRead = async key => { if (key === MARKER) { account.beforeRead = undefined; f.setNow(NOW + 1) } }
      }
      return response
    } }
  } }
  assert.equal((await f.reserve()).allowed, false)
  assert.deepEqual(snapshot(f.store()), before)
  assert.ok(f.globalStore().values.has(MARKER), 'The earlier valid claim remains consumed, never recycled')
  assert.equal(f.store().values.has(MARKER), false)
})

test('malformed successful supplemental account acknowledgements cannot proceed as valid reservations', async () => {
  for (const bad of [
    { allowed: true }, { allowed: true, repeated: false, cost: 0, kind: 'free', held: false },
    { allowed: true, repeated: false, cost: 250, kind: 'credits', held: false },
    { allowed: true, repeated: true, cost: 250, kind: 'credits', held: true, state: 'failed' },
  ]) {
    const f = fixture(), ns = f.env.ACCOUNT_ENTITLEMENTS!, job = crypto.randomUUID()
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: ns.idFromName, get(id) {
      const object = ns.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request)
        return String(id) === `account:v1:${OWNER}` && operationPath(request) === '/reserve' && response.ok
          ? Response.json(bad) : response
      } }
    } }
    await assert.rejects(f.reserve(job), /could not be confirmed|temporarily unavailable/)
    assert.equal(f.store().values.get(HELD), 250, 'Committed admission remains recoverable; acknowledgement loss never refunds it')
    assert.equal(f.globalStore().writes.filter(w => w.key === MARKER).length, 1)
    assert.equal(f.store().values.get(PROVIDER), 0)
  }
})
