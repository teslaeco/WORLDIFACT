import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildCompatibleMccConfig } from '../scripts/build-compatible-mcc-config.mjs'
import { checkCompatibleMccRelease } from '../scripts/check-compatible-mcc-release.mjs'
import {
  COMPATIBLE_MCC_BASE_COMMIT as BASE, COMPATIBLE_MCC_MARKER_PATH as MARKER,
  COMPATIBLE_MCC_MARKER_CONTENT as CONTENT, COMPATIBLE_MCC_REVIEWED_PATHS as PATHS,
  selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const options = { preserveBilling: true, preserveRemoteVars: true, compatibleMccRollback: true }
const changes = PATHS.map(path => ({ path, status: path === MARKER ? 'A' : 'M' }))
function select(overrides = {}) {
  const value = { parent: BASE, changes, parents: null, marker: CONTENT, mode: '100644', tree: null, avatarBase: "export const DEFAULT_WORLD_AVATAR = 'terraformer' satisfies AvatarAsset\n// current session lifecycle\n", avatarCurrent: "export const DEFAULT_WORLD_AVATAR = 'queen' satisfies AvatarAsset\n// current session lifecycle\n", ...overrides }
  return selectPipelineReleaseOptions('fixture', (_cwd, args) => {
    if (args[0] === 'rev-parse') return (args.at(-1) === 'HEAD^{commit}' ? head : value.parent) + '\n'
    if (args[0] === 'diff') return value.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    if (args[0] === 'rev-list') return value.parents ?? `${head} ${value.parent}\n`
    if (args[0] === 'ls-tree') return args.length > 5
      ? value.tree ?? PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
      : `${value.mode} blob ${blob}\t${MARKER}\0`
    if (args.at(-1) === `${BASE}:src/lib/avatarPreloadLifecycle.ts`) return value.avatarBase
    if (args.at(-1) === `${head}:src/lib/avatarPreloadLifecycle.ts`) return value.avatarCurrent
    assert.deepEqual(args, ['cat-file', 'blob', blob]); return value.marker
  })
}

test('compatible rollback has its own canonical marker and exact current single parent', () => {
  assert.equal(BASE, '9b2a5a9e48424e11d2d8ddc9b360ec110544a508')
  assert.equal(readFileSync(new URL('../' + MARKER, import.meta.url), 'utf8'), CONTENT)
  assert.deepEqual(select(), options)
  assert.deepEqual(PATHS, [
  ".github/workflows/cloudflare.yml",
  "docs/COMPATIBLE_MCC_RESTORATION.md",
  "docs/CONTEST_STATUS.md",
  "ops/COMPATIBLE_MCC_ROLLBACK_RELEASE_20261006.json",
  "scripts/build-compatible-mcc-config.mjs",
  "scripts/check-compatible-mcc-release.mjs",
  "scripts/select-pipeline-only-release.mjs",
  "src/App.tsx",
  "src/components/GenerationCostNotice.tsx",
  "src/components/P0GameLab.tsx",
  "src/components/PortalAstraGenerator.tsx",
  "src/components/WorldStudio.tsx",
  "src/lib/avatarPreloadLifecycle.ts",
  "src/pages/PortalPage.tsx",
  "src/pages/ShopPage.css",
  "src/pages/ShopPage.tsx",
  "tests/account-entry-routing.test.mjs",
  "tests/avatar-preload-lifecycle.test.ts",
  "tests/compatible-mcc-release.test.mjs",
  "tests/contest-finish.test.mjs",
  "tests/contest-hotfix.test.ts",
  "tests/generation-profile-client.test.mjs",
  "tests/historical-blueprint-bindings.test.mjs",
  "tests/mcc-compatible-storage.test.ts",
  "tests/pipeline-only-release.test.mjs",
  "tests/portal-entry.test.mjs",
  "tests/private-game-lab-render.test.mjs",
  "tests/prompt-model-ui.test.mjs",
  "tests/shop-draft-lifecycle.test.mjs",
  "tests/shop-external.test.mjs"
].sort())
  assert.equal(PATHS.some(path => path === 'wrangler.jsonc' || path.startsWith('server/') || (path.startsWith('src/lib/') && path !== 'src/lib/avatarPreloadLifecycle.ts')), false)
  assert.equal(PATHS.filter(path => path.startsWith('ops/')).length, 1)
})
test('wrong scope, parent, marker, merge or regular-file evidence fails closed', () => {
  const tree = PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  const invalid = [
    { parent: '3'.repeat(40) }, { parent: '' }, { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` },
    ...PATHS.map(path => ({ changes: changes.filter(change => change.path !== path) })),
    ...['server/worker.ts', 'server/entitlements.ts', 'server/billing.ts', 'src/lib/studioLibrary.ts', 'src/lib/modelCatalog.ts', 'wrangler.jsonc', 'package.json', 'ops/MODEL_PREVIEW_RELEASE_20261006.json'].map(path => ({ changes: [...changes, { status: 'M', path }] })),
    { changes: [...changes, changes[0]] },
    ...PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === path ? { ...change, status } : change) }))),
    { marker: CONTENT + '\n' }, { marker: '{}' }, { marker: CONTENT.replace(BASE, '3'.repeat(40)) },
    ...['preserveBilling', 'preserveRemoteVars', 'preserveSecrets', 'compatibleMccRollback'].map(key => ({ marker: CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({ tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`) }))),
    { tree: tree.slice(0, -1) }, { tree: tree.replace('blob', 'commit') },
    { avatarCurrent: "export const DEFAULT_WORLD_AVATAR = 'queen' satisfies AvatarAsset\n" },
    { avatarBase: "export const DEFAULT_WORLD_AVATAR = 'queen' satisfies AvatarAsset\n" },
    { avatarCurrent: "export const DEFAULT_WORLD_AVATAR = 'queen' satisfies AvatarAsset\n// changed lifecycle\n" },
  ]
  for (const fixture of invalid) assert.throws(() => select(fixture), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})
