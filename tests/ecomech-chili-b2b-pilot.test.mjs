import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { inspectGlb } from '../scripts/lib/glb-inspect.mjs'

// This is an OFFLINE QA of the EXACT committed original GLB and STL sample archive.
// It NEVER contacts a provider or upgrades a manufacturing candidate to an order.
const root = new URL('../public/pilots/ecomech-chili-v3/', import.meta.url)
const pilot = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

test('original green robot GLB bytes are actually committed and match SHA-256, not a screenshot', () => {
  const bytes = readFileSync(new URL(pilot.game.file, root))
  assert.equal(bytes.byteLength, pilot.game.bytes)
  assert.equal(digest(bytes), pilot.game.sha256)
  const report = inspectGlb(bytes)
  assert.equal(report.meshCount, pilot.game.meshCount)
  assert.equal(report.binaryChunkCount, 1)
  assert.ok(report.binaryBytes > 100_000, 'A JSON-only fake mesh must not pass')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const jsonBytes = view.getUint32(12, true)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonBytes).toString('utf8'))
  const tris = doc.meshes.reduce((n, mesh) => n + mesh.primitives.reduce((m, primitive) => {
    const a = primitive.indices !== undefined ? doc.accessors[primitive.indices] : doc.accessors[primitive.attributes.POSITION]
    assert.ok(a && Number.isInteger(a.count) && a.count > 0)
    assert.equal(primitive.mode ?? 4, 4)
    return m + Math.floor(a.count / 3)
  }, 0), 0)
  assert.equal(tris, pilot.game.triangles)
  assert.equal(pilot.game.originalBinaryInRepository, true)
  assert.equal(pilot.aiDirector, 'NONE')
  assert.equal(pilot.modelProviderConfirmed, false)
  assert.equal(pilot.game.rigged, false)
  assert.equal(pilot.game.animated, false)
})

test('original SLA print candidate is a real committed ZIP package with accurate source checksum', () => {
  const archive = readFileSync(new URL(pilot.make.archiveFile, root))
  assert.equal(archive.byteLength, pilot.make.archiveBytes)
  assert.equal(digest(archive), pilot.make.archiveSha256)
  assert.equal(archive.readUInt32LE(0), 0x04034b50, 'Missing ZIP local file header')
  assert.ok(archive.includes(Buffer.from(pilot.make.file)))
  assert.ok(archive.includes(Buffer.from('make_fine_qa.json')))
  assert.equal(pilot.make.archiveInRepository, true)
  assert.equal(pilot.make.extentsMm[2], 180)
  assert.equal(pilot.make.triangles, 196542)
  assert.equal(pilot.make.connectedComponents, 1)
  assert.equal(pilot.make.watertight, true)
})

test('storefront and provider claims remain BLOCKED independently of GLB/STL integrity', () => {
  assert.equal(pilot.status, 'DEMO_UNREVIEWED')
  assert.equal(pilot.make.status, 'CANDIDATE_UNREVIEWED')
  assert.equal(pilot.deployment.productionPublished, false)
  assert.equal(pilot.deployment.hostedPreviewVerified, false)
  assert.equal(pilot.deployment.publicModelUrl, null)
  assert.equal(pilot.billing.paidProviderCalls, 0)
  assert.equal(pilot.billing.customerPointsCharged, 0)
  assert.equal(pilot.make.supplierApproved, false)
  for (const field of ['wallThicknessChecked', 'supportChecked', 'orderPlaced', 'printSampleMade', 'fullColorPackage'])
    assert.equal(pilot.make[field], false)
  assert.equal(pilot.b2b.quoteVerified, false)
  assert.equal(pilot.b2b.apiProductionIntegrationVerified, false)
  assert.equal(pilot.b2b.directOrderEnabled, false)
  assert.equal(pilot.b2b.supplierRequirements.slaWallMmAround200, 2)
  assert.equal(pilot.b2b.supplierRequirements.wjpWallMmAround200, 3)
  assert.ok(pilot.b2b.supplierRequirements.jlcFullColorFormats.includes('OBJ+MTL+PNG'))
  assert.ok(pilot.b2b.supplierRequirements.jlcResinMonoFormats.includes('STL'))
})

test('public preview is same-origin, truthful and contains no provider API keys or embedded false model', () => {
  const html = readFileSync(new URL('index.html', root),'utf8')
  assert.match(html, /WORLDIFACT/)
  assert.match(html, /WORLDIFACT_EcoMech_Chili_V3_GAME\.glb/)
  assert.match(html, /WORLDIFACT_EcoMech_Chili_V3_MAKE_180mm_QA\.zip/)
  assert.match(html, /NOT A TRIPO \/ MESHY BENCHMARK/)
  assert.doesNotMatch(html, /id="embeddedGlb"|id="printStl"|OPENAI_API_KEY|ORACLE_API_TOKEN/)
})
