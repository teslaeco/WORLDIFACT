import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encryptReport, validateHost, validateKnownHosts } from './oracle-maintenance.mjs'

export const EXPECTED_PARENT = '3f6d7fcfd4cef8183b05fd1ff29176eec887cca4'
export const EXPECTED_REF = 'refs/heads/diagnostics/oracle-config-boundary-updated-20261008'
export const EXPECTED_HOST = '141.148.242.30'
export const EXPIRES_AT = '2026-10-09T00:00:00Z'
export const ADDED_PATHS = Object.freeze([
  '.github/workflows/oracle-config-boundary-once.yml',
  'scripts/oracle-config-boundary-once.mjs',
  'tests/oracle-config-boundary-once.test.mjs',
])
const LIMIT = 16_384
const CHILD_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' })
const fail = code => { throw new Error(code) }

export function validateContext(env, now = Date.now()) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== EXPECTED_REF ||
      env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_RUN_ATTEMPT !== '1' ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || /^0+$/.test(env.GITHUB_SHA) ||
      !Number.isFinite(now) || now < Date.parse('2026-10-08T00:00:00Z') || now >= Date.parse(EXPIRES_AT)) fail('INVALID_CONTEXT')
}

// This check runs in a separate job before the Production environment is admitted.
export function validateSource(env, source) {
  if (source.head !== env.GITHUB_SHA || source.parents !== EXPECTED_PARENT ||
      source.changes !== ADDED_PATHS.map(path => `A\t${path}\n`).join('')) fail('INVALID_SOURCE_SCOPE')
}

