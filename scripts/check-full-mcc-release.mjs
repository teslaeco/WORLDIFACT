import { createHash } from 'node:crypto'
import { appendFile, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTALS } from '../src/config/portals.ts'
import { readDeployment } from './release-check.ts'
import { isDeepStrictEqual } from 'node:util'

const digest = value => createHash('sha256').update(value).digest('hex')
function requireCheck(condition, message) { if (!condition) throw new Error(message) }
const types = {
  html: ['text/html'], js: ['text/javascript', 'application/javascript'], css: ['text/css'],
  json: ['application/json'], webp: ['image/webp'], png: ['image/png'], svg: ['image/svg+xml'],
  gltf: ['model/gltf+json', 'application/json'], glb: ['model/gltf-binary', 'application/octet-stream'],
  gz: ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
}
// Public metadata copied from the exact pinned Terra foundation revision.
// Keep every other hidden path forbidden, and verify these files like all assets.
const reviewedPublicMarkers = new Set(['apps/terra/eclipse-live/.dual-countdown-release', 'apps/terra/eclipse-live/.placeholder'])
async function localFiles(dist, relative = '') {
  const result = []
  for (const entry of await readdir(join(dist, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    // Wrangler consumes these deployment rules; they are not public assets.
    if (!relative && ['_headers', '_redirects', '.assetsignore'].includes(entry.name)) continue
    requireCheck(!entry.isSymbolicLink() && /^[a-z\d_./+ -]+$/i.test(path) && !path.includes('..') && !path.startsWith('api/') && (!path.split('/').some(part => part.startsWith('.')) || reviewedPublicMarkers.has(path)), 'Unreviewed release asset path.')
    if (entry.isDirectory()) result.push(...await localFiles(dist, path))
    else if (entry.isFile()) result.push(path)
    else throw new Error('Unreviewed release asset type.')
  }
  return result.sort()
}

/** Read-only smoke for the full historical restoration. The only API request is health.
 * All other requests are GETs for built static files/routes, with exact hashes.
 * No platform, Studio, funding, billing, payment or generation endpoint is used.
 */
export async function checkFullMccAssets(origin, { dist = 'dist', fetcher = fetch, retryDelaysMs = [2000, 4000, 8000, 16000] } = {}) {
  requireCheck(/^https:\/\/worldifact\.[a-z\d-]+\.workers\.dev$/.test(origin), 'Invalid verification origin.')
  const get = path => fetcher(new URL(path, origin), {
    method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(20000),
    headers: { 'Cache-Control': 'no-cache' },
  })
  const healthResponse = await get('/api/health')
  requireCheck(healthResponse.status === 200 && healthResponse.headers.get('content-type')?.includes('application/json'), 'Release health is unavailable.')
  const health = await healthResponse.json()
  requireCheck(['READY', 'DEMO'].includes(health?.mode) && typeof health.generationReady === 'boolean', 'Release health contract changed.')
  const files = await localFiles(dist)
  requireCheck(files.length > 0 && files.length <= 10000 && files.some(file => /^assets\/.*\.js$/.test(file)) && files.some(file => /^assets\/.*\.css$/.test(file)), 'Release assets are missing or exceed the reviewed limit.')
  const foundation = JSON.parse(await readFile(join(dist, 'foundation-release.json'), 'utf8'))
  const expectedSources = JSON.parse(await readFile(new URL('../config/foundation-sources.json', import.meta.url), 'utf8'))
  requireCheck(isDeepStrictEqual(foundation.sources, expectedSources), 'Foundation source revisions do not match the historical pins.')
  requireCheck(Array.isArray(foundation.files) && foundation.files.length <= 1500, 'Foundation manifest is missing or invalid.')
  for (const path of ['/apps/chess/index.html', '/apps/chess/guest.html', '/apps/iss/index.html', '/apps/terra/index.html'])
    requireCheck(foundation.files.some(file => file.path === path) && files.includes(path.slice(1)), 'Required foundation entry is missing.')
  for (const file of foundation.files) {
    requireCheck(typeof file.path === 'string' && /^\/apps\/(chess|iss|terra)\/[a-z\d_./+ -]+$/i.test(file.path) && !file.path.includes('..') && files.includes(file.path.slice(1)), 'Unreviewed foundation asset path.')
    const bytes = await readFile(join(dist, file.path.slice(1)))
    requireCheck(bytes.length === file.bytes && digest(bytes) === file.sha256, 'Foundation changed after assembly.')
  }
  const staticResponse = async path => {
    const canonical = path.endsWith('.html') ? path.replace(/(?:\/index)?\.html$/, '') || '/' : null
    const allowed = new Set(canonical ? [canonical, `${canonical.replace(/\/$/, '')}/`] : [])
    const visited = new Set([path])
    let current = path
    for (let hops = 0; ; hops++) {
      const response = await get(current)
      if (response.status < 300 || response.status >= 400) return response
      const location = response.headers.get('location')
      requireCheck(location, 'Static redirect has no destination.')
      const next = new URL(location, new URL(current, origin))
      requireCheck(hops < 2 && next.origin === origin && !next.username && !next.password && !next.search && !next.hash && allowed.has(next.pathname) && !visited.has(next.pathname), 'Unreviewed static redirect.')
      await response.body?.cancel()
      current = next.pathname
      visited.add(current)
    }
  }
  const matching = async (path, bytes, mimeTypes) => {
    for (let attempt = 0; ; attempt++) {
      const response = await staticResponse(path)
      const mime = response.headers.get('content-type')?.split(';')[0].trim()
      if (response.status === 200 && (!mimeTypes || mimeTypes.includes(mime)) && digest(Buffer.from(await response.arrayBuffer())) === digest(bytes)) return
      await response.body?.cancel().catch(() => {})
      requireCheck(attempt < retryDelaysMs.length, `Release bytes or MIME do not match: ${path}`)
      await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]))
    }
  }
  const html = await readFile(join(dist, 'index.html'))
  requireCheck(/id=["']root["']/.test(html.toString()), 'Built application entry point is missing.')
  const routes = [...new Set(['/', '/world', '/login', '/builder', '/make', '/terra', '/chess/shop', ...PORTALS.map(portal => portal.route)])]
  for (const path of routes) {
    requireCheck(path.startsWith('/') && !path.startsWith('//') && !/^\/api(?:\/|$)/.test(path), 'Unreviewed application route.')
    await matching(path, html, types.html)
  }
  const remaining = [...files]
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let path = remaining.pop(); path; path = remaining.pop())
      await matching(`/${path}`, await readFile(join(dist, path)), types[path.split('.').at(-1)])
  }))
  return { origin, htmlRoutes: routes.length, verifiedAssets: files.length }
}

