import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-10-06T05:00:00.000Z'), END = Date.parse('2026-10-06T12:00:00.000Z')
const STATE = 'overnight-api-test-budget:v1'
const fingerprint = 'a'.repeat(64)
const config = (patch = {}) => JSON.stringify({ version: 1, approvalId: 'api-tests-20261006-044444-usd4', accountId: OWNER,
  issuedAt: '2026-10-06T04:44:44.000Z', expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400, ...patch })
const projectConfig = (patch = {}) => JSON.stringify({ version: 1, accountId: OWNER, issuedAt: '2026-10-05T10:00:00.000Z',
  expiresAt: '2026-10-05T11:00:00.000Z', maxProviderCents: 175, maxAttempts: 1, fingerprint: 'b'.repeat(64), ...patch })
const input = (patch = {}) => ({ jobId: crypto.randomUUID(), fingerprint, workflow: 'detailed-astra', ...patch })

test('native SQLite preserves the immutable overnight USD4 pool under races, rollback and uncertain acknowledgement', { timeout: 30_000 }, async t => {
  // Only synthetic inspection/fault routes are added; production claim logic
  // runs unchanged inside Miniflare's actual SQLite-backed transactions.
  const bundle = await build({ stdin: {
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'overnight-pool-native-fixture.ts',
    contents: `
      import { overnightTestPoolRoute, OVERNIGHT_TEST_STATE } from './server/overnightTestBudget.ts';
      export class NativeOvernightPool {
        constructor(state, env) {
          const fault = { postWrite: false, lostAck: false, expireAfterWrite: false };
          const clock = { now: ${NOW} };
          const wrap = storage => ({
            get: key => storage.get(key),
            put: async (key, value) => {
              if (key !== OVERNIGHT_TEST_STATE) throw new Error('Unexpected pool write');
              await storage.put(key, value);
              if (fault.expireAfterWrite) { fault.expireAfterWrite = false; clock.now = ${END}; }
              if (fault.postWrite) { fault.postWrite = false; throw new Error('Inert post-write SQLite failure'); }
            },
            transaction: async callback => {
              const result = await storage.transaction(tx => callback(wrap(tx)));
              if (fault.lostAck) { fault.lostAck = false; throw new Error('Inert lost committed acknowledgement'); }
              return result;
            },
          });
          this.fixtureStorage = state.storage; this.storage = wrap(state.storage);
          this.env = { ...env }; this.clock = clock; this.fault = fault;
        }
        async fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.fixtureStorage.list()));
          if (path === '/fixture-controls' && request.method === 'POST') {
            const input = await request.json();
            if (Object.hasOwn(input, 'config')) {
              if (input.config === null) delete this.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET;
              else this.env.WORLDIFACT_OVERNIGHT_TEST_BUDGET = input.config;
            }
            if (Object.hasOwn(input, 'projectConfig')) this.env.WORLDIFACT_ASTRA_PROJECT_BUDGET = input.projectConfig;
            if (Object.hasOwn(input, 'now')) this.clock.now = input.now;
            if (Object.hasOwn(input, 'state')) await this.fixtureStorage.put(OVERNIGHT_TEST_STATE, input.state);
            if (input.fault) this.fault[input.fault] = true;
            return Response.json({ configured: true });
          }
          return await overnightTestPoolRoute(request, this.storage, this.env, () => this.clock.now) ?? new Response(null, { status: 404 });
        }
      }
      export default { fetch(request, env) {
        const name = request.headers.get('X-Fixture');
        if (!name || !/^native-overnight-[a-z0-9-]+$/.test(name)) return new Response(null, { status: 400 });
        return env.TEST_POOLS.get(env.TEST_POOLS.idFromName(name)).fetch(request);
      } };
    `,
  }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-09-14', cf: false, script: bundle.outputFiles[0].text,
    bindings: { WORLDIFACT_OVERNIGHT_TEST_BUDGET: config(), ACCOUNT_LEDGER_MODE: 'live' },
    durableObjects: { TEST_POOLS: { className: 'NativeOvernightPool', useSQLite: true } },
    outboundService: () => { throw new Error('Offline overnight pool tests must never contact a provider') },
  }))
  t.after(() => mf.dispose())
  async function call(name, path, body, status = 200, account = OWNER) {
    const response = await mf.dispatchFetch('https://overnight.synthetic.invalid' + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'X-Fixture': name, 'X-WORLDIFACT-Verified-Account': account },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const value = await response.json()
    assert.equal(response.status, status, JSON.stringify(value)); return value
  }
  const reserve = (name, body = input(), status = 200, account = OWNER) => call(name, '/overnight-test-claim', body, status, account)
  const inspect = name => call(name, '/fixture-inspect')
  const control = (name, body) => call(name, '/fixture-controls', body)

  await t.test('mixed concurrent new claims cannot exceed four attempts or 395 cents', async () => {
    const name = 'native-overnight-cap', workflows = ['detailed-astra', 'blueprint-sol', 'blueprint-luna']
    const requests = Array.from({ length: 48 }, (_, i) => input({ workflow: workflows[i % 3] }))
    const results = await Promise.all(requests.map(body => reserve(name, body)))
    assert.equal(results.filter(value => value.approved === true).length, 4)
    const before = await inspect(name), saved = before[STATE]
    assert.deepEqual(Object.keys(before), [STATE], 'Only the fixed pool record may be written')
    assert.equal(saved.committedCents, 395); assert.equal(saved.claims.length, 4)
    assert.equal(new Set(saved.claims.map(value => value.jobId)).size, 4)
    assert.deepEqual(Object.fromEntries(workflows.map(workflow => [workflow, saved.claims.filter(value => value.workflow === workflow).length])),
      { 'detailed-astra': 2, 'blueprint-sol': 1, 'blueprint-luna': 1 })
    const status = await call(name, '/overnight-test-status')
    assert.equal(status.available, false); assert.equal(status.remainingCents, 5); assert.equal(status.noRecycling, true)
    for (const [i, result] of results.entries()) if (result.approved) assert.deepEqual(await reserve(name, requests[i]), result)
    for (const workflow of workflows) assert.equal((await reserve(name, input({ workflow }))).approved, false)
    assert.deepEqual(await inspect(name), before)
  })

  await t.test('racing duplicate jobs commit once and retain exact workflow, fingerprint, model and cap', async () => {
    const name = 'native-overnight-duplicate', body = input()
    const results = await Promise.all(Array.from({ length: 20 }, () => reserve(name, body)))
    assert.equal(results[0].approved, true)
    for (const result of results) assert.deepEqual(result, results[0])
    const before = await inspect(name)
    assert.equal(before[STATE].committedCents, 175); assert.equal(before[STATE].claims.length, 1)
    assert.equal(results[0].claim.model, 'gpt-6-astra'); assert.equal(results[0].claim.capCents, 175)
    for (const patch of [{ fingerprint: 'b'.repeat(64) }, { workflow: 'blueprint-sol' }, { workflow: 'blueprint-luna' }])
      assert.equal((await reserve(name, { ...body, ...patch })).approved, false)
    assert.deepEqual(await inspect(name), before)
  })

  await t.test('a throw after the SQLite write rolls back the entire new claim', async () => {
    const name = 'native-overnight-rollback', first = input(), second = input()
    await reserve(name, first); const before = await inspect(name)
    await control(name, { fault: 'postWrite' }); await reserve(name, second, 503)
    assert.deepEqual(await inspect(name), before, 'A staged write must not consume a partial second attempt')
    assert.equal((await reserve(name, second)).approved, true)
    const after = await inspect(name)
    assert.equal(after[STATE].claims.length, 2); assert.equal(after[STATE].committedCents, 350)
    assert.equal((await reserve(name)).approved, false)
    assert.deepEqual(await inspect(name), after)
  })

  await t.test('a lost response after SQLite commit permanently consumes its slot', async () => {
    const name = 'native-overnight-lost-ack', body = input()
    await control(name, { fault: 'lostAck' }); await reserve(name, body, 503)
    const before = await inspect(name)
    assert.equal(before[STATE].committedCents, 175); assert.equal(before[STATE].claims.length, 1)
    assert.equal((await reserve(name, { ...body, fingerprint: 'b'.repeat(64) })).approved, false)
    assert.equal((await reserve(name, body)).approved, true)
    assert.deepEqual(await inspect(name), before)
    assert.equal((await reserve(name)).approved, true); assert.equal((await reserve(name)).approved, false)
    assert.equal((await inspect(name))[STATE].committedCents, 350)
  })

  await t.test('account rebinding, removal and changed approval cannot refill an occupied SQLite record', async () => {
    const name = 'native-overnight-rotation', body = input()
    await reserve(name, body); const before = await inspect(name)
    await control(name, { config: config({ accountId: OTHER }) })
    await reserve(name, body, 403)
    await reserve(name, input(), 503, OTHER)
    await call(name, '/overnight-test-status', undefined, 503, OTHER)
    assert.deepEqual(await inspect(name), before)
    for (const raw of [null, '{', config({ approvalId: 'another-night' }), config({ expiresAt: '2026-10-07T04:00:00.000Z' }), config({ totalCents: 800 })]) {
      await control(name, { config: raw }); await reserve(name, body, 403); await reserve(name, input(), 403)
      assert.deepEqual(await inspect(name), before)
    }
    await control(name, { config: config() })
    assert.equal((await reserve(name, body)).approved, true)
    assert.deepEqual(await inspect(name), before)
    assert.equal((await call(name, '/overnight-test-status')).committedCents, 175)
  })

  await t.test('an expired historical selector creates only the fresh fixed pool and never a rotating refill', async () => {
    const name = 'native-overnight-private-selector'
    await control(name, { config: null, projectConfig: projectConfig() })
    const requests = ['detailed-astra', 'detailed-astra', 'blueprint-sol', 'blueprint-luna'].map(workflow => input({ workflow }))
    for (const body of requests) assert.equal((await reserve(name, body)).approved, true)
    const before = await inspect(name)
    assert.deepEqual(Object.keys(before), [STATE]); assert.equal(before[STATE].committedCents, 395)
    assert.equal(before[STATE].authority.totalCents, 400)
    assert.equal(before[STATE].authority.expiresAt, '2026-10-06T12:00:00.000Z')
    await control(name, { projectConfig: projectConfig({ fingerprint: 'c'.repeat(64) }) })
    assert.equal((await reserve(name)).approved, false)
    assert.equal((await reserve(name, requests[0])).approved, true)
    assert.deepEqual(await inspect(name), before)
    await control(name, { config: '' }); await reserve(name, requests[0], 403)
    assert.deepEqual(await inspect(name), before, 'An invalid explicit authority cannot fall back')
    await control(name, { config: null, projectConfig: projectConfig({ accountId: OTHER }) })
    await reserve(name, input(), 503, OTHER)
    assert.deepEqual(await inspect(name), before)
    await control(name, { projectConfig: projectConfig(), now: END })
    await reserve(name, requests[0], 403)
    assert.equal((await call(name, '/overnight-test-status')).available, false)
    assert.deepEqual(await inspect(name), before)
  })

  await t.test('corrupt persisted models, caps, totals, future timestamps and duplicate claims remain occupied and unavailable', async () => {
    for (const [index, corrupt] of [
      state => { state.claims[0].model = 'gpt-6-sol' },
      state => { state.claims[0].capCents = 1; state.committedCents = 1 },
      state => { state.committedCents = 0 },
      state => { state.claims[0].claimedAt = NOW + 1 },
      state => { state.claims.push(state.claims[0]); state.committedCents = 350 },
    ].entries()) {
      const name = 'native-overnight-corrupt-' + index, body = input()
      await reserve(name, body)
      const before = await inspect(name); corrupt(before[STATE]); await control(name, { state: before[STATE] })
      await call(name, '/overnight-test-status', undefined, 503)
      await reserve(name, body, 503); await reserve(name, input(), 503)
      await reserve(name, input({ workflow: 'blueprint-sol' }), 503)
      assert.deepEqual(await inspect(name), before, 'Corruption must not be reset or repaired into fresh capacity')
    }
  })

  await t.test('expiry while a write is pending denies acknowledgement but retains the full commitment', async () => {
    const name = 'native-overnight-late-write', body = input()
    await control(name, { now: END - 1, fault: 'expireAfterWrite' })
    assert.equal((await reserve(name, body)).approved, false)
    const before = await inspect(name)
    assert.equal(before[STATE].committedCents, 175)
    assert.equal(before[STATE].claims[0].claimedAt, END - 1)
    await reserve(name, body, 403); await reserve(name, input(), 403)
    const status = await call(name, '/overnight-test-status')
    assert.equal(status.available, false); assert.equal(status.committedCents, 175); assert.equal(status.noRecycling, true)
    assert.deepEqual(await inspect(name), before)
  })
})
