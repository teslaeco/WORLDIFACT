import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Metadata-only pilot. Never manufacture, invoice, generate or fetch an external URL.
const pilot = JSON.parse(readFileSync(new URL('../public/pilots/ecomech-chili-v3/manifest.json', import.meta.url), 'utf8'))

test('EcoMech V3 keeps honest AI and geometry provenance without pretending to host a model', () => {
  assert.equal(pilot.revision, 'worldifact-pilot-3d-v1')
  assert.equal(pilot.status, 'DEMO_UNREVIEWED')
  assert.equal(pilot.aiDirector, 'NONE')
  assert.equal(pilot.geometryEngine, 'Python trimesh')
  assert.equal(pilot.modelProviderConfirmed, false)
  assert.equal(pilot.deployment.productionPublished, false)
  assert.equal(pilot.deployment.publicModelUrl, null)
  assert.equal(pilot.game.originalBinaryInRepository, false)
  assert.equal(pilot.billing.customerPointsCharged, 0)
  assert.equal(pilot.billing.paidProviderCalls, 0)
  for (const file of [pilot.game, pilot.make]) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/)
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0)
    assert.ok(Number.isSafeInteger(file.triangles) && file.triangles > 0)
    assert.ok(!('downloadUrl' in file), 'No fake CDN/model links before real upload')
  }
  assert.equal(createHash('sha256').update('not an original GLB').digest('hex') === pilot.game.sha256, false)
})
test('EcoMech MAKE must never automatically enable paid supplier orders from watertight geometry', () => {
  assert.equal(pilot.make.status, 'CANDIDATE_UNREVIEWED')
  assert.deepEqual(pilot.make.extentsMm, [118.48, 78.23, 180])
  assert.equal(pilot.make.watertight, true)
  assert.equal(pilot.make.connectedComponents, 1)
  for (const gate of ['wallThicknessChecked', 'supportChecked', 'supplierApproved', 'orderPlaced', 'printSampleMade','fullColorPackage'])
    assert.equal(pilot.make[gate], false)
  assert.equal(pilot.b2b.quoteVerified, false)
  assert.equal(pilot.b2b.apiProductionIntegrationVerified, false)
  assert.equal(pilot.b2b.directOrderEnabled, false)
  assert.equal(pilot.b2b.supplierRequirements.slaWallMmAround200, 2)
  assert.equal(pilot.b2b.supplierRequirements.wjpWallMmAround200, 3)
  assert.ok(pilot.b2b.supplierRequirements.jlcFullColorFormats.includes('OBJ+MTL+PNG'))
  assert.ok(pilot.b2b.supplierRequirements.jlcResinMonoFormats.includes('STL'))
})
