import { AccountError, getVerifiedAccount, type AccountEnv, type AccountUser } from './accounts.ts'
import type { AuthRequest, OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider'

/** Dedicated MCP credentials. Browser access/refresh tokens are never returned to an MCP client. */
export const MCP_SCOPES = ['profile:read', 'worlds:read', 'worlds:write', 'models:read', 'models:generate'] as const
export const MCP_BASE_SCOPES = ['profile:read'] as const
export const MCP_READ_ONLY_SCOPES = ['profile:read', 'worlds:read', 'models:read'] as const
export function mcpOAuthScopes(env: McpOAuthEnv): readonly typeof MCP_SCOPES[number][] {
  return env.MCP_READ_ONLY === 'true' ? MCP_READ_ONLY_SCOPES : MCP_SCOPES
}
export interface McpOAuthKV {
  get<T = unknown>(key: string, options: { type: 'json' }): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>
}
export interface McpOAuthEnv extends AccountEnv { MCP_OAUTH_ENABLED?: string; MCP_READ_ONLY?: string; OAUTH_KV?: McpOAuthKV }
export interface McpOAuthContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException?(): void }
export interface McpOAuthSession { user: AccountUser; token: string; clientId: string; scopes: string[]; resource: string; expiresAt: number }
type GrantProps = { userId: string; accessToken: string; expiresAt: number }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE = /^[A-Za-z0-9_-]{43}$/
const LOGIN_COOKIE = '__Host-worldifact-mcp-login'
const MAX_BODY = 8192
const labels: Record<string, string> = {
  'profile:read': 'Read your WORLDIFACT profile and point allowance',
  'worlds:read': 'Read your saved worlds',
  'worlds:write': 'Save changes to your worlds',
  'models:read': 'Read your models and generation status',
  'models:generate': 'Prepare and start model generation after your approval of the quoted points',
}

export function mcpOAuthBrokerConfig(env: McpOAuthEnv) {
  const fail = () => new AccountError('The optional OpenAI connection is not configured.', 503)
  if (env.MCP_OAUTH_ENABLED !== 'true' || !env.OAUTH_KV) throw fail()
  const resource = env.MCP_RESOURCE_URL || ''
  const clientIds = (env.MCP_OAUTH_CLIENT_IDS || '').split(',').map(value => value.trim())
  const redirectUris = (env.MCP_OAUTH_REDIRECT_URIS || '').split(',').map(value => value.trim())
  try {
    const url = new URL(resource)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/mcp' || url.href !== resource) throw fail()
    if (clientIds.length > 10 || clientIds.some(value => !/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,180}\/)?client\.json$/.test(value))) throw fail()
    if (redirectUris.length > 10 || redirectUris.some(value => !/^https:\/\/chatgpt\.com\/(?:connector_platform_oauth_redirect|connector\/oauth\/[A-Za-z0-9_-]{1,180})$/.test(value))) throw fail()
    return { resource, issuer: url.origin, clientIds, redirectUris, scopes: mcpOAuthScopes(env) }
  } catch { throw fail() }
}
export function mcpOAuthBrokerConfigured(env: McpOAuthEnv) {
  try { mcpOAuthBrokerConfig(env); return true } catch { return false }
}
function validProps(value: unknown): value is GrantProps {
  if (!value || typeof value !== 'object') return false
  const props = value as Partial<GrantProps>
  return typeof props.userId === 'string' && UUID.test(props.userId) && typeof props.accessToken === 'string' &&
    /^[A-Za-z0-9._~-]{8,3800}$/.test(props.accessToken) && Number.isSafeInteger(props.expiresAt)
}
function sourceToken(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  if (cookie.length > 12_000) return null
  const matches = cookie.split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-worldifact-access='))
  const token = matches.length === 1 ? matches[0].slice('__Host-worldifact-access='.length) : ''
  return /^[A-Za-z0-9._~-]{8,3800}$/.test(token) ? token : null
}
function sourceExpiry(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return 0
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(raw + '='.repeat((4 - raw.length % 4) % 4))) as { exp?: number }
    return Number.isSafeInteger(payload.exp) ? Math.min(payload.exp!, Math.floor(Date.now() / 1000) + 3600) : 0
  } catch { return 0 }
}
async function sourceSession(request: Request, env: McpOAuthEnv, fetcher: typeof fetch): Promise<{ user: AccountUser; props: GrantProps } | null> {
  const token = sourceToken(request)
  if (!token) return null
  const user = await getVerifiedAccount(request, env, fetcher)
  if (!user) return null
  // exp is used only after Supabase verified this exact token and returned its owner.
  const expiresAt = sourceExpiry(token)
  if (expiresAt <= Math.floor(Date.now() / 1000) + 90) throw new AccountError('Refresh your WORLDIFACT session, then reconnect OpenAI.', 401)
  return { user, props: { userId: user.id, accessToken: token, expiresAt } }
}
async function server(env: McpOAuthEnv) {
  const config = mcpOAuthBrokerConfig(env)
  // Lazy import keeps ordinary browser/account routes and Node fixtures independent of the Workers-only library.
  const { OAuthAuthorizationServer, OAuthError } = await import('@cloudflare/workers-oauth-provider')
  return new OAuthAuthorizationServer<McpOAuthEnv>({
    issuer: config.issuer, resources: [config.resource], defaultResource: config.resource,
    authorizeEndpoint: '/oauth/authorize', tokenEndpoint: '/oauth/token',
    clientIdMetadataDocumentEnabled: true, scopesSupported: [...config.scopes],
    accessTokenTTL: 3600, refreshTokenTTL: 0, allowTokenExchangeGrant: false,
    cookiePrefix: '__Host-worldifact-mcp-',
    tokenExchangeCallback({ grantType, props, clientId, userId, resource, scope, requestedScope }) {
      if (grantType !== 'authorization_code' || !config.clientIds.includes(clientId) || resource !== config.resource ||
        !validProps(props) || props.userId !== userId ||
        [...scope, ...requestedScope].some(value => !(config.scopes as readonly string[]).includes(value))) throw new OAuthError('invalid_grant', { description: 'Reconnect your WORLDIFACT account.' })
      const remaining = props.expiresAt - Math.floor(Date.now() / 1000) - 5
      if (remaining < 60) throw new OAuthError('invalid_grant', { description: 'The source session expired. Reconnect your WORLDIFACT account.' })
      return { accessTokenTTL: Math.min(3600, remaining), refreshTokenTTL: 0 }
    },
  })
}

