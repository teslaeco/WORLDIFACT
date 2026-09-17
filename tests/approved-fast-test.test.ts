import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GenerationBudget, APPROVED_FAST_TEST, FAST_TEST_END, approvedFastSettings, type BudgetStorage } from '../server/budget.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'

function fixture(used = 6) {
  const values = new Map<string, number>([['reserved-attempts', used]])
  let queue: Promise<unknown> = Promise.resolve()
  const storage: BudgetStorage = {
    async get<T>(k: string) { return values.get(k) as T | undefined },
    async put(k, v) { values.set(k, v) },
    transaction<T>(fn: (s: BudgetStorage) => Promise<T>) { const next = queue.then(() => fn(storage)); queue = next.catch(() => {}); return next },
  }
  const env: StudioEnv = { ENABLE_APPROVED_FAST_TEST: 'true', GENERATION_REQUEST_LIMIT: '0', GENERATION_EXPIRES_AT: '',
    OWNER_ACCESS_TOKEN: 'fixture-owner-'.repeat(4), ORACLE_API_TOKEN: 'fixture-oracle-'.repeat(4), ORACLE_ENDPOINT: 'https://fixture.trycloudflare.com',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const object = new GenerationBudget({ storage }, env)
  env.GENERATION_BUDGET = { idFromName: n => n, get: () => object }
  let monetary = false, posts = 0
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; return Response.json({ id: JSON.parse(String(init.body)).id, state: 'building' }) }
    return Response.json({ ready: true, codexReady: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, photoInput: true, promptMaxLength: 5000,
      generationProfiles: ['standard', FAST_DRAFT_PROFILE], generationProfileRevision: 1,
      ...(monetary ? { fastBudgetRevision: 'fast-usd4-v1', fastBudgetMaxUsd: 4 } : {}) })
  }) as typeof fetch
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}) => studioApi(new Request('https://worldifact.test'+path,
    { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, fetcher)
  const activate = () => call('/api/studio/approved-test/activate', { approval: APPROVED_FAST_TEST }, { 'X-WORLDIFACT-Owner': env.ORACLE_API_TOKEN! })
  return { values, env, object, call, activate, cap: () => { monetary = true }, posts: () => posts }
}
const fast = { worldId: 'enchanted-ai-shop', prompt: 'Create one brown chess knight', purpose: 'figurine', textureMaxSize: 2048, photos: [], generationProfile: FAST_DRAFT_PROFILE }
async function oldReceipt(env: StudioEnv) {
  const prefix = `${crypto.randomUUID()}.${Date.now()}.${'a'.repeat(64)}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('WORLDIFACT-STUDIO-RECEIPT-v1:'+prefix))
  return prefix+'.'+Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('')
}

test('activation requires installer authorization AND installed monetary proof; status never arms it', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-09-17T16:00:00Z'))
  const f = fixture()
  assert.equal((await f.call('/api/studio/status')).status, 200)
  assert.equal(f.values.size, 1)
  assert.equal((await f.call('/api/studio/approved-test/activate', { approval: APPROVED_FAST_TEST })).status, 401)
  assert.equal((await f.activate()).status, 409)
  assert.equal(f.values.size, 1)
  f.cap()
  const r = await f.activate()
  assert.equal(r.status, 200)
  const value = await r.json() as { remaining: number; used: number; limit: number; paidGenerationRequested: boolean }
  assert.equal(value.used, 6); assert.equal(value.limit, 7); assert.equal(value.remaining, 1)
  assert.equal(value.paidGenerationRequested, false); assert.equal(f.posts(), 0)
})

test('one activation adds exactly one reservation under concurrent clients and never arms legacy writes', async t => {
  let now = Date.parse('2026-09-17T16:00:00Z'); t.mock.method(Date, 'now', () => now)
  const f = fixture(); f.cap(); const first = await (await f.activate()).json() as { expiresAt: string }
  now += 60_000
  const repeated = await (await f.activate()).json() as { expiresAt: string }
  assert.equal(repeated.expiresAt, first.expiresAt, 'replay cannot extend the approved window')
  assert.equal((await f.object.fetch(new Request('https://internal/reserve',{method:'POST'}))).status,429)
  assert.equal((await f.object.fetch(new Request('https://internal/reserve-studio',{method:'POST',body:JSON.stringify({id:crypto.randomUUID()})}))).status,429)
  const attempts = await Promise.all(Array.from({length:10},()=>f.object.fetch(new Request('https://internal/reserve-studio',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),profile:FAST_DRAFT_PROFILE})}))))
  assert.equal(attempts.filter(r=>r.status===200).length,1); assert.equal(f.values.get('reserved-attempts'),7)
  await f.activate(); assert.equal(f.values.get('reserved-attempts'),7)
  now = Date.parse(first.expiresAt)+1
  assert.equal((await f.activate()).status,409)
  assert.equal(approvedFastSettings(f.env,FAST_TEST_END+1),null)
})

test('unexpected or missing historical counter cannot receive a fresh budget', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-09-17T16:00:00Z'))
  for (const used of [0,5,7,100]) { const f=fixture(used);f.cap();assert.equal((await f.activate()).status,409);assert.equal(f.values.get('reserved-attempts'),used) }
  const f=fixture();f.values.clear();f.cap();assert.equal((await f.activate()).status,409)
})

test('approved mode requires FAST and an existing signed receipt; only one upstream job starts', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-09-17T16:00:00Z'))
  const f=fixture();f.cap();await f.activate()
  assert.equal((await f.call('/api/studio/prepare',fast)).status,401)
  const headers={'X-WORLDIFACT-Previous-Job':await oldReceipt(f.env)}
  assert.equal((await f.call('/api/studio/prepare',{...fast,generationProfile:'standard'},headers)).status,409)
  const prepared=await (await f.call('/api/studio/prepare',fast,headers)).json() as {ticket:string}
  const submitHeaders={...headers,'X-WORLDIFACT-Job':prepared.ticket}
  assert.equal((await f.call('/api/studio/jobs',fast,submitHeaders)).status,202)
  assert.equal((await f.call('/api/studio/jobs',fast,submitHeaders)).status,202)
  assert.equal(f.posts(),1);assert.equal(f.values.get('reserved-attempts'),7)
  const status=await (await f.call('/api/studio/status')).json() as {reason:string;ready:boolean}
  assert.equal(status.ready,false);assert.equal(status.reason,'ALLOWANCE_EXHAUSTED')
})
