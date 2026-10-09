import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blob, sha256 } from '../scripts/select-context-tools-release.mjs'
import {
  BASE_COMMIT, BASE_WORKFLOW_BLOB, SCRIPT_PATH, CONFIG_PATH, CONFIG_BLOB, WORKFLOW_PATH,
  HISTORICAL_TEST_BLOBS, PRESERVED_BLOBS, readManifest, guardedWorkflow, historicalWorkflow,
  selectFailedHoldRelease, requireFailedHoldRelease,
} from '../scripts/select-failed-hold-release.mjs'
import { buildFailedHoldConfig } from '../scripts/prepare-failed-hold-release.mjs'
import { checkFailedHoldRelease, reportFailedHoldRelease, verifyExclusiveDeployment } from '../scripts/check-failed-hold-release.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const head = '1'.repeat(40), other = '2'.repeat(40), zero = '0'.repeat(40)
const scriptBytes = readFileSync(join(root, SCRIPT_PATH))
const currentWorkflow = readFileSync(join(root, WORKFLOW_PATH), 'utf8')
const baseWorkflow = historicalWorkflow(currentWorkflow)
const rawChanges = changes => changes.map(change => `:${change.oldMode} ${change.newMode} ${change.oldBlob} ${change.newBlob} ${change.status}\0${change.path}\0`).join('')
const addition = (path, newBlob = '3'.repeat(40)) => ({ path, oldMode: '000000', newMode: '100644', oldBlob: zero, newBlob, status: 'A' })
const modification = (path, oldBlob = '3'.repeat(40), newBlob = '4'.repeat(40)) => ({ path, oldMode: '100644', newMode: '100644', oldBlob, newBlob, status: 'M' })
const entry = ({ path: _path, ...value }) => value
function fixtureManifest() {
  return { revision: 'failed-hold-waiver-release-v1', baseCommit: BASE_COMMIT, status: 'FROZEN',
    preserveRemoteConfiguration: true, deployOnly: true, payload: {
      ...Object.fromEntries(Object.entries(HISTORICAL_TEST_BLOBS).map(([path, oldBlob]) => [path, entry(modification(path, oldBlob))])),
      'server/failedHoldWaiver.ts': entry(addition('server/failedHoldWaiver.ts')),
      'tests/failed-hold-release.test.mjs': entry(addition('tests/failed-hold-release.test.mjs')),
    } }
}
function evidence(options = {}) {
  const manifest = options.manifest ?? fixtureManifest()
  const configBytes = options.configBytes ?? Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  const configBlob = options.configBlob ?? blob(configBytes)
  const workflow = guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(configBytes))
  const complete = [...Object.entries(manifest.payload).map(([path, value]) => ({ path, ...value })),
    addition(SCRIPT_PATH, blob(scriptBytes)), addition(CONFIG_PATH, configBlob), modification(WORKFLOW_PATH, BASE_WORKFLOW_BLOB, blob(workflow))]
  const data = { parents: [BASE_COMMIT], changes: complete, workflow, beforeWorkflow: baseWorkflow, ...options }
  const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '1', ...options.env }
  const event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'refs/heads/main', before: BASE_COMMIT,
    after: head, head_commit: { id: head }, created: false, deleted: false, forced: false, ...options.event }
  const git = (_cwd, args) => {
    if (args[0] === 'rev-parse') return head + '\n'
    if (args[0] === 'rev-list') return data.parentsRaw ?? `${head} ${data.parents.join(' ')}\n`
    if (args[0] === 'merge-base') { if (data.notAncestor) throw new Error('not ancestor'); return '' }
    if (args[0] === 'ls-tree') {
      const path = args.at(-1)
      if (path in (data.trees ?? {})) return data.trees[path]
      const value = { ...PRESERVED_BLOBS, [SCRIPT_PATH]: blob(scriptBytes), [CONFIG_PATH]: configBlob }[path]
      assert.ok(value, path)
      return `100644 blob ${value}\t${path}\0`
    }
    if (args[0] === 'diff') {
      assert.deepEqual(args.slice(0, 7), ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '--no-abbrev', '-z'])
      return data.raw ?? rawChanges(data.rangeChanges && args[7] !== data.parents[0] ? data.rangeChanges : data.changes)
    }
    if (args[0] === 'cat-file') return args[2] === BASE_WORKFLOW_BLOB ? data.beforeWorkflow : data.workflow
    assert.fail(JSON.stringify(args))
  }
  return { cwd: root, env, event, git, scriptBytes, configBytes, configBlob, data }
}
const select = options => selectFailedHoldRelease(evidence(options))
const reject = options => assert.throws(() => select(options), /FAILED_HOLD_RELEASE_NOT_VERIFIED|CONTEXT_TOOLS_RELEASE_NOT_VERIFIED|not ancestor/)
const allowed = { deployAllowed: false, failedHoldWaiver: true, preserveRemoteVars: true, preserveBilling: true, preserveSecrets: true }

