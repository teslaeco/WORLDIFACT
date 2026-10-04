import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildLiveGenerationConfig } from '../scripts/build-live-generation-config.ts'
import { HISTORICAL_STUDIO_POLICY, studioNewJobPolicy } from '../src/lib/studioNewJobPolicy.ts'

test('missing policy never silently re-enables higher new-job terms', () => {
  assert.equal(studioNewJobPolicy(undefined), HISTORICAL_STUDIO_POLICY)
  assert.equal(studioNewJobPolicy(HISTORICAL_STUDIO_POLICY), HISTORICAL_STUDIO_POLICY)
  assert.equal(studioNewJobPolicy('tiered-v1'), 'tiered-v1')
  for (const value of [null, '', true, 175, {}, 'legacy-usd200-v1', 'TIERED-V1']) assert.equal(studioNewJobPolicy(value), null)
})

test('the normal production config generator preserves the explicit historical new-job policy and storage bindings', async () => {
  const base = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.equal(base.vars.STUDIO_NEW_JOB_POLICY, HISTORICAL_STUDIO_POLICY)
  const live = buildLiveGenerationConfig(base)
  assert.equal(live.vars?.STUDIO_NEW_JOB_POLICY, HISTORICAL_STUDIO_POLICY)
  assert.deepEqual(live.durable_objects, base.durable_objects)
  assert.deepEqual(live.migrations, base.migrations)
  assert.equal(base.vars.ENABLE_PAID_GENERATION, 'false')
})
