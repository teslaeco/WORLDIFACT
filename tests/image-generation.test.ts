import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { imageApi, imageStore, type ImageEnv } from '../server/imageGeneration.ts'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { IMAGE_MODELS, IMAGE_TERMS, parseImageInput, type ImageJob } from '../src/lib/imageGeneration.ts'

const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222'
const readReply = (r: Response) => r.json() as Promise<{ job: ImageJob; jobs: ImageJob[] }>
const now = () => 1791670000000
function memory() {
  let map = new Map<string, unknown>([['balance', 199]])
  let queue = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(map.get(key)) as T | undefined },
    async put(key, value) { map.set(key, structuredClone(value)) },
    transaction(fn) {
      const next = queue.then(async () => {
        const before = structuredClone(map)
        try { return await fn(storage) } catch (e) { map = before; throw e }
      })
      queue = next.then(() => {}, () => {}); return next
    },
  }
  return storage
}
function png() {
  const crc = (bytes: Buffer) => {
    let v = 0xffffffff
    for (const byte of bytes) { v ^= byte; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ ((v & 1) ? 0xedb88320 : 0) }
    return (v ^ 0xffffffff) >>> 0
  }
  const chunk = (kind: string, data: Buffer) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length); b.write(kind, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b }
  const header = Buffer.alloc(13); header.writeUInt32BE(1024); header.writeUInt32BE(1024, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((1024 * 3 + 1) * 1024))), chunk('IEND', Buffer.alloc(0))])
}
const image = png()
const input = (changes = {}) => ({ id: crypto.randomUUID(), prompt: 'A green and blue glass planet', model: IMAGE_MODELS[0], acceptedPoints: 25, revision: IMAGE_TERMS.revision, ...changes })
const env: ImageEnv = { OPENAI_API_KEY: 'test-only-not-a-secret', ENABLE_PAID_GENERATION: 'true', GENERATION_LIMITER: { async limit() { return { success: true } } },
  ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get() { throw new Error('Not used in store tests') } } }
const req = (path: string, body?: unknown) => new Request('https://internal' + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined })
const success = () => Response.json({ data: [{ b64_json: image.toString('base64') }], usage: { input_tokens: 30, output_tokens: 1000, total_tokens: 1030 } }, { headers: { 'x-request-id': 'req_image_fixture' } })

test('strict image price/model/input contract rejects spoofed owners, arbitrary costs and unsupported model IDs', () => {
  assert.equal(parseImageInput(input()).acceptedPoints, 25)
  for (const change of [{ owner: alice }, { acceptedPoints: 0 }, { revision: 'old' }, { model: 'gpt-image-2.5' }, { prompt: 'x'.repeat(4001) }, { prompt: '  ' }, { n: 4 }]) assert.throws(() => parseImageInput(input(change)))
})

test('one provider response fixture saves a private PNG and charges exactly 25 points; replay never dispatches', async () => {
  const storage = memory(), body = input(); let calls = 0
  await storage.put('customer-reserved-credits:v1', 40)
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/images/generations'); assert.equal(init?.redirect, 'error')
    assert.equal(await storage.get('customer-reserved-credits:v1'), 65)
    assert.deepEqual(JSON.parse(String(init?.body)), { model: body.model, prompt: body.prompt, n: 1, size: '1024x1024', quality: 'medium', output_format: 'png' })
    return success()
  }) as typeof fetch
  const first = await imageStore(req('/images', body), storage, env, alice, now, fetcher)
  const result = await readReply(first); assert.equal(result.job.state, 'completed'); assert.equal(result.job.settlement, 'charged')
  assert.equal(await storage.get('balance'), 174); assert.equal(await storage.get('customer-reserved-credits:v1'), 40)
  await imageStore(req('/images', body), storage, env, alice, now, fetcher)
  assert.equal(calls, 1)
  assert.equal((await imageStore(req('/images', { ...body, prompt: 'Changed prompt' }), storage, env, alice, now, fetcher)).status, 409)
  const download = await imageStore(req(`/images/${body.id}/file`), storage, env, alice, now, fetcher)
  assert.equal(download.headers.get('Content-Type'), 'image/png'); assert.deepEqual(Buffer.from(await download.arrayBuffer()), image)
  assert.equal((await imageStore(req('/images'), storage, env, alice, now, fetcher).then(readReply)).jobs.length, 1)
})

