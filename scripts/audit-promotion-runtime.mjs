import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_VERSION = '4c819fd5-d99b-4504-b191-9b3dcb30600a'
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const names = ['WORLDIFACT_PROMOTIONS_ENABLED', 'WORLDIFACT_PROMOTION_DEFINITIONS',
  'WORLDIFACT_ADMIN_ENABLED', 'WORLDIFACT_ADMIN_ALLOCATION', 'ACCOUNT_ENTITLEMENTS',
  'ACCOUNT_LIMITER', 'GENERATION_LIMITER', 'OPENAI_API_KEY', 'ORACLE_API_TOKEN',
  'ORACLE_ENDPOINT', 'OWNER_ACCESS_TOKEN', 'STRIPE_SECRET_KEY']
const fail = () => { throw new Error('RUNTIME_AUDIT_BLOCKED') }

async function boundedJson(response) {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); fail()
  }
  const reader = response.body?.getReader(); if (!reader) fail()
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; if (size > 262144) fail()
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (json?.success !== true || !json.result) fail()
  return json.result
}

function activeVersion(result) {
  const d = result?.deployments
  if (!Array.isArray(d) || !d.length || d.length > 100) fail()
  const head = d[0]
  if (!uuid.test(head.id) || !Number.isFinite(Date.parse(head.created_on)) ||
    d.some(x => !Number.isFinite(Date.parse(x.created_on)) || Date.parse(x.created_on) > Date.parse(head.created_on)) ||
    head.strategy !== 'percentage' || !Array.isArray(head.versions) || head.versions.length !== 1 ||
    head.versions[0].percentage !== 100 || head.versions[0].version_id !== EXPECTED_VERSION) fail()
  return { deploymentId: head.id, versionId: head.versions[0].version_id }
}

// Never return raw responses, binding values, account identifiers or API errors.
// All requests are fixed, authenticated GETs to the existing production Worker.
export async function auditRuntime({ env = process.env, fetcher = fetch } = {}) {
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') ||
    !/^[A-Za-z0-9_-]{20,256}$/.test(env.CLOUDFLARE_API_TOKEN ?? '')) fail()
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/worldifact`
  const get = async suffix => boundedJson(await fetcher(base + suffix, {
    method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Cache-Control': 'no-cache' },
  }))
  const before = activeVersion(await get('/deployments'))
  const version = await get(`/versions/${before.versionId}`)
  if (version.id !== before.versionId || !Array.isArray(version.resources?.bindings)) fail()
  const bindings = version.resources.bindings
  if (bindings.length > 1000 || bindings.some(b => !b || typeof b.name !== 'string' || typeof b.type !== 'string') ||
    new Set(bindings.map(b => b.name)).size !== bindings.length) fail()
  const after = activeVersion(await get('/deployments'))
  if (before.deploymentId !== after.deploymentId) fail()
  const bindingPresence = Object.fromEntries(names.map(name => [name, bindings.some(b => b.name === name)]))
  const flag = name => {
    const b = bindings.find(b => b.name === name)
    if (!b) return 'absent'
    if (b.type !== 'plain_text') return 'configured-value-not-inspected'
    return b.text === 'true' ? 'enabled' : b.text === 'false' ? 'disabled' : 'invalid'
  }
  return { check: 'READ_ONLY_ACTIVE_VERSION', versionId: EXPECTED_VERSION, exclusiveTraffic: true,
    stableDuringRead: true, bindingPresence, promotionsFlag: flag('WORLDIFACT_PROMOTIONS_ENABLED'),
    adminFlag: flag('WORLDIFACT_ADMIN_ENABLED'), accountRedemptionVerified: false,
    configurationChanged: false, pointsGranted: false, generationRequested: false }
}

export async function runAudit({ env = process.env, fetcher = fetch, report = console } = {}) {
  try {
    if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_EVENT_NAME !== 'push' ||
      env.GITHUB_REF !== 'refs/heads/ops/promo-readiness-20261010' || env.GITHUB_RUN_ATTEMPT !== '1') fail()
    const result = await auditRuntime({ env, fetcher })
    const safe = JSON.stringify(result, null, 2)
    report.log(safe)
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `## Promotion runtime audit\n\n\`\`\`json\n${safe}\n\`\`\`\n`)
    return true
  } catch { report.error('RUNTIME_AUDIT_BLOCKED: no mutation attempted; raw diagnostics suppressed.'); return false }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2 || !await runAudit()) process.exitCode = 1
}
