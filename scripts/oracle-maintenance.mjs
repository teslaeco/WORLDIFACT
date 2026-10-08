import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { isIPv4, createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AAD = Buffer.from('WORLDIFACT_ORACLE_MAINTENANCE_V1')
const LIMIT = 16_384
const ACTIONS = ['status', 'reachability', 'apply-b6dce84d']
const FAILURE_CODES = ['INVALID_ACTION', 'INVALID_CONFIGURATION', 'INVALID_CONTEXT', 'INVALID_RESPONSE', 'SSH_FAILED', 'SSH_UNREACHABLE', 'COMMAND_NOT_CONFIRMED', 'FAILED']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = code => { throw new Error(FAILURE_CODES.includes(code) ? code : 'FAILED') }

export function validateAction(action) {
  if (!ACTIONS.includes(action)) fail('INVALID_ACTION')
  return action
}

export function validateHost(host) {
  if (typeof host !== 'string' || !isIPv4(host)) fail('INVALID_CONFIGURATION')
  const [a, b, c] = host.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113) fail('INVALID_CONFIGURATION')
  return host
}

// A single literal host and complete public key from an already trusted channel.
export function validateKnownHosts(value, host) {
  validateHost(host)
  if (typeof value !== 'string' || value.length > 4096) fail('INVALID_CONFIGURATION')
  const match = value.match(/^([^\s]+) (ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) ([A-Za-z0-9+/]+={0,2})\n?$/)
  if (!match || match[1] !== host) fail('INVALID_CONFIGURATION')
  const bytes = Buffer.from(match[3], 'base64')
  if (bytes.toString('base64') !== match[3]) fail('INVALID_CONFIGURATION')
  let offset = 0
  function field() {
    if (offset + 4 > bytes.length) fail('INVALID_CONFIGURATION')
    const length = bytes.readUInt32BE(offset); offset += 4
    if (length === 0 || offset + length > bytes.length) fail('INVALID_CONFIGURATION')
    const result = bytes.subarray(offset, offset + length); offset += length
    return result
  }
  const kind = match[2]
  if (field().toString('utf8') !== kind) fail('INVALID_CONFIGURATION')
  if (kind === 'ssh-ed25519' && field().length !== 32) fail('INVALID_CONFIGURATION')
  if (kind === 'ecdsa-sha2-nistp256') {
    if (field().toString('utf8') !== 'nistp256') fail('INVALID_CONFIGURATION')
    const point = field()
    if (point.length !== 65 || point[0] !== 4) fail('INVALID_CONFIGURATION')
    try { createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } }) }
    catch { fail('INVALID_CONFIGURATION') }
  }
  if (kind === 'ssh-rsa') {
    const exponent = field(), modulus = field()
    const unsigned = modulus[0] === 0 ? modulus.subarray(1) : modulus
    const bits = unsigned.length * 8 - Math.clz32(unsigned[0]) + 24
    if (exponent.length > 8 || exponent[0] === 0 || exponent[0] >= 128 || exponent.at(-1) % 2 !== 1 ||
        exponent.length === 1 && exponent[0] < 3 || modulus[0] >= 128 || modulus[0] === 0 && modulus[1] < 128 ||
        bits < 2048 || bits > 8192) fail('INVALID_CONFIGURATION')
  }
  if (offset !== bytes.length) fail('INVALID_CONFIGURATION')
  return { line: `${host} ${kind} ${match[3]}\n`, algorithms: kind === 'ssh-rsa' ? 'rsa-sha2-512,rsa-sha2-256' : kind }
}

function validatePrivateKey(value) {
  if (typeof value !== 'string' || value.length > 32768 ||
      !/^-----BEGIN OPENSSH PRIVATE KEY-----\n(?:[A-Za-z0-9+/=]+\n){1,128}-----END OPENSSH PRIVATE KEY-----\n?$/.test(value)) fail('INVALID_CONFIGURATION')
  return value.endsWith('\n') ? value : value + '\n'
}

