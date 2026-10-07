import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverHeldPoints, type HeldPointsReview } from '../src/lib/recoverHeldPoints.ts'
import { PAID_POINTS_FUNDING, type PointSettlement } from '../src/lib/paidPointsFunding.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const item: HeldPointsReview = { id, channel: 'blueprint', model: 'astra', state: 'pending-cost', heldPoints: 250 }
const point = (state: PointSettlement['state'], cost = 250): PointSettlement => ({ version: 1, state, heldPoints: ['held', 'pending-cost'].includes(state) ? cost : 0, chargedPoints: state === 'charged' ? cost : 0 })
const ticket = `${id}.1791356400000.${'a'.repeat(64)}.${'b'.repeat(64)}`
const current = (state: PointSettlement['state'] = 'pending-cost', tier?: 'standard' | 'extended') => ({ current: {
  receipt: { id, ticket, createdAt: new Date(1791356400000).toISOString(), ...(tier ? { pricing: STUDIO_PRICING[tier] } : {}) },
  fundingSource: PAID_POINTS_FUNDING, prompt: 'Private model prompt that must not be rendered', startedAt: '2026-10-07T00:00:00.000Z',
  financialState: state === 'held' ? 'reserved' : state === 'charged' ? 'completed' : 'failed',
  reservedPoints: ['held', 'pending-cost'].includes(state) ? tier === 'extended' ? 500 : 250 : 0,
  pointSettlement: point(state, tier === 'extended' ? 500 : 250), ...(tier ? { pricing: STUDIO_PRICING[tier] } : {}),
} })
function fixture(...responses: (unknown | Response | ((init: RequestInit) => unknown))[]) {
  const calls: { path: string; init: RequestInit }[] = []
  const fetcher = (async (path: unknown, init?: RequestInit) => {
    assert.ok(init); calls.push({ path: String(path), init })
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
    assert.equal(init.body, undefined); assert.ok(init.signal)
    const next = responses.shift()
    assert.notEqual(next, undefined, 'No automatic retries, submissions or extra recovery calls')
    const response = typeof next === 'function' ? await next(init) : next
    return response instanceof Response ? response : Response.json(response)
  }) as typeof fetch
  return { fetcher, calls }
}

for (const state of ['held', 'pending-cost', 'released', 'charged'] as const) test(`Blueprint stored UUID recovery safely reports ${state} through exactly one GET`, async () => {
  const generation = state === 'held' ? 'reserved' : state === 'charged' ? 'completed' : 'failed'
  const f = fixture({ requestId: id, model: 'astra', state: generation, refunded: state === 'released', pointSettlement: point(state), result: { privateArtifact: 'must not return' }, error: 'Incorrect refund wording must not appear' })
  const result = await recoverHeldPoints(f.fetcher, item)
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, `/api/blueprint/requests/${id}?stored=held-points-v1`)
  assert.equal(f.calls[0].init.headers, undefined)
  assert.equal(result.state, generation === 'reserved' ? 'pending' : generation); assert.deepEqual(result.pointSettlement, point(state))
  assert.doesNotMatch(JSON.stringify(result), /privateArtifact|Incorrect refund/)
  assert.deepEqual(Object.keys(result).sort(), ['detail', 'pointSettlement', 'state'])
  if (state === 'pending-cost') { assert.match(result.detail, /Manual review/); assert.match(result.detail, /No points have been charged or released/); assert.match(result.detail, /does not establish final spending/) }
})

test('stored Blueprint reads reject changed identity, route metadata and malformed settlement without retry', async () => {
  const good = { requestId: id, model: 'astra', state: 'failed', refunded: false, pointSettlement: point('pending-cost') }
  for (const change of [{ requestId: other }, { model: 'sol' }, { owned: false }, { conflict: true }, { state: 'future' }, { state: ['reserved'] }, { refunded: true }, { refunded: 'false' },
    { pointSettlement: null }, { pointSettlement: { ...point('pending-cost'), version: 2 } }, { pointSettlement: { ...point('pending-cost'), heldPoints: 249 } },
    { pointSettlement: { ...point('pending-cost'), extra: true } }, { pointSettlement: point('charged') }]) {
    const f = fixture({ ...good, ...change })
    await assert.rejects(recoverHeldPoints(f.fetcher, item), /could not be verified/); assert.equal(f.calls.length, 1)
  }
})

test('a markerless terminal response cannot reuse unverified provider refund wording', async () => {
  const f = fixture({ requestId: id, model: 'astra', state: 'failed', refunded: true, error: 'All reserved points have been returned' })
  const result = await recoverHeldPoints(f.fetcher, item)
  assert.equal(result.state, 'failed'); assert.equal(result.pointSettlement, undefined)
  assert.match(result.detail, /unconfirmed/); assert.match(result.detail, /Manual review/); assert.doesNotMatch(result.detail, /have been returned/)
})

