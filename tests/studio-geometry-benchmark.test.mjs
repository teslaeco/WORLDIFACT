import { test } from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkStudioGLB } from '../scripts/benchmark-studio-geometry.mjs'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'

test('offline audit counts actual GLB triangles, PBR and UV but never invents visual quality or provider', () => {
  const result = benchmarkStudioGLB(detailedGLBFixture())
  assert.equal(result.meshCount, 1)
  assert.equal(result.primitiveCount, 1)
  assert.equal(result.declaredTriangles, 1)
  assert.equal(result.renderedTriangles, 1)
  assert.equal(result.materialCount, 1)
  assert.equal(result.pbrMaterialCount, 1)
  assert.equal(result.imageCount, 0)
  assert.equal(result.animationCount, 0)
  assert.equal(result.skinCount, 0)
  assert.equal(result.hasBinaryChunk, true)
  assert.match(result.sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.visualQuality, 'NOT_REVIEWED')
  assert.equal(Object.hasOwn(result, 'provider'), false)
  assert.equal(Object.hasOwn(result, 'customerPoints'), false)
})

test('offline audit rejects truncated or incorrectly declared GLB metadata', () => {
  const src = detailedGLBFixture()
  const wrong = src.slice()
  new DataView(wrong.buffer).setUint32(8, 9999, true)
  assert.throws(() => benchmarkStudioGLB(wrong), /container/)
  assert.throws(() => benchmarkStudioGLB(src.slice(0, 20)), /JSON length/)
  const missingBin = src.slice()
  const originalJsonBytes = new DataView(missingBin.buffer).getUint32(12, true)
  const missing = missingBin.slice(0, 20 + originalJsonBytes)
  new DataView(missing.buffer).setUint32(8, missing.byteLength, true)
  assert.equal(benchmarkStudioGLB(missing).hasBinaryChunk, false,
    'A metadata-only document can be inspected but never certified as real geometry')
})
