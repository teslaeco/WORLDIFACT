import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateJob, validatePlan, estimatedGpuEnvelope, fingerprint, submitGpu, readGpuStatus, planWithAstra, PLANNER_MODEL, type Job } from '../server/runpodPipeline.ts'
import { DurableDispatchJournal, type Transaction, type TransactionalStorage } from '../server/runpodJournal.ts'
const f = JSON.parse(await readFile(new URL('./fixtures/runpod/contract.json', import.meta.url), 'utf8'))
const job = (): Job => structuredClone(f.job)
const env = { ENABLE_RUNPOD_PIPELINE: 'true', RUNPOD_ENDPOINT_ID: 'fixture123', RUNPOD_API_KEY: 'fixture-only-never-a-real-secret', OPENAI_API_KEY: 'fixture-only' }
function memoryStore(): TransactionalStorage {
  const data = new Map<string, unknown>(); let tail = Promise.resolve()
  const tx: Transaction = { get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined, put: async <T>(key: string, value: T) => { data.set(key, structuredClone(value)) } }
  return { ...tx, transaction: async <T>(fn: (t: Transaction) => Promise<T>) => {
    let release: () => void = () => {}; const prior = tail; tail = new Promise<void>(resolve => { release = resolve })
    await prior
    const snapshot = new Map(data)
    try { return await fn(tx) } catch (e) { data.clear(); for (const [k, v] of snapshot) data.set(k, v); throw e } finally { release() }
  } }
}
function journal(limit = 2_000_000) { return new DurableDispatchJournal(memoryStore(), f.job.scope, limit, () => f.nowMs) }
const response = (v: unknown) => Response.json(v)

