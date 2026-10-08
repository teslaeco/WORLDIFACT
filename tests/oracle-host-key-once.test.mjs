import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ADDED_PATHS, EXPECTED_HOST, EXPECTED_PARENT, EXPECTED_REF, EXPIRES_AT,
  buildKeyscanInvocation, collectPublicHostKey, main, parsePublicHostKey, readSource,
  validateContext, validateSource } from '../scripts/oracle-host-key-once.mjs'

// Every scanner is a fixture. Tests never connect to any address.
const now = Date.parse('2026-10-08T21:00:00Z')
const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: EXPECTED_REF,
  GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
  ORACLE_MAINTENANCE_HOST: EXPECTED_HOST }
const source = { head: env.GITHUB_SHA, parents: EXPECTED_PARENT,
  changes: ADDED_PATHS.map(path => `A\t${path}\n`).join('') }
const field = value => { const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]) }
const modulus = bits => Buffer.concat([Buffer.of(0), Buffer.alloc(bits / 8, 255)])
const wire = (bits = 2048, exponent = Buffer.of(1, 0, 1), n = modulus(bits), algorithm = 'ssh-rsa') =>
  Buffer.concat([field(algorithm), field(exponent), field(n)])
const output = (bytes = wire()) => Buffer.from(`${EXPECTED_HOST} ssh-rsa ${bytes.toString('base64')}\n`)
const never = () => assert.fail('Unexpected process or network access')

test('only the one repository, branch, push attempt and bounded date are admitted', () => {
  validateContext(env, now)
  for (const patch of [{ GITHUB_REPOSITORY: 'attacker/WORLDIFACT' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ATTEMPT: 1 }, { GITHUB_SHA: '' },
    { GITHUB_SHA: 'a'.repeat(40) + '\n' }, { GITHUB_SHA: '0'.repeat(40) }])
    assert.throws(() => validateContext({ ...env, ...patch }, now), /INVALID_CONTEXT/)
  for (const time of [NaN, Infinity, Date.parse('2026-10-07T23:59:59Z'), Date.parse(EXPIRES_AT), Date.parse(EXPIRES_AT) + 1])
    assert.throws(() => validateContext(env, time), /INVALID_CONTEXT/)
})

test('the source must be one commit on the frozen parent adding exactly three files', () => {
  validateSource(env, source)
  for (const patch of [{ head: 'b'.repeat(40) }, { parents: 'b'.repeat(40) },
    { parents: `${EXPECTED_PARENT} ${EXPECTED_PARENT}` }, { changes: source.changes.replace('A\t', 'M\t') },
    { changes: source.changes.replace('A\t', 'R100\told\t') }, { changes: source.changes + 'A\textra\n' },
    { changes: source.changes.split('\n').slice(1).join('\n') }, { changes: source.changes + '\n' }])
    assert.throws(() => validateSource(env, { ...source, ...patch }), /INVALID_SOURCE_SCOPE/)
})

