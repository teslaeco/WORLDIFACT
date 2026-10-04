import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { fileURLToPath } from 'node:url'

const origin = 'https://worldifact.test'
const clientId = 'https://chatgpt.com/oauth/client.json'
const callback = 'https://chatgpt.com/connector_platform_oauth_redirect'
const provider = 'https://fixture.supabase.co'
const userId = 'c8c332f2-d9b8-4c2c-ad42-5c433fbbfd88'
const otherUser = '26a07b02-7f7a-4c0a-b7be-19d22c1a8286'
const readOnlyScopes = ['profile:read', 'worlds:read', 'models:read']
const defaultScopes = ['profile:read', 'worlds:read', 'worlds:write', 'models:read', 'models:generate']
function sourceToken(id = userId, exp = Math.floor(Date.now() / 1000) + 1800) {
  return Buffer.from(JSON.stringify({ alg: 'fixture' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url') + '.inert_fixture_signature'
}
const access = sourceToken()
const sourceCookie = token => '__Host-worldifact-access=' + token
const bundle = await build({
  stdin: { contents: `import { handleMcpOAuth, getMcpOAuthSession } from './server/mcpOAuth.ts';
    import { mcpApi } from './server/mcp.ts';
    import { accountApi } from './server/accounts.ts';
    export default { async fetch(request, bindings, context) {
      const env = { ...bindings, MCP_OAUTH_ENABLED: 'true', MCP_READ_ONLY: request.headers.get('X-Fixture-Read-Only') || 'false', MCP_RESOURCE_URL: '${origin}/mcp',
        MCP_OAUTH_CLIENT_IDS: '${clientId}', MCP_OAUTH_REDIRECT_URIS: '${callback}',
        SUPABASE_URL: '${provider}', SUPABASE_ANON_KEY: 'sb_publishable_fixture_non_secret_key',
        SUPABASE_GOOGLE_REDIRECT_READY: 'true',
        ACCOUNT_LIMITER: { async limit() { return { success: true }; } } };
      if (new URL(request.url).pathname === '/test/session') {
        const session = await getMcpOAuthSession(new Request('${origin}/mcp', request), env);
        return Response.json(session ? { userId: session.user.id, scopes: session.scopes, clientId: session.clientId,
          resource: session.resource, expiresAt: session.expiresAt } : null);
      }
      return await handleMcpOAuth(request, env, fetch, context) || await accountApi(request, env) || await mcpApi(request, env) || new Response('not found', {status:404});
    } };`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'mcp-oauth-fixture.ts' },
  bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['cloudflare:workers'],
})
function fixture(t, { pkceExchange, readOnly = false } = {}) {
  const calls = []
  let rejectedUser = null
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-09-14', compatibilityFlags: ['global_fetch_strictly_public'], cf: false,
    script: bundle.outputFiles[0].text, kvNamespaces: ['OAUTH_KV'],
    outboundService: async request => {
      calls.push(new URL(request.url).origin + new URL(request.url).pathname)
      if (request.url === clientId) return Response.json({ client_id: clientId, client_name: 'ChatGPT <fixture>',
        redirect_uris: [callback], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      }, { headers: { 'Cache-Control': 'no-store' } })
      if (pkceExchange && request.url === provider + '/auth/v1/token?grant_type=pkce') return pkceExchange(request)
      assert.equal(request.url, provider + '/auth/v1/user', 'No paid or unapproved endpoint may be reached')
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
      let claims; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch { return Response.json({}, { status: 401 }) }
      if (claims.exp <= Date.now() / 1000 || claims.sub === rejectedUser) return Response.json({}, { status: 401 })
      return Response.json({ id: claims.sub, email: 'fixture@example.invalid', user_metadata: { display_name: '<Fixture account>' } })
    },
  }))
  t.after(() => mf.dispose())
  const call = (path, init = {}) => mf.dispatchFetch(origin + path, { redirect: 'manual', ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), 'X-Fixture-Read-Only': String(readOnly) } })
  const form = (path, values, cookie = '') => call(path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(values).toString() })
  return { mf, call, form, calls, restrict() { readOnly = true }, reject(id) { rejectedUser = id } }
}
function authorization(scopes = defaultScopes) {
  const verifier = randomBytes(32).toString('base64url')
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code',
    resource: origin + '/mcp', state: 'fixture-state', scope: scopes.join(' '),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })
  return { verifier, params, path: '/oauth/authorize?' + params }
}
async function consentPage(f, { scopes = defaultScopes, token = access } = {}) {
  const auth = authorization(scopes)
  const response = await f.call(auth.path, { headers: { Cookie: sourceCookie(token) } })
  const html = await response.text()
  assert.equal(response.status, 200, html)
  assert.match(html, /ChatGPT &lt;fixture&gt;/)
  assert.doesNotMatch(html, /inert_fixture_signature/)
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1]
  assert.ok(handle)
  const cookies = [sourceCookie(token), ...response.headers.getSetCookie().map(value => value.split(';')[0])].join('; ')
  return { ...auth, handle, cookies, response, html }
}
async function approve(f, page, scopes = defaultScopes) {
  const fields = new URLSearchParams({ handle: page.handle, action: 'approve' })
  for (const scope of scopes) fields.append('scope', scope)
  const approved = await f.form('/oauth/authorize', fields, page.cookies)
  assert.equal(approved.status, 303, await approved.clone().text())
  const target = new URL(approved.headers.get('location'))
  assert.equal(target.origin + target.pathname, callback)
  assert.equal(target.searchParams.get('iss'), origin)
  assert.equal(target.searchParams.get('state'), 'fixture-state')
  return { code: target.searchParams.get('code'), page }
}
async function exchange(f, approved, extra = {}) {
  const response = await f.form('/oauth/token', { grant_type: 'authorization_code', client_id: clientId,
    code: approved.code, redirect_uri: callback, resource: origin + '/mcp', code_verifier: approved.page.verifier, ...extra })
  return { response, value: await response.json() }
}

