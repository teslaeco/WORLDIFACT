import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { AccountEntitlements, entitlementCall, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { blueprintReservationMicroUsd, MODEL_CATALOG, type BlueprintModel } from '../src/lib/modelCatalog.ts'
import { readGenerationFundingSnapshot } from '../src/lib/generationFunding.ts'

const origin = 'https://worldifact.test', user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const providerKey = 'provider-budget-cents:v1'
async function fixture() {
  const values = new Map<string, unknown>()
  let queue: Promise<unknown> = Promise.resolve(), generationCalls = 0, fault = ''
  let providerBody: Record<string, unknown> | undefined, providerStatus = 200, timeout = false
  let afterAccount: ((path: string, response: Response) => Promise<Response>) | undefined
  const storageFor = (data: Map<string, unknown>): EntitlementStorage => ({
    async get<T>(key: string) { if (fault === 'provider-read' && key === providerKey) throw new Error('Inert provider read failure'); return structuredClone(data.get(key)) as T | undefined },
    async put(key, value) { if (fault === key || fault === 'job' && key.startsWith('job:')) throw new Error('Inert write failure'); data.set(key, structuredClone(value)) },
    async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      return new Map([...data].sort(([a], [b]) => a.localeCompare(b)).filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter)).slice(0, options.limit)) as Map<string, T>
    },
    transaction<T>(callback: (tx: EntitlementStorage) => Promise<T>) {
      const run = queue.then(async () => { const staged = structuredClone(data); const result = await callback(storageFor(staged)); data.clear(); for (const [key, value] of staged) data.set(key, value); return result })
      queue = run.catch(() => undefined); return run
    },
  })
  const env: Env = {
    OPENAI_API_KEY: 'fixture-only', OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6.1-sol', ENABLE_PAID_GENERATION: 'true',
    ENABLE_ASTRA_PLANS: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch() { return Response.json({ allowed: true }) } }) },
  }
  let ledger = new AccountEntitlements({ storage: storageFor(values) }, env)
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: () => ({ async fetch(request: Request) {
    const path = new URL(request.url).pathname, response = await ledger.fetch(request)
    return afterAccount ? afterAccount(path, response) : response
  } }) }
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: user, email: 'fixture@example.test' })
    if (path === '/v1/responses/input_tokens') return Response.json({ object: 'response.input_tokens', input_tokens: 1000 })
    assert.equal(path, '/v1/responses'); generationCalls++
    if (timeout) throw new DOMException('Inert provider timeout', 'TimeoutError')
    const model = JSON.parse(String(init?.body)).model, blueprint = demoBlueprint('A silver research tower')
    return Response.json(providerBody ?? { id: 'resp_fairness_fixture', model, status: 'completed', usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec: assetSpecForBlueprint(blueprint) }) }] }] }, { status: providerStatus })
  }) as typeof fetch
  await entitlementCall(env, user, '/grant', { id: 'in_fairness', credits: 4500, subscriptionId: 'sub_Fairness' })
  await entitlementCall(env, user, '/subscription', { id: 'sub_Fairness', active: true, until: Date.now() + 86400000, revision: 1, plan: 'pro', grantId: 'in_fairness' })
  const call = (model: BlueprintModel = 'sol', seed: string = crypto.randomUUID(), extra = {}) => handle(new Request(origin + '/api/blueprint', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: '__Host-worldifact-access=fixture-token', 'X-WORLDIFACT-Request': seed },
    body: JSON.stringify({ worldId: 'ai-game-lab', mode: 'live', model, providerModel: MODEL_CATALOG[model].model, prompt: 'A silver research tower', ...extra }),
  }), env, fetcher)
  return { env, values, call, generationCalls: () => generationCalls, funding: () => Number(values.get(providerKey)),
    provider: (body: Record<string, unknown>, status = 200) => { providerBody = body; providerStatus = status }, timeout: () => { timeout = true },
    fault: (key: string) => { fault = key }, afterAccount: (hook: typeof afterAccount) => { afterAccount = hook },
    restart: () => { ledger = new AccountEntitlements({ storage: storageFor(values) }, env) },
  }
}