test('markerless rebases cannot silently activate ordinary secret or payment steps', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', 'scripts/build-compatible-mcc-config.mjs', 'scripts/check-compatible-mcc-release.mjs', 'tests/compatible-mcc-release.test.mjs'])
    assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['M', 'D', 'T']) assert.throws(() => select({ changes: changes.map(change => change.path === MARKER ? { ...change, status } : change) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.deepEqual(select({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] }), { preserveBilling: false, preserveRemoteVars: false })
})
test('derived deploy config omits every explicit variable and preserves current bindings and migrations', () => {
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  const snapshot = structuredClone(base)
  const { vars: _vars, ...withoutVars } = base
  const config = buildCompatibleMccConfig(base, options)
  assert.deepEqual(config, withoutVars)
  assert.deepEqual(base, snapshot)
  assert.deepEqual(config.durable_objects, base.durable_objects)
  assert.deepEqual(config.migrations, base.migrations)
  assert.equal(Object.hasOwn(config, 'vars'), false)
  const overridden = buildCompatibleMccConfig({ ...base, env: { production: { vars: { PRIVATE_FIXTURE: 'never-deploy-me' }, durable_objects: base.durable_objects } } }, options)
  assert.equal(Object.hasOwn(overridden.env.production, 'vars'), false)
  assert.equal(JSON.stringify(overridden).includes('never-deploy-me'), false)
  assert.deepEqual(overridden.env.production.durable_objects, base.durable_objects)
  for (const invalid of [undefined, {}, { ...options, compatibleMccRollback: false }, { ...options, preserveBilling: false }, { ...options, preserveRemoteVars: false }])
    assert.throws(() => buildCompatibleMccConfig(base, invalid), /COMPATIBLE_MCC_SCOPE_REQUIRED/)
  for (const invalid of [{ ...base, name: 'other' }, { ...base, main: 'other.ts' }, { ...base, durable_objects: undefined }, { ...base, migrations: undefined }])
    assert.throws(() => buildCompatibleMccConfig(invalid, options), /COMPATIBLE_MCC_CONFIG_NOT_REVIEWED/)
})

