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
})
