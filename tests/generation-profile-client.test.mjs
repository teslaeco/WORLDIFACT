import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, readSavedStudioJob } from '../src/lib/studioClient.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'
import { renderShopMarkup } from './shop-render-helper.mjs'

const id = '12345678-1234-4234-8234-123456789abc'
const receipt = { id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const input = { worldId: 'enchanted-ai-shop', prompt: 'Create a chess knight', purpose: 'figurine', textureMaxSize: 2048, photos: [], generationProfile: FAST_DRAFT_PROFILE }
function storage() {
  const map = new Map()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}

test('FAST receipt is persisted before the single POST and restored without defaulting to STANDARD', async () => {
  const store = storage(), calls = []
  const fetcher = async (path, init = {}) => {
    calls.push([path, init.method || 'GET'])
    if (path.endsWith('/prepare')) return Response.json(receipt)
    if (path === '/api/studio/jobs') {
      assert.equal(JSON.parse(init.body).generationProfile, FAST_DRAFT_PROFILE)
      assert.equal(readSavedStudioJob(store).generationProfile, FAST_DRAFT_PROFILE)
      throw new TypeError('Lost response fixture')
    }
    return Response.json({ job: { id, state: 'succeeded' } })
  }
  const first = new StudioCoordinator(store, fetcher)
  assert.equal((await first.start(input, () => {})).state, 'pending')
  const restored = new StudioCoordinator(store, fetcher)
  assert.equal(restored.restore().generationProfile, FAST_DRAFT_PROFILE)
  assert.equal((await restored.poll()).state, 'succeeded')
  assert.equal(calls.filter(([path, method]) => path === '/api/studio/jobs' && method === 'POST').length, 1)
})

test('existing STANDARD receipts remain readable and unknown saved modes fail closed', () => {
  const store = storage()
  const old = { receipt, prompt: input.prompt, startedAt: receipt.createdAt }
  store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(old))
  assert.deepEqual(readSavedStudioJob(store), old)
  store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify({ ...old, generationProfile: 'unreviewed-fast' }))
  assert.throws(() => readSavedStudioJob(store))
  assert.ok(store.getItem(STUDIO_RECEIPT_KEY), 'invalid data is not silently deleted')
})

test('actual Shop initial render exposes Astra blueprint and keeps FAST gated until Sol LIVE health is confirmed', async () => {
  const html = await renderShopMarkup()
  assert.equal((html.match(/id="studio-mode"/g) || []).length, 1)
  assert.match(html, /GPT-6 ASTRA — 250 points per job/)
  assert.match(html, /<option value="fast-draft-v1" disabled="">GPT-6\.1 SOL/)
  assert.match(html, /Sol\/Luna generation is awaiting verified worker readiness/)
  assert.match(html, /Generate GPT-6 Astra blueprint · 250 points/)
  assert.match(html, /Back to WORLDIFAKT/)
  assert.doesNotMatch(html, /<iframe|target="_top"|FAST guaranteed/)
})
