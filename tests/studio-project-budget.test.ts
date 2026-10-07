import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { ASTRA_SUPPORT_ONCE_KEY } from '../server/astraSupportOnce.ts'
import { ASTRA_SUPPLEMENTAL_KEY } from '../server/astraSupplementalGrant.ts'
import { ASTRA_REPAIRED_MCC_KEY, ASTRA_REPAIRED_MCC_NAMESPACE } from '../server/astraRepairedMccGrant.ts'
import { ASTRA_PROJECT_BUDGET_KEY, ASTRA_PROJECT_BUDGET_NAMESPACE } from '../server/astraProjectBudget.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { prepareStudioInput, type StudioInput, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { detailedGLBFixture, detailedHealthFixture } from './detailed-studio-fixture.ts'

const operationPath = (request: Request) => new URL(request.url).pathname.replace(/^\/generation-v3(?=\/)/, '')

const origin = 'https://worldifact.test'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const grantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PROVIDER = 'provider-budget-cents:v1'
const HELD = 'customer-reserved-credits:v1'
const draft: StudioInput = { worldId: 'enchanted-ai-shop', purpose: 'figurine', textureMaxSize: 4096, photos: [],
  prompt: 'Create a synthetic training cabinet with rails, terminal blocks, a controller and two vents for this inert fixture.' }
// Header-only fixture validates input transport; it is not a photograph/render.
const photoDraft: StudioInput = { ...draft, photos: [{ name: 'synthetic.jpg', view: 'front', textureMaxSize: 4096,
  dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64') }] }
const historical = { [ASTRA_SUPPORT_ONCE_KEY]: { immutable: 'original consumed fixture' }, [ASTRA_SUPPLEMENTAL_KEY]: { immutable: 'supplemental consumed fixture' }, [ASTRA_REPAIRED_MCC_KEY]: { immutable: 'repaired consumed fixture' } }
const fingerprint = async (input: StudioInput) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`WORLDIFACT-ACCOUNT-JOB-v1:${owner}:${(await prepareStudioInput(input)).inputDigest}`))).toString('hex')

function memory(seed: Record<string, unknown> = {}, protectProvider = false) {
  const values = new Map<string, unknown>(Object.entries(seed)), writes: string[] = []
  let tail: Promise<unknown> = Promise.resolve(), forbidAllWrites = false
  const guardedPut = (map: Map<string, unknown>, key: string, value: unknown, log: string[]) => {
    if (forbidAllWrites) throw new Error('Read-only operation attempted storage mutation')
    if (key === ASTRA_SUPPORT_ONCE_KEY || key === ASTRA_SUPPLEMENTAL_KEY || key === ASTRA_REPAIRED_MCC_KEY || protectProvider && key === PROVIDER) throw new Error('Protected financial history must not be written')
    map.set(key, structuredClone(value)); log.push(key)
  }
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { guardedPut(values, key, value, writes) },
    transaction<T>(callback: (store: EntitlementStorage) => Promise<T>) {
      const next = tail.then(async () => {
        const copy = structuredClone(values), pending: string[] = []
        const transaction: EntitlementStorage = {
          async get<V>(key: string) { return structuredClone(copy.get(key)) as V | undefined },
          async put(key, value) { guardedPut(copy, key, value, pending) },
          transaction: async fn => fn(transaction),
        }
        const result = await callback(transaction)
        values.clear(); for (const [key, value] of copy) values.set(key, value)
        writes.push(...pending); return result
      })
      tail = next.catch(() => undefined); return next
    },
  }
  return { values, writes, storage, forbidWrites(value = true) { forbidAllWrites = value } }
}

