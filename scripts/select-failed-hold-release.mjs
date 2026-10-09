import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blob, sha256, parseRawChanges } from './select-context-tools-release.mjs'
import { selectConstructionToolsRelease } from './select-construction-tools-release.mjs'

export const BASE_COMMIT = '31c9e41a6f8a68bb6c7bbe748e79803f63835c36'
export const BASE_WORKFLOW_BLOB = 'bff8037e7e2aea0bb6fbaffff80ab922854ab429'
export const WORKFLOW_PATH = '.github/workflows/cloudflare.yml'
export const SCRIPT_PATH = 'scripts/select-failed-hold-release.mjs'
export const CONFIG_PATH = 'config/failed-hold-release.json'
// Freeze the complete payload first, then this manifest pin, then the derived workflow.
export const CONFIG_BLOB = 'db69ce0a4bb6f453941cb2f8254ff137c2307b2c'
export const FAULT = 'FAILED_HOLD_RELEASE_NOT_VERIFIED'
export const PRESERVED_BLOBS = Object.freeze({
  'scripts/select-context-tools-release.mjs': '465898752099691d8cee1ca989575c2b83febab3',
  'scripts/select-construction-tools-release.mjs': '91db92fccef4ec1e65148c9d4d9502989ac87082',
  'config/oracle-construction-tools-release.json': '06a396c843519d66c9ca639e625d7adf1b3b2d99',
  'scripts/select-pipeline-only-release.mjs': 'ddd1ffd70882a4a61880422d099218197c1908b6',
  'scripts/build-compatible-mcc-config.mjs': '3b520c6e0a60a0f70b5ed3d3132b8b596f7b53c3',
  'scripts/check-compatible-mcc-release.mjs': 'b361366dc3c5375697549188c26be4582bf55b65',
  'scripts/release-check.ts': '19f1b45a04fe7aa1c4bf8280b6f8462692eabae0',
  'scripts/prepare-public-gallery.mjs': '3ba284be8048cf95ae10432bd2ec5424c6eba2b7',
  'wrangler.jsonc': '9f9a32aebf4a78e1deb9f0e94cbf600fc72c806a',
})
export const HISTORICAL_TEST_BLOBS = Object.freeze({
  'tests/context-tools-release.test.mjs': '0635b96ed9861b7130200ee39a46d0f0bf43979c',
  'tests/construction-tools-release.test.mjs': '143ac07c2d688eebe0cb11874b600a7d2c377f43',
})
const HEX = /^[a-f0-9]{40}$/, SHA256 = /^[a-f0-9]{64}$/, ZERO = '0'.repeat(40)
const ENTRY_KEYS = ['oldMode', 'newMode', 'oldBlob', 'newBlob', 'status']
const ORIGINAL_COMMAND = '          node scripts/select-construction-tools-release.mjs >> "$GITHUB_OUTPUT"\n'
const FLAG_OUTPUT = '      failed_hold_waiver: ${{ steps.scope.outputs.failed_hold_waiver }}\n'
const ORIGINAL_OUTPUT = '      deploy_allowed: ${{ steps.scope.outputs.deploy_allowed }}\n'
const JOB = `
  failed_hold_release:
    needs: context_tools_preflight
    if: needs.context_tools_preflight.result == 'success' && needs.context_tools_preflight.outputs.failed_hold_waiver == 'true' && (github.ref == 'refs/heads/main' && (github.event_name == 'push' || inputs.confirmation == 'DEPLOY'))
    environment:
      name: production
      url: \${{ steps.failed_hold_receipt.outputs.url }}
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          fetch-depth: 2
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: 24
          cache: npm
      - name: Reverify exact incident release before credential setup
        run: node scripts/select-failed-hold-release.mjs --require-waiver
      - name: Check incident deployment input names and format
        run: node scripts/release-check.ts credentials
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: npm ci
      - run: npm run verify
      - uses: ./.github/actions/foundations
      - name: Prepare configuration preserving incident release
        run: node scripts/prepare-failed-hold-release.mjs
      - name: Dry-run incident Worker and assets
        run: npx wrangler deploy --dry-run --config .failed-hold-release.wrangler.json --outdir .wrangler/preview
      - name: Verify pinned public gallery files
        run: node scripts/prepare-public-gallery.mjs --verify-dist
      - name: Deploy incident Worker and assets with remote configuration preserved
        run: |
          if WRANGLER_LOG=none WRANGLER_WRITE_LOGS=false WRANGLER_SEND_METRICS=false WRANGLER_SEND_ERROR_REPORTS=false \\
            npx wrangler deploy --config .failed-hold-release.wrangler.json --keep-vars > /dev/null 2>&1; then
            echo 'Deployment command completed; strict receipt and static verification follows.'
          else
            echo '::error::Deployment failed. Potentially private command output was suppressed.'
            exit 1
          fi
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_OUTPUT_FILE_PATH: \${{ runner.temp }}/worldifact-failed-hold-deploy.ndjson
      - name: Verify incident assets and exclusive Worker traffic
        id: failed_hold_receipt
        run: node scripts/check-failed-hold-release.mjs
        env:
          WRANGLER_OUTPUT_FILE_PATH: \${{ runner.temp }}/worldifact-failed-hold-deploy.ndjson
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`
function refused() { throw new Error(FAULT) }
function sha(value) { return typeof value === 'string' && HEX.test(value) && value !== ZERO }
function sameKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}
function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) refused()
  return value.replace(before, after)
}
function checksumLines(scriptSha, configSha) {
  if (!SHA256.test(scriptSha) || !SHA256.test(configSha)) refused()
  return `          printf '%s  ${SCRIPT_PATH}\\n' '${scriptSha}' | sha256sum -c - >&2\n`
    + `          printf '%s  ${CONFIG_PATH}\\n' '${configSha}' | sha256sum -c - >&2\n`
    + `          node ${SCRIPT_PATH} >> "$GITHUB_OUTPUT"\n`
}
export function guardedWorkflow(base, scriptSha, configSha) {
  if (blob(base) !== BASE_WORKFLOW_BLOB) refused()
  return replaceOnce(replaceOnce(base, ORIGINAL_OUTPUT, ORIGINAL_OUTPUT + FLAG_OUTPUT),
    ORIGINAL_COMMAND, checksumLines(scriptSha, configSha)) + JOB
}
export function historicalWorkflow(current) {
  if (blob(current) === BASE_WORKFLOW_BLOB) return current
  if (!current.endsWith(JOB)) refused()
  let result = current.slice(0, -JOB.length)
  result = replaceOnce(result, ORIGINAL_OUTPUT + FLAG_OUTPUT, ORIGINAL_OUTPUT)
  const pattern = new RegExp(`^          printf '%s  ${SCRIPT_PATH.replaceAll('.', '\\.')}\\\\n' '([a-f0-9]{64})' \\| sha256sum -c - >&2\\n          printf '%s  ${CONFIG_PATH.replaceAll('.', '\\.')}\\\\n' '([a-f0-9]{64})' \\| sha256sum -c - >&2\\n          node ${SCRIPT_PATH.replaceAll('.', '\\.')} >> "\\$GITHUB_OUTPUT"\\n`, 'm')
  const match = result.match(pattern)
  if (!match) refused()
  result = replaceOnce(result, checksumLines(match[1], match[2]), ORIGINAL_COMMAND)
  if (blob(result) !== BASE_WORKFLOW_BLOB) refused()
  return result
}
export function readManifest(raw, expectedBlob = CONFIG_BLOB) {
  if (!sha(expectedBlob) || !Buffer.isBuffer(raw) || raw.length < 2 || raw.length > 128 * 1024 || blob(raw) !== expectedBlob) refused()
  let value
  try { value = JSON.parse(raw.toString('utf8')) } catch { refused() }
  if (!raw.equals(Buffer.from(JSON.stringify(value, null, 2) + '\n'))
      || !sameKeys(value, ['revision', 'baseCommit', 'status', 'preserveRemoteConfiguration', 'deployOnly', 'payload'])
      || value.revision !== 'failed-hold-waiver-release-v1' || value.baseCommit !== BASE_COMMIT
      || value.status !== 'FROZEN' || value.preserveRemoteConfiguration !== true || value.deployOnly !== true
      || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
      || Object.keys(value.payload).length < 4 || Object.keys(value.payload).length > 60) refused()
  for (const [path, entry] of Object.entries(value.payload)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || part === '..' || part === '.')
        || [SCRIPT_PATH, CONFIG_PATH, WORKFLOW_PATH].includes(path) || path in PRESERVED_BLOBS
        || !sameKeys(entry, ENTRY_KEYS) || entry.newMode !== '100644' || !sha(entry.newBlob)
        || entry.oldBlob === entry.newBlob || (entry.status === 'A'
          ? entry.oldMode !== '000000' || entry.oldBlob !== ZERO
          : entry.status !== 'M' || entry.oldMode !== '100644' || !sha(entry.oldBlob))) refused()
  }
  for (const [path, prior] of Object.entries(HISTORICAL_TEST_BLOBS)) {
    if (value.payload[path]?.oldBlob !== prior || value.payload[path]?.status !== 'M') refused()
  }
  return value
}
function regularBytes(path, maximum = 128 * 1024) {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) refused()
  return readFileSync(path)
}
function readGit(cwd, args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 ** 2 })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') refused()
  return result.stdout
}
function readEvent(env) {
  if (typeof env.GITHUB_EVENT_PATH !== 'string' || !env.GITHUB_EVENT_PATH) refused()
  return JSON.parse(regularBytes(env.GITHUB_EVENT_PATH, 2 * 1024 ** 2))
}
function eventScope(env, event, head) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== 'refs/heads/main'
      || !sha(env.GITHUB_SHA) || env.GITHUB_SHA !== head
      || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
      || !event || typeof event !== 'object' || Array.isArray(event) || event.repository?.full_name !== env.GITHUB_REPOSITORY) refused()
  if (env.GITHUB_EVENT_NAME === 'push') {
    if (event.ref !== env.GITHUB_REF || !sha(event.before) || event.after !== head || event.before === event.after
        || event.head_commit?.id !== head || event.deleted !== false || event.created !== false || event.forced !== false) refused()
    return { kind: 'push', before: event.before }
  }
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !['main', 'refs/heads/main'].includes(event.ref)
      || event.inputs?.confirmation !== 'DEPLOY' || Object.keys(event.inputs).length !== 1 || 'before' in event || 'after' in event) refused()
  return { kind: 'workflow_dispatch' }
}
export function selectFailedHoldRelease({ cwd = process.cwd(), env = process.env, event,
  git = readGit, scriptBytes = regularBytes(fileURLToPath(import.meta.url)), configBytes,
  configBlob = CONFIG_BLOB, legacySelector = selectConstructionToolsRelease } = {}) {
  const head = git(cwd, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim()
  if (!sha(head)) refused()
  const selectedEvent = event === undefined ? readEvent(env) : event
  const scope = eventScope(env, selectedEvent, head)
  if (git(cwd, ['ls-tree', '-z', head, '--', SCRIPT_PATH]) !== `100644 blob ${blob(scriptBytes)}\t${SCRIPT_PATH}\0`) refused()
  const family = git(cwd, ['rev-list', '--parents', '-n', '1', head]).trim().split(' ')
  if (family[0] !== head || family.length < 2 || family.some(value => !sha(value))) refused()
  const parents = family.slice(1)
  const diff = before => parseRawChanges(git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '--no-abbrev', '-z', before, head, '--']))
  const immediate = diff(parents[0])
  let changes = immediate
  if (scope.kind === 'push') {
    git(cwd, ['merge-base', '--is-ancestor', scope.before, head])
    if (scope.before !== parents[0]) changes = diff(scope.before)
  }
  const candidate = parents.includes(BASE_COMMIT) || scope.before === BASE_COMMIT
    || [...immediate, ...changes].some(change => /failed[-_]?hold|FailedHold/i.test(change.path))
  if (!candidate) return { ...legacySelector({ cwd, env, event: selectedEvent, git }), failedHoldWaiver: false }
  if (parents.length !== 1 || parents[0] !== BASE_COMMIT || scope.kind === 'push' && scope.before !== BASE_COMMIT) refused()
  const raw = configBytes ?? regularBytes(resolve(cwd, CONFIG_PATH))
  const manifest = readManifest(raw, configBlob)
  for (const [path, expected] of Object.entries({ ...PRESERVED_BLOBS, [CONFIG_PATH]: configBlob })) {
    if (git(cwd, ['ls-tree', '-z', head, '--', path]) !== `100644 blob ${expected}\t${path}\0`) refused()
  }
  const added = newBlob => ({ oldMode: '000000', newMode: '100644', oldBlob: ZERO, newBlob, status: 'A' })
  const expected = { ...manifest.payload, [SCRIPT_PATH]: added(blob(scriptBytes)), [CONFIG_PATH]: added(configBlob) }
  const paths = [...Object.keys(expected), WORKFLOW_PATH].sort()
  if (changes.length !== paths.length || changes.map(change => change.path).sort().join('\0') !== paths.join('\0')) refused()
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
      || after !== guardedWorkflow(before, sha256(scriptBytes), sha256(raw))) refused()
  return { deployAllowed: false, failedHoldWaiver: true,
    preserveRemoteVars: true, preserveBilling: true, preserveSecrets: true }
}
export function requireFailedHoldRelease(options) {
  const selected = selectFailedHoldRelease(options)
  if (selected.failedHoldWaiver !== true || selected.deployAllowed !== false
      || selected.preserveRemoteVars !== true || selected.preserveBilling !== true || selected.preserveSecrets !== true) refused()
  return selected
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2 && !(process.argv.length === 3 && process.argv[2] === '--require-waiver')) refused()
    const selected = process.argv.length === 3 ? requireFailedHoldRelease() : selectFailedHoldRelease()
    if (typeof selected.deployAllowed !== 'boolean' || typeof selected.failedHoldWaiver !== 'boolean') refused()
    process.stdout.write(`deploy_allowed=${selected.deployAllowed}\nfailed_hold_waiver=${selected.failedHoldWaiver}\n`)
  } catch {
    console.error(FAULT + ': publication stopped before credential setup.')
    process.exitCode = 1
  }
}
