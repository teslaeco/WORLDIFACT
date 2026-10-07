import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASE_COMMIT, BASE_WORKFLOW_BLOB, WORKFLOW_PATH, SCRIPT_PATH, TEST_PATH, TEST_BLOB,
  MARKER_PATH, MARKER_CONTENT, PAYLOAD_BLOBS, REVIEWED_PATHS,
  blob, sha256, guardedWorkflow, parseRawChanges, selectContextToolsRelease,
} from '../scripts/select-context-tools-release.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const head = '1'.repeat(40), other = '2'.repeat(40), zero = '0'.repeat(40)
const scriptBytes = readFileSync(join(root, SCRIPT_PATH))
const original = spawnSync('git', ['cat-file', 'blob', BASE_WORKFLOW_BLOB], { cwd: root, encoding: 'utf8' })
assert.equal(original.status, 0, 'The exact reviewed UI workflow must be locally available.')
const baseWorkflow = original.stdout
const expectedWorkflow = guardedWorkflow(baseWorkflow, sha256(scriptBytes))
const rawChanges = changes => changes.map(change => `:${change.oldMode} ${change.newMode} ${change.oldBlob} ${change.newBlob} ${change.status}\0${change.path}\0`).join('')
const addition = (path, newBlob = '3'.repeat(40)) => ({ path, oldMode: '000000', newMode: '100644', oldBlob: zero, newBlob, status: 'A' })
const modification = path => ({ path, oldMode: '100644', newMode: '100644', oldBlob: '3'.repeat(40), newBlob: '4'.repeat(40), status: 'M' })
function evidence(options = {}) {
  const expected = { ...PAYLOAD_BLOBS, [SCRIPT_PATH]: blob(scriptBytes), [TEST_PATH]: TEST_BLOB, [MARKER_PATH]: blob(MARKER_CONTENT) }
  const complete = REVIEWED_PATHS.map(path => path === WORKFLOW_PATH
    ? { ...modification(path), oldBlob: BASE_WORKFLOW_BLOB, newBlob: blob(expectedWorkflow) }
    : addition(path, expected[path]))
  const data = { parents: [BASE_COMMIT], changes: complete, marker: MARKER_CONTENT,
    workflow: expectedWorkflow, beforeWorkflow: baseWorkflow, ...options }
  const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '1', ...options.env }
  const event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'refs/heads/main', before: BASE_COMMIT,
    after: head, head_commit: { id: head }, created: false, deleted: false, forced: false, ...options.event }
  const calls = []
  const git = (_cwd, args) => {
    calls.push(args)
    if (args[0] === 'rev-parse') return (options.head ?? head) + '\n'
    if (args[0] === 'ls-tree') return data.ownTree ?? `100644 blob ${blob(scriptBytes)}\t${SCRIPT_PATH}\0`
    if (args[0] === 'rev-list') return data.parentsRaw ?? `${head} ${data.parents.join(' ')}\n`
    if (args[0] === 'merge-base') { if (data.notAncestor) throw new Error('not ancestor'); return '' }
    if (args[0] === 'diff') {
      assert.deepEqual(args.slice(0, 7), ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '--no-abbrev', '-z'])
      return data.raw ?? rawChanges(data.rangeChanges && args[7] !== data.parents[0] ? data.rangeChanges : data.changes)
    }
    if (args[0] === 'cat-file') {
      if (args[2] === blob(MARKER_CONTENT)) return data.marker
      if (args[2] === BASE_WORKFLOW_BLOB) return data.beforeWorkflow
      if (args[2] === data.changes.find(change => change.path === WORKFLOW_PATH)?.newBlob) return data.workflow
    }
    assert.fail('Unexpected Git request: ' + JSON.stringify(args))
  }
  return { data, env, event, git, calls }
}
function select(options = {}) {
  const fixture = evidence(options)
  return selectContextToolsRelease({ cwd: root, env: fixture.env, event: fixture.event, git: fixture.git, scriptBytes })
}
function dispatch(options = {}) {
  const fixture = evidence({ ...options, env: { GITHUB_EVENT_NAME: 'workflow_dispatch', ...options.env } })
  fixture.event = { repository: { full_name: 'teslaeco/WORLDIFACT' }, ref: 'main', inputs: { confirmation: 'DEPLOY' }, ...options.event }
  return selectContextToolsRelease({ cwd: root, ...fixture, scriptBytes })
}
function reject(options) { assert.throws(() => select(options), /CONTEXT_TOOLS_RELEASE_NOT_VERIFIED|not ancestor/) }