async function fixture(options: { provider?: number; approvedInput?: StudioInput; configured?: boolean } = {}) {
  const now = Date.now(), input = options.approvedInput ?? draft
  const approval = { version: 1, accountId: owner, maxAttempts: 1, issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), maxProviderCents: 175, fingerprint: await fingerprint(input) }
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'inert-owner-fixture-'.repeat(3), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'inert-oracle-fixture',
    ENABLE_ASTRA_PLANS: 'true', PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', STUDIO_NEW_JOB_POLICY: 'legacy-usd175-v1',
    ...(options.configured === false ? {} : { WORLDIFACT_ASTRA_PROJECT_BUDGET: JSON.stringify(approval) }), GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const oldApproval = { version: 1, accountId: owner, grantId, issuedAt: approval.issuedAt, expiresAt: approval.expiresAt, amountCents: 175 }
  env.WORLDIFACT_ASTRA_SUPPORT_ONCE = JSON.stringify({ ...oldApproval, grantId: undefined, approvalId: grantId })
  env.WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT = JSON.stringify(oldApproval)
  env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = JSON.stringify({ ...oldApproval, fingerprint: approval.fingerprint })
  const stores = new Map<string, ReturnType<typeof memory>>(), objects = new Map<string, AccountEntitlements>()
  const accountName = `account:v1:${owner}`
  // No verified invoice grant: this remains a bounded support/project fixture
  // using the current protocol, rather than a new paid-membership reservation.
  const account = memory({ balance: 1000, [HELD]: 0, [PROVIDER]: options.provider ?? 98, ...historical,
    subscription: { id: 'sub_Synthetic', active: true, until: now + 86_400_000, revision: 1, plan: 'pro' } }, options.provider === undefined)
  stores.set(accountName, account)
  const budget = new GenerationBudget({ storage: memory().storage as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(key) {
    const name = String(key)
    if (!stores.has(name)) stores.set(name, memory(name === ASTRA_REPAIRED_MCC_NAMESPACE ? { [ASTRA_REPAIRED_MCC_KEY]: historical[ASTRA_REPAIRED_MCC_KEY] } : name === 'astra-support-once:v1' ? { [ASTRA_SUPPORT_ONCE_KEY]: historical[ASTRA_SUPPORT_ONCE_KEY] } : name === 'astra-support-supplemental:v1' ? { [ASTRA_SUPPLEMENTAL_KEY]: historical[ASTRA_SUPPLEMENTAL_KEY] } : {}))
    if (!objects.has(name)) objects.set(name, new AccountEntitlements({ storage: stores.get(name)!.storage }, env, () => Date.now()))
    return objects.get(name)!
  } }
  let state: StudioJob['state'] = 'building', loseResponse = false, budgetReads = 0
  const submitted: Record<string, unknown>[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: owner, email: 'fixture@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' })
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs') {
      const body = JSON.parse(String(init?.body)); submitted.push(body)
      if (loseResponse) throw new Error('Inert lost provider acknowledgement')
      return Response.json({ id: body.id, state: 'building' })
    }
    if (path.endsWith('/budget')) { budgetReads++; throw new Error('Separate allowance must not reconcile into ordinary funding') }
    if (path.endsWith('/model')) { const bytes = detailedGLBFixture(); return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }) }
    if (/^\/v1\/jobs\/[a-f0-9-]+$/.test(path)) return Response.json({ id: path.split('/').pop(), state })
    throw new Error('Unexpected external route in inert test: ' + path)
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, receipt?: StudioReceipt) => studioApi(new Request(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: '__Host-worldifact-access=synthetic-user-token',
      ...(receipt ? { 'X-WORLDIFACT-Job': receipt.ticket, 'X-WORLDIFACT-Idempotency-Key': receipt.id } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  return { env, account, stores, submitted, approval, call, budgetReads: () => budgetReads,
    state(value: StudioJob['state']) { state = value }, loseResponse() { loseResponse = true },
    status: () => entitlementStatus(env, owner, { email: 'fixture@example.test', emailVerified: true }),
    async prepare(input = draft) {
      const response = await call('/api/studio/prepare', 'POST', await prepareStudioInput(input))
      assert.equal(response.status, 200, await response.clone().text()); return await response.json() as StudioReceipt
    },
    balances: () => ({ credits: account.values.get('balance'), held: account.values.get(HELD), provider: account.values.get(PROVIDER) }),
    claims: () => ({ local: structuredClone(account.values.get(ASTRA_PROJECT_BUDGET_KEY)), global: structuredClone(stores.get(ASTRA_PROJECT_BUDGET_NAMESPACE)?.values.get(ASTRA_PROJECT_BUDGET_KEY)) }),
    history() {
      for (const [key, value] of Object.entries(historical)) assert.deepEqual(account.values.get(key), value)
      for (const name of ['astra-support-once:v1', 'astra-support-supplemental:v1', ASTRA_REPAIRED_MCC_NAMESPACE]) {
        const store = stores.get(name); if (store) assert.equal(store.writes.length, 0)
      }
    },
  }
}

test('new MCC readiness and exact-draft preparation are read-only before one fixed claim', async () => {
  const f = await fixture(), before = structuredClone([...f.account.values])
  const status = await f.status()
  assert.equal(status.studioAdmission.allowed, true); assert.equal(status.generationAdmission.astra.allowed, false)
  assert.equal(status.astraProjectBudget?.available, true)
  for (const store of f.stores.values()) store.forbidWrites()
  await f.status(); await f.prepare()
  assert.deepEqual([...f.account.values], before)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined })
  assert.equal(f.account.writes.length, 0); assert.equal(f.submitted.length, 0)
})

