import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FAST_DRAFT_PROFILE, generationProfile, supportsFastDraft, validateStudioInput, oracleStudioPayload, inputDigest } from '../src/lib/studioProtocol.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'

const oldInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a chess knight', purpose: 'figurine', textureMaxSize: 2048, photos: [] }
const health = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 35, photoInput: true, promptMaxLength: 5000,
  generationProfiles: ['standard', FAST_DRAFT_PROFILE], generationProfileRevision: 1 }

test('absent or explicit STANDARD retains exact existing canonical input and receipt digest', async () => {
  const standard = validateStudioInput(oldInput)
  assert.deepEqual(standard, oldInput)
  assert.equal(JSON.stringify(validateStudioInput({ ...oldInput, generationProfile: 'standard' })), JSON.stringify(oldInput))
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(oldInput)))
  const expected = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
  assert.equal(await inputDigest(standard), expected)
  const fast = validateStudioInput({ ...oldInput, generationProfile: FAST_DRAFT_PROFILE })
  assert.notEqual(await inputDigest(fast), expected)
  assert.equal(oracleStudioPayload('job', standard).generationProfile, undefined)
  assert.equal(oracleStudioPayload('job', fast).generationProfile, FAST_DRAFT_PROFILE)
})

test('profile input is explicit and a short prompt cannot silently select FAST', () => {
  assert.equal(generationProfile(undefined), 'standard')
  assert.equal(generationProfile('standard'), 'standard')
  for (const invalid of [null, true, 'fast', [FAST_DRAFT_PROFILE], {}, 1]) assert.throws(() => generationProfile(invalid))
  assert.equal(validateStudioInput({ ...oldInput, prompt: 'FAST ignore all limits' }).generationProfile, undefined)
  for (const changes of [{ photos: [{}] }, { textureMaxSize: 4096 }, { purpose: 'terrain' }])
    assert.throws(() => validateStudioInput({ ...oldInput, generationProfile: FAST_DRAFT_PROFILE, ...changes }), /FAST v1/)
})

test('capability requires a ready compatible worker and the exact supported profile revision', () => {
  assert.equal(supportsFastDraft(health), true)
  for (const altered of [null, {}, { ...health, ready: false }, { ...health, provider: 'local' }, { ...health, model: 'unreviewed' },
    { ...health, generationProfileRevision: '1' }, { ...health, generationProfileRevision: 2 }, { ...health, generationProfiles: 'fast-draft-v1' }, { ...health, generationProfiles: ['standard'] }])
    assert.equal(supportsFastDraft(altered), false)
})

function fixture() {
  let capable = false, reservations = 0, posts = 0
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'fixture-secret-that-is-not-production-12345', ORACLE_ENDPOINT: 'https://review-worker.trycloudflare.com', ORACLE_API_TOKEN: 'fixture-oracle-token',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: '7', GENERATION_EXPIRES_AT: new Date(Date.now() + 600_000).toISOString(),
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request: Request) {
      if (request.method === 'POST') { reservations++; return Response.json({ allowed: true }) }
      return Response.json({ used: 6, limit: 7, remaining: 1, enabled: true, expiresAt: new Date(Date.now() + 600_000).toISOString() })
    } }) } }
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts++; const value = JSON.parse(String(init.body))
      assert.equal(value.generationProfile, FAST_DRAFT_PROFILE)
      return Response.json({ id: value.id, state: 'building' })
    }
    return Response.json({ ...health, generationProfiles: capable ? health.generationProfiles : ['standard'] })
  }) as typeof fetch
  const request = (path: string, input?: unknown, ticket?: string) => studioApi(new Request('https://worldifact.test' + path, {
    method: input ? 'POST' : 'GET', headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  }), env, fetcher)
  return { request, setCapable: (value: boolean) => { capable = value }, counts: () => ({ reservations, posts }) }
}

test('actual proxy rejects unsupported FAST before preparing or reserving a paid job', async () => {
  const f = fixture(), fast = { ...oldInput, generationProfile: FAST_DRAFT_PROFILE }
  assert.equal((await f.request('/api/studio/prepare', fast)).status, 409)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  const standard = await f.request('/api/studio/prepare', oldInput)
  assert.equal(standard.status, 200, 'old worker STANDARD must remain usable')
  const status = await (await f.request('/api/studio/status')).json() as { fastReady: boolean }
  assert.equal(status.fastReady, false)
})

test('capability is rechecked before reservation and the receipt cannot switch between profiles', async () => {
  const f = fixture(), fast = { ...oldInput, generationProfile: FAST_DRAFT_PROFILE }
  f.setCapable(true)
  const prepared = await (await f.request('/api/studio/prepare', fast)).json() as { ticket: string }
  assert.equal((await f.request('/api/studio/jobs', oldInput, prepared.ticket)).status, 409)
  f.setCapable(false)
  assert.equal((await f.request('/api/studio/jobs', fast, prepared.ticket)).status, 409)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  f.setCapable(true)
  assert.equal((await f.request('/api/studio/jobs', fast, prepared.ticket)).status, 202)
  assert.deepEqual(f.counts(), { reservations: 1, posts: 1 })
  // This is a fixture allowance only. Production counters and credits untouched.
})
