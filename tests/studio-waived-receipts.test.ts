import test from 'node:test'
import assert from 'node:assert/strict'
import { StudioCoordinator, parseStudioJob, readSavedStudioJob, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX, STUDIO_COST_REVIEW_KEY, type ReceiptStore } from '../src/lib/studioClient.ts'
import { canSubmitNewDraft } from '../src/lib/studioDraft.ts'
import { recoverHeldPoints, type HeldPointsReview } from '../src/lib/recoverHeldPoints.ts'
import { PAID_POINTS_FUNDING, POINT_COST_WAIVED_DETAIL, type PointSettlement } from '../src/lib/paidPointsFunding.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nextId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', created = Date.now(), prompt = 'Preserve the original failed chess rook description'
const waiver: PointSettlement = { version: 1, state: 'waived', heldPoints: 0, chargedPoints: 0, approvalId: 'failed-hold-waiver-20261009-v1' }
const pending: PointSettlement = { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 }
const receipt = { id, createdAt: new Date(created).toISOString(), ticket: `held.${id}.${created}.${'a'.repeat(64)}.${'b'.repeat(64)}` }
const original = { receipt, prompt, startedAt: receipt.createdAt, fundingSource: PAID_POINTS_FUNDING, pointSettlement: pending }
const failed = { id, state: 'failed', failureCode: 'ASTRA_COST_LIMIT', pointSettlement: waiver }
function storage(): ReceiptStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}

test('only a paid failed Studio response can carry the exact incident waiver', () => {
  const job = parseStudioJob({ job: { ...failed, detail: 'Provider calls were free and model completed' } }, id, 250, true)
  assert.equal(job.state, 'failed'); assert.deepEqual(job.pointSettlement, waiver)
  assert.equal(job.detail, POINT_COST_WAIVED_DETAIL)
  assert.equal(canSubmitNewDraft(id, job), true)
  for (const state of ['cancelled', 'pending', 'queued', 'building', 'succeeded'])
    assert.throws(() => parseStudioJob({ job: { ...failed, state } }, id, 250, true), /states disagree/)
  assert.throws(() => parseStudioJob({ job: failed }, id, 250, false), /states disagree/)
  for (const change of [{ refunded: true }, { downloadAllowed: true }, { previewAvailable: true }, { reconciliationRequired: true }])
    assert.throws(() => parseStudioJob({ job: { ...failed, ...change } }, id, 250, true), /states disagree/)
  for (const change of [{ approvalId: 'unapproved' }, { heldPoints: 250 }, { chargedPoints: 250 }, { version: 2 }, { providerLiability: 0 }])
    assert.throws(() => parseStudioJob({ job: { ...failed, pointSettlement: { ...waiver, ...change } } }, id, 250, true), /could not be verified/)
})

test('stale held receipt becomes a final waiver, clears only its review, and reload never retries it', async () => {
  const store = storage(), historyKey = STUDIO_RECEIPT_HISTORY_PREFIX + id, reviewKey = STUDIO_COST_REVIEW_KEY + owner
  const originalText = JSON.stringify(original)
  const unrelated = { ...original, receipt: { ...receipt, id: nextId, ticket: receipt.ticket.replace(id, nextId) }, prompt: 'Another unresolved request' }
  store.setItem(STUDIO_RECEIPT_KEY, originalText); store.setItem(historyKey, originalText)
  store.setItem(reviewKey, JSON.stringify([original, unrelated]))
  const calls: { path: string; method: string }[] = []
  const fetcher = (async (url, init = {}) => {
    calls.push({ path: String(url), method: init.method ?? 'GET' })
    if (String(url) === `/api/studio/jobs/${id}`) return Response.json({ job: failed })
    if (String(url) === '/api/studio/prepare') return Response.json({ ...receipt, id: nextId, ticket: receipt.ticket.replace(id, nextId) })
    assert.equal(String(url), '/api/studio/jobs'); assert.equal(init.method, 'POST')
    return Response.json({ job: { id: nextId, state: 'building', pointSettlement: { ...pending, state: 'held' } } })
  }) as typeof fetch
  const client = new StudioCoordinator(store, fetcher, () => owner)
  client.restore()
  assert.equal((await client.poll()).pointSettlement?.state, 'waived')
  assert.deepEqual(client.pendingCostReviews().map(value => value.receipt.id), [nextId])
  assert.equal(store.getItem(historyKey), originalText)
  assert.equal(readSavedStudioJob(store)?.prompt, prompt)
  const restored = new StudioCoordinator(store, fetcher, () => owner); restored.restore()
  assert.equal((await restored.poll()).detail, POINT_COST_WAIVED_DETAIL)
  assert.equal((await restored.recoverCurrent())?.job.pointSettlement?.state, 'waived')
  assert.deepEqual(calls, [{ path: `/api/studio/jobs/${id}`, method: 'GET' }])
  const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Explicit new inert test request', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
  await restored.start(input, () => {}, '', true, PAID_POINTS_FUNDING)
  assert.deepEqual(calls.map(value => value.method), ['GET', 'POST', 'POST'])
  assert.equal(store.getItem(historyKey), originalText)
})

