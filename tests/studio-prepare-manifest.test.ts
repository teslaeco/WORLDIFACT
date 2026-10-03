import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { inputDigest, prepareStudioInput, STUDIO_SUBMISSION_GRACE_MS, validateStudioInput, validateStudioPrepareManifest, type StudioInput, type StudioReceipt } from '../src/lib/studioProtocol.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const origin = 'https://worldifact.test'
// Container-only reference fixture; no image/model generation or network call.
const jpeg = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'An electrical control cabinet', purpose: 'object', textureMaxSize: 4096,
  photos: ['front','left','right'].map((view, i) => ({ name: `private-reference-${i}.jpg`, view: view as 'front' | 'left' | 'right', textureMaxSize: 4096, dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') })) }
function fixture() {
  let reservations = 0, posts = 0, photoReady = true, promptMaxLength = 5000
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'fixture-owner-'.repeat(4), ORACLE_API_TOKEN: 'fixture-oracle', ORACLE_ENDPOINT: 'https://fixture.trycloudflare.com',
    ENABLE_STUDIO_JOBS: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request) {
      if (new URL(request.url).pathname === '/status') return Response.json({ enabled: true, used: reservations, remaining: null, limit: null, unlimited: true })
      reservations++; return Response.json({ allowed: true })
    } }) } }
  const fetcher = (async (url, options) => {
    if (String(url).endsWith('/v1/health')) return Response.json({ ...detailedHealthFixture, photoInput: photoReady, promptMaxLength })
    assert.equal(String(url).endsWith('/v1/jobs'), true)
    assert.equal(options?.method, 'POST'); posts++
    return Response.json({ id: JSON.parse(String(options?.body)).id, state: 'queued' }, { status: 202 })
  }) as typeof fetch
  const call = (path: string, body: unknown, ticket?: string) => studioApi(new Request(origin + path, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) }, body: JSON.stringify(body) }), env, fetcher)
  return { call, counts: () => ({ reservations, posts }), noPhotos: () => { photoReady = false }, shortPrompts: () => { promptMaxLength = 2000 } }
}

test('lightweight prepare contains only bounded metadata and the canonical full-input commitment', async () => {
  const hugePhoto = Buffer.concat([jpeg.subarray(0, -2), Buffer.alloc(1024 * 1024), jpeg.subarray(-2)])
  const full: StudioInput = { ...input, prompt: '  An electrical control cabinet  ', photos: [{ ...input.photos[0], dataUrl: 'data:image/jpeg;base64,' + hugePhoto.toString('base64') }] }
  const manifest = await prepareStudioInput(full)
  assert.equal(manifest.version, 'studio-prepare-v1'); assert.equal(manifest.photoCount, 1)
  assert.equal(manifest.inputDigest, await inputDigest(validateStudioInput(full)))
  assert.equal(manifest.prompt, full.prompt.trim())
  const text = JSON.stringify(manifest)
  assert.ok(Buffer.byteLength(text) < 1024)
  assert.doesNotMatch(text, /dataUrl|data:image|private-reference|photos/)
  assert.deepEqual(validateStudioPrepareManifest(manifest), manifest)
})

test('manifest preparation reserves nothing; only the exact original full submission starts one job', async () => {
  const f = fixture(), manifest = await prepareStudioInput(input)
  const response = await f.call('/api/studio/prepare', manifest)
  assert.equal(response.status, 200)
  const receipt = await response.json() as StudioReceipt
  assert.equal(receipt.ticket.split('.')[2], manifest.inputDigest)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  const submitted = await f.call('/api/studio/jobs', input, receipt.ticket)
  assert.equal(submitted.status, 202)
  assert.deepEqual(f.counts(), { reservations: 1, posts: 1 })
})

test('legacy full prepare and lightweight prepare retain the identical canonical fingerprint', async () => {
  const f = fixture()
  const legacy = await (await f.call('/api/studio/prepare', input)).json() as StudioReceipt
  const manifest = await (await f.call('/api/studio/prepare', await prepareStudioInput(input))).json() as StudioReceipt
  assert.equal(legacy.ticket.split('.')[2], manifest.ticket.split('.')[2])
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
})

