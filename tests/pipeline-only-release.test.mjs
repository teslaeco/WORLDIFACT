import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readDeployment } from '../scripts/release-check.ts'
import {
  BASE_COMMIT, MARKER_PATH, MARKER_CONTENT, REVIEWED_PATHS,
  FUNDING_BASE_COMMIT, FUNDING_MARKER_PATH, FUNDING_MARKER_CONTENT, FUNDING_REVIEWED_PATHS,
  READONLY_QUOTE_BASE_COMMIT, READONLY_QUOTE_MARKER_PATH, READONLY_QUOTE_MARKER_CONTENT, READONLY_QUOTE_REVIEWED_PATHS,
  MCC_ONE_ATTEMPT_BASE_COMMIT, MCC_ONE_ATTEMPT_MARKER_PATH, MCC_ONE_ATTEMPT_MARKER_CONTENT, MCC_ONE_ATTEMPT_REVIEWED_PATHS,
  ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, ACCOUNT_MODEL_LIBRARY_MARKER_PATH, ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT, ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS,
  PROJECT_MCC_ATTEMPT_BASE_COMMIT, PROJECT_MCC_ATTEMPT_MARKER_PATH, PROJECT_MCC_ATTEMPT_MARKER_CONTENT, PROJECT_MCC_ATTEMPT_REVIEWED_PATHS,
  CABINET_CONTEXT_BASE_COMMIT, CABINET_CONTEXT_MARKER_PATH, CABINET_CONTEXT_MARKER_CONTENT, CABINET_CONTEXT_REVIEWED_PATHS,
  GENERATION_RECOVERY_BASE_COMMIT, GENERATION_RECOVERY_MARKER_PATH, GENERATION_RECOVERY_MARKER_CONTENT, GENERATION_RECOVERY_REVIEWED_PATHS,
  selectPipelineOnlyRelease, selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const changes = REVIEWED_PATHS.map(path => ({ status: path === MARKER_PATH ? 'A' : 'M', path }))
const fundingChanges = FUNDING_REVIEWED_PATHS.map(path => ({ status: path === FUNDING_MARKER_PATH ? 'A' : 'M', path }))
const readonlyQuoteChanges = READONLY_QUOTE_REVIEWED_PATHS.map(path => ({ status: path === READONLY_QUOTE_MARKER_PATH ? 'A' : 'M', path }))
const mccOneAttemptChanges = MCC_ONE_ATTEMPT_REVIEWED_PATHS.map(path => ({ status: path === MCC_ONE_ATTEMPT_MARKER_PATH ? 'A' : 'M', path }))
const accountModelLibraryIntroductions = ['src/lib/studioLibrary.ts', 'tests/account-provider-lifecycle.test.mjs', 'tests/studio-library-gallery.test.mjs', 'tests/studio-library.test.ts']
const accountModelLibraryChanges = ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.map(path => ({
  status: path === ACCOUNT_MODEL_LIBRARY_MARKER_PATH || accountModelLibraryIntroductions.includes(path) ? 'A' : 'M', path,
}))
const projectMccAttemptIntroductions = ['docs/ASTRA_PROJECT_BUDGET.md', 'server/astraProjectBudget.ts', 'tests/astra-project-budget.test.ts', 'tests/studio-project-budget.test.ts']
const projectMccAttemptChanges = PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.map(path => ({
  status: path === PROJECT_MCC_ATTEMPT_MARKER_PATH || projectMccAttemptIntroductions.includes(path) ? 'A' : 'M', path,
}))
const cabinetContextChanges = CABINET_CONTEXT_REVIEWED_PATHS.map(path => ({ status: path === CABINET_CONTEXT_MARKER_PATH ? 'A' : 'M', path }))
const generationRecoveryIntroductions = ["docs/SOL61_BLUEPRINT_MIGRATION.md", "server/blueprintModelBinding.ts", "server/blueprintTerminalUsage.ts", "src/components/GenerationProgressOrb.css", "src/components/GenerationProgressOrb.tsx", "src/components/GenerationSculpture.tsx", "src/lib/generationProgressView.ts", "tests/blueprint-failed-provider-reconciliation.test.ts", "tests/blueprint-failed-reconciliation-native.test.mjs", "tests/blueprint-output-adjustment-preview.test.ts", "tests/fixtures/sol61-legacy-client.ts", "tests/fixtures/sol61-legacy-worker.ts", "tests/generation-progress-orb.test.mjs", "tests/generation-progress-view.test.ts", "tests/generation-sculpture-lifecycle.test.mjs", "tests/sol61-blueprint-migration.test.ts", "tests/sol61-mixed-deployment.test.ts", "tests/studio-generation-timing.test.ts"]
const generationRecoveryChanges = GENERATION_RECOVERY_REVIEWED_PATHS.map(path => ({ status: path === GENERATION_RECOVERY_MARKER_PATH || generationRecoveryIntroductions.includes(path) ? 'A' : 'M', path }))
const priorMarkers = [MARKER_PATH, FUNDING_MARKER_PATH, READONLY_QUOTE_MARKER_PATH, MCC_ONE_ATTEMPT_MARKER_PATH, ACCOUNT_MODEL_LIBRARY_MARKER_PATH]
const scopedPaths = new Map([
  [FUNDING_MARKER_PATH, FUNDING_REVIEWED_PATHS],
  [READONLY_QUOTE_MARKER_PATH, READONLY_QUOTE_REVIEWED_PATHS],
  [MCC_ONE_ATTEMPT_MARKER_PATH, MCC_ONE_ATTEMPT_REVIEWED_PATHS],
  [ACCOUNT_MODEL_LIBRARY_MARKER_PATH, ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS],
  [PROJECT_MCC_ATTEMPT_MARKER_PATH, PROJECT_MCC_ATTEMPT_REVIEWED_PATHS],
  [CABINET_CONTEXT_MARKER_PATH, CABINET_CONTEXT_REVIEWED_PATHS],
  [GENERATION_RECOVERY_MARKER_PATH, GENERATION_RECOVERY_REVIEWED_PATHS],
])
function evidence(overrides = {}) {
  const data = { head, parent: BASE_COMMIT, changes, markerPath: MARKER_PATH, marker: MARKER_CONTENT, mode: '100644', ...overrides }
  const calls = []
  function readGit(cwd, args) {
    assert.equal(cwd, 'fixture')
    calls.push(args)
    if (args[0] === 'rev-parse') {
      assert.deepEqual(args.slice(0, 3), ['rev-parse', '--verify', '--end-of-options'])
      if (args[3] === 'HEAD^{commit}') return data.head + '\n'
      assert.equal(args[3], `${data.head}^1^{commit}`)
      if (!data.parent) throw new Error('missing local parent')
      return data.parent + '\n'
    }
    if (args[0] === 'diff') {
      assert.deepEqual(args, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', data.parent, data.head, '--'])
      return data.raw ?? data.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    }
    if (args[0] === 'rev-list') {
      assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', data.head])
      return data.parents ?? `${data.head} ${data.parent}\n`
    }
    if (args[0] === 'ls-tree') {
      if (args.length > 5) {
        const paths = scopedPaths.get(data.markerPath)
        assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', ...paths])
        return data.tree ?? paths.map(path => `100644 blob ${blob}\t${path}\0`).join('')
      }
      assert.deepEqual(args, ['ls-tree', '-z', data.head, '--', data.markerPath])
      return `${data.mode} blob ${blob}\t${data.markerPath}\0`
    }
    assert.deepEqual(args, ['cat-file', 'blob', blob])
    return data.marker
  }
  return { readGit, calls }
}
function select(overrides) { return selectPipelineOnlyRelease('fixture', evidence(overrides).readGit) }
function selectFunding(overrides = {}) {
  return select({ parent: FUNDING_BASE_COMMIT, changes: fundingChanges, markerPath: FUNDING_MARKER_PATH, marker: FUNDING_MARKER_CONTENT, ...overrides })
}
function selectReadonlyQuote(overrides = {}) {
  return select({ parent: READONLY_QUOTE_BASE_COMMIT, changes: readonlyQuoteChanges, markerPath: READONLY_QUOTE_MARKER_PATH, marker: READONLY_QUOTE_MARKER_CONTENT, ...overrides })
}
function mccOneAttemptEvidence(overrides = {}) {
  return evidence({ parent: MCC_ONE_ATTEMPT_BASE_COMMIT, changes: mccOneAttemptChanges, markerPath: MCC_ONE_ATTEMPT_MARKER_PATH, marker: MCC_ONE_ATTEMPT_MARKER_CONTENT, ...overrides })
}
function selectMccOneAttempt(overrides = {}) {
  return selectPipelineReleaseOptions('fixture', mccOneAttemptEvidence(overrides).readGit)
}
function accountModelLibraryEvidence(overrides = {}) {
  return evidence({ parent: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, changes: accountModelLibraryChanges, markerPath: ACCOUNT_MODEL_LIBRARY_MARKER_PATH, marker: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT, ...overrides })
}
function selectAccountModelLibrary(overrides = {}) {
  return selectPipelineReleaseOptions('fixture', accountModelLibraryEvidence(overrides).readGit)
}
function projectMccAttemptEvidence(overrides = {}) {
  return evidence({ parent: PROJECT_MCC_ATTEMPT_BASE_COMMIT, changes: projectMccAttemptChanges, markerPath: PROJECT_MCC_ATTEMPT_MARKER_PATH, marker: PROJECT_MCC_ATTEMPT_MARKER_CONTENT, ...overrides })
}
function selectProjectMccAttempt(overrides = {}) {
  return selectPipelineReleaseOptions('fixture', projectMccAttemptEvidence(overrides).readGit)
}

function cabinetContextEvidence(overrides = {}) {
  return evidence({ parent: CABINET_CONTEXT_BASE_COMMIT, changes: cabinetContextChanges, markerPath: CABINET_CONTEXT_MARKER_PATH, marker: CABINET_CONTEXT_MARKER_CONTENT, ...overrides })
}
function selectCabinetContext(overrides = {}) {
  return selectPipelineReleaseOptions('fixture', cabinetContextEvidence(overrides).readGit)
}

function generationRecoveryEvidence(overrides = {}) {
  return evidence({ parent: GENERATION_RECOVERY_BASE_COMMIT, changes: generationRecoveryChanges, markerPath: GENERATION_RECOVERY_MARKER_PATH, marker: GENERATION_RECOVERY_MARKER_CONTENT, ...overrides })
}
function selectGenerationRecovery(overrides = {}) {
  return selectPipelineReleaseOptions('fixture', generationRecoveryEvidence(overrides).readGit)
}

test('only the exact reviewed repair and canonical public marker preserve billing', () => {
  assert.equal(select(), true)
  assert.equal(readFileSync(new URL('../' + MARKER_PATH, import.meta.url), 'utf8'), MARKER_CONTENT)
  assert.equal(REVIEWED_PATHS.length, 12)
})

test('marker addition refuses a changed parent, extra/missing paths, deletion, rename or type change', () => {
  for (const overrides of [
    { parent: '3'.repeat(40) },
    { changes: [...changes, { status: 'M', path: 'server/billing.ts' }] },
    { changes: changes.filter(change => change.path !== 'server/studio.ts') },
    ...['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === 'server/studio.ts' ? { ...change, status } : change) })),
  ]) assert.throws(() => select(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('marker format or type changes and later marker edits/deletion fail closed', () => {
  for (const overrides of [
    { marker: MARKER_CONTENT + '\n' }, { marker: MARKER_CONTENT.replace('true', 'false') }, { mode: '120000' },
    ...['M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: MARKER_PATH }] })),
  ]) assert.throws(() => select(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('an initial repair or newly introduced selector cannot omit the marker and enable billing', () => {
  assert.throws(() => select({ changes: changes.filter(change => change.path !== MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path: 'scripts/select-pipeline-only-release.mjs' }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('the separate funding inspection scope preserves billing for exactly its 17 reviewed paths', () => {
  assert.equal(selectFunding(), true)
  assert.equal(readFileSync(new URL('../' + FUNDING_MARKER_PATH, import.meta.url), 'utf8'), FUNDING_MARKER_CONTENT)
  assert.equal(FUNDING_REVIEWED_PATHS.length, 17)
  assert.equal(FUNDING_REVIEWED_PATHS.includes(MARKER_PATH), false)
  assert.equal(FUNDING_REVIEWED_PATHS.includes('.github/workflows/cloudflare.yml'), false)
  assert.equal(FUNDING_REVIEWED_PATHS.includes('docs/CONTEST_STATUS.md'), false)
})

test('funding inspection refuses omitted markers, different parents, scope changes and any old marker change', () => {
  for (const overrides of [
    { changes: fundingChanges.filter(change => change.path !== FUNDING_MARKER_PATH) },
    { parent: BASE_COMMIT }, { parent: '3'.repeat(40) },
    { changes: [...fundingChanges, { status: 'M', path: 'server/billing.ts' }] },
    { changes: fundingChanges.filter(change => change.path !== 'server/entitlements.ts') },
    ...['A', 'M', 'D', 'T'].map(status => ({ changes: [...fundingChanges, { status, path: MARKER_PATH }] })),
    ...['D', 'T', 'R100'].map(status => ({ changes: fundingChanges.map(change => change.path === 'server/entitlements.ts' ? { ...change, status } : change) })),
    { parent: '3'.repeat(40), changes: [{ status: 'A', path: 'src/lib/generationFunding.ts' }] },
    { parent: FUNDING_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectFunding(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('funding marker contents, marker edits and non-regular reviewed files fail closed', () => {
  const tree = FUNDING_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: FUNDING_MARKER_CONTENT + '\n' },
    { marker: FUNDING_MARKER_CONTENT.replace('true', 'false') },
    { marker: MARKER_CONTENT }, { mode: '120000' },
    ...['M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: FUNDING_MARKER_PATH }] })),
    ...['100755', '120000', '160000'].map(mode => ({ tree: tree.replace('100644', mode) })),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('docs/GENERATOR_UI_RESTORATION_20261004.md', 'docs/other.md') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectFunding(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('the read-only quote release preserves billing and remote vars for only its canonical marker and reviewed paths', () => {
  assert.equal(selectReadonlyQuote(), true)
  assert.equal(READONLY_QUOTE_BASE_COMMIT, '177c71098e9ccca3e18bedb505f2dd9932a9aab8')
  assert.equal(readFileSync(new URL('../' + READONLY_QUOTE_MARKER_PATH, import.meta.url), 'utf8'), READONLY_QUOTE_MARKER_CONTENT)
  assert.equal(READONLY_QUOTE_REVIEWED_PATHS.length, 11)
  assert.equal(READONLY_QUOTE_REVIEWED_PATHS.includes('.github/workflows/cloudflare.yml'), true)
  for (const path of [MARKER_PATH, FUNDING_MARKER_PATH, 'src/lib/account.tsx', 'server/billing.ts', 'server/entitlements.ts']) {
    assert.equal(READONLY_QUOTE_REVIEWED_PATHS.includes(path), false, path)
  }
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({
    parent: READONLY_QUOTE_BASE_COMMIT, changes: readonlyQuoteChanges,
    markerPath: READONLY_QUOTE_MARKER_PATH, marker: READONLY_QUOTE_MARKER_CONTENT,
  }).readGit), { preserveBilling: true, preserveRemoteVars: true })
})

test('read-only quote release refuses missing markers, different parents and changes outside the exact scope', () => {
  for (const overrides of [
    { changes: readonlyQuoteChanges.filter(change => change.path !== READONLY_QUOTE_MARKER_PATH) },
    { parent: BASE_COMMIT }, { parent: FUNDING_BASE_COMMIT }, { parent: '3'.repeat(40) },
    { changes: [...readonlyQuoteChanges, { status: 'M', path: 'server/billing.ts' }] },
    { changes: readonlyQuoteChanges.filter(change => change.path !== 'src/lib/useGenerationQuote.ts') },
    ...['D', 'T', 'R100'].map(status => ({ changes: readonlyQuoteChanges.map(change => change.path === 'src/lib/useGenerationQuote.ts' ? { ...change, status } : change) })),
    ...[MARKER_PATH, FUNDING_MARKER_PATH].flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...readonlyQuoteChanges, { status, path }] }))),
    { parent: READONLY_QUOTE_BASE_COMMIT, changes: [] },
    { parent: '3'.repeat(40), changes: readonlyQuoteChanges.filter(change => change.path !== READONLY_QUOTE_MARKER_PATH) },
    ...['A', 'M', 'D', 'T'].map(status => ({ parent: '3'.repeat(40), changes: [{ status, path: 'scripts/select-pipeline-only-release.mjs' }] })),
  ]) assert.throws(() => selectReadonlyQuote(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('read-only quote marker tampering and non-regular reviewed files fail closed', () => {
  const tree = READONLY_QUOTE_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: READONLY_QUOTE_MARKER_CONTENT + '\n' },
    { marker: READONLY_QUOTE_MARKER_CONTENT.replace('true', 'false') },
    { marker: READONLY_QUOTE_MARKER_CONTENT.replace('"preserveRemoteVars": true', '"preserveRemoteVars": false') },
    { marker: MARKER_CONTENT }, { marker: FUNDING_MARKER_CONTENT }, { mode: '120000' },
    ...['A', 'M', 'D', 'T'].map(status => ({ parent: head, changes: [{ status, path: READONLY_QUOTE_MARKER_PATH }] })),
    ...['100755', '120000', '160000'].map(mode => ({ tree: tree.replace('100644', mode) })),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('src/lib/useGenerationQuote.ts', 'src/lib/other.ts') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectReadonlyQuote(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('later read-only quote edits use normal billing behavior without reading any stale release marker', () => {
  const fixture = evidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'src/lib/useGenerationQuote.ts' }] })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
  assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
})

test('the one-attempt MCC release preserves billing and remote vars for its fixed parent and ten-file package', () => {
  assert.deepEqual(selectMccOneAttempt(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(MCC_ONE_ATTEMPT_BASE_COMMIT, 'c6422e9d22185d22ee4eae23dc61f4045dd6ca6f')
  assert.equal(readFileSync(new URL('../' + MCC_ONE_ATTEMPT_MARKER_PATH, import.meta.url), 'utf8'), MCC_ONE_ATTEMPT_MARKER_CONTENT)
  assert.equal(MCC_ONE_ATTEMPT_REVIEWED_PATHS.length, 10)
  for (const path of [MARKER_PATH, FUNDING_MARKER_PATH, READONLY_QUOTE_MARKER_PATH, '.github/workflows/cloudflare.yml', 'server/billing.ts', 'wrangler.jsonc']) {
    assert.equal(MCC_ONE_ATTEMPT_REVIEWED_PATHS.includes(path), false, path)
  }
})

test('one-attempt MCC release refuses missing or renamed markers, changed parents and incomplete or expanded packages', () => {
  for (const overrides of [
    { changes: mccOneAttemptChanges.filter(change => change.path !== MCC_ONE_ATTEMPT_MARKER_PATH) },
    { changes: mccOneAttemptChanges.map(change => change.path === MCC_ONE_ATTEMPT_MARKER_PATH ? { ...change, path: 'ops/OTHER_RELEASE.json' } : change) },
    ...[BASE_COMMIT, FUNDING_BASE_COMMIT, READONLY_QUOTE_BASE_COMMIT, '3'.repeat(40)].map(parent => ({ parent })),
    { parents: `${head} ${MCC_ONE_ATTEMPT_BASE_COMMIT} ${'3'.repeat(40)}\n` },
    { parents: `${head}\n` },
    { changes: [...mccOneAttemptChanges, { status: 'M', path: 'server/billing.ts' }] },
    ...MCC_ONE_ATTEMPT_REVIEWED_PATHS.filter(path => path !== MCC_ONE_ATTEMPT_MARKER_PATH).map(path => ({ changes: mccOneAttemptChanges.filter(change => change.path !== path) })),
    ...['D', 'T', 'R100'].map(status => ({ changes: mccOneAttemptChanges.map(change => change.path === 'server/entitlements.ts' ? { ...change, status } : change) })),
    { parent: MCC_ONE_ATTEMPT_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectMccOneAttempt(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('one-attempt MCC release refuses every old marker change and noncanonical marker or file modes', () => {
  const tree = MCC_ONE_ATTEMPT_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    ...[MARKER_PATH, FUNDING_MARKER_PATH, READONLY_QUOTE_MARKER_PATH].flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...mccOneAttemptChanges, { status, path }] }))),
    { marker: MCC_ONE_ATTEMPT_MARKER_CONTENT + '\n' },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: MCC_ONE_ATTEMPT_MARKER_CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    { marker: READONLY_QUOTE_MARKER_CONTENT },
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...MCC_ONE_ATTEMPT_REVIEWED_PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({ tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`) }))),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('server/astraRepairedMccGrant.ts', 'server/other.ts') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectMccOneAttempt(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('rebased MCC preparation cannot omit its marker and later ordinary edits retain normal selection', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', 'server/astraRepairedMccGrant.ts', 'tests/astra-repaired-mcc-grant.test.ts', 'tests/studio-repaired-mcc.test.ts', 'docs/ASTRA_REPAIRED_MCC_GRANT.md']) {
    assert.throws(() => selectMccOneAttempt({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  for (const status of ['A', 'M', 'D', 'T']) {
    assert.throws(() => selectMccOneAttempt({ parent: '3'.repeat(40), changes: [{ status, path: MCC_ONE_ATTEMPT_MARKER_PATH }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  for (const path of ['server/astraRepairedMccGrant.ts', 'server/entitlements.ts', 'server/studio.ts', 'docs/ASTRA_REPAIRED_MCC_GRANT.md']) {
    const fixture = mccOneAttemptEvidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
    assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  }
})

test('the private account library release preserves billing and remote vars for its canonical fifteen-file package', () => {
  assert.deepEqual(selectAccountModelLibrary(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, '1b8da59e2b5c3bb9856fe63e34bfd8c2793a05f1')
  assert.equal(readFileSync(new URL('../' + ACCOUNT_MODEL_LIBRARY_MARKER_PATH, import.meta.url), 'utf8'), ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT)
  assert.equal(ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.length, 15)
  for (const path of [MARKER_PATH, FUNDING_MARKER_PATH, READONLY_QUOTE_MARKER_PATH, MCC_ONE_ATTEMPT_MARKER_PATH,
    '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts', 'server/billing.ts', 'wrangler.jsonc', 'package.json', 'package-lock.json']) {
    assert.equal(ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.includes(path), false, path)
  }
})

test('account library release refuses missing or renamed markers, wrong parents and any merge parent', () => {
  for (const overrides of [
    { changes: accountModelLibraryChanges.filter(change => change.path !== ACCOUNT_MODEL_LIBRARY_MARKER_PATH) },
    { changes: accountModelLibraryChanges.map(change => change.path === ACCOUNT_MODEL_LIBRARY_MARKER_PATH ? { ...change, path: 'ops/OTHER_RELEASE.json' } : change) },
    ...[BASE_COMMIT, FUNDING_BASE_COMMIT, READONLY_QUOTE_BASE_COMMIT, MCC_ONE_ATTEMPT_BASE_COMMIT, '3'.repeat(40), null].map(parent => ({ parent })),
    { parents: `${head} ${ACCOUNT_MODEL_LIBRARY_BASE_COMMIT} ${'3'.repeat(40)}\n` },
    { parents: `${head}\n` },
    { parents: `${head} ${'3'.repeat(40)}\n` },
    { parent: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectAccountModelLibrary(overrides))
})

test('account library release refuses incomplete or expanded paths, deletions, renames and type changes', () => {
  for (const overrides of [
    ...['server/billing.ts', '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts', 'wrangler.jsonc', 'ops/UNREVIEWED_RELEASE.json']
      .map(path => ({ changes: [...accountModelLibraryChanges, { status: 'M', path }] })),
    ...ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.filter(path => path !== ACCOUNT_MODEL_LIBRARY_MARKER_PATH)
      .map(path => ({ changes: accountModelLibraryChanges.filter(change => change.path !== path) })),
    ...ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({
      changes: accountModelLibraryChanges.map(change => change.path === path ? { ...change, status } : change),
    }))),
    { changes: [...accountModelLibraryChanges, accountModelLibraryChanges[0]] },
  ]) assert.throws(() => selectAccountModelLibrary(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('account library release rejects every prior marker change and noncanonical new marker contents', () => {
  for (const overrides of [
    ...[MARKER_PATH, FUNDING_MARKER_PATH, READONLY_QUOTE_MARKER_PATH, MCC_ONE_ATTEMPT_MARKER_PATH]
      .flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...accountModelLibraryChanges, { status, path }] }))),
    { marker: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT + '\n' },
    { marker: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT.replace(ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, '3'.repeat(40)) },
    { marker: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT.replace('private-account-model-library-20261005', 'different-release') },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...[MARKER_CONTENT, FUNDING_MARKER_CONTENT, READONLY_QUOTE_MARKER_CONTENT, MCC_ONE_ATTEMPT_MARKER_CONTENT].map(marker => ({ marker })),
    ...['A', 'M', 'D', 'T'].map(status => ({ parent: '3'.repeat(40), changes: [{ status, path: ACCOUNT_MODEL_LIBRARY_MARKER_PATH }] })),
  ]) assert.throws(() => selectAccountModelLibrary(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('account library release requires every reviewed path to be a regular non-executable file', () => {
  const tree = ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({
      tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`),
    }))),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('src/lib/studioLibrary.ts', 'src/lib/other.ts') },
    { tree: tree.replace('src/lib/studioLibrary.ts', 'src/lib/studioProtocol.ts') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectAccountModelLibrary(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('rebased account library preparation cannot omit its marker while later ordinary edits retain normal selection', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', ...accountModelLibraryIntroductions]) {
    assert.throws(() => selectAccountModelLibrary({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  assert.throws(() => selectAccountModelLibrary({ parent: '3'.repeat(40), changes: accountModelLibraryChanges.filter(change => change.path !== ACCOUNT_MODEL_LIBRARY_MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const path of ['src/lib/studioLibrary.ts', 'src/components/StudioGallery.tsx', 'server/studio.ts']) {
    const fixture = accountModelLibraryEvidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
    assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  }
})

test('the project-funded MCC attempt preserves billing and remote vars for its canonical ten-file package', () => {
  assert.deepEqual(selectProjectMccAttempt(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(PROJECT_MCC_ATTEMPT_BASE_COMMIT, '77487a20cfba34e3694fa660f7aec8051353085a')
  assert.equal(readFileSync(new URL('../' + PROJECT_MCC_ATTEMPT_MARKER_PATH, import.meta.url), 'utf8'), PROJECT_MCC_ATTEMPT_MARKER_CONTENT)
  assert.deepEqual(PROJECT_MCC_ATTEMPT_REVIEWED_PATHS, [
    'docs/ASTRA_PROJECT_BUDGET.md', 'docs/CONTEST_STATUS.md', PROJECT_MCC_ATTEMPT_MARKER_PATH,
    'scripts/select-pipeline-only-release.mjs', 'server/astraProjectBudget.ts', 'server/entitlements.ts',
    'server/studio.ts', 'tests/astra-project-budget.test.ts', 'tests/pipeline-only-release.test.mjs',
    'tests/studio-project-budget.test.ts',
  ].sort())
  for (const path of [...priorMarkers, '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts',
    'server/billing.ts', 'wrangler.jsonc', 'package.json', 'package-lock.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']) {
    assert.equal(PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.includes(path), false, path)
  }
})

test('project-funded MCC release refuses missing markers, wrong bases, missing history and any merge parent', () => {
  for (const overrides of [
    { changes: projectMccAttemptChanges.filter(change => change.path !== PROJECT_MCC_ATTEMPT_MARKER_PATH) },
    { changes: projectMccAttemptChanges.map(change => change.path === PROJECT_MCC_ATTEMPT_MARKER_PATH ? { ...change, path: 'ops/OTHER_RELEASE.json' } : change) },
    ...[BASE_COMMIT, FUNDING_BASE_COMMIT, READONLY_QUOTE_BASE_COMMIT, MCC_ONE_ATTEMPT_BASE_COMMIT, ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, '3'.repeat(40), null].map(parent => ({ parent })),
    { parents: `${head} ${PROJECT_MCC_ATTEMPT_BASE_COMMIT} ${'3'.repeat(40)}\n` },
    { parents: `${head}\n` },
    { parents: `${head} ${'3'.repeat(40)}\n` },
    { parent: PROJECT_MCC_ATTEMPT_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectProjectMccAttempt(overrides))
})

test('project-funded MCC release refuses incomplete or expanded scope and every prior marker change', () => {
  for (const overrides of [
    ...['server/billing.ts', '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts', 'wrangler.jsonc',
      'ops/UNREVIEWED_RELEASE.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']
      .map(path => ({ changes: [...projectMccAttemptChanges, { status: 'A', path }] })),
    ...PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.filter(path => path !== PROJECT_MCC_ATTEMPT_MARKER_PATH)
      .map(path => ({ changes: projectMccAttemptChanges.filter(change => change.path !== path) })),
    ...PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({
      changes: projectMccAttemptChanges.map(change => change.path === path ? { ...change, status } : change),
    }))),
    ...priorMarkers.flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...projectMccAttemptChanges, { status, path }] }))),
    { changes: [...projectMccAttemptChanges, projectMccAttemptChanges[0]] },
  ]) assert.throws(() => selectProjectMccAttempt(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('project-funded MCC release requires canonical marker contents and regular non-executable files', () => {
  const tree = PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: PROJECT_MCC_ATTEMPT_MARKER_CONTENT + '\n' },
    { marker: PROJECT_MCC_ATTEMPT_MARKER_CONTENT.replace(PROJECT_MCC_ATTEMPT_BASE_COMMIT, '3'.repeat(40)) },
    { marker: PROJECT_MCC_ATTEMPT_MARKER_CONTENT.replace('project-funded-mcc-one-attempt-20261005', 'different-release') },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: PROJECT_MCC_ATTEMPT_MARKER_CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...[MARKER_CONTENT, FUNDING_MARKER_CONTENT, READONLY_QUOTE_MARKER_CONTENT, MCC_ONE_ATTEMPT_MARKER_CONTENT, ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT].map(marker => ({ marker })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...PROJECT_MCC_ATTEMPT_REVIEWED_PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({
      tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`),
    }))),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('server/astraProjectBudget.ts', 'server/other.ts') },
    { tree: tree.replace('server/astraProjectBudget.ts', 'server/entitlements.ts') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectProjectMccAttempt(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('rebased project-funded MCC introduction cannot fall through to ordinary billing without its marker', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', ...projectMccAttemptIntroductions]) {
    assert.throws(() => selectProjectMccAttempt({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  assert.throws(() => selectProjectMccAttempt({ parent: '3'.repeat(40), changes: projectMccAttemptChanges.filter(change => change.path !== PROJECT_MCC_ATTEMPT_MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => selectProjectMccAttempt({ parent: '3'.repeat(40), changes: projectMccAttemptChanges.filter(change => ![PROJECT_MCC_ATTEMPT_MARKER_PATH, 'scripts/select-pipeline-only-release.mjs'].includes(change.path)) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['A', 'M', 'D', 'T']) {
    assert.throws(() => selectProjectMccAttempt({ parent: '3'.repeat(40), changes: [{ status, path: PROJECT_MCC_ATTEMPT_MARKER_PATH }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  for (const path of ['server/astraProjectBudget.ts', 'server/entitlements.ts', 'server/studio.ts', 'docs/ASTRA_PROJECT_BUDGET.md']) {
    const fixture = projectMccAttemptEvidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
    assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  }
})

test('the cabinet prompt and saved-attempt correction preserves billing and remote vars for its canonical fifteen-file package', () => {
  assert.deepEqual(selectCabinetContext(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(CABINET_CONTEXT_BASE_COMMIT, 'e36797e7b955ed3636a861caed842e576ed609c2')
  assert.equal(readFileSync(new URL('../' + CABINET_CONTEXT_MARKER_PATH, import.meta.url), 'utf8'), CABINET_CONTEXT_MARKER_CONTENT)
  assert.deepEqual(CABINET_CONTEXT_REVIEWED_PATHS, [
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
  for (const path of [...priorMarkers, PROJECT_MCC_ATTEMPT_MARKER_PATH, '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts',
    'server/billing.ts', 'server/studio.ts', 'server/entitlements.ts', 'server/astraProjectBudget.ts', 'wrangler.jsonc', 'package.json', 'package-lock.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']) {
    assert.equal(CABINET_CONTEXT_REVIEWED_PATHS.includes(path), false, path)
  }
})

test('cabinet context release refuses missing markers, wrong bases, missing history and any merge parent', () => {
  for (const overrides of [
    { changes: cabinetContextChanges.filter(change => change.path !== CABINET_CONTEXT_MARKER_PATH) },
    { changes: cabinetContextChanges.map(change => change.path === CABINET_CONTEXT_MARKER_PATH ? { ...change, path: 'ops/OTHER_RELEASE.json' } : change) },
    ...[BASE_COMMIT, FUNDING_BASE_COMMIT, READONLY_QUOTE_BASE_COMMIT, MCC_ONE_ATTEMPT_BASE_COMMIT, ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, '3'.repeat(40), null].map(parent => ({ parent })),
    { parents: `${head} ${CABINET_CONTEXT_BASE_COMMIT} ${'3'.repeat(40)}\n` },
    { parents: `${head}\n` },
    { parents: `${head} ${'3'.repeat(40)}\n` },
    { parent: CABINET_CONTEXT_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectCabinetContext(overrides))
})

test('cabinet context release refuses incomplete or expanded scope and every prior marker change', () => {
  for (const overrides of [
    ...['server/billing.ts', '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts', 'wrangler.jsonc',
      'ops/UNREVIEWED_RELEASE.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']
      .map(path => ({ changes: [...cabinetContextChanges, { status: 'A', path }] })),
    ...CABINET_CONTEXT_REVIEWED_PATHS.filter(path => path !== CABINET_CONTEXT_MARKER_PATH)
      .map(path => ({ changes: cabinetContextChanges.filter(change => change.path !== path) })),
    ...CABINET_CONTEXT_REVIEWED_PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({
      changes: cabinetContextChanges.map(change => change.path === path ? { ...change, status } : change),
    }))),
    ...[...priorMarkers, PROJECT_MCC_ATTEMPT_MARKER_PATH].flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...cabinetContextChanges, { status, path }] }))),
    { changes: [...cabinetContextChanges, cabinetContextChanges[0]] },
  ]) assert.throws(() => selectCabinetContext(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('cabinet context release requires canonical marker contents and regular non-executable files', () => {
  const tree = CABINET_CONTEXT_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: CABINET_CONTEXT_MARKER_CONTENT + '\n' },
    { marker: CABINET_CONTEXT_MARKER_CONTENT.replace(CABINET_CONTEXT_BASE_COMMIT, '3'.repeat(40)) },
    { marker: CABINET_CONTEXT_MARKER_CONTENT.replace('cabinet-prompt-and-attempt-context-20261005', 'different-release') },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: CABINET_CONTEXT_MARKER_CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...[MARKER_CONTENT, FUNDING_MARKER_CONTENT, READONLY_QUOTE_MARKER_CONTENT, MCC_ONE_ATTEMPT_MARKER_CONTENT, ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT].map(marker => ({ marker })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...CABINET_CONTEXT_REVIEWED_PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({
      tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`),
    }))),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('src/lib/studioProtocol.ts', 'src/lib/other.ts') },
    { tree: tree.replace('src/lib/studioProtocol.ts', 'src/pages/ShopPage.tsx') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectCabinetContext(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('rebased cabinet context preparation cannot fall through to ordinary billing without its marker', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs']) {
    assert.throws(() => selectCabinetContext({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  assert.throws(() => selectCabinetContext({ parent: '3'.repeat(40), changes: cabinetContextChanges.filter(change => change.path !== CABINET_CONTEXT_MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['A', 'M', 'D', 'T']) {
    assert.throws(() => selectCabinetContext({ parent: '3'.repeat(40), changes: [{ status, path: CABINET_CONTEXT_MARKER_PATH }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  for (const path of ['server/astraProjectBudget.ts', 'server/entitlements.ts', 'server/studio.ts', 'docs/ASTRA_PROJECT_BUDGET.md']) {
    const fixture = cabinetContextEvidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
    assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  }
})

test('the integrated generation recovery preserves billing and remote vars for its canonical 64-file package', () => {
  assert.deepEqual(selectGenerationRecovery(), { preserveBilling: true, preserveRemoteVars: true })
  assert.equal(GENERATION_RECOVERY_BASE_COMMIT, 'ee107329fdd73d3ebe7678643dc01971b1bd6930')
  assert.equal(readFileSync(new URL('../' + GENERATION_RECOVERY_MARKER_PATH, import.meta.url), 'utf8'), GENERATION_RECOVERY_MARKER_CONTENT)
  assert.deepEqual(GENERATION_RECOVERY_REVIEWED_PATHS, [
    '.dev.vars.example',
    'docs/CONTEST_STATUS.md',
    'docs/SOL61_BLUEPRINT_MIGRATION.md',
    GENERATION_RECOVERY_MARKER_PATH,
    'scripts/release-check.ts',
    'scripts/select-pipeline-only-release.mjs',
    'server/blueprintModelBinding.ts',
    'server/blueprintTerminalUsage.ts',
    'server/entitlements.ts',
    'server/studio.ts',
    'server/worker.ts',
    'src/components/GenerationProgressOrb.css',
    'src/components/GenerationProgressOrb.tsx',
    'src/components/GenerationSculpture.tsx',
    'src/components/StudioGallery.tsx',
    'src/lib/blueprint.ts',
    'src/lib/blueprintClient.ts',
    'src/lib/generationFunding.ts',
    'src/lib/generationProgressView.ts',
    'src/lib/modelCatalog.ts',
    'src/lib/studioClient.ts',
    'src/lib/studioLibrary.ts',
    'src/lib/studioProtocol.ts',
    'src/pages/GenerationFundingPage.tsx',
    'src/pages/InfoPage.tsx',
    'src/pages/PrivateGameLab.tsx',
    'src/pages/ShopPage.css',
    'src/pages/ShopPage.tsx',
    'tests/affordable-models.test.ts',
    'tests/blueprint-accounts.test.ts',
    'tests/blueprint-completed-provider-reconciliation.test.ts',
    'tests/blueprint-failed-provider-reconciliation.test.ts',
    'tests/blueprint-failed-reconciliation-native.test.mjs',
    'tests/blueprint-model-archive.test.mjs',
    'tests/blueprint-output-adjustment-preview.test.ts',
    'tests/blueprint-provider-reservation.test.ts',
    'tests/blueprint-repair.test.ts',
    'tests/budget.test.ts',
    'tests/contest-finish.test.mjs',
    'tests/core.test.ts',
    'tests/fixtures/sol61-legacy-client.ts',
    'tests/fixtures/sol61-legacy-worker.ts',
    'tests/game-lab-blueprint-recovery.test.mjs',
    'tests/generation-economics.test.ts',
    'tests/generation-funding-page.test.mjs',
    'tests/generation-profile-client.test.mjs',
    'tests/generation-progress-orb.test.mjs',
    'tests/generation-progress-view.test.ts',
    'tests/generation-sculpture-lifecycle.test.mjs',
    'tests/p0-astra.test.ts',
    'tests/pipeline-only-release.test.mjs',
    'tests/portal-generation-lifecycle.test.mjs',
    'tests/pricing-release-health.test.ts',
    'tests/prompt-model-ui.test.mjs',
    'tests/shop-draft-lifecycle.test.mjs',
    'tests/shop-external.test.mjs',
    'tests/shop-render-helper.mjs',
    'tests/sol61-blueprint-migration.test.ts',
    'tests/sol61-mixed-deployment.test.ts',
    'tests/studio-accounts.test.ts',
    'tests/studio-generation-timing.test.ts',
    'tests/studio-library-gallery.test.mjs',
    'tests/studio-library.test.ts',
    'wrangler.jsonc',
  ].sort())
  for (const path of [...priorMarkers, PROJECT_MCC_ATTEMPT_MARKER_PATH, CABINET_CONTEXT_MARKER_PATH, '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts',
    'server/billing.ts', 'server/accounts.ts', 'server/generationEconomics.ts', 'server/astraProjectBudget.ts', 'package.json', 'package-lock.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']) {
    assert.equal(GENERATION_RECOVERY_REVIEWED_PATHS.includes(path), false, path)
  }
})

test('integrated generation release refuses missing markers, wrong bases, missing history and any merge parent', () => {
  for (const overrides of [
    { changes: generationRecoveryChanges.filter(change => change.path !== GENERATION_RECOVERY_MARKER_PATH) },
    { changes: generationRecoveryChanges.map(change => change.path === GENERATION_RECOVERY_MARKER_PATH ? { ...change, path: 'ops/OTHER_RELEASE.json' } : change) },
    ...[BASE_COMMIT, FUNDING_BASE_COMMIT, READONLY_QUOTE_BASE_COMMIT, MCC_ONE_ATTEMPT_BASE_COMMIT, ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, '3'.repeat(40), null].map(parent => ({ parent })),
    { parents: `${head} ${GENERATION_RECOVERY_BASE_COMMIT} ${'3'.repeat(40)}\n` },
    { parents: `${head}\n` },
    { parents: `${head} ${'3'.repeat(40)}\n` },
    { parent: GENERATION_RECOVERY_BASE_COMMIT, changes: [] },
  ]) assert.throws(() => selectGenerationRecovery(overrides))
})

test('integrated generation release refuses incomplete or expanded scope and every prior marker change', () => {
  for (const overrides of [
    ...['server/billing.ts', '.github/workflows/cloudflare.yml', 'server/astraRepairedMccGrant.ts', 'server/accounts.ts',
      'ops/UNREVIEWED_RELEASE.json', 'ops/SOFTWARE_MODEL_PREVIEW_RELEASE_20261005.json']
      .map(path => ({ changes: [...generationRecoveryChanges, { status: 'A', path }] })),
    ...GENERATION_RECOVERY_REVIEWED_PATHS.filter(path => path !== GENERATION_RECOVERY_MARKER_PATH)
      .map(path => ({ changes: generationRecoveryChanges.filter(change => change.path !== path) })),
    ...GENERATION_RECOVERY_REVIEWED_PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({
      changes: generationRecoveryChanges.map(change => change.path === path ? { ...change, status } : change),
    }))),
    ...[...priorMarkers, PROJECT_MCC_ATTEMPT_MARKER_PATH, CABINET_CONTEXT_MARKER_PATH].flatMap(path => ['A', 'M', 'D', 'T'].map(status => ({ changes: [...generationRecoveryChanges, { status, path }] }))),
    { changes: [...generationRecoveryChanges, generationRecoveryChanges[0]] },
  ]) assert.throws(() => selectGenerationRecovery(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('integrated generation release requires canonical marker contents and regular non-executable files', () => {
  const tree = GENERATION_RECOVERY_REVIEWED_PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  for (const overrides of [
    { marker: GENERATION_RECOVERY_MARKER_CONTENT + '\n' },
    { marker: GENERATION_RECOVERY_MARKER_CONTENT.replace(GENERATION_RECOVERY_BASE_COMMIT, '3'.repeat(40)) },
    { marker: GENERATION_RECOVERY_MARKER_CONTENT.replace('generation-evidence-and-fair-usage-20261005', 'different-release') },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: GENERATION_RECOVERY_MARKER_CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...[MARKER_CONTENT, FUNDING_MARKER_CONTENT, READONLY_QUOTE_MARKER_CONTENT, MCC_ONE_ATTEMPT_MARKER_CONTENT, ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT].map(marker => ({ marker })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...GENERATION_RECOVERY_REVIEWED_PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({
      tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`),
    }))),
    { tree: tree.replace(`blob ${blob}`, `commit ${blob}`) },
    { tree: tree.replace('src/lib/studioProtocol.ts', 'src/lib/other.ts') },
    { tree: tree.replace('src/lib/studioProtocol.ts', 'src/pages/ShopPage.tsx') },
    { tree: tree.slice(0, -1) },
  ]) assert.throws(() => selectGenerationRecovery(overrides), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})

test('rebased integrated generation preparation cannot fall through to ordinary billing without its marker', () => {
  for (const path of ['scripts/select-pipeline-only-release.mjs', ...generationRecoveryIntroductions]) {
    assert.throws(() => selectGenerationRecovery({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  assert.throws(() => selectGenerationRecovery({ parent: '3'.repeat(40), changes: generationRecoveryChanges.filter(change => change.path !== GENERATION_RECOVERY_MARKER_PATH) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.throws(() => selectGenerationRecovery({ parent: '3'.repeat(40), changes: generationRecoveryChanges.filter(change => ![GENERATION_RECOVERY_MARKER_PATH, 'scripts/select-pipeline-only-release.mjs'].includes(change.path)) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['A', 'M', 'D', 'T']) {
    assert.throws(() => selectGenerationRecovery({ parent: '3'.repeat(40), changes: [{ status, path: GENERATION_RECOVERY_MARKER_PATH }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  }
  for (const path of ['server/astraProjectBudget.ts', 'server/entitlements.ts', 'server/studio.ts', 'docs/ASTRA_PROJECT_BUDGET.md']) {
    const fixture = generationRecoveryEvidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path }] })
    assert.deepEqual(selectPipelineReleaseOptions('fixture', fixture.readGit), { preserveBilling: false, preserveRemoteVars: false })
    assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  }
})

test('ordinary future releases retain the previous billing behavior without reading the stale marker', () => {
  const fixture = evidence({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] })
  assert.equal(selectPipelineOnlyRelease('fixture', fixture.readGit), false)
  assert.deepEqual(fixture.calls.map(args => args[0]), ['rev-parse', 'rev-parse', 'diff'])
  assert.equal(select({ parent: '3'.repeat(40), changes: [] }), false)
  assert.equal(selectFunding({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'src/lib/generationFunding.ts' }] }), false)
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence().readGit), { preserveBilling: true, preserveRemoteVars: false })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({ parent: FUNDING_BASE_COMMIT, changes: fundingChanges, markerPath: FUNDING_MARKER_PATH, marker: FUNDING_MARKER_CONTENT }).readGit), { preserveBilling: true, preserveRemoteVars: false })
  assert.deepEqual(selectPipelineReleaseOptions('fixture', evidence({ parent: '3'.repeat(40), changes: [] }).readGit), { preserveBilling: false, preserveRemoteVars: false })
})

test('missing history, malformed Git evidence and revision-like arguments cannot select a mode', () => {
  for (const overrides of [
    { parent: null }, { head: '--output=/tmp/unwanted' }, { parent: 'HEAD^1' },
    { raw: 'A\0' }, { raw: `A\0${MARKER_PATH}` },
  ]) assert.throws(() => select(overrides))
  const script = readFileSync(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url), 'utf8')
  assert.match(script, /GIT_NO_LAZY_FETCH: '1'/)
  assert.match(script, /GIT_NO_REPLACE_OBJECTS: '1'/)
  assert.doesNotMatch(script, /\.\.\.process\.env/)
})

test('actual local Git and CLI fail on missing history or extra arguments and reject unscoped ordinary commits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-release-'))
  const script = fileURLToPath(new URL('../scripts/select-pipeline-only-release.mjs', import.meta.url))
  // Only local fixtures, with a minimal environment: no provider, secrets or network.
  const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  function run(binary, args) { return spawnSync(binary, args, { cwd: directory, env, encoding: 'utf8', timeout: 15000 }) }
  function git(...args) { const result = run('git', args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(directory, 'README'), 'base\n')
    git('add', 'README')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'base')
    const missing = run(process.execPath, [script])
    assert.equal(missing.status, 1)
    assert.equal(missing.stdout, '')
    writeFileSync(join(directory, 'README'), 'ordinary future release\n')
    git('add', 'README')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'ordinary release')
    const ordinary = run(process.execPath, [script])
    assert.equal(ordinary.status, 1, ordinary.stderr)
    assert.equal(ordinary.stdout, '')
    assert.match(ordinary.stderr, /stopped before credential setup/)
    const poisoned = spawnSync(process.execPath, [script], {
      cwd: directory, encoding: 'utf8', timeout: 15000,
      env: { ...env, GIT_DIR: '/missing/git', GIT_WORK_TREE: '/missing/tree', GIT_INDEX_FILE: '/missing/index', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.repositoryformatversion', GIT_CONFIG_VALUE_0: '999' },
    })
    assert.equal(poisoned.status, 1, poisoned.stderr)
    assert.equal(poisoned.stdout, '')
    assert.match(poisoned.stderr, /stopped before credential setup/)
    const injection = run(process.execPath, [script, '--base', BASE_COMMIT])
    assert.equal(injection.status, 1)
    assert.equal(injection.stdout, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('workflow guards all five billing steps before credentials and keeps every other gate unchanged', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  const steps = workflow.split(/(?=^      - )/m).slice(1)
  const selectorIndex = steps.findIndex(step => step.includes('id: billing_scope'))
  const deployStep = steps.find(step => step.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.ok(selectorIndex > 0)
  assert.match(steps[0], /fetch-depth: 2/)
  assert.match(steps[selectorIndex], /run: node scripts\/select-pipeline-only-release\.mjs >> "\$GITHUB_OUTPUT"/)
  assert.doesNotMatch(steps[selectorIndex], /\n        if:|secrets\./)
  assert.ok(steps.findIndex(step => step.includes('release-check.ts credentials')) > selectorIndex)
  const billing = steps.filter(step => /connect-billing|prepare-stripe-portal|check-stripe-checkout|check-stripe-astra-checkouts|\/api\/billing\//.test(step))
  assert.equal(billing.length, 5)
  for (const step of billing) assert.match(step, /\n        if: steps\.billing_scope\.outputs\.preserve_billing == 'false'\n/)
  for (const step of steps.filter(step => !billing.includes(step) && step !== steps[selectorIndex] && step !== deployStep)) {
    if (!step.includes('name: Select reviewed deployment configuration')) assert.doesNotMatch(step, /billing_scope/)
    else assert.match(step, /steps\.billing_scope\.outputs\.compatible_mcc_rollback/)
    if (/secrets\./.test(step)) assert.ok(steps.indexOf(step) > selectorIndex)
  }
  for (const gate of ['npm run verify', './.github/actions/foundations', 'restore-detailed-studio-config.mjs', 'wrangler deploy --dry-run', 'wrangler deploy --config', 'release-check.ts smoke', 'status.costGuardReady,true', 'assert.equal(denied.status,401)', 'assert.equal(fundingDenied.status,401)', 'assert.equal(foreignFunding.status,403)']) assert.ok(workflow.includes(gate), gate)
})

test('only the guarded deploy preserves remote vars, suppresses private CLI output and retains its receipt', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  const step = workflow.split(/(?=^      - )/m).find(part => part.includes('name: Deploy reviewed WORLDIFACT release'))
  assert.ok(step)
  assert.match(step, /WRANGLER_OUTPUT_FILE_PATH: \$\{\{ runner\.temp \}\}\/worldifact-deploy\.ndjson/)
  const run = step.match(/        run: \|\n([\s\S]*?)        env:\n/)[1].replace(/^ {10}/gm, '')
  const directory = mkdtempSync(join(tmpdir(), 'readonly-quote-release-deploy-'))
  const capture = join(directory, 'invocation.json')
  const privateFixture = 'PRIVATE_FIXTURE_VALUE'
  try {
    mkdirSync(join(directory, 'bin'))
    const executable = join(directory, 'bin/npx')
    writeFileSync(executable, `#!${process.execPath}\n` + `
const fs = require('node:fs');
fs.writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify({
  args: process.argv.slice(2),
  log: process.env.WRANGLER_LOG,
  writeLogs: process.env.WRANGLER_WRITE_LOGS,
  metrics: process.env.WRANGLER_SEND_METRICS,
  errors: process.env.WRANGLER_SEND_ERROR_REPORTS,
}));
console.log(JSON.stringify({ private: '${privateFixture}', stream: 'stdout' }));
console.error(JSON.stringify({ private: '${privateFixture}', stream: 'stderr' }));
if (process.env.FIXTURE_EXIT === '0') fs.writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH,
  JSON.stringify({ type: 'deploy', version: 1, worker_name: 'worldifact', version_id: 'fixture-version',
    targets: ['https://worldifact.fixture.workers.dev'] }) + '\\n');
process.exit(Number(process.env.FIXTURE_EXIT));
`)
    chmodSync(executable, 0o755)
    for (const preserve of ['true', 'false']) {
      for (const exit of ['0', '7']) {
        const receipt = join(directory, `receipt-${preserve}-${exit}.ndjson`)
        const command = run.replaceAll('${{ steps.billing_scope.outputs.preserve_remote_vars }}', preserve)
          .replaceAll('${{ steps.mode.outputs.config }}', 'reviewed.wrangler.json')
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', command], {
          cwd: directory, encoding: 'utf8', timeout: 15000,
          env: { PATH: join(directory, 'bin') + ':' + process.env.PATH, FIXTURE_CAPTURE: capture,
            FIXTURE_EXIT: exit, WRANGLER_OUTPUT_FILE_PATH: receipt },
        })
        assert.equal(result.error, undefined)
        assert.equal(result.status, exit === '0' ? 0 : preserve === 'true' ? 1 : 7)
        const invocation = JSON.parse(readFileSync(capture, 'utf8'))
        assert.deepEqual(invocation.args, ['wrangler', 'deploy', '--config', 'reviewed.wrangler.json', ...(preserve === 'true' ? ['--keep-vars'] : [])])
        if (preserve === 'true') {
          assert.deepEqual({ ...invocation, args: undefined }, { args: undefined, log: 'none', writeLogs: 'false', metrics: 'false', errors: 'false' })
          assert.equal((result.stdout + result.stderr).includes(privateFixture), false)
          if (exit !== '0') assert.match(result.stdout, /::error::Deployment failed/)
        } else {
          assert.deepEqual(Object.keys(invocation), ['args'])
          assert.ok(result.stdout.includes(privateFixture))
          assert.ok(result.stderr.includes(privateFixture))
        }
        if (exit === '0') {
          const contents = readFileSync(receipt, 'utf8')
          assert.deepEqual(readDeployment(contents), { origin: 'https://worldifact.fixture.workers.dev', versionId: 'fixture-version' })
          assert.equal((result.stdout + result.stderr).includes('fixture-version'), false)
        } else assert.equal(existsSync(receipt), false)
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
