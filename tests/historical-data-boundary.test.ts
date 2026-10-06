import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { HISTORICAL_ARCHIVE_PREFIX, historicalDataBoundary, historicalJobKey, historicalInternalUrl } from '../server/historicalDataBoundary.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { billingApi, type BillingEnv } from '../server/billing.ts'

const USER = '11111111-2222-4333-8444-555555555555'
const NOW = Date.now()
const oldJobId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const archived = (key: string) => `${HISTORICAL_ARCHIVE_PREFIX}${key}`
function ledger(initial: Record<string, unknown> = {}) {
  let values = new Map(Object.entries(initial)), queued: Promise<unknown> = Promise.resolve()
  let failKey = ''
  const writes: string[] = []
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put() { throw new Error('Writes must be transactional') },
    transaction<T>(callback: (value: EntitlementStorage) => Promise<T>) {
      const task = queued.then(async () => {
        const draft = structuredClone(values)
        const transaction: EntitlementStorage = {
          async get<T>(key: string) { return structuredClone(draft.get(key)) as T | undefined },
          async put(key, value) { writes.push(key); if (key === failKey) throw new Error('Simulated storage failure'); draft.set(key, structuredClone(value)) },
          async transaction() { throw new Error('Nested transaction') },
        }
        const result = await callback(transaction)
        values = draft
        return result
      })
      queued = task.catch(() => undefined)
      return task
    },
  }
  let account = new AccountEntitlements({ storage }, {}, () => NOW)
  return {
    storage, writes,
    snapshot: () => Object.fromEntries(structuredClone(values)),
    failWrite: (key: string) => { failKey = key },
    restart: () => { account = new AccountEntitlements({ storage }, {}, () => NOW) },
    async call(path: string, body?: unknown) {
      const response = await account.fetch(new Request(historicalInternalUrl('https://ledger.test', path), { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
      return { status: response.status, value: await response.json() as Record<string, unknown> }
    },
    fetch: (request: Request) => account.fetch(request),
  }
}
const subscription = { id: 'sub_existing', active: true, until: NOW + 30 * 86400_000, revision: NOW - 1000, plan: 'pro', grantId: 'in_existing' }
const preserved = { balance: 1200, 'customer-reserved-credits:v1': 0, 'provider-budget-cents:v1': 60, subscription,
  customer: 'cus_existing', 'grant:in_existing': { credits: 4500, revoked: 0, subscriptionId: 'sub_existing' },
  'paypal:order:1AB23456CD789012E': { id: USER }, 'astra-support-once:v1': { consumed: true },
}

test('historical status never writes, hides modern jobs, and preserves every existing financial row', async () => {
  const initial = { ...preserved, [`job:${oldJobId}`]: { profile: 'slow', state: 'completed', kind: 'credits', cost: 250, billingMode: 'hold-v1', at: NOW - 1000 } }
  const f = ledger(initial)
  assert.equal((await f.call('/status')).value.credits, 1200)
  assert.equal((await f.call('/job', { id: oldJobId })).value.owned, false)
  assert.equal((await f.call('/reserve', { id: oldJobId, profile: 'slow' })).value.reason, 'ARCHIVED_JOB_REQUIRES_REVIEW')
  assert.equal((await f.call('/settle', { id: oldJobId, state: 'failed' })).value.settled, false)
  assert.deepEqual(f.snapshot(), initial)
  assert.equal(f.writes.length, 0)
})

test('modern held jobs cannot be refunded, charged, replayed or spent by historical handlers', async () => {
  for (const state of ['reserved', 'completed', 'failed']) {
    const initial = { ...preserved, 'customer-reserved-credits:v1': 250, [`job:${oldJobId}`]: { profile: 'slow', state, kind: 'credits', cost: 250, billingMode: 'hold-v1', at: NOW - 1000 } }
    const f = ledger(initial)
    for (const next of ['completed', 'failed']) assert.equal((await f.call('/settle', { id: oldJobId, state: next })).value.settled, false)
    assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).value.reason, 'BILLING_REVIEW_REQUIRED')
    assert.equal((await f.call('/status')).value.billingReview, true)
    f.restart()
    assert.equal((await f.call('/reserve', { id: oldJobId, profile: 'slow' })).value.allowed, false)
    assert.deepEqual(f.snapshot(), initial)
  }
})

