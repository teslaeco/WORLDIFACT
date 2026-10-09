import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { FAILED_HOLD_WAIVER_APPROVAL } from '../src/lib/failedHoldWaiver.ts'
import { isPointSettlement } from '../src/lib/paidPointsFunding.ts'
import { paidPointsJob } from '../server/entitlements.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = '31c9e41a6f8a68bb6c7bbe748e79803f63835c36'
const DIGESTS = {
  'server/entitlements.ts': '6723db5c4aaee4a12ef57b8e7a47c120cfc8318301d7f85543e6157b5c4d985a',
  'server/paidPointsStorage.ts': 'ba1fe5d2f83035abb28ee89fc4b480c5fc937058ed449d58f164ef2ba28a073a',
  'src/lib/paidPointsFunding.ts': '430f4d356b89cce063f14e92613ddd5ccacf822b172eb3f4d93fda7d6e64fedc',
}
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const IDS = [1, 2, 3, 4].map(index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
const FINGERPRINT = 'a'.repeat(64)
const NOW = Date.parse('2026-10-09T03:00:00Z')
const ROUTE = '/generation-v3'
const PAID = 'paid-points-job:v2:'
const HELD = 'customer-reserved-credits:v1'

const requestFor = id => ({ id, fingerprint: FINGERPRINT, profile: 'slow', channel: 'studio', model: 'astra',
  prompt: 'Synthetic incident compatibility fixture',
  requiredFundingMode: 'paid-membership-held-points-v1', paidPointsPolicy: 'paid-membership-held-points-v1' })
const receiptFor = (id, maximumLiabilityMicroUsd = 810000) => ({ revision: 'worldifact-terminal-budget-v1',
  jobId: id, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000,
  maximumLiabilityMicroUsd, sealed: true, sealId: 'b'.repeat(64) })

async function fixture(t) {
  const pinned = JSON.parse(await readFile(new URL('./fixtures/failed-hold-waiver-prewaiver-v3.source.txt', import.meta.url), 'utf8'))
  assert.equal(pinned.version, 1)
  assert.equal(pinned.baseCommit, BASE)
  assert.deepEqual(Object.keys(pinned.sources).sort(), Object.keys(DIGESTS).sort())
  for (const [path, digest] of Object.entries(DIGESTS))
    assert.equal(createHash('sha256').update(pinned.sources[path]).digest('hex'), digest, `${path} must be the actual pre-waiver source`)
  const older = JSON.parse(await readFile(new URL('./fixtures/paid-points-legacy-entitlements.source.txt', import.meta.url), 'utf8'))
  assert.equal(createHash('sha256').update(older.legacyEntitlements).digest('hex'),
    '9d10cd34c270d5bf240a69187b45f3ef3c8df9ea1767b4506967a9ad0688ec3a')
  const bundle = await build({ stdin: { resolveDir: ROOT, sourcefile: 'failed-hold-waiver-old-readers-fixture.ts', contents: `
    import { AccountEntitlements as BeforeWaiver } from 'pinned-prewaiver';
    import { AccountEntitlements as BeforePaidPolicy } from 'pinned-prepolicy';
    export class NativeLedger {
      constructor(state, env) {
        this.storage = state.storage;
        this.beforeWaiver = new BeforeWaiver(state, env, () => ${NOW});
        this.beforePaidPolicy = new BeforePaidPolicy(state, env, () => ${NOW});
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.storage.list()));
        if (path === '/fixture-patch') {
          const rows = await request.json();
          await this.storage.transaction(tx => tx.put(rows));
          return Response.json({ patched: true });
        }
        return (request.headers.get('X-Fixture-Reader') === 'prepolicy' ? this.beforePaidPolicy : this.beforeWaiver).fetch(request);
      }
    }
    export default { fetch(request, env) {
      return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('account:v1:${ACCOUNT}')).fetch(request);
    } };
  ` }, plugins: [{ name: 'exact-prewaiver-readers', setup(build) {
    build.onResolve({ filter: /^pinned-prewaiver$/ }, () => ({ path: 'server/entitlements.ts', namespace: 'prewaiver' }))
    build.onResolve({ filter: /^\.\.?\//, namespace: 'prewaiver' }, args => {
      const path = new URL(args.path, 'file:///' + args.importer).pathname.slice(1)
      return Object.hasOwn(pinned.sources, path) ? { path, namespace: 'prewaiver' } : { path: ROOT + '/' + path }
    })
    build.onLoad({ filter: /.*/, namespace: 'prewaiver' }, args => ({ contents: pinned.sources[args.path], loader: 'ts',
      resolveDir: ROOT + '/' + args.path.slice(0, args.path.lastIndexOf('/')) }))
    build.onResolve({ filter: /^pinned-prepolicy$/ }, () => ({ path: 'legacy-entitlements', namespace: 'prepolicy' }))
    build.onLoad({ filter: /.*/, namespace: 'prepolicy' }, () => ({ contents: older.legacyEntitlements, loader: 'ts', resolveDir: ROOT + '/server' }))
  } }], bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { ENABLE_ASTRA_PLANS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Inert compatibility tests cannot contact a provider') },
  }))
  t.after(() => mf.dispose())
  async function call(path, body, expected = 200, reader = 'prewaiver') {
    const response = await mf.dispatchFetch('https://inert-waiver-fixture.example.test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Fixture-Reader': reader, 'X-WORLDIFACT-Verified-Account': ACCOUNT },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const value = await response.json()
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${reader} ${path}: ${response.status} ${JSON.stringify(value)}`)
    return value
  }
  const inspect = () => call('/fixture-inspect')
  await call('/grant', { id: 'in_PreWaiverFixture', credits: 1500, subscriptionId: 'sub_PreWaiverFixture' })
  await call('/subscription', { id: 'sub_PreWaiverFixture', active: true, until: NOW + 86400000,
    revision: 1, plan: 'creator', grantId: 'in_PreWaiverFixture' })
  for (const id of IDS) {
    assert.equal((await call(ROUTE + '/reserve', requestFor(id))).allowed, true)
    assert.equal((await call(ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT })).dispatch, true)
    await call(ROUTE + '/settle', { id, state: 'failed', failureCode: 'STUDIO_TIMEOUT' })
    await call(ROUTE + '/reconcile-studio-provider', { id, receipt: receiptFor(id) })
  }
  await call('/fixture-patch', { balance: 1190 })
  const before = await inspect()
  assert.equal(before[HELD], 1000)
  // These rows test old-reader behavior only. New-writer authority, complete audit
  // binding and native transaction application are covered by the waiver tests.
  const pointSettlement = { version: 1, state: 'waived', heldPoints: 0, chargedPoints: 0, approvalId: FAILED_HOLD_WAIVER_APPROVAL }
  assert.equal(isPointSettlement(pointSettlement, 250), true, 'Use the actual new settlement contract')
  const waivedRows = Object.fromEntries(IDS.map(id => [PAID + id, { ...before[PAID + id], pointSettlement }]))
  for (const id of IDS) assert.equal(paidPointsJob(waivedRows[PAID + id], id), true, 'Use structurally valid incident-waived jobs')
  await call('/fixture-patch', { ...waivedRows, [HELD]: 0 })
  const waived = await inspect()
  for (const id of IDS) assert.deepEqual(waived['job:' + id], before['job:' + id], 'Original collision fence is unchanged')
  assert.equal(waived.balance, 1190)
  assert.equal(IDS.reduce((sum, id) => sum + waived[PAID + id].providerLiability.maximumLiabilityCents, 0), 324)
  return { call, inspect, waived }
}

test('actual main pre-waiver v3 reader cannot dispatch, charge, refund or reinterpret waived jobs', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const id of IDS) {
    for (const [path, body] of [
      ['/reserve', requestFor(id)], ['/studio-dispatch', { id, fingerprint: FINGERPRINT }],
      ['/settle', { id, state: 'failed' }], ['/settle', { id, state: 'completed' }],
      ['/settle', { id, state: 'completed', validatedLateCompletion: 'existing-model-v1' }],
      ['/reconcile-studio-provider', { id, receipt: receiptFor(id) }],
      ['/reconcile-studio-provider', { id, receipt: receiptFor(id, 0) }],
      ['/job', { id }], ['/studio-current', { id }],
    ]) {
      await f.call(ROUTE + path, body, 503)
      assert.deepEqual(await f.inspect(), f.waived, `${path} must preserve every financial byte`)
    }
  }
  await f.call(ROUTE + '/failed-hold-waiver', { approvalId: FAILED_HOLD_WAIVER_APPROVAL }, 404)
  await f.call(ROUTE + '/studio-library', undefined, 503)
  await f.call(ROUTE + '/provider-reconciliation-pending', { cursor: null }, 503)
  await f.call(ROUTE + '/generation-funding', undefined, 503)
  const status = await f.call(ROUTE + '/status')
  assert.equal(status.credits, 1190)
  assert.equal(status.reservedCredits, 0)
  assert.equal(status.availableCredits, 1190)
  assert.deepEqual(await f.inspect(), f.waived)
})

test('actual pre-policy reader preserves waived isolated rows and their original inert fences', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const id of IDS) {
    assert.equal((await f.call('/reserve', requestFor(id), 429, 'prepolicy')).allowed, false)
    assert.equal((await f.call('/studio-dispatch', { id, fingerprint: FINGERPRINT }, 200, 'prepolicy')).dispatch, false)
    for (const state of ['completed', 'failed'])
      assert.equal((await f.call('/settle', { id, state }, 200, 'prepolicy')).repeated, true)
    for (const liability of [0, 810000])
      assert.equal((await f.call('/reconcile-studio-provider', { id, receipt: receiptFor(id, liability) }, 200, 'prepolicy')).reconciled, false)
    assert.deepEqual(await f.inspect(), f.waived)
  }
  assert.deepEqual((await f.call('/studio-library', undefined, 200, 'prepolicy')).models, [])
  assert.deepEqual(await f.inspect(), f.waived, 'Old refund semantics never touch the separate waived namespace')
})