export function buildSshInvocation(action, host, keyPath, knownHostsPath, algorithms) {
  validateAction(action); validateHost(host)
  if (action === 'reachability' || !['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512,rsa-sha2-256'].includes(algorithms) ||
      ![keyPath, knownHostsPath].every(path => typeof path === 'string' && path.startsWith('/') && !/[\r\n\0]/.test(path))) fail('INVALID_CONFIGURATION')
  const options = ['BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'StrictHostKeyChecking=yes',
    `UserKnownHostsFile=${knownHostsPath}`, 'GlobalKnownHostsFile=/dev/null', `HostKeyAlgorithms=${algorithms}`,
    'UpdateHostKeys=no', 'VerifyHostKeyDNS=no', 'CheckHostIP=yes', 'PreferredAuthentications=publickey',
    'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'ForwardAgent=no', 'ForwardX11=no',
    'ClearAllForwardings=yes', 'Tunnel=no', 'RequestTTY=no', 'PermitLocalCommand=no', 'ProxyCommand=none',
    'ProxyJump=none', 'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no', 'EscapeChar=none',
    'ConnectTimeout=10', 'ConnectionAttempts=1', 'ServerAliveInterval=5', 'ServerAliveCountMax=2', 'LogLevel=QUIET']
  return { file: '/usr/bin/ssh', args: ['-F', '/dev/null', '-T', '-p', '22', '-l', 'opc', '-i', keyPath, '-n',
    ...options.flatMap(value => ['-o', value]), '--', host, action],
  options: { shell: false, encoding: 'buffer', maxBuffer: LIMIT, timeout: action === 'status' ? 60_000 : 3_450_000, killSignal: 'SIGKILL',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } } }
}

export async function runSsh(action, env, execute = execFile) {
  const host = validateHost(env.ORACLE_MAINTENANCE_HOST)
  const known = validateKnownHosts(env.ORACLE_MAINTENANCE_KNOWN_HOSTS, host)
  const key = validatePrivateKey(env.ORACLE_MAINTENANCE_SSH_KEY)
  validateAction(action)
  if (action === 'reachability') fail('INVALID_ACTION')
  const directory = await mkdtemp(join(tmpdir(), 'oracle-maintenance-'))
  try {
    const keyPath = join(directory, 'identity'), knownPath = join(directory, 'known_hosts')
    await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 })
    await writeFile(knownPath, known.line, { flag: 'wx', mode: 0o600 })
    const invocation = buildSshInvocation(action, host, keyPath, knownPath, known.algorithms)
    return await new Promise((resolveOutput, reject) => {
      execute(invocation.file, invocation.args, invocation.options, (error, stdout) => {
        if (error && (error.code !== 1 || error.killed || error.signal) || !Buffer.isBuffer(stdout) || stdout.length > LIMIT) return reject(new Error('SSH_FAILED'))
        resolveOutput({ stdout, code: error ? 1 : 0 })
      })
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
}

// One socket to one literal IP. No authentication, keyscan, DNS or fallback address.
export function probeReachability(host, connect = createConnection) {
  validateHost(host)
  return new Promise((resolveProbe, reject) => {
    let settled = false, bytes = Buffer.alloc(0), socket
    const finish = ok => {
      if (settled) return
      settled = true; clearTimeout(timer); socket?.destroy()
      if (ok) resolveProbe({ port: 22, sshBanner: true, authenticated: false })
      else reject(new Error('SSH_UNREACHABLE'))
    }
    const timer = setTimeout(() => finish(false), 10_000)
    try {
      socket = connect({ host, port: 22, family: 4 })
      socket.on('error', () => finish(false)); socket.on('end', () => finish(false)); socket.on('close', () => finish(false))
      socket.on('data', chunk => {
        if (settled) return
        if (bytes.length + chunk.length > 1024) return finish(false)
        bytes = Buffer.concat([bytes, chunk])
        if (bytes.includes(10)) finish(/^SSH-2\.0-[\x21-\x7e]{1,200}(?: [\x20-\x7e]{0,200})?\r?\n/.test(bytes.toString('latin1')))
      })
    } catch { finish(false) }
  })
}

function exact(value, keys) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('INVALID_RESPONSE')
}
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value)
const boolean = value => typeof value === 'boolean'
const nullable = (value, predicate) => value === null || predicate(value)
const digest = value => matches(value, /^[a-f0-9]{64}$/)

