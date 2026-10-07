import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'

// Source bundle pins the exact production ancestor and the unpublished prior
// full-refund draft. Every executable string is SHA-256 bound, independent of
// Git history, network access and the current writer's constants or adapter.
const LEGACY_SOURCE_SHA256 = '9d10cd34c270d5bf240a69187b45f3ef3c8df9ea1767b4506967a9ad0688ec3a'
const NOW = Date.parse('2026-10-07T07:00:00Z')
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FINGERPRINT = 'a'.repeat(64)
const PAID_PREFIX = 'paid-points-job:v2:'
const ROUTE = '/generation-v3'
const root = fileURLToPath(new URL('..', import.meta.url))

async function fixture(t) {
  const sources = JSON.parse(await readFile(new URL('./fixtures/paid-points-legacy-entitlements.source.txt', import.meta.url), 'utf8'))
  assert.equal(sources.version, 1)
  assert.equal(sources.legacyBaseCommit, '64986c33139e515d6a0a81fccb61f8db972bd62e')
  const legacySource = sources.legacyEntitlements
  const priorSources = sources.unpublishedFullRefund
  for (const [name, digest] of Object.entries({
    'server/entitlements.ts': 'b160ad6248dd5355b84a67ae0c6c8f97760d8afec4d1f96fc5ffe33113e50b0e',
    'server/paidPointsStorage.ts': 'ce11b90aff58d251480f484c50e5287e3103af57c254c467db972820ad8400ab',
    'src/lib/paidPointsFunding.ts': '5a71bfa9800d42e50911c309cb5ff240f8494b1f6beef353c7757ee4574f5301',
  })) assert.equal(createHash('sha256').update(priorSources[name]).digest('hex'), digest, name + ' prior draft changed')
  assert.equal(createHash('sha256').update(legacySource).digest('hex'), LEGACY_SOURCE_SHA256,
    'The legacy reader must remain byte-identical to the reviewed pre-policy source')
  const bundle = await build({ stdin: { resolveDir: root, sourcefile: 'paid-points-old-readers-native-fixture.ts', contents: `
    import { AccountEntitlements as Current } from './server/entitlements.ts';
    import { AccountEntitlements as Legacy } from 'worldifact-pinned-old-entitlements';
    import { AccountEntitlements as PriorRefund } from 'worldifact-pinned-full-refund';
    export class NativeLedger {
      constructor(state, env) {
        this.storage = state.storage;
        this.fault = null;
        this.time = ${NOW};
        const wrap = storage => ({
          get: key => storage.get(key), list: options => storage.list(options),
          put: async (key, value) => {
            if (this.fault && key.startsWith(this.fault)) {
              this.fault = null;
              throw new Error('Inert native mixed-version write failure');
            }
            return storage.put(key, value);
          },
          transaction: callback => storage.transaction(tx => callback(wrap(tx))),
        });
        this.current = new Current({ storage: wrap(state.storage) }, env, () => this.time);
        this.legacy = new Legacy({ storage: wrap(state.storage) }, env, () => this.time);
        this.priorRefund = new PriorRefund({ storage: wrap(state.storage) }, env, () => this.time);
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.storage.list()));
        if (path === '/fixture-patch') {
          const input = await request.json();
          for (const [key, value] of Object.entries(input.put ?? {})) await this.storage.put(key, value);
          for (const key of input.remove ?? []) await this.storage.delete(key);
          return Response.json({ patched: true });
        }
        if (path === '/fixture-fault') { this.fault = (await request.json()).prefix; return Response.json({ armed: true }); }
        if (path === '/fixture-time') { this.time = (await request.json()).now; return Response.json({ changed: true }); }
        const reader = request.headers.get('X-Fixture-Reader');
        return (reader === 'legacy' ? this.legacy : reader === 'prior-refund' ? this.priorRefund : this.current).fetch(request);
      }
    }
    export default { fetch(request, env) {
      const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(request.headers.get('X-Fixture-Account')));
      return ledger.fetch(request);
    } };
  ` }, plugins: [{ name: 'pinned-pre-policy-reader', setup(build) {
    build.onResolve({ filter: /^worldifact-pinned-old-entitlements$/ }, () => ({ path: 'legacy-entitlements', namespace: 'pinned-old-reader' }))
    build.onLoad({ filter: /.*/, namespace: 'pinned-old-reader' }, () => ({ contents: legacySource, loader: 'ts', resolveDir: root + '/server' }))
    build.onResolve({ filter: /^worldifact-pinned-full-refund$/ }, () => ({ path: 'server/entitlements.ts', namespace: 'pinned-full-refund' }))
    build.onResolve({ filter: /^\.\.?\//, namespace: 'pinned-full-refund' }, args => {
      const resolved = new URL(args.path, 'file:///' + args.importer).pathname.slice(1)
      if (Object.hasOwn(priorSources, resolved)) return { path: resolved, namespace: 'pinned-full-refund' }
      return { path: root + '/' + resolved }
    })
    build.onLoad({ filter: /.*/, namespace: 'pinned-full-refund' }, args => ({ contents: priorSources[args.path], loader: 'ts', resolveDir: root + '/' + args.path.slice(0, args.path.lastIndexOf('/')) }))
  } }], bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { ENABLE_ASTRA_PLANS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Mixed-version native tests must never call an external provider') },
  }))
  t.after(() => mf.dispose())
  async function call(account, path, body, reader = 'current', expected = 200) {
    const response = await mf.dispatchFetch('https://inert-ledger.example.test' + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'X-Fixture-Account': account, 'X-Fixture-Reader': reader,
        'X-WORLDIFACT-Verified-Account': ACCOUNT }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const value = await response.json()
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${reader} ${path}: HTTP ${response.status} ${JSON.stringify(value)}`)
    return value
  }
  const inspect = account => call(account, '/fixture-inspect')
  const patch = (account, put, remove = []) => call(account, '/fixture-patch', { put, remove })
  async function seed(account, provider = 0) {
    await call(account, '/grant', { id: 'in_old_reader_fixture', credits: 1500, subscriptionId: 'sub_oldreaderfixture' })
    await call(account, '/subscription', { id: 'sub_oldreaderfixture', active: true, until: NOW + 86400000,
      revision: 1, plan: 'creator', grantId: 'in_old_reader_fixture' })
    await patch(account, { 'provider-budget-cents:v1': provider })
  }
  return { call, inspect, patch, seed }
}
function input(id, channel = 'studio', model = 'astra', pricing) {
  return { id, ...(channel === 'studio' ? { requiredFundingMode: 'paid-membership-held-points-v1' } : {}), paidPointsPolicy: 'paid-membership-held-points-v1', fingerprint: FINGERPRINT, channel, model, profile: model === 'astra' ? 'slow' : 'fast',
    ...(channel === 'blueprint' ? { blueprintDispatch: 'fenced-v1', providerModel: model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-' + model }
      : { prompt: 'Inert old-reader compatibility fixture' }), ...(pricing ? { pricing } : {}) }
}
function receipt(id, pricing) {
  return { revision: 'worldifact-terminal-budget-v1', jobId: id, model: 'gpt-6-astra',
    policyRevision: pricing ? 'astra-low-tiered-v1' : 'astra-low-reconciled-v2',
    capMicroUsd: (pricing?.maxProviderCents ?? 175) * 10000, maximumLiabilityMicroUsd: 0, sealed: true, sealId: 'b'.repeat(64) }
}
async function blueprint(id, model = 'sol') {
  const value = demoBlueprint('Inert old-reader fixture')
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint: value, assetSpec: assetSpecForBlueprint(value), requestId: id,
    model: model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-' + model, limitation: 'Synthetic result only; no paid generation.',
    delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false },
    evidence: { providerResponseId: 'resp_old_reader_fixture', receivedAt: new Date(NOW).toISOString(),
      blueprintSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
}
async function oldOperationsStayInert(f, account, request) {
  const { id, pricing } = request, before = await f.inspect(account)
  assert.equal((await f.call(account, '/reserve', request, 'legacy', 429)).allowed, false)
  for (const channel of ['studio', 'blueprint'])
    assert.equal((await f.call(account, '/' + channel + '-dispatch', { id, fingerprint: FINGERPRINT }, 'legacy')).dispatch, false)
  for (const state of ['completed', 'failed'])
    assert.equal((await f.call(account, '/settle', { id, state }, 'legacy')).repeated, true)
  for (const [path, body] of [['/blueprint-complete', { id, result: await blueprint(id, request.model) }], ['/blueprint-status', { id }]]) {
    const oldRead = await f.call(account, path, body, 'legacy')
    assert.equal(oldRead.state, 'unknown'); assert.equal(oldRead.owned, false)
    assert.notEqual(oldRead.refunded, true, 'An older reader must not falsely describe a current held request as refunded')
  }
  assert.equal((await f.call(account, '/reconcile-studio-provider', { id, receipt: receipt(id, pricing) }, 'legacy')).reconciled, false)
  assert.equal((await f.call(account, '/reconcile-blueprint-provider', { id }, 'legacy')).reconciled, false)
  const pending = await f.call(account, '/provider-reconciliation-pending', { cursor: null }, 'legacy')
  assert.deepEqual(pending.ids, []); assert.deepEqual(pending.blueprintIds, [])
  assert.equal((await f.call(account, '/studio-current', {}, 'legacy')).job, null)
  assert.deepEqual((await f.call(account, '/studio-library', undefined, 'legacy')).models, [])
  assert.deepEqual(await f.inspect(account), before, 'Actual old readers must not mutate points, holds, liabilities, sentinels or ordinary reserve')
}

test('actual pinned old readers cannot admit, dispatch, refund or reconcile isolated paid jobs in native SQLite', { timeout: 60000 }, async t => {
  const f = await fixture(t)
  for (const [channel, model, pricing] of [['studio', 'astra'], ['studio', 'astra', STUDIO_PRICING.standard],
    ['studio', 'astra', STUDIO_PRICING.extended], ['blueprint', 'luna'], ['blueprint', 'sol'], ['blueprint', 'astra']]) {
    await t.test(channel + '-' + model + '-' + (pricing?.tier ?? 'legacy-price'), async () => {
      const account = crypto.randomUUID(), id = crypto.randomUUID(), request = input(id, channel, model, pricing)
      await f.seed(account)
      assert.equal((await f.call(account, ROUTE + '/reserve', request)).allowed, true)
      const reserved = await f.inspect(account)
      assert.equal(reserved[PAID_PREFIX + id].fundingMode, 'paid-membership-held-points-v1')
      assert.equal(reserved['job:' + id].fundingMode, 'paid-membership-fence-v2')
      assert.equal(reserved['job:' + id].cost, 0); assert.equal(reserved['job:' + id].kind, 'free')
      assert.equal(reserved['job:' + id].fingerprint, undefined); assert.equal(reserved['job:' + id].paidPointsFingerprint, FINGERPRINT)
      assert.equal(reserved['provider-budget-cents:v1'], 0)
      await oldOperationsStayInert(f, account, request)
      assert.equal((await f.call(account, ROUTE + '/settle', { id, state: 'failed' })).settled, true)
      await oldOperationsStayInert(f, account, request)
      assert.equal((await f.inspect(account)).balance, 1500)
      const second = crypto.randomUUID(), secondRequest = input(second, channel, model, pricing)
      assert.equal((await f.call(account, ROUTE + '/reserve', secondRequest)).allowed, true)
      assert.equal((await f.call(account, ROUTE + '/' + channel + '-dispatch', { id: second, fingerprint: FINGERPRINT })).dispatch, true)
      if (channel === 'studio') await f.call(account, ROUTE + '/settle', { id: second, state: 'completed' })
      else assert.equal((await f.call(account, ROUTE + '/blueprint-complete', { id: second, result: await blueprint(second, model) })).saved, true)
      await oldOperationsStayInert(f, account, secondRequest)
      const complete = await f.inspect(account)
      assert.equal(complete.balance, 1500 - (pricing?.points ?? (model === 'luna' ? 15 : model === 'sol' ? 50 : 250)))
      assert.equal(complete['provider-budget-cents:v1'], 0)
    })
  }
})

test('new protocol on an actual old Durable Object is a read-only 404 with no legacy fallback', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), id = crypto.randomUUID()
  await f.seed(account)
  const before = await f.inspect(account)
  await f.call(account, ROUTE + '/reserve', input(id), 'legacy', 404)
  await f.call(account, ROUTE + '/settle', { id, state: 'failed' }, 'legacy', 404)
  assert.deepEqual(await f.inspect(account), before)
})

test('native mixed-version UUID collision has only one financial writer in either arrival order', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const order of ['old-first', 'new-first', 'concurrent']) {
    const account = crypto.randomUUID(), id = crypto.randomUUID(), request = input(id)
    await f.seed(account, 1050)
    const invoke = async reader => {
      const path = reader === 'legacy' ? '/reserve' : ROUTE + '/reserve'
      return f.call(account, path, request, reader, order === 'new-first' && reader === 'legacy' ? 429 : 200)
    }
    if (order === 'old-first') { await invoke('legacy'); await invoke('current') }
    else if (order === 'new-first') { await invoke('current'); await invoke('legacy') }
    else {
      // The first admitted writer determines the policy. The old caller may
      // observe the new sentinel (429), or the new caller may recover old work.
      await Promise.all([
        f.call(account, ROUTE + '/reserve', request),
        f.call(account, '/reserve', request, 'legacy', [200, 429]),
      ])
    }
    const rows = await f.inspect(account), paid = rows[PAID_PREFIX + id]
    assert.equal(rows.balance, 1500); assert.equal(rows['customer-reserved-credits:v1'], 250)
    assert.equal(rows['provider-budget-cents:v1'], paid ? 1050 : 875)
    assert.equal(rows['job:' + id].cost, paid ? 0 : 250)
    if (paid) assert.equal(rows['job:' + id].fundingMode, 'paid-membership-fence-v2')
  }
})

test('native rollback never leaves a held job without its old-reader collision fence', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const prefix of [PAID_PREFIX, 'job:', 'current-studio-job:points-v2']) {
    const account = crypto.randomUUID(), id = crypto.randomUUID()
    await f.seed(account)
    const before = await f.inspect(account)
    await f.call(account, '/fixture-fault', { prefix })
    await f.call(account, ROUTE + '/reserve', input(id), 'current', 503)
    assert.deepEqual(await f.inspect(account), before, 'The full native transaction rolls back at ' + prefix)
    assert.equal((await f.call(account, ROUTE + '/reserve', input(id))).allowed, true)
    await oldOperationsStayInert(f, account, input(id))
  }
})

test('missing, mismatched and unknown-policy namespace pairs fail closed without altering their bytes', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const corruption of ['missing-fence', 'missing-paid', 'wrong-fingerprint', 'real-legacy-row', 'unknown-policy']) {
    const account = crypto.randomUUID(), id = crypto.randomUUID(), request = input(id)
    await f.seed(account)
    assert.equal((await f.call(account, ROUTE + '/reserve', request)).allowed, true)
    const rows = await f.inspect(account), paid = rows[PAID_PREFIX + id], sentinel = rows['job:' + id]
    if (corruption === 'missing-fence') await f.patch(account, {}, ['job:' + id])
    if (corruption === 'missing-paid') await f.patch(account, {}, [PAID_PREFIX + id])
    if (corruption === 'wrong-fingerprint') await f.patch(account, { ['job:' + id]: { ...sentinel, paidPointsFingerprint: 'c'.repeat(64) } })
    if (corruption === 'real-legacy-row') await f.patch(account, { ['job:' + id]: { fingerprint: FINGERPRINT, channel: 'studio',
      profile: 'slow', at: NOW, updatedAt: NOW, cost: 250, kind: 'credits', billingMode: 'hold-v1', state: 'reserved' } })
    if (corruption === 'unknown-policy') await f.patch(account, { [PAID_PREFIX + id]: { ...paid, fundingMode: 'paid-membership-points-v99' } })
    const before = await f.inspect(account)
    await f.call(account, ROUTE + '/reserve', request, 'current', 503)
    await f.call(account, ROUTE + '/settle', { id, state: 'failed' }, 'current', 503)
    await f.call(account, ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT }, 'current', 503)
    assert.deepEqual(await f.inspect(account), before)
  }
})

test('the current protocol preserves exact old reader financial semantics for pre-policy jobs and receipts', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const [channel, model, pricing] of [['studio', 'astra'], ['studio', 'astra', STUDIO_PRICING.extended], ['blueprint', 'sol']]) {
    for (const outcome of ['completed', 'failed']) {
      const oldAccount = crypto.randomUUID(), currentAccount = crypto.randomUUID(), id = crypto.randomUUID()
      const request = input(id, channel, model, pricing)
      await f.seed(oldAccount, 1050)
      assert.equal((await f.call(oldAccount, '/reserve', request, 'legacy')).allowed, true)
      assert.equal((await f.call(oldAccount, '/' + channel + '-dispatch', { id, fingerprint: FINGERPRINT }, 'legacy')).dispatch, true)
      const oldRows = await f.inspect(oldAccount)
      await f.patch(currentAccount, oldRows)
      for (const [account, reader, prefix] of [[oldAccount, 'legacy', ''], [currentAccount, 'current', ROUTE]]) {
        if (channel === 'blueprint' && outcome === 'completed')
          assert.equal((await f.call(account, prefix + '/blueprint-complete', { id, result: await blueprint(id, model) }, reader)).saved, true)
        else await f.call(account, prefix + '/settle', { id, state: outcome }, reader)
        if (channel === 'studio')
          assert.equal((await f.call(account, prefix + '/reconcile-studio-provider', { id, receipt: receipt(id, pricing) }, reader)).reconciled, true)
        else if (outcome === 'completed')
          assert.equal((await f.call(account, prefix + '/reconcile-blueprint-provider', { id }, reader)).reconciled, true)
        await f.call(account, prefix + '/settle', { id, state: 'failed' }, reader)
        await f.call(account, prefix + '/settle', { id, state: 'completed' }, reader)
      }
      assert.deepEqual(await f.inspect(currentAccount), await f.inspect(oldAccount),
        'Pre-policy ' + channel + ' ' + outcome + ' must retain the exact old points, reserve and receipt bytes')
      assert.equal(Object.keys(await f.inspect(currentAccount)).some(key => key.startsWith(PAID_PREFIX)), false)
    }
  }
})

test('native merged library and reconciliation pagination preserve both namespaces without duplicates or financial writes', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), oldId = crypto.randomUUID(), paidId = crypto.randomUUID()
  await f.seed(account, 1050)
  for (const [id, reader, prefix] of [[oldId, 'legacy', ''], [paidId, 'current', ROUTE]]) {
    assert.equal((await f.call(account, prefix + '/reserve', input(id), reader)).allowed, true)
    assert.equal((await f.call(account, prefix + '/studio-dispatch', { id, fingerprint: FINGERPRINT }, reader)).dispatch, true)
    await f.call(account, prefix + '/settle', { id, state: 'completed' }, reader)
  }
  const templates = await f.inspect(account), records = {}, expected = new Set()
  for (let index = 1; index <= 132; index++) {
    const id = '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0')
    expected.add(id)
    // Synthetic history copies are for read-only cursor testing. No settlement
    // or reconciliation is ever performed on these copied fixture rows.
    records['job:' + id] = templates['job:' + (index % 2 ? oldId : paidId)]
    if (index % 2 === 0) records[PAID_PREFIX + id] = templates[PAID_PREFIX + paidId]
  }
  await f.patch(account, records, ['job:' + oldId, 'job:' + paidId, PAID_PREFIX + paidId,
    'current-studio-job:v1', 'current-studio-job:points-v2'])
  const before = await f.inspect(account), library = [], pending = []
  let after = null
  for (;;) {
    const result = await f.call(account, ROUTE + '/studio-library' + (after ? '?after=' + encodeURIComponent(after) : ''))
    library.push(...result.models.map(model => model.id))
    if (!result.hasMore) break
    assert.notEqual(result.nextCursor, after); after = result.nextCursor
    assert.ok(library.length <= 132)
  }
  let cursor = null
  for (;;) {
    const result = await f.call(account, ROUTE + '/provider-reconciliation-pending', { cursor })
    pending.push(...result.ids)
    assert.deepEqual(result.blueprintIds, [])
    if (!result.hasMore) break
    assert.notEqual(result.nextCursor, cursor); cursor = result.nextCursor
    assert.ok(pending.length <= 132)
  }
  assert.equal(library.length, 132); assert.deepEqual(new Set(library), expected)
  assert.equal(pending.length, 132); assert.deepEqual(new Set(pending), expected)
  assert.deepEqual(await f.inspect(account), before)
})

test('native held-points current-pointer migration preserves outstanding legacy recovery and never resurrects dismissed jobs', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID(), third = crypto.randomUUID()
  await f.seed(account, 1050)
  await f.call(account, '/reserve', input(first), 'legacy')
  await f.call(account, '/fixture-time', { now: NOW + 1 })
  await f.call(account, ROUTE + '/reserve', input(second))
  assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job.id, second)
  assert.equal((await f.call(account, '/studio-current', {}, 'legacy')).job.id, first)
  await f.call(account, ROUTE + '/settle', { id: second, state: 'failed' })
  assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job.id, first,
    'A terminal newer paid row must not hide outstanding legacy work')
  assert.equal((await f.call(account, ROUTE + '/studio-current-clear', { id: second })).cleared, false)
  await f.call(account, '/fixture-time', { now: NOW + 2 })
  await f.call(account, '/reserve', input(third), 'legacy')
  assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job.id, third)
  const finances = await f.inspect(account)
  assert.equal((await f.call(account, ROUTE + '/studio-current-clear', { id: third })).cleared, true)
  assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job, null,
    'Clearing the selected legacy current must not resurrect an older paid pointer')
  assert.equal((await f.call(account, ROUTE + '/studio-current-clear', { id: third })).cleared, false)
  const after = await f.inspect(account)
  for (const key of Object.keys(finances).filter(key => !key.startsWith('current-studio-job:')))
    assert.deepEqual(after[key], finances[key])
  assert.equal((await f.call(account, ROUTE + '/job', { id: first })).state, 'reserved', 'Direct legacy receipt recovery stays available')
  assert.equal((await f.call(account, ROUTE + '/job', { id: second })).state, 'failed', 'Direct paid receipt recovery stays available')
})

test('native orphaned or malformed current pointers and cross-UUID terminal receipts fail closed', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const corrupt of ['orphan', 'invalid-id', 'timestamp', 'unknown-field', 'receipt-id']) {
    const account = crypto.randomUUID(), id = crypto.randomUUID()
    await f.seed(account)
    await f.call(account, ROUTE + '/reserve', input(id))
    if (corrupt === 'receipt-id') {
      await f.call(account, ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT })
      await f.call(account, ROUTE + '/settle', { id, state: 'completed' })
      await f.call(account, ROUTE + '/reconcile-studio-provider', { id, receipt: receipt(id) })
      const rows = await f.inspect(account), job = rows[PAID_PREFIX + id]
      await f.patch(account, { [PAID_PREFIX + id]: { ...job, providerLiability: { ...job.providerLiability,
        evidence: { ...job.providerLiability.evidence, receipt: receipt(crypto.randomUUID()) } } } })
    } else {
      const pointers = { orphan: { id: crypto.randomUUID(), at: NOW }, 'invalid-id': { id: 'not-a-job', at: NOW },
        timestamp: { id, at: NOW + 1 }, 'unknown-field': { id, at: NOW, next: 'unknown-policy' } }
      await f.patch(account, { 'current-studio-job:points-v2': { ...pointers[corrupt], observedLegacyId: '' } })
    }
    const before = await f.inspect(account)
    await f.call(account, ROUTE + '/studio-current', {}, 'current', 503)
    if (corrupt === 'receipt-id') await f.call(account, ROUTE + '/settle', { id, state: 'failed' }, 'current', 503)
    assert.deepEqual(await f.inspect(account), before)
  }
})

test('native same-millisecond legacy pointer writes remain recoverable after held-points admission or dismissal', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const cleared of [false, true]) {
    const account = crypto.randomUUID(), paidId = crypto.randomUUID(), legacyId = crypto.randomUUID()
    await f.seed(account, 1050)
    await f.call(account, ROUTE + '/reserve', input(paidId))
    if (cleared) assert.equal((await f.call(account, ROUTE + '/studio-current-clear', { id: paidId })).cleared, true)
    await f.call(account, '/reserve', input(legacyId), 'legacy')
    assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job?.id, legacyId,
      'An actual later legacy pointer write wins even when both jobs share a millisecond')
    await f.call(account, '/studio-dispatch', { id: legacyId, fingerprint: FINGERPRINT }, 'legacy')
    await f.call(account, '/settle', { id: legacyId, state: 'completed' }, 'legacy')
    const before = await f.inspect(account)
    assert.equal((await f.call(account, ROUTE + '/studio-current', {})).job?.id, legacyId,
      'A same-millisecond legacy completion cannot disappear behind an older paid pointer or dismissal')
    assert.deepEqual(await f.inspect(account), before)
  }
})

test('the actual unpublished full-refund reader cannot interpret or refund new held-failure jobs', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const channel of ['studio', 'blueprint']) {
    const account = crypto.randomUUID(), id = crypto.randomUUID(), model = channel === 'studio' ? 'astra' : 'sol'
    const request = input(id, channel, model)
    await f.seed(account)
    assert.equal((await f.call(account, ROUTE + '/reserve', request)).allowed, true)
    await f.call(account, ROUTE + '/' + channel + '-dispatch', { id, fingerprint: FINGERPRINT })
    await f.call(account, ROUTE + '/settle', { id, state: 'failed' })
    const before = await f.inspect(account), job = before[PAID_PREFIX + id], price = model === 'astra' ? 250 : 50
    assert.equal(job.state, 'failed')
    assert.deepEqual(job.pointSettlement, { version: 1, state: 'pending-cost', heldPoints: price, chargedPoints: 0 })
    assert.equal(before.balance, 1500); assert.equal(before['customer-reserved-credits:v1'], price)
    await f.call(account, ROUTE + '/reserve', request, 'prior-refund', 404)
    for (const [path, body] of [
      ['/reserve', request], ['/settle', { id, state: 'failed' }], ['/settle', { id, state: 'completed' }],
      ['/studio-dispatch', { id, fingerprint: FINGERPRINT }], ['/blueprint-dispatch', { id, fingerprint: FINGERPRINT }],
      ['/blueprint-status', { id }], ['/blueprint-complete', { id, result: await blueprint(id, model) }],
      ['/reconcile-studio-provider', { id, receipt: receipt(id) }], ['/reconcile-blueprint-provider', { id }],
      ['/job', { id }], ['/provider-reconciliation-pending', { cursor: null }],
    ]) await f.call(account, '/generation-v2' + path, body, 'prior-refund', 503)
    await f.call(account, '/generation-v2/studio-library', undefined, 'prior-refund', 503)
    assert.equal((await f.call(account, '/generation-v2/studio-current', {}, 'prior-refund')).job, null)
    await oldOperationsStayInert(f, account, request)
    assert.deepEqual(await f.inspect(account), before, 'Both actual earlier readers preserve the pending hold and every financial byte')
    if (channel === 'studio') {
      await f.call(account, ROUTE + '/reconcile-studio-provider', { id, receipt: receipt(id) })
      const released = await f.inspect(account)
      assert.deepEqual(released[PAID_PREFIX + id].pointSettlement, { version: 1, state: 'released', heldPoints: 0, chargedPoints: 0 })
      assert.equal(released.balance, 1500); assert.equal(released['customer-reserved-credits:v1'], 0)
      await f.call(account, '/generation-v2/settle', { id, state: 'failed' }, 'prior-refund', 503)
      assert.deepEqual(await f.inspect(account), released)
    }
  }
})

test('the held policy never migrates or retroactively charges unpublished full-refund jobs', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), id = crypto.randomUUID(), request = input(id)
  await f.seed(account)
  assert.equal((await f.call(account, '/generation-v2/reserve', request, 'prior-refund')).allowed, true)
  const before = await f.inspect(account)
  assert.equal(before['paid-points-job:v1:' + id].fundingMode, 'paid-membership-points-v1')
  await f.call(account, ROUTE + '/reserve', request, 'current', 503)
  await f.call(account, ROUTE + '/settle', { id, state: 'failed' }, 'current', 503)
  await f.call(account, ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT }, 'current', 503)
  assert.deepEqual(await f.inspect(account), before)
  await f.call(account, '/generation-v2/settle', { id, state: 'failed' }, 'prior-refund')
  const after = await f.inspect(account)
  assert.equal(after.balance, 1500); assert.equal(after['customer-reserved-credits:v1'], 0)
  assert.equal(after[PAID_PREFIX + id], undefined)
})

test('native positive or conflicting terminal bounds never become unproved failed-job charges or refunds', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), id = crypto.randomUUID()
  await f.seed(account)
  await f.call(account, ROUTE + '/reserve', input(id))
  await f.call(account, ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT })
  await f.call(account, ROUTE + '/settle', { id, state: 'failed', failureCode: 'STUDIO_TIMEOUT' })
  const positive = { ...receipt(id), maximumLiabilityMicroUsd: 420001 }
  const saved = await f.call(account, ROUTE + '/reconcile-studio-provider', { id, receipt: positive })
  assert.equal(saved.reconciled, true); assert.equal(saved.releasedCents, 0)
  const before = await f.inspect(account)
  assert.deepEqual(before[PAID_PREFIX + id].pointSettlement,
    { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 })
  assert.equal(before.balance, 1500); assert.equal(before['customer-reserved-credits:v1'], 250)
  assert.equal((await f.call(account, ROUTE + '/settle', { id, state: 'completed' })).settled, false,
    'A late success label alone is not verified model delivery')
  assert.equal((await f.call(account, ROUTE + '/reconcile-studio-provider', { id, receipt: positive })).repeated, true)
  assert.equal((await f.call(account, ROUTE + '/reconcile-studio-provider', { id, receipt: receipt(id) })).reconciled, false)
  await f.call(account, '/generation-v2/settle', { id, state: 'failed' }, 'prior-refund', 503)
  assert.deepEqual(await f.inspect(account), before)
})

test('native held policy requires an exact new-submission acknowledgement while preserving same-job recovery', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  for (const [channel, model, pricing] of [['studio', 'astra'], ['studio', 'astra', STUDIO_PRICING.standard],
    ['studio', 'astra', STUDIO_PRICING.extended], ['blueprint', 'luna'], ['blueprint', 'sol'], ['blueprint', 'astra']]) {
    const account = crypto.randomUUID(), id = crypto.randomUUID(), request = input(id, channel, model, pricing)
    await f.seed(account)
    const before = await f.inspect(account)
    for (const acknowledgement of [undefined, null, 'paid-membership-points-v1', 'paid-membership-points-v2', 'future-policy', ['paid-membership-held-points-v1']]) {
      const stale = { ...request, paidPointsPolicy: acknowledgement }
      if (acknowledgement === undefined) delete stale.paidPointsPolicy
      assert.equal((await f.call(account, ROUTE + '/reserve', stale, 'current', 429)).allowed, false)
      assert.deepEqual(await f.inspect(account), before, 'An old or unknown client policy must not hold, debit, seed or dispatch')
    }
    assert.equal((await f.call(account, ROUTE + '/reserve', request)).allowed, true)
    const reserved = await f.inspect(account), recovery = { ...request }
    delete recovery.paidPointsPolicy
    const same = await f.call(account, ROUTE + '/reserve', recovery)
    assert.equal(same.repeated, true); assert.equal(same.allowed, true)
    assert.deepEqual(await f.inspect(account), reserved, 'Policy acknowledgement never blocks or charges same-UUID recovery twice')
  }
})

test('native pending-cost review pages survive empty legacy scan pages without mutating holds', { timeout: 30000 }, async t => {
  const f = await fixture(t), account = crypto.randomUUID(), expected = new Set(), legacyRows = {}
  await f.seed(account)
  await f.call(account, '/grant', { id: 'in_pendingreviewextra', credits: 3000 })
  for (let index = 1; index <= 73; index++) {
    const id = '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0')
    legacyRows['job:' + id] = { fingerprint: FINGERPRINT, channel: 'studio', profile: 'slow', at: NOW, updatedAt: NOW,
      cost: 0, kind: 'free', state: 'failed', failureCode: 'MISSING_SUBMISSION' }
  }
  await f.patch(account, legacyRows)
  for (let index = 1; index <= 12; index++) {
    const id = '10000000-0000-4000-8000-' + index.toString(16).padStart(12, '0')
    expected.add(id)
    await f.call(account, ROUTE + '/reserve', input(id))
    await f.call(account, ROUTE + '/studio-dispatch', { id, fingerprint: FINGERPRINT })
    await f.call(account, ROUTE + '/settle', { id, state: 'failed' })
  }
  const before = await f.inspect(account), seen = []
  assert.equal(before.balance, 4500); assert.equal(before['customer-reserved-credits:v1'], 3000)
  let cursor = null, pages = 0
  for (;;) {
    const snapshot = await f.call(account, ROUTE + '/generation-funding' + (cursor ? '?pendingAfter=' + encodeURIComponent(cursor) : ''))
    const page = snapshot.pendingCostReviews
    assert.equal(page.version, 1); assert.ok(page.items.length <= 8)
    if (pages++ === 0) { assert.deepEqual(page.items, []); assert.equal(page.hasMore, true) }
    for (const item of page.items) {
      assert.equal(item.heldPoints, 250); assert.equal(item.channel, 'studio'); assert.equal(item.model, 'astra')
      seen.push(item.id)
    }
    if (!page.hasMore) break
    assert.notEqual(page.nextCursor, cursor); cursor = page.nextCursor
    assert.ok(pages <= 4, 'The bounded cursor must advance through sparse history')
  }
  assert.equal(seen.length, 12); assert.deepEqual(new Set(seen), expected)
  assert.deepEqual(await f.inspect(account), before)
  for (const query of ['pendingAfter=not-an-id', 'pendingAfter=' + [...expected][0] + '&pendingAfter=' + [...expected][1], 'accountId=' + ACCOUNT])
    await f.call(account, ROUTE + '/generation-funding?' + query, undefined, 'current', 400)
  assert.deepEqual(await f.inspect(account), before)
})

test('the actual production receipt verifier rejects held tickets and stripped prefixes while legacy signatures stay identical', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const sources = JSON.parse(await readFile(new URL('./fixtures/paid-points-legacy-entitlements.source.txt', import.meta.url), 'utf8'))
  assert.equal(createHash('sha256').update(sources.legacyStudio).digest('hex'),
    'e763945876fea8c4ed04de898c764c8780f1ffbf46cd33b922f0d42db855aeda', 'Actual old verifier is pinned to the production ancestor')
  const currentSource = await readFile(new URL('../server/studio.ts', import.meta.url), 'utf8')
  // Export the original private functions without rewriting their bodies. The
  // actual old and current signing/verifying code runs with one inert HMAC key.
  const bundle = await build({ stdin: { resolveDir: root, sourcefile: 'held-receipt-verifier-fixture.ts', contents: `
    export { fixtureMint as oldMint, fixtureVerify as oldVerify } from 'old-receipt-source';
    export { fixtureMint as currentMint, fixtureVerify as currentVerify } from 'current-receipt-source';
  ` }, plugins: [{ name: 'actual-receipt-verifiers', setup(build) {
    build.onResolve({ filter: /^(old|current)-receipt-source$/ }, args => ({ path: args.path, namespace: 'receipt-verifier' }))
    build.onLoad({ filter: /.*/, namespace: 'receipt-verifier' }, args => ({
      contents: (args.path === 'old-receipt-source' ? sources.legacyStudio : currentSource) + '\nexport { receipt as fixtureMint, verifyReceipt as fixtureVerify };\n',
      loader: 'ts', resolveDir: root + '/server',
    }))
  } }], bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const readers = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
  const env = { OWNER_ACCESS_TOKEN: 'inert-receipt-domain-test-key-'.repeat(3) }, id = crypto.randomUUID()
  const held = await readers.currentMint(env, id, FINGERPRINT, ACCOUNT, undefined, false, true)
  assert.match(held.ticket, /^held\./)
  assert.equal((await readers.currentVerify(env, held.ticket, id, true, ACCOUNT)).held, true)
  for (const token of [held.ticket, held.ticket.slice('held.'.length), 'library.' + held.ticket.slice('held.'.length)])
    await assert.rejects(readers.oldVerify(env, token, id, true, ACCOUNT, true), error => error.status === 401)
  await assert.rejects(readers.currentVerify(env, held.ticket.slice('held.'.length), id, true, ACCOUNT), error => error.status === 401)
  await assert.rejects(readers.currentVerify(env, held.ticket, crypto.randomUUID(), true, ACCOUNT), error => error.status === 401)
  await assert.rejects(readers.currentVerify(env, held.ticket, id, true, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), error => error.status === 401)
  for (const library of [false, true]) {
    const old = await readers.oldMint(env, id, FINGERPRINT, ACCOUNT, undefined, library)
    const current = await readers.currentMint(env, id, FINGERPRINT, ACCOUNT, undefined, library, false)
    assert.deepEqual(current, old, 'Legacy/library signatures and receipt bytes stay identical')
    assert.equal((await readers.oldVerify(env, current.ticket, id, true, ACCOUNT, library)).id, id)
    assert.equal((await readers.currentVerify(env, old.ticket, id, true, ACCOUNT, library)).held, false)
    if (!library) await assert.rejects(readers.currentVerify(env, 'held.' + old.ticket, id, true, ACCOUNT), error => error.status === 401)
  }
})