test('real OAuth library publishes PKCE discovery and accepts current ChatGPT CIMD method negotiation', async t => {
  const f = fixture(t)
  const response = await f.call('/.well-known/oauth-authorization-server')
  assert.equal(response.status, 200)
  const metadata = await response.json()
  assert.equal(metadata.issuer, origin)
  assert.equal(metadata.authorization_endpoint, origin + '/oauth/authorize')
  assert.equal(metadata.token_endpoint, origin + '/oauth/token')
  assert.equal(metadata.authorization_response_iss_parameter_supported, true)
  assert.equal(metadata.client_id_metadata_document_supported, true)
  assert.ok(metadata.token_endpoint_auth_methods_supported.includes('none'))
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none'])
  assert.deepEqual(metadata.grant_types_supported, ['authorization_code'])
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256'])
  assert.deepEqual(metadata.scopes_supported, defaultScopes)
  assert.equal(metadata.registration_endpoint, undefined)
  const page = await consentPage(f)
  assert.match(page.response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  const token = await exchange(f, await approve(f, page))
  assert.equal(token.response.status, 200, JSON.stringify(token.value))
  assert.equal(token.value.resource, origin + '/mcp')
  assert.equal(token.value.refresh_token, undefined)
  assert.notEqual(token.value.access_token, access)
  assert.ok(token.value.expires_in >= 60 && token.value.expires_in < 1800)
  assert.doesNotMatch(JSON.stringify(token.value), /inert_fixture_signature|fixture@example/)
  const session = await f.call('/test/session', { headers: { Authorization: 'Bearer ' + token.value.access_token } })
  assert.deepEqual((await session.json()).scopes, defaultScopes)
  const profile = await f.call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value.access_token },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_profile', arguments: {} } }) })
  assert.equal(profile.status, 200)
  const profileBody = await profile.text()
  assert.match(profileBody, new RegExp(userId))
  assert.doesNotMatch(profileBody, /inert_fixture_signature/)
})

test('read-only consent yields an under-scoped MCP error and cannot be escalated at the token endpoint', async t => {
  const f = fixture(t), page = await consentPage(f)
  const token = await exchange(f, await approve(f, page, ['profile:read']), { scope: 'profile:read models:generate' })
  assert.equal(token.response.status, 200)
  assert.equal(token.value.scope, 'profile:read')
  const response = await f.call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value.access_token },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_my_worlds', arguments: {} } }) })
  assert.equal(response.status, 403)
  assert.match(response.headers.get('www-authenticate'), /insufficient_scope/)
  assert.match(response.headers.get('www-authenticate'), /worlds:read/)
})

