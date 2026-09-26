import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { validateStudioInput, type StudioInput, type StudioJob } from '../src/lib/studioProtocol.ts'
const origin = 'https://worldifact.test'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create an ivory skull study', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
type Reply = { id: string; ticket: string; ready: boolean; reason: string; allowance: { remaining: number }; job: StudioJob }
const data = async (r: Promise<Response> | Response) => await (await r).json() as Reply
function fixture(used = 5) {
  const values = new Map<string, number>([['reserved-attempts', used]])
  let queue: Promise<unknown> = Promise.resolve()
  const storage: BudgetStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined }, async put(key, value) { values.set(key, value) },
    transaction<T>(callback: (store: BudgetStorage) => Promise<T>) { const next = queue.then(() => callback(storage)); queue = next.catch(() => {}); return next },
  }
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'owner-test-'.repeat(5), ORACLE_ENDPOINT: 'https://review-worker.trycloudflare.com', ORACLE_API_TOKEN: 'oracle-test-only',
    ENABLE_STUDIO_JOBS: 'true', ENABLE_ORACLE_JOBS: 'false', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: '6', GENERATION_EXPIRES_AT: new Date(Date.now() + 3600_000).toISOString(), GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const object = new GenerationBudget({ storage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => object }
  const calls: { url: string; init?: RequestInit }[] = []
  let acceptLost = false, photoReady = true, invalidModel = false
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer oracle-test-only'); assert.equal(init?.redirect, 'manual')
    if (String(url).endsWith('/v1/health')) return Response.json({ ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, photoInput: photoReady, promptMaxLength: 5000 })
    if (String(url).endsWith('/v1/jobs') && init?.method === 'POST') {
      if (acceptLost) throw new TypeError('Simulated lost response, not a provider call')
      const body = JSON.parse(String(init.body)); return Response.json({ id: body.id, state: 'building' }, { status: 202 })
    }
    if (String(url).endsWith('/exports/prepare') && init?.method === 'POST') {
      return Response.json({ prepared: true, alreadyReady: false, formats: ['pbr','fbx','blend'], paidGenerationRequested: false, generationRequested: false })
    }
    if (String(url).endsWith('/model')) {
      const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
      view.setUint32(0, invalidModel ? 0 : 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 24, true)
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '24' } })
    }
    if (String(url).includes('/exports/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3', 'Content-Type': 'application/zip' } })
    return Response.json({ state: 'succeeded', detail: 'PRIVATE detail must not be echoed' })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, requestOrigin = origin, extraHeaders: Record<string, string> = {}) => studioApi(new Request(origin + path, {
    method, headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env, fetcher)
  return { env, values, calls, call, object, loseResponse: () => { acceptLost = true }, blockPhotos: () => { photoReady = false }, corruptModel: () => { invalidModel = true } }
}
const posts = (f: ReturnType<typeof fixture>) => f.calls.filter(c => c.url.endsWith('/v1/jobs') && c.init?.method === 'POST')

test('status and preparation consume no attempt; a signed job consumes one original cumulative slot', async () => {
  const f = fixture(), status = await data(f.call('/api/studio/status'))
  assert.equal(status.ready, true); assert.equal(status.allowance.remaining, 1)
  const prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  assert.equal(f.values.get('reserved-attempts'), 5); assert.equal(posts(f).length, 0)
  const result = await data(f.call('/api/studio/jobs', 'POST', input, prepared.ticket))
  assert.equal(result.job.id, prepared.id); assert.equal(result.job.state, 'building')
  assert.equal(f.values.get('reserved-attempts'), 6); assert.equal(posts(f).length, 1)
  const sent = JSON.parse(String(posts(f)[0].init?.body))
  assert.match(sent.prompt, /self-contained GLB/); assert.match(sent.prompt, /4096px/); assert.equal(sent.id, prepared.id)
  assert.equal(JSON.stringify(result).includes('oracle-test'), false)
  const recovered = await data(f.call(`/api/studio/jobs/${prepared.id}`, 'GET', undefined, prepared.ticket))
  assert.equal(recovered.job.state, 'succeeded'); assert.doesNotMatch(JSON.stringify(recovered), /PRIVATE/)
})

test('ongoing LIVE Studio ignores cumulative count but keeps receipt idempotency', async () => {
  const f = fixture(500)
  f.env.GENERATION_REQUEST_LIMIT = 'unlimited'
  f.env.GENERATION_EXPIRES_AT = ''
  const status = await (await f.call('/api/studio/status')).json() as { ready: boolean; reason: string; allowance: { used: number; remaining: null; limit: null; unlimited: boolean } }
  assert.equal(status.ready, true); assert.equal(status.reason, 'READY')
  assert.equal(status.allowance.used, 500); assert.equal(status.allowance.remaining, null); assert.equal(status.allowance.limit, null); assert.equal(status.allowance.unlimited, true)
  const prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket)).status, 202)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket)).status, 202)
  assert.equal(posts(f).length, 1)
  assert.equal(f.values.get('reserved-attempts'), 501)
})

