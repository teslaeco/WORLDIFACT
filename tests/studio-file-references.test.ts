import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3 } from 'three'
import { appendReferenceText, referenceFileKind, MODEL_REFERENCE_BYTES } from '../src/lib/studioFileReferences.ts'
import { parseReferenceModel } from '../src/lib/modelReferenceGeometry.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

const encoded = (text: string) => new TextEncoder().encode(text).buffer
const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
const stl = 'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle'
function glb(external = false) {
  const spec = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36, ...(external ? { uri: 'https://example.invalid/private.bin' } : {}) }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] }
  const json = new TextEncoder().encode(JSON.stringify(spec)), padded = Math.ceil(json.length / 4) * 4
  const bytes = new Uint8Array(28 + padded + 36), v = new DataView(bytes.buffer)
  for (const [at, value] of [[0, 0x46546c67], [4, 2], [8, bytes.length], [12, padded], [16, 0x4e4f534a], [20 + padded, 36], [24 + padded, 0x004e4942]]) v.setUint32(at, value, true)
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20)
  ;[0,0,0,1,0,0,0,1,0].forEach((n, i) => v.setFloat32(28 + padded + i * 4, n, true))
  return bytes.buffer
}

test('file validation refuses unsupported, empty and oversized originals', () => {
  for (const name of ['a.pdf','a.zip','a.blend','a.fbx']) assert.throws(() => referenceFileKind({ name, size: 100 }), /Use GLB/)
  for (const size of [0, -1, NaN, MODEL_REFERENCE_BYTES + 1]) assert.throws(() => referenceFileKind({ name: 'shape.glb', size }))
  assert.equal(referenceFileKind({ name: 'MODEL.OBJ', size: 100 }), 'obj')
  assert.equal(referenceFileKind({ name: 'brief.md', size: 100 }), 'text')
})

test('brief appending retains complete UTF-8 content and fails rather than truncates', () => {
  const content = 'Opis: żółta rama\n12 elementów'
  assert.equal(appendReferenceText('Existing', 'brief.txt', encoded(content)), `Existing\n\nReference brief (brief.txt):\n${content}`)
  assert.throws(() => appendReferenceText('p'.repeat(3990), 'a.txt', encoded('whole brief')), /no contents were truncated/)
  assert.throws(() => appendReferenceText('', 'a.txt', new Uint8Array([255,254,0,0]).buffer), /UTF-8/)
  assert.throws(() => appendReferenceText('', 'a.txt', encoded('binary\u0000')), /readable/)
})

for (const kind of ['glb','obj','stl'] as const) test(`${kind} parses original local geometry without changing its bytes`, async () => {
  const bytes = kind === 'glb' ? glb() : encoded(kind === 'obj' ? obj : stl), original = bytes.slice(0)
  const root = await parseReferenceModel(bytes, kind)
  try {
    const bounds = new Box3().setFromObject(root)
    assert.deepEqual(bounds.min.toArray(), [0,0,0]); assert.deepEqual(bounds.max.toArray(), [1,1,0])
    assert.deepEqual(bytes, original)
  } finally { disposeObject(root) }
})

test('reference parsers reject external GLB resources, invalid coordinates and empty or excessive meshes', async () => {
  await assert.rejects(parseReferenceModel(glb(true), 'glb'), /External/)
  await assert.rejects(parseReferenceModel(encoded(obj.replace('v 1 0 0', 'v NaN 0 0')), 'obj'), /invalid coordinates/)
  await assert.rejects(parseReferenceModel(encoded('v 0 0 0\n'), 'obj'), /no mesh faces/)
  await assert.rejects(parseReferenceModel(encoded('v 0 0 0\n' + 'f 1 1 1\n'.repeat(300001)), 'obj'), /300,000/)
  await assert.rejects(parseReferenceModel(encoded('not a model'), 'stl'), /Invalid/)
})
