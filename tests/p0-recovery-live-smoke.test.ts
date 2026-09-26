import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('P0 recovery smoke uses one deterministic Oracle job and validates every requested artifact', async () => {
  const source=await readFile(new URL('../scripts/p0-recovery-live-smoke.mjs',import.meta.url),'utf8')
  assert.match(source,/2011ea5e-4545-4e9f-87d3-98d89ed4efc3/)
  assert.doesNotMatch(source,/randomUUID/)
  assert.match(source,/\/v1\/jobs\/\$\{JOB_ID\}/)
  assert.match(source,/explicit PBR image maps/i)
  assert.match(source,/\['pbr','fbx','blend'\]/)
  assert.match(source,/exports\/prepare/)
  assert.match(source,/WORLDIFACT_P0_RECOVERY_SMOKE_PASS/)
  assert.match(source,/Oracle returned an unrecognized 409; refusing to retry/)
  assert.doesNotMatch(source,/console\.log\([^\n]*(TOKEN|ORACLE_API_TOKEN)/)
})

test('one-time recovery workflow is gated by the exact marker and production secrets stay in env only', async () => {
  const source=await readFile(new URL('../.github/workflows/p0-recovery-live-smoke-once.yml',import.meta.url),'utf8')
  assert.match(source,/workflow_run:/)
  assert.match(source,/ops\/P0_FULL_RECOVERY_SMOKE_20260926/)
  assert.match(source,/scripts\/p0-recovery-live-smoke\.mjs/)
  assert.match(source,/secrets\.ORACLE_ENDPOINT/)
  assert.match(source,/secrets\.ORACLE_API_TOKEN/)
  assert.doesNotMatch(source,/workflow_dispatch:/)
})
