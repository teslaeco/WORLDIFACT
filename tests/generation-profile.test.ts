import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FAST_DRAFT_PROFILE, generationProfile, supportsFastDraft, validateStudioInput, oracleStudioPayload, inputDigest } from '../src/lib/studioProtocol.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'

const oldInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a chess knight', purpose: 'figurine', textureMaxSize: 2048, photos: [] }
const health = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 35, photoInput: true, promptMaxLength: 5000,
  generationProfiles: ['standard', FAST_DRAFT_PROFILE], generationProfileRevision: 1,
  fastBudgetRevision: 'fast-usd4-v1', fastBudgetMaxUsd: 4 }

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

test('STANDARD photo jobs carry explicit reference-fidelity instructions to the Oracle worker', () => {
  const bytes = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
  const standard = validateStudioInput({ ...oldInput, photos: [{ name: 'tower.jpg', view: 'front', dataUrl: 'data:image/jpeg;base64,' + bytes.toString('base64'), textureMaxSize: 2048 }] })
  const payload = oracleStudioPayload('job', standard)
  assert.ok('photos' in payload)
  assert.deepEqual('photos' in payload ? payload.photos : undefined, standard.photos)
  assert.ok('agentInstructions' in payload)
  assert.match('agentInstructions' in payload ? payload.agentInstructions || '' : '', /authoritative visual input/i)
  assert.match('agentInstructions' in payload ? payload.agentInstructions || '' : '', /architecture/i)
  assert.match('agentInstructions' in payload ? payload.agentInstructions || '' : '', /Never regularize/i)
  const textOnly = oracleStudioPayload('job', validateStudioInput(oldInput))
  assert.ok('agentInstructions' in textOnly)
  assert.match(textOnly.agentInstructions, /manufacturing hard rules/)
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

test('FAST profile support without the reviewed budget guard still fails closed before reservation', async () => {
  let reservations = 0, posts = 0
  const env: StudioEnv = {
    OWNER_ACCESS_TOKEN: 'fixture-secret-that-is-not-production-12345',
    ORACLE_ENDPOINT: 'https://review-worker.trycloudflare.com',
    ORACLE_API_TOKEN: 'fixture-oracle-token',
    PUBLIC_PILOT: 'true',
    ENABLE_STUDIO_JOBS: 'true',
    GENERATION_REQUEST_LIMIT: '7',
    GENERATION_EXPIRES_AT: new Date(Date.now() + 600_000).toISOString(),
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request: Request) {
      if (request.method === 'POST') { reservations++; return Response.json({ allowed: true }) }
      return Response.json({ used: 1, limit: 7, remaining: 6, enabled: true, expiresAt: new Date(Date.now() + 600_000).toISOString() })
    } }) },
  }
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; return Response.json({ id: crypto.randomUUID(), state: 'building' }) }
    const { fastBudgetRevision: _revision, fastBudgetMaxUsd: _max, ...withoutGuard } = health
    return Response.json(withoutGuard)
  }) as typeof fetch
  const fast = { ...oldInput, generationProfile: FAST_DRAFT_PROFILE }
  const response = await studioApi(new Request('https://worldifact.test/api/studio/prepare', {
    method: 'POST',
    headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json' },
    body: JSON.stringify(fast),
  }), env, fetcher)
  assert.equal(response.status, 409)
  assert.equal(reservations, 0)
  assert.equal(posts, 0)
})

test('Oracle FAST remains blocked even when legacy capability reappears; Sol uses the separate blueprint path', async () => {
  const f = fixture(), fast = { ...oldInput, generationProfile: FAST_DRAFT_PROFILE }
  f.setCapable(true)
  const preparedResponse = await f.request('/api/studio/prepare', fast)
  assert.equal(preparedResponse.status, 409)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
})