test('changed full input, reference bytes or reference metadata cannot consume a prepared commitment', async () => {
  const changed = [
    { ...input, prompt: input.prompt + ' changed' }, { ...input, worldId: 'ai-game-lab' }, { ...input, purpose: 'figurine' },
    { ...input, photos: input.photos.slice(1) },
    { ...input, photos: input.photos.map((photo, i) => i ? photo : { ...photo, name: 'changed.jpg' }) },
    { ...input, photos: input.photos.map((photo, i) => i ? photo : { ...photo, view: 'back' }) },
    { ...input, photos: input.photos.map((photo, i) => i ? photo : { ...photo, dataUrl: 'data:image/jpeg;base64,' + Buffer.concat([jpeg.subarray(0, -2), Buffer.from([0]), jpeg.subarray(-2)]).toString('base64') }) },
  ]
  for (const body of changed) {
    const f = fixture(), receipt = await (await f.call('/api/studio/prepare', await prepareStudioInput(input))).json() as StudioReceipt
    assert.equal((await f.call('/api/studio/jobs', body, receipt.ticket)).status, 409)
    assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  }
})

test('a claimed digest is never treated as proof of valid image contents', async () => {
  const invalid = { ...input, photos: [{ ...input.photos[0], dataUrl: 'data:image/jpeg;base64,bm90LWEtanBlZw==' }] }
  const f = fixture(), manifest = { ...await prepareStudioInput(input), inputDigest: await inputDigest(invalid) }
  const receipt = await (await f.call('/api/studio/prepare', manifest)).json() as StudioReceipt
  assert.equal((await f.call('/api/studio/jobs', invalid, receipt.ticket)).status, 400)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
})

test('manifest photo capability and prompt preflights are accurate and independently repeated on POST', async () => {
  const manifest = await prepareStudioInput(input), f = fixture(); f.noPhotos()
  assert.equal((await f.call('/api/studio/prepare', manifest)).status, 409)
  // Dishonest metadata can obtain only a commitment; it cannot bypass POST gates.
  const receipt = await (await f.call('/api/studio/prepare', { ...manifest, photoCount: 0 })).json() as StudioReceipt
  assert.equal((await f.call('/api/studio/jobs', input, receipt.ticket)).status, 409)
  assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  const g = fixture(); g.shortPrompts()
  assert.equal((await g.call('/api/studio/prepare', await prepareStudioInput({ ...input, prompt: 'x'.repeat(2000) }))).status, 400)
  assert.deepEqual(g.counts(), { reservations: 0, posts: 0 })
})

test('malformed, unversioned, overbounded and image-bearing manifests fail closed', async () => {
  const manifest = await prepareStudioInput(input)
  for (const bad of [
    { ...manifest, version: 'studio-prepare-v2' }, { ...manifest, version: undefined }, { ...manifest, inputDigest: 'xyz' },
    { ...manifest, inputDigest: 'A'.repeat(64) }, { ...manifest, photoCount: -1 }, { ...manifest, photoCount: 5 },
    { ...manifest, photoCount: '3' }, { ...manifest, photoCount: 0.5 }, { ...manifest, prompt: 'x'.repeat(4001) },
    { ...manifest, purpose: ['object'] }, { ...manifest, worldId: ['enchanted-ai-shop'] },
    { ...manifest, textureMaxSize: '4096' }, { ...manifest, photos: input.photos }, { ...manifest, dataUrl: input.photos[0].dataUrl },
  ]) {
    const f = fixture()
    assert.equal((await f.call('/api/studio/prepare', bad)).status, 400)
    assert.deepEqual(f.counts(), { reservations: 0, posts: 0 })
  }
  await assert.rejects(prepareStudioInput({ ...input, photos: Array(5).fill(input.photos[0]) }))
})

