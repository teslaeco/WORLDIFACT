import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERNIGHT_TEST_APPROVAL, OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE, OVERNIGHT_TEST_ISSUED,
  OVERNIGHT_TEST_EXPIRES, OVERNIGHT_TEST_CENTS, OVERNIGHT_TEST_WORKFLOWS,
  overnightTestConfig, overnightTestAuthority, overnightWorkflow, matchesOvernightTestClaim, isOvernightTestClaim, overnightTestPoolRoute,
  type OvernightTestClaim, type OvernightTestEnv,
} from '../server/overnightTestBudget.ts'
import type { EntitlementStorage } from '../server/entitlements.ts'

// Synthetic identities and serialized local transactions only. No provider is contacted.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const JOB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const FINGERPRINT = 'a'.repeat(64)
const NOW = Date.parse('2026-10-06T05:00:00.000Z')
const START = Date.parse('2026-10-06T04:44:44.000Z')
const END = Date.parse('2026-10-06T12:00:00.000Z')
const VERIFIED = 'X-WORLDIFACT-Verified-Account'
const config = (patch: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, approvalId: 'api-tests-20261006-044444-usd4', accountId: OWNER,
  issuedAt: '2026-10-06T04:44:44.000Z', expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400, ...patch,
})
const projectConfig = (patch: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-05T11:00:00.000Z',
  maxProviderCents: 175, maxAttempts: 1, fingerprint: 'b'.repeat(64), ...patch,
})
const authority = () => overnightTestConfig(config(), OWNER, 'live', NOW)!
const input = (patch: Record<string, unknown> = {}) => ({ jobId: crypto.randomUUID(), fingerprint: FINGERPRINT, workflow: 'detailed-astra', ...patch })
const claim = (patch: Record<string, unknown> = {}): OvernightTestClaim => ({
  version: 1, source: 'overnight-test', approvalId: OVERNIGHT_TEST_APPROVAL, accountId: OWNER, jobId: JOB,
  fingerprint: FINGERPRINT, workflow: 'detailed-astra', model: 'gpt-6-astra', capCents: 175,
  claimedAt: NOW, expiresAt: OVERNIGHT_TEST_EXPIRES, ...patch,
} as OvernightTestClaim)
const pool = (claims: OvernightTestClaim[] = [claim()], patch: Record<string, unknown> = {}) => ({
  version: 1, authority: authority(), committedCents: claims.reduce((sum, item) => sum + item.capCents, 0), claims, ...patch,
})
function fixture(options: { config?: string | null; mode?: string; projectConfig?: string; seed?: Record<string, unknown> } = {}) {
  let now = NOW, tail: Promise<unknown> = Promise.resolve()
  const values = new Map<string, unknown>(Object.entries({
    balance: 1500, 'customer-reserved-credits:v1': 0, 'provider-budget-cents:v1': 17,
    'project-astra-mcc-budget:v1': { historical: true }, ...options.seed,
  }))
  const writes: string[] = [], reads: string[] = []
  const hooks: {
    beforeTransaction?: () => Promise<void>; beforeRead?: () => Promise<void>; afterPut?: () => Promise<void>
    failWrite?: boolean; loseAcknowledgement?: boolean
  } = {}
  const env: OvernightTestEnv = {
    ...(options.config === null ? {} : { WORLDIFACT_OVERNIGHT_TEST_BUDGET: options.config ?? config() }),
    ...(options.mode === undefined ? {} : { ACCOUNT_LEDGER_MODE: options.mode }),
    ...(options.projectConfig === undefined ? {} : { WORLDIFACT_ASTRA_PROJECT_BUDGET: options.projectConfig }),
  }
  const read = async <T>(target: Map<string, unknown>, key: string) => {
    reads.push(key)
    const hook = hooks.beforeRead; hooks.beforeRead = undefined; await hook?.()
    return structuredClone(target.get(key)) as T | undefined
  }
  const storage: EntitlementStorage = {
    get: key => read(values, key),
    async put() { throw new Error('Pool writes must use a transaction') },
    transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const next = tail.then(async () => {
        const before = hooks.beforeTransaction; hooks.beforeTransaction = undefined; await before?.()
        const draft = structuredClone(values), pending: string[] = []
        const tx: EntitlementStorage = {
          get: key => read(draft, key),
          async put(key, value) {
            assert.equal(key, OVERNIGHT_TEST_STATE, 'The pool must never write customer or historical funding')
            draft.set(key, structuredClone(value)); pending.push(key)
            const hook = hooks.afterPut; hooks.afterPut = undefined; await hook?.()
            if (hooks.failWrite) { hooks.failWrite = false; throw new Error('Inert post-write failure') }
          },
          transaction: async fn => fn(tx),
        }
        const result = await callback(tx)
        values.clear(); for (const [key, value] of draft) values.set(key, value)
        writes.push(...pending)
        if (hooks.loseAcknowledgement) { hooks.loseAcknowledgement = false; throw new Error('Inert lost committed response') }
        return result
      })
      tail = next.catch(() => undefined); return next
    },
  }
  const call = async (path: string, body?: unknown, account: string | null = OWNER, method?: string) => {
    const result = await overnightTestPoolRoute(new Request('https://synthetic.invalid' + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'), headers: account === null ? {} : { [VERIFIED]: account },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), storage, env, () => now)
    if (!result) return null
    return { status: result.status, headers: result.headers, data: await result.json() as Record<string, unknown> }
  }
  return {
    env, values, writes, reads, hooks, call, setNow: (value: number) => { now = value },
    status: (account: string | null = OWNER) => call('/overnight-test-status', undefined, account),
    reserve: (body: unknown = input(), account: string | null = OWNER) => call('/overnight-test-claim', body, account),
  }
}
const snapshot = (f: ReturnType<typeof fixture>) => structuredClone([...f.values])
function gate() {
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), waiting = new Promise<void>(resolve => { release = resolve })
  return { ready, release, pause: async () => { entered(); await waiting } }
}

