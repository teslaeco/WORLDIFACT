import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

const ORIGIN = 'https://worldifact.test'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID = '2b54a5b3-1111-4111-8111-c09fb2b2c218'
const FINGERPRINT = 'c'.repeat(64)
const secret = 'fixture-incomplete-original-receipt'.repeat(2)
const execution = { revision: 'studio-execution-v1' as const, model: 'sol' as const, mode: 'standard' as const }

function store() {
  const values = new Map<string, unknown>(), writes: string[] = []
  let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { writes.push(key); values.set(key, structuredClone(value)) },
    async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      return new Map([...values].filter(([key]) => key.startsWith(options.prefix) &&
        (!options.startAfter || key > options.startAfter)).sort(([a],[b]) => a.localeCompare(b))
        .slice(0, options.limit).map(([key,value]) => [key, structuredClone(value) as T]))
    },
    transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const value = queue.then(() => callback(storage)); queue = value.catch(() => {}); return value
    },
  }
  return { values, storage, writes }
}

async function fixture(config: { noModel?: boolean; mismatchProvider?: boolean; noDraft?: boolean } = {}) {
  const alice = store(), bob = store()
  const now = Date.now()
  alice.values.set('job:' + ID, {
    channel: 'studio', state: 'failed', failureCode: 'MODEL_BUDGET_EXCEEDED',
    fingerprint: FINGERPRINT, prompt: 'Mechanical brass workstation with glass flasks',
    profile: 'fast', model: 'sol', studioExecution: execution, kind: 'credits', cost: 50,
    at: now - 60000, updatedAt: now - 3000,
  })
  alice.values.set('balance', 1000); alice.values.set('customer-reserved-credits:v1', 50)
  alice.values.set('subscription', { id: 'sub_test', active: true, until: now + 86400000 })
  bob.values.set('balance', 1000)
  const requests: string[] = [], providerCalls: string[] = []
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: secret, ORACLE_ENDPOINT: 'https://incomplete.trycloudflare.com',
    ORACLE_API_TOKEN: 'fixture-token', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const objects = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = {
    idFromName: name => name,
    get(name) {
      const key = String(name)
      let object = objects.get(key)
      if (!object) {
        const owner = key.endsWith(ALICE) ? alice : bob
        object = new AccountEntitlements({ storage: owner.storage, id: { toString: () => key } }, env)
        objects.set(key, object)
      }
      const current = object
      return { fetch(req: Request) { requests.push(new URL(req.url).pathname); return current.fetch(req) } }
    },
  }
  const glb = detailedGLBFixture()
  const fetcher: typeof fetch = async (url, init) => {
    const uri = new URL(url instanceof Request ? url.url : String(url))
    if (uri.pathname === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      return Response.json({ id: token === 'Bearer bob-token' ? BOB : ALICE, email: 'inert@example.test' })
    }
    assert.equal(uri.hostname, 'incomplete.trycloudflare.com')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-token')
    assert.equal(init?.method || 'GET', 'GET', 'Draft recovery must not dispatch a new paid job')
    providerCalls.push(uri.pathname)
    if (uri.pathname === '/v1/jobs/' + ID)
      return Response.json({ id: ID, state: 'succeeded', modelStatus: config.noDraft ? 'reviewed' : 'draft' })
    if (uri.pathname === '/v1/jobs/' + ID + '/quality')
      return Response.json({ revision: 6, state: 'succeeded', hasModel: true,
        modelStatus: 'draft', automaticQualityAccepted: false,
        agent: { finished: false },
        agentUsage: { model: config.mismatchProvider ? 'gpt-6-luna' : 'gpt-6.1-sol', completed: false,
          error_code: 'MODEL_BUDGET_EXCEEDED' } })
    if (uri.pathname === '/v1/jobs/' + ID + '/model')
      return config.noModel ? Response.json({ error: 'No model' }, { status: 404 }) :
        new Response(glb, { headers: { 'Content-Type': 'model/gltf-binary',
          'Content-Length': String(glb.byteLength) } })
    if (uri.pathname === '/v1/jobs/' + ID + '/budget')
      return Response.json({}, { status: 404 })
    throw new Error('Unexpected real-provider call: ' + uri.pathname)
  }
  const payload = ID + '.' + Date.now() + '.' + FINGERPRINT
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('WORLDIFACT-STUDIO-RECEIPT-v1:' + payload + ':account:' + ALICE))
  const ticket = payload + '.' + Buffer.from(signed).toString('hex')
  const call = (path: string, options: { who?: 'alice' | 'bob'; ticket?: string; method?: string } = {}) =>
    studioApi(new Request(ORIGIN + path, { method: options.method || 'GET',
      headers: { Origin: ORIGIN, Cookie: '__Host-worldifact-access=' + (options.who === 'bob' ? 'bob-token' : 'alice-token'),
        ...(options.ticket ? { 'X-WORLDIFACT-Job': options.ticket } : {}) } }), env, fetcher)
  return { call, ticket, alice, bob, providerCalls, requests, glb }
}