for (const tier of [undefined, 'standard', 'extended'] as const) test(`Studio ${tier ?? 'original unpriced'} recovery mints one owned receipt and checks that same UUID only`, async () => {
  const cost = tier === 'extended' ? 500 : 250, expected = { ...item, channel: 'studio' as const, heldPoints: cost }
  const f = fixture(current('pending-cost', tier), { job: { id, state: 'failed', detail: 'Untrusted legacy refund detail', pointSettlement: point('pending-cost', cost), ...(tier ? { pricing: STUDIO_PRICING[tier] } : {}) } })
  const result = await recoverHeldPoints(f.fetcher, expected)
  assert.deepEqual(f.calls.map(call => call.path), [`/api/studio/current?job=${id}`, `/api/studio/jobs/${id}`])
  assert.equal(f.calls[0].init.headers, undefined)
  assert.equal(new Headers(f.calls[1].init.headers).get('X-WORLDIFACT-Job'), ticket)
  assert.equal([...new Headers(f.calls[1].init.headers)].length, 1)
  assert.deepEqual(result.pointSettlement, point('pending-cost', cost)); assert.match(result.detail, /Manual review/)
  assert.doesNotMatch(JSON.stringify(result), /Private model prompt|Untrusted legacy refund|1791356400000|"receipt"|"ticket"/)
})

for (const state of ['held', 'released', 'charged'] as const) test(`Studio same-UUID status can establish ${state} after browser state was lost`, async () => {
  const f = fixture(current(state === 'held' ? 'held' : 'pending-cost', 'standard'), { job: { id, state: state === 'held' ? 'building' : state === 'charged' ? 'succeeded' : 'failed', pricing: STUDIO_PRICING.standard, pointSettlement: point(state) } })
  const result = await recoverHeldPoints(f.fetcher, { ...item, channel: 'studio' })
  assert.equal(result.state, state === 'held' ? 'pending' : state === 'charged' ? 'completed' : 'failed')
  assert.deepEqual(result.pointSettlement, point(state)); assert.equal(f.calls.length, 2)
})

test('selected Studio response requires exact account funding, receipt identity, settlement and price before its status GET', async () => {
  const original = current('pending-cost', 'standard')
  for (const change of [{ fundingSource: 'ordinary' }, { fundingSource: 'future-v99' }, { receipt: { ...original.current.receipt, id: other } },
    { receipt: { ...original.current.receipt, ticket: ticket.replace(id, other) } }, { receipt: { ...original.current.receipt, ticket: 'library.' + ticket } },
    { receipt: { ...original.current.receipt, createdAt: '2026-01-01T00:00:00.000Z' } }, { financialState: 'completed' }, { financialState: ['failed'] }, { reservedPoints: 0 },
    { pricing: { ...STUDIO_PRICING.standard, points: 1 } }, { pricing: null }, { pricing: STUDIO_PRICING.extended },
    { receipt: { ...original.current.receipt, pricing: undefined } }, { pointSettlement: null }, { pointSettlement: { ...point('pending-cost'), version: 2 } }]) {
    const f = fixture({ current: { ...original.current, ...change } })
    await assert.rejects(recoverHeldPoints(f.fetcher, { ...item, channel: 'studio' }), /could not be verified/)
    assert.equal(f.calls.length, 1)
  }
  const extended = fixture(current('pending-cost'))
  await assert.rejects(recoverHeldPoints(extended.fetcher, { ...item, channel: 'studio', heldPoints: 500 }), /could not be verified/)
  assert.equal(extended.calls.length, 1)
})

test('held-prefixed Studio recovery preserves the exact capability and original timestamp for both price tiers', async () => {
  for (const tier of ['standard', 'extended'] as const) {
    const selected = current('pending-cost', tier), heldTicket = 'held.' + selected.current.receipt.ticket
    selected.current.receipt.ticket = heldTicket
    const cost = STUDIO_PRICING[tier].points
    const f = fixture(selected, (init: RequestInit) => {
      assert.equal(new Headers(init.headers).get('X-WORLDIFACT-Job'), heldTicket)
      return { job: { id, state: 'failed', pricing: STUDIO_PRICING[tier], pointSettlement: point('pending-cost', cost) } }
    })
    const result = await recoverHeldPoints(f.fetcher, { ...item, channel: 'studio', heldPoints: cost })
    assert.equal(result.pointSettlement?.heldPoints, cost)
    assert.deepEqual(f.calls.map(call => call.path), [`/api/studio/current?job=${id}`, `/api/studio/jobs/${id}`])
    assert.doesNotMatch(JSON.stringify(result), /held\.aaaaaaaa|"ticket"|"receipt"/)
  }
  for (const prefix of ['held.held.', 'held.library.', 'unknown.']) {
    const selected = current(); selected.current.receipt.ticket = prefix + ticket
    const f = fixture(selected)
    await assert.rejects(recoverHeldPoints(f.fetcher, { ...item, channel: 'studio' }), /could not be verified/)
    assert.equal(f.calls.length, 1)
  }
})

