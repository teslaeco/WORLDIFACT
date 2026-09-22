import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { fileURLToPath } from 'node:url'

const origin = 'https://worldifact.test'
const provider = 'https://fixture.supabase.co'
const publicKey = 'sb_publishable_fixture_non_secret_key'
const access = 'fixture-native-worker-access-token'
const renewal = 'fixture-native-worker-refresh-token'
const user = { id: '8dba1ce2-2345-4678-a123-123456789abc', email: 'fixture@example.invalid', user_metadata: { display_name: 'Fixture' } }
const bundle = await build({
  stdin: {
    contents: `import { accountApi } from './server/accounts.ts';
      export default { fetch(request) { return accountApi(request, {
        SUPABASE_URL: '${provider}', SUPABASE_ANON_KEY: '${publicKey}',
        SUPABASE_GOOGLE_REDIRECT_READY: 'true',
        ACCOUNT_LIMITER: { async limit() { return { success: true }; } }
      }); } };`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'account-fixture-worker.ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral',
})

function runtime(t, reply) {
  const calls = []
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text,
    // Intercept every outbound request locally. No provider, account or Google
    // sign-in is contacted; native workerd still validates the real fetch init.
    outboundService: async request => {
      calls.push(request)
      assert.equal(new URL(request.url).origin, provider)
      assert.equal(request.headers.get('apikey'), publicKey)
      return reply(request)
    },
  }))
  t.after(() => mf.dispose())
  const call = (path, input, cookies = '') => mf.dispatchFetch(origin + path, {
    method: input === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  })
  return { call, calls }
}

test('native workerd sends login and user verification requests instead of rejecting fetch options', async t => {
  const f = runtime(t, request => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/token')) {
      assert.equal(request.headers.get('Authorization'), null)
      return Response.json({ error_code: 'invalid_credentials' }, { status: 400 })
    }
    assert.equal(url.pathname, '/auth/v1/user')
    assert.equal(request.headers.get('Authorization'), 'Bearer ' + access)
    return Response.json({ error_code: 'bad_jwt' }, { status: 401 })
  })
  const login = await f.call('/api/account/login', { email: user.email, password: 'fixture-only-password' })
  assert.equal(login.status, 401)
  assert.equal(login.headers.getSetCookie().length, 0)
  const session = await f.call('/api/account/session', undefined, '__Host-worldifact-access=' + access)
  assert.equal(session.status, 200)
  assert.deepEqual(await session.json(), { configured: true, user: null })
  assert.equal(f.calls.length, 2)
})

test('native workerd completes a fixture PKCE callback only after token exchange and user verification', async t => {
  let expectedVerifier
  const f = runtime(t, async request => {
    if (new URL(request.url).pathname.endsWith('/token')) {
      assert.equal(request.headers.get('Authorization'), null)
      assert.deepEqual(await request.json(), { auth_code: '34e770dd-9ff9-416c-87fa-43b31d7ef225', code_verifier: expectedVerifier })
      return Response.json({ access_token: access, refresh_token: renewal, expires_in: 3600, user })
    }
    assert.equal(request.headers.get('Authorization'), 'Bearer ' + access)
    return Response.json(user)
  })
  const start = await f.call('/api/account/oauth/google', { next: '/world' })
  assert.equal(start.status, 200)
  const flowCookie = start.headers.getSetCookie()[0].split(';')[0]
  expectedVerifier = JSON.parse(Buffer.from(flowCookie.split('=')[1], 'base64url')).verifier
  const authorization = new URL((await start.json()).url)
  const callback = new URL(authorization.searchParams.get('redirect_to'))
  callback.searchParams.set('code', '34e770dd-9ff9-416c-87fa-43b31d7ef225')
  const response = await f.call(callback.pathname + callback.search, undefined, flowCookie)
  assert.equal(response.status, 303)
  const target = new URL(response.headers.get('Location'))
  assert.equal(target.origin, origin); assert.equal(target.searchParams.get('oauth'), 'success')
  assert.equal(f.calls.length, 2)
  assert.equal(response.headers.getSetCookie().length, 3)
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith('__Host-worldifact-access=' + access)))
  assert.doesNotMatch(response.headers.get('Location'), /code=|state=|fixture-native-worker/)
})

test('native workerd refuses provider redirects without following Location or installing a session', async t => {
  let status = 301
  const f = runtime(t, () => new Response('private redirected provider body', { status, headers: { Location: 'https://untrusted.example/collect' } }))
  for (status of [301, 302, 303, 307, 308]) {
    const before = f.calls.length
    const response = await f.call('/api/account/login', { email: user.email, password: 'fixture-only-password' })
    assert.equal(response.status, 503)
    assert.equal(f.calls.length, before + 1)
    assert.equal(response.headers.getSetCookie().length, 0)
    assert.equal(response.headers.get('Location'), null)
    assert.doesNotMatch(await response.text(), /private|untrusted|collect|fixture-only-password/)
  }
})
