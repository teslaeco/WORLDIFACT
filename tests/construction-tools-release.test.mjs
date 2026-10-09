import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASE_COMMIT, BASE_WORKFLOW_BLOB, LEGACY_SCRIPT_BLOB, SCRIPT_PATH, CONFIG_PATH,
  TEST_PATH, WORKFLOW_PATH, CONFIG_BLOB, FAULT, BASE_PAYLOAD_BLOBS, REVIEWED_PATHS,
  LEGACY_TEST_PATH, LEGACY_TEST_RECORD, RECIPIENT_PATH, RECIPIENT_BLOB,
  BASE_SCRIPT_BLOB, BASE_CONFIG_BLOB, BASE_SCRIPT_SHA256, BASE_CONFIG_SHA256,
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
import { historicalWorkflow, HISTORICAL_TEST_BLOBS } from '../scripts/select-failed-hold-release.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const head = '1'.repeat(40), other = '2'.repeat(40), zero = '0'.repeat(40)
const scriptBytes = readFileSync(join(root, SCRIPT_PATH))
const oldScriptBytes = readFileSync(join(root, OLD_SCRIPT_PATH))
// The prior source-only envelope keeps its original byte-level contract.
// The incident release tests independently pin this harness and its inverse.
const currentWorkflow = historicalWorkflow(readFileSync(join(root, WORKFLOW_PATH), 'utf8'))

