import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX, type ReceiptStore, type SavedStudioJob } from '../src/lib/studioClient.ts'
import { canSubmitNewDraft } from '../src/lib/studioDraft.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
const id = '12345678-1234-4234-8234-123456789abc'
const issued = Date.now() - 36 * 3600_000
const saved: SavedStudioJob = { receipt: { id, createdAt: new Date(issued).toISOString(), ticket: `${id}.${issued}.${'a'.repeat(64)}.${'b'.repeat(64)}` }, prompt: 'Preserve this original description', startedAt: new Date(issued).toISOString() }
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create the next model', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function storage(): ReceiptStore {
  const data = new Map<string, string>([[STUDIO_RECEIPT_KEY, JSON.stringify(saved)], ['existing-model', 'keep']])
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
}
for (const message of ['The job receipt is not valid.', 'This job receipt expired. Keep your saved model.']) {
  test(`recovery archives a server-rejected receipt without another paid POST: ${message}`, async () => {
    const store = storage(), calls: string[] = []
    const client = new StudioCoordinator(store, (async (url, init) => {
      calls.push(String(url)); assert.equal(init?.method ?? 'GET', 'GET')
      assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Job'), saved.receipt.ticket)
      return Response.json({ error: message }, { status: 401 })
    }) as typeof fetch)
    client.restore()
    const job = await client.poll()
    assert.equal(job.state, 'failed'); assert.equal(canSubmitNewDraft(id, job), true)
    assert.match(job.detail, /old model status is unknown/)
    assert.equal(store.getItem(STUDIO_RECEIPT_HISTORY_PREFIX + id), JSON.stringify(saved))
    assert.equal((await client.poll()).state, 'failed'); assert.equal(calls.length, 1)
    client.clearSelection()
    assert.equal(client.current, null); assert.equal(store.getItem(STUDIO_RECEIPT_KEY), null)
    assert.equal(store.getItem('existing-model'), 'keep')
    assert.equal(JSON.parse(store.getItem(STUDIO_RECEIPT_HISTORY_PREFIX + id)!).prompt, saved.prompt)
    assert.equal(new StudioCoordinator(store).restore(), null)
    assert.ok(calls.every(url => !url.includes(saved.receipt.ticket)))
  })
}
test('authentication, account mismatch and uncertain failures keep the selected job and never unlock a duplicate', async () => {
  for (const [status, message] of [[401, 'Sign in with your shared WORLDIFACT / Cube Chess account to continue.'], [403, 'This model belongs to a different account or has no account receipt.'], [404, 'Job not found.'], [429, 'Please wait.'], [503, 'The job receipt is not valid.']] as const) {
    const store = storage()
    let calls = 0
    const client = new StudioCoordinator(store, (async () => { calls++; return Response.json({ error: message }, { status }) }) as typeof fetch)
    client.restore(); await assert.rejects(client.poll())
    await assert.rejects(client.start(input, () => {}, '', true), /already selected/)
    assert.equal(calls, 1); assert.equal(client.current?.receipt.id, id)
    assert.equal(store.getItem(STUDIO_RECEIPT_HISTORY_PREFIX + id), null)
  }
})
test('age alone never releases a pending job and network loss is not a rejected receipt', async () => {
  const store = storage()
  const client = new StudioCoordinator(store, (async () => Response.json({ job: { id, state: 'pending' } })) as typeof fetch)
  client.restore(); const job = await client.poll()
  assert.equal(job.state, 'pending'); assert.equal(canSubmitNewDraft(id, job), false)
  assert.equal(store.getItem(STUDIO_RECEIPT_HISTORY_PREFIX + id), null)
  const offline = new StudioCoordinator(store, (async () => { throw new TypeError('Network unavailable') }) as typeof fetch)
  offline.restore(); await assert.rejects(offline.poll(), /Network unavailable/)
  await assert.rejects(offline.start(input, () => {}, '', true), /already selected/)
})
test('failed history storage cannot erase the only recovery receipt', async () => {
  const store = storage()
  store.setItem = () => { throw new Error('Storage full') }
  const client = new StudioCoordinator(store, (async () => Response.json({ error: 'The job receipt is not valid.' }, { status: 401 })) as typeof fetch)
  client.restore(); await assert.rejects(client.poll(), /Storage full/)
  assert.equal(store.getItem(STUDIO_RECEIPT_KEY), JSON.stringify(saved)); assert.equal(client.current?.receipt.id, id)
  await assert.rejects(client.start(input, () => {}, '', true), /already selected/)
})
test('a late invalid response for a different receipt cannot release the current model', async () => {
  const store = storage(), nextId = '22345678-1234-4234-8234-123456789abc'
  const next = { ...saved, receipt: { ...saved.receipt, id: nextId, ticket: saved.receipt.ticket.replace(id, nextId) } }
  store.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(next))
  const client = new StudioCoordinator(store, (async () => Response.json({ error: 'The job receipt is not valid.' }, { status: 401 })) as typeof fetch)
  client.restore(); await assert.rejects(client.poll(saved))
  assert.equal(client.current?.receipt.id, nextId); assert.equal(store.getItem(STUDIO_RECEIPT_KEY), JSON.stringify(next))
})
