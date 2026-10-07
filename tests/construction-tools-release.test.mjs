import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASE_COMMIT, BASE_WORKFLOW_BLOB, LEGACY_SCRIPT_BLOB, SCRIPT_PATH, CONFIG_PATH,
  TEST_PATH, LEGACY_TEST_PATH, WORKFLOW_PATH, CONFIG_BLOB, FAULT,
  readManifest, guardedWorkflow, selectConstructionToolsRelease,
} from '../scripts/select-construction-tools-release.mjs'
import {
  blob, sha256, selectContextToolsRelease,
  SCRIPT_PATH as OLD_SCRIPT_PATH, BASE_COMMIT as OLD_BASE,
  WORKFLOW_PATH as OLD_WORKFLOW_PATH, BASE_WORKFLOW_BLOB as OLD_WORKFLOW_BLOB,
  TEST_PATH as OLD_TEST_PATH, TEST_BLOB as OLD_TEST_BLOB,
  MARKER_PATH as OLD_MARKER_PATH, MARKER_CONTENT as OLD_MARKER_CONTENT,
  PAYLOAD_BLOBS as OLD_PAYLOAD, REVIEWED_PATHS as OLD_PATHS,
  guardedWorkflow as oldGuardedWorkflow,
} from '../scripts/select-context-tools-release.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const head = '1'.repeat(40), other = '2'.repeat(40), zero = '0'.repeat(40)
const scriptBytes = readFileSync(join(root, SCRIPT_PATH))
const oldScriptBytes = readFileSync(join(root, OLD_SCRIPT_PATH))
const currentWorkflow = readFileSync(join(root, WORKFLOW_PATH), 'utf8')

// Hosted review checkouts need not contain the base object. Remove only the
// exact wrapper hook, then require the immutable original workflow blob.
function baseWorkflowOf(current) {
  if (blob(current) === BASE_WORKFLOW_BLOB) return current
  let removed = 0
  const lines = current.split('\n').filter(line => {
    if ([SCRIPT_PATH, CONFIG_PATH].some(path => line.startsWith(`          printf '%s  ${path}\\n' `))) {
      removed += 1
      return false
    }
    return true
  })
  assert.equal(removed, 2)
  const restored = lines.join('\n').replace(
    `          node ${SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`,
    `          node ${OLD_SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`)
  assert.equal(blob(restored), BASE_WORKFLOW_BLOB)
  return restored
}
const baseWorkflow = baseWorkflowOf(currentWorkflow)
const rawChanges = changes => changes.map(change =>
  `:${change.oldMode} ${change.newMode} ${change.oldBlob} ${change.newBlob} ${change.status}\0${change.path}\0`).join('')
const addition = (path, newBlob = '3'.repeat(40)) => ({ path, oldMode: '000000', newMode: '100644', oldBlob: zero, newBlob, status: 'A' })
const modification = (path, oldBlob = '3'.repeat(40), newBlob = '4'.repeat(40)) =>
  ({ path, oldMode: '100644', newMode: '100644', oldBlob, newBlob, status: 'M' })