function installerReport(value, staged = false) {
  if (staged && value?.phase === 'STANDARD_CONSTRUCTION_STAGED_NOT_INSTALLED') {
    exact(value, ['phase', 'paid_generation_requested'])
    if (value.paid_generation_requested !== false) fail('INVALID_RESPONSE')
    return
  }
  const keys = ['phase', 'revision', 'paid_generation_requested', 'job_rows_changed', 'provider_limits_changed', 'previous_source_restored', 'activation_committed']
  if (value?.phase === 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED') keys.push('refusal_code')
  exact(value, keys)
  if (!['WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED', 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'].includes(value.phase) ||
      value.revision !== 'worldifact-standard-construction-v1' ||
      ['paid_generation_requested', 'job_rows_changed', 'provider_limits_changed'].some(key => value[key] !== false) ||
      !nullable(value.previous_source_restored, boolean) || !nullable(value.activation_committed, boolean) ||
      'refusal_code' in value && !matches(value.refusal_code, /^[a-z_]{1,80}$/) ||
      value.phase === 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED' && (value.activation_committed !== true || value.previous_source_restored !== null) ||
      value.activation_committed === true && value.previous_source_restored !== null) fail('INVALID_RESPONSE')
}

function statusReport(value) {
  if (value?.refusal === 'unsafe_or_unavailable_read') {
    exact(value, ['read_only', 'snapshot_stable', 'refusal'])
    if (value.read_only !== true || value.snapshot_stable !== false) fail('INVALID_RESPONSE')
    return
  }
  exact(value, ['read_only', 'snapshot_stable', 'changed_components', 'parser_sha256', 'parser_version', 'receipt_sha256',
    'receipt_revision', 'receipt_parser_sha256', 'payload_update_revision', 'construction_health_verified',
    'maintenance_present', 'recent_attempts', 'lock_file_present', 'observed_flock_holders', 'worker'])
  const components = ['source_or_receipt', 'maintenance_marker', 'recent_attempts', 'attempt_selection', 'installer_lock', 'lock_holders', 'worker']
  if (value.read_only !== true || ['snapshot_stable', 'construction_health_verified', 'maintenance_present', 'lock_file_present'].some(key => !boolean(value[key])) ||
      !Array.isArray(value.changed_components) || value.changed_components.length > 7 ||
      value.changed_components.some(item => !components.includes(item)) || new Set(value.changed_components).size !== value.changed_components.length ||
      ['parser_sha256', 'receipt_sha256', 'receipt_parser_sha256'].some(key => !nullable(value[key], digest)) ||
      !['previous', 'updated', 'unknown'].includes(value.parser_version) ||
      ![null, 'worldifact-standard-construction-v1'].includes(value.receipt_revision) ||
      ![null, 'responses-reasoning-content-v1'].includes(value.payload_update_revision) ||
      !Array.isArray(value.recent_attempts) || value.recent_attempts.length > 2 ||
      !Array.isArray(value.observed_flock_holders) || value.observed_flock_holders.length > 16) fail('INVALID_RESPONSE')
  for (const attempt of value.recent_attempts) {
    exact(attempt, ['attempt_utc', 'report'])
    if (!matches(attempt.attempt_utc, /^\d{8}T\d{6}Z$/)) fail('INVALID_RESPONSE')
    if (attempt.report !== 'NO_REPORT_PREWORK_OR_INTERRUPTED') installerReport(attempt.report, true)
  }
  for (const holder of value.observed_flock_holders) {
    exact(holder, ['pid', 'state', 'start_ticks'])
    if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0 ||
        !nullable(holder.state, state => matches(state, /^[RSDZTWtXxKWPIN]$/)) ||
        !nullable(holder.start_ticks, ticks => Number.isSafeInteger(ticks) && ticks >= 0)) fail('INVALID_RESPONSE')
  }
  exact(value.worker, ['ActiveState', 'SubState', 'MainPID'])
  if (!matches(value.worker.ActiveState, /^[a-z-]{1,40}$/) || !matches(value.worker.SubState, /^[a-z-]{1,40}$/) ||
      !matches(value.worker.MainPID, /^\d{1,10}$/)) fail('INVALID_RESPONSE')
}

export function validateDispatcherReport(bytes, action, code = 0) {
  validateAction(action)
  if (action === 'reachability' || ![0, 1].includes(code) || !Buffer.isBuffer(bytes) || bytes.length > LIMIT) fail('INVALID_RESPONSE')
  let report
  try { report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail('INVALID_RESPONSE') }
  exact(report, ['revision', 'action', 'result', 'status', 'installer'])
  if (report.revision !== 'oracle-maintenance-b6dce84d-v1' ||
      !['ready_to_apply', 'already_updated', 'busy', 'inconclusive', 'updated', 'not_confirmed', 'refused'].includes(report.result) ||
      report.action !== action && !(report.action === null && report.result === 'refused' && report.status === null && report.installer === null) ||
      action === 'status' && (report.installer !== null || ['updated', 'not_confirmed'].includes(report.result)) ||
      action === 'apply-b6dce84d' && report.result === 'ready_to_apply' ||
      report.installer !== null && !['updated', 'not_confirmed'].includes(report.result) ||
      report.result === 'updated' && report.installer?.phase !== 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED') fail('INVALID_RESPONSE')
  if (report.status !== null) statusReport(report.status)
  else if (report.result !== 'refused') fail('INVALID_RESPONSE')
  if (report.installer !== null) installerReport(report.installer)
  const expectedCode = report.result === 'refused' || action === 'apply-b6dce84d' && !['updated', 'already_updated'].includes(report.result) ? 1 : 0
  if (code !== expectedCode) fail('INVALID_RESPONSE')
  return report
}

export function encryptReport(report, publicPem) {
  const recipient = createPublicKey(publicPem)
  if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) fail('INVALID_CONFIGURATION')
  const plaintext = Buffer.from(JSON.stringify(report))
  if (plaintext.length > 32_768) fail('INVALID_RESPONSE')
  const key = randomBytes(32), iv = randomBytes(12)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(AAD)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const wrappedKey = publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key)
    return { schema: 'worldifact-encrypted-report-v1', cipher: 'AES-256-GCM', wrapping: 'RSA-OAEP-SHA256',
      aad: AAD.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      wrappedKey: wrappedKey.toString('base64'), ciphertext: ciphertext.toString('base64') }
  } finally { key.fill(0); plaintext.fill(0) }
}

