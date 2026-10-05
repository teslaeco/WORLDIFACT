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
export const READONLY_QUOTE_BASE_COMMIT = '177c71098e9ccca3e18bedb505f2dd9932a9aab8'
export const READONLY_QUOTE_MARKER_PATH = 'ops/READONLY_QUOTE_RELEASE_20261005.json'
export const READONLY_QUOTE_MARKER_CONTENT = JSON.stringify({
  release: 'generation-readonly-quote-20261005',
  baseCommit: READONLY_QUOTE_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const READONLY_QUOTE_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  READONLY_QUOTE_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/useGenerationQuote.ts',
  'tests/generation-cost-notice.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/portal-generation-lifecycle.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
].sort())
export const MCC_ONE_ATTEMPT_BASE_COMMIT = 'c6422e9d22185d22ee4eae23dc61f4045dd6ca6f'
export const MCC_ONE_ATTEMPT_MARKER_PATH = 'ops/MCC_ONE_ATTEMPT_RELEASE_20261005.json'
export const MCC_ONE_ATTEMPT_MARKER_CONTENT = JSON.stringify({
  release: 'mcc-one-attempt-allowance-20261005',
  baseCommit: MCC_ONE_ATTEMPT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const MCC_ONE_ATTEMPT_REVIEWED_PATHS = Object.freeze([
  'docs/ASTRA_REPAIRED_MCC_GRANT.md',
  'docs/CONTEST_STATUS.md',
  MCC_ONE_ATTEMPT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/astraRepairedMccGrant.ts',
  'server/entitlements.ts',
  'server/studio.ts',
  'tests/astra-repaired-mcc-grant.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-repaired-mcc.test.ts',
].sort())
export const ACCOUNT_MODEL_LIBRARY_BASE_COMMIT = '1b8da59e2b5c3bb9856fe63e34bfd8c2793a05f1'
export const ACCOUNT_MODEL_LIBRARY_MARKER_PATH = 'ops/ACCOUNT_MODEL_LIBRARY_RELEASE_20261005.json'
export const ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT = JSON.stringify({
  release: 'private-account-model-library-20261005',
  baseCommit: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS = Object.freeze([
  'docs/CONTEST_STATUS.md',
  ACCOUNT_MODEL_LIBRARY_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/studio.ts',
  'src/components/StudioGallery.tsx',
  'src/lib/account.tsx',
  'src/lib/studioLibrary.ts',
  'src/lib/studioProtocol.ts',
  'src/pages/ModelsPage.tsx',
  'tests/account-provider-lifecycle.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-gallery.test.mjs',
  'tests/studio-library-gallery.test.mjs',
  'tests/studio-library.test.ts',
].sort())
export const PROJECT_MCC_ATTEMPT_BASE_COMMIT = '77487a20cfba34e3694fa660f7aec8051353085a'
export const PROJECT_MCC_ATTEMPT_MARKER_PATH = 'ops/PROJECT_MCC_ATTEMPT_RELEASE_20261005.json'
export const PROJECT_MCC_ATTEMPT_MARKER_CONTENT = JSON.stringify({
  release: 'project-funded-mcc-one-attempt-20261005',
  baseCommit: PROJECT_MCC_ATTEMPT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const PROJECT_MCC_ATTEMPT_REVIEWED_PATHS = Object.freeze([
  'docs/ASTRA_PROJECT_BUDGET.md',
  'docs/CONTEST_STATUS.md',
  PROJECT_MCC_ATTEMPT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/astraProjectBudget.ts',
  'server/entitlements.ts',
  'server/studio.ts',
  'tests/astra-project-budget.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-project-budget.test.ts',
].sort())
export const CABINET_CONTEXT_BASE_COMMIT = 'e36797e7b955ed3636a861caed842e576ed609c2'
export const CABINET_CONTEXT_MARKER_PATH = 'ops/CABINET_CONTEXT_RELEASE_20261005.json'
export const CABINET_CONTEXT_MARKER_CONTENT = JSON.stringify({
  release: 'cabinet-prompt-and-attempt-context-20261005',
  baseCommit: CABINET_CONTEXT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const CABINET_CONTEXT_REVIEWED_PATHS = Object.freeze([
  'docs/CONTEST_STATUS.md',
  CABINET_CONTEXT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/studioProtocol.ts',
  'src/pages/ShopPage.tsx',
  'tests/generation-cost-notice.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/portal-generation-lifecycle.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-external.test.mjs',
  'tests/studio-priced-submission.test.ts',
  'tests/studio-pricing.test.ts',
  'tests/studio-protocol-contract.test.ts',
].sort())
const releaseIntroductions = new Set([
  'docs/GENERATOR_UI_RESTORATION_20261004.md',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/pages/GenerationFundingPage.css',
  'src/pages/GenerationFundingPage.tsx',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
  'docs/ASTRA_REPAIRED_MCC_GRANT.md',
  'server/astraRepairedMccGrant.ts',
  'tests/astra-repaired-mcc-grant.test.ts',
  'tests/studio-repaired-mcc.test.ts',
  'src/lib/studioLibrary.ts',
  'tests/account-provider-lifecycle.test.mjs',
  'tests/studio-library-gallery.test.mjs',
  'tests/studio-library.test.ts',
  'docs/ASTRA_PROJECT_BUDGET.md',
  'server/astraProjectBudget.ts',
  'tests/astra-project-budget.test.ts',
  'tests/studio-project-budget.test.ts',
])
const scopes = [
  { base: BASE_COMMIT, marker: MARKER_PATH, content: MARKER_CONTENT, paths: REVIEWED_PATHS },
  { base: FUNDING_BASE_COMMIT, marker: FUNDING_MARKER_PATH, content: FUNDING_MARKER_CONTENT, paths: FUNDING_REVIEWED_PATHS },
  { base: READONLY_QUOTE_BASE_COMMIT, marker: READONLY_QUOTE_MARKER_PATH, content: READONLY_QUOTE_MARKER_CONTENT, paths: READONLY_QUOTE_REVIEWED_PATHS, preserveRemoteVars: true },
  { base: MCC_ONE_ATTEMPT_BASE_COMMIT, marker: MCC_ONE_ATTEMPT_MARKER_PATH, content: MCC_ONE_ATTEMPT_MARKER_CONTENT, paths: MCC_ONE_ATTEMPT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, marker: ACCOUNT_MODEL_LIBRARY_MARKER_PATH, content: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT, paths: ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: PROJECT_MCC_ATTEMPT_BASE_COMMIT, marker: PROJECT_MCC_ATTEMPT_MARKER_PATH, content: PROJECT_MCC_ATTEMPT_MARKER_CONTENT, paths: PROJECT_MCC_ATTEMPT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: CABINET_CONTEXT_BASE_COMMIT, marker: CABINET_CONTEXT_MARKER_PATH, content: CABINET_CONTEXT_MARKER_CONTENT, paths: CABINET_CONTEXT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
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
    // A changed selector is release preparation, even if rebased without its marker.
    // It must never silently select an ordinary deployment that mutates billing.
    if (scopes.some(scope => parent === scope.base) || changes.some(change =>
      change.path === 'scripts/select-pipeline-only-release.mjs' ||
      (change.status === 'A' && releaseIntroductions.has(change.path)))) refuse()
    return null
  }
  if (markedScopes.length !== 1) refuse()
  const scope = markedScopes[0]
  const marker = changes.find(change => change.path === scope.marker)
  if (marker.status !== 'A' || parent !== scope.base) refuse()
  if (scope.singleParent && readGit(cwd, ['rev-list', '--parents', '-n', '1', head]).trim() !== `${head} ${parent}`) refuse()
  if (changes.some(change => !['A', 'M'].includes(change.status)) ||
      JSON.stringify(changes.map(change => change.path).sort()) !== JSON.stringify(scope.paths)) refuse()
  if (scope.marker === FUNDING_MARKER_PATH || scope.marker === READONLY_QUOTE_MARKER_PATH || scope.marker === MCC_ONE_ATTEMPT_MARKER_PATH || scope.marker === ACCOUNT_MODEL_LIBRARY_MARKER_PATH || scope.marker === PROJECT_MCC_ATTEMPT_MARKER_PATH || scope.marker === CABINET_CONTEXT_MARKER_PATH) {
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