test('server and worker share the same immutable job fingerprint', async () => {
  const x = job(); assert.deepEqual(validateJob(x, f.nowMs), x)
  assert.equal(await fingerprint(x), f.fingerprint)
  const keysReordered = Object.fromEntries(Object.entries(x).reverse()) as Job
  assert.equal(await fingerprint(keysReordered), f.fingerprint)
  assert.equal(estimatedGpuEnvelope(x.budget, f.nowMs), 185_000)
})
test('source ownership, strict plan and budget are not controlled by LLM fields', () => {
  const x = job(); x.reference.key = 'jobs/other-owner/reference.png'
  assert.throws(() => validateJob(x, f.nowMs), /INVALID_SOURCE_OBJECT/)
  assert.throws(() => validatePlan({ ...job().plan, exec: 'shell code' }), /INVALID_CHARACTER_PLAN/)
  const y = job(); y.planner.referenceSha256 = 'b'.repeat(64)
  assert.throws(() => validateJob(y, f.nowMs), /PLANNER_PROVENANCE_MISMATCH/)
  assert.throws(() => estimatedGpuEnvelope({ ...x.budget, maxGpuMicroUsd: 100 }, f.nowMs), /GPU_BUDGET_EXCEEDED/)
  assert.throws(() => estimatedGpuEnvelope({ ...x.budget, expiresAt: f.nowMs - 1 }, f.nowMs), /INVALID_OR_EXPIRED_BUDGET/)
  assert.throws(() => estimatedGpuEnvelope({ ...x.budget, expiresAt: f.nowMs + 1000 }, f.nowMs), /INSUFFICIENT_JOB_TTL/)
})
test('disabled default starts no paid API or journal transaction', async () => {
  let calls = 0
  await assert.rejects(submitGpu({}, job(), journal(), async () => { calls++; throw Error('network forbidden') }, f.nowMs), /RUNPOD_PIPELINE_DISABLED/)
  assert.equal(calls, 0)
})
test('one async POST with limits; duplicate and concurrent clicks never submit again', async () => {
  let posts = 0; const j = journal()
  const fake: typeof fetch = async (url, init) => {
    posts++; assert.equal(String(url), 'https://api.runpod.ai/v2/fixture123/run')
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error')
    const body = JSON.parse(String(init?.body)); assert.equal(body.policy.executionTimeout, 120000)
    assert.equal(body.policy.ttl, 600000); assert.deepEqual(body.input, job()); assert.equal(body.webhook, undefined)
    return response({ id: 'runpod-fixture-job', status: 'IN_QUEUE' })
  }
  const results = await Promise.all([submitGpu(env, job(), j, fake, f.nowMs), submitGpu(env, job(), j, fake, f.nowMs)])
  assert.equal(posts, 1); assert.equal(results.filter(x => x.state === 'QUEUED').length, 1)
  assert.equal((await j.record(f.job.scope, f.job.jobId))?.providerId, 'runpod-fixture-job')
})
test('uncertain POST is durable: retries and reloads do not repeat billing-capable calls', async () => {
  const j = journal(); let calls = 0
  const fake: typeof fetch = async () => { calls++; throw Error('secret-sensitive-upstream-message') }
  const first = await submitGpu(env, job(), j, fake, f.nowMs)
  assert.equal(first.state, 'SUBMISSION_UNKNOWN_RECONCILE_BEFORE_RETRY')
  assert.equal((await j.record(f.job.scope, f.job.jobId))?.state, 'UNKNOWN')
  assert.equal((await submitGpu(env, job(), j, fake, f.nowMs)).state, 'EXISTING_JOB_USE_STORED_STATUS')
  assert.equal(calls, 1); assert.ok(!JSON.stringify(first).includes('secret-sensitive'))
})
test('same ID changed source/settings conflicts; daily exposure cannot exceed limit', async () => {
  const j = journal(1_000_000)
  const fake: typeof fetch = async () => response({ id: 'runpod-fixture-job', status: 'IN_QUEUE' })
  await submitGpu(env, job(), j, fake, f.nowMs)
  const altered = job(); altered.settings.seed++
  await assert.rejects(submitGpu(env, altered, j, fake, f.nowMs), /JOB_INPUT_CONFLICT/)
  const another = job(); another.jobId = '22222222-2222-4222-8222-222222222222'
  for (const key of ['reference', 'mask'] as const) another[key].key = another[key].key.replace(f.job.jobId, another.jobId)
  await assert.rejects(submitGpu(env, another, j, fake, f.nowMs), /DAILY_GPU_EXPOSURE_LIMIT/)
})
test('cross-tenant journal access is refused', async () => {
  await assert.rejects(journal().record('b'.repeat(64), f.job.jobId), /JOURNAL_SCOPE_MISMATCH/)
})
test('status is GET-only and never publishes unverified files or upstream errors', async () => {
  let calls = 0
  const result = await readGpuStatus(env, 'runpod-fixture-job', 'fixture123', async (url, init) => {
    calls++; assert.equal(init?.method, 'GET'); assert.equal(String(url), 'https://api.runpod.ai/v2/fixture123/status/runpod-fixture-job')
    return response({ id: 'runpod-fixture-job', status: 'COMPLETED', executionTime: 60000, delayTime: 23000,
      output: { url: 'https://evil.example/file', token: 'sensitive' } })
  })
  assert.equal(calls, 1); assert.deepEqual(result, { status: 'COMPLETED', requiresArtifactVerification: true, executionMs: 60000, queueMs: 23000 })
  await assert.rejects(readGpuStatus(env, '../evil', 'fixture123'), /INVALID_STORED_PROVIDER_JOB/)
})
test('mismatched status ID and oversized response never become completed results', async () => {
  await assert.rejects(readGpuStatus(env, 'runpod-fixture-job', 'fixture123', async () => response({ id: 'another', status: 'COMPLETED' })), /INVALID_RUNPOD_STATUS/)
  await assert.rejects(readGpuStatus(env, 'runpod-fixture-job', 'fixture123', async () => response({ huge: 'x'.repeat(300000) })), /PROVIDER_RESPONSE_TOO_LARGE/)
})
test('Astra sees original image, uses strict JSON and records usage; no tool code runs', async () => {
  let calls = 0; let claimed = false; let receipt = false
  const result = await planWithAstra(env, 'Rebuild reference robot', `data:image/png;base64,${f.referenceBase64}`, f.job.reference.sha256, {
    claim: async (sha, model, tokens) => { assert.equal(sha, f.job.reference.sha256); assert.equal(model, PLANNER_MODEL); assert.equal(tokens, 2400); claimed = true; return true },
    receipt: async (id) => { assert.equal(id, 'resp_fixture'); receipt = true }, uncertain: async () => { throw Error('should not be uncertain') },
  }, async (url, init) => {
    calls++; assert.ok(claimed); assert.equal(String(url), 'https://api.openai.com/v1/responses')
    const body = JSON.parse(String(init?.body)); assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
    assert.equal(body.model, PLANNER_MODEL); assert.equal(body.tools, undefined)
    return response({ id: 'resp_fixture', model: PLANNER_MODEL, status: 'completed', usage: { input_tokens: 123, output_tokens: 45 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(f.job.plan) }] }] })
  })
  assert.equal(calls, 1); assert.ok(receipt); assert.deepEqual(result.plan, f.job.plan)
})
test('Astra budget denial and changed reference produce zero requests', async () => {
  let calls = 0
  const p = { claim: async () => false, receipt: async () => {}, uncertain: async () => {} }
  const fake: typeof fetch = async () => { calls++; throw Error('must not run') }
  await assert.rejects(planWithAstra(env, 'robot', `data:image/png;base64,${f.referenceBase64}`, 'b'.repeat(64), p, fake), /REFERENCE_IMAGE_CHANGED/)
  await assert.rejects(planWithAstra(env, 'robot', `data:image/png;base64,${f.referenceBase64}`, f.job.reference.sha256, p, fake), /PLANNING_BUDGET_NOT_GRANTED/)
  assert.equal(calls, 0)
})
test('Astra refusal or malformed JSON terminates without repeat or GPU fallback', async () => {
  let calls = 0; let uncertain = 0
  await assert.rejects(planWithAstra(env, 'robot', `data:image/png;base64,${f.referenceBase64}`, f.job.reference.sha256, {
    claim: async () => true, receipt: async () => {}, uncertain: async () => { uncertain++ },
  }, async () => { calls++; return response({ id: 'resp_fixture', model: PLANNER_MODEL, status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }) }), /PLANNER_FAILED_NO_AUTOMATIC_RETRY/)
  assert.equal(calls, 1); assert.equal(uncertain, 1)
})

