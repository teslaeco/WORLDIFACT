import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  BASE_COMMIT, MARKER_PATH, MARKER_CONTENT, REVIEWED_PATHS,
  FUNDING_BASE_COMMIT, FUNDING_MARKER_PATH, FUNDING_MARKER_CONTENT, FUNDING_REVIEWED_PATHS,
  selectPipelineOnlyRelease,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const changes = REVIEWED_PATHS.map(path => ({ status: path === MARKER_PATH ? 'A' : 'M', path }))
const fundingChanges = FUNDING_REVIEWED_PATHS.map(path => ({ status: path === FUNDING_MARKER_PATH ? 'A' : 'M', path }))
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
        assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', ...FUNDING_REVIEWED_PATHS])
        return data.tree ?? FUNDING_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
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

test('ordinary future releases retain the previous billing behavior without reading the stale marker', () => {
  const fixture = evidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] })
  assert.equal(selectPipelineOnlyRelease('fixture', fixture.readGit), false)
  assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  assert.equal(select({ parent: '3'.repeat(40), changes: [] }), false)
  assert.equal(selectFunding({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'src/lib/generationFunding.ts' }] }), false)
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
    assert.equal(ordinary.stdout, 'preserve_billing=false\n')
    const poisoned = spawnSync(process.execPath, [script], {
      cwd: directory, encoding: 'utf8', timeout: 15000,
      env: { ...env, GIT_DIR: '/missing/git', GIT_WORK_TREE: '/missing/tree', GIT_INDEX_FILE: '/missing/index', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.repositoryformatversion', GIT_CONFIG_VALUE_0: '999' },
    })
    assert.equal(poisoned.status, 0, poisoned.stderr)
    assert.equal(poisoned.stdout, 'preserve_billing=false\n')
    const injection = run(process.execPath, [script, '--base', BASE_COMMIT])
    assert.equal(injection.status, 1)
    assert.equal(injection.stdout, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('workflow guards all five billing steps before credentials and keeps every other gate unchanged', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  const steps = workflow.split(/(?=^      - )/m).slice(1)
  const selectorIndex = steps.findIndex(step => step.includes('id: billing_scope'))
  assert.ok(selectorIndex > 0)
  assert.match(steps[0], /fetch-depth: 2/)
  assert.match(steps[selectorIndex], /run: node scripts\/select-pipeline-only-release\.mjs >> "\$GITHUB_OUTPUT"/)
  assert.doesNotMatch(steps[selectorIndex], /\n        if:|secrets\./)
  assert.ok(steps.findIndex(step => step.includes('release-check.ts credentials')) > selectorIndex)
  const billing = steps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step))
  assert.equal(billing.length, 5)
  for (const step of billing) assert.match(step, /\n        if: steps\.billing_scope\.outputs\.preserve_billing == 'false'\n/)
  for (const step of steps.filter(step => !billing.includes(step) && step !== steps[selectorIndex])) {
    assert.doesNotMatch(step, /billing_scope/)
    if (/secrets\./.test(step)) assert.ok(steps.indexOf(step) > selectorIndex)
  }
  for (const gate of ['npm run verify', './.github/actions/foundations', 'restore-detailed-studio-config.mjs', 'wrangler deploy --dry-run', 'wrangler deploy --config', 'release-check.ts smoke', 'status.costGuardReady,true', 'assert.equal(denied.status,401)', 'assert.equal(fundingDenied.status,401)', 'assert.equal(foreignFunding.status,403)']) assert.ok(workflow.includes(gate), gate)
})
