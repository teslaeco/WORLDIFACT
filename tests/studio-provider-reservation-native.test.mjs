import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'

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
            list: options => storage.list(options),
            put: async (key, value) => {
              if (fault.armed && key.startsWith('job:') && (value.state === 'failed' || value.blueprintProviderReconciliation)) {
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
  const reserve = (account, id, pricing, status = 200) => call(account, '/reserve', { id, profile: 'slow', channel: 'studio', fingerprint, prompt: 'Inert native Studio fixture', ...(pricing ? { pricing } : {}) }, status)
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

  await t.test('SQLite history pages recover a dismissed terminal job without reading another account or reseeding funds', async () => {
    const account = 'fixture-recovery-page', first = '00000000-0000-4000-8000-000000000001', last = '00000000-0000-4000-8000-000000000002'
    await seed(account)
    for (const id of [first, last]) { await reserve(account, id); await dispatch(account, id); await settle(account, id) }
    await call(account, '/studio-current-clear', { id: last })
    const page = await call(account, '/studio-provider-pending', {})
    assert.deepEqual(page, { ids: [first, last], nextCursor: null, hasMore: false })
    assert.deepEqual(await call(account, '/studio-provider-pending', { cursor: first }), { ids: [last], nextCursor: null, hasMore: false })
    assert.deepEqual(await call('fixture-recovery-other', '/studio-provider-pending', {}), { ids: [], nextCursor: null, hasMore: false })
    const before = await inspect(account, first)
    await reconcile(account, first)
    assert.deepEqual(await call(account, '/studio-provider-pending', {}), { ids: [last], nextCursor: null, hasMore: false })
    const after = await inspect(account, first)
    assert.equal(after.providerCents, before.providerCents + 132)
    assert.equal(after.credits, before.credits)
  })

  await t.test('SQLite Blueprint opt-in fences a preflight refund atomically against late paid dispatch', async () => {
    const account = 'fixture-blueprint-fence', id = crypto.randomUUID()
    await seed(account)
    await call(account, '/reserve', { id, channel: 'blueprint', profile: 'fast', fingerprint, blueprintDispatch: 'fenced-v1' })
    const before = await inspect(account, id)
    await call(account, '/fixture-arm-failure', {})
    await settle(account, id, 503)
    assert.deepEqual(await inspect(account, id), before, 'A failed job write rolls both customer and provider refunds back')
    await Promise.all(Array.from({ length: 8 }, () => settle(account, id)))
    assert.equal((await call(account, '/blueprint-dispatch', { id, fingerprint })).dispatch, false)
    const after = await inspect(account, id)
    assert.equal(after.providerCents, 1050); assert.equal(after.credits, 1500)
    assert.equal(after.job.blueprintProviderReservation.state, 'released')
    const legacy = crypto.randomUUID()
    await call(account, '/reserve', { id: legacy, channel: 'blueprint', profile: 'fast', fingerprint })
    await settle(account, legacy)
    assert.equal((await inspect(account, legacy)).providerCents, 1015, 'An old unversioned caller remains conservative')
  })

  await t.test('SQLite reconciles persisted completed Blueprint usage once, rolls back marker faults and preserves customer charges', async () => {
    const account = 'fixture-blueprint-completed', id = crypto.randomUUID()
    await seed(account)
    await call(account, '/reserve', { id, channel: 'blueprint', profile: 'fast', fingerprint, blueprintDispatch: 'fenced-v1' })
    assert.equal((await call(account, '/blueprint-dispatch', { id, fingerprint })).dispatch, true)
    const blueprint = demoBlueprint('An inert green tower')
    const blueprintSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(blueprint)))), n => n.toString(16).padStart(2, '0')).join('')
    const result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: id, model: 'gpt-6-sol', limitation: 'Inert persisted result; no provider call', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
      evidence: { providerResponseId: 'resp_native_fixture', receivedAt: new Date(NOW).toISOString(), blueprintSha256, inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } }
    assert.equal((await call(account, '/blueprint-complete', { id, result })).saved, true)
    const before = await inspect(account, id)
    assert.deepEqual(await call(account, '/provider-reconciliation-pending', {}), { ids: [], blueprintIds: [id], nextCursor: null, hasMore: false })
    await call(account, '/fixture-arm-failure', {})
    await call(account, '/reconcile-blueprint-provider', { id }, 503)
    assert.deepEqual(await inspect(account, id), before)
    const replies = await Promise.all(Array.from({ length: 8 }, () => call(account, '/reconcile-blueprint-provider', { id })))
    assert.equal(replies.filter(reply => reply.repeated === false).length, 1)
    const after = await inspect(account, id)
    assert.equal(after.providerCents, 1041); assert.equal(after.credits, 1450)
    assert.equal(after.job.blueprintProviderReconciliation.retainedCents, 9)
    assert.deepEqual(await call(account, '/provider-reconciliation-pending', {}), { ids: [], blueprintIds: [], nextCursor: null, hasMore: false })
    assert.equal((await call(account, '/reconcile-blueprint-provider', { id })).repeated, true)
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

  await t.test('tiered SQLite admission holds exact points and funding without increasing grant allocation', async () => {
    for (const pricing of Object.values(STUDIO_PRICING)) {
      const account = 'fixture-tier-' + pricing.tier, id = crypto.randomUUID()
      await seed(account); await reserve(account, id, pricing)
      const before = await inspect(account, id)
      assert.equal(before.providerCents, 1050 - pricing.maxProviderCents)
      assert.equal(before.heldCredits, pricing.points); assert.equal(before.credits, 1500)
      assert.deepEqual(before.job.pricing, pricing)
      assert.equal((await reserve(account, id, pricing)).repeated, true)
      assert.equal((await reserve(account, id, undefined, 429)).reason, 'JOB_PRICING_MISMATCH')
      assert.equal((await reserve(account, id, pricing.tier === 'standard' ? STUDIO_PRICING.extended : STUDIO_PRICING.standard, 429)).reason, 'JOB_PRICING_MISMATCH')
      assert.deepEqual(await inspect(account, id), before)
      await dispatch(account, id)
      const settled = await Promise.all(Array.from({ length: 6 }, () => call(account, '/settle', { id, state: 'completed' })))
      assert.equal(settled.filter(value => value.repeated === false).length, 1)
      const after = await inspect(account, id)
      assert.equal(after.credits, 1500 - pricing.points); assert.equal(after.heldCredits, 0)
      assert.equal(after.providerCents, 1050 - pricing.maxProviderCents)
      await settle(account, id)
      assert.deepEqual(await inspect(account, id), after, 'Terminal completion cannot be refunded by a later failure')
    }
  })

  await t.test('concurrent extended requests consume only existing SQLite funding and never oversubscribe500-point holds', async () => {
    const account = 'fixture-tier-race'; await seed(account)
    const ids = Array.from({ length: 12 }, () => crypto.randomUUID())
    const responses = await Promise.all(ids.map(async id => {
      const response = await mf.dispatchFetch(ORIGIN + '/reserve', { method: 'POST', headers: { 'X-Fixture-Account': account },
        body: JSON.stringify({ id, profile: 'slow', channel: 'studio', fingerprint, pricing: STUDIO_PRICING.extended }) })
      return response.json()
    }))
    assert.equal(responses.filter(value => value.allowed).length, 2)
    assert.ok(responses.filter(value => !value.allowed).every(value => value.reason === 'PROVIDER_BUDGET_EXHAUSTED'))
    const after = await inspect(account, ids.find((_, i) => responses[i].allowed))
    assert.equal(after.providerCents, 250); assert.equal(after.credits, 1500); assert.equal(after.heldCredits, 1000)
  })

  await t.test('tiered terminal reconciliation binds the saved cap, rounds up, and commits its marker once in SQLite', async () => {
    for (const pricing of Object.values(STUDIO_PRICING)) {
      const account = 'fixture-tier-receipt-' + pricing.tier, id = crypto.randomUUID()
      await seed(account); await reserve(account, id, pricing); await dispatch(account, id); await settle(account, id)
      const proof = { ...terminalReceipt(id, 420001), policyRevision: 'astra-low-tiered-v1', capMicroUsd: pricing.maxProviderCents * 10000 }
      assert.equal((await reconcile(account, id)).reason, 'RECEIPT_PRICING_MISMATCH')
      const before = await inspect(account, id)
      await call(account, '/fixture-arm-failure', {})
      await call(account, '/reconcile-studio-provider', { id, receipt: proof }, 503)
      assert.deepEqual(await inspect(account, id), before, 'A failed marker write cannot return any funds')
      const replies = await Promise.all(Array.from({ length: 12 }, () => call(account, '/reconcile-studio-provider', { id, receipt: proof })))
      assert.equal(replies.filter(value => value.repeated === false).length, 1)
      const after = await inspect(account, id)
      assert.equal(after.providerCents, 1007); assert.equal(after.credits, 1500); assert.equal(after.heldCredits, 0)
      assert.equal(after.job.studioProviderReconciliation.originalReservedCents, pricing.maxProviderCents)
      assert.equal(after.job.studioProviderReconciliation.retainedCents, 43)
      assert.equal(after.job.studioProviderReconciliation.releasedCents, pricing.maxProviderCents - 43)
    }
  })

  await t.test('pre-dispatch500-point failure rolls back on error, then returns the400-cent hold once', async () => {
    const account = 'fixture-tier-return', id = crypto.randomUUID()
    await seed(account); await reserve(account, id, STUDIO_PRICING.extended)
    const before = await inspect(account, id)
    await call(account, '/fixture-arm-failure', {}); await settle(account, id, 503)
    assert.deepEqual(await inspect(account, id), before)
    await Promise.all(Array.from({ length: 8 }, () => settle(account, id)))
    assert.equal((await dispatch(account, id)).dispatch, false)
    const after = await inspect(account, id)
    assert.equal(after.providerCents, 1050); assert.equal(after.credits, 1500); assert.equal(after.heldCredits, 0)
    const proof = { ...terminalReceipt(id, 0), policyRevision: 'astra-low-tiered-v1', capMicroUsd: 4000000 }
    assert.equal((await call(account, '/reconcile-studio-provider', { id, receipt: proof })).reason, 'INELIGIBLE_RESERVATION')
    assert.deepEqual(await inspect(account, id), after)
  })

})
