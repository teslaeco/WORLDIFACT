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
// A normal hosted checkout may not contain the ancestor object. Recover only
// the reviewed inverse transform, then cryptographically require the exact UI
// base workflow. Neither Git history nor a self-asserted derived fixture suffices.
const originalIf = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || inputs.confirmation == 'DEPLOY')"
const guardedHeader = `jobs:\n  deploy:\n    needs: context_tools_preflight\n    if: needs.context_tools_preflight.result == 'success' && needs.context_tools_preflight.outputs.deploy_allowed == 'true' && (${originalIf})\n`
const currentWorkflow = readFileSync(join(root, WORKFLOW_PATH), 'utf8')
const workflowParts = currentWorkflow.split('\n  context_tools_preflight:\n')
assert.equal(workflowParts.length, 2, 'Exactly one appended preflight is required.')
assert.equal(workflowParts[0].split(guardedHeader).length, 2, 'Exactly one guarded deploy header is required.')
const baseWorkflow = workflowParts[0].replace(guardedHeader, `jobs:\n  deploy:\n    if: ${originalIf}\n`)
assert.equal(blob(baseWorkflow), BASE_WORKFLOW_BLOB, 'Inverse workflow fixture must equal the immutable UI base blob.')
const expectedWorkflow = guardedWorkflow(baseWorkflow, sha256(scriptBytes))
// Immutable workflow blobs from actual UI base 0934d82, excluding the one reviewed transform.
const LEGACY_WORKFLOW_BLOBS = Object.freeze({
  ".github/workflows/ai-shop-integration-check.yml": "e7a70d1093bde218989b0a7ffc1a2941b6dfc2a6",
  ".github/workflows/approved-fast-cost-review.yml": "384d3c65e5090b77d4eb49059c70f17b6d66ac01",
  ".github/workflows/approved-model-test-once.yml": "c06fc5996bd5209164e35daac3a88b86fe255306",
  ".github/workflows/astra-activation-test-once.yml": "1cd82788e804f8ed234daa7341629c1cafcae14c",
  ".github/workflows/astra-direct-activation-test-once.yml": "833a3a6f2def7286291c8293f223966df6a59a83",
  ".github/workflows/astra-profit-guard-review.yml": "af34bebdf51d6e7898734409196a16336beb8645",
  ".github/workflows/astra-runtime-readonly.yml": "bc5ca4921559d7fefaaab114e0332b4b12cf40dc",
  ".github/workflows/billing-recovery-review.yml": "9adaf36be028aca4f89895f9dcb372588ef43812",
  ".github/workflows/ci.yml": "47fa876758aef48ec15b915eb7c4fc72c4293c36",
  ".github/workflows/contest-live-paid-smoke-once.yml": "666c72b0b3aaabb3ae5eac6646340e83f7f99b31",
  ".github/workflows/expired-billing-recovery-review.yml": "fb49e18cc6676cb979f9e82afb8e8a382073c9a6",
  ".github/workflows/fast-install-review.yml": "f2b2b182efd95707eaef6efdfe9f965894a80359",
  ".github/workflows/fast-launch-review.yml": "b5b81b69d80551a79256303c14cbbfa1c027637e",
  ".github/workflows/fast-preview-review.yml": "b87a775112062df06b518ddd1b80393fcb6c954c",
  ".github/workflows/ingest-portal-building-exports-once.yml": "1bfb92eba4e99e3b393d7141bb1e9a7fd7e93fdf",
  ".github/workflows/ingest-portal-building-once.yml": "30f35f6070b4e10601c1c46a5665d65c05047c05",
  ".github/workflows/inspect-astra-activation-job.yml": "22cd4b548e3023c4cdf12eee3d55313d9dae8273",
  ".github/workflows/model-completion-review.yml": "e3be68677c6e661ea94201232b2731f243fa11f4",
  ".github/workflows/oracle-artifact-review-once.yml": "f996d87fd7a933f202dfb37eb32d726fe641ab65",
  ".github/workflows/p0-pilot-once.yml": "3d531cc27f560174b22968dea56fe79f192f63c7",
  ".github/workflows/p0-pilot-recovery-once.yml": "a2b30d36da0221fcade9b6e73d27cb32dd91c5ee",
  ".github/workflows/pilot.yml": "6cb0a5c96fb6d4cc42b3834ba55dd833e3ca8022",
  ".github/workflows/plan-card-payment-review.yml": "d98798239a4a6870d486e0c72acdbdd6439ac370",
  ".github/workflows/prepare-model-quality-v3.yml": "2bd2556b7d8157e98b0be4cf72325df8bf1e3337",
  ".github/workflows/prepare-prompt-model-ui.yml": "e53aed760badd5667e7cf552b3b4c9b361c738e2",
  ".github/workflows/private-game-publication.yml": "7a278241b0b9cbdc3cfa032ba74741920509da96",
  ".github/workflows/project-files-review.yml": "2b53ff0381ca1798a2dba40dafe4129184e49f8a",
  ".github/workflows/resume-approved-studio-once.yml": "b1058002f21c41187a84557f2c53723601eb1c54",
  ".github/workflows/shop-mcp2-pilot-once.yml": "30c6416d69d9f7bac4c8eb9cd3f6968887d36317",
  ".github/workflows/shop-ui-preview.yml": "4b065f4b0c70126994b83f67e5a5a2e7b279bd62",
  ".github/workflows/stripe-setup.yml": "272c524735a4645dafbd4c76e3ec1a33ad6eb248",
  ".github/workflows/verify-mcc-publication.yml": "5985a19a0686759ee10aabbf0bf7cfc906fd219f"
})
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
  assert.equal(Object.keys(LEGACY_WORKFLOW_BLOBS).length, 32)
  for (const [path, expectedBlob] of Object.entries(LEGACY_WORKFLOW_BLOBS)) {
    assert.equal(blob(readFileSync(join(root, path))), expectedBlob, path)
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
