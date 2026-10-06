import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const NOW = Date.parse('2026-10-05T20:00:00Z'), accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
test('native SQLite refunds failed Blueprint points and bounded capacity atomically, once', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'failed-blueprint-native-fixture.ts', contents: `
    import { AccountEntitlements } from './server/entitlements.ts';
    export class NativeLedger extends AccountEntitlements {
      constructor(state, env) {
        const fault = { armed: false };
        const wrap = storage => ({
          get: key => storage.get(key), list: options => storage.list(options),
          put: async (key, value) => {
            if (fault.armed && key === 'provider-budget-cents:v1') {
              fault.armed = false; throw new Error('Inert final provider-write failure');
            }
            return storage.put(key, value);
          },
          transaction: callback => storage.transaction(tx => callback(wrap(tx))),
        });
        super({ storage: wrap(state.storage) }, env, () => ${NOW});
        this.fixtureStorage = state.storage; this.fixtureFault = fault;
      }
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/fixture-fault') { this.fixtureFault.armed = true; return Response.json({ armed: true }); }
        if (url.pathname === '/fixture-inspect') return Response.json(Object.fromEntries(await this.fixtureStorage.list()));
        return super.fetch(request);
      }
    }
    export default { fetch(request, env) {
      const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(request.headers.get('X-Fixture')));
      return ledger.fetch(request);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { ENABLE_ASTRA_PLANS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Inert native fairness tests must never contact a provider') },
  }))
  t.after(() => mf.dispose())
  async function call(name, path, body, status = 200) {
    const response = await mf.dispatchFetch('https://ledger.example.test' + path, { method: body ? 'POST' : 'GET',
      headers: { 'X-Fixture': name, 'X-WORLDIFACT-Verified-Account': accountId }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value
  }
  for (const [model, providerModel, cap, retained] of [['luna', null, 10, 1], ['sol', null, 35, 2], ['sol', 'gpt-6.1-sol', 35, 2], ['astra', null, 175, 5]]) await t.test(providerModel ?? model, async () => {
    const name = 'native-failed-' + (providerModel ?? model), id = crypto.randomUUID(), fingerprint = 'a'.repeat(64)
    await call(name, '/grant', { id: 'in_native', credits: 4500, subscriptionId: 'sub_native' })
    await call(name, '/subscription', { id: 'sub_native', active: true, until: NOW + 86400000, revision: 1, plan: 'pro', grantId: 'in_native' })
    await call(name, '/reserve', { id, fingerprint, channel: 'blueprint', model, profile: model === 'astra' ? 'slow' : 'fast', blueprintDispatch: 'fenced-v1', ...(providerModel ? { providerModel } : {}) })
    const claim = await call(name, '/blueprint-dispatch', { id, fingerprint }); assert.equal(claim.dispatch, true)
    const proof = { revision: 'blueprint-terminal-usage-v1', accountId, requestId: id, fingerprint, model: providerModel ?? 'gpt-6-' + model,
      dispatchDeadline: claim.deadline, dispatchedAt: NOW, receivedAt: NOW, maxOutputTokens: 4000, reservedCents: cap,
      providerResponseId: 'resp_native_failed', providerStatus: 'incomplete', incompleteReason: 'max_output_tokens', inputTokens: 1000, outputTokens: 100, totalTokens: 1100 }
    const settle = status => call(name, '/settle', { id, state: 'failed', blueprintTerminalUsage: proof }, status)
    const before = await call(name, '/fixture-inspect'); assert.equal(before['provider-budget-cents:v1'], 3150 - cap)
    await call(name, '/fixture-fault', {}); await settle(503)
    assert.deepEqual(await call(name, '/fixture-inspect'), before, 'Final provider write rolls points and saved job proof back in actual SQLite')
    const results = await Promise.all(Array.from({ length: 8 }, () => settle(200)))
    assert.equal(results.filter(reply => reply.repeated === false).length, 1)
    const after = await call(name, '/fixture-inspect')
    assert.equal(after.balance, 4500); assert.equal(after['provider-budget-cents:v1'], 3150 - retained)
    assert.equal(after['job:' + id].state, 'failed'); assert.equal(after['job:' + id].blueprintProviderReconciliation.retainedCents, retained)
    assert.equal((await call(name, '/blueprint-dispatch', { id, fingerprint })).dispatch, false)
    await call(name, '/settle', { id, state: 'completed' }); await settle(200)
    assert.deepEqual(await call(name, '/fixture-inspect'), after)
  })
})
