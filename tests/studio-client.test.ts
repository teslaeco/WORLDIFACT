import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX, parseStudioJob, readSavedStudioJob, type ReceiptStore } from '../src/lib/studioClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
import { ADMISSION_FAILURE_CODES, ADMISSION_FAILURE_DETAILS, isAdmissionFailureCode } from '../src/lib/generationAdmission.ts'
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

test('reconciliation survives every valid job state without claiming a hold or refund', () => {
  for (const state of ['pending', 'queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled']) {
    const job = parseStudioJob({ job: { id, state, reconciliationRequired: true, downloadAllowed: false,
      previewOnly: true, previewAvailable: false, failureCode: 'ORACLE_JOB_FAILED', detail: 'PRIVATE_UPSTREAM_MESSAGE' } }, id)
    assert.equal(job.state, state)
    assert.equal(job.reconciliationRequired, true, state)
    assert.equal(job.downloadAllowed, false)
    assert.equal(job.previewOnly, true)
    assert.equal(job.previewAvailable, false)
    assert.equal(job.failureCode, state === 'failed' ? 'ORACLE_JOB_FAILED' : undefined)
    assert.match(job.detail, /same job/i)
    assert.doesNotMatch(job.detail, /points were released|credits remain reserved|PRIVATE_UPSTREAM_MESSAGE/i)
  }
})

test('reconciliation requires literal true and cannot validate another job or unknown state', () => {
  for (const reconciliationRequired of [undefined, false, null, 'true', 1, {}]) {
    const job = parseStudioJob({ job: { id, state: 'failed', reconciliationRequired, failureCode: 'STUDIO_TIMEOUT', downloadAllowed: false } }, id)
    assert.equal(job.reconciliationRequired, undefined)
    assert.equal(job.downloadAllowed, false)
    assert.match(job.detail, /maximum recovery window/i)
  }
  assert.throws(() => parseStudioJob({ job: { id: crypto.randomUUID(), state: 'succeeded', reconciliationRequired: true } }, id))
  assert.throws(() => parseStudioJob({ job: { id, state: 'published', reconciliationRequired: true } }, id))
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

function threeLargePhotoInput(): StudioInput {
  // Byte-sized normalized-JPEG protocol fixtures, not a generated/visual model test.
  const bytes = new Uint8Array(700_000)
  bytes.set([255,216,255,192,0,17,8,4,0,4,0,3,1,17,0,2,17,0,3,17,0])
  bytes.set([255,217],bytes.length - 2)
  const dataUrl = 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64')
  return { ...input, photos: (['front','left','right'] as const).map((view, i) => ({ name: `reference-${i}.jpg`, view, dataUrl, textureMaxSize: 4096 })) }
}

test('three large references are uploaded once while prepare carries only a bounded exact-digest manifest', async () => {
  const snapshot = threeLargePhotoInput(), requests: { path: string; body: string }[] = []
  const client = new StudioCoordinator(store(), (async (url, options) => {
    const path = String(url), body = String(options?.body)
    requests.push({ path, body })
    return path.endsWith('/prepare') ? Response.json(receipt) : Response.json({ job: { id, state: 'building' } })
  }) as typeof fetch)
  assert.equal((await client.start(snapshot, () => {})).state, 'building')
  assert.equal(requests.length, 2)
  const manifest = JSON.parse(requests[0].body), submitted = JSON.parse(requests[1].body)
  assert.equal(manifest.version, 'studio-prepare-v1'); assert.equal(manifest.photoCount, 3)
  assert.ok(requests[0].body.length < 1024)
  assert.doesNotMatch(requests[0].body, /data:image|dataUrl|reference-0/)
  assert.ok(requests[1].body.length > 2_000_000)
  assert.deepEqual(submitted, snapshot)
  const { inputDigest, validateStudioInput } = await import('../src/lib/studioProtocol.ts')
  assert.equal(manifest.inputDigest, await inputDigest(validateStudioInput(submitted)))
})

test('a slow single image upload has an explicit upload deadline rather than the old 45-second cap', async t => {
  const actualTimeout = AbortSignal.timeout.bind(AbortSignal), timeouts: number[] = [], signals = new WeakMap<AbortSignal, number>()
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); const signal = actualTimeout(ms); signals.set(signal, ms); return signal })
  const client = new StudioCoordinator(store(), (async (url, options) => {
    if (String(url).endsWith('/prepare')) return Response.json(receipt)
    assert.ok(String(options?.body).length > 2_000_000)
    // Deterministic virtual upload: 80 seconds would abort the previous 45s cap.
    const elapsedUploadMs = 80_000
    assert.ok(signals.get(options!.signal!)! > elapsedUploadMs)
    return Response.json({ job: { id, state: 'queued' } })
  }) as typeof fetch)
  assert.equal((await client.start(threeLargePhotoInput(), () => {})).state, 'queued')
  assert.deepEqual(timeouts, [90_000, 180_000])
})

