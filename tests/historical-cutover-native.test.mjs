import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { fileURLToPath } from 'node:url'

const bundle = await build({
  stdin: {
    contents: `import { historicalBudgetNamespace } from './server/historicalDataBoundary.ts';
      import { entitlementCall } from './server/entitlements.ts';
      export { AccountEntitlements } from './server/entitlements.ts';
      export { GenerationBudget } from './server/budget.ts';
      export class Probe {
        async fetch(request) { return Response.json({ url: request.url, method: request.method,
          header: request.headers.get('X-Fixture'), body: await request.text() }); }
      }
      export default { async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path === '/account') return Response.json(await entitlementCall(env,
          '11111111-2222-4333-8444-555555555555', '/grant', { id: 'in_nativefixture', credits: 1200 }));
        if (path === '/account-status') return Response.json(await entitlementCall(env,
          '11111111-2222-4333-8444-555555555555', '/status'));
        const namespace = historicalBudgetNamespace(path === '/probe' ? env.PROBE : env.GENERATION_BUDGET);
        const { idFromName, get } = namespace, { fetch: send } = get(idFromName('native-fixture'));
        if (path === '/probe') return send(new Request('https://budget.internal/promo-fund?native=1', request));
        return send(new Request('https://budget.internal' + path, request));
      } };`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'cutover-native-fixture.ts',
  }, bundle: true, write: false, format: 'esm', platform: 'neutral',
})

test('native workerd preserves Request forwarding, bound namespace/stub methods and SQLite archive transactions', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    durableObjects: {
      GENERATION_BUDGET: { className: 'GenerationBudget', useSQLite: true },
      ACCOUNT_ENTITLEMENTS: { className: 'AccountEntitlements', useSQLite: true },
      PROBE: { className: 'Probe', useSQLite: true },
    },
    outboundService: () => { throw new Error('No external calls are allowed') },
  }))
  t.after(() => mf.dispose())
  const body = JSON.stringify({ id: 'in_nativefixture', jobs: 3 })
  const echoed = await mf.dispatchFetch('https://fixture.test/probe', { method: 'POST', headers: { 'X-Fixture': 'native' }, body })
  assert.equal(echoed.status, 200)
  assert.deepEqual(await echoed.json(), { url: 'https://budget.internal/mcc-restore-20261006/promo-fund?native=1', method: 'POST', header: 'native', body })
  for (let i = 0; i < 2; i++) {
    const funded = await mf.dispatchFetch('https://fixture.test/promo-fund', { method: 'POST', body })
    assert.equal(funded.status, 200)
    assert.equal((await funded.json()).repeated, i === 1)
  }
  const budget = await mf.dispatchFetch('https://fixture.test/promo-status')
  assert.deepEqual(await budget.json(), { funded: 3, revoked: 0, used: 0, remaining: 3 })
  for (let i = 0; i < 2; i++) {
    const granted = await mf.dispatchFetch('https://fixture.test/account', { method: 'POST' })
    assert.equal(granted.status, 200)
    assert.equal((await granted.json()).granted, i === 0)
  }
  const account = await mf.dispatchFetch('https://fixture.test/account-status')
  assert.equal(account.status, 200)
  assert.equal((await account.json()).credits, 1200)
})
