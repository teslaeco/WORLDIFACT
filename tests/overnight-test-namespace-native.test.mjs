import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { OVERNIGHT_TEST_NAMESPACE, OVERNIGHT_TEST_STATE, OVERNIGHT_TEST_APPROVAL, OVERNIGHT_TEST_EXPIRES } from '../server/overnightTestBudget.ts'
import { OvernightTestClient } from '../src/lib/overnightTestClient.ts'

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

test('Worker status uses the project selector through the real native ledger constructor and client validation', async t => {
  // The fallback selector is synthetic. No explicit overnight setting, injected
  // ledger clock or constructor subclass can hide production integration errors.
  const project = JSON.stringify({ version: 1, accountId: owner,
    issuedAt: '2026-10-05T15:16:55.000Z', expiresAt: '2026-10-06T15:16:55.000Z',
    maxProviderCents: 175, maxAttempts: 1, fingerprint: 'a'.repeat(64) })
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { handle, AccountEntitlements } from './server/worker.ts';
    export { AccountEntitlements };
    export default { async fetch(request, env) {
      if (request.method !== 'GET' || new URL(request.url).pathname !== '/api/overnight-tests/status')
        throw new Error('Only read-only status requests are permitted in this fixture');
      let authReads = 0, limitReads = 0;
      const response = await handle(request, { ...env, ACCOUNT_LIMITER: { async limit({ key }) {
        if (key !== 'account:generation-funding:${owner}') throw new Error('Unexpected rate-limit scope');
        limitReads++; return { success: true };
      } } }, async (input, init) => {
        const headers = new Headers(init?.headers);
        if (String(input) !== 'https://fixture.supabase.co/auth/v1/user' || init?.method !== 'GET' ||
            headers.get('Authorization') !== 'Bearer inert-fixture-account' ||
            headers.get('apikey') !== 'sb_publishable_overnight_fixture_only')
          throw new Error('Only the inert account verification response is permitted');
        authReads++;
        return Response.json({ id: '${owner}', email: 'owner@example.invalid' });
      });
      response.headers.set('X-Fixture-Auth-Reads', String(authReads));
      response.headers.set('X-Fixture-Limit-Reads', String(limitReads));
      return response;
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  let outboundCalls = 0
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    bindings: { WORLDIFACT_ASTRA_PROJECT_BUDGET: project, SUPABASE_URL: 'https://fixture.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_overnight_fixture_only', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'AccountEntitlements', useSQLite: true } },
    outboundService: () => { outboundCalls++; throw new Error('Offline status test forbids all outbound requests') },
  }))
  t.after(() => mf.dispose())
  const calls = []
  const storage = { getItem: () => null,
    setItem() { throw new Error('A status check must not write a receipt') },
    removeItem() { throw new Error('A status check must not delete a receipt') } }
  const client = new OvernightTestClient(storage, async (path, init) => {
    calls.push([path, init.method])
    assert.equal(path, '/api/overnight-tests/status'); assert.equal(init.method, 'GET')
    const response = await mf.dispatchFetch('https://fixture.invalid' + path, {
      method: init.method, headers: { ...Object.fromEntries(new Headers(init.headers)), Cookie: '__Host-worldifact-access=inert-fixture-account' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('X-Fixture-Auth-Reads'), '1')
    assert.equal(response.headers.get('X-Fixture-Limit-Reads'), '1')
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(response.headers.get('Vary'), 'Cookie')
    return response
  }, owner, () => true)
  const before = Date.now(), status = await client.status(), after = Date.now()
  assert.deepEqual(status, { accountContract: 'approved-test-account-v1', commitments: [], available: status.available, approvalId: OVERNIGHT_TEST_APPROVAL,
    expiresAt: OVERNIGHT_TEST_EXPIRES, totalCents: 400, committedCents: 0, remainingCents: 400,
    attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true })
  // Status remains readable after expiry; using the real clock must not make
  // this regression fail merely because the fixed paid-test window has ended.
  const end = Date.parse(OVERNIGHT_TEST_EXPIRES)
  if ((before < end) === (after < end)) assert.equal(status.available, after < end)
  assert.deepEqual(client.rows().map(row => row.state), ['empty', 'empty', 'empty', 'empty'])
  assert.deepEqual(calls, [['/api/overnight-tests/status', 'GET']])
  assert.equal(outboundCalls, 0)
})
