import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAvatarAssets, loadAvatarBytes } from '../src/lib/avatarAsset.ts'

const QUEEN_BYTES = 27_676_800
const QUEEN_PART = 14 * 1024 * 1024
const QUEEN_URLS = [
  '/game-assets/queen-1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba.glb.part-00.bin',
  '/game-assets/queen-1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba.glb.part-01.bin',
]
const smallFixture = () => { const bytes = new Uint8Array(20); const view = new DataView(bytes.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 20, true); return bytes }
const queenFixture = () => { const bytes = new Uint8Array(QUEEN_BYTES); const view = new DataView(bytes.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, QUEEN_BYTES, true); bytes[QUEEN_BYTES - 1] = 7; return bytes }

test('prefetch and world loading share one two-part static Queen download and exact original bytes', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  const queen = queenFixture()
  globalThis.fetch = (async (url, init) => {
    assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.redirect, 'error')
    assert.equal(url, QUEEN_URLS[calls])
    const start = calls++ === 0 ? 0 : QUEEN_PART
    const end = calls === 1 ? QUEEN_PART : QUEEN_BYTES
    const part = queen.slice(start, end)
    return new Response(part, { headers: { 'Content-Length': String(part.byteLength), 'Content-Type': 'application/octet-stream' } })
  }) as typeof fetch
  try {
    const first = loadAvatarBytes('queen'), second = loadAvatarBytes('queen')
    assert.equal(first, second)
    const result = new Uint8Array(await first)
    assert.equal(result.byteLength, QUEEN_BYTES)
    assert.equal(result[QUEEN_BYTES - 1], 7)
    assert.equal(await loadAvatarBytes('queen'), await first)
    assert.equal(calls, 2)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})

test('failed rapper responses and HTML never poison retry or become a character', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let calls = 0
  globalThis.fetch = (async () => ++calls === 1 ? new Response('Sign in', { status: 403 }) : calls === 2 ? new Response('<html>unavailable</html>') : new Response(smallFixture())) as typeof fetch
  try {
    await assert.rejects(loadAvatarBytes('rapper')); await assert.rejects(loadAvatarBytes('rapper'))
    assert.equal((await loadAvatarBytes('rapper')).byteLength, 20); assert.equal(calls, 3)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})

test('logout discards cached originals and aborts an in-flight request', async () => {
  const original = globalThis.fetch; clearAvatarAssets(); let signal: AbortSignal | null = null
  globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
    signal = init!.signal!; signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })) as typeof fetch
  try {
    const pending = loadAvatarBytes('rapper'); clearAvatarAssets()
    await assert.rejects(pending); assert.equal(signal!.aborted, true)
  } finally { clearAvatarAssets(); globalThis.fetch = original }
})