test('suspended upload retains its receipt across reload and reports missing submission without a refund claim or automatic POST', async () => {
  const storage = store(), methods: string[] = []
  const fetcher = (async (url, options) => {
    const method = options?.method ?? 'GET'; methods.push(method)
    if (String(url).endsWith('/prepare')) return Response.json(receipt)
    if (method === 'POST') throw new DOMException('The user agent aborted the upload while suspended', 'AbortError')
    return Response.json({ job: { id, state: 'failed', failureCode: 'MISSING_SUBMISSION' } })
  }) as typeof fetch
  const started = new StudioCoordinator(storage, fetcher)
  assert.equal((await started.start(threeLargePhotoInput(), () => {})).state, 'pending')
  const restored = new StudioCoordinator(storage, fetcher); restored.restore()
  const missing = await restored.poll()
  assert.equal(missing.failureCode, 'MISSING_SUBMISSION')
  assert.doesNotMatch(missing.detail, /points were released|refund|worker.*failed/i)
  assert.deepEqual(methods, ['POST','POST','GET'])
  assert.equal(restored.current?.receipt.ticket, receipt.ticket)
})

test('an aborted status body is a recoverable connection error and never leaks the browser implementation message', async () => {
  const storage = store(); storage.setItem(STUDIO_RECEIPT_KEY, JSON.stringify({ receipt, prompt: input.prompt, startedAt: receipt.createdAt }))
  let interrupted = true, posts = 0
  const client = new StudioCoordinator(storage, (async (_url, options) => {
    if (options?.method === 'POST') posts++
    if (interrupted) return new Response(new ReadableStream({ start(controller) { controller.error(new DOMException('BodyStreamBuffer was aborted', 'AbortError')) } }), { headers: { 'Content-Type': 'application/json' } })
    return Response.json({ job: { id, state: 'building' } })
  }) as typeof fetch)
  client.restore()
  await assert.rejects(client.poll(), error => error instanceof Error && /connection was interrupted/.test(error.message) && !/BodyStreamBuffer/.test(error.message))
  interrupted = false
  assert.equal((await client.poll()).state, 'building')
  assert.equal(client.current?.receipt.id, id)
  assert.equal(posts, 0)
})


test('explicit admission failures keep safe codes through immediate rejection and reload without polling or resubmission', async () => {
  const cases = [[409,'ORACLE_BUSY'],[409,'STORAGE_FULL'],[409,'JOB_CAPACITY'],[429,'RATE_LIMITED'],[503,'STUDIO_ALLOWANCE_UNAVAILABLE'],
    ...ADMISSION_FAILURE_CODES.map(code => [429, code] as const)] as const
  for (const [status, failureCode] of cases) {
    const storage = store(), calls: string[] = []
    const client = new StudioCoordinator(storage, (async url => {
      calls.push(String(url))
      return String(url).endsWith('/prepare') ? Response.json(receipt) : Response.json({ error: 'PRIVATE_UPSTREAM_MESSAGE', failureCode }, { status })
    }) as typeof fetch)
    const rejected = await client.start(input, () => {})
    assert.equal(rejected.state, 'failed'); assert.equal(rejected.failureCode, failureCode)
    assert.doesNotMatch(rejected.detail, /PRIVATE_UPSTREAM_MESSAGE/)
    const restored = new StudioCoordinator(storage, (async () => { throw new Error('No further request expected') }) as typeof fetch)
    restored.restore()
    const recovered = await restored.poll()
    assert.deepEqual(recovered, rejected)
    assert.deepEqual(calls, ['/api/studio/prepare','/api/studio/jobs'])
    assert.equal(readSavedStudioJob(storage)?.rejectionCode, failureCode)
    if (isAdmissionFailureCode(failureCode)) {
      assert.equal(rejected.detail, ADMISSION_FAILURE_DETAILS[failureCode])
      assert.match(rejected.detail, failureCode === 'ACCOUNT_REQUEST_CONFLICT'
        ? /No new Oracle submission or points reservation was made/
        : /No Oracle generation was submitted and no points were reserved for this request; no automatic retry/)
      assert.doesNotMatch(rejected.detail, /refund|released/i)
    }
  }
})