test('artifact manifest rejects cross-user keys, duplicates and fake manufacturing approval', async () => {
  const { validateWorkerReceipt } = await import('../server/runpodPipeline.ts')
  const j = job(); const prefix = `jobs/${j.scope}/${j.jobId}/`
  const names = ['raw/decoder.npz', 'raw/original.glb', 'raw/engine.json', 'outputs/game.glb', 'outputs/source.blend', 'outputs/qa.json',
    ...['front', 'three_quarter', 'side', 'back'].flatMap(v => [`outputs/pbr_${v}.png`, `outputs/clay_${v}.png`])]
  const receipt = { revision: j.revision, jobId: j.jobId, fingerprint: await fingerprint(j), state: 'REVIEW_REQUIRED', referenceSha256: j.reference.sha256,
    planner: j.planner, geometryEngine: 'microsoft/TRELLIS.2-4B', visualAccepted: false, printReady: false, supplierAccepted: false,
    artifacts: names.map(n => ({ key: prefix + n, bytes: 100, sha256: 'b'.repeat(64), mime: n.endsWith('.glb') ? 'model/gltf-binary' : n.endsWith('.png') ? 'image/png' : n.endsWith('.json') ? 'application/json' : 'application/octet-stream' })) }
  assert.equal((await validateWorkerReceipt(receipt, j)).files.length, 14)
  await assert.rejects(validateWorkerReceipt({ ...receipt, printReady: true }, j), /INVALID_WORKER_RECEIPT/)
  const bad = structuredClone(receipt); bad.artifacts[0].key = 'jobs/other-account/source.blend'
  await assert.rejects(validateWorkerReceipt(bad, j), /INVALID_ARTIFACT_REFERENCE/)
  const dup = structuredClone(receipt); dup.artifacts[1] = dup.artifacts[0]
  await assert.rejects(validateWorkerReceipt(dup, j), /INVALID_ARTIFACT_REFERENCE/)
})
