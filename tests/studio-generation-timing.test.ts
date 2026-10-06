import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStudioGenerationDuration, readStudioGenerationTiming } from '../src/lib/studioProtocol.ts'
import { parseStudioJob, StudioCoordinator } from '../src/lib/studioClient.ts'
import { getStudioLibraryModel, isStudioLibraryTemporaryError, StudioLibraryAccountError } from '../src/lib/studioLibrary.ts'

const id = '12345678-1234-4234-8234-123456789abc'
const at = '2026-10-05T12:00:00Z'
const receipt = { id, createdAt: at, ticket: `${id}.1791201600000.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const timing = { source: 'oracle-worker' as const, durationSeconds: 343.27 }
const model = { id, prompt: 'Saved model', createdAt: at, completedAt: at, receipt: { ...receipt, ticket: `library.${receipt.ticket}` }, review: 'UNREVIEWED', downloadAllowed: true }

test('timing validation never coerces unknown or private fields and formatting handles duration boundaries', () => {
  for (const durationSeconds of [0, 59.49, 59.5, 343.27, 86_400])
    assert.deepEqual(readStudioGenerationTiming({ ...timing, durationSeconds, private: 'do not retain' }), { source: 'oracle-worker', durationSeconds })
  for (const value of [null, [], {}, { ...timing, source: 'receipt' }, ...[true, '343', -1, NaN, Infinity, 86_400.01, {}].map(durationSeconds => ({ ...timing, durationSeconds }))])
    assert.equal(readStudioGenerationTiming(value), undefined)
  assert.equal(formatStudioGenerationDuration(), 'Duration unavailable')
  assert.equal(formatStudioGenerationDuration({ ...timing, durationSeconds: 0 }), '0s')
  assert.equal(formatStudioGenerationDuration({ ...timing, durationSeconds: 59.49 }), '59s')
  assert.equal(formatStudioGenerationDuration({ ...timing, durationSeconds: 59.5 }), '1m 0s')
  assert.equal(formatStudioGenerationDuration(timing), '5m 43s')
})

test('terminal job and selected library parsers retain only validated optional duration', async () => {
  for (const state of ['succeeded', 'failed', 'cancelled'])
    assert.deepEqual(parseStudioJob({ job: { id, state, generationTiming: { ...timing, private: 'secret' } } }, id).generationTiming, timing)
  assert.equal(parseStudioJob({ job: { id, state: 'building', generationTiming: timing } }, id).generationTiming, undefined)
  assert.equal(parseStudioJob({ job: { id, state: 'failed', generationTiming: { ...timing, durationSeconds: '343' } } }, id).generationTiming, undefined)
  for (const generationTiming of [timing, { ...timing, durationSeconds: true }, undefined]) {
    const result = await getStudioLibraryModel('owner-a', id, new AbortController().signal,
      async () => Response.json({ accountId: 'owner-a', model: { ...model, generationTiming } }))
    assert.deepEqual(result.generationTiming, generationTiming === timing ? timing : undefined)
    assert.equal(result.completedAt, at)
  }
})

test('cloud-only terminal recovery uses optional measured duration and never computes receipt age', async () => {
  for (const financialState of ['completed', 'failed', 'reserved']) {
    const data = new Map<string, string>()
    const client = new StudioCoordinator({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } },
      async () => Response.json({ current: { receipt, prompt: 'Saved model', startedAt: at, financialState, generationTiming: timing } }))
    const result = await client.recoverCurrent()
    assert.deepEqual(result?.job.generationTiming, financialState === 'reserved' ? undefined : timing)
  }
})

test('selected metadata fallback is limited to transport, timeout, 429 and 5xx; ownership and parse failures remain strict', async () => {
  for (const fetcher of [async () => { throw new TypeError('Network failed') }, async () => { throw new DOMException('Timed out', 'TimeoutError') },
    ...[429, 500, 503].map(status => async () => Response.json({}, { status })),
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Body disconnected')) } }), { headers: { 'Content-Type': 'application/json' } })])
    await assert.rejects(getStudioLibraryModel('owner-a', id, new AbortController().signal, fetcher), isStudioLibraryTemporaryError)
  for (const fetcher of [...[401, 403, 404].map(status => async () => Response.json({ error: 'Unavailable' }, { status })),
    ...[401, 403, 404].map(status => async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Body disconnected')) } }), { status, headers: { 'Content-Type': 'application/json' } })),
    async () => new Response('broken-json', { headers: { 'Content-Type': 'application/json' } }),
    async () => Response.json({ accountId: 'owner-a', model: {} }),
    async () => Response.json({ accountId: 'owner-b', model }),
    async () => Response.json({ accountId: 'owner-a', model: { ...model, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } })])
    await assert.rejects(getStudioLibraryModel('owner-a', id, new AbortController().signal, fetcher), error => !isStudioLibraryTemporaryError(error))
  const abort = new AbortController()
  await assert.rejects(getStudioLibraryModel('owner-a', id, abort.signal, async () => { abort.abort(); throw new TypeError('Transport aborted') }), error => !isStudioLibraryTemporaryError(error))
  await assert.rejects(getStudioLibraryModel('owner-a', id, new AbortController().signal, async () => Response.json({ accountId: 'owner-b', model })), StudioLibraryAccountError)
})
