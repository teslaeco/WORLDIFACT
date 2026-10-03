import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'

const PROVIDER = 'provider-budget-cents:v1', HELD = 'customer-reserved-credits:v1'
const NOW = Date.parse('2026-10-03T12:00:00Z'), fingerprint = 'a'.repeat(64)
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
function fixture() {
  const values = new Map<string, unknown>(), queue = { tail: Promise.resolve() as Promise<unknown> }
  let failKey: string | undefined, pause: (() => Promise<void>) | undefined
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const next = queue.tail.then(async () => {
        const wait = pause; pause = undefined
        if (wait) await wait()
        const draft = structuredClone(values)
        const transaction: EntitlementStorage = {
          async get<V>(key: string) { return structuredClone(draft.get(key)) as V | undefined },
          async put(key, value) {
            if (failKey === key) throw new Error('Synthetic write failure')
            draft.set(key, structuredClone(value))
          },
          transaction: async fn => fn(transaction),
        }
        const result = await callback(transaction)
        values.clear(); for (const [key, value] of draft) values.set(key, value)
        return result
      })
      queue.tail = next.catch(() => undefined)
      return next
    },
  }
  let object = new AccountEntitlements({ storage }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW)
  const call = async (path: string, body?: unknown) => {
    const response = await object.fetch(new Request('https://fixture.internal' + path, {
      method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
    return { status: response.status, data: await response.json() as Record<string, unknown> }
  }
  const reserve = (id: string, patch: Record<string, unknown> = {}) => call('/reserve', { id, profile: 'slow', channel: 'studio', fingerprint, ...patch })
  const job = (id: string) => structuredClone(values.get(`job:${id}`)) as Record<string, unknown>
  return {
    values, call, reserve, job,
    async fund() {
      await call('/grant', { id: 'in_unspent', credits: 1500, subscriptionId: 'sub_unspent' })
      await call('/subscription', { id: 'sub_unspent', until: NOW + 86_400_000, active: true, revision: 1, plan: 'creator', grantId: 'in_unspent' })
    },
    settle: (id: string, state = 'failed', failureCode = 'STUDIO_ALLOWANCE_UNAVAILABLE') => call('/settle', { id, state, ...(state === 'failed' ? { failureCode } : {}) }),
    dispatch: (id: string) => call('/studio-dispatch', { id, fingerprint }),
    restart() { object = new AccountEntitlements({ storage }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW) },
    failWrite(key?: string) { failKey = key },
    pauseNext() {
      const entered = deferred(), gate = deferred()
      pause = async () => { entered.resolve(); await gate.promise }
      return { entered: entered.promise, release: gate.resolve }
    },
  }
}

test('only a newly recorded ordinary Studio debit releases unused funding once before dispatch', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID()
  f.values.set('creator-astra:in_unspent', 6)
  assert.equal((await f.reserve(id)).data.allowed, true)
  assert.equal(f.values.get(PROVIDER), 875); assert.equal(f.values.get(HELD), 250)
  assert.equal((await f.reserve(id)).data.repeated, true)
  assert.equal(f.values.get(PROVIDER), 875)
  f.restart()
  await Promise.all(Array.from({ length: 12 }, () => f.settle(id)))
  assert.equal(f.values.get(PROVIDER), 1050); assert.equal(f.values.get(HELD), 0); assert.equal(f.values.get('balance'), 1500)
  assert.equal(f.values.get('creator-astra:in_unspent'), 6, 'Historical quota data is neither incremented nor reset')
  assert.equal((f.job(id).studioProviderReservation as { state: string }).state, 'released')
  f.restart()
  assert.equal((await f.reserve(id)).data.allowed, false)
  assert.equal((await f.dispatch(id)).data.dispatch, false, 'Terminal release fences all future dispatch')
  await f.settle(id, 'completed')
  assert.equal(f.values.get(PROVIDER), 1050); assert.equal(f.values.get('balance'), 1500)
  const status = (await f.call('/status')).data
  assert.doesNotMatch(JSON.stringify(status), /studioProviderReservation|amountCents|provider-budget/)
})

test('claim and failure settlement serialize: a release prevents dispatch, a won claim prevents release', async () => {
  for (const first of ['settle', 'dispatch'] as const) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    const gate = f.pauseNext(), leading = first === 'settle' ? f.settle(id) : f.dispatch(id)
    await gate.entered
    const trailing = first === 'settle' ? f.dispatch(id) : f.settle(id)
    gate.release()
    const [a, b] = await Promise.all([leading, trailing])
    const claim = first === 'dispatch' ? a : b
    assert.equal(claim.data.dispatch, first === 'dispatch')
    assert.equal(f.values.get(PROVIDER), first === 'dispatch' ? 875 : 1050)
    assert.equal(f.values.get(HELD), 0)
    assert.equal((await f.dispatch(id)).data.dispatch, false)
    await f.settle(id)
    assert.equal(f.values.get(PROVIDER), first === 'dispatch' ? 875 : 1050)
  }
})

