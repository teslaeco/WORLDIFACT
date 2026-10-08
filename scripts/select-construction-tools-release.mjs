import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  blob, sha256, parseRawChanges, selectContextToolsRelease,
  SCRIPT_PATH as LEGACY_SCRIPT_PATH,
} from './select-context-tools-release.mjs'

export const BASE_COMMIT = '944b486249b54cca02e6ed8ca426da6eba296391'
export const BASE_WORKFLOW_BLOB = 'a477707b194b5e88fcf8178e3f37c37aa93a41bd'
export const LEGACY_SCRIPT_BLOB = '465898752099691d8cee1ca989575c2b83febab3'
export const SCRIPT_PATH = 'scripts/select-construction-tools-release.mjs'
export const CONFIG_PATH = 'config/oracle-construction-tools-release.json'
export const TEST_PATH = 'tests/construction-tools-release.test.mjs'
export const WORKFLOW_PATH = '.github/workflows/cloudflare.yml'
// Freeze only after reviewing the complete single-parent squash payload.
// Config excludes this script and the derived workflow, so there is no cycle.
export const CONFIG_BLOB = 'ad7874ed47b148a39301742cc2185c922692e6bf'
export const FAULT = 'CONSTRUCTION_TOOLS_RELEASE_NOT_VERIFIED'
export const BASE_SCRIPT_BLOB = 'ae53c25cc03ee5011f5a99f9005daaab0a175466'
export const BASE_CONFIG_BLOB = '503cfaf64a3c6bf0d0ffa897ff22c58508ed9134'
export const BASE_SCRIPT_SHA256 = 'd3b1a325d5962681c06f27498e16dcb8b013300a8318857f8b8fb45e770fff07'
export const BASE_CONFIG_SHA256 = '77e59318616bd8872716ff4e44dac1d48a2faf845e7ee9d341ff0d815f85945a'
// Only these reviewed payload files may join the three guard files. The sole
// addition is compiled here; mutable config cannot invent another new path.
// Old blobs are authority in this reviewed wrapper, never in mutable config.
export const ADDED_PAYLOAD_PATH = 'tools/model_construction/test_construction_payload_update.py'
export const BASE_PAYLOAD_BLOBS = Object.freeze({
  [TEST_PATH]: '96a730c841ca66cddc3ea3c1e254079b5cc4155a',
  'tools/model_construction/README.md': '69f7900f92bee97dfa8d3b66001276c69ec1f9a5',
  'tools/model_construction/construction_manifest.py': '924ae02125e915d784cc4a6b892c8e0dc910a92d',
  'tools/model_construction/construction_payload.py': '396736815efe8322a3846f76352546e81332f0f5',
  'tools/model_construction/install_construction.py': 'a96d0c009b410f9984aca3e536905eb3f0d64f01',
  'tools/model_construction/oracle_construction_launch.py': 'c7d0f0f5799af001d1af3e754ec1d47e516026be',
  'tools/model_construction/test_construction_launcher.py': '4c3f342d54994a456c0f4e3aa11b5c25c2f0eede',
  'tools/model_construction/test_construction_manifest.py': '3403687f4afd54e8fb82a5a2daa8cce683c53cb9',
  'tools/model_construction/test_construction_payload.py': '7f8a57898b14e0545fa002c4da8b75815d303e84',
  [ADDED_PAYLOAD_PATH]: '0'.repeat(40),
  'tools/model_construction/test_native_pipeline.py': 'a5359423b86582f5e32c0d0e7ed37c2d160d7a2b',
})
// Preserve the historical context test's manifest contract without permitting
// this unchanged path in the repair diff. Both historical hashes are immutable.
export const LEGACY_TEST_PATH = 'tests/context-tools-release.test.mjs'
export const LEGACY_TEST_RECORD = Object.freeze({
  oldMode: '100644', newMode: '100644',
  oldBlob: '5a29e2e378fe40c9157b9a6bc1df50cdabfa8c19',
  newBlob: '0635b96ed9861b7130200ee39a46d0f0bf43979c', status: 'M',
})
export const REVIEWED_PATHS = Object.freeze([
  ...Object.keys(BASE_PAYLOAD_BLOBS), SCRIPT_PATH, CONFIG_PATH, WORKFLOW_PATH,
].sort())

