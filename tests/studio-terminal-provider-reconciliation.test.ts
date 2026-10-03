import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, reconcileUserStudioProvider, type EntitlementStorage } from '../server/entitlements.ts'
import { validateTerminalBudgetReceipt, type TerminalBudgetReceipt } from '../server/studioBudgetReceipt.ts'

const NOW = Date.parse('2026-10-03T12:00:00Z'), PROVIDER = 'provider-budget-cents:v1', fingerprint = 'a'.repeat(64)
const receipt = (jobId: string, maximumLiabilityMicroUsd = 420_001): TerminalBudgetReceipt => ({
  revision: 'worldifact-terminal-budget-v1', jobId, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2',
  capMicroUsd: 1750000, maximumLiabilityMicroUsd, sealed: true, sealId: 'b'.repeat(64),
})
function fixture() {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve(), failKey: string | undefined
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>) {
      const next = queue.then(async () => {
        const draft = structuredClone(values)
        const transaction: EntitlementStorage = {
          async get<V>(key: string) { return structuredClone(draft.get(key)) as V | undefined },
          async put(key, value) {
            if (key === failKey) throw new Error('Inert transaction failure')
            draft.set(key, structuredClone(value))
          }, transaction: async fn => fn(transaction),
        }
        const result = await callback(transaction)
        values.clear(); for (const [key, value] of draft) values.set(key, value)
        return result
      })
      queue = next.catch(() => undefined)
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
  return {
    values, call,
    async fund() {
      await call('/grant', { id: 'in_terminal', credits: 1500, subscriptionId: 'sub_terminal' })
      await call('/subscription', { id: 'sub_terminal', active: true, until: NOW + 86_400_000, revision: 1, plan: 'creator', grantId: 'in_terminal' })
    },
    reserve: (id: string) => call('/reserve', { id, channel: 'studio', profile: 'slow', fingerprint }),
    dispatch: (id: string) => call('/studio-dispatch', { id, fingerprint }),
    settle: (id: string, state = 'failed') => call('/settle', { id, state, ...(state === 'failed' ? { failureCode: 'ASTRA_COST_LIMIT' } : {}) }),
    reconcile: (id: string, proof: unknown = receipt(id)) => call('/reconcile-studio-provider', { id, receipt: proof }),
    job: (id: string) => structuredClone(values.get(`job:${id}`)) as Record<string, unknown>,
    restart() { object = new AccountEntitlements({ storage }, { ENABLE_ASTRA_PLANS: 'true' }, () => NOW) },
    failWrite(key?: string) { failKey = key },
  }
}
async function terminal(state = 'failed') {
  const f = fixture(), id = crypto.randomUUID(); await f.fund(); await f.reserve(id); await f.dispatch(id); await f.settle(id, state)
  return { f, id }
}

test('terminal budget receipt accepts only exact authenticated-policy fields and job identity', async () => {
  const id = crypto.randomUUID(), valid = receipt(id)
  assert.equal(validateTerminalBudgetReceipt(valid, id), true)
  const invalid: unknown[] = [null, [], '', { ...valid, jobId: crypto.randomUUID() }, { ...valid, jobId: id.toUpperCase() },
    { ...valid, sealed: false }, { ...valid, sealed: 'true' }, { ...valid, sealId: 'c'.repeat(63) }, { ...valid, sealId: 'B'.repeat(64) },
    { ...valid, model: 'gpt-6-sol' }, { ...valid, policyRevision: 'astra-usd175-v1' }, { ...valid, revision: 'unknown' },
    { ...valid, capMicroUsd: 4000000 }, { ...valid, capMicroUsd: '1750000' }, { ...valid, maximumLiabilityMicroUsd: -1 },
    { ...valid, maximumLiabilityMicroUsd: 1750001 }, { ...valid, maximumLiabilityMicroUsd: 0.1 }, { ...valid, maximumLiabilityMicroUsd: '0' },
    { ...valid, maximumLiabilityMicroUsd: NaN }, { ...valid, maximumLiabilityMicroUsd: Infinity }, { ...valid, extra: 'untrusted' }]
  for (const field of Object.keys(valid)) { const value = { ...valid } as Record<string, unknown>; delete value[field]; invalid.push(value) }
  for (const value of invalid) {
    assert.equal(validateTerminalBudgetReceipt(value, id), false)
    const { f, id: owned } = await terminal(), before = structuredClone([...f.values])
    assert.equal((await f.reconcile(owned, value)).status, 400)
    assert.deepEqual([...f.values], before)
  }
  let calls = 0
  const env = { ACCOUNT_ENTITLEMENTS: { idFromName: (name: string) => name, get: () => ({ fetch: async () => { calls++; return Response.json({}) } }) } }
  await assert.rejects(() => reconcileUserStudioProvider(env, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, { ...valid, capMicroUsd: 4000000 } as unknown as TerminalBudgetReceipt))
  assert.equal(calls, 0, 'Invalid receipts cannot reach the account object through the wrapper')
})

