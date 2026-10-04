import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import './OpenAIIntegrationPage.css'

type PublicStatus = { oauthConfigured: boolean | null; scopes: string[] }
type ConnectionState = {
  checking: boolean
  transport: boolean
  status: PublicStatus | null
  metadataVerified: boolean
  checkedAt: string | null
  error: string
}
const initialState: ConnectionState = { checking: true, transport: false, status: null, metadataVerified: false, checkedAt: null, error: '' }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const scopesOf = (value: unknown): string[] => Array.isArray(value) && value.length <= 20 && value.every(scope => typeof scope === 'string' && /^[a-z][a-z0-9:_-]{0,63}$/.test(scope)) ? [...new Set(value)] : []
const permissionLabels: Record<string, string> = {
  'profile:read': 'Read your account profile',
  'worlds:read': 'Read your own worlds',
  'worlds:write': 'Create and update your own worlds',
  'models:read': 'Read your model library and generation status',
  'models:generate': 'Start a 3D generation with your confirmation',
}
type Grant = { id: string; clientId: string; scopes: string[]; active: boolean; createdAt: number; expiresAt: number }
type AccountConnection = { configured: boolean; authorized: boolean; grants: Grant[]; reconnectAfterSeconds: number; refreshSupported: false }
type AccountFlow = ReturnType<typeof accountFlow>
function accountFlow(identity: string, attempt: number) {
  let active = false
  return { identity, attempt, isActive: () => active, activate: () => { active = true }, deactivate: () => { active = false } }
}
function readAccountConnection(value: unknown): AccountConnection {
  if (!object(value) || typeof value.configured !== 'boolean' || typeof value.authorized !== 'boolean' || !Array.isArray(value.grants) || value.grants.length > 100 || value.refreshSupported !== false || !Number.isSafeInteger(value.reconnectAfterSeconds) || Number(value.reconnectAfterSeconds) <= 0 || Number(value.reconnectAfterSeconds) > 3600) throw new Error('Account connection unavailable')
  const grants = value.grants.map(grant => {
    if (!object(grant) || (grant.active !== undefined && typeof grant.active !== 'boolean') || typeof grant.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(grant.id) || typeof grant.clientId !== 'string' || grant.clientId.length > 200 || !Array.isArray(grant.scopes) || scopesOf(grant.scopes).length !== grant.scopes.length || grant.scopes.some(scope => !Object.hasOwn(permissionLabels, scope)) || !Number.isSafeInteger(grant.createdAt) || !Number.isSafeInteger(grant.expiresAt) || Number(grant.createdAt) <= 0 || Number(grant.expiresAt) <= Number(grant.createdAt) || Number(grant.expiresAt) - Number(grant.createdAt) > Number(value.reconnectAfterSeconds) || Number(grant.expiresAt) > 4102444800) throw new Error('Account connection unavailable')
    return { id: grant.id, clientId: grant.clientId, scopes: scopesOf(grant.scopes), active: grant.active !== false, createdAt: Number(grant.createdAt), expiresAt: Number(grant.expiresAt) }
  })
  if (new Set(grants.map(grant => grant.id)).size !== grants.length) throw new Error('Account connection unavailable')
  return { configured: value.configured, authorized: value.authorized, grants, reconnectAfterSeconds: Number(value.reconnectAfterSeconds), refreshSupported: false }
}

function readOpenAIStatus(value: unknown): PublicStatus {
  if (!object(value) || value.jsonrpc !== '2.0' || value.id !== 'connection-status' || !object(value.result) || value.result.isError || !object(value.result.structuredContent)) throw new Error('The connection service returned an unexpected response.')
  const status = value.result.structuredContent
  if (status.mcp !== 'RESPONDING' || status.generationStarted !== false) throw new Error('The public connection check could not be verified.')
  return { oauthConfigured: typeof status.oauthConfigured === 'boolean' ? status.oauthConfigured : null, scopes: scopesOf(status.oauthScopes) }
}

