import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewedLiveHealth } from '../scripts/release-check.ts'

test('release smoke accepts the reviewed Sol migration and historical Astra health only', () => {
  for (const model of ['gpt-6.1-sol', 'gpt-6-astra']) assert.equal(reviewedLiveHealth({ mode: 'READY', generationReady: true, model }), true)
  for (const model of [null, 'unreviewed', 'gpt-6.1-sol-extra']) assert.equal(reviewedLiveHealth({ mode: 'READY', generationReady: true, model }), false)
  assert.equal(reviewedLiveHealth({ mode: 'READY', generationReady: false, model: 'gpt-6.1-sol' }), false)
  assert.equal(reviewedLiveHealth({ mode: 'DEMO', generationReady: true, model: 'gpt-6.1-sol' }), false)
})