/** Deployment verification still requires a real version receipt. */
export async function checkFullMccRelease(deployment, options) {
  requireCheck(typeof deployment?.versionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deployment.versionId), 'Invalid deployment receipt.')
  return { ...await checkFullMccAssets(deployment.origin, options), versionId: deployment.versionId }
}

/** Read the original Wrangler NDJSON without normalizing or rewriting its records. */
export async function verifyFullMccReceipt(receiptPath, options) {
  const original = await readFile(receiptPath)
  const result = await checkFullMccRelease(readDeployment(original.toString('utf8')), options)
  requireCheck(digest(await readFile(receiptPath)) === digest(original), 'Original deployment receipt changed during verification.')
  return { ...result, originalReceiptSha256: digest(original) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCheck(process.argv.length === 2 && process.env.WRANGLER_OUTPUT_FILE_PATH, 'An original Wrangler deployment receipt is required.')
    const result = await verifyFullMccReceipt(process.env.WRANGLER_OUTPUT_FILE_PATH)
    console.log(JSON.stringify(result, null, 2))
    console.log('PASS: GET-only historical restoration verification; exact built HTML and static assets. No generation, financial, account or secret-sync probes. Device appearance, balances and paid generation remain unverified.')
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${result.origin}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## WORLDIFACT full historical restoration\n\n[Open WORLDIFACT](${result.origin})\n\nActual Cloudflare version: \`${result.versionId}\`\n\nOriginal receipt SHA-256: \`${result.originalReceiptSha256}\`\n\nGET-only verification matched ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} built files. No paid-generation or funding success is implied. Browser/device appearance remains unverified.\n`)
  } catch (error) {
    console.error(`FULL_MCC_RELEASE_NOT_VERIFIED: ${error.message}`)
    process.exitCode = 1
  }
}