for (const [label, mutate] of [
  ['missing usage', (body: Record<string, unknown>) => { delete body.usage }],
  ['null usage', (body: Record<string, unknown>) => { body.usage = null }],
  ['partial usage', (body: Record<string, unknown>) => { body.usage = { input_tokens: 1000 } }],
  ['negative usage', (body: Record<string, unknown>) => { body.usage = { input_tokens: -1, output_tokens: 100, total_tokens: 99 } }],
  ['fractional usage', (body: Record<string, unknown>) => { body.usage = { input_tokens: 1000.5, output_tokens: 100, total_tokens: 1100.5 } }],
  ['string usage', (body: Record<string, unknown>) => { body.usage = { input_tokens: '1000', output_tokens: 100, total_tokens: 1100 } }],
  ['long context', (body: Record<string, unknown>) => { body.usage = { input_tokens: 32769, output_tokens: 100, total_tokens: 32869 } }],
  ['over ceiling output', (body: Record<string, unknown>) => { body.usage = { input_tokens: 1000, output_tokens: 4001, total_tokens: 5001 } }],
  ['wrong total', (body: Record<string, unknown>) => { body.usage = { input_tokens: 1000, output_tokens: 100, total_tokens: 1 } }],
  ['wrong exact model', (body: Record<string, unknown>) => { body.model = 'gpt-6-sol-snapshot' }],
  ['missing response ID', (body: Record<string, unknown>) => { delete body.id }],
  ['invalid response ID', (body: Record<string, unknown>) => { body.id = 'private provider output' }],
  ['unknown status', (body: Record<string, unknown>) => { body.status = 'failed' }],
  ['nonterminal status', (body: Record<string, unknown>) => { body.status = 'in_progress' }],
  ['completed status with incomplete details', (body: Record<string, unknown>) => { body.incomplete_details = { reason: 'max_output_tokens' } }],
  ['incomplete without reason', (body: Record<string, unknown>) => { body.status = 'incomplete' }],
  ['incomplete other reason', (body: Record<string, unknown>) => { body.status = 'incomplete'; body.incomplete_details = { reason: 'content_filter' } }],
  ['provider error', (body: Record<string, unknown>) => { body.error = { message: 'Inert ambiguous error' } }],
  ['priority service tier', (body: Record<string, unknown>) => { body.service_tier = 'priority' }],
  ['auto service tier', (body: Record<string, unknown>) => { body.service_tier = 'auto' }],
  ['wrong-type service tier', (body: Record<string, unknown>) => { body.service_tier = { default: true } }],
] as const) test(`${label} preserves unknown provider liability and refunds points`, async () => {
  const f = await fixture(), before = f.funding(), body = failedResponse('sol') as Record<string, unknown>, seed = crypto.randomUUID()
  mutate(body); f.provider(body)
  assert.equal((await f.call('sol', seed)).status, 502)
  assert.equal(f.funding(), before - 35); assert.equal(f.values.get('balance'), 4500)
  assert.equal(Object.hasOwn(f.values.get('job:' + await blueprintRequestId(seed)) as object, 'blueprintProviderReconciliation'), false)
})

for (const status of [429, 500]) test(`HTTP ${status} never authenticates even plausible terminal usage`, async () => {
  const f = await fixture(), before = f.funding()
  f.provider(failedResponse('astra'), status)
  assert.equal((await f.call('astra')).status, status === 429 ? 429 : 502)
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - 175)
})
test('provider transport uncertainty retains the full cap with no retry', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID(); f.timeout()
  assert.equal((await f.call('sol', seed)).status, 502)
  assert.equal((await f.call('sol', seed)).status, 409)
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - 35); assert.equal(f.generationCalls(), 1)
})
test('browser-provided usage is rejected before reservation or dispatch', async () => {
  const f = await fixture(), before = structuredClone([...f.values])
  assert.equal((await f.call('sol', crypto.randomUUID(), { blueprintTerminalUsage: failedResponse('sol') })).status, 400)
  assert.deepEqual([...f.values], before); assert.equal(f.generationCalls(), 0)
})
test('a successful response preserves debit, result, and replay behavior without failed reconciliation', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID(), response = await f.call('astra', seed)
  assert.equal(response.status, 200); const result = await response.json()
  assert.deepEqual(await (await f.call('astra', seed)).json(), result)
  assert.equal(f.values.get('balance'), 4250); assert.equal(f.funding(), before - 175); assert.equal(f.generationCalls(), 1)
  const job = f.values.get('job:' + await blueprintRequestId(seed)) as Record<string, unknown>
  assert.equal(job.state, 'completed'); assert.equal(Object.hasOwn(job, 'blueprintProviderReconciliation'), false)
})

