import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AmbientLight, Box3, Mesh, PerspectiveCamera, Scene } from 'three'
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js'
import { buildSoftwareModel, disposeSoftwareModel, inspectEmbeddedGlb, readModelPreviewBytes, SOFTWARE_PREVIEW_LIMITS } from '../src/lib/softwareModelPreview.ts'

type Json = Record<string, any>
function fixture(change: (json: Json, bin: Uint8Array) => void = () => {}, byteSize = 44) {
  const bin = new Uint8Array(byteSize)
  new Float32Array(bin.buffer, 0, 9).set([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  new Uint16Array(bin.buffer, 36, 3).set([0, 1, 2])
  const json: Json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.7, 1], baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: 2, mimeType: 'image/png' }],
    accessors: [{ bufferView: 0, count: 3, componentType: 5126, type: 'VEC3' }, { bufferView: 1, count: 3, componentType: 5123, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }, { buffer: 0, byteOffset: 42, byteLength: 2 }], buffers: [{ byteLength: bin.byteLength }] }
  change(json, bin)
  const encoded = new TextEncoder().encode(JSON.stringify(json)), length = Math.ceil(encoded.length / 4) * 4
  const bytes = new Uint8Array(28 + length + bin.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(32, 20, 20 + length); bytes.set(encoded, 20)
  view.setUint32(20 + length, bin.length, true); view.setUint32(24 + length, 0x004e4942, true); bytes.set(bin, 28 + length)
  return bytes.buffer
}

// The real Three SVGRenderer/Projector runs CPU geometry; this tiny DOM is only
// an SVG element sink. These tests make no browser, GPU or visual-quality claim.
class SvgElement {
  name: string
  childNodes: SvgElement[] = []
  attrs: Record<string, string> = {}
  style: Record<string, string> = {}
  constructor(name: string) { this.name = name }
  setAttribute(key: string, value: unknown) { this.attrs[key] = String(value) }
  appendChild(child: SvgElement) { this.childNodes.push(child) }
  removeChild(child: SvgElement) { this.childNodes.splice(this.childNodes.indexOf(child), 1) }
}

test('software preview renders the real source triangle and base color without texture loads or source mutation', () => {
  const bytes = fixture(j => { j.nodes[0].translation = [2, 3, 4]; j.nodes[0].extras = { froge_kind: 'person' } }), original = bytes.slice(0)
  const result = buildSoftwareModel(bytes), mesh = result.model.children[0] as Mesh
  assert.equal(result.triangles, 1); assert.equal(result.vertices, 3); assert.equal(result.person, true)
  assert.deepEqual(new Box3().setFromObject(result.model).min.toArray(), [1, 2, 4])
  assert.deepEqual(new Box3().setFromObject(result.model).max.toArray(), [3, 4, 4])
  assert.deepEqual(mesh.geometry.attributes.position.array, new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]))
  assert.deepEqual((mesh.material as any).color.toArray(), [0.2, 0.4, 0.7]); assert.equal((mesh.material as any).map, null)
  assert.equal(mesh.geometry.groups.length, 0); assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(), ['normal', 'position'])
  assert.deepEqual(bytes, original)
  disposeSoftwareModel(result.model)
})

test('bundled Three SVGRenderer projects the validated source geometry into finite SVG paths', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: (_ns: string, name: string) => new SvgElement(name) } })
  const { model } = buildSoftwareModel(fixture())
  try {
    const scene = new Scene(), camera = new PerspectiveCamera(40, 1, 0.1, 100)
    scene.add(model, new AmbientLight(0xffffff, 1)); camera.position.z = 5
    const renderer = new SVGRenderer(); renderer.setSize(320, 320); renderer.setPrecision(3); renderer.render(scene, camera)
    const element = renderer.domElement as unknown as SvgElement
    assert.ok(element.childNodes.length > 0); assert.equal(renderer.info.render.faces, 1)
    assert.ok(element.childNodes.some(child => child.attrs.d?.startsWith('M')))
    assert.doesNotMatch(JSON.stringify(element), /NaN|Infinity|<image|href/)
    assert.ok(element.childNodes.every(child => /fill:rgb/.test(child.attrs.style)))
    renderer.clear(); assert.equal(element.childNodes.length, 0)
  } finally { disposeSoftwareModel(model); if (prior) Object.defineProperty(globalThis, 'document', prior); else Reflect.deleteProperty(globalThis, 'document') }
})

