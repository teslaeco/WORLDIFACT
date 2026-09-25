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
  let posts = 0, artifacts = 0, loss = false, state: StudioJob['state'] = 'succeeded', status404 = false
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer alice-token') return Response.json({ id: alice, email: 'alice@example.test' })
      if (token === 'Bearer bob-token') return Response.json({ id: bob, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    if (path === '/v1/health') return Response.json({ ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, promptMaxLength: 5000 })
    if (path === '/v1/jobs') { posts++; if (loss) throw new Error('Unconfirmed transport acceptance'); return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' }) }
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
    await entitlementCall(env, alice, '/grant', { id: 'in_subscription', credits: 1500, subscriptionId: 'sub_test' })
    await entitlementCall(env, alice, '/subscription', { id: 'sub_test', until: Date.now() + 86400000, active: true, revision: 1, grantId: 'in_subscription' })
  }
  return { env, call, prepare, subscribe, posts: () => posts, artifacts: () => artifacts, fail: () => { state = 'failed' }, lose: () => { loss = true; status404 = true } }
}

test('account-bound prepared receipts cannot be submitted or read by another user', async () => {
  const f = fixture()
  assert.equal((await f.call('/api/studio/prepare', 'POST', input, undefined, null)).status, 401)
  const receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket, 'bob')).status, 401)
  assert.equal(f.posts(), 0)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 202)
  // Even a deliberately preclaimed UUID in another namespace cannot turn a
  // shared/stolen ticket into that user's receipt. The HMAC itself binds uid.
  await entitlementCall(f.env, bob, '/reserve', { id: receipt.id, profile: 'fast' })
  await entitlementCall(f.env, bob, '/settle', { id: receipt.id, state: 'completed' })
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
})

test('free SLOW completion keeps owner-bound downloads available without membership', async () => {
  const f = fixture(), receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  const { job } = await response.json() as { job: StudioJob }
  assert.equal(job.state, 'succeeded'); assert.equal(job.downloadAllowed, true); assert.equal(job.previewOnly, false); assert.equal(job.previewAvailable, true)
  for (const path of ['model', 'exports/pbr', 'exports/fbx', 'exports/blend']) {
    const artifact = await f.call(`/api/studio/jobs/${receipt.id}/${path}`, 'GET', undefined, receipt.ticket)
    assert.equal(artifact.status, 200)
  }
  assert.equal(f.artifacts(), 4)
  const next = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, next.ticket)).status, 429)
  assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 0, 'Downloading an already generated free model does not mint or debit credits')
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
})

test('concurrent repeated SLOW submission debits 50 once; confirmed failure refunds once', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  const replies = await Promise.all(Array.from({ length: 5 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
  assert.ok(replies.every(response => response.status === 202)); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 1450)
  f.fail()
  await Promise.all([f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket), f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)])
  assert.equal((await entitlementStatus(f.env, alice)).credits, 1500)
})

test('an unknown acceptance and Oracle 404 preserve the reservation and never resubmit or refund', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.lose()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  const { job } = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(job.state, 'pending'); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 1450)
  const now = Date.now
  try {
    Date.now = () => now() + 181_000
    const review = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(review.job.state, 'pending'); assert.equal(review.job.reconciliationRequired, true)
    assert.match(review.job.detail, /remain reserved/)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 1450)
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
  assert.equal(f.posts(), 0); assert.equal((await entitlementStatus(f.env, alice)).credits, 1500)
})
