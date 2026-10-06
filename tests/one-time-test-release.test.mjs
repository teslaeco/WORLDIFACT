import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ONE_TIME_TEST_BASE_COMMIT, ONE_TIME_TEST_MARKER_PATH, ONE_TIME_TEST_MARKER_CONTENT, ONE_TIME_TEST_REVIEWED_PATHS,
  selectPipelineOnlyRelease, selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'
import { spawnSync } from 'node:child_process'

// Independent review contract: changing the selector alone must not widen this release.
const expectedParent = 'd229a3e37f37bd85476dc3d8d969dd49fdae488d'
const premergeParent = 'c1ea5980e4bdb449bd879ae3991371dc76a5392a'
const expectedMarkerPath = 'ops/ONE_TIME_TEST_RELEASE_20261006.json'
const expectedMarker = `{
  "release": "one-time-api-tests-20261006-044444",
  "baseCommit": "d229a3e37f37bd85476dc3d8d969dd49fdae488d",
  "preserveBilling": true,
  "preserveRemoteVars": true
}
`
const introductions = [
  'docs/ONE_TIME_API_TESTS_20261006.md',
  'server/overnightTestBudget.ts',
  'src/lib/overnightTestClient.ts',
  'src/pages/OvernightTestsPage.css',
  'src/pages/OvernightTestsPage.tsx',
  'tests/one-time-test-renewal.test.ts',
  'tests/overnight-test-admission.test.ts',
  'tests/overnight-test-budget-native.test.mjs',
  'tests/overnight-test-budget.test.ts',
  'tests/overnight-test-client.test.ts',
  'tests/overnight-test-namespace-native.test.mjs',
  'tests/overnight-test-page.test.mjs',
]
const expectedPaths = [
  ...introductions,
  expectedMarkerPath,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/studio.ts',
  'server/worker.ts',
  'src/App.tsx',
  'tests/one-time-test-release.test.mjs',
].sort()
const previousMarkers = [
  'ops/PIPELINE_ONLY_RELEASE_20261004.json',
  'ops/FUNDING_INSPECTION_RELEASE_20261004.json',
  'ops/READONLY_QUOTE_RELEASE_20261005.json',
  'ops/MCC_ONE_ATTEMPT_RELEASE_20261005.json',
  'ops/ACCOUNT_MODEL_LIBRARY_RELEASE_20261005.json',
  'ops/PROJECT_MCC_ATTEMPT_RELEASE_20261005.json',
  'ops/CABINET_CONTEXT_RELEASE_20261005.json',
  'ops/GENERATION_RECOVERY_RELEASE_20261005.json',
]
const head = '1'.repeat(40), blob = '2'.repeat(40), rebasedParent = '3'.repeat(40)
const changes = expectedPaths.map(path => ({
  status: path === expectedMarkerPath || introductions.includes(path) || path === 'tests/one-time-test-release.test.mjs' ? 'A' : 'M',
  path,
}))
const treeEntry = (path, mode = '100644', type = 'blob', oid = blob) => `${mode} ${type} ${oid}\t${path}\0`
const tree = expectedPaths.map(path => treeEntry(path)).join('')
const refused = /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/

