/** Authenticated GET-only production health check. No AI, payment or file mutation. */
import { pathToFileURL } from 'node:url'

const invalid = () => new Error('ASTRA_RUNTIME_NOT_VERIFIED')
export function publicGuardEvidence(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isFinite(now)) throw invalid()
  if (value.ready !== true || value.codexReady !== true || value.provider !== 'openai' || value.model !== 'gpt-6-astra'
      || !Number.isSafeInteger(value.connectorVersion) || value.connectorVersion < 33 || value.connectorVersion > 10000
      || value.astraBudgetRevision !== 'astra-usd175-v1' || value.astraBudgetMaxUsd !== 1.75
      || value.astraBudgetPreflight !== 'input-tokens' || !Number.isSafeInteger(value.astraBudgetExpiry)
      || value.astraBudgetExpiry * 1000 <= now || value.astraBudgetExpiry !== 1793145600) throw invalid()
  // Never print an arbitrary upstream object: it may include provider credentials or private job data.
  return { runtime: 'VERIFIED', provider: 'openai', model: 'gpt-6-astra', connectorVersion: value.connectorVersion,
    revision: 'astra-usd175-v1', maxProviderUsdPerJob: 1.75, preflight: 'input-tokens',
    priceReviewExpiresAt: new Date(value.astraBudgetExpiry * 1000).toISOString(),
    paidGenerationRequested: false, liveQualityTest: 'NOT_RUN', commercialActivation: 'STILL_BLOCKED' }
}

function configuredOrigin(value) {
  try {
    const url = new URL(value || '')
    if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)
        || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

export async function checkAstraRuntime(env, fetcher = fetch, now = Date.now()) {
  const origin = configuredOrigin(env.ORACLE_ENDPOINT), token = env.ORACLE_API_TOKEN
  if (!origin || typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token))
    throw new Error('ASTRA_RUNTIME_CONFIGURATION_MISSING')
  let response
  try {
    response = await fetcher(origin + '/v1/health', { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')
        || Number(response.headers.get('content-length') || 0) > 16384) throw invalid()
    const reader = response.body?.getReader()
    if (!reader) throw invalid()
    let length = 0, text = ''
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const result = await reader.read()
        if (result.done) break
        length += result.value.byteLength
        if (length > 16384) throw invalid()
        text += decoder.decode(result.value, { stream: true })
      }
      return publicGuardEvidence(JSON.parse(text + decoder.decode()), now)
    } finally { await reader.cancel().catch(() => {}) }
  } catch {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {})
    throw new Error('ASTRA_RUNTIME_NOT_VERIFIED')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...await checkAstraRuntime(process.env) }, null, 2)) }
  catch (error) {
    const code = error?.message === 'ASTRA_RUNTIME_CONFIGURATION_MISSING' ? error.message : 'ASTRA_RUNTIME_NOT_VERIFIED'
    console.error(JSON.stringify({ runtime: code, paidGenerationRequested: false, commercialActivation: 'STILL_BLOCKED' }))
    process.exitCode = 1
  }
}