test('native workerd accepts the lightweight commitment and forwards the full references exactly once', { timeout: 30_000 }, async t => {
  const { build } = await import('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  const { fileURLToPath } = await import('node:url')
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'studio-manifest-native-fixture.ts', contents: `
    import { studioApi } from './server/studio.ts';
    let reservations = 0;
    const env = { OWNER_ACCESS_TOKEN: 'fixture-owner-secret-not-production-12345', ORACLE_API_TOKEN: 'fixture-oracle-only',
      ORACLE_ENDPOINT: 'https://fixture.trycloudflare.com', PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
      GENERATION_LIMITER: { async limit() { return { success: true }; } },
      GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request) {
        if (new URL(request.url).pathname === '/status') return Response.json({ enabled: true, used: reservations, remaining: null, limit: null, unlimited: true });
        reservations++; return Response.json({ allowed: true });
      } }) } };
    export default { fetch(request) {
      if (new URL(request.url).pathname === '/fixture-reservations') return Response.json({ reservations });
      return studioApi(request, env);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const submitted: Record<string, unknown>[] = []
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    // Every outbound request is intercepted. No real account/provider/job.
    outboundService: async request => {
      const url = new URL(request.url)
      assert.equal(url.origin, 'https://fixture.trycloudflare.com')
      if (url.pathname === '/v1/health') return Response.json(detailedHealthFixture)
      assert.equal(url.pathname, '/v1/jobs'); assert.equal(request.method, 'POST')
      const body = await request.json() as Record<string, unknown>; submitted.push(body)
      return Response.json({ id: body.id, state: 'queued' }, { status: 202 })
    },
  }))
  t.after(() => mf.dispose())
  const manifest = await prepareStudioInput(input)
  const prepared = await mf.dispatchFetch(origin + '/api/studio/prepare', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) })
  assert.equal(prepared.status, 200)
  const receipt = await prepared.json() as StudioReceipt
  assert.deepEqual(await (await mf.dispatchFetch(origin + '/fixture-reservations')).json(), { reservations: 0 })
  assert.equal(submitted.length, 0)
  const response = await mf.dispatchFetch(origin + '/api/studio/jobs', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-WORLDIFACT-Job': receipt.ticket }, body: JSON.stringify(input) })
  assert.equal(response.status, 202)
  assert.equal(submitted.length, 1)
  assert.deepEqual((submitted[0].photos as StudioInput['photos']).map(photo => photo.dataUrl), input.photos.map(photo => photo.dataUrl))
  assert.deepEqual(await (await mf.dispatchFetch(origin + '/fixture-reservations')).json(), { reservations: 1 })
})

test('native SQLite Durable Object serializes absent-submission closure against reservation in both orders', { timeout: 30_000 }, async t => {
  const { build } = await import('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  const { fileURLToPath } = await import('node:url')
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'studio-fence-native-fixture.ts', contents: `
    export { AccountEntitlements } from './server/entitlements.ts';
    export default { fetch(request, env) {
      const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('fixture-account-only'));
      return ledger.fetch(new Request('https://entitlements.internal' + new URL(request.url).pathname, request));
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    bindings: { ENABLE_ASTRA_PLANS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'AccountEntitlements', useSQLite: true } },
    outboundService: () => { throw new Error('Native fence fixture must never contact an external service') },
  }))
  t.after(() => mf.dispose())
  const call = async (path: string, body?: unknown) => {
    const response = await mf.dispatchFetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const value = await response.json() as Record<string, any>
    assert.ok([200, 429].includes(response.status), `Unexpected fixture status ${response.status}: ${JSON.stringify(value)}`)
    return value
  }
  const now = Date.now(), fingerprint = 'a'.repeat(64)
  await call('/grant', { id: 'in_nativefixture', credits: 4500, subscriptionId: 'sub_nativefixture' })
  await call('/subscription', { id: 'sub_nativefixture', until: now + 86400_000, active: true, revision: 1, plan: 'pro', grantId: 'in_nativefixture' })
  const request = (id: string) => ({ id, profile: 'slow', fingerprint, channel: 'studio', prompt: 'Native fixture model' })
  const missing = (id: string) => ({ id, fingerprint, issued: now - STUDIO_SUBMISSION_GRACE_MS - 1000 })

  const closedId = crypto.randomUUID(), before = await call('/status')
  assert.equal((await call('/studio-close-missing', missing(closedId))).closed, true)
  const blocked = await call('/reserve', request(closedId))
  assert.equal(blocked.allowed, false); assert.equal(blocked.state, 'failed')
  assert.deepEqual(await call('/status'), before)
  assert.deepEqual(await call('/studio-current', {}), { job: null })

  const reservedId = crypto.randomUUID()
  assert.equal((await call('/reserve', request(reservedId))).allowed, true)
  const preserved = await call('/studio-close-missing', missing(reservedId))
  assert.equal(preserved.closed, false); assert.equal(preserved.state, 'reserved')
  assert.equal((await call('/status')).reservedCredits, 250)
  assert.equal((await call('/studio-current', {})).job.id, reservedId)

  for (let attempt = 0; attempt < 4; attempt++) {
    const id = crypto.randomUUID(), heldBefore = (await call('/status')).reservedCredits
    const [closed, reserved] = await Promise.all([call('/studio-close-missing', missing(id)), call('/reserve', request(id))])
    assert.equal(closed.closed, !reserved.allowed, 'Closure and admission cannot both win')
    assert.equal((await call('/job', { id })).state, reserved.allowed ? 'reserved' : 'failed')
    assert.equal((await call('/status')).reservedCredits, heldBefore + (reserved.allowed ? 250 : 0))
  }
})