const HEX = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const ZERO = '0'.repeat(40)
const CONFIG_KEYS = ['revision', 'release', 'baseCommit', 'sourceOnly', 'deployAllowed',
  'preserveCloudflareDeployment', 'paidGenerationRequested', 'status', 'payload']
const ENTRY_KEYS = ['oldMode', 'newMode', 'oldBlob', 'newBlob', 'status']

function refused() { throw new Error(FAULT) }
function sha(value) { return typeof value === 'string' && HEX.test(value) && value !== ZERO }
function sameKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}
function constructionPath(path) {
  return typeof path === 'string' && (/construction/i.test(path)
    || path.startsWith('tools/model_construction/'))
}

export function readManifest(raw, expectedBlob = CONFIG_BLOB) {
  if (!sha(expectedBlob) || !Buffer.isBuffer(raw) || raw.length < 2 || raw.length > 128 * 1024
      || blob(raw) !== expectedBlob) refused()
  let value
  try { value = JSON.parse(raw.toString('utf8')) } catch { refused() }
  // Canonical pretty bytes reject replacement characters, duplicate keys and
  // ambiguous serialization, in addition to the compiled immutable blob pin.
  if (Buffer.compare(raw, Buffer.from(JSON.stringify(value, null, 2) + '\n')) !== 0
      || !sameKeys(value, CONFIG_KEYS)
      || value.revision !== 'oracle-construction-tools-release-v5'
      || value.release !== 'standard-construction-response-envelope-tools-only-20261008'
      || value.baseCommit !== BASE_COMMIT || value.sourceOnly !== true
      || value.deployAllowed !== false || value.preserveCloudflareDeployment !== true
      || value.paidGenerationRequested !== false || value.status !== 'FROZEN'
      || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) refused()
  if (!sameKeys(value.payload, [...Object.keys(BASE_PAYLOAD_BLOBS), LEGACY_TEST_PATH])) refused()
  if (!sameKeys(value.payload[LEGACY_TEST_PATH], ENTRY_KEYS)
      || ENTRY_KEYS.some(key => value.payload[LEGACY_TEST_PATH][key] !== LEGACY_TEST_RECORD[key])) refused()
  for (const path of Object.keys(BASE_PAYLOAD_BLOBS)) {
    const entry = value.payload[path]
    const added = path === ADDED_PAYLOAD_PATH
    if (!sameKeys(entry, ENTRY_KEYS) || entry.newMode !== '100644'
        || entry.oldMode !== (added ? '000000' : '100644')
        || entry.status !== (added ? 'A' : 'M')
        || entry.oldBlob !== BASE_PAYLOAD_BLOBS[path]
        || !sha(entry.newBlob) || entry.oldBlob === entry.newBlob) refused()
  }
  return value
}

export function guardedWorkflow(base, scriptSha, configSha) {
  if (typeof base !== 'string' || !SHA256.test(scriptSha) || !SHA256.test(configSha)) refused()
  let result = base
  // Keep the unchanged context test's historical transform API. Reconstruct
  // the exact reviewed workflow before editing it; this is not a second release base.
  if (blob(result) === '06db92301113f826e9dc470d6794cfe4fa4325d7') {
    const oldCommand = `          node ${LEGACY_SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`
    if (result.split(oldCommand).length !== 2) refused()
    result = result.replace(oldCommand,
      `          printf '%s  ${SCRIPT_PATH}\\n' '${BASE_SCRIPT_SHA256}' | sha256sum -c - >&2\n`
      + `          printf '%s  ${CONFIG_PATH}\\n' '${BASE_CONFIG_SHA256}' | sha256sum -c - >&2\n`
      + `          node ${SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`)
  }
  if (blob(result) !== BASE_WORKFLOW_BLOB) refused()
  for (const [path, previous, next] of [
    [SCRIPT_PATH, BASE_SCRIPT_SHA256, scriptSha],
    [CONFIG_PATH, BASE_CONFIG_SHA256, configSha],
  ]) {
    const command = `          printf '%s  ${path}\\n' '${previous}' | sha256sum -c - >&2\n`
    if (result.split(command).length !== 2) refused()
    result = result.replace(command, command.replace(previous, next))
  }
  return result
}