test('overnight authority pins the one approval, namespace, storage and 395-cent allocation below USD4', () => {
  assert.equal(OVERNIGHT_TEST_APPROVAL, 'api-tests-20261006-044444-usd4')
  assert.equal(OVERNIGHT_TEST_NAMESPACE, 'api-tests-20261006-044444-usd4:v1')
  assert.equal(OVERNIGHT_TEST_STATE, 'overnight-api-test-budget:v1')
  assert.equal(OVERNIGHT_TEST_ISSUED, '2026-10-06T04:44:44.000Z')
  assert.equal(OVERNIGHT_TEST_EXPIRES, '2026-10-06T12:00:00.000Z')
  assert.equal(OVERNIGHT_TEST_CENTS, 400)
  assert.deepEqual(OVERNIGHT_TEST_WORKFLOWS, {
    'detailed-astra': { model: 'gpt-6-astra', capCents: 175, maxAttempts: 2, channel: 'studio' },
    'blueprint-sol': { model: 'gpt-6.1-sol', capCents: 35, maxAttempts: 1, channel: 'blueprint' },
    'blueprint-luna': { model: 'gpt-6-luna', capCents: 10, maxAttempts: 1, channel: 'blueprint' },
  })
  assert.equal(Object.values(OVERNIGHT_TEST_WORKFLOWS).reduce((sum, value) => sum + value.capCents * value.maxAttempts, 0), 395)
  assert.ok(Object.isFrozen(OVERNIGHT_TEST_WORKFLOWS))
  assert.ok(Object.values(OVERNIGHT_TEST_WORKFLOWS).every(Object.isFrozen))
})

