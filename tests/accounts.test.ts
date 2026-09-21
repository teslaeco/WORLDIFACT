import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountApi, accountsConfigured, getVerifiedAccount, type AccountEnv } from '../server/accounts.ts'
const origin = 'https://worldifact.test'
const id = '8dba1ce2-2345-4678-a123-123456789abc'
const rawUser = { id, email: 'player@example.test', user_metadata: { display_name: 'Explorer', private: 'do not echo' }, private_metadata: 'never expose' }
const access = 'access-token-fixture-value'
const renewal = 'refresh-token-fixture-value'
const accessCookie = `__Host-worldifact-access=${access}`
function fixture() {
  const calls: { url: string; init?: RequestInit }[] = [], buckets: string[] = []
  let failure = '', blocked = false, userExpired = false, refreshCalls = 0
  const env: AccountEnv = { GENERATION_LIMITER: { async limit({ key }) { buckets.push(key); return { success: !blocked } } } }
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    assert.equal(init?.redirect, 'error')
    assert.equal(new URL(String(url)).origin, 'https://oiezgikconcyjvdeshdh.supabase.co')
    assert.ok(new Headers(init?.headers).get('apikey')?.startsWith('sb_publishable_'))
    if (failure === 'network') throw new Error('private upstream stack')
    if (failure === 'credential') return Response.json({ error: 'secret account details' }, { status: 400 })
    if (failure === 'rate') return Response.json({ error: 'private details' }, { status: 429 })
    if (String(url).includes('/logout') || String(url).includes('/recover') || String(url).endsWith('/signup')) return Response.json({ success: true })
    if (String(url).includes('grant_type=refresh_token')) {
      refreshCalls++
      await Promise.resolve()
    }
    if (String(url).endsWith('/user')) {
      if (userExpired && init?.method === 'GET') return Response.json({}, { status: 401 })
      return Response.json(rawUser)
    }
    return Response.json({ access_token: access, refresh_token: renewal, expires_in: 3600, user: rawUser })
  }) as typeof fetch
  const request = (path: string, method = 'GET', body?: unknown, cookies = '', extra: Record<string, string> = {}) => new Request(origin + '/api/account/' + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...(cookies ? { Cookie: cookies } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const call = async (path: string, method = 'GET', body?: unknown, cookies = '', extra: Record<string, string> = {}) => (await accountApi(request(path, method, body, cookies, extra), env, fetcher))!
  return { env, calls, buckets, fetcher, call, request, fail: (value: string) => { failure = value }, block: () => { blocked = true }, expire: () => { userExpired = true }, refreshCalls: () => refreshCalls }
}
test('shared Chess email login sets only secure HttpOnly cookies and returns a minimal verified profile', async () => {
  const f = fixture(), response = await f.call('login', 'POST', { email: rawUser.email, password: 'existing-password' })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data, { configured: true, user: { id, email: rawUser.email, displayName: 'Explorer' } })
  assert.doesNotMatch(JSON.stringify(data), /access.token|refresh.token|private/)
  const cookies = response.headers.getSetCookie()
  assert.equal(cookies.length, 2)
  for (const cookie of cookies) { assert.match(cookie, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=/); assert.doesNotMatch(cookie, /Domain=/) }
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(f.calls.length, 1)
  assert.match(f.calls[0].url, /grant_type=password$/)
  assert.equal(f.buckets.some(key => key.includes(rawUser.email)), false)
})
test('account identity is checked against Supabase and never accepted from browser fields or fake cookies', async () => {
  const f = fixture()
  assert.equal(await getVerifiedAccount(f.request('session'), f.env, f.fetcher), null)
  assert.equal(await getVerifiedAccount(f.request('session', 'GET', undefined, '__Host-worldifact-access=bad'), f.env, f.fetcher), null)
  assert.equal(await getVerifiedAccount(f.request('session', 'GET', undefined, accessCookie + '; ' + accessCookie), f.env, f.fetcher), null)
  assert.equal(f.calls.length, 0)
  const verified = await getVerifiedAccount(f.request('session', 'GET', undefined, accessCookie), f.env, f.fetcher)
  assert.equal(verified?.id, id)
  assert.equal(new Headers(f.calls[0].init?.headers).get('Authorization'), 'Bearer ' + access)
  f.expire()
  assert.equal(await getVerifiedAccount(f.request('session', 'GET', undefined, accessCookie), f.env, f.fetcher), null)
})
test('cross-origin and missing-Origin account writes are rejected before any provider call', async () => {
  const f = fixture(), body = { email: rawUser.email, password: 'test-password' }
  assert.equal((await f.call('login', 'POST', body, '', { Origin: 'https://attacker.test' })).status, 403)
  assert.equal((await f.call('login', 'POST', body, '', { Origin: '' })).status, 403)
  assert.equal((await f.call('session', 'GET', undefined, accessCookie, { Origin: 'https://attacker.test' })).status, 403)
  assert.equal((await f.call('session', 'GET', undefined, accessCookie, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal(f.calls.length, 0)
})
test('registration shares the existing provider and validates consent, password strength and field boundaries', async () => {
  const f = fixture(), body = { email: rawUser.email, password: 'test-password-12', displayName: 'Explorer', acceptTerms: true }
  for (const invalid of [{ ...body, acceptTerms: false }, { ...body, password: 'short' }, { ...body, displayName: 'x' }, { ...body, admin: true }, { ...body, email: 'not-email' }])
    assert.equal((await f.call('register', 'POST', invalid)).status, 400)
  assert.equal(f.calls.length, 0)
  const response = await f.call('register', 'POST', body)
  assert.equal(response.status, 202); assert.equal(response.headers.getSetCookie().length, 0)
  const sent = JSON.parse(String(f.calls[0].init?.body))
  assert.deepEqual(sent.data, { display_name: 'Explorer', accepted_terms: true })
  f.fail('credential')
  const existing = await f.call('register', 'POST', body)
  assert.equal(existing.status, 202); assert.deepEqual(await existing.json(), await response.json())
})
test('oversized chunked bodies, unsupported media and malformed JSON are rejected before upstream', async () => {
  const f = fixture()
  assert.equal((await f.call('login', 'POST', { email: rawUser.email, password: 'x'.repeat(10_000) })).status, 413)
  assert.equal((await f.call('login', 'POST', {}, '', { 'Content-Type': 'text/plain' })).status, 415)
  const response = await accountApi(new Request(origin + '/api/account/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' }), f.env, f.fetcher)
  assert.equal(response?.status, 400); assert.equal(f.calls.length, 0)
})
test('account rate limiting fails closed and provider failures never expose private messages', async () => {
  const f = fixture(), body = { email: rawUser.email, password: 'test-password' }
  for (const [failure, status] of [['credential', 401], ['network', 503], ['rate', 429]] as const) {
    f.fail(failure); const response = await f.call('login', 'POST', body)
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private|secret account/)
  }
  const blocked = fixture(); blocked.block()
  assert.equal((await blocked.call('login', 'POST', body)).status, 429); assert.equal(blocked.calls.length, 0)
  const absent = fixture(); delete absent.env.GENERATION_LIMITER
  assert.equal((await absent.call('login', 'POST', body)).status, 503); assert.equal(absent.calls.length, 0)
})
test('concurrent refreshes coalesce and never clear cookies on invalid or stale sessions', async () => {
  const f = fixture(); f.expire()
  const refreshCookie = '__Host-worldifact-refresh=refresh-' + crypto.randomUUID()
  const responses = await Promise.all(Array.from({ length: 5 }, () => f.call('session', 'GET', undefined, accessCookie + '; ' + refreshCookie)))
  assert.equal(f.refreshCalls(), 1)
  for (const response of responses) { assert.equal(response.status, 200); assert.equal(response.headers.getSetCookie().length, 2); assert.equal((await response.json() as { user: { id: string } }).user.id, id) }
  f.fail('credential')
  const rejected = await f.call('session', 'GET', undefined, '__Host-worldifact-refresh=invalid-' + crypto.randomUUID())
  assert.deepEqual(await rejected.json(), { configured: true, user: null }); assert.equal(rejected.headers.getSetCookie().length, 0)
})
test('anonymous session is no-cost and logout revokes the current session without exposing tokens', async () => {
  const f = fixture()
  assert.deepEqual(await (await f.call('session')).json(), { configured: true, user: null }); assert.equal(f.calls.length, 0)
  const out = await f.call('logout', 'POST', {}, accessCookie)
  assert.equal(out.status, 200); assert.match(f.calls[0].url, /logout\?scope=local$/)
  for (const cookie of out.headers.getSetCookie()) assert.match(cookie, /Max-Age=0$/)
})
test('configuration rejects privileged keys and untrusted provider targets', async () => {
  assert.equal(accountsConfigured({}), true)
  for (const url of ['http://oiezgikconcyjvdeshdh.supabase.co', 'https://evil.test', 'https://name.supabase.co@evil.test', 'https://name.supabase.co/path']) assert.equal(accountsConfigured({ SUPABASE_URL: url }), false)
  const privileged = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature'
  assert.equal(accountsConfigured({ SUPABASE_ANON_KEY: privileged }), false)
  assert.equal(accountsConfigured({ SUPABASE_ANON_KEY: '' }), false)
})
test('recovery cannot send emails until the exact shared callback is configured', async () => {
  const f = fixture()
  const blocked = await f.call('recover', 'POST', { email: rawUser.email })
  assert.equal(blocked.status, 503); assert.equal(f.calls.length, 0)
  f.env.SUPABASE_RECOVERY_REDIRECT_READY = 'true'
  const sent = await f.call('recover', 'POST', { email: rawUser.email })
  assert.equal(sent.status, 202)
  const url = new URL(f.calls[0].url)
  assert.equal(url.searchParams.get('redirect_to'), origin + '/api/account/recovery/callback')
  const body = JSON.parse(String(f.calls[0].init?.body))
  assert.equal(body.code_challenge_method, 's256'); assert.equal(body.code_challenge.length, 43)
  const verifier = sent.headers.getSetCookie()[0].split(';')[0]
  assert.match(verifier, /^__Host-worldifact-recovery-verifier=/)
  assert.equal(body.code_verifier, undefined)
  const callback = await f.call('recovery/callback?code=one-time-code-12345678', 'GET', undefined, verifier, { Origin: 'https://oiezgikconcyjvdeshdh.supabase.co', 'Sec-Fetch-Site': 'cross-site' })
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('Location'), origin + '/account/reset')
  assert.match(callback.headers.getSetCookie().join(';'), /__Host-worldifact-recovery=access-token/)
  assert.doesNotMatch(callback.headers.get('Location')!, /token|code|verifier/)
})
test('new password requires the recovery cookie and a verified user, then revokes sessions', async () => {
  const f = fixture(), input = { password: 'new-password-long' }
  assert.equal((await f.call('password', 'POST', input, accessCookie)).status, 401)
  const response = await f.call('password', 'POST', input, '__Host-worldifact-recovery=' + access)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { passwordChanged: true, signInRequired: true, otherSessionsRevoked: true })
  assert.equal(f.calls.filter(call => call.init?.method === 'PUT').length, 1)
  assert.match(f.calls.at(-1)!.url, /logout\?scope=global$/)
  for (const cookie of response.headers.getSetCookie()) assert.match(cookie, /Max-Age=0$/)
})
