import test from 'node:test'
import assert from 'node:assert/strict'
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { access, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { encryptReport, runSsh } from '../scripts/oracle-maintenance.mjs'
import { ADDED_PATHS, EXPECTED_HOST, EXPECTED_PARENT, EXPECTED_REF, EXPIRES_AT,
  buildKeyParseInvocation, collectBoundaryShape, collectShape, keyShape, main, parseKey, readSource,
  validateContext, validateSource } from '../scripts/oracle-config-boundary-once.mjs'

// All credentials are synthetic. Every child process is a stub; tests never use SSH or the network.
const now = Date.parse('2026-10-08T21:00:00Z')
const field = value => { const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]) }
const knownKey = Buffer.concat([field('ssh-ed25519'), field(Buffer.alloc(32, 7))]).toString('base64')
const knownHosts = `${EXPECTED_HOST} ssh-ed25519 ${knownKey}\n`
const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nU1lOVEhFVElDX05PVF9BX1JFQUxfS0VZ\n-----END OPENSSH PRIVATE KEY-----\n'
const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: EXPECTED_REF,
  GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
  ORACLE_MAINTENANCE_HOST: EXPECTED_HOST, ORACLE_MAINTENANCE_KNOWN_HOSTS: knownHosts,
  ORACLE_MAINTENANCE_SSH_KEY: privateKey }
const source = { head: env.GITHUB_SHA, parents: EXPECTED_PARENT,
  changes: ADDED_PATHS.map(path => `A\t${path}\n`).join('') }
const never = () => assert.fail('Unexpected private read or child process')
const parsed = (_file, _args, _options, done) => done(null, Buffer.from('synthetic derived public key'), Buffer.from('synthetic stderr'))
const recipientPath = new URL('../.github/oracle-maintenance-recipient.pem', import.meta.url)

test('context is restricted to the fixed repository, branch, push, first attempt and day', () => {
  validateContext(env, now)
  for (const patch of [{ GITHUB_REPOSITORY: 'other/WORLDIFACT' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF: 'refs/heads/diagnostics/oracle-config-shape-20261008' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ATTEMPT: 1 }, { GITHUB_SHA: '' },
    { GITHUB_SHA: 'a'.repeat(40) + '\n' }, { GITHUB_SHA: '0'.repeat(40) }])
    assert.throws(() => validateContext({ ...env, ...patch }, now), /INVALID_CONTEXT/)
  for (const time of [NaN, Infinity, Date.parse('2026-10-07T23:59:59Z'), Date.parse(EXPIRES_AT), Date.parse(EXPIRES_AT) + 1])
    assert.throws(() => validateContext(env, time), /INVALID_CONTEXT/)
})

test('only one child of the fixed parent adding exactly three paths passes', () => {
  validateSource(env, source)
  for (const patch of [{ head: 'b'.repeat(40) }, { parents: 'b'.repeat(40) },
    { parents: `${EXPECTED_PARENT} ${EXPECTED_PARENT}` }, { changes: source.changes.replace('A\t', 'M\t') },
    { changes: source.changes.replace('A\t', 'R100\told\t') }, { changes: source.changes + 'A\textra\n' },
    { changes: source.changes.split('\n').slice(1).join('\n') }, { changes: source.changes + '\n' }])
    assert.throws(() => validateSource(env, { ...source, ...patch }), /INVALID_SOURCE_SCOPE/)
})

