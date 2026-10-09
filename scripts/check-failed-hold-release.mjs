import { createHash } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFailedHoldRelease } from './select-failed-hold-release.mjs'
import { checkCompatibleMccRelease } from './check-compatible-mcc-release.mjs'
import { readDeployment } from './release-check.ts'

const digest = value => createHash('sha256').update(value).digest('hex')
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
// Cloudflare's deployment list and pinned Wrangler 4.131.2 both identify the
// active deployment as the first result. Read only deployment metadata, never
// settings or version details (which may contain private configuration).
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/
export async function verifyExclusiveDeployment(deployment, { env = process.env, fetcher = fetch } = {}) {
  if (!UUID.test(deployment?.versionId ?? '') || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? '')
      || !/^[a-zA-Z0-9_-]{20,256}$/.test(env.CLOUDFLARE_API_TOKEN ?? '')) throw new Error('Invalid deployment metadata inputs.')
  const response = await fetcher(new URL(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/worldifact/deployments`), {
    method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Cache-Control': 'no-cache' },
  })
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Deployment metadata unavailable.')
  const text = await response.text()
  if (Buffer.byteLength(text) > 256 * 1024) throw new Error('Deployment metadata exceeds the bound.')
  const data = JSON.parse(text), deployments = data?.result?.deployments
  if (data?.success !== true || !Array.isArray(deployments) || deployments.length < 1 || deployments.length > 100)
    throw new Error('Invalid deployment metadata.')
  const latest = deployments[0]
  if (!UUID.test(latest?.id ?? '') || latest.strategy !== 'percentage' || !Number.isFinite(Date.parse(latest.created_on))
      || deployments.some(item => !Number.isFinite(Date.parse(item.created_on)) || Date.parse(item.created_on) > Date.parse(latest.created_on))
      || !Array.isArray(latest.versions) || latest.versions.length !== 1
      || latest.versions[0].version_id !== deployment.versionId || latest.versions[0].percentage !== 100)
    throw new Error('Exclusive Worker traffic is not established.')
  return { versionId: deployment.versionId, percentage: 100 }
}
export async function checkFailedHoldRelease(deployment, options = {}) {
  const result = await checkCompatibleMccRelease(deployment, options)
  const fetcher = options.fetcher ?? fetch
  const get = path => fetcher(new URL(path, result.origin), { method: 'GET', credentials: 'omit', redirect: 'manual',
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
  options.onStage?.('incident_route')
  const html = await get('/account/failed-hold-waiver')
  if (html.status !== 200 || !html.headers.get('content-type')?.includes('text/html')
      || digest(Buffer.from(await html.arrayBuffer())) !== digest(await readFile(join(options.dist ?? 'dist', 'index.html'))))
    throw new Error('Incident route bytes or MIME do not match the build.')
  options.onStage?.('anonymous_guard')
  const denied = await get('/api/account/failed-hold-waiver')
  if (denied.status !== 401 || !denied.headers.get('content-type')?.includes('application/json'))
    throw new Error('Incident account inspection does not require authentication.')
  await denied.body?.cancel()
  return { ...result, htmlRoutes: result.htmlRoutes + 1 }
}
export async function reportFailedHoldRelease({ env = process.env, select = requireFailedHoldRelease,
  check = checkFailedHoldRelease, verifyTraffic = verifyExclusiveDeployment, report = console } = {}) {
  let stage = 'release_scope'
  try {
    select()
    stage = 'deployment_receipt'
    const deployment = readDeployment(await readFile(env.WRANGLER_OUTPUT_FILE_PATH, 'utf8'))
    report.log(`Cloudflare version: ${deployment.versionId}`)
    const result = await check(deployment, { onStage: value => {
      if (['health', 'local_assets', 'foundation_manifest', 'html_routes', 'static_assets', 'incident_route', 'anonymous_guard'].includes(value)) stage = value
    } })
    stage = 'exclusive_traffic'
    await verifyTraffic(deployment, { env })
    stage = 'report'
    report.log(`PASS: incident release; ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} exact built files. Anonymous GET-only checks; remote configuration preserved. Latest Worker deployment routes 100% of traffic to this version.`)
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `url=${result.origin}\n`)
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
      `## WORLDIFACT incident release\n\n[Open WORLDIFACT](${result.origin})\n\nCloudflare version: \`${result.versionId}\`\n\nVerified ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} exact built files using anonymous GET requests. A read-only Cloudflare deployment metadata check confirmed 100% of traffic assigned exclusively to this version. Existing variables, secrets, provider limits, payment settings, bindings and migrations were preserved. Deployment performed no ledger operation or generation request. Browser/device appearance remains unverified.\n`)
    return true
  } catch {
    report.error(`FAILED_HOLD_RELEASE_NOT_VERIFIED: ${stage}; read-only publication checks failed.`)
    return false
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('FAILED_HOLD_RELEASE_NOT_VERIFIED: arguments are not allowed.')
    process.exitCode = 1
  } else if (!await reportFailedHoldRelease()) process.exitCode = 1
}
