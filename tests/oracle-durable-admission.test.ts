import test from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { AccountEntitlements, entitlementCall, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'

const origin = 'https://admission.example.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const revision = 'oracle-durable-admission-v1'
const hex = (value: ArrayBuffer) => Buffer.from(value).toString('hex')

function storage() {
  const values = new Map<string, unknown>()
  let queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (s: EntitlementStorage) => Promise<T>) {
      const next = queue.then(() => callback(store)); queue = next.catch(() => {}); return next
    },
  }
  return { store, snapshot: () => structuredClone(Object.fromEntries(values)) }
}

async function fixture() {
  const events: string[] = [], inbox = new Map<string, Record<string, string>>()
  const bodies = new Map<string, string>(), starts = new Map<string, number>()
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'inert-admission-owner-'.repeat(3), ORACLE_API_TOKEN: 'inert-admission-token',
    ORACLE_ENDPOINT: 'https://admission.trycloudflare.com', PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true',
    ENABLE_ASTRA_PLANS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { limit: async () => ({ success: true }) } }
  const pool = new GenerationBudget({ storage: storage().store as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: n => n, get: () => ({ async fetch(request: Request) {
    const path = new URL(request.url).pathname
    if (path === '/reserve-studio') events.push('budget')
    return pool.fetch(request)
  } }) }
  const accounts = new Map<string, { object: AccountEntitlements; snapshot: () => Record<string, unknown> }>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: n => n, get: key => {
    const name = String(key)
    if (!accounts.has(name)) { const s = storage(); accounts.set(name, { object: new AccountEntitlements({ storage: s.store }, env), snapshot: s.snapshot }) }
    return { async fetch(request: Request) {
      const path = new URL(request.url).pathname
      if (path === '/generation-v3/reserve') events.push('account')
      if (path.endsWith('/studio-dispatch')) events.push('claim')
      return accounts.get(name)!.object.fetch(request)
    } }
  } }
  let stageFault: 'none' | '429' | 'timeout' | 'hash' | 'lost-ack' = 'none'
  let startFault: 'none' | 'timeout' | 'truncated' = 'none'
  let missing = false
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, headers = new Headers(init?.headers)
    if (path === '/auth/v1/user') return Response.json({ id: headers.get('Authorization')!.slice(7), email: 'inert@example.test' })
    assert.equal(new URL(String(url)).hostname, 'admission.trycloudflare.com', 'No real provider destination')
    assert.equal(headers.get('Authorization'), 'Bearer inert-admission-token')
    if (path === '/v1/health') return Response.json({ ...detailedHealthFixture, studioAdmissionRevision: revision,
      studioExecutionRevision: 'studio-execution-v1', studioExecutionModels: ['astra','sol','luna'], studioExecutionModes: ['standard','fast'] })
    if (path === '/v1/jobs/stage') {
      events.push('stage')
      if (stageFault === '429') return Response.json({}, { status: 429 })
      if (stageFault === 'timeout') throw new Error('Inert tunnel loss')
      const raw = String(init?.body), value = JSON.parse(raw)
      const proof = { revision, id: value.id, owner: headers.get('X-WORLDIFACT-Owner')!, fingerprint: headers.get('X-WORLDIFACT-Fingerprint')!,
        payloadSha256: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), phase: 'staged' }
      assert.match(proof.owner, /^[a-f0-9]{64}$/); assert.match(proof.fingerprint, /^[a-f0-9]{64}$/)
      assert.notEqual(proof.owner, alice)
      if (inbox.has(value.id)) assert.deepEqual({ ...inbox.get(value.id), phase: 'staged' }, proof)
      else { inbox.set(value.id, proof); bodies.set(value.id, raw) }
      if (stageFault === 'lost-ack') throw new Error('Lost durable ACK')
      return Response.json({ id: value.id, state: 'pending', admission: { ...proof, ...(stageFault === 'hash' ? { payloadSha256: '0'.repeat(64) } : {}) } })
    }
    if (path === '/v1/jobs/start') {
      events.push('start')
      const value = JSON.parse(String(init?.body)), proof = inbox.get(value.id)!
      assert.deepEqual(Object.keys(value).sort(), ['deadline','id','payloadSha256'])
      assert.equal(value.payloadSha256, proof.payloadSha256)
      assert.equal(headers.get('X-WORLDIFACT-Owner'), proof.owner)
      assert.equal(headers.get('X-WORLDIFACT-Fingerprint'), proof.fingerprint)
      assert.ok(value.deadline > Date.now())
      starts.set(value.id, (starts.get(value.id) ?? 0) + 1)
      assert.equal(starts.get(value.id), 1, 'Never replay an ambiguous START')
      proof.phase = 'authorized'
      if (startFault === 'timeout') throw new Error('Lost start ACK')
      if (startFault === 'truncated') return new Response('{"id":')
      return Response.json({ id: value.id, state: 'pending', admission: proof })
    }
    assert.equal(init?.method ?? 'GET', 'GET', 'No legacy paid fallback')
    const id = path.split('/').pop()!, proof = inbox.get(id)
    return !missing && proof ? Response.json({ id, state: 'pending', admission: proof }) : Response.json({}, { status: 404 })
  }) as typeof fetch
  const call = (account: string, path: string, body?: unknown, ticket?: string) => studioApi(new Request(origin + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
      Cookie: '__Host-worldifact-access=' + account, 'X-WORLDIFACT-Paid-Points-Policy': 'paid-membership-held-points-v1',
      ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  const fund = async (account: string) => {
    await entitlementCall(env, account, '/grant', { id: 'in_admission', credits: 10000, subscriptionId: 'sub_admission' })
    await entitlementCall(env, account, '/subscription', { id: 'sub_admission', active: true, until: Date.now()+86400000, revision: 1, plan: 'studio', grantId: 'in_admission' })
  }
  await Promise.all([fund(alice), fund(bob)])
  return { call, fund, events, inbox, bodies, starts, accounts,
    snapshot: (account = alice) => accounts.get('account:v1:' + account)!.snapshot(),
    stageFault: (fault: typeof stageFault) => { stageFault = fault }, startFault: (fault: typeof startFault) => { startFault = fault }, missing: () => { missing = true } }
}

const input = (model: 'astra' | 'sol' | 'luna' = 'sol', mode: 'standard' | 'fast' = 'fast'): StudioInput => ({
  worldId: 'enchanted-ai-shop', prompt: 'Inert durable admission test', purpose: 'figurine', textureMaxSize: 4096, photos: [],
  studioExecution: { revision: 'studio-execution-v1', model, mode },
})
const prepared = async (f: Awaited<ReturnType<typeof fixture>>, account = alice, value = input()) => {
  const response = await f.call(account, '/api/studio/prepare', value)
  assert.equal(response.status, 200)
  return response.json() as Promise<{ id: string; ticket: string }>
}

test('Oracle commits the exact request before account/budget writes and one-use start', async () => {
  const f = await fixture(), receipt = await prepared(f)
  const response = await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)
  assert.equal(response.status, 202, await response.text())
  assert.deepEqual(f.events, ['stage','account','budget','claim','start'])
  assert.deepEqual(JSON.parse(f.bodies.get(receipt.id)!).studioExecution, input().studioExecution)
  const saved = f.snapshot()
  await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)
  assert.deepEqual(f.snapshot(), saved)
  assert.equal(f.starts.get(receipt.id), 1)
})

