import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { buildAiShopUiConfig } from '../scripts/build-compatible-mcc-config.mjs'
import { readPublicGalleryAssets, verifyPublicGalleryAssets } from '../scripts/prepare-public-gallery.mjs'
import { checkCompatibleMccRelease } from '../scripts/check-compatible-mcc-release.mjs'
import {
  AI_SHOP_UI_BASE_COMMIT as BASE, AI_SHOP_UI_MARKER_PATH as MARKER,
  AI_SHOP_UI_MARKER_CONTENT as CONTENT, AI_SHOP_UI_REVIEWED_PATHS as PATHS,
  COMPATIBLE_MCC_BASE_COMMIT, COMPATIBLE_MCC_MARKER_PATH, COMPATIBLE_MCC_MARKER_CONTENT,
  selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const galleryAssets = await readPublicGalleryAssets()
const head = '1'.repeat(40), blob = '2'.repeat(40)
const options = { preserveBilling: true, preserveRemoteVars: true, aiShopUi: true, preserveSecrets: true }
const introductions = [MARKER, '.github/workflows/ai-shop-integration-check.yml', 'scripts/prepare-public-gallery.mjs', 'src/components/PublicModelGallery.css', 'src/components/PublicModelGallery.tsx', 'src/lib/publicGallery.ts', 'src/lib/studioTierSelection.ts', 'tests/ai-shop-ui-release.test.mjs']
const changes = PATHS.map(path => ({ path, status: introductions.includes(path) ? 'A' : 'M' }))
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

test('AI Shop UI and public gallery is a fresh complete scope at its provisional reviewed parent', () => {
  assert.equal(BASE, '962309ab650fc7cfd93106544bb7d6dd52d0baf5')
  assert.notEqual(BASE, COMPATIBLE_MCC_BASE_COMMIT)
  assert.notEqual(MARKER, COMPATIBLE_MCC_MARKER_PATH)
  assert.equal(readFileSync(new URL('../' + MARKER, import.meta.url), 'utf8'), CONTENT)
  assert.deepEqual(JSON.parse(CONTENT), {
    release: 'ai-shop-ui-and-public-gallery-20261007', baseCommit: BASE,
    preserveBilling: true, preserveRemoteVars: true, preserveSecrets: true, aiShopUi: true,
  })
  assert.deepEqual(select(), options)
  assert.equal(Object.hasOwn(select(), 'compatibleMccRollback'), false)
  assert.equal(Object.hasOwn(select(), 'subscriptionUpgradeRepair'), false)
  assert.equal(PATHS.length, 35)
  assert.equal(PATHS.some(path => path.startsWith('server/') || path === 'wrangler.jsonc' || path === 'docs/CONTEST_STATUS.md'), false)
  assert.deepEqual(PATHS, [
    '.github/workflows/ai-shop-integration-check.yml',
    '.github/workflows/cloudflare.yml',
    '.github/workflows/shop-ui-preview.yml',
    '.gitignore',
    'ASSET_LICENSES.md',
    MARKER,
    'package.json',
    'scripts/build-compatible-mcc-config.mjs',
    'scripts/build-shop-ui-preview.mjs',
    'scripts/prepare-public-gallery.mjs',
    'scripts/select-pipeline-only-release.mjs',
    'src/components/AccountStatusBar.css',
    'src/components/AccountStatusBar.tsx',
    'src/components/GenerationCostNotice.tsx',
    'src/components/PublicModelGallery.css',
    'src/components/PublicModelGallery.tsx',
    'src/components/StudioGallery.tsx',
    'src/lib/publicGallery.ts',
    'src/lib/studioTierSelection.ts',
    'src/pages/PortalPage.tsx',
    'src/pages/ShopPage.css',
    'src/pages/ShopPage.tsx',
    'tests/ai-shop-ui-release.test.mjs',
    'tests/contest-finish.test.mjs',
    'tests/generation-profile-client.test.mjs',
    'tests/portal-entry.test.mjs',
    'tests/prompt-model-ui.test.mjs',
    'tests/public-model-gallery.test.mjs',
    'tests/shop-account-chrome.test.mjs',
    'tests/shop-draft-lifecycle.test.mjs',
    'tests/shop-external.test.mjs',
    'tests/shop-render-helper.mjs',
    'tests/shop-ui-preview.test.mjs',
    'tests/studio-tier-selection.test.ts',
    'wrangler.shop-ui-preview.jsonc',
  ].sort())
  assert.equal(Object.hasOwn(select(), 'boundedSoftwarePreview'), false)
  assert.equal(Object.hasOwn(select(), 'ownerReserveAdjustment'), false)
  assert.equal(Object.hasOwn(select(), 'accountPurchaseEvidence'), false)
})

test('wrong parent, missing history, extra parent, incomplete scope and unreviewed runtime changes refuse', () => {
  const invalid = [
    { parent: COMPATIBLE_MCC_BASE_COMMIT }, { parent: '3'.repeat(40) }, { parent: '' },
    { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` }, { parents: `${head}\n` },
    ...PATHS.map(path => ({ changes: changes.filter(change => change.path !== path) })),
    ...['server/unreviewed.ts', 'server/billing.ts', 'server/ownerReserveAdjustment.ts', 'src/pages/OwnerReserveAdjustmentPage.tsx', 'wrangler.jsonc', 'docs/CONTEST_STATUS.md', 'scripts/check-compatible-mcc-release.mjs', COMPATIBLE_MCC_MARKER_PATH].map(path => ({ changes: [...changes, { status: 'M', path }] })),
    { changes: [...changes, changes[0]] },
    ...PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === path ? { ...change, status } : change) }))),
  ]
  for (const value of invalid) assert.throws(() => select(value), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('modified or reused markers and executable, symlink or submodule files refuse', () => {
  const invalid = [
    { marker: CONTENT + '\n' }, { marker: '{}' }, { marker: COMPATIBLE_MCC_MARKER_CONTENT },
    { marker: CONTENT.replace(BASE, '3'.repeat(40)) },
    { marker: CONTENT.replace('ai-shop-ui-and-public-gallery', 'unreviewed-gallery') },
    ...['preserveBilling', 'preserveRemoteVars', 'preserveSecrets', 'aiShopUi'].map(key => ({ marker: CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...['M', 'D', 'T'].map(status => ({ changes: changes.map(change => change.path === MARKER ? { ...change, status } : change) })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({ tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`) }))),
    { tree: tree.slice(0, -1) }, { tree: tree.replace('blob', 'commit') },
  ]
  for (const value of invalid) assert.throws(() => select(value), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('markerless rebases refuse and later ordinary releases do not inherit the repair mode', () => {
  for (const path of [...introductions, 'scripts/select-pipeline-only-release.mjs'])
    assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => select({ changes: [] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['M', 'D', 'T']) assert.throws(() => select({ parent: head, changes: [{ status, path: MARKER }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const path of ['ops/AI_SHOP_UI_RELEASE_UNKNOWN.json', 'ops/AI_SHOP_UI_RELEASE_20261008.json'])
    assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.deepEqual(select({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] }), { preserveBilling: false, preserveRemoteVars: false })
})

test('repair config omits every declared variable while preserving all non-variable runtime settings', () => {
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  const snapshot = structuredClone(base), { vars: _vars, ...withoutVars } = base
  const config = buildAiShopUiConfig(base, options)
  assert.deepEqual(config, withoutVars)
  assert.deepEqual(base, snapshot)
  const overridden = buildAiShopUiConfig({ ...base, env: { production: { vars: { PRIVATE_FIXTURE: 'never-deploy-me' }, durable_objects: base.durable_objects } } }, options)
  assert.equal(Object.hasOwn(overridden.env.production, 'vars'), false)
  assert.equal(JSON.stringify(overridden).includes('never-deploy-me'), false)
  assert.deepEqual(overridden.env.production.durable_objects, base.durable_objects)
  for (const value of [undefined, {}, { compatibleMccRollback: true, preserveBilling: true, preserveRemoteVars: true }, ...Object.keys(options).map(key => ({ ...options, [key]: false }))])
    assert.throws(() => buildAiShopUiConfig(base, value), /AI_SHOP_UI_SCOPE_REQUIRED/)
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
  const galleryGate = steps.find(step => step.includes('name: Verify both pinned public gallery models'))
  assert.match(galleryGate, /if: steps\.mode\.outputs\.ai_shop_ui == 'true'/)
  assert.ok(steps.indexOf(galleryGate) < steps.findIndex(step => step.includes('name: Deploy reviewed WORLDIFACT release')))
  const deploy = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.match(deploy, /preserve_remote_vars[\s\S]*--keep-vars/)
  assert.doesNotMatch(deploy, /--var(?:\s|=)|secrets? (put|bulk|delete)/)
  const smoke = steps.find(step => step.includes('id: release'))
  assert.match(smoke, /import \{ checkCompatibleMccRelease \} from '\.\/scripts\/check-compatible-mcc-release\.mjs'/)
  assert.match(smoke, /options\.aiShopUi !== true/)
  assert.match(smoke, /Cloudflare version: \$\{deployment\.versionId\}/)
  assert.doesNotMatch(smoke, /method:\s*['"]POST|\/api\/(?:billing|studio|funding|entitlements|owner-reserve)/)
  assert.equal(smoke.includes('CLOUDFLARE_API_TOKEN:'), false)
  assert.match(steps.find(step => step.includes('id: mode')), /AI_SHOP_UI: \$\{\{ steps\.billing_scope\.outputs\.ai_shop_ui \}\}/)
  assert.match(smoke, /AI_SHOP_UI: \$\{\{ steps\.mode\.outputs\.ai_shop_ui \}\}/)
})

test('actual mode-selection shell uses the explicit repair config while retaining ordinary and prior modes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-mode-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts')); await mkdir(join(directory, 'ops'))
  for (const name of ['build-compatible-mcc-config.mjs', 'build-live-generation-config.ts'])
    await writeFile(join(directory, 'scripts', name), `console.log('${name} ' + process.argv.slice(2).join(' '))\n`)
  const run = steps.find(step => step.includes('id: mode')).match(/        run: \|\n([\s\S]*)/)[1].replace(/^ {10}/gm, '')
  const priorModes = [
    { flag: 'PAID_POINTS_ADMISSION', cli: '--paid-points-admission', config: '.paid-points-admission.wrangler.json', output: 'paid_points_admission=true\n' },
    { flag: 'BOUNDED_SOFTWARE_PREVIEW', cli: '--bounded-software-preview', config: '.bounded-software-preview.wrangler.json', output: 'bounded_software_preview=true\n' },
    { flag: 'OWNER_RESERVE_ADJUSTMENT', cli: '--owner-reserve-adjustment', config: '.owner-reserve-adjustment.wrangler.json', output: 'owner_reserve_adjustment=true\n' },
    { flag: 'ACCOUNT_PURCHASE_EVIDENCE', cli: '--account-purchase-evidence', config: '.account-purchase-evidence.wrangler.json', output: 'account_purchase_evidence=true\n' },
    { flag: 'SUBSCRIPTION_UPGRADE_REPAIR', cli: '--subscription-upgrade-repair', config: '.subscription-upgrade.wrangler.json', output: 'subscription_upgrade_repair=true\n' },
    null,
  ]
  for (const repair of ['true', 'false', '']) for (const prior of priorModes) for (const compatible of ['true', 'false']) for (const live of [true, false]) {
    const marker = join(directory, 'ops/LIVE_GENERATION_ONGOING_20260919')
    if (live) await writeFile(marker, '')
    else await rm(marker, { force: true })
    const output = join(directory, 'output'); await writeFile(output, '')
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', run.replaceAll('${{ steps.billing_scope.outputs.compatible_mcc_rollback }}', compatible)], {
      cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, AI_SHOP_UI: repair, ...(prior ? { [prior.flag]: 'true' } : {}) }, timeout: 15000,
    })
    assert.equal(result.status, 0, result.stderr)
    const expected = repair === 'true' ? 'config=.ai-shop-ui.wrangler.json\nai_shop_ui=true\nmode=PRESERVE\n'
      : prior ? `config=${prior.config}\n${prior.output}mode=PRESERVE\n`
      : compatible === 'true' ? 'config=.compatible-mcc.wrangler.json\nmode=PRESERVE\n'
      : live ? 'config=.live-generation.wrangler.json\nmode=LIVE\n' : 'config=wrangler.jsonc\nmode=DEMO\n'
    assert.equal(await readFile(output, 'utf8'), expected)
    assert.equal(result.stdout.includes('--ai-shop-ui'), repair === 'true')
    if (repair === 'true') assert.doesNotMatch(result.stdout, /rollback|build-live-generation|--(?:paid-points-admission|bounded-software-preview|owner-reserve-adjustment|account-purchase-evidence|subscription-upgrade-repair)/)
    else if (prior) assert.equal(result.stdout.includes(prior.cli), true)
  }
})

