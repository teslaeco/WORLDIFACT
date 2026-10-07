import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE_COMMIT = '0934d82b25003dc0d9601b49c4119facdaeaea54'
export const BASE_WORKFLOW_BLOB = '3a616826fe38c1ec5a2a2d433710055012fac189'
export const WORKFLOW_PATH = '.github/workflows/cloudflare.yml'
export const SCRIPT_PATH = 'scripts/select-context-tools-release.mjs'
export const TEST_PATH = 'tests/context-tools-release.test.mjs'
export const MARKER_PATH = 'ops/STANDARD_CONTEXT_TOOLS_RELEASE_20261007.json'
export const TEST_BLOB = '35d8fb14021e00814e9ab64544fccd8143099c9b'
export const PAYLOAD_BLOBS = Object.freeze({
  ".github/workflows/model-context-upgrade-review.yml": "0f6eb629bbda8742e4869aa2d82713b4b369bc08",
  ".github/workflows/standard-context-runtime-readonly.yml": "541147021115df021ced575d925474bba9620de1",
  "docs/STANDARD_CONTEXT_UPGRADE_20261007.md": "ecb74508d989ee6e653a6339ed0aa79f1f88d0fd",
  "scripts/check-standard-context-runtime.mjs": "1da94e4aa46c42153429a47716b79a867bae930f",
  "tests/standard-context-runtime-readonly.test.mjs": "e108256e9b668e0cb223c17c6b0dbaff1bfed27b",
  "tools/model_context_upgrade/README.md": "0f85def037e0e735c69600f565d1dd917aecdd45",
  "tools/model_context_upgrade/context_policy.py": "4b8189fe9ae22eb074e48db593bdbead55545bf3",
  "tools/model_context_upgrade/inspect_candidate_readonly.py": "d19e4c69e1eed22d61c35dde8023922967eaf1e2",
  "tools/model_context_upgrade/install_upgrade.py": "843103b4a9fd6d239be076ebe5d89843c8d5140e",
  "tools/model_context_upgrade/offline_standard.py": "726327ad50a994232786333a7b428ff1e3b1e7f1",
  "tools/model_context_upgrade/oracle_upgrade_launch.py": "6cf4f14acb5fb4e525d8e040fc0df6dc8f7e44a3",
  "tools/model_context_upgrade/test_candidate_launcher.py": "2e7db0d0c0217fd07b0b35164ba2fae94ada78e7",
  "tools/model_context_upgrade/test_candidate_readonly.py": "9b51ad53d6158fb574a56cc2384766caa1fe457c",
  "tools/model_context_upgrade/test_context_presentation.py": "7c91d9dac92e52638764eef78730ed025039d002",
  "tools/model_context_upgrade/test_offline_standard.py": "25f61594692c6e4d615070a44c5460a0114c4500",
  "tools/model_context_upgrade/test_upgrade_gate_contract.py": "a7d63f3f2fa3eb3bdb1f262fe752702101c0bde9",
  "tools/model_context_upgrade/test_upgrade_launcher.py": "12ff556b674b6d2719c7316fa4a523e0ba8eaedc",
  "tools/model_context_upgrade/test_upgrade_manifest.py": "03b63191e5270c5dd07b51f38d67b015e288bdd2",
  "tools/model_context_upgrade/test_upgrade_transaction.py": "5b4c1d90f2a2c28f6c0e4ac56f6b004eaf0ca419",
  "tools/model_context_upgrade/upgrade_fence.py": "d5c810448d8d07999aa7c2baf703a4bc4994e3a2",
  "tools/model_context_upgrade/upgrade_patch.py": "71c4cac9891e50257e92b05f9336ce853ba8cdfc",
  "tools/model_context_upgrade/upgrade_test_support.py": "fe70d472d5e9c5bef35a2d5029180c295f9a1559"
})
export const REVIEWED_PATHS = Object.freeze([...Object.keys(PAYLOAD_BLOBS), WORKFLOW_PATH, SCRIPT_PATH, TEST_PATH, MARKER_PATH].sort())
export const MARKER_CONTENT = JSON.stringify({
  release: 'standard-context-tools-only-20261007',
  baseCommit: BASE_COMMIT,
  sourceOnly: true,
  deployAllowed: false,
  existingOracleActivation: 'worldifact-standard-context-v2',
  preserveCloudflareDeployment: true,
  paidGenerationRequested: false,
}, null, 2) + '\n'
const HEX = /^[a-f0-9]{40}$/
const ZERO = '0'.repeat(40)
const ORIGINAL_IF = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || inputs.confirmation == 'DEPLOY')"
const PREFIX = 'jobs:\n  deploy:\n    if: ' + ORIGINAL_IF + '\n'
const FAULT = 'CONTEXT_TOOLS_RELEASE_NOT_VERIFIED'
function refused() { throw new Error(FAULT) }
function sha(value) { return typeof value === 'string' && HEX.test(value) && value !== ZERO }
export function blob(bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  return createHash('sha1').update(Buffer.from(`blob ${value.length}\0`)).update(value).digest('hex')
}
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