// Hosted review checkouts need not contain the base object. Restore only the
// two checksum values, then require the immutable entire baseline workflow.
function baseWorkflowOf(current) {
  if (blob(current) === BASE_WORKFLOW_BLOB) return current
  let restored = current
  for (const [path, checksum] of [[SCRIPT_PATH, BASE_SCRIPT_SHA256], [CONFIG_PATH, BASE_CONFIG_SHA256]]) {
    const prefix = `          printf '%s  ${path}\\n' '`
    const lines = restored.split('\n').filter(line => line.startsWith(prefix))
    assert.equal(lines.length, 1)
    assert.match(lines[0].slice(prefix.length), /^[a-f0-9]{64}' \| sha256sum -c - >&2$/)
    restored = restored.replace(lines[0], `${prefix}${checksum}' | sha256sum -c - >&2`)
  }
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
    revision: 'oracle-construction-tools-release-v10',
    release: 'oracle-refresh-trust-compatibility-source-only-20261009',
    baseCommit: BASE_COMMIT, sourceOnly: true, deployAllowed: false,
    preserveCloudflareDeployment: true, paidGenerationRequested: false, status: 'FROZEN',
    payload: { ...Object.fromEntries(Object.entries(BASE_PAYLOAD_BLOBS).map(([path, oldBlob]) =>
      [path, entry(oldBlob === zero ? addition(path, blob(readFileSync(join(root, path))))
        : modification(path, oldBlob, blob(readFileSync(join(root, path)))))])),
      [LEGACY_TEST_PATH]: { ...LEGACY_TEST_RECORD } },
  }
}
function evidence(options = {}) {
  const manifest = options.manifest ?? fixtureManifest()
  const configBytes = options.configBytes ?? Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  const configBlob = options.configBlob ?? blob(configBytes)
  const workflow = guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(configBytes))
  const complete = [
    ...Object.entries(manifest.payload).filter(([path]) => path !== LEGACY_TEST_PATH)
      .map(([path, value]) => ({ path, ...value })),
    modification(SCRIPT_PATH, BASE_SCRIPT_BLOB, blob(scriptBytes)),
    modification(CONFIG_PATH, BASE_CONFIG_BLOB, configBlob),
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
      const ownBlob = { [SCRIPT_PATH]: blob(scriptBytes), [OLD_SCRIPT_PATH]: blob(oldScriptBytes), [CONFIG_PATH]: configBlob,
        [LEGACY_TEST_PATH]: LEGACY_TEST_RECORD.newBlob, [RECIPIENT_PATH]: RECIPIENT_BLOB }[path]
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

test('exact refresh-trust compatibility squash skips deployment before credentials', () => {
  assert.equal(BASE_COMMIT, '3c5a499f3c6b9fe1400fb4715d2097b106327bf3')
  assert.equal(RECIPIENT_PATH, '.github/oracle-maintenance-recipient.pem')
  const changes = evidence().data.changes
  assert.equal(REVIEWED_PATHS.length, 7)
  assert.deepEqual(changes.map(change => change.path).sort(), REVIEWED_PATHS)
  const additions = changes.filter(change => change.status === 'A')
  assert.deepEqual(additions, [])
  assert.deepEqual(REVIEWED_PATHS, [
    WORKFLOW_PATH, CONFIG_PATH, SCRIPT_PATH, TEST_PATH,
    'tools/oracle_maintenance/README.md',
    'tools/oracle_maintenance/refresh.py',
    'tools/oracle_maintenance/test_refresh.py',
  ].sort())
  for (const change of changes) {
    assert.equal(change.newMode, '100644')
    assert.equal(change.oldMode, '100644')
    assert.equal(change.status, 'M')
  }
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
  assert.equal(currentWorkflow, guardedWorkflow(baseWorkflow, sha256(scriptBytes), sha256(raw)))
  if (CONFIG_BLOB === 'UNFROZEN_REFUSE') {
    assert.equal(JSON.parse(raw).status, 'UNFROZEN_REFUSE')
    assert.throws(() => readManifest(raw), new RegExp(FAULT))
    const fixture = evidence()
    assert.throws(() => selectConstructionToolsRelease({ ...fixture, configBlob: CONFIG_BLOB }), new RegExp(FAULT))
  } else {
    const manifest = readManifest(raw)
    assert.equal(blob(raw), CONFIG_BLOB)
    for (const [path, record] of Object.entries(manifest.payload)) {
      assert.equal(HISTORICAL_TEST_BLOBS[path] ?? blob(readFileSync(join(root, path))), record.newBlob, path)
    }
  }
})

test('partial source envelopes, unknown additions and every missing reviewed path refuse', () => {
  const complete = evidence().data.changes
  for (const path of complete.map(change => change.path)) reject({ changes: complete.filter(change => change.path !== path) })
  for (const path of ['tools/model_construction/unknown.py', 'src/main.tsx', 'server/studio.ts',
    'server/billing.ts', 'wrangler.jsonc', 'package.json', 'ops/AI_SHOP_UI_RELEASE_20261007.json',
    'ops/STANDARD_CONTEXT_TOOLS_RELEASE_20261007.json', OLD_SCRIPT_PATH,
    'tools/model_construction/test_construction_transaction.py',
    '.github/workflows/unknown.yml', '.github/workflows/oracle-maintenance-extra.yml',
    'tools/oracle_maintenance/unreviewed.py', 'tools/oracle_maintenance/refresh_receiver.py',
    'tools/oracle_maintenance/dispatcher.py', 'tools/oracle_maintenance/status.py',
    'tools/model_construction/construction_payload.py', 'scripts/oracle-maintenance.mjs']) {
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

test('later construction or maintenance changes cannot become a lasting paths-ignore exemption', () => {
  for (const path of [SCRIPT_PATH, CONFIG_PATH, TEST_PATH, 'tools/model_construction/new.py',
    'docs/BOUNDED_CONSTRUCTION_20261007.md', '.github/workflows/model-construction-review.yml',
    'config/oracle-construction-unknown.json', RECIPIENT_PATH, WORKFLOW_PATH,
    '.github/workflows/oracle-maintenance.yml', 'scripts/oracle-maintenance.mjs',
    'tests/oracle-maintenance.test.mjs', 'tools/oracle_maintenance/bootstrap.py',
    '.github/workflows/oracle-maintenance-extra.yml', 'tools/oracle_maintenance/extra.py',
    'scripts/oracle-maintenance-extra.mjs', 'docs/ORACLE_MAINTENANCE.md']) {
    for (const status of ['A', 'M', 'D']) {
      reject({ parents: [other], event: { before: other }, changes: [{ ...modification(path), status }] })
    }
  }
})

test('every changed file requires exact mode, old/new blob and status', () => {
  const complete = evidence().data.changes
  for (const target of complete) {
    for (const changed of [{ status: 'A', oldMode: '000000', oldBlob: zero },
      { status: 'A' }, { oldMode: '000000' }, { oldBlob: zero },
      { status: 'M' }, { oldMode: '100644' },
      { status: 'D' }, { status: 'R100' }, { status: 'T' },
      { newMode: '120000' }, { newMode: '100755' }, { newMode: '160000' },
      { newBlob: '9'.repeat(40) }, { oldBlob: '8'.repeat(40) }, { oldMode: '100755' }]) {
      if (Object.entries(changed).every(([key, value]) => target[key] === value)) continue
      reject({ changes: complete.map(change => change === target ? { ...change, ...changed } : change) })
    }
  }
  for (const path of [SCRIPT_PATH, OLD_SCRIPT_PATH, CONFIG_PATH, LEGACY_TEST_PATH, RECIPIENT_PATH]) {
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

test('manifest cannot change immutable baseline blobs, statuses, modes or exact payload paths', () => {
  const original = fixtureManifest()
  for (const path of Object.keys(BASE_PAYLOAD_BLOBS)) {
    for (const patch of [{ oldBlob: '8'.repeat(40) },
      { oldMode: '000000' },
      { oldMode: '100755' }, { newMode: '100755' }, { newMode: '120000' },
      { status: 'A', oldMode: '000000', oldBlob: zero }, { status: 'A' },
      { status: 'M' }, { oldMode: '100644' }, { status: 'D' },
      { newBlob: zero }, { newBlob: original.payload[path].oldBlob },
      { extra: true }]) {
      if (Object.entries(patch).every(([key, value]) => original.payload[path][key] === value)) continue
      const manifest = structuredClone(original)
      Object.assign(manifest.payload[path], patch)
      reject({ manifest })
    }
    const missing = structuredClone(original)
    delete missing.payload[path]
    reject({ manifest: missing })
    for (const replacement of ['tools/model_construction/unknown.py',
      'tools/model_construction/test_construction_transaction.py',
      'docs/UNKNOWN_CONSTRUCTION.md', '.github/workflows/unknown-construction-review.yml']) {
      const manifest = structuredClone(missing)
      manifest.payload[replacement] = original.payload[path]
      reject({ manifest })
    }
  }
})

test('historical context-test attestation cannot grant a changed-path exemption', () => {
  for (const patch of [{ oldBlob: '8'.repeat(40) }, { newBlob: '9'.repeat(40) },
    { status: 'A' }, { newMode: '120000' }, { extra: true }]) {
    const manifest = fixtureManifest()
    Object.assign(manifest.payload[LEGACY_TEST_PATH], patch)
    reject({ manifest })
  }
  reject({ changes: [...evidence().data.changes,
    modification(LEGACY_TEST_PATH, LEGACY_TEST_RECORD.newBlob)] })
  assert.equal(blob(readFileSync(join(root, RECIPIENT_PATH))), RECIPIENT_BLOB)
  reject({ changes: [...evidence().data.changes, modification(RECIPIENT_PATH, RECIPIENT_BLOB)] })
  const recipientPayload = fixtureManifest()
  recipientPayload.payload[RECIPIENT_PATH] = entry(modification(RECIPIENT_PATH, RECIPIENT_BLOB))
  reject({ manifest: recipientPayload })
})

test('workflow transform preserves the entire baseline except its two checksum values', () => {
  const fixture = evidence()
  const expected = fixture.data.workflow
  assert.equal(expected.replace(sha256(scriptBytes), BASE_SCRIPT_SHA256)
    .replace(sha256(fixture.configBytes), BASE_CONFIG_SHA256), baseWorkflow)
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

test('historical transform compatibility cannot authorize an earlier release base', () => {
  let prior = baseWorkflow
  for (const [path, checksum] of [[SCRIPT_PATH, BASE_SCRIPT_SHA256], [CONFIG_PATH, BASE_CONFIG_SHA256]]) {
    prior = prior.replace(`          printf '%s  ${path}\\n' '${checksum}' | sha256sum -c - >&2\n`, '')
  }
  prior = prior.replace(`          node ${SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`,
    `          node ${OLD_SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`)
  assert.equal(blob(prior), '06db92301113f826e9dc470d6794cfe4fa4325d7')
  const fixture = evidence()
  assert.equal(guardedWorkflow(prior, sha256(scriptBytes), sha256(fixture.configBytes)), fixture.data.workflow)
  assert.throws(() => guardedWorkflow(prior + '\n', sha256(scriptBytes), sha256(fixture.configBytes)), new RegExp(FAULT))
  reject({ beforeWorkflow: prior })
  reject({ changes: fixture.data.changes.map(change => change.path === WORKFLOW_PATH
    ? { ...change, oldBlob: blob(prior) } : change) })
  reject({ parents: ['6698b79f244ea85ca50076fd54154ff982e96cf8'],
    event: { before: '6698b79f244ea85ca50076fd54154ff982e96cf8' } })
  reject({ parents: ['ea1987eee520880b1eb93e71b572f7f1f4879efd'],
    event: { before: 'ea1987eee520880b1eb93e71b572f7f1f4879efd' } })
  reject({ parents: ['a30708fcfa4d6b2dc07cb07916f59d3dafb99b6f'],
    event: { before: 'a30708fcfa4d6b2dc07cb07916f59d3dafb99b6f' } })
  reject({ parents: ['944b486249b54cca02e6ed8ca426da6eba296391'],
    event: { before: '944b486249b54cca02e6ed8ca426da6eba296391' } })
  reject({ parents: ['766e651af475323152b6fd6fb7b1bce0ac4a8586'],
    event: { before: '766e651af475323152b6fd6fb7b1bce0ac4a8586' } })
  reject({ parents: ['0eb81ff43e85e8eb191dc6081abf93171a258b18'],
    event: { before: '0eb81ff43e85e8eb191dc6081abf93171a258b18' } })
  for (const earlierBase of ['93c6e85f1d4df0ace41ed1320791a325489a08e1',
    'c4800202ff2418bb8eb4319c1b5868df8437f6a2']) {
    reject({ parents: [earlierBase], event: { before: earlierBase } })
  }
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
