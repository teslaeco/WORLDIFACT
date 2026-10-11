import test from 'node:test'
import assert from 'node:assert/strict'
import { createThumbnailQueue, THUMBNAIL_MAX_BYTES } from '../src/lib/studioThumbnail.ts'
import { readStudioLibraryModel } from '../src/lib/studioLibrary.ts'
import type { StudioLibraryModel } from '../src/lib/studioProtocol.ts'

test('thumbnail work is serial; cancelled queued work cannot read files and a failed task does not block the next card', async () => {
  const queue = createThumbnailQueue(), signal = new AbortController().signal, cancelled = new AbortController()
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve })
  const seen: string[] = []
  const a = queue(signal, async () => { seen.push('first'); await pending; throw Error('Unsupported model') })
  const rejected = assert.rejects(a, /Unsupported/)
  const b = queue(cancelled.signal, async () => { seen.push('cancelled'); return 2 })
  const aborted = assert.rejects(b, /abort/i)
  const c = queue(signal, async () => { seen.push('last'); return 3 })
  await Promise.resolve(); assert.deepEqual(seen, ['first'])
  cancelled.abort(); release(); await Promise.all([rejected, aborted]); assert.equal(await c, 3)
  assert.deepEqual(seen, ['first', 'last'])
})

test('thumbnail reads retain account receipts, GET-only access and smaller byte caps', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const model: StudioLibraryModel = { id, prompt: 'Fixture', createdAt: '2026-10-11T00:00:00Z', completedAt: '2026-10-11T00:00:01Z', review: 'UNREVIEWED', downloadAllowed: true,
    receipt: { id, createdAt: '2026-10-11T00:00:00Z', ticket: `library.${id}.1791676800000.${'a'.repeat(64)}.${'b'.repeat(64)}` } }
  let calls = 0
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, `/api/studio/jobs/${id}/model`); assert.equal(init?.method, 'GET')
    assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.redirect, 'error')
    assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Job'), model.receipt.ticket)
    return new Response('x', { headers: { 'content-length': String(THUMBNAIL_MAX_BYTES + 1) } })
  }
  await assert.rejects(readStudioLibraryModel('owner-a', model, new AbortController().signal, fetcher, THUMBNAIL_MAX_BYTES), /size limit/)
  assert.equal(calls, 1)
  await assert.rejects(readStudioLibraryModel('', model, new AbortController().signal, fetcher, THUMBNAIL_MAX_BYTES), /Sign in/)
  assert.equal(calls, 1)
})