test('source gate uses bounded local git only, with no lazy fetching or inherited environment', () => {
  const seen = []
  assert.deepEqual(readSource((file, args, options) => {
    seen.push(args)
    assert.equal(file, '/usr/bin/git'); assert.equal(options.shell, false)
    assert.equal(options.maxBuffer, 16384); assert.equal(options.timeout, 10000)
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' })
    return seen.length === 1 ? source.head + '\n' : seen.length === 2 ? source.parents + '\n' : source.changes
  }), source)
  assert.deepEqual(seen, [['rev-parse', '--verify', 'HEAD'], ['show', '-s', '--format=%P', 'HEAD'],
    ['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'HEAD']])
  assert.throws(() => readSource(() => { throw new Error(privateKey) }), /^Error: INVALID_SOURCE_SCOPE$/)
})

test('finite key flags distinguish LF, CRLF, lone CR, escaped newlines, BOM and truncation', () => {
  assert.deepEqual(keyShape(privateKey), { present: true, lengthWithinBound: true,
    startsHeader: true, endsFooter: true, hasCRLF: false, hasLoneCR: false, hasBOM: false,
    hasEscapedNewline: false, strictExistingEnvelopeValid: true, trimWouldAlter: true })
  for (const [value, flag] of [[privateKey.replaceAll('\n', '\r\n'), 'hasCRLF'],
    [privateKey.replace('\n', '\r'), 'hasLoneCR'], [privateKey.replaceAll('\n', '\\n'), 'hasEscapedNewline'],
    ['\uFEFF' + privateKey, 'hasBOM']]) {
    assert.equal(keyShape(value)[flag], true)
    assert.equal(keyShape(value).strictExistingEnvelopeValid, false)
  }
  assert.equal(keyShape(privateKey.trimEnd()).strictExistingEnvelopeValid, true)
  assert.equal(keyShape(privateKey.trimEnd()).trimWouldAlter, false)
  assert.equal(keyShape(privateKey.slice(0, -20)).endsFooter, false)
  for (const value of [undefined, null, '', ' ', privateKey + '\n', privateKey.repeat(500)])
    assert.equal(keyShape(value).strictExistingEnvelopeValid, false)
  assert.equal(keyShape(privateKey.repeat(500)).lengthWithinBound, false)
})

test('envelope decisions match the existing maintenance validator without calling SSH', async () => {
  for (const value of [privateKey, privateKey.trimEnd(), privateKey.replaceAll('\n', '\r\n'),
    privateKey.replaceAll('\n', '\\n'), '\uFEFF' + privateKey, privateKey.slice(0, -20),
    privateKey + '\n', ' ', '', undefined, privateKey.repeat(500)]) {
    let reached = false
    try {
      await runSsh('status', { ...env, ORACLE_MAINTENANCE_SSH_KEY: value }, (_file, _args, _options, done) => {
        reached = true; done(null, Buffer.from('{}'))
      })
    } catch (error) { assert.equal(error.message, 'INVALID_CONFIGURATION') }
    assert.equal(keyShape(value).strictExistingEnvelopeValid, reached)
  }
})

test('local parsing has only fixed ssh-keygen arguments, bounds and sanitized environment', () => {
  assert.deepEqual(buildKeyParseInvocation('/tmp/fixture/identity'), {
    file: '/usr/bin/ssh-keygen', args: ['-y', '-P', '', '-f', '/tmp/fixture/identity'],
    options: { shell: false, encoding: 'buffer', maxBuffer: 16384, timeout: 5000,
      killSignal: 'SIGKILL', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } },
  })
  for (const value of ['', undefined, 'relative', '/tmp/x\n', '/tmp/x\0'])
    assert.throws(() => buildKeyParseInvocation(value), /INVALID_KEY_PATH/)
})

test('parser uses exact unchanged bytes and private files, erases output and cleans up every outcome', async () => {
  for (const value of [privateKey, privateKey.trimEnd()]) for (const error of [null,
    new Error('private parser details'), Object.assign(new Error('timeout'), { killed: true }),
    Object.assign(new Error('overflow'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })]) {
    let keyPath
    const stdout = Buffer.from('secret derived public key'), stderr = Buffer.from('secret diagnostic')
    assert.equal(await parseKey(value, (file, args, options, done) => {
      assert.equal(file, '/usr/bin/ssh-keygen'); assert.equal(options.env.SSH_AUTH_SOCK, undefined)
      keyPath = args.at(-1)
      Promise.all([readFile(keyPath, 'utf8'), stat(keyPath), stat(dirname(keyPath))]).then(([actual, fileInfo, dirInfo]) => {
        assert.equal(actual, value); assert.equal(fileInfo.mode & 0o777, 0o600); assert.equal(dirInfo.mode & 0o777, 0o700)
        done(error, stdout, stderr)
      }).catch(done)
    }), error ? 'invalid_or_unavailable' : 'valid')
    assert.ok(stdout.every(byte => byte === 0)); assert.ok(stderr.every(byte => byte === 0))
    await assert.rejects(access(dirname(keyPath)))
  }
  assert.equal(await parseKey(privateKey, () => { throw new Error(privateKey) }), 'invalid_or_unavailable')
  for (const output of [Buffer.alloc(0), Buffer.alloc(16385), 'private string'])
    assert.equal(await parseKey(privateKey, (_file, _args, _options, done) => done(null, output)), 'invalid_or_unavailable')
  for (const value of ['', undefined, privateKey.repeat(500), privateKey.replaceAll('\n', '\\n')])
    assert.equal(await parseKey(value, never), 'skipped_invalid_envelope')
})

test('only ASCII boundary whitespace is removed from a local copy, followed by exactly one LF', async () => {
  for (const raw of [privateKey, privateKey.trimEnd(), '  ' + privateKey + '  ', '\t' + privateKey + '\t',
    '\n\n' + privateKey + '\n\n', '\r\n \t' + privateKey + '\t \r\n']) {
    let calls = 0
    const original = raw
    const result = await collectBoundaryShape(raw, (_file, args, _options, done) => {
      calls++
      readFile(args.at(-1), 'utf8').then(value => {
        assert.equal(value, privateKey)
        done(null, Buffer.from('synthetic derived public key'))
      }).catch(done)
    })
    assert.equal(raw, original)
    assert.equal(calls, 1)
    assert.deepEqual(result, { normalizationChanged: raw !== privateKey,
      startsHeader: true, endsFooter: true, strictEnvelopeValid: true,
      parseAttempted: true, parseValid: true, parseStatus: 'valid' })
  }
})

test('boundary candidate rejects interior CRLF, NUL, Unicode, BOM, prose, truncation and oversized input', async () => {
  for (const raw of [privateKey.replaceAll('\n', '\r\n'), privateKey.replace('U1l', 'U1\0l'),
    '\u00A0' + privateKey, privateKey + '\u00A0', '\u2003' + privateKey,
    '\uFEFF' + privateKey, privateKey + '\uFEFF', 'private prose\n' + privateKey,
    privateKey + 'private prose', privateKey.slice(0, -20), privateKey.replaceAll('\n', '\\n'),
    ' ' + privateKey.replace('U1l', 'U1 l') + ' ', undefined, null, '', ' \t\r\n ',
    ' '.repeat(32769) + privateKey, privateKey.repeat(500)]) {
    const result = await collectBoundaryShape(raw, never)
    assert.equal(result.strictEnvelopeValid, false)
    assert.equal(result.parseAttempted, false)
    assert.equal(result.parseValid, false)
    assert.equal(result.parseStatus, 'skipped_invalid_envelope')
  }
})

test('raw flags are preserved while only boundary metadata reflects the local candidate', async () => {
  const raw = '\n \t' + privateKey + '\t \n'
  const report = await collectShape({ ...env, ORACLE_MAINTENANCE_SSH_KEY: raw }, parsed)
  for (const [name, value] of Object.entries(keyShape(raw))) assert.equal(report.privateKey[name], value)
  assert.equal(report.privateKey.startsHeader, false)
  assert.equal(report.privateKey.endsFooter, false)
  assert.equal(report.privateKey.parseAttempted, false)
  assert.equal(report.privateKey.boundaryASCII.startsHeader, true)
  assert.equal(report.privateKey.boundaryASCII.endsFooter, true)
  assert.equal(report.privateKey.boundaryASCII.strictEnvelopeValid, true)
  assert.equal(report.privateKey.boundaryASCII.parseValid, true)
  const failed = await collectBoundaryShape(raw, (_file, _args, _options, done) => done(new Error(raw), Buffer.from('private output')))
  assert.equal(failed.strictEnvelopeValid, true)
  assert.equal(failed.parseValid, false)
  assert.equal(failed.parseStatus, 'invalid_or_unavailable')
  assert.equal(JSON.stringify(report).includes(raw), false)
  assert.equal(JSON.stringify(report).includes(privateKey), false)
})

test('all three inputs are classified independently, including missing and swapped mappings', async () => {
  const report = await collectShape(env, parsed)
  assert.deepEqual(report.mapping, { hostMapped: true, knownHostsMapped: true, sshKeyMapped: true })
  assert.deepEqual(report.host, { present: true, valid: true, exactExpected: true })
  assert.deepEqual(report.knownHosts, { present: true, valid: true, matchesMappedHost: true, exactTrustedCanonical: false })
  assert.equal(report.privateKey.parseValid, true)
  const missing = await collectShape({}, never)
  assert.deepEqual(missing.mapping, { hostMapped: false, knownHostsMapped: false, sshKeyMapped: false })
  assert.equal(missing.privateKey.parseStatus, 'skipped_invalid_envelope')
  assert.equal(missing.host.valid, false); assert.equal(missing.knownHosts.valid, false)
  const wrongHost = await collectShape({ ...env, ORACLE_MAINTENANCE_HOST: 'invalid' }, parsed)
  assert.equal(wrongHost.host.valid, false); assert.equal(wrongHost.knownHosts.valid, true)
  assert.equal(wrongHost.knownHosts.matchesMappedHost, false); assert.equal(wrongHost.privateKey.parseValid, true)
  const swapped = await collectShape({ ...env, ORACLE_MAINTENANCE_KNOWN_HOSTS: privateKey, ORACLE_MAINTENANCE_SSH_KEY: knownHosts }, never)
  assert.equal(swapped.knownHosts.valid, false); assert.equal(swapped.privateKey.strictExistingEnvelopeValid, false)
  const empty = await collectShape({ ORACLE_MAINTENANCE_HOST: '', ORACLE_MAINTENANCE_KNOWN_HOSTS: '', ORACLE_MAINTENANCE_SSH_KEY: '' }, never)
  assert.equal(empty.mapping.hostMapped, true); assert.equal(empty.host.present, false)
})

test('trusted comparison hashes only algorithm, public key blob and LF, excluding the host', async () => {
  // Public host key independently matched to the owner-provided checksum.
  const trusted = "141.148.242.30 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDIPkvNqxvqDEL80cKV6NBb1F2vB/sy7p5KXb4rOBgVIsDKSpGruQCjGTNgxBUJJGBe08p7vlSYSXueUMHHZWonx4NRT9UNlAPpZ/mAY+Kfwmpipbt8ZjUsRWYwXzE1WCvKCcxWsZgpuFP4FNMq9iiNRXyLlt0MLQOnwSjDl9YmttMbCdcvIPphZYk6iYs+Q142EGHlf2efAvduh2ZVnhd0a0d4/x5xpCr2pP75vABdwItwwQrPFKeh7sdnR8wKB2QTzlRkV96GlKLD0ZpmJZsFHE0c7SNhbh7fBOrTLiEUOF2oOTdO67s89xaV+VMFZp7mmELB9usAuHKl1jN5XxWnzZyl07Gx0BnFYLtJoppxLr1b+ZrKnHVUkenZsh4xVxeJX3z2OQ2xmyc+B2q+yRz+hCM1FxQDrnm+m6RjtAOkZpMcEZ9+tXPJhYzNaUegscfOZaVOfeNYaZUPZopOFc5K8lMdr7M2EMYrdlg13q/vmnjqge8qYvOZ36eSvUn7w3s=\n"
  for (const line of [trusted, trusted.trimEnd()]) {
    const report = await collectShape({ ...env, ORACLE_MAINTENANCE_KNOWN_HOSTS: line }, parsed)
    assert.equal(report.knownHosts.valid, true)
    assert.equal(report.knownHosts.matchesMappedHost, true)
    assert.equal(report.knownHosts.exactTrustedCanonical, true)
  }
  const altered = trusted.replace('ssh-rsa ', 'ssh-ed25519 ')
  const report = await collectShape({ ...env, ORACLE_MAINTENANCE_KNOWN_HOSTS: altered }, parsed)
  assert.equal(report.knownHosts.valid, false)
  assert.equal(report.knownHosts.exactTrustedCanonical, false)
})

test('report contains only fixed schema/category strings and booleans; unchanged encryption round-trips them', async () => {
  const report = await collectShape(env, parsed)
  for (const part of [report.mapping, report.host, report.knownHosts, report.privateKey, report.privateKey.boundaryASCII])
    for (const [name, value] of Object.entries(part))
      assert.ok(typeof value === 'boolean' || name === 'parseStatus' && value === 'valid' || name === 'boundaryASCII' && value === report.privateKey.boundaryASCII)
  const plain = JSON.stringify(report)
  for (const value of [privateKey, knownKey, EXPECTED_HOST, 'secret derived public key', 'secret diagnostic']) assert.equal(plain.includes(value), false)
  // Ephemeral synthetic RSA recipient is for this encryption test only; it is never deployed.
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const envelope = encryptReport(report, pair.publicKey.export({ type: 'spki', format: 'pem' }))
  const key = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'))
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
    cipher.setAAD(Buffer.from(envelope.aad, 'base64')); cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    assert.deepEqual(JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString()), report)
  } finally { key.fill(0) }
  assert.equal(JSON.stringify(envelope).includes('configuration-shape'), false)
})

