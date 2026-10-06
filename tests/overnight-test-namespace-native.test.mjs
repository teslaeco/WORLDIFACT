import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE, OVERNIGHT_TEST_APPROVAL } from '../server/overnightTestBudget.ts'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const config = JSON.stringify({ version: 1, approvalId: OVERNIGHT_TEST_APPROVAL, accountId: owner,
  issuedAt: '2026-10-06T04:44:44.000Z', expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400 })
test('actual Durable Object identity confines the overnight authority to one fixed namespace', async t => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { AccountEntitlements } from './server/entitlements.ts';
    export class TestLedger extends AccountEntitlements {
      constructor(state, env) { super(state, env, () => Date.parse('2026-10-06T05:00:00Z')); this.fixtureStorage = state.storage; }
      async fetch(request) { if (new URL(request.url).pathname === '/inspect') return Response.json(Object.fromEntries(await this.fixtureStorage.list())); return super.fetch(request); }
    }
    export default { fetch(request, env) {
      return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(request.headers.get('X-Fixture-Namespace'))).fetch(request);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { WORLDIFACT_OVERNIGHT_TEST_BUDGET: config },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'TestLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Offline namespace test forbids provider calls') },
  }))
  t.after(() => mf.dispose())
  const call = (namespace, path, body) => mf.dispatchFetch('https://fixture.test' + path, { method: body ? 'POST' : 'GET',
    headers: { 'X-Fixture-Namespace': namespace, 'X-WORLDIFACT-Verified-Account': owner }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const claim = { jobId: crypto.randomUUID(), fingerprint: 'a'.repeat(64), workflow: 'blueprint-sol' }
  for (const namespace of ['account:v1:' + owner, 'api-tests-20261006-044444-usd4:rotated', 'anything-else']) {
    assert.equal((await call(namespace, '/overnight-test-claim', claim)).status, 403)
    assert.deepEqual(await (await call(namespace, '/inspect')).json(), {})
  }
  const allowed = await call(OVERNIGHT_TEST_NAMESPACE, '/overnight-test-claim', claim)
  assert.equal(allowed.status, 200); assert.equal((await allowed.json()).approved, true)
  const stored = await (await call(OVERNIGHT_TEST_NAMESPACE, '/inspect')).json()
  assert.equal(stored[OVERNIGHT_TEST_STATE].committedCents, 35)
  assert.equal((await call(OVERNIGHT_TEST_NAMESPACE, '/overnight-test-status')).status, 200)
})
