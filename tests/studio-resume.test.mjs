import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvedStudioConfig, APPROVED_CEILING, APPROVED_EXPIRES_AT } from '../scripts/resume-approved-studio.mjs'
const base = { name: 'worldifact', vars: { OPENAI_MODEL: 'gpt-6-astra', ENABLE_PAID_GENERATION: 'false', ENABLE_ORACLE_JOBS: 'false', PUBLIC_PILOT: 'false', GENERATION_REQUEST_LIMIT: '0', GENERATION_EXPIRES_AT: '' }, durable_objects: { bindings: [{ name: 'GENERATION_BUDGET', class_name: 'GenerationBudget' }] } }
const ready = { oracle: 'CONNECTOR_READY', photoReady: true, allowance: { used: 5 } }
const originalStart = Date.parse('2026-09-17T06:23:37.535Z')
test('resume keeps exactly six cumulative attempts and only the signed Studio entry active', () => {
  const original = structuredClone(base), result = approvedStudioConfig(base, ready, originalStart)
  assert.equal(APPROVED_CEILING, 6); assert.equal(result.eligible, true); assert.equal(result.remaining, 1)
  assert.equal(result.config.vars.GENERATION_REQUEST_LIMIT, '6')
  assert.equal(result.config.vars.GENERATION_EXPIRES_AT, APPROVED_EXPIRES_AT)
  assert.equal(Date.parse(result.config.vars.GENERATION_EXPIRES_AT) - originalStart, 180 * 60_000)
  assert.equal(result.config.vars.ENABLE_STUDIO_JOBS, 'true')
  assert.equal(result.config.vars.ENABLE_ORACLE_JOBS, 'false')
  assert.equal(result.config.vars.ENABLE_PAID_GENERATION, 'false')
  assert.deepEqual(base, original); assert.deepEqual(result.config.durable_objects, original.durable_objects)
})
test('exhausted, missing or untrusted counters never create another generation allowance', () => {
  for (const used of [6, 7, 500, -1, NaN, undefined, '5']) {
    const result = approvedStudioConfig(base, { ...ready, allowance: { used } }, originalStart)
    assert.equal(result.eligible, false); assert.equal(result.config, undefined)
  }
})
test('unknown Oracle/photo readiness and unreviewed base configuration cannot be enabled', () => {
  for (const status of [{ ...ready, oracle: 'NOT_VERIFIED_READY' }, { ...ready, photoReady: false }]) assert.equal(approvedStudioConfig(base, status, originalStart).eligible, false)
  assert.throws(() => approvedStudioConfig({ ...base, vars: { ...base.vars, GENERATION_REQUEST_LIMIT: '100' } }, ready, originalStart))
})
test('later redeployments preserve the original absolute deadline rather than rearm for 180 minutes', () => {
  for (const minutes of [1, 90, 179]) {
    const now = originalStart + minutes * 60_000, result = approvedStudioConfig(base, ready, now)
    assert.equal(result.eligible, true)
    assert.equal(result.remaining, 1)
    assert.equal(result.config.vars.GENERATION_EXPIRES_AT, '2026-09-17T09:23:37.535Z')
    assert.ok(Date.parse(result.config.vars.GENERATION_EXPIRES_AT) - now < 180 * 60_000)
  }
})
test('expired or invalid clocks cannot renew the original window even with an unused slot', () => {
  for (const now of [Date.parse(APPROVED_EXPIRES_AT), Date.parse(APPROVED_EXPIRES_AT) + 1, Date.parse('2027-01-01T00:00:00Z'), NaN, Infinity]) {
    const result = approvedStudioConfig(base, ready, now)
    assert.equal(result.eligible, false)
    assert.equal(result.reason, 'ORIGINAL_WINDOW_EXPIRED')
    assert.equal(result.config, undefined)
  }
})