test('invalid mode, context, source and recipient fail before any secret read or parsing', async () => {
  const guarded = { ...env }
  for (const name of ['ORACLE_MAINTENANCE_HOST', 'ORACLE_MAINTENANCE_KNOWN_HOSTS', 'ORACLE_MAINTENANCE_SSH_KEY'])
    Object.defineProperty(guarded, name, { get: never })
  const log = []
  const base = { args: ['--classify'], env: guarded, now, source: () => source, execute: never, persist: never, log: line => log.push(line) }
  assert.equal(await main({ ...base, args: ['--gate'], readRecipient: never }), 0)
  assert.equal(log.pop(), 'CONFIGURATION_SHAPE_SCOPE_VALID')
  for (const patch of [{ args: [] }, { args: ['--classify', 'extra'] }, { args: ['--unknown'] },
    { now: Date.parse(EXPIRES_AT) }, { source: () => ({ ...source, parents: 'f'.repeat(40) }) },
    { source: () => { throw new Error(privateKey) } }]) {
    assert.equal(await main({ ...base, readRecipient: never, ...patch }), 1)
    assert.equal(log.pop(), 'CONFIGURATION_SHAPE_FAILED_DETAILS_SUPPRESSED')
  }
  for (const pem of ['wrong recipient', (await readFile(recipientPath, 'utf8')) + '\n']) {
    assert.equal(await main({ ...base, readRecipient: () => pem }), 1)
    assert.equal(log.pop(), 'CONFIGURATION_SHAPE_FAILED_DETAILS_SUPPRESSED')
  }
})

