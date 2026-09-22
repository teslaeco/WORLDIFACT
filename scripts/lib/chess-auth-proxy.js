// Copied only into the pinned, same-origin Chess foundation during its build.
// WORLDIFACT's server owns the HttpOnly Supabase session. No token is read by JS.
export function authBackendConfigured() { return true }
async function account(path, payload) {
  const response = await fetch(`/api/account/${path}`, {
    method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'The shared account service is unavailable.')
  return body
}
function identity(user) {
  return user ? { mode: 'account', provider: 'worldifact', playerId: user.id, displayName: user.displayName, email: user.email, avatarUrl: '' } : null
}
export class AuthApi {
  constructor() { this.sessionCheck = null }
  register(payload) { return account('register', { email: payload.email, password: payload.password, displayName: payload.displayName, acceptTerms: payload.acceptTerms === true }) }
  forgotPassword(payload) { return account('recover', { email: payload.email }) }
  async login(payload) {
    const result = await account('login', { email: payload.email, password: payload.password })
    const user = identity(result.user)
    if (!user) throw new Error('The shared account service did not return a player.')
    return user
  }
  redirectToProvider() {
    // The shared page offers email and, when configured, server-side Google
    // PKCE. Never forward a caller-supplied provider URL or return address.
    window.location.assign('/login?next=/world')
  }
  // AuthGate calls this before restoring a previous guest identity. Checking the
  // cookie here lets a newly signed-in WORLDIFACT player replace that guest.
  // The URL is deliberately never inspected for tokens.
  restoreSessionFromUrl() { return this.restoreStoredSession() }
  async restoreStoredSession() {
    this.sessionCheck ??= account('session')
    const result = await this.sessionCheck
    return identity(result.user)
  }
  async signOut() {
    await account('logout', {})
    this.sessionCheck = null
    localStorage.removeItem('cubeChessSupabaseSession')
  }
}