function validConnectionMetadata(value: unknown, endpoint: string, scopes: string[]): boolean {
  if (!object(value) || value.resource !== endpoint || !Array.isArray(value.authorization_servers) || !value.authorization_servers.length || !scopes.length) return false
  if (Object.keys(permissionLabels).some(scope => !scopes.includes(scope)) || scopes.some(scope => !Object.hasOwn(permissionLabels, scope))) return false
  const advertised = scopesOf(value.scopes_supported)
  return scopes.every(scope => advertised.includes(scope)) && value.authorization_servers.every(issuer => {
    try {
      const url = new URL(String(issuer))
      return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
    } catch { return false }
  })
}

async function readPublicJson(response: Response): Promise<unknown> {
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('The connection service is currently unavailable.')
  if (Number(response.headers.get('content-length') || 0) > 65536) throw new Error('The connection service returned an unexpected response.')
  const text = await response.text()
  if (text.length > 65536) throw new Error('The connection service returned an unexpected response.')
  return JSON.parse(text) as unknown
}

export default function OpenAIIntegrationPage() {
  const account = useAccount()
  const [state, setState] = useState<ConnectionState>(initialState)
  const [attempt, setAttempt] = useState(0)
  const [copyMessage, setCopyMessage] = useState('')
  const endpoint = typeof window === 'undefined' ? '' : new URL('/mcp', window.location.origin).href
  const canCopy = !state.checking && state.transport && state.status?.oauthConfigured === true && state.metadataVerified && endpoint.startsWith('https://')
  const identity = account.loading ? 'loading' : account.user?.id || 'signed-out'
  const [accountAttempt, setAccountAttempt] = useState(0)
  const flow = useMemo(() => accountFlow(identity, accountAttempt), [identity, accountAttempt])
  const [privateState, setPrivateState] = useState<{ flow: AccountFlow; data: AccountConnection | null; error: string; message: string } | null>(null)
  const privateView = privateState?.flow === flow ? privateState : null
  const revocation = useRef<{ flow: AccountFlow; id: string } | null>(null)
  const [revoking, setRevoking] = useState<{ flow: AccountFlow; id: string } | null>(null)
  const [now, setNow] = useState(Date.now)
  const accountBusy = revoking?.flow === flow

  useLayoutEffect(() => { flow.activate(); return () => { flow.deactivate() } }, [flow])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (identity === 'loading' || identity === 'signed-out') return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    void fetch('/api/mcp/connection', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(readPublicJson).then(readAccountConnection)
      .then(data => { if (flow.isActive()) setPrivateState({ flow, data, error: '', message: '' }) })
      .catch(() => { if (flow.isActive()) setPrivateState({ flow, data: null, error: 'Your authorizations could not be checked. Sign in again if your WORLDIFACT session has expired, then refresh this list.', message: '' }) })
      .finally(() => clearTimeout(timeout))
    return () => { clearTimeout(timeout); controller.abort() }
  }, [identity, flow])

  async function revokeGrant(id: string) {
    if (!flow.isActive() || !privateView?.data?.grants.some(grant => grant.id === id) || accountBusy || revocation.current?.flow === flow) return
    const operation = { flow, id }
    revocation.current = operation
    setRevoking(operation)
    try {
      const response = await fetch('/api/mcp/connection', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ grantId: id }),
      })
      const result = await readPublicJson(response)
      if (!object(result) || result.revoked !== true) throw new Error('Revocation unavailable')
      if (!flow.isActive() || revocation.current !== operation) return
      setPrivateState(previous => {
        if (previous?.flow !== flow || !previous.data) return previous
        const grants = previous.data.grants.filter(grant => grant.id !== id)
        return { flow, data: { ...previous.data, grants, authorized: grants.some(grant => grant.active && grant.expiresAt * 1000 > Date.now()) }, error: '', message: 'Authorization revoked. Reconnect from your OpenAI app if you want to use WORLDIFACT there again.' }
      })
    } catch {
      if (flow.isActive() && revocation.current === operation) setPrivateState(previous => previous?.flow === flow ? { ...previous, error: 'Revocation could not be confirmed. Refresh the list before trying again.', message: '' } : previous)
    } finally {
      if (revocation.current === operation) revocation.current = null
      if (flow.isActive()) setRevoking(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    let mounted = true
    void (async () => {
      let status: PublicStatus | null = null
      try {
        status = readOpenAIStatus(await readPublicJson(await fetch('/mcp', {
          method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'connection-status', method: 'tools/call', params: { name: 'get_worldifact_status', arguments: {} } }),
        })))
        let metadataVerified = false
        if (status.oauthConfigured) {
          const metadata = await readPublicJson(await fetch('/.well-known/oauth-protected-resource/mcp', {
            credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' },
          }))
          metadataVerified = validConnectionMetadata(metadata, endpoint, status.scopes)
        }
        if (mounted) setState({ checking: false, transport: true, status, metadataVerified, checkedAt: new Date().toISOString(), error: status.oauthConfigured && !metadataVerified ? 'The account-connection metadata could not be verified.' : '' })
      } catch {
        if (mounted) setState({ checking: false, transport: !!status, status, metadataVerified: false, checkedAt: new Date().toISOString(), error: status ? 'The service responded, but the account-connection metadata is unavailable. Try checking again later.' : 'The connection service could not be verified. Try checking again later.' })
      } finally { clearTimeout(timeout) }
    })()
    return () => { mounted = false; clearTimeout(timeout); controller.abort() }
  }, [attempt, endpoint])

  async function copyEndpoint() {
    if (!canCopy) return
    try { await navigator.clipboard.writeText(endpoint); setCopyMessage('Endpoint copied.') }
    catch { setCopyMessage('Copy is unavailable in this browser. Select the verified endpoint below to copy it.') }
  }

  return <main className="openai-integration">
    <Link className="openai-integration-back" to="/world">← Back to WORLDIFACT</Link>
    <p className="openai-integration-kicker">WORLDIFACT CONNECTIONS</p>
    <h1>Connect WORLDIFACT to ChatGPT / Codex / dots</h1>
    <p className="openai-integration-lead">Use WORLDIFACT as a tool provider through an OpenAI Plugin or MCP connection. You continue working in the OpenAI app; a dot is not embedded in this website.</p>
    <section className="openai-integration-status" aria-label="Connection readiness" aria-busy={state.checking}>
      <article><h2>Service</h2><strong>{state.checking ? 'Checking…' : state.transport ? 'Responding' : 'Not verified'}</strong><p>A public, read-only request checks whether the WORLDIFACT tool service responds.</p></article>
      <article><h2>Account authorization</h2><strong>{state.checking ? 'Checking…' : state.status?.oauthConfigured === true ? 'Configured · connection unverified' : state.status?.oauthConfigured === false ? 'Not configured' : 'Not verified'}</strong><p>{state.status?.oauthConfigured === false ? 'The service owner must finish OAuth configuration before private account tools can be connected.' : 'Configuration alone does not prove that OpenAI can connect to your account.'}</p></article>
      <article><h2>OpenAI connection</h2><strong>Not tested here</strong><p>A successful sign-in and private read-only tool call in ChatGPT, Codex or dots is still required.</p></article>
    </section>
    <div className="openai-integration-check"><button type="button" disabled={state.checking} onClick={() => { setState(initialState); setCopyMessage(''); setAttempt(value => value + 1) }}>{state.checking ? 'Checking…' : 'Check again'}</button>{state.checkedAt && <small>Checked {new Date(state.checkedAt).toLocaleString()}</small>}</div>
    {state.error && <p className="openai-integration-message" role="alert">{state.error}</p>}
    <section className="openai-integration-panel">
      <h2>Connection address</h2>
      {canCopy ? <><p>The service response and published account-connection settings were checked. Add this endpoint using your OpenAI app’s supported connection settings, then complete its sign-in flow.</p><code className="openai-integration-endpoint">{endpoint}</code><button type="button" onClick={() => void copyEndpoint()}>Copy MCP endpoint</button></> : <p>The connection address becomes available after the service responds over HTTPS and its OAuth settings and public metadata are verified.</p>}
      {copyMessage && <p role="status">{copyMessage}</p>}
      <p>Access depends on the connection features available to your OpenAI account. This page does not confirm a completed connection.</p>
      <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">Open ChatGPT plugins ↗</a>
    </section>
    <section className="openai-integration-panel" aria-label="Your authorizations">
      <h2>Your authorizations</h2>
      {account.loading ? <p>Checking your WORLDIFACT account…</p> : !account.user ? <p><Link to="/login?next=%2Fintegrations%2Fopenai">Sign in to WORLDIFACT</Link> to view and revoke your authorizations.</p> : <>
        <p>Signed in as <strong>{account.user.displayName}</strong>. An authorization listed here means access was approved. It does not prove a tool was successfully used in ChatGPT, Codex or dots.</p>
        {!privateView && <p role="status">Loading authorizations…</p>}
        {privateView?.data && <>
          {!privateView.data.grants.length && <p>No authorizations are recorded for this account. Add WORLDIFACT from your OpenAI app and approve its connection request.</p>}
          <ul className="openai-integration-grants">{privateView.data.grants.map(grant => <li key={grant.id}>
            <strong>{grant.expiresAt * 1000 <= now ? 'Expired · reconnect in OpenAI' : !grant.active ? 'Inactive permissions · reconnect in OpenAI' : 'Authorization recorded'}</strong>
            <p>Approved {new Date(grant.createdAt * 1000).toLocaleString()}<br />Session expires {new Date(grant.expiresAt * 1000).toLocaleString()}.</p>
            <ul>{grant.scopes.map(scope => <li key={scope}>{permissionLabels[scope]}</li>)}</ul>
            <button type="button" disabled={accountBusy} onClick={() => void revokeGrant(grant.id)}>{accountBusy && revoking.id === grant.id ? 'Revoking…' : 'Revoke authorization'}</button>
          </li>)}</ul>
          <p>Connections last at most {Math.ceil(privateView.data.reconnectAfterSeconds / 60)} minutes and may expire sooner with your source sign-in session. Automatic refresh is unavailable. When a connection expires, sign in to WORLDIFACT and reconnect from the OpenAI app.</p>
        </>}
        {privateView?.error && <p className="openai-integration-message" role="alert">{privateView.error}</p>}
        {privateView?.message && <p role="status">{privateView.message}</p>}
        <button type="button" disabled={!privateView || accountBusy} onClick={() => setAccountAttempt(value => value + 1)}>Refresh authorizations</button>
      </>}
    </section>
    <section className="openai-integration-panel">
      <h2>Permissions and privacy</h2>
      {state.status?.scopes.length ? <ul>{state.status.scopes.map(scope => <li key={scope}>{Object.hasOwn(permissionLabels, scope) ? permissionLabels[scope] : scope} <code>({scope})</code></li>)}</ul> : <p>Available permissions have not been verified.</p>}
      <p>Each tool requires its matching permission and remains limited to your own account. Review the requested permissions before approving a connection. Authorization does not start a generation.</p>
      <p>The public service check sends no account credentials. Your authorization list uses your signed-in WORLDIFACT session; no private worlds or model files are read. This page starts no paid generation and changes no points or subscription. A later generation request can use your allowance or points and requires your explicit confirmation.</p>
      <Link to="/privacy">Read privacy and data information</Link>
    </section>
  </main>
}
