import test from 'node:test'
import assert from 'node:assert/strict'
import { accountApi, getVerifiedOAuthAccount, mcpOAuthConfig, mcpOAuthConfigured, CHESS_AUTH_URL, type AccountEnv } from '../server/accounts.ts'
const ORIGIN = 'https://worldifact.test'
const CALLBACK = 'https://chatgpt.com/connector/oauth/worldifact-test'
const ID = '11111111-1111-4111-8111-111111111111'
const AUTH_ID = '22222222-2222-4222-8222-222222222222'
const env: AccountEnv = {
  MCP_RESOURCE_URL: ORIGIN + '/mcp', MCP_OAUTH_CLIENT_IDS: 'openai-test-client', MCP_OAUTH_REDIRECT_URIS: CALLBACK,
  ACCOUNT_LIMITER: { async limit() { return { success: true } } },
}
const user = { id: ID, email: 'fixture@example.test', user_metadata: { name: 'Fixture' } }
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
function token(overrides: Record<string, unknown> = {}) {
  return `${b64({ alg: 'RS256' })}.${b64({ iss: CHESS_AUTH_URL + '/auth/v1', aud: ['authenticated', env.MCP_RESOURCE_URL], exp: Math.floor(Date.now() / 1000) + 300, sub: ID, client_id: 'openai-test-client', scope: 'email profile', ...overrides })}.fixture`
}
function request(access: string) { return new Request(ORIGIN + '/mcp', { headers: { Authorization: 'Bearer ' + access } }) }

test('MCP cannot inherit browser account readiness and config pins exact HTTPS resources and callbacks', () => {
  assert.equal(mcpOAuthConfigured({}), false)
  assert.equal(mcpOAuthConfig(env).resource, ORIGIN + '/mcp')
  for (const changes of [
    { MCP_RESOURCE_URL: '' }, { MCP_OAUTH_CLIENT_IDS: '' }, { MCP_OAUTH_REDIRECT_URIS: '' },
    { MCP_RESOURCE_URL: 'http://worldifact.test/mcp' }, { MCP_RESOURCE_URL: ORIGIN + '/mcp?secret=x' },
    { MCP_OAUTH_REDIRECT_URIS: 'https://chatgpt.com/connector/oauth/*' },
    { MCP_OAUTH_REDIRECT_URIS: CALLBACK + '?next=evil' }, { MCP_OAUTH_REDIRECT_URIS: 'https://chatgpt.com.evil.test/callback' },
  ]) assert.equal(mcpOAuthConfigured({ ...env, ...changes }), false)
})

test('MCP rejects generic audience, unrelated client, malformed claims and missing signed scope before upstream', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; return Response.json(user) }) as typeof fetch
  for (const claims of [
    { aud: 'authenticated' }, { aud: 'https://another.test/mcp' }, { client_id: 'unrelated-app' },
    { iss: 'https://another.supabase.co/auth/v1' }, { scope: undefined }, { scope: 'email' },
    { nbf: Math.floor(Date.now() / 1000) + 5 }, { nbf: 'tomorrow' }, { exp: 0 }, { sub: 'invalid' },
    { user_metadata: { aud: env.MCP_RESOURCE_URL, client_id: 'openai-test-client' }, aud: 'authenticated' },
  ]) assert.equal(await getVerifiedOAuthAccount(request(token(claims)), env, fetcher), null)
  assert.equal(calls, 0)
})

test('resource-bound OAuth claims still require upstream signature verification and exact subject match', async () => {
  const access = token()
  let calls = 0
  const valid = (async (url, init) => {
    calls++; assert.equal(String(url), CHESS_AUTH_URL + '/auth/v1/user')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + access)
    return Response.json(user)
  }) as typeof fetch
  assert.equal((await getVerifiedOAuthAccount(request(access), env, valid))?.user.id, ID)
  assert.equal(calls, 1)
  assert.equal(await getVerifiedOAuthAccount(request(access), env, (async () => Response.json({}, { status: 401 })) as typeof fetch), null)
  assert.equal(await getVerifiedOAuthAccount(request(access), env, (async () => Response.json({ ...user, id: AUTH_ID })) as typeof fetch), null)
})

function consentRequest(method = 'GET') {
  return new Request(ORIGIN + '/api/account/oauth/authorization' + (method === 'GET' ? '?authorization_id=' + AUTH_ID : ''), {
    method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: '__Host-worldifact-access=fixture-session-token' },
    ...(method === 'POST' ? { body: JSON.stringify({ authorizationId: AUTH_ID, action: 'approve' }) } : {}),
  })
}
const details = { authorization_id: AUTH_ID, redirect_uri: CALLBACK, client: { id: 'openai-test-client', name: 'ChatGPT' }, scope: 'email profile' }
test('consent revalidates the client, exact callback, request identity and scopes before POST approval', async () => {
  for (const changes of [
    { client: { id: 'other-client', name: 'ChatGPT' } }, { redirect_uri: 'https://chatgpt.com/connector/oauth/different' },
    { scope: 'email profile phone' }, { scope: 'email' }, { authorization_id: ID },
  ]) {
    let writes = 0
    const fetcher = (async (url, init) => {
      if (String(url).endsWith('/user')) return Response.json(user)
      if (init?.method === 'POST') { writes++; throw new Error('Must not approve') }
      return Response.json({ ...details, ...changes })
    }) as typeof fetch
    for (const method of ['GET', 'POST']) assert.equal((await accountApi(consentRequest(method), env, fetcher))?.status, 403)
    assert.equal(writes, 0)
  }
})

test('consent returns only the configured callback, including provider denial and previously approved flows', async () => {
  for (const redirect of [CALLBACK + '?code=fixture&state=state', CALLBACK + '?error=access_denied&state=state']) {
    const fetcher = (async (url) => Response.json(String(url).endsWith('/user') ? user : { redirect_url: redirect })) as typeof fetch
    const response = await accountApi(consentRequest(), env, fetcher)
    assert.equal(response?.status, 200)
    assert.deepEqual(await response!.json(), { redirectUrl: redirect })
  }
  for (const redirect of [CALLBACK + '#token=fixture', 'https://chatgpt.com/connector/oauth/other?code=fixture', 'https://evil.test?code=fixture']) {
    const fetcher = (async (url) => Response.json(String(url).endsWith('/user') ? user : { redirect_url: redirect })) as typeof fetch
    assert.equal((await accountApi(consentRequest(), env, fetcher))?.status, 403)
  }
})