function readGit(cwd, args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 ** 2,
  })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') refused()
  return result.stdout
}
function regularBytes(path, maximum) {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) refused()
  return readFileSync(path)
}
function readEvent(env) {
  if (typeof env.GITHUB_EVENT_PATH !== 'string' || !env.GITHUB_EVENT_PATH) refused()
  const value = JSON.parse(regularBytes(env.GITHUB_EVENT_PATH, 2 * 1024 ** 2))
  if (!value || Array.isArray(value) || typeof value !== 'object') refused()
  return value
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

export function selectConstructionToolsRelease({ cwd = process.cwd(), env = process.env,
  event, git = readGit, scriptBytes = regularBytes(fileURLToPath(import.meta.url), 128 * 1024),
  // Read-only fixture injection. Neither CLI flags, environment variables nor
  // target receipts can override the production CONFIG_BLOB constant.
  configBytes, configBlob = CONFIG_BLOB, legacySelector = selectContextToolsRelease } = {}) {
  const head = git(cwd, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim()
  if (!sha(head)) refused()
  const selectedEvent = event === undefined ? readEvent(env) : event
  const scope = eventScope(env, selectedEvent, head)
  if (git(cwd, ['ls-tree', '-z', head, '--', SCRIPT_PATH]) !== `100644 blob ${blob(scriptBytes)}\t${SCRIPT_PATH}\0`
      || git(cwd, ['ls-tree', '-z', head, '--', LEGACY_SCRIPT_PATH]) !== `100644 blob ${LEGACY_SCRIPT_BLOB}\t${LEGACY_SCRIPT_PATH}\0`) refused()
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
  const candidate = parents.includes(BASE_COMMIT) || scope.before === BASE_COMMIT
    || [...immediate, ...changes].some(change => constructionPath(change.path))
  if (!candidate) return legacySelector({ cwd, env, event: selectedEvent, git })
  // A review branch may have arbitrary history, but only its single-parent
  // reviewed main squash can establish this one source-only release envelope.
  if (parents.length !== 1 || parents[0] !== BASE_COMMIT
      || scope.kind === 'push' && scope.before !== BASE_COMMIT) refused()
  const rawConfig = configBytes ?? regularBytes(resolve(cwd, CONFIG_PATH), 128 * 1024)
  const manifest = readManifest(rawConfig, configBlob)
  if (git(cwd, ['ls-tree', '-z', head, '--', CONFIG_PATH]) !== `100644 blob ${configBlob}\t${CONFIG_PATH}\0`) refused()
  if (git(cwd, ['ls-tree', '-z', head, '--', LEGACY_TEST_PATH])
      !== `100644 blob ${LEGACY_TEST_RECORD.newBlob}\t${LEGACY_TEST_PATH}\0`) refused()
  const expected = { ...Object.fromEntries(Object.keys(BASE_PAYLOAD_BLOBS).map(path => [path, manifest.payload[path]])),
    [SCRIPT_PATH]: { oldMode: '100644', newMode: '100644',
      oldBlob: BASE_SCRIPT_BLOB, newBlob: blob(scriptBytes), status: 'M' },
    [CONFIG_PATH]: { oldMode: '100644', newMode: '100644',
      oldBlob: BASE_CONFIG_BLOB, newBlob: configBlob, status: 'M' },
  }
  if (changes.length !== REVIEWED_PATHS.length
      || changes.map(change => change.path).sort().join('\0') !== REVIEWED_PATHS.join('\0')) refused()
  for (const change of changes) {
    if (change.path === WORKFLOW_PATH) {
      if (change.status !== 'M' || change.oldMode !== '100644' || change.newMode !== '100644'
          || change.oldBlob !== BASE_WORKFLOW_BLOB || !sha(change.newBlob)) refused()
    } else if (ENTRY_KEYS.some(key => change[key] !== expected[change.path][key])) refused()
  }
  const workflow = changes.find(change => change.path === WORKFLOW_PATH)
  const before = git(cwd, ['cat-file', 'blob', BASE_WORKFLOW_BLOB])
  const after = git(cwd, ['cat-file', 'blob', workflow.newBlob])
  if (blob(before) !== BASE_WORKFLOW_BLOB || blob(after) !== workflow.newBlob
      || after !== guardedWorkflow(before, sha256(scriptBytes), sha256(rawConfig))) refused()
  return { deployAllowed: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const selected = selectConstructionToolsRelease()
    if (typeof selected.deployAllowed !== 'boolean') refused()
    process.stdout.write(`deploy_allowed=${selected.deployAllowed}\n`)
  } catch {
    console.error(FAULT + ': production admission stopped before credentials.')
    process.exitCode = 1
  }
}
