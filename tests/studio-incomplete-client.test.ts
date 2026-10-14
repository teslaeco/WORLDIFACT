import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listStudioLibrary, readStudioLibraryModel } from '../src/lib/studioLibrary.ts'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID = 'c5555555-1111-4111-8111-222222222222'
const TICKET = `library.${ID}.1791990000000.${'a'.repeat(64)}.${'b'.repeat(64)}`
const model = {
  id: ID, prompt: 'Incomplete mechanical model', review: 'UNREVIEWED',
  createdAt: '2026-10-14T14:00:00Z', completedAt: '2026-10-14T14:05:00Z',
  receipt: { id: ID, createdAt: '2026-10-14T14:00:00Z', ticket: TICKET },
  downloadAllowed: true, completion: 'INCOMPLETE', incompleteReason: 'MODEL_BUDGET_EXCEEDED',
  backupVerified: 'r2-sha256-readback-v1',
  studioExecution: { revision: 'studio-execution-v1', model: 'sol', mode: 'standard' },
}
const page = (entry: unknown) =>
  Response.json({ accountId: USER, models: [], incompleteModels: [entry], nextCursor: null, hasMore: false })

test('client distinguishes server-verified original R2 copy and reads only the incomplete GLB route', async () => {
  const calls: string[] = []
  const result = await listStudioLibrary(USER, null, new AbortController().signal,
    async (input, options) => {
      const path = String(input)
      calls.push(path)
      assert.equal(options?.method, 'GET')
      if (path === '/api/studio/library') return page(model)
      if (path === '/api/studio/jobs/' + ID + '/draft') {
        assert.equal(new Headers(options?.headers).get('X-WORLDIFACT-Job'), TICKET)
        const bytes = detailedGLBFixture()
        return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary',
          'Content-Length': String(bytes.byteLength) } })
      }
      throw new Error('Unexpected read: ' + path)
    })
  const incomplete = result.incompleteModels?.[0]
  assert.equal(incomplete?.completion, 'INCOMPLETE')
  assert.equal(incomplete?.backupVerified, 'r2-sha256-readback-v1')
  assert.equal(incomplete?.providerEvidence, undefined)
  const callsBefore = calls.length
  const file = await readStudioLibraryModel(USER, incomplete!, new AbortController().signal,
    async (input, options) => {
      const path = String(input); calls.push(path)
      assert.equal(path, '/api/studio/jobs/' + ID + '/draft')
      assert.equal(new Headers(options?.headers).get('X-WORLDIFACT-Job'), TICKET)
      const bytes = detailedGLBFixture()
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary',
        'Content-Length': String(bytes.byteLength) } })
    })
  assert.equal(calls.length, callsBefore + 1)
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(detailedGLBFixture()))
  assert.equal(calls.some(path => path.endsWith('/model') || path.includes('/exports/')), false)
})

test('fake R2 backup marker and backup on completed item are rejected before any download', async () => {
  for (const spoofed of [
    { ...model, backupVerified: 'R2_PENDING' },
    { ...model, completion: undefined, incompleteReason: undefined },
    { ...model, backupVerified: true },
  ]) {
    let calls = 0
    await assert.rejects(
      listStudioLibrary(USER, null, new AbortController().signal, async () => { calls++; return page(spoofed) }),
      /backup|inconsistent|Unverified/i)
    assert.equal(calls, 1, 'Malformed archive metadata must not trigger model access')
  }
})
