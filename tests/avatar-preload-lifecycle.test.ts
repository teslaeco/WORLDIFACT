import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAvatarAssets, loadAvatarBytes } from '../src/lib/avatarAsset.ts'
import { createAvatarPreloadLifecycle, DEFAULT_WORLD_AVATAR } from '../src/lib/avatarPreloadLifecycle.ts'

const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const fixture = () => {
  const bytes = new Uint8Array(20), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 20, true)
  return bytes
}

test('initial session discovery preserves the mounted world request and preloads the same default avatar', async () => {
  const original = globalThis.fetch
  clearAvatarAssets()
  let clears = 0
  const requests: { url: string; signal: AbortSignal; resolve: (response: Response) => void }[] = []
  globalThis.fetch = ((url, init) => new Promise<Response>((resolve, reject) => {
    const signal = init!.signal!
    requests.push({ url: String(url), signal, resolve })
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })) as typeof fetch
  const lifecycle = createAvatarPreloadLifecycle({ clear: () => { clears++; clearAvatarAssets() }, load: loadAvatarBytes })
  try {
    const world = loadAvatarBytes(DEFAULT_WORLD_AVATAR)
    lifecycle.observe({ loading: true, userId: null, pathname: '/world' })
    lifecycle.observe({ loading: false, userId: 'account-a', pathname: '/world' })
    await flush()
    assert.equal(clears, 0)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/avatar/terraforming-heroine')
    assert.equal(requests[0].signal.aborted, false)
    assert.equal(loadAvatarBytes(DEFAULT_WORLD_AVATAR), world)
    requests[0].resolve(new Response(fixture()))
    assert.deepEqual(new Uint8Array(await world), fixture())
    for (const pathname of ['/shop', '/world', '/lab', '/world']) {
      lifecycle.observe({ loading: false, userId: 'account-a', pathname })
      assert.equal(loadAvatarBytes(DEFAULT_WORLD_AVATAR), world)
    }
    assert.equal(clears, 0)
    assert.equal(requests.length, 1)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})

test('resolved account changes and logout invalidate in-flight assets exactly once', async () => {
  const original = globalThis.fetch
  clearAvatarAssets()
  let clears = 0
  const signals: AbortSignal[] = []
  globalThis.fetch = ((_url, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!
    signals.push(signal)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })) as typeof fetch
  const lifecycle = createAvatarPreloadLifecycle({ clear: () => { clears++; clearAvatarAssets() }, load: loadAvatarBytes })
  try {
    lifecycle.observe({ loading: false, userId: 'account-a', pathname: '/world' })
    const first = assert.rejects(loadAvatarBytes(DEFAULT_WORLD_AVATAR))
    lifecycle.observe({ loading: true, userId: null, pathname: '/world' })
    assert.equal(signals[0].aborted, false)
    lifecycle.observe({ loading: false, userId: 'account-b', pathname: '/world' })
    await first
    assert.equal(clears, 1)
    assert.equal(signals.length, 2)
    assert.equal(signals[0].aborted, true)
    assert.equal(signals[1].aborted, false)
    const second = assert.rejects(loadAvatarBytes(DEFAULT_WORLD_AVATAR))
    lifecycle.observe({ loading: false, userId: null, pathname: '/world' })
    await second
    lifecycle.observe({ loading: false, userId: null, pathname: '/login' })
    lifecycle.observe({ loading: false, userId: null, pathname: '/world' })
    assert.equal(clears, 2)
    assert.equal(signals[1].aborted, true)
    assert.equal(signals.length, 2, 'signed-out navigation must not trigger preloading')
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})

test('a known signed-out session changing to an account invalidates previous assets', async () => {
  let clears = 0, loads = 0
  const lifecycle = createAvatarPreloadLifecycle({ clear: () => { clears++ }, load: async choice => {
    loads++; assert.equal(choice, DEFAULT_WORLD_AVATAR); return fixture().buffer
  } })
  lifecycle.observe({ loading: false, userId: null, pathname: '/world' })
  assert.equal(clears, 0); assert.equal(loads, 0)
  lifecycle.observe({ loading: false, userId: 'account-a', pathname: '/world' })
  lifecycle.observe({ loading: false, userId: 'account-a', pathname: '/world' })
  assert.equal(clears, 1); assert.equal(loads, 1)
})

test('failed prefetch waits for a later observation and stale rejection cannot reset a newer session', async () => {
  const requests: { reject: (error: Error) => void }[] = []
  const lifecycle = createAvatarPreloadLifecycle({ clear: () => {}, load: () => new Promise<ArrayBuffer>((_resolve, reject) => {
    requests.push({ reject })
  }) })
  const a = { loading: false, userId: 'account-a', pathname: '/world' }
  const b = { ...a, userId: 'account-b' }
  lifecycle.observe(a)
  requests[0].reject(new Error('temporary failure'))
  await flush()
  assert.equal(requests.length, 1, 'a failed prefetch must not retry itself')
  lifecycle.observe({ ...a, pathname: '/shop' })
  lifecycle.observe(a)
  assert.equal(requests.length, 2)
  lifecycle.observe(b)
  assert.equal(requests.length, 3)
  requests[1].reject(new Error('late previous-account failure'))
  await flush()
  lifecycle.observe({ ...b, pathname: '/shop' })
  lifecycle.observe(b)
  assert.equal(requests.length, 3, 'an older failure must not restart the new account prefetch')
})
