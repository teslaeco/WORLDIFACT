import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchExistingShopArtifacts, shopArtifactSummary } from '../src/lib/shopWorldArtifacts.ts'

const id = '12345678-1234-4234-8234-123456789abc'
const ticket = `${id}.1780000000000.${'a'.repeat(64)}.${'b'.repeat(64)}`
const saved = { receipt: { id, ticket, createdAt: '2026-05-27T00:00:00.000Z' }, prompt: 'building', startedAt: '2026-05-27T00:00:00.000Z' }

function store() {
  const values = new Map<string,string>([['worldifact-studio-current-v1', JSON.stringify(saved)]])
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key,value) }, removeItem: (key: string) => { values.delete(key) } }
}

test('portal-world artifact audit restores one existing receipt, never generates, and continues after a missing export', async () => {
  const calls: { path: string; method: string }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url), 'https://worldifact.test').pathname
    const method = init?.method ?? 'GET'; calls.push({ path, method })
    if (path === `/api/studio/jobs/${id}`) return Response.json({ job: { id, state: 'succeeded', downloadAllowed: true } })
    if (path.endsWith('/model')) return new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '3' } })
    if (path.endsWith('/exports/pbr')) return new Response(new Uint8Array([4,5]), { headers: { 'Content-Type': 'application/zip', 'Content-Length': '2' } })
    if (path.endsWith('/exports/fbx')) return Response.json({ error: 'FBX export unavailable on worker.' }, { status: 404 })
    if (path.endsWith('/exports/blend')) return new Response(new Uint8Array([6,7,8,9]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' } })
    throw new Error('unexpected request ' + path)
  }) as typeof fetch
  const audit = await fetchExistingShopArtifacts(store(), fetcher)
  assert.equal(audit.job.state, 'succeeded')
  assert.deepEqual(audit.results.map(result => [result.format, result.ok, result.bytes]), [
    ['model', true, 3], ['pbr', true, 2], ['fbx', false, 0], ['blend', true, 4],
  ])
  assert.match(shopArtifactSummary(audit.results), /GLB|MODEL ✓/)
  assert.ok(calls.every(call => call.method === 'GET'))
  assert.equal(calls.filter(call => call.path === '/api/studio/jobs').length, 0)
})

test('portal-world audit refuses to invent artifacts when no saved signed job exists', async () => {
  const empty = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  await assert.rejects(fetchExistingShopArtifacts(empty), /No saved AI Shop model receipt/)
})
