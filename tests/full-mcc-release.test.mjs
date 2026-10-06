import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildFullMccConfig } from '../scripts/build-full-mcc-config.mjs'
import { BASE_COMMIT, HISTORICAL_COMMIT, HISTORICAL_TREE, RELEASE_MARKER, SOURCE_EXCEPTIONS, compareSourceTrees } from '../scripts/check-full-mcc-source.mjs'
import { validateFullMccCutover } from '../scripts/check-full-mcc-cutover.mjs'
import { checkFullMccAssets, checkFullMccRelease, verifyFullMccReceipt } from '../scripts/check-full-mcc-release.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const record = oid => ({ mode: '100644', oid: oid.repeat(40) })

test('whole-tree comparison rejects changed, missing and later non-exception files', () => {
  const historical = new Map([['src/App.tsx', record('1')], ['docs/OLD.md', record('2')]])
  for (const candidate of [
    new Map([['src/App.tsx', record('3')], ['docs/OLD.md', record('2')]]),
    new Map([['src/App.tsx', record('1')]]),
    new Map([...historical, ['src/components/EighteenCrystal.tsx', record('3')]]),
    new Map([...historical, ['unreviewed.txt', record('3')]]),
  ]) assert.ok(compareSourceTrees(historical, candidate).violations.length > 0)
  assert.equal(compareSourceTrees(historical, new Map(historical)).violations.length, 0)
})

test('only exact exception paths are allowed; file modes and source fingerprints are covered', () => {
  assert.equal(new Set(SOURCE_EXCEPTIONS).size, SOURCE_EXCEPTIONS.length)
  assert.ok(SOURCE_EXCEPTIONS.every(path => !path.includes('*')))
  const historical = new Map([['server/worker.ts', record('1')], ['src/App.tsx', record('2')]])
  const candidate = new Map([...historical, ['server/worker.ts', record('3')], [RELEASE_MARKER, record('4')]])
  const proof = compareSourceTrees(historical, candidate)
  assert.equal(proof.violations.length, 0)
  assert.equal(proof.exceptions.length, 2)
  candidate.set(RELEASE_MARKER, record('5'))
  assert.equal(compareSourceTrees(historical, candidate).sourceSnapshotSha256, proof.sourceSnapshotSha256)
  candidate.set('server/worker.ts', record('6'))
  assert.notEqual(compareSourceTrees(historical, candidate).sourceSnapshotSha256, proof.sourceSnapshotSha256)
  candidate.set('src/App.tsx', { ...record('2'), mode: '100755' })
  assert.ok(compareSourceTrees(historical, candidate).violations.some(item => item.path === 'src/App.tsx'))
  candidate.set('server/worker.ts', { ...record('3'), mode: '120000' })
  assert.ok(compareSourceTrees(historical, candidate).violations.some(item => item.reason === 'non-regular source file'))
})

test('minimal configuration changes only the required fast model variable and preserves bindings/migrations', async () => {
  const base = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
  const original = structuredClone(base)
  const result = buildFullMccConfig(base)
  assert.deepEqual(base, original)
  assert.deepEqual(result.vars, { OPENAI_FAST_MODEL: 'gpt-6-sol' })
  for (const key of Object.keys(base).filter(key => key !== 'vars')) assert.deepEqual(result[key], base[key])
  assert.equal(result.vars.ENABLE_ASTRA_PLANS, undefined)
  assert.equal(result.vars.ENABLE_BILLING, undefined)
  assert.equal(result.vars.ENABLE_PAID_GENERATION, undefined)
  assert.throws(() => buildFullMccConfig({ ...base, vars: { OPENAI_FAST_MODEL: 'gpt-6.1-sol' } }))
  assert.throws(() => buildFullMccConfig({ ...base, env: { production: { vars: { ENABLE_BILLING: 'false' } } } }))
})