test('a sealed conservative liability returns only unused ordinary cents once and leaves customer settlement intact', async () => {
  for (const state of ['completed', 'failed']) {
    const { f, id } = await terminal(state), before = structuredClone([...f.values])
    assert.equal((await f.call('/job', { id })).data.providerBudgetPending, true)
    const results = await Promise.all(Array.from({ length: 16 }, () => f.reconcile(id)))
    assert.equal(results.filter(value => value.data.repeated === false).length, 1)
    for (const value of results) assert.equal(value.data.releasedCents, 132)
    assert.equal(f.values.get(PROVIDER), 1007, 'ceil(420001 microUSD) retains43c of the original175c')
    assert.equal(f.values.get('balance'), state === 'completed' ? 1250 : 1500)
    for (const [key, value] of before) if (key !== PROVIDER && key !== `job:${id}`) assert.deepEqual(f.values.get(key), value, key)
    assert.equal((await f.call('/job', { id })).data.providerBudgetPending, undefined)
    assert.doesNotMatch(JSON.stringify((await f.call('/job', { id })).data), /sealId|Liability|releasedCents|studioProviderReconciliation/)
    f.restart()
    assert.equal((await f.reconcile(id)).data.repeated, true)
    assert.equal(f.values.get(PROVIDER), 1007)
    assert.equal((await f.dispatch(id)).data.dispatch, false)
  }
})

test('cent rounding never releases any part of outstanding liability, including full cap and zero', async () => {
  for (const liability of [0, 1, 9999, 10000, 10001, 1740001, 1749999, 1750000]) {
    const { f, id } = await terminal(), retained = Math.ceil(liability / 10_000)
    const result = await f.reconcile(id, receipt(id, liability))
    assert.equal(result.data.retainedCents, retained)
    assert.equal(result.data.releasedCents, 175 - retained)
    assert.equal(f.values.get(PROVIDER), 1050 - retained)
    assert.equal((await f.call('/job', { id })).data.providerBudgetPending, undefined, 'Even a0c release records completion')
  }
})

test('historical hold-v1 ordinary Studio rows reconcile only with intact source-proven reservation shape', async () => {
  const { f, id } = await terminal(), job = f.job(id)
  delete job.studioProviderReservation; delete job.studioDispatch; delete job.studioDispatchUntil
  f.values.set(`job:${id}`, job)
  assert.equal((await f.call('/job', { id })).data.providerBudgetPending, true)
  assert.equal((await f.reconcile(id)).data.reconciled, true)
  assert.equal(f.values.get(PROVIDER), 1007)
  f.restart(); assert.equal((await f.reconcile(id)).data.repeated, true)
  assert.equal(f.values.get(PROVIDER), 1007)
})

test('foreign, pending, refunded, free, malformed, support and older unknown rows never release provider funds', async () => {
  const variants: [string, (job: Record<string, unknown>) => void][] = [
    ['nonterminal', job => { job.state = 'reserved' }], ['wrong channel', job => { job.channel = 'blueprint' }],
    ['unknown channel', job => { delete job.channel }], ['free', job => { job.kind = 'free'; job.cost = 0 }],
    ['legacy debit', job => { delete job.billingMode }], ['price mismatch', job => { job.cost = 500 }],
    ['wrong model', job => { job.model = 'luna' }], ['fast', job => { job.profile = 'fast' }],
    ['fingerprint absent', job => { delete job.fingerprint }], ['fingerprint malformed', job => { job.fingerprint = 'bad' }],
    ['missing settlement time', job => { delete job.updatedAt }], ['invalid time', job => { job.at = 0 }],
    ['original support', job => { job.supportApprovalId = crypto.randomUUID() }], ['supplemental', job => { job.supplementalGrantId = crypto.randomUUID() }],
    ['undefined support marker', job => { job.supportApprovalId = undefined }], ['null supplemental marker', job => { job.supplementalGrantId = null }],
    ['returned reservation', job => { (job.studioProviderReservation as Record<string, unknown>).state = 'released' }],
    ['wrong provider amount', job => { (job.studioProviderReservation as Record<string, unknown>).amountCents = 350 }],
    ['undefined reservation', job => { job.studioProviderReservation = undefined }], ['null reservation', job => { job.studioProviderReservation = null }],
    ['historical unknown field', job => { delete job.studioProviderReservation; job.unknownFunding = 'unverified' }],
    ['undefined historical dispatch', job => { delete job.studioProviderReservation; job.studioDispatch = undefined }],
    ['invalid dispatch deadline', job => { job.studioDispatchUntil = NOW + 86_400_000 }],
  ]
  for (const [label, mutate] of variants) {
    const { f, id } = await terminal(), job = f.job(id); mutate(job); f.values.set(`job:${id}`, job)
    const before = structuredClone([...f.values])
    assert.equal((await f.call('/job', { id })).data.providerBudgetPending, undefined, label)
    assert.equal((await f.reconcile(id)).data.reconciled, false, label)
    assert.deepEqual([...f.values], before, label)
  }
  const f = fixture(); await f.fund(); const before = structuredClone([...f.values])
  assert.equal((await f.reconcile(crypto.randomUUID())).data.reason, 'NOT_OWNED')
  assert.deepEqual([...f.values], before)
})

