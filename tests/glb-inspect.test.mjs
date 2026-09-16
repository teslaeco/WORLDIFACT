import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectGlb } from '../scripts/lib/glb-inspect.mjs'

function makeGlb(json, binary = null) {
  const raw = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonLength = Math.ceil(raw.length / 4) * 4
  const binLength = binary ? Math.ceil(binary.length / 4) * 4 : 0
  const total = 12 + 8 + jsonLength + (binary ? 8 + binLength : 0)
  const bytes = Buffer.alloc(total, 0x20)
  bytes.write('glTF', 0, 4, 'ascii')
  bytes.writeUInt32LE(2, 4)
  bytes.writeUInt32LE(total, 8)
  bytes.writeUInt32LE(jsonLength, 12)
  bytes.writeUInt32LE(0x4e4f534a, 16)
  raw.copy(bytes, 20)
  if (binary) {
    const start = 20 + jsonLength
    bytes.writeUInt32LE(binLength, start)
    bytes.writeUInt32LE(0x004e4942, start + 4)
    Buffer.from(binary).copy(bytes, start + 8)
    for (let i = start + 8 + binary.length; i < total; i++) bytes[i] = 0
  }
  return new Uint8Array(bytes)
}

test('GLB inspector reports bounded scene/model structure and hash', () => {
  const json = {
    asset: { version: '2.0', generator: 'WORLDIFACT test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Root' }],
    accessors: [{ count: 3 }, { count: 3 }],
    meshes: [{ name: 'Triangle', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'Green' }],
    buffers: [{ byteLength: 12 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }],
    animations: [{ name: 'Idle', samplers: [], channels: [] }],
  }
  const report = inspectGlb(makeGlb(json, new Uint8Array(12)))
  assert.equal(report.gltfVersion, '2.0')
  assert.equal(report.meshCount, 1)
  assert.equal(report.nodeCount, 1)
  assert.equal(report.materialCount, 1)
  assert.equal(report.animationCount, 1)
  assert.equal(report.primitiveCount, 1)
  assert.equal(report.declaredVertices, 3)
  assert.equal(report.indexedElements, 3)
  assert.equal(report.binaryChunkCount, 1)
  assert.match(report.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(report.meshNames, ['Triangle'])
  assert.deepEqual(report.materialNames, ['Green'])
})

test('GLB inspector rejects malformed headers, length and unsupported chunk types', () => {
  const valid = makeGlb({ asset: { version: '2.0' }, scenes: [] })
  const badMagic = valid.slice(); badMagic[0] = 0
  assert.throws(() => inspectGlb(badMagic), /magic/)
  const badLength = valid.slice(); new DataView(badLength.buffer).setUint32(8, 24, true)
  assert.throws(() => inspectGlb(badLength), /length mismatch/)
  const badChunk = valid.slice(); new DataView(badChunk.buffer).setUint32(16, 0x12345678, true)
  assert.throws(() => inspectGlb(badChunk), /Unsupported GLB chunk type/)
})
