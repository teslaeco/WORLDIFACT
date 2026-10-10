import test from 'node:test'
import assert from 'node:assert/strict'
import { isPointSettlement, manualPointClosureDetail, PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'
import { parseStudioJob, StudioCoordinator, STUDIO_RECEIPT_KEY, STUDIO_RECEIPT_HISTORY_PREFIX } from '../src/lib/studioClient.ts'
import { recoverHeldPoints } from '../src/lib/recoverHeldPoints.ts'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', at = 1791356400000
const pointSettlement = { version: 1, state: 'forfeited', heldPoints: 0, chargedPoints: 0, forfeitedPoints: 250, approvalId: 'held-points-forfeit-20261010-v1' } as const
const receipt = { id, ticket: `held.${id}.${at}.${'a'.repeat(64)}.${'b'.repeat(64)}`, createdAt: new Date(at).toISOString() }

test('forfeiture cannot masquerade as successful generation, refund or downloadable output', () => {
  assert.equal(isPointSettlement(pointSettlement, 250), true)
  for (const patch of [{ forfeitedPoints: 249 }, { chargedPoints: 250 }, { heldPoints: 250 }, { approvalId: 'failed-hold-waiver-20261009-v1' }]) assert.equal(isPointSettlement({ ...pointSettlement, ...patch }, 250), false)
  assert.equal(isPointSettlement(pointSettlement, 500), false)
  for (const patch of [{ state: 'succeeded' }, { refunded: true }, { previewAvailable: true }, { downloadAllowed: true }, { reconciliationRequired: true }]) assert.throws(() => parseStudioJob({ job: { id, state: 'failed', pointSettlement, ...patch } }, id, 250, true))
  assert.throws(() => parseStudioJob({ job: { id, state: 'failed', pointSettlement } }, id, 250, false))
  assert.match(parseStudioJob({ job: { id, state: 'failed', pointSettlement } }, id, 250, true).detail, /forfeited.*without a refund/)
})

test('old held receipt observes final forfeiture with one authenticated read and no provider recovery', async () => {
  let calls = 0
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    calls++; assert.equal(init?.method, 'GET')
    return Response.json({ current: { receipt, fundingSource: PAID_POINTS_FUNDING, financialState: 'failed', reservedPoints: 0, pointSettlement } })
  }) as typeof fetch
  const result = await recoverHeldPoints(fetcher, { id, channel: 'studio', model: 'astra', state: 'pending-cost', heldPoints: 250 }, new AbortController().signal)
  assert.equal(result.state, 'failed'); assert.equal(result.pointSettlement?.state, 'forfeited'); assert.match(result.detail, /without a refund/); assert.equal(calls, 1)
})

test('final forfeiture keeps the original receipt and restores the honest terminal description', async () => {
  const saved = { receipt, prompt: 'Inert test model', startedAt: receipt.createdAt, fundingSource: PAID_POINTS_FUNDING, pointSettlement: { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 } }
  const values = new Map([[STUDIO_RECEIPT_KEY, JSON.stringify(saved)]])
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const fetcher = (async (_url: unknown, init?: RequestInit) => { assert.notEqual(init?.method, 'POST'); return Response.json({ job: { id, state: 'failed', pointSettlement } }) }) as typeof fetch
  const coordinator = new StudioCoordinator(store, fetcher)
  coordinator.restore(); await coordinator.poll()
  assert.deepEqual(JSON.parse(values.get(STUDIO_RECEIPT_HISTORY_PREFIX + id)!), saved)
  const restored = new StudioCoordinator(store, fetcher); restored.restore()
  assert.equal(restored.current?.pointSettlement?.state, 'forfeited')
  assert.equal(restored.current?.rejection, manualPointClosureDetail(pointSettlement))
})