test('all external buffer, image and extension URIs fail closed before either render path', () => {
  for (const change of [
    (j: Json) => { j.buffers[0].uri = 'https://private.example/secret' },
    (j: Json) => { j.images[0].uri = 'https://private.example/image.png' },
    (j: Json) => { j.nodes[0].extensions = { custom: { uri: 'blob:other-file' } } },
  ]) assert.throws(() => inspectEmbeddedGlb(fixture(change)), /URI model resources/)
})

test('container size, declared length, embedded binary ranges and metadata bounds are checked', () => {
  assert.throws(() => buildSoftwareModel(new ArrayBuffer(SOFTWARE_PREVIEW_LIMITS.bytes + 1)), /file limit/)
  const length = fixture(); new DataView(length).setUint32(8, length.byteLength + 4, true)
  assert.throws(() => inspectEmbeddedGlb(length), /container/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.bufferViews[0].byteLength = 999 })), /range/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.accessors[0].byteOffset = 8 })), /bounds or stride/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.accessors[0].count = 1_000_000 })), /range/)
})

test('unsupported skin, morph, instancing, compression and topology are rejected honestly', () => {
  const changes = [
    (j: Json) => { j.nodes[0].skin = 0 },
    (j: Json) => { j.meshes[0].primitives[0].targets = [] },
    (j: Json) => { j.nodes[0].extensions = { EXT_mesh_gpu_instancing: { attributes: {} } } },
    (j: Json) => { j.bufferViews[0].extensions = { EXT_meshopt_compression: {} } },
    (j: Json) => { j.meshes[0].primitives[0].mode = 5 },
    (j: Json) => { j.animations = [{}] },
    (j: Json) => { j.accessors[0].sparse = {} },
    (j: Json) => { j.accessors[0].normalized = true },
  ]
  for (const change of changes) assert.throws(() => buildSoftwareModel(fixture(change)), /unsupported|Unsupported|support|limits/)
})

test('finite geometry, valid indices and transforms are required, including unsupported mirrored transforms', () => {
  assert.throws(() => buildSoftwareModel(fixture((_j, b) => { new DataView(b.buffer).setFloat32(0, NaN, true) })), /coordinates/)
  assert.throws(() => buildSoftwareModel(fixture((_j, b) => { new DataView(b.buffer).setUint16(36, 65535, true) })), /vertex index/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.nodes[0].scale = [-1, 1, 1] })), /Mirrored/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.nodes[0].rotation = [0, 0, 0, 0] })), /rotation/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.nodes[0].translation = [1e9, 0, 0] })), /transform/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.nodes[0].matrix = [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })), /transform/)
})

test('cyclic, duplicated, deep and excessively repeated scene instances fail before projection', () => {
  assert.throws(() => buildSoftwareModel(fixture(j => { j.nodes[0].children = [0] })), /hierarchy/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.scenes[0].nodes = [0, 0] })), /hierarchy/)
  assert.throws(() => buildSoftwareModel(fixture(j => {
    j.nodes = Array.from({ length: 66 }, (_, i) => i === 65 ? { mesh: 0 } : { children: [i + 1] })
  })), /hierarchy/)
  assert.throws(() => buildSoftwareModel(fixture(j => {
    j.nodes = Array.from({ length: 257 }, () => ({ mesh: 0 })); j.scenes[0].nodes = j.nodes.map((_v: unknown, i: number) => i)
  })), /too complex/)
})

