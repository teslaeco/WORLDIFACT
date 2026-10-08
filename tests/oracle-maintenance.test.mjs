import test from 'node:test'
import assert from 'node:assert/strict'
import { constants, createDecipheriv, createPublicKey, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildSshInvocation, encryptReport, main, probeReachability, runSsh, validateAction,
  validateDispatcherReport, validateHost, validateKnownHosts } from '../scripts/oracle-maintenance.mjs'

const host = '8.8.8.8' // Synthetic fixture; every connection and SSH operation is stubbed.
const field = value => { const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]) }
const knownKey = Buffer.concat([field('ssh-ed25519'), field(Buffer.alloc(32, 7))]).toString('base64')
const knownHosts = `${host} ssh-ed25519 ${knownKey}`
const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nU1lOVEhFVElDX05PVF9BX1JFQUxfS0VZ\n-----END OPENSSH PRIVATE KEY-----\n'
const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', ORACLE_MAINTENANCE_ACTION: 'status',
  ORACLE_MAINTENANCE_HOST: host, ORACLE_MAINTENANCE_KNOWN_HOSTS: knownHosts, ORACLE_MAINTENANCE_SSH_KEY: privateKey }
const recipient = generateKeyPairSync('rsa', { modulusLength: 3072 })
const publicPem = recipient.publicKey.export({ type: 'spki', format: 'pem' })
const status = { read_only: true, snapshot_stable: true, changed_components: [], parser_sha256: 'a'.repeat(64),
  parser_version: 'previous', receipt_sha256: 'b'.repeat(64), receipt_revision: 'worldifact-standard-construction-v1',
  receipt_parser_sha256: 'a'.repeat(64), payload_update_revision: null, construction_health_verified: true,
  maintenance_present: false, recent_attempts: [], lock_file_present: false, observed_flock_holders: [],
  worker: { ActiveState: 'active', SubState: 'running', MainPID: '42' } }
const dispatch = (patch = {}) => ({ revision: 'oracle-maintenance-b6dce84d-v1', action: 'status', result: 'ready_to_apply',
  status: structuredClone(status), installer: null, ...patch })
const encoded = value => Buffer.from(JSON.stringify(value))
const verified = { phase: 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED', revision: 'worldifact-standard-construction-v1',
  paid_generation_requested: false, job_rows_changed: false, provider_limits_changed: false,
  previous_source_restored: null, activation_committed: true }

function decrypt(envelope) {
  const key = privateDecrypt({ key: recipient.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'))
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
    cipher.setAAD(Buffer.from(envelope.aad, 'base64')); cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString())
  } finally { key.fill(0) }
}

test('accepts only literal public IPv4 and the three fixed actions', () => {
  assert.equal(validateHost(host), host)
  for (const value of ['', null, 'localhost', 'example.com', '-oProxyCommand=secret', '8.8.8.8\n', '8.8.8.8:22',
    '8.8.8.8 1.1.1.1', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '192.0.2.1', '198.51.100.1', '203.0.113.1', '198.18.0.1', '0.1.2.3', '224.0.0.1', '255.255.255.255', '::1'])
    assert.throws(() => validateHost(value), /^Error: INVALID_CONFIGURATION$/)
  for (const action of ['status', 'reachability', 'apply-b6dce84d']) assert.equal(validateAction(action), action)
  for (const action of ['', null, 'apply', 'status; id', 'status\n', '--help', 'apply-b6dce84d --force'])
    assert.throws(() => validateAction(action), /^Error: INVALID_ACTION$/)
})

test('host trust permits one matching validated Ed25519, P256 or RSA2048+ key', () => {
  assert.deepEqual(validateKnownHosts(knownHosts + '\n', host), { line: knownHosts + '\n', algorithms: 'ssh-ed25519' })
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' })
  const ecKey = Buffer.concat([field('ecdsa-sha2-nistp256'), field('nistp256'), field(Buffer.concat([Buffer.of(4), Buffer.from(ec.x, 'base64url'), Buffer.from(ec.y, 'base64url')]))]).toString('base64')
  assert.equal(validateKnownHosts(`${host} ecdsa-sha2-nistp256 ${ecKey}`, host).algorithms, 'ecdsa-sha2-nistp256')
  const rsaKey = bits => Buffer.concat([field('ssh-rsa'), field(Buffer.from([1, 0, 1])), field(Buffer.concat([Buffer.of(0), Buffer.alloc(bits / 8, 255)]))]).toString('base64')
  assert.equal(validateKnownHosts(`${host} ssh-rsa ${rsaKey(2048)}`, host).algorithms, 'rsa-sha2-512,rsa-sha2-256')
  for (const line of ['', knownHosts + '\n' + knownHosts, knownHosts + '\n\n', knownHosts + ' comment', knownHosts.replace(host, '*'),
    knownHosts.replace(host, '|1|hashed|host'), knownHosts.replace(host, '1.1.1.1'), knownHosts.replace(host, `[${host}]:22`),
    `${host} ssh-rsa ${rsaKey(1024)}`, `${host} ssh-rsa ${knownKey}`, `${host} ssh-ed25519 !!!`, `${host} ssh-ed25519 YQ==`])
    assert.throws(() => validateKnownHosts(line, host), /^Error: INVALID_CONFIGURATION$/)
})