test('source reads use only local bounded git operations and sanitized environment', () => {
  const seen = []
  const result = readSource((file, args, options) => {
    seen.push(args)
    assert.equal(file, '/usr/bin/git'); assert.equal(options.shell, false)
    assert.equal(options.maxBuffer, 16384); assert.equal(options.timeout, 10000)
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' })
    return seen.length === 1 ? source.head + '\n' : seen.length === 2 ? source.parents + '\n' : source.changes
  })
  assert.deepEqual(result, source)
  assert.deepEqual(seen, [['rev-parse', '--verify', 'HEAD'], ['show', '-s', '--format=%P', 'HEAD'],
    ['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'HEAD']])
  assert.throws(() => readSource(() => { throw new Error('private diagnostic') }), /^Error: INVALID_SOURCE_SCOPE$/)
})

test('scanner has fixed host, RSA, IPv4, port and bounds with no authentication arguments or inherited environment', () => {
  assert.deepEqual(buildKeyscanInvocation(EXPECTED_HOST), {
    file: '/usr/bin/ssh-keyscan', args: ['-4', '-T', '10', '-p', '22', '-t', 'rsa', EXPECTED_HOST],
    options: { shell: false, encoding: 'buffer', maxBuffer: 16384, timeout: 15000,
      killSignal: 'SIGKILL', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } },
  })
  for (const host of ['', undefined, 'localhost', '127.0.0.1', '169.254.169.254', '1.1.1.1',
    EXPECTED_HOST + '\n', EXPECTED_HOST + ':22', `user@${EXPECTED_HOST}`, '-f /tmp/key', `${EXPECTED_HOST} 1.1.1.1`, `[${EXPECTED_HOST}]:22`])
    assert.throws(() => buildKeyscanInvocation(host), /^Error: INVALID_HOST$/)
})

test('canonical single RSA key is returned without the address and with the exact requested line digest', () => {
  for (const bits of [2048, 3072, 8192]) {
    const result = parsePublicHostKey(output(wire(bits)), EXPECTED_HOST)
    const expectedLine = `ssh-rsa ${wire(bits).toString('base64')}\n`
    assert.deepEqual(result, { publicKey: expectedLine, lineSha256: createHash('sha256').update(expectedLine).digest('hex') })
    assert.equal(JSON.stringify(result).includes(EXPECTED_HOST), false)
  }
  assert.deepEqual(parsePublicHostKey(Buffer.from(output().toString().trimEnd()), EXPECTED_HOST), parsePublicHostKey(output(), EXPECTED_HOST))
  parsePublicHostKey(output(wire(2048, Buffer.of(0, 129))), EXPECTED_HOST)
})

test('malformed, duplicate, foreign, truncated, noncanonical or weak public keys are refused', () => {
  const valid = output().toString()
  for (const bad of [Buffer.alloc(0), Buffer.alloc(16385), valid, Buffer.from(valid + valid), Buffer.from(valid + '\n'),
    Buffer.from('# banner\n' + valid), Buffer.from(valid.replace(EXPECTED_HOST, '1.1.1.1')),
    Buffer.from(valid.replace(EXPECTED_HOST, `[${EXPECTED_HOST}]:22`)), Buffer.from(valid.replace('ssh-rsa ', 'ssh-ed25519 ')),
    Buffer.from(valid.trimEnd() + ' comment\n'), Buffer.from(valid.replace('\n', '\r\n')),
    output(Buffer.concat([wire(), Buffer.of(0)])), output(wire().subarray(0, -1)),
    output(wire(1024)), output(wire(8200)), output(wire(2048, Buffer.of(1))), output(wire(2048, Buffer.of(2))),
    output(wire(2048, Buffer.of(0, 3))), output(wire(2048, Buffer.of(255))), output(wire(2048, Buffer.alloc(9, 1))),
    output(wire(2048, Buffer.of(1, 0, 1), Buffer.alloc(256, 255))),
    output(wire(2048, Buffer.of(1, 0, 1), Buffer.concat([Buffer.of(0, 0), modulus(2048)]))),
    output(wire(2048, Buffer.of(1, 0, 1), Buffer.of(0))),
    output(wire(2048, Buffer.of(1, 0, 1), Buffer.concat([modulus(2048).subarray(0, -1), Buffer.of(254)]))),
    output(wire(2048, Buffer.of(1, 0, 1), modulus(2048), 'ssh-ed25519')),
    Buffer.from(`${EXPECTED_HOST} ssh-rsa !!!!\n`), Buffer.from(`${EXPECTED_HOST} ssh-rsa YQ==\n`),
    Buffer.from(valid.trimEnd() + '=\n'), Buffer.concat([output().subarray(0, -1), Buffer.of(255)])])
    assert.throws(() => parsePublicHostKey(bad, EXPECTED_HOST), /INVALID_PUBLIC_KEY/)
  assert.throws(() => parsePublicHostKey(output(), '1.1.1.1'), /INVALID_HOST/)
})

test('scanner runs once and rejects timeout, transport failure, buffer overrun and unsafe stdout without leaking stderr', async () => {
  for (const error of [Object.assign(new Error('private'), { code: 1 }), Object.assign(new Error('private'), { killed: true, signal: 'SIGKILL' }),
    Object.assign(new Error('private'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })]) {
    let calls = 0
    await assert.rejects(collectPublicHostKey(EXPECTED_HOST, (_file, _args, _options, done) => {
      calls++; done(error, output(), Buffer.from('secret stderr'))
    }), /^Error: KEYSCAN_FAILED$/)
    assert.equal(calls, 1)
  }
  await assert.rejects(collectPublicHostKey(EXPECTED_HOST, () => { throw new Error('private') }), /^Error: KEYSCAN_FAILED$/)
  await assert.rejects(collectPublicHostKey(EXPECTED_HOST, (_file, _args, _options, done) => done(null, Buffer.alloc(16385))), /INVALID_PUBLIC_KEY/)
  const result = await collectPublicHostKey(EXPECTED_HOST, (_file, _args, _options, done) => done(null, output(), Buffer.from('ignored banner')))
  assert.deepEqual(result, parsePublicHostKey(output(), EXPECTED_HOST))
})

test('gate is offline and every invalid mode, context, scope or host fails before scan', async () => {
  const log = []
  const options = { args: ['--gate'], env, now, source: () => source, execute: never, log: line => log.push(line) }
  assert.equal(await main(options), 0)
  for (const patch of [{ args: [] }, { args: ['--scan', 'extra'] }, { args: ['--unknown'] },
    { args: ['--scan'], now: Date.parse(EXPIRES_AT) }, { env: { ...env, GITHUB_RUN_ATTEMPT: '2' } },
    { source: () => ({ ...source, parents: 'f'.repeat(40) }) },
    { args: ['--scan'], env: { ...env, ORACLE_MAINTENANCE_HOST: 'malformed' } }]) {
    assert.equal(await main({ ...options, ...patch }), 1)
    assert.equal(log.at(-1), 'PUBLIC_HOST_KEY_COLLECTION_REFUSED')
  }
})

test('successful CLI emits only untrusted public evidence; failures never disclose errors, banners or the host', async () => {
  for (const error of [null, new Error(`sensitive ${EXPECTED_HOST}`)]) {
    const log = []
    const result = await main({ args: ['--scan'], env, now, source: () => source,
      execute: (_file, _args, _options, done) => done(error, output(), Buffer.from('private banner')),
      log: line => log.push(line) })
    assert.equal(result, error ? 1 : 0)
    assert.doesNotMatch(log.join('\n'), /sensitive|private banner|141\.148\.242\.30/)
    if (!error) { assert.match(log[0], /^UNTRUSTED_PUBLIC_HOST_KEY ssh-rsa /); assert.match(log[1], /^UNTRUSTED_PUBLIC_KEY_LINE_SHA256 [a-f0-9]{64}$/) }
  }
})

test('workflow admits Production only after offline gate and maps only the existing host secret', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oracle-host-key-once.yml', import.meta.url), 'utf8')
  assert.match(workflow, /on:\n  push:\n    branches: \[diagnostics\/oracle-public-host-key-20261008\]/)
  assert.doesNotMatch(workflow, /workflow_dispatch:|workflow_run:|pull_request:|secrets: inherit|npm |wrangler|ssh-keygen|known_hosts/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /needs: offline-scope/)
  assert.match(workflow, /name: Production\n      deployment: false/)
  assert.equal((workflow.match(/github\.run_attempt == 1/g) ?? []).length, 2)
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2)
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]), ['ORACLE_MAINTENANCE_HOST'])
  assert.equal(workflow.split('  public-host-key:')[0].includes('environment:'), false)
  const release = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  assert.match(release, /push:\n    branches: \[main\]/)
  assert.match(release, /github\.ref == 'refs\/heads\/main'/)
})