test('account admission diagnostics remain allowlisted and distinct from submitted model failures', () => {
  for (const failureCode of ADMISSION_FAILURE_CODES) {
    assert.equal(isAdmissionFailureCode(failureCode), true)
    const job = parseStudioJob({ job: { id, state: 'failed', failureCode, detail: 'PRIVATE_LEDGER_VALUE' } }, id)
    assert.equal(job.failureCode, failureCode)
    assert.equal(job.detail, ADMISSION_FAILURE_DETAILS[failureCode])
    assert.doesNotMatch(job.detail, /PRIVATE_LEDGER_VALUE/)
  }
  for (const value of [undefined, null, 429, {}, ['CREDITS_EXHAUSTED'], 'PRIVATE_LEDGER_VALUE', 'toString', 'ASTRA_COST_LIMIT'])
    assert.equal(isAdmissionFailureCode(value), false)
  const unknown = parseStudioJob({ job: { id, state: 'failed', failureCode: 'PRIVATE_LEDGER_VALUE' } }, id)
  assert.equal(unknown.failureCode, undefined)
  assert.doesNotMatch(unknown.detail, /PRIVATE_LEDGER_VALUE/)
})

test('versioned extended receipt confirms pricing before submission and retains it through local and cloud recovery', async () => {
  const { STUDIO_PRICING, STUDIO_PRICING_REVISION } = await import('../src/lib/studioPricing.ts')
  const extended: StudioInput = { ...input, pricingRevision: STUDIO_PRICING_REVISION, budgetTier: 'extended', acceptedPoints: 500 }
  const storage = store(), calls: string[] = []
  const fake = (async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (String(url).endsWith('/prepare')) return Response.json({ ...receipt, pricing: STUDIO_PRICING.extended })
    if (String(url).endsWith('/current')) return Response.json({ current: { receipt: { ...receipt, pricing: STUDIO_PRICING.extended }, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'reserved', pricing: STUDIO_PRICING.extended } })
    return Response.json({ job: { id, state: 'building', pricing: STUDIO_PRICING.extended } })
  }) as typeof fetch
  const client = new StudioCoordinator(storage, fake)
  await client.start(extended, saved => assert.deepEqual(saved.pricing, STUDIO_PRICING.extended))
  const restored = new StudioCoordinator(storage, fake)
  assert.deepEqual(restored.restore()?.pricing, STUDIO_PRICING.extended)
  assert.deepEqual((await restored.poll()).pricing, STUDIO_PRICING.extended)
  const cloud = new StudioCoordinator(store(), fake), recovered = await cloud.recoverCurrent()
  assert.deepEqual(recovered?.saved.pricing, STUDIO_PRICING.extended)
  assert.deepEqual(recovered?.job.pricing, STUDIO_PRICING.extended)
  assert.equal(calls.filter(call => call === 'POST /api/studio/jobs').length, 1)
  for (const pricing of [undefined, STUDIO_PRICING.standard]) {
    let submitted = false
    const mismatch = new StudioCoordinator(store(), (async (url) => {
      if (String(url).endsWith('/prepare')) return Response.json({ ...receipt, pricing })
      submitted = true; return Response.json({ job: { id, state: 'building' } })
    }) as typeof fetch)
    await assert.rejects(mismatch.start(extended, () => {}), /did not confirm your selected model budget/)
    assert.equal(submitted, false)
  }
})
