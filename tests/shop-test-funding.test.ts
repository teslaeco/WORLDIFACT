import test from 'node:test'
import assert from 'node:assert/strict'
import { OvernightTestClient, type OvernightPanelStatus, type OvernightPanelRow } from '../src/lib/overnightTestClient.ts'
import { assertOrdinaryRequestsSettled, shopCloudRecoveryFetch, shopTestSelectionKey, testFundingQuote, testInputProblem, testRowsUncertain } from '../src/lib/shopTestFunding.ts'
import { StudioCoordinator, STUDIO_RECEIPT_KEY } from '../src/lib/studioClient.ts'
import { BLUEPRINT_RECOVERY_KEY } from '../src/lib/blueprintClient.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = Date.parse('2026-10-06T05:00:00.000Z')
const status: OvernightPanelStatus = { commitments: [], accountContract: 'approved-test-account-v1', available: true, approvalId: 'api-tests-20261006-044444-usd4', expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400, committedCents: 0, remainingCents: 400, attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true }
const rows: OvernightPanelRow[] = ['astra-1', 'astra-2', 'sol', 'luna'].map(slot => ({ slot: slot as OvernightPanelRow['slot'], state: 'empty', detail: 'Empty' }))
const account = { credits: 1000, availableCredits: 1000, billingReview: false, subscription: { active: true }, generationCosts: { astra: 250, sol: 50, luna: 15 }, studioAdmission: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } }
const receipt = { id: ID, createdAt: new Date(NOW).toISOString(), ticket: `${ID}.${NOW}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const input: StudioInput = { worldId: 'enchanted-ai-shop', purpose: 'game', prompt: 'An accurate robot with a blue front panel', textureMaxSize: 2048, photos: [{ name: 'front.jpg', view: 'front', textureMaxSize: 2048, dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64') }] }
function store() { const data = new Map<string, string>(), writes: string[] = []; return { data, writes, getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { data.set(key, value); writes.push(key) }, removeItem(key: string) { data.delete(key); writes.push(key) } } }

test('the explicit pool quote uses the same ceiling and points, never the ordinary funding refusal', () => {
  const quote = testFundingQuote('astra-1', status, rows, account, NOW)
  assert.equal(quote.state, 'credits'); assert.equal(quote.points, 250); assert.equal(quote.after, 750)
  assert.match(quote.message, /USD 1.75/)
  for (const bad of [{ ...account, billingReview: true }, { ...account, availableCredits: 100 }, { ...account, credits: undefined }]) assert.notEqual(testFundingQuote('astra-1', status, rows, bad, NOW).state, 'credits')
  assert.equal(testFundingQuote('astra-1', status, rows, account, Date.parse(status.expiresAt)).state, 'blocked')
  assert.equal(testFundingQuote('astra-1', null, rows, account, NOW).state, 'pending')
})
test('uncertain committed work, pending receipts and occupied slots fail closed', () => {
  const committed = { ...status, commitments: [{ jobId: ID, workflow: 'detailed-astra' as const, capCents: 175 }], committedCents: 175, remainingCents: 225, attempts: { ...status.attempts, 'detailed-astra': 1 } }
  assert.equal(testRowsUncertain(rows, committed), true)
  const pending = rows.map(row => row.slot === 'astra-1' ? { ...row, state: 'pending' as const } : row)
  assert.equal(testRowsUncertain(pending), true)
  assert.equal(testFundingQuote('astra-2', committed, pending, account, NOW).state, 'blocked')
  const completed = rows.map(row => row.slot === 'astra-1' ? { ...row, commitmentId: ID, state: 'completed' as const } : row)
  assert.equal(testRowsUncertain(completed, committed), false)
  assert.equal(testFundingQuote('astra-2', committed, completed, account, NOW).state, 'credits')
  assert.equal(testFundingQuote('astra-1', committed, completed, account, NOW).state, 'blocked')
})
test('funding selection cannot change a model, reference set, delivery or higher budget silently', () => {
  assert.equal(testInputProblem('astra-1', 'astra', true, 4, 'standard'), null)
  for (const problem of [testInputProblem('astra-1', 'astra', false, 0, 'standard'), testInputProblem('astra-1', 'astra', true, 1, 'extended'), testInputProblem('sol', 'luna', false, 0, 'standard'), testInputProblem('sol', 'sol', false, 1, 'standard')]) assert.equal(typeof problem, 'string')
  assert.notEqual(shopTestSelectionKey(OWNER), shopTestSelectionKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
})
test('full detailed input uses the same test client slot and preserves ordinary receipts byte-for-byte', async () => {
  const storage = store(), calls: { path: string; method: string; body?: string }[] = []
  const ordinaryReceipt = JSON.stringify({ receipt, prompt: 'Known ordinary admission refusal', startedAt: receipt.createdAt, rejection: 'Definite no-charge refusal', rejectionCode: 'PROVIDER_BUDGET_EXHAUSTED' })
  const ordinaryBlueprint = JSON.stringify({ id: ID, model: 'sol', fingerprint: 'c'.repeat(64), state: 'completed', createdAt: NOW })
  storage.data.set(STUDIO_RECEIPT_KEY, ordinaryReceipt)
  storage.data.set(BLUEPRINT_RECOVERY_KEY, ordinaryBlueprint)
  const fetcher = (async (url, init = {}) => {
    const path = String(url), method = init.method ?? 'GET'; calls.push({ path, method, body: init.body as string })
    if (path === '/api/studio/current') return Response.json({ accountContract: 'approved-test-account-v1', current: null })
    if (path.endsWith('/status')) return Response.json(status)
    if (path.endsWith('/prepare')) return Response.json(receipt)
    if (path === '/api/overnight-tests/studio/jobs') return Response.json({ job: { id: ID, state: 'building' } })
    throw Error('Unexpected endpoint')
  }) as typeof fetch
  const client = new OvernightTestClient(storage, fetcher, OWNER, () => true, () => NOW)
  let prepared = ''
  const result = await client.startDetailed('astra-1', input, saved => { prepared = saved.receipt.id })
  assert.equal(result.id, ID); assert.equal(prepared, ID)
  assert.deepEqual(JSON.parse(calls.find(call => call.path === '/api/overnight-tests/studio/jobs')!.body!).input, input)
  assert.equal(JSON.parse(calls.find(call => call.path.endsWith('/prepare'))!.body!).input.photoCount, 1)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), ordinaryReceipt)
  assert.equal(storage.getItem(BLUEPRINT_RECOVERY_KEY), ordinaryBlueprint)
  assert.ok(storage.writes.every(key => key.includes(`:${OWNER}:astra-1:`)))
  await assert.rejects(client.startDetailed('astra-2', input, () => {}))
  assert.equal(calls.filter(call => call.method === 'POST').length, 2)
})
test('unsupported detailed pricing/profile and blueprint references fail before any request', async () => {
  let calls = 0
  const client = new OvernightTestClient(store(), (async () => { calls++; throw Error('Should not fetch') }) as typeof fetch, OWNER, () => true, () => NOW)
  await assert.rejects(client.startDetailed('astra-1', { ...input, generationProfile: 'fast-draft-v1' }, () => {}))
  await assert.rejects(client.startDetailed('astra-1', { ...input, budgetTier: 'extended' }, () => {}))
  await assert.rejects(client.startDetailed('sol', input, () => {}))
  await assert.rejects(client.startBlueprint('sol', { prompt: input.prompt, model: 'sol', mode: 'live', deliverable: 'procedural-blueprint', references: input.photos }))
  assert.equal(calls, 0)
})
test('ordinary pending or uncertain requests block the test gate without rewriting them', async () => {
  const storage = store()
  storage.data.set(STUDIO_RECEIPT_KEY, JSON.stringify({ receipt, prompt: input.prompt, startedAt: receipt.createdAt }))
  const original = storage.getItem(STUDIO_RECEIPT_KEY)
  const calls: string[] = []
  const fetcher = (async (url, init = {}) => { calls.push(String(url)); assert.equal(init.method ?? 'GET', 'GET'); return Response.json({ job: { id: ID, state: 'building' } }) }) as typeof fetch
  await assert.rejects(assertOrdinaryRequestsSettled(storage, fetcher, OWNER), /pending|unconfirmed/)
  assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), original); assert.equal(storage.writes.length, 0)
  assert.equal(calls.length, 1)
})


test('ordinary cloud recovery refuses a test-funded or old unbound response before any receipt write', async () => {
  for (const body of [
    { current: { receipt, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'reserved' } },
    { accountContract: 'approved-test-account-v1', current: { fundingSource: 'api-tests-20261006-044444-usd4', receipt, prompt: input.prompt, startedAt: receipt.createdAt, financialState: 'reserved' } },
  ]) {
    const storage = store()
    const client = new StudioCoordinator(storage, shopCloudRecoveryFetch((async () => Response.json(body)) as typeof fetch, () => OWNER))
    await assert.rejects(client.recoverCurrent())
    assert.equal(storage.writes.length, 0); assert.equal(storage.getItem(STUDIO_RECEIPT_KEY), null)
  }
})
