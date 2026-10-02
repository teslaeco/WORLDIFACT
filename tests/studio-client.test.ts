import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX, parseStudioJob, readSavedStudioJob, type ReceiptStore } from '../src/lib/studioClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
const id = '12345678-1234-4234-8234-123456789abc'
const receipt = { id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a blue skull sculpture', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function store(): ReceiptStore {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
}
function resignedReceipt(offset = 1000) {
  const issued = Number(receipt.ticket.split('.')[1]) + offset
  return { id, createdAt: new Date(issued).toISOString(), ticket: `${id}.${issued}.${'a'.repeat(64)}.${'c'.repeat(64)}` }
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

test('cloud recovery preserves the original receipt and its re-signed revision before DELETE', async () => {
  const storage = store(), original = { receipt, prompt: input.prompt, startedAt: receipt.createdAt }
  const canonicalKey = STUDIO_RECEIPT_HISTORY_PREFIX + id, originalText = JSON.stringify(original)
  storage.setItem(canonicalKey, originalText)
  const refreshed = resignedReceipt(), revisionKey = `${canonicalKey}:${refreshed.ticket.split('.')[1]}`
  let deletes = 0
  const client = new StudioCoordinator(storage, (async (_url, init) => {
    if (init?.method === 'DELETE') {
      deletes++
      assert.equal(storage.getItem(canonicalKey), originalText, 'Canonical history is immutable')
      assert.equal(JSON.parse(storage.getItem(revisionKey)!).receipt.ticket, refreshed.ticket, 'The refreshed credential is retained before cloud mutation')
      return Response.json({ cleared: true })
    }
    return Response.json({ current: { ...original, receipt: refreshed, financialState: 'completed' } })
  }) as typeof fetch)
  await client.recoverCurrent()
  await client.dismissCurrent()
  assert.equal(deletes, 1); assert.equal(client.current, null)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), null)
  assert.equal(storage.getItem(canonicalKey), originalText)
  assert.equal(JSON.parse(storage.getItem(revisionKey)!).receipt.ticket, refreshed.ticket)
})

test('same-job receipt revisions retain distinct immutable timestamp records and allow replay', () => {
  const storage = store(), original = { receipt, prompt: input.prompt, startedAt: receipt.createdAt }
  const canonicalKey = STUDIO_RECEIPT_HISTORY_PREFIX + id, originalText = JSON.stringify(original)
  const revisions = new Map<string, string>()
  storage.setItem(canonicalKey, originalText)
  for (const offset of [1000, 2000, 1000]) {
    const refreshed = resignedReceipt(offset), saved = { ...original, receipt: refreshed }, text = JSON.stringify(saved)
    storage.setItem(STUDIO_RECEIPT_KEY, text)
    const client = new StudioCoordinator(storage); client.restore(); client.clearSelection()
    assert.equal(storage.getItem(canonicalKey), originalText)
    const key = `${canonicalKey}:${refreshed.ticket.split('.')[1]}`, retained = storage.getItem(key)!
    assert.deepEqual(JSON.parse(retained), saved)
    if (revisions.has(key)) assert.equal(retained, revisions.get(key), 'Identical replay cannot rewrite a revision')
    revisions.set(key, retained)
  }
})

test('conflicting or corrupt receipt history blocks dismissal without DELETE or overwriting evidence', async () => {
  const refreshed = resignedReceipt(), saved = { receipt: refreshed, prompt: input.prompt, startedAt: receipt.createdAt }
  const canonicalKey = STUDIO_RECEIPT_HISTORY_PREFIX + id
  for (const existing of ['broken JSON', 'null', JSON.stringify({ receipt }),
    JSON.stringify({ ...saved, receipt: { ...receipt, ticket: receipt.ticket.replace('a'.repeat(64), 'd'.repeat(64)) } }),
    JSON.stringify({ ...saved, receipt: { ...refreshed, ticket: refreshed.ticket.replace('c'.repeat(64), 'd'.repeat(64)) } }),
  ]) {
    const storage = store(), selected = JSON.stringify(saved); let deletes = 0
    storage.setItem(canonicalKey, existing); storage.setItem(STUDIO_RECEIPT_KEY, selected)
    const client = new StudioCoordinator(storage, (async () => { deletes++; return Response.json({ cleared: true }) }) as typeof fetch)
    client.restore()
    await assert.rejects(client.dismissCurrent(), /receipt|history/i)
    assert.equal(deletes, 0); assert.equal(client.current?.receipt.ticket, refreshed.ticket)
    assert.equal(storage.getItem(canonicalKey), existing); assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), selected)
  }
})

