import { reviewedOracleHealth } from './fixtures/detailedOracle.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import type { StudioInput, StudioJob } from '../src/lib/studioProtocol.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A detailed blue chess rook', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function storage(): EntitlementStorage {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (value: EntitlementStorage) => Promise<T>) { const next = queue.then(() => callback(store)); queue = next.catch(() => {}); return next },
  }
  return store
}
function fixture() {
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'owner-test-'.repeat(5), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'test-oracle',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: storage() as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const users = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) { const key = String(id); if (!users.has(key)) users.set(key, new AccountEntitlements({ storage: storage() })); return users.get(key)! } }
  let posts = 0, artifacts = 0, loss = false, busy = false, state: StudioJob['state'] = 'succeeded', status404 = false
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer alice-token') return Response.json({ id: alice, email: 'alice@example.test' })
      if (token === 'Bearer bob-token') return Response.json({ id: bob, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    if (path === '/v1/health') return Response.json(reviewedOracleHealth)
    if (path === '/v1/jobs') {
      posts++
      if (loss) throw new Error('Unconfirmed transport acceptance')
      if (busy) return Response.json({ error: 'Serwer wykonuje poprzedni model. Poczekaj na wynik.' }, { status: 409 })
      return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' })
    }
    if (/\/model$|\/exports\//.test(path)) {
      artifacts++
      const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
      view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 24, true)
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '24' } })
    }
    if (status404) return Response.json({}, { status: 404 })
    return Response.json({ id: path.split('/').pop(), state })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, user: 'alice' | 'bob' | null = 'alice') => studioApi(new Request(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}), ...(user ? { Cookie: `__Host-worldifact-access=${user}-token` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  const prepare = async () => await (await call('/api/studio/prepare', 'POST', input)).json() as { id: string; ticket: string }
  const subscribe = async () => {
    await entitlementCall(env, alice, '/grant', { id: 'in_subscription', credits: 4500, subscriptionId: 'sub_test' })
    await entitlementCall(env, alice, '/subscription', { id: 'sub_test', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_subscription' })
  }
  return { env, call, prepare, subscribe, posts: () => posts, artifacts: () => artifacts, fail: () => { state = 'failed' },
    busy: () => { busy = true }, lose: () => { loss = true; status404 = true } }
}

test('account-bound prepared receipts cannot be submitted or read by another user', async () => {
  const f = fixture()
  assert.equal((await f.call('/api/studio/prepare', 'POST', input, undefined, null)).status, 401)
  const receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket, 'bob')).status, 401)
  assert.equal(f.posts(), 0)
  await f.subscribe()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 202)
  // Even a deliberately preclaimed UUID in another namespace cannot turn a
  // shared/stolen ticket into that user's receipt. The HMAC itself binds uid.
  await entitlementCall(f.env, bob, '/reserve', { id: receipt.id, profile: 'fast' })
  await entitlementCall(f.env, bob, '/settle', { id: receipt.id, state: 'completed' })
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
})

test('free accounts cannot start ASTRA SLOW jobs or transfer artifacts', async () => {
  const f = fixture(), receipt = await f.prepare()
  const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(response.status, 429)
  assert.equal(f.posts(), 0)
  assert.equal(f.artifacts(), 0)
  const status = await entitlementStatus(f.env, alice)
  assert.equal(status.subscription.active, false)
  assert.equal(status.credits, 0)
})

test('concurrent repeated SLOW submission debits 250 once; confirmed failure refunds once', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  const replies = await Promise.all(Array.from({ length: 5 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
  assert.ok(replies.every(response => response.status === 202)); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
  f.fail()
  await Promise.all([f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket), f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)])
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})

test('an unknown acceptance stays pending briefly, then an explicit Oracle 404 releases the stale reservation', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.lose()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  const { job } = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(job.state, 'pending'); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
  const now = Date.now
  try {
    Date.now = () => now() + 181_000
    const review = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob; reconciledMissing?: boolean }
    assert.equal(review.job.state, 'failed'); assert.equal(review.reconciledMissing, true)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal(f.posts(), 1, 'recovery never submits another Oracle job')
  } finally { Date.now = now }
})

test('a server budget rejection refunds the customer reservation before any Oracle POST', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  f.env.GENERATION_BUDGET = { idFromName: name => name, get: () => ({ async fetch(request) {
    return new URL(request.url).pathname === '/status'
      ? Response.json({ used: 0, limit: null, remaining: null, unlimited: true, enabled: true })
      : Response.json({ allowed: false }, { status: 429 })
  } }) }
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 429)
  assert.equal(f.posts(), 0); assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})

test('Oracle busy 409 restores customer credits immediately instead of creating a fake pending receipt', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.busy()
  const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(response.status, 409)
  const value = await response.json() as { error: string }
  assert.match(value.error, /finishing another model/i)
  assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})

