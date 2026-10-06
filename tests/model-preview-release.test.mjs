import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MODEL_PREVIEW_BASE_COMMIT as BASE, MODEL_PREVIEW_MARKER_PATH as MARKER,
  MODEL_PREVIEW_MARKER_CONTENT as CONTENT, MODEL_PREVIEW_REVIEWED_PATHS as PATHS,
  selectPipelineReleaseOptions,
} from '../scripts/select-pipeline-only-release.mjs'

const head = '1'.repeat(40), blob = '2'.repeat(40)
const changes = PATHS.map(path => ({ path, status: path === MARKER || ["src/lib/softwareModelPreview.ts", "tests/model-preview-release.test.mjs", "tests/oracle-model-preview-lifecycle.test.mjs", "tests/software-model-preview.test.ts"].includes(path) ? 'A' : 'M' }))
function select(overrides = {}) {
  const value = { parent: BASE, changes, parents: null, marker: CONTENT, mode: '100644', tree: null, ...overrides }
  return selectPipelineReleaseOptions('fixture', (_cwd, args) => {
    if (args[0] === 'rev-parse') return (args.at(-1) === 'HEAD^{commit}' ? head : value.parent) + '\n'
    if (args[0] === 'diff') return value.changes.map(({ status, path }) => `${status}\0${path}\0`).join('')
    if (args[0] === 'rev-list') return value.parents ?? `${head} ${value.parent}\n`
    if (args[0] === 'ls-tree') return args.length > 5
      ? value.tree ?? PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
      : `${value.mode} blob ${blob}\t${MARKER}\0`
    assert.deepEqual(args, ['cat-file', 'blob', blob]); return value.marker
  })
}
test('preview repair requires the deployed Shop parent and canonical ten-file scope to preserve billing and vars', () => {
  assert.equal(BASE, '62f9fa9277c7923ed40fd11decfd4630f1043cae')
  assert.equal(readFileSync(new URL('../' + MARKER, import.meta.url), 'utf8'), CONTENT)
  assert.deepEqual(PATHS, ["docs/CONTEST_STATUS.md", "ops/MODEL_PREVIEW_RELEASE_20261006.json", "scripts/select-pipeline-only-release.mjs", "src/components/OracleModelPreview.tsx", "src/components/StudioGallery.tsx", "src/lib/softwareModelPreview.ts", "tests/model-preview-release.test.mjs", "tests/oracle-model-preview-lifecycle.test.mjs", "tests/software-model-preview.test.ts", "tests/studio-library-gallery.test.mjs"].sort())
  assert.deepEqual(select(), { preserveBilling: true, preserveRemoteVars: true })
})
test('wrong parents, extra merge parents and every missing or expanded path fail before credential setup', () => {
  const invalid = [
    ...['d229a3e37f37bd85476dc3d8d969dd49fdae488d', '3'.repeat(40), ''].map(parent => ({ parent })),
    { parents: `${head} ${BASE} ${'3'.repeat(40)}\n` },
    ...PATHS.map(path => ({ changes: changes.filter(change => change.path !== path) })),
    ...['server/billing.ts', 'server/entitlements.ts', 'server/overnightTestBudget.ts', 'server/studio.ts', 'src/lib/account.tsx', 'wrangler.jsonc', '.github/workflows/cloudflare.yml', 'ops/SHOP_TEST_FUNDING_RELEASE_20261006.json'].map(path => ({ changes: [...changes, { status: 'M', path }] })),
    { changes: [...changes, changes[0]] },
    ...PATHS.flatMap(path => ['D', 'T', 'R100'].map(status => ({ changes: changes.map(change => change.path === path ? { ...change, status } : change) }))),
  ]
  for (const fixture of invalid) assert.throws(() => select(fixture), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})
test('marker content and regular-file checks cannot authorize a changed release', () => {
  const tree = PATHS.map(path => `100644 blob ${blob}\t${path}\0`).join('')
  const invalid = [{ marker: CONTENT + '\n' }, { marker: CONTENT.replace(BASE, '3'.repeat(40)) }, { marker: '{}' },
    ...['preserveBilling', 'preserveRemoteVars'].map(key => ({ marker: CONTENT.replace(`"${key}": true`, `"${key}": false`) })),
    ...['100755', '120000', '160000'].map(mode => ({ mode })),
    ...PATHS.flatMap(path => ['100755', '120000', '160000'].map(mode => ({ tree: tree.replace(`100644 blob ${blob}\t${path}\0`, `${mode} blob ${blob}\t${path}\0`) }))),
    { tree: tree.slice(0, -1) }, { tree: tree.replace('blob', 'commit') }]
  for (const fixture of invalid) assert.throws(() => select(fixture), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
})
test('markerless rebased preview additions cannot fall back to the ordinary financial workflow', () => {
  for (const path of ["scripts/select-pipeline-only-release.mjs", "src/lib/softwareModelPreview.ts", "tests/model-preview-release.test.mjs", "tests/oracle-model-preview-lifecycle.test.mjs", "tests/software-model-preview.test.ts"])
    assert.throws(() => select({ parent: '3'.repeat(40), changes: [{ status: 'A', path }] }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  for (const status of ['M', 'D', 'T']) assert.throws(() => select({ changes: changes.map(change => change.path === MARKER ? { ...change, status } : change) }), /PIPELINE_RELEASE_SCOPE_NOT_VERIFIED/)
  assert.deepEqual(select({ parent: '3'.repeat(40), changes: [{ status: 'M', path: 'README.md' }] }), { preserveBilling: false, preserveRemoteVars: false })
})
