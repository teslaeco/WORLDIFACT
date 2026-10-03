import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dotsReviewConfig } from '../scripts/build-dots-review-config.mjs'

test('Dots review is isolated from production credentials, account ledgers and paid generation', () => {
  const base = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  base.vars.OPENAI_API_KEY = 'must-not-copy'
  base.vars.ORACLE_API_TOKEN = 'must-not-copy'
  base.vars.STRIPE_SECRET_KEY = 'must-not-copy'
  const review = dotsReviewConfig(base)
  assert.equal(review.name, 'worldifact-dots-review')
  assert.notEqual(review.vars.MCP_RESOURCE_URL, base.vars.MCP_RESOURCE_URL)
  assert.deepEqual(review.kv_namespaces, [{ binding: 'OAUTH_KV' }])
  assert.equal(review.durable_objects, undefined)
  assert.equal(review.migrations, undefined)
  for (const key of ['ENABLE_PAID_GENERATION', 'ENABLE_STUDIO_JOBS', 'ENABLE_ORACLE_JOBS', 'ENABLE_BILLING']) assert.equal(review.vars[key], 'false')
  assert.doesNotMatch(JSON.stringify(review), /must-not-copy/)
  assert.deepEqual(review.assets, base.assets)
  assert.throws(() => dotsReviewConfig({ name: 'unexpected' }))
})