test('SSH argv fixes identity, port and command with no shell, inherited agent, config, forwarding or authentication fallback', () => {
  const invocation = buildSshInvocation('apply-b6dce84d', host, '/tmp/fixture/key', '/tmp/fixture/known_hosts', 'ssh-ed25519')
  assert.equal(invocation.file, '/usr/bin/ssh')
  assert.deepEqual(invocation.args.slice(0, 9), ['-F', '/dev/null', '-T', '-p', '22', '-l', 'opc', '-i', '/tmp/fixture/key'])
  assert.deepEqual(invocation.args.slice(-3), ['--', host, 'apply-b6dce84d'])
  assert.ok(invocation.args.includes('-n'))
  for (const option of ['BatchMode=yes', 'StrictHostKeyChecking=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none',
    'ForwardAgent=no', 'ForwardX11=no', 'ClearAllForwardings=yes', 'Tunnel=no', 'ProxyCommand=none', 'ProxyJump=none',
    'PermitLocalCommand=no', 'GlobalKnownHostsFile=/dev/null', 'UpdateHostKeys=no', 'PasswordAuthentication=no',
    'KbdInteractiveAuthentication=no', 'HostKeyAlgorithms=ssh-ed25519', 'ConnectionAttempts=1']) assert.ok(invocation.args.includes(option))
  assert.equal(invocation.options.shell, false); assert.equal(invocation.options.maxBuffer, 16384)
  assert.deepEqual(invocation.options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' })
  assert.equal(invocation.options.timeout, 3450000)
  assert.equal(buildSshInvocation('status', host, '/tmp/key', '/tmp/known', 'ssh-ed25519').options.timeout, 60000)
  for (const action of ['status; id', 'reachability']) assert.throws(() => buildSshInvocation(action, host, '/tmp/key', '/tmp/known', 'ssh-ed25519'))
  assert.throws(() => buildSshInvocation('status', host, '/tmp/key\n', '/tmp/known', 'ssh-ed25519'))
})

test('SSH uses private temporary files and removes them on success and unsafe errors', async () => {
  for (const error of [null, Object.assign(new Error(privateKey + host), { code: 255 }), Object.assign(new Error('timeout'), { code: 1, killed: true })]) {
    let keyPath
    const execute = (file, args, options, callback) => {
      keyPath = args[args.indexOf('-i') + 1]
      assert.equal(file, '/usr/bin/ssh'); assert.equal(JSON.stringify(args).includes(privateKey), false)
      assert.equal(JSON.stringify(options).includes(privateKey), false)
      Promise.all([readFile(keyPath, 'utf8'), stat(keyPath), stat(dirname(keyPath))]).then(([key, info, directory]) => {
        assert.equal(key, privateKey); assert.equal(info.mode & 0o777, 0o600); assert.equal(directory.mode & 0o777, 0o700)
        callback(error, encoded(dispatch()), Buffer.from('private stderr'))
      }).catch(callback)
    }
    if (error) await assert.rejects(runSsh('status', env, execute), /^Error: SSH_FAILED$/)
    else assert.deepEqual(await runSsh('status', env, execute), { stdout: encoded(dispatch()), code: 0 })
    await assert.rejects(access(dirname(keyPath)))
  }
  await assert.rejects(runSsh('status', { ...env, ORACLE_MAINTENANCE_SSH_KEY: 'secret malformed' }, () => assert.fail('SSH called')), /^Error: INVALID_CONFIGURATION$/)
  await assert.rejects(runSsh('status', env, (_file, _args, _options, callback) => callback(null, Buffer.alloc(16385))), /^Error: SSH_FAILED$/)
})

test('key copy/paste ASCII boundaries are normalized only in the private temporary copy', async () => {
  for (const value of [privateKey, privateKey.trimEnd(), privateKey + '\n\n', privateKey + ' \t\r\n',
    ' \t\r\n' + privateKey, '\n\t ' + privateKey + '\n \t\r\n']) {
    const configured = { ...env, ORACLE_MAINTENANCE_SSH_KEY: value }
    let keyPath
    await runSsh('status', configured, (_file, args, _options, callback) => {
      keyPath = args[args.indexOf('-i') + 1]
      readFile(keyPath, 'utf8').then(key => {
        assert.equal(key, privateKey)
        callback(null, encoded(dispatch()))
      }).catch(callback)
    })
    assert.equal(configured.ORACLE_MAINTENANCE_SSH_KEY, value)
    await assert.rejects(access(dirname(keyPath)))
  }
})

test('key boundary normalization cannot repair interior corruption, Unicode, extra text or oversized input', async () => {
  const noSsh = () => assert.fail('Invalid key reached SSH')
  for (const value of ['', ' \t\r\n', privateKey.replaceAll('\n', '\r\n'), privateKey.replaceAll('\n', '\\n'),
    '\uFEFF' + privateKey, '\u00a0' + privateKey, privateKey + '\u200b', privateKey + '\u00a0',
    privateKey.replace('U1lOVEhFVElD', 'U1lOV EhFVElD'), privateKey.replace('U1lOVEhFVElD', 'U1lOV\0EhFVElD'),
    privateKey.replace('\nU1lOVEhFVElD', '\n\nU1lOVEhFVElD'), 'prompt ' + privateKey,
    privateKey + ' extra text', privateKey + privateKey, privateKey.slice(0, -20),
    ' '.repeat(32768) + privateKey, privateKey.repeat(500)]) {
    await assert.rejects(runSsh('status', { ...env, ORACLE_MAINTENANCE_SSH_KEY: value }, noSsh), /^Error: INVALID_CONFIGURATION$/)
  }
})

test('reachability opens only one socket to port 22, retains no banner and never authenticates', async () => {
  for (const banner of ['SSH-2.0-OpenSSH_fixture\r\n', 'private banner\n', 'x'.repeat(1025), 'SSH-2.0-\xff\n', null]) {
    let calls = 0, destroyed = false
    const connect = options => {
      calls++; assert.deepEqual(options, { host, port: 22, family: 4 })
      const socket = new EventEmitter(); socket.destroy = () => { destroyed = true }; socket.write = () => assert.fail('authentication/write')
      queueMicrotask(() => banner === null ? socket.emit('error', new Error(host)) : socket.emit('data', Buffer.from(banner, 'latin1')))
      return socket
    }
    if (banner === 'SSH-2.0-OpenSSH_fixture\r\n') assert.deepEqual(await probeReachability(host, connect), { port: 22, sshBanner: true, authenticated: false })
    else await assert.rejects(probeReachability(host, connect), /^Error: SSH_UNREACHABLE$/)
    assert.equal(calls, 1); assert.equal(destroyed, true)
  }
})

test('dispatcher schema accepts finite status, known interrupted stages, and installer results', () => {
  assert.deepEqual(validateDispatcherReport(encoded(dispatch()), 'status'), dispatch())
  const sample = dispatch({ result: 'busy' })
  sample.status.changed_components = ['worker']
  sample.status.snapshot_stable = false
  sample.status.recent_attempts = [{ attempt_utc: '20261008T100000Z', report: 'NO_REPORT_PREWORK_OR_INTERRUPTED' },
    { attempt_utc: '20261008T090000Z', report: { phase: 'STANDARD_CONSTRUCTION_STAGED_NOT_INSTALLED', paid_generation_requested: false } }]
  sample.status.observed_flock_holders = [{ pid: 123, state: 'S', start_ticks: 12345 }]
  validateDispatcherReport(encoded(sample), 'status')
  validateDispatcherReport(encoded(dispatch({ result: 'inconclusive', status: { read_only: true, snapshot_stable: false, refusal: 'unsafe_or_unavailable_read' } })), 'status')
  const applied = dispatch({ action: 'apply-b6dce84d', result: 'updated', installer: verified })
  validateDispatcherReport(encoded(applied), 'apply-b6dce84d')
  const refused = dispatch({ action: null, result: 'refused', status: null })
  validateDispatcherReport(encoded(refused), 'status', 1)
  const unconfirmed = dispatch({ action: 'apply-b6dce84d', result: 'not_confirmed', installer: { ...verified,
    phase: 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED', activation_committed: false, previous_source_restored: true, refusal_code: 'verification_failed' } })
  validateDispatcherReport(encoded(unconfirmed), 'apply-b6dce84d', 1)
})

test('dispatcher rejects secret/freeform/unknown fields, bad bounds, action mismatch and dishonest exit results', () => {
  const mutations = [value => { value.secret = privateKey }, value => { value.action = 'apply-b6dce84d' },
    value => { value.result = 'private error' }, value => { value.status.worker.Token = privateKey },
    value => { value.status.parser_sha256 = privateKey }, value => { value.status.changed_components = ['private/path'] },
    value => { value.status.changed_components = ['worker', 'worker'] }, value => { value.status.read_only = false },
    value => { value.status.recent_attempts = Array(3).fill({}) }, value => { value.status.observed_flock_holders = [{ pid: 0, state: 'S', start_ticks: 0 }] },
    value => { value.status.worker.ActiveState = 'secret\nlog' }, value => { value.installer = verified },
    value => { value.status = null }, value => { value.revision = 'other' }]
  for (const mutate of mutations) { const value = dispatch(); mutate(value); assert.throws(() => validateDispatcherReport(encoded(value), 'status'), /^Error: INVALID_RESPONSE$/) }
  for (const bytes of [Buffer.from('private raw error'), Buffer.from([0xff]), Buffer.alloc(16385), Buffer.from('{}\n{}')])
    assert.throws(() => validateDispatcherReport(bytes, 'status'), /^Error: INVALID_RESPONSE$/)
  assert.throws(() => validateDispatcherReport(encoded(dispatch()), 'status', 1), /^Error: INVALID_RESPONSE$/)
  const invalid = dispatch({ action: 'apply-b6dce84d', result: 'updated', installer: { ...verified, paid_generation_requested: true } })
  assert.throws(() => validateDispatcherReport(encoded(invalid), 'apply-b6dce84d'), /^Error: INVALID_RESPONSE$/)
})

test('evidence is authenticated ciphertext before any persistence, and recipient matches the RSA public-key requirement', async () => {
  const report = { private: 'fixture report' }, envelope = encryptReport(report, publicPem)
  assert.deepEqual(decrypt(envelope), report)
  assert.equal(JSON.stringify(envelope).includes('fixture report'), false)
  assert.equal(envelope.aad, Buffer.from('WORLDIFACT_ORACLE_MAINTENANCE_V1').toString('base64'))
  const changed = { ...envelope, tag: Buffer.alloc(16).toString('base64') }
  assert.throws(() => decrypt(changed))
  const checkedIn = createPublicKey(await readFile(new URL('../.github/oracle-maintenance-recipient.pem', import.meta.url), 'utf8'))
  assert.equal(checkedIn.asymmetricKeyType, 'rsa'); assert.ok(checkedIn.asymmetricKeyDetails.modulusLength >= 3072)
})

async function executeMain(overrides = {}, dependencies = {}) {
  const outputs = [], envelopes = []
  const code = await main({ ...env, ...overrides }, { argv: [], now: new Date('2026-10-08T10:00:00Z'),
    readRecipient: async () => publicPem, execute: async () => ({ stdout: encoded(dispatch()), code: 0 }),
    persist: async envelope => { assert.equal(envelope.schema, 'worldifact-encrypted-report-v1'); envelopes.push(envelope) },
    output: value => outputs.push(value), ...dependencies })
  return { code, outputs, envelopes, report: envelopes[0] ? decrypt(envelopes[0]) : null }
}

test('successful main writes only encrypted allowlisted evidence and one fixed safe line', async () => {
  const result = await executeMain()
  assert.equal(result.code, 0); assert.equal(result.report.result, 'completed')
  assert.deepEqual(result.report.dispatcher, dispatch())
  assert.deepEqual(result.outputs, ['ENCRYPTED_MAINTENANCE_EVIDENCE_READY'])
  for (const secret of [host, privateKey, knownHosts, 'ready_to_apply']) assert.equal(JSON.stringify(result.outputs).includes(secret), false)
})

test('failed reads encrypt safe failure evidence without raw SSH messages, host, key or payload', async () => {
  for (const execute of [async () => { throw new Error(host + privateKey + 'private stderr') },
    async () => ({ stdout: encoded({ secret: privateKey, endpoint: host }), code: 0 }),
    async () => ({ stdout: Buffer.from('raw private stdout ' + privateKey), code: 1 })]) {
    const result = await executeMain({}, { execute })
    assert.equal(result.code, 1); assert.equal(result.report.result, 'failed')
    assert.deepEqual(result.outputs, ['MAINTENANCE_FAILED_ENCRYPTED_EVIDENCE_READY'])
    assert.ok(['FAILED', 'INVALID_RESPONSE'].includes(result.report.failure))
    for (const secret of [host, privateKey, 'private stderr', 'raw private stdout', 'endpoint']) assert.equal(JSON.stringify(result).includes(secret), false)
  }
})

test('invalid action, argv and workflow context fail before SSH but retain safe encrypted evidence', async () => {
  const execute = () => assert.fail('SSH must not run')
  for (const change of [{ ORACLE_MAINTENANCE_ACTION: 'status; id' }, { ORACLE_MAINTENANCE_HOST: 'localhost' },
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_RUN_ATTEMPT: '2' }]) {
    const result = await executeMain(change, { execute }); assert.equal(result.code, 1); assert.equal(result.envelopes.length, 1)
  }
  assert.equal((await executeMain({}, { argv: ['status'], execute })).report.failure, 'INVALID_CONTEXT')
})

test('invalid encryption recipient prevents network, key handling and all evidence writes', async () => {
  const result = await executeMain({}, { readRecipient: async () => 'private malformed recipient', execute: () => assert.fail('SSH'),
    probe: () => assert.fail('TCP'), persist: () => assert.fail('write') })
  assert.equal(result.code, 1); assert.equal(result.envelopes.length, 0)
  assert.deepEqual(result.outputs, ['MAINTENANCE_FAILED_DETAILS_SUPPRESSED'])
})

test('reachability does not need or read authentication secrets and persists no destination', async () => {
  const input = { ...env, ORACLE_MAINTENANCE_ACTION: 'reachability' }
  delete input.ORACLE_MAINTENANCE_SSH_KEY; delete input.ORACLE_MAINTENANCE_KNOWN_HOSTS
  Object.defineProperty(input, 'ORACLE_MAINTENANCE_SSH_KEY', { get: () => assert.fail('key read') })
  Object.defineProperty(input, 'ORACLE_MAINTENANCE_KNOWN_HOSTS', { get: () => assert.fail('trust read') })
  let saved
  assert.equal(await main(input, { argv: [], readRecipient: async () => publicPem,
    execute: () => assert.fail('SSH'), probe: async target => { assert.equal(target, host); return { port: 22, sshBanner: true, authenticated: false } },
    persist: async value => { saved = decrypt(value) }, output: () => {} }), 0)
  assert.deepEqual(saved.reachability, { port: 22, sshBanner: true, authenticated: false })
  assert.equal(JSON.stringify(saved).includes(host), false)
})

test('real evidence file contains ciphertext only with private permissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-maintenance-evidence-test-')), before = process.cwd()
  try {
    process.chdir(directory)
    assert.equal(await main(env, { argv: [], readRecipient: async () => publicPem,
      execute: async () => ({ stdout: encoded(dispatch()), code: 0 }), output: () => {} }), 0)
    const file = join(directory, '.oracle-maintenance-encrypted', 'report.enc.json')
    assert.deepEqual(await readdir(dirname(file)), ['report.enc.json'])
    const bytes = await readFile(file, 'utf8')
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.equal(bytes.includes('ready_to_apply'), false); assert.equal(bytes.includes(privateKey), false)
    assert.deepEqual(decrypt(JSON.parse(bytes)).dispatcher, dispatch())
  } finally { process.chdir(before); await rm(directory, { recursive: true, force: true }) }
})

