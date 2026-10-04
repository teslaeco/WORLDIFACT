import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMcpReadiness } from '../scripts/check-mcp-readiness.mjs'

const endpoint = 'https://worldifact.example.com/mcp'
const issuer = 'https://auth.example.com/auth/v1'
const scopes = ['profile:read', 'worlds:read', 'worlds:write', 'models:read', 'models:generate']
const readOnlyScopes = ['profile:read', 'worlds:read', 'models:read']
const privateMarker = 'DO_NOT_LOG_PRIVATE_TOKEN_OR_PROFILE'
function fixture(options = {}) {
  const calls = []
  const supportedScopes = options.readOnly ? readOnlyScopes : scopes
  return { calls, fetcher: async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/api/account/config')) return Response.json({ googleReady: options.googleReady ?? false, privateToken: privateMarker })
    if (init.method === 'POST') {
      const rpc = JSON.parse(init.body)
      if (options.initialize404 && rpc.method === 'initialize') return Response.json({ error: 'not found' }, { status: 404 })
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 })
      let result
      if (rpc.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'WORLDIFACT' } }
      else if (rpc.method === 'tools/list') result = { tools: [
        { name: 'get_worldifact_status', annotations: { readOnlyHint: !options.writableStatus }, securitySchemes: [{ type: 'noauth' }] },
        { name: 'get_profile', securitySchemes: [{ type: 'oauth2', scopes: ['profile:read'] }] },
        ...(!options.readOnly || options.readOnlyForbiddenTool ? [{ name: options.readOnlyForbiddenTool || 'start_3d_model', securitySchemes: [{ type: 'oauth2', scopes: [options.wrongToolScope ? 'profile:read' : 'models:generate'] }] }] : []),
      ] }
      else if (rpc.method === 'tools/call' && rpc.params.name === 'get_worldifact_status') result = { structuredContent: { mcp: 'RESPONDING', generationStarted: false, oauthConfigured: options.configured ?? true, oauthScopes: options.legacyScopes ? ['email', 'profile'] : supportedScopes, privateToken: privateMarker } }
      else throw new Error('Unexpected or mutating tool call')
      return options.html ? new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }) : Response.json({ jsonrpc: '2.0', id: rpc.id, result })
    }
    if (url.endsWith('/.well-known/oauth-protected-resource/mcp')) return options.configured === false
      ? Response.json({ error: privateMarker }, { status: 503 })
      : Response.json({ resource: options.wrongResource ? 'https://other.example.com/mcp' : endpoint, authorization_servers: [options.unsafeIssuer ?? issuer], scopes_supported: options.legacyScopes ? ['email', 'profile'] : supportedScopes, bearer_methods_supported: ['header'] })
    if (url === 'https://auth.example.com/.well-known/oauth-authorization-server/auth/v1' || url === issuer + '/.well-known/openid-configuration') {
      if (options.oidcOnly && url.includes('/.well-known/oauth-authorization-server')) return Response.json({ error: 'not_found' }, { status: 404 })
      if (options.disabled) return Response.json({ error: 'OAuth server is disabled', secret: privateMarker }, { status: 404 })
      return Response.json({ issuer: options.wrongIssuer ? 'https://other.example.com' : issuer, authorization_endpoint: issuer + '/oauth/authorize', token_endpoint: issuer + '/oauth/token', code_challenge_methods_supported: options.noS256 ? ['plain'] : ['S256'], response_types_supported: ['code'], grant_types_supported: ['authorization_code'], scopes_supported: options.missingScope ? ['profile:read'] : options.broadAuthorizationScopes ? scopes : supportedScopes, token: privateMarker })
    }
    throw new Error('Unexpected URL ' + url)
  } }
}

test('readiness checks public transport and discovery without credentials, private tools or generation', async () => {
  const { calls, fetcher } = fixture()
  const report = await checkMcpReadiness(endpoint, fetcher)
  assert.equal(report.readyForConnectionTest, true)
  assert.equal(report.oauthConfiguration, 'CONFIGURED_NOT_CONNECTED')
  assert.equal(report.authenticatedConnection, 'NOT_TESTED')
  assert.equal(report.tokenAudienceBinding, 'NOT_TESTED')
  assert.equal(report.paidGenerationRequested, false)
  assert.equal(calls.length, 7)
  assert.equal(report.googleReady, false)
  for (const { init } of calls) {
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error')
    assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers.Cookie, undefined)
  }
  assert.deepEqual(calls.filter(call => call.init.method === 'POST').map(call => JSON.parse(call.init.body).method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])
  assert.equal(JSON.parse(calls[4].init.body).params.name, 'get_worldifact_status')
  assert.doesNotMatch(JSON.stringify(report), new RegExp(privateMarker))
})

