import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv, type StudioExecutionContext } from '../server/studio.ts'
import { handle } from '../server/worker.ts'
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
  let acceptLost = false, photoReady = true, invalidModel = false, invalidExport = false
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer oracle-test-only'); assert.equal(init?.redirect, 'manual')
    if (String(url).endsWith('/v1/health')) return Response.json({ ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, photoInput: photoReady, promptMaxLength: 5000 })
    if (String(url).endsWith('/v1/jobs') && init?.method === 'POST') {
      if (acceptLost) throw new TypeError('Simulated lost response, not a provider call')
      const body = JSON.parse(String(init.body)); return Response.json({ id: body.id, state: 'building' }, { status: 202 })
    }
    if (String(url).endsWith('/model')) {
      const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
      view.setUint32(0, invalidModel ? 0 : 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 24, true)
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '24' } })
    }
    if (String(url).includes('/exports/')) {
      const format = String(url).split('/').at(-1)
      const bytes = invalidExport ? new TextEncoder().encode('<html>export failed</html>') : format === 'blend'
        ? new TextEncoder().encode('BLENDER-v405DATA')
        : readFileSync(new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.' + (format === 'fbx' ? 'fbx' : 'textures.zip'), import.meta.url))
      return new Response(bytes, { headers: { 'Content-Length': String(bytes.length), 'Content-Type': 'application/octet-stream' } })
    }
    return Response.json({ state: 'succeeded', detail: 'PRIVATE detail must not be echoed' })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, requestOrigin = origin) => studioApi(new Request(origin + path, {
    method, headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env, fetcher)
  return { env, values, calls, call, object, fetcher, loseResponse: () => { acceptLost = true }, blockPhotos: () => { photoReady = false }, corruptModel: () => { invalidModel = true }, corruptExport: () => { invalidExport = true } }
}
const posts = (f: ReturnType<typeof fixture>) => f.calls.filter(c => c.url.endsWith('/v1/jobs') && c.init?.method === 'POST')

test('Worker retains exactly the admitted submission promise through receipt parsing, without resubmission', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const retained: Promise<unknown>[] = []
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    return { promise, resolve }
  }
  const registered = deferred(), dispatched = deferred(), release = deferred()
  const context: StudioExecutionContext = { waitUntil(promise) {
    assert.equal(this, context, 'Preserve native context receiver')
    retained.push(promise); registered.resolve()
  } }
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/v1/jobs') && init?.method === 'POST') {
      dispatched.resolve()
      await release.promise
    }
    return f.fetcher(url, init)
  }
  const request = () => new Request(origin + '/api/studio/jobs', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': prepared.ticket }, body: JSON.stringify(input) })
  const pending = handle(request(), f.env, fetcher, context)
  await Promise.all([dispatched.promise, registered.promise])
  assert.equal(retained.length, 1)
  let retainedDone = false
  void retained[0].then(() => { retainedDone = true })
  await Promise.resolve()
  assert.equal(retainedDone, false)
  assert.equal((await handle(request(), f.env, fetcher, context)).status, 202)
  assert.equal(retained.length, 2, 'Recovery is retained but never schedules another Oracle submission')
  release.resolve()
  assert.equal((await data(pending)).job.state, 'building')
  await retained[0]
  assert.equal(posts(f).length, 1)
  assert.equal(f.values.get('reserved-attempts'), 6)
})

test('failed admission schedules no background task; uncertain dispatch is retained once and never retried', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const retained: Promise<unknown>[] = []
  const context: StudioExecutionContext = { waitUntil(promise) { retained.push(promise) } }
  const request = (ticket: string) => new Request(origin + '/api/studio/jobs', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': ticket }, body: JSON.stringify(input) })
  assert.equal((await studioApi(request('invalid'), f.env, f.fetcher, false, context)).status, 401)
  assert.equal(retained.length, 0)
  f.loseResponse()
  assert.equal((await data(studioApi(request(prepared.ticket), f.env, f.fetcher, false, context))).job.state, 'pending')
  await Promise.all(retained)
  assert.equal(retained.length, 1)
  assert.equal((await studioApi(request(prepared.ticket), f.env, f.fetcher, false, context)).status, 202)
  assert.equal(retained.length, 2)
  assert.equal(posts(f).length, 1)
})

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
  assert.ok((await (await f.call(path + '/exports/pbr', 'GET', undefined, prepared.ticket)).arrayBuffer()).byteLength > 30)
  f.corruptModel(); assert.equal((await f.call(path + '/model', 'GET', undefined, prepared.ticket)).status, 502)
  assert.equal(posts(f).length, 0)
})

