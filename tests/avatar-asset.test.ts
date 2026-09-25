import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAvatarAssets, loadAvatarBytes } from '../src/lib/avatarAsset.ts'
const fixture = () => { const bytes = new Uint8Array(20); const view = new DataView(bytes.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 20, true); return bytes }

test('prefetch and world loading share exactly one authorized GET and the same original bytes', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async (url, init) => {
    calls++; assert.equal(url, '/game-assets/queen-1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba.glb'); assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.redirect, 'error'); assert.equal(init?.method, undefined)
    return new Response(fixture())
  }) as typeof fetch
  try {
    const first = loadAvatarBytes('queen'), second = loadAvatarBytes('queen')
    assert.equal(first, second); assert.deepEqual(new Uint8Array(await first), fixture())
    assert.equal(await loadAvatarBytes('queen'), await first); assert.equal(calls, 1)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})
test('failed responses and HTML never poison retry or become a character', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async () => ++calls === 1 ? new Response('Sign in', { status: 403 }) : calls === 2 ? new Response('<html>unavailable</html>') : new Response(fixture())) as typeof fetch
  try {
    await assert.rejects(loadAvatarBytes('queen')); await assert.rejects(loadAvatarBytes('queen'))
    assert.equal((await loadAvatarBytes('queen')).byteLength, 20); assert.equal(calls, 3)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})
test('logout discards cached originals and aborts an in-flight request', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let signal: AbortSignal | null = null
  globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
    signal = init!.signal!; signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })) as typeof fetch
  try {
    const pending = loadAvatarBytes('queen'); clearAvatarAssets()
    await assert.rejects(pending); assert.equal(signal!.aborted, true)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})