const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
const steps = workflow.split(/(?=^      - )/m).slice(1)
test('compatible workflow skips all secret sync, financial setup/checks and non-health status probes', () => {
  const configStep = steps.find(step => step.includes('id: mode'))
  assert.match(configStep, /compatible_mcc_rollback[\s\S]*build-compatible-mcc-config\.mjs[\s\S]*mode=PRESERVE[\s\S]*elif test -f ops\/LIVE_GENERATION_ONGOING_20260919/)
  const financial = steps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step))
  assert.equal(financial.length, 5)
  for (const step of financial) assert.match(step, /if: steps\.billing_scope\.outputs\.preserve_billing == 'false'/)
  for (const name of ['connect-openai.ts', 'connect-platform.ts', 'inspectWorldifactServices']) {
    const step = steps.find(value => value.includes(name))
    assert.ok(step, name)
    assert.match(step, /if: steps\.mode\.outputs\.mode != 'PRESERVE'/)
  }
  for (const step of steps.filter(value => /restore-detailed-studio-config|\/api\/studio\//.test(value)))
    assert.match(step, /if: steps\.mode\.outputs\.mode == 'LIVE'/)
  const smoke = steps.find(step => step.includes('id: release'))
  assert.match(smoke, /mode \}\}" = 'PRESERVE'; then\s+node scripts\/check-compatible-mcc-release\.mjs\s+else\s+node scripts\/release-check\.ts smoke/)
  const deploy = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.match(deploy, /preserve_remote_vars[\s\S]*--keep-vars/)
  assert.doesNotMatch(deploy, /--var(?:\s|=)|secrets? (put|bulk|delete)/)
})
test('mode selection takes no-vars rollback branch only for the verified scope and retains ordinary LIVE/DEMO branches', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compatible-workflow-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts')); await mkdir(join(directory, 'ops'))
  for (const name of ['build-compatible-mcc-config.mjs', 'build-live-generation-config.ts'])
    await writeFile(join(directory, 'scripts', name), `console.log('${name}')\n`)
  const configStep = steps.find(step => step.includes('id: mode'))
  const run = configStep.match(/        run: \|\n([\s\S]*)/)[1].replace(/^ {10}/gm, '')
  for (const compatible of ['true', 'false', '']) {
    for (const live of [true, false]) {
      const marker = join(directory, 'ops/LIVE_GENERATION_ONGOING_20260919')
      if (live) await writeFile(marker, '')
      else await rm(marker, { force: true })
      const output = join(directory, 'output')
      await writeFile(output, '')
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', run.replaceAll('${{ steps.billing_scope.outputs.compatible_mcc_rollback }}', compatible)], {
        cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output }, timeout: 15000,
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(await readFile(output, 'utf8'), compatible === 'true' ? 'config=.compatible-mcc.wrangler.json\nmode=PRESERVE\n' : live ? 'config=.live-generation.wrangler.json\nmode=LIVE\n' : 'config=wrangler.jsonc\nmode=DEMO\n')
      assert.equal(result.stdout.includes('build-compatible-mcc-config.mjs'), compatible === 'true')
      assert.equal(result.stdout.includes('build-live-generation-config.ts'), compatible !== 'true' && live)
    }
  }
})

