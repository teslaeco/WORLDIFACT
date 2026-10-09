import test from 'node:test'
import assert from 'node:assert/strict'
import { constants, createDecipheriv, createHash, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { access, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { encryptReport, runSsh } from '../scripts/oracle-maintenance.mjs'
import { ADDED_PATHS, EXPECTED_PARENT, EXPECTED_BASE_TREE, EXPECTED_REF, EXPIRES_AT, LEGACY_SHA256,
  RECIPIENT_SHA256, collectStatus, diagnoseResponse, main, readSource, validateContext, validateSource,
  validateStatus } from '../scripts/oracle-grant-status-once.mjs'

// Only synthetic credentials. Every SSH/child process is stubbed; no network calls.
const now = Date.parse('2026-10-09T02:30:00Z')
const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: EXPECTED_REF,
  GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40) }
const event = { repository: { full_name: env.GITHUB_REPOSITORY }, ref: EXPECTED_REF,
  before: EXPECTED_PARENT, after: env.GITHUB_SHA, created: false, deleted: false, forced: false }
const source = { head: env.GITHUB_SHA, parents: EXPECTED_PARENT, baseTree: EXPECTED_BASE_TREE,
  changes: ADDED_PATHS.map(path => `A\t${path}\n`).join(''), dirty: '' }
const host = '8.8.8.8'
const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nU1lOVEhFVElDX05PVF9BX1JFQUxfS0VZ\n-----END OPENSSH PRIVATE KEY-----\n'
const field = value => { const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]) }
const knownKey = Buffer.concat([field('ssh-ed25519'), field(Buffer.alloc(32, 7))]).toString('base64')
const knownHosts = `${host} ssh-ed25519 ${knownKey}`
const sshEnv = { ...env, ORACLE_MAINTENANCE_HOST: host, ORACLE_MAINTENANCE_SSH_KEY: privateKey,
  ORACLE_MAINTENANCE_KNOWN_HOSTS: knownHosts }
const never = () => assert.fail('Unexpected credential read, network call or mutation')
const encode = value => Buffer.from(JSON.stringify(value))
const status = { read_only: true, snapshot_stable: true, changed_components: [], parser_sha256: 'a'.repeat(64),
  parser_version: 'previous', receipt_sha256: 'b'.repeat(64), receipt_revision: 'worldifact-standard-construction-v1',
  receipt_parser_sha256: 'a'.repeat(64), payload_update_revision: 'responses-reasoning-content-v1', construction_health_verified: true,
  maintenance_present: false, recent_attempts: [], lock_file_present: false, observed_flock_holders: [],
  worker: { ActiveState: 'active', SubState: 'running', MainPID: '42' } }
const hashes = { 'construction_payload.py': 'a'.repeat(64), 'phased_controller.py': 'b'.repeat(64), 'runtime_controller.py': null }
function dispatch(revision = 'legacy') {
  return { revision: revision === 'legacy' ? 'oracle-maintenance-b6dce84d-v1' : 'oracle-maintenance-initial-edit-v1',
    action: 'status', result: 'ready_to_apply', status: { ...structuredClone(status),
      ...(revision === 'legacy' ? {} : { helper_sha256: { ...hashes }, receipt_helper_sha256: { ...hashes }, initial_edit_revision: null }) }, installer: null }
}
const recipientPath = new URL('../.github/oracle-maintenance-recipient.pem', import.meta.url)
const legacyPath = new URL('../scripts/oracle-maintenance-legacy-reviewed.mjs', import.meta.url)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('context requires exact push-before, branch, repository, first attempt and unexpired interval', () => {
  validateContext(env, event, now)
  for (const patch of [{ GITHUB_REPOSITORY: 'other/WORLDIFACT' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_RUN_ATTEMPT: 1 }, { GITHUB_SHA: '' }, { GITHUB_SHA: '0'.repeat(40) }, { GITHUB_SHA: 'a'.repeat(40) + '\n' }])
    assert.throws(() => validateContext({ ...env, ...patch }, event, now), /INVALID_CONTEXT/)
  for (const patch of [{ before: '0'.repeat(40) }, { before: env.GITHUB_SHA }, { after: 'b'.repeat(40) },
    { ref: 'refs/heads/main' }, { repository: { full_name: 'other/WORLDIFACT' } },
    { created: true }, { deleted: true }, { forced: true }, { created: undefined }, { forced: undefined }])
    assert.throws(() => validateContext(env, { ...event, ...patch }, now), /INVALID_CONTEXT/)
  for (const value of [null, {}, 'raw private event']) assert.throws(() => validateContext(env, value, now), /INVALID_CONTEXT/)
  for (const time of [NaN, Infinity, Date.parse('2026-10-09T02:17:59Z'), Date.parse(EXPIRES_AT), Date.parse(EXPIRES_AT) + 1])
    assert.throws(() => validateContext(env, event, time), /INVALID_CONTEXT/)
})