test('unconfirmed nonbillable staging never reserves points or falls back to paid submission', async () => {
  for (const fault of ['429','timeout','hash','lost-ack'] as const) {
    const f = await fixture(), receipt = await prepared(f), saved = f.snapshot()
    f.stageFault(fault)
    assert.equal((await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)).status, 503, fault)
    assert.deepEqual(f.snapshot(), saved, fault)
    assert.deepEqual(f.events, ['stage'], fault)
    f.stageFault('none')
    assert.equal((await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)).status, 202)
    assert.equal(f.starts.get(receipt.id), 1)
  }
})

test('lost, truncated and missing START acknowledgement recover only the same ID without changing holds', async () => {
  for (const fault of ['timeout','truncated'] as const) {
    const f = await fixture(), receipt = await prepared(f)
    f.startFault(fault)
    assert.equal((await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)).status, 202)
    const saved = f.snapshot()
    f.missing()
    for (let i=0; i<3; i++) {
      await f.call(alice, '/api/studio/jobs/' + receipt.id, undefined, receipt.ticket)
      await f.call(alice, '/api/studio/jobs', input(), receipt.ticket)
    }
    assert.equal(f.starts.get(receipt.id), 1)
    assert.deepEqual(f.snapshot(), saved)
  }
})

test('twelve independent requests preserve six model/mode selections and account ownership', async () => {
  const f = await fixture()
  let i=0
  for (const model of ['astra','sol','luna'] as const) for (const mode of ['standard','fast'] as const) for (let repeat=0; repeat<2; repeat++) {
    const account = `${(++i).toString(16).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    await f.fund(account)
    const value = input(model, mode), receipt = await prepared(f, account, value)
    assert.equal((await f.call(account, '/api/studio/jobs', value, receipt.ticket)).status, 202)
    assert.equal((await f.call(bob, '/api/studio/jobs', value, receipt.ticket)).status, 401)
    assert.deepEqual(JSON.parse(f.bodies.get(receipt.id)!).studioExecution, value.studioExecution)
    assert.equal(f.starts.get(receipt.id), 1)
  }
  assert.equal(f.inbox.size, 12)
})

test('concurrent double-clicks and different accounts cannot dispatch the same ID twice', async () => {
  const f = await fixture(), a = await prepared(f), b = await prepared(f, bob)
  const replies = await Promise.all([alice,bob].flatMap(account => Array.from({ length: 3 }, () =>
    f.call(account, '/api/studio/jobs', input(), account === alice ? a.ticket : b.ticket))))
  // A concurrent late stage read may observe authorized and safely refuse before
  // funding. It must not create a second execution or a changed account charge.
  assert.ok(replies.every(r => [202,503].includes(r.status)))
  assert.equal(f.starts.get(a.id), 1); assert.equal(f.starts.get(b.id), 1)
  assert.notEqual(f.inbox.get(a.id)!.owner, f.inbox.get(b.id)!.owner)
})
