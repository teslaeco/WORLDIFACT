/** Public, read-only MCP/OAuth probe. No credentials, account calls or generation. */
import { isIP } from 'node:net'
import { pathToFileURL } from 'node:url'

const PROTOCOL = '2025-06-18'
const DEFAULT_ENDPOINT = 'https://worldifact.xodobrox.workers.dev/mcp'
const REQUIRED_SCOPES = ['profile:read', 'worlds:read', 'worlds:write', 'models:read', 'models:generate']
const TOOL_SCOPES = {
  get_profile: 'profile:read', list_my_worlds: 'worlds:read', get_my_world: 'worlds:read',
  save_my_world: 'worlds:write', create_or_update_world: 'worlds:write',
  list_my_models: 'models:read', get_generation_status: 'models:read', get_model_download: 'models:read',
  start_3d_model: 'models:generate',
}
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const strings = value => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 128)
const failure = code => Object.assign(new Error(code), { code })

function publicHttps(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || isIP(host) || !host.includes('.') || /\.(?:localhost|local|internal)$/i.test(host)) throw new Error()
    return url
  } catch { throw failure('INVALID_PUBLIC_HTTPS_URL') }
}

async function readJson(response) {
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure('NON_JSON_RESPONSE')
  if (Number(response.headers.get('content-length') || 0) > 131072) throw failure('RESPONSE_TOO_LARGE')
  const reader = response.body?.getReader()
  if (!reader) throw failure('EMPTY_RESPONSE')
  let size = 0, text = ''
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 131072) throw failure('RESPONSE_TOO_LARGE')
      text += decoder.decode(part.value, { stream: true })
    }
    const value = JSON.parse(text + decoder.decode())
    if (!object(value)) throw failure('INVALID_JSON_OBJECT')
    return value
  } catch (error) {
    throw error.code ? error : failure('INVALID_JSON_OBJECT')
  } finally { await reader.cancel().catch(() => {}) }
}

