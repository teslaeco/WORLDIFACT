import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { accountRequest, useAccount } from '../lib/account'
import './OAuthConsentPage.css'

type ConsentDetails = {
  authorizationId: string
  client: { id: string; name: string; uri?: string }
  redirectUri: string
  scope: string
}
type ConsentResponse = ConsentDetails | { redirectUrl: string }
type ConsentFlow = ReturnType<typeof createConsentFlow>

function createConsentFlow(identity: string, authorizationId: string) {
  let active = false
  return { identity, authorizationId, isActive: () => active, activate: () => { active = true }, deactivate: () => { active = false } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function OAuthConsentPage() {
  const account = useAccount(), navigate = useNavigate(), [params] = useSearchParams()
  const authorizationId = params.get('authorization_id') || ''
  const identity = account.loading ? 'loading' : account.user?.id || 'signed-out'
  const flow = useMemo(() => createConsentFlow(identity, authorizationId), [identity, authorizationId])
  const decision = useRef<{ flow: ConsentFlow } | null>(null)
  const [loaded, setLoaded] = useState<{ flow: ConsentFlow; details: ConsentDetails } | null>(null)
  const [failure, setFailure] = useState<{ flow: ConsentFlow; message: string } | null>(null)
  const [workingFlow, setWorkingFlow] = useState<ConsentFlow | null>(null)
  const details = loaded?.flow === flow ? loaded.details : null
  const error = !UUID.test(authorizationId) ? 'This OAuth authorization request is invalid.' : failure?.flow === flow ? failure.message : ''
  const busy = workingFlow === flow
  const returnPath = useMemo(() => UUID.test(authorizationId) ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}` : '/world', [authorizationId])

  // Invalidate old actions at commit, before passive loading effects run.
  useLayoutEffect(() => { flow.activate(); return () => { flow.deactivate() } }, [flow])

  useEffect(() => {
    if (!account.loading && !account.user) navigate('/login?next=' + encodeURIComponent(returnPath), { replace: true })
  }, [account.loading, account.user, navigate, returnPath])

  useEffect(() => {
    if (identity === 'loading' || identity === 'signed-out' || !UUID.test(authorizationId)) return
    let alive = true
    void accountRequest('/api/account/oauth/authorization?authorization_id=' + encodeURIComponent(authorizationId))
      .then((value: ConsentResponse) => {
        if (!alive || !flow.isActive()) return
        if ('redirectUrl' in value) { window.location.assign(value.redirectUrl); return }
        if (value.authorizationId !== authorizationId) throw new Error('This OAuth authorization response does not match your request.')
        setLoaded({ flow, details: value }); setFailure(null)
      })
      .catch(error => { if (alive && flow.isActive()) setFailure({ flow, message: error instanceof Error ? error.message : 'This connection could not be verified.' }) })
    return () => { alive = false }
  }, [identity, authorizationId, flow])

  async function decide(action: 'approve' | 'deny') {
    if (!details || busy || !flow.isActive() || decision.current?.flow === flow) return
    const operation = { flow }
    decision.current = operation
    setWorkingFlow(flow); setFailure(null)
    try {
      const value = await accountRequest('/api/account/oauth/authorization', { authorizationId: details.authorizationId, action }) as { redirectUrl?: string }
      if (!flow.isActive() || decision.current !== operation) return
      if (!value.redirectUrl) throw new Error('The authorization server did not return a redirect.')
      window.location.assign(value.redirectUrl)
    } catch (error) {
      if (flow.isActive() && decision.current === operation) {
        setFailure({ flow, message: error instanceof Error ? error.message : 'The connection could not be completed.' })
        setWorkingFlow(null)
        decision.current = null
      }
    }
  }

  const scopes = details?.scope.split(/\s+/).filter(Boolean) ?? []
  return <main className="oauth-consent">
    <section className="oauth-consent-card" aria-labelledby="oauth-consent-title">
      <Link className="oauth-consent-brand" to="/world">WORLDIFACT</Link>
      <p className="oauth-consent-kicker">OPENAI · MCP CONNECTION</p>
      <h1 id="oauth-consent-title">Connect WORLDIFACT</h1>
      <p className="oauth-consent-copy">Authorize this OpenAI connection to act only as your signed-in WORLDIFACT account. Model generation still uses the existing points, receipts, cost guard and no-auto-retry rules.</p>
      {account.loading && <p className="oauth-consent-status">Checking your WORLDIFACT session…</p>}
      {!account.loading && account.user && <p className="oauth-consent-user">Signed in as <strong>{account.user.displayName}</strong>{account.user.email ? <> · {account.user.email}</> : null}</p>}
      {!account.loading && account.user && !details && !error && <p className="oauth-consent-status">Loading this account’s connection request…</p>}
      {details && <>
        <div className="oauth-consent-client">
          <span>Requesting client</span><strong>{details.client.name || 'OpenAI'}</strong>
          <small>{details.redirectUri}</small>
        </div>
        <div className="oauth-consent-permissions">
          <strong>Permissions requested</strong>
          <ul>{scopes.map(scope => <li key={scope}>{scope === 'email' ? 'Read the account email used to identify this WORLDIFACT profile.' : scope === 'profile' ? 'Read the account display profile used to identify this WORLDIFACT profile.' : scope}</li>)}</ul>
          <p>WORLDIFACT tools can separately read your own worlds and, after a write-tool confirmation, save a world or start one guarded 3D generation. They cannot access another account.</p>
        </div>
        <div className="oauth-consent-actions">
          <button className="oauth-consent-approve" disabled={busy} onClick={() => void decide('approve')}>{busy ? 'Working…' : 'Approve connection'}</button>
          <button className="oauth-consent-deny" disabled={busy} onClick={() => void decide('deny')}>Deny</button>
        </div>
      </>}
      {error && <p className="oauth-consent-error" role="alert">{error}</p>}
      <p className="oauth-consent-foot">Only OpenAI ChatGPT connector callback URLs are accepted by this page. You can revoke the OAuth grant later in your account provider.</p>
    </section>
  </main>
}
