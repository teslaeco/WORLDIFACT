import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { type StudioInput, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { detailedGLBFixture, detailedHealthFixture } from './detailed-studio-fixture.ts'

const ORIGIN = 'https://worldifact.test'
const ORACLE = 'https://worker.trycloudflare.com'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORACLE_TOKEN = 'fixture-only-oracle-token'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'An inert blue chess rook fixture', purpose: 'figurine', textureMaxSize: 4096, photos: [] }

function transactionalStorage() {
  let values = new Map<string, unknown>(), queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (transaction: EntitlementStorage) => Promise<T>) {
      const next = queue.then(async () => {
        const staged = structuredClone(values)
        const transaction: EntitlementStorage = {
          async get<V>(key: string) { return structuredClone(staged.get(key)) as V | undefined },
          async put(key, value) { staged.set(key, structuredClone(value)) },
          transaction<V>(nested: (value: EntitlementStorage) => Promise<V>) { return nested(transaction) },
        }
        const result = await callback(transaction)
        values = staged
        return result
      })
      queue = next.catch(() => undefined)
      return next
    },
  }
  return store
}

function terminalReceipt(jobId: string, liability = 200001) {
  return { revision: 'worldifact-terminal-budget-v1', jobId, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: liability, sealed: true, sealId: 'b'.repeat(64) }
}