function approvedFixture() {
  const now = Date.parse('2026-10-06T16:00:00Z')
  const reference = 'https://review.invalid/evidence/fixture-only'
  const marker = {
    release: 'full-mcc-historical-restoration-20261006', status: 'reviewed-approved',
    baseCommit: BASE_COMMIT, historicalCommit: HISTORICAL_COMMIT, historicalTree: HISTORICAL_TREE,
    review: { sourceSnapshotSha256: 'a'.repeat(64), reviewer: 'Offline fixture reviewer', evidenceRef: reference, approvedAt: '2026-10-06T15:50:00Z', expiresAt: '2026-10-06T16:30:00Z' },
    sourceBackup: { ref: 'backup/pre-full-mcc-restore-20261006-1507', commit: BASE_COMMIT, verified: true, evidenceRef: reference },
    protectedStateBackup: { verifiedRestorable: true, manifestSha256: 'b'.repeat(64), completedAt: '2026-10-06T15:45:00Z', evidenceRef: reference },
    quiescence: { allMutatingIngressPaused: true, studioInFlightReconciled: true, billingEventsDrained: true, startedAt: '2026-10-06T15:40:00Z', validUntil: '2026-10-06T16:30:00Z', evidenceRef: reference },
    runtimeReview: { fastModel: 'gpt-6-sol', preserveOtherRemoteVars: true, keepVars: true, remoteNonSecretSnapshotSha256: 'c'.repeat(64), evidenceRef: reference, paidGenerationFlagsReviewed: true, currentPaymentSettingsPreserved: true, newAstraPlanPolicyReviewed: true, historical175CentGateAcknowledged: true },
    protectedStateReview: { usersAndSupabaseUntouched: true, authIdentityAndSessionsPreserved: true, invoiceBridgePreserved: true, bindingsAndMigrationsUnchanged: true, financialBoundaryReviewed: true, evidenceRef: reference },
    prohibitedActions: { secretSynchronization: false, paymentSetup: false, paidTests: false, permanentDeletion: false },
  }
  return { marker, now, proof: { sourceSnapshotSha256: 'a'.repeat(64), violations: [], scope: 'committed-tree', candidateCommit: '1'.repeat(40) } }
}

test('checked-in marker fails closed; offline fixture demonstrates required explicit review', async () => {
  const { proof, marker, now } = approvedFixture()
  const checkedIn = JSON.parse(await readFile(RELEASE_MARKER, 'utf8'))
  assert.throws(() => validateFullMccCutover(checkedIn, proof, now), /still blocked/)
  assert.equal(validateFullMccCutover(marker, proof, now).ready, true)
})

test('cutover rejects stale proof, missing backups, unknown runtime, in-flight work and payment changes', () => {
  const { marker, proof, now } = approvedFixture()
  for (const mutate of [
    m => { m.review.sourceSnapshotSha256 = 'd'.repeat(64) },
    m => { m.review.expiresAt = '2026-10-06T15:59:00Z' },
    m => { m.review.approvedAt = '2026-10-06T16:01:00Z' },
    m => { m.sourceBackup.verified = false },
    m => { m.protectedStateBackup.verifiedRestorable = false },
    m => { m.quiescence.startedAt = '2026-10-06T15:46:00Z' },
    m => { m.quiescence.validUntil = '2026-10-06T15:59:00Z' },
    m => { m.quiescence.studioInFlightReconciled = false },
    m => { m.quiescence.billingEventsDrained = false },
    m => { m.runtimeReview.remoteNonSecretSnapshotSha256 = null },
    m => { m.runtimeReview.fastModel = 'gpt-6.1-sol' },
    m => { m.runtimeReview.keepVars = false },
    m => { m.runtimeReview.currentPaymentSettingsPreserved = false },
    m => { m.runtimeReview.historical175CentGateAcknowledged = false },
    m => { m.protectedStateReview.invoiceBridgePreserved = false },
    m => { m.prohibitedActions.secretSynchronization = true },
    m => { m.prohibitedActions.paidTests = true },
  ]) {
    const changed = structuredClone(marker)
    mutate(changed)
    assert.throws(() => validateFullMccCutover(changed, proof, now))
  }
})

