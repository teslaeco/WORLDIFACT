import test from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { avatarApi, NEPTUNE_QUEEN_JOB_ID, MAX_AVATAR_GLB_BYTES, type AvatarCache } from '../server/avatar.ts'
const env = { ORACLE_ENDPOINT: 'https://queen.trycloudflare.com', ORACLE_API_TOKEN: 'private-fixture-token' }
const url = 'https://worldifact.test/api/avatar/neptune-queen'
function glb(length = 4096) {
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, length, true)
  return bytes
}
function memoryCache() {
  const data = new Map<string, { bytes: ArrayBuffer; headers: Headers }>()
  const keys: Request[] = []
  const storage: AvatarCache = {
    async match(key) { keys.push(key); const hit = data.get(key.url); return hit ? new Response(hit.bytes, { headers: hit.headers }) : undefined },
    async put(key, response) { data.set(key.url, { bytes: await response.arrayBuffer(), headers: new Headers(response.headers) }) },
  }
  return { storage, data, keys }
}
function source(bytes = glb()) { return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }) }

test('lossless gzip retains every original byte and warmed edge cache avoids Oracle', async () => {
  const { storage, keys } = memoryCache(); let calls = 0
  const fetcher = (async (input, init) => {
    calls++; assert.equal(String(input), `${env.ORACLE_ENDPOINT}/v1/jobs/${NEPTUNE_QUEEN_JOB_ID}/model`)
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'manual')
    return source()
  }) as typeof fetch
  const request = () => new Request(url + '?ignored=visitor-data', { headers: { 'Accept-Encoding': 'br, gzip', Cookie: 'private-user-session' } })
  for (const state of ['MISS', 'HIT']) {
    const response = (await avatarApi(request(), env, fetcher, storage))!
    assert.equal(response.status, 200); assert.equal(response.headers.get('X-WORLDIFACT-Avatar-Cache'), state)
    assert.equal(response.headers.get('Content-Encoding'), 'gzip'); assert.equal(response.headers.get('Vary'), 'Accept-Encoding')
    assert.equal(response.headers.get('X-WORLDIFACT-GLB-Length'), '4096')
    assert.equal(response.headers.get('X-WORLDIFACT-Source-Job'), NEPTUNE_QUEEN_JOB_ID)
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400')
    const wire = new Uint8Array(await response.arrayBuffer())
    assert.ok(wire.length < glb().length); assert.deepEqual(new Uint8Array(gunzipSync(wire)), glb())
    assert.equal(Number(response.headers.get('Content-Length')), wire.length)
  }
  assert.equal(calls, 1)
  for (const key of keys) { assert.equal(key.method, 'GET'); assert.equal([...key.headers].length, 0); assert.ok(!key.url.includes('visitor-data')) }
})
test('identity and gzip never mix, gzip q=0 is respected and cached HEAD has no body', async () => {
  const { storage } = memoryCache(); let calls = 0
  const fetcher = (async () => { calls++; return source() }) as typeof fetch
  const gzip = new Request(url, { headers: { 'Accept-Encoding': 'gzip' } })
  await (await avatarApi(gzip, env, fetcher, storage))!.arrayBuffer()
  const raw = (await avatarApi(new Request(url, { headers: { 'Accept-Encoding': 'gzip; q=0, identity' } }), env, fetcher, storage))!
  assert.equal(raw.headers.get('Content-Encoding'), null); assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), glb())
  const head = (await avatarApi(new Request(url, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } }), env, fetcher, storage))!
  assert.equal(head.body, null); assert.equal(head.headers.get('X-WORLDIFACT-Avatar-Cache'), 'HIT'); assert.equal(calls, 2)
})
test('cache cannot bypass disabled configuration or method restrictions', async () => {
  const { storage } = memoryCache(); let calls = 0
  const fetcher = (async () => { calls++; return source() }) as typeof fetch
  await avatarApi(new Request(url), env, fetcher, storage)
  assert.equal((await avatarApi(new Request(url), {}, fetcher, storage))!.status, 503)
  assert.equal((await avatarApi(new Request(url, { method: 'POST' }), env, fetcher, storage))!.status, 405)
  assert.equal(calls, 1)
})
test('invalid, oversized, redirect and partial upstream responses never poison cache', async () => {
  const { storage, data } = memoryCache()
  const bad = [
    new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response(null, { status: 302, headers: { Location: 'https://other.example/model' } }),
    new Response(glb(), { status: 206, headers: { 'Content-Type': 'model/gltf-binary' } }),
    new Response(glb(), { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(MAX_AVATAR_GLB_BYTES + 1) } }),
    new Response(glb().subarray(0, 25), { headers: { 'Content-Type': 'model/gltf-binary' } }),
    new Response(glb(), { status: 503 }),
  ]
  for (const response of bad) {
    const actual = (await avatarApi(new Request(url), env, (async () => response) as typeof fetch, storage))!
    assert.equal(actual.status, 502); assert.equal(actual.headers.get('Cache-Control'), 'no-store'); assert.equal(data.size, 0)
  }
  assert.equal((await avatarApi(new Request(url), env, (async () => source()) as typeof fetch, storage))!.status, 200)
  assert.equal(data.size, 1)
})
test('cache failures are optional and cache writes can run off the response path', async () => {
  const storage: AvatarCache = { async match() { throw new Error('cache down') }, async put() { throw new Error('quota') } }
  const response = (await avatarApi(new Request(url), env, (async () => source()) as typeof fetch, storage))!
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), glb())
  let finish!: () => void; const background: Promise<unknown>[] = []
  const pending: AvatarCache = { async match() { return undefined }, put() { return new Promise<void>(resolve => { finish = resolve }) } }
  const immediate = (await avatarApi(new Request(url), env, (async () => source()) as typeof fetch, pending, { waitUntil(task) { background.push(task) } }))!
  assert.equal(immediate.status, 200); assert.equal(background.length, 1); finish(); await Promise.all(background)
})