test('only the complete single-parent exact-base main release enables the preserve-only job', () => {
  assert.equal(BASE_COMMIT, '31c9e41a6f8a68bb6c7bbe748e79803f63835c36')
  assert.deepEqual(select(), allowed)
  assert.deepEqual(requireFailedHoldRelease(evidence()), allowed)
  for (const attempt of ['1', '2', '99']) {
    assert.deepEqual(select({ env: { GITHUB_RUN_ATTEMPT: attempt } }), allowed)
    const fixture = evidence({ env: { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: attempt } })
    fixture.event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'main', inputs: { confirmation: 'DEPLOY' } }
    assert.deepEqual(selectFailedHoldRelease(fixture), allowed)
  }
  for (const options of [{ parents: [other] }, { parents: [BASE_COMMIT, other] }, { event: { before: other } },
    { parentsRaw: `${head}\n` }, { notAncestor: true }, { parents: [other], event: { before: '5'.repeat(40) },
      changes: [modification('src/ordinary.ts')], rangeChanges: evidence().data.changes }]) reject(options)
})
test('every exact payload path requires exact old and new bytes, modes and status', () => {
  const complete = evidence().data.changes
  for (const target of complete) {
    reject({ changes: complete.filter(change => change !== target) })
    for (const patch of [{ oldBlob: other }, { newBlob: other }, { oldMode: '100755' }, { newMode: '100755' },
      { newMode: '120000' }, { newMode: '160000' }, { status: 'R100' }, { status: 'D' }, { status: 'T' }])
      reject({ changes: complete.map(change => change === target ? { ...change, ...patch } : change) })
  }
  for (const path of ['server/billing.ts', 'wrangler.jsonc', 'package.json', '.github/workflows/paid.yml',
    'tools/oracle_maintenance/refresh.py', 'ops/unknown.json', 'src/extra.ts']) reject({ changes: [...complete, addition(path)] })
  for (const path of [SCRIPT_PATH, CONFIG_PATH, ...Object.keys(PRESERVED_BLOBS)]) {
    reject({ trees: { [path]: `100644 blob ${other}\t${path}\0` } })
    reject({ trees: { [path]: `120000 blob ${other}\t${path}\0` } })
  }
  reject({ raw: rawChanges(complete).slice(0, -1) })
  reject({ raw: rawChanges([...complete, complete[0]]) })
})
test('event metadata and dispatch confirmation cannot be forged or omitted', () => {
  for (const [key, value] of Object.entries({ GITHUB_REPOSITORY: 'other/repo', GITHUB_REF: 'refs/heads/review',
    GITHUB_SHA: other, GITHUB_EVENT_NAME: 'pull_request', GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '0' })) reject({ env: { [key]: value } })
  for (const key of ['repository', 'ref', 'before', 'after', 'head_commit', 'created', 'deleted', 'forced']) reject({ event: { [key]: undefined } })
  for (const event of [{ ref: 'review' }, { inputs: { confirmation: 'NO' } }, { inputs: { confirmation: 'DEPLOY', extra: true } }, { before: BASE_COMMIT }]) {
    const fixture = evidence({ env: { GITHUB_EVENT_NAME: 'workflow_dispatch' } })
    fixture.event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'main', inputs: { confirmation: 'DEPLOY' }, ...event }
    assert.throws(() => selectFailedHoldRelease(fixture), /FAILED_HOLD_RELEASE_NOT_VERIFIED/)
  }
})
test('manifest and workflow are immutable and the existing deploy job remains byte-identical', () => {
  const raw = readFileSync(join(root, CONFIG_PATH))
  assert.equal(currentWorkflow, guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(raw)))
  assert.equal(blob(baseWorkflow), BASE_WORKFLOW_BLOB)
  assert.equal(currentWorkflow.split('\n  context_tools_preflight:\n')[0], baseWorkflow.split('\n  context_tools_preflight:\n')[0])
  for (const modified of [currentWorkflow + '\n', currentWorkflow.replace('--keep-vars', '--unknown'),
    currentWorkflow.replace("failed_hold_waiver == 'true'", "failed_hold_waiver != 'false'"),
    currentWorkflow.replace('persist-credentials: false', 'persist-credentials: true')])
    assert.throws(() => historicalWorkflow(modified), /FAILED_HOLD_RELEASE_NOT_VERIFIED/)
  for (const workflow of [evidence().data.workflow + '\n', evidence().data.workflow.replace('sha256sum -c -', 'true')]) reject({ workflow })
  if (CONFIG_BLOB === 'UNFROZEN_REFUSE') assert.throws(() => readManifest(raw), /FAILED_HOLD_RELEASE_NOT_VERIFIED/)
  else {
    const manifest = readManifest(raw)
    for (const [path, record] of Object.entries(manifest.payload)) assert.equal(blob(readFileSync(join(root, path))), record.newBlob, path)
    assert.deepEqual(Object.fromEntries(Object.keys(HISTORICAL_TEST_BLOBS).map(path => [path, manifest.payload[path].oldBlob])), HISTORICAL_TEST_BLOBS)
    for (const suffix of ['\n', ' ']) assert.throws(() => readManifest(Buffer.concat([raw, Buffer.from(suffix)])), /FAILED_HOLD_RELEASE_NOT_VERIFIED/)
  }
  for (const [path, expected] of Object.entries(PRESERVED_BLOBS)) assert.equal(blob(readFileSync(join(root, path))), expected, path)
})
test('later waiver edits fail closed and unrelated events retain the prior strict guard decision', () => {
  for (const path of [SCRIPT_PATH, CONFIG_PATH, 'server/failedHoldWaiver.ts', 'tests/failed-hold-extra.test.mjs', 'ops/FAILED_HOLD_UNKNOWN.json'])
    reject({ parents: [other], event: { before: other }, changes: [modification(path)] })
  for (const deployAllowed of [true, false]) {
    const fixture = evidence({ parents: [other], event: { before: other }, changes: [modification('src/ordinary.ts')] })
    let calls = 0
    assert.deepEqual(selectFailedHoldRelease({ ...fixture, legacySelector: options => {
      calls++; assert.equal(options.event, fixture.event); assert.equal(options.git, fixture.git)
      return { deployAllowed }
    } }), { deployAllowed, failedHoldWaiver: false })
    assert.equal(calls, 1)
  }
  const fixture = evidence({ parents: [other], event: { before: other }, changes: [modification(WORKFLOW_PATH)] })
  assert.throws(() => selectFailedHoldRelease({ ...fixture, legacySelector: () => { throw new Error('previous guard refusal') } }), /previous guard refusal/)
})
test('release job has no legacy setup, synchronization, payment or generation command', () => {
  const preflight = currentWorkflow.split('\n  context_tools_preflight:\n')[1].split('\n  failed_hold_release:\n')[0]
  const job = currentWorkflow.split('\n  failed_hold_release:\n')[1]
  assert.doesNotMatch(preflight, /secrets\.|environment:/)
  for (const path of ['scripts/select-context-tools-release.mjs', 'scripts/select-construction-tools-release.mjs', 'config/oracle-construction-tools-release.json', SCRIPT_PATH, CONFIG_PATH]) assert.ok(preflight.includes(path))
  assert.doesNotMatch(job, /connect-|build-live|STRIPE|OPENAI|ORACLE|OWNER_ACCESS|workflow_dispatch:|workflow_run|curl|reconcile|rearm/)
  assert.ok(job.indexOf('--require-waiver') < job.indexOf('secrets.CLOUDFLARE_API_TOKEN'))
  assert.match(job, /npx wrangler deploy --config \.failed-hold-release\.wrangler\.json --keep-vars > \/dev\/null 2>&1/)
  assert.match(job, /run: node scripts\/check-failed-hold-release\.mjs/)
  const secrets = [...job.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1])
  assert.deepEqual([...new Set(secrets)].sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])
})
test('all six existing post-release gates reject this payload without paid or rearm actions', t => {
  const directory = mkdtempSync(join(tmpdir(), 'waiver-downstream-')); t.after(() => rmSync(directory, { recursive: true, force: true }))
  const manifest = JSON.parse(readFileSync(join(root, CONFIG_PATH), 'utf8'))
  const paths = [...Object.keys(manifest.payload), SCRIPT_PATH, CONFIG_PATH, WORKFLOW_PATH]
  assert.equal(paths.some(path => path.startsWith('ops/')), false)
  writeFileSync(join(directory, 'git'), `#!${process.execPath}\nconst args=process.argv.slice(2);\nif(args[0]==='rev-parse') process.stdout.write('${head}\\n');\nelse if(args[0]==='ls-remote') process.stdout.write('${head}\\trefs/heads/main\\n');\nelse if(['show','diff-tree','diff'].includes(args[0])) process.stdout.write(${JSON.stringify(paths.join('\n') + '\n')});\nelse process.exit(2);\n`, { mode: 0o755 })
  for (const name of ['p0-pilot-once', 'p0-pilot-recovery-once', 'shop-mcp2-pilot-once',
    'contest-live-paid-smoke-once', 'oracle-artifact-review-once', 'resume-approved-studio-once']) {
    const workflow = readFileSync(join(root, '.github/workflows', name + '.yml'), 'utf8')
    const gate = workflow.split(/^      - /m).find(step => step.includes('id: gate'))
    const command = gate.match(/        run: \|\n([\s\S]*)$/m)[1].replace(/^ {10}/gm, '').trim()
    const output = join(directory, name + '.output')
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', command], {
      cwd: root, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, GITHUB_OUTPUT: output }, timeout: 15000,
    })
    assert.equal(result.status, 0, `${name}: ${result.stderr}`)
    assert.equal(readFileSync(output, 'utf8'), 'run=false\n', name)
  }
})
test('preserving config removes all vars while retaining every binding, migration and other setting', () => {
  const base = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'))
  base.env = { special: { vars: { sensitive: 'private-fixture' }, durable_objects: base.durable_objects } }
  const config = buildFailedHoldConfig(base, allowed)
  const { vars: _vars, ...remaining } = base
  assert.deepEqual(config, { ...remaining, env: { special: { durable_objects: base.durable_objects } } })
  assert.doesNotMatch(JSON.stringify(config), /"vars"|private-fixture/)
  for (const key of Object.keys(allowed)) assert.throws(() => buildFailedHoldConfig(base, { ...allowed, [key]: !allowed[key] }), /FAILED_HOLD_CONFIG_SCOPE_REQUIRED/)
})
test('anonymous release checks cover exact incident and Shop assets with no POST or private request', async t => {
  const dist = mkdtempSync(join(tmpdir(), 'waiver-smoke-')); t.after(() => rmSync(dist, { recursive: true, force: true }))
  const origin = 'https://worldifact.fixture.workers.dev', versionId = 'fixture-version'
  const files = new Map([
    ['/index.html', '<html><div id="root"></div></html>'], ['/assets/app.js', 'export const app=true'], ['/assets/app.css', 'body{}'],
    ['/apps/chess/index.html', 'Chess'], ['/apps/chess/guest.html', 'Guest'], ['/apps/iss/index.html', 'ISS'], ['/apps/terra/index.html', 'Terra'],
  ])
  files.set('/foundation-release.json', JSON.stringify({ files: [...files].filter(([path]) => path.startsWith('/apps/')).map(([path, bytes]) =>
    ({ path, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') })) }))
  for (const [path, bytes] of files) { mkdirSync(dirname(join(dist, path)), { recursive: true }); writeFileSync(join(dist, path), bytes) }
  const requests = []
  const fetcher = async (url, init) => {
    assert.equal(url.origin, origin); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'manual')
    assert.equal(init.body, undefined); assert.deepEqual(init.headers, { 'Cache-Control': 'no-cache' }); requests.push(url.pathname)
    if (url.pathname === '/api/health') return Response.json({ mode: 'READY', generationReady: true })
    if (url.pathname === '/api/account/failed-hold-waiver') return Response.json({ error: 'Authentication required.' }, { status: 401 })
    assert.equal(url.pathname.startsWith('/api/'), false)
    return new Response(files.get(url.pathname) ?? files.get('/index.html'), { headers: { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.json') ? 'application/json' : 'text/html' } })
  }
  const receipt = { origin, versionId }
  const result = await checkFailedHoldRelease(receipt, { dist, fetcher, retryDelaysMs: [] })
  assert.equal(result.verifiedAssets, files.size)
  assert.deepEqual(requests.filter(path => path.startsWith('/api/')), ['/api/health', '/api/account/failed-hold-waiver'])
  assert.ok(requests.includes('/account/failed-hold-waiver')); assert.ok(requests.includes('/chess/shop'))
  for (const target of ['/account/failed-hold-waiver', '/api/account/failed-hold-waiver']) {
    await assert.rejects(checkFailedHoldRelease(receipt, { dist, retryDelaysMs: [], fetcher: (url, init) => url.pathname === target
      ? Response.json({ private: 'private-fixture' }, { status: 200 }) : fetcher(url, init) }))
  }
})
test('exclusive traffic requires one current version at 100% and reads only deployment metadata', async () => {
  const versionId = '11111111-1111-4111-8111-111111111111', previous = '22222222-2222-4222-8222-222222222222'
  const active = { id: '33333333-3333-4333-8333-333333333333', created_on: '2026-10-09T03:00:00.000Z',
    strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }
  const env = { CLOUDFLARE_API_TOKEN: 'private-fixture-token-123456', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }
  let calls = 0
  const verify = value => verifyExclusiveDeployment({ versionId }, { env, fetcher: async (url, init) => {
    calls++; assert.equal(url.href, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/worldifact/deployments`)
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert.equal(init.body, undefined)
    assert.equal(init.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`)
    return Response.json(value)
  } })
  assert.deepEqual(await verify({ success: true, result: { deployments: [active] } }), { versionId, percentage: 100 })
  for (const deployments of [[], [{ ...active, versions: [{ version_id: previous, percentage: 100 }] }],
    [{ ...active, versions: [{ version_id: versionId, percentage: 50 }, { version_id: previous, percentage: 50 }] }],
    [{ ...active, versions: [{ version_id: versionId, percentage: '100' }] }],
    [{ ...active, strategy: 'unknown' }], [active, { ...active, created_on: '2026-10-09T04:00:00.000Z' }]])
    await assert.rejects(verify({ success: true, result: { deployments } }))
  await assert.rejects(verify({ success: false, result: { deployments: [active] } }))
  assert.equal(calls, 8)
})
test('stage failures never report upstream content and a validated receipt precedes static checks', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'waiver-report-')); t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'receipt.ndjson')
  const valid = JSON.stringify({ type: 'deploy', version: 1, worker_name: 'worldifact', version_id: 'fixture-version', targets: ['https://worldifact.fixture.workers.dev'] })
  for (const fail of ['release_scope', 'deployment_receipt', 'health', 'static_assets', 'incident_route', 'anonymous_guard', 'exclusive_traffic', '']) {
    const lines = []
    writeFileSync(path, fail === 'deployment_receipt' ? '{"secret":"private-fixture"}' : valid)
    const passed = await reportFailedHoldRelease({ env: { WRANGLER_OUTPUT_FILE_PATH: path }, report: { log: value => lines.push(value), error: value => lines.push(value) },
      select: () => { if (fail === 'release_scope') throw new Error('private-fixture'); return allowed },
      check: async (deployment, options) => {
        assert.match(lines[0], /^Cloudflare version: fixture-version$/)
        if (fail && fail !== 'exclusive_traffic') { options.onStage(fail); throw new Error('private-fixture') }
        return { ...deployment, htmlRoutes: 13, verifiedAssets: 10 }
      }, verifyTraffic: async () => { if (fail === 'exclusive_traffic') throw new Error('private-fixture') } })
    assert.equal(passed, !fail); assert.doesNotMatch(lines.join('\n'), /private-fixture/)
    if (fail) assert.match(lines.at(-1), new RegExp(`^FAILED_HOLD_RELEASE_NOT_VERIFIED: ${fail};`))
  }
})
test('CLI refuses missing evidence, unknown arguments, symlinked events and credential forwarding', t => {
  const directory = mkdtempSync(join(tmpdir(), 'waiver-cli-')); t.after(() => rmSync(directory, { recursive: true, force: true }))
  const gitPath = join(directory, 'git')
  writeFileSync(gitPath, `#!${process.execPath}\nif (process.env.CLOUDFLARE_API_TOKEN || process.env.STRIPE_SECRET_KEY) { require('node:fs').writeFileSync('credential-leaked','true'); process.exit(1) }\nprocess.stdout.write('${head}\\n');\n`, { mode: 0o755 })
  const event = join(directory, 'event.json'); writeFileSync(event, '{}'); symlinkSync(event, join(directory, 'event-link.json'))
  for (const args of [[], ['--require-waiver'], ['--unknown'], ['--require-waiver', '--extra']]) {
    const result = spawnSync(process.execPath, [join(root, SCRIPT_PATH), ...args], { cwd: directory, encoding: 'utf8',
      env: { PATH: `${directory}:${process.env.PATH}`, GITHUB_EVENT_PATH: join(directory, 'event-link.json'), CLOUDFLARE_API_TOKEN: 'private-fixture', STRIPE_SECRET_KEY: 'private-fixture' } })
    assert.equal(result.status, 1); assert.equal(result.stdout, '')
    assert.match(result.stderr, /^FAILED_HOLD_RELEASE_NOT_VERIFIED:/); assert.doesNotMatch(result.stderr, /credential-leaked|private-fixture/)
    assert.equal(existsSync(join(directory, 'credential-leaked')), false)
  }
})