test('concurrent same-ID and distinct-ID requests cannot duplicate dispatch or overspend held model points', async () => {
  const storage = memory(), body = input(); let calls = 0, release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const fetcher = (async () => { calls++; await pending; return success() }) as typeof fetch
  const first = imageStore(req('/images', body), storage, env, alice, now, fetcher)
  while (!calls) await new Promise(resolve => setImmediate(resolve))
  const replay = await imageStore(req('/images', body), storage, env, alice, now, fetcher)
  assert.equal((await readReply(replay)).job.state, 'processing')
  assert.equal((await imageStore(req('/images', input()), storage, env, alice, now, fetcher)).status, 409)
  release(); await first; assert.equal(calls, 1)
  await storage.put('customer-reserved-credits:v1', 170)
  assert.equal((await imageStore(req('/images', input()), storage, env, alice, now, fetcher)).status, 402)
  assert.equal(calls, 1)
})

test('known provider refusal releases only the image hold; transient/invalid responses stay held without automatic retry', async () => {
  for (const status of [400, 401, 403, 404, 422, 429]) {
    const storage = memory(); await storage.put('customer-reserved-credits:v1', 50)
    const body = input(); let calls = 0
    const fetcher = (async () => { calls++; return Response.json({ error: { message: 'secret provider details' } }, { status }) }) as typeof fetch
    const result = await imageStore(req('/images', body), storage, env, alice, now, fetcher).then(readReply)
    assert.equal(result.job.state, 'failed'); assert.equal(result.job.settlement, 'released')
    assert.equal(await storage.get('balance'), 199); assert.equal(await storage.get('customer-reserved-credits:v1'), 50)
    assert.ok(!JSON.stringify(result).includes('secret provider details'))
    await imageStore(req('/images', body), storage, env, alice, now, fetcher); assert.equal(calls, 1)
  }
  for (const response of [() => Response.json({}, { status: 502 }), () => Response.json({ data: [{ b64_json: 'aW52YWxpZA==' }] }), () => { throw new Error('timeout') }]) {
    const storage = memory(), body = input(); let calls = 0
    const fetcher = (async () => { calls++; return response() }) as typeof fetch
    const result = await imageStore(req('/images', body), storage, env, alice, now, fetcher).then(readReply)
    assert.equal(result.job.state, 'uncertain'); assert.equal(await storage.get('balance'), 199); assert.equal(await storage.get('customer-reserved-credits:v1'), 25)
    await imageStore(req('/images', body), storage, env, alice, now, fetcher)
    assert.equal((await imageStore(req('/images', input()), storage, env, alice, now, fetcher)).status, 409); assert.equal(calls, 1)
  }
})

test('public API scopes image metadata/downloads to verified account and rejects cross-site/bad input before dispatch', async () => {
  const stores = new Map<string, EntitlementStorage>(), body = input(); let authCalls = 0
  const apiEnv: ImageEnv = { ...env, ACCOUNT_LIMITER: { async limit() { return { success: true } } }, ACCOUNT_ENTITLEMENTS: {
    idFromName: name => name,
    get(id: unknown) { const name = String(id); if (!stores.has(name)) stores.set(name, memory()); return { fetch: (request: Request) => imageStore(request, stores.get(name)!, apiEnv, name, now, (async () => success()) as typeof fetch) } },
  } }
  const auth = (async (_url: unknown, init?: RequestInit) => { authCalls++; const token = new Headers(init?.headers).get('Authorization'); return Response.json({ id: token === 'Bearer bob-token' ? bob : alice, email: 'fixture@example.test' }) }) as typeof fetch
  const request = (path: string, data?: unknown, who = 'alice', extra = {}) => imageApi(new Request('https://worldifact.test/api/images' + path, {
    method: data ? 'POST' : 'GET', headers: { Cookie: `__Host-worldifact-access=${who}-token`, Origin: 'https://worldifact.test', 'Content-Type': 'application/json', ...extra }, body: data ? JSON.stringify(data) : undefined,
  }), apiEnv, auth)
  assert.equal((await request('', body))!.status, 200)
  assert.equal((await request('/' + body.id, undefined, 'bob'))!.status, 404)
  assert.equal((await request('/' + body.id + '/file', undefined, 'bob'))!.status, 404)
  assert.equal((await request('', undefined, 'bob'))!.status, 200)
  assert.equal((await request('', { ...body, owner: alice }))!.status, 400)
  const previousCalls = authCalls
  assert.equal((await request('', body, 'alice', { Origin: 'https://attacker.test' }))!.status, 403)
  assert.equal(authCalls, previousCalls)
  assert.equal((await request('/' + body.id + '?owner=' + alice))!.status, 403)
})

test('Durable Object binding rejects forged verified-account header targeting a different object', async () => {
  const object = new AccountEntitlements({ storage: memory(), id: { toString: () => 'account:v1:' + alice } }, env, now)
  const response = await object.fetch(new Request('https://internal/images', { headers: { 'X-WORLDIFACT-Verified-Account': bob } }))
  assert.equal(response.status, 403)
})
