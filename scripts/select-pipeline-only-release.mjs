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

export const FUNDING_BASE_COMMIT = '72c5ddf9d00f4049f79c55d503a6b6833ccaa1da'
export const FUNDING_MARKER_PATH = 'ops/FUNDING_INSPECTION_RELEASE_20261004.json'
export const FUNDING_MARKER_CONTENT = JSON.stringify({
  release: 'generation-funding-inspection-20261004',
  baseCommit: FUNDING_BASE_COMMIT,
  preserveBilling: true,
}, null, 2) + '\n'
export const FUNDING_REVIEWED_PATHS = Object.freeze([
  'docs/GENERATOR_UI_RESTORATION_20261004.md',
  FUNDING_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/main.tsx',
  'src/pages/GenerationFundingPage.css',
  'src/pages/GenerationFundingPage.tsx',
  'src/pages/ShopPage.tsx',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-render-helper.mjs',
].sort())
export const SESSION_DRAFT_BASE_COMMIT = '177c71098e9ccca3e18bedb505f2dd9932a9aab8'
export const SESSION_DRAFT_MARKER_PATH = 'ops/SESSION_DRAFT_RELEASE_20261005.json'
export const SESSION_DRAFT_MARKER_CONTENT = JSON.stringify({
  release: 'shop-session-draft-persistence-20261005',
  baseCommit: SESSION_DRAFT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const SESSION_DRAFT_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  SESSION_DRAFT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'src/lib/account.tsx',
  'src/lib/shopSessionDraft.ts',
  'src/pages/ShopPage.tsx',
  'tests/account-session-draft-lifecycle.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-render-helper.mjs',
  'tests/shop-session-draft.test.ts',
].sort())
const sessionDraftIntroductions = new Set([
  'src/lib/shopSessionDraft.ts',
  'tests/account-session-draft-lifecycle.test.mjs',
  'tests/shop-session-draft.test.ts',
])
const fundingIntroductions = new Set([
  'docs/GENERATOR_UI_RESTORATION_20261004.md',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/pages/GenerationFundingPage.css',
  'src/pages/GenerationFundingPage.tsx',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
])
const scopes = [
  { base: BASE_COMMIT, marker: MARKER_PATH, content: MARKER_CONTENT, paths: REVIEWED_PATHS },
  { base: FUNDING_BASE_COMMIT, marker: FUNDING_MARKER_PATH, content: FUNDING_MARKER_CONTENT, paths: FUNDING_REVIEWED_PATHS },
  { base: SESSION_DRAFT_BASE_COMMIT, marker: SESSION_DRAFT_MARKER_PATH, content: SESSION_DRAFT_MARKER_CONTENT, paths: SESSION_DRAFT_REVIEWED_PATHS, preserveRemoteVars: true },
]

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

/** Only a fixed scope's marker addition at its reviewed parent preserves billing.
 * Continued marker presence never changes later ordinary releases.
 * Missing history or any marker modification/deletion stops before secret setup.
 */
function selectReleaseScope(cwd, readGit) {
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
  const markedScopes = scopes.filter(scope => changes.some(change => change.path === scope.marker))
  if (!markedScopes.length) {
    if (scopes.some(scope => parent === scope.base) || changes.some(change => change.status === 'A' &&
        (change.path === 'scripts/select-pipeline-only-release.mjs' || fundingIntroductions.has(change.path) || sessionDraftIntroductions.has(change.path)))) refuse()
    return null
  }
  if (markedScopes.length !== 1) refuse()
  const scope = markedScopes[0]
  const marker = changes.find(change => change.path === scope.marker)
  if (marker.status !== 'A' || parent !== scope.base) refuse()
  if (changes.some(change => !['A', 'M'].includes(change.status)) ||
      JSON.stringify(changes.map(change => change.path).sort()) !== JSON.stringify(scope.paths)) refuse()
  if (scope.marker === FUNDING_MARKER_PATH || scope.marker === SESSION_DRAFT_MARKER_PATH) {
    const entries = readGit(cwd, ['ls-tree', '-z', head, '--', ...scope.paths]).split('\0')
    if (entries.pop() !== '' || entries.length !== scope.paths.length) refuse()
    const paths = entries.map(entry => {
      const match = /^100644 blob [0-9a-f]{40}\t(.+)$/.exec(entry)
      if (!match) refuse()
      return match[1]
    }).sort()
    if (JSON.stringify(paths) !== JSON.stringify(scope.paths)) refuse()
  }
  const entry = readGit(cwd, ['ls-tree', '-z', head, '--', scope.marker])
  const match = /^100644 blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry)
  if (!match || match[2] !== scope.marker) refuse()
  if (readGit(cwd, ['cat-file', 'blob', match[1]]) !== scope.content) refuse()
  return scope
}

export function selectPipelineReleaseOptions(cwd = process.cwd(), readGit = git) {
  const scope = selectReleaseScope(cwd, readGit)
  return { preserveBilling: Boolean(scope), preserveRemoteVars: scope?.preserveRemoteVars === true }
}

export function selectPipelineOnlyRelease(cwd = process.cwd(), readGit = git) {
  return selectPipelineReleaseOptions(cwd, readGit).preserveBilling
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) refuse()
    const options = selectPipelineReleaseOptions()
    console.log(`preserve_billing=${options.preserveBilling}\npreserve_remote_vars=${options.preserveRemoteVars}`)
  } catch {
    console.error('PIPELINE_RELEASE_SCOPE_NOT_VERIFIED: publication stopped before credential setup; verify the reviewed parent, paths and one-time marker. No secret values were read.')
    process.exitCode = 1
  }
}