test('strict configuration rejects missing, widened, malformed or unapproved authority', () => {
  assert.deepEqual(overnightTestConfig(config(), OWNER, undefined, NOW), JSON.parse(config()))
  assert.deepEqual(overnightTestConfig(config(), OWNER.toUpperCase(), 'live', NOW), JSON.parse(config()))
  const invalid: unknown[] = [undefined, null, {}, '', '{', 'null', '[]', 'false', ' '.repeat(1025) + config()]
  for (const patch of [
    { version: 2 }, { version: '1' }, { approvalId: 'overnight-api-tests-20261006-usd4' }, { accountId: OTHER },
    { accountId: OWNER.toUpperCase() }, { accountId: 'invalid' }, { accountEmail: 'synthetic@example.invalid' },
    { issuedAt: '2026-10-05T21:08:49Z' }, { issuedAt: '2026-10-05T21:08:48.000Z' },
    { expiresAt: '2026-10-06T12:00:00Z' }, { expiresAt: '2026-10-06T04:00:00.001Z' }, { expiresAt: END },
    { totalCents: 395 }, { totalCents: 401 }, { totalCents: '400' }, { reset: true }, { maxAttempts: 5 },
  ]) invalid.push(config(patch))
  for (const key of Object.keys(JSON.parse(config()))) {
    const value = JSON.parse(config()); delete value[key]; invalid.push(JSON.stringify(value))
  }
  for (const raw of invalid) assert.equal(overnightTestConfig(raw, OWNER, 'live', NOW), null, JSON.stringify(raw))
  for (const account of [undefined, null, {}, '', 'invalid', OTHER]) assert.equal(overnightTestConfig(config(), account, 'live', NOW), null)
  for (const mode of ['sandbox', 'invalid', '', null, false]) assert.equal(overnightTestConfig(config(), OWNER, mode, NOW), null)
  for (const now of [NaN, Infinity, NOW + 0.5, START - 1, END, END + 1]) assert.equal(overnightTestConfig(config(), OWNER, 'live', now), null)
  assert.ok(overnightTestConfig(config(), OWNER, 'live', START))
  assert.ok(overnightTestConfig(config(), OWNER, 'live', END - 1))
  assert.ok(overnightTestConfig(config(), OWNER, 'live', END, true), 'Historical inspection can identify expired authority')
  assert.equal(overnightTestConfig(config(), OWNER, 'live', START - 1, true), null)
})

test('the historical private selector supplies only exact account identity to fresh fixed overnight authority', () => {
  const env: OvernightTestEnv = { WORLDIFACT_ASTRA_PROJECT_BUDGET: projectConfig() }
  const before = structuredClone(env)
  const approved = overnightTestAuthority(env, OWNER, NOW)
  assert.deepEqual(approved, authority(), 'Expired historical dates, one attempt, 175 cents and fingerprint do not become overnight spending terms')
  assert.deepEqual(env, before)
  assert.deepEqual(overnightTestAuthority(env, OWNER.toUpperCase(), NOW), approved)
  for (const account of [OTHER, undefined, null, '', 'invalid']) assert.equal(overnightTestAuthority(env, account, NOW), null)
  for (const mode of ['sandbox', 'invalid', '']) assert.equal(overnightTestAuthority({ ...env, ACCOUNT_LEDGER_MODE: mode }, OWNER, NOW), null)
  for (const now of [START - 1, END, END + 1, NaN, Infinity]) assert.equal(overnightTestAuthority(env, OWNER, now), null)
  assert.ok(overnightTestAuthority(env, OWNER, START))
  assert.ok(overnightTestAuthority(env, OWNER, END - 1))
  assert.deepEqual(overnightTestAuthority(env, OWNER, END, true), approved)
  assert.equal(overnightTestAuthority(env, OWNER, START - 1, true), null)
  const text = JSON.stringify(approved)
  for (const field of ['maxProviderCents', 'maxAttempts', 'fingerprint', 'b'.repeat(64)]) assert.equal(text.includes(field), false)
})