function entry({ path: _path, ...value }) { return value }
function fixtureManifest() {
  return {
    revision: 'oracle-construction-tools-release-v1',
    release: 'standard-bounded-construction-tools-only-20261007',
    baseCommit: BASE_COMMIT, sourceOnly: true, deployAllowed: false,
    preserveCloudflareDeployment: true, paidGenerationRequested: false, status: 'FROZEN',
    payload: {
      [TEST_PATH]: entry(addition(TEST_PATH, blob(readFileSync(join(root, TEST_PATH))))),
      [LEGACY_TEST_PATH]: entry(modification(LEGACY_TEST_PATH)),
      'tools/model_construction/runtime_controller.py': entry(addition('tools/model_construction/runtime_controller.py')),
      'docs/BOUNDED_CONSTRUCTION_20261007.md': entry(addition('docs/BOUNDED_CONSTRUCTION_20261007.md')),
      '.github/workflows/model-construction-review.yml': entry(addition('.github/workflows/model-construction-review.yml')),
      'docs/CONTEST_STATUS.md': entry(modification('docs/CONTEST_STATUS.md')),
    },
  }
}
function evidence(options = {}) {
  const manifest = options.manifest ?? fixtureManifest()
  const configBytes = options.configBytes ?? Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  const configBlob = options.configBlob ?? blob(configBytes)
  const workflow = guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(configBytes))
  const complete = [
    ...Object.entries(manifest.payload).map(([path, value]) => ({ path, ...value })),
    addition(SCRIPT_PATH, blob(scriptBytes)), addition(CONFIG_PATH, configBlob),
    modification(WORKFLOW_PATH, BASE_WORKFLOW_BLOB, blob(workflow)),
  ]
  const data = { parents: [BASE_COMMIT], changes: complete, workflow, beforeWorkflow: baseWorkflow,
    configBytes, configBlob, ...options }
  const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '4321', GITHUB_RUN_ATTEMPT: '1', ...options.env }
  const event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'refs/heads/main', before: BASE_COMMIT,
    after: head, head_commit: { id: head }, created: false, deleted: false, forced: false, ...options.event }
  const calls = []
  const git = (_cwd, args) => {
    calls.push(args)
    if (args[0] === 'rev-parse') return (options.head ?? head) + '\n'
    if (args[0] === 'ls-tree') {
      const path = args.at(-1)
      if (Object.hasOwn(data.trees ?? {}, path)) return data.trees[path]
      const ownBlob = { [SCRIPT_PATH]: blob(scriptBytes), [OLD_SCRIPT_PATH]: blob(oldScriptBytes), [CONFIG_PATH]: configBlob }[path]
      assert.ok(ownBlob, path)
      return `100644 blob ${ownBlob}\t${path}\0`
    }
    if (args[0] === 'rev-list') return data.parentsRaw ?? `${head} ${data.parents.join(' ')}\n`
    if (args[0] === 'merge-base') { if (data.notAncestor) throw new Error('not ancestor'); return '' }
    if (args[0] === 'diff') {
      assert.deepEqual(args.slice(0, 7), ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '--no-abbrev', '-z'])
      return data.raw ?? rawChanges(data.rangeChanges && args[7] !== data.parents[0] ? data.rangeChanges : data.changes)
    }
    if (args[0] === 'cat-file') {
      if (Object.hasOwn(data.blobs ?? {}, args[2])) return data.blobs[args[2]]
      if (args[2] === BASE_WORKFLOW_BLOB) return data.beforeWorkflow
      if (args[2] === data.changes.find(change => change.path === WORKFLOW_PATH)?.newBlob) return data.workflow
    }
    assert.fail('Unexpected Git request: ' + JSON.stringify(args))
  }
  return { data, env, event, git, calls, scriptBytes, configBytes, configBlob }
}
function select(options = {}) {
  return selectConstructionToolsRelease({ cwd: root, ...evidence(options) })
}
function reject(options) { assert.throws(() => select(options), /CONSTRUCTION_TOOLS_RELEASE_NOT_VERIFIED|CONTEXT_TOOLS_RELEASE_NOT_VERIFIED|not ancestor/) }
function dispatch(options = {}) {
  const fixture = evidence({ ...options, env: { GITHUB_EVENT_NAME: 'workflow_dispatch', ...options.env } })
  fixture.event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'main', inputs: { confirmation: 'DEPLOY' }, ...options.event }
  return selectConstructionToolsRelease({ cwd: root, ...fixture })
}

test('exact frozen synthetic source-only squash skips deployment before credentials', () => {
  assert.deepEqual(select(), { deployAllowed: false })
  assert.deepEqual(dispatch(), { deployAllowed: false })
  assert.deepEqual(dispatch({ event: { ref: 'refs/heads/main' } }), { deployAllowed: false })
  for (const attempt of ['1', '2', '999']) {
    assert.deepEqual(select({ env: { GITHUB_RUN_ATTEMPT: attempt } }), { deployAllowed: false })
    assert.deepEqual(dispatch({ env: { GITHUB_RUN_ATTEMPT: attempt } }), { deployAllowed: false })
  }
})

test('production config stays inert until final payload bytes and its compiled blob pin are frozen', () => {
  const raw = readFileSync(join(root, CONFIG_PATH))
  if (CONFIG_BLOB === 'UNFROZEN_REFUSE') {
    assert.throws(() => readManifest(raw), new RegExp(FAULT))
    const fixture = evidence()
    assert.throws(() => selectConstructionToolsRelease({ ...fixture, configBlob: CONFIG_BLOB }), new RegExp(FAULT))
  } else {
    const manifest = readManifest(raw)
    assert.equal(blob(raw), CONFIG_BLOB)
    for (const [path, record] of Object.entries(manifest.payload)) {
      assert.equal(blob(readFileSync(join(root, path))), record.newBlob, path)
    }
    assert.equal(currentWorkflow, guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(raw)))
  }
})

