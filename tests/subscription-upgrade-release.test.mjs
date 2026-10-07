import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { buildSubscriptionUpgradeConfig } from '../scripts/build-compatible-mcc-config.mjs'
import { checkSubscriptionUpgradeRelease } from '../scripts/check-compatible-mcc-release.mjs'
import {
  SUBSCRIPTION_UPGRADE_BASE_COMMIT as BASE, SUBSCRIPTION_UPGRADE_MARKER_PATH as MARKER,
  SUBSCRIPTION_UPGRADE_MARKER_CONTENT as CONTENT, SUBSCRIPTION_UPGRADE_REVIEWED_PATHS as PATHS,
  COMPATIBLE_MCC_BASE_COMMIT, COMPATIBLE_MCC_MARKER_PATH, COMPATIBLE_MCC_MARKER_CONTENT,
  selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const options = { preserveBilling: true, preserveRemoteVars: true, subscriptionUpgradeRepair: true, preserveSecrets: true }
const changes = PATHS.map(path => ({ path, status: [MARKER, 'tests/subscription-upgrade-release.test.mjs'].includes(path) ? 'A' : 'M' }))
const tree = PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
function select(overrides = {}) {
  const value = { parent: BASE, changes, parents: null, marker: CONTENT, mode: '100644', tree, ...overrides }
  return selectPipelineReleaseOptions('fixture', (_cwd, args) => {
    if (args[0] === 'rev-parse') return (args.at(-1) === 'HEAD^{commit}' ? head : value.parent) + '\n'
    if (args[0] === 'diff') return value.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    if (args[0] === 'rev-list') return value.parents ?? `${head} ${value.parent}\n`
    if (args[0] === 'ls-tree') return args.length > 5 ? value.tree : `${value.mode} blob ${blob}\t${MARKER}\0`
    assert.deepEqual(args, ['cat-file', 'blob', blob]); return value.marker
  })
}

test('subscription upgrade repair is a new nine-file scope at its current production parent', () => {
  assert.equal(BASE, '29b6b9af08d62baafddceb029652db321ec83273')
  assert.notEqual(BASE, COMPATIBLE_MCC_BASE_COMMIT)
  assert.notEqual(MARKER, COMPATIBLE_MCC_MARKER_PATH)
  assert.equal(readFileSync(new URL('../' + MARKER, import.meta.url), 'utf8'), CONTENT)
  assert.deepEqual(JSON.parse(CONTENT), {
    release: 'settled-subscription-upgrade-repair-20261007', baseCommit: BASE,
    preserveBilling: true, preserveRemoteVars: true, preserveSecrets: true, subscriptionUpgradeRepair: true,
  })
  assert.deepEqual(select(), options)
  assert.equal(Object.hasOwn(select(), 'compatibleMccRollback'), false)
  assert.deepEqual(PATHS, [
    '.github/workflows/cloudflare.yml', 'docs/CONTEST_STATUS.md', MARKER,
    'scripts/build-compatible-mcc-config.mjs', 'scripts/check-compatible-mcc-release.mjs',
    'scripts/select-pipeline-only-release.mjs', 'server/billing.ts',
    'tests/billing-recovery.test.ts', 'tests/subscription-upgrade-release.test.mjs',
  ].sort())
})

test('wrong parent, missing history, extra parent, incomplete scope and unreviewed runtime changes refuse', () => {
  const invalid = [
    { parent: COMPATIBLE_MCC_BASE_COMMIT }, { parent: '3'.repeat(40) }, { parent: '' },
    { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` }, { parents: `${head}\n` },
    ...PATHS.map(path => ({ changes: changes.filter(change => change.path !== path) })),
    ...['server/studio.ts', 'server/worker.ts', 'server/entitlements.ts', 'wrangler.jsonc', 'package.json', COMPATIBLE_MCC_MARKER_PATH].map(path => ({ changes: [...changes, { status: 'M', path }] })),
    { changes: [...changes, changes[0]] },
    ...PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === path ? { ...change, status } : change) }))),
  ]
  for (const value of invalid) assert.throws(() => select(value), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('modified or reused markers and executable, symlink or submodule files refuse', () => {
  const invalid = [
    { marker: CONTENT + '\n' }, { marker: '{}' }, { marker: COMPATIBLE_MCC_MARKER_CONTENT },
    { marker: CONTENT.replace(BASE, '3'.repeat(40)) },
    ...['preserveBilling', 'preserveRemoteVars', 'preserveSecrets', 'subscriptionUpgradeRepair'].map(key => ({ marker: CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...['M', 'D', 'T'].map(status => ({ changes: changes.map(change => change.path === MARKER ? { ...change, status } : change) })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({ tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`) }))),
    { tree: tree.slice(0, -1) }, { tree: tree.replace('blob', 'commit') },
  ]
  for (const value of invalid) assert.throws(() => select(value), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('markerless rebases refuse and later ordinary releases do not inherit the repair mode', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', 'tests/subscription-upgrade-release.test.mjs'])
    assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => select({ changes: [] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['M', 'D', 'T']) assert.throws(() => select({ parent: head, changes: [{ status, path: MARKER }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.deepEqual(select({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] }), { preserveBilling: false, preserveRemoteVars: false })
})

test('repair config omits every declared variable while preserving all non-variable runtime settings', () => {
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  const snapshot = structuredClone(base), { vars: _vars, ...withoutVars } = base
  const config = buildSubscriptionUpgradeConfig(base, options)
  assert.deepEqual(config, withoutVars)
  assert.deepEqual(base, snapshot)
  const overridden = buildSubscriptionUpgradeConfig({ ...base, env: { production: { vars: { PRIVATE_FIXTURE: 'never-deploy-me' }, durable_objects: base.durable_objects } } }, options)
  assert.equal(Object.hasOwn(overridden.env.production, 'vars'), false)
  assert.equal(JSON.stringify(overridden).includes('never-deploy-me'), false)
  assert.deepEqual(overridden.env.production.durable_objects, base.durable_objects)
  for (const value of [undefined, {}, { compatibleMccRollback: true, preserveBilling: true, preserveRemoteVars: true }, ...Object.keys(options).map(key => ({ ...options, [key]: false }))])
    assert.throws(() => buildSubscriptionUpgradeConfig(base, value), /SUBSCRIPTION_UPGRADE_SCOPE_REQUIRED/)
})

const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
const steps = workflow.split(/(?=^      - )/m).slice(1)
test('repair scope is checked before credentials and skips all financial, secret and Oracle mutation steps', () => {
  assert.ok(steps.findIndex(step => step.includes('id: billing_scope')) < steps.findIndex(step => step.includes('CLOUDFLARE_API_TOKEN:')))
  const financial = steps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step))
  assert.equal(financial.length, 5)
  for (const step of financial) assert.match(step, /if: steps\.billing_scope\.outputs\.preserve_billing == 'false'/)
  for (const name of ['connect-openai.ts', 'connect-platform.ts', 'inspectWorldifactServices'])
    assert.match(steps.find(step => step.includes(name)), /if: steps\.mode\.outputs\.mode != 'PRESERVE'/)
  for (const step of steps.filter(value => /restore-detailed-studio-config|\/api\/studio\//.test(value)))
    assert.match(step, /if: steps\.mode\.outputs\.mode == 'LIVE'/)
  const deploy = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.match(deploy, /preserve_remote_vars[\s\S]*--keep-vars/)
  assert.doesNotMatch(deploy, /--var(?:\s|=)|secrets? (put|bulk|delete)/)
  assert.match(steps.find(step => step.includes('id: release')), /check-compatible-mcc-release\.mjs --subscription-upgrade-repair/)
})

test('actual mode-selection shell uses the explicit repair config while retaining ordinary and prior modes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'upgrade-mode-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts')); await mkdir(join(directory, 'ops'))
  for (const name of ['build-compatible-mcc-config.mjs', 'build-live-generation-config.ts'])
    await writeFile(join(directory, 'scripts', name), `console.log('${name} ' + process.argv.slice(2).join(' '))\n`)
  const run = steps.find(step => step.includes('id: mode')).match(/        run: \|\n([\s\S]*)/)[1].replace(/^ {10}/gm, '')
  for (const repair of ['true', 'false', '']) for (const compatible of ['true', 'false']) for (const live of [true, false]) {
    const marker = join(directory, 'ops/LIVE_GENERATION_ONGOING_20260919')
    if (live) await writeFile(marker, '')
    else await rm(marker, { force: true })
    const output = join(directory, 'output'); await writeFile(output, '')
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', run.replaceAll('${{ steps.billing_scope.outputs.compatible_mcc_rollback }}', compatible)], {
      cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, SUBSCRIPTION_UPGRADE_REPAIR: repair }, timeout: 15000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(await readFile(output, 'utf8'), repair === 'true' ? 'config=.subscription-upgrade.wrangler.json\nsubscription_upgrade_repair=true\nmode=PRESERVE\n' : compatible === 'true' ? 'config=.compatible-mcc.wrangler.json\nmode=PRESERVE\n' : live ? 'config=.live-generation.wrangler.json\nmode=LIVE\n' : 'config=wrangler.jsonc\nmode=DEMO\n')
    assert.equal(result.stdout.includes('--subscription-upgrade-repair'), repair === 'true')
    if (repair === 'true') assert.doesNotMatch(result.stdout, /rollback|build-live-generation/)
  }
})

test('CLI rejects invalid evidence before the credential stage and never forwards credential environment', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'upgrade-cli-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const selector = fileURLToPath(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url))
  const cases = [
    {},
    { parent: '3'.repeat(40) }, { changes: changes.filter(change => change.path !== MARKER) },
    { marker: CONTENT + '\n' }, { changes: [...changes, { status: 'M', path: 'wrangler.jsonc' }] },
    { tree: tree.replace('100644', '120000') }, { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` },
  ]
  for (const value of cases) {
    const data = { parent: BASE, changes, marker: CONTENT, tree, parents: `${head} ${BASE}\n`, ...value }
    await writeFile(join(directory, 'git'), `#!${process.execPath}\nconst data = ${JSON.stringify(data)}; const args = process.argv.slice(3);\nif (process.env.CLOUDFLARE_API_TOKEN || process.env.STRIPE_SECRET_KEY) process.exit(19);\nlet result;\nif (args[0] === 'rev-parse') result = (args.at(-1) === 'HEAD^{commit}' ? '${head}' : data.parent) + '\\n';\nelse if (args[0] === 'diff') result = data.changes.map(({status, path}) => status + '\\0' + path + '\\0').join('');\nelse if (args[0] === 'rev-list') result = data.parents;\nelse if (args[0] === 'ls-tree') result = args.length > 5 ? data.tree : '100644 blob ${blob}\\t${MARKER}\\0';\nelse if (args[0] === 'cat-file') result = data.marker;\nelse process.exit(20);\nprocess.stdout.write(result);\n`, { mode: 0o755 })
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', '"$NODE" "$SELECTOR" >> output; touch credentials-reached'], {
      cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, NODE: process.execPath, SELECTOR: selector, CLOUDFLARE_API_TOKEN: 'private-fixture', STRIPE_SECRET_KEY: 'private-fixture' }, timeout: 15000,
    })
    if (Object.keys(value).length === 0) {
      assert.equal(result.status, 0, result.stderr)
      assert.equal(await readFile(join(directory, 'output'), 'utf8'), 'preserve_billing=true\npreserve_remote_vars=true\nsubscription_upgrade_repair=true\n')
      assert.equal(existsSync(join(directory, 'credentials-reached')), true)
      await rm(join(directory, 'credentials-reached'))
      continue
    }
    assert.equal(result.status, 1)
    assert.match(result.stderr, /publication stopped before credential setup/)
    assert.doesNotMatch(result.stderr + result.stdout, /private-fixture/)
    assert.equal(existsSync(join(directory, 'credentials-reached')), false)
  }
})

