import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectGLB } from '../src/lib/glb.ts'
import { inspectRetainedStudioGLB } from '../src/lib/studioGlbIntegrity.ts'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

function repack(document: Record<string, unknown>, data = new Uint8Array(detailedGLBFixture().buffer).slice(-36)) {
  const text = new TextEncoder().encode(JSON.stringify(document))
  const jsonBytes = Math.ceil(text.length / 4) * 4
  const binBytes = Math.ceil(data.byteLength / 4) * 4
  const bytes = new Uint8Array(28 + jsonBytes + binBytes)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, jsonBytes, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(32, 20, 20 + jsonBytes)
  bytes.set(text, 20)
  view.setUint32(20 + jsonBytes, binBytes, true)
  view.setUint32(24 + jsonBytes, 0x004e4942, true)
  bytes.set(data, 28 + jsonBytes)
  return bytes
}

function fixtureDocument(): Record<string, unknown> {
  const bytes = detailedGLBFixture()
  const len = new DataView(bytes.buffer).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + len))) as Record<string, unknown>
}

test('genuine embedded finite triangle passes retained incomplete GLB validation', () => {
  const result = inspectRetainedStudioGLB(detailedGLBFixture().buffer)
  assert.equal(result.triangles, 1)
  assert.equal(result.meshCount, 1)
})

test('metadata-only triangle must never be accepted as retained original geometry', () => {
  const bytes = detailedGLBFixture()
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true)
  const fake = bytes.slice(0, 20 + jsonLength)
  new DataView(fake.buffer).setUint32(8, fake.byteLength, true)
  assert.equal(inspectGLB(fake.buffer).triangles, 1, 'Legacy inspector counts claims in the JSON')
  assert.throws(() => inspectRetainedStudioGLB(fake.buffer), /BIN chunk/)
})

test('invalid float vertices, collapsed triangles and unattached scene geometry are rejected', () => {
  const invalid = detailedGLBFixture()
  new DataView(invalid.buffer).setUint32(invalid.byteLength - 36, 0x7fc00000, true)
  assert.throws(() => inspectRetainedStudioGLB(invalid.buffer), /non-finite/)
  const flattened = detailedGLBFixture()
  flattened.fill(0, flattened.byteLength - 36)
  assert.throws(() => inspectRetainedStudioGLB(flattened.buffer), /spatially usable/)
  const doc = fixtureDocument()
  doc.scenes = [{ nodes: [] }]
  assert.throws(() => inspectRetainedStudioGLB(repack(doc).buffer), /spatially usable/)
})

test('invented accessors and out-of-bounds index bytes cannot pass recovery', () => {
  const doc = fixtureDocument()
  const accessors = doc.accessors as Record<string, unknown>[]
  accessors[0].count = 30000
  assert.throws(() => inspectRetainedStudioGLB(repack(doc).buffer), /accessor exceeds/)
  accessors[0].count = 3
  const views = doc.bufferViews as Record<string, unknown>[]
  views.push({ buffer: 0, byteOffset: 36, byteLength: 6 })
  accessors.push({ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' })
  ;(doc.buffers as Record<string, unknown>[])[0].byteLength = 42
  const meshes = doc.meshes as { primitives: { indices?: number }[] }[]
  meshes[0].primitives[0].indices = 1
  const binary = new Uint8Array(42)
  binary.set(new Uint8Array(detailedGLBFixture().buffer).slice(-36))
  new DataView(binary.buffer).setUint16(40, 999, true)
  assert.throws(() => inspectRetainedStudioGLB(repack(doc, binary).buffer), /index points outside/)
})