test('read-only review grants only read permissions and rejects write scopes at consent and dispatch', async t => {
  const f = fixture(t, { readOnly: true })
  const metadata = await (await f.call('/.well-known/oauth-authorization-server')).json()
  assert.deepEqual(metadata.scopes_supported, readOnlyScopes)
  for (const scope of ['worlds:write', 'models:generate']) {
    const denied = await f.call(authorization(['profile:read', scope]).path, { headers: { Cookie: sourceCookie(access) } })
    assert.equal(denied.status, 400)
  }
  const page = await consentPage(f, { scopes: readOnlyScopes })
  assert.doesNotMatch(page.html, /value="(?:worlds:write|models:generate)"/)
  const tampered = new URLSearchParams({ handle: page.handle, action: 'approve' })
  for (const scope of [...readOnlyScopes, 'models:generate']) tampered.append('scope', scope)
  assert.equal((await f.form('/oauth/authorize', tampered, page.cookies)).status, 400)
  const token = await exchange(f, await approve(f, page, readOnlyScopes), { scope: defaultScopes.join(' ') })
  assert.equal(token.response.status, 200)
  assert.deepEqual(token.value.scope.split(' '), readOnlyScopes)
  const profile = await f.call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value.access_token },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_profile', arguments: {} } }) })
  assert.equal(profile.status, 200)
  assert.equal((await profile.json()).result.structuredContent.id, userId)
  const before = f.calls.length
  for (const name of ['save_my_world', 'prepare_3d_model', 'start_3d_model']) {
    const denied = await f.call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value.access_token },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } }) })
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('www-authenticate'), null)
  }
  assert.equal(f.calls.length, before, 'Disabled tools do not reach account, world, billing or generation services')
})

test('switching to read-only invalidates broad credentials and pending codes while preserving revocation', async t => {
  const pendingFixture = fixture(t)
  const pending = await approve(pendingFixture, await consentPage(pendingFixture))
  pendingFixture.restrict()
  const pendingDenied = await exchange(pendingFixture, pending)
  assert.equal(pendingDenied.response.status, 400)
  assert.equal(pendingDenied.value.access_token, undefined)
  const f = fixture(t)
  const issued = await exchange(f, await approve(f, await consentPage(f)))
  assert.equal(issued.response.status, 200)
  assert.ok(await (await f.call('/test/session', { headers: { Authorization: 'Bearer ' + issued.value.access_token } })).json())
  f.restrict()
  assert.equal(await (await f.call('/test/session', { headers: { Authorization: 'Bearer ' + issued.value.access_token } })).json(), null)
  const connections = await (await f.call('/api/mcp/connection', { headers: { Cookie: sourceCookie(access) } })).json()
  assert.equal(connections.authorized, false)
  assert.ok(connections.grants.length > 0, 'Superseded grants remain visible for disconnection')
  assert.ok(connections.grants.every(grant => grant.active === false))
  for (const grant of connections.grants) {
    const revoked = await f.call('/api/mcp/connection', { method: 'POST', headers: { Cookie: sourceCookie(access), Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ grantId: grant.id }) })
    assert.equal(revoked.status, 200)
  }
  assert.deepEqual((await (await f.call('/api/mcp/connection', { headers: { Cookie: sourceCookie(access) } })).json()).grants, [])
})

test('authorization rejects unpinned clients, callbacks, resources and absent S256 before granting access', async t => {
  const f = fixture(t)
  for (const [name, value] of [['client_id', 'https://attacker.invalid/client.json'], ['redirect_uri', 'https://attacker.invalid/callback'],
    ['resource', 'https://other.invalid/mcp'], ['code_challenge_method', 'plain'], ['scope', 'profile:read billing:write']]) {
    const auth = authorization(); auth.params.set(name, value)
    const response = await f.call('/oauth/authorize?' + auth.params, { headers: { Cookie: sourceCookie(access) } })
    assert.equal(response.status, 400, name)
    assert.equal(response.headers.get('location'), null)
  }
  assert.ok(f.calls.every(url => url === clientId || url.startsWith(provider)))
})

