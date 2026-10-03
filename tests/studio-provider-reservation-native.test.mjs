import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const ORIGIN = 'https://native-ledger.example.test'
const fingerprint = 'a'.repeat(64)

test('native SQLite atomically fences undispatched Studio funding release against dispatch and rollback', { timeout: 30_000 }, async t => {
  // The production ledger executes against actual SQLite transactions. Only
  // fixture inspection and a one-shot final-write fault are added by this wrapper.
  const bundle = await build({ stdin: {
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'studio-provider-native-fixture.ts',
    contents: `
      import { AccountEntitlements } from './server/entitlements.ts';
      export class NativeLedger extends AccountEntitlements {
        constructor(state, env) {
          const fault = { armed: false };
          const wrap = storage => ({
            get: key => storage.get(key),
            put: async (key, value) => {
              if (fault.armed && key.startsWith('job:') && value.state === 'failed') {
                fault.armed = false;
                throw new Error('Inert fixture terminal-write failure');
              }
              return storage.put(key, value);
            },
            transaction: callback => storage.transaction(tx => callback(wrap(tx))),
          });
          super({ storage: wrap(state.storage) }, env, () => ${NOW});
          this.fixtureStorage = state.storage;
          this.fixtureFault = fault;
        }
        async fetch(request) {
          const url = new URL(request.url);
          if (url.pathname === '/fixture-arm-failure' && request.method === 'POST') {
            this.fixtureFault.armed = true;
            return Response.json({ armed: true });
          }
          if (url.pathname === '/fixture-inspect') {
            const store = this.fixtureStorage;
            return Response.json({
              providerCents: await store.get('provider-budget-cents:v1'),
              credits: await store.get('balance'),
              heldCredits: await store.get('customer-reserved-credits:v1') ?? 0,
              creatorUsage: await store.get('creator-astra:in_nativefixture') ?? 0,
              job: await store.get('job:' + url.searchParams.get('id')) ?? null,
              current: await store.get('current-studio-job:v1') ?? null,
            });
          }
          return super.fetch(request);
        }
      }
      export default { fetch(request, env) {
        const account = request.headers.get('X-Fixture-Account');
        if (!account || !/^fixture-[a-z0-9-]+$/.test(account)) return new Response(null, { status: 400 });
        const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(account));
        return ledger.fetch(new Request('https://entitlements.internal' + new URL(request.url).pathname + new URL(request.url).search, request));
      } };
    `,
  }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-09-14', cf: false, script: bundle.outputFiles[0].text,
    bindings: { ENABLE_ASTRA_PLANS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Native provider-reservation fixture must never contact a provider') },
  }))
  t.after(() => mf.dispose())
  async function call(account, path, body, expectedStatus = 200) {
    const response = await mf.dispatchFetch(ORIGIN + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'X-Fixture-Account': account },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const value = await response.json()
    assert.equal(response.status, expectedStatus, 'Unexpected inert native-ledger status: ' + JSON.stringify(value))
    return value
  }
  async function seed(account) {
    await call(account, '/grant', { id: 'in_nativefixture', credits: 1500, subscriptionId: 'sub_nativefixture' })
    await call(account, '/subscription', { id: 'sub_nativefixture', until: NOW + 86400_000, active: true, revision: 1, plan: 'creator', grantId: 'in_nativefixture' })
  }
  const reserve = (account, id) => call(account, '/reserve', { id, profile: 'slow', channel: 'studio', fingerprint, prompt: 'Inert native Studio fixture' })
  const settle = (account, id, status = 200) => call(account, '/settle', { id, state: 'failed', failureCode: 'ORACLE_BUSY' }, status)
  const dispatch = (account, id) => call(account, '/studio-dispatch', { id, fingerprint })
  const inspect = (account, id) => call(account, '/fixture-inspect?id=' + id)
  const terminalReceipt = (id, maximumLiabilityMicroUsd = 420001) => ({ revision: 'worldifact-terminal-budget-v1', jobId: id,
    model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd,
    sealed: true, sealId: 'b'.repeat(64) })
  const reconcile = (account, id, status = 200) => call(account, '/reconcile-studio-provider', { id, receipt: terminalReceipt(id) }, status)

  await t.test('failure before dispatch releases once and permanently denies later claims', async () => {
    const account = 'fixture-failure-first', id = crypto.randomUUID()
    await seed(account)
    assert.equal((await reserve(account, id)).allowed, true)
    const reserved = await inspect(account, id)
    assert.equal(reserved.providerCents, 875)
    assert.equal(reserved.heldCredits, 250)
    const results = await Promise.all(Array.from({ length: 8 }, () => settle(account, id)))
    assert.equal(results.filter(result => result.repeated === false).length, 1)
    assert.equal((await dispatch(account, id)).dispatch, false)
    const failed = await inspect(account, id)
    assert.equal(failed.providerCents, 1050)
    assert.equal(failed.credits, 1500)
    assert.equal(failed.heldCredits, 0)
    assert.equal(failed.creatorUsage, 1, 'Provider reservation release does not replenish creator generation allowance')
    assert.equal(failed.job.state, 'failed')
    assert.equal(failed.job.studioProviderReservation.state, 'released')
    assert.equal((await call(account, '/reserve', { id, profile: 'slow', channel: 'studio', fingerprint, prompt: 'Inert native Studio fixture' }, 429)).allowed, false)
    assert.deepEqual(await inspect(account, id), failed)
  })

  await t.test('dispatch before failure retains provider funding and releases only the customer hold', async () => {
    const account = 'fixture-dispatch-first', id = crypto.randomUUID()
    await seed(account); await reserve(account, id)
    assert.equal((await dispatch(account, id)).dispatch, true)
    await settle(account, id)
    const failed = await inspect(account, id)
    assert.equal(failed.providerCents, 875)
    assert.equal(failed.credits, 1500)
    assert.equal(failed.heldCredits, 0)
    assert.equal(failed.job.studioProviderReservation.state, 'reserved')
    assert.equal(failed.job.studioDispatch, 'claimed-v1')
  })

  await t.test('concurrent claims and failure settlements cannot both spend and return one reservation', async () => {
    for (let i = 0; i < 4; i++) {
      const account = 'fixture-race-' + i, id = crypto.randomUUID()
      await seed(account); await reserve(account, id)
      const calls = i % 2 ? [() => settle(account, id), () => dispatch(account, id)] : [() => dispatch(account, id), () => settle(account, id)]
      const results = await Promise.all([...calls, ...calls, ...calls].map(invoke => invoke()))
      const claims = results.filter(result => result.dispatch === true)
      const freshSettlements = results.filter(result => result.settled === true && result.repeated === false)
      assert.ok(claims.length <= 1)
      assert.equal(freshSettlements.length, 1)
      const value = await inspect(account, id)
      assert.equal(value.job.state, 'failed')
      assert.equal(value.credits, 1500)
      assert.equal(value.heldCredits, 0)
      assert.equal(value.providerCents, claims.length ? 875 : 1050)
      assert.equal(value.job.studioProviderReservation.state, claims.length ? 'reserved' : 'released')
    }
  })

  await t.test('a terminal-write failure rolls provider funding and customer hold back in the same SQLite transaction', async () => {
    const account = 'fixture-rollback', id = crypto.randomUUID()
    await seed(account); await reserve(account, id)
    const before = await inspect(account, id)
    await call(account, '/fixture-arm-failure', {})
    await settle(account, id, 503)
    assert.deepEqual(await inspect(account, id), before, 'No partial provider refund, released customer hold or failed marker may escape rollback')
    await settle(account, id)
    const after = await inspect(account, id)
    assert.equal(after.providerCents, 1050)
    assert.equal(after.heldCredits, 0)
    assert.equal(after.job.state, 'failed')
    assert.equal(after.job.studioProviderReservation.state, 'released')
  })

  await t.test('sealed terminal liability reconciles exactly once under concurrent real SQLite transactions', async () => {
    const account = 'fixture-terminal-reconcile', id = crypto.randomUUID()
    await seed(account); await reserve(account, id); await dispatch(account, id); await settle(account, id)
    const before = await inspect(account, id)
    assert.equal(before.providerCents, 875)
    const replies = await Promise.all(Array.from({ length: 12 }, () => reconcile(account, id)))
    assert.equal(replies.filter(value => value.reconciled && value.repeated === false).length, 1)
    const after = await inspect(account, id)
    assert.equal(after.providerCents, 1007)
    assert.equal(after.credits, before.credits); assert.equal(after.heldCredits, before.heldCredits)
    assert.equal(after.creatorUsage, before.creatorUsage); assert.deepEqual(after.current, before.current)
    assert.equal(after.job.studioProviderReconciliation.retainedCents, 43)
    assert.equal((await call(account, '/job', { id })).providerBudgetPending, undefined)
    assert.equal((await dispatch(account, id)).dispatch, false)
    const foreign = await reconcile('fixture-foreign-reconcile', id)
    assert.equal(foreign.reconciled, false); assert.equal(foreign.reason, 'NOT_OWNED')
    await reconcile(account, id)
    assert.deepEqual(await inspect(account, id), after)
  })

  await t.test('terminal receipt marker failure rolls its provider credit back in actual SQLite before one safe retry', async () => {
    const account = 'fixture-reconcile-rollback', id = crypto.randomUUID()
    await seed(account); await reserve(account, id); await dispatch(account, id); await settle(account, id)
    const before = await inspect(account, id)
    await call(account, '/fixture-arm-failure', {})
    await reconcile(account, id, 503)
    assert.deepEqual(await inspect(account, id), before)
    assert.equal((await call(account, '/job', { id })).providerBudgetPending, true)
    assert.equal((await reconcile(account, id)).repeated, false)
    assert.equal((await inspect(account, id)).providerCents, 1007)
    assert.equal((await reconcile(account, id)).repeated, true)
    assert.equal((await inspect(account, id)).providerCents, 1007)
  })

  await t.test('an already returned pre-dispatch reservation cannot also claim terminal receipt credit', async () => {
    const account = 'fixture-reconcile-returned', id = crypto.randomUUID()
    await seed(account); await reserve(account, id); await settle(account, id)
    const before = await inspect(account, id)
    const results = await Promise.all(Array.from({ length: 4 }, () => reconcile(account, id)))
    assert.ok(results.every(value => value.reconciled === false))
    assert.deepEqual(await inspect(account, id), before)
    assert.equal(before.providerCents, 1050)
  })
})