test('main persists only a ciphertext envelope and emits fixed success regardless of classifications', async () => {
  for (const patch of [{}, { ORACLE_MAINTENANCE_SSH_KEY: 'invalid' }, { ORACLE_MAINTENANCE_HOST: 'invalid' }]) {
    const logs = [], saved = []
    assert.equal(await main({ args: ['--classify'], env: { ...env, ...patch }, now, source: () => source,
      readRecipient: () => readFile(recipientPath, 'utf8'), execute: parsed,
      persist: value => saved.push(value), log: line => logs.push(line) }), 0)
    assert.deepEqual(logs, ['ENCRYPTED_CONFIGURATION_SHAPE_EVIDENCE_READY'])
    assert.equal(saved.length, 1); assert.equal(saved[0].schema, 'worldifact-encrypted-report-v1')
    assert.deepEqual(Object.keys(saved[0]), ['schema', 'cipher', 'wrapping', 'aad', 'iv', 'tag', 'wrappedKey', 'ciphertext'])
    const published = JSON.stringify({ logs, saved })
    for (const value of [privateKey, knownKey, EXPECTED_HOST, 'privateKey', 'configuration-shape']) assert.equal(published.includes(value), false)
  }
  const logs = []
  assert.equal(await main({ args: ['--classify'], env, now, source: () => source,
    readRecipient: () => readFile(recipientPath, 'utf8'), execute: parsed,
    persist: () => { throw new Error(privateKey) }, log: line => logs.push(line) }), 1)
  assert.deepEqual(logs, ['CONFIGURATION_SHAPE_FAILED_DETAILS_SUPPRESSED'])
})