async function releaseFixture({ hidden } = {}) {
  const dist = await mkdtemp(join(tmpdir(), 'full-mcc-release-'))
  const files = new Map([
    ['index.html', '<html><div id="root"></div></html>'], ['assets/app.js', 'fixture code'], ['assets/app.css', 'fixture css'],
    ['apps/chess/index.html', '<html>chess</html>'], ['apps/chess/guest.html', '<html>guest</html>'],
    ['apps/iss/index.html', '<html>iss</html>'], ['apps/terra/index.html', '<html>terra</html>'],
    ['apps/terra/eclipse-live/.dual-countdown-release', 'pinned public release fixture'],
    ['apps/terra/eclipse-live/.placeholder', ''],
  ])
  if (hidden) files.set(hidden, 'not publishable')
  const foundation = { sources: JSON.parse(await readFile('config/foundation-sources.json', 'utf8')),
    files: [...files].filter(([path]) => path.startsWith('apps/') && path.endsWith('.html')).map(([path, bytes]) => ({ path: `/${path}`, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) })) }
  files.set('foundation-release.json', JSON.stringify(foundation))
  for (const [path, bytes] of files) { await mkdir(dirname(join(dist, path)), { recursive: true }); await writeFile(join(dist, path), bytes) }
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ path: url.pathname, options })
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.body, undefined)
    if (url.pathname === '/api/health') return Response.json({ mode: 'DEMO', generationReady: false })
    assert.ok(!url.pathname.startsWith('/api/'))
    const path = url.pathname.slice(1)
    const bytes = files.get(path) ?? files.get('index.html')
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.json') ? 'application/json' : files.has(path) && !path.endsWith('.html') ? 'application/octet-stream' : 'text/html'
    return new Response(bytes, { headers: { 'content-type': type } })
  }
  return { dist, files, calls, fetcher, retryDelaysMs: [] }
}
const origin = 'https://worldifact.fixture.workers.dev'
const fixtureVersionId = '00000000-0000-4000-8000-000000000001'

test('GET-only smoke verifies both exact Terra public dotfiles and all built bytes', async () => {
  const fixture = await releaseFixture()
  const result = await checkFullMccAssets(origin, fixture)
  assert.equal(result.verifiedAssets, fixture.files.size)
  assert.ok(fixture.calls.some(call => call.path === '/apps/terra/eclipse-live/.dual-countdown-release'))
  assert.ok(fixture.calls.some(call => call.path === '/apps/terra/eclipse-live/.placeholder'))
  assert.equal(fixture.calls.filter(call => call.path.startsWith('/api/')).length, 1)
  assert.equal(result.versionId, undefined)
})

test('smoke rejects other hidden files, wrong foundation pins and mismatching remote hashes', async () => {
  for (const hidden of ['apps/terra/.env', 'apps/terra/eclipse-live/.credentials', '.secret']) {
    const fixture = await releaseFixture({ hidden })
    await assert.rejects(checkFullMccAssets(origin, fixture), /Unreviewed release asset path/)
  }
  const pins = await releaseFixture()
  const manifest = JSON.parse(pins.files.get('foundation-release.json'))
  manifest.sources.terra.commit = '0'.repeat(40)
  await writeFile(join(pins.dist, 'foundation-release.json'), JSON.stringify(manifest))
  await assert.rejects(checkFullMccAssets(origin, pins), /source revisions/)
  const wrong = await releaseFixture()
  wrong.files.set('assets/app.js', 'different build')
  await assert.rejects(checkFullMccAssets(origin, wrong), /bytes or MIME do not match/)
})

test('deployment smoke needs real-shaped receipt and preserves original NDJSON bytes', async () => {
  const fixture = await releaseFixture()
  await assert.rejects(checkFullMccRelease({ origin, versionId: 'fake-version' }, fixture), /Invalid deployment receipt/)
  const receipt = join(await mkdtemp(join(tmpdir(), 'full-mcc-receipt-')), 'original.ndjson')
  const bytes = Buffer.from(JSON.stringify({ type: 'message', detail: 'offline test fixture only' }) + '\n' + JSON.stringify({ type: 'deploy', version: 1, worker_name: 'worldifact', version_id: fixtureVersionId, targets: [origin] }) + '\n')
  await writeFile(receipt, bytes)
  const result = await verifyFullMccReceipt(receipt, fixture)
  assert.equal(result.versionId, fixtureVersionId)
  assert.equal(result.originalReceiptSha256, digest(bytes))
  assert.deepEqual(await readFile(receipt), bytes)
})

