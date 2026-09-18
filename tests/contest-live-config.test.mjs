import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContestLiveConfig, CONTEST_LIVE_CEILING, CONTEST_LIVE_EXPIRES_AT } from '../scripts/build-contest-live-config.ts'

const base = {
  name: 'worldifact',
  vars: {
    OPENAI_MODEL: 'gpt-6-astra',
    ENABLE_PAID_GENERATION: 'false',
    PUBLIC_PILOT: 'false',
    ENABLE_ORACLE_JOBS: 'false',
    GENERATION_REQUEST_LIMIT: '0',
    GENERATION_EXPIRES_AT: '',
    ENABLE_APPROVED_FAST_TEST: 'true',
  },
}

test('contest LIVE config is derived only from the disabled reviewed base and keeps a fixed cumulative ceiling', () => {
  const config = buildContestLiveConfig(base, Date.parse('2026-09-18T00:00:00Z'))
  assert.equal(CONTEST_LIVE_CEILING, 50)
  assert.equal(config.vars.OPENAI_MODEL, 'gpt-6-astra')
  assert.equal(config.vars.ENABLE_PAID_GENERATION, 'true')
  assert.equal(config.vars.PUBLIC_PILOT, 'true')
  assert.equal(config.vars.ENABLE_ORACLE_JOBS, 'true')
  assert.equal(config.vars.ENABLE_STUDIO_JOBS, 'true')
  assert.equal(config.vars.ENABLE_APPROVED_FAST_TEST, 'false')
  assert.equal(config.vars.GENERATION_REQUEST_LIMIT, '50')
  assert.equal(config.vars.GENERATION_EXPIRES_AT, CONTEST_LIVE_EXPIRES_AT)
  assert.equal(base.vars.ENABLE_PAID_GENERATION, 'false')
})

test('contest LIVE config refuses altered production bases and expired activation', () => {
  assert.throws(() => buildContestLiveConfig({ ...base, vars: { ...base.vars, PUBLIC_PILOT: 'true' } }, Date.parse('2026-09-18T00:00:00Z')), /reviewed disabled production base/)
  assert.throws(() => buildContestLiveConfig(base, Date.parse(CONTEST_LIVE_EXPIRES_AT)), /window has ended/)
})
