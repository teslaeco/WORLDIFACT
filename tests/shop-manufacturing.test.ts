import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLIENT_SIZES_MM,
  ISS_RECORDED_QUOTE,
  ISS_SOURCE,
  MANUFACTURING_HARD_RULES,
  customerPriceForSelection,
  largestDimensionMm,
  sanitizeDimensions,
} from '../src/lib/shopManufacturing.ts'

test('client manufacturing sizes still cover 5–20 cm and custom XYZ are bounded', () => {
  assert.deepEqual(CLIENT_SIZES_MM, [50, 75, 100, 125, 150, 175, 200])
  assert.deepEqual(sanitizeDimensions({ xMm: 0, yMm: 123.456, zMm: 5000 }), { xMm: 5, yMm: 123.5, zMm: 1000 })
  assert.equal(largestDimensionMm({ xMm: 80, yMm: 120, zMm: 60 }), 120)
})

test('recorded ISS quote keeps the real observed values but is not sellable after thin-wall rejection', () => {
  assert.equal(ISS_RECORDED_QUOTE.printUsd, 213.53)
  assert.equal(ISS_RECORDED_QUOTE.observedShippingUsd, 55.72)
  assert.equal(ISS_RECORDED_QUOTE.maximumDimensionMm, 370)
  assert.equal(ISS_RECORDED_QUOTE.supplierAcceptedGeometry, false)
  assert.equal(ISS_RECORDED_QUOTE.finalPriceVerified, false)
})

test('customer pricing never invents or scales a supplier price', () => {
  const dimensions = { xMm: 370, yMm: 194.1, zMm: 227.3 }
  const blocked = customerPriceForSelection('plastic', '3d-print', 'color', dimensions, ISS_RECORDED_QUOTE)
  assert.equal(blocked.status, 'PENDING_VERIFIED_QUOTE')
  assert.equal(blocked.amountUsd, null)
  assert.equal(blocked.orderable, false)

  const approved = { ...ISS_RECORDED_QUOTE, supplierAcceptedGeometry: true, finalPriceVerified: true }
  const exact = customerPriceForSelection('plastic', '3d-print', 'color', dimensions, approved)
  assert.equal(exact.status, 'VERIFIED')
  assert.equal(exact.amountUsd, 213.53)
  assert.equal(exact.shippingUsd, 55.72)
  assert.equal(exact.orderable, true)

  const differentSize = customerPriceForSelection('plastic', '3d-print', 'color', { ...dimensions, xMm: 200 }, approved)
  assert.equal(differentSize.amountUsd, null)
})

test('ISS and every MAKE generation retain hard manufacturing validation rules', () => {
  assert.equal(ISS_SOURCE.nominalMm[0], 370)
  assert.equal(ISS_SOURCE.triangles, 469_984)
  assert.match(ISS_SOURCE.warning, /thin walls/i)
  assert.equal(ISS_SOURCE.validationStatus, 'VALIDATION REQUIRED')
  assert.match(MANUFACTURING_HARD_RULES, /non-manifold/i)
  assert.match(MANUFACTURING_HARD_RULES, /B2B manufacturing partner accepts that exact revision/i)
})