export async function getMcpOAuthSession(request: Request, env: McpOAuthEnv, fetcher: typeof fetch = fetch): Promise<McpOAuthSession | null> {
  const config = mcpOAuthBrokerConfig(env)
  if (new URL(request.url).origin !== config.issuer) return null
  const match = /^Bearer ([A-Za-z0-9:_-]{20,512})$/.exec(request.headers.get('authorization') || '')
  if (!match) return null
  const validated = await (await server(env)).validateToken<GrantProps>(config.resource, match[1], env)
  const now = Math.floor(Date.now() / 1000)
  if (!validated || !validProps(validated.props) || !config.clientIds.includes(validated.clientId) ||
    validated.audience !== config.resource || validated.userId !== validated.props.userId ||
    validated.expiresAt <= now || validated.props.expiresAt <= now ||
    validated.scope.some(scope => !(config.scopes as readonly string[]).includes(scope))) return null
  const internal = new Request(config.issuer + '/api/account/session', { headers: { Cookie: '__Host-worldifact-access=' + validated.props.accessToken } })
  const user = await getVerifiedAccount(internal, env, fetcher)
  if (!user || user.id !== validated.userId) return null
  return { user, token: validated.props.accessToken, clientId: validated.clientId, scopes: validated.scope,
    resource: validated.audience, expiresAt: Math.min(validated.expiresAt, validated.props.expiresAt) }
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' } })
}
function escape(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!) }
function html(body: string, headers = new Headers(), status = 200) {
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
  headers.set('X-Frame-Options', 'DENY'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect WORLDIFACT</title><style>body{font:17px system-ui;background:#061d22;color:#eefbff;margin:0;padding:32px 16px}main{max-width:600px;margin:6vh auto;padding:28px;border:1px solid #247780;border-radius:20px}h1{font-size:30px}a{color:#71efe0}label{display:block;margin:16px 0}button{font:inherit;padding:12px 20px;margin:12px 12px 0 0;border:0;border-radius:9px;background:#78edd0;color:#032d2b}small{display:block;color:#a7c8d0;line-height:1.6}input{margin-right:9px}</style><main><p>WORLDIFACT · OPTIONAL OPENAI CONNECTION</p>${body}</main></html>`, { status, headers })
}
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function randomHandle() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function cookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` }
function requireSameOrigin(request: Request, issuer: string) {
  if (request.headers.get('origin') !== issuer || request.headers.get('sec-fetch-site') === 'cross-site') throw new AccountError('This request must come from WORLDIFACT.', 403)
}
async function rateLimit(request: Request, env: McpOAuthEnv) {
  const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
  if (!limiter) throw new AccountError('Connection protection is not configured.', 503)
  if (!(await limiter.limit({ key: `mcp-oauth:${new URL(request.url).pathname}:${request.headers.get('CF-Connecting-IP') || 'unknown'}` })).success)
    throw new AccountError('Too many connection requests. Try again shortly.', 429)
}
async function bodyText(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new AccountError('Request is too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) return ''
  let bytes = 0, value = ''; const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_BODY) throw new AccountError('Request is too large.', 413)
      value += decoder.decode(part.value, { stream: true })
    }
    return value + decoder.decode()
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof AccountError) throw error; throw new AccountError('Invalid request body.', 400) }
}
function checkAuthorization(auth: AuthRequest, config: ReturnType<typeof mcpOAuthBrokerConfig>) {
  if (!config.clientIds.includes(auth.clientId) || !config.redirectUris.includes(auth.redirectUri) || auth.resource !== config.resource ||
    auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(auth.codeChallenge) ||
    auth.responseType !== 'code' || auth.scope.some(scope => !(config.scopes as readonly string[]).includes(scope)))
    throw new AccountError('This OpenAI connection request has unsupported settings or permissions.', 400)
}
async function consent(request: Request, env: McpOAuthEnv, oauth: OAuthAuthorizationServer<McpOAuthEnv>, fetcher: typeof fetch) {
  const config = mcpOAuthBrokerConfig(env), helpers = oauth.getOAuthApi(env), url = new URL(request.url)
  const kv = env.OAUTH_KV!
  if (request.method === 'GET') {
    let auth: AuthRequest; const headers = new Headers()
    if (url.searchParams.has('continuation')) {
      const continuation = url.searchParams.get('continuation') || ''
      const matching = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(LOGIN_COOKIE + '='))
      if (!HANDLE.test(continuation) || url.searchParams.size !== 1 || matching.length !== 1 || matching[0] !== LOGIN_COOKIE + '=' + continuation)
        throw new AccountError('This connection request expired or belongs to another browser. Start again from OpenAI.', 400)
      const key = 'worldifact:login:' + await hash(continuation)
      const record = await kv.get<{ request: AuthRequest; expiresAt: number }>(key, { type: 'json' })
      if (!record || record.expiresAt <= Date.now()) throw new AccountError('This connection request expired. Start again from OpenAI.', 400)
      auth = record.request
      checkAuthorization(auth, config)
      // Preserve the transaction while the user is still completing sign-in.
      const current = await getVerifiedAccount(request, env, fetcher)
      if (!current) return html('<h1>Sign in to continue</h1><p><a href="/login?next=' + escape(encodeURIComponent(url.pathname + url.search)) + '">Sign in to WORLDIFACT</a></p>')
      await kv.delete(key)
      headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0))
    } else {
      if (url.href.length > 4096 || url.searchParams.getAll('client_id').length !== 1 || !config.clientIds.includes(url.searchParams.get('client_id') || '') ||
        url.searchParams.getAll('redirect_uri').length !== 1 || !config.redirectUris.includes(url.searchParams.get('redirect_uri') || ''))
        throw new AccountError('This OAuth client or callback is not approved for WORLDIFACT.', 400)
      auth = await helpers.parseAuthRequest(request)
      if (!auth.scope.length) auth.scope = [...MCP_BASE_SCOPES]
      checkAuthorization(auth, config)
    }
    const session = await sourceSession(request, env, fetcher)
    if (!session) {
      const continuation = randomHandle()
      await kv.put('worldifact:login:' + await hash(continuation), JSON.stringify({ request: auth, expiresAt: Date.now() + 600_000 }), { expirationTtl: 600 })
      headers.append('Set-Cookie', cookie(LOGIN_COOKIE, continuation, 600))
      headers.set('Location', '/login?next=' + encodeURIComponent('/oauth/authorize?continuation=' + continuation))
      return new Response(null, { status: 303, headers })
    }
    const details = await helpers.describeConsent(auth)
    const transaction = await helpers.beginConsent(auth)
    await kv.put('worldifact:consent:' + await hash(transaction.handle), JSON.stringify({ userId: session.user.id, scopes: auth.scope, expiresAt: Date.now() + 600_000 }), { expirationTtl: 600 })
    for (const value of transaction.headers.getSetCookie()) headers.append('Set-Cookie', value)
    return html(`<h1>Connect WORLDIFACT to OpenAI</h1><p>Signed in as <strong>${escape(session.user.displayName)}</strong>${session.user.email ? ` (${escape(session.user.email)})` : ''}.</p><p>Client: <strong>${escape(details.clientName)}</strong>. Verified client domain: <strong>${escape(details.clientDomain || 'chatgpt.com')}</strong>. Return address: <strong>${escape(details.redirectHost)}</strong>.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="handle" value="${escape(transaction.handle)}"><p>Choose the permissions for this connection:</p>${auth.scope.map(scope => `<label><input type="checkbox" name="scope" value="${escape(scope)}" checked>${escape(labels[scope])}</label>`).join('')}<small>Connecting is optional. ${env.MCP_READ_ONLY === 'true' ? 'This connection can only read your profile, worlds and model status. It cannot save worlds or prepare or start generation.' : 'Generating a model still requires an explicit request and approval of the quoted WORLDIFACT points.'} No payment or generation starts here. This connection lasts up to one hour; reconnect when your WORLDIFACT session expires. Disconnect at any time from OpenAI connections in your account.</small><button name="action" value="approve">Approve connection</button><button name="action" value="deny">Deny</button></form>`, headers)
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  requireSameOrigin(request, config.issuer)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw new AccountError('Invalid consent request.', 400)
  const form = new URLSearchParams(await bodyText(request))
  if (form.getAll('handle').length !== 1 || form.getAll('action').length !== 1 || [...form.keys()].some(key => !['handle', 'action', 'scope'].includes(key))) throw new AccountError('Invalid consent request.', 400)
  const handle = form.get('handle') || '', action = form.get('action')
  if (!handle || handle.length > 256 || !['approve', 'deny'].includes(action || '')) throw new AccountError('Invalid consent decision.', 400)
  const key = 'worldifact:consent:' + await hash(handle)
  const record = await kv.get<{ userId: string; scopes: string[]; expiresAt: number }>(key, { type: 'json' })
  const session = await sourceSession(request, env, fetcher)
  if (!session) throw new AccountError('Sign in to WORLDIFACT before approving this connection.', 401)
  if (!record || record.expiresAt <= Date.now() || record.userId !== session.user.id) throw new AccountError('This request expired or the signed-in account changed. Start again from OpenAI.', 400)
  if (action === 'deny') {
    const denied = await helpers.denyConsent(request, handle)
    await kv.delete(key)
    return new Response(null, { status: 303, headers: denied.headers })
  }
  const scopes = form.getAll('scope')
  if (!scopes.length || new Set(scopes).size !== scopes.length || scopes.some(scope => !record.scopes.includes(scope) || !(config.scopes as readonly string[]).includes(scope))) throw new AccountError('Select only the permissions shown for this connection.', 400)
  const approved = await helpers.approveConsent(request, handle, { scope: scopes })
  checkAuthorization(approved.request, config)
  const completed = await helpers.completeAuthorization({ request: approved.request, userId: session.user.id,
    scope: scopes, props: session.props, metadata: { expiresAt: session.props.expiresAt } })
  await kv.delete(key)
  approved.headers.set('Location', completed.redirectTo)
  return new Response(null, { status: 303, headers: approved.headers })
}
async function connection(request: Request, env: McpOAuthEnv, oauth: OAuthAuthorizationServer<McpOAuthEnv>, fetcher: typeof fetch) {
  const user = await getVerifiedAccount(request, env, fetcher)
  if (!user) throw new AccountError('Sign in to view your OpenAI connections.', 401)
  const config = mcpOAuthBrokerConfig(env), helpers = oauth.getOAuthApi(env)
  if (request.method === 'POST' || request.method === 'DELETE') {
    requireSameOrigin(request, config.issuer)
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AccountError('Invalid disconnect request.', 400)
    let input: { grantId?: unknown }
    try { input = JSON.parse(await bodyText(request)) } catch (error) { if (error instanceof AccountError) throw error; throw new AccountError('Invalid disconnect request.', 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.grantId !== 'string' || !/^[A-Za-z0-9_-]{8,180}$/.test(input.grantId)) throw new AccountError('Invalid connection identifier.', 400)
    await helpers.revokeGrant(input.grantId, user.id)
    return json({ revoked: true })
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
  const page = await helpers.listUserGrants(user.id, { limit: 100 })
  const now = Math.floor(Date.now() / 1000)
  const grants = page.items.filter(grant => config.clientIds.includes(grant.clientId) && grant.resource === config.resource &&
    typeof grant.metadata?.expiresAt === 'number' && grant.metadata.expiresAt > now && (!grant.expiresAt || grant.expiresAt > now))
    .map(grant => ({ id: grant.id, clientId: grant.clientId, scopes: grant.scope, active: grant.scope.every(scope => (config.scopes as readonly string[]).includes(scope)), createdAt: grant.createdAt, expiresAt: Math.min(grant.metadata.expiresAt, grant.expiresAt || Infinity) }))
  return json({ configured: true, authorized: grants.some(grant => grant.active), grants, reconnectAfterSeconds: 3600, refreshSupported: false })
}

export async function handleMcpOAuth(request: Request, env: McpOAuthEnv, fetcher: typeof fetch = fetch, context?: McpOAuthContext): Promise<Response | null> {
  const url = new URL(request.url)
  if (!['/oauth/authorize', '/oauth/token', '/.well-known/oauth-authorization-server', '/api/mcp/connection'].includes(url.pathname)) return null
  try {
    const config = mcpOAuthBrokerConfig(env)
    if (url.origin !== config.issuer) return json({ error: 'The connection endpoint does not match its configured address.' }, 400)
    if (url.pathname !== '/.well-known/oauth-authorization-server') await rateLimit(request, env)
    const oauth = await server(env)
    if (url.pathname === '/oauth/authorize') return await consent(request, env, oauth, fetcher)
    if (url.pathname === '/api/mcp/connection') return await connection(request, env, oauth, fetcher)
    let forwarded = request
    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      if (request.headers.has('authorization')) return json({ error: 'invalid_client', error_description: 'This connection uses a public PKCE client.' }, 401)
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return json({ error: 'invalid_request' }, 400)
      const body = await bodyText(request), fields = new URLSearchParams(body)
      if (fields.getAll('client_id').length !== 1 || !config.clientIds.includes(fields.get('client_id') || '')) return json({ error: 'invalid_client' }, 401)
      if (fields.has('grant_type') && fields.get('grant_type') !== 'authorization_code') return json({ error: 'unsupported_grant_type' }, 400)
      forwarded = new Request(request.url, { method: request.method, headers: request.headers, body })
    }
    const pending: Promise<unknown>[] = []
    const ctx = context ?? { waitUntil(promise: Promise<unknown>) { pending.push(promise) }, passThroughOnException() {} }
    const response = await oauth.fetch(forwarded, env, ctx as Parameters<OAuthAuthorizationServer<McpOAuthEnv>['fetch']>[2])
    await Promise.all(pending)
    if (url.pathname === '/.well-known/oauth-authorization-server' && request.method === 'GET' && response.ok) {
      const metadata = await response.json() as Record<string, unknown>
      // The generic library advertises refresh/confidential methods even when disabled.
      // Discovery must describe this adapter's supported public PKCE flow exactly.
      metadata.grant_types_supported = ['authorization_code']
      metadata.token_endpoint_auth_methods_supported = ['none']
      return new Response(JSON.stringify(metadata), { status: response.status, headers: response.headers })
    }
    return response
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status)
    // Never put upstream credentials, authorization codes, request state or provider details on the wire.
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AuthorizationError')
      return html('<h1>Connection request unavailable</h1><p>The request is invalid, expired or belongs to another browser. Return to OpenAI and connect again.</p>', new Headers(), 400)
    return json({ error: 'The OpenAI connection is temporarily unavailable. Try again shortly.' }, 503)
  }
}
