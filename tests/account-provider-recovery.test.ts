import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, type EntitlementStorage } from '../server/entitlements.ts'
import { demoBlueprint, assetSpecForBlueprint } from '../src/lib/blueprint.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'

const ORIGIN = 'https://worldifact.test', ORACLE = 'https://fixture.trycloudflare.com'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PROVIDER = 'provider-budget-cents:v1', fingerprint = 'a'.repeat(64)
const idAt = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

function fixture() {
  const stores = new Map<string, Map<string, unknown>>()
  const lists: { prefix: string; startAfter?: string; limit: number }[] = []
  let now = Date.now()
  const env: StudioEnv & { ENABLE_ASTRA_PLANS: string } = { ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', ENABLE_ASTRA_PLANS: 'true', PUBLIC_PILOT: 'true',
    OWNER_ACCESS_TOKEN: 'fixture-receipt-'.repeat(4), ORACLE_ENDPOINT: ORACLE, ORACLE_API_TOKEN: 'inert-fixture-token',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const objects = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(name) {
    const key = String(name)
    if (!objects.has(key)) {
      const data = new Map<string, unknown>(); stores.set(key, data)
      let queue: Promise<unknown> = Promise.resolve()
      const storageFor = (map: Map<string, unknown>): EntitlementStorage => ({
        async get<T>(key: string) { return structuredClone(map.get(key)) as T | undefined },
        async put(key, value) { map.set(key, structuredClone(value)) },
        async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
          lists.push(options)
          return new Map([...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter)).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value) as T]))
        },
        transaction<T>(callback: (tx: EntitlementStorage) => Promise<T>) {
          const run = queue.then(async () => {
            const staged = structuredClone(map)
            const result = await callback(storageFor(staged))
            map.clear(); for (const [k, v] of staged) map.set(k, v)
            return result
          })
          queue = run.catch(() => undefined); return run
        },
      })
      objects.set(key, new AccountEntitlements({ storage: storageFor(data) }, env, () => now))
    }
    return objects.get(key)!
  } }
  const calls: { path: string; method: string }[] = []
  const unknown = new Set<string>(), malformed = new Set<string>()
  const fetcher = (async (request: Request | string | URL, init?: RequestInit) => {
    const url = new URL(String(request)), headers = new Headers(init?.headers)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: headers.get('Authorization') === 'Bearer bob-token' ? BOB : ALICE, email: 'fixture@example.test' })
    assert.equal(url.origin, ORACLE)
    assert.equal(headers.get('Authorization'), 'Bearer inert-fixture-token')
    assert.equal(init?.redirect, 'manual')
    assert.ok(init?.signal)
    assert.equal(init?.method ?? 'GET', 'GET', 'Recovery never starts paid work')
    calls.push({ path: url.pathname, method: init?.method ?? 'GET' })
    const match = /^\/v1\/jobs\/([a-f0-9-]{36})\/budget$/.exec(url.pathname)
    assert.ok(match)
    if (unknown.has(match[1])) return Response.json({ error: 'Unknown evidence' }, { status: 404 })
    return Response.json({ revision: 'worldifact-terminal-budget-v1', jobId: malformed.has(match[1]) ? idAt(9000) : match[1], model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 200001, sealed: true, sealId: 'b'.repeat(64) })
  }) as typeof fetch
  const call = (path: string, value?: unknown, user = ALICE) => entitlementCall<Record<string, unknown>>(env, user, path, value)
  const store = (user = ALICE) => stores.get(`account:v1:${user}`)!
  const fund = async (user = ALICE) => {
    await call('/grant', { id: 'in_fixture', credits: 7500, subscriptionId: 'sub_fixture' }, user)
    await call('/subscription', { id: 'sub_fixture', until: now + 86400000, active: true, revision: 1, plan: 'studio', grantId: 'in_fixture' }, user)
  }
  // These historical-recovery fixtures must be written with the legacy protocol.
  const legacyCall = async (path: string, value: unknown, user = ALICE) => {
    const object = env.ACCOUNT_ENTITLEMENTS!.get(env.ACCOUNT_ENTITLEMENTS!.idFromName(`account:v1:${user}`))
    const response = await object.fetch(new Request('https://entitlements.internal' + path, { method: 'POST', headers: { 'X-WORLDIFACT-Verified-Account': user }, body: JSON.stringify(value) }))
    assert.equal(response.status, 200); return await response.json() as Record<string, unknown>
  }
  const reserve = (id: string, channel = 'studio', user = ALICE) => legacyCall('/reserve', { id, channel, profile: channel === 'studio' ? 'slow' : 'fast', fingerprint, ...(channel === 'blueprint' ? { blueprintDispatch: 'fenced-v1' } : {}) }, user)
  const terminal = async (id: string, user = ALICE) => {
    await reserve(id, 'studio', user)
    await call('/studio-dispatch', { id, fingerprint }, user)
    await call('/settle', { id, state: 'failed' }, user)
  }
  const sweep = (cursor?: string | null, user = 'alice', extras = {}) => studioApi(new Request(ORIGIN + '/api/studio/reconcile-budget', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: `__Host-worldifact-access=${user}-token` },
    body: JSON.stringify({ ...(cursor !== undefined ? { cursor } : {}), ...extras }),
  }), env, fetcher)
  return { env, lists, calls, unknown, malformed, call, store, fund, terminal, reserve, sweep, advance: (ms: number) => { now += ms } }
}

