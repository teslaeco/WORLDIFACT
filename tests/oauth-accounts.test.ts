import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountApi, CHESS_AUTH_URL, type AccountEnv } from '../server/accounts.ts'

const ORIGIN = 'https://worldifact.test'
const USER = '8dba1ce2-2345-4678-a123-123456789abc'
const ACCESS = 'google-access-fixture-only'
const RENEWAL = 'google-refresh-fixture-only'
const CODE = '34e770dd-9ff9-416c-87fa-43b31d7ef225'
const user = { id: USER, email: 'chess-player@example.test', user_metadata: { display_name: 'Chess player', private: 'never output' } }
type Flow = { state: string; verifier: string; next: string; created: number }
function fixture() {
  const calls: { url: string; method: string; headers: Headers; body?: Record<string, unknown> }[] = []
  const buckets: string[] = []
  let blocked = false, fail = '', used = false
  const env: AccountEnv = { SUPABASE_GOOGLE_REDIRECT_READY: 'true', ACCOUNT_LIMITER: { async limit({ key }) { buckets.push(key); return { success: !blocked } } } }
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input), headers = new Headers(init?.headers), method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ url, method, headers, body })
    assert.equal(new URL(url).origin, CHESS_AUTH_URL); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal)
    if (env.SUPABASE_ANON_KEY) assert.equal(headers.get('apikey'), env.SUPABASE_ANON_KEY)
    else assert.ok(headers.get('apikey')?.startsWith('sb_publishable_'))
    if (fail === 'network') throw new Error('private Google error stack')
    if (url.endsWith('/token?grant_type=pkce')) {
      assert.equal(headers.get('Authorization'), env.SUPABASE_ANON_KEY ? `Bearer ${env.SUPABASE_ANON_KEY}` : null)
      if (fail === 'exchange' || used) return Response.json({ error_description: 'private provider secret' }, { status: 400 })
      if (fail === 'exchange-unavailable') return Response.json({ error_description: 'private service error' }, { status: 503 })
      if (fail === 'exchange-limited') return Response.json({ error_description: 'private limit detail' }, { status: 429 })
      if (fail === 'invalid-response') return new Response('private non-JSON response', { status: 200 })
      used = true
      return Response.json({ access_token: ACCESS, refresh_token: RENEWAL, expires_in: fail === 'invalid-session' ? 'private invalid expiry' : 3600, provider_token: 'google-api-token-must-be-discarded', user })
    }
    if (url.endsWith('/user')) {
      assert.equal(headers.get('Authorization'), `Bearer ${ACCESS}`)
      if (fail === 'identity-network') throw new Error('private network error')
      if (fail === 'identity-unavailable') return Response.json({ error_description: 'private verification error' }, { status: 503 })
      if (fail === 'user') return Response.json({ error_description: 'private profile' }, { status: 401 })
      return Response.json({ ...user, ...(fail === 'mismatch' ? { id: '8dba1ce2-2345-4678-a123-123456789abd' } : {}) })
    }
    throw new Error('Unexpected provider operation')
  }) as typeof fetch
  const request = (action: string, method = 'GET', body?: unknown, cookie?: string, extra: Record<string, string> = {}) => new Request(`${ORIGIN}/api/account/${action}`, {
    method, headers: { 'Content-Type': 'application/json', ...(method === 'POST' ? { Origin: ORIGIN } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const call = async (action: string, method = 'GET', body?: unknown, cookie?: string, extra: Record<string, string> = {}) => (await accountApi(request(action, method, body, cookie, extra), env, fetcher))!
  async function start(next?: string) {
    const response = await call('oauth/google', 'POST', next ? { next } : {})
    assert.equal(response.status, 200)
    const data = await response.json() as { url: string }
    const authorization = new URL(data.url), redirect = new URL(authorization.searchParams.get('redirect_to')!)
    const rawCookie = response.headers.getSetCookie()[0], cookie = rawCookie.split(';')[0]
    const flow = JSON.parse(Buffer.from(cookie.split('=')[1], 'base64url').toString()) as Flow
    return { response, data, authorization, redirect, rawCookie, cookie, flow }
  }
  function callback(state: string, cookie: string, code = CODE, extraQuery = '') {
    return call(`oauth/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}${extraQuery}`, 'GET', undefined, cookie, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://accounts.google.com' })
  }
  return { env, calls, buckets, call, start, callback, block: () => { blocked = true }, fail: (value: string) => { fail = value } }
}
function destination(response: Response) { assert.equal(response.status, 303); return new URL(response.headers.get('Location')!) }
function flowCookie(flow: Flow) { return '__Host-worldifact-google-flow=' + Buffer.from(JSON.stringify(flow)).toString('base64url') }

test('Google readiness requires verified callback configuration and account protection, using the existing Chess provider', async () => {
  const f = fixture(); delete f.env.SUPABASE_GOOGLE_REDIRECT_READY
  let config = await (await f.call('config')).json() as { methods: string[]; googleReady: boolean }
  assert.equal(config.googleReady, false); assert.deepEqual(config.methods, ['email'])
  assert.equal((await f.call('oauth/google', 'POST', {})).status, 503)
  f.env.SUPABASE_GOOGLE_REDIRECT_READY = 'true'
  config = await (await f.call('config')).json() as typeof config
  assert.equal(config.googleReady, true); assert.deepEqual(config.methods, ['email', 'google'])
  delete f.env.ACCOUNT_LIMITER
  assert.equal((await f.call('oauth/google', 'POST', {})).status, 503)
  assert.equal(f.calls.length, 0)
})
test('Google initiation requires exact same-origin POST, validates input and is rate limited', async () => {
  const f = fixture()
  assert.equal((await f.call('oauth/google')).status, 405)
  assert.equal((await f.call('oauth/google', 'POST', {}, undefined, { Origin: 'https://attacker.test' })).status, 403)
  assert.equal((await f.call('oauth/google', 'POST', {}, undefined, { Origin: '' })).status, 403)
  assert.equal((await f.call('oauth/google', 'POST', {}, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await f.call('oauth/google', 'POST', { provider: 'github' })).status, 400)
  assert.equal((await f.call('oauth/google', 'POST', { next: { url: 'https://attacker.test' } })).status, 400)
  f.block()
  assert.equal((await f.call('oauth/google', 'POST', {})).status, 429)
  assert.equal(f.calls.length, 0)
})
test('Google uses independent random PKCE and callback state with a secure HttpOnly cookie, no tokens or verifier in JSON', async () => {
  const f = fixture(), first = await f.start(), second = await f.start()
  assert.equal(first.authorization.origin, CHESS_AUTH_URL); assert.equal(first.authorization.pathname, '/auth/v1/authorize')
  assert.equal(first.authorization.searchParams.get('provider'), 'google')
  assert.equal(first.authorization.searchParams.get('code_challenge_method'), 's256')
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.flow.verifier))).toString('base64url')
  assert.equal(first.authorization.searchParams.get('code_challenge'), challenge)
  assert.equal(first.redirect.origin, ORIGIN); assert.equal(first.redirect.pathname, '/api/account/oauth/callback')
  assert.equal(first.redirect.searchParams.get('state'), first.flow.state)
  assert.equal(first.flow.next, '/world'); assert.notEqual(first.flow.verifier, second.flow.verifier); assert.notEqual(first.flow.state, second.flow.state)
  assert.match(first.rawCookie, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
  assert.doesNotMatch(first.rawCookie, /Domain=/)
  assert.equal(JSON.stringify(first.data).includes(first.flow.verifier), false)
  assert.doesNotMatch(JSON.stringify(first.data), /access_token|refresh_token|provider_token|apikey/)
  assert.equal(f.calls.length, 0)
})
test('Google callback exchanges server-side, re-verifies the shared user and issues only HttpOnly session cookies', async () => {
  const f = fixture(), started = await f.start()
  const response = await f.callback(started.flow.state, started.cookie), target = destination(response)
  assert.equal(target.origin, ORIGIN); assert.equal(target.pathname, '/login'); assert.equal(target.searchParams.get('oauth'), 'success'); assert.equal(target.searchParams.get('next'), '/world')
  assert.equal(target.searchParams.has('reason'), false)
  assert.match(response.headers.get('Location')!, /#$/)
  assert.doesNotMatch(response.headers.get('Location')!, /access-token|refresh-token|code=|state=|verifier|google-api-token/)
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(await response.text(), '')
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].method, 'POST'); assert.match(f.calls[0].url, /grant_type=pkce$/)
  assert.deepEqual(f.calls[0].body, { auth_code: CODE, code_verifier: started.flow.verifier }); assert.match(f.calls[1].url, /\/user$/)
  const cookies = response.headers.getSetCookie()
  assert.equal(cookies.length, 3); assert.match(cookies[0], /Max-Age=0$/)
  assert.ok(cookies.some(value => value.startsWith('__Host-worldifact-access=' + ACCESS)))
  assert.ok(cookies.some(value => value.startsWith('__Host-worldifact-refresh=' + RENEWAL)))
  for (const value of cookies) { assert.match(value, /HttpOnly; Secure; SameSite=Lax/); assert.doesNotMatch(value, /google-api-token|private|email/) }
  assert.ok(f.buckets.some(bucket => bucket.startsWith('account:oauth-callback:')))
})
test('Publishable keys stay in apikey while real user tokens and legacy anon JWTs retain Bearer authentication', async () => {
  for (const legacy of [false, true]) {
    const f = fixture()
    if (legacy) f.env.SUPABASE_ANON_KEY = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from('{"role":"anon"}').toString('base64url'), 'fixture-signature'].join('.')
    const started = await f.start(), response = await f.callback(started.flow.state, started.cookie)
    assert.equal(destination(response).searchParams.get('oauth'), 'success')
    const [exchange, verification] = f.calls
    assert.equal(exchange.headers.get('Authorization'), legacy ? 'Bearer ' + f.env.SUPABASE_ANON_KEY : null)
    assert.ok(exchange.headers.get('apikey'))
    assert.equal(verification.headers.get('apikey'), exchange.headers.get('apikey'))
    assert.equal(verification.headers.get('Authorization'), 'Bearer ' + ACCESS)
  }
})
test('OAuth preserves only safe payment return details and cannot create an external redirect', async () => {
  for (const next of ['https://attacker.test', '//attacker.test', '/\\attacker.test', '/world?redirect=https://attacker.test', '/login', '/api/account/logout']) {
    const f = fixture(), start = await f.start(next), response = await f.callback(start.flow.state, start.cookie)
    assert.equal(destination(response).searchParams.get('next'), '/world')
  }
  const f = fixture(), start = await f.start('/account/credits?paypal=return&token=25M43554V9523650M&redirect=https://attacker.test')
  const response = await f.callback(start.flow.state, start.cookie, CODE, '&next=https://attacker.test')
  assert.equal(destination(response).searchParams.get('next'), '/account/credits?paypal=return&token=25M43554V9523650M')
})
test('Wrong, missing, duplicated or cross-tab state never exchanges a code or clears the valid pending flow', async () => {
  const f = fixture(), first = await f.start(), second = await f.start()
  const responses = [
    await f.callback('A'.repeat(43), first.cookie),
    await f.callback(first.flow.state, ''),
    await f.callback(first.flow.state, first.cookie + '; ' + first.cookie),
    await f.callback(first.flow.state, first.cookie, CODE, '&state=' + first.flow.state),
    await f.callback(first.flow.state, second.cookie),
    await f.call('oauth/callback?code=' + CODE, 'GET', undefined, first.cookie),
  ]
  for (const response of responses) { assert.equal(destination(response).searchParams.get('oauth'), 'error'); assert.equal(response.headers.getSetCookie().length, 0) }
  assert.deepEqual(responses.map(response => destination(response).searchParams.get('reason')), ['state_mismatch', 'flow_missing_or_expired', 'flow_missing_or_expired', 'state_mismatch', 'state_mismatch', 'state_mismatch'])
  assert.equal(f.calls.length, 0)
})
test('Expired, malformed and future OAuth state cookies fail closed before provider exchange', async () => {
  const f = fixture(), started = await f.start()
  for (const cookie of [
    flowCookie({ ...started.flow, created: Date.now() - 601_000 }),
    flowCookie({ ...started.flow, created: Date.now() + 60_000 }),
    flowCookie({ ...started.flow, next: '//attacker.test' }),
    '__Host-worldifact-google-flow=invalid-cookie-base64',
  ]) assert.equal(destination(await f.callback(started.flow.state, cookie)).searchParams.get('reason'), 'flow_missing_or_expired')
  assert.equal(f.calls.length, 0)
})
test('Provider cancellation and duplicate or malformed codes are sanitized and clear only the matching OAuth flow', async () => {
  for (const query of ['&error=access_denied&error_description=private-secret', '&code=another-code-123', '&error_code=private-secret']) {
    const f = fixture(), started = await f.start(), response = await f.callback(started.flow.state, started.cookie, CODE, query)
    assert.equal(destination(response).searchParams.get('oauth'), 'error'); assert.doesNotMatch(response.headers.get('Location')!, /private-secret|access_denied/)
    assert.equal(destination(response).searchParams.get('reason'), query.startsWith('&code=') ? 'invalid_callback' : 'provider_denied')
    assert.equal(response.headers.getSetCookie().length, 1); assert.match(response.headers.getSetCookie()[0], /^__Host-worldifact-google-flow=.*Max-Age=0$/)
    assert.equal(f.calls.length, 0)
  }
  const f = fixture(), started = await f.start()
  assert.equal(destination(await f.callback(started.flow.state, started.cookie, 'bad')).searchParams.get('reason'), 'invalid_callback')
  assert.equal(f.calls.length, 0)
})
test('Failed code exchange, rejected tokens and mismatched provider user cannot install a session', async () => {
  for (const [failure, reason] of [
    ['network', 'service_unavailable'], ['exchange', 'exchange_failed'], ['exchange-unavailable', 'service_unavailable'],
    ['exchange-limited', 'rate_limited'], ['invalid-response', 'exchange_failed'], ['invalid-session', 'exchange_failed'],
    ['user', 'identity_failed'], ['mismatch', 'identity_failed'], ['identity-network', 'service_unavailable'], ['identity-unavailable', 'service_unavailable'],
  ]) {
    const f = fixture(), started = await f.start(); f.fail(failure)
    const response = await f.callback(started.flow.state, started.cookie)
    assert.equal(destination(response).searchParams.get('oauth'), 'error')
    assert.equal(destination(response).searchParams.get('reason'), reason)
    assert.doesNotMatch(response.headers.get('Location')!, /private|provider|stack|secret/)
    for (const secret of [started.flow.state, started.flow.verifier, ACCESS, RENEWAL, CODE]) assert.equal(response.headers.get('Location')!.includes(secret), false)
    assert.equal(response.headers.getSetCookie().length, 1)
    assert.equal(response.headers.getSetCookie().some(value => value.startsWith('__Host-worldifact-access=')), false)
  }
})
test('OAuth callback is rate limited and a consumed Supabase code cannot create another session', async () => {
  const blocked = fixture(), started = await blocked.start(); blocked.block()
  assert.equal(destination(await blocked.callback(started.flow.state, started.cookie)).searchParams.get('reason'), 'rate_limited')
  assert.equal(blocked.calls.length, 0)
  const f = fixture(), flow = await f.start()
  assert.equal(destination(await f.callback(flow.flow.state, flow.cookie)).searchParams.get('oauth'), 'success')
  const repeated = await f.callback(flow.flow.state, flow.cookie)
  assert.equal(destination(repeated).searchParams.get('oauth'), 'error'); assert.equal(repeated.headers.getSetCookie().length, 1)
  assert.equal(destination(repeated).searchParams.get('reason'), 'exchange_failed')
})
test('Configuration, limiter outages and oversized callbacks report fixed reasons without exposing input or clearing other sessions', async () => {
  const missing = fixture(), pending = await missing.start()
  delete missing.env.SUPABASE_GOOGLE_REDIRECT_READY
  const unavailable = await missing.callback(pending.flow.state, pending.cookie)
  assert.equal(destination(unavailable).searchParams.get('reason'), 'config_unavailable')
  assert.equal(unavailable.headers.getSetCookie().length, 0); assert.equal(missing.calls.length, 0)

  const oversized = fixture(), flow = await oversized.start()
  const invalid = await oversized.callback(flow.flow.state, flow.cookie, CODE, '&unexpected=' + 'X'.repeat(2048))
  assert.equal(destination(invalid).searchParams.get('reason'), 'invalid_callback')
  assert.equal(invalid.headers.getSetCookie().length, 0); assert.equal(oversized.calls.length, 0)

  const outage = fixture(), current = await outage.start('/account/credits?billing=processing')
  outage.env.ACCOUNT_LIMITER = { async limit() { throw new Error('private limiter service failure') } }
  const response = await outage.callback(current.flow.state, current.cookie + '; __Host-worldifact-access=' + ACCESS + '; __Host-worldifact-refresh=' + RENEWAL, CODE, '&reason=attacker-controlled-secret')
  const target = destination(response)
  assert.equal(target.searchParams.get('reason'), 'service_unavailable')
  assert.equal(target.searchParams.get('next'), '/account/credits?billing=processing')
  assert.deepEqual([...target.searchParams.keys()].sort(), ['next', 'oauth', 'reason'])
  assert.doesNotMatch(response.headers.get('Location')!, /private|attacker|secret|code=|state=/)
  assert.deepEqual(response.headers.getSetCookie(), ['__Host-worldifact-google-flow=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
  assert.equal(outage.calls.length, 0)
})
test('Logout clears the pending Google flow so its callback cannot silently restore a session', async () => {
  const f = fixture(), started = await f.start()
  const response = await f.call('logout', 'POST', {}, started.cookie)
  assert.equal(response.status, 200)
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith('__Host-worldifact-google-flow=') && value.endsWith('Max-Age=0')))
  assert.equal(destination(await f.callback(started.flow.state, '')).searchParams.get('oauth'), 'error')
  assert.equal(f.calls.length, 0)
})