test('invalid held-credit state fails closed without changing anything', async () => {
  for (const held of [-1, 1.5, '250', null, Number.MAX_SAFE_INTEGER + 1]) {
    const initial = { ...preserved, 'customer-reserved-credits:v1': held }, f = ledger(initial)
    assert.equal((await f.call('/status')).status, 503)
    assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).status, 503)
    assert.deepEqual(f.snapshot(), initial)
  }
})

test('60 provider cents still cannot meet the historical 175-cent Astra gate', async () => {
  const f = ledger(preserved)
  assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'slow' })).value.reason, 'PROVIDER_BUDGET_EXHAUSTED')
  assert.deepEqual(f.snapshot(), preserved)
})

test('new historical jobs archive exact originals before writes and refunds never replenish provider budget', async () => {
  const f = ledger(preserved), id = crypto.randomUUID()
  const replies = await Promise.all(Array.from({ length: 6 }, () => f.call('/reserve', { id, profile: 'fast' })))
  assert.equal(replies.filter(reply => reply.value.repeated === false).length, 1)
  assert.equal(f.snapshot().balance, 1150)
  assert.equal(f.snapshot()['provider-budget-cents:v1'], 25)
  assert.deepEqual(f.snapshot()[archived('balance')], { existed: true, value: 1200 })
  assert.deepEqual(f.snapshot()[archived('provider-budget-cents:v1')], { existed: true, value: 60 })
  assert.deepEqual(f.snapshot()[archived(historicalJobKey(id))], { existed: false })
  assert.ok(f.writes.indexOf(archived('balance')) < f.writes.indexOf('balance'))
  assert.equal(f.snapshot()[`job:${id}`], undefined)
  f.restart()
  for (let i = 0; i < 3; i++) await f.call('/settle', { id, state: 'failed' })
  assert.equal(f.snapshot().balance, 1200)
  assert.equal(f.snapshot()['provider-budget-cents:v1'], 25)
  assert.deepEqual(f.snapshot()[archived('balance')], { existed: true, value: 1200 })
  assert.deepEqual(f.snapshot()[archived(historicalJobKey(id))], { existed: false })
  for (const [key, value] of Object.entries(preserved)) if (!['balance', 'provider-budget-cents:v1'].includes(key)) assert.deepEqual(f.snapshot()[key], value)
})

test('archive failures and corrupt archive entries abort all dependent financial writes', async () => {
  for (const corrupt of [false, true]) {
    const initial = { ...preserved, ...(corrupt ? { [archived('balance')]: { existed: true } } : {}) }
    const f = ledger(initial)
    if (!corrupt) f.failWrite(archived('balance'))
    assert.equal((await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast' })).status, 503)
    assert.deepEqual(f.snapshot(), initial)
  }
})

test('boundary refuses direct, nested and archive-overwriting writes', async () => {
  const f = ledger(), boundary = historicalDataBoundary(f.storage)
  await assert.rejects(boundary.put('balance', 1), /require a transaction/)
  await assert.rejects(boundary.transaction(tx => tx.put(archived('balance'), {})), /immutable/)
  await assert.rejects(boundary.transaction(tx => tx.transaction(async () => 1)), /Nested/)
  assert.deepEqual(f.snapshot(), {})
})

const secret = 'whsec_historical_test'
async function event(type: string, id: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const payload = JSON.stringify({ id: 'evt_historical', type, created: timestamp, livemode: false, data: { object: { id } } })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))).toString('hex')
  return new Request('https://worldifact.test/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: payload })
}
function billingFixture() {
  const f = ledger(preserved), end = Math.floor(subscription.until / 1000), start = Math.floor(NOW / 1000) - 100
  const env: BillingEnv = { ENABLE_BILLING: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', ACCOUNT_LEDGER_MODE: 'sandbox', STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: secret, STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_fixture',
    STRIPE_SUBSCRIPTION_PRICE_ID: 'price_creator', STRIPE_PRO_PRICE_ID: 'price_pro', STRIPE_STUDIO_PRICE_ID: 'price_studio',
    STRIPE_SUBSCRIPTION_INTERVAL: 'month', BILLING_PUBLIC_ORIGIN: 'https://worldifact.test', ENABLE_ASTRA_PLANS: 'false',
    ACCOUNT_ENTITLEMENTS: { idFromName: name => name, get: () => ({ fetch: f.fetch }) },
  }
  const sub: Record<string, unknown> = { livemode: false, id: 'sub_existing', customer: 'cus_existing', status: 'active', metadata: { worldifact_uid: USER },
    current_period_end: end, latest_invoice: 'in_existing', items: { data: [{ price: 'price_pro', quantity: 1 }] } }
  const invoice: Record<string, unknown> = { livemode: false, id: 'in_existing', customer: 'cus_existing', subscription: 'sub_existing', paid: true, status: 'paid',
    amount_paid: 9999, total: 9999, currency: 'usd', billing_reason: 'subscription_update',
    lines: { data: [{ price: 'price_pro', quantity: 1, amount: 9999, currency: 'usd', period: { start, end } }] } }
  let latest = invoice
  const history: Record<string, unknown> = { data: [invoice], has_more: false }
  const seen: string[] = []
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(init?.method, 'GET', 'Reconciliation must never create a provider purchase')
    const url = String(input); seen.push(url)
    if (url.endsWith('/subscriptions/sub_existing')) return Response.json(sub)
    if (url.endsWith('/prices/price_pro')) return Response.json({ id: 'price_pro', livemode: false, active: true, unit_amount: 9999, currency: 'usd', type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } })
    if (url.endsWith(`/invoices/${sub.latest_invoice}`)) return Response.json(latest)
    if (url.endsWith('/invoices?subscription=sub_existing&status=paid&limit=100')) return Response.json(history)
    if (url.endsWith('/charges/ch_existing')) return Response.json({ id: 'ch_existing', livemode: false, customer: 'cus_existing', invoice: 'in_existing', amount_refunded: 9999 })
    throw new Error(`Unexpected stubbed request: ${url}`)
  }) as typeof fetch
  return { ...f, env, sub, invoice, history, seen, fetcher, setLatest(value: Record<string, unknown>) { latest = value; sub.latest_invoice = value.id } }
}

