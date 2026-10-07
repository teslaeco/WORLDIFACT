import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const NOW = Date.parse('2026-10-07T07:00:00Z'), OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RESERVE = 'provider-budget-cents:v1', HELD = 'customer-reserved-credits:v1', AUDIT = 'owner-reserve-adjustment:20261007:v1'
const hash = value => createHash('sha256').update(value).digest('hex')
const authority = { ownerAccountSha256: hash(OWNER), stripeCustomerSha256: hash('cus_NativeFixture'), subscriptionSha256: hash('sub_NativeShared'),
  invoiceSha256: [hash('in_NativeCreator'), hash('in_NativePro')], authorizationReferenceSha256: hash('Inert native fixture approval') }
const seed = { balance: 1440, [RESERVE]: 63, [HELD]: 0, customer: 'cus_NativeFixture',
  'grant:in_NativeCreator': { credits: 1500, revoked: 0, subscriptionId: 'sub_NativeShared' },
  'grant:in_NativePro': { credits: 4500, revoked: 0, subscriptionId: 'sub_NativeShared' },
  subscription: { active: true, plan: 'pro', id: 'sub_NativeShared' }, 'job:existing': { state: 'failed', privatePrompt: 'Unmodified' },
  'astra-support-once:v1': { consumed: true }, 'overnight-api-test-budget:v1': { historical: true } }