function fixture() {
  const env: StudioEnv = {
    OWNER_ACCESS_TOKEN: 'fixture-owner-token-'.repeat(3), ORACLE_ENDPOINT: ORACLE, ORACLE_API_TOKEN: ORACLE_TOKEN,
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', ENABLE_ASTRA_PLANS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
  }
  const globalBudget = new GenerationBudget({ storage: transactionalStorage() as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => globalBudget }
  const accounts = new Map<string, { ledger: AccountEntitlements; storage: EntitlementStorage }>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) {
    const name = String(id)
    if (!accounts.has(name)) {
      const storage = transactionalStorage()
      accounts.set(name, { ledger: new AccountEntitlements({ storage }, env), storage })
    }
    return accounts.get(name)!.ledger
  } }
  let state: StudioJob['state'] = 'building'
  let budgetReply: (jobId: string) => Response | Promise<Response> = id => Response.json(terminalReceipt(id))
  const calls: { path: string; method: string; redirect?: RequestInit['redirect']; authorization: string | null }[] = []
  const fetcher = (async (request: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(request)), headers = new Headers(init?.headers)
    if (url.pathname === '/auth/v1/user') {
      if (headers.get('Authorization') === 'Bearer alice-token') return Response.json({ id: ALICE, email: 'alice@example.test' })
      if (headers.get('Authorization') === 'Bearer bob-token') return Response.json({ id: BOB, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    assert.equal(url.origin, ORACLE, 'The inert fixture refuses every other outbound origin')
    calls.push({ path: url.pathname, method: init?.method ?? 'GET', redirect: init?.redirect, authorization: headers.get('Authorization') })
    assert.equal(headers.get('Authorization'), `Bearer ${ORACLE_TOKEN}`)
    if (url.pathname === '/v1/health') return Response.json(detailedHealthFixture)
    if (url.pathname === '/v1/jobs') {
      assert.equal(init?.method, 'POST')
      const body = JSON.parse(String(init.body)) as { id: string }
      return Response.json({ id: body.id, state: 'building' })
    }
    const match = url.pathname.match(/^\/v1\/jobs\/([a-f0-9-]{36})(?:\/(budget|model))?$/)
    assert.ok(match, 'Unexpected Oracle route')
    assert.equal(init?.method ?? 'GET', 'GET')
    assert.equal(init?.body, undefined)
    if (match[2] === 'budget') {
      assert.equal(init?.redirect, 'manual', 'The Oracle credential must never follow a redirect')
      assert.ok(init?.signal, 'The read must have a bounded deadline')
      return budgetReply(match[1])
    }
    if (match[2] === 'model') {
      const bytes = detailedGLBFixture()
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } })
    }
    return Response.json({ id: match[1], state })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, receipt?: StudioReceipt, user: 'alice' | 'bob' = 'alice') => studioApi(new Request(ORIGIN + path, {
    method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: `__Host-worldifact-access=${user}-token`,
      ...(receipt ? { 'X-WORLDIFACT-Job': receipt.ticket } : {}),
      ...(method === 'POST' && path === '/api/studio/jobs' && receipt ? { 'X-WORLDIFACT-Idempotency-Key': receipt.id } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  async function start() {
    await entitlementCall(env, ALICE, '/grant', { id: 'in_fixture', credits: 4500, subscriptionId: 'sub_fixture' })
    await entitlementCall(env, ALICE, '/subscription', { id: 'sub_fixture', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_fixture' })
    const prepared = await call('/api/studio/prepare', 'POST', input)
    assert.equal(prepared.status, 200)
    const receipt = await prepared.json() as StudioReceipt
    assert.equal((await call('/api/studio/jobs', 'POST', input, receipt)).status, 202)
    assert.equal(await funding(), 2975)
    assert.equal((await entitlementStatus(env, ALICE)).reservedCredits, 250)
    return receipt
  }
  async function funding(user = ALICE) { return accounts.get('account:v1:' + user)?.storage.get<number>('provider-budget-cents:v1') }
  const poll = (receipt: StudioReceipt, user: 'alice' | 'bob' = 'alice') => call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt, user)
  const budgetCalls = () => calls.filter(call => call.path.endsWith('/budget'))
  const posts = () => calls.filter(call => call.method === 'POST')
  return { env, calls, start, poll, funding, budgetCalls, posts, setState: (next: StudioJob['state']) => { state = next }, setBudget: (next: typeof budgetReply) => { budgetReply = next } }
}

test('authenticated terminal evidence restores unused provider funding once without changing a completed model charge', async () => {
  const f = fixture(), receipt = await f.start()
  f.setState('succeeded')
  const response = await f.poll(receipt)
  assert.equal(response.status, 200)
  const result = await response.json() as { job: StudioJob }
  assert.equal(result.job.state, 'succeeded')
  assert.equal(await f.funding(), 3129, '200001 microUSD rounds liability up to 21 cents, returning only 154 of 175 reserved cents')
  let account = await entitlementStatus(f.env, ALICE)
  assert.equal(account.credits, 4250)
  assert.equal(account.reservedCredits, 0)
  assert.equal(f.budgetCalls().length, 1)
  await Promise.all(Array.from({ length: 6 }, () => f.poll(receipt)))
  account = await entitlementStatus(f.env, ALICE)
  assert.equal(await f.funding(), 3129)
  assert.equal(account.credits, 4250)
  assert.equal(f.budgetCalls().length, 1, 'Already reconciled reads do not fetch or apply another receipt')
  assert.equal(f.posts().length, 1)
  assert.doesNotMatch(JSON.stringify(result), /maximumLiability|sealId|fixture-only-oracle-token/)
})

test('concurrent failed-job recovery restores provider difference once while preserving refunded customer points', async () => {
  const f = fixture(), receipt = await f.start()
  f.setState('failed')
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.poll(receipt)))
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.equal((await response.json() as { job: StudioJob }).job.state, 'failed')
  }
  assert.equal(await f.funding(), 3129)
  const account = await entitlementStatus(f.env, ALICE)
  assert.equal(account.credits, 4500)
  assert.equal(account.reservedCredits, 0)
  const before = f.budgetCalls().length
  await f.poll(receipt)
  assert.equal(f.budgetCalls().length, before)
  assert.equal(f.posts().length, 1)
})

test('previously settled results survive unavailable budget evidence and reconcile later through the same receipt', async () => {
  for (const state of ['succeeded', 'failed'] as const) {
    const f = fixture(), receipt = await f.start()
    f.setState(state)
    f.setBudget(() => Response.json({ error: 'Unknown sealed budget' }, { status: 404 }))
    const first = await f.poll(receipt)
    assert.equal(first.status, 200)
    assert.equal((await first.json() as { job: StudioJob }).job.state, state)
    const account = await entitlementStatus(f.env, ALICE)
    assert.equal(await f.funding(), 2975)
    assert.equal(account.credits, state === 'succeeded' ? 4250 : 4500)
    f.setBudget(id => Response.json(terminalReceipt(id, 0)))
    const recovered = await f.poll(receipt)
    assert.equal(recovered.status, 200)
    assert.equal((await recovered.json() as { job: StudioJob }).job.state, state)
    assert.equal(await f.funding(), 3150)
    assert.deepEqual(await entitlementStatus(f.env, ALICE), account, 'Provider reconciliation does not alter customer credits, holds, subscription or quota')
    assert.equal(f.posts().length, 1)
  }
})

test('unknown, malformed, foreign, unsealed or redirected receipts never replenish provider funding', async () => {
  const failures: [string, (id: string) => Response | Promise<Response>][] = [
    ['unknown', () => Response.json({ error: 'Unknown budget' }, { status: 404 })],
    ['transport', () => { throw new TypeError('Inert Oracle connection failure') }],
    ['wrong-job', () => Response.json(terminalReceipt(BOB))],
    ['wrong-model', id => Response.json({ ...terminalReceipt(id), model: 'gpt-6-sol' })],
    ['wrong-policy', id => Response.json({ ...terminalReceipt(id), policyRevision: 'astra-usd175-v1' })],
    ['unsealed', id => Response.json({ ...terminalReceipt(id), sealed: false })],
    ['extra-field', id => Response.json({ ...terminalReceipt(id), state: 'succeeded' })],
    ['fractional-liability', id => Response.json({ ...terminalReceipt(id), maximumLiabilityMicroUsd: 0.5 })],
    ['over-cap', id => Response.json(terminalReceipt(id, 1750001))],
    ['negative-liability', id => Response.json(terminalReceipt(id, -1))],
    ['oversized', () => Response.json({ padding: 'x'.repeat(5000) })],
    ['html', () => new Response('<html>Unverified</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['redirect', () => Response.redirect('https://foreign.example.test/token-sink', 307)],
  ]
  for (const [name, budgetReply] of failures) {
    const f = fixture(), receipt = await f.start()
    f.setState('failed'); f.setBudget(budgetReply)
    const response = await f.poll(receipt)
    assert.equal(response.status, 200, name)
    assert.equal((await response.json() as { job: StudioJob }).job.state, 'failed', name)
    assert.equal(await f.funding(), 2975, name)
    assert.equal((await entitlementStatus(f.env, ALICE)).credits, 4500, name)
    assert.equal(f.budgetCalls().length, 1, name)
    assert.equal(f.posts().length, 1, name)
  }
})

test('nonterminal or foreign-account recovery never requests or applies budget evidence', async () => {
  const f = fixture(), receipt = await f.start()
  f.setState('building')
  const pending = await f.poll(receipt)
  assert.equal(pending.status, 200)
  assert.equal((await pending.json() as { job: StudioJob }).job.state, 'building')
  assert.equal(f.budgetCalls().length, 0)
  assert.equal(await f.funding(), 2975)
  assert.equal((await entitlementStatus(f.env, ALICE)).reservedCredits, 250)
  f.setState('failed')
  assert.equal((await f.poll(receipt, 'bob')).status, 401)
  assert.equal(f.budgetCalls().length, 0)
  assert.equal(await f.funding(), 2975)
  assert.equal(await f.funding(BOB), undefined)
  assert.equal((await entitlementStatus(f.env, ALICE)).reservedCredits, 250)
  assert.equal(f.posts().length, 1)
})