test('partial source envelopes, unknown additions and every missing reviewed path refuse', () => {
  const complete = evidence().data.changes
  for (const path of complete.map(change => change.path)) reject({ changes: complete.filter(change => change.path !== path) })
  for (const path of ['tools/model_construction/unknown.py', 'src/main.tsx', 'server/studio.ts',
    'server/billing.ts', 'wrangler.jsonc', 'package.json', 'ops/AI_SHOP_UI_RELEASE_20261007.json',
    'ops/STANDARD_CONTEXT_TOOLS_RELEASE_20261007.json', OLD_SCRIPT_PATH]) {
    reject({ changes: [...complete, addition(path)] })
  }
})

test('review branch histories and multi-commit ranges cannot substitute for one exact main squash', () => {
  const complete = evidence().data.changes
  for (const options of [
    { parents: [other] }, { parents: [BASE_COMMIT, other] }, { parents: [other, BASE_COMMIT] },
    { event: { before: other } }, { parentsRaw: `${head}\n` }, { notAncestor: true },
    { parents: [other], event: { before: '5'.repeat(40) }, changes: [modification('src/unrelated.ts')], rangeChanges: complete },
    { parents: [other], event: { before: BASE_COMMIT }, changes: [modification('src/unrelated.ts')], rangeChanges: complete },
  ]) reject(options)
})

test('later construction changes cannot become a lasting paths-ignore exemption', () => {
  for (const path of [SCRIPT_PATH, CONFIG_PATH, TEST_PATH, 'tools/model_construction/new.py',
    'docs/BOUNDED_CONSTRUCTION_20261007.md', '.github/workflows/model-construction-review.yml',
    'config/oracle-construction-unknown.json']) {
    for (const status of ['A', 'M', 'D']) {
      reject({ parents: [other], event: { before: other }, changes: [{ ...modification(path), status }] })
    }
  }
})

test('every changed file requires exact mode, old/new blob and status', () => {
  const complete = evidence().data.changes
  for (const target of complete) {
    for (const changed of [{ status: 'D' }, { status: 'R100' }, { status: 'T' },
      { newMode: '120000' }, { newMode: '100755' }, { newMode: '160000' },
      { newBlob: '9'.repeat(40) }, { oldBlob: '8'.repeat(40) }, { oldMode: '100755' }]) {
      reject({ changes: complete.map(change => change === target ? { ...change, ...changed } : change) })
    }
  }
  for (const path of [SCRIPT_PATH, OLD_SCRIPT_PATH, CONFIG_PATH]) {
    reject({ trees: { [path]: `120000 blob ${blob(scriptBytes)}\t${path}\0` } })
    reject({ trees: { [path]: `100644 blob ${'f'.repeat(40)}\t${path}\0` } })
  }
})

test('unreviewed mutable config cannot assert authority or expand the source-only scope', () => {
  const original = fixtureManifest()
  for (const [key, value] of Object.entries({ sourceOnly: false, deployAllowed: true,
    paidGenerationRequested: true, preserveCloudflareDeployment: false, baseCommit: other,
    revision: 'unknown', status: 'UNFROZEN_REFUSE', release: 'copied-old-marker' })) {
    const changed = structuredClone(original); changed[key] = value
    reject({ manifest: changed })
  }
  for (const path of ['ops/PAID_POINTS_ADMISSION_RELEASE_20261007.json', 'server/payments.ts',
    'wrangler.jsonc', 'package.json', OLD_SCRIPT_PATH, SCRIPT_PATH, CONFIG_PATH, WORKFLOW_PATH,
    'tools/model_construction/../secret.py', '.github/workflows/approved-model-test-once.yml']) {
    const changed = structuredClone(original); changed.payload[path] = entry(addition(path))
    reject({ manifest: changed })
  }
  reject({ configBlob: 'f'.repeat(40) })
  for (const raw of [Buffer.from('{}\n'), Buffer.from('{"a":1,"a":2}\n'),
    Buffer.from(JSON.stringify(original) + '\n'), Buffer.from(JSON.stringify(original, null, 2) + '\n\n')]) {
    assert.throws(() => readManifest(raw, blob(raw)), new RegExp(FAULT))
  }
})