test('resource disposal releases copied geometry/materials and detaches every model mesh', () => {
  const { model } = buildSoftwareModel(fixture()), mesh = model.children[0] as Mesh, parent = new Scene()
  let geometry = 0, material = 0
  mesh.geometry.addEventListener('dispose', () => geometry++)
  ;(mesh.material as any).addEventListener('dispose', () => material++)
  parent.add(model); disposeSoftwareModel(model); disposeSoftwareModel(model)
  assert.equal(geometry, 1); assert.equal(material, 1); assert.equal(model.children.length, 0); assert.equal(parent.children.length, 0)
})

test('blob read never fetches HTTP sources and cancellation prevents reads', async () => {
  const previous = globalThis.fetch; let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request') }
  try {
    await assert.rejects(readModelPreviewBytes('https://provider.example/model.glb', new AbortController().signal), /local model/)
    const aborted = new AbortController(); aborted.abort()
    await assert.rejects(readModelPreviewBytes('blob:test', aborted.signal), { name: 'AbortError' })
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})

test('stream size cap cancels oversized local blobs even without content-length', async () => {
  const previous = globalThis.fetch; let cancelled = false
  globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(9)) }, cancel() { cancelled = true } }))
  try {
    await assert.rejects(readModelPreviewBytes('blob:test', new AbortController().signal, 8), /file limit/)
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = previous }
})

test('an actual local Blob round-trips identical model bytes through the bounded reader', async () => {
  const original = fixture(), url = URL.createObjectURL(new Blob([original]))
  try { assert.deepEqual(await readModelPreviewBytes(url, new AbortController().signal), original) }
  finally { URL.revokeObjectURL(url) }
})

test('embedded raster image data URIs retain WebGL compatibility and are never decoded by software', () => {
  const bytes = fixture(j => { delete j.images[0].bufferView; j.images[0].uri = 'data:image/png;base64,AAAA' })
  assert.doesNotThrow(() => inspectEmbeddedGlb(bytes))
  const { model } = buildSoftwareModel(bytes); assert.equal(model.children.length, 1); disposeSoftwareModel(model)
  assert.throws(() => inspectEmbeddedGlb(fixture(j => { j.images[0].uri = 'data:image/svg+xml;base64,PHN2Zz4=' })), /URI model resources/)
})

test('rendered triangle and vertex budgets count repeated mesh instances independently', () => {
  const triangleHeavy = fixture((j, b) => {
    j.accessors[1].count = 33000; j.bufferViews[1].byteLength = 66000
    const indices = new Uint16Array(b.buffer, 36, 33000)
    for (let i = 0; i < indices.length; i++) indices[i] = i % 3
    j.nodes = [{ mesh: 0 }, { mesh: 0 }]; j.scenes[0].nodes = [0, 1]
  }, 66036)
  assert.throws(() => buildSoftwareModel(triangleHeavy), /too complex/)
  const vertexHeavy = fixture((j, b) => {
    j.accessors[0].count = 30000; j.bufferViews[0].byteLength = 360000
    j.bufferViews[1].byteOffset = 360000; new Uint16Array(b.buffer, 360000, 3).set([0, 1, 2])
    j.nodes = [{ mesh: 0 }, { mesh: 0 }, { mesh: 0 }]; j.scenes[0].nodes = [0, 1, 2]
  }, 360008)
  assert.throws(() => buildSoftwareModel(vertexHeavy), /too complex/)
})

test('interleaved source position accessors are copied into exact contiguous renderer data', () => {
  const bytes = fixture((j, b) => {
    j.bufferViews[0].byteLength = 48; j.bufferViews[0].byteStride = 16
    j.bufferViews[1].byteOffset = 48
    new Float32Array(b.buffer, 0, 12).set([-1, -1, 0, 999, 1, -1, 0, 999, 0, 1, 0, 999])
    new Uint16Array(b.buffer, 48, 3).set([0, 1, 2])
  }, 56)
  const { model } = buildSoftwareModel(bytes)
  assert.deepEqual((model.children[0] as Mesh).geometry.attributes.position.array, new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]))
  disposeSoftwareModel(model)
})
