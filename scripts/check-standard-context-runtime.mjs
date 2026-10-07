/** One authenticated GET; publishes only fixed context-readiness evidence. */
import { pathToFileURL } from 'node:url'

const REVISIONS = new Set(['worldifact-standard-context-v1', 'worldifact-standard-context-v2'])
export function contextEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONTEXT_HEALTH_UNAVAILABLE')
  const revision = REVISIONS.has(value.worldifactStandardContextPolicy) ? value.worldifactStandardContextPolicy : 'UNKNOWN'
  const maintenance = typeof value.worldifactStandardMaintenance === 'boolean' ? value.worldifactStandardMaintenance : null
  const ready = value.ready === true && value.codexReady === true && value.provider === 'openai' && value.model === 'gpt-6-astra'
    && Number.isSafeInteger(value.connectorVersion) && value.connectorVersion >= 33 && value.connectorVersion <= 10000
  return { readOnly: true, revision, maintenance, ready,
    upgradeVerified: ready && revision === 'worldifact-standard-context-v2' && maintenance === false }
}

function originOf(value) {
  try {
    const url = new URL(value || '')
    if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)
        || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

export async function readContextRuntime(env, fetcher = fetch) {
  const origin = originOf(env.ORACLE_ENDPOINT), token = env.ORACLE_API_TOKEN
  if (!origin || typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token))
    throw new Error('CONTEXT_CONFIGURATION_UNAVAILABLE')
  let response
  try {
    response = await fetcher(origin + '/v1/health', { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')
        || Number(response.headers.get('content-length') || 0) > 16_384) throw new Error()
    const reader = response.body?.getReader()
    if (!reader) throw new Error()
    let size = 0, text = ''; const decoder = new TextDecoder()
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16_384) throw new Error()
        text += decoder.decode(part.value, { stream: true })
      }
      return contextEvidence(JSON.parse(text + decoder.decode()))
    } finally { await reader.cancel().catch(() => {}) }
  } catch {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {})
    throw new Error('CONTEXT_HEALTH_UNAVAILABLE')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await readContextRuntime(process.env)
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2))
    if (!result.upgradeVerified) process.exitCode = 1
  } catch {
    console.error(JSON.stringify({ readOnly: true, upgradeVerified: false, status: 'CONTEXT_HEALTH_UNAVAILABLE' }))
    process.exitCode = 1
  }
}