test('native SQLite owner adjustment rolls back both writes and commits once under concurrent retries', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'owner-adjustment-native-fixture.ts', contents: `
    import { evaluateOwnerReserveAdjustment } from './server/ownerReserveAdjustment.ts';
    import { AccountEntitlements } from './server/entitlements.ts';
    const authority = ${JSON.stringify(authority)};
    export class NativeLedger extends AccountEntitlements {
      constructor(state, env) {
        super(state, env, () => ${NOW});
        this.nativeStorage = state.storage;
        this.faultKey = null;
        const wrap = storage => ({
          get: key => storage.get(key), list: options => storage.list(options),
          put: async (key, value) => {
            if (![${JSON.stringify(RESERVE)}, ${JSON.stringify(AUDIT)}].includes(key)) throw new Error('Unexpected mutation');
            await storage.put(key, value);
            if (this.faultKey === key) { this.faultKey = null; throw new Error('Synthetic post-write fault'); }
          },
          transaction: callback => storage.transaction(tx => callback(wrap(tx))),
        });
        this.fixtureStorage = wrap(state.storage);
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture-seed') { await this.nativeStorage.put(${JSON.stringify(seed)}); return Response.json({ seeded: true }); }
        if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.nativeStorage.list()));
        if (path === '/fixture-patch') { await this.nativeStorage.put(await request.json()); return Response.json({ patched: true }); }
        if (path === '/fixture-fault') { this.faultKey = (await request.json()).key; return Response.json({ armed: true }); }
        if (['/fixture-preview', '/fixture-apply', '/fixture-lost-response'].includes(path)) {
          try {
            const result = await this.fixtureStorage.transaction(tx => evaluateOwnerReserveAdjustment(tx,
              request.headers.get('X-WORLDIFACT-Verified-Account'), path !== '/fixture-preview', authority, ${NOW}));
            if (path === '/fixture-lost-response') throw new Error('Synthetic committed acknowledgement loss');
            return Response.json(result.body, { status: result.status });
          } catch { return Response.json({ error: 'Synthetic transaction failure' }, { status: 503 }); }
        }
        return super.fetch(request);
      }
    }
    export default { fetch(request, env) {
      const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(request.headers.get('X-Fixture')));
      return ledger.fetch(request);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { ACCOUNT_LEDGER_MODE: 'live' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Inert reserve adjustment tests must never contact any upstream service') },
  }))
  t.after(() => mf.dispose())
  async function call(name, path, body, status = 200, owner = OWNER) {
    const response = await mf.dispatchFetch('https://ledger.example.test' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Fixture': name, 'X-WORLDIFACT-Verified-Account': owner, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result
  }
  await t.test('GET preview has zero persistent writes and native post-write faults roll back the entire transaction', async () => {
    for (const key of [RESERVE, AUDIT]) {
      const name = 'native-rollback-' + key
      await call(name, '/fixture-seed', {})
      const before = await call(name, '/fixture-inspect')
      assert.equal((await call(name, '/fixture-preview')).status, 'preview')
      assert.deepEqual(await call(name, '/fixture-inspect'), before)
      await call(name, '/fixture-fault', { key })
      await call(name, '/fixture-apply', {}, 503)
      assert.deepEqual(await call(name, '/fixture-inspect'), before, 'SQLite rolls back even after the selected native put completed')
      assert.equal((await call(name, '/fixture-apply', {})).status, 'applied')
      const after = await call(name, '/fixture-inspect')
      assert.equal(after[RESERVE], 175); assert.equal(after.balance, 1440); assert.equal(after[HELD], 0)
      const { [AUDIT]: audit, ...rest } = after
      assert.deepEqual(rest, { ...before, [RESERVE]: 175 })
      assert.equal(audit.amountCents, 112); assert.equal(audit.generationStarted, false)
      assert.deepEqual(audit.invoiceSha256, authority.invoiceSha256); assert.equal(audit.subscriptionSha256, authority.subscriptionSha256)
    }
  })
  await t.test('simultaneous native transactions apply once and replay immutable audit after balances change', async () => {
    const name = 'native-concurrent'
    await call(name, '/fixture-seed', {})
    const replies = await Promise.all(Array.from({ length: 16 }, () => call(name, '/fixture-apply', {})))
    assert.equal(replies.filter(value => value.status === 'applied').length, 1)
    assert.equal(replies.filter(value => value.status === 'already-applied').length, 15)
    const applied = await call(name, '/fixture-inspect'), immutableAudit = structuredClone(applied[AUDIT])
    assert.equal(applied[RESERVE], 175)
    await call(name, '/fixture-patch', { [RESERVE]: 0, balance: 1190, [HELD]: 250, billingHold: true })
    const changed = await call(name, '/fixture-inspect')
    assert.equal((await call(name, '/fixture-apply', {})).status, 'already-applied')
    assert.equal((await call(name, '/fixture-preview')).status, 'already-applied')
    assert.deepEqual(await call(name, '/fixture-inspect'), changed)
    assert.deepEqual(changed[AUDIT], immutableAudit)
  })
  await t.test('lost committed acknowledgement safely returns already applied on explicit read or repeat', async () => {
    const name = 'native-lost-response'
    await call(name, '/fixture-seed', {}); await call(name, '/fixture-lost-response', {}, 503)
    const applied = await call(name, '/fixture-inspect')
    assert.equal(applied[RESERVE], 175)
    assert.equal((await call(name, '/fixture-preview')).status, 'already-applied')
    assert.equal((await call(name, '/fixture-apply', {})).status, 'already-applied')
    assert.deepEqual(await call(name, '/fixture-inspect'), applied)
  })
  await t.test('native changed baseline, wrong account, revoked grants and corrupt marker fail closed', async () => {
    for (const [label, patch, expected] of [
      ['reserve', { [RESERVE]: 64 }, 'BASELINE_CHANGED'], ['points', { balance: 1439 }, 'BASELINE_CHANGED'],
      ['held', { [HELD]: 1 }, 'BASELINE_CHANGED'], ['hold', { billingHold: true }, 'BASELINE_CHANGED'],
      ['revoked', { 'grant:in_NativeCreator': { credits: 1500, revoked: 1, subscriptionId: 'sub_NativeShared' } }, 'PAYMENT_BINDING_INVALID'],
      ['wrong-subscription', { 'grant:in_NativePro': { credits: 4500, revoked: 0, subscriptionId: 'sub_Other' } }, 'PAYMENT_BINDING_INVALID'],
      ['audit', { [AUDIT]: { amountCents: 112 } }, 'AUDIT_INVALID'],
    ]) {
      const name = 'native-refusal-' + label
      await call(name, '/fixture-seed', {}); await call(name, '/fixture-patch', patch)
      const before = await call(name, '/fixture-inspect')
      assert.equal((await call(name, '/fixture-apply', {}, 409)).code, expected)
      assert.deepEqual(await call(name, '/fixture-inspect'), before)
    }
    const name = 'native-wrong-owner'
    await call(name, '/fixture-seed', {})
    const before = await call(name, '/fixture-inspect')
    assert.deepEqual(await call(name, '/fixture-apply', {}, 403, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), { error: 'This adjustment is unavailable.' })
    assert.deepEqual(await call(name, '/fixture-inspect'), before)
    // The actual production route must ignore fixture authority and reject this
    // synthetic namespace, even though the fixture helper can exercise writes.
    assert.deepEqual(await call(name, '/owner-reserve-adjustment', undefined, 403), { error: 'This adjustment is unavailable.' })
  })
})