async function writeEvidence(envelope) {
  await mkdir('.oracle-maintenance-encrypted', { recursive: true, mode: 0o700 })
  await writeFile('.oracle-maintenance-encrypted/report.enc.json', JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
}

export async function main(env = process.env, { argv = process.argv.slice(2), now = new Date(),
  readRecipient = () => readFile('.github/oracle-maintenance-recipient.pem', 'utf8'),
  execute = runSsh, probe = probeReachability, persist = writeEvidence, output = value => process.stdout.write(value + '\n') } = {}) {
  let publicPem, report = { schema: 'worldifact-oracle-maintenance-v1', action: 'invalid', result: 'failed', failure: 'FAILED' }
  try {
    publicPem = await readRecipient()
    encryptReport({}, publicPem) // Validate encryption before reading credentials or contacting the host.
    try {
      const action = validateAction(env.ORACLE_MAINTENANCE_ACTION)
      report.action = action
      if (argv.length || env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== 'refs/heads/main' ||
          env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1' || !Number.isFinite(now.getTime())) fail('INVALID_CONTEXT')
      report.checkedAt = now.toISOString()
      validateHost(env.ORACLE_MAINTENANCE_HOST)
      if (action === 'reachability') report.reachability = await probe(env.ORACLE_MAINTENANCE_HOST)
      else {
        const { stdout, code } = await execute(action, env)
        report.dispatcher = validateDispatcherReport(stdout, action, code)
        if (code !== 0) fail('COMMAND_NOT_CONFIRMED')
      }
      report.result = 'completed'; delete report.failure
    } catch (error) { report.failure = FAILURE_CODES.includes(error?.message) ? error.message : 'FAILED' }
    const envelope = encryptReport(report, publicPem)
    await persist(envelope)
    output(report.result === 'completed' ? 'ENCRYPTED_MAINTENANCE_EVIDENCE_READY' : 'MAINTENANCE_FAILED_ENCRYPTED_EVIDENCE_READY')
    return report.result === 'completed' ? 0 : 1
  } catch { output('MAINTENANCE_FAILED_DETAILS_SUPPRESSED'); return 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
