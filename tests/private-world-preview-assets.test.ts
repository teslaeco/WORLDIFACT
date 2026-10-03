import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateWorldPreviewAssets } from '../src/lib/privateWorldPreviewAssets.ts'

const blob = (bytes = 8) => new Blob([new Uint8Array(bytes)])
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const tick = () => new Promise<void>(done => setImmediate(done))

test('a missing device model can recover explicitly without a retry loop on world edits', async () => {
  let available = false, reads = 0, loads = 0
  const errors: string[] = []
  const previews = createPrivateWorldPreviewAssets({
    read: async () => { reads++; if (!available) throw new Error('Missing local file'); return blob() },
    decode: async bytes => ({ size: bytes.byteLength }), release: () => {},
    onLoaded: () => { loads++ }, onError: (_id, error) => { errors.push(error.message) },
  })
  assert.equal(await previews.request('model'), null)
  assert.equal(previews.failedCount(), 1)
  available = true
  for (let i = 0; i < 4; i++) assert.equal(await previews.request('model'), null)
  assert.equal(reads, 1, 'ordinary rebuilds do not retry known failures')
  assert.deepEqual(await previews.retryFailed(), [{ size: 8 }])
  assert.equal(previews.failedCount(), 0)
  assert.equal(reads, 2)
  assert.equal(loads, 1)
  assert.deepEqual(errors, ['Missing local file'])
  assert.equal(await previews.request('model'), previews.get('model'))
  assert.equal(reads, 2, 'successful entries remain deduplicated')
  previews.dispose()
})

test('asset queue deduplicates repeated placements and limits concurrent reads to two', async () => {
  const reads: string[] = [], gates = new Map<string, ReturnType<typeof deferred<Blob>>>()
  const previews = createPrivateWorldPreviewAssets({
    read: id => { reads.push(id); const gate = deferred<Blob>(); gates.set(id, gate); return gate.promise },
    decode: async bytes => bytes.byteLength, release: () => {}, onLoaded: () => {}, onError: () => {},
  })
  const requests = ['a', 'b', 'c', 'd', 'e'].map(id => previews.request(id))
  assert.equal(previews.request('a'), requests[0])
  assert.deepEqual(reads, ['a', 'b'])
  gates.get('a')!.resolve(blob()); gates.get('b')!.resolve(blob())
  await Promise.all(requests.slice(0, 2))
  assert.deepEqual(reads, ['a', 'b', 'c', 'd'])
  gates.get('c')!.resolve(blob()); gates.get('d')!.resolve(blob())
  await Promise.all(requests.slice(2, 4))
  assert.deepEqual(reads, ['a', 'b', 'c', 'd', 'e'])
  gates.get('e')!.resolve(blob())
  assert.deepEqual(await Promise.all(requests), [8, 8, 8, 8, 8])
  previews.dispose()
})

test('in-flight memory counts toward the budget and a failed decode releases its reservation', async () => {
  const decode = deferred<number>(), errors: string[] = []
  let decoding = 0
  const previews = createPrivateWorldPreviewAssets({
    byteLimit: 10, read: async () => blob(8),
    decode: async () => { decoding++; return decode.promise }, release: () => {},
    onLoaded: () => {}, onError: (_id, error) => { errors.push(error.message) },
  })
  const a = previews.request('a'), b = previews.request('b')
  assert.equal(await b, null)
  assert.match(errors[0], /interactive budget/)
  await tick()
  assert.equal(decoding, 1, 'the second allocation was rejected before decoding')
  decode.resolve(8)
  assert.equal(await a, 8)
  previews.dispose()

  let invalid = true
  const recovering = createPrivateWorldPreviewAssets({
    byteLimit: 10, read: async () => blob(8),
    decode: async () => { if (invalid) throw new Error('Invalid GLB'); return 8 },
    release: () => {}, onLoaded: () => {}, onError: () => {},
  })
  assert.equal(await recovering.request('invalid'), null)
  invalid = false
  assert.equal(await recovering.request('valid'), 8, 'failed bytes are no longer reserved')
  recovering.dispose()
})