test('selector and config CLIs reject invalid evidence, mismatched modes and credential forwarding', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-cli-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const selector = fileURLToPath(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url))
  const builder = fileURLToPath(new URL('../scripts/build-compatible-mcc-config.mjs', import.meta.url))
  const configPath = join(directory, '.ai-shop-ui.wrangler.json')
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  await writeFile(join(directory, 'wrangler.jsonc'), JSON.stringify(base))
  const cases = [
    {},
    { parent: '3'.repeat(40) }, { changes: changes.filter(change => change.path !== MARKER) },
    { marker: CONTENT + '\n' }, { changes: [...changes, { status: 'M', path: 'wrangler.jsonc' }] },
    { tree: tree.replace('100644', '120000') }, { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` },
    { parent: '3'.repeat(40), changes: [{ status: 'A', path: 'ops/AI_SHOP_UI_RELEASE_UNKNOWN.json' }] },
    { changes: [...changes, { status: 'M', path: 'docs/CONTEST_STATUS.md' }] },
  ]
  for (const value of cases) {
    const data = { parent: BASE, changes, marker: CONTENT, tree, parents: `${head} ${BASE}\n`, ...value }
    await writeFile(join(directory, 'git'), `#!${process.execPath}\nconst data = ${JSON.stringify(data)}; const args = process.argv.slice(3);\nif (process.env.CLOUDFLARE_API_TOKEN || process.env.STRIPE_SECRET_KEY) process.exit(19);\nlet result;\nif (args[0] === 'rev-parse') result = (args.at(-1) === 'HEAD^{commit}' ? '${head}' : data.parent) + '\\n';\nelse if (args[0] === 'diff') result = data.changes.map(({status, path}) => status + '\\0' + path + '\\0').join('');\nelse if (args[0] === 'rev-list') result = data.parents;\nelse if (args[0] === 'ls-tree') result = args.length > 5 ? data.tree : '100644 blob ${blob}\\t${MARKER}\\0';\nelse if (args[0] === 'cat-file') result = data.marker;\nelse process.exit(20);\nprocess.stdout.write(result);\n`, { mode: 0o755 })
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', '"$NODE" "$SELECTOR" >> output; touch credentials-reached'], {
      cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, NODE: process.execPath, SELECTOR: selector, CLOUDFLARE_API_TOKEN: 'private-fixture', STRIPE_SECRET_KEY: 'private-fixture' }, timeout: 15000,
    })
    const built = spawnSync(process.execPath, [builder, '--ai-shop-ui'], {
      cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, CLOUDFLARE_API_TOKEN: 'private-fixture', STRIPE_SECRET_KEY: 'private-fixture' }, timeout: 15000,
    })
    assert.doesNotMatch(built.stdout + built.stderr, /private-fixture/)
    if (Object.keys(value).length === 0) {
      assert.equal(built.status, 0, built.stderr)
      assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), buildAiShopUiConfig(base, options))
      await rm(configPath)
      for (const args of [[], ['--paid-points-admission'], ['--bounded-software-preview'], ['--owner-reserve-adjustment'], ['--account-purchase-evidence'], ['--subscription-upgrade-repair'], ['--ai-shop-ui', '--extra'], ['--unreviewed']]) {
        const denied = spawnSync(process.execPath, [builder, ...args], { cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}` }, timeout: 15000 })
        assert.equal(denied.status, 1)
        assert.match(denied.stderr, /PRESERVING_RELEASE_CONFIG_NOT_VERIFIED/)
        assert.equal(existsSync(configPath), false)
      }
      assert.equal(result.status, 0, result.stderr)
      assert.equal(await readFile(join(directory, 'output'), 'utf8'), 'preserve_billing=true\npreserve_remote_vars=true\nai_shop_ui=true\n')
      assert.equal(existsSync(join(directory, 'credentials-reached')), true)
      await rm(join(directory, 'credentials-reached'))
      continue
    }
    assert.equal(built.status, 1)
    assert.equal(existsSync(configPath), false)
    assert.match(built.stderr, /PRESERVING_RELEASE_CONFIG_NOT_VERIFIED/)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /publication stopped before credential setup/)
    assert.doesNotMatch(result.stderr + result.stdout, /private-fixture/)
    assert.equal(existsSync(join(directory, 'credentials-reached')), false)
  }
})

const origin = 'https://worldifact.fixture.workers.dev', versionId = 'fixture-version'
test('explicit repair checker uses only anonymous GET health/static requests with exact deployed bytes', async t => {
  const dist = await mkdtemp(join(tmpdir(), 'ai-shop-ui-smoke-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const files = new Map([
    ['/index.html', '<html><div id="root"></div></html>'], ['/assets/app.js', 'export const app = true;'], ['/assets/app.css', 'body{color:green}'],
    ...[...galleryAssets].map(([name, bytes]) => [`/gallery-assets/${name}`, bytes]),
    ['/apps/chess/index.html', '<html>Chess</html>'], ['/apps/chess/guest.html', '<html>Guest</html>'],
    ['/apps/iss/index.html', '<html>ISS</html>'], ['/apps/terra/index.html', '<html>Terra</html>'],
    ['/apps/terra/eclipse-live/.dual-countdown-release', 'reviewed-marker-fixture'],
    ['/apps/terra/eclipse-live/.placeholder', ''],
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
    const contentType = url.pathname.endsWith('.glb') ? 'model/gltf-binary' : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.json') ? 'application/json' : 'text/html'
    return new Response(files.get(url.pathname) ?? files.get('/index.html'), { headers: { 'Content-Type': contentType } })
  }
  assert.equal(requests.length, 0)
  assert.deepEqual(await verifyPublicGalleryAssets(dist), { models: 2 })
  const result = await checkCompatibleMccRelease({ origin, versionId }, { dist, fetcher, retryDelaysMs: [] })
  assert.equal(result.verifiedAssets, files.size)
  assert.deepEqual(requests.filter(path => path.startsWith('/api/')), ['/api/health'])
  for (const changed of ['/gallery-assets/mars-solar-landship.glb', '/gallery-assets/led-polyhedron.glb', '/assets/app.js', '/apps/terra/eclipse-live/.dual-countdown-release', '/apps/terra/eclipse-live/.placeholder'])
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, retryDelaysMs: [], fetcher: (url, init) => url.pathname === changed ? new Response('changed', { headers: { 'Content-Type': 'text/javascript' } }) : fetcher(url, init) }), /Release bytes or MIME/)
  for (const missing of [['led-polyhedron.glb'], ['mars-solar-landship.glb'], [...galleryAssets.keys()]]) {
    const absent = new Set(missing.map(name => `/gallery-assets/${name}`))
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, retryDelaysMs: [], fetcher: (url, init) => absent.has(url.pathname) ? new Response('missing', { status: 404, headers: { 'Content-Type': 'model/gltf-binary' } }) : fetcher(url, init) }), /Release bytes or MIME/)
  }
  for (const name of galleryAssets.keys()) {
    const path = `/gallery-assets/${name}`, changed = Buffer.from(galleryAssets.get(name)); changed[changed.length - 1] ^= 1
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, retryDelaysMs: [], fetcher: (url, init) => url.pathname === path ? new Response(changed, { headers: { 'Content-Type': 'model/gltf-binary' } }) : fetcher(url, init) }), /Release bytes or MIME/)
  }
  for (const invalid of [undefined, null, {}, { origin }, { origin, versionId: undefined }, { origin, versionId: 'bad\nprivate-fixture' }, { origin: 'https://evil.invalid', versionId }])
    await assert.rejects(checkCompatibleMccRelease(invalid, { dist, fetcher }), /Invalid deployment receipt/)
  for (const hidden of ['.env', 'apps/terra/eclipse-live/.unreviewed', 'apps/terra/.placeholder']) {
    const path = join(dist, hidden)
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, 'private-fixture')
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, fetcher }), /Unreviewed release asset path/)
    await rm(path)
  }
  for (const path of ['/apps/terra/eclipse-live/.dual-countdown-release', '/apps/terra/eclipse-live/.placeholder']) {
    const full = join(dist, path)
    await rm(full); await symlink(join(dist, 'index.html'), full)
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, fetcher }), /Unreviewed release asset path/)
    await rm(full); await mkdir(full)
    await assert.rejects(checkCompatibleMccRelease({ origin, versionId }, { dist, fetcher }), /Unreviewed release asset path/)
    await rm(full, { recursive: true }); await writeFile(full, files.get(path))
  }
})

test('actual workflow verifier keeps version receipts mandatory, prints the validated version before checks and redacts all stage errors', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-checker-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const dist = join(directory, 'dist')
  const files = new Map([
    ['/index.html', '<html><div id="root"></div></html>'], ['/assets/app.js', 'export const app = true;'], ['/assets/app.css', 'body{color:green}'],
    ...[...galleryAssets].map(([name, bytes]) => [`/gallery-assets/${name}`, bytes]),
    ['/apps/chess/index.html', '<html>Chess</html>'], ['/apps/chess/guest.html', '<html>Guest</html>'],
    ['/apps/iss/index.html', '<html>ISS</html>'], ['/apps/terra/index.html', '<html>Terra</html>'],
    ['/apps/terra/eclipse-live/.dual-countdown-release', 'reviewed-marker-fixture'], ['/apps/terra/eclipse-live/.placeholder', ''],
  ])
  files.set('/foundation-release.json', JSON.stringify({ files: [...files].filter(([path]) => path.startsWith('/apps/')).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') })) }))
  for (const [path, bytes] of files) { await mkdir(dirname(join(dist, path)), { recursive: true }); await writeFile(join(dist, path), bytes) }
  const data = { parent: BASE, changes, marker: CONTENT, tree, parents: `${head} ${BASE}\n` }
  await writeFile(join(directory, 'git'), `#!${process.execPath}
const data = ${JSON.stringify(data)}; const args = process.argv.slice(3);
if (process.env.CLOUDFLARE_API_TOKEN || process.env.STRIPE_SECRET_KEY) process.exit(19);
let result;
if (args[0] === 'rev-parse') result = (args.at(-1) === 'HEAD^{commit}' ? '${head}' : data.parent) + '\\n';
else if (args[0] === 'diff') result = data.changes.map(({status, path}) => status + '\\0' + path + '\\0').join('');
else if (args[0] === 'rev-list') result = data.parents;
else if (args[0] === 'ls-tree') result = args.length > 5 ? data.tree : '100644 blob ${blob}\\t${MARKER}\\0';
else if (args[0] === 'cat-file') result = data.marker;
else process.exit(20);
process.stdout.write(result);
`, { mode: 0o755 })
  const preload = join(directory, 'preload.mjs')
  await writeFile(preload, `import assert from 'node:assert/strict';
const files = new Map(${JSON.stringify([...files].map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]))}.map(([path, bytes]) => [path, Buffer.from(bytes, 'base64')]));
globalThis.fetch = async (url, init) => {
  assert.equal(url.origin, '${origin}'); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit');
  assert.equal(init.body, undefined); assert.deepEqual(init.headers, { 'Cache-Control': 'no-cache' });
  if (url.pathname === '/api/health') {
    if (process.env.FAIL_STAGE === 'health') throw new Error('private-fixture upstream response');
    return Response.json({ mode: 'READY', generationReady: true });
  }
  assert.equal(url.pathname.startsWith('/api/'), false);
  if ((process.env.FAIL_STAGE === 'html_routes' && url.pathname === '/') || (process.env.FAIL_STAGE === 'static_assets' && url.pathname === '/assets/app.js')) throw new Error('private-fixture upstream response');
  const type = url.pathname.endsWith('.glb') ? 'model/gltf-binary' : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.json') ? 'application/json' : 'text/html';
  return new Response(files.get(url.pathname) ?? files.get('/index.html'), { headers: { 'Content-Type': type } });
};\n`)
  const receipt = join(directory, 'receipt.ndjson')
  const validReceipt = JSON.stringify({ type: 'deploy', version: 1, worker_name: 'worldifact', version_id: versionId, targets: [origin] }) + '\n'
  await symlink(fileURLToPath(new URL('../scripts', import.meta.url)), join(directory, 'scripts'))
  const smoke = steps.find(step => step.includes('id: release')).match(/        run: \|\n([\s\S]*?)(?=^        env:)/m)[1].replace(/^ {10}/gm, '')
  const run = stage => spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', smoke.replaceAll('${{ steps.mode.outputs.mode }}', 'PRESERVE')], {
    cwd: directory, encoding: 'utf8', timeout: 15000,
    env: { PATH: `${directory}:${process.env.PATH}`, NODE_OPTIONS: `--import=${preload}`, AI_SHOP_UI: 'true', WRANGLER_OUTPUT_FILE_PATH: receipt, FAIL_STAGE: stage, CLOUDFLARE_API_TOKEN: 'private-fixture', STRIPE_SECRET_KEY: 'private-fixture' },
  })
  const validGit = await readFile(join(directory, 'git'), 'utf8')
  for (const stage of ['release_scope', 'deployment_receipt', 'public_gallery_one', 'public_gallery_both', 'public_gallery_changed', 'health', 'local_assets', 'foundation_manifest', 'html_routes', 'static_assets', '']) {
    await writeFile(join(directory, 'git'), stage === 'release_scope' ? validGit.replace(JSON.stringify(data), JSON.stringify({ ...data, marker: '{}' })) : validGit, { mode: 0o755 })
    await writeFile(receipt, stage === 'deployment_receipt' ? '{"secret":"private-fixture"}' : validReceipt)
    if (stage === 'public_gallery_one') await rm(join(dist, 'gallery-assets/led-polyhedron.glb'))
    if (stage === 'public_gallery_both') for (const name of galleryAssets.keys()) await rm(join(dist, 'gallery-assets', name))
    if (stage === 'public_gallery_changed') { const bytes = Buffer.from(galleryAssets.get('led-polyhedron.glb')); bytes[bytes.length - 1] ^= 1; await writeFile(join(dist, 'gallery-assets/led-polyhedron.glb'), bytes) }
    if (stage === 'local_assets') await writeFile(join(dist, '.env'), 'private-fixture')
    if (stage === 'foundation_manifest') await writeFile(join(dist, 'foundation-release.json'), '{"secret":"private-fixture"}')
    const result = run(stage)
    assert.equal(result.status, stage ? 1 : 0, result.stderr)
    assert.doesNotMatch(result.stdout + result.stderr, /private-fixture|upstream response/)
    assert.equal(result.stdout.includes(`Cloudflare version: ${versionId}`), !['release_scope', 'deployment_receipt'].includes(stage))
    if (stage) assert.match(result.stderr, new RegExp(`^PRESERVING_RELEASE_NOT_VERIFIED: ${stage.startsWith('public_gallery_') ? 'public_gallery' : stage};`))
    else assert.match(result.stdout, /^Cloudflare version: fixture-version\nPASS: AI Shop UI and public gallery; 12 HTML routes and 12 exact built files\./)
    if (stage.startsWith('public_gallery_')) for (const [name, bytes] of galleryAssets) await writeFile(join(dist, 'gallery-assets', name), bytes)
    if (stage === 'local_assets') await rm(join(dist, '.env'))
    if (stage === 'foundation_manifest') await writeFile(join(dist, 'foundation-release.json'), files.get('/foundation-release.json'))
  }
})


test('actual workflow shells stop on unknown UI flags and never reach legacy LIVE fallback', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-unknown-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'ops'))
  await writeFile(join(directory, 'ops/LIVE_GENERATION_ONGOING_20260919'), '')
  await writeFile(join(directory, 'node'), '#!/bin/sh\necho unexpected-fallback > reached\nexit 0\n', { mode: 0o755 })
  const mode = steps.find(step => step.includes('id: mode')).match(/        run: \|\n([\s\S]*)/)[1].replace(/^ {10}/gm, '').replaceAll('${{ steps.billing_scope.outputs.compatible_mcc_rollback }}', 'false')
  const smoke = steps.find(step => step.includes('id: release')).match(/        run: \|\n([\s\S]*?)(?=^        env:)/m)[1].replace(/^ {10}/gm, '').replaceAll('${{ steps.mode.outputs.mode }}', 'LIVE')
  for (const shell of [mode, smoke]) for (const invalid of ['TRUE', 'unknown', 'true false']) {
    const output = join(directory, 'output'); await writeFile(output, '')
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', shell], {
      cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, GITHUB_OUTPUT: output, AI_SHOP_UI: invalid }, timeout: 15000,
    })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Unrecognized AI Shop UI release scope/)
    assert.equal(await readFile(output, 'utf8'), '')
    assert.equal(existsSync(join(directory, 'reached')), false)
  }
})

test('actual deploy shell submits only the variable-free config with keep-vars and suppresses private CLI output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-deploy-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  base.env = { production: { vars: { ENABLE_PAID_GENERATION: 'never-submit-fixture', LIMIT: '1' }, durable_objects: base.durable_objects } }
  const config = buildAiShopUiConfig(base, options)
  await writeFile(join(directory, '.ai-shop-ui.wrangler.json'), JSON.stringify(config))
  // This is a deployment simulation, not Cloudflare or live-runtime evidence.
  const remote = { vars: { ENABLE_PAID_GENERATION: 'preserved-live-fixture', ENABLE_BILLING: 'preserved-billing-fixture', PER_JOB_LIMIT: 'preserved-limit-fixture', EXPIRES_AT: 'preserved-expiry-fixture' }, secrets: { PROVIDER: 'opaque-existing-fixture', BILLING: 'opaque-existing-fixture', ORACLE: 'opaque-existing-fixture' } }
  await writeFile(join(directory, 'runtime.json'), JSON.stringify(remote))
  await writeFile(join(directory, 'npx'), `#!${process.execPath}
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
assert.deepEqual(args, ['wrangler', 'deploy', '--config', '.ai-shop-ui.wrangler.json', '--keep-vars']);
assert.equal(process.env.WRANGLER_LOG, 'none');
for (const key of ['WRANGLER_WRITE_LOGS', 'WRANGLER_SEND_METRICS', 'WRANGLER_SEND_ERROR_REPORTS']) assert.equal(process.env[key], 'false');
const config = JSON.parse(readFileSync(args[3], 'utf8'));
const inspect = value => { if (value && typeof value === 'object') { assert.equal(Object.hasOwn(value, 'vars'), false); Object.values(value).forEach(inspect); } }; inspect(config);
console.log('private-fixture dashboard config diff'); console.error('private-fixture diagnostic');
writeFileSync('arguments.json', JSON.stringify(args));
if (process.env.FAIL_DEPLOY === 'true') process.exit(1);
const runtime = JSON.parse(readFileSync('runtime.json', 'utf8'));
// Wrangler keep-vars preserves existing entries omitted from the submitted config.
runtime.vars = { ...runtime.vars, ...(config.vars ?? {}) };
writeFileSync('runtime.json', JSON.stringify(runtime));
`, { mode: 0o755 })
  const deploy = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release')).match(/        run: \|\n([\s\S]*?)(?=^        env:)/m)[1].replace(/^ {10}/gm, '')
    .replaceAll('${{ steps.billing_scope.outputs.preserve_remote_vars }}', 'true').replaceAll('${{ steps.mode.outputs.config }}', '.ai-shop-ui.wrangler.json')
  for (const fail of ['false', 'true']) {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', deploy], {
      cwd: directory, encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, FAIL_DEPLOY: fail }, timeout: 15000,
    })
    assert.equal(result.status, fail === 'true' ? 1 : 0, result.stderr)
    assert.doesNotMatch(result.stdout + result.stderr, /private-fixture|dashboard config diff|diagnostic/)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'runtime.json'), 'utf8')), remote)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'arguments.json'), 'utf8')), ['wrangler', 'deploy', '--config', '.ai-shop-ui.wrangler.json', '--keep-vars'])
  }
})


test('actual predeploy gallery gate refuses missing models without hydrating or reaching deployment', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-shop-ui-required-models-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts'))
  await writeFile(join(directory, 'scripts/prepare-public-gallery.mjs'), readFileSync(new URL('../scripts/prepare-public-gallery.mjs', import.meta.url)))
  await symlink(fileURLToPath(new URL('../public', import.meta.url)), join(directory, 'public'))
  const gallery = join(directory, 'dist/gallery-assets'); await mkdir(gallery, { recursive: true })
  const gate = steps.find(step => step.includes('name: Verify both pinned public gallery models')).match(/        run: (.+)/)[1]
  for (const missing of [[], ['led-polyhedron.glb'], ['mars-solar-landship.glb'], [...galleryAssets.keys()]]) {
    for (const [name, bytes] of galleryAssets) await writeFile(join(gallery, name), bytes)
    for (const name of missing) await rm(join(gallery, name))
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', `${gate}; touch deploy-reached`], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000 })
    assert.equal(result.status, missing.length ? 1 : 0, result.stderr)
    assert.equal(existsSync(join(directory, 'deploy-reached')), missing.length === 0)
    if (missing.length) assert.match(result.stderr, /PUBLIC_GALLERY_RELEASE_NOT_VERIFIED/)
    for (const name of missing) assert.equal(existsSync(join(gallery, name)), false)
    await rm(join(directory, 'deploy-reached'), { force: true })
  }
})
