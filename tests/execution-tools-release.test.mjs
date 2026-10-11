import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blob, sha256 } from '../scripts/select-context-tools-release.mjs'
import { EXECUTION_TOOLS_BASE, EXECUTION_TOOLS_PAYLOAD, selectFailedHoldRelease, requireFailedHoldRelease } from '../scripts/select-failed-hold-release.mjs'
const head = '1'.repeat(40), script = 'scripts/select-failed-hold-release.mjs', workflow = '.github/workflows/cloudflare.yml'
const scriptBytes = readFileSync(script), deployed = readFileSync(workflow, 'utf8')
const prior = deployed.replace(sha256(scriptBytes), 'd74667e751f0001ba7a81f895b1de65a697a73871363f2ea992bbf83f4eaf4c1')
function fixture({ extra = false, corrupt = false, parent = EXECUTION_TOOLS_BASE, workflowAfter = deployed } = {}) {
  const changes = Object.entries(EXECUTION_TOOLS_PAYLOAD).map(([path, hash]) => ({ path, hash }))
  changes.push({ path: script, hash: blob(scriptBytes) }, { path: workflow, hash: blob(workflowAfter) })
  if (extra) changes.push({ path: 'server/studio.ts', hash: '2'.repeat(40) })
  if (corrupt) changes[0].hash = '3'.repeat(40)
  const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' }
  const event = { repository: { full_name: env.GITHUB_REPOSITORY }, ref: env.GITHUB_REF, before: EXECUTION_TOOLS_BASE,
    after: head, head_commit: { id: head }, deleted: false, created: false, forced: false }
  const git = (_, args) => {
    if (args[0] === 'rev-parse') return head
    if (args[0] === 'rev-list') return `${head} ${parent}`
    if (args[0] === 'merge-base') return ''
    if (args[0] === 'ls-tree') return `100644 blob ${blob(scriptBytes)}\t${script}\0`
    if (args[0] === 'show') return args[1].startsWith(head) ? workflowAfter : prior
    if (args[0] === 'diff') return changes.map(({path,hash}) => `:100644 100644 ${'9'.repeat(40)} ${hash} M\0${path}\0`).join('')
    throw Error('Unexpected Git operation')
  }
  return { env, event, git, scriptBytes }
}
test('exact Oracle source publication never deploys Cloudflare or waives held points', () => {
  for (const [path, hash] of Object.entries(EXECUTION_TOOLS_PAYLOAD)) assert.equal(blob(readFileSync(path)), hash)
  assert.deepEqual(selectFailedHoldRelease(fixture()), { deployAllowed: false, failedHoldWaiver: false })
  assert.throws(() => requireFailedHoldRelease(fixture()))
})
test('changed payload, runtime additions, wrong parent and expanded workflow refuse', () => {
  for (const option of [{ extra: true }, { corrupt: true }, { parent: '8'.repeat(40) }, { workflowAfter: deployed + '\n# extra\n' }])
    assert.throws(() => selectFailedHoldRelease(fixture(option)))
})
