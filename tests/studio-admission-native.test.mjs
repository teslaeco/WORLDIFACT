import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORIGIN = 'https://studio-native.example.test'

test('native Studio admission sends each separately prepared detailed job once through real account and budget objects', { timeout: 60_000 }, async t => {
  const bundle = await build({ stdin: {
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'studio-admission-native-fixture.ts', contents: `
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
        const ledger = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('account:v1:${ACCOUNT}'));
        const path = new URL(request.url).pathname;
        if (path === '/fixture-seed') {
          const grant = await ledger.fetch(new Request('https://ledger.internal/grant', { method: 'POST', body: JSON.stringify({ id: 'in_native_admission', credits: 10000, subscriptionId: 'sub_nativeadmission' }) }));
          const subscription = await ledger.fetch(new Request('https://ledger.internal/subscription', { method: 'POST', body: JSON.stringify({ id: 'sub_nativeadmission', active: true, plan: 'studio', until: Date.now() + 86400000, revision: 1, grantId: 'in_native_admission' }) }));
          if (!grant.ok || !subscription.ok) throw new Error('Inert account seed failed');
          return new Response('seeded');
        }
        if (path === '/fixture-inspect') return ledger.fetch(new Request('https://ledger.internal/fixture-inspect'));
        return studioApi(request, { ...env, GENERATION_LIMITER: { limit: async () => ({ success: true }) } }, fetch, false, context);
      } };
    `,
  }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const posts = []
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    bindings: { OWNER_ACCESS_TOKEN: 'inert-native-owner-'.repeat(3), ORACLE_API_TOKEN: 'inert-native-oracle', ORACLE_ENDPOINT: 'https://native-oracle.trycloudflare.com',
      PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', ENABLE_ASTRA_PLANS: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeAccount', useSQLite: true }, GENERATION_BUDGET: { className: 'GenerationBudget', useSQLite: true } },
    outboundService: async request => {
      const url = new URL(request.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: ACCOUNT, email: 'native-fixture@example.test' })
      assert.equal(url.hostname, 'native-oracle.trycloudflare.com')
      if (url.pathname === '/v1/health') return Response.json({ ...detailedHealthFixture,
        studioExecutionRevision: 'studio-execution-v1', studioExecutionModels: ['astra', 'sol', 'luna'], studioExecutionModes: ['standard', 'fast'] })
      if (url.pathname === '/v1/jobs' && request.method === 'POST') {
        const body = await request.json(); posts.push(body)
        return Response.json({ id: body.id, state: 'queued' }, { status: 202 })
      }
      return Response.json({}, { status: 404 })
    },
  }))
  t.after(() => mf.dispose())
  const call = (path, body, ticket) => mf.dispatchFetch(ORIGIN + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: ORIGIN, Cookie: '__Host-worldifact-access=inert-native-user-token',
      'Content-Type': 'application/json', 'X-WORLDIFACT-Paid-Points-Policy': 'paid-membership-held-points-v1', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.equal((await call('/fixture-seed', {})).status, 200)
  const jpeg = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  for (const model of ['astra', 'sol', 'luna']) for (const mode of ['standard', 'fast']) {
    const photos = mode === 'standard' ? [] : ['front', 'left', 'right', 'back'].map(view => ({ name: view + '.jpg', view, textureMaxSize: 4096, dataUrl: 'data:image/jpeg;base64,' + jpeg }))
    const input = { worldId: 'enchanted-ai-shop', prompt: 'Inert native transport fixture for a carved chess rook', purpose: 'figurine', textureMaxSize: 4096, photos,
      studioExecution: { revision: 'studio-execution-v1', model, mode } }
    const prepared = await call('/api/studio/prepare', input), receipt = await prepared.json()
    assert.equal(prepared.status, 200, JSON.stringify(receipt))
    assert.ok(receipt.ticket.startsWith('held.'), 'Exercise the current paid-membership account path')
    const before = posts.length
    const response = await call('/api/studio/jobs', input, receipt.ticket), value = await response.json()
    const ledger = await (await call('/fixture-inspect')).json()
    assert.equal(response.status, 202, JSON.stringify(value))
    assert.equal(posts.length, before + 1, JSON.stringify({ value, job: ledger['paid-points-job:v2:' + receipt.id] ?? ledger['job:' + receipt.id] }))
    assert.equal(value.job.state, 'queued')
    assert.deepEqual(posts.at(-1).studioExecution, input.studioExecution)
    assert.deepEqual(posts.at(-1).photos ?? [], photos.map(photo => ({
      ...photo, view: photo.view === 'left' || photo.view === 'right' ? 'side' : photo.view,
    })))
    assert.equal(ledger['paid-points-job:v2:' + receipt.id].studioDispatch, 'claimed-v1')
    await call('/api/studio/jobs', input, receipt.ticket)
    assert.equal(posts.length, before + 1, 'Receipt replay must never create another Oracle request')
  }
})