test('legacy, unsupported, corrupt, and support-funded records cannot be reinterpreted as unused funding', async () => {
  const variants: [string, (job: Record<string, unknown>) => void][] = [
    ['legacy', job => { delete job.studioProviderReservation }],
    ['claimed', job => { job.studioDispatch = 'claimed-v1'; job.studioDispatchUntil = NOW + 30_000 }],
    ['invalid dispatch', job => { job.studioDispatch = 'unknown' }],
    ['unexpected deadline', job => { job.studioDispatchUntil = NOW + 30_000 }],
    ['blueprint', job => { job.channel = 'blueprint' }],
    ['legacy credit debit', job => { delete job.billingMode }],
    ['original support', job => { job.supportApprovalId = crypto.randomUUID() }],
    ['supplemental support', job => { job.supplementalGrantId = crypto.randomUUID() }],
    ['missing fingerprint', job => { delete job.fingerprint }],
    ['wrong credit cost', job => { job.cost = 249 }],
    ['wrong version', job => { (job.studioProviderReservation as Record<string, unknown>).version = 2 }],
    ['wrong source', job => { (job.studioProviderReservation as Record<string, unknown>).source = 'support' }],
    ['already released', job => { (job.studioProviderReservation as Record<string, unknown>).state = 'released' }],
    ['wrong cents', job => { (job.studioProviderReservation as Record<string, unknown>).amountCents = 350 }],
    ['string cents', job => { (job.studioProviderReservation as Record<string, unknown>).amountCents = '175' }],
    ['expanded marker', job => { (job.studioProviderReservation as Record<string, unknown>).extra = true }],
    ['null marker', job => { job.studioProviderReservation = null }],
    ['array marker', job => { job.studioProviderReservation = [] }],
  ]
  for (const [name, change] of variants) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    const job = f.job(id); change(job); f.values.set(`job:${id}`, job)
    await f.settle(id)
    assert.equal(f.values.get(PROVIDER), 875, name)
  }
})

test('completed work and provider failures after a dispatch claim retain their maximum reservation', async () => {
  for (const state of ['completed', 'failed']) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    if (state === 'failed') assert.equal((await f.dispatch(id)).data.dispatch, true)
    await f.settle(id, state, 'ASTRA_COST_LIMIT')
    assert.equal(f.values.get(PROVIDER), 875)
    assert.equal(f.values.get('balance'), state === 'completed' ? 1250 : 1500)
    assert.equal(f.values.get(HELD), 0)
  }
})

test('release is atomic with terminal state and customer hold, including write failure and recovery', async () => {
  for (const failureKey of [PROVIDER, HELD, 'job']) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    const before = structuredClone([...f.values])
    f.failWrite(failureKey === 'job' ? `job:${id}` : failureKey)
    assert.equal((await f.settle(id)).status, 503)
    assert.deepEqual([...f.values], before, failureKey)
    f.failWrite(); f.restart()
    assert.equal((await f.settle(id)).status, 200)
    assert.equal(f.values.get(PROVIDER), 1050); assert.equal(f.values.get(HELD), 0)
    await f.settle(id)
    assert.equal(f.values.get(PROVIDER), 1050)
  }
})

test('missing, corrupt, or overflowing provider ledger never seeds replacement funding during release', async () => {
  for (const value of [undefined, NaN, '875', Number.MAX_SAFE_INTEGER]) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    if (value === undefined) f.values.delete(PROVIDER); else f.values.set(PROVIDER, value)
    const before = structuredClone([...f.values])
    assert.equal((await f.settle(id)).status, 503)
    assert.deepEqual([...f.values], before)
  }
})

test('a payment reversal remains effective when an unspent reservation is released', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
  await f.call('/revoke', { id: 'in_unspent', credits: 1500 })
  assert.equal(f.values.get(PROVIDER), -175)
  await f.settle(id)
  assert.equal(f.values.get(PROVIDER), 0); assert.equal(f.values.get('balance'), 0); assert.equal(f.values.get(HELD), 0)
  assert.equal((await f.reserve(crypto.randomUUID())).data.allowed, false)
  await f.settle(id)
  assert.equal(f.values.get(PROVIDER), 0)
})

test('Blueprint admission never gains a Studio release marker and its failed provider budget stays consumed', async () => {
  const f = fixture(); await f.fund(); const id = crypto.randomUUID()
  await f.reserve(id, { channel: 'blueprint' })
  assert.equal(f.job(id).studioProviderReservation, undefined)
  await f.settle(id)
  assert.equal(f.values.get(PROVIDER), 875); assert.equal(f.values.get('balance'), 1500)
})