async function claimed(f: Awaited<ReturnType<typeof fixture>>, model: BlueprintModel = 'sol') {
  const id = crypto.randomUUID(), fingerprint = 'a'.repeat(64)
  await entitlementCall(f.env, user, '/reserve', { id, fingerprint, channel: 'blueprint', profile: model === 'astra' ? 'slow' : 'fast', model, blueprintDispatch: 'fenced-v1', providerModel: MODEL_CATALOG[model].model })
  const claim = await entitlementCall<{ dispatch: boolean; deadline: number }>(f.env, user, '/blueprint-dispatch', { id, fingerprint })
  assert.equal(claim.dispatch, true)
  const proof: Record<string, unknown> = { revision: 'blueprint-terminal-usage-v1', accountId: user, requestId: id, fingerprint, model: MODEL_CATALOG[model].model,
    dispatchDeadline: claim.deadline, dispatchedAt: Date.now(), receivedAt: Date.now(), maxOutputTokens: 4000, reservedCents: MODEL_CATALOG[model].maxProviderCents,
    providerResponseId: 'resp_claimed_fixture', providerStatus: 'completed', incompleteReason: null, inputTokens: 1000, outputTokens: 100, totalTokens: 1100 }
  const settle = (evidence = proof, state = 'failed') => entitlementCall<Record<string, unknown>>(f.env, user, '/settle', { id, state, blueprintTerminalUsage: evidence })
  return { id, fingerprint, proof, settle }
}
test('failed settlement refunds once across concurrent replay, restart and a contradictory completed call', async () => {
  const f = await fixture(), before = f.funding(), c = await claimed(f)
  const replies = await Promise.all(Array.from({ length: 12 }, () => c.settle()))
  assert.equal(replies.filter(reply => reply.repeated === false).length, 1)
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - 2)
  const stored = structuredClone([...f.values]); f.restart(); assert.equal((await c.settle()).repeated, true)
  await entitlementCall(f.env, user, '/settle', { id: c.id, state: 'completed' })
  assert.deepEqual([...f.values], stored)
  assert.equal((await entitlementCall<{ dispatch: boolean }>(f.env, user, '/blueprint-dispatch', { id: c.id, fingerprint: c.fingerprint })).dispatch, false)
})

