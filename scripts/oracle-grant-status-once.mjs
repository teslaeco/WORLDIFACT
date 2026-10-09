import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encryptReport, runSsh, validateDispatcherReport as currentStatus } from './oracle-maintenance.mjs'
import { validateDispatcherReport as legacyStatus } from './oracle-maintenance-legacy-reviewed.mjs'

export const EXPECTED_PARENT = '3c5a499f3c6b9fe1400fb4715d2097b106327bf3'
export const EXPECTED_BASE_TREE = '419f14b3f1d0ec48738778c366ab820827533331'
export const EXPECTED_REF = 'refs/heads/diagnostics/oracle-grant-status-once-20261009'
export const EXPIRES_AT = '2026-10-09T04:00:00Z'
export const RECIPIENT_SHA256 = '1cf2737d3556268bb042f164cf1d726899f02f613edbce41ec1753a30b53b084'
export const LEGACY_SHA256 = 'b003da2f49d79bfd6e57345229cb21e867bd2c230ddcf42ddd0bfadbf4ce4149'
export const ADDED_PATHS = Object.freeze([
  '.github/workflows/oracle-grant-status-once.yml',
  'scripts/oracle-grant-status-once.mjs',
  'scripts/oracle-maintenance-legacy-reviewed.mjs',
  'tests/oracle-grant-status-once.test.mjs',
])
const LIMIT = 16_384
const FAILURE_CODES = ['INVALID_CONFIGURATION', 'INVALID_RESPONSE', 'SSH_FAILED', 'COMMAND_NOT_CONFIRMED', 'FAILED']
const fail = code => { throw new Error(code) }
const sha256 = value => createHash('sha256').update(value).digest('hex')

export function validateContext(env, event, now = Date.now()) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== EXPECTED_REF ||
      env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_RUN_ATTEMPT !== '1' ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || /^0+$/.test(env.GITHUB_SHA) ||
      event?.repository?.full_name !== 'teslaeco/WORLDIFACT' || event.ref !== EXPECTED_REF ||
      event.before !== EXPECTED_PARENT || event.after !== env.GITHUB_SHA ||
      event.created !== false || event.deleted !== false || event.forced !== false ||
      !Number.isFinite(now) || now < Date.parse('2026-10-09T02:18:00Z') || now >= Date.parse(EXPIRES_AT)) fail('INVALID_CONTEXT')
}

export function validateSource(env, source) {
  if (source.head !== env.GITHUB_SHA || source.parents !== EXPECTED_PARENT || source.baseTree !== EXPECTED_BASE_TREE ||
      source.changes !== ADDED_PATHS.map(path => `A\t${path}\n`).join('') || source.dirty !== '') fail('INVALID_SOURCE_SCOPE')
}

// Read-only local Git commands. No inherited credentials, lazy fetching or shell.
export function readSource(execute = execFileSync) {
  const git = args => execute('/usr/bin/git', args, {
    shell: false, encoding: 'utf8', maxBuffer: LIMIT, timeout: 10_000, killSignal: 'SIGKILL',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  })
  try {
    return { head: git(['rev-parse', '--verify', 'HEAD']).trim(),
      parents: git(['show', '-s', '--format=%P', 'HEAD']).trim(),
      baseTree: git(['rev-parse', '--verify', 'HEAD^1^{tree}']).trim(),
      changes: git(['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'HEAD']),
      dirty: git(['status', '--porcelain=v1', '--untracked-files=all']) }
  } catch { fail('INVALID_SOURCE_SCOPE') }
}

async function readEvent(env) {
  const bytes = await readFile(env.GITHUB_EVENT_PATH)
  if (bytes.length > 65_536) fail('INVALID_CONTEXT')
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { fail('INVALID_CONTEXT') }
}

// Both parsers retain their exact reviewed finite schemas. An unsupported or
// mixed revision is refused; raw output is never substituted for validation.
export function validateStatus(bytes, code) {
  if (![0, 1].includes(code)) fail('INVALID_RESPONSE')
  try { return currentStatus(bytes, 'status', code) } catch { /* Try only the other reviewed revision. */ }
  try { return legacyStatus(bytes, 'status', code) } catch { fail('INVALID_RESPONSE') }
}

export function diagnoseResponse(bytes, code) {
  const diagnostics = { sshExitCode: [0, 1].includes(code) ? code : null,
    stdoutBytes: Buffer.isBuffer(bytes) && bytes.length <= LIMIT ? bytes.length : null,
    revision: 'unavailable', selectedSchema: 'none', responseShape: 'invalid_buffer' }
  if (!Buffer.isBuffer(bytes)) return diagnostics
  if (bytes.length > LIMIT) return { ...diagnostics, responseShape: 'oversized' }
  let text, value
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return { ...diagnostics, responseShape: 'malformed_utf8' } }
  try { value = JSON.parse(text) }
  catch { return { ...diagnostics, responseShape: 'malformed_json' } }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ...diagnostics, responseShape: 'non_object' }
  diagnostics.revision = value.revision === 'oracle-maintenance-initial-edit-v1' ? 'current'
    : value.revision === 'oracle-maintenance-b6dce84d-v1' ? 'legacy' : 'unsupported'
  return { ...diagnostics, responseShape: 'schema_rejected' }
}

