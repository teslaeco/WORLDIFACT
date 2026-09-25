import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarProgressLabel, clearAvatarAssets, loadAvatarBytes, subscribeAvatarProgress, type AvatarProgress } from '../src/lib/avatarAsset.ts'
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const fixture = () => { const bytes = new Uint8Array(20), view = new DataView(bytes.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 20, true); return bytes }

test('a progressing mobile avatar download survives 60 seconds and reports actual decoded progress', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = globalThis.fetch; clearAvatarAssets()
  const states: AvatarProgress[] = []; const unsubscribe = subscribeAvatarProgress('rapper', state => states.push(state))
  let controller!: ReadableStreamDefaultController<Uint8Array>; let signal!: AbortSignal; let calls = 0
  globalThis.fetch = (async (_url, init) => {
    calls++; signal = init!.signal!
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    return new Response(body, { headers: { 'Content-Length': '20' } })
  }) as typeof fetch
  try {
    const pending = loadAvatarBytes('rapper'); await flush()
    controller.enqueue(fixture().subarray(0, 5)); await flush()
    for (let offset = 5; offset < 20; offset += 5) {
      t.mock.timers.tick(20_000); controller.enqueue(fixture().subarray(offset, offset + 5)); await flush()
      assert.equal(signal.aborted, false)
    }
    controller.close(); assert.deepEqual(new Uint8Array(await pending), fixture()); assert.equal(calls, 1)
    assert.ok(states.some(state => state.loaded === 10 && state.total === 20))
    assert.equal(states.at(-1)!.phase, 'downloaded')
    assert.equal(avatarProgressLabel(states.at(-1)!), 'Preparing the original character and animation…')
  } finally { unsubscribe(); clearAvatarAssets(); globalThis.fetch = original; t.mock.timers.reset() }
})

test('one transient failure retries automatically and still shares the in-flight promise', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async () => ++calls === 1 ? new Response('temporary', { status: 502 }) : new Response(fixture())) as typeof fetch
  try {
    const pending = loadAvatarBytes('rapper'); assert.equal(pending, loadAvatarBytes('rapper')); await flush()
    assert.equal(calls, 1); t.mock.timers.tick(800)
    assert.deepEqual(new Uint8Array(await pending), fixture()); assert.equal(calls, 2)
  } finally { clearAvatarAssets(); globalThis.fetch = original; t.mock.timers.reset() }
})

test('persistent failures stop after three bounded attempts rather than looping forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async () => { calls++; throw new TypeError('network unavailable') }) as typeof fetch
  try {
    const rejected = assert.rejects(loadAvatarBytes('rapper'), /network unavailable/)
    await flush(); t.mock.timers.tick(800); await flush(); t.mock.timers.tick(800); await rejected; assert.equal(calls, 3)
  } finally { clearAvatarAssets(); globalThis.fetch = original; t.mock.timers.reset() }
})

test('logout during retry backoff cancels the retry and discards the old session request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response('temporary', { status: 503 }) }) as typeof fetch
  try {
    const pending = loadAvatarBytes('rapper'); const rejected = assert.rejects(pending)
    await flush(); clearAvatarAssets(); t.mock.timers.tick(1000); await rejected; assert.equal(calls, 1)
  } finally { clearAvatarAssets(); globalThis.fetch = original; t.mock.timers.reset() }
})

test('a genuinely stalled stream is aborted and retries, unlike a healthy slow stream', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0; let firstSignal!: AbortSignal
  globalThis.fetch = (async (_url, init) => {
    if (++calls > 1) return new Response(fixture())
    firstSignal = init!.signal!
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(fixture().subarray(0, 5))
      firstSignal.addEventListener('abort', () => controller.error(firstSignal.reason), { once: true })
    } }))
  }) as typeof fetch
  try {
    const pending = loadAvatarBytes('rapper'); await flush(); t.mock.timers.tick(30_001); await flush()
    assert.equal(firstSignal.aborted, true); t.mock.timers.tick(800)
    assert.deepEqual(new Uint8Array(await pending), fixture()); assert.equal(calls, 2)
  } finally { clearAvatarAssets(); globalThis.fetch = original; t.mock.timers.reset() }
})

test('progress subscription cleanup and terminal errors do not manufacture a successful model', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0, notifications = 0
  const unsubscribe = subscribeAvatarProgress('rapper', () => notifications++)
  unsubscribe()
  globalThis.fetch = (async () => { calls++; return new Response('<html>login</html>', { status: 403 }) }) as typeof fetch
  try { await assert.rejects(loadAvatarBytes('rapper')); assert.equal(calls, 1); assert.equal(notifications, 1) }
  finally { clearAvatarAssets(); globalThis.fetch = original }
})