test('Studio status identity, price and marker mismatches fail closed and cannot change the selected receipt', async () => {
  const status = { id, state: 'failed', pricing: STUDIO_PRICING.standard, pointSettlement: point('pending-cost') }
  for (const change of [{ id: other }, { pricing: null }, { pricing: STUDIO_PRICING.extended }, { pricing: { ...STUDIO_PRICING.standard, revision: 'future' } },
    { pointSettlement: { ...point('pending-cost'), chargedPoints: 250 } }, { pointSettlement: null }, { state: 'unknown' }, { state: ['building'] }]) {
    const f = fixture(current('pending-cost', 'standard'), { job: { ...status, ...change } })
    await assert.rejects(recoverHeldPoints(f.fetcher, { ...item, channel: 'studio' }), /could not be verified/); assert.equal(f.calls.length, 2)
  }
  const regression = fixture(current('released'), { job: { id, state: 'succeeded', pointSettlement: point('charged') } })
  await assert.rejects(recoverHeldPoints(regression.fetcher, { ...item, channel: 'studio' }), /could not be verified/)
})

test('foreign, missing and malformed responses produce safe errors with no alternate route or retry', async () => {
  for (const response of [Response.json({ error: ticket }, { status: 403 }), Response.json({ error: ticket }, { status: 404 }),
    new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }), new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }), Response.json(null)]) {
    const f = fixture(response)
    await assert.rejects(recoverHeldPoints(f.fetcher, item), error => error instanceof Error && !error.message.includes(ticket))
    assert.equal(f.calls.length, 1)
  }
  const selected = fixture(current(), Response.json({ error: ticket }, { status: 403 }))
  await assert.rejects(recoverHeldPoints(selected.fetcher, { ...item, channel: 'studio' }), /Sign in to the original account/)
  assert.equal(selected.calls.length, 2)
  const throws = fixture(current(), () => { throw new Error('Transport exposed ' + ticket) })
  await assert.rejects(recoverHeldPoints(throws.fetcher, { ...item, channel: 'studio' }), error => error instanceof Error && !error.message.includes(ticket))
})

test('invalid review rows and already aborted checks do not issue any request', async () => {
  for (const change of [{ id: '../studio/current' }, { id: id + '?owner=someone' }, { channel: 'unknown' }, { model: 'future' }, { heldPoints: 1 }, { heldPoints: 500 }, { state: 'charged' }]) {
    const f = fixture()
    await assert.rejects(recoverHeldPoints(f.fetcher, { ...item, ...change } as HeldPointsReview), /could not be verified/)
    assert.equal(f.calls.length, 0)
  }
  const controller = new AbortController(); controller.abort()
  const f = fixture()
  await assert.rejects(recoverHeldPoints(f.fetcher, item, controller.signal), /interrupted/); assert.equal(f.calls.length, 0)
})

test('bounded streamed JSON is cancelled and an abort ends a non-cooperative transport', async () => {
  let cancelled = false
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(131_073).fill(32)) }, cancel() { cancelled = true } })
  const f = fixture(new Response(body, { headers: { 'Content-Type': 'application/json' } }))
  await assert.rejects(recoverHeldPoints(f.fetcher, item), /could not be verified/); assert.equal(cancelled, true); assert.equal(f.calls.length, 1)
  let calls = 0
  const controller = new AbortController(), pending = recoverHeldPoints((async () => { calls++; return new Promise<Response>(() => {}) }) as typeof fetch, item, controller.signal)
  controller.abort(new Error('private abort payload ' + ticket))
  await assert.rejects(pending, error => error instanceof Error && /interrupted/.test(error.message) && !error.message.includes(ticket)); assert.equal(calls, 1)
})

test('uppercase stored UUIDs retain exact case through both owned recovery routes', async () => {
  const upper = id.toUpperCase(), blueprint = fixture({ requestId: upper, model: 'astra', state: 'failed', refunded: false, pointSettlement: point('pending-cost') })
  await recoverHeldPoints(blueprint.fetcher, { ...item, id: upper })
  assert.equal(blueprint.calls[0].path, `/api/blueprint/requests/${upper}?stored=held-points-v1`)
  const snapshot = current()
  snapshot.current.receipt.id = upper; snapshot.current.receipt.ticket = ticket.replace(id, upper)
  const studio = fixture(snapshot, { job: { id: upper, state: 'failed', pointSettlement: point('pending-cost') } })
  await recoverHeldPoints(studio.fetcher, { ...item, id: upper, channel: 'studio' })
  assert.deepEqual(studio.calls.map(call => call.path), [`/api/studio/current?job=${upper}`, `/api/studio/jobs/${upper}`])
  const wrongCase = fixture({ requestId: id, model: 'astra', state: 'failed', pointSettlement: point('pending-cost') })
  await assert.rejects(recoverHeldPoints(wrongCase.fetcher, { ...item, id: upper }), /could not be verified/)
})

test('aborting an owned selection before reading it prevents the signed status request', async () => {
  const controller = new AbortController(), f = fixture(() => { controller.abort(); return current() })
  await assert.rejects(recoverHeldPoints(f.fetcher, { ...item, channel: 'studio' }, controller.signal), /interrupted/)
  assert.equal(f.calls.length, 1)
})