for (const [label, mutate] of [
  ['wrong account', (p: Record<string, unknown>) => { p.accountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
  ['wrong request', (p: Record<string, unknown>) => { p.requestId = crypto.randomUUID() }],
  ['wrong fingerprint', (p: Record<string, unknown>) => { p.fingerprint = 'b'.repeat(64) }],
  ['wrong model', (p: Record<string, unknown>) => { p.model = 'gpt-6-astra' }],
  ['old Sol model on a new Sol 6.1 job', (p: Record<string, unknown>) => { p.model = 'gpt-6-sol' }],
  ['wrong deadline', (p: Record<string, unknown>) => { p.dispatchDeadline = Number(p.dispatchDeadline) + 1 }],
  ['expired dispatch', (p: Record<string, unknown>) => { p.dispatchedAt = p.dispatchDeadline; p.receivedAt = p.dispatchDeadline }],
  ['before reservation', (p: Record<string, unknown>) => { p.dispatchedAt = 1 }],
  ['before dispatch response', (p: Record<string, unknown>) => { p.receivedAt = Number(p.dispatchedAt) - 1 }],
  ['future response', (p: Record<string, unknown>) => { p.receivedAt = Date.now() + 3600000 }],
  ['wrong reservation cap', (p: Record<string, unknown>) => { p.reservedCents = 175 }],
  ['wrong output ceiling', (p: Record<string, unknown>) => { p.maxOutputTokens = 5000 }],
  ['unknown receipt field', (p: Record<string, unknown>) => { p.extra = true }],
  ['wrong proof revision', (p: Record<string, unknown>) => { p.revision = 'unknown' }],
  ['missing proof field', (p: Record<string, unknown>) => { delete p.totalTokens }],
] as const) test(`${label} cannot replenish ordinary provider funding`, async () => {
  const f = await fixture(), c = await claimed(f), before = f.funding(); mutate(c.proof)
  await c.settle()
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before)
  assert.equal(Object.hasOwn(f.values.get('job:' + c.id) as object, 'blueprintProviderReconciliation'), false)
})

for (const field of ['blueprintProviderReservation', 'blueprintDispatch', 'supportApprovalId', 'supplementalGrantId', 'repairedMccGrantId', 'projectBudget'])
  test(`${field} without exact ordinary dispatch provenance cannot release claimed funding`, async () => {
    const f = await fixture(), c = await claimed(f), before = f.funding(), job = f.values.get('job:' + c.id) as Record<string, unknown>
    if (field === 'blueprintProviderReservation' || field === 'blueprintDispatch') delete job[field]
    else job[field] = { inert: true }
    await c.settle(); assert.equal(f.funding(), before); assert.equal(f.values.get('balance'), 4500)
  })

test('terminal usage cannot turn completed settlement into a failed refund', async () => {
  const f = await fixture(), c = await claimed(f)
  await entitlementCall(f.env, user, '/settle', { id: c.id, state: 'completed' })
  const stored = structuredClone([...f.values]); await c.settle(); assert.deepEqual([...f.values], stored)
  await assert.rejects(c.settle(c.proof, 'completed'))
  assert.deepEqual([...f.values], stored)
})
for (const first of ['completed', 'failed']) test(`${first} wins concurrent opposite terminal settlement without contradicting points or result`, async () => {
  const f = await fixture(), before = f.funding(), c = await claimed(f), blueprint = demoBlueprint('An inert terminal race tower')
  const blueprintSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(blueprint)))), n => n.toString(16).padStart(2, '0')).join('')
  const result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: c.id, model: 'gpt-6.1-sol',
    limitation: 'Inert terminal race fixture', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_claimed_fixture', receivedAt: new Date().toISOString(), blueprintSha256, inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } }
  const complete = () => entitlementCall(f.env, user, '/blueprint-complete', { id: c.id, result })
  await Promise.all(first === 'completed' ? [complete(), c.settle()] : [c.settle(), complete()])
  assert.equal((f.values.get('job:' + c.id) as { state: string }).state, first)
  assert.equal(f.values.get('balance'), first === 'completed' ? 4450 : 4500)
  assert.equal(f.funding(), before - (first === 'completed' ? 35 : 2))
  assert.equal(f.values.has('blueprint-result:' + c.id), first === 'completed')
})
test('an earlier failed settlement permanently wins over later authenticated usage', async () => {
  const f = await fixture(), c = await claimed(f)
  await entitlementCall(f.env, user, '/settle', { id: c.id, state: 'failed' })
  const stored = structuredClone([...f.values]); await c.settle(); assert.deepEqual([...f.values], stored)
})
test('a valid terminal response arriving after dispatch deadline remains eligible', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date'], now })
  const f = await fixture(), before = f.funding(), c = await claimed(f, 'astra')
  t.mock.timers.setTime(now + 45000); c.proof.receivedAt = Date.now()
  await c.settle(); assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - 5)
})
test('timeout recovery just after a late dispatch wins without late evidence backfill', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date'], now })
  const f = await fixture(), id = crypto.randomUUID(), fingerprint = 'a'.repeat(64)
  await entitlementCall(f.env, user, '/reserve', { id, fingerprint, channel: 'blueprint', profile: 'slow', model: 'astra', blueprintDispatch: 'fenced-v1' })
  t.mock.timers.setTime(now + 599000)
  const claim = await entitlementCall<{ deadline: number }>(f.env, user, '/blueprint-dispatch', { id, fingerprint })
  t.mock.timers.setTime(now + 600001)
  assert.equal((await entitlementCall<{ state: string }>(f.env, user, '/blueprint-status', { id })).state, 'failed')
  const stored = structuredClone([...f.values])
  await entitlementCall(f.env, user, '/settle', { id, state: 'failed', blueprintTerminalUsage: {
    revision: 'blueprint-terminal-usage-v1', accountId: user, requestId: id, fingerprint, model: 'gpt-6-astra', dispatchDeadline: claim.deadline,
    dispatchedAt: now + 599000, receivedAt: Date.now(), maxOutputTokens: 4000, reservedCents: 175, providerResponseId: 'resp_late',
    providerStatus: 'completed', incompleteReason: null, inputTokens: 1000, outputTokens: 100, totalTokens: 1100,
  } })
  assert.deepEqual([...f.values], stored); assert.equal(f.values.get('balance'), 4500)
})

