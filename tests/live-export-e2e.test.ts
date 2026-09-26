import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Oracle local E2E submits one job, never retries generation and verifies every customer format', async () => {
  const source = await readFile(new URL('../tools/export_prepare/oracle_worker_e2e.py', import.meta.url), 'utf8')
  assert.match(source, /posthocExportRevision/)
  assert.match(source, /legacyGlbExportRecoveryRevision/)
  assert.match(source, /automaticGenerationRetries":0/)
  assert.match(source, /for name in \("pbr","fbx","blend"\)/)
  assert.match(source, /"exports\/prepare"\s*,\s*"POST"/)
  assert.match(source, /E2E_PASS/)
  assert.doesNotMatch(source, /while True/)
})
test('Cloud Shell finisher uses new disconnect-safe maintenance and E2E modes', async () => {
  const source = await readFile(new URL('../tools/export_prepare/finish_and_verify.py', import.meta.url), 'utf8')
  assert.match(source, /--approve-one-live-test/)
  assert.match(source, /launcher\.call_remote\(key,"apply"/)
  assert.match(source, /launcher\.call_remote\(key,"e2e"/)
  assert.match(source, /"e2e-status"/)
  assert.match(source, /No automatic generation retry/)
  assert.match(source, /WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE/)
})