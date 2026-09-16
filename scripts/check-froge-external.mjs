import { pathToFileURL } from 'node:url'
import { REFERENCE_LINKS } from '../src/config/references.ts'

/** A public, credential-free HTTP probe. It is never generation or browser proof. */
export async function inspectExternalGenerator(fetcher = fetch) {
  const url = REFERENCE_LINKS.modelGenerator
  const result = { url, generation: 'NOT_TESTED', browserEmbedding: 'UNKNOWN' }
  try {
    let response = await fetcher(url, {
      method: 'HEAD', redirect: 'manual', credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
    })
    if ([405, 501].includes(response.status)) {
      await response.body?.cancel()
      response = await fetcher(url, {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      })
    }
    const status = response.status
    const xfo = (response.headers.get('x-frame-options') || '').trim().toLowerCase()
    const csp = response.headers.get('content-security-policy') || ''
    const frameAncestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1] || ''
    const headerBlocksFrame = xfo === 'deny' || xfo === 'sameorigin' || frameAncestors.trim() === "'none'"
    await response.body?.cancel()
    return {
      ...result, status,
      http: response.ok ? 'REACHABLE_NOT_GENERATION_PROOF' : [401, 403].includes(status)
        ? 'ACCESS_RESTRICTED' : status >= 300 && status < 400 ? 'REDIRECT_NOT_FOLLOWED' : 'UNAVAILABLE',
      browserEmbedding: headerBlocksFrame ? 'BLOCKED_BY_RESPONSE_POLICY' : 'UNKNOWN',
      frameAncestorsPresent: Boolean(frameAncestors),
      // Do not log redirect URLs, cookies, private response bodies or credentials.
    }
  } catch {
    return { ...result, http: 'UNKNOWN_NETWORK_UNAVAILABLE' }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await inspectExternalGenerator(), null, 2))
  console.log('Read-only diagnostic. A 200 response is not proof of sign-in, iframe usability or generation. No credentials, paid POSTs, model downloads or redirects were used.')
}
