/** Public original FORGE sculpture; never replaces it with generated geometry. */
export const POLYHEDRON_SOURCE = 'https://forge-world-builder.terraformingplanet.chatgpt.site/world-assets/polyhedron.glb'
export const POLYHEDRON_SHA256 = 'c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a'
const MAX_BYTES = 12 * 1024 * 1024
export async function decorApi(request: Request, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/decor/polyhedron.glb') return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  try {
    const response = await fetcher(POLYHEDRON_SOURCE, { redirect: 'error', signal: AbortSignal.timeout(25_000) })
    if (!response.ok || !['model/gltf-binary', 'application/octet-stream'].includes(response.headers.get('content-type')?.split(';')[0] || '') || Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel(); throw new Error('Source unavailable')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty model')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const next = await reader.read(); if (next.done) break
      size += next.value.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Model too large') }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
    if (digest !== POLYHEDRON_SHA256) throw new Error('Original asset changed; review required')
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
      'Content-Type': 'model/gltf-binary', 'Content-Length': String(size), 'Cache-Control': 'public, max-age=86400',
      'ETag': `"${digest}"`, 'X-Content-Type-Options': 'nosniff', 'X-WORLDIFACT-Source': 'FORGE-original-polyhedron',
    } })
  } catch { return Response.json({ error: 'The original FORGE sculpture is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }) }
}
