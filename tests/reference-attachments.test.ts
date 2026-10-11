import test from 'node:test'
import assert from 'node:assert/strict'
import { REFERENCE_TOTAL_BYTES, validateReferenceSelection } from '../src/lib/referenceAttachments.ts'
const file = (size: number) => ({ size, type: 'image/jpeg' })
test('four attachments and exactly 40 MB are allowed across selections; fifth file and extra byte rejected', () => {
  assert.doesNotThrow(() => validateReferenceSelection([], [file(REFERENCE_TOTAL_BYTES)]))
  assert.doesNotThrow(() => validateReferenceSelection([file(10 * 1024 * 1024)], Array(3).fill(file(10 * 1024 * 1024))))
  assert.throws(() => validateReferenceSelection(Array(4).fill(file(1)), [file(1)]), /4/)
  assert.throws(() => validateReferenceSelection([file(REFERENCE_TOTAL_BYTES)], [file(1)]), /40 MB/)
  for (const invalid of [{size:1,type:'image/svg+xml'},file(0),file(-1),file(NaN),file(1.5)]) assert.throws(() => validateReferenceSelection([], [invalid]))
})
