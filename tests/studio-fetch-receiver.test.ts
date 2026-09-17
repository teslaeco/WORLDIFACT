import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, type ReceiptStore } from '../src/lib/studioClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'

const id = '12345678-1234-4234-8234-123456789abc'
const receipt = { id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a princess figurine', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function storage(): ReceiptStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function browserReceiverFixture(store: ReceiptStore) {
  const calls: { path: string; method: string }[] = []
  // An ordinary function is essential: arrow stubs hide the receiver defect.
  const fetcher = function (this: unknown, resource: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
    const path = String(resource), method = init?.method || 'GET'
    calls.push({ path, method })
    if (path === '/api/studio/prepare') return Promise.resolve(Response.json(receipt))
    if (path === '/api/studio/jobs') {
      assert.ok(store.getItem('worldifact-studio-current-v1'), 'receipt must precede the only submission')
      return Promise.resolve(Response.json({ job: { id, state: 'building' } }))
    }
    if (path === `/api/studio/jobs/${id}`) return Promise.resolve(Response.json({ job: { id, state: 'succeeded' } }))
    assert.match(path, new RegExp(`^/api/studio/jobs/${id}/(?:model|exports/(?:pbr|fbx|blend))$`))
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3' } }))
  } as typeof fetch
  return { fetcher, calls }
}

test('receiver-sensitive fetch reproduces the old defect before any request is recorded', () => {
  const { fetcher, calls } = browserReceiverFixture(storage())
  assert.throws(() => ({ fetcher }).fetcher('/api/studio/prepare'), /Illegal invocation/)
  assert.equal(calls.length, 0)
})

test('injected browser fetch is bound for preparation, one submission, restored polling and every export', async () => {
  const store = storage(), fixture = browserReceiverFixture(store)
  const client = new StudioCoordinator(store, fixture.fetcher)
  assert.equal((await client.start(input, () => {})).state, 'building')
  await assert.rejects(client.start(input, () => {}), /already selected/)
  const restored = new StudioCoordinator(store, fixture.fetcher)
  assert.equal(restored.restore()?.receipt.id, id)
  assert.equal((await restored.poll()).state, 'succeeded')
  for (const format of ['model', 'pbr', 'fbx', 'blend'] as const) assert.equal((await restored.artifact(format)).size, 3)
  assert.equal(fixture.calls.length, 7)
  assert.equal(fixture.calls.filter(call => call.path === '/api/studio/jobs' && call.method === 'POST').length, 1)
})

test('the default global fetch path also receives globalThis instead of the coordinator', async () => {
  const original = globalThis.fetch, store = storage(), fixture = browserReceiverFixture(store)
  try {
    globalThis.fetch = fixture.fetcher
    const client = new StudioCoordinator(store)
    assert.equal((await client.start(input, () => {})).state, 'building')
    assert.equal((await client.poll()).state, 'succeeded')
    assert.equal((await client.artifact('model')).size, 3)
  } finally { globalThis.fetch = original }
  assert.equal(fixture.calls.filter(call => call.path === '/api/studio/jobs').length, 1)
})
