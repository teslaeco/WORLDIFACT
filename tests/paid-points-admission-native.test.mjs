import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { createHash } from 'node:crypto'
const NOW = Date.parse('2026-10-07T07:00:00Z'), FP = 'a'.repeat(64), ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PAID = 'paid-points-job:v2:', PROVIDER = 'provider-budget-cents:v1'

test('native paid membership transactions persist points and bounded liability across concurrency, faults and full runtime restart', { timeout: 60000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'worldifact-paid-points-'))
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'paid-points-native-fixture.ts', contents: `
    import { AccountEntitlements } from './server/entitlements.ts';
    export class NativeLedger {
      constructor(state, env) {
        this.store = state.storage; this.fault = false;
        const wrap = store => ({ get: key => store.get(key), list: options => store.list(options),
          put: (key, value) => { if (this.fault && key.startsWith('paid-points-job:v2:')) { this.fault = false; throw new Error('Inert paid-row write failure'); } return store.put(key, value); },
          transaction: fn => store.transaction(tx => fn(wrap(tx))) });
        this.ledger = new AccountEntitlements({ storage: wrap(state.storage) }, env, () => ${NOW});
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/inspect') return Response.json(Object.fromEntries(await this.store.list()));
        if (path === '/patch') { const data = await request.json(); for (const [key, value] of Object.entries(data)) await this.store.put(key, value); return Response.json({ patched: true }); }
        if (path === '/fault') { this.fault = true; return Response.json({ armed: true }); }
        return this.ledger.fetch(request);
      }
    }
    export default { fetch(request, env) { return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(request.headers.get('X-Fixture-Account'))).fetch(request); } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const options = convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false, script: bundle.outputFiles[0].text,
    bindings: { ENABLE_ASTRA_PLANS: 'true' }, durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } }, resourcePersistencePath: dir, isolatedResourcePersistencePath: dir,
    outboundService: () => { throw new Error('Native paid tests cannot call a provider') } })
  let mf = new Miniflare(options)
  t.after(async () => { await mf.dispose(); await rm(dir, { recursive: true, force: true }) })
  async function call(account, path, body, status = 200) {
    const response = await mf.dispatchFetch('https://inert-paid.example.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Fixture-Account': account, 'X-WORLDIFACT-Verified-Account': ACCOUNT }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json(); assert.ok((Array.isArray(status) ? status : [status]).includes(response.status), JSON.stringify(result)); return result
  }
  const v2 = (account, path, body, status) => call(account, '/generation-v3' + path, body, status)
  const inspect = account => call(account, '/inspect')
  const input = (id, channel = 'studio') => ({ id, paidPointsPolicy: 'paid-membership-held-points-v1', ...(channel === 'studio' ? { requiredFundingMode: 'paid-membership-held-points-v1' } : {}), channel, fingerprint: FP, profile: channel === 'studio' ? 'slow' : 'fast',
    ...(channel === 'studio' ? { prompt: 'Native paid membership fixture' } : { model: 'sol', providerModel: 'gpt-6.1-sol', blueprintDispatch: 'fenced-v1' }) })
  const receipt = id => ({ revision: 'worldifact-terminal-budget-v1', jobId: id, model: 'gpt-6-astra', policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 420001, sealed: true, sealId: 'b'.repeat(64) })
  async function seed(account, points = 1500) {
    await call(account, '/grant', { id: 'in_nativepoints', credits: points, subscriptionId: 'sub_nativepoints' })
    await call(account, '/subscription', { id: 'sub_nativepoints', active: true, plan: 'creator', until: NOW + 86400000, revision: 1, grantId: 'in_nativepoints' })
    await call(account, '/patch', { [PROVIDER]: 0 })
  }

  const concurrent = 'concurrent'; await seed(concurrent)
  const id = crypto.randomUUID()
  const repeats = await Promise.all(Array.from({ length: 16 }, () => v2(concurrent, '/reserve', input(id))))
  assert.equal(repeats.filter(value => value.repeated === false).length, 1)
  const attempts = await Promise.all(Array.from({ length: 20 }, () => v2(concurrent, '/reserve', input(crypto.randomUUID()), [200, 429])))
  assert.equal(attempts.filter(value => value.allowed).length, 5)
  assert.equal((await inspect(concurrent))['customer-reserved-credits:v1'], 1500)
  assert.equal((await inspect(concurrent))[PROVIDER], 0)
  const claims = await Promise.all(Array.from({ length: 12 }, () => v2(concurrent, '/studio-dispatch', { id, fingerprint: FP })))
  assert.equal(claims.filter(value => value.dispatch).length, 1)
  const settlements = await Promise.all(Array.from({ length: 12 }, () => v2(concurrent, '/settle', { id, state: 'completed' })))
  assert.equal(settlements.filter(value => value.repeated === false).length, 1)
  assert.equal((await inspect(concurrent)).balance, 1250)

  const fault = 'fault'; await seed(fault); const faultId = crypto.randomUUID()
  await v2(fault, '/reserve', input(faultId)); const reserved = await inspect(fault)
  await call(fault, '/fault', {}); await v2(fault, '/settle', { id: faultId, state: 'failed' }, 503)
  assert.deepEqual(await inspect(fault), reserved, 'Point hold release and terminal liability roll back together')
  await v2(fault, '/studio-dispatch', { id: faultId, fingerprint: FP }); await v2(fault, '/settle', { id: faultId, state: 'failed' })
  const beforeReceipt = await inspect(fault)
  await call(fault, '/fault', {}); await v2(fault, '/reconcile-studio-provider', { id: faultId, receipt: receipt(faultId) }, 503)
  assert.deepEqual(await inspect(fault), beforeReceipt)
  const reconciliations = await Promise.all(Array.from({ length: 12 }, () => v2(fault, '/reconcile-studio-provider', { id: faultId, receipt: receipt(faultId) })))
  assert.equal(reconciliations.filter(value => value.repeated === false).length, 1)
  assert.ok(reconciliations.every(value => value.releasedCents === 0 && value.retainedCents === 43))
  const final = await inspect(fault)
  assert.equal(final.balance, 1500); assert.equal(final[PROVIDER], 0); assert.equal(final[PAID + faultId].providerLiability.maximumLiabilityCents, 43)

  const blueprint = 'blueprint'; await seed(blueprint); const blueprintId = crypto.randomUUID()
  await v2(blueprint, '/reserve', input(blueprintId, 'blueprint'))
  const geometry = demoBlueprint('Inert native paid result')
  const result = { mode: 'LIVE', provenance: 'GENERATED', blueprint: geometry, assetSpec: assetSpecForBlueprint(geometry), requestId: blueprintId, model: 'gpt-6.1-sol', limitation: 'Synthetic fixture only', delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false }, evidence: { providerResponseId: 'resp_nativepaid', receivedAt: new Date(NOW).toISOString(), blueprintSha256: createHash('sha256').update(JSON.stringify(geometry)).digest('hex'), inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
  const beforeComplete = await inspect(blueprint)
  assert.equal((await v2(blueprint, '/blueprint-complete', { id: blueprintId, result })).saved, false)
  assert.deepEqual(await inspect(blueprint), beforeComplete)
  await v2(blueprint, '/blueprint-dispatch', { id: blueprintId, fingerprint: FP })
  assert.equal((await v2(blueprint, '/blueprint-complete', { id: blueprintId, result })).saved, true)
  const bounded = await v2(blueprint, '/reconcile-blueprint-provider', { id: blueprintId })
  assert.equal(bounded.releasedCents, 0); assert.equal(bounded.reconciled, true)
  assert.equal((await inspect(blueprint)).balance, 1450); assert.equal((await inspect(blueprint))[PROVIDER], 0)

  // An authenticated zero receipt races only against an explicitly validated
  // late completion. The transaction permits exactly one financial outcome.
  for (let index = 0; index < 4; index++) {
    const zero = 'zero-' + index, zeroId = crypto.randomUUID(); await seed(zero)
    await v2(zero, '/reserve', input(zeroId)); await v2(zero, '/studio-dispatch', { id: zeroId, fingerprint: FP })
    await v2(zero, '/settle', { id: zeroId, state: 'failed' })
    assert.equal((await inspect(zero))['customer-reserved-credits:v1'], 250)
    assert.equal((await v2(zero, '/settle', { id: zeroId, state: 'completed' })).settled, false)
    const zeroReceipt = { ...receipt(zeroId), maximumLiabilityMicroUsd: 0 }, beforeZero = await inspect(zero)
    await call(zero, '/fault', {}); await v2(zero, '/reconcile-studio-provider', { id: zeroId, receipt: zeroReceipt }, 503)
    assert.deepEqual(await inspect(zero), beforeZero, 'Zero-proof release rolls points and proof back atomically')
    const operations = [() => v2(zero, '/reconcile-studio-provider', { id: zeroId, receipt: zeroReceipt }),
      () => v2(zero, '/settle', { id: zeroId, state: 'completed', validatedLateCompletion: 'existing-model-v1' })]
    await Promise.all((index % 2 ? operations : operations.toReversed()).map(run => run()))
    const terminal = await inspect(zero), point = terminal[PAID + zeroId].pointSettlement
    assert.ok(['charged', 'released'].includes(point.state)); assert.equal(point.heldPoints, 0)
    assert.equal(terminal['customer-reserved-credits:v1'], 0)
    assert.equal(terminal.balance, point.state === 'charged' ? 1250 : 1500)
    assert.equal(terminal[PROVIDER], 0)
    await Promise.all(operations.map(run => run())); assert.deepEqual(await inspect(zero), terminal)
  }

  await mf.dispose(); mf = new Miniflare(options)
  assert.deepEqual(await inspect(fault), final, 'Actual SQLite records survive full workerd restart')
  assert.equal((await v2(fault, '/reconcile-studio-provider', { id: faultId, receipt: receipt(faultId) })).repeated, true)
  assert.equal((await v2(fault, '/studio-current', {})).job.id, faultId)
  assert.equal((await v2(blueprint, '/reconcile-blueprint-provider', { id: blueprintId })).repeated, true)
  assert.equal((await inspect(concurrent)).balance, 1250)
})