for (const fault of ['balance', 'job', providerKey]) test(`${fault} failure rolls points, proof and provider credit back together`, async () => {
  const f = await fixture(), c = await claimed(f), before = structuredClone([...f.values])
  f.fault(fault); await assert.rejects(c.settle()); assert.deepEqual([...f.values], before)
  f.fault(''); assert.equal((await c.settle()).repeated, false)
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), 3150 - 2)
})
for (const invalid of [undefined, '3115', Number.MAX_SAFE_INTEGER, NaN]) test(`invalid provider ledger ${String(invalid)} cannot block the points refund or be reseeded`, async () => {
  const f = await fixture(), c = await claimed(f)
  if (invalid === undefined) f.values.delete(providerKey); else f.values.set(providerKey, invalid)
  await c.settle()
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.values.get(providerKey), invalid)
  assert.equal(f.values.has(providerKey), invalid !== undefined)
  assert.equal(Object.hasOwn(f.values.get('job:' + c.id) as object, 'blueprintProviderReconciliation'), false)
})
test('optional provider read failure preserves the existing points refund and unknown liability', async () => {
  const f = await fixture(), c = await claimed(f), before = f.funding(); f.fault('provider-read')
  await c.settle()
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before)
  assert.equal(Object.hasOwn(f.values.get('job:' + c.id) as object, 'blueprintProviderReconciliation'), false)
})
test('lost settlement acknowledgement cannot double refund or redispatch', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID(); f.provider(failedResponse('sol'))
  f.afterAccount(async (path, result) => { if (path === '/settle') throw new Error('Inert lost acknowledgement'); return result })
  assert.equal((await f.call('sol', seed)).status, 502)
  assert.equal((await f.call('sol', seed)).status, 409)
  assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - 2); assert.equal(f.generationCalls(), 1)
})
test('lost successful completion acknowledgement keeps the completed debit and saved result', async () => {
  const f = await fixture(), before = f.funding(), seed = crypto.randomUUID()
  f.afterAccount(async (path, result) => { if (path === '/blueprint-complete') throw new Error('Inert lost completion acknowledgement'); return result })
  assert.equal((await f.call('sol', seed)).status, 502)
  assert.equal(f.values.get('balance'), 4450); assert.equal(f.funding(), before - 35)
  assert.equal((await f.call('sol', seed)).status, 200); assert.equal(f.generationCalls(), 1)
})
test('verified failed usage is known to the read-only snapshot and excluded from completed recovery', async () => {
  const f = await fixture(), c = await claimed(f); await c.settle()
  const stored = structuredClone([...f.values])
  const snapshot = readGenerationFundingSnapshot(await entitlementCall(f.env, user, '/generation-funding'))
  assert.equal(snapshot.jobs.evidence.markedReconciled, 1); assert.equal(snapshot.jobs.evidence.ordinaryCompletedBlueprintPending, 0)
  assert.equal(snapshot.jobs.fundingEvidence.unknownAmountRecords, 0); assert.equal(snapshot.jobs.fundingEvidence.unresolvedOrdinaryReservations.records, 0)
  assert.equal((await entitlementCall<{ reconciled: boolean }>(f.env, user, '/reconcile-blueprint-provider', { id: c.id })).reconciled, false)
  assert.deepEqual([...f.values], stored)
  const job = f.values.get('job:' + c.id) as { blueprintProviderReconciliation: { releasedCents: number } }; job.blueprintProviderReconciliation.releasedCents++
  const invalid = readGenerationFundingSnapshot(await entitlementCall(f.env, user, '/generation-funding'))
  assert.equal(invalid.jobs.fundingEvidence.unknownAmountRecords, 1); assert.equal(invalid.jobs.evidence.markedReconciled, 0)
})
for (const mode of ['wrong-revision', 'missing-revision', 'null']) test(`${mode} failed proof remains unknown in the funding projection`, async () => {
  const f = await fixture(), c = await claimed(f); await c.settle()
  const job = f.values.get('job:' + c.id) as { blueprintProviderReconciliation: Record<string, unknown> | null }
  if (mode === 'null') job.blueprintProviderReconciliation = null
  else if (mode === 'wrong-revision') job.blueprintProviderReconciliation!.revision = 'unknown'
  else delete job.blueprintProviderReconciliation!.revision
  const before = structuredClone([...f.values]), snapshot = readGenerationFundingSnapshot(await entitlementCall(f.env, user, '/generation-funding'))
  assert.equal(snapshot.jobs.evidence.markedReconciled, 0); assert.equal(snapshot.jobs.evidence.unknown, 1)
  assert.equal(snapshot.jobs.fundingEvidence.unknownAmountRecords, 1); assert.equal(snapshot.jobs.fundingEvidence.unresolvedOrdinaryReservations.records, 0)
  assert.deepEqual([...f.values], before)
})
function failedResponse(model: BlueprintModel, mode = 'invalid-json') {
  return { id: 'resp_failed_fixture', model: MODEL_CATALOG[model].model, status: mode === 'incomplete' ? 'incomplete' : 'completed',
    ...(mode === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
    usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
    output: [{ content: [{ type: mode === 'refusal' ? 'refusal' : 'output_text', text: mode === 'invalid-schema' ? '{}' : 'invalid JSON' }] }] }
}

for (const model of ['luna', 'sol', 'astra'] as const) for (const mode of ['invalid-json', 'invalid-schema', 'refusal', 'incomplete']) {
  test(`${model} authenticated ${mode} failure refunds points and only provably unused ordinary funding`, async () => {
    const f = await fixture(), seed = crypto.randomUUID(), before = f.funding()
    f.provider(failedResponse(model, mode))
    assert.equal((await f.call(model, seed)).status, mode === 'refusal' ? 422 : 502)
    assert.equal(f.values.get('balance'), 4500)
    const retained = Math.ceil(blueprintReservationMicroUsd(model, 1000, 100) / 10000)
    assert.equal(f.funding(), before - retained)
    const id = await blueprintRequestId(seed), job = f.values.get('job:' + id) as Record<string, unknown>
    assert.equal(job.state, 'failed'); assert.equal(f.values.has('blueprint-result:' + id), false)
    f.restart()
    assert.equal((await f.call(model, seed)).status, 409)
    assert.equal(f.values.get('balance'), 4500); assert.equal(f.funding(), before - retained); assert.equal(f.generationCalls(), 1)
  })
}

for (const [label, proofModel, releases] of [['historical Sol proof', 'gpt-6-sol', true], ['new Sol 6.1 proof', 'gpt-6.1-sol', false]] as const) test(`${label} respects the exact old markerless job identity`, async () => {
  const f = await fixture(), before = f.funding(), c = await claimed(f)
  const job = f.values.get('job:' + c.id) as Record<string, unknown>
  delete job.blueprintProviderModel
  await c.settle({ ...c.proof, model: proofModel })
  assert.equal(f.values.get('balance'), 4500)
  assert.equal(f.funding(), before - (releases ? 2 : 35))
  assert.equal(Object.hasOwn(f.values.get('job:' + c.id) as object, 'blueprintProviderReconciliation'), releases)
})