test('workflow separates credential-free review from manual main-only maintenance and uploads only short-lived ciphertext', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oracle-maintenance.yml', import.meta.url), 'utf8')
  assert.match(workflow, /default: status/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.match(workflow, /python: \['3\.9', '3\.12'\]/)
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main' && github.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /name: Production\n      deployment: false/)
  assert.match(workflow, /timeout-minutes: 60/)
  assert.match(workflow, /retention-days: 1/)
  assert.match(workflow, /path: \.oracle-maintenance-encrypted\/report\.enc\.json/)
  assert.match(workflow, /always\(\) && hashFiles/)
  const offline = workflow.split('  maintenance:')[0], reachability = workflow.split('      - name: Check one SSH listener without authentication')[1].split('      - name: Run one fixed dispatcher command')[0]
  assert.doesNotMatch(offline, /secrets\.|environment:/)
  assert.doesNotMatch(reachability, /SSH_KEY|KNOWN_HOSTS/)
  assert.doesNotMatch(workflow, /ORACLE_API_TOKEN|ORACLE_ENDPOINT|pull_request_target|schedule:|ssh-keyscan/)
  const uses = [...workflow.matchAll(/uses: ([^\n]+)/g)].map(match => match[1])
  assert.ok(uses.every(value => /^actions\/(?:checkout|setup-node|setup-python|upload-artifact)@[a-f0-9]{40}$/.test(value)))
})