test('smoke permits only bounded canonical same-origin HTML redirects', async () => {
  for (const location of ['https://external.invalid/', '/api/billing/status', '/apps/chess/?auth=x', '/apps/chess/#secret', '/apps/chess/index.html']) {
    const fixture = await releaseFixture()
    const original = fixture.fetcher
    fixture.fetcher = (url, options) => url.pathname === '/apps/chess/index.html'
      ? Promise.resolve(new Response(null, { status: 301, headers: { location } })) : original(url, options)
    await assert.rejects(checkFullMccAssets(origin, fixture), /Unreviewed static redirect/)
  }
  const fixture = await releaseFixture()
  const original = fixture.fetcher
  fixture.fetcher = (url, options) => {
    if (url.pathname === '/apps/chess/index.html') return Promise.resolve(new Response(null, { status: 301, headers: { location: '/apps/chess/' } }))
    if (url.pathname === '/apps/chess/') return Promise.resolve(new Response(fixture.files.get('apps/chess/index.html'), { headers: { 'content-type': 'text/html' } }))
    return original(url, options)
  }
  await checkFullMccAssets(origin, fixture)
})

test('publication workflow is explicitly gated and contains no financial or secret synchronization steps', async () => {
  const workflow = await readFile('.github/workflows/cloudflare.yml', 'utf8')
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /inputs\.confirmation == 'PUBLISH_REVIEWED_FULL_MCC'/)
  assert.match(workflow, /needs: review/)
  assert.match(workflow, /on:\n  pull_request:\n    branches: \[main\]/)
  const reviewJob = workflow.split('  review:\n')[1].split('  deploy:\n')[0]
  assert.match(reviewJob, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/)
  assert.match(reviewJob, /fetch-depth: 0/)
  assert.match(reviewJob, /persist-credentials: false/)
  assert.doesNotMatch(reviewJob, /secrets\.|environment:|wrangler deploy (?!.*--dry-run)/)
  assert.match(workflow, /node scripts\/check-full-mcc-source\.mjs --committed/)
  assert.match(workflow, /npx wrangler deploy --keep-vars --config \.wrangler\/full-mcc\.wrangler\.json/)
  assert.match(workflow, /node scripts\/check-full-mcc-cutover\.mjs\n          node scripts\/release-check\.ts credentials/)
  assert.match(workflow, /node scripts\/check-full-mcc-release\.mjs/)
  assert.doesNotMatch(workflow, /connect-openai|connect-platform|connect-billing|prepare-stripe|check-stripe|release-check\.ts smoke|build-live-generation|OPENAI_API_KEY|STRIPE_SECRET|PAYPAL_CLIENT|GENERATION_ACCESS_TOKEN|ORACLE_API_TOKEN|OWNER_ACCESS_TOKEN/)
})


test('the new publication name cannot trigger restored historical paid workflow chains', async () => {
  const workflow = await readFile('.github/workflows/cloudflare.yml', 'utf8')
  assert.match(workflow, /^name: Review and explicitly publish full MCC restoration\n/)
  for (const filename of ['contest-live-paid-smoke-once.yml', 'p0-pilot-once.yml', 'p0-pilot-recovery-once.yml', 'resume-approved-studio-once.yml', 'shop-mcp2-pilot-once.yml']) {
    const content = await readFile(`.github/workflows/${filename}`, 'utf8')
    assert.match(content, /workflows: \["Publish WORLDIFACT and verify OpenAI setup"\]/)
    assert.doesNotMatch(content, /Review and explicitly publish full MCC restoration/)
  }
})
