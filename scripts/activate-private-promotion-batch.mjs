import { execFileSync } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promotionDefinitions } from '../server/promotionCodes.ts'

const expectedVersion = '4c819fd5-d99b-4504-b191-9b3dcb30600a'
const markerPath = '.github/activation/private-promotion-20261010.json'
const targets = ['WORLDIFACT_PROMOTION_DEFINITIONS', 'WORLDIFACT_PROMOTIONS_ENABLED']
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const fail = () => { throw new Error('ACTIVATION_GUARD') }

export function validatePrivateBatch(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 32768) fail()
  const input = JSON.parse(raw)
  if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== [...targets].sort().join(',') ||
    input.WORLDIFACT_PROMOTIONS_ENABLED !== 'true') fail()
  const definitions = promotionDefinitions(input)
  if (!definitions || definitions.length !== 10 || new Set(definitions.map(d => d.accountId)).size !== 1 ||
    definitions.some(d => d.points !== 1000 || d.maxRedemptions !== 1 || d.purpose !== 'tester' ||
      d.startsAt !== definitions[0].startsAt || d.expiresAt - d.startsAt !== 30 * 86400000 ||
      d.startsAt > now || now - d.startsAt > 86400000)) fail()
  return input
}

export function validateActivationContext(env, manifest, parent, changed) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_ACTOR !== 'teslaeco' ||
    env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/ops/promo-readiness-20261010' ||
    env.GITHUB_RUN_ATTEMPT !== '1' || !manifest || Array.isArray(manifest) ||
    Object.keys(manifest).sort().join(',') !== 'approval,reviewedParent' ||
    manifest.approval !== 'owner-approved-new-private-batch-10x1000-30days-20261010' ||
    !/^[a-f0-9]{40}$/.test(manifest.reviewedParent) || manifest.reviewedParent !== parent ||
    changed !== markerPath) fail()
}

async function checkContext(env) {
  const manifest = JSON.parse(await readFile(markerPath, 'utf8'))
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const lineage = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')
  if (lineage.length !== 2 || lineage[0] !== env.GITHUB_SHA) fail()
  const changed = git(['diff', '--name-only', 'HEAD^', 'HEAD'])
  validateActivationContext(env, manifest, lineage[1], changed)
  // Marker must be a new regular file, never a replay or symlink.
  if (git(['diff', '--name-status', 'HEAD^', 'HEAD']) !== `A\t${markerPath}` ||
    !git(['ls-tree', 'HEAD', markerPath]).startsWith('100644 blob ')) fail()
}

async function readJson(response) {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); fail()
  }
  const reader = response.body?.getReader(); if (!reader) fail()
  const chunks = []; let bytes = 0
  try { for (;;) {
    const r = await reader.read(); if (r.done) break
    bytes += r.value.byteLength; if (bytes > 262144) fail()
    chunks.push(r.value)
  } } finally { await reader.cancel().catch(() => {}) }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (data?.success !== true || !data.result) fail()
  return data.result
}

function deployment(data) {
  const ds = data?.deployments, d = ds?.[0]
  if (!Array.isArray(ds) || ds.length < 1 || ds.length > 100 || !uuid.test(d?.id) ||
    d.strategy !== 'percentage' || !Number.isFinite(Date.parse(d.created_on)) ||
    ds.some(x => !Number.isFinite(Date.parse(x.created_on)) || Date.parse(x.created_on) > Date.parse(d.created_on)) ||
    !Array.isArray(d.versions) || d.versions.length !== 1 || !uuid.test(d.versions[0]?.version_id) || d.versions[0].percentage !== 100) fail()
  return { id: d.id, version: d.versions[0].version_id }
}

function resources(version, id) {
  const r = version?.resources
  if (version.id !== id || !Array.isArray(r?.bindings) || !r.script || typeof r.script.etag !== 'string' ||
    !r.script.etag || !r.script_runtime || r.bindings.some(b => typeof b?.name !== 'string' || typeof b?.type !== 'string') ||
    new Set(r.bindings.map(b => b.name)).size !== r.bindings.length) fail()
  return r
}
const unaffected = bindings => bindings.filter(b => !targets.includes(b.name)).sort((a,b) => a.name.localeCompare(b.name))