test('account recovery revisits old terminal jobs after the current pointer was cleared, only once and only for their owner', async () => {
  const f = fixture(); await f.fund(); await f.fund(BOB)
  await f.terminal(idAt(1)); await f.terminal(idAt(2)); await f.terminal(idAt(3), BOB)
  await f.call('/studio-current-clear', { id: idAt(2) })
  const beforePoints = f.store().get('balance'), before = Number(f.store().get(PROVIDER))
  const response = await f.sweep()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { checked: 2, reconciled: 2, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false })
  assert.equal(f.store().get(PROVIDER), before + 2 * 154)
  assert.equal(f.store().get('balance'), beforePoints)
  assert.equal(f.store(BOB).get(PROVIDER), 5250 - 175)
  assert.deepEqual(f.calls.map(x => x.path), [1, 2].map(i => `/v1/jobs/${idAt(i)}/budget`))
  await Promise.all([f.sweep(), f.sweep(), f.sweep()])
  assert.equal(f.store().get(PROVIDER), before + 2 * 154)
  assert.equal(f.calls.length, 2)
})

test('pending account pages bound scan and receipt fanout, resume after scanned cursor, and retain unknown or malformed evidence', async () => {
  const f = fixture(); await f.fund()
  for (let i = 1; i <= 12; i++) await f.terminal(idAt(i))
  f.unknown.add(idAt(2)); f.malformed.add(idAt(3))
  const before = Number(f.store().get(PROVIDER))
  const first = await (await f.sweep()).json() as { checked: number; reconciled: number; nextCursor: string; hasMore: boolean }
  assert.equal(first.checked, 8); assert.equal(first.reconciled, 6); assert.equal(first.hasMore, true); assert.equal(first.nextCursor, idAt(8))
  assert.equal(f.store().get(PROVIDER), before + 6 * 154)
  const second = await (await f.sweep(first.nextCursor)).json() as { checked: number; reconciled: number; nextCursor: string | null; hasMore: boolean }
  assert.equal(second.checked, 4); assert.equal(second.reconciled, 4); assert.equal(second.hasMore, false); assert.equal(second.nextCursor, null)
  assert.equal(f.store().get(PROVIDER), before + 10 * 154)
  assert.ok(f.lists.every(options => ['job:', 'paid-points-job:v2:'].includes(options.prefix) && options.limit === 64))
  const proof = f.store().get(`job:${idAt(2)}`) as Record<string, unknown>
  assert.equal(proof.studioProviderReconciliation, undefined)
  assert.equal((await f.sweep(undefined, 'alice', { id: idAt(3), accountId: BOB })).status, 400)
})

test('historical ordinary holds can be found but older credit-debit and support records are never invented as recoverable funding', async () => {
  const f = fixture(); await f.fund()
  for (let i = 1; i <= 4; i++) await f.terminal(idAt(i))
  const historical = f.store().get(`job:${idAt(1)}`) as Record<string, unknown>
  delete historical.studioProviderReservation
  const older = f.store().get(`job:${idAt(2)}`) as Record<string, unknown>
  delete older.billingMode
  const support = f.store().get(`job:${idAt(3)}`) as Record<string, unknown>
  support.supportApprovalId = idAt(100)
  const pending = f.store().get(`job:${idAt(4)}`) as Record<string, unknown>
  pending.state = 'reserved'
  const response = await f.sweep(), value = await response.json() as { checked: number }
  assert.equal(value.checked, 1)
  assert.deepEqual(f.calls.map(x => x.path), [`/v1/jobs/${idAt(1)}/budget`])
})

test('blueprint cancellation before dispatch refunds only new proven unspent funding and closes every delayed dispatch', async () => {
  const f = fixture(); await f.fund()
  const id = idAt(1), before = f.store().get(PROVIDER)
  await f.reserve(id, 'blueprint')
  assert.equal(f.store().get(PROVIDER), Number(before) - 35)
  const replies = await Promise.all(Array.from({ length: 8 }, () => f.call('/settle', { id, state: 'failed' })))
  assert.equal(replies.filter(x => x.repeated === false).length, 1)
  assert.equal(f.store().get(PROVIDER), before)
  assert.equal(f.store().get('balance'), 7500)
  assert.equal((await f.call('/blueprint-dispatch', { id, fingerprint })).dispatch, false)
})

