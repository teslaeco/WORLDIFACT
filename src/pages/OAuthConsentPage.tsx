import { useEffect, useMemo, useState } from 'react'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function OAuthConsentPage() {
  const account = useAccount(), navigate = useNavigate(), [params] = useSearchParams()
  const authorizationId = params.get('authorization_id') || ''
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const returnPath = useMemo(() => UUID.test(authorizationId) ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}` : '/world', [authorizationId])

  useEffect(() => {
    if (!account.loading && !account.user) navigate('/login?next=' + encodeURIComponent(returnPath), { replace: true })
  }, [account.loading, account.user, navigate, returnPath])

  useEffect(() => {
    if (account.loading || !account.user) return
    if (!UUID.test(authorizationId)) { setError('This OAuth authorization request is invalid.'); return }
    let alive = true
    void accountRequest('/api/account/oauth/authorization?authorization_id=' + encodeURIComponent(authorizationId))
      .then((value: ConsentResponse) => {
        if (!alive) return
        if ('redirectUrl' in value) { window.location.assign(value.redirectUrl); return }
        setDetails(value); setError('')
      })
      .catch(error => { if (alive) setError(error instanceof Error ? error.message : 'This connection could not be verified.') })
    return () => { alive = false }
  }, [account.loading, account.user, authorizationId])

  async function decide(action: 'approve' | 'deny') {
    if (!details || busy) return
    setBusy(true); setError('')
    try {
      const value = await accountRequest('/api/account/oauth/authorization', { authorizationId: details.authorizationId, action }) as { redirectUrl?: string }
      if (!value.redirectUrl) throw new Error('The authorization server did not return a redirect.')
      window.location.assign(value.redirectUrl)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The connection could not be completed.')
      setBusy(false)
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
