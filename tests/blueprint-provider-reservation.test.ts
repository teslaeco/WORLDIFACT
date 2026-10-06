import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { MODEL_CATALOG, type BlueprintModel } from '../src/lib/modelCatalog.ts'

const origin = 'https://worldifact.test'
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const budgetKey = 'provider-budget-cents:v1'
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
function memory() {
  const values = new Map<string, unknown>()
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (current: EntitlementStorage) => Promise<T>) {
      const next = queue.then(() => callback(storage)); queue = next.catch(() => {}); return next
    },
  }
  return { values, storage }
}
type Preflight = 'ok' | 'http-error' | 'invalid-usage' | 'invalid-json' | 'timeout' | 'too-large'
async function fixture() {
  const ledger = memory()
  let preflight: Preflight = 'ok', budgetStatus = 200, providerStatus = 200, providerTimeout = false
  let countCalls = 0, generationCalls = 0, dispatchClaims = 0
  let beforeCount: (() => Promise<void>) | undefined
  let afterAccount: ((path: string, response: Response) => Promise<Response>) | undefined
  const env: Env = {
    OPENAI_API_KEY: 'fixture-only-no-real-provider', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6.1-sol',
    ENABLE_PAID_GENERATION: 'true', ENABLE_ASTRA_PLANS: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
    ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch() {
      return Response.json({ allowed: budgetStatus === 200 }, { status: budgetStatus })
    } }) },
  }
  const account = new AccountEntitlements({ storage: ledger.storage }, env)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: () => ({ async fetch(request: Request) {
    const path = new URL(request.url).pathname
    if (path === '/blueprint-dispatch') dispatchClaims++
    const result = await account.fetch(request)
    return afterAccount ? afterAccount(path, result) : result
  } }) }
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: user, email: 'fixture@example.test' })
    if (path === '/v1/responses/input_tokens') {
      countCalls++; await beforeCount?.()
      if (preflight === 'timeout') throw new DOMException('Fixture token-count timeout', 'TimeoutError')
      if (preflight === 'http-error') return Response.json({}, { status: 503 })
      if (preflight === 'invalid-json') return new Response('not JSON')
      return Response.json({ object: 'response.input_tokens', input_tokens: preflight === 'invalid-usage' ? -1 : preflight === 'too-large' ? 2_000_000 : 1000 })
    }
    assert.equal(path, '/v1/responses'); generationCalls++
    if (providerTimeout) throw new DOMException('Fixture generation timeout', 'TimeoutError')
    if (providerStatus !== 200) return Response.json({}, { status: providerStatus })
    const model = JSON.parse(String(init?.body)).model
    const blueprint = demoBlueprint('A silver research tower')
    return Response.json({ id: 'resp_blueprint_funding_fixture', model, status: 'completed', output: [{ content: [{ type: 'output_text',
      text: JSON.stringify({ blueprint, assetSpec: assetSpecForBlueprint(blueprint) }) }] }] })
  }) as typeof fetch
  await entitlementCall(env, user, '/grant', { id: 'in_blueprint_funding', credits: 4500, subscriptionId: 'sub_BlueprintFunding' })
  await entitlementCall(env, user, '/subscription', { id: 'sub_BlueprintFunding', active: true, until: Date.now() + 86_400_000,
    revision: 1, plan: 'pro', grantId: 'in_blueprint_funding' })
  const call = (model: BlueprintModel = 'sol', seed: string = crypto.randomUUID()) => handle(new Request(origin + '/api/blueprint', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: '__Host-worldifact-access=fixture-token', 'X-WORLDIFACT-Request': seed },
    body: JSON.stringify({ worldId: 'ai-game-lab', mode: 'live', model, providerModel: MODEL_CATALOG[model].model, prompt: 'A silver research tower' }),
  }), env, fetcher)
  const recover = (seed: string) => handle(new Request(origin + '/api/blueprint/requests/' + seed, {
    headers: { Cookie: '__Host-worldifact-access=fixture-token' },
  }), env, fetcher)
  return { env, ledger: ledger.values, call, recover,
    funding: () => ledger.values.get(budgetKey), credits: async () => (await entitlementStatus(env, user)).credits,
    counts: () => ({ countCalls, generationCalls, dispatchClaims }),
    preflight: (value: Preflight) => { preflight = value }, budget: (value: number) => { budgetStatus = value },
    provider: (status: number) => { providerStatus = status }, timeout: () => { providerTimeout = true },
    beforeCount: (hook: () => Promise<void>) => { beforeCount = hook },
    afterAccount: (hook: (path: string, response: Response) => Promise<Response>) => { afterAccount = hook },
  }
}

for (const model of ['sol', 'astra', 'luna'] as const) {
  for (const mode of ['http-error', 'invalid-usage', 'invalid-json', 'timeout', 'too-large'] as const) {
    test(`${model} ${mode} preflight returns its exact unspent provider reservation once`, async () => {
      const f = await fixture(), seed = crypto.randomUUID(), before = f.funding()
      f.preflight(mode)
      assert.equal((await f.call(model, seed)).status, mode === 'too-large' ? 413 : 503)
      assert.equal(await f.credits(), 4500)
      assert.equal(f.funding(), before, 'No generation dispatch must consume account funding')
      assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 0, dispatchClaims: 0 })
      assert.equal((await f.call(model, seed)).status, 409)
      assert.equal((await (await f.recover(seed)).json() as { state: string }).state, 'failed')
      assert.equal(f.funding(), before, 'Replay/recovery cannot release the same cents twice')
      assert.equal(await f.credits(), 4500)
    })
  }
}

for (const budgetStatus of [429, 503]) test(`global allowance ${budgetStatus} failure releases unstarted account funding`, async () => {
  const f = await fixture(), before = f.funding()
  f.budget(budgetStatus)
  assert.equal((await f.call()).status, budgetStatus)
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
  assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 0, dispatchClaims: 0 })
})

