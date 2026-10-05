import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readDeployment } from '../scripts/release-check.ts'
import {
  BASE_COMMIT, MARKER_PATH, MARKER_CONTENT, REVIEWED_PATHS,
  FUNDING_BASE_COMMIT, FUNDING_MARKER_PATH, FUNDING_MARKER_CONTENT, FUNDING_REVIEWED_PATHS,
  SESSION_DRAFT_BASE_COMMIT, SESSION_DRAFT_MARKER_PATH, SESSION_DRAFT_MARKER_CONTENT, SESSION_DRAFT_REVIEWED_PATHS,
  selectPipelineOnlyRelease, selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const changes = REVIEWED_PATHS.map(path => ({ status: path === MARKER_PATH ? 'A' : 'M', path }))
const fundingChanges = FUNDING_REVIEWED_PATHS.map(path => ({ status: path === FUNDING_MARKER_PATH ? 'A' : 'M', path }))
const sessionDraftChanges = SESSION_DRAFT_REVIEWED_PATHS.map(path => ({ status: path === SESSION_DRAFT_MARKER_PATH ? 'A' : 'M', path }))
function evidence(overrides = {}) {
  const data = { head, parent: BASE_COMMIT, changes, markerPath: MARKER_PATH, marker: MARKER_CONTENT, mode: '100644', ...overrides }
  const calls = []
  function readGit(cwd, args) {
    assert.equal(cwd, 'fixture')
    calls.push(args)
    if (args[0] === 'rev-parse') {
      assert.deepEqual(args.slice(0, 3), ['rev-parse', '--verify', '--end-of-options'])
      if (args[3] === 'HEAD^{commit}') return data.head + '\n'
      assert.equal(args[3], `${data.head}^1^{commit}`)
      if (!data.parent) throw new Error('missing local parent')
      return data.parent + '\n'
    }
    if (args[0] === 'diff') {
      assert.deepEqual(args, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', data.parent, data.head, '--'])
      return data.raw ?? data.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    }
    if (args[0] === 'ls-tree') {
      if (args.length > 5) {
        const paths = data.markerPath === SESSION_DRAFT_MARKER_PATH ? SESSION_DRAFT_REVIEWED_PATHS : FUNDING_REVIEWED_PATHS
        assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', ...paths])
        return data.tree ?? paths.map(path => `100644 blob ${blob}\t${path}\0`).join('')
      }
      assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', data.markerPath])
      return `${data.mode} blob ${blob}\t${data.markerPath}\0`
    }
    assert.deepEqual(args, ['cat-file', 'blob', blob])
    return data.marker
  }
  return { readGit, calls }
}
function select(overrides) { return selectPipelineOnlyRelease('fixture', evidence(overrides).readGit) }
function selectFunding(overrides = {}) {
  return select({ parent: FUNDING_BASE_COMMIT, changes: fundingChanges, markerPath: FUNDING_MARKER_PATH, marker: FUNDING_MARKER_CONTENT, ...overrides })
}
function selectSessionDraft(overrides = {}) {
  return select({ parent: SESSION_DRAFT_BASE_COMMIT, changes: sessionDraftChanges, markerPath: SESSION_DRAFT_MARKER_PATH, marker: SESSION_DRAFT_MARKER_CONTENT, ...overrides })
}

test('only the exact reviewed repair and canonical public marker preserve billing', () => {
  assert.equal(select(), true)
  assert.equal(readFileSync(new URL('../' + MARKER_PATH, import.meta.url), 'utf8'), MARKER_CONTENT)
  assert.equal(REVIEWED_PATHS.length, 12)
})

test('marker addition refuses a changed parent, extra/missing paths, deletion, rename or type change', () => {
  for (const overrides of [
    { parent: '3'.repeat(40) },
    { changes: [...changes, { status: 'M', path: 'server/billing.ts' }] },
    { changes: changes.filter(change => change.path !== 'server/studio.ts') },
    ...['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === 'server/studio.ts' ? { ...change, status } : change) })),
  ]) assert.throws(() => select(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('marker format or type changes and later marker edits/deletion fail closed', () => {
  for (const overrides of [
    { marker: MARKER_CONTENT + '\n' }, { marker: MARKER_CONTENT.replace('true', 'false') }, { mode: '120000' },
    ...['M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: MARKER_PATH }] })),
  ]) assert.throws(() => select(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('an initial repair or newly introduced selector cannot omit the marker and enable billing', () => {
  assert.throws(() => select({ changes: changes.filter(change => change.path !== MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path: 'scripts/select-pipeline-only-release.mjs' }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('the separate funding inspection scope preserves billing for exactly its 17 reviewed paths', () => {
  assert.equal(selectFunding(), true)
  assert.equal(readFileSync(new URL('../' + FUNDING_MARKER_PATH, import.meta.url), 'utf8'), FUNDING_MARKER_CONTENT)
  assert.equal(FUNDING_REVIEWED_PATHS.length, 17)
  assert.equal(FUNDING_REVIEWED_PATHS.includes(MARKER_PATH), false)
  assert.equal(FUNDING_REVIEWED_PATHS.includes('.github/workflows/cloudflare.yml'), false)
  assert.equal(FUNDING_REVIEWED_PATHS.includes('docs/CONTEST_STATUS.md'), false)
})

test('funding inspection refuses omitted markers, different parents, scope changes and any old marker change', () => {
  for (const overrides of [
    { changes: fundingChanges.filter(change => change.path !== FUNDING_MARKER_PATH) },
    { parent: BASE_COMMIT }, { parent: '3'.repeat(40) },
    { changes: [...fundingChanges, { status: 'M', path: 'server/billing.ts' }] },
    { changes: fundingChanges.filter(change => change.path !== 'server/entitlements.ts') },
    ...['A', 'M', 'D', 'T'].map(status => ({ changes: [...fundingChanges, { status, path: MARKER_PATH }] })),
    ...['D', 'T', 'R100'].map(status => ({ changes: fundingChanges.map(change => change.path === 'server/entitlements.ts' ? { ...change, status } : change) })),
    { parent: '3'.repeat(40), changes: [{ status: 'A', path: 'src/lib/generationFunding.ts' }] },
    { parent: FUNDING_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectFunding(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('funding marker contents, marker edits and non-regular reviewed files fail closed', () => {
  const tree = FUNDING_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: FUNDING_MARKER_CONTENT + '\n' },
    { marker: FUNDING_MARKER_CONTENT.replace('true', 'false') },
    { marker: MARKER_CONTENT }, { mode: '120000' },
    ...['M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: FUNDING_MARKER_PATH }] })),
    ...['100755', '120000', '160000'].map(mode => ({ tree: tree.replace('100644', mode) })),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('docs/GENERATOR_UI_RESTORATION_20261004.md', 'docs/other.md') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectFunding(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('the session draft release preserves billing and remote vars for only its canonical marker and reviewed paths', () => {
  assert.equal(selectSessionDraft(), true)
  assert.equal(SESSION_DRAFT_BASE_COMMIT, '177c71098e9ccca3e18bedb505f2dd9932a9aab8')
  assert.equal(readFileSync(new URL('../' + SESSION_DRAFT_MARKER_PATH, import.meta.url), 'utf8'), SESSION_DRAFT_MARKER_CONTENT)
  assert.equal(SESSION_DRAFT_REVIEWED_PATHS.length, 11)
  assert.equal(SESSION_DRAFT_REVIEWED_PATHS.includes('.github/workflows/cloudflare.yml'), true)
  for (const path of [MARKER_PATH, FUNDING_MARKER_PATH, 'docs/CONTEST_STATUS.md', 'server/billing.ts', 'server/entitlements.ts']) {
    assert.equal(SESSION_DRAFT_REVIEWED_PATHS.includes(path), false, path)
  }
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({
    parent: SESSION_DRAFT_BASE_COMMIT, changes: sessionDraftChanges,
    markerPath: SESSION_DRAFT_MARKER_PATH, marker: SESSION_DRAFT_MARKER_CONTENT,
  }).readGit), { preserveBilling: true, preserveRemoteVars: true })
})

test('session draft release refuses missing markers, different parents and changes outside the exact scope', () => {
  for (const overrides of [
    { changes: sessionDraftChanges.filter(change => change.path !== SESSION_DRAFT_MARKER_PATH) },
    { parent: BASE_COMMIT }, { parent: FUNDING_BASE_COMMIT }, { parent: '3'.repeat(40) },
    { changes: [...sessionDraftChanges, { status: 'M', path: 'server/billing.ts' }] },
    { changes: sessionDraftChanges.filter(change => change.path !== 'src/pages/ShopPage.tsx') },
    ...['D', 'T', 'R100'].map(status => ({ changes: sessionDraftChanges.map(change => change.path === 'src/pages/ShopPage.tsx' ? { ...change, status } : change) })),
    ...[MARKER_PATH, FUNDING_MARKER_PATH].flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...sessionDraftChanges, { status, path }] }))),
    { parent: SESSION_DRAFT_BASE_COMMIT, changes: [] },
    ...['src/lib/shopSessionDraft.ts', 'tests/account-session-draft-lifecycle.test.mjs', 'tests/shop-session-draft.test.ts'].map(path => ({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] })),
  ]) assert.throws(() => selectSessionDraft(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('session draft marker tampering and non-regular reviewed files fail closed', () => {
  const tree = SESSION_DRAFT_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: SESSION_DRAFT_MARKER_CONTENT + '\n' },
    { marker: SESSION_DRAFT_MARKER_CONTENT.replace('true', 'false') },
    { marker: SESSION_DRAFT_MARKER_CONTENT.replace('"preserveRemoteVars": true', '"preserveRemoteVars": false') },
    { marker: MARKER_CONTENT }, { marker: FUNDING_MARKER_CONTENT }, { mode: '120000' },
    ...['A', 'M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: SESSION_DRAFT_MARKER_PATH }] })),
    ...['100755', '120000', '160000'].map(mode => ({ tree: tree.replace('100644', mode) })),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('src/pages/ShopPage.tsx', 'src/pages/other.tsx') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectSessionDraft(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('later session draft edits use normal billing behavior without reading any stale release marker', () => {
  const fixture = evidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'src/lib/shopSessionDraft.ts' }] })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
  assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
})

test('ordinary future releases retain the previous billing behavior without reading the stale marker', () => {
  const fixture = evidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] })
  assert.equal(selectPipelineOnlyRelease('fixture', fixture.readGit), false)
  assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  assert.equal(select({ parent: '3'.repeat(40), changes: [] }), false)
  assert.equal(selectFunding({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'src/lib/generationFunding.ts' }] }), false)
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence().readGit), { preserveBilling: true, preserveRemoteVars: false })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({ parent: FUNDING_BASE_COMMIT, changes: fundingChanges, markerPath: FUNDING_MARKER_PATH, marker: FUNDING_MARKER_CONTENT }).readGit), { preserveBilling: true, preserveRemoteVars: false })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({ parent: '3'.repeat(40), changes: [] }).readGit), { preserveBilling: false, preserveRemoteVars: false })
})

test('missing history, malformed Git evidence and revision-like arguments cannot select a mode', () => {
  for (const overrides of [
    { parent: null }, { head: '--output=/tmp/unwanted' }, { parent: 'HEAD^1' },
    { raw: 'A\0' }, { raw: `A\0${MARKER_PATH}` },
  ]) assert.throws(() => select(overrides))
  const script = readFileSync(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url), 'utf8')
  assert.match(script, /GIT_NO_LAZY_FETCH: '1'/)
  assert.match(script, /GIT_NO_REPLACE_OBJECTS: '1'/)
  assert.doesNotMatch(script, /\.\.\.process\.env/)
})

test('actual local Git and CLI fail on missing history or extra arguments and default ordinary commits to false', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-release-'))
  const script = fileURLToPath(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url))
  // Only local fixtures, with a minimal environment: no provider, secrets or network.
  const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  function run(binary, args) { return spawnSync(binary, args, { cwd: directory, env, encoding: 'utf8', timeout: 15000 }) }
  function git(...args) { const result = run('git', args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(directory, 'README'), 'base\n')
    git('add', 'README')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'base')
    const missing = run(process.execPath, [script])
    assert.equal(missing.status, 1)
    assert.equal(missing.stdout, '')
    writeFileSync(join(directory, 'README'), 'ordinary future release\n')
    git('add', 'README')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'ordinary release')
    const ordinary = run(process.execPath, [script])
    assert.equal(ordinary.status, 0, ordinary.stderr)
    assert.equal(ordinary.stdout, 'preserve_billing=false\npreserve_remote_vars=false\n')
    const poisoned = spawnSync(process.execPath, [script], {
      cwd: directory, encoding: 'utf8', timeout: 15000,
      env: { ...env, GIT_DIR: '/missing/git', GIT_WORK_TREE: '/missing/tree', GIT_INDEX_FILE: '/missing/index', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.repositoryformatversion', GIT_CONFIG_VALUE_0: '999' },
    })
    assert.equal(poisoned.status, 0, poisoned.stderr)
    assert.equal(poisoned.stdout, 'preserve_billing=false\npreserve_remote_vars=false\n')
    const injection = run(process.execPath, [script, '--base', BASE_COMMIT])
    assert.equal(injection.status, 1)
    assert.equal(injection.stdout, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('workflow guards all five billing steps before credentials and keeps every other gate unchanged', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  const steps = workflow.split(/(?=^      - )/m).slice(1)
  const selectorIndex = steps.findIndex(step => step.includes('id: billing_scope'))
  const deployStep = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.ok(selectorIndex > 0)
  assert.match(steps[0], /fetch-depth: 2/)
  assert.match(steps[selectorIndex], /run: node scripts\/select-pipeline-only-release\.mjs >> "\$GITHUB_OUTPUT"/)
  assert.doesNotMatch(steps[selectorIndex], /\n        if:|secrets\./)
  assert.ok(steps.findIndex(step => step.includes('release-check.ts credentials')) > selectorIndex)
  const billing = steps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step))
  assert.equal(billing.length, 5)
  for (const step of billing) assert.match(step, /\n        if: steps\.billing_scope\.outputs\.preserve_billing == 'false'\n/)
  for (const step of steps.filter(step => !billing.includes(step) && step !== steps[selectorIndex] && step !== deployStep)) {
    assert.doesNotMatch(step, /billing_scope/)
    if (/secrets\./.test(step)) assert.ok(steps.indexOf(step) > selectorIndex)
  }
  for (const gate of ['npm run verify', './.github/actions/foundations', 'restore-detailed-studio-config.mjs', 'wrangler deploy --dry-run', 'wrangler deploy --config', 'release-check.ts smoke', 'status.costGuardReady,true', 'assert.equal(denied.status,401)', 'assert.equal(fundingDenied.status,401)', 'assert.equal(foreignFunding.status,403)']) assert.ok(workflow.includes(gate), gate)
})

test('only the guarded deploy preserves remote vars, suppresses private CLI output and retains its receipt', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  const step = workflow.split(/(?=^      - )/m).find(part => part.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.ok(step)
  assert.match(step, /WRANGLER_OUTPUT_FILE_PATH: \$\{\{ runner\.temp \}\}\/worldifact-deploy\.ndjson/)
  const run = step.match(/        run: \|\n([\s\S]*?)        env:\n/)[1].replace(/^ {10}/gm, '')
  const directory = mkdtempSync(join(tmpdir(), 'session-release-deploy-'))
  const capture = join(directory, 'invocation.json')
  const privateFixture = 'PRIVATE_FIXTURE_VALUE'
  try {
    mkdirSync(join(directory, 'bin'))
    const executable = join(directory, 'bin/npx')
    writeFileSync(executable, `#!${process.execPath}\n` + `
const fs = require('node:fs');
fs.writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify({
  args: process.argv.slice(2),
  log: process.env.WRANGLER_LOG,
  writeLogs: process.env.WRANGLER_WRITE_LOGS,
  metrics: process.env.WRANGLER_SEND_METRICS,
  errors: process.env.WRANGLER_SEND_ERROR_REPORTS,
}));
console.log(JSON.stringify({ private: '${privateFixture}', stream: 'stdout' }));
console.error(JSON.stringify({ private: '${privateFixture}', stream: 'stderr' }));
if (process.env.FIXTURE_EXIT === '0') fs.writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH,
  JSON.stringify({ type: 'deploy', version: 1, worker_name: 'worldifact', version_id: 'fixture-version',
    targets: ['https://worldifact.fixture.workers.dev'] }) + '\\n');
process.exit(Number(process.env.FIXTURE_EXIT));
`)
    chmodSync(executable, 0o755)
    for (const preserve of ['true', 'false']) {
      for (const exit of ['0', '7']) {
        const receipt = join(directory, `receipt-${preserve}-${exit}.ndjson`)
        const command = run.replaceAll('${{ steps.billing_scope.outputs.preserve_remote_vars }}', preserve)
          .replaceAll('${{ steps.mode.outputs.config }}', 'reviewed.wrangler.json')
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', command], {
          cwd: directory, encoding: 'utf8', timeout: 15000,
          env: { PATH: join(directory, 'bin') + ':' + process.env.PATH, FIXTURE_CAPTURE: capture,
            FIXTURE_EXIT: exit, WRANGLER_OUTPUT_FILE_PATH: receipt },
        })
        assert.equal(result.error, undefined)
        assert.equal(result.status, exit === '0' ? 0 : preserve === 'true' ? 1 : 7)
        const invocation = JSON.parse(readFileSync(capture, 'utf8'))
        assert.deepEqual(invocation.args, ['wrangler', 'deploy', '--config', 'reviewed.wrangler.json', ...(preserve === 'true' ? ['--keep-vars'] : [])])
        if (preserve === 'true') {
          assert.deepEqual({ ...invocation, args: undefined }, { args: undefined, log: 'none', writeLogs: 'false', metrics: 'false', errors: 'false' })
          assert.equal((result.stdout + result.stderr).includes(privateFixture), false)
          if (exit !== '0') assert.match(result.stdout, /::error::Deployment failed/)
        } else {
          assert.deepEqual(Object.keys(invocation), ['args'])
          assert.ok(result.stdout.includes(privateFixture))
          assert.ok(result.stderr.includes(privateFixture))
        }
        if (exit === '0') {
          const contents = readFileSync(receipt, 'utf8')
          assert.deepEqual(readDeployment(contents), { origin: 'https://worldifact.fixture.workers.dev', versionId: 'fixture-version' })
          assert.equal((result.stdout + result.stderr).includes('fixture-version'), false)
        } else assert.equal(existsSync(receipt), false)
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