test('workflow gates Production first, rechecks at execution, maps exactly three secrets and uploads one ciphertext', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oracle-config-boundary-once.yml', import.meta.url), 'utf8')
  assert.match(workflow, /on:\n  push:\n    branches: \[diagnostics\/oracle-config-boundary-20261008\]/)
  assert.doesNotMatch(workflow, /workflow_dispatch:|workflow_run:|pull_request:|secrets: inherit|npm |wrangler|ssh-keyscan/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /needs: offline-scope/)
  assert.match(workflow, /name: Production\n      deployment: false/)
  assert.equal((workflow.match(/github\.run_attempt == 1/g) ?? []).length, 2)
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2)
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]),
    ['ORACLE_MAINTENANCE_HOST', 'ORACLE_MAINTENANCE_KNOWN_HOSTS', 'ORACLE_MAINTENANCE_SSH_KEY'])
  for (const name of ['HOST', 'KNOWN_HOSTS', 'SSH_KEY'])
    assert.ok(workflow.includes(`ORACLE_MAINTENANCE_${name}: \${{ secrets.ORACLE_MAINTENANCE_${name} }}`))
  const gate = workflow.split('  configuration-shape:')[0]
  assert.equal(gate.includes('environment:'), false); assert.equal(gate.includes('secrets.'), false)
  assert.match(gate, /run: node scripts\/oracle-config-boundary-once\.mjs --gate/)
  assert.match(workflow, /run: node scripts\/oracle-config-boundary-once\.mjs --classify/)
  assert.match(workflow, /path: \.oracle-config-boundary-encrypted\/report\.enc\.json\n/)
  assert.match(workflow, /retention-days: 1/)
  const script = await readFile(new URL('../scripts/oracle-config-boundary-once.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(script, /runSsh|probeReachability|ssh-keyscan|fetch\(|createConnection|https?:/)
  assert.match(script, /encryptReport, validateHost, validateKnownHosts/)
  const release = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  assert.match(release, /push:\n    branches: \[main\]/)
})
