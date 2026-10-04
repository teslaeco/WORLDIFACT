import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE_COMMIT = '8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc'
export const MARKER_PATH = 'ops/PIPELINE_ONLY_RELEASE_20261004.json'
export const MARKER_CONTENT = JSON.stringify({
  release: 'generation-pipeline-recovery-20261004',
  baseCommit: BASE_COMMIT,
  preserveBilling: true,
}, null, 2) + '\n'
export const REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/STUDIO_GENERATION_LIFECYCLE.md',
  MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/studio.ts',
  'src/lib/studioClient.ts',
  'src/lib/studioProtocol.ts',
  'tests/character-studio-lifecycle.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/studio-client.test.ts',
  'tests/studio-priced-submission.test.ts',
].sort())

function refuse() { throw new Error('PIPELINE_RELEASE_SCOPE_NOT_VERIFIED') }
function git(cwd, args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd, encoding: 'utf8', shell: false, timeout: 15000, maxBuffer: 1024 * 1024,
    // The selector needs local Git objects only, never deployment credentials.
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error || result.status !== 0) refuse()
  return result.stdout
}
function commit(cwd, revision, readGit) {
  const oid = readGit(cwd, ['rev-parse', '--verify', '--end-of-options', revision]).trim()
  if (!/^[0-9a-f]{40}$/.test(oid)) refuse()
  return oid
}

/** Only this marker's addition at its reviewed parent selects billing preservation.
 * Its continued presence never changes the behavior of later ordinary releases.
 * Missing history or any marker modification/deletion stops before secret setup.
 */
export function selectPipelineOnlyRelease(cwd = process.cwd(), readGit = git) {
  const head = commit(cwd, 'HEAD^{commit}', readGit)
  const parent = commit(cwd, `${head}^1^{commit}`, readGit)
  const raw = readGit(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', parent, head, '--'])
  const fields = raw.split('\0')
  if (fields.pop() !== '' || fields.length % 2) refuse()
  const changes = []
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index], path = fields[index + 1]
    if (!/^[AMDT]$/.test(status) || !path) refuse()
    changes.push({ status, path })
  }
  const marker = changes.find(change => change.path === MARKER_PATH)
  if (!marker) {
    if (parent === BASE_COMMIT || changes.some(change => change.status === 'A' && change.path === 'scripts/select-pipeline-only-release.mjs')) refuse()
    return false
  }
  if (marker.status !== 'A' || parent !== BASE_COMMIT) refuse()
  if (changes.some(change => !['A', 'M'].includes(change.status)) ||
      JSON.stringify(changes.map(change => change.path).sort()) !== JSON.stringify(REVIEWED_PATHS)) refuse()
  const entry = readGit(cwd, ['ls-tree', '-z', head, '--', MARKER_PATH])
  const match = /^100644 blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry)
  if (!match || match[2] !== MARKER_PATH) refuse()
  if (readGit(cwd, ['cat-file', 'blob', match[1]]) !== MARKER_CONTENT) refuse()
  return true
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) refuse()
    console.log(`preserve_billing=${selectPipelineOnlyRelease()}`)
  } catch {
    console.error('PIPELINE_RELEASE_SCOPE_NOT_VERIFIED: publication stopped before credential setup; verify the reviewed parent, paths and one-time marker. No secret values were read.')
    process.exitCode = 1
  }
}
