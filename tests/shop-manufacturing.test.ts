import assert from 'node:assert/strict'
import test from 'node:test'
import { CLIENT_SIZES_MM, ISS_SOURCE, clientOffer, scaledScreeningUsd } from '../src/lib/shopManufacturing.ts'

test('client manufacturing sizes cover 5–20 cm', () => {
  assert.deepEqual(CLIENT_SIZES_MM, [50, 75, 100, 125, 150, 175, 200])
})

test('stored 100 mm benchmarks are preserved and scaled only as estimates', () => {
  const plain = clientOffer('plastic', '3d-print', 'plain')
  const color = clientOffer('plastic', '3d-print', 'color')
  assert.equal(plain.status, 'ESTIMATE')
  assert.equal(color.status, 'ESTIMATE')
  assert.equal(scaledScreeningUsd(plain, 100), 2.72)
  assert.equal(scaledScreeningUsd(color, 100), 27.27)
  assert.equal(scaledScreeningUsd(plain, 200), 21.76)
})

test('unknown contractor combinations do not invent a price', () => {
  const wood = clientOffer('wood', 'cnc', 'plain')
  assert.equal(wood.status, 'QUOTE REQUIRED')
  assert.equal(scaledScreeningUsd(wood, 100), null)
})

test('ISS source remains validation-required after thin-wall warning', () => {
  assert.equal(ISS_SOURCE.nominalMm[0], 370)
  assert.equal(ISS_SOURCE.triangles, 469_984)
  assert.match(ISS_SOURCE.warning, /thin walls/i)
  assert.equal(ISS_SOURCE.astraStatus, 'PRINT-PREP PASS REQUIRED')
})