const origin = 'https://worldifact.fixture.workers.dev', versionId = 'fixture-version'
test('explicit repair checker uses only anonymous GET health/static requests with exact deployed bytes', async t => {
  const dist = await mkdtemp(join(tmpdir(), 'upgrade-smoke-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const files = new Map([
    ['/index.html', '<html><div id="root"></div></html>'], ['/assets/app.js', 'export const app = true;'], ['/assets/app.css', 'body{color:green}'],
    ['/apps/chess/index.html', '<html>Chess</html>'], ['/apps/chess/guest.html', '<html>Guest</html>'],
    ['/apps/iss/index.html', '<html>ISS</html>'], ['/apps/terra/index.html', '<html>Terra</html>'],
  ])
  files.set('/foundation-release.json', JSON.stringify({ files: [...files].filter(([path]) => path.startsWith('/apps/')).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') })) }))
  for (const [path, bytes] of files) { await mkdir(dirname(join(dist, path)), { recursive: true }); await writeFile(join(dist, path), bytes) }
  const requests = []
  const fetcher = async (url, init) => {
    requests.push(url.pathname)
    assert.equal(url.origin, origin); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'manual')
    assert.equal(init.body, undefined); assert.equal(init.headers.Authorization, undefined)
    if (url.pathname === '/api/health') return Response.json({ mode: 'READY', generationReady: true })
    assert.equal(url.pathname.startsWith('/api/'), false)
    const contentType = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.json') ? 'application/json' : 'text/html'
    return new Response(files.get(url.pathname) ?? files.get('/index.html'), { headers: { 'Content-Type': contentType } })
  }
  for (const value of [undefined, {}, { compatibleMccRollback: true, preserveBilling: true, preserveRemoteVars: true }, ...Object.keys(options).map(key => ({ ...options, [key]: false }))])
    await assert.rejects(checkSubscriptionUpgradeRelease({ origin, versionId }, value, { dist, fetcher, retryDelaysMs: [] }), /Subscription upgrade release scope/)
  assert.equal(requests.length, 0)
  const result = await checkSubscriptionUpgradeRelease({ origin, versionId }, options, { dist, fetcher, retryDelaysMs: [] })
  assert.equal(result.verifiedAssets, files.size)
  assert.deepEqual(requests.filter(path => path.startsWith('/api/')), ['/api/health'])
  await assert.rejects(checkSubscriptionUpgradeRelease({ origin, versionId }, options, { dist, retryDelaysMs: [], fetcher: (url, init) => url.pathname === '/assets/app.js' ? new Response('changed', { headers: { 'Content-Type': 'text/javascript' } }) : fetcher(url, init) }), /Release bytes or MIME/)
})