export async function activateBatch({ env = process.env, fetcher = fetch, now = Date.now(), onWriteAttempt = () => {} } = {}) {
  const input = validatePrivateBatch(env.WORLDIFACT_PROMOTION_BATCH_20261010, now)
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !/^[A-Za-z0-9_-]{20,256}$/.test(env.CLOUDFLARE_API_TOKEN ?? '')) fail()
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/worldifact`
  const request = (path, method = 'GET', body) => fetcher(base + path, { method, body,
    redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000), headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Cache-Control': 'no-cache',
      ...(body ? { 'Content-Type': 'application/merge-patch+json' } : {}),
    } }).then(readJson)
  const first = deployment(await request('/deployments'))
  if (first.version !== expectedVersion) fail()
  const before = resources(await request(`/versions/${first.version}`), first.version)
  if (before.bindings.some(b => targets.includes(b.name))) fail()
  // Ensure the latest version that the secret API will clone is the active one.
  const versions = await request('/versions')
  if (!Array.isArray(versions.items) || versions.items[0]?.id !== first.version) fail()
  const immediate = deployment(await request('/deployments'))
  if (!isDeepStrictEqual(first, immediate)) fail()
  const body = JSON.stringify({ secrets: Object.fromEntries(targets.map(name => [name, { name, text: input[name], type: 'secret_text' }])) })
  onWriteAttempt()
  // Exactly one mutation; never retry a timeout or replay this one-time operation.
  await request('/secrets-bulk', 'PATCH', body)
  const afterDeployment = deployment(await request('/deployments'))
  if (afterDeployment.version === first.version) fail()
  const after = resources(await request(`/versions/${afterDeployment.version}`), afterDeployment.version)
  if (after.script.etag !== before.script.etag ||
    !isDeepStrictEqual(after.script.handlers, before.script.handlers) ||
    !isDeepStrictEqual(after.script.named_handlers, before.script.named_handlers) ||
    !isDeepStrictEqual(after.script_runtime, before.script_runtime) ||
    !isDeepStrictEqual(unaffected(after.bindings), unaffected(before.bindings)) ||
    after.bindings.length !== before.bindings.length + 2 ||
    !targets.every(name => after.bindings.some(b => b.name === name && b.type === 'secret_text'))) fail()
  const final = deployment(await request('/deployments'))
  if (!isDeepStrictEqual(final, afterDeployment)) fail()
  return { status: 'PRIVATE_BATCH_CONFIGURATION_DEPLOYED', versionId: final.version,
    previousVersionId: first.version, exclusiveTraffic: true, codeAndOtherBindingsPreserved: true,
    codes: 10, pointsEach: 1000, maxRedemptionsEach: 1,
    expiresAt: new Date(JSON.parse(input.WORLDIFACT_PROMOTION_DEFINITIONS)[0].expiresAt).toISOString(),
    actualAccountRedemptionTested: false, balancesModifiedByThisOperation: false, providerFundingAdded: false }
}

export async function main({ env = process.env, fetcher = fetch, report = console, contextCheck = checkContext, checkOnly = false } = {}) {
  let writeAttempted = false
  try {
    await contextCheck(env)
    if (checkOnly) { report.log('APPROVED_NEW_BATCH_CONTEXT_VERIFIED'); return true }
    const result = await activateBatch({ env, fetcher, onWriteAttempt: () => { writeAttempted = true } })
    const safe = JSON.stringify(result, null, 2)
    report.log(safe)
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `## Private batch activation receipt\n\n\`\`\`json\n${safe}\n\`\`\`\n`)
    return true
  } catch {
    report.error(writeAttempted ? 'ACTIVATION_UNCONFIRMED_AFTER_WRITE_ATTEMPT: do not retry; inspect metadata.' : 'ACTIVATION_BLOCKED_BEFORE_WRITE: no mutation attempted.')
    return false
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || process.argv.length === 3 && process.argv[2] !== '--check') process.exitCode = 1
  else if (!await main({ checkOnly: process.argv[2] === '--check' })) process.exitCode = 1
}