test('new-only preparation refuses prompt, purpose, texture and world changes without consuming authority', async () => {
  const f = await fixture(), before = structuredClone([...f.account.values])
  for (const changed of [{ ...draft, prompt: 'A different cabinet' }, { ...draft, purpose: 'object' as const },
    { ...draft, textureMaxSize: 2048 as const }, { ...draft, worldId: 'ai-game-lab' as const }, photoDraft]) {
    const response = await f.call('/api/studio/prepare', 'POST', await prepareStudioInput(changed))
    assert.equal(response.status, 409); assert.match((await response.json() as { error: string }).error, /approved MCC draft/)
  }
  assert.deepEqual([...f.account.values], before); assert.deepEqual(f.claims(), { local: undefined, global: undefined })
  assert.equal(f.account.writes.length, 0); assert.equal(f.submitted.length, 0)
})

test('a forged lightweight digest cannot submit different actual input', async () => {
  const f = await fixture(), changed = { ...draft, prompt: 'Another object' }
  const manifest = await prepareStudioInput(changed)
  manifest.inputDigest = (await prepareStudioInput(draft)).inputDigest
  const prepared = await f.call('/api/studio/prepare', 'POST', manifest)
  assert.equal(prepared.status, 200)
  const receipt = await prepared.json() as StudioReceipt
  assert.equal((await f.call('/api/studio/jobs', 'POST', changed, receipt)).status, 409)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined }); assert.equal(f.submitted.length, 0)
})

test('ordinary funded input keeps its existing preparation and does not consume the project budget', async () => {
  const f = await fixture({ provider: 200 }), other = { ...draft, prompt: 'A different funded model' }
  const receipt = await f.prepare(other)
  assert.equal((await f.call('/api/studio/jobs', 'POST', other, receipt)).status, 202)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined })
  assert.equal(f.submitted.length, 1); assert.equal(f.balances().provider, 25); f.history()
})

test('forged no-photo preparation metadata cannot bypass the actual new-funded route boundary', async () => {
  const f = await fixture({ approvedInput: photoDraft })
  const manifest = await prepareStudioInput(photoDraft); manifest.photoCount = 0
  const prepared = await f.call('/api/studio/prepare', 'POST', manifest)
  assert.equal(prepared.status, 200, 'Preparation commits a digest, not trusted photo bytes')
  const receipt = await prepared.json() as StudioReceipt
  const response = await f.call('/api/studio/jobs', 'POST', photoDraft, receipt)
  assert.equal(response.status, 429)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined }); assert.equal(f.submitted.length, 0)
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 }); f.history()
})

test('a previously prepared unsupported route cannot borrow newly activated MCC authority', async () => {
  const other = { ...draft, worldId: 'ai-game-lab' as const }, f = await fixture({ configured: false, approvedInput: other })
  const receipt = await f.prepare(other)
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = JSON.stringify(f.approval)
  assert.equal((await f.call('/api/studio/jobs', 'POST', other, receipt)).status, 429)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined }); assert.equal(f.submitted.length, 0)
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 }); f.history()
})

test('one project-funded MCC request preserves ordinary funding and charges250 only after actual GLB validation', async () => {
  const f = await fixture(), receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  assert.equal(f.submitted.length, 1); assert.equal(f.submitted[0].studioPricing, undefined)
  assert.match(String(f.submitted[0].agentInstructions), /USD 1\.75/)
  assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 98 })
  const claims = f.claims(); assert.ok(claims.local); assert.deepEqual(claims.local, claims.global)
  f.state('succeeded')
  const result = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)
  assert.equal((await result.json() as { job: StudioJob }).job.state, 'succeeded')
  assert.deepEqual(f.balances(), { credits: 750, held: 0, provider: 98 })
  await f.call('/api/studio/jobs', 'POST', draft, receipt)
  assert.equal(f.submitted.length, 1); assert.equal(f.budgetReads(), 0)
  assert.deepEqual(f.claims(), claims); f.history()
})

