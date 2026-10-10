import test from 'node:test'
import assert from 'node:assert/strict'
import { activateBatch, main, validateActivationContext, validatePrivateBatch } from '../scripts/activate-private-promotion-batch.mjs'
import { preparePrivateBatch } from '../scripts/prepare-private-promotion-batch.mjs'

const now = Date.now()
const compiled = () => preparePrivateBatch({ accountId: '11111111-1111-4111-8111-111111111111',
  startsAt: now, codes: Array.from({ length: 10 }, (_,i) => `SYNTHETIC_NOT_REAL_${i}`) }, now)
const env = () => ({ CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-token-only-123456789',
  WORLDIFACT_PROMOTION_BATCH_20261010: JSON.stringify(compiled()), GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT',
  GITHUB_ACTOR: 'teslaeco', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/ops/promo-readiness-20261010', GITHUB_RUN_ATTEMPT: '1' })
const old = '4c819fd5-d99b-4504-b191-9b3dcb30600a', fresh = '22222222-2222-4222-8222-222222222222'
const baseBindings = [{ name: 'STRIPE_SECRET_KEY', type: 'secret_text' },
  { name: 'SAFE_EXISTING_VAR', type: 'plain_text', text: 'private-existing-value' },
  { name: 'ACCOUNT_ENTITLEMENTS', type: 'durable_object_namespace', namespace_id: 'private-existing-namespace' }]
function fixture({ beforeBindings = baseBindings, mutateAfter = x => x, beforeVersion = old, latestVersion = old, failPatch = false, changeAfter = false } = {}) {
  let written = false, readsAfter = 0; const calls = []
  const fetcher = async (url, opts) => {
    calls.push({ url, opts })
    let result
    if (url.endsWith('/secrets-bulk')) {
      assert.equal(opts.method, 'PATCH'); assert.equal(written, false); written = true
      if (failPatch) throw Error('PRIVATE-NETWORK-DETAILS')
      result = {}
    } else {
      assert.equal(opts.method, 'GET'); assert.equal(opts.body, undefined)
      if (url.endsWith('/deployments')) {
        if (written) readsAfter++
        result = { deployments: [{ id: changeAfter && readsAfter > 1 ? '33333333-3333-4333-8333-333333333333' : '11111111-1111-4111-8111-111111111111',
          created_on: '2026-10-10T17:00:00Z', strategy: 'percentage', versions: [{ version_id: written ? fresh : beforeVersion, percentage: 100 }] }] }
      } else if (url.endsWith('/versions')) result = { items: [{ id: latestVersion }] }
      else {
        const resources = { bindings: structuredClone(beforeBindings), script: { etag: 'unchanged-code', handlers: ['fetch'] },
          script_runtime: { compatibility_date: '2026-09-01', compatibility_flags: ['nodejs_compat'] } }
        if (written) resources.bindings.push(...Object.keys(compiled()).map(name => ({ name, type: 'secret_text' })))
        result = { id: written ? fresh : beforeVersion, resources: written ? mutateAfter(resources) : resources }
      }
    }
    return Response.json({ success: true, result })
  }
  return { fetcher, calls }
}

test('activation changes exactly two secret fields once and verifies preserved active code/bindings', async () => {
  const f = fixture(), result = await activateBatch({ env: env(), fetcher: f.fetcher, now })
  const writes = f.calls.filter(c => c.opts.method !== 'GET')
  assert.equal(writes.length, 1)
  const payload = JSON.parse(writes[0].opts.body)
  assert.deepEqual(Object.keys(payload.secrets).sort(), ['WORLDIFACT_PROMOTIONS_ENABLED','WORLDIFACT_PROMOTION_DEFINITIONS'].sort())
  for (const s of Object.values(payload.secrets)) assert.equal(s.type, 'secret_text')
  for (const c of f.calls) {
    assert.equal(new URL(c.url).origin, 'https://api.cloudflare.com'); assert.equal(c.opts.redirect, 'error')
    assert.ok(new URL(c.url).pathname.includes('/scripts/worldifact/'))
  }
  assert.equal(result.status, 'PRIVATE_BATCH_CONFIGURATION_DEPLOYED')
  assert.equal(result.versionId, fresh); assert.equal(result.actualAccountRedemptionTested, false)
  assert.ok(!JSON.stringify(result).includes('private-'))
})

for (const [label, options] of [
  ['unexpected deployed version', { beforeVersion: fresh }],
  ['unpublished version drift', { latestVersion: fresh }],
  ['existing definition', { beforeBindings: [...baseBindings, { name: 'WORLDIFACT_PROMOTION_DEFINITIONS', type: 'secret_text' }] }],
]) test(`preflight refuses ${label} without any write`, async () => {
  const f = fixture(options)
  await assert.rejects(activateBatch({ env: env(), fetcher: f.fetcher, now }))
  assert.equal(f.calls.filter(c => c.opts.method !== 'GET').length, 0)
})

for (const [label, mutateAfter] of [
  ['source', r => { r.script.etag = 'other-code'; return r }],
  ['secret', r => { r.bindings = r.bindings.filter(b => b.name !== 'STRIPE_SECRET_KEY'); return r }],
  ['variable', r => { r.bindings[1].text = 'changed'; return r }],
  ['DO namespace', r => { r.bindings[2].namespace_id = 'other'; return r }],
  ['runtime', r => { r.script_runtime.compatibility_date = '2026-10-10'; return r }],
]) test(`readback rejects unexpected ${label} mutation without retrying`, async () => {
  const f = fixture({ mutateAfter })
  await assert.rejects(activateBatch({ env: env(), fetcher: f.fetcher, now }))
  assert.equal(f.calls.filter(c => c.opts.method === 'PATCH').length, 1)
})

test('ambiguous write timeout is never retried and no private error detail is logged', async () => {
  const f = fixture({ failPatch: true }), logs = []
  assert.equal(await main({ env: env(), fetcher: f.fetcher, contextCheck: async () => {},
    report: { log: x => logs.push(x), error: x => logs.push(x) } }), false)
  assert.equal(f.calls.filter(c => c.opts.method === 'PATCH').length, 1)
  assert.match(logs[0], /^ACTIVATION_UNCONFIRMED_AFTER_WRITE_ATTEMPT/)
  assert.ok(!logs.join().includes('PRIVATE-NETWORK-DETAILS'))
})

test('concurrent publication after write prevents an activation success claim', async () => {
  await assert.rejects(activateBatch({ env: env(), fetcher: fixture({ changeAfter: true }).fetcher, now }))
})

test('private batch rejects multiple accounts, larger points, extra fields and changed validity', () => {
  for (const mutate of [
    ds => { ds[0].accountId = '22222222-2222-4222-8222-222222222222' },
    ds => { ds[0].points = 1001 }, ds => { ds[0].maxRedemptions = 2 },
    ds => { ds[0].expiresAt += 1 }, ds => { ds.pop() },
    ds => { ds[0].admin = true },
  ]) {
    const c = compiled(), ds = JSON.parse(c.WORLDIFACT_PROMOTION_DEFINITIONS); mutate(ds)
    c.WORLDIFACT_PROMOTION_DEFINITIONS = JSON.stringify(ds)
    assert.throws(() => validatePrivateBatch(JSON.stringify(c), now))
  }
  assert.throws(() => validatePrivateBatch(JSON.stringify({ ...compiled(), STRIPE_SECRET_KEY: 'forbidden' }), now))
  assert.throws(() => validatePrivateBatch(JSON.stringify(compiled()), now + 86400001))
})

test('activation context is an exact single-file approved addition and refuses reruns/other actors', () => {
  const parent = 'a'.repeat(40), marker = '.github/activation/private-promotion-20261010.json'
  const manifest = { reviewedParent: parent, approval: 'owner-approved-new-private-batch-10x1000-30days-20261010' }
  validateActivationContext(env(), manifest, parent, marker)
  for (const patch of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_ACTOR: 'someone' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' }])
    assert.throws(() => validateActivationContext({ ...env(), ...patch }, manifest, parent, marker))
  assert.throws(() => validateActivationContext(env(), manifest, 'b'.repeat(40), marker))
  assert.throws(() => validateActivationContext(env(), manifest, parent, marker + '\nserver/entitlements.ts'))
})
