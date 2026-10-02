import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, parseStudioJob, readSavedStudioJob, type ReceiptStore } from '../src/lib/studioClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
const id = '12345678-1234-4234-8234-123456789abc'
const receipt = { id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a blue skull sculpture', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function store(): ReceiptStore {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
}

test('the exact receipt is retained before the only paid POST and double clicks are rejected', async () => {
  const storage = store(), calls: string[] = []
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    if (String(url).endsWith('/prepare')) return Response.json(receipt)
    assert.equal(readSavedStudioJob(storage)?.receipt.ticket, receipt.ticket)
    assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Idempotency-Key'), id)
    return Response.json({ job: { id, state: 'building' } })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fake)
  const first = client.start(input, saved => assert.equal(saved.receipt.id, id))
  await assert.rejects(client.start(input, () => {}), /already selected/)
  assert.equal((await first).state, 'building')
  assert.deepEqual(calls, ['/api/studio/prepare', '/api/studio/jobs'])
  await assert.rejects(client.start(input, () => {}), /already selected/)
})

test('blocked browser storage prevents paid submission rather than losing the recovery identifier', async () => {
  const calls: string[] = []
  const storage = store(); storage.setItem = () => { throw new Error('Storage unavailable') }
  const client = new StudioCoordinator(storage, (async url => { calls.push(String(url)); return Response.json(receipt) }) as typeof fetch)
  await assert.rejects(client.start(input, () => {}), /Storage unavailable/)
  assert.deepEqual(calls, ['/api/studio/prepare'])
})

test('lost POST response plus page reload resumes the same job with GET only', async () => {
  const storage = store(), calls: { url: string; method: string }[] = []
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' })
    if (String(url).endsWith('/prepare')) return Response.json(receipt)
    if (init?.method === 'POST') { assert.equal(new Headers(init.headers).get('X-WORLDIFACT-Idempotency-Key'), id); throw new TypeError('Simulated network loss') }
    assert.equal(new Headers(init?.headers).get('X-WORLDIFACT-Job'), receipt.ticket)
    return Response.json({ job: { id, state: 'succeeded' } })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fake)
  assert.equal((await client.start(input, () => {})).state, 'pending')
  const restored = new StudioCoordinator(storage, fake)
  assert.equal(restored.restore()?.receipt.id, id)
  assert.equal((await restored.poll()).state, 'succeeded')
  assert.equal((await restored.poll()).state, 'succeeded')
  assert.equal(calls.filter(c => c.url === '/api/studio/jobs' && c.method === 'POST').length, 1)
  assert.equal(calls.filter(c => c.method === 'GET').length, 2)
  assert.ok(calls.every(c => !c.url.includes(receipt.ticket)))
})

test('cloud recovery restores an active job when browser localStorage lost the current receipt', async () => {
  const storage = store(), calls: { url: string; method: string }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' })
    if (String(url) === '/api/studio/current') return Response.json({ current: {
      receipt, prompt: input.prompt, startedAt: new Date().toISOString(), financialState: 'reserved', reservedPoints: 250,
    } })
    return Response.json({ job: { id, state: 'building' } })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fetcher)
  assert.equal(client.restore(), null)
  const recovered = await client.recoverCurrent()
  assert.equal(recovered?.saved.receipt.id, id)
  assert.equal(recovered?.job.state, 'pending')
  assert.equal(readSavedStudioJob(storage)?.receipt.id, id)
  assert.deepEqual(calls, [{ url: '/api/studio/current', method: 'GET' }])
  assert.equal(calls.some(call => call.method === 'POST'), false)
  assert.equal((await client.poll()).state, 'building')
})

test('explicit cloud dismissal uses DELETE and then clears only the selected local receipt', async () => {
  const storage = store(); storage.setItem(STUDIO_RECEIPT_KEY, JSON.stringify({ receipt, prompt: input.prompt, startedAt: new Date().toISOString() })); storage.setItem('unrelated-model','keep')
  const calls: { url: string; method: string; body?: string }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined })
    return Response.json({ cleared: true })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fetcher); client.restore()
  await client.dismissCurrent()
  assert.equal(client.current, null)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), null)
  assert.equal(storage.getItem('unrelated-model'), 'keep')
  assert.equal(calls.length,1); assert.equal(calls[0].url,'/api/studio/current'); assert.equal(calls[0].method,'DELETE')
  assert.deepEqual(JSON.parse(calls[0].body!),{id})
})

test('wrong job IDs, unknown states and corrupt stored receipts never appear as a valid current result', () => {
  assert.throws(() => parseStudioJob({ job: { id: crypto.randomUUID(), state: 'succeeded' } }, id))
  assert.throws(() => parseStudioJob({ job: { id, state: 'published' } }, id))
  const storage = store(); storage.setItem(STUDIO_RECEIPT_KEY, '{"receipt":{"id":"old"}}')
  assert.throws(() => readSavedStudioJob(storage))
  assert.ok(storage.getItem(STUDIO_RECEIPT_KEY), 'Corrupt data is not silently deleted')
})

test('explicit selection reset removes only the current receipt, not any archived models', async () => {
  const storage = store(); storage.setItem('unrelated-model', 'keep')
  const client = new StudioCoordinator(storage, (async url => String(url).endsWith('/prepare') ? Response.json(receipt) : Response.json({ job: { id, state: 'failed' } })) as typeof fetch)
  await client.start(input, () => {})
  client.clearSelection()
  assert.equal(client.current, null)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), null)
  assert.equal(storage.getItem('unrelated-model'), 'keep')
})

test('explicit account quota rejection stays terminal across reload without endless polling or another POST', async () => {
  const storage = store(), calls: string[] = []
  const fetcher = (async url => {
    calls.push(String(url))
    return String(url).endsWith('/prepare') ? Response.json(receipt) : Response.json({ error: 'Your daily allowance is used.' }, { status: 429 })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fetcher)
  const job = await client.start(input, () => {})
  assert.equal(job.state, 'failed'); assert.match(job.detail, /daily allowance/)
  const restored = new StudioCoordinator(storage, fetcher)
  restored.restore()
  assert.equal((await restored.poll()).state, 'failed')
  assert.deepEqual(calls, ['/api/studio/prepare', '/api/studio/jobs'])
  restored.clearSelection()
  assert.equal(restored.current, null)
})


test('cloud timeout failure remains terminal and tells the user the held points were released', () => {
  const job = parseStudioJob({ job: { id, state: 'failed', failureCode: 'STUDIO_TIMEOUT' } }, id)
  assert.equal(job.failureCode, 'STUDIO_TIMEOUT')
  assert.match(job.detail, /maximum recovery window/i)
  assert.match(job.detail, /points were released/i)
})

test('legacy ownership 403 becomes same-job reconciliation instead of endless polling or paid replay', async () => {
  const storage = store()
  storage.setItem(STUDIO_RECEIPT_KEY, JSON.stringify({ receipt, prompt: input.prompt, startedAt: new Date().toISOString() }))
  const calls: { url: string; method: string }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' })
    return Response.json({ error: 'This model belongs to a different account or has no account receipt.' }, { status: 403 })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fetcher)
  client.restore()
  const job = await client.poll()
  assert.equal(job.state, 'pending')
  assert.equal(job.reconciliationRequired, true)
  assert.match(job.detail, /account-ledger reconciliation/i)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls.some(call => call.method === 'POST'), false)
  assert.equal(client.current?.receipt.id, id)
})