test('preview and format downloads keep independent bounded slots for each signed job', async () => {
  const f = fixture(), hits = new Map<string, number>()
  f.env.GENERATION_LIMITER = { async limit({ key }) {
    const count = (hits.get(key) ?? 0) + 1; hits.set(key, count)
    return { success: count <= 3 }
  } }
  const first = await data(f.call('/api/studio/prepare', 'POST', input))
  const second = await data(f.call('/api/studio/prepare', 'POST', { ...input, prompt: 'A different ivory study' }))
  const get = (job: Reply, route: string) => f.call(`/api/studio/jobs/${job.id}/${route}`, 'GET', undefined, job.ticket)
  for (const route of ['model', 'model', 'exports/pbr', 'exports/fbx', 'exports/blend']) {
    const response = await get(first, route)
    assert.equal(response.status, 200, route); await response.arrayBuffer()
  }
  assert.equal((await get(first, 'model')).status, 200)
  const upstreamBeforeDenied = f.calls.length
  assert.equal((await get(first, 'model')).status, 429, 'Repeated downloads of the same format remain rate limited')
  assert.equal(f.calls.length, upstreamBeforeDenied, 'A denied artifact request never reaches Oracle')
  for (const route of ['model', 'exports/pbr', 'exports/fbx', 'exports/blend']) assert.equal((await get(second, route)).status, 200, route)
  assert.equal((await f.call(`/api/studio/jobs/${second.id}/model`, 'GET', undefined, first.ticket)).status, 401)
  assert.equal(posts(f).length, 0)
  assert.equal(f.values.get('reserved-attempts'), 5)
})

test('status throttling returns Retry-After without contacting Oracle or reserving another job', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  const upstream = f.calls.length
  f.env.GENERATION_LIMITER = { async limit() { return { success: false } } }
  const response = await f.call(`/api/studio/jobs/${prepared.id}`, 'GET', undefined, prepared.ticket)
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '60')
  assert.equal(f.calls.length, upstream)
  assert.equal(f.values.get('reserved-attempts'), 5)
  assert.equal(posts(f).length, 0)
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
  const sent = JSON.parse(String(posts(f)[0].init?.body))
  assert.deepEqual(sent.photos, [photo])
  assert.match(sent.agentInstructions, /authoritative visual input/i)
  assert.match(sent.agentInstructions, /architecture/i)
  const blocked = fixture(); blocked.blockPhotos()
  assert.equal((await blocked.call('/api/studio/prepare', 'POST', body)).status, 409)
  assert.equal(posts(blocked).length, 0)
})

test('four-reference MAKE cabinet reaches v33 admission once with the complete bounded instruction envelope', async () => {
  const f = fixture()
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  const value = validateStudioInput({ ...input, purpose: 'object', prompt: 'Industrial electrical cabinet for 3D printing',
    photos: ['front','left','right','back'].map(view=>({name:view+'.jpg',view,dataUrl:jpeg,textureMaxSize:4096})) })
  const receipt = await data(f.call('/api/studio/prepare','POST',value))
  const response = await f.call('/api/studio/jobs','POST',value,receipt.ticket)
  assert.equal(response.status,202)
  const wire=JSON.parse(String(posts(f)[0].init?.body))
  assert.ok(wire.agentInstructions.length<=12000,'Oracle checks UTF-16 instruction length before creating the job')
  assert.equal(wire.photos.length,4);assert.equal(wire.photos[0].dataUrl,jpeg)
  assert.match(wire.agentInstructions,/manufacturing hard rules/)
  assert.match(wire.agentInstructions,/Reference 2: left/)
  assert.equal(posts(f).length,1)
  await f.call('/api/studio/jobs','POST',value,receipt.ticket)
  assert.equal(posts(f).length,1,'reference retries never create a second paid dispatch')
})

 test('a 200 export error is refused without another generation or budget change', async () => {
  const f = fixture(), prepared = await data(f.call('/api/studio/prepare', 'POST', input))
  f.corruptExport()
  for (const format of ['fbx', 'blend', 'pbr']) {
    const result = await f.call(`/api/studio/jobs/${prepared.id}/exports/${format}`, 'GET', undefined, prepared.ticket)
    assert.equal(result.status, 502)
    assert.match(JSON.stringify(await result.json()), /does not match/)
  }
  assert.equal(posts(f).length, 0)
  assert.equal(f.values.get('reserved-attempts'), 5)
})

test('ten distinct sequential signed jobs and repeated receipts emit exactly ten mocked Oracle POSTs', async () => {
  const f = fixture(0)
  f.env.GENERATION_REQUEST_LIMIT = 'unlimited'
  f.env.GENERATION_EXPIRES_AT = ''
  const originalIds = new Set<string>()
  for (let index = 0; index < 10; index++) {
    const jobInput: StudioInput = { ...input, prompt: `Synthetic offline generation fixture ${index + 1}` }
    const prepared = await data(f.call('/api/studio/prepare', 'POST', jobInput))
    assert.ok(!originalIds.has(prepared.id), 'Each distinct fixture gets its own signed request ID')
    originalIds.add(prepared.id)
    const first = await data(f.call('/api/studio/jobs', 'POST', jobInput, prepared.ticket))
    assert.equal(first.job.id, prepared.id)
    assert.equal(first.job.state, 'building')
    const repeated = await f.call('/api/studio/jobs', 'POST', jobInput, prepared.ticket)
    assert.equal(repeated.status, 202)
    assert.equal(posts(f).length, index + 1, 'Receipt replay never dispatches another provider POST')
  }
  const dispatchedIds = posts(f).map(call => JSON.parse(String(call.init?.body)).id as string)
  assert.equal(dispatchedIds.length, 10)
  assert.equal(new Set(dispatchedIds).size, 10)
  assert.deepEqual(new Set(dispatchedIds), originalIds)
  assert.equal(f.values.get('reserved-attempts'), 10)
})