test('budget-exhausted Oracle candidate is genuinely recoverable as owner-only INCOMPLETE GLB, not a successful model', async () => {
  const f = await fixture()
  const old = structuredClone(f.alice.values.get('job:' + ID))
  const before = await f.call('/api/studio/library')
  assert.equal((await before.json() as any).incompleteModels, undefined)
  const response = await f.call('/api/studio/jobs/' + ID + '/retain-draft', { method: 'POST', ticket: f.ticket })
  assert.equal(response.status, 200, await response.clone().text())
  const recovered = await response.json() as any
  assert.equal(recovered.retained, true)
  assert.equal(recovered.incomplete, true)
  assert.equal(recovered.verifiedProvider, false, 'An absent terminal receipt must not become Oracle-confirmed')
  assert.equal(f.alice.values.get('balance'), 1000)
  assert.equal(f.alice.values.get('customer-reserved-credits:v1'), 50)
  assert.deepEqual(f.alice.values.get('job:' + ID), old)
  const library = await (await f.call('/api/studio/library')).json() as any
  assert.deepEqual(library.models, [])
  assert.equal(library.incompleteModels?.length, 1)
  assert.equal(library.incompleteModels[0].completion, 'INCOMPLETE')
  assert.equal(library.incompleteModels[0].incompleteReason, 'MODEL_BUDGET_EXCEEDED')
  assert.equal(library.incompleteModels[0].studioExecution.model, 'sol')
  assert.equal(library.incompleteModels[0].providerEvidence, undefined)
  const draft = await f.call('/api/studio/jobs/' + ID + '/draft', { ticket: library.incompleteModels[0].receipt.ticket })
  assert.equal(draft.status, 200)
  assert.equal(draft.headers.get('X-WORLDIFACT-Provenance'), 'GENERATED-INCOMPLETE-UNREVIEWED')
  assert.deepEqual(Buffer.from(await draft.arrayBuffer()), Buffer.from(f.glb))
  const wrongRoute = await f.call('/api/studio/jobs/' + ID + '/model', { ticket: library.incompleteModels[0].receipt.ticket })
  assert.equal(wrongRoute.status, 409, 'A retained GLB must not silently become a final model')
  assert.equal((await f.call('/api/studio/jobs/' + ID + '/retain-draft', { method: 'POST', ticket: f.ticket })).status, 200)
  assert.equal((await (await f.call('/api/studio/library')).json() as any).incompleteModels.length, 1)
  assert.ok(f.providerCalls.every(path => /^\/v1\/jobs\/[a-f0-9-]+(?:\/quality|\/budget|\/model)?$/.test(path)))
  assert.equal(f.alice.values.get('balance'), 1000)
})

test('wrong account, missing GLB, fake provider and missing unfinished draft cannot be saved', async () => {
  for (const mode of ['foreign', 'missing', 'wrong-provider', 'reviewed'] as const) {
    const f = await fixture({ noModel: mode === 'missing', mismatchProvider: mode === 'wrong-provider',
      noDraft: mode === 'reviewed' })
    const res = await f.call('/api/studio/jobs/' + ID + '/retain-draft', {
      method: 'POST', ticket: f.ticket, who: mode === 'foreign' ? 'bob' : 'alice',
    })
    assert.equal(mode === 'foreign' || mode === 'wrong-provider' ? !res.ok : res.status === 200, true, mode)
    if (res.status === 200) assert.equal((await res.json() as any).retained, false, mode)
    assert.equal(f.alice.values.has('studio-incomplete-v1:' + ID), false)
    assert.equal(f.alice.values.get('balance'), 1000)
    assert.equal(f.alice.values.get('customer-reserved-credits:v1'), 50)
  }
})