function fixture(overrides = {}) {
  const data = { head, parent: expectedParent, changes, marker: expectedMarker, tree, markerEntry: treeEntry(expectedMarkerPath), ...overrides }
  const calls = []
  function readGit(cwd, args) {
    assert.equal(cwd, 'fixture')
    calls.push(args)
    if (data.failOn === args[0]) throw new Error('fixture Git history unavailable')
    if (args[0] === 'rev-parse') {
      assert.deepEqual(args.slice(0, 3), ['rev-parse', '--verify', '--end-of-options'])
      if (args[3] === 'HEAD^{commit}') return data.head + '\n'
      assert.equal(args[3], `${data.head}^1^{commit}`)
      if (data.parent === null) throw new Error('fixture parent unavailable')
      return data.parent + '\n'
    }
    if (args[0] === 'diff') {
      assert.deepEqual(args, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', data.parent, data.head, '--'])
      return data.raw ?? data.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    }
    if (args[0] === 'rev-list') {
      assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', data.head])
      return data.parents ?? `${data.head} ${data.parent}\n`
    }
    if (args[0] === 'ls-tree') {
      if (args.length === 5) {
        assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', expectedMarkerPath])
        return data.markerEntry
      }
      assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', ...expectedPaths])
      return data.tree
    }
    assert.deepEqual(args, ['cat-file', 'blob', blob])
    return data.marker
  }
  return { data, calls, readGit }
}
function select(overrides) { return selectPipelineReleaseOptions('fixture', fixture(overrides).readGit) }
function reject(overrides, label) { assert.throws(() => select(overrides), refused, label) }

test('one-time test release pins the actual PR219 merge, literal 19 paths and canonical marker bytes', () => {
  assert.equal(ONE_TIME_TEST_BASE_COMMIT, expectedParent)
  assert.notEqual(ONE_TIME_TEST_BASE_COMMIT, premergeParent)
  assert.equal(ONE_TIME_TEST_MARKER_PATH, expectedMarkerPath)
  assert.equal(ONE_TIME_TEST_MARKER_CONTENT, expectedMarker)
  assert.equal(readFileSync(new URL('../' + expectedMarkerPath, import.meta.url), 'utf8'), expectedMarker)
  assert.equal(expectedPaths.length, 19)
  assert.deepEqual(ONE_TIME_TEST_REVIEWED_PATHS, expectedPaths)
})

test('only the complete one-time package preserves billing and remote variables', () => {
  assert.deepEqual(select(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(selectPipelineOnlyRelease('fixture', fixture().readGit), true)
  // Git does not promise the caller's path order; the exact set is authoritative.
  assert.deepEqual(select({ changes: [...changes].reverse(), tree: expectedPaths.slice().reverse().map(path => treeEntry(path)).join('') }),
    { preserveBilling: true, preserveRemoteVars: true })
})

test('one-time release rejects premerge and wrong parents, merge commits and missing parent evidence', () => {
  for (const parent of [premergeParent, rebasedParent, 'ee107329fdd73d3ebe7678643dc01971b1bd6930']) reject({ parent }, parent)
  for (const parents of [
    `${head} ${expectedParent} ${rebasedParent}\n`, `${head} ${rebasedParent} ${expectedParent}\n`,
    `${head} ${rebasedParent}\n`, `${head}\n`, `${rebasedParent} ${expectedParent}\n`, '',
  ]) reject({ parents }, parents)
  assert.throws(() => select({ parent: null }), /fixture parent unavailable/)
  for (const failOn of ['rev-parse', 'diff', 'rev-list', 'ls-tree', 'cat-file']) {
    assert.throws(() => select({ failOn }), /fixture Git history unavailable/, failOn)
  }
  for (const invalid of ['HEAD^1', '--output=/tmp/unwanted', '', 'F'.repeat(40), '1'.repeat(39)]) {
    reject({ head: invalid }, `head ${invalid}`)
    reject({ parent: invalid }, `parent ${invalid}`)
  }
})

test('every missing reviewed path and every extra financial, workflow or configuration file rejects the package', () => {
  for (const path of expectedPaths) reject({ changes: changes.filter(change => change.path !== path) }, `missing ${path}`)
  for (const path of [
    'server/billing.ts', 'server/accounts.ts', 'server/generationEconomics.ts', 'server/astraProjectBudget.ts',
    'server/astraRepairedMccGrant.ts', '.github/workflows/cloudflare.yml', '.github/workflows/ci.yml',
    'wrangler.jsonc', '.dev.vars.example', 'package.json', 'package-lock.json', 'docs/CONTEST_STATUS.md',
    'ops/UNREVIEWED_RELEASE.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json',
  ]) {
    for (const status of ['A', 'M']) reject({ changes: [...changes, { status, path }] }, `${status} ${path}`)
  }
  reject({ changes: [] }, 'empty initial release')
})

test('every previous marker change, deleted or renamed path and duplicate diff entry fails closed', () => {
  for (const path of previousMarkers) {
    for (const status of ['A', 'M', 'D', 'T']) reject({ changes: [...changes, { status, path }] }, `${status} ${path}`)
  }
  for (const path of expectedPaths) {
    for (const status of ['D', 'T', 'R100', 'C100']) {
      reject({ changes: changes.map(change => change.path === path ? { ...change, status } : change) }, `${status} ${path}`)
    }
    reject({ changes: [...changes, changes.find(change => change.path === path)] }, `duplicate ${path}`)
    reject({ changes: changes.map(change => change.path === path ? { ...change, path: path + '.renamed' } : change) }, `renamed ${path}`)
  }
  reject({ changes: changes.map(change => change.path === expectedMarkerPath ? { ...change, status: 'M' } : change) }, 'marker must be newly added')
})

test('malformed or truncated NUL-delimited diff evidence cannot grant the exception', () => {
  const raw = changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
  for (const invalid of [raw.slice(0, -1), raw + '\0', raw + 'A\0', 'A\0\0', `M\0${expectedMarkerPath}`, `R100\0old\0${expectedMarkerPath}\0`, `?\0${expectedMarkerPath}\0`]) {
    reject({ raw: invalid })
  }
})

test('marker contents must be canonical including the renewed approval identifier and both preservation flags', () => {
  const parsed = JSON.parse(expectedMarker)
  const serialized = value => JSON.stringify(value, null, 2) + '\n'
  for (const marker of [
    '', '{}\n', '{broken json', '\uFEFF' + expectedMarker, expectedMarker + '\n', expectedMarker.trimEnd(),
    JSON.stringify(parsed) + '\n', expectedMarker.replaceAll('\n', '\r\n'),
    serialized({ ...parsed, baseCommit: premergeParent }), serialized({ ...parsed, release: 'overnight-api-tests-20261006' }),
    serialized({ ...parsed, preserveBilling: false }), serialized({ ...parsed, preserveRemoteVars: false }),
    serialized({ ...parsed, preserveBilling: 'true' }), serialized({ ...parsed, preserveRemoteVars: 'true' }),
    serialized({ ...parsed, extra: true }), serialized({ ...parsed, preserveBilling: undefined }),
    serialized({ ...parsed, preserveRemoteVars: undefined }), 'null\n',
  ]) reject({ marker })
  for (const path of previousMarkers) reject({ marker: readFileSync(new URL('../' + path, import.meta.url), 'utf8') }, path)
})

test('all 19 reviewed objects must be unique regular non-executable blobs with complete tree evidence', () => {
  for (const path of expectedPaths) {
    const original = treeEntry(path)
    for (const mode of ['100755', '120000', '160000', '040000']) {
      reject({ tree: tree.replace(original, treeEntry(path, mode)) }, `${mode} ${path}`)
    }
    reject({ tree: tree.replace(original, treeEntry(path, '100644', 'commit')) }, `commit ${path}`)
    reject({ tree: tree.replace(original, treeEntry(path, '100644', 'blob', 'invalid')) }, `invalid oid ${path}`)
    reject({ tree: tree.replace(original, '') }, `missing ${path}`)
    reject({ tree: tree + original }, `extra ${path}`)
    reject({ tree: tree.replace(original, treeEntry(path + '.unreviewed')) }, `substitution ${path}`)
  }
  reject({ tree: tree.replace(treeEntry(expectedPaths[0]), treeEntry(expectedPaths[1])) }, 'same-size duplicate tree')
  reject({ tree: tree.slice(0, -1) }, 'truncated tree')
  reject({ tree: tree + '\0' }, 'empty tree entry')
})

test('the separately loaded marker must be the exact single regular blob verified in the release', () => {
  for (const markerEntry of [
    '', treeEntry(expectedMarkerPath, '100755'), treeEntry(expectedMarkerPath, '120000'),
    treeEntry(expectedMarkerPath, '160000', 'commit'), treeEntry(expectedMarkerPath + '.other'),
    treeEntry(expectedMarkerPath, '100644', 'blob', 'invalid'), treeEntry(expectedMarkerPath).slice(0, -1),
    treeEntry(expectedMarkerPath) + treeEntry(expectedMarkerPath),
  ]) reject({ markerEntry })
})

test('omitting or replacing the marker cannot turn rebased one-time introductions into an ordinary billing deployment', () => {
  const staleMarker = { status: 'A', path: 'ops/UNREVIEWED_RELEASE.json' }
  for (const parent of [expectedParent, rebasedParent]) {
    for (const omitSelector of [false, true]) {
      const withoutMarker = changes.filter(change => change.path !== expectedMarkerPath && (!omitSelector || change.path !== 'scripts/select-pipeline-only-release.mjs'))
      reject({ parent, changes: withoutMarker })
      reject({ parent, changes: [...withoutMarker, staleMarker] })
    }
  }
  for (const path of [...introductions, 'tests/one-time-test-release.test.mjs', 'scripts/select-pipeline-only-release.mjs']) {
    reject({ parent: rebasedParent, changes: [{ status: 'A', path }] }, path)
    reject({ parent: rebasedParent, changes: [{ status: 'A', path }, staleMarker, { status: 'M', path: 'server/billing.ts' }] }, `stale marker ${path}`)
  }
  for (const status of ['A', 'M', 'D', 'T']) {
    reject({ parent: rebasedParent, changes: [{ status, path: expectedMarkerPath }] }, status)
    reject({ parent: rebasedParent, changes: [{ status, path: 'scripts/select-pipeline-only-release.mjs' }] }, `selector ${status}`)
  }
})

test('later ordinary modifications do not read or reuse any stale release marker', () => {
  for (const path of [...introductions, 'server/entitlements.ts', 'server/studio.ts', 'server/worker.ts', 'src/App.tsx', 'server/billing.ts', 'README.md']) {
    const evidence = fixture({ parent: rebasedParent, changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence.readGit), { preserveBilling: false, preserveRemoteVars: false }, path)
    assert.deepEqual(evidence.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'], path)
  }
  assert.deepEqual(select({ parent: rebasedParent, changes: [] }), { preserveBilling: false, preserveRemoteVars: false })
})

const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
const workflowSteps = workflow.split(/(?=^      - )/m).slice(1)
const financialNames = [
  'Sync optional payment credentials without activating checkout',
  'Prepare verified subscription cancellation before activating Stripe',
  'Verify Stripe can open and expire an unpaid subscription checkout',
  'Verify Pro and Studio Stripe checkouts can open and expire without charge',
  'Verify activated Stripe readiness and payment request guards without a charge',
]
function namedStep(name) {
  const found = workflowSteps.filter(step => step.split('\n')[0] === '      - name: ' + name)
  assert.equal(found.length, 1, name)
  return found[0]
}
const guardStep = namedStep('Verify one-time pipeline release scope before credential setup')
const guardCommand = guardStep.match(/^        run: (.+)$/m)?.[1]
const deployStep = namedStep('Deploy reviewed WORLDIFACT release')
const deployCommand = deployStep.match(/        run: \|\n([\s\S]*?)        env:\n/)?.[1].replace(/^ {10}/gm, '')

test('the deployed workflow consumes the guard before all credentials and skips exactly the five financial steps', () => {
  assert.equal(guardCommand, 'node scripts/select-pipeline-only-release.mjs >> "$GITHUB_OUTPUT"')
  assert.ok(guardStep.includes('\n        id: billing_scope\n'))
  assert.doesNotMatch(guardStep, /^        (?:if|continue-on-error):|secrets\./m)
  const guardIndex = workflowSteps.indexOf(guardStep)
  const secretSteps = workflowSteps.filter(step => step.includes('secrets.'))
  assert.ok(secretSteps.length > 0)
  for (const step of secretSteps) assert.ok(workflowSteps.indexOf(step) > guardIndex, step.split('\n')[0])
  assert.ok(workflowSteps.indexOf(namedStep('Check deployment input names and format')) > guardIndex)
  const financialSteps = financialNames.map(namedStep)
  assert.equal(workflowSteps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step)).length, 5)
  assert.equal(workflowSteps.filter(step => step.includes("if: steps.billing_scope.outputs.preserve_billing == 'false'")).length, 5)
  for (const step of financialSteps) {
    assert.equal(step.match(/^        if: (.+)$/m)?.[1], "steps.billing_scope.outputs.preserve_billing == 'false'")
  }
  assert.ok(deployCommand)
})

test('the actual workflow guard writes both true outputs and its deploy command preserves variables with no external calls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'one-time-release-workflow-'))
  const env = { PATH: join(directory, 'bin') + ':' + process.env.PATH, GITHUB_OUTPUT: join(directory, 'guard-output'), FIXTURE_CAPTURE: join(directory, 'deploy-args') }
  function executable(name, content) {
    const path = join(directory, 'bin', name)
    writeFileSync(path, `#!${process.execPath}\n${content}`)
    chmodSync(path, 0o755)
  }
  function shell(command) { return spawnSync('bash', ['-euo', 'pipefail', '-c', command], { cwd: directory, env, encoding: 'utf8', timeout: 15000 }) }
  try {
    mkdirSync(join(directory, 'bin'))
    mkdirSync(join(directory, 'scripts'))
    copyFileSync(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url), join(directory, 'scripts/select-pipeline-only-release.mjs'))
    // All Git objects and the deployment binary below are local, deterministic fixtures.
    executable('git', `const fs = require('node:fs');
const d = JSON.parse(fs.readFileSync('git-evidence.json', 'utf8'));
const a = process.argv.slice(2);
if (a.shift() !== '--no-pager') process.exit(2);
let output;
if (a[0] === 'rev-parse') output = (a[3] === 'HEAD^{commit}' ? d.head : d.parent) + '\\n';
else if (a[0] === 'diff') output = d.changes.map(c => c.status + '\\0' + c.path + '\\0').join('');
else if (a[0] === 'rev-list') output = d.head + ' ' + d.parent + '\\n';
else if (a[0] === 'ls-tree') output = a.length === 5 ? d.markerEntry : d.tree;
else if (a[0] === 'cat-file') output = d.marker;
else process.exit(3);
process.stdout.write(output);
`)
    executable('npx', `require('node:fs').writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify(process.argv.slice(2)));\n`)
    writeFileSync(join(directory, 'git-evidence.json'), JSON.stringify(fixture().data))
    const guarded = shell(guardCommand)
    assert.equal(guarded.error, undefined)
    assert.equal(guarded.status, 0, guarded.stderr)
    assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), 'preserve_billing=true\npreserve_remote_vars=true\n')
    const outputs = Object.fromEntries(readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().split('\n').map(line => line.split('=')))
    for (const step of financialNames.map(namedStep)) {
      const expression = step.match(/^        if: (.+)$/m)[1]
      assert.equal(expression.replace('steps.billing_scope.outputs.preserve_billing', outputs.preserve_billing), "true == 'false'")
    }
    const deployed = shell(deployCommand
      .replaceAll('${{ steps.billing_scope.outputs.preserve_remote_vars }}', outputs.preserve_remote_vars)
      .replaceAll('${{ steps.mode.outputs.config }}', 'reviewed.wrangler.json'))
    assert.equal(deployed.error, undefined)
    assert.equal(deployed.status, 0, deployed.stderr)
    assert.deepEqual(JSON.parse(readFileSync(env.FIXTURE_CAPTURE, 'utf8')), ['wrangler', 'deploy', '--config', 'reviewed.wrangler.json', '--keep-vars'])
    for (const overrides of [
      { parent: premergeParent },
      { parent: rebasedParent, changes: changes.filter(change => ![expectedMarkerPath, 'scripts/select-pipeline-only-release.mjs'].includes(change.path)) },
      { marker: expectedMarker.replace('"preserveBilling": true', '"preserveBilling": false') },
    ]) {
      writeFileSync(join(directory, 'git-evidence.json'), JSON.stringify(fixture(overrides).data))
      writeFileSync(env.GITHUB_OUTPUT, '')
      const rejected = shell(guardCommand + '\nprintf reached > credential-step-reached')
      assert.equal(rejected.error, undefined)
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, refused)
      assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), '')
      assert.equal(existsSync(join(directory, 'credential-step-reached')), false)
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