test('lost acceptance and concurrent repeat submissions cannot issue a second paid POST', async () => {
  const f = fixture(); f.loseResponse()
  const prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const responses = await Promise.all(Array.from({ length: 4 }, () => f.call('/api/studio/jobs', 'POST', input, prepared.ticket)))
  for (const response of responses) assert.equal(response.status, 202)
  assert.equal(posts(f).length, 1); assert.equal(f.values.get('reserved-attempts'), 6)
  assert.equal((await data(f.call(`/api/studio/jobs/${prepared.id}`, 'GET', undefined, prepared.ticket))).job.state, 'succeeded')
})

test('tampered receipts, changed inputs and cross-origin requests cannot reserve or read other models', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const last = prepared.ticket.slice(-1) === '0' ? '1' : '0'
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket.slice(0, -1) + last)).status, 401)
  assert.equal((await f.call('/api/studio/jobs', 'POST', { ...input, prompt: 'Changed request' }, prepared.ticket)).status, 409)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket, 'https://other.test')).status, 403)
  assert.equal((await f.call(`/api/studio/jobs/${crypto.randomUUID()}/model`, 'GET', undefined, prepared.ticket)).status, 401)
  assert.equal(posts(f).length, 0); assert.equal(f.values.get('reserved-attempts'), 5)
})

test('disabled is not reported as exhausted and existing receipts remain read-only', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  f.env.ENABLE_STUDIO_JOBS = 'false'
  const status = await data(f.call('/api/studio/status'))
  assert.equal(status.reason, 'DISABLED_OR_EXPIRED'); assert.equal(status.ready, false)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket)).status, 503)
  assert.equal((await f.call(`/api/studio/jobs/${prepared.id}`, 'GET', undefined, prepared.ticket)).status, 200)
  assert.equal(posts(f).length, 0)
  const exhausted = fixture(6)
  assert.equal((await data(exhausted.call('/api/studio/status'))).reason, 'ALLOWANCE_EXHAUSTED')
  assert.equal((await exhausted.call('/api/studio/prepare', 'POST', input)).status, 429)
})

test('GLB and texture exports need the exact receipt and never trigger generation', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input)), path = `/api/studio/jobs/${prepared.id}`
  assert.equal((await f.call(path + '/model')).status, 401)
  const glb = await f.call(path + '/model', 'GET', undefined, prepared.ticket)
  assert.equal(glb.status, 200); assert.equal((await glb.arrayBuffer()).byteLength, 24); assert.match(glb.headers.get('Content-Disposition')!, /attachment/)
  assert.equal((await (await f.call(path + '/exports/pbr', 'GET', undefined, prepared.ticket)).arrayBuffer()).byteLength, 3)
  f.corruptModel(); assert.equal((await f.call(path + '/model', 'GET', undefined, prepared.ticket)).status, 502)
  assert.equal(posts(f).length, 0)
})