export async function checkMcpReadiness(endpoint = DEFAULT_ENDPOINT, fetcher = fetch) {
  const target = publicHttps(endpoint)
  if (target.pathname !== '/mcp') throw failure('EXPECTED_MCP_ENDPOINT')
  const checks = []
  const report = {
    checkedAt: new Date().toISOString(), endpoint: target.href,
    transport: 'NOT_VERIFIED', oauthConfiguration: 'NOT_VERIFIED', discovery: 'NOT_VERIFIED',
    authenticatedConnection: 'NOT_TESTED', tokenAudienceBinding: 'NOT_TESTED', paidGenerationRequested: false,
    readyForConnectionTest: false, checks,
  }
  let protocol = PROTOCOL
  const call = async (method, params, id) => {
    const response = await fetcher(target.href, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocol },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    const value = await readJson(response)
    if (!response.ok) throw failure(`HTTP_${response.status}`)
    if (value.jsonrpc !== '2.0' || value.id !== id || value.error || !object(value.result)) throw failure('INVALID_RPC_RESPONSE')
    return value.result
  }
  const get = async url => {
    const response = await fetcher(publicHttps(url).href, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' },
    })
    // Do not print error bodies: an upstream may include credentials or private data.
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw failure(`HTTP_${response.status}`) }
    return readJson(response)
  }
  const step = async (name, action) => {
    try { const value = await action(); checks.push({ name, result: 'PASS' }); return value }
    catch (error) { checks.push({ name, result: 'FAIL', reason: typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'REQUEST_FAILED' }); return null }
  }
  const initialized = await step('initialize', async () => {
    const value = await call('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'worldifact-public-readiness', version: '1.0.0' } }, 1)
    if (value.protocolVersion !== PROTOCOL || !object(value.capabilities?.tools) || value.serverInfo?.name !== 'WORLDIFACT') throw failure('UNEXPECTED_MCP_SERVER')
    protocol = value.protocolVersion
    return value
  })
  if (!initialized) return report
  const notified = await step('notifications/initialized', async () => {
    const response = await fetcher(target.href, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocol },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    await response.body?.cancel().catch(() => {})
    if (response.status !== 202) throw failure('INITIALIZATION_NOTIFICATION_REJECTED')
    return true
  })
  if (!notified) return report

  const listed = await step('tools/list', async () => {
    const value = await call('tools/list', {}, 2)
    if (!Array.isArray(value.tools) || !value.tools.length || value.tools.length > 100) throw failure('INVALID_TOOL_LIST')
    const tool = value.tools.find(item => item.name === 'get_worldifact_status')
    if (!tool || tool.annotations?.readOnlyHint !== true || !tool.securitySchemes?.some(scheme => scheme.type === 'noauth')) throw failure('PUBLIC_STATUS_TOOL_NOT_READ_ONLY')
    return value.tools
  })
  // Never call a tool whose discovery contract has not confirmed this public read-only action.
  if (!listed) return report
  const status = await step('get_worldifact_status', async () => {
    const value = await call('tools/call', { name: 'get_worldifact_status', arguments: {} }, 3)
    const body = value.structuredContent
    if (value.isError || !object(body) || body.mcp !== 'RESPONDING' || body.generationStarted !== false || typeof body.oauthConfigured !== 'boolean') throw failure('INVALID_PUBLIC_STATUS')
    return { oauthConfigured: body.oauthConfigured, oauthScopes: body.oauthScopes }
  })
  if (!status) return report
  report.transport = 'RESPONDING'
  report.oauthConfiguration = status.oauthConfigured ? 'CONFIGURED_NOT_CONNECTED' : 'NOT_CONFIGURED'

  const resource = await step('protected-resource-metadata', async () => {
    const value = await get(new URL('/.well-known/oauth-protected-resource/mcp', target).href)
    if (value.resource !== target.href || !strings(value.authorization_servers) || !strings(value.scopes_supported) || !value.bearer_methods_supported?.includes('header')) throw failure('INVALID_RESOURCE_METADATA')
    value.authorization_servers.forEach(publicHttps)
    if (!strings(status.oauthScopes) || status.oauthScopes.some(scope => !value.scopes_supported.includes(scope))) throw failure('STATUS_SCOPES_MISMATCH')
    if (REQUIRED_SCOPES.some(scope => !value.scopes_supported.includes(scope) || !status.oauthScopes.includes(scope))) throw failure('GRANULAR_SCOPES_MISSING')
    for (const tool of listed) {
      for (const scheme of tool.securitySchemes || []) {
        if (scheme.type === 'oauth2' && (!strings(scheme.scopes) || scheme.scopes.some(scope => !value.scopes_supported.includes(scope)))) throw failure('TOOL_SCOPES_MISMATCH')
      }
      const requiredScope = TOOL_SCOPES[tool.name]
      if (requiredScope && (!Array.isArray(tool.securitySchemes) || !tool.securitySchemes.length || tool.securitySchemes.some(scheme => scheme.type !== 'oauth2' || !scheme.scopes?.includes(requiredScope)))) throw failure('TOOL_PERMISSION_MISMATCH')
    }
    return value
  })
  if (!resource) return report
  const issuer = publicHttps(resource.authorization_servers[0])
  const discovered = await step('authorization-server-discovery', async () => {
    // RFC 8414: insert the well-known path before the issuer path.
    const discoveryUrl = new URL('/.well-known/oauth-authorization-server' + (issuer.pathname === '/' ? '' : issuer.pathname), issuer)
    let value
    try { value = await get(discoveryUrl.href) }
    catch (error) {
      if (error.code !== 'HTTP_404') throw error
      // Some providers expose OIDC discovery at the issuer path instead.
      value = await get(issuer.href.replace(/\/$/, '') + '/.well-known/openid-configuration')
    }
    if (value.issuer !== resource.authorization_servers[0]) throw failure('ISSUER_MISMATCH')
    publicHttps(value.authorization_endpoint); publicHttps(value.token_endpoint)
    if (!strings(value.code_challenge_methods_supported) || !value.code_challenge_methods_supported.includes('S256')) throw failure('PKCE_S256_MISSING')
    if (!strings(value.response_types_supported) || !value.response_types_supported.includes('code') || !strings(value.grant_types_supported) || !value.grant_types_supported.includes('authorization_code')) throw failure('AUTHORIZATION_CODE_FLOW_MISSING')
    if (!strings(value.scopes_supported) || resource.scopes_supported.some(scope => !value.scopes_supported.includes(scope))) throw failure('AUTHORIZATION_SCOPES_MISSING')
    return true
  })
  if (discovered) report.discovery = 'PUBLIC_METADATA_VERIFIED'
  report.readyForConnectionTest = status.oauthConfigured && discovered === true
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw failure('EXPECTED_ONE_PUBLIC_ENDPOINT')
    const report = await checkMcpReadiness(process.argv[2])
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.readyForConnectionTest ? 0 : 1
  } catch {
    console.error(JSON.stringify({ readiness: 'PUBLIC_CHECK_FAILED', authenticatedConnection: 'NOT_TESTED', paidGenerationRequested: false }))
    process.exitCode = 1
  }
}