test('malformed or post-approval private selectors and invalid explicit authority fail closed without fallback', () => {
  const invalid: (string | undefined)[] = [undefined, '', '{', 'null', '[]', '{}', ' '.repeat(1025) + projectConfig()]
  for (const patch of [
    { accountId: OTHER }, { accountId: OWNER.toUpperCase() }, { accountEmail: 'synthetic@example.invalid' },
    { version: 2 }, { maxAttempts: 2 }, { maxProviderCents: 400 }, { fingerprint: 'A'.repeat(64) },
    { issuedAt: '2026-10-06T05:00:00.000Z', expiresAt: '2026-10-05T23:00:00.000Z' },
    { issuedAt: '2026-10-05T10:00:00Z' }, { expiresAt: '2026-10-05T09:00:00.000Z' },
    { expiresAt: '2026-10-06T10:00:00.001Z' }, { additionalCredit: 225 },
  ]) invalid.push(projectConfig(patch))
  for (const key of Object.keys(JSON.parse(projectConfig()))) {
    const value = JSON.parse(projectConfig()); delete value[key]; invalid.push(JSON.stringify(value))
  }
  for (const raw of invalid) assert.equal(overnightTestAuthority({ WORLDIFACT_ASTRA_PROJECT_BUDGET: raw }, OWNER, NOW), null, raw)
  for (const explicit of ['', '{', 'null', '{}', config({ accountId: OTHER }), config({ totalCents: 800 }), config({ expiresAt: '2026-10-07T04:00:00.000Z' })]) {
    assert.equal(overnightTestAuthority({ WORLDIFACT_ASTRA_PROJECT_BUDGET: projectConfig(), WORLDIFACT_OVERNIGHT_TEST_BUDGET: explicit }, OWNER, NOW), null)
  }
  assert.deepEqual(overnightTestAuthority({ WORLDIFACT_ASTRA_PROJECT_BUDGET: '{', WORLDIFACT_OVERNIGHT_TEST_BUDGET: config() }, OWNER, NOW), authority())
})

test('private selector rotation cannot create a new pool, reuse historical spending, or transfer the remaining allowance', async () => {
  const f = fixture({ config: null, projectConfig: projectConfig() }), originalHistorical = f.values.get('project-astra-mcc-budget:v1')
  const requests = ['detailed-astra', 'detailed-astra', 'blueprint-sol', 'blueprint-luna'].map(workflow => input({ workflow }))
  for (const body of requests) assert.equal((await f.reserve(body))!.data.approved, true)
  const before = snapshot(f)
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = projectConfig({ fingerprint: 'c'.repeat(64), issuedAt: '2026-10-05T12:00:00.000Z', expiresAt: '2026-10-05T13:00:00.000Z' })
  assert.equal((await f.reserve())!.data.approved, false)
  assert.equal((await f.reserve(requests[0]))!.data.approved, true)
  assert.equal((await f.status())!.data.committedCents, 395)
  assert.deepEqual(snapshot(f), before)
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = projectConfig({ accountId: OTHER })
  assert.equal((await f.reserve(requests[0]))!.status, 403)
  assert.equal((await f.reserve(input(), OTHER))!.status, 503)
  assert.equal((await f.status(OTHER))!.status, 503)
  assert.deepEqual(snapshot(f), before)
  delete f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET
  assert.equal((await f.reserve())!.status, 403)
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = projectConfig()
  f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = ''
  assert.equal((await f.reserve(requests[0]))!.status, 403, 'Invalid explicit authority must not fall back to the valid private selector')
  assert.deepEqual(snapshot(f), before)
  assert.deepEqual(f.values.get('project-astra-mcc-budget:v1'), originalHistorical)
  assert.ok(f.reads.every(key => key === OVERNIGHT_TEST_STATE), 'The pool never inspects or consumes historical stored claims')
  assert.ok(f.writes.every(key => key === OVERNIGHT_TEST_STATE))
})

test('workflow resolution allows only the approved detailed Astra and procedural Sol/Luna pairings', () => {
  assert.equal(overnightWorkflow('studio', 'astra'), 'detailed-astra')
  assert.equal(overnightWorkflow('blueprint', 'sol'), 'blueprint-sol')
  assert.equal(overnightWorkflow('blueprint', 'luna'), 'blueprint-luna')
  for (const channel of [undefined, 'studio', 'blueprint', 'oracle', 'constructor']) for (const model of [undefined, 'astra', 'sol', 'luna', 'gpt-6-astra', 'gpt-6.1-sol', 'toString']) {
    if (channel === 'studio' && model === 'astra' || channel === 'blueprint' && (model === 'sol' || model === 'luna')) continue
    assert.equal(overnightWorkflow(channel, model), null, `${String(channel)} / ${String(model)}`)
  }
})

