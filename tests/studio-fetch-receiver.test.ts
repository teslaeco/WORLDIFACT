import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, readSavedStudioJob, type ReceiptStore } from '../src/lib/studioClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'

const id = '12345678-1234-4234-8234-123456789abc'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a princess figurine', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function memoryStore(): ReceiptStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function transport(store: ReceiptStore, loseSubmitResponse = false) {
  const calls: { path: string; method: string }[] = []
  const now = Date.now()
  const receipt = { id, createdAt: new Date(now).toISOString(), ticket: `${id}.${now}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
  // Browser Web APIs reject the coordinator as their receiver. Node fetch and
  // arrow-function stubs do not expose that regression. This explicit brand
  // check models it without browser access or real network/provider requests.
  const fetcher: typeof fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
    const [url, init] = args
    const path = String(url), method = init?.method ?? 'GET'
    calls.push({ path, method })
    if (path === '/api/studio/prepare') return Promise.resolve(Response.json(receipt))
    assert.equal(readSavedStudioJob(store)?.receipt.ticket, receipt.ticket, 'Receipt must be saved before submit or recovery')
    assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Job'), receipt.ticket)
    if (path === '/api/studio/jobs') {
      if (loseSubmitResponse) return Promise.reject(new TypeError('Simulated response lost after acceptance'))
      return Promise.resolve(Response.json({ job: { id, state: 'building' } }))
    }
    if (path === `/api/studio/jobs/${id}`) return Promise.resolve(Response.json({ job: { id, state: 'succeeded' } }))
    if (path === `/api/studio/jobs/${id}/model` || path === `/api/studio/jobs/${id}/exports/pbr`) {
      // Transport bytes only; the existing real-GLB tests cover model parsing.
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3' } }))
    }
    return Promise.reject(new Error('Unexpected request in binding regression'))
  }
  return { calls, fetcher }
}

test('old raw-fetch property invocation reproduces Illegal invocation before any transport activity', () => {
  const { calls, fetcher } = transport(memoryStore())
  const broken = { fetcher }
  assert.throws(() => broken.fetcher('/api/studio/prepare'), /Illegal invocation/)
  assert.equal(calls.length, 0)
})

test('default browser fetch has the global receiver for prepare, one submit, polling and explicit exports', async t => {
  const store = memoryStore(), { calls, fetcher } = transport(store)
  t.mock.method(globalThis, 'fetch', fetcher)
  const client = new StudioCoordinator(store)
  assert.equal((await client.start(input, () => {})).state, 'building')
  assert.equal((await client.poll()).state, 'succeeded')
  assert.equal((await client.artifact('model')).size, 3)
  assert.equal((await client.artifact('pbr')).size, 3)
  assert.deepEqual(calls, [
    { path: '/api/studio/prepare', method: 'POST' },
    { path: '/api/studio/jobs', method: 'POST' },
    { path: `/api/studio/jobs/${id}`, method: 'GET' },
    { path: `/api/studio/jobs/${id}/model`, method: 'GET' },
    { path: `/api/studio/jobs/${id}/exports/pbr`, method: 'GET' },
  ])
})

test('explicitly injected fetch is receiver-safe and a lost response plus reload still uses one paid submission', async () => {
  const store = memoryStore(), { calls, fetcher } = transport(store, true)
  const client = new StudioCoordinator(store, fetcher)
  assert.equal((await client.start(input, () => {})).state, 'pending')
  const restored = new StudioCoordinator(store, fetcher)
  assert.equal(restored.restore()?.receipt.id, id)
  assert.equal((await restored.poll()).state, 'succeeded')
  assert.equal((await restored.artifact('model')).size, 3)
  await assert.rejects(restored.start(input, () => {}), /already selected/)
  assert.equal(calls.filter(call => call.path === '/api/studio/jobs').length, 1)
  assert.equal(calls.filter(call => call.path === '/api/studio/prepare').length, 1)
})


test('missing export is prepared once from the saved job and retried without a generation POST', async () => {
  const store = memoryStore(), now = Date.now()
  const receipt = { id, createdAt: new Date(now).toISOString(), ticket: `${id}.${now}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
  store.setItem('worldifact-studio-current-v1', JSON.stringify({ receipt, prompt: input.prompt, startedAt: receipt.createdAt }))
  const calls: { path: string; method: string }[] = []
  let pbrReads = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url), method = init?.method ?? 'GET'; calls.push({ path, method })
    assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Job'), receipt.ticket)
    if (path.endsWith('/exports/pbr')) {
      pbrReads++
      return pbrReads === 1 ? Response.json({ error: 'missing export' }, { status: 409 }) :
        new Response(new Uint8Array([7,8,9]), { headers: { 'Content-Length': '3', 'Content-Type': 'application/zip' } })
    }
    if (path.endsWith('/exports/prepare') && method === 'POST')
      return Response.json({ prepared: true, alreadyReady: false, formats: ['pbr'], paidGenerationRequested: false, generationRequested: false })
    throw new Error('Unexpected request: '+path)
  }) as typeof fetch
  const client = new StudioCoordinator(store, fetcher); client.restore()
  assert.equal((await client.artifact('pbr')).size, 3)
  assert.deepEqual(calls, [
    { path: `/api/studio/jobs/${id}/exports/pbr`, method: 'GET' },
    { path: `/api/studio/jobs/${id}/exports/prepare`, method: 'POST' },
    { path: `/api/studio/jobs/${id}/exports/pbr`, method: 'GET' },
  ])
  assert.equal(calls.some(call => call.path === '/api/studio/jobs'), false)
})
