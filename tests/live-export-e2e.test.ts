import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('live export E2E script is explicit, bounded and verifies all customer formats', async () => {
  const source = await readFile(new URL('../scripts/live-export-e2e.mjs', import.meta.url), 'utf8')
  assert.match(source, /posthocExportRevision === 2/)
  assert.match(source, /legacyGlbExportRecoveryRevision === 1/)
  assert.match(source, /generationProfile: 'fast-draft-v1'/)
  assert.match(source, /\['model','pbr','fbx','blend'\]/)
  assert.match(source, /WORLDIFACT_EXPORT_E2E_PASS/)
  assert.doesNotMatch(source, /while \(true\)/)
})
test('Cloud Shell finisher requires explicit one-live-test approval and reuses reviewed launcher', async () => {
  const source = await readFile(new URL('../tools/export_prepare/finish_and_verify.py', import.meta.url), 'utf8')
  assert.match(source, /--approve-one-live-test/)
  assert.match(source, /oracle_direct_export_fix/)
  assert.match(source, /posthocExportRevision/)
  assert.match(source, /live-export-e2e\.mjs/)
  assert.match(source, /do not retry generation automatically/i)
})
