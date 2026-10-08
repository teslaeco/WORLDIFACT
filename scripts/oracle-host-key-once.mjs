import { execFile, execFileSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_PARENT = '3f6d7fcfd4cef8183b05fd1ff29176eec887cca4'
export const EXPECTED_REF = 'refs/heads/diagnostics/oracle-public-host-key-20261008'
export const EXPECTED_HOST = '141.148.242.30'
export const EXPIRES_AT = '2026-10-09T00:00:00Z'
export const ADDED_PATHS = Object.freeze([
  '.github/workflows/oracle-host-key-once.yml',
  'scripts/oracle-host-key-once.mjs',
  'tests/oracle-host-key-once.test.mjs',
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

export function buildKeyscanInvocation(host) {
  if (host !== EXPECTED_HOST) fail('INVALID_HOST')
  return {
    file: '/usr/bin/ssh-keyscan', args: ['-4', '-T', '10', '-p', '22', '-t', 'rsa', host],
    options: { shell: false, encoding: 'buffer', maxBuffer: LIMIT, timeout: 15_000,
      killSignal: 'SIGKILL', env: { ...CHILD_ENV } },
  }
}

// This is untrusted network evidence, never input to an authenticated connection.
export function parsePublicHostKey(stdout, host) {
  if (host !== EXPECTED_HOST) fail('INVALID_HOST')
  if (!Buffer.isBuffer(stdout) || stdout.length === 0 || stdout.length > LIMIT) fail('INVALID_PUBLIC_KEY')
  const line = stdout.toString('ascii')
  if (!Buffer.from(line, 'ascii').equals(stdout)) fail('INVALID_PUBLIC_KEY')
  const match = line.match(/^([^\s]+) ssh-rsa ([A-Za-z0-9+/]+={0,2})\n?$/)
  if (!match || match[1] !== host) fail('INVALID_PUBLIC_KEY')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.toString('base64') !== match[2]) fail('INVALID_PUBLIC_KEY')
  let offset = 0
  const field = () => {
    if (offset + 4 > bytes.length) fail('INVALID_PUBLIC_KEY')
    const length = bytes.readUInt32BE(offset); offset += 4
    if (!length || offset + length > bytes.length) fail('INVALID_PUBLIC_KEY')
    const value = bytes.subarray(offset, offset + length); offset += length
    return value
  }
  if (!field().equals(Buffer.from('ssh-rsa'))) fail('INVALID_PUBLIC_KEY')
  const positiveInteger = value => {
    if (value[0] >= 128 || value[0] === 0 && (value.length === 1 || value[1] < 128)) fail('INVALID_PUBLIC_KEY')
    return value[0] === 0 ? value.subarray(1) : value
  }
  const exponent = positiveInteger(field()), modulus = positiveInteger(field())
  const bits = modulus.length * 8 - Math.clz32(modulus[0]) + 24
  if (offset !== bytes.length || exponent.length > 8 || exponent.at(-1) % 2 !== 1 ||
      exponent.length === 1 && exponent[0] < 3 || modulus.at(-1) % 2 !== 1 ||
      bits < 2048 || bits > 8192) fail('INVALID_PUBLIC_KEY')
  try {
    createPublicKey({ format: 'jwk', key: { kty: 'RSA', e: exponent.toString('base64url'), n: modulus.toString('base64url') } })
  } catch { fail('INVALID_PUBLIC_KEY') }
  const publicKey = `ssh-rsa ${match[2]}\n`
  return { publicKey, lineSha256: createHash('sha256').update(publicKey).digest('hex') }
}

export async function collectPublicHostKey(host, execute = execFile) {
  const invocation = buildKeyscanInvocation(host)
  const stdout = await new Promise((accept, reject) => {
    try {
      execute(invocation.file, invocation.args, invocation.options, (error, output) => {
        if (error) return reject(new Error('KEYSCAN_FAILED'))
        accept(output)
      })
    } catch { reject(new Error('KEYSCAN_FAILED')) }
  })
  return parsePublicHostKey(stdout, host)
}

export async function main({ args = process.argv.slice(2), env = process.env, now = Date.now(),
  source = readSource, execute = execFile, log = console.log } = {}) {
  try {
    if (args.length !== 1 || !['--gate', '--scan'].includes(args[0])) fail('INVALID_MODE')
    validateContext(env, now)
    validateSource(env, source())
    if (args[0] === '--gate') {
      log('PASS: exact one-shot source scope; no network connection made.')
      return 0
    }
    const result = await collectPublicHostKey(env.ORACLE_MAINTENANCE_HOST, execute)
    log(`UNTRUSTED_PUBLIC_HOST_KEY ${result.publicKey.trimEnd()}`)
    log(`UNTRUSTED_PUBLIC_KEY_LINE_SHA256 ${result.lineSha256}`)
    log('Untrusted public evidence only. The SHA256 covers the algorithm, space, base64 blob and LF. No authentication or trust configuration was changed.')
    return 0
  } catch {
    // Never print a scanner banner, address, stderr, command, or raw exception.
    log('PUBLIC_HOST_KEY_COLLECTION_REFUSED')
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
