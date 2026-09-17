import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvedStudioConfig, APPROVED_CEILING, APPROVED_EXPIRY } from '../scripts/resume-approved-studio.mjs'
const base = { name: 'worldifact', vars: { OPENAI_MODEL: 'gpt-6-astra', ENABLE_PAID_GENERATION: 'false', ENABLE_ORACLE_JOBS: 'false', PUBLIC_PILOT: 'false', GENERATION_REQUEST_LIMIT: '0', GENERATION_EXPIRES_AT: '' }, durable_objects: { bindings: [{ name: 'GENERATION_BUDGET', class_name: 'GenerationBudget' }] } }
const ready = { oracle: 'CONNECTOR_READY', photoReady: true, allowance: { used: 5 } }
const now = Date.parse('2026-09-17T08:00:00Z')
test('hotfix preserves exactly six cumulative attempts, original deadline and signed Studio isolation', () => {
  const original = structuredClone(base), result = approvedStudioConfig(base, ready, now)
  assert.equal(APPROVED_CEILING, 6); assert.equal(result.eligible, true); assert.equal(result.remaining, 1)
  assert.equal(result.config.vars.GENERATION_REQUEST_LIMIT, '6')
  assert.equal(result.config.vars.GENERATION_EXPIRES_AT, '2026-09-17T09:23:37.535Z')
  assert.ok(Date.parse(result.config.vars.GENERATION_EXPIRES_AT) - now < 180 * 60_000)
  assert.equal(result.config.vars.ENABLE_STUDIO_JOBS, 'true')
  assert.equal(result.config.vars.ENABLE_ORACLE_JOBS, 'false')
  assert.equal(result.config.vars.ENABLE_PAID_GENERATION, 'false')
  assert.deepEqual(base, original); assert.deepEqual(result.config.durable_objects, original.durable_objects)
})
test('exhausted, missing or untrusted counters never create another generation allowance', () => {
  for (const used of [6, 7, 500, -1, NaN, undefined, '5']) {
    const result = approvedStudioConfig(base, { ...ready, allowance: { used } }, now)
    assert.equal(result.eligible, false); assert.equal(result.config, undefined)
  }
})
test('unknown Oracle/photo readiness and unreviewed base configuration cannot be enabled', () => {
  for (const status of [{ ...ready, oracle: 'NOT_VERIFIED_READY' }, { ...ready, photoReady: false }]) assert.equal(approvedStudioConfig(base, status, now).eligible, false)
  assert.throws(() => approvedStudioConfig({ ...base, vars: { ...base.vars, GENERATION_REQUEST_LIMIT: '100' } }, ready, now))
})
test('repeated hotfix publication does not extend the deadline and cannot reopen an expired window', () => {
  const end = Date.parse(APPROVED_EXPIRY)
  for (const at of [now, now + 30 * 60_000, end - 1]) {
    const result = approvedStudioConfig(base, ready, at)
    assert.equal(result.eligible, true)
    assert.equal(result.config.vars.GENERATION_EXPIRES_AT, APPROVED_EXPIRY)
    assert.equal(result.remaining, 1)
  }
  for (const at of [end, end + 1, end + 86400_000, NaN, Infinity]) {
    const result = approvedStudioConfig(base, ready, at)
    assert.equal(result.eligible, false)
    assert.equal(result.reason, 'ORIGINAL_WINDOW_ENDED')
    assert.equal(result.config, undefined)
  }
})