export function readSource(execute = execFileSync) {
  const git = args => execute('/usr/bin/git', args, {
    shell: false, encoding: 'utf8', maxBuffer: LIMIT, timeout: 10_000,
    killSignal: 'SIGKILL', env: { ...CHILD_ENV, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  })
  try {
    return {
      head: git(['rev-parse', '--verify', 'HEAD']).trim(),
      parents: git(['show', '-s', '--format=%P', 'HEAD']).trim(),
      changes: git(['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'HEAD']),
    }
  } catch { fail('INVALID_SOURCE_SCOPE') }
}

export const RECIPIENT_SHA256 = '1cf2737d3556268bb042f164cf1d726899f02f613edbce41ec1753a30b53b084'
export const KNOWN_HOSTS_SHA256 = 'dc28e426f5ae4f85279c65e2d1313cc9d616ebb728583761326ec14ec1ea82d5'
const KEY_LIMIT = 32_768
const HEADER = '-----BEGIN OPENSSH PRIVATE KEY-----'
const FOOTER = '-----END OPENSSH PRIVATE KEY-----'
// Kept identical to the frozen maintenance runner's non-exported validator.
const KEY_ENVELOPE = /^-----BEGIN OPENSSH PRIVATE KEY-----\n(?:[A-Za-z0-9+/=]+\n){1,128}-----END OPENSSH PRIVATE KEY-----\n?$/
const succeeds = operation => { try { operation(); return true } catch { return false } }

export function keyShape(value) {
  const string = typeof value === 'string'
  return {
    present: string && value.length > 0,
    lengthWithinBound: string && value.length > 0 && value.length <= KEY_LIMIT,
    startsHeader: string && value.startsWith(HEADER),
    endsFooter: string && (value.endsWith(FOOTER) || value.endsWith(FOOTER + '\n')),
    hasCRLF: string && value.includes('\r\n'),
    hasLoneCR: string && /\r(?!\n)/.test(value),
    hasBOM: string && value.includes('\uFEFF'),
    hasEscapedNewline: string && /\\(?:r|n)/.test(value),
    strictExistingEnvelopeValid: string && value.length <= KEY_LIMIT && KEY_ENVELOPE.test(value),
    trimWouldAlter: string && value.trim() !== value,
  }
}

export function buildKeyParseInvocation(keyPath) {
  if (typeof keyPath !== 'string' || !keyPath.startsWith('/') || /[\r\n\0]/.test(keyPath)) fail('INVALID_KEY_PATH')
  return { file: '/usr/bin/ssh-keygen', args: ['-y', '-P', '', '-f', keyPath],
    options: { shell: false, encoding: 'buffer', maxBuffer: LIMIT, timeout: 5_000,
      killSignal: 'SIGKILL', env: { ...CHILD_ENV } } }
}

// Parse locally only; no SSH authentication or network invocation is possible here.
// The exact original bytes are used. No newline or other normalization is applied.
export async function parseKey(value, execute = execFile) {
  if (!keyShape(value).strictExistingEnvelopeValid) return 'skipped_invalid_envelope'
  let directory
  try {
    directory = await mkdtemp(join(tmpdir(), 'oracle-config-shape-'))
    await chmod(directory, 0o700)
    const keyPath = join(directory, 'identity')
    await writeFile(keyPath, value, { flag: 'wx', mode: 0o600 })
    const invocation = buildKeyParseInvocation(keyPath)
    return await new Promise(accept => {
      try {
        execute(invocation.file, invocation.args, invocation.options, (error, stdout, stderr) => {
          const valid = !error && Buffer.isBuffer(stdout) && stdout.length > 0 && stdout.length <= LIMIT
          // Neither the derived public key nor any stderr is returned, logged or persisted.
          if (Buffer.isBuffer(stdout)) stdout.fill(0)
          if (Buffer.isBuffer(stderr)) stderr.fill(0)
          accept(valid ? 'valid' : 'invalid_or_unavailable')
        })
      } catch { accept('invalid_or_unavailable') }
    })
  } catch { return 'invalid_or_unavailable' }
  finally { if (directory) await rm(directory, { recursive: true, force: true }) }
}

// This candidate exists only for this local diagnostic. The original value and
// stored configuration are never rewritten. No interior or Unicode bytes change.
export async function collectBoundaryShape(value, execute = execFile) {
  const eligible = typeof value === 'string' && value.length > 0 && value.length <= KEY_LIMIT
  const candidate = eligible ? value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') + '\n' : undefined
  const shape = keyShape(candidate)
  const parseStatus = await parseKey(candidate, execute)
  return {
    normalizationChanged: eligible && candidate !== value,
    startsHeader: shape.startsHeader,
    endsFooter: shape.endsFooter,
    strictEnvelopeValid: shape.strictExistingEnvelopeValid,
    parseAttempted: parseStatus !== 'skipped_invalid_envelope',
    parseValid: parseStatus === 'valid',
    parseStatus,
  }
}

export async function collectShape(env, execute = execFile) {
  const host = env.ORACLE_MAINTENANCE_HOST
  const knownHosts = env.ORACLE_MAINTENANCE_KNOWN_HOSTS
  const key = env.ORACLE_MAINTENANCE_SSH_KEY
  let canonicalKnownHosts
  const knownValid = succeeds(() => { canonicalKnownHosts = validateKnownHosts(knownHosts, EXPECTED_HOST).line })
  const privateKey = keyShape(key)
  const parseStatus = await parseKey(key, execute)
  const boundaryASCII = await collectBoundaryShape(key, execute)
  return {
    schema: 'worldifact-oracle-maintenance-v1', action: 'status', purpose: 'configuration-shape',
    result: 'completed', readOnly: true,
    mapping: {
      hostMapped: Object.hasOwn(env, 'ORACLE_MAINTENANCE_HOST') && typeof host === 'string',
      knownHostsMapped: Object.hasOwn(env, 'ORACLE_MAINTENANCE_KNOWN_HOSTS') && typeof knownHosts === 'string',
      sshKeyMapped: Object.hasOwn(env, 'ORACLE_MAINTENANCE_SSH_KEY') && typeof key === 'string',
    },
    host: { present: typeof host === 'string' && host.length > 0,
      valid: succeeds(() => validateHost(host)), exactExpected: host === EXPECTED_HOST },
    knownHosts: { present: typeof knownHosts === 'string' && knownHosts.length > 0,
      valid: knownValid, matchesMappedHost: succeeds(() => validateKnownHosts(knownHosts, host)),
      exactTrustedCanonical: knownValid && createHash('sha256').update(canonicalKnownHosts.slice((EXPECTED_HOST + ' ').length)).digest('hex') === KNOWN_HOSTS_SHA256 },
    privateKey: { ...privateKey, parseAttempted: parseStatus !== 'skipped_invalid_envelope',
      parseValid: parseStatus === 'valid', parseStatus, boundaryASCII },
  }
}

export async function writeEvidence(envelope) {
  await mkdir('.oracle-config-boundary-encrypted', { mode: 0o700 })
  await writeFile('.oracle-config-boundary-encrypted/report.enc.json', JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
}

export async function main({ args = process.argv.slice(2), env = process.env, now = Date.now(),
  source = readSource, execute = execFile,
  readRecipient = () => readFile('.github/oracle-maintenance-recipient.pem', 'utf8'),
  persist = writeEvidence, log = console.log } = {}) {
  try {
    if (args.length !== 1 || !['--gate', '--classify'].includes(args[0])) fail('INVALID_MODE')
    validateContext(env, now)
    validateSource(env, source())
    if (args[0] === '--gate') { log('CONFIGURATION_SHAPE_SCOPE_VALID'); return 0 }
    const publicPem = await readRecipient()
    if (typeof publicPem !== 'string' || createHash('sha256').update(publicPem).digest('hex') !== RECIPIENT_SHA256) fail('INVALID_RECIPIENT')
    encryptReport({}, publicPem) // Recipient encryption must succeed before accessing any secret.
    const report = await collectShape(env, execute)
    await persist(encryptReport(report, publicPem))
    log('ENCRYPTED_CONFIGURATION_SHAPE_EVIDENCE_READY')
    return 0
  } catch {
    // Fixed public failure only; no value, fragment, parser output or exception escapes.
    log('CONFIGURATION_SHAPE_FAILED_DETAILS_SUPPRESSED')
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
