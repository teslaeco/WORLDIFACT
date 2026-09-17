import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveWriteDecision, mayExportCurrentJob, previewFileName } from '../src/lib/studioView.ts'

const currentId = '12345678-1234-4234-8234-123456789abc'
const otherId = '87654321-1234-4234-8234-123456789abc'

test('an archived or stale preview cannot expose a different current job export', () => {
  assert.equal(mayExportCurrentJob(currentId, 'succeeded', { id: currentId, origin: 'job', label: 'current' }), true)
  assert.equal(mayExportCurrentJob(currentId, 'building', { id: currentId, origin: 'job', label: 'current' }), false)
  assert.equal(mayExportCurrentJob(currentId, 'succeeded', { id: otherId, origin: 'job', label: 'late old model' }), false)
  assert.equal(mayExportCurrentJob(currentId, 'succeeded', { id: otherId, origin: 'archive', label: 'archive' }), false)
  assert.equal(mayExportCurrentJob(currentId, 'succeeded', { id: currentId, origin: 'archive', label: 'archive' }), false)
  assert.equal(mayExportCurrentJob(undefined, 'succeeded', null), false)
})

test('explicit GLB filename follows the visible archive identity, not the selected job', () => {
  assert.equal(previewFileName({ id: otherId, origin: 'archive', label: 'archive model' }), `WORLDIFACT-${otherId}.glb`)
  assert.throws(() => previewFileName({ id: '../private', origin: 'job', label: 'invalid' }))
})

test('archive retries retain identical original bytes and refuse silently replacing another revision', () => {
  const original = { id: currentId, sha256: 'a'.repeat(64), byteLength: 1600 }
  assert.equal(archiveWriteDecision(undefined, original), 'insert')
  assert.equal(archiveWriteDecision(original, { ...original }), 'retain')
  assert.throws(() => archiveWriteDecision(original, { ...original, sha256: 'b'.repeat(64) }), /not overwritten/)
  assert.throws(() => archiveWriteDecision(original, { ...original, byteLength: 1601 }), /not overwritten/)
  assert.equal(original.sha256, 'a'.repeat(64))
})