test('claim replay binds every identity, time, workflow, provider model and cap field', () => {
  const approved = authority(), original = claim()
  assert.equal(matchesOvernightTestClaim(original, approved, JOB, FINGERPRINT, 'detailed-astra', NOW), true)
  assert.equal(isOvernightTestClaim(original), true)
  const invalid: unknown[] = [null, undefined, [], {}, 'claim']
  for (const patch of [
    { version: 2 }, { source: 'ordinary' }, { approvalId: 'rotated' }, { accountId: OTHER }, { jobId: crypto.randomUUID() },
    { fingerprint: 'b'.repeat(64) }, { fingerprint: FINGERPRINT.toUpperCase() }, { workflow: 'blueprint-sol' },
    { model: 'gpt-6.1-sol' }, { model: 'gpt-6-astra-extra' }, { capCents: 174 }, { capCents: 176 }, { capCents: '175' },
    { claimedAt: NOW + 1 }, { claimedAt: START - 1 }, { claimedAt: END }, { claimedAt: NaN }, { claimedAt: NOW + 0.5 },
    { expiresAt: '2026-10-06T05:00:00.000Z' }, { state: 'failed' }, { refunded: true },
  ]) invalid.push({ ...original, ...patch })
  for (const key of Object.keys(original)) { const value = { ...original } as Record<string, unknown>; delete value[key]; invalid.push(value) }
  for (const value of invalid) assert.equal(matchesOvernightTestClaim(value, approved, JOB, FINGERPRINT, 'detailed-astra', NOW), false, JSON.stringify(value))
  assert.equal(matchesOvernightTestClaim(original, approved, crypto.randomUUID(), FINGERPRINT, 'detailed-astra', NOW), false)
  assert.equal(matchesOvernightTestClaim(original, approved, JOB, 'b'.repeat(64), 'detailed-astra', NOW), false)
  assert.equal(matchesOvernightTestClaim(original, approved, JOB, FINGERPRINT, 'blueprint-sol', NOW), false)
  for (const now of [NOW - 1, END, END + 1, NaN, Infinity]) assert.equal(matchesOvernightTestClaim(original, approved, JOB, FINGERPRINT, 'detailed-astra', now), false)
  assert.equal(isOvernightTestClaim(original), true, 'Historical classification is independent of the current wall clock')
  for (const value of [claim({ model: 'gpt-6-sol', workflow: 'blueprint-sol', capCents: 35 }), claim({ workflow: '__proto__' }), claim({ capCents: 0 }), claim({ accountId: 'invalid' })]) assert.equal(isOvernightTestClaim(value), false)
  for (const workflow of ['blueprint-sol', 'blueprint-luna'] as const) {
    const terms = OVERNIGHT_TEST_WORKFLOWS[workflow], value = claim({ workflow, model: terms.model, capCents: terms.capCents })
    assert.equal(matchesOvernightTestClaim(value, approved, JOB, FINGERPRINT, workflow, NOW), true)
    assert.equal(isOvernightTestClaim(value), true)
  }
})

test('status is private, read-only and cannot lazily create or refill the pool', async () => {
  const f = fixture()
  for (let consumed = 0; consumed < 2; consumed++) {
    const before = snapshot(f), writeCount = f.writes.length
    for (let n = 0; n < 3; n++) {
      const result = (await f.status())!
      assert.equal(result.status, 200); assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
      assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
      assert.equal(result.data.totalCents, 400); assert.equal(result.data.committedCents, consumed ? 175 : 0)
      assert.equal(result.data.noRecycling, true)
      const serialized = JSON.stringify(result.data)
      for (const privateValue of [OWNER, JOB, FINGERPRINT, 'accountId', 'jobId', 'fingerprint', 'WORLDIFACT_OVERNIGHT_TEST_BUDGET']) assert.equal(serialized.includes(privateValue), false)
    }
    assert.deepEqual(snapshot(f), before); assert.equal(f.writes.length, writeCount)
    if (!consumed) assert.equal((await f.reserve(input({ jobId: JOB })))!.data.approved, true)
  }
})