test('existing paid upgrade invoices reconcile once while new Pro purchases remain disabled', async () => {
  const f = billingFixture()
  const status = await (await billingApi(new Request('https://worldifact.test/api/billing/status'), f.env, f.fetcher))!.json() as { plans: { pro: { checkoutReady: boolean } } }
  assert.equal(status.plans.pro.checkoutReady, false)
  for (let i = 0; i < 3; i++) assert.equal((await billingApi(await event('invoice.paid', 'in_existing'), f.env, f.fetcher))?.status, 200)
  assert.equal(f.snapshot().balance, 1200)
  assert.equal(f.snapshot()['provider-budget-cents:v1'], 60)
  assert.equal((f.snapshot().subscription as typeof subscription).active, true)
  assert.equal((f.snapshot().subscription as typeof subscription).grantId, 'in_existing')
  assert.deepEqual(f.snapshot()[archived('subscription')], { existed: true, value: subscription })
})

test('an unpaid pending upgrade cannot erase or regrant the already paid current period', async () => {
  const f = billingFixture()
  f.sub.pending_update = { subscription_items: [{ price: 'price_studio', quantity: 1 }] }
  f.setLatest({ ...f.invoice, id: 'in_unpaid', paid: false, status: 'open', amount_paid: 0 })
  assert.equal((await billingApi(await event('customer.subscription.updated', 'sub_existing'), f.env, f.fetcher))?.status, 200)
  assert.equal(f.snapshot().balance, 1200)
  assert.equal(f.snapshot()['provider-budget-cents:v1'], 60)
  assert.equal((f.snapshot().subscription as typeof subscription).active, true)
  assert.equal((f.snapshot().subscription as typeof subscription).grantId, 'in_existing')
  assert.equal(f.snapshot()['grant:in_unpaid'], undefined)
})

test('missing, ambiguous, foreign or paginated paid-period evidence preserves the existing ledger for review', async () => {
  for (const variant of ['missing', 'ambiguous', 'foreign', 'paginated']) {
    const f = billingFixture()
    f.sub.pending_update = {}
    f.setLatest({ ...f.invoice, id: 'in_unpaid', paid: false, status: 'open', amount_paid: 0 })
    if (variant === 'missing') f.history.data = []
    if (variant === 'ambiguous') f.history.data = [f.invoice, { ...f.invoice, id: 'in_second' }]
    if (variant === 'foreign') f.history.data = [{ ...f.invoice, customer: 'cus_other' }]
    if (variant === 'paginated') f.history.has_more = true
    assert.equal((await billingApi(await event('customer.subscription.updated', 'sub_existing'), f.env, f.fetcher))?.status, 503)
    assert.deepEqual(f.snapshot(), preserved)
  }
})