test('claimed, expired and historical Blueprint jobs cannot convert uncertain calls into new provider funding', async () => {
  const f = fixture(); await f.fund()
  for (const mode of ['claimed', 'legacy', 'expired']) {
    const id = crypto.randomUUID(), before = Number(f.store().get(PROVIDER))
    await f.reserve(id, 'blueprint')
    if (mode === 'claimed') {
      const claims = await Promise.all(Array.from({ length: 4 }, () => f.call('/blueprint-dispatch', { id, fingerprint })))
      assert.equal(claims.filter(x => x.dispatch === true).length, 1)
    }
    if (mode === 'legacy') {
      const job = f.store().get(`job:${id}`) as Record<string, unknown>
      delete job.blueprintProviderReservation; delete job.blueprintDispatch
    }
    if (mode === 'expired') {
      f.advance(10 * 60_000)
      assert.equal((await f.call('/blueprint-dispatch', { id, fingerprint })).dispatch, false)
    }
    await f.call('/settle', { id, state: 'failed' })
    assert.equal(f.store().get(PROVIDER), mode === 'expired' ? before : before - 35)
  }
})

test('an older deployed Blueprint caller never gains refundable proof merely by reaching a new account object', async () => {
  const f = fixture(); await f.fund()
  const id = crypto.randomUUID(), before = Number(f.store().get(PROVIDER))
  await f.call('/reserve', { id, profile: 'fast', channel: 'blueprint', fingerprint })
  const job = f.store().get(`job:${id}`) as Record<string, unknown>
  assert.equal(job.blueprintDispatch, undefined)
  assert.equal(job.blueprintProviderReservation, undefined)
  await f.call('/settle', { id, state: 'failed' })
  assert.equal(f.store().get(PROVIDER), before - 35)
  assert.equal((await f.call('/blueprint-dispatch', { id, fingerprint })).dispatch, false)
})

test('a page of unrelated historical jobs advances its cursor without skipping later eligible work', async () => {
  const f = fixture(); await f.fund()
  for (let i = 1; i <= 64; i++) f.store().set(`job:${idAt(i)}`, { state: 'failed', channel: 'blueprint' })
  await f.terminal(idAt(65))
  const first = await (await f.sweep()).json() as { checked: number; nextCursor: string; hasMore: boolean }
  assert.equal(first.checked, 0); assert.equal(first.nextCursor, idAt(64)); assert.equal(first.hasMore, true)
  assert.equal(f.calls.length, 0)
  const second = await (await f.sweep(first.nextCursor)).json() as { checked: number; reconciled: number; hasMore: boolean }
  assert.equal(second.checked, 1); assert.equal(second.reconciled, 1); assert.equal(second.hasMore, false)
})

test('historically valid uppercase job keys retain exact pagination order without blocking lowercase receipt recovery', async () => {
  const f = fixture(); await f.fund()
  const upper = (i: number) => `AAAAAAAA-AAAA-4AAA-8AAA-${String(i).padStart(12, '0')}`
  for (let i = 1; i <= 64; i++) f.store().set(`job:${upper(i)}`, { state: 'failed', channel: 'blueprint' })
  const eligible = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  await f.terminal(eligible)
  const first = await (await f.sweep()).json() as { checked: number; nextCursor: string; hasMore: boolean }
  assert.equal(first.checked, 0); assert.equal(first.nextCursor, upper(64)); assert.equal(first.hasMore, true)
  const second = await (await f.sweep(first.nextCursor)).json() as { checked: number; reconciled: number; hasMore: boolean }
  assert.equal(second.checked, 1); assert.equal(second.reconciled, 1); assert.equal(second.hasMore, false)
  assert.equal(f.lists.filter(options => options.prefix === 'job:').at(-1)?.startAfter, `job:${upper(64)}`)
  assert.deepEqual(f.calls.map(x => x.path), [`/v1/jobs/${eligible}/budget`])
})

test('authenticated mixed recovery includes completed Blueprint funding while making Oracle reads only for Studio', async () => {
  const f = fixture(); await f.fund(); const id = idAt(100), studio = idAt(101)
  await f.reserve(id, 'blueprint'); await f.call('/blueprint-dispatch', { id, fingerprint })
  const blueprint = demoBlueprint('An inert blue tower'), job = f.store().get(`job:${id}`) as { at: number }
  const blueprintSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(blueprint)))), n => n.toString(16).padStart(2, '0')).join('')
  await f.call('/blueprint-complete', { id, result: { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model: 'gpt-6-sol', limitation: 'Inert saved fixture', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_owned_fixture', receivedAt: new Date(job.at).toISOString(), blueprintSha256, inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } } })
  await f.terminal(studio)
  const before = Number(f.store().get(PROVIDER)), credits = f.store().get('balance')
  const result = await (await f.sweep()).json()
  assert.deepEqual(result, { checked: 2, reconciled: 2, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false })
  assert.equal(f.store().get(PROVIDER), before + 26 + 154)
  assert.equal(f.store().get('balance'), credits)
  assert.deepEqual(f.calls.map(x => x.path), [`/v1/jobs/${studio}/budget`])
  assert.doesNotMatch(JSON.stringify(result), /providerResponseId|sealId|Liability|resultSha256/)
})