test('repeated new preflight failures cannot exhaust paid Sol funding', async () => {
  const f = await fixture(), before = f.funding()
  f.preflight('http-error')
  for (let index = 0; index < 95; index++) assert.equal((await f.call()).status, 503)
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
  f.preflight('ok')
  assert.equal((await f.call()).status, 200)
  assert.equal(f.funding(), Number(before) - 35); assert.equal(await f.credits(), 4450)
  assert.equal(f.counts().generationCalls, 1)
})

test('lost failed-settlement response cannot double-refund either ledger', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID()
  f.preflight('http-error')
  f.afterAccount(async (path, result) => { if (path === '/settle') throw new Error('Fixture lost settlement acknowledgement'); return result })
  assert.equal((await f.call('sol', seed)).status, 503)
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
  assert.equal((await f.call('sol', seed)).status, 409)
  assert.equal(f.funding(), before); assert.equal(f.counts().generationCalls, 0)
})

test('lost dispatch acknowledgement sends no provider request and conservatively retains claimed funding', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID()
  f.afterAccount(async (path, result) => { if (path === '/blueprint-dispatch') throw new Error('Fixture lost dispatch acknowledgement'); return result })
  assert.equal((await f.call('sol', seed)).status, 503)
  assert.equal(f.funding(), Number(before) - 35); assert.equal(await f.credits(), 4500)
  assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 0, dispatchClaims: 1 })
  assert.equal((await f.call('sol', seed)).status, 409)
  assert.equal(f.funding(), Number(before) - 35); assert.equal(f.counts().dispatchClaims, 1)
})

test('a new Worker talking to a legacy account object never dispatches without a fence', async () => {
  const f = await fixture(), before = f.funding(), namespace = f.env.ACCOUNT_ENTITLEMENTS!
  f.env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: name => ({ async fetch(request: Request) {
    const path = new URL(request.url).pathname
    if (path === '/blueprint-dispatch') return Response.json({ error: 'Legacy endpoint unavailable' }, { status: 404 })
    if (path === '/reserve') {
      // The previous writer ignores the new opt-in and creates only its old
      // conservative reservation. Exercise it with the real unversioned path.
      const input = await request.json() as Record<string, unknown>
      delete input.blueprintDispatch
      delete input.providerModel
      return namespace.get(name).fetch(new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(input) }))
    }
    return namespace.get(name).fetch(request)
  } }) }
  assert.equal((await f.call()).status, 503)
  assert.equal(f.counts().generationCalls, 0)
  assert.equal(f.funding(), Number(before) - 35, 'The old unproven reservation remains conservative')
  assert.equal(await f.credits(), 4500)
})

test('expired dispatch acknowledgement cannot start a late provider request', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date'], now })
  const f = await fixture(), before = f.funding()
  f.afterAccount(async (path, result) => {
    if (path === '/blueprint-dispatch') t.mock.timers.setTime(now + 30_001)
    return result
  })
  assert.equal((await f.call()).status, 409)
  assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 0, dispatchClaims: 1 })
  assert.equal(f.funding(), Number(before) - 35); assert.equal(await f.credits(), 4500)
})

test('timeout recovery during preflight releases funding and fences the suspended Worker', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date'], now })
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID(), entered = deferred(), release = deferred()
  f.beforeCount(async () => { entered.resolve(); await release.promise })
  const pending = f.call('sol', seed)
  await entered.promise
  t.mock.timers.setTime(now + 600_001)
  assert.equal((await (await f.recover(seed)).json() as { state: string }).state, 'failed')
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
  release.resolve()
  assert.equal((await pending).status, 409)
  assert.equal(f.counts().generationCalls, 0)
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
})

for (const failure of ['http-error', 'timeout'] as const) test(`${failure} after dispatch retains provider liability while returning points once`, async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID()
  if (failure === 'http-error') f.provider(500); else f.timeout()
  assert.equal((await f.call('astra', seed)).status, 502)
  assert.equal(f.funding(), Number(before) - 175); assert.equal(await f.credits(), 4500)
  assert.equal((await f.call('astra', seed)).status, 409)
  assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 1, dispatchClaims: 1 })
  assert.equal(f.funding(), Number(before) - 175)
})

test('successful Blueprint dispatch retains its funding and replays the saved result without another claim', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID()
  const original = await f.call('luna', seed)
  assert.equal(original.status, 200)
  const saved = await original.json()
  assert.deepEqual(await (await f.call('luna', seed)).json(), saved)
  assert.equal(f.funding(), Number(before) - MODEL_CATALOG.luna.maxProviderCents)
  assert.equal(await f.credits(), 4500 - MODEL_CATALOG.luna.creditsPerGeneration)
  assert.deepEqual(f.counts(), { countCalls: 1, generationCalls: 1, dispatchClaims: 1 })
  const job = f.ledger.get('job:' + await blueprintRequestId(seed)) as { blueprintDispatch?: string }
  assert.equal(job.blueprintDispatch, 'claimed-v1')
})

test('an account writer that does not acknowledge the exact model never reaches token counting or paid dispatch', async () => {
  const f = await fixture(), before = f.funding()
  f.afterAccount(async (path, response) => {
    if (path !== '/reserve' || !response.ok) return response
    const body = await response.json() as Record<string, unknown>
    delete body.providerModel
    return Response.json(body)
  })
  assert.equal((await f.call()).status, 503)
  assert.equal(f.funding(), before); assert.equal(await f.credits(), 4500)
  assert.deepEqual(f.counts(), { countCalls: 0, generationCalls: 0, dispatchClaims: 0 })
})
