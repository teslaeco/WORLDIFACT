import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, reserveUserGeneration, settleUserGeneration, userJobAccess, type EntitlementStorage } from '../server/entitlements.ts'
import { demoBlueprint } from '../src/lib/blueprint.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const body = { worldId: 'ai-game-lab', prompt: 'A silver research tower and moss garden', mode: 'live' }
function memory() {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (current: EntitlementStorage) => Promise<T>) {
      const next = queue.then(() => callback(storage)); queue = next.catch(() => {}); return next
    },
  }
  return { values, storage }
}
function fixture() {
  let now = Date.now(), providerCalls = 0, authCalls = 0, fail = false
  const env: Env = { OPENAI_API_KEY: 'test-only-never-sent-to-real-provider', OPENAI_MODEL: 'gpt-6-astra', ENABLE_PAID_GENERATION: 'true',
    PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const global = memory(), budget = new GenerationBudget({ storage: global.storage as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const objects = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) {
    const key = String(id)
    if (!objects.has(key)) objects.set(key, new AccountEntitlements({ storage: memory().storage }, {}, () => now))
    return objects.get(key)!
  } }
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url))
    if (path.pathname === '/auth/v1/user') {
      authCalls++
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer alice-token') return Response.json({ id: alice, email: 'alice@example.test' })
      if (token === 'Bearer bob-token') return Response.json({ id: bob, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    assert.equal(path.href, 'https://api.openai.com/v1/responses')
    assert.equal(init?.method, 'POST'); providerCalls++
    if (fail) return Response.json({ error: 'Fixture failure only' }, { status: 500 })
    return Response.json({ id: 'resp_test_fixture', status: 'completed', model: 'gpt-6-astra', output: [{ content: [{ type: 'output_text', text: JSON.stringify(demoBlueprint('A silver research tower')) }] }] })
  }) as typeof fetch
  const call = (requestId: string = crypto.randomUUID(), user: 'alice' | 'bob' | null = 'alice', input = body) => handle(new Request(origin + '/api/blueprint', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-WORLDIFACT-Request': requestId, ...(user ? { Cookie: `__Host-worldifact-access=${user}-token` } : {}) }, body: JSON.stringify(input),
  }), env, fetcher)
  return { env, call, providerCalls: () => providerCalls, authCalls: () => authCalls, used: () => global.values.get('reserved-attempts') ?? 0, fail: (value: boolean) => { fail = value }, advance: (ms: number) => { now += ms } }
}

test('LIVE Blueprint without a verified account cannot call the provider or debit the global allowance', async () => {
  const f = fixture()
  const response = await f.call(crypto.randomUUID(), null)
  assert.equal(response.status, 401); assert.equal(f.authCalls(), 0); assert.equal(f.providerCalls(), 0); assert.equal(f.used(), 0)
  assert.equal((await entitlementStatus(f.env, alice)).free.fastRemaining, 2)
  const demo = await f.call(crypto.randomUUID(), null, { ...body, mode: 'demo' })
  assert.equal(demo.status, 200); assert.equal(f.providerCalls(), 0); assert.equal(f.used(), 0)
})

test('Blueprint enforces two free FAST results per rolling 24 hours and refunds a failed customer attempt', async () => {
  const f = fixture()
  assert.equal((await f.call()).status, 200)
  assert.equal((await entitlementStatus(f.env, alice)).free.fastRemaining, 1)
  f.fail(true)
  assert.equal((await f.call()).status, 502)
  assert.equal((await entitlementStatus(f.env, alice)).free.fastRemaining, 1, 'An incomplete result must not consume the free customer allowance')
  assert.equal(f.used(), 2, 'The separate provider-spend counter retains both attempted requests')
  f.fail(false)
  assert.equal((await f.call()).status, 200)
  assert.equal((await entitlementStatus(f.env, alice)).free.fastRemaining, 0)
  assert.equal((await f.call()).status, 429); assert.equal(f.providerCalls(), 3); assert.equal(f.used(), 3)
  f.advance(86_400_001)
  assert.equal((await f.call()).status, 200)
  assert.equal((await entitlementStatus(f.env, alice)).free.fastRemaining, 1)
})

test('a repeated Blueprint request UUID cannot duplicate a provider request or a 50-credit debit', async () => {
  const f = fixture(), requestId = crypto.randomUUID()
  await entitlementCall(f.env, alice, '/grant', { id: 'in_blueprint_test', credits: 1500 })
  const replies = await Promise.all(Array.from({ length: 5 }, () => f.call(requestId)))
  assert.equal(replies.filter(response => response.status === 200).length, 1)
  assert.equal(replies.filter(response => response.status === 409).length, 4)
  assert.equal(f.providerCalls(), 1); assert.equal(f.used(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 1450)
  assert.equal((await f.call(requestId, 'alice', { ...body, prompt: 'Changed prompt under the same request UUID' })).status, 409)
  assert.equal((await f.call('malformed-client-id')).status, 400)
  assert.equal(f.providerCalls(), 1); assert.equal((await entitlementStatus(f.env, alice)).credits, 1450)
})

test('Blueprint namespaces client IDs so another user cannot preclaim a supplied Studio receipt UUID', async () => {
  const f = fixture(), studioId = crypto.randomUUID()
  await reserveUserGeneration(f.env, alice, studioId, 'slow')
  await settleUserGeneration(f.env, alice, studioId, 'completed')
  assert.equal((await userJobAccess(f.env, alice, studioId)).owned, true)
  const response = await f.call(studioId, 'bob'), result = await response.json() as { requestId: string }
  assert.equal(response.status, 200); assert.notEqual(result.requestId, studioId)
  assert.equal((await userJobAccess(f.env, bob, studioId)).owned, false, 'The raw Studio UUID must remain unowned by the other user')
  assert.equal((await userJobAccess(f.env, bob, result.requestId)).owned, true)
  assert.equal((await userJobAccess(f.env, alice, studioId)).profile, 'slow')
})