test('cloud waiver recovery persists a terminal receipt and skips later signed job polling', async () => {
  const store = storage(); let reads = 0
  const client = new StudioCoordinator(store, (async url => {
    reads++; assert.equal(String(url), '/api/studio/current')
    return Response.json({ current: { ...original, financialState: 'failed', reservedPoints: 0, pointSettlement: waiver, failureCode: 'ASTRA_COST_LIMIT' } })
  }) as typeof fetch)
  const result = await client.recoverCurrent()
  assert.equal(result?.job.detail, POINT_COST_WAIVED_DETAIL); assert.equal(result?.saved.prompt, prompt)
  const restored = new StudioCoordinator(store, (async () => { throw new Error('A waived receipt must not retry') }) as typeof fetch)
  restored.restore(); assert.equal((await restored.poll()).pointSettlement?.state, 'waived'); assert.equal(reads, 1)
})

test('held review accepts only the owned failed Studio waiver and does no redundant status read', async () => {
  const item: HeldPointsReview = { id, channel: 'studio', model: 'astra', state: 'pending-cost', heldPoints: 250 }
  const snapshot = { ...original, financialState: 'failed', reservedPoints: 0, pointSettlement: waiver }
  let reads = 0
  const fetcher = (async (url, init) => {
    reads++; assert.equal(String(url), `/api/studio/current?job=${id}`); assert.equal(init?.method, 'GET')
    return Response.json({ current: snapshot })
  }) as typeof fetch
  const result = await recoverHeldPoints(fetcher, item)
  assert.deepEqual(result, { state: 'failed', detail: POINT_COST_WAIVED_DETAIL, pointSettlement: waiver }); assert.equal(reads, 1)
  for (const change of [{ financialState: 'reserved' }, { financialState: 'completed' }, { fundingSource: 'ordinary' }, { reservedPoints: 250 }])
    await assert.rejects(recoverHeldPoints((async () => Response.json({ current: { ...snapshot, ...change } })) as typeof fetch, item), /could not be verified/)
  await assert.rejects(recoverHeldPoints((async () => Response.json({ requestId: id, model: 'astra', state: 'failed', refunded: false, pointSettlement: waiver })) as typeof fetch,
    { ...item, channel: 'blueprint' }), /could not be verified/)
})

test('waived Studio current, status and artifact reads never call Oracle or settlement routes', async () => {
  const accountRoutes: string[] = [], outbound: string[] = []
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'inert-signing-key-'.repeat(4), ORACLE_ENDPOINT: 'https://oracle.test', ORACLE_API_TOKEN: 'inert-oracle-token', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { limit: async () => ({ success: true }) }, ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get: () => ({ fetch: async (request: Request) => {
      const path = new URL(request.url).pathname.replace('/generation-v3', ''); accountRoutes.push(path)
      if (path === '/studio-current') return Response.json({ job: { id, prompt, at: created, fingerprint: 'a'.repeat(64), state: 'failed', held: false, cost: 250,
        fundingSource: PAID_POINTS_FUNDING, pointSettlement: waiver, failureCode: 'ASTRA_COST_LIMIT', pricing: STUDIO_PRICING.standard } })
      if (path === '/job') return Response.json({ owned: true, state: 'failed', pointSettlement: waiver, failureCode: 'ASTRA_COST_LIMIT', providerBudgetPending: true, downloadAllowed: false, previewOnly: false, pricing: STUDIO_PRICING.standard })
      return Response.json({ error: 'No mutation is allowed' }, { status: 500 })
    } }) } }
  const fetcher = (async url => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') return Response.json({ id: owner, email: 'fixture@example.test' })
    outbound.push(String(url)); throw new Error('No provider read or call is allowed')
  }) as typeof fetch
  const request = (path: string, ticket?: string) => studioApi(new Request('https://worldifact.test' + path, {
    headers: { Cookie: '__Host-worldifact-access=inert-token', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) },
  }), env, fetcher)
  const current = await request('/api/studio/current'); assert.equal(current.status, 200)
  const body = await current.json() as { current: { receipt: { ticket: string }; pointSettlement: PointSettlement } }
  assert.deepEqual(body.current.pointSettlement, waiver)
  const status = await request(`/api/studio/jobs/${id}`, body.current.receipt.ticket); assert.equal(status.status, 200)
  const result = await status.json() as { job: { state: string; detail: string; previewAvailable: boolean } }
  assert.equal(result.job.state, 'failed'); assert.equal(result.job.detail, POINT_COST_WAIVED_DETAIL); assert.equal(result.job.previewAvailable, false)
  const artifact = await request(`/api/studio/jobs/${id}/model`, body.current.receipt.ticket); assert.equal(artifact.status, 409)
  assert.deepEqual(outbound, []); assert.ok(accountRoutes.every(path => ['/studio-current', '/job'].includes(path)))
})
