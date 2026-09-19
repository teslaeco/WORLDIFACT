import { pathToFileURL } from 'node:url'
import { REFERENCE_LINKS } from '../src/config/references.ts'

/** Public, credential-free HTTP probes, never generation or browser proof. */
export async function inspectExternalGenerator(fetcher = fetch) {
  const url = REFERENCE_LINKS.modelGenerator
  const result = { url, generation: 'NOT_TESTED', browserEmbedding: 'UNKNOWN' }
  try {
    let response = await fetcher(url, { method: 'HEAD', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15_000) })
    if ([405, 501].includes(response.status)) {
      await response.body?.cancel()
      response = await fetcher(url, { method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15_000) })
    }
    const status = response.status
    const xfo = (response.headers.get('x-frame-options') || '').trim().toLowerCase()
    const csp = response.headers.get('content-security-policy') || ''
    const frameAncestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1] || ''
    const headerBlocksFrame = xfo === 'deny' || xfo === 'sameorigin' || frameAncestors.trim() === "'none'"
    await response.body?.cancel()
    return { ...result, status,
      http: response.ok ? 'REACHABLE_NOT_GENERATION_PROOF' : [401, 403].includes(status) ? 'ACCESS_RESTRICTED' : status >= 300 && status < 400 ? 'REDIRECT_NOT_FOLLOWED' : 'UNAVAILABLE',
      browserEmbedding: headerBlocksFrame ? 'BLOCKED_BY_RESPONSE_POLICY' : 'UNKNOWN', frameAncestorsPresent: Boolean(frameAncestors) }
  } catch { return { ...result, http: 'UNKNOWN_NETWORK_UNAVAILABLE' } }
}
export async function inspectWorldifactServices(fetcher = fetch) {
  const results = []
  for (const path of ['/api/health', '/api/platform/oracle-worlds', '/api/studio/status']) {
    try {
      const r = await fetcher('https://worldifact.xodobrox.workers.dev' + path, { method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(40_000) })
      const record = { path, http: r.status, generation: 'NOT_REQUESTED' }
      if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) { await r.body?.cancel(); results.push(record); continue }
      const reader = r.body?.getReader(); let text = '', bytes = 0
      if (reader) for (;;) {
        const next = await reader.read(); if (next.done) break
        bytes += next.value.byteLength
        if (bytes > 16000) { await reader.cancel(); throw new Error('Oversized diagnostic') }
        text += new TextDecoder().decode(next.value)
      }
      const body = JSON.parse(text)
      // Worker profile support is independent of the user's paid allowance.
      // Keep both values visible; never turn fastReady into generationReady.
      for (const key of ['generationReady', 'ready', 'photoReady', 'fastReady', 'fastBudgetReady']) if (typeof body[key] === 'boolean') record[key] = body[key]
      for (const key of ['oracle', 'mode', 'reason']) if (typeof body[key] === 'string' && /^[A-Z_]{1,60}$/.test(body[key])) record[key] = body[key]
      for (const key of ['connectorVersion', 'characterStandard']) if (Number.isSafeInteger(body[key])) record[key] = body[key]
      if (body.allowance) record.allowance = Object.fromEntries(['used', 'limit', 'remaining'].filter(key => Number.isSafeInteger(body.allowance[key])).map(key => [key, body.allowance[key]]))
      results.push(record)
    } catch { results.push({ path, http: 'UNKNOWN', generation: 'NOT_REQUESTED' }) }
  }
  return results
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await inspectExternalGenerator(), null, 2))
  console.log(JSON.stringify(await inspectWorldifactServices(), null, 2))
  console.log('Read-only diagnostic: no credentials, paid POSTs, model downloads, private session access or redirects. HTTP readiness does not prove a generated model.')
}
