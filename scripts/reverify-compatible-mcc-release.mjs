import { spawnSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCompatibleMccAssets } from './check-compatible-mcc-release.mjs'

export const VERIFIED_SOURCE_COMMIT = 'e301b3989caf0bd2fcfe3a0e1ab65bd2b95ceb6d'
export const VERIFICATION_PATHS = Object.freeze([
  '.github/workflows/reverify-compatible-mcc.yml',
  'scripts/check-compatible-mcc-release.mjs',
  'scripts/reverify-compatible-mcc-release.mjs',
  'tests/compatible-mcc-release.test.mjs',
].sort())
const origin = 'https://worldifact.xodobrox.workers.dev'
const mainRef = 'https://api.github.com/repos/teslaeco/WORLDIFACT/git/ref/heads/main'
function requireCheck(condition, message) { if (!condition) throw new Error(message) }
function git(cwd, args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd, encoding: 'utf8', shell: false, timeout: 15000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  requireCheck(!result.error && result.status === 0, 'Source-scope Git evidence unavailable.')
  return result.stdout
}
/** The isolated verification commit may change these four non-runtime files only. */
export function verifyCompatibleMccSourceScope(cwd = process.cwd(), readGit = git) {
  const head = readGit(cwd, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim()
  requireCheck(/^[0-9a-f]{40}$/.test(head), 'Invalid verification head.')
  requireCheck(readGit(cwd, ['rev-list', '--parents', '-n', '1', head]).trim() === `${head} ${VERIFIED_SOURCE_COMMIT}`, 'Verification requires the exact deployed source as its sole parent.')
  const raw = readGit(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', VERIFIED_SOURCE_COMMIT, head, '--'])
  const fields = raw.split('\0')
  requireCheck(fields.pop() === '' && fields.length === VERIFICATION_PATHS.length * 2, 'Verification file scope changed.')
  const changes = []
  for (let i = 0; i < fields.length; i += 2) {
    const expectedStatus = ['.github/workflows/reverify-compatible-mcc.yml', 'scripts/reverify-compatible-mcc-release.mjs'].includes(fields[i + 1]) ? 'A' : 'M'
    requireCheck(fields[i] === expectedStatus, 'Verification change type is not reviewed.')
    changes.push(fields[i + 1])
  }
  requireCheck(JSON.stringify(changes.sort()) === JSON.stringify(VERIFICATION_PATHS), 'Verification changed a runtime or unreviewed file.')
  const entries = readGit(cwd, ['ls-tree', '-z', head, '--', ...VERIFICATION_PATHS]).split('\0')
  requireCheck(entries.pop() === '' && entries.length === VERIFICATION_PATHS.length, 'Verification tree is incomplete.')
  requireCheck(JSON.stringify(entries.map(entry => {
    const match = /^100644 blob [0-9a-f]{40}\t(.+)$/.exec(entry)
    requireCheck(match, 'Verification files must be regular non-executable blobs.')
    return match[1]
  }).sort()) === JSON.stringify(VERIFICATION_PATHS), 'Verification tree paths changed.')
  requireCheck(readGit(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', head, '--']).trim() === '', 'Tracked files changed after the verification commit.')
  return { sourceCommit: VERIFIED_SOURCE_COMMIT, verificationCommit: head }
}
export async function verifyCurrentCompatibleMccSource(fetcher = fetch) {
  const response = await fetcher(mainRef, { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json' } })
  requireCheck(response.status === 200 && response.headers.get('content-type')?.includes('application/json'), 'Public source reference is unavailable.')
  const ref = await response.json()
  requireCheck(ref.ref === 'refs/heads/main' && ref.object?.type === 'commit' && ref.object.sha === VERIFIED_SOURCE_COMMIT, 'Main changed since the deployed source was reviewed; stop read-only verification.')
}
export async function reverifyCompatibleMccSource({ cwd = process.cwd(), readGit = git, fetcher = fetch, dist = 'dist', retryDelaysMs } = {}) {
  const source = verifyCompatibleMccSourceScope(cwd, readGit)
  await verifyCurrentCompatibleMccSource(fetcher)
  const assets = await checkCompatibleMccAssets(origin, { dist, fetcher, retryDelaysMs })
  await verifyCurrentCompatibleMccSource(fetcher)
  return { ...assets, ...source, evidenceMode: 'source-commit-comparison', deploymentReceipt: 'unavailable' }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stage = 'arguments'
  try {
    requireCheck(process.argv.length === 3 && ['--scope', '--verify'].includes(process.argv[2]), 'Use --scope or --verify.')
    stage = 'pinned source scope'
    verifyCompatibleMccSourceScope()
    if (process.argv[2] === '--scope') {
      await verifyCurrentCompatibleMccSource()
      console.log(`PASS: exact source ${VERIFIED_SOURCE_COMMIT}; four verifier-only files, no runtime changes.`)
    } else {
      stage = 'GET-only source and static asset comparison'
      const result = await reverifyCompatibleMccSource()
      console.log(JSON.stringify(result, null, 2))
      console.log('PASS: read-only source-commit comparison. Original Cloudflare version receipt unavailable; no deployment version is asserted. No deployment, credentials, financial probes or generation requests.')
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
        `## Read-only subscription upgrade source verification\n\nSource commit: \`${result.sourceCommit}\`\n\nMatched ${result.htmlRoutes} HTML routes and ${result.verifiedAssets} built files using GET-only checks. Main remained pinned before and after verification. Original Cloudflare version receipt was not retained; this is a source-commit comparison, not deployment-version verification. No runtime mutation, financial probe or generation request occurred.\n`)
    }
  } catch (error) {
    // Only local paths and fixed validation errors are reported; no secrets are accepted.
    console.error(`READONLY_REVERIFICATION_FAILED (${stage}): ${error instanceof Error ? error.message : 'Unknown validation failure.'}`)
    process.exitCode = 1
  }
}