test('failed project-funded MCC releases only the point hold and never refills either allowance or provider pool', async () => {
  const f = await fixture(), receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', draft, receipt)
  const claims = f.claims(); f.state('failed')
  const result = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)
  assert.equal((await result.json() as { job: StudioJob }).job.state, 'failed')
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 })
  assert.equal((await f.status()).astraProjectBudget?.committed, true)
  assert.equal((await f.status()).studioAdmission.allowed, false)
  assert.equal(f.budgetReads(), 0); assert.deepEqual(f.claims(), claims); f.history()
})

test('lost Oracle acknowledgement and replay use only the same consumed request', async () => {
  const f = await fixture(), receipt = await f.prepare(); f.loseResponse()
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  const claims = f.claims()
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  assert.equal(f.submitted.length, 1); assert.deepEqual(f.claims(), claims)
  assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 98 }); f.history()
})

test('expiry after preparation refuses a new reservation before any Oracle POST', async () => {
  const f = await fixture(), receipt = await f.prepare()
  f.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = JSON.stringify({ ...f.approval, issuedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() - 60_000).toISOString() })
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 429)
  assert.equal(f.submitted.length, 0); assert.deepEqual(f.claims(), { local: undefined, global: undefined })
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 }); f.history()
})

test('canonical prompt normalization uses one exact fingerprint and concurrent submissions produce one Oracle POST', async () => {
  const f = await fixture(), normalized = { ...draft, prompt: `  ${draft.prompt}  ` }, receipt = await f.prepare(normalized)
  assert.equal((await prepareStudioInput(normalized)).inputDigest, (await prepareStudioInput(draft)).inputDigest)
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.call('/api/studio/jobs', 'POST', normalized, receipt)))
  assert.ok(responses.every(response => response.status === 202))
  assert.equal(f.submitted.length, 1)
  assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 98 }); f.history()
})

test('lost project, account and dispatch acknowledgements never automatically repeat a paid submission', async () => {
  for (const boundary of ['project', 'account', 'dispatch']) {
    const f = await fixture(), receipt = await f.prepare(), namespace = f.env.ACCOUNT_ENTITLEMENTS!
    let dropped = false, matchingCalls = 0
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request), path = operationPath(request)
        const result = await response.clone().json() as Record<string, unknown>
        const matches = boundary === 'project' ? new URL(request.url).pathname === '/astra-project-budget-claim' : boundary === 'account' ? path === '/reserve' && result.allowed === true : path === '/studio-dispatch'
        if (matches) matchingCalls++
        if (matches && !dropped) { dropped = true; throw new Error('Synthetic lost acknowledgement') }
        return response
      } }
    } }
    await f.call('/api/studio/jobs', 'POST', draft, receipt)
    assert.equal(matchingCalls, 1, 'No automatic retry at the uncertain boundary')
    assert.equal(f.submitted.length, 0)
    const committed = f.claims().global
    for (let i = 0; i < 3; i++) await f.call('/api/studio/jobs', 'POST', draft, receipt)
    // A global-only claim can recover the same never-dispatched job exactly once.
    // An existing account or dispatch claim is strictly recovery-only.
    assert.equal(f.submitted.length, boundary === 'project' ? 1 : 0)
    assert.deepEqual(f.claims().global, committed)
    assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 98 }); f.history()
  }
})

