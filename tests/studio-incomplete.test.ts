import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STUDIO_INCOMPLETE_CAPACITY, STUDIO_INCOMPLETE_REVISION, STUDIO_INCOMPLETE_INDEX_KEY,
  readStudioIncompleteRecord, readStudioIncompleteIndex, addStudioIncompleteIndex,
} from '../src/lib/studioIncomplete.ts'

const id = (n: number) => `${n.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
const selected = { revision: 'studio-execution-v1', model: 'sol', mode: 'standard' }
const evidence = { revision: 'studio-provider-evidence-v1', model: 'gpt-6.1-sol', mode: 'standard', source: 'oracle-terminal-budget' }
const candidate = { revision: STUDIO_INCOMPLETE_REVISION, id: id(1),
  modelSha256: 'a'.repeat(64), at: Date.now(), failureCode: 'MODEL_BUDGET_EXCEEDED',
  studioExecution: selected, providerEvidence: evidence }

test('an unfinished GLB record is distinct from success, holds exact real model and accepts only matched Oracle evidence', () => {
  assert.deepEqual(readStudioIncompleteRecord(candidate), candidate)
  for (const bad of [
    { ...candidate, modelSha256: 'not-a-glb-hash' },
    { ...candidate, failureCode: 'finished' },
    { ...candidate, studioExecution: { ...selected, model: 'unknown' } },
    { ...candidate, providerEvidence: { ...evidence, model: 'gpt-6-luna' } },
    { ...candidate, providerEvidence: { ...evidence, source: 'frontend' } },
    { ...candidate, id: 'other-account' },
    { ...candidate, injected: 'fake success' },
    null, {}, [],
  ]) assert.equal(readStudioIncompleteRecord(bad), null)
  const { providerEvidence: _ignored, ...withoutProof } = candidate
  assert.deepEqual(readStudioIncompleteRecord(withoutProof), withoutProof)
})

test('incomplete index is bounded, rejects forgery and remains idempotent by original job id', () => {
  let idx: unknown = undefined
  for (let i = 1; i <= 45; i++) idx = addStudioIncompleteIndex(idx, id(i))
  const valid = readStudioIncompleteIndex(idx)
  assert.equal(STUDIO_INCOMPLETE_INDEX_KEY, 'studio-incomplete-index-v1')
  assert.equal(valid?.ids.length, STUDIO_INCOMPLETE_CAPACITY)
  assert.equal(valid?.ids[0], id(45))
  assert.equal(valid?.ids.at(-1), id(22))
  assert.deepEqual(addStudioIncompleteIndex(idx, id(45)), idx)
  for (const bad of [null, {}, 'archive', { revision: 'studio-incomplete-index-v1', ids: [id(1), id(1)] },
    { revision: 'studio-incomplete-index-v1', ids: [id(1)], other: true },
    { revision: 'studio-incomplete-index-v1', ids: [id(1), 'unknown'] }]) {
    assert.equal(readStudioIncompleteIndex(bad), null)
    assert.equal(addStudioIncompleteIndex(bad, id(46)), null)
  }
})