test('owned receipt can request idempotent post-hoc exports without a generation POST', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const path = `/api/studio/jobs/${prepared.id}/exports/prepare`
  assert.equal((await f.call(path, 'POST', {}, undefined)).status, 401)
  assert.equal((await f.call(path, 'POST', {}, prepared.ticket, 'https://other.test')).status, 403)
  const response = await f.call(path, 'POST', {}, prepared.ticket)
  assert.equal(response.status, 200)
  const value = await response.json() as { prepared: boolean; alreadyReady: boolean; formats: string[]; paidGenerationRequested: boolean; generationRequested: boolean }
  assert.equal(value.prepared, true)
  assert.equal(value.alreadyReady, false)
  assert.deepEqual(value.formats, ['pbr','fbx','blend'])
  assert.equal(value.paidGenerationRequested, false)
  assert.equal(value.generationRequested, false)
  assert.equal(posts(f).length, 0)
  const upstream = f.calls.filter(call => call.url.endsWith('/exports/prepare'))
  assert.equal(upstream.length, 1)
  assert.equal(upstream[0].init?.method, 'POST')
})


test('invalid photos and unrecognized fields are rejected before contacting paid services', async () => {
  const f = fixture()
  for (const body of [{ ...input, photos: [{ dataUrl: 'https://private.invalid' }] }, { ...input, apiKey: 'not-allowed' }, { ...input, prompt: '' }, { ...input, textureMaxSize: '4096' }]) assert.equal((await f.call('/api/studio/prepare', 'POST', body)).status, 400)
  assert.equal(posts(f).length, 0); assert.throws(() => validateStudioInput({ ...input, photos: Array(5).fill({}) }))
})

test('photo bytes and requested texture limit reach the existing protocol, never a text-only substitute', async () => {
  // Header fixture tests transport/dimension validation, not JPEG visual decoding.
  const bytes = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
  const photo = { name: 'reference.jpg', view: 'front', dataUrl: 'data:image/jpeg;base64,' + bytes.toString('base64'), textureMaxSize: 4096 }
  const body = { ...input, photos: [photo] }, f = fixture()
  const prepared = await data(f.call('/api/studio/prepare', 'POST', body))
  assert.equal((await f.call('/api/studio/jobs', 'POST', body, prepared.ticket)).status, 202)
  assert.deepEqual(JSON.parse(String(posts(f)[0].init?.body)).photos, [photo])
  const blocked = fixture(); blocked.blockPhotos()
  assert.equal((await blocked.call('/api/studio/prepare', 'POST', body)).status, 409)
  assert.equal(posts(blocked).length, 0)
})

test('artifact limiter separates initial and prepared retry stages plus export formats', async () => {
  const f = fixture(), seen = new Set<string>()
  f.env.GENERATION_LIMITER = { async limit({ key }: { key: string }) {
    if (seen.has(key)) return { success: false }
    seen.add(key); return { success: true }
  } }
  const prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const base = `/api/studio/jobs/${prepared.id}`
  assert.equal((await f.call(base + '/exports/prepare', 'POST', {}, prepared.ticket)).status, 200)
  assert.equal((await f.call(base + '/exports/pbr', 'GET', undefined, prepared.ticket, origin, { 'X-WORLDIFACT-Artifact-Stage': 'initial' })).status, 200)
  assert.equal((await f.call(base + '/exports/pbr', 'GET', undefined, prepared.ticket, origin, { 'X-WORLDIFACT-Artifact-Stage': 'prepared' })).status, 200)
  assert.equal((await f.call(base + '/exports/fbx', 'GET', undefined, prepared.ticket, origin, { 'X-WORLDIFACT-Artifact-Stage': 'initial' })).status, 200)
  assert.ok([...seen].some(key => key.includes(`artifact:${prepared.id}:pbr:initial`)))
  assert.ok([...seen].some(key => key.includes(`artifact:${prepared.id}:pbr:prepared`)))
  assert.ok([...seen].some(key => key.includes(`artifact:${prepared.id}:fbx:initial`)))
})
