import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { ASTRA_SUPPORT_ONCE_KEY } from '../server/astraSupportOnce.ts'
import { ASTRA_SUPPLEMENTAL_KEY } from '../server/astraSupplementalGrant.ts'
import { ASTRA_REPAIRED_MCC_KEY, ASTRA_REPAIRED_MCC_NAMESPACE } from '../server/astraRepairedMccGrant.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { prepareStudioInput, type StudioInput, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { detailedGLBFixture, detailedHealthFixture } from './detailed-studio-fixture.ts'

const origin = 'https://worldifact.test'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const grantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PROVIDER = 'provider-budget-cents:v1'
const HELD = 'customer-reserved-credits:v1'
const draft: StudioInput = { worldId: 'enchanted-ai-shop', purpose: 'figurine', textureMaxSize: 4096, photos: [],
  prompt: 'Create a realistic industrial MCC electrical cabinet with breakers, lights, PLC modules, cooling fans and detailed wiring.' }
// Header-only fixture validates input transport; it is not a photograph/render.
const photoDraft: StudioInput = { ...draft, photos: [{ name: 'synthetic.jpg', view: 'front', textureMaxSize: 4096,
  dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64') }] }
const historical = { [ASTRA_SUPPORT_ONCE_KEY]: { immutable: 'original consumed fixture' }, [ASTRA_SUPPLEMENTAL_KEY]: { immutable: 'supplemental consumed fixture' } }
const fingerprint = async (input: StudioInput) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`WORLDIFACT-ACCOUNT-JOB-v1:${owner}:${(await prepareStudioInput(input)).inputDigest}`))).toString('hex')

function memory(seed: Record<string, unknown> = {}, protectProvider = false) {
  const values = new Map<string, unknown>(Object.entries(seed)), writes: string[] = []
  let tail: Promise<unknown> = Promise.resolve()
  const guardedPut = (map: Map<string, unknown>, key: string, value: unknown, log: string[]) => {
    if (key === ASTRA_SUPPORT_ONCE_KEY || key === ASTRA_SUPPLEMENTAL_KEY || protectProvider && key === PROVIDER) throw new Error('Protected financial history must not be written')
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
  return { values, writes, storage }
}

async function fixture(options: { provider?: number; approvedInput?: StudioInput; configured?: boolean } = {}) {
  const now = Date.now(), input = options.approvedInput ?? draft
  const approval = { version: 1, accountId: owner, grantId, issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), amountCents: 175, fingerprint: await fingerprint(input) }
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'inert-owner-fixture-'.repeat(3), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'inert-oracle-fixture',
    ENABLE_ASTRA_PLANS: 'true', PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', STUDIO_NEW_JOB_POLICY: 'legacy-usd175-v1',
    ...(options.configured === false ? {} : { WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT: JSON.stringify(approval) }), GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const stores = new Map<string, ReturnType<typeof memory>>(), objects = new Map<string, AccountEntitlements>()
  const accountName = `account:v1:${owner}`
  const account = memory({ balance: 1000, [HELD]: 0, [PROVIDER]: options.provider ?? 98, ...historical,
    subscription: { id: 'sub_Synthetic', active: true, until: now + 86_400_000, revision: 1, plan: 'pro' } }, options.provider === undefined)
  stores.set(accountName, account)
  const budget = new GenerationBudget({ storage: memory().storage as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(key) {
    const name = String(key)
    if (!stores.has(name)) stores.set(name, memory())
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
    claims: () => ({ local: structuredClone(account.values.get(ASTRA_REPAIRED_MCC_KEY)), global: structuredClone(stores.get(ASTRA_REPAIRED_MCC_NAMESPACE)?.values.get(ASTRA_REPAIRED_MCC_KEY)) }),
    history() { for (const [key, value] of Object.entries(historical)) assert.deepEqual(account.values.get(key), value) },
  }
}

test('new MCC readiness and exact-draft preparation are read-only before one fixed claim', async () => {
  const f = await fixture(), before = structuredClone([...f.account.values])
  const status = await f.status()
  assert.equal(status.studioAdmission.allowed, true); assert.equal(status.generationAdmission.astra.allowed, false)
  assert.equal(status.astraRepairedMccGrant?.available, true)
  await f.prepare()
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

test('ordinary funded input keeps its existing preparation and does not consume the new grant', async () => {
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
  f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = JSON.stringify(f.approval)
  assert.equal((await f.call('/api/studio/jobs', 'POST', other, receipt)).status, 429)
  assert.deepEqual(f.claims(), { local: undefined, global: undefined }); assert.equal(f.submitted.length, 0)
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 }); f.history()
})

test('one repaired MCC request preserves ordinary funding and charges250 only after actual GLB validation', async () => {
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

test('failed repaired MCC releases only the point hold and never refills either allowance or provider pool', async () => {
  const f = await fixture(), receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', draft, receipt)
  const claims = f.claims(); f.state('failed')
  const result = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt)
  assert.equal((await result.json() as { job: StudioJob }).job.state, 'failed')
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 })
  assert.equal((await f.status()).astraRepairedMccGrant?.consumed, true)
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
  f.env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT = JSON.stringify({ ...f.approval, issuedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() - 60_000).toISOString() })
  assert.equal((await f.call('/api/studio/jobs', 'POST', draft, receipt)).status, 429)
  assert.equal(f.submitted.length, 0); assert.deepEqual(f.claims(), { local: undefined, global: undefined })
  assert.deepEqual(f.balances(), { credits: 1000, held: 0, provider: 98 }); f.history()
})