test('login continuation is same-browser, short-lived and resumes only a verified account', async t => {
  const f = fixture(t), auth = authorization()
  const response = await f.call(auth.path)
  assert.equal(response.status, 303)
  const login = new URL(response.headers.get('location'), origin)
  assert.equal(login.pathname, '/login')
  const resume = login.searchParams.get('next')
  assert.match(resume, /^\/oauth\/authorize\?continuation=[A-Za-z0-9_-]{43}$/)
  assert.equal((await f.call(resume, { headers: { Cookie: sourceCookie(access) } })).status, 400)
  const cookies = [sourceCookie(access), ...response.headers.getSetCookie().map(value => value.split(';')[0])].join('; ')
  const resumed = await f.call(resume, { headers: { Cookie: cookies } })
  assert.equal(resumed.status, 200)
  assert.match(await resumed.text(), /Approve connection/)
  assert.equal((await f.call(resume, { headers: { Cookie: cookies } })).status, 400)
})

test('Google PKCE login preserves the broker continuation and its separate browser-binding cookie', async t => {
  let verifier, exchanges = 0
  const f = fixture(t, { pkceExchange: async request => {
    exchanges++
    assert.equal(request.method, 'POST')
    assert.deepEqual(await request.json(), { auth_code: 'fixture-google-authorization-code', code_verifier: verifier })
    return Response.json({ access_token: access, refresh_token: 'inert-google-refresh-token', expires_in: 1800,
      user: { id: userId, email: 'fixture@example.invalid', user_metadata: { display_name: '<Fixture account>' } } })
  } })
  const jar = new Map()
  const remember = response => {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0], separator = pair.indexOf('='), name = pair.slice(0, separator)
      if (/max-age=0(?:;|$)/i.test(raw)) jar.delete(name)
      else jar.set(name, pair.slice(separator + 1))
    }
  }
  const cookies = () => [...jar].map(([name, value]) => name + '=' + value).join('; ')
  const pending = await f.call(authorization().path)
  assert.equal(pending.status, 303)
  remember(pending)
  const continuation = new URL(pending.headers.get('location'), origin).searchParams.get('next')
  assert.match(continuation, /^\/oauth\/authorize\?continuation=[A-Za-z0-9_-]{43}$/)
  const brokerCookie = jar.get('__Host-worldifact-mcp-login')
  assert.ok(brokerCookie)
  const start = await f.call('/api/account/oauth/google', { method: 'POST', headers: {
    Origin: origin, Cookie: cookies(), 'Content-Type': 'application/json' }, body: JSON.stringify({ next: continuation }) })
  assert.equal(start.status, 200)
  remember(start)
  const flow = JSON.parse(Buffer.from(jar.get('__Host-worldifact-google-flow'), 'base64url').toString())
  verifier = flow.verifier
  assert.equal(flow.next, continuation)
  assert.equal(jar.get('__Host-worldifact-mcp-login'), brokerCookie)
  const providerUrl = new URL((await start.json()).url)
  assert.equal(providerUrl.origin, provider)
  assert.equal(providerUrl.searchParams.get('provider'), 'google')
  assert.equal(providerUrl.searchParams.get('code_challenge_method'), 's256')
  assert.equal(providerUrl.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'))
  const callbackUrl = new URL(providerUrl.searchParams.get('redirect_to'))
  assert.equal(callbackUrl.origin, origin)
  assert.equal(callbackUrl.pathname, '/api/account/oauth/callback')
  callbackUrl.searchParams.set('code', 'fixture-google-authorization-code')
  const completed = await f.call(callbackUrl.pathname + callbackUrl.search, { headers: { Cookie: cookies() } })
  assert.equal(completed.status, 303)
  remember(completed)
  const next = new URL(completed.headers.get('location'))
  assert.equal(next.origin, origin)
  assert.equal(next.pathname, '/login')
  assert.equal(next.searchParams.get('oauth'), 'success')
  assert.equal(next.searchParams.get('next'), continuation)
  assert.equal(exchanges, 1)
  assert.equal(jar.has('__Host-worldifact-google-flow'), false)
  assert.equal(jar.get('__Host-worldifact-mcp-login'), brokerCookie)
  assert.equal(jar.get('__Host-worldifact-access'), access)
  assert.doesNotMatch(completed.headers.get('location'), /fixture-google-authorization-code|inert-google-refresh-token|inert_fixture_signature/)
  const resumed = await f.call(next.searchParams.get('next'), { headers: { Cookie: cookies() } })
  assert.equal(resumed.status, 200)
  assert.match(await resumed.text(), /Approve connection/)
  remember(resumed)
  assert.equal(jar.has('__Host-worldifact-mcp-login'), false)
  assert.equal(jar.get('__Host-worldifact-access'), access)
})

