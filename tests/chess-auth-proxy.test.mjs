import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthApi } from '../scripts/lib/chess-auth-proxy.js'
test('copied Chess restores the verified shared account before a remembered guest without reading tokens', async () => {
  const originalFetch = globalThis.fetch, calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return Response.json({ configured: true, user: { id: 'existing-cube-user', email: 'player@example.test', displayName: 'Explorer' } })
  }
  try {
    const api = new AuthApi(), identity = await api.restoreSessionFromUrl()
    assert.deepEqual(identity, { mode: 'account', provider: 'worldifact', playerId: 'existing-cube-user', email: 'player@example.test', displayName: 'Explorer', avatarUrl: '' })
    assert.deepEqual(await api.restoreStoredSession(), identity)
    assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/account/session')
    assert.equal(calls[0].options.credentials, 'same-origin')
    assert.equal(calls[0].options.headers.Authorization, undefined)
  } finally { globalThis.fetch = originalFetch }
})
test('Chess email registration uses the shared account contract and server errors remain visible', async () => {
  const originalFetch = globalThis.fetch, calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return path.endsWith('login') ? Response.json({ error: 'Confirm your email first.' }, { status: 401 }) : Response.json({ confirmationRequired: true }, { status: 202 })
  }
  try {
    const api = new AuthApi()
    assert.deepEqual(await api.register({ email: 'player@example.test', password: 'password-long', displayName: 'Explorer', acceptTerms: true }), { confirmationRequired: true })
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'player@example.test', password: 'password-long', displayName: 'Explorer', acceptTerms: true })
    await assert.rejects(api.login({ email: 'player@example.test', password: 'password-long' }), /Confirm your email first/)
    assert.equal(calls.every(call => call.path.startsWith('/api/account/')), true)
  } finally { globalThis.fetch = originalFetch }
})
test('Chess provider buttons use the shared login page and cannot forward an external return URL', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), destinations = []
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign(destination) { destinations.push(destination) } } } })
  try {
    const api = new AuthApi()
    api.redirectToProvider('google', 'https://attacker.test/return')
    api.redirectToProvider('https://attacker.test', '//attacker.test')
    assert.deepEqual(destinations, ['/login?next=/world', '/login?next=/world'])
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})