test('pre-dispatch refund and terminal reconciliation cannot return one reservation twice in either order', async () => {
  for (const first of ['settle', 'reconcile']) {
    const f = fixture(); await f.fund(); const id = crypto.randomUUID(); await f.reserve(id)
    const calls = first === 'settle' ? [() => f.settle(id), () => f.reconcile(id, receipt(id, 0))] : [() => f.reconcile(id, receipt(id, 0)), () => f.settle(id)]
    await Promise.all([...calls, ...calls, ...calls].map(call => call()))
    assert.equal(f.values.get(PROVIDER), 1050)
    assert.equal((await f.reconcile(id, receipt(id, 0))).data.reconciled, false)
    assert.equal(f.values.get(PROVIDER), 1050)
    assert.equal((await f.call('/job', { id })).data.providerBudgetPending, undefined)
    assert.equal((await f.dispatch(id)).data.dispatch, false)
  }
})

test('a conflicting immutable seal or amount cannot issue incremental second credit', async () => {
  const { f, id } = await terminal(); await f.reconcile(id)
  const before = structuredClone([...f.values])
  for (const proof of [{ ...receipt(id), sealId: 'c'.repeat(64) }, receipt(id, 0), receipt(id, 1750000)]) {
    assert.equal((await f.reconcile(id, proof)).data.reason, 'RECEIPT_CONFLICT')
    assert.deepEqual([...f.values], before)
  }
  const job = f.job(id); job.studioProviderReconciliation = undefined; f.values.set(`job:${id}`, job)
  const malformed = structuredClone([...f.values])
  assert.equal((await f.reconcile(id)).data.reason, 'UNVERIFIED_RECONCILIATION')
  assert.equal((await f.call('/job', { id })).data.providerBudgetPending, undefined)
  assert.deepEqual([...f.values], malformed)
})

test('ledger and receipt marker commit together, and missing or unsafe balances never trigger re-seeding', async () => {
  for (const fault of ['provider-write', 'job-write', undefined, NaN, '875', Number.MAX_SAFE_INTEGER]) {
    const { f, id } = await terminal()
    if (fault === 'provider-write') f.failWrite(PROVIDER)
    else if (fault === 'job-write') f.failWrite(`job:${id}`)
    else if (fault === undefined) f.values.delete(PROVIDER)
    else f.values.set(PROVIDER, fault)
    const before = structuredClone([...f.values])
    assert.equal((await f.reconcile(id)).status, 503)
    assert.deepEqual([...f.values], before)
    if (fault === 'provider-write' || fault === 'job-write') {
      f.failWrite(); f.restart(); assert.equal((await f.reconcile(id)).data.repeated, false)
      assert.equal(f.values.get(PROVIDER), 1007)
    }
  }
})

test('reversed payment and billing review remain effective after only unused provider funds are reconciled', async () => {
  const { f, id } = await terminal()
  await f.call('/revoke', { id: 'in_terminal', credits: 1500, review: true })
  assert.equal(f.values.get(PROVIDER), -175)
  await f.reconcile(id)
  assert.equal(f.values.get(PROVIDER), -43, 'The known conservative spent liability remains debt')
  assert.equal(f.values.get('balance'), 0); assert.equal(f.values.get('billingHold'), true)
  assert.equal(f.values.get('creator-astra:in_terminal'), 1)
  assert.equal((await f.reserve(crypto.randomUUID())).data.reason, 'BILLING_REVIEW_REQUIRED')
})
