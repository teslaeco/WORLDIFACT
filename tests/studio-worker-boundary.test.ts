import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { validateStudioInput } from '../src/lib/studioProtocol.ts'

const id = '12345678-1234-4234-8234-123456789abc'
const env: Env = { OWNER_ACCESS_TOKEN: 'fixture-owner-secret-not-production-12345', ORACLE_API_TOKEN: 'private-fixture-token', ORACLE_ENDPOINT: 'https://review-worker.trycloudflare.com', GENERATION_LIMITER: { async limit() { return { success: true } } } }
async function request() {
  const payload = `${id}.${Date.now()}.${'a'.repeat(64)}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`WORLDIFACT-STUDIO-RECEIPT-v1:${payload}`))
  const ticket = payload + '.' + Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('')
  return new Request(`https://worldifact.test/api/studio/jobs/${id}/model`, { headers: { 'X-WORLDIFACT-Job': ticket } })
}
function triangleFixture() {
  const document = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.8, 1] } }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] }
  const json = new TextEncoder().encode(JSON.stringify(document)), padded = Math.ceil(json.length / 4) * 4
  const bytes = new Uint8Array(20 + padded + 8 + 36), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20)
  view.setUint32(20 + padded, 36, true); view.setUint32(24 + padded, 0x004e4942, true)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(28 + padded + index * 4, value, true))
  return bytes
}

test('actual Worker converts invalid artifact rejection into bounded JSON instead of an unhandled error', async () => {
  const response = await handle(await request(), env, (async () => new Response(new Uint8Array(24), { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '24' } })) as typeof fetch)
  assert.equal(response.status, 502)
  assert.match(response.headers.get('content-type')!, /application\/json/)
  const text = await response.text()
  assert.match(text, /invalid GLB container/)
  assert.doesNotMatch(text, /fixture-owner|private-fixture|review-worker|at modelOrExport/)
})

test('actual Worker hides upstream exceptions and never retries artifact reads as generation', async () => {
  let calls = 0
  const response = await handle(await request(), env, (async (_url, init) => {
    calls++; assert.notEqual(init?.method, 'POST')
    throw new Error('private-fixture-token provider stack trace')
  }) as typeof fetch)
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /private-fixture-token|stack trace/)
  assert.equal(calls, 1)
})

test('actual Worker returns the same complete material-bearing triangle GLB, without paid requests', async () => {
  const fixture = triangleFixture(); let calls = 0
  const response = await handle(await request(), env, (async (_url, init) => {
    calls++; assert.notEqual(init?.method, 'POST')
    return new Response(fixture, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(fixture.length) } })
  }) as typeof fetch)
  assert.equal(response.status, 200)
  const bytes = await response.arrayBuffer()
  assert.deepEqual(new Uint8Array(bytes), fixture)
  const inspected = inspectGLB(bytes)
  assert.equal(inspected.triangles, 1); assert.equal(inspected.materialCount, 1)
  assert.equal(calls, 1)
  // This is a deterministic test asset, NOT a new AI result or WebGL render.
})

test('Studio enum fields reject coerced arrays/objects and null image collections', () => {
  const input = { worldId: 'enchanted-ai-shop', purpose: 'figurine', prompt: 'Create a skull study', textureMaxSize: 4096, photos: [] }
  assert.doesNotThrow(() => validateStudioInput(input))
  for (const invalid of [{ ...input, worldId: ['enchanted-ai-shop'] }, { ...input, purpose: ['figurine'] }, { ...input, purpose: { toString: () => 'figurine' } }, { ...input, photos: null }]) assert.throws(() => validateStudioInput(invalid))
})
