import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { NOW, OWNER, OTHER, HELD, RESERVE, IDS, authority, fixtureSeed } from './fixtures/held-points-forfeit.ts'
const PREFIX = 'paid-points-job:v2:', AUDIT = 'held-points-forfeit:20261010:v1'
const APPROVAL = 'held-points-forfeit-20261010-v1', ROUTE = '/generation-v3/held-points-forfeit'
const seed = fixtureSeed(), mutable = IDS.map(id => PREFIX + id).concat(HELD, 'balance', AUDIT)

test('native SQLite incident forfeiture: production routes, transaction rollback, concurrency, immutable recovery and private audit binding', { timeout: 60000 }, async t => {
  // Test-only source substitution binds the real route, writer AND read barrier
  // to inert fixture hashes. No runtime/environment/request override ships.
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'failed-hold-native-fixture.ts', contents: `
    import { AccountEntitlements } from './server/entitlements.ts';
    import { heldPointsForfeitApi } from './server/heldPointsForfeit.ts';
    export class NativeLedger extends AccountEntitlements {
      constructor(state, env) {
        const controls = { faultKey: null };
        const wrap = storage => ({
          get: key => storage.get(key), list: options => storage.list(options),
          put: async (key, value) => { await storage.put(key, value); if (controls.faultKey === key) { controls.faultKey = null; throw new Error('Native post-write fault'); } },
          transaction: callback => storage.transaction(tx => callback(wrap(tx))),
        });
        super({ storage: wrap(state.storage), id: state.id }, env, () => ${NOW});
        this.nativeStorage = state.storage; this.controls = controls;
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture-reset') { await this.nativeStorage.deleteAll(); await this.nativeStorage.put(${JSON.stringify(seed)}); return Response.json({ seeded: true }); }
        if (path === '/fixture-inspect') return Response.json(Object.fromEntries(await this.nativeStorage.list()));
        if (path === '/fixture-patch') { await this.nativeStorage.put(await request.json()); return Response.json({ patched: true }); }
        if (path === '/fixture-fault') { this.controls.faultKey = (await request.json()).key; return Response.json({ armed: true }); }
        if (path === '/fixture-lost-response') {
          const changed = await super.fetch(new Request('https://ledger.internal${ROUTE}', { method: 'POST', headers: { 'X-WORLDIFACT-Verified-Account': '${OWNER}', 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalId: '${APPROVAL}' }) }));
          if (changed.status !== 200) return changed;
          return Response.json({ error: 'Lost committed acknowledgement' }, { status: 503 });
        }
        return super.fetch(request);
      }
    }
    export default { fetch(request, env) {
      if (new URL(request.url).pathname === '/api/account/held-points-forfeit') return heldPointsForfeitApi(request, {
        ...env, ACCOUNT_LIMITER: { limit: async () => ({ success: request.headers.get('X-Fixture-Limited') !== 'true' }) }
      }, async (url, init) => {
        if (String(url) !== 'https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/user' || init.method !== 'GET') throw new Error('Unexpected network operation');
        return Response.json({ id: request.headers.get('X-Fixture-User') ?? '${OWNER}' });
      });
      const name = request.headers.get('X-Fixture-Namespace') ?? 'account:v1:${OWNER}';
      return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(name)).fetch(request);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral', plugins: [{ name: 'inert-forfeiture-authority', setup(build) {
    build.onLoad({ filter: /\/server\/heldPointsForfeit\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8')
      const start = source.indexOf('const APPROVED_AUTHORITY: HeldPointsForfeitAuthority = Object.freeze({'), end = source.indexOf('\ntype Row =', start)
      assert.ok(start > 0 && end > start, 'Fixture only substitutes reviewed constant declaration')
      return { loader: 'ts', contents: source.slice(0, start) + 'const APPROVED_AUTHORITY: HeldPointsForfeitAuthority = ' + JSON.stringify(authority) + ';\n' + source.slice(end) }
    })
  } }] })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false, script: bundle.outputFiles[0].text,
    bindings: { ACCOUNT_LEDGER_MODE: 'live' }, durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeLedger', useSQLite: true } },
    outboundService: () => { throw new Error('Native forfeiture fixtures must never contact upstream services') },
  }))
  t.after(() => mf.dispose())
  async function call(path, body, expected = 200, extraHeaders = {}) {
    const response = await mf.dispatchFetch('https://ledger.example.test' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Verified-Account': OWNER, ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json(); assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), response.status + ": " + JSON.stringify(result)); return result
  }
  const reset = () => call('/fixture-reset', {})
  const inspect = () => call('/fixture-inspect')
  const apply = () => call(ROUTE, { approvalId: APPROVAL })
  await t.test('production-shaped read-only preview and every post-put failure roll back all native SQLite writes', async () => {
    for (const key of mutable) {
      await reset(); const before = await inspect()
      assert.equal((await call(ROUTE)).status, 'preview'); assert.deepEqual(await inspect(), before)
      await call('/fixture-fault', { key }); await call(ROUTE, { approvalId: APPROVAL }, 503)
      assert.deepEqual(await inspect(), before, key)
      assert.equal((await apply()).status, 'applied')
      const after = await inspect(); assert.equal(after.balance, 190); assert.equal(after[HELD], 0); assert.equal(after[RESERVE], before[RESERVE])
      for (const [entry, value] of Object.entries(before)) {
        if (entry.startsWith(PREFIX)) assert.deepEqual(after[entry], { ...value, pointSettlement: { version: 1, state: 'forfeited', heldPoints: 0, chargedPoints: 0, forfeitedPoints: 250, approvalId: APPROVAL } })
        else if (entry !== HELD && entry !== 'balance') assert.deepEqual(after[entry], value, entry)
      }
      assert.equal(after[AUDIT].authorizationReferenceSha256, authority.authorizationReferenceSha256)
    }
  })
  await t.test('two simultaneous applications commit once; later spending never alters immutable replay or replenishes held points', async () => {
    await reset()
    const replies = await Promise.all([apply(), apply()])
    assert.deepEqual(replies.map(reply => reply.status).sort(), ['already-applied', 'applied'])
    const audit = (await inspect())[AUDIT]
    await call('/fixture-patch', { balance: 690, [HELD]: 250, [RESERVE]: 0, billingHold: true })
    const before = await inspect()
    assert.equal((await apply()).status, 'already-applied'); assert.equal((await call(ROUTE)).status, 'already-applied')
    assert.deepEqual(await inspect(), before); assert.deepEqual(before[AUDIT], audit)
  })
  await t.test('new paid reader accepts only audited forfeiture, keeps history failed, and late completion/reconciliation cannot change it', async () => {
    await reset(); await apply(); const before = await inspect()
    for (const id of IDS) {
      const job = before[PREFIX + id], access = await call('/generation-v3/job', { id })
      assert.equal(access.state, 'failed'); assert.equal(access.pointSettlement.state, 'forfeited'); assert.equal(access.held, false); assert.equal(access.downloadAllowed, false)
      for (const state of ['failed', 'completed']) {
        const result = await call('/generation-v3/settle', { id, state, ...(state === 'completed' ? { validatedLateCompletion: 'existing-model-v1' } : {}) })
        assert.equal(result.repeated, true); assert.equal(result.pointSettlement.state, 'forfeited')
      }
      assert.equal((await call('/generation-v3/studio-dispatch', { id, fingerprint: job.fingerprint })).dispatch, false)
      const receipt = job.providerLiability.evidence.receipt
      assert.equal((await call('/generation-v3/reconcile-studio-provider', { id, receipt })).repeated, true)
      assert.equal((await call('/generation-v3/reconcile-studio-provider', { id, receipt: { ...receipt, maximumLiabilityMicroUsd: 0 } })).reconciled, false)
    }
    const current = await call('/generation-v3/studio-current', {})
    assert.equal(current.job.pointSettlement.state, 'forfeited'); assert.equal(current.job.state, 'failed')
    const funding = await call('/generation-v3/generation-funding')
    assert.equal(funding.paidMembershipLiability.maximumLiabilityCents, 68); assert.equal(funding.paidMembershipLiability.jobs, 4)
    assert.deepEqual(await inspect(), before)
    await call('/fixture-patch', { [AUDIT]: { ...before[AUDIT], authorizationReferenceSha256: 'f'.repeat(64) } })
    const corrupted = await inspect()
    await call('/generation-v3/job', { id: IDS[0] }, 503)
    await call('/generation-v3/settle', { id: IDS[0], state: 'completed', validatedLateCompletion: 'existing-model-v1' }, 503)
    assert.equal((await call(ROUTE, { approvalId: APPROVAL }, 409)).code, 'AUDIT_INVALID')
    assert.deepEqual(await inspect(), corrupted)
  })
  await t.test('native forfeiture versus valid late completion serializes to forfeiture or stale-baseline refusal, never forfeiture plus charge', async () => {
    for (const order of ['forfeiture-first', 'completion-first', 'concurrent']) {
      await reset()
      const forfeiture = () => call(ROUTE, { approvalId: APPROVAL }, [200, 409])
      const complete = () => call('/generation-v3/settle', { id: IDS[0], state: 'completed', validatedLateCompletion: 'existing-model-v1' })
      let forfeited
      if (order === 'forfeiture-first') { forfeited = await forfeiture(); await complete(); assert.equal(forfeited.status, 'applied') }
      else if (order === 'completion-first') { await complete(); forfeited = await forfeiture(); assert.equal(forfeited.code, 'BASELINE_CHANGED') }
      else [forfeited] = await Promise.all([forfeiture(), complete()])
      const after = await inspect()
      if (forfeited.status === 'applied') {
        assert.equal(after.balance, 190); assert.equal(after[HELD], 0); assert.equal(after[PREFIX + IDS[0]].state, 'failed')
      } else {
        assert.equal(forfeited.code, 'BASELINE_CHANGED'); assert.equal(after.balance, 940); assert.equal(after[HELD], 750); assert.equal(after[AUDIT], undefined)
        assert.equal(after[PREFIX + IDS[0]].state, 'completed')
      }
    }
  })
  await t.test('lost committed acknowledgement returns already-applied on explicit read without reapplying', async () => {
    await reset(); await call('/fixture-lost-response', {}, 503); const before = await inspect()
    assert.equal((await call(ROUTE)).status, 'already-applied'); assert.equal((await apply()).status, 'already-applied'); assert.deepEqual(await inspect(), before)
  })
  await t.test('self-authenticated public GET/POST use same-origin checks and exact server-side namespace; no caller-supplied override', async () => {
    await reset(); const before = await inspect()
    const path = '/api/account/held-points-forfeit', cookie = { Cookie: '__Host-worldifact-access=inert-cookie' }, origin = { Origin: 'https://ledger.example.test' }
    await call(path, undefined, 401)
    await call(path, undefined, 403, { ...cookie, 'X-Fixture-User': OTHER, 'X-WORLDIFACT-Verified-Account': OWNER })
    await call(path, undefined, 403, { ...cookie, Origin: 'https://evil.example.test' })
    await call(path, undefined, 429, { ...cookie, 'X-Fixture-Limited': 'true' })
    await call(path, { approvalId: APPROVAL }, 403, cookie)
    await call(path, { approvalId: APPROVAL, balance: 1190 }, 400, { ...cookie, ...origin })
    await call('/held-points-forfeit', { approvalId: APPROVAL }, 403)
    await call(ROUTE, { approvalId: APPROVAL }, 403, { 'X-Fixture-Namespace': 'account:sandbox:v1:' + OWNER })
    assert.deepEqual(await inspect(), before)
    assert.equal((await call(path, undefined, 200, cookie)).status, 'preview'); assert.deepEqual(await inspect(), before)
    assert.equal((await call(path, { approvalId: APPROVAL }, 200, { ...cookie, ...origin, 'X-WORLDIFACT-Verified-Account': OTHER })).status, 'applied')
    assert.equal((await call(path, undefined, 200, cookie)).status, 'already-applied')
  })
})