// The only workflow edit is this reviewed preflight and the deploy dependency.
// Its checksum is supplied after this guard is frozen, avoiding a hash cycle.
export function guardedWorkflow(base, guardSha) {
  if (typeof base !== 'string' || base.split(PREFIX).length !== 2 || !/^[a-f0-9]{64}$/.test(guardSha)) refused()
  const preflight = `  context_tools_preflight:
    if: ${ORIGINAL_IF}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      deploy_allowed: \${{ steps.scope.outputs.deploy_allowed }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: 24
      - name: Verify exact tools-only release before production admission
        id: scope
        shell: bash
        run: |
          set -euo pipefail
          printf '%s  scripts/select-context-tools-release.mjs\\n' '${guardSha}' | sha256sum -c - >&2
          node scripts/select-context-tools-release.mjs >> "$GITHUB_OUTPUT"
`
  const deploy = `jobs:
  deploy:
    needs: context_tools_preflight
    if: needs.context_tools_preflight.result == 'success' && needs.context_tools_preflight.outputs.deploy_allowed == 'true' && (${ORIGINAL_IF})
`
  return base.replace(PREFIX, deploy) + '\n' + preflight
}

export function parseRawChanges(raw) {
  if (typeof raw !== 'string' || raw.length > 2 * 1024 ** 2 || raw.includes('\ufffd')) refused()
  if (raw === '') return []
  const values = raw.split('\0')
  if (values.pop() !== '' || values.length % 2) refused()
  const found = new Set(), changes = []
  for (let index = 0; index < values.length; index += 2) {
    const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z][0-9]*)$/.exec(values[index])
    const path = values[index + 1]
    if (!match || !path || /[\r\n]/.test(path) || found.has(path)) refused()
    found.add(path)
    changes.push({ oldMode: match[1], newMode: match[2], oldBlob: match[3], newBlob: match[4], status: match[5], path })
  }
  return changes
}

function readGit(cwd, args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 ** 2,
  })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') refused()
  return result.stdout
}
function readEvent(env) {
  if (typeof env.GITHUB_EVENT_PATH !== 'string' || !env.GITHUB_EVENT_PATH) refused()
  const info = lstatSync(env.GITHUB_EVENT_PATH)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > 2 * 1024 ** 2) refused()
  const value = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
  if (!value || Array.isArray(value) || typeof value !== 'object') refused()
  return value
}
function executingBytes() {
  const path = fileURLToPath(import.meta.url), info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) refused()
  return readFileSync(path)
}
function eventScope(env, event, head) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== 'refs/heads/main'
      || !sha(env.GITHUB_SHA) || env.GITHUB_SHA !== head
      || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
      || !event || typeof event !== 'object' || Array.isArray(event)
      || event.repository?.full_name !== env.GITHUB_REPOSITORY) refused()
  if (env.GITHUB_EVENT_NAME === 'push') {
    if (event.ref !== env.GITHUB_REF || !sha(event.before) || !sha(event.after) || event.after !== head
        || event.before === event.after || event.head_commit?.id !== head
        || event.deleted !== false || event.created !== false || event.forced !== false) refused()
    return { kind: 'push', before: event.before }
  }
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (!['main', 'refs/heads/main'].includes(event.ref) || event.inputs?.confirmation !== 'DEPLOY'
        || Object.keys(event.inputs).length !== 1 || 'before' in event || 'after' in event) refused()
    return { kind: 'workflow_dispatch' }
  }
  refused()
}

