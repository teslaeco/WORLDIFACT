import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Oracle E2E persists one job id and resumes it instead of creating a second generation', async () => {
  const source = await readFile(new URL('../tools/export_prepare/oracle_worker_e2e.py', import.meta.url), 'utf8')
  assert.match(source, /worldifact-direct-export-v4\/e2e/)
  assert.match(source, /prior\.get\("phase"\)=="E2E_RUNNING"/)
  assert.match(source, /JOB_ID=prior\["jobId"\]/)
  assert.match(source, /json_request\("\/v1\/jobs\/"\+JOB_ID/)
  assert.match(source, /json_request\("\/v1\/jobs","POST",\{"id":JOB_ID/)
  assert.match(source, /automaticGenerationRetries":0/)
  assert.match(source, /deadline=time\.monotonic\(\)\+900/)
  assert.match(source, /\/exports\/prepare"\s*,\s*"POST"/)
  assert.match(source, /for name in \("pbr","fbx","blend"\)/)
  assert.match(source, /E2E_PASS/)
})

test('v4 launcher no longer depends on transient systemd-run and returns exact installer output', async () => {
  const source = await readFile(new URL('../tools/export_prepare/oracle_direct_export_fix.py', import.meta.url), 'utf8')
  assert.match(source, /worldifact-direct-export-v4/)
  assert.match(source, /run_installer/)
  assert.match(source, /install_direct_v33_export_v3\.py/)
  assert.match(source, /capture_output=True/)
  assert.match(source, /INVALID_INSTALLER_OUTPUT/)
  assert.doesNotMatch(source, /systemd-run/)
  assert.doesNotMatch(source, /maintenanceService/)
})

test('Cloud Shell finisher runs maintenance then the resumable same-job E2E path', async () => {
  const source = await readFile(new URL('../tools/export_prepare/finish_and_verify.py', import.meta.url), 'utf8')
  assert.match(source, /--approve-one-live-test/)
  assert.match(source, /launcher\.call_remote\(key,"apply"/)
  assert.match(source, /launcher\.call_remote\(key,"e2e"/)
  assert.match(source, /Starting\/resuming the SAME one-job E2E test/)
  assert.match(source, /no second model is created/i)
  assert.match(source, /WORLDIFACT_EXPORT_E2E_PASS/)
  assert.match(source, /WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE/)
})

test('Oracle maintenance waits for active jobs without cancelling or mutating them', async () => {
  const source = await readFile(new URL('../tools/export_prepare/oracle_direct_export_fix.py', import.meta.url), 'utf8')
  const finisher = await readFile(new URL('../tools/export_prepare/finish_and_verify.py', import.meta.url), 'utf8')
  assert.match(source, /def active_jobs_snapshot\(\):/)
  assert.match(source, /mode=ro/)
  assert.match(source, /def wait_idle\(max_seconds=1500\):/)
  assert.match(source, /"phase":"ACTIVE_TIMEOUT"/)
  assert.match(source, /elif MODE=="wait-idle"/)
  assert.doesNotMatch(source, /UPDATE jobs SET state/)
  assert.match(finisher, /call_remote\(key,"wait-idle"/)
  assert.match(finisher, /never cancelled automatically/i)
  assert.match(finisher, /Nothing was cancelled or changed/)
})
