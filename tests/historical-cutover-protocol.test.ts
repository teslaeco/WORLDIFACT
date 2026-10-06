import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AccountEntitlements, entitlementCall, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage, type BudgetNamespace } from '../server/budget.ts'
import { HISTORICAL_INTERNAL_PREFIX, historicalBudgetNamespace, historicalInternalUrl } from '../server/historicalDataBoundary.ts'
import { handle } from '../server/worker.ts'

const USER = '11111111-2222-4333-8444-555555555555'
function memory(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial)), accesses = { reads: 0, writes: 0, transactions: 0 }
  const storage: EntitlementStorage = {
    async get<T>(key: string) { accesses.reads++; return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { accesses.writes++; values.set(key, structuredClone(value)) },
    async transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) { accesses.transactions++; return callback(storage) },
  }
  return { storage, values, accesses }
}
const request = (path: string, method = 'POST', body = '{}') => new Request(`https://internal${path}`, { method, ...(method === 'POST' ? { body } : {}) })

test('modern callers cannot touch restored account storage or even parse an unversioned mutation body', async () => {
  for (const path of ['/reserve', '/settle', '/grant', '/revoke', '/subscription', '/customer', '/checkout-reserve', '/checkout-finish', '/checkout-clear',
    '/paypal-reserve', '/paypal-order', '/paypal-get', '/paypal-clear', '/studio-dispatch', '/blueprint-complete', '/private-worlds', '/reserve-overnight-test',
    '/mcc-restore-20261005/reserve', '/mcc-restore-20261006-other/reserve']) {
    const f = memory({ balance: 1200, 'customer-reserved-credits:v1': 250, 'provider-budget-cents:v1': 60 }), account = new AccountEntitlements(f)
    const incoming = request(path, 'POST', '{not-json')
    assert.equal((await account.fetch(incoming)).status, 503)
    assert.equal(incoming.bodyUsed, false)
    assert.deepEqual(f.accesses, { reads: 0, writes: 0, transactions: 0 })
  }
})

test('modern global-budget writes and mutating GET promo-status stop before all storage access', async () => {
  for (const path of ['/reserve', '/reserve-studio', '/promo-fund', '/promo-revoke', '/promo-reserve', '/activate-approved-fast', '/promo-status']) {
    const f = memory({ 'reserved-attempts': 12 }), budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, { FREE_SOL_SEED_JOBS: '10' })
    const incoming = request(path, path === '/promo-status' ? 'GET' : 'POST')
    assert.equal((await budget.fetch(incoming)).status, 503)
    assert.equal(incoming.bodyUsed, false)
    assert.deepEqual(f.accesses, { reads: 0, writes: 0, transactions: 0 })
    assert.deepEqual(Object.fromEntries(f.values), { 'reserved-attempts': 12 })
  }
})

test('allowed unversioned status reads remain read-only and never initialize an archive or seed', async () => {
  const a = memory({ balance: 1200, 'customer-reserved-credits:v1': 0 }), account = new AccountEntitlements(a)
  for (const path of ['/status', '/billing']) assert.equal((await account.fetch(request(path, 'GET'))).status, 200)
  assert.equal(a.accesses.writes, 0)
  assert.deepEqual(Object.fromEntries(a.values), { balance: 1200, 'customer-reserved-credits:v1': 0 })
  const b = memory({ 'reserved-attempts': 12 }), budget = new GenerationBudget({ storage: b.storage as BudgetStorage }, { FREE_SOL_SEED_JOBS: '10' })
  assert.equal((await budget.fetch(request('/status', 'GET'))).status, 200)
  assert.equal(b.accesses.writes, 0)
  assert.deepEqual(Object.fromEntries(b.values), { 'reserved-attempts': 12 })
})

test('restored account caller and object agree on the epoch while keeping account IDs and public state unchanged', async () => {
  const f = memory({ balance: 1200, 'provider-budget-cents:v1': 60 }), account = new AccountEntitlements(f), seen: string[] = [], names: string[] = []
  const env = { ACCOUNT_ENTITLEMENTS: { idFromName(name: string) { names.push(name); return name }, get() { return { fetch(r: Request) { seen.push(new URL(r.url).pathname); return account.fetch(r) } } } } }
  assert.deepEqual(await entitlementCall(env, USER, '/customer', { customer: 'cus_fixture' }), { saved: true })
  assert.deepEqual(await entitlementCall(env, USER, '/billing'), { customer: 'cus_fixture' })
  assert.deepEqual(seen, [`${HISTORICAL_INTERNAL_PREFIX}/customer`, `${HISTORICAL_INTERNAL_PREFIX}/billing`])
  assert.ok(names.every(name => name === `account:v1:${USER}`))
  assert.equal(f.values.get('balance'), 1200)
  assert.equal(f.values.get('provider-budget-cents:v1'), 60)
})