test('missing, foreign, sandbox, invalid or expired authority never writes a claim', async () => {
  for (const raw of [null, '', '{', 'null', config({ approvalId: 'rotated' }), config({ accountId: OTHER }), config({ totalCents: 401 })]) {
    const f = fixture({ config: raw }), before = snapshot(f)
    assert.equal((await f.reserve())!.data.approved, false)
    assert.notEqual((await f.status())!.data.available, true)
    assert.deepEqual(snapshot(f), before)
  }
  for (const mode of ['sandbox', 'invalid', '']) {
    const f = fixture({ mode }), before = snapshot(f)
    assert.equal((await f.reserve())!.data.approved, false); assert.deepEqual(snapshot(f), before)
  }
  for (const account of [null, OTHER, 'invalid']) {
    const f = fixture(), before = snapshot(f)
    assert.equal((await f.reserve(input(), account))!.status, 403)
    assert.equal((await f.status(account))!.status, 403); assert.deepEqual(snapshot(f), before)
  }
  for (const now of [START - 1, END, END + 1, NaN]) {
    const f = fixture(), before = snapshot(f); f.setNow(now)
    assert.equal((await f.reserve())!.data.approved, false); assert.deepEqual(snapshot(f), before)
  }
})

test('route validation rejects caller-supplied authority, caps, models, refunds and malformed claims', async () => {
  const f = fixture(), before = snapshot(f)
  for (const body of [
    'null', '[]', '{', '{}', ' '.repeat(513), input({ jobId: 'invalid' }), input({ jobId: JOB.toUpperCase() }),
    input({ fingerprint: 'A'.repeat(64) }), input({ fingerprint: 'a'.repeat(63) }), input({ workflow: '__proto__' }),
    input({ workflow: 'constructor' }), input({ workflow: 'blueprint-astra' }), input({ workflow: 'detailed-sol' }),
    input({ accountId: OWNER }), input({ model: 'gpt-6-astra' }), input({ capCents: 1 }), input({ totalCents: 500 }),
    input({ refund: true }), input({ approvalId: OVERNIGHT_TEST_APPROVAL }),
  ]) {
    assert.notEqual((await f.reserve(body))!.data.approved, true, JSON.stringify(body))
    assert.deepEqual(snapshot(f), before)
  }
  for (const [path, method] of [['/overnight-test-status', 'POST'], ['/overnight-test-claim', 'GET'], ['/overnight-test-status?reset=1', 'GET'], ['/overnight-test-claim?retry=1', 'POST']]) {
    const result = await f.call(path, method === 'POST' ? input() : undefined, OWNER, method)
    assert.equal(result!.status, 405); assert.deepEqual(snapshot(f), before)
  }
  for (const path of ['/overnight-test-reset', '/overnight-test-refund', '/overnight-test-activate', '/overnight-test-release']) assert.equal(await f.call(path, {}), null)
  assert.deepEqual(snapshot(f), before)
})

test('serialized concurrent requests reserve at most two detailed, one Sol and one Luna attempts', async () => {
  const f = fixture(), before = new Map(snapshot(f))
  const workflows = ['detailed-astra', 'blueprint-sol', 'blueprint-luna'] as const
  const requests = Array.from({ length: 36 }, (_, i) => input({ workflow: workflows[i % workflows.length] }))
  const results = await Promise.all(requests.map(body => f.reserve(body)))
  assert.equal(results.filter(result => result!.data.approved === true).length, 4)
  const status = (await f.status())!.data
  assert.equal(status.committedCents, 395); assert.equal(status.remainingCents, 5); assert.equal(status.available, false)
  assert.deepEqual(status.attempts, { 'detailed-astra': 2, 'blueprint-sol': 1, 'blueprint-luna': 1 })
  assert.equal(f.writes.length, 4)
  for (const [key, value] of before) assert.deepEqual(f.values.get(key), value, key)
  const state = f.values.get(OVERNIGHT_TEST_STATE) as ReturnType<typeof pool>
  assert.equal(state.claims.length, 4); assert.equal(new Set(state.claims.map(value => value.jobId)).size, 4)
  for (const [index, result] of results.entries()) if (result!.data.approved) {
    const writeCount: number = f.writes.length
    assert.deepEqual((await f.reserve(requests[index]))!.data, result!.data, 'Exact replay returns its immutable original claim')
    assert.equal(f.writes.length, writeCount)
  }
})