test('removing unused previews releases memory so a budget-blocked placement can load', async () => {
  const released: number[] = []
  let decoded = 0
  const previews = createPrivateWorldPreviewAssets({
    byteLimit: 10, read: async () => blob(8), decode: async () => ++decoded,
    release: value => { released.push(value) }, onLoaded: () => {}, onError: () => {},
  })
  previews.retain(['old', 'new'])
  assert.equal(await previews.request('old'), 1)
  assert.equal(await previews.request('new'), null)
  previews.retain(['new'])
  assert.equal(previews.get('old'), undefined)
  assert.deepEqual(released, [1])
  assert.deepEqual(await previews.retryFailed(), [2])
  assert.equal(previews.get('new'), 2)
  previews.dispose(); previews.dispose()
  assert.deepEqual(released, [1, 2], 'every decoded source is released exactly once')
})

test('world teardown discards queued reads and releases late decoded sources without stale callbacks', async () => {
  const decoded = deferred<{ id: string }>(), released: string[] = [], reads: string[] = []
  let notifications = 0, source = 0
  const previews = createPrivateWorldPreviewAssets({
    read: async id => { reads.push(id); return blob() },
    decode: async () => { const id = `late-source-${++source}`; await decoded.promise; return { id } },
    release: value => { released.push(value.id) }, onLoaded: () => { notifications++ }, onError: () => { notifications++ },
  })
  const a = previews.request('a'), b = previews.request('b'), c = previews.request('c')
  await tick()
  previews.dispose()
  assert.equal(await c, null)
  decoded.resolve({ id: 'late-source' })
  assert.deepEqual(await Promise.all([a, b]), [null, null])
  assert.deepEqual(reads, ['a', 'b'], 'queued work was never read')
  assert.deepEqual(released, ['late-source-1', 'late-source-2'], 'both independently decoded sources were released')
  assert.equal(notifications, 0)
  assert.equal(await previews.request('d'), null)
  previews.dispose()
  assert.equal(released.length, 2)
})

test('removing an in-flight placement discards its late result and clears an unused failure', async () => {
  const decoded = deferred<number>(), released: number[] = []
  let notifications = 0
  const previews = createPrivateWorldPreviewAssets({
    read: async id => { if (id === 'missing') throw new Error('Missing file'); return blob() },
    decode: async () => decoded.promise, release: value => { released.push(value) },
    onLoaded: () => { notifications++ }, onError: () => {},
  })
  previews.retain(['pending', 'missing'])
  const pending = previews.request('pending')
  assert.equal(await previews.request('missing'), null)
  await tick()
  previews.retain([])
  assert.equal(previews.failedCount(), 0)
  decoded.resolve(1)
  assert.equal(await pending, null)
  assert.deepEqual(released, [1])
  assert.equal(notifications, 0)
  assert.deepEqual(await previews.retryFailed(), [])
  previews.dispose()
})

test('an account or world change suppresses results even before effect teardown runs', async () => {
  const decoded = deferred<number>(), released: number[] = []
  let current = true, notifications = 0
  const previews = createPrivateWorldPreviewAssets({
    isCurrent: () => current,
    read: async () => blob(), decode: async () => decoded.promise,
    release: value => { released.push(value) },
    onLoaded: () => { notifications++ }, onError: () => { notifications++ },
  })
  const request = previews.request('old-account-model')
  await tick()
  current = false
  decoded.resolve(1)
  assert.equal(await request, null)
  assert.deepEqual(released, [1])
  assert.equal(notifications, 0)
  assert.equal(previews.get('old-account-model'), undefined)
  previews.dispose()
})

test('scene update exceptions do not turn a successfully cached model into a failed file', async () => {
  const errors: string[] = []
  let reads = 0
  const previews = createPrivateWorldPreviewAssets({
    read: async () => { reads++; return blob() }, decode: async () => 1, release: () => {},
    onLoaded: () => { throw new Error('Scene update failed') }, onError: (_id, error) => { errors.push(error.message) },
  })
  assert.equal(await previews.request('model'), 1)
  assert.deepEqual(errors, ['Scene update failed'])
  assert.equal(previews.failedCount(), 0)
  assert.equal(previews.get('model'), 1)
  assert.deepEqual(await previews.retryFailed(), [])
  assert.equal(reads, 1)
  previews.dispose()
})