// Expected production bytes are checked independently against the local payload.
test('the complete reviewed tools squash skips deploy and has exactly 26 bound files', () => {
  assert.deepEqual(select(), { deployAllowed: false })
  assert.equal(REVIEWED_PATHS.length, 26)
  assert.equal(Object.keys(PAYLOAD_BLOBS).length, 22)
  assert.equal(blob(baseWorkflow), BASE_WORKFLOW_BLOB)
  assert.equal(readFileSync(join(root, MARKER_PATH), 'utf8'), MARKER_CONTENT)
  assert.equal(readFileSync(join(root, WORKFLOW_PATH), 'utf8'), expectedWorkflow)
  assert.equal(blob(readFileSync(join(root, TEST_PATH))), TEST_BLOB)
  for (const [path, expected] of Object.entries(PAYLOAD_BLOBS)) assert.equal(blob(readFileSync(join(root, path))), expected, path)
})
test('exact-head workflow reruns and explicit manual dispatch cannot republish the tools merge', () => {
  for (const attempt of ['1', '2', '999']) {
    assert.deepEqual(select({ env: { GITHUB_RUN_ATTEMPT: attempt } }), { deployAllowed: false })
    assert.deepEqual(dispatch({ env: { GITHUB_RUN_ATTEMPT: attempt } }), { deployAllowed: false })
  }
  assert.deepEqual(dispatch({ event: { ref: 'refs/heads/main' } }), { deployAllowed: false })
})
test('wrong UI ancestor, event before/after, checked-out head and multi-parent histories refuse', () => {
  for (const options of [
    { parents: [other] }, { parents: [BASE_COMMIT, other] }, { parents: [other, BASE_COMMIT] },
    { event: { before: other } }, { event: { after: other } }, { event: { head_commit: { id: other } } },
    { env: { GITHUB_SHA: other } }, { head: other }, { parentsRaw: `${head}\n` },
    { notAncestor: true }, { event: { before: zero } }, { event: { forced: true } },
  ]) reject(options)
})
test('a multi-commit push range cannot hide partial tools changes behind an unrelated final commit', () => {
  const full = evidence().data.changes
  reject({ parents: [other], event: { before: '5'.repeat(40) }, changes: [modification('src/unrelated.ts')], rangeChanges: full })
  reject({ parents: [other], event: { before: BASE_COMMIT }, changes: [modification('src/unrelated.ts')], rangeChanges: full })
})
test('extra application/runtime changes and every missing reviewed file refuse', () => {
  const full = evidence().data.changes
  for (const path of ['server/studio.ts', 'server/entitlements.ts', 'tools/model_context/context_policy.py', 'src/main.tsx']) {
    reject({ changes: [...full, modification(path)] })
  }
  for (const path of REVIEWED_PATHS) reject({ changes: full.filter(change => change.path !== path) })
})
test('all additions require exact status, regular non-executable mode and pinned content', () => {
  const full = evidence().data.changes
  for (const target of full) {
    for (const field of [{ status: 'D' }, { status: 'R100' }, { status: 'T' }, { newMode: '120000' },
      { newMode: '100755' }, { newMode: '160000' }, { oldMode: '100644' }, { newBlob: '9'.repeat(40) }]) {
      if (target.path === WORKFLOW_PATH && field.oldMode) continue
      reject({ changes: full.map(change => change === target ? { ...change, ...field } : change) })
    }
  }
  reject({ ownTree: `120000 blob ${blob(scriptBytes)}\t${SCRIPT_PATH}\0` })
  reject({ ownTree: `100644 blob ${'f'.repeat(40)}\t${SCRIPT_PATH}\0` })
})
test('marker and entire transformed workflow bytes are verified without trimming or hash cycles', () => {
  for (const marker of ['', MARKER_CONTENT + '\n', MARKER_CONTENT.replace('false', 'true')]) reject({ marker })
  for (const workflow of [expectedWorkflow + '\n', expectedWorkflow.replace("deploy_allowed == 'true'", "deploy_allowed != 'false'"),
    expectedWorkflow.replace('persist-credentials: false', 'persist-credentials: true'),
    expectedWorkflow.replace('sha256sum -c -', 'true'), expectedWorkflow.replace("'PRESERVE'", "'LIVE'")]) reject({ workflow })
  reject({ beforeWorkflow: baseWorkflow + '\n' })
  assert.throws(() => guardedWorkflow(baseWorkflow, 'main'), /CONTEXT_TOOLS_RELEASE_NOT_VERIFIED/)
})
test('missing malformed or foreign event metadata never allows deployment', () => {
  for (const [key, value] of Object.entries({ GITHUB_REPOSITORY: 'attacker/repo', GITHUB_REF: 'refs/heads/other',
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '0', GITHUB_SHA: '' })) reject({ env: { [key]: value } })
  for (const key of ['repository', 'ref', 'before', 'after', 'head_commit', 'created', 'deleted', 'forced']) reject({ event: { [key]: undefined } })
  for (const event of [{ inputs: {} }, { inputs: { confirmation: 'no' } }, { before: BASE_COMMIT }, { after: head },
    { repository: null }, { ref: '' }]) assert.throws(() => dispatch({ event }), /CONTEXT_TOOLS_RELEASE_NOT_VERIFIED/)
})
test('ordinary unrelated validated push, multi-commit push and manual release preserve existing behavior', () => {
  const changes = [modification('src/unrelated.ts')]
  assert.deepEqual(select({ parents: [other], event: { before: other }, changes }), { deployAllowed: true })
  assert.deepEqual(select({ parents: [other, '6'.repeat(40)], event: { before: other }, changes }), { deployAllowed: true })
  assert.deepEqual(select({ parents: [other], event: { before: '5'.repeat(40) }, changes, rangeChanges: [...changes, modification('src/another.ts')] }), { deployAllowed: true })
  assert.deepEqual(dispatch({ parents: [other], changes }), { deployAllowed: true })
  assert.deepEqual(select({ parents: [other], event: { before: other }, changes: [] }), { deployAllowed: true })
})
test('later edits removals or partial reintroductions of the context envelope fail closed', () => {
  for (const path of REVIEWED_PATHS.filter(path => path !== WORKFLOW_PATH)) {
    for (const status of ['M', 'D', 'A']) reject({ parents: [other], event: { before: other }, changes: [{ ...modification(path), status }] })
  }
  reject({ parents: [other], event: { before: other }, changes: [addition('tools/model_context_upgrade/unreviewed.py')] })
})
test('raw Git diff parser rejects truncation renames duplicates and malformed metadata', () => {
  const one = rawChanges([modification('src/test.ts')])
  assert.equal(parseRawChanges(one).length, 1)
  assert.deepEqual(parseRawChanges(''), [])
  for (const value of [one.slice(0, -1), one + one, 'M\0src/test.ts\0', one.replace('100644', 'bad'), one + 'old\0new\0']) {
    assert.throws(() => parseRawChanges(value), /CONTEXT_TOOLS_RELEASE_NOT_VERIFIED/)
  }
})
test('preflight has no production environment or secrets and downstream deploy bytes are preserved', () => {
  const prefix = expectedWorkflow.slice(expectedWorkflow.indexOf('\n  context_tools_preflight:') + 1)
  assert.ok(prefix.includes('context_tools_preflight:'))
  assert.ok(prefix.includes('persist-credentials: false'))
  assert.ok(prefix.includes(`'${sha256(scriptBytes)}' | sha256sum -c - >&2`))
  assert.equal(prefix.includes('secrets.'), false)
  assert.equal(prefix.includes('environment:'), false)
  const oldBody = baseWorkflow.slice(baseWorkflow.indexOf('    environment:\n'))
  assert.equal(expectedWorkflow.slice(expectedWorkflow.indexOf('    environment:\n'), expectedWorkflow.indexOf('\n  context_tools_preflight:')), oldBody)
  assert.ok(expectedWorkflow.includes("needs.context_tools_preflight.result == 'success' && needs.context_tools_preflight.outputs.deploy_allowed == 'true'"))
  assert.equal(expectedWorkflow.includes('paths-ignore'), false)
})
test('the actual preflight checksum command succeeds only for the frozen guard bytes', () => {
  const line = expectedWorkflow.split('\n').find(line => line.trim().startsWith('printf')).trim()
  const valid = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', line], { cwd: root, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  const invalid = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', line.replace(sha256(scriptBytes), '0'.repeat(64))], { cwd: root, encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
})
test('legacy workflow_run paid markers and workflow source remain unchanged', () => {
  assert.deepEqual(REVIEWED_PATHS.filter(path => path.startsWith('ops/')), [MARKER_PATH])
  const listed = spawnSync('git', ['ls-tree', '-r', '--name-only', BASE_COMMIT, '--', '.github/workflows'], { cwd: root, encoding: 'utf8' })
  assert.equal(listed.status, 0)
  for (const path of listed.stdout.trim().split('\n').filter(path => path !== WORKFLOW_PATH)) {
    const prior = spawnSync('git', ['show', `${BASE_COMMIT}:${path}`], { cwd: root })
    assert.equal(prior.status, 0)
    assert.deepEqual(readFileSync(join(root, path)), prior.stdout, path)
  }
})
test('CLI errors emit no positive or negative GitHub output, so missing output cannot admit production', () => {
  const folder = mkdtempSync(join(tmpdir(), 'context-release-event-'))
  try {
    const event = join(folder, 'event.json'); writeFileSync(event, '{invalid')
    const result = spawnSync(process.execPath, [join(root, SCRIPT_PATH)], { cwd: root, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head } })
    assert.equal(result.status, 1); assert.equal(result.stdout, '')
    assert.match(result.stderr, /CONTEXT_TOOLS_RELEASE_NOT_VERIFIED/)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
