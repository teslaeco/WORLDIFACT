import { createHash } from 'node:crypto'
import { appendFile, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTALS } from '../src/config/portals.ts'
import { readDeployment } from './release-check.ts'
import { selectPipelineReleaseOptions } from './select-pipeline-only-release.mjs'

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
    requireCheck(!entry.isSymbolicLink() && /^[a-z\d_./+ -]+$/i.test(path) && !path.includes('..') && !path.startsWith('api/') && (!path.split('/').some(part => part.startsWith('.')) || (reviewedPublicMarkers.has(path) && entry.isFile())), 'Unreviewed release asset path.')
    if (entry.isDirectory()) result.push(...await localFiles(dist, path))
    else if (entry.isFile()) result.push(path)
    else throw new Error('Unreviewed release asset type.')
  }
  return result.sort()
}

/** Shared read-only smoke for reviewed preserve-runtime releases. The only API request is health.
 * All other requests are GETs for built static files/routes, with exact hashes.
 * No platform, Studio, funding, billing, payment or generation endpoint is used.
 */
export async function checkCompatibleMccRelease(deployment, { dist = 'dist', fetcher = fetch, retryDelaysMs = [2000, 4000, 8000, 16000], onStage = () => {} } = {}) {
  const { origin, versionId } = deployment ?? {}
  requireCheck(/^https:\/\/worldifact\.[a-z\d-]+\.workers\.dev$/.test(origin) && typeof versionId === 'string' && /^[a-z\d_-]{1,128}$/i.test(versionId), 'Invalid deployment receipt.')
  const get = path => fetcher(new URL(path, origin), {
    method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(20000),
    headers: { 'Cache-Control': 'no-cache' },
  })
  onStage('health')
  const healthResponse = await get('/api/health')
  requireCheck(healthResponse.status === 200 && healthResponse.headers.get('content-type')?.includes('application/json'), 'Release health is unavailable.')
  const health = await healthResponse.json()
  requireCheck(['READY', 'DEMO'].includes(health?.mode) && typeof health.generationReady === 'boolean', 'Release health contract changed.')
  onStage('local_assets')
  const files = await localFiles(dist)
  requireCheck(files.length > 0 && files.length <= 10000 && files.some(file => /^assets\/.*\.js$/.test(file)) && files.some(file => /^assets\/.*\.css$/.test(file)), 'Release assets are missing or exceed the reviewed limit.')
  onStage('foundation_manifest')
  const foundation = JSON.parse(await readFile(join(dist, 'foundation-release.json'), 'utf8'))
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
  onStage('html_routes')
  const html = await readFile(join(dist, 'index.html'))
  requireCheck(/id=["']root["']/.test(html.toString()), 'Built application entry point is missing.')
  const routes = [...new Set(['/', '/world', '/login', '/builder', '/make', '/terra', '/chess/shop', ...PORTALS.map(portal => portal.route)])]
  for (const path of routes) {
    requireCheck(path.startsWith('/') && !path.startsWith('//') && !/^\/api(?:\/|$)/.test(path), 'Unreviewed application route.')
    await matching(path, html, types.html)
  }
  onStage('static_assets')
  const remaining = [...files]
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let path = remaining.pop(); path; path = remaining.pop())
      await matching(`/${path}`, await readFile(join(dist, path)), types[path.split('.').at(-1)])
  }))
  return { origin, versionId, htmlRoutes: routes.length, verifiedAssets: files.length }
}

export async function checkSubscriptionUpgradeRelease(deployment, options, checks = {}) {
  requireCheck(options?.subscriptionUpgradeRepair === true && options?.preserveBilling === true && options?.preserveRemoteVars === true && options?.preserveSecrets === true, 'Subscription upgrade release scope is required.')
  return checkCompatibleMccRelease(deployment, checks)
}

export async function checkAccountPurchaseEvidenceRelease(deployment, options, checks = {}) {
  requireCheck(options?.accountPurchaseEvidence === true && options?.preserveBilling === true && options?.preserveRemoteVars === true && options?.preserveSecrets === true, 'Account purchase evidence release scope is required.')
  return checkCompatibleMccRelease(deployment, checks)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stage = 'arguments'
  try {
    const subscriptionUpgrade = process.argv.length === 3 && process.argv[2] === '--subscription-upgrade-repair'
    const accountPurchaseEvidence = process.argv.length === 3 && process.argv[2] === '--account-purchase-evidence'
    requireCheck((process.argv.length === 2 || subscriptionUpgrade || accountPurchaseEvidence) && process.env.WRANGLER_OUTPUT_FILE_PATH, 'Preserving release arguments are required.')
    stage = 'release_scope'
    const options = selectPipelineReleaseOptions()
    requireCheck(accountPurchaseEvidence ? options.accountPurchaseEvidence === true : subscriptionUpgrade ? options.subscriptionUpgradeRepair === true : options.compatibleMccRollback === true, 'Reviewed release scope is required.')
    stage = 'deployment_receipt'
    const deployment = readDeployment(await readFile(process.env.WRANGLER_OUTPUT_FILE_PATH, 'utf8'))
    console.log(`Cloudflare version: ${deployment.versionId}`)
    const checks = { onStage: value => { if (['health', 'local_assets', 'foundation_manifest', 'html_routes', 'static_assets'].includes(value)) stage = value } }
    const result = accountPurchaseEvidence ? await checkAccountPurchaseEvidenceRelease(deployment, options, checks)
      : subscriptionUpgrade ? await checkSubscriptionUpgradeRelease(deployment, options, checks) : await checkCompatibleMccRelease(deployment, checks)
    const label = accountPurchaseEvidence ? 'account purchase evidence' : subscriptionUpgrade ? 'subscription upgrade repair' : 'compatible UI rollback'
    stage = 'report'
    console.log(`PASS: ${label}; ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} exact built files. GET-only health/static verification; no financial probes, secret synchronization or generation requests.`)
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${result.origin}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## WORLDIFACT ${label}\n\n[Open WORLDIFACT](${result.origin})\n\nCloudflare version: \`${result.versionId}\`\n\nGET-only verification matched ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} built files. Existing runtime variables, secrets, bindings and migrations were preserved. No financial probes or generation requests. Browser/device appearance remains unverified.\n`)
  } catch {
    console.error(`PRESERVING_RELEASE_NOT_VERIFIED: ${stage}; read-only publication checks failed. No generation, payment or secret synchronization was attempted.`)
    process.exitCode = 1
  }
}