export function selectContextToolsRelease({ cwd = process.cwd(), env = process.env,
  event, git = readGit, scriptBytes = executingBytes() } = {}) {
  if (!sha(BASE_COMMIT) || !HEX.test(BASE_WORKFLOW_BLOB) || !HEX.test(TEST_BLOB)
      || Object.keys(PAYLOAD_BLOBS).length !== 22 || REVIEWED_PATHS.length !== 26
      || new Set(REVIEWED_PATHS).size !== 26 || Object.values(PAYLOAD_BLOBS).some(value => !HEX.test(value))) refused()
  const head = git(cwd, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim()
  if (!sha(head)) refused()
  const scope = eventScope(env, event === undefined ? readEvent(env) : event, head)
  const ownTree = git(cwd, ['ls-tree', '-z', head, '--', SCRIPT_PATH])
  if (ownTree !== `100644 blob ${blob(scriptBytes)}\t${SCRIPT_PATH}\0`) refused()
  const family = git(cwd, ['rev-list', '--parents', '-n', '1', head]).trim().split(' ')
  if (family[0] !== head || family.length < 2 || family.some(value => !sha(value))) refused()
  const parents = family.slice(1)
  const diff = before => parseRawChanges(git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames',
    '--raw', '--no-abbrev', '-z', before, head, '--']))
  const immediate = diff(parents[0])
  let changes = immediate
  if (scope.kind === 'push') {
    git(cwd, ['merge-base', '--is-ancestor', scope.before, head])
    if (scope.before !== parents[0]) changes = diff(scope.before)
  }
  // The marker is not a lasting paths-ignore. Later unrelated changes keep the
  // existing release behavior; a partial/reworked tools envelope must be reviewed.
  const unique = new Set(REVIEWED_PATHS.filter(path => path !== WORKFLOW_PATH))
  const candidate = parents.includes(BASE_COMMIT) || scope.before === BASE_COMMIT
    || [...immediate, ...changes].some(change => unique.has(change.path) || change.path.startsWith('tools/model_context_upgrade/'))
  if (!candidate) return { deployAllowed: true }
  if (parents.length !== 1 || parents[0] !== BASE_COMMIT
      || scope.kind === 'push' && scope.before !== BASE_COMMIT) refused()
  if (changes.length !== REVIEWED_PATHS.length
      || changes.map(change => change.path).sort().join('\0') !== REVIEWED_PATHS.join('\0')) refused()
  const expected = { ...PAYLOAD_BLOBS, [TEST_PATH]: TEST_BLOB,
    [SCRIPT_PATH]: blob(scriptBytes), [MARKER_PATH]: blob(MARKER_CONTENT) }
  for (const change of changes) {
    if (change.path === WORKFLOW_PATH) {
      if (change.status !== 'M' || change.oldMode !== '100644' || change.newMode !== '100644'
          || change.oldBlob !== BASE_WORKFLOW_BLOB || !sha(change.newBlob)) refused()
    } else if (change.status !== 'A' || change.oldMode !== '000000' || change.oldBlob !== ZERO
        || change.newMode !== '100644' || change.newBlob !== expected[change.path]) refused()
  }
  const marker = changes.find(change => change.path === MARKER_PATH)
  if (git(cwd, ['cat-file', 'blob', marker.newBlob]) !== MARKER_CONTENT) refused()
  const beforeWorkflow = git(cwd, ['cat-file', 'blob', BASE_WORKFLOW_BLOB])
  const afterWorkflow = git(cwd, ['cat-file', 'blob', changes.find(change => change.path === WORKFLOW_PATH).newBlob])
  if (blob(beforeWorkflow) !== BASE_WORKFLOW_BLOB
      || blob(afterWorkflow) !== changes.find(change => change.path === WORKFLOW_PATH).newBlob
      || afterWorkflow !== guardedWorkflow(beforeWorkflow, sha256(scriptBytes))) refused()
  return { deployAllowed: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const selected = selectContextToolsRelease()
    if (typeof selected.deployAllowed !== 'boolean') refused()
    process.stdout.write(`deploy_allowed=${selected.deployAllowed}\n`)
  } catch {
    console.error(FAULT + ': production admission stopped before credentials.')
    process.exitCode = 1
  }
}
