import test from 'node:test'
import assert from 'node:assert/strict'
import { readArchive, saveArchive } from '../src/lib/archive.ts'
import { assetSpecForBlueprint, localSceneResult, meadowBlueprint, validateGenerationResult } from '../src/lib/blueprint.ts'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX } from '../src/lib/studioClient.ts'
import { listStudioModels, readStudioModel, saveStudioModel } from '../src/lib/studioArchive.ts'

const scope = 'worldifact-mcc-58e04843-20261006:'
const oldCurrent = 'worldifact-studio-current-v1'
const oldHistory = 'worldifact-studio-receipt-v1:'
const oldWorlds = 'worldifact.worlds.v1'
const oldDatabase = 'worldifact-studio-models'
const id = '12345678-1234-4234-8234-123456789abc'
const createdAt = '2026-10-06T12:00:00.000Z'
const receipt = { id, createdAt, ticket: `${id}.${Date.parse(createdAt)}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const saved = { receipt, prompt: 'Offline historical fixture', startedAt: createdAt }
const pricing = { revision: 'studio-pricing-v1', tier: 'extended', points: 500, maxProviderCents: 400 }
const modernSaved = { ...saved, receipt: { ...receipt, pricing }, pricing, rejectionCode: 'provider_unavailable' }
const input = { worldId: 'enchanted-ai-shop', prompt: saved.prompt, purpose: 'figurine', textureMaxSize: 4096, photos: [] }

function storage(entries) {
  const data = new Map(entries), calls = []
  return { data, calls,
    getItem(key) { calls.push(['get', key]); return data.get(key) ?? null },
    setItem(key, value) { calls.push(['set', key]); data.set(key, value) },
    removeItem(key) { calls.push(['remove', key]); data.delete(key) },
  }
}
function modernGeneration(model = 'gpt-6.1-sol') {
  const blueprint = meadowBlueprint()
  return { mode: 'LIVE', provenance: 'GENERATED', model, requestId: 'original-modern-request', blueprint,
    assetSpec: assetSpecForBlueprint(blueprint), limitation: 'Inert storage fixture; no provider call.',
    evidence: { providerResponseId: 'resp_original', receivedAt: createdAt, blueprintSha256: 'a'.repeat(64), inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    delivery: { kind: 'procedural-blueprint', referenceCount: 4, fallbackUsed: false },
  }
}

test('historical job save, reload, invalid-receipt recovery and clear never read or modify modern pricing receipts', async () => {
  const retained = new Map([
    [oldCurrent, JSON.stringify(modernSaved, null, 2)],
    [oldHistory + id, JSON.stringify({ ...modernSaved, prompt: 'Original retained history' }, null, 2)],
    ['unrelated-auth-session', 'original-account-session'],
    ['unrelated-financial-grant', 'original-grant-evidence'],
    ['unrelated-test-state', 'original-consumed-claim'],
  ])
  const store = storage(retained), calls = []
  assert.equal(STUDIO_RECEIPT_KEY, scope + 'studio-current-v1')
  assert.equal(STUDIO_RECEIPT_HISTORY_PREFIX, scope + 'studio-receipt-v1:')
  const client = new StudioCoordinator(store, async (url, init) => {
    calls.push([String(url), init?.method ?? 'GET'])
    return String(url).endsWith('/prepare') ? Response.json(receipt) : Response.json({ job: { id, state: 'building' } })
  })
  assert.equal(client.restore(), null, 'A modern selected job must not be normalized by the old parser')
  client.clearSelection()
  await client.start(input, () => {})
  const restored = new StudioCoordinator(store, async (url, init) => {
    calls.push([String(url), init?.method ?? 'GET'])
    return Response.json({ error: 'This job receipt expired. Keep your saved model.' }, { status: 401 })
  })
  assert.equal(restored.restore().receipt.id, id)
  assert.equal((await restored.poll()).state, 'failed')
  restored.clearSelection()
  assert.equal(new StudioCoordinator(store).restore(), null)
  assert.equal(JSON.parse(store.data.get(STUDIO_RECEIPT_HISTORY_PREFIX + id)).receipt.ticket, receipt.ticket)
  assert.deepEqual(calls.map(([, method]) => method), ['POST', 'POST', 'GET'], 'All requests are injected offline fixtures; recovery only polls')
  for (const [key, original] of retained) assert.equal(store.data.get(key), original, key)
  assert.ok(store.calls.every(([, key]) => key.startsWith(scope)), 'No access, parsing, overwrite or removal of retained keys')
})

test('even corrupt or future-format shared receipts stay opaque and untouched in the historical workspace', () => {
  for (const raw of ['{not-json', JSON.stringify({ futureVersion: 9, pricing, receipt: { opaque: true } })]) {
    const store = storage([[oldCurrent, raw]])
    const client = new StudioCoordinator(store)
    assert.equal(client.restore(), null)
    client.clearSelection()
    assert.equal(store.data.get(oldCurrent), raw)
    assert.ok(store.calls.every(([, key]) => key.startsWith(scope)))
  }
})

test('historical archive save and 30-world cap cannot filter-delete modern delivery, Sol 6.1 or compatible older originals', () => {
  const oldResult = localSceneResult(meadowBlueprint())
  const retained = JSON.stringify([
    { id, createdAt, result: modernGeneration() },
    { id: '22345678-1234-4234-8234-123456789abc', createdAt, result: modernGeneration('gpt-6-sol') },
    { id: '32345678-1234-4234-8234-123456789abc', createdAt: '2026-09-28T12:00:00.000Z', result: oldResult },
  ], null, 2)
  const store = storage([[oldWorlds, retained]])
  assert.throws(() => validateGenerationResult(modernGeneration()), /Invalid generation/)
  assert.deepEqual(readArchive(store), [], 'Do not infer a historical data snapshot from compatible entries')
  for (let index = 0; index < 35; index++) saveArchive(oldResult, store)
  assert.equal(readArchive(store).length, 30)
  const activeBefore = store.data.get(scope + 'worlds-v1')
  assert.throws(() => saveArchive(modernGeneration(), store), /Invalid generation/)
  assert.equal(store.data.get(scope + 'worlds-v1'), activeBefore)
  assert.equal(store.data.get(oldWorlds), retained, 'Retain the exact original string, including new fields and whitespace')
  assert.ok(store.calls.every(([, key]) => key === scope + 'worlds-v1'))
})

// In-memory transactional IndexedDB fixture, keyed by the actual database name.
// Exercises real archive functions offline; not a browser/quota durability claim.
function indexedDbFixture() {
  const databases = new Map(), opened = [], transactions = []
  let rejectWrites = false
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  function connection(name, stores) {
    return {
      close() {},
      createObjectStore(storeName) { stores.set(storeName, new Map()) },
      transaction(_names, mode = 'readonly') {
        transactions.push([name, mode])
        const working = new Map([...stores].map(([key, value]) => [key, new Map(value)]))
        const requests = []
        let complete = false, pumping = false
        const tx = {
          oncomplete: null, onabort: null, onerror: null,
          abort() { if (!complete) { complete = true; queueMicrotask(() => tx.onabort?.()) } },
          objectStore(storeName) {
            const request = action => {
              const r = { result: undefined, onsuccess: null, onerror: null }
              requests.push({ action, r }); pump(); return r
            }
            return {
              get: key => request(() => structuredClone(working.get(storeName).get(key))),
              getAll: () => request(() => structuredClone([...working.get(storeName).values()])),
              add: (value, key) => request(() => {
                if (mode !== 'readwrite' || rejectWrites) throw new Error('Fixture write refused')
                const data = working.get(storeName), recordId = key ?? value.id
                if (data.has(recordId)) throw new Error('Duplicate original')
                data.set(recordId, structuredClone(value))
                return recordId
              }),
            }
          },
        }
        function pump() {
          if (pumping || complete) return
          pumping = true
          queueMicrotask(() => {
            pumping = false
            if (complete) return
            const next = requests.shift()
            if (next) {
              try { next.r.result = next.action(); next.r.onsuccess?.() }
              catch { next.r.onerror?.(); tx.abort(); return }
              pump()
            } else {
              complete = true
              if (mode === 'readwrite') for (const [key, value] of working) stores.set(key, value)
              tx.oncomplete?.()
            }
          })
        }
        return tx
      },
    }
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open(name, version) {
      assert.equal(version, 1)
      opened.push(name)
      const fresh = !databases.has(name)
      if (fresh) databases.set(name, new Map())
      const r = { result: connection(name, databases.get(name)), onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => { if (fresh) r.onupgradeneeded?.(); r.onsuccess?.() })
      return r
    },
    deleteDatabase() { assert.fail('An existing browser database must not be deleted') },
  } })
  return { databases, opened, transactions,
    failWrites() { rejectWrites = true },
    close() { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else Reflect.deleteProperty(globalThis, 'indexedDB') },
  }
}

test('fresh historical IndexedDB save, reload and conflicting writes preserve all modern metadata and original blobs', async () => {
  const fixture = indexedDbFixture()
  try {
    const metadata = [
      { id, prompt: 'Modern priced studio original', pricing, savedAt: createdAt, sha256: 'b'.repeat(64), byteLength: 8, review: 'UNREVIEWED', source: 'studio' },
      { id: 'blueprint:original', prompt: 'Modern Sol original', savedAt: createdAt, source: 'blueprint', generation: modernGeneration() },
    ]
    const oldBlobs = new Map([[id, new Blob(['modern studio original'])], ['blueprint:original', new Blob(['modern Sol original'])]])
    const oldStores = new Map([['metadata', new Map(metadata.map(entry => [entry.id, structuredClone(entry)]))], ['models', oldBlobs]])
    fixture.databases.set(oldDatabase, oldStores)
    const beforeMetadata = structuredClone([...oldStores.get('metadata')])
    const beforeBytes = await Promise.all([...oldBlobs].map(async ([key, blob]) => [key, await blob.text()]))
    assert.deepEqual(await listStudioModels(), [])
    await assert.rejects(readStudioModel(id), /not stored/)
    const blob = new Blob(['new isolated historical model'])
    const archived = await saveStudioModel(saved, blob)
    assert.equal((await readStudioModel(id)).size, blob.size)
    assert.equal(await (await readStudioModel(id)).text(), 'new isolated historical model')
    assert.deepEqual(await listStudioModels(), [archived])
    assert.deepEqual(await saveStudioModel({ ...saved, prompt: 'Retry must retain first metadata' }, blob), archived)
    await assert.rejects(saveStudioModel(saved, new Blob(['conflicting isolated bytes'])), /not overwritten/)
    fixture.failWrites()
    await assert.rejects(saveStudioModel({ ...saved, receipt: { ...receipt, id: '22345678-1234-4234-8234-123456789abc' } }, blob), /could not be saved/)
    assert.deepEqual(await listStudioModels(), [archived], 'Failed writes cannot damage the isolated original either')
    assert.deepEqual([...oldStores.get('metadata')], beforeMetadata)
    assert.deepEqual(await Promise.all([...oldBlobs].map(async ([key, original]) => [key, await original.text()])), beforeBytes)
    assert.ok(fixture.opened.every(name => name === scope + 'studio-models-v1'))
    assert.ok(fixture.transactions.every(([name]) => name === scope + 'studio-models-v1'), 'No transaction may inspect or modify the preserved database')
    assert.equal(fixture.databases.size, 2)
  } finally { fixture.close() }
})