test('workflow transform preserves every production and AI_SHOP_UI byte and adds only checksum commands', () => {
  const fixture = evidence()
  const expected = fixture.data.workflow
  const oldBoundary = baseWorkflow.indexOf('\n  context_tools_preflight:\n')
  const newBoundary = expected.indexOf('\n  context_tools_preflight:\n')
  assert.ok(oldBoundary > 0)
  assert.equal(expected.slice(0, newBoundary), baseWorkflow.slice(0, oldBoundary))
  assert.ok(expected.includes('AI_SHOP_UI: ${{ steps.billing_scope.outputs.ai_shop_ui }}'))
  assert.ok(expected.includes(`'${sha256(oldScriptBytes)}' | sha256sum -c - >&2`))
  const preflight = expected.slice(newBoundary)
  assert.equal(preflight.includes('secrets.'), false)
  assert.equal(preflight.includes('environment:'), false)
  assert.ok(preflight.includes('persist-credentials: false'))
  assert.ok(preflight.includes(`'${sha256(scriptBytes)}' | sha256sum -c - >&2`))
  assert.ok(preflight.includes(`'${sha256(fixture.configBytes)}' | sha256sum -c - >&2`))
  assert.ok(preflight.includes(`node ${SCRIPT_PATH} >> "$GITHUB_OUTPUT"`))
  assert.equal(expected.includes('paths-ignore'), false)
  for (const workflow of [expected + '\n', expected.replace("deploy_allowed == 'true'", "deploy_allowed != 'false'"),
    expected.replace('persist-credentials: false', 'persist-credentials: true'),
    expected.replace('sha256sum -c -', 'true'), expected.replace("'PRESERVE'", "'LIVE'")]) reject({ workflow })
  reject({ beforeWorkflow: baseWorkflow + '\n' })
  assert.throws(() => guardedWorkflow(baseWorkflow, 'main', 'a'.repeat(64)), new RegExp(FAULT))
})

test('new wrapper leaves the old guard and public release markers byte-for-byte intact', () => {
  assert.equal(blob(oldScriptBytes), LEGACY_SCRIPT_BLOB)
  assert.equal(OLD_SCRIPT_PATH, 'scripts/select-context-tools-release.mjs')
  const config = fixtureManifest()
  assert.equal(Object.keys(config.payload).some(path => path.startsWith('ops/')), false)
  assert.equal(blob(baseWorkflow), BASE_WORKFLOW_BLOB)
  assert.equal(JSON.parse(readFileSync(join(root, 'ops/AI_SHOP_UI_RELEASE_20261007.json'))).aiShopUi, true)
  assert.equal(readFileSync(join(root, OLD_MARKER_PATH), 'utf8'), OLD_MARKER_CONTENT)
})

test('ordinary pushes, multi-commit pushes, merge commits and manual releases delegate unchanged', () => {
  const changes = [modification('src/unrelated.ts')]
  for (const options of [
    { parents: [other], event: { before: other }, changes },
    { parents: [other, '6'.repeat(40)], event: { before: other }, changes },
    { parents: [other], event: { before: '5'.repeat(40) }, changes, rangeChanges: [...changes, modification('src/another.ts')] },
    { parents: [other], event: { before: other }, changes: [...changes, modification('docs/CONTEST_STATUS.md')] },
    { parents: [other], event: { before: other }, changes: [] },
  ]) {
    const fixture = evidence(options)
    const selected = selectConstructionToolsRelease({ cwd: root, ...fixture })
    assert.deepEqual(selected, selectContextToolsRelease({ cwd: root, env: fixture.env, event: fixture.event, git: fixture.git }))
    assert.deepEqual(selected, { deployAllowed: true })
  }
  assert.deepEqual(dispatch({ parents: [other], changes }), { deployAllowed: true })
  const fixture = evidence({ parents: [other], event: { before: other }, changes })
  let forwarded
  const result = selectConstructionToolsRelease({ cwd: root, ...fixture,
    legacySelector: args => { forwarded = args; return { deployAllowed: true } } })
  assert.deepEqual(result, { deployAllowed: true })
  assert.deepEqual(forwarded, { cwd: root, env: fixture.env, event: fixture.event, git: fixture.git })
})