test('source allows one exact-parent child and exactly four added files with unchanged base tree', () => {
  validateSource(env, source)
  for (const patch of [{ head: 'b'.repeat(40) }, { parents: 'b'.repeat(40) }, { parents: EXPECTED_PARENT + ' ' + EXPECTED_PARENT },
    { baseTree: 'b'.repeat(40) }, { changes: source.changes.replace('A\t', 'M\t') },
    { changes: source.changes + 'A\tother-file\n' }, { changes: source.changes.slice(1) },
    { changes: source.changes + '\n' }, { dirty: ' M scripts/oracle-maintenance.mjs\n' }])
    assert.throws(() => validateSource(env, { ...source, ...patch }), /INVALID_SOURCE_SCOPE/)
})

test('source gate executes only bounded credential-free local Git reads', () => {
  const seen = [], outputs = [source.head + '\n', source.parents + '\n', source.baseTree + '\n', source.changes, '']
  assert.deepEqual(readSource((file, args, options) => {
    seen.push(args); assert.equal(file, '/usr/bin/git'); assert.equal(options.shell, false)
    assert.equal(options.timeout, 10000); assert.equal(options.maxBuffer, 16384)
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' })
    return outputs.shift()
  }), source)
  assert.deepEqual(seen, [['rev-parse', '--verify', 'HEAD'], ['show', '-s', '--format=%P', 'HEAD'],
    ['rev-parse', '--verify', 'HEAD^1^{tree}'], ['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'HEAD'],
    ['status', '--porcelain=v1', '--untracked-files=all']])
  assert.throws(() => readSource(() => { throw new Error(privateKey) }), /^Error: INVALID_SOURCE_SCOPE$/)
})

test('both exact reviewed schemas accept finite complete and safe refusal status', () => {
  for (const revision of ['legacy', 'current']) {
    const value = dispatch(revision)
    assert.deepEqual(validateStatus(encode(value), 0), value)
    for (const result of ['already_updated', 'busy', 'inconclusive']) validateStatus(encode({ ...value, result }), 0)
    const refused = { ...value, action: null, result: 'refused', status: null }
    assert.deepEqual(validateStatus(encode(refused), 1), refused)
    const unavailable = { ...value, result: 'inconclusive', status: { read_only: true, snapshot_stable: false, refusal: 'unsafe_or_unavailable_read' } }
    assert.deepEqual(validateStatus(encode(unavailable), 0), unavailable)
  }
})

test('unknown, mixed, truncated and malformed schemas cannot fall through as raw output', () => {
  for (const revision of ['legacy', 'current']) {
    const mutate = [v => { v.extra = privateKey }, v => { v.status.worker.Secret = privateKey },
      v => { v.status.parser_sha256 = privateKey }, v => { v.status.read_only = false },
      v => { v.status.worker.ActiveState = privateKey }, v => { v.status.changed_components = ['private/path'] },
      v => { v.status.recent_attempts = Array(3).fill({}) }, v => { v.revision = privateKey },
      v => { v.action = revision === 'legacy' ? 'apply-b6dce84d' : 'apply-initial-edit-v1' },
      v => { v.result = 'updated' }, v => { v.installer = {} }, v => { delete v.status.worker.MainPID },
      v => { v.revision = revision === 'legacy' ? 'oracle-maintenance-initial-edit-v1' : 'oracle-maintenance-b6dce84d-v1' }]
    for (const change of mutate) { const value = dispatch(revision); change(value); assert.throws(() => validateStatus(encode(value), 0), /^Error: INVALID_RESPONSE$/) }
    assert.throws(() => validateStatus(encode(dispatch(revision)), 1), /INVALID_RESPONSE/)
    const bytes = encode(dispatch(revision))
    for (let cut = 0; cut < bytes.length; cut++) assert.throws(() => validateStatus(bytes.subarray(0, cut), 0), /INVALID_RESPONSE/)
  }
  for (const bytes of [Buffer.from([0xff]), Buffer.alloc(16385), Buffer.from('{}\n{}'), Buffer.from(privateKey),
    encode(null), encode([]), encode('text'), '{}', undefined])
    assert.throws(() => validateStatus(bytes, 0), /^Error: INVALID_RESPONSE$/)
  for (const code of [undefined, 2, -1, '0']) assert.throws(() => validateStatus(encode(dispatch()), code), /INVALID_RESPONSE/)
})

test('response diagnostics expose only bounded counts and fixed categories', () => {
  const samples = [[undefined, 'invalid_buffer'], [Buffer.alloc(16385), 'oversized'], [Buffer.from([0xff]), 'malformed_utf8'],
    [Buffer.from(privateKey), 'malformed_json'], [encode(null), 'non_object'], [encode({ revision: privateKey }), 'schema_rejected']]
  for (const [bytes, shape] of samples) {
    const result = diagnoseResponse(bytes, 1)
    assert.equal(result.responseShape, shape); assert.equal(result.sshExitCode, 1); assert.equal(result.selectedSchema, 'none')
    assert.equal(JSON.stringify(result).includes(privateKey), false)
    assert.ok(result.stdoutBytes === null || Number.isInteger(result.stdoutBytes) && result.stdoutBytes >= 0 && result.stdoutBytes <= 16384)
  }
  assert.equal(diagnoseResponse(encode(dispatch()), 0).revision, 'legacy')
  assert.equal(diagnoseResponse(encode(dispatch('current')), 0).revision, 'current')
  assert.equal(diagnoseResponse(encode({ revision: privateKey }), 255).revision, 'unsupported')
  assert.equal(diagnoseResponse(encode({}), 255).sshExitCode, null)
})

test('collector invokes exactly one hard-coded status command and clears raw bytes on every schema outcome', async () => {
  for (const revision of ['legacy', 'current']) for (const code of [0, 1]) {
    let calls = 0
    const value = code === 0 ? dispatch(revision) : { ...dispatch(revision), action: null, result: 'refused', status: null }
    const bytes = encode(value), length = bytes.length
    const configured = { ...sshEnv, ORACLE_MAINTENANCE_ACTION: 'apply-initial-edit-v1' }
    const original = structuredClone(configured)
    const report = await collectStatus(configured, async (action, actualEnv) => {
      calls++; assert.equal(action, 'status'); assert.equal(actualEnv, configured); return { stdout: bytes, code }
    })
    assert.equal(calls, 1); assert.deepEqual(configured, original); assert.ok(bytes.every(byte => byte === 0))
    assert.deepEqual(report.dispatcher, value); assert.equal(report.result, code === 0 ? 'completed' : 'failed')
    assert.deepEqual(report.diagnostics, { sshExitCode: code, stdoutBytes: length, revision,
      selectedSchema: revision, responseShape: 'validated' })
  }
})

test('credential reflection, transport failure and invalid output preserve only finite encrypted-report data', async () => {
  for (const bytes of [encode({ ...dispatch(), secret: privateKey }), Buffer.from(privateKey), Buffer.from([0xff]),
    encode({ ...dispatch(), revision: privateKey })]) {
    let calls = 0
    const report = await collectStatus(sshEnv, async () => { calls++; return { stdout: bytes, code: 0 } })
    assert.equal(calls, 1); assert.equal(report.failure, 'INVALID_RESPONSE'); assert.equal(report.dispatcher, undefined)
    assert.equal(JSON.stringify(report).includes(privateKey), false); assert.ok(bytes.every(byte => byte === 0))
  }
  for (const message of ['SSH_FAILED', privateKey + host + knownHosts]) {
    let calls = 0
    const report = await collectStatus(sshEnv, async () => { calls++; throw new Error(message) })
    assert.equal(calls, 1); assert.ok(['SSH_FAILED', 'FAILED'].includes(report.failure))
    assert.equal(report.diagnostics.responseShape, 'not_received')
    for (const secret of [privateKey, host, knownHosts]) assert.equal(JSON.stringify(report).includes(secret), false)
  }
})

test('real transport builder remains one fixed status SSH with private files and no inherited secrets', async () => {
  let calls = 0, keyPath
  const result = await collectStatus(sshEnv, (action, configured) => runSsh(action, configured, (file, args, options, callback) => {
    calls++; assert.equal(file, '/usr/bin/ssh'); assert.deepEqual(args.slice(-3), ['--', host, 'status'])
    assert.equal(options.shell, false); assert.equal(options.timeout, 60000); assert.equal(options.maxBuffer, 16384)
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' })
    for (const option of ['StrictHostKeyChecking=yes', 'IdentityAgent=none', 'ProxyCommand=none', 'ForwardAgent=no',
      'PermitLocalCommand=no', 'ConnectionAttempts=1']) assert.ok(args.includes(option))
    assert.equal(JSON.stringify(args).includes(privateKey), false)
    keyPath = args[args.indexOf('-i') + 1]
    Promise.all([readFile(keyPath, 'utf8'), stat(keyPath), stat(dirname(keyPath))]).then(([key, keyStat, dirStat]) => {
      assert.equal(key, privateKey); assert.equal(keyStat.mode & 0o777, 0o600); assert.equal(dirStat.mode & 0o777, 0o700)
      callback(null, encode(dispatch()))
    }).catch(callback)
  }))
  assert.equal(calls, 1); assert.equal(result.result, 'completed'); await assert.rejects(access(dirname(keyPath)))
})

test('unchanged recipient and byte-for-byte legacy module match reviewed hashes', async () => {
  assert.equal(hash(await readFile(recipientPath)), RECIPIENT_SHA256)
  assert.equal(hash(await readFile(legacyPath)), LEGACY_SHA256)
})

async function invoke(overrides = {}) {
  const logs = [], envelopes = []
  const code = await main({ args: ['--status'], env, now, source: () => source, event: async () => event,
    readRecipient: () => readFile(recipientPath, 'utf8'), readLegacy: () => readFile(legacyPath),
    execute: async () => ({ stdout: encode(dispatch()), code: 0 }), persist: async value => envelopes.push(value),
    log: value => logs.push(value), ...overrides })
  return { code, logs, envelopes }
}

test('scope and integrity gates reject before any credential or recipient read', async () => {
  const securedEnv = { ...env }
  for (const key of ['ORACLE_MAINTENANCE_HOST', 'ORACLE_MAINTENANCE_KNOWN_HOSTS', 'ORACLE_MAINTENANCE_SSH_KEY'])
    Object.defineProperty(securedEnv, key, { get: never })
  const cases = [{ args: [] }, { args: ['--apply'] }, { args: ['--status', 'status'] },
    { now: Date.parse(EXPIRES_AT) }, { event: async () => ({ ...event, before: env.GITHUB_SHA }) },
    { source: () => ({ ...source, baseTree: 'b'.repeat(40) }) }, { readLegacy: async () => 'modified validator' }]
  for (const change of cases) {
    const result = await invoke({ env: securedEnv, execute: never, readRecipient: never, persist: never, ...change })
    assert.equal(result.code, 1); assert.deepEqual(result.logs, ['STATUS_FAILED_DETAILS_SUPPRESSED']); assert.deepEqual(result.envelopes, [])
  }
  const gate = await invoke({ args: ['--gate'], env: securedEnv, execute: never, readRecipient: never, persist: never })
  assert.equal(gate.code, 0); assert.deepEqual(gate.logs, ['ORACLE_STATUS_SCOPE_VALID'])
})

test('recipient validation refuses changed or malformed key before any SSH call', async () => {
  for (const value of ['', privateKey, (await readFile(recipientPath, 'utf8')) + '\n']) {
    const result = await invoke({ readRecipient: async () => value, execute: never, persist: never })
    assert.equal(result.code, 1); assert.deepEqual(result.logs, ['STATUS_FAILED_DETAILS_SUPPRESSED'])
  }
})

test('success and failure main paths persist authenticated ciphertext and emit only fixed public lines', async () => {
  for (const [bytes, code, expected] of [[encode(dispatch()), 0, 'ENCRYPTED_STATUS_EVIDENCE_READY'],
    [encode(dispatch('current')), 0, 'ENCRYPTED_STATUS_EVIDENCE_READY'],
    [Buffer.from(privateKey + host), 1, 'STATUS_FAILED_ENCRYPTED_EVIDENCE_READY']]) {
    let calls = 0
    const result = await invoke({ execute: async () => { calls++; return { stdout: bytes, code } } })
    assert.equal(calls, 1); assert.equal(result.envelopes.length, 1); assert.deepEqual(result.logs, [expected])
    assert.equal(result.code, expected === 'ENCRYPTED_STATUS_EVIDENCE_READY' ? 0 : 1)
    const envelope = result.envelopes[0]
    assert.equal(envelope.schema, 'worldifact-encrypted-report-v1'); assert.equal(envelope.cipher, 'AES-256-GCM')
    assert.equal(envelope.aad, Buffer.from('WORLDIFACT_ORACLE_MAINTENANCE_V1').toString('base64'))
    for (const secret of [privateKey, host, knownHosts, 'ready_to_apply']) assert.equal(JSON.stringify(result).includes(secret), false)
  }
})

test('synthetic round-trip verifies status outer schema, same AAD, and tamper rejection', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const report = await collectStatus(sshEnv, async () => ({ stdout: encode(dispatch()), code: 0 }))
  const envelope = encryptReport(report, keys.publicKey.export({ type: 'spki', format: 'pem' }))
  const key = privateDecrypt({ key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'))
  const decrypt = value => {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
    decipher.setAAD(Buffer.from(value.aad, 'base64')); decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString())
  }
  try {
    assert.deepEqual(decrypt(envelope), report); assert.equal(report.schema, 'worldifact-oracle-maintenance-v1')
    assert.equal(report.action, 'status'); assert.equal(report.result, 'completed')
    assert.throws(() => decrypt({ ...envelope, tag: Buffer.alloc(16).toString('base64') }))
  } finally { key.fill(0) }
})

test('workflow maps only three existing secrets to STATUS and uploads only ciphertext for one day', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oracle-grant-status-once.yml', import.meta.url), 'utf8')
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]),
    ['ORACLE_MAINTENANCE_HOST', 'ORACLE_MAINTENANCE_KNOWN_HOSTS', 'ORACLE_MAINTENANCE_SSH_KEY'])
  assert.match(workflow, /deployment: false/); assert.match(workflow, /retention-days: 1/)
  assert.match(workflow, /path: \.oracle-grant-status-encrypted\/report\.enc\.json/)
  assert.equal((workflow.match(/node scripts\/oracle-grant-status-once\.mjs --status/g) || []).length, 1)
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2)
  assert.equal((workflow.match(/github\.run_attempt == 1/g) || []).length, 2)
  for (const forbidden of ['workflow_dispatch:', 'schedule:', 'contents: write', 'id-token:', 'wrangler', 'apply-initial-edit-v1',
    'apply-b6dce84d', 'provider', 'settlement', 'budget', 'ssh-keyscan']) assert.equal(workflow.includes(forbidden), false)
  for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[a-f0-9]{40}$/)
})
