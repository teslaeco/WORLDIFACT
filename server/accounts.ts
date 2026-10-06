import { safeAccountDestination } from '../src/lib/accountDestination.ts'

/** Shared Cube Chess Supabase identity. No WORLDIFACT password/user database. */
export interface AccountRateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface AccountEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_RECOVERY_REDIRECT_READY?: string
  SUPABASE_GOOGLE_REDIRECT_READY?: string
  ACCOUNT_LIMITER?: AccountRateLimiter
  GENERATION_LIMITER?: AccountRateLimiter
}
export interface AccountUser { id: string; email: string; displayName: string }
export const CHESS_AUTH_URL = 'https://oiezgikconcyjvdeshdh.supabase.co'
// Public, non-privileged publishable key read from the deployed Chess frontend.
// This is NOT the service_role key. Auth and database RLS still enforce access.
const CHESS_PUBLIC_KEY = 'sb_publishable_6AN-InHOv7ZS4-dvglRRIg_ICK7jkXP'
const ACCESS_COOKIE = '__Host-worldifact-access'
const REFRESH_COOKIE = '__Host-worldifact-refresh'
const PKCE_COOKIE = '__Host-worldifact-recovery-verifier'
const RECOVERY_COOKIE = '__Host-worldifact-recovery'
const OAUTH_COOKIE = '__Host-worldifact-google-flow'
const OAUTH_FLOW_SECONDS = 600
const MAX_BODY = 4096
const MAX_UPSTREAM_BODY = 32_768
// Observed valid Supabase error responses can take longer than twelve seconds.
// Keep a finite budget without retrying one-time codes or rotating tokens.
const UPSTREAM_TIMEOUT_MS = 25_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type ProviderSession = { access_token: string; refresh_token: string; expires_in: number; user: AccountUser }
export class AccountError extends Error {
  status: number
  constructor(message: string, status = 503) { super(message); this.status = status }
}
function config(env: AccountEnv) {
  const base = (env.SUPABASE_URL ?? CHESS_AUTH_URL).replace(/\/$/, '')
  const key = (env.SUPABASE_ANON_KEY ?? CHESS_PUBLIC_KEY).trim()
  let url: URL
  try { url = new URL(base) } catch { throw new AccountError('Account service is not configured.') }
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new AccountError('Account service is not configured.')
  if (!/^sb_publishable_[A-Za-z0-9_-]{10,160}$/.test(key) && !publicLegacyKey(key))
    throw new AccountError('Account service is not configured.')
  return { base, key }
}
function publicLegacyKey(key: string) {
  try {
    const parts = key.split('.')
    if (parts.length !== 3 || key.length > 2048) return false
    const body = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    // Reject accidentally supplied privileged service-role JWTs.
    return body.role === 'anon'
  } catch { return false }
}
export function accountsConfigured(env: AccountEnv): boolean { try { config(env); return true } catch { return false } }
function json(value: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(value), { status, headers })
}
function cookieValue(request: Request, name: string) {
  const raw = request.headers.get('Cookie') || ''
  if (raw.length > 12_000) return null
  const matches = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='))
  if (matches.length !== 1) return null
  const token = matches[0].slice(name.length + 1)
  return /^[A-Za-z0-9._~-]{8,3800}$/.test(token) ? token : null
}
function cookie(name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`
}
function clearCookies() { return [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0), cookie(RECOVERY_COOKIE, '', 0), cookie(PKCE_COOKIE, '', 0), cookie(OAUTH_COOKIE, '', 0)] }
function sessionCookies(session: ProviderSession) {
  return [cookie(ACCESS_COOKIE, session.access_token, session.expires_in), cookie(REFRESH_COOKIE, session.refresh_token, 30 * 86400)]
}
async function boundedJson(response: Response | Request, limit: number): Promise<Record<string, unknown>> {
  if (Number(response.headers.get('Content-Length')) > limit) throw new AccountError('Request is too large.', 413)
  const reader = response.body?.getReader()
  if (!reader) throw new AccountError('Invalid account request.', 400)
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new AccountError('Request is too large.', 413)
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid JSON')
    return value as Record<string, unknown>
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof AccountError) throw error; throw new AccountError('Invalid account request.', 400) }
}
function publicUser(value: unknown): AccountUser | null {
  if (!value || typeof value !== 'object') return null
  const user = value as Record<string, unknown>
  if (typeof user.id !== 'string' || !UUID.test(user.id)) return null
  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata as Record<string, unknown> : {}
  const label = [metadata.display_name, metadata.full_name, metadata.name].find(value => typeof value === 'string' && value.trim())
  return { id: user.id, email: typeof user.email === 'string' ? user.email.slice(0, 254) : '', displayName: typeof label === 'string' ? label.trim().slice(0, 80) : 'WORLDIFACT player' }
}
async function upstream(env: AccountEnv, fetcher: typeof fetch, path: string, method: string, body?: unknown, token?: string) {
  const { base, key } = config(env)
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  // Publishable keys identify the application but are not bearer JWTs.
  // Preserve support for legacy anon JWTs and authenticated user requests.
  const bearer = token || (publicLegacyKey(key) ? key : undefined)
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  try {
    // Workerd supports manual/follow, but throws before sending requests when
    // redirect is "error". Reject redirects ourselves to keep credentials at
    // the configured provider and never follow a response Location.
    const response = await fetcher(`${base}/auth/v1${path}`, { method, headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new AccountError('Account service returned an unexpected redirect.')
    }
    return response
  } catch { throw new AccountError('Account service is temporarily unavailable. Please try again.') }
}
async function responseJson(response: Response) {
  try { return await boundedJson(response, MAX_UPSTREAM_BODY) } catch { throw new AccountError('Account service returned an incomplete response.', 502) }
}
async function verifiedUser(env: AccountEnv, fetcher: typeof fetch, token: string): Promise<AccountUser | null> {
  const response = await upstream(env, fetcher, '/user', 'GET', undefined, token)
  if ([400, 401, 403].includes(response.status)) { await response.body?.cancel(); return null }
  if (!response.ok) { await response.body?.cancel(); throw new AccountError('Account service is temporarily unavailable.') }
  const user = publicUser(await responseJson(response))
  if (!user) throw new AccountError('Account service returned an incomplete response.', 502)
  return user
}
/** Verifies the access cookie with Supabase. Call /session to refresh before a retry. */
export async function getVerifiedAccount(request: Request, env: AccountEnv, fetcher: typeof fetch = fetch): Promise<AccountUser | null> {
  const token = cookieValue(request, ACCESS_COOKIE)
  return token ? verifiedUser(env, fetcher, token) : null
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
async function limit(request: Request, env: AccountEnv, action: string, email?: string) {
  const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
  if (!limiter) throw new AccountError('Account protection is not configured yet.')
  const bucket = email ? `email:${await digest(email.toLowerCase())}` : `ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`
  try { if (!(await limiter.limit({ key: `account:${action}:${bucket}` })).success) throw new AccountError('Too many account requests. Please try again later.', 429) }
  catch (error) { if (error instanceof AccountError) throw error; throw new AccountError('Account protection is temporarily unavailable.') }
}
function validateSession(value: Record<string, unknown>): ProviderSession {
  const user = publicUser(value.user)
  if (!user || typeof value.access_token !== 'string' || !/^[A-Za-z0-9._~-]{8,3800}$/.test(value.access_token) ||
    typeof value.refresh_token !== 'string' || !/^[A-Za-z0-9._~-]{8,3800}$/.test(value.refresh_token) ||
    typeof value.expires_in !== 'number' || !Number.isInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 86400)
    throw new AccountError('Account service returned an incomplete session.', 502)
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_in: value.expires_in, user }
}
// Supabase rotates refresh tokens. Coalesce simultaneous requests within this
// isolate and briefly reuse the result; failures never erase a newer cookie.
// Cross-isolate races additionally rely on Supabase's server-side reuse window.
const refreshes = new Map<string, { expires: number; result: Promise<ProviderSession | null> }>()
async function refresh(env: AccountEnv, fetcher: typeof fetch, refreshToken: string) {
  const key = await digest(config(env).base + ':' + refreshToken), now = Date.now()
  for (const [id, item] of refreshes) if (item.expires < now) refreshes.delete(id)
  const pending = refreshes.get(key)
  if (pending) return pending.result
  if (refreshes.size >= 1000) throw new AccountError('Account service is busy. Please try again.')
  const result = (async () => {
    const response = await upstream(env, fetcher, '/token?grant_type=refresh_token', 'POST', { refresh_token: refreshToken })
    if ([400, 401, 403].includes(response.status)) { await response.body?.cancel(); return null }
    if (!response.ok) { await response.body?.cancel(); throw new AccountError('Account service is temporarily unavailable.') }
    return validateSession(await responseJson(response))
  })()
  // A slow pending exchange must remain shared until it settles. Starting the
  // reuse window before completion could rotate the same refresh token twice.
  const entry = { expires: Infinity, result }
  refreshes.set(key, entry)
  try { return await result }
  catch (error) { refreshes.delete(key); throw error }
  finally { if (refreshes.get(key) === entry) entry.expires = Date.now() + 15_000 }
}
function checkOrigin(request: Request) {
  const origin = new URL(request.url).origin, supplied = request.headers.get('Origin')
  if ((request.method !== 'GET' && supplied !== origin) || (supplied && supplied !== origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    throw new AccountError('Same-origin account request required.', 403)
}
function emailOf(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AccountError('Enter a valid email address.', 400)
  return value.trim()
}
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
type OAuthFlow = { state: string; verifier: string; next: string; created: number }
type OAuthFailure = 'config_unavailable' | 'flow_missing_or_expired' | 'state_mismatch' | 'invalid_callback' | 'provider_denied' | 'rate_limited' | 'exchange_failed' | 'service_unavailable' | 'identity_failed'
function googleReady(request: Request, env: AccountEnv) {
  return env.SUPABASE_GOOGLE_REDIRECT_READY === 'true' && accountsConfigured(env) && !!(env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER) && new URL(request.url).protocol === 'https:'
}
function readOAuthFlow(request: Request): OAuthFlow | null {
  const value = cookieValue(request, OAUTH_COOKIE)
  if (!value || !/^[A-Za-z0-9_-]{1,3000}$/.test(value)) return null
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
    const flow = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<OAuthFlow>
    if (typeof flow.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(flow.state) || typeof flow.verifier !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(flow.verifier) || typeof flow.next !== 'string' || flow.next !== safeAccountDestination(flow.next) || !Number.isSafeInteger(flow.created) || Date.now() < Number(flow.created) || Date.now() - Number(flow.created) > OAUTH_FLOW_SECONDS * 1000) return null
    return flow as OAuthFlow
  } catch { return null }
}
async function googleStart(request: Request, env: AccountEnv, input: Record<string, unknown>) {
  if (!googleReady(request, env)) throw new AccountError('Google sign-in is awaiting approval of the WORLDIFACT callback in the shared account service.')
  if (Object.keys(input).some(key => key !== 'next') || (input.next !== undefined && typeof input.next !== 'string')) throw new AccountError('Invalid Google sign-in request.', 400)
  const flow: OAuthFlow = { state: base64url(crypto.getRandomValues(new Uint8Array(32))), verifier: base64url(crypto.getRandomValues(new Uint8Array(48))), next: safeAccountDestination(input.next), created: Date.now() }
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier))))
  const callback = new URL('/api/account/oauth/callback', request.url)
  callback.searchParams.set('state', flow.state)
  const authorization = new URL(config(env).base + '/auth/v1/authorize')
  authorization.searchParams.set('provider', 'google')
  authorization.searchParams.set('redirect_to', callback.href)
  authorization.searchParams.set('code_challenge', challenge)
  authorization.searchParams.set('code_challenge_method', 's256')
  // Supabase owns its separate Google OAuth state. Our random callback state
  // binds the same-origin initiation to an HttpOnly cookie and PKCE verifier.
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(flow)))
  return json({ url: authorization.href }, 200, [cookie(OAUTH_COOKIE, encoded, OAUTH_FLOW_SECONDS)])
}
function googleRedirect(request: Request, result: 'success' | 'error', next: string, cookies: string[] = [], reason?: OAuthFailure) {
  const destination = new URL('/login', request.url)
  destination.searchParams.set('oauth', result)
  destination.searchParams.set('next', safeAccountDestination(next))
  // Only fixed diagnostic categories may reach the browser, never provider
  // descriptions, callback values, tokens or the underlying exception.
  if (result === 'error' && reason) destination.searchParams.set('reason', reason)
  // An explicit empty fragment prevents inheriting provider error/token
  // fragments when a browser follows this redirect.
  const headers = new Headers({ Location: destination.href + '#', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' })
  for (const value of cookies) headers.append('Set-Cookie', value)
  return new Response(null, { status: 303, headers })
}
async function googleCallback(request: Request, env: AccountEnv, fetcher: typeof fetch) {
  const flow = readOAuthFlow(request), url = new URL(request.url), states = url.searchParams.getAll('state'), codes = url.searchParams.getAll('code')
  const matches = !!flow && states.length === 1 && states[0] === flow.state
  if (!googleReady(request, env)) return googleRedirect(request, 'error', '/world', [], 'config_unavailable')
  if (!flow) return googleRedirect(request, 'error', '/world', [], 'flow_missing_or_expired')
  if (!matches) return googleRedirect(request, 'error', '/world', [], 'state_mismatch')
  if (url.search.length > 2048) return googleRedirect(request, 'error', '/world', [], 'invalid_callback')
  const failed = (reason: OAuthFailure) => googleRedirect(request, 'error', flow.next, [cookie(OAUTH_COOKIE, '', 0)], reason)
  let stage: OAuthFailure = 'service_unavailable'
  try {
    await limit(request, env, 'oauth-callback')
    if (url.searchParams.has('error') || url.searchParams.has('error_code')) return failed('provider_denied')
    if (codes.length !== 1 || !/^[A-Za-z0-9_-]{12,512}$/.test(codes[0])) return failed('invalid_callback')
    stage = 'exchange_failed'
    const response = await upstream(env, fetcher, '/token?grant_type=pkce', 'POST', { auth_code: codes[0], code_verifier: flow.verifier })
    if (!response.ok) {
      await response.body?.cancel()
      return failed(response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'service_unavailable' : 'exchange_failed')
    }
    const session = validateSession(await responseJson(response))
    // Verify the returned token with the shared provider before installing the
    // session. Never trust identity supplied through query or browser storage.
    stage = 'identity_failed'
    const user = await verifiedUser(env, fetcher, session.access_token)
    if (!user || user.id !== session.user.id) return failed('identity_failed')
    return googleRedirect(request, 'success', flow.next, [cookie(OAUTH_COOKIE, '', 0), ...sessionCookies({ ...session, user })])
  } catch (error) {
    // Leave any prior signed-in session intact; erase only this matched flow.
    // Provider error descriptions, codes and tokens never enter the page URL.
    return failed(error instanceof AccountError && error.status === 429 ? 'rate_limited' : error instanceof AccountError && error.status === 503 ? 'service_unavailable' : stage)
  }
}
async function recoveryCallback(request: Request, env: AccountEnv, fetcher: typeof fetch) {
  const verifier = cookieValue(request, PKCE_COOKIE), url = new URL(request.url), code = url.searchParams.get('code')
  if (env.SUPABASE_RECOVERY_REDIRECT_READY !== 'true' || !verifier || !code || !/^[A-Za-z0-9_-]{12,512}$/.test(code))
    throw new AccountError('This password recovery link is missing, expired or was opened in a different browser.', 400)
  await limit(request, env, 'recovery-callback')
  const response = await upstream(env, fetcher, '/token?grant_type=pkce', 'POST', { auth_code: code, code_verifier: verifier })
  if (!response.ok) { await response.body?.cancel(); throw new AccountError('This password recovery link is invalid or expired.', 400) }
  const session = validateSession(await responseJson(response))
  const headers = new Headers({ Location: url.origin + '/account/reset', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
  headers.append('Set-Cookie', cookie(PKCE_COOKIE, '', 0))
  headers.append('Set-Cookie', cookie(RECOVERY_COOKIE, session.access_token, Math.min(300, session.expires_in)))
  return new Response(null, { status: 303, headers })
}
export async function accountApi(request: Request, env: AccountEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const { pathname, origin } = new URL(request.url)
  if (!pathname.startsWith('/api/account/')) return null
  const action = pathname.slice('/api/account/'.length)
  if (!['config', 'session', 'login', 'register', 'recover', 'logout', 'password', 'recovery/callback', 'oauth/google', 'oauth/callback'].includes(action)) return json({ error: 'Account route not found.' }, 404)
  try {
    // This external top-level navigation is bound to an HttpOnly PKCE verifier;
    // all other account endpoints remain strictly same-origin.
    if (action === 'recovery/callback') {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
      return await recoveryCallback(request, env, fetcher)
    }
    if (action === 'oauth/callback') {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
      return await googleCallback(request, env, fetcher)
    }
    checkOrigin(request)
    const expectedMethod = ['config', 'session'].includes(action) ? 'GET' : 'POST'
    if (request.method !== expectedMethod) return json({ error: `Use ${expectedMethod}.` }, 405)
    if (action === 'config') {
      const ready = googleReady(request, env)
      return json({ configured: accountsConfigured(env), provider: 'Cube Chess account', methods: ready ? ['email', 'google'] : ['email'], sharedAccount: true, recoveryReady: env.SUPABASE_RECOVERY_REDIRECT_READY === 'true', googleReady: ready, googleReason: ready ? null : 'Google sign-in is awaiting confirmation of the WORLDIFACT callback in the shared account service.' })
    }
    if (action === 'session') {
      if (!accountsConfigured(env)) return json({ configured: false, user: null })
      const access = cookieValue(request, ACCESS_COOKIE), renewal = cookieValue(request, REFRESH_COOKIE)
      if (!access && !renewal) return json({ configured: true, user: null })
      await limit(request, env, 'session')
      const user = access ? await verifiedUser(env, fetcher, access) : null
      if (user) return json({ configured: true, user })
      const session = renewal ? await refresh(env, fetcher, renewal) : null
      // Do not clear cookies on a refresh failure: another request may already
      // have installed a newer session. Explicit logout is the clearing path.
      return json({ configured: true, user: session?.user ?? null }, 200, session ? sessionCookies(session) : [])
    }
    if (action === 'logout') {
      await limit(request, env, 'logout')
      const token = cookieValue(request, ACCESS_COOKIE)
      if (token) {
        const response = await upstream(env, fetcher, '/logout?scope=local', 'POST', undefined, token)
        const ok = response.ok || [401, 403].includes(response.status)
        await response.body?.cancel()
        if (!ok) return json({ error: 'Could not revoke the session. Please retry sign out.' }, 503)
      }
      return json({ user: null }, 200, clearCookies())
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
    await limit(request, env, action)
    const input = await boundedJson(request, MAX_BODY)
    if (action === 'oauth/google') return await googleStart(request, env, input)
    if (action === 'password') {
      if (Object.keys(input).length !== 1 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128)
        throw new AccountError('Use a password between 12 and 128 characters.', 400)
      const token = cookieValue(request, RECOVERY_COOKIE)
      if (!token || !await verifiedUser(env, fetcher, token)) throw new AccountError('Open a valid password recovery link before choosing a new password.', 401)
      const response = await upstream(env, fetcher, '/user', 'PUT', { password: input.password }, token)
      const accepted = response.ok; await response.body?.cancel()
      if (!accepted) throw new AccountError('The password could not be changed. Request a new link or choose a different password.', 400)
      let otherSessionsRevoked = false
      try { const revoked = await upstream(env, fetcher, '/logout?scope=global', 'POST', undefined, token); otherSessionsRevoked = revoked.ok; await revoked.body?.cancel() } catch { /* Password change succeeded; do not invite a repeated reset. */ }
      return json({ passwordChanged: true, signInRequired: true, otherSessionsRevoked }, 200, clearCookies())
    }
    const fields = action === 'register' ? ['email', 'password', 'displayName', 'acceptTerms'] : action === 'recover' ? ['email'] : ['email', 'password']
    if (Object.keys(input).some(key => !fields.includes(key))) throw new AccountError('Unsupported account field.', 400)
    const email = emailOf(input.email)
    await limit(request, env, action, email)
    if (action === 'recover') {
      if (env.SUPABASE_RECOVERY_REDIRECT_READY !== 'true') throw new AccountError('Password recovery is awaiting configuration of the shared account email callback.')
      // Never accept an arbitrary redirect target supplied by the browser.
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
      const callback = encodeURIComponent(origin + '/api/account/recovery/callback')
      const response = await upstream(env, fetcher, '/recover?redirect_to=' + callback, 'POST', { email, code_challenge: challenge, code_challenge_method: 's256' })
      const limited = response.status === 429, unavailable = response.status >= 500
      await response.body?.cancel()
      if (limited) throw new AccountError('Too many account requests. Please try again later.', 429)
      if (unavailable) throw new AccountError('Account service is temporarily unavailable.')
      return json({ accepted: true, message: 'If the account exists, password recovery instructions will be sent. Open the link in this browser.' }, 202, [cookie(PKCE_COOKIE, verifier, 600)])
    }
    if (typeof input.password !== 'string' || input.password.length < (action === 'register' ? 12 : 1) || input.password.length > 128)
      throw new AccountError(action === 'register' ? 'Use a password between 12 and 128 characters.' : 'Enter your email and password.', 400)
    if (action === 'register') {
      if (typeof input.displayName !== 'string' || input.displayName.trim().length < 2 || input.displayName.trim().length > 50 || input.acceptTerms !== true)
        throw new AccountError('Enter a name of 2–50 characters and accept the terms and privacy notice.', 400)
      const response = await upstream(env, fetcher, '/signup', 'POST', { email, password: input.password, data: { display_name: input.displayName.trim(), accepted_terms: true } })
      const limited = response.status === 429, unavailable = response.status >= 500
      // Account existence is deliberately not revealed. Never echo provider
      // errors, sessions or user metadata from the registration endpoint.
      await response.body?.cancel()
      if (limited) throw new AccountError('Too many account requests. Please try again later.', 429)
      if (unavailable) throw new AccountError('Account service is temporarily unavailable.')
      return json({ confirmationRequired: true, message: 'Check your email to confirm registration, or sign in if you already have an account.' }, 202)
    }
    const response = await upstream(env, fetcher, '/token?grant_type=password', 'POST', { email, password: input.password })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429) throw new AccountError('Too many account requests. Please try again later.', 429)
      if (response.status >= 500) throw new AccountError('Account service is temporarily unavailable.')
      throw new AccountError('Email or password is incorrect, or email confirmation is still required.', 401)
    }
    const session = validateSession(await responseJson(response))
    return json({ configured: true, user: session.user }, 200, sessionCookies(session))
  } catch (error) {
    return json({ error: error instanceof AccountError ? error.message : 'Could not complete the account request.' }, error instanceof AccountError ? error.status : 503)
  }
}