export async function collectStatus(env, execute = runSsh) {
  let bytes
  let diagnostics = { sshExitCode: null, stdoutBytes: null, revision: 'unavailable',
    selectedSchema: 'none', responseShape: 'not_received' }
  try {
    const response = await execute('status', env)
    bytes = response.stdout
    diagnostics = diagnoseResponse(bytes, response.code)
    const dispatcher = validateStatus(bytes, response.code)
    diagnostics.selectedSchema = diagnostics.revision
    diagnostics.responseShape = 'validated'
    return { schema: 'worldifact-oracle-maintenance-v1', action: 'status',
      result: response.code === 0 ? 'completed' : 'failed', dispatcher, diagnostics,
      ...(response.code === 0 ? {} : { failure: 'COMMAND_NOT_CONFIRMED' }) }
  } catch (error) {
    return { schema: 'worldifact-oracle-maintenance-v1', action: 'status', result: 'failed',
      failure: FAILURE_CODES.includes(error?.message) ? error.message : 'FAILED', diagnostics }
  } finally { if (Buffer.isBuffer(bytes)) bytes.fill(0) }
}

export async function writeEvidence(envelope) {
  await mkdir('.oracle-grant-status-encrypted', { mode: 0o700 })
  await writeFile('.oracle-grant-status-encrypted/report.enc.json', JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
}

export async function main({ args = process.argv.slice(2), env = process.env, now = Date.now(),
  source = readSource, event = readEvent, execute = runSsh,
  readRecipient = () => readFile('.github/oracle-maintenance-recipient.pem', 'utf8'),
  readLegacy = () => readFile('scripts/oracle-maintenance-legacy-reviewed.mjs'),
  persist = writeEvidence, log = console.log } = {}) {
  try {
    if (args.length !== 1 || !['--gate', '--status'].includes(args[0])) fail('INVALID_MODE')
    validateContext(env, await event(env), now)
    validateSource(env, source())
    if (sha256(await readLegacy()) !== LEGACY_SHA256) fail('INVALID_SOURCE_SCOPE')
    if (args[0] === '--gate') { log('ORACLE_STATUS_SCOPE_VALID'); return 0 }
    const publicPem = await readRecipient()
    if (typeof publicPem !== 'string' || sha256(publicPem) !== RECIPIENT_SHA256) fail('INVALID_RECIPIENT')
    encryptReport({}, publicPem) // Validate the unchanged recipient before accessing credentials or SSH.
    const report = await collectStatus(env, execute)
    await persist(encryptReport(report, publicPem))
    log(report.result === 'completed' ? 'ENCRYPTED_STATUS_EVIDENCE_READY' : 'STATUS_FAILED_ENCRYPTED_EVIDENCE_READY')
    return report.result === 'completed' ? 0 : 1
  } catch {
    log('STATUS_FAILED_DETAILS_SUPPRESSED')
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
