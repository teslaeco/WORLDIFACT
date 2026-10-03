import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readGenerationAccount, reconcileGenerationFunding, syncGenerationMembership } from '../src/lib/generationAccount.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'

const blocked = { credits: 3000, generationAdmission: { sol: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } } }
const cursor = '12345678-1234-4234-8234-123456789abc'
const signal = () => new AbortController().signal
const page = { checked: 2, reconciled: 1, unresolved: 1, nextCursor: null, hasMore: false, paidGenerationRequested: false }

test('an unavailable billing read preserves the authenticated funding refusal instead of erasing the balance', async () => {
  const fetcher: typeof fetch = async path => {
    if (path === '/api/account/entitlements') return Response.json(blocked)
    throw new TypeError('Offline auxiliary billing service')
  }
  const result = await readGenerationAccount(fetcher, signal())
  assert.deepEqual(result.account, blocked)
  assert.equal(result.billing, null)
  assert.equal(quoteGeneration('sol', result.account, result.billing, true).reason, 'PROVIDER_BUDGET_EXHAUSTED')
})

test('expired authentication is retained even when billing transport fails', async () => {
  const result = await readGenerationAccount(async path => {
    if (path === '/api/account/entitlements') return Response.json({}, { status: 401 })
    throw new TypeError('Offline')
  }, signal())
  assert.equal(result.authenticationRequired, true)
  assert.equal(result.account, null)
})

test('funding review submits one same-origin reconciliation request and validates its bounded result', async () => {
  const calls: { path: Parameters<typeof fetch>[0]; init?: RequestInit }[] = []
  const result = await reconcileGenerationFunding(async (path, init) => { calls.push({ path, init }); return Response.json(page) }, signal(), cursor)
  assert.deepEqual(result, page)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/api/studio/reconcile-budget')
  assert.equal(calls[0].init?.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { cursor })
})

test('malformed funding-review results cannot continue traversal or infer returned funds', async () => {
  for (const value of [null, { ...page, checked: 9 }, { ...page, reconciled: 3 }, { ...page, paidGenerationRequested: true },
    { ...page, hasMore: true, nextCursor: cursor }, { ...page, hasMore: false, nextCursor: cursor }, { ...page, hasMore: true, nextCursor: 'https://foreign.invalid' }]) {
    await assert.rejects(reconcileGenerationFunding(async () => Response.json(value), signal(), cursor))
  }
})

test('membership repair requests only status, then requires a fresh entitlement read instead of trusting billing points', async () => {
  const calls: { path: Parameters<typeof fetch>[0]; init?: RequestInit }[] = []
  const result = await syncGenerationMembership(async (path, init) => {
    calls.push({ path, init })
    return Response.json({ state: 'active', canManage: true, canRetry: false, activePlan: 'pro', credits: 999999 })
  }, signal())
  assert.equal(result, 'synced')
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/billing/recovery')
  assert.equal(calls[0].init?.credentials, 'same-origin'); assert.equal(calls[0].init?.redirect, 'error')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { action: 'status' })
})

test('unavailable, malformed and unauthenticated membership checks cannot invent Pro access', async () => {
  for (const value of [null, { state: 'active', canManage: true, canRetry: false }, { activePlan: 'pro' },
    { state: 'active', canManage: true, canRetry: false, activePlan: 'unknown' }]) {
    assert.equal(await syncGenerationMembership(async () => Response.json(value), signal()), 'unavailable')
  }
  assert.equal(await syncGenerationMembership(async () => Response.json({}, { status: 401 }), signal()), 'signin')
  assert.equal(await syncGenerationMembership(async () => { throw new TypeError('Offline') }, signal()), 'unavailable')
})

test('hung membership transport settles at its deadline and late success cannot change that result', async () => {
  let expire!: () => void, resolve!: (value: Response) => void, requestSignal: AbortSignal | undefined
  const pending = syncGenerationMembership(async (_, init) => { requestSignal = init?.signal as AbortSignal; return new Promise(done => { resolve = done }) }, signal(),
    { setTimeout(callback, delay) { assert.equal(delay, 10000); expire = callback; return 1 }, clearTimeout() {} })
  expire(); assert.equal(await pending, 'unavailable'); assert.equal(requestSignal?.aborted, true)
  resolve(Response.json({ state: 'active', canManage: true, canRetry: false, activePlan: 'pro' }))
  await Promise.resolve(); assert.equal(await pending, 'unavailable')
})
