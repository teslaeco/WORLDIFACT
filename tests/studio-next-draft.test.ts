import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX, type ReceiptStore } from '../src/lib/studioClient.ts'
import { canSubmitNewDraft } from '../src/lib/studioDraft.ts'
import { FAST_DRAFT_PROFILE, type StudioInput, type StudioJob } from '../src/lib/studioProtocol.ts'
const oldId = '12345678-1234-4234-8234-123456789abc'
const nextId = '87654321-1234-4234-8234-123456789abc'
function receipt(id: string) { return { id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` } }
const nextInput: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a blue chess rook', purpose: 'figurine', textureMaxSize: 2048, photos: [], generationProfile: FAST_DRAFT_PROFILE }
function fixture() {
  const old = { receipt: receipt(oldId), prompt: 'Original brown knight', startedAt: new Date().toISOString() }
  const map = new Map([[STUDIO_RECEIPT_KEY, JSON.stringify(old)], ['unrelated-archive', 'original-model-kept']])
  const store: ReceiptStore = { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: key => { map.delete(key) } }
  const calls: { path: string; method: string; body?: string }[] = []
  let state: StudioJob['state'] = 'succeeded', prepareFailed = false, lostPost = false
  const client = new StudioCoordinator(store, (async (path, init) => {
    const url = String(path), method = init?.method ?? 'GET'
    calls.push({ path: url, method, ...(init?.body ? { body: String(init.body) } : {}) })
    if (url.endsWith('/prepare')) return prepareFailed ? Response.json({ error: 'Generation is disabled.' }, { status: 503 }) : Response.json(receipt(nextId))
    if (method === 'POST') {
      assert.equal(JSON.parse(map.get(STUDIO_RECEIPT_HISTORY_PREFIX + oldId)!).receipt.id, oldId)
      assert.equal(JSON.parse(map.get(STUDIO_RECEIPT_KEY)!).receipt.id, nextId)
      if (lostPost) throw new TypeError('Fixture response lost')
      return Response.json({ job: { id: nextId, state: 'building' } })
    }
    return Response.json({ job: { id: url.endsWith(oldId) ? oldId : nextId, state } })
  }) as typeof fetch)
  client.restore()
  return { client, store, map, calls, old, state: (s: StudioJob['state']) => { state = s }, failPrepare: () => { prepareFailed = true }, losePost: () => { lostPost = true } }
}

test('the draft submit rule requires the selected receipt own terminal result, never an arbitrary old result', () => {
  assert.equal(canSubmitNewDraft(undefined, null), true)
  for (const state of ['pending', 'queued', 'generating', 'retrying', 'building'] as StudioJob['state'][]) assert.equal(canSubmitNewDraft(oldId, { id: oldId, state }), false)
  for (const state of ['succeeded', 'failed', 'cancelled'] as StudioJob['state'][]) assert.equal(canSubmitNewDraft(oldId, { id: oldId, state }), true)
  assert.equal(canSubmitNewDraft(oldId, { id: nextId, state: 'succeeded' }), false)
  assert.equal(canSubmitNewDraft(oldId, null), false)
})

test('a restored completed model allows one explicit next job after GET confirmation without discarding its receipt', async () => {
  const f = fixture()
  await assert.rejects(f.client.start(nextInput, () => {}, '', true), /already selected/)
  assert.equal(f.calls.length, 0, 'unknown restored state cannot spend')
  await f.client.poll()
  await assert.rejects(f.client.start(nextInput, () => {}), /already selected/)
  const result = await f.client.start(nextInput, record => assert.equal(record.receipt.id, nextId), '', true)
  assert.equal(result.state, 'building')
  assert.deepEqual(JSON.parse(f.map.get(STUDIO_RECEIPT_HISTORY_PREFIX + oldId)!), f.old)
  assert.equal(f.client.current?.prompt, nextInput.prompt)
  assert.equal(f.client.current?.generationProfile, FAST_DRAFT_PROFILE)
  assert.equal(f.map.get('unrelated-archive'), 'original-model-kept')
  assert.equal(f.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
  await assert.rejects(f.client.start(nextInput, () => {}, '', true), /already selected/)
})

test('failed free preparation keeps the previous model selected and sends no paid POST', async () => {
  const f = fixture(); await f.client.poll(); f.failPrepare()
  await assert.rejects(f.client.start(nextInput, () => assert.fail('Do not replace result'), '', true), /disabled/)
  assert.deepEqual(f.client.current, f.old)
  assert.deepEqual(JSON.parse(f.map.get(STUDIO_RECEIPT_KEY)!), f.old)
  assert.equal(f.calls.filter(c => c.path === '/api/studio/jobs').length, 0)
})

test('running jobs and storage failures cannot be bypassed by a new editable draft', async () => {
  const running = fixture(); running.state('building'); await running.client.poll()
  await assert.rejects(running.client.start(nextInput, () => {}, '', true), /already selected/)
  assert.equal(running.calls.filter(c => c.method === 'POST').length, 0)
  const storage = fixture(); await storage.client.poll()
  storage.store.setItem = () => { throw new Error('Device storage full') }
  await assert.rejects(storage.client.start(nextInput, () => {}, '', true), /storage full/)
  assert.deepEqual(storage.client.current, storage.old)
  assert.equal(storage.calls.filter(c => c.path === '/api/studio/jobs').length, 0)
})

test('lost next-job acceptance recovers the new receipt by GET and never resends either generation', async () => {
  const f = fixture(); await f.client.poll(); f.losePost()
  assert.equal((await f.client.start(nextInput, () => {}, '', true)).state, 'pending')
  await f.client.poll()
  assert.equal(f.client.current?.receipt.id, nextId)
  assert.equal(f.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
  assert.deepEqual(JSON.parse(f.map.get(STUDIO_RECEIPT_HISTORY_PREFIX + oldId)!), f.old)
})

test('mutating a draft during free preparation cannot change its eventual paid request', async () => {
  const f = fixture(); await f.client.poll()
  const draft = { ...nextInput }
  const result = f.client.start(draft, () => {}, '', true)
  draft.prompt = 'Changed after the explicit click'
  await result
  const preparation = f.calls.find(c => c.path === '/api/studio/prepare')!
  const submission = f.calls.find(c => c.path === '/api/studio/jobs')!
  assert.equal(submission.body, preparation.body)
  assert.equal(JSON.parse(submission.body!).prompt, nextInput.prompt)
  assert.equal(f.client.current?.prompt, nextInput.prompt)
})