test('an existing conflicting revision or failed history write cannot clear the cloud pointer', async () => {
  for (const failure of ['collision', 'throw', 'discard'] as const) {
    const storage = store(), refreshed = resignedReceipt(), original = { receipt, prompt: input.prompt, startedAt: receipt.createdAt }
    const saved = { ...original, receipt: refreshed }, canonicalKey = STUDIO_RECEIPT_HISTORY_PREFIX + id
    storage.setItem(canonicalKey, JSON.stringify(original)); storage.setItem(STUDIO_RECEIPT_KEY, JSON.stringify(saved))
    const revisionKey = `${canonicalKey}:${refreshed.ticket.split('.')[1]}`
    if (failure === 'collision') storage.setItem(revisionKey, 'conflicting existing history')
    else {
      storage.setItem = () => { if (failure === 'throw') throw new Error('History storage unavailable') }
    }
    let deletes = 0
    const client = new StudioCoordinator(storage, (async () => { deletes++; return Response.json({ cleared: true }) }) as typeof fetch)
    client.restore()
    await assert.rejects(client.dismissCurrent(), /receipt|history/i)
    assert.equal(deletes, 0); assert.equal(client.current?.receipt.id, id)
    assert.equal(storage.getItem(canonicalKey), JSON.stringify(original))
    assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), JSON.stringify(saved))
    if (failure === 'collision') assert.equal(storage.getItem(revisionKey), 'conflicting existing history')
  }
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

test('in-flight cloud discovery prevents a paid start and duplicate discovery from replacing the recovered receipt', async () => {
  const storage = store(), calls: string[] = []
  let finishLookup!: (value: Response) => void
  const pending = new Promise<Response>(resolve => { finishLookup = resolve })
  const client = new StudioCoordinator(storage, (async (url: string | URL | Request) => {
    calls.push(String(url))
    if (String(url) === '/api/studio/current') return pending
    if (String(url).endsWith('/prepare')) return Response.json({ ...receipt, id: '87654321-1234-4234-8234-123456789abc' })
    throw new Error('No paid submission is allowed while discovery is pending')
  }) as typeof fetch)
  const recovery = client.recoverCurrent()
  await assert.rejects(client.start(input, () => {}), /cloud recovery/)
  await assert.rejects(client.recoverCurrent(), /cloud recovery/)
  assert.deepEqual(calls, ['/api/studio/current'])
  finishLookup(Response.json({ current: { receipt, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'reserved' } }))
  assert.equal((await recovery)?.saved.receipt.id, id)
  assert.equal(client.current?.receipt.id, id)
  assert.equal(readSavedStudioJob(storage)?.receipt.id, id)
  assert.equal((await client.recoverCurrent())?.saved.receipt.id, id)
  assert.deepEqual(calls, ['/api/studio/current'])
})

test('malformed cloud discovery is never interpreted as a confirmed empty account and can be retried', async () => {
  for (const invalid of [null, [], 42, {}, { current: [] }, { current: {} }]) {
    const storage = store()
    let attempts = 0
    const client = new StudioCoordinator(storage, (async () => Response.json(++attempts === 1 ? invalid : { current: null })) as typeof fetch)
    await assert.rejects(client.recoverCurrent(), /cloud job recovery record is invalid/)
    assert.equal(client.current, null)
    assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), null)
    assert.equal(await client.recoverCurrent(), null)
    assert.equal(attempts, 2)
  }
})

test('aborted cloud discovery cannot overwrite a receipt saved by a newer page', async () => {
  const storage = store(), controller = new AbortController()
  let finishLookup!: (value: Response) => void, suppliedSignal: AbortSignal | null | undefined
  const pending = new Promise<Response>(resolve => { finishLookup = resolve })
  const client = new StudioCoordinator(storage, (async (_url, init) => { suppliedSignal = init?.signal; return pending }) as typeof fetch)
  const recovery = client.recoverCurrent('', controller.signal)
  controller.abort()
  assert.equal(suppliedSignal?.aborted, true, 'The caller signal reaches the request through the combined timeout signal')
  const replacement = JSON.stringify({ receipt: resignedReceipt(3000), prompt: 'Newer selection', startedAt: receipt.createdAt })
  storage.setItem(STUDIO_RECEIPT_KEY, replacement)
  finishLookup(Response.json({ current: { receipt, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'reserved' } }))
  await assert.rejects(recovery, { name: 'AbortError' })
  assert.equal(client.current, null)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), replacement)
})


test('safe failure codes survive cloud-only recovery and polling without exposing raw details', async () => {
  for (const code of ['ASTRA_COST_LIMIT', 'INVALID_MODEL_OUTPUT', 'STUDIO_TIMEOUT', 'ORACLE_JOB_FAILED', 'ORACLE_JOB_MISSING']) {
    const client = new StudioCoordinator(store(), (async () => Response.json({ current: {
      receipt, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'failed', failureCode: code, detail: 'PRIVATE_KEY',
    } })) as typeof fetch)
    const recovered = await client.recoverCurrent()
    const polled = parseStudioJob({ job: { id, state: 'failed', failureCode: code, detail: 'PRIVATE_KEY' } }, id)
    assert.equal(recovered?.job.failureCode, code)
    assert.equal(recovered?.job.detail, polled.detail)
    assert.match(polled.detail, /Reserved customer points were released/)
    assert.doesNotMatch(JSON.stringify(recovered), /PRIVATE_KEY/)
  }
  const unknown = parseStudioJob({ job: { id, state: 'failed', failureCode: 'PRIVATE_KEY', detail: 'PRIVATE_KEY' } }, id)
  assert.equal(unknown.failureCode, undefined)
  assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE_KEY/)
})