test('expiry after every submission await boundary prevents the Oracle POST', async t => {
  const initial = Date.parse('2026-10-05T10:00:00.000Z')
  let now = initial
  t.mock.method(Date, 'now', () => now)
  for (const boundary of ['project claim', 'account admission', 'operator budget', 'dispatch claim']) {
    now = initial
    const f = await fixture(), receipt = await f.prepare(), namespace = f.env.ACCOUNT_ENTITLEMENTS!
    const expired = Date.parse(f.approval.expiresAt)
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: namespace.idFromName, get(id) {
      const object = namespace.get(id)
      return { async fetch(request) {
        const response = await object.fetch(request), path = operationPath(request)
        const value = await response.clone().json() as Record<string, unknown>
        if (boundary === 'project claim' && new URL(request.url).pathname === '/astra-project-budget-claim' ||
            boundary === 'account admission' && path === '/reserve' && value.allowed === true ||
            boundary === 'dispatch claim' && path === '/studio-dispatch') now = expired
        return response
      } }
    } }
    if (boundary === 'operator budget') {
      const budgets = f.env.GENERATION_BUDGET!
      f.env.GENERATION_BUDGET = { idFromName: budgets.idFromName, get(id) {
        const object = budgets.get(id)
        return { async fetch(request) { const response = await object.fetch(request); if (new URL(request.url).pathname === '/reserve-studio') now = expired; return response } }
      } }
    }
    await f.call('/api/studio/jobs', 'POST', draft, receipt)
    assert.equal(f.submitted.length, 0, boundary)
    assert.ok(f.claims().global, boundary)
    assert.equal(f.balances().provider, 98); f.history()
    await f.call('/api/studio/jobs', 'POST', draft, receipt)
    assert.equal(f.submitted.length, 0, boundary)
  }
})

test('project readiness stays read-only with a committed record and absent ordinary provider key', async () => {
  const f = await fixture(), receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', draft, receipt)
  f.account.values.delete(PROVIDER)
  for (const store of f.stores.values()) store.forbidWrites()
  const before = structuredClone([...f.account.values]), committed = f.claims()
  await f.status(); await f.prepare()
  assert.deepEqual([...f.account.values], before); assert.deepEqual(f.claims(), committed)
  assert.equal(f.submitted.length, 1); assert.equal(f.account.values.has(PROVIDER), false)
})

test('matching project preparation bypasses an available repaired grant bound to a different draft', async () => {
  const f = await fixture(), previous = { ...JSON.parse(f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT!), fingerprint: 'b'.repeat(64) }
  f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = JSON.stringify(previous)
  f.account.values.delete(ASTRA_REPAIRED_MCC_KEY)
  // Instantiate the global objects through the read-only status path, then
  // model an unconsumed earlier authority. Its writes remain forbidden.
  await f.status(); f.stores.get(ASTRA_REPAIRED_MCC_NAMESPACE)!.values.delete(ASTRA_REPAIRED_MCC_KEY)
  assert.equal((await f.status()).astraRepairedMccGrant?.available, true)
  const receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  assert.equal(f.submitted.length, 1)
  assert.ok(f.claims().local); assert.equal(f.account.values.has(ASTRA_REPAIRED_MCC_KEY), false)
  assert.equal(f.stores.get(ASTRA_REPAIRED_MCC_NAMESPACE)!.writes.length, 0)
  assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 98 })
})

test('ordinary funds increasing before the first reservation cannot replace the approved project source', async () => {
  const f = await fixture(), receipt = await f.prepare()
  f.account.values.set(PROVIDER, 1000)
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  assert.equal(f.submitted.length, 1); assert.ok(f.claims().local)
  assert.deepEqual(f.balances(), { credits: 1000, held: 250, provider: 1000 }); f.history()
})

test('all available historical grants stay untouched throughout a successful project-funded pipeline', async () => {
  const f = await fixture()
  await f.status()
  for (const key of Object.keys(historical)) f.account.values.delete(key)
  for (const name of ['astra-support-once:v1', 'astra-support-supplemental:v1', ASTRA_REPAIRED_MCC_NAMESPACE])
    for (const key of Object.keys(historical)) f.stores.get(name)!.values.delete(key)
  const status = await f.status()
  assert.equal(status.astraSupportOnce?.available, true)
  const receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 202)
  f.state('succeeded')
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)).status, 200)
  assert.equal(f.submitted.length, 1); assert.deepEqual(f.balances(), { credits: 750, held: 0, provider: 98 })
  for (const key of Object.keys(historical)) assert.equal(f.account.values.has(key), false)
  for (const name of ['astra-support-once:v1', 'astra-support-supplemental:v1', ASTRA_REPAIRED_MCC_NAMESPACE]) assert.equal(f.stores.get(name)!.writes.length, 0)
})
