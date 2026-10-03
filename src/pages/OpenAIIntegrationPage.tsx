import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

function readOpenAIStatus(value: unknown): PublicStatus {
  if (!object(value) || value.jsonrpc !== '2.0' || value.id !== 'connection-status' || !object(value.result) || value.result.isError || !object(value.result.structuredContent)) throw new Error('The connection service returned an unexpected response.')
  const status = value.result.structuredContent
  if (status.mcp !== 'RESPONDING' || status.generationStarted !== false) throw new Error('The public connection check could not be verified.')
  return { oauthConfigured: typeof status.oauthConfigured === 'boolean' ? status.oauthConfigured : null, scopes: scopesOf(status.oauthScopes) }
}

function validConnectionMetadata(value: unknown, endpoint: string, scopes: string[]): boolean {
  if (!object(value) || value.resource !== endpoint || !Array.isArray(value.authorization_servers) || !value.authorization_servers.length || !scopes.length) return false
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
  const [state, setState] = useState<ConnectionState>(initialState)
  const [attempt, setAttempt] = useState(0)
  const [copyMessage, setCopyMessage] = useState('')
  const endpoint = typeof window === 'undefined' ? '' : new URL('/mcp', window.location.origin).href
  const canCopy = !state.checking && state.transport && state.status?.oauthConfigured === true && state.metadataVerified && endpoint.startsWith('https://')

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
    </section>
    <section className="openai-integration-panel">
      <h2>Permissions and privacy</h2>
      {state.status?.scopes.length ? <p>Advertised identity scopes: {state.status.scopes.map(scope => <code key={scope}>{scope} </code>)}</p> : <p>Identity scopes have not been verified.</p>}
      <p>Identity scopes identify the WORLDIFACT account; they are not separate permissions for each world or model action. Connected tools remain subject to account ownership and existing access rules. Review the permissions in the actual authorization prompt.</p>
      <p>This check sends no account credentials and does not read private worlds or models. It creates no model, starts no paid generation and changes no points or subscription. A later generation request can use your allowance or points and requires your explicit confirmation.</p>
      <Link to="/privacy">Read privacy and data information</Link>
    </section>
  </main>
}
