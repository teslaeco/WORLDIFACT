/** Read-only publication proof. No credentials, AI requests, checkout or browser automation. */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
export const ORIGIN = 'https://worldifact.xodobrox.workers.dev'
export const PUBLIC_FILES = Object.freeze([
  ['compare/mcc/index.html', '/compare/mcc/', 'text/html'],
  ['compare/mcc/style.css', '/compare/mcc/style.css', 'text/css'],
  ['comparisons/mcc/worldifact-detail.webp', '/comparisons/mcc/worldifact-detail.webp', 'image/webp'],
  ['comparisons/mcc/meshy-detail.webp', '/comparisons/mcc/meshy-detail.webp', 'image/webp'],
  ['comparisons/mcc/provenance.json', '/comparisons/mcc/provenance.json', 'application/json'],
])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export async function boundedPublicGet(path, mime, fetcher = fetch) {
  if (![...PUBLIC_FILES.map(row => row[1]), '/api/billing/status'].includes(path)) throw new Error('PUBLIC_PATH_NOT_ALLOWED')
  const response = await fetcher(ORIGIN + path, { method: 'GET', redirect: 'error', cache: 'no-store',
    headers: { Accept: mime }, signal: AbortSignal.timeout(15000) })
  if (!response.ok || response.redirected || response.headers.get('content-type')?.split(';')[0].trim() !== mime
      || Number(response.headers.get('content-length') || 0) > 1048576) {
    await response.body?.cancel(); throw new Error('PUBLIC_RESPONSE_NOT_VERIFIED')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('PUBLIC_RESPONSE_EMPTY')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break
      size += next.value.byteLength
      if (size > 1048576) throw new Error('PUBLIC_RESPONSE_TOO_LARGE')
      chunks.push(next.value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}) }
}
export async function verifyMccPublication({ fetcher = fetch, read = path => readFile(new URL('../public/' + path, import.meta.url)),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const verified = []
  for (const [file, path, mime] of PUBLIC_FILES) {
    const expected = hash(await read(file)); let actual
    for (let attempt = 0; attempt < 4; attempt++) {
      try { const data = await boundedPublicGet(path, mime, fetcher); if (hash(data) === expected) { actual = data; break } }
      catch { /* Retry only this same public read. No paid work or redirects. */ }
      if (attempt < 3) await sleep([1000, 3000, 8000][attempt])
    }
    if (!actual) throw new Error('PUBLIC_FILE_MISMATCH: ' + path)
    verified.push({ path, bytes: actual.length, sha256: expected })
  }
  const billing = JSON.parse((await boundedPublicGet('/api/billing/status', 'application/json', fetcher)).toString())
  if (billing.generationCosts?.luna !== 15 || billing.generationCosts?.sol !== 50 || billing.generationCosts?.astra !== 250)
    throw new Error('PUBLIC_MODEL_PRICES_NOT_VERIFIED')
  return { publication: 'VERIFIED', files: verified, generationCosts: { luna: 15, sol: 50, astra: 250 }, paidRequests: 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await verifyMccPublication(), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'PUBLICATION_NOT_VERIFIED'); process.exitCode = 1 }
}