test('consent is bound to browser and signed-in account, rejects extra scopes, and denial grants nothing', async t => {
  const f = fixture(t), page = await consentPage(f, { scopes: ['profile:read'] })
  const fields = new URLSearchParams({ handle: page.handle, action: 'approve', scope: 'profile:read' })
  assert.equal((await f.form('/oauth/authorize', fields, sourceCookie(access))).status, 400)
  const changedCookie = page.cookies.replace(access, sourceToken(otherUser))
  assert.equal((await f.form('/oauth/authorize', fields, changedCookie)).status, 400)
  const escalated = new URLSearchParams(fields); escalated.append('scope', 'models:generate')
  assert.equal((await f.form('/oauth/authorize', escalated, page.cookies)).status, 400)
  const crossSite = await f.call('/oauth/authorize', { method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: page.cookies,
    'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString() })
  assert.equal(crossSite.status, 403)
  const denied = await f.form('/oauth/authorize', { handle: page.handle, action: 'deny' }, page.cookies)
  assert.equal(denied.status, 303)
  const target = new URL(denied.headers.get('location'))
  assert.equal(target.searchParams.get('error'), 'access_denied')
  assert.equal(target.searchParams.get('code'), null)
  assert.equal((await f.form('/oauth/authorize', fields, page.cookies)).status, 400)
})

test('code is PKCE-bound and resource-bound; sequential replay and refresh are rejected', async t => {
  const f = fixture(t), approved = await approve(f, await consentPage(f))
  assert.equal((await exchange(f, approved, { code_verifier: randomBytes(32).toString('base64url') })).response.status, 400)
  assert.equal((await exchange(f, approved, { resource: 'https://other.invalid/mcp' })).response.status, 400)
  const valid = await exchange(f, approved)
  assert.equal(valid.response.status, 200)
  assert.equal((await exchange(f, approved)).response.status, 400)
  const refresh = await f.form('/oauth/token', { grant_type: 'refresh_token', client_id: clientId, refresh_token: 'not-issued' })
  assert.equal(refresh.status, 400)
})

test('source expiry and authoritative revocation fence every MCP use; browser sessions are never refreshed', async t => {
  const f = fixture(t)
  const expired = await f.call(authorization().path, { headers: { Cookie: sourceCookie(sourceToken(userId, Math.floor(Date.now() / 1000) + 45)) } })
  assert.equal(expired.status, 401)
  const token = await exchange(f, await approve(f, await consentPage(f)))
  assert.equal(token.response.status, 200)
  f.reject(userId)
  const response = await f.call('/test/session', { headers: { Authorization: 'Bearer ' + token.value.access_token } })
  assert.equal(await response.json(), null)
  assert.ok(f.calls.every(url => !url.includes('/token')))
  assert.equal(await (await f.call('/test/session', { headers: { Authorization: 'Bearer ' + access } })).json(), null)
})

test('connection listing and disconnect are account-scoped and revocation invalidates the broker token', async t => {
  const f = fixture(t), token = await exchange(f, await approve(f, await consentPage(f)))
  assert.equal(token.response.status, 200)
  const own = await f.call('/api/mcp/connection', { headers: { Cookie: sourceCookie(access) } })
  const ownBody = await own.json()
  assert.equal(ownBody.authorized, true)
  assert.equal(ownBody.grants.length, 1)
  assert.doesNotMatch(JSON.stringify(ownBody), /inert_fixture_signature/)
  const other = sourceToken(otherUser)
  const another = await f.call('/api/mcp/connection', { headers: { Cookie: sourceCookie(other) } })
  assert.deepEqual((await another.json()).grants, [])
  const disconnect = (cookie, originHeader = origin) => f.call('/api/mcp/connection', { method: 'POST', headers: {
    Cookie: sourceCookie(cookie), Origin: originHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ grantId: ownBody.grants[0].id }) })
  assert.equal((await disconnect(access, 'https://attacker.invalid')).status, 403)
  await disconnect(other)
  assert.ok(await (await f.call('/test/session', { headers: { Authorization: 'Bearer ' + token.value.access_token } })).json())
  assert.equal((await disconnect(access)).status, 200)
  assert.equal(await (await f.call('/test/session', { headers: { Authorization: 'Bearer ' + token.value.access_token } })).json(), null)
})
