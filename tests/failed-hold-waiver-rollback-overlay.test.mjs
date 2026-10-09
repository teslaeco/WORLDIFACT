import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { NOW, OWNER, HELD, IDS, authority, fixtureSeed } from './fixtures/failed-hold-waiver.ts'
import { parseStudioJob } from '../src/lib/studioClient.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// A financial-data rollback must retain these ledger compatibility files from
// the waiver release. API/browser companions are required by the release guide.
const LEDGER_OVERLAY = ['server/entitlements.ts', 'server/paidPointsStorage.ts', 'server/failedHoldWaiver.ts',
  'src/lib/paidPointsFunding.ts', 'src/lib/failedHoldWaiver.ts']
const PREFIX = 'paid-points-job:v2:', APPROVAL = 'failed-hold-waiver-20261009-v1'
const OLD_MODELS = [1, 2, 3, 4, 5].map(index => `bbbbbbbb-0000-4000-8000-${String(index).padStart(12, '0')}`)

test('pinned pre-waiver baseline with the required ledger overlay preserves five older models and readable final waived jobs', { timeout: 30000 }, async t => {
  const base = JSON.parse(await readFile(new URL('./fixtures/failed-hold-waiver-prewaiver-v3.source.txt', import.meta.url), 'utf8'))
  assert.equal(base.baseCommit, '31c9e41a6f8a68bb6c7bbe748e79803f63835c36')
  assert.equal(createHash('sha256').update(base.sources['server/entitlements.ts']).digest('hex'),
    '6723db5c4aaee4a12ef57b8e7a47c120cfc8318301d7f85543e6157b5c4d985a')
  const sources = { ...base.sources }
  for (const path of LEDGER_OVERLAY) sources[path] = await readFile(new URL('../' + path, import.meta.url), 'utf8')
  // Only the immutable authority constant is replaced in this disposable fixture;
  // the same route, transaction, verifier and storage barriers execute unchanged.
  const waiver = sources['server/failedHoldWaiver.ts']
  const start = waiver.indexOf('const APPROVED_AUTHORITY: FailedHoldWaiverAuthority = Object.freeze({'), end = waiver.indexOf('\ntype Row =', start)
  assert.ok(start > 0 && end > start)
  sources['server/failedHoldWaiver.ts'] = waiver.slice(0, start) + 'const APPROVED_AUTHORITY: FailedHoldWaiverAuthority = ' + JSON.stringify(authority) + ';\n' + waiver.slice(end)
  const seed = fixtureSeed()
  seed.subscription = { id: 'sub_RollbackFixture', active: true, until: NOW + 86400000, revision: 1, plan: 'pro' }
  for (const [index, id] of OLD_MODELS.entries()) {
    const at = NOW - 3 * 86400000 + index * 60000
    seed['job:' + id] = { channel: 'studio', fingerprint: createHash('sha256').update(id).digest('hex'), prompt: 'Preserved old model ' + index,
      profile: 'slow', at, updatedAt: at + 30000, cost: 250, kind: 'credits', billingMode: 'hold-v1', state: 'completed' }
  }
  const bundle = await build({ stdin: { resolveDir: ROOT, sourcefile: 'failed-hold-rollback-overlay-fixture.ts', contents: `
    import { AccountEntitlements } from 'rollback-compatible-ledger';
    export class NativeLedger extends AccountEntitlements {
      constructor(state, env) { super(state, env, () => ${NOW}); this.nativeStorage = state.storage; }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture-seed') { await this.nativeStorage.put(${JSON.stringify(seed)}); return Response.json({ seeded: true }); }
        if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.nativeStorage.list()));
        return super.fetch(request);
      }
    }
    export default { fetch(request, env) {
      return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('account:v1:${OWNER}')).fetch(request);
    } };
  ` }, plugins: [{ name: 'explicit-rollback-ledger-overlay', setup(build) {
    build.onResolve({ filter: /^rollback-compatible-ledger$/ }, () => ({ path: 'server/entitlements.ts', namespace: 'rollback' }))
    build.onResolve({ filter: /^\.\.?\//, namespace: 'rollback' }, args => {
      const path = new URL(args.path, 'file:///' + args.importer).pathname.slice(1)
      return Object.hasOwn(sources, path) ? { path, namespace: 'rollback' } : { path: ROOT + '/' + path }
    })
    build.onLoad({ filter: /.*/, namespace: 'rollback' }, args => ({ contents: sources[args.path], loader: 'ts',
      resolveDir: ROOT + '/' + args.path.slice(0, args.path.lastIndexOf('/')) }))
  } }], bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { ACCOUNT_LEDGER_MODE: 'live' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Rollback fixtures must not contact a provider') },
  }))
  t.after(() => mf.dispose())
  async function call(path, body) {
    const response = await mf.dispatchFetch('https://rollback-fixture.example.test' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-WORLDIFACT-Verified-Account': OWNER, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value
  }
  await call('/fixture-seed', {})
  const before = await call('/fixture-inspect')
  const oldLibrary = await call('/generation-v3/studio-library')
  assert.deepEqual(oldLibrary.models.map(model => model.id).sort(), OLD_MODELS)
  assert.equal(oldLibrary.models.every(model => model.downloadAllowed), true)
  assert.equal((await call('/generation-v3/failed-hold-waiver', { approvalId: APPROVAL })).status, 'applied')
  const after = await call('/fixture-inspect')
  assert.equal(after.balance, 1190); assert.equal(after[HELD], 0)
  assert.deepEqual(await call('/generation-v3/studio-library'), oldLibrary)
  for (const id of OLD_MODELS) {
    assert.deepEqual(after['job:' + id], before['job:' + id])
    const owned = await call('/generation-v3/studio-library/' + id)
    assert.equal(owned.model.id, id); assert.equal(owned.model.downloadAllowed, true)
  }
  const current = await call('/generation-v3/studio-current', {})
  assert.equal(current.job.id, IDS[3]); assert.equal(current.job.state, 'failed'); assert.equal(current.job.pointSettlement.state, 'waived')
  for (const id of IDS) {
    const access = await call('/generation-v3/job', { id })
    const parsed = parseStudioJob({ job: { ...access, id, previewAvailable: false } }, id, 250, true)
    assert.equal(parsed.state, 'failed'); assert.equal(parsed.pointSettlement.state, 'waived')
    assert.match(parsed.detail, /waived as incident compensation/)
    assert.equal(parsed.downloadAllowed, false)
    for (const state of ['failed', 'completed']) {
      const settled = await call('/generation-v3/settle', { id, state, ...(state === 'completed' ? { validatedLateCompletion: 'existing-model-v1' } : {}) })
      assert.equal(settled.repeated, true); assert.equal(settled.pointSettlement.state, 'waived')
    }
    assert.equal((await call('/generation-v3/studio-dispatch', { id, fingerprint: after[PREFIX + id].fingerprint })).dispatch, false)
  }
  const funding = await call('/generation-v3/generation-funding')
  assert.equal(funding.customerPoints.available, 1190); assert.equal(funding.customerPoints.held, 0)
  assert.equal(funding.paidMembershipLiability.maximumLiabilityCents, 324)
  assert.deepEqual(funding.pendingCostReviews.items, [])
  assert.deepEqual(await call('/fixture-inspect'), after, 'Compatible rollback reads and late callbacks cannot mutate any ledger byte')
})
