import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { detailedHealthFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORIGIN = 'https://recovery.example.test'

// Real Worker + SQLite Durable Objects across complete workerd restarts.
// Oracle/provider/storage responses are inert fixtures, not live VM evidence.
for (const durableAdmission of [false, true]) test(`native ${durableAdmission ? 'durable staged' : 'legacy'} admission, library and original exports survive Worker restarts without redispatch`, { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'worldifact-recovery-'))
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'native-recovery.ts', contents: `
    import { studioApi } from './server/studio.ts';
    import { AccountEntitlements } from './server/entitlements.ts';
    export { GenerationBudget } from './server/budget.ts';
    export class NativeAccount extends AccountEntitlements {
      constructor(state, env) { super(state, env); this.store = state.storage; }
      async fetch(request) {
        if (new URL(request.url).pathname === '/fixture-inspect') return Response.json(Object.fromEntries(await this.store.list()));
        return super.fetch(request);
      }
    }
    export default { async fetch(request, env, context) {
      const account = request.headers.get('X-Fixture-Account');
      const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('account:v1:' + account));
      const path = new URL(request.url).pathname;
      if (path === '/fixture-seed') {
        const grant = await ledger.fetch(new Request('https://ledger/grant', { method: 'POST', body: JSON.stringify({ id: 'in_recovery', credits: 10000, subscriptionId: 'sub_recovery' }) }));
        const subscription = await ledger.fetch(new Request('https://ledger/subscription', { method: 'POST', body: JSON.stringify({ id: 'sub_recovery', active: true, plan: 'studio', until: Date.now() + 86400000, revision: 1, grantId: 'in_recovery' }) }));
        if (!grant.ok || !subscription.ok) throw Error('Inert fixture seed failed');
        return Response.json({ seeded: true });
      }
      if (path === '/fixture-inspect') return ledger.fetch(new Request('https://ledger/fixture-inspect'));
      return studioApi(request, { ...env, GENERATION_LIMITER: { limit: async () => ({ success: true }) }, ACCOUNT_LIMITER: { limit: async () => ({ success: true }) } }, fetch, false, context);
    } };
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const original = {
    model: detailedGLBFixture(),
    fbx: await readFile(new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.fbx', import.meta.url)),
    blend: new TextEncoder().encode('BLENDER-v405INERT_NATIVE_PROJECT'),
    pbr: await readFile(new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.textures.zip', import.meta.url)),
  }
  const jobs = new Map(), posts = new Map(), inputs = new Map(), staged = new Map()
  let missingNext = false, rateLimitReads = false
  const options = convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, resourcePersistencePath: directory, isolatedResourcePersistencePath: directory,
    bindings: { OWNER_ACCESS_TOKEN: 'inert-recovery-owner-'.repeat(3), ORACLE_API_TOKEN: 'inert-recovery-oracle', ORACLE_ENDPOINT: 'https://recovery.trycloudflare.com',
      PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', ENABLE_ASTRA_PLANS: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeAccount', useSQLite: true }, GENERATION_BUDGET: { className: 'GenerationBudget', useSQLite: true } },
    outboundService: async request => {
      const url = new URL(request.url)
      if (url.pathname === '/auth/v1/user') {
        const account = request.headers.get('Authorization')?.slice('Bearer '.length)
        assert.ok([ALICE, BOB].includes(account))
        return Response.json({ id: account, email: 'inert@example.test' })
      }
      assert.equal(url.hostname, 'recovery.trycloudflare.com', 'No live destination is permitted')
      assert.equal(request.headers.get('Authorization'), 'Bearer inert-recovery-oracle')
      if (url.pathname === '/v1/health') return Response.json({ ...detailedHealthFixture,
        ...(durableAdmission ? { studioAdmissionRevision: 'oracle-durable-admission-v1' } : {}),
        studioExecutionRevision: 'studio-execution-v1', studioExecutionModels: ['astra', 'sol', 'luna'], studioExecutionModes: ['standard', 'fast'] })
      if (url.pathname === '/v1/jobs/stage' && request.method === 'POST') {
        assert.equal(durableAdmission, true)
        const raw = await request.text(), input = JSON.parse(raw)
        const proof = { revision: 'oracle-durable-admission-v1', id: input.id,
          owner: request.headers.get('X-WORLDIFACT-Owner'), fingerprint: request.headers.get('X-WORLDIFACT-Fingerprint'),
          payloadSha256: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))).toString('hex'), phase: 'staged' }
        if (staged.has(input.id)) assert.deepEqual({ ...staged.get(input.id), phase: 'staged' }, proof)
        else { staged.set(input.id, proof); inputs.set(input.id, input) }
        return Response.json({ id: input.id, state: 'pending', admission: staged.get(input.id) })
      }
      if (url.pathname === (durableAdmission ? '/v1/jobs/start' : '/v1/jobs') && request.method === 'POST') {
        const signal = await request.json(), input = durableAdmission ? inputs.get(signal.id) : signal
        if (durableAdmission) {
          const proof = staged.get(input.id)
          assert.equal(signal.payloadSha256, proof.payloadSha256)
          assert.equal(request.headers.get('X-WORLDIFACT-Owner'), proof.owner)
          assert.equal(request.headers.get('X-WORLDIFACT-Fingerprint'), proof.fingerprint)
          assert.ok(signal.deadline > Date.now())
          proof.phase = 'authorized'
        }
        posts.set(input.id, (posts.get(input.id) ?? 0) + 1)
        assert.equal(posts.get(input.id), 1, 'A paid request must never be dispatched twice')
        inputs.set(input.id, input)
        if (!missingNext) jobs.set(input.id, 'queued')
        missingNext = false
        return new Response('{"incomplete":', { headers: { 'Content-Type': 'application/json' } })
      }
      assert.equal(request.method, 'GET', 'Only the original admission may POST')
      const match = /^\/v1\/jobs\/([a-f0-9-]+)(?:\/(model|exports\/(?:fbx|blend|pbr)|quality|budget))?$/.exec(url.pathname)
      assert.ok(match, url.pathname)
      const [, id, path] = match
      if (path === 'quality' || path === 'budget') return Response.json({}, { status: 404 })
      if (!path) {
        if (rateLimitReads) return Response.json({}, { status: 429 })
        return jobs.has(id) ? Response.json({ id, state: jobs.get(id) }) : Response.json({}, { status: 404 })
      }
      assert.equal(jobs.get(id), 'succeeded')
      const format = path.replace('exports/', ''), bytes = original[format]
      return new Response(bytes, { headers: { 'Content-Length': String(bytes.length), 'Content-Type': format === 'model' ? 'model/gltf-binary' : 'application/octet-stream' } })
    },
  })
  let mf = new Miniflare(options)
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }) })
  const call = (account, path, body, ticket) => mf.dispatchFetch(ORIGIN + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: ORIGIN, Cookie: '__Host-worldifact-access=' + account,
      'X-Fixture-Account': account, 'Content-Type': 'application/json', 'X-WORLDIFACT-Paid-Points-Policy': 'paid-membership-held-points-v1', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const inspect = async account => (await call(account, '/fixture-inspect')).json()
  for (const account of [ALICE, BOB]) assert.equal((await call(account, '/fixture-seed', {})).status, 200)
  const selected = account => ({ worldId: 'enchanted-ai-shop', prompt: 'Inert detailed native recovery fixture', purpose: 'figurine', textureMaxSize: 4096, photos: [],
    studioExecution: { revision: 'studio-execution-v1', model: account === ALICE ? 'astra' : 'luna', mode: account === ALICE ? 'standard' : 'fast' } })
  const receipts = new Map()
  for (const account of [ALICE, BOB]) {
    const response = await call(account, '/api/studio/prepare', selected(account))
    assert.equal(response.status, 200)
    receipts.set(account, await response.json())
  }
  await Promise.all([ALICE, BOB].flatMap(account => Array.from({ length: 3 }, async () => {
    const receipt = receipts.get(account)
    const status = (await call(account, '/api/studio/jobs', selected(account), receipt.ticket)).status
    assert.ok(status === 202 || durableAdmission && status === 503, String(status))
  })))
  const accepted = new Map()
  for (const account of [ALICE, BOB]) {
    const receipt = receipts.get(account), rows = await inspect(account)
    accepted.set(account, rows)
    assert.equal(posts.get(receipt.id), 1)
    assert.deepEqual(inputs.get(receipt.id).studioExecution, selected(account).studioExecution)
    assert.equal(rows['paid-points-job:v2:' + receipt.id].studioDispatch, 'claimed-v1')
  }
  await mf.dispose(); mf = new Miniflare(options)
  for (const account of [ALICE, BOB]) {
    const receipt = receipts.get(account)
    assert.deepEqual(await inspect(account), accepted.get(account), 'The complete persisted account survives restart')
    await call(account, '/api/studio/jobs', selected(account), receipt.ticket)
    assert.equal(posts.get(receipt.id), 1)
    jobs.set(receipt.id, 'succeeded')
    const response = await call(account, '/api/studio/jobs/' + receipt.id, undefined, receipt.ticket)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).job.state, 'succeeded')
  }
  const completed = new Map(await Promise.all([ALICE, BOB].map(async account => [account, await inspect(account)])))
  await mf.dispose(); mf = new Miniflare(options)
  for (const account of [ALICE, BOB]) {
    const receipt = receipts.get(account), other = account === ALICE ? BOB : ALICE
    const page = await (await call(account, '/api/studio/library')).json()
    assert.deepEqual(page.models.map(model => model.id), [receipt.id])
    const saved = page.models[0]
    assert.equal((await call(other, '/api/studio/library/' + receipt.id)).status, 404)
    for (const format of ['model', 'fbx', 'blend', 'pbr']) {
      const path = '/api/studio/jobs/' + receipt.id + '/' + (format === 'model' ? 'model' : 'exports/' + format)
      assert.equal((await call(other, path, undefined, saved.receipt.ticket)).status, 401)
      const response = await call(account, path, undefined, saved.receipt.ticket)
      assert.equal(response.status, 200)
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(original[format]))
    }
    await call(account, '/api/studio/jobs/' + receipt.id, undefined, receipt.ticket)
    assert.deepEqual(await inspect(account), completed.get(account), 'Library and repeated completion cannot recharge or refund')
    assert.equal(posts.get(receipt.id), 1)
  }
  // Oracle absence and HTTP 429 leave the original financial uncertainty intact.
  const missing = await (await call(ALICE, '/api/studio/prepare', selected(ALICE))).json()
  missingNext = true
  assert.equal((await (await call(ALICE, '/api/studio/jobs', selected(ALICE), missing.ticket)).json()).job.state, 'pending')
  const uncertain = await inspect(ALICE)
  await mf.dispose(); mf = new Miniflare(options)
  rateLimitReads = true
  assert.equal((await call(ALICE, '/api/studio/jobs/' + missing.id, undefined, missing.ticket)).status, 429)
  rateLimitReads = false
  assert.equal((await (await call(ALICE, '/api/studio/jobs/' + missing.id, undefined, missing.ticket)).json()).job.state, 'pending')
  await call(ALICE, '/api/studio/jobs', selected(ALICE), missing.ticket)
  assert.equal(posts.get(missing.id), 1)
  assert.deepEqual(await inspect(ALICE), uncertain, 'Unknown absence must not replenish points or provider authority')
})