const origin = 'https://worldifact.fixture.workers.dev', versionId = 'fixture-version'
async function fixture(t) {
  const dist = await mkdtemp(join(tmpdir(), 'compatible-smoke-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const files = new Map([
    ['/index.html', '<html><div id="root"></div></html>'], ['/assets/app.js', 'export const app = true;'], ['/assets/app.css', 'body{color:green}'],
    ['/apps/chess/index.html', '<html>Chess</html>'], ['/apps/chess/guest.html', '<html>Guest</html>'],
    ['/apps/iss/index.html', '<html>ISS</html>'], ['/apps/terra/index.html', '<html>Terra</html>'],
  ])
  const foundation = { files: [...files].filter(([path]) => path.startsWith('/apps/')).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') })) }
  files.set('/foundation-release.json', JSON.stringify(foundation))
  for (const [path, bytes] of files) { await mkdir(dirname(join(dist, path)), { recursive: true }); await writeFile(join(dist, path), bytes) }
  await writeFile(join(dist, '_headers'), '/assets/*\n  Cache-Control: public, max-age=60\n')
  await writeFile(join(dist, '_redirects'), '/old /new 301\n')
  const requests = []
  const fetcher = async (url, init) => {
    requests.push({ path: url.pathname, init })
    assert.equal(url.origin, origin)
    assert.equal(init.method, 'GET')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.redirect, 'manual')
    assert.equal(init.body, undefined)
    assert.equal(init.headers.Authorization, undefined)
    if (url.pathname === '/api/health') return Response.json({ mode: 'DEMO', generationReady: false })
    assert.equal(url.pathname.startsWith('/api/'), false, `Unexpected API request: ${url.pathname}`)
    const contentType = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.json') ? 'application/json' : 'text/html'
    return new Response(files.get(url.pathname) ?? files.get('/index.html'), { headers: { 'Content-Type': contentType } })
  }
  return { dist, files, fetcher, requests }
}
test('compatible smoke verifies exact built bytes using only nonfinancial GETs', async t => {
  const data = await fixture(t)
  const result = await checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [] })
  assert.equal(result.verifiedAssets, data.files.size)
  assert.equal(data.requests.some(request => ['/_headers', '/_redirects'].includes(request.path)), false)
  assert.ok(result.htmlRoutes >= 8)
  assert.deepEqual(data.requests.filter(request => request.path.startsWith('/api/')).map(request => request.path), ['/api/health'])
})
test('compatible smoke rejects wrong hashes, MIME, health and external or financial redirects', async t => {
  const data = await fixture(t)
  for (const replacement of [() => new Response('changed bytes', { headers: { 'Content-Type': 'text/javascript' } }), () => new Response(data.files.get('/assets/app.js'), { headers: { 'Content-Type': 'text/plain' } })]) {
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [], fetcher: (url, init) => url.pathname === '/assets/app.js' ? replacement() : data.fetcher(url, init) }), /Release bytes or MIME/)
  }
  for (const location of ['https://example.invalid/', '/api/billing/status', '/api/studio/status', '/api/health?private=1'])
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [], fetcher: (url, init) => url.pathname === '/' ? new Response(null, { status: 302, headers: { Location: location } }) : data.fetcher(url, init) }), /Unreviewed static redirect/)
  await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [], fetcher: (url, init) => url.pathname === '/api/health' ? Response.json({ mode: 'unknown' }) : data.fetcher(url, init) }), /health contract/)
})
test('compatible smoke accepts only same-origin canonical HTML redirects', async t => {
  const data = await fixture(t)
  await checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [], fetcher: (url, init) => {
    if (url.pathname === '/apps/chess/index.html') return new Response(null, { status: 308, headers: { Location: './' } })
    if (url.pathname === '/apps/chess/') return new Response(data.files.get('/apps/chess/index.html'), { headers: { 'Content-Type': 'text/html' } })
    return data.fetcher(url, init)
  } })
})
test('unreviewed local API paths and broken foundation integrity fail without endpoint requests', async t => {
  const data = await fixture(t)
  await writeFile(join(data.dist, 'apps/chess/index.html'), 'tampered foundation')
  await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [] }), /Foundation changed/)
  await mkdir(join(data.dist, 'api/billing'), { recursive: true }); await writeFile(join(data.dist, 'api/billing/status'), 'unreviewed')
  await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { ...data, retryDelaysMs: [] }), /Unreviewed release asset path/)
  assert.equal(data.requests.some(request => request.path === '/api/billing/status'), false)
})