test('the earlier exact context-tools release still delegates to its original no-deploy decision', () => {
  const oldIf = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || inputs.confirmation == 'DEPLOY')"
  const header = `jobs:\n  deploy:\n    needs: context_tools_preflight\n    if: needs.context_tools_preflight.result == 'success' && needs.context_tools_preflight.outputs.deploy_allowed == 'true' && (${oldIf})\n`
  const parts = baseWorkflow.split('\n  context_tools_preflight:\n')
  assert.equal(parts.length, 2)
  const oldBase = parts[0].replace(header, `jobs:\n  deploy:\n    if: ${oldIf}\n`)
  assert.equal(blob(oldBase), OLD_WORKFLOW_BLOB)
  const oldWorkflow = oldGuardedWorkflow(oldBase, sha256(oldScriptBytes))
  const payload = { ...OLD_PAYLOAD, [OLD_SCRIPT_PATH]: blob(oldScriptBytes),
    [OLD_TEST_PATH]: OLD_TEST_BLOB, [OLD_MARKER_PATH]: blob(OLD_MARKER_CONTENT) }
  const changes = OLD_PATHS.map(path => path === OLD_WORKFLOW_PATH
    ? modification(path, OLD_WORKFLOW_BLOB, blob(oldWorkflow)) : addition(path, payload[path]))
  assert.deepEqual(select({ parents: [OLD_BASE], event: { before: OLD_BASE }, changes,
    blobs: { [OLD_WORKFLOW_BLOB]: oldBase, [blob(oldWorkflow)]: oldWorkflow,
      [blob(OLD_MARKER_CONTENT)]: OLD_MARKER_CONTENT } }), { deployAllowed: false })
})

test('missing, malformed, mismatched or foreign GitHub evidence never emits permission', () => {
  for (const [key, value] of Object.entries({ GITHUB_REPOSITORY: 'attacker/repo', GITHUB_REF: 'refs/heads/review',
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '0', GITHUB_SHA: other })) reject({ env: { [key]: value } })
  for (const key of ['repository', 'ref', 'before', 'after', 'head_commit', 'created', 'deleted', 'forced']) reject({ event: { [key]: undefined } })
  for (const event of [{ before: zero }, { after: other }, { head_commit: { id: other } },
    { created: true }, { deleted: true }, { forced: true }]) reject({ event })
  for (const event of [{ inputs: {} }, { inputs: { confirmation: 'no' } },
    { inputs: { confirmation: 'DEPLOY', extra: true } }, { before: BASE_COMMIT }, { after: head },
    { repository: null }, { ref: '' }]) {
    assert.throws(() => dispatch({ event }), new RegExp(FAULT))
  }
})

test('raw diff corruption and duplicate file entries fail closed', () => {
  const raw = rawChanges(evidence().data.changes)
  for (const value of [raw.slice(0, -1), raw + raw, 'M\0bad\0', raw.replace('100644', 'bad'), raw + 'old\0new\0']) reject({ raw: value })
})

test('actual new checksum commands accept only exact wrapper/config bytes', () => {
  const fixture = evidence()
  for (const path of [SCRIPT_PATH, CONFIG_PATH]) {
    const raw = readFileSync(join(root, path))
    const line = `printf '%s  ${path}\\n' '${sha256(raw)}' | sha256sum -c - >&2`
    const valid = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', line], { cwd: root, encoding: 'utf8' })
    assert.equal(valid.status, 0, valid.stderr)
    const invalid = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', line.replace(sha256(raw), '0'.repeat(64))], { cwd: root, encoding: 'utf8' })
    assert.notEqual(invalid.status, 0)
  }
  assert.ok(fixture.data.workflow.includes(SCRIPT_PATH))
})

test('CLI refusal emits no GitHub output or deployment decision', () => {
  const folder = mkdtempSync(join(tmpdir(), 'construction-release-event-'))
  try {
    const path = join(folder, 'event.json'); writeFileSync(path, '{invalid')
    const result = spawnSync(process.execPath, [join(root, SCRIPT_PATH)], { cwd: root, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: path, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head } })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, new RegExp(FAULT))
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
