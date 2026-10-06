import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildLiveGenerationConfig } from '../scripts/build-live-generation-config.ts'

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

test('ongoing LIVE config is derived from disabled base without cumulative quota or launch expiry', () => {
  const config = buildLiveGenerationConfig(base)
  assert.equal(config.vars.OPENAI_MODEL, 'gpt-6-astra')
  assert.equal(config.vars.ENABLE_PAID_GENERATION, 'true')
  assert.equal(config.vars.PUBLIC_PILOT, 'true')
  assert.equal(config.vars.ENABLE_ORACLE_JOBS, 'true')
  assert.equal(config.vars.ENABLE_STUDIO_JOBS, 'true')
  assert.equal(config.vars.ENABLE_APPROVED_FAST_TEST, 'false')
  assert.equal(config.vars.GENERATION_REQUEST_LIMIT, 'unlimited')
  assert.equal(config.vars.GENERATION_EXPIRES_AT, '')
  assert.equal(base.vars.ENABLE_PAID_GENERATION, 'false')
})

test('ongoing LIVE config refuses an altered production base', () => {
  assert.throws(() => buildLiveGenerationConfig({ ...base, vars: { ...base.vars, PUBLIC_PILOT: 'true' } }), /reviewed disabled production base/)
})

test('Cloudflare release selects the ongoing marker, not the expired contest marker', async () => {
  const workflow = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
  assert.match(workflow, /ops\/LIVE_GENERATION_ONGOING_20260919/)
  assert.match(workflow, /build-live-generation-config\.ts/)
  assert.doesNotMatch(workflow, /build-contest-live-config\.ts/)
})