test('an actual reversal of a paid upgrade remains effective and idempotent after rollback', async () => {
  const f = billingFixture()
  for (let i = 0; i < 2; i++) assert.equal((await billingApi(await event('charge.refunded', 'ch_existing'), f.env, f.fetcher))?.status, 200)
  assert.equal(f.snapshot().balance, 1200 - 4500)
  assert.equal(f.snapshot()['provider-budget-cents:v1'], 60 - 3150)
  assert.equal((f.snapshot().subscription as typeof subscription).active, false)
  assert.deepEqual(f.snapshot()[archived('balance')], { existed: true, value: 1200 })
})


test('late modern reserve requests are rejected before any new historical row or financial mutation', async () => {
  for (const extra of [{ fingerprint: 'a'.repeat(64) }, { channel: 'studio', prompt: 'A model' }, { channel: 'blueprint', blueprintDispatch: 'fenced-v1' }, { pricing: {} }, { providerModel: 'gpt-6-sol' }, { supportApprovalId: 'old-approval' }]) {
    const f = ledger(preserved)
    const result = await f.call('/reserve', { id: crypto.randomUUID(), profile: 'fast', model: 'sol', ...extra })
    assert.equal(result.status, 400)
    assert.deepEqual(f.snapshot(), preserved)
    assert.equal(f.writes.length, 0)
  }
})

test('global counters and submitted IDs are archived before change without resetting seed or grant markers', async () => {
  const submitted = crypto.randomUUID(), nextId = crypto.randomUUID()
  const initial = { 'reserved-attempts': 12, [`studio-submitted:${submitted}`]: 1, 'promo-seed-applied': 1,
    'promo-funded-jobs': 10, 'promo-used-jobs': 4, 'promo-revoked-jobs': 2, 'promo-funded:in_existing': 1 }
  const f = ledger(initial), env = { GENERATION_REQUEST_LIMIT: 'unlimited', FREE_SOL_SEED_JOBS: '10' }
  let budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, env)
  const call = async (path: string, body?: unknown) => {
    const response = await budget.fetch(new Request(historicalInternalUrl('https://budget.test', path), { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    return { status: response.status, value: await response.json() as Record<string, unknown> }
  }
  assert.equal((await call('/promo-status')).value.funded, 10)
  assert.equal((await call('/reserve-studio', { id: submitted })).status, 409)
  assert.equal((await call('/promo-fund', { id: 'in_existing', jobs: 10 })).value.repeated, true)
  assert.deepEqual(f.snapshot(), initial)
  assert.equal((await call('/reserve-studio', { id: nextId })).status, 200)
  assert.equal(f.snapshot()['reserved-attempts'], 13)
  assert.equal(f.snapshot()[archived('number:reserved-attempts')], 12)
  assert.equal(f.snapshot()[archived(`absent:studio-submitted:${nextId}`)], 1)
  assert.ok(f.writes.indexOf(archived('number:reserved-attempts')) < f.writes.indexOf('reserved-attempts'))
  budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, env)
  assert.equal((await call('/reserve-studio', { id: nextId })).status, 409)
  assert.equal((await call('/promo-reserve', { id: nextId })).status, 200)
  assert.equal(f.snapshot()['promo-used-jobs'], 5)
  assert.equal(f.snapshot()[archived('number:promo-used-jobs')], 4)
  assert.equal(f.snapshot()['promo-funded-jobs'], 10)
  assert.equal(f.snapshot()['promo-seed-applied'], 1)
  assert.equal(f.snapshot()['promo-funded:in_existing'], 1)
})

test('failure to archive a global budget counter aborts reservation and idempotency marker together', async () => {
  const initial = { 'reserved-attempts': 12 }, f = ledger(initial)
  f.failWrite(archived('number:reserved-attempts'))
  const budget = new GenerationBudget({ storage: f.storage as BudgetStorage }, { GENERATION_REQUEST_LIMIT: 'unlimited' })
  const response = await budget.fetch(new Request(historicalInternalUrl('https://budget.test', '/reserve-studio'), { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID() }) }))
  assert.equal(response.status, 503)
  assert.deepEqual(f.snapshot(), initial)
})