test('concurrent duplicate jobs consume one slot while changed fingerprints or workflows cannot replay it', async () => {
  const f = fixture(), body = input({ jobId: JOB })
  const replies = await Promise.all(Array.from({ length: 16 }, () => f.reserve(body)))
  for (const reply of replies) assert.deepEqual(reply!.data, replies[0]!.data)
  assert.equal(replies[0]!.data.approved, true); assert.equal(f.writes.length, 1)
  const before = snapshot(f)
  for (const patch of [{ fingerprint: 'b'.repeat(64) }, { workflow: 'blueprint-sol' }, { workflow: 'blueprint-luna' }]) {
    assert.equal((await f.reserve({ ...body, ...patch }))!.data.approved, false); assert.deepEqual(snapshot(f), before)
  }
  assert.equal((await f.reserve(input({ fingerprint: FINGERPRINT })))!.data.approved, true, 'A separately approved second detailed job may use the same input')
  assert.equal((await f.reserve(input()))!.data.approved, false)
})

test('occupied authority is immutable across config removal, rotation, another account and fresh handler calls', async () => {
  const f = fixture(), body = input({ jobId: JOB }); await f.reserve(body)
  const before = snapshot(f)
  for (const replacement of [undefined, '', '{', config({ accountId: OTHER }), config({ approvalId: 'renewed-approval' }), config({ expiresAt: '2026-10-07T04:00:00.000Z' }), config({ totalCents: 800 })]) {
    f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = replacement
    for (const account of [OWNER, OTHER]) for (const request of [body, input()]) {
      assert.notEqual((await f.reserve(request, account))!.data.approved, true); assert.deepEqual(snapshot(f), before)
    }
    assert.notEqual((await f.status(OTHER))!.data.available, true)
  }
  f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = config()
  assert.equal((await f.reserve(body))!.data.approved, true)
  assert.deepEqual(snapshot(f), before, 'Restoring exact authority does not create a fresh pool')
  assert.equal((await f.status())!.data.committedCents, 175)
  assert.equal([...f.values.keys()].filter(key => key.includes('overnight')).length, 1)
})

test('every corrupt occupied state fails closed without replacing or repairing the record', async () => {
  const original = pool(), corruptions: unknown[] = [null, false, 0, '', [], {}, { ...original, version: 2 },
    { ...original, committedCents: 0 }, { ...original, committedCents: 175.5 }, { ...original, committedCents: '175' },
    { ...original, committedCents: -1 }, { ...original, committedCents: Infinity }, { ...original, claims: [] },
    { ...original, claims: [claim(), claim()] }, { ...original, authority: null },
    { ...original, authority: { ...original.authority, accountId: OTHER } },
    { ...original, authority: { ...original.authority, totalCents: 800 } }, { ...original, reset: true },
    pool([claim({ model: 'gpt-6-sol' })]), pool([claim({ capCents: 174 })]), pool([claim({ claimedAt: END })]), pool([claim({ claimedAt: NOW + 1 })]),
    pool([claim({ accountId: OTHER })]), pool([claim({ state: 'failed' })]),
    pool(Array.from({ length: 3 }, () => claim({ jobId: crypto.randomUUID() }))),
    pool(Array.from({ length: 2 }, () => claim({ jobId: crypto.randomUUID(), workflow: 'blueprint-sol', model: 'gpt-6.1-sol', capCents: 35 }))),
    pool(Array.from({ length: 2 }, () => claim({ jobId: crypto.randomUUID(), workflow: 'blueprint-luna', model: 'gpt-6-luna', capCents: 10 }))),
  ]
  for (const key of Object.keys(original)) { const value = { ...original } as Record<string, unknown>; delete value[key]; corruptions.push(value) }
  for (const value of corruptions) {
    const f = fixture({ seed: { [OVERNIGHT_TEST_STATE]: value } }), before = snapshot(f)
    assert.equal((await f.status())!.status, 503, JSON.stringify(value))
    assert.equal((await f.reserve(input({ jobId: JOB })))!.status, 503, JSON.stringify(value))
    assert.equal((await f.reserve())!.status, 503, JSON.stringify(value))
    assert.deepEqual(snapshot(f), before); assert.equal(f.writes.length, 0)
  }
})