test('read-only discovery is ready only with restricted scopes and no hidden write/generation advertisement', async () => {
  const restricted = fixture({ readOnly: true })
  const report = await checkMcpReadiness(endpoint, restricted.fetcher)
  assert.equal(report.readyForConnectionTest, true)
  assert.equal(report.accessMode, 'READ_ONLY')
  assert.deepEqual(restricted.calls.filter(call => call.init.method === 'POST' && JSON.parse(call.init.body).method === 'tools/call')
    .map(call => JSON.parse(call.init.body).params.name), ['get_worldifact_status'])
  for (const options of [
    { broadAuthorizationScopes: true },
    { readOnlyForbiddenTool: 'save_my_world', wrongToolScope: true },
    { readOnlyForbiddenTool: 'prepare_3d_model', wrongToolScope: true },
    { readOnlyForbiddenTool: 'start_3d_model', wrongToolScope: true },
  ]) {
    const { fetcher } = fixture({ readOnly: true, ...options })
    const denied = await checkMcpReadiness(endpoint, fetcher)
    assert.equal(denied.readyForConnectionTest, false)
    assert.ok(denied.checks.some(check => check.reason?.startsWith('READ_ONLY_')))
  }
})

test('initial route propagation 404 retains the single initialize failure used by the review workflow retry', async () => {
  const { fetcher, calls } = fixture({ initialize404: true })
  const report = await checkMcpReadiness(endpoint, fetcher)
  assert.equal(report.readyForConnectionTest, false)
  assert.equal(calls.length, 1)
  assert.deepEqual(report.checks, [{ name: 'initialize', result: 'FAIL', reason: 'HTTP_404' }])
})

test('missing OAuth or disabled discovery never reports ready or reveals upstream messages', async () => {
  for (const options of [{ configured: false }, { disabled: true }]) {
    const { fetcher } = fixture(options)
    const report = await checkMcpReadiness(endpoint, fetcher)
    assert.equal(report.transport, 'RESPONDING')
    assert.equal(report.readyForConnectionTest, false)
    assert.doesNotMatch(JSON.stringify(report), new RegExp(privateMarker))
    assert.ok(report.checks.some(check => check.result === 'FAIL'))
  }
})

test('scope, issuer, resource, JSON and PKCE defects fail closed before a connection claim', async () => {
  for (const options of [{ googleReady: 'invalid' }, { wrongResource: true }, { wrongIssuer: true }, { noS256: true }, { missingScope: true }, { legacyScopes: true }, { wrongToolScope: true }, { html: true }, { unsafeIssuer: 'http://127.0.0.1/private' }]) {
    const { fetcher } = fixture(options)
    const report = await checkMcpReadiness(endpoint, fetcher)
    assert.equal(report.readyForConnectionTest, false)
    assert.ok(report.checks.some(check => check.result === 'FAIL'))
  }
})

test('probe will not execute a writable status tool and accepts standards-based OIDC fallback', async () => {
  const unsafe = fixture({ writableStatus: true })
  const report = await checkMcpReadiness(endpoint, unsafe.fetcher)
  assert.equal(report.readyForConnectionTest, false)
  assert.equal(unsafe.calls.length, 4)
  const fallback = fixture({ oidcOnly: true, googleReady: true })
  const fallbackReport = await checkMcpReadiness(endpoint, fallback.fetcher)
  assert.equal(fallbackReport.readyForConnectionTest, true)
  assert.equal(fallbackReport.googleReady, true)
  assert.equal(fallback.calls.at(-1).url, issuer + '/.well-known/openid-configuration')
})

test('endpoint credentials and local targets are rejected without making requests', async () => {
  for (const url of ['http://worldifact.example.com/mcp', 'https://token@worldifact.example.com/mcp', endpoint + '?token=SECRET', endpoint + '#secret', 'https://127.0.0.1/mcp', 'https://[::1]/mcp', 'https://private.local/mcp', 'https://localhost/mcp']) {
    let calls = 0
    await assert.rejects(() => checkMcpReadiness(url, async () => { calls++; throw new Error() }))
    assert.equal(calls, 0)
  }
})