test('budget wrapper preserves Request data, cancellation and native receivers without double-prefixing', async () => {
  let seen: Request | undefined, calls = 0
  class NativeStub {
    #brand = 'stub'
    async fetch(incoming: Request) { assert.equal(this.#brand, 'stub'); seen = incoming; calls++; return Response.json({ body: await incoming.text() }) }
  }
  class NativeNamespace implements BudgetNamespace {
    #brand = 'namespace'
    #stub = new NativeStub()
    idFromName(name: string) { return `${this.#brand}:${name}` }
    get(id: unknown) { assert.equal(id, `${this.#brand}:fund`); return this.#stub }
  }
  const wrapped = historicalBudgetNamespace(historicalBudgetNamespace(new NativeNamespace()))
  const { idFromName, get } = wrapped, { fetch: send } = get(idFromName('fund'))
  const controller = new AbortController(), payload = JSON.stringify({ id: 'in_fixture', jobs: 10 })
  const incoming = new Request('https://budget.internal/promo-fund?fixture=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fixture': 'kept' }, body: payload, redirect: 'manual', signal: controller.signal })
  const response = await send(incoming)
  assert.deepEqual(await response.json(), { body: payload })
  assert.equal(calls, 1)
  assert.equal(seen!.url, `https://budget.internal${HISTORICAL_INTERNAL_PREFIX}/promo-fund?fixture=1`)
  assert.equal(seen!.method, 'POST')
  assert.equal(seen!.headers.get('Content-Type'), 'application/json')
  assert.equal(seen!.headers.get('X-Fixture'), 'kept')
  assert.equal(seen!.redirect, 'manual')
  controller.abort()
  assert.equal(seen!.signal.aborted, true)
})

test('restored Worker wraps the actual global binding without changing its public health URL or object name', async () => {
  const f = memory({ 'reserved-attempts': 12 }), names: string[] = [], paths: string[] = []
  const env = { OPENAI_API_KEY: 'fixture-only', ENABLE_PAID_GENERATION: 'true', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6-sol',
    GENERATION_REQUEST_LIMIT: 'unlimited', GENERATION_ACCESS_TOKEN: 'fixture-token-at-least-32-characters-long', GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName(name: string) { names.push(name); return name }, get() { return { fetch(r: Request) { paths.push(new URL(r.url).pathname); return budget.fetch(r) } } } } }
  const budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, env)
  const noProvider = (async () => { throw new Error('No provider request allowed') }) as typeof fetch
  const response = await handle(new Request('https://worldifact.test/api/health'), env, noProvider)
  assert.equal(response.status, 200)
  assert.deepEqual(paths, [`${HISTORICAL_INTERNAL_PREFIX}/status`])
  assert.deepEqual(names, ['worldifact-generation-budget-v1'])
  assert.equal(f.accesses.writes, 0)
})

type RoutingContract = { sourceFile: string; sourceSha256: string; guards: { condition: string; reject: boolean }[]; fallbackHandler: boolean }
const pinned = JSON.parse(readFileSync(new URL('./fixtures/pre-rollback-do-routing.json', import.meta.url), 'utf8')) as { revision: string; classes: Record<string, RoutingContract> }
function priorRouting(contract: RoutingContract) {
  let handlers = 0
  return {
    handled: () => handlers,
    async fetch(incoming: Request) {
      const path = new URL(incoming.url).pathname
      for (const guard of contract.guards) {
        // Trusted, pinned source expressions only. No request data becomes code.
        const matches = new Function('path', 'request', `return (${guard.condition})`)(path, incoming)
        if (matches) { if (guard.reject) return new Response(null, { status: 404 }); handlers++; return Response.json({ matched: true }) }
      }
      if (contract.fallbackHandler) { handlers++; return Response.json({ matched: true }) }
      return new Response(null, { status: 404 })
    },
  }
}

test('pinned modern routing rejects restored epoch calls before dispatching any old account or budget handler', async () => {
  assert.equal(pinned.revision, '9b2a5a9e48424e11d2d8ddc9b360ec110544a508')
  const account = priorRouting(pinned.classes.AccountEntitlements), budget = priorRouting(pinned.classes.GenerationBudget)
  const accountEnv = { ACCOUNT_ENTITLEMENTS: { idFromName: (name: string) => name, get: () => account } }
  for (const path of ['/reserve', '/settle', '/grant', '/revoke', '/subscription', '/customer', '/checkout-reserve', '/paypal-reserve'])
    await assert.rejects(entitlementCall(accountEnv, USER, path, {}), /temporarily unavailable/)
  await assert.rejects(entitlementCall(accountEnv, USER, '/status'), /temporarily unavailable/)
  const wrapped = historicalBudgetNamespace({ idFromName: name => name, get: () => budget }).get('budget')
  for (const path of ['/reserve', '/reserve-studio', '/promo-fund', '/promo-revoke', '/promo-reserve', '/activate-approved-fast'])
    assert.equal((await wrapped.fetch(request(path))).status, 404)
  assert.equal((await wrapped.fetch(request('/promo-status', 'GET'))).status, 404)
  assert.equal(account.handled(), 0)
  assert.equal(budget.handled(), 0)
  // Positive controls ensure this fixture actually recognizes the prior protocol.
  assert.equal((await account.fetch(request('/reserve'))).status, 200)
  assert.equal((await budget.fetch(request('/reserve'))).status, 200)
  assert.equal(account.handled(), 1)
  assert.equal(budget.handled(), 1)
})

test('a restored budget accepts epoch calls and preserves counters through both namespace layers', async () => {
  const f = memory({ 'reserved-attempts': 12 }), budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, { GENERATION_REQUEST_LIMIT: 'unlimited' })
  const wrapped = historicalBudgetNamespace({ idFromName: name => name, get: () => budget })
  const response = await wrapped.get(wrapped.idFromName('budget')).fetch(request('/reserve'))
  assert.equal(response.status, 200)
  assert.equal(f.values.get('reserved-attempts'), 13)
  assert.equal((await budget.fetch(new Request(historicalInternalUrl('https://internal', '/status')))).status, 200)
})