test('a future-dated occupied claim denies a different workflow without spending or rewriting the pool', async () => {
  const f = fixture({ seed: { [OVERNIGHT_TEST_STATE]: pool([claim({ claimedAt: NOW + 1 })]) } }), before = snapshot(f)
  assert.equal((await f.status())!.status, 503)
  for (const body of [input({ jobId: JOB }), input({ workflow: 'blueprint-sol' }), input({ workflow: 'blueprint-luna' })]) {
    assert.equal((await f.reserve(body))!.status, 503)
    assert.deepEqual(snapshot(f), before)
  }
  assert.equal(f.writes.length, 0)
})

test('expired pool stays committed for read-only reporting and rejects both new claims and exact replay', async () => {
  const f = fixture(), body = input({ jobId: JOB }); await f.reserve(body)
  const before = snapshot(f); f.setNow(END)
  assert.equal((await f.reserve(body))!.data.approved, false)
  assert.equal((await f.reserve())!.data.approved, false)
  const status = (await f.status())!.data
  assert.equal(status.available, false); assert.equal(status.committedCents, 175); assert.equal(status.remainingCents, 225)
  assert.equal(status.expiresAt, '2026-10-06T12:00:00.000Z'); assert.equal(status.noRecycling, true)
  assert.deepEqual(snapshot(f), before)
})

test('expiry or authority rotation while waiting for the transaction denies without spending', async () => {
  for (const mutate of [(f: ReturnType<typeof fixture>) => f.setNow(END), (f: ReturnType<typeof fixture>) => { f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = config({ accountId: OTHER }) }, (f: ReturnType<typeof fixture>) => { delete f.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET }]) {
    const f = fixture(), before = snapshot(f), wait = gate(); f.hooks.beforeTransaction = wait.pause
    const pending = f.reserve(); await wait.ready; mutate(f); wait.release()
    assert.equal((await pending)!.data.approved, false); assert.deepEqual(snapshot(f), before)
  }
})

test('a failed transaction rolls back its written claim, while lost post-commit acknowledgement never frees capacity', async () => {
  const f = fixture(), body = input({ jobId: JOB }), before = snapshot(f)
  f.hooks.failWrite = true
  assert.equal((await f.reserve(body))!.status, 503)
  assert.deepEqual(snapshot(f), before); assert.equal(f.writes.length, 0)
  f.hooks.loseAcknowledgement = true
  assert.equal((await f.reserve(body))!.status, 503)
  assert.equal((await f.status())!.data.committedCents, 175); assert.equal(f.writes.length, 1)
  const committed = snapshot(f)
  assert.equal((await f.reserve({ ...body, fingerprint: 'b'.repeat(64) }))!.data.approved, false)
  assert.equal((await f.reserve(body))!.data.approved, true)
  assert.deepEqual(snapshot(f), committed); assert.equal(f.writes.length, 1)
  assert.equal((await f.reserve())!.data.approved, true)
  assert.equal((await f.reserve())!.data.approved, false)
  assert.equal((await f.status())!.data.committedCents, 350)
})

test('expiry during persistence retains the conservative commitment and denies dispatch acknowledgement', async () => {
  const f = fixture(), body = input({ jobId: JOB })
  f.setNow(END - 1); f.hooks.afterPut = async () => { f.setNow(END) }
  assert.equal((await f.reserve(body))!.data.approved, false)
  assert.equal((await f.status())!.data.committedCents, 175)
  assert.equal((await f.reserve(body))!.data.approved, false)
  assert.equal(f.writes.length, 1)
})
