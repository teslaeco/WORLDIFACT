import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AmbientLight, Box3, DoubleSide, Mesh, PerspectiveCamera, Scene } from 'three'
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js'
import { buildSoftwareModel, disposeSoftwareModel, inspectEmbeddedGlb, readModelPreviewBytes, SOFTWARE_PREVIEW_LIMITS, SOFTWARE_PREVIEW_SOURCE_LIMITS } from '../src/lib/softwareModelPreview.ts'

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

// Synthetic only: matches a dense foliage/accessor shape without retaining an
// owner's model. Every output triangle can be identified from its exact X value.
function denseFixture(change: (json: Json, bin: Uint8Array) => void = () => {}, parts = [{ vertices: 1686, triangles: 3100 }, { vertices: 150000, triangles: 50000 }]) {
  const bin = new Uint8Array(parts.reduce((sum, p) => sum + p.vertices * 12 + p.triangles * 12, 0))
  const json: Json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: parts.map((_p, i) => i) }],
    nodes: parts.map((_p, mesh) => ({ mesh })), meshes: [], accessors: [], bufferViews: [], materials: [], buffers: [{ byteLength: bin.byteLength }] }
  let offset = 0
  for (const [part, p] of parts.entries()) {
    const positions = new Float32Array(bin.buffer, offset, p.vertices * 3)
    for (let v = 0; v < p.vertices; v++) positions.set([Math.floor(v / 3) * 2 + (v % 3 === 1 ? 1 : 0), v % 3 === 2 ? 1 : 0, part], v * 3)
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: positions.byteLength }); offset += positions.byteLength
    const indices = new Uint32Array(bin.buffer, offset, p.triangles * 3)
    for (let i = 0; i < indices.length; i++) indices[i] = i % p.vertices
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: indices.byteLength }); offset += indices.byteLength
    json.accessors.push({ bufferView: part * 2, componentType: 5126, count: p.vertices, type: 'VEC3' }, { bufferView: part * 2 + 1, componentType: 5125, count: indices.length, type: 'SCALAR' })
    json.meshes.push({ primitives: [{ attributes: { POSITION: part * 2 }, indices: part * 2 + 1, material: part }] })
    json.materials.push({ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [part ? 0.1 : 0.5, part ? 0.7 : 0.2, 0.1, 1] } })
  }
  change(json, bin)
  const encoded = new TextEncoder().encode(JSON.stringify(json)), length = Math.ceil(encoded.length / 4) * 4
  const bytes = new Uint8Array(28 + length + bin.length), view = new DataView(bytes.buffer)
  for (const [at, value] of [[0, 0x46546c67], [4, 2], [8, bytes.length], [12, length], [16, 0x4e4f534a], [20 + length, bin.length], [24 + length, 0x004e4942]]) view.setUint32(at, value, true)
  bytes.fill(32, 20, 20 + length); bytes.set(encoded, 20); bytes.set(bin, 28 + length)
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
  assert.equal(result.sampled, false); assert.deepEqual(mesh.geometry.index?.array, new Uint32Array([0, 1, 2]))
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

test('rendered triangle and vertex budgets sample repeated mesh instances independently', () => {
  const triangleHeavy = fixture((j, b) => {
    j.accessors[1].count = 33000; j.bufferViews[1].byteLength = 66000
    const indices = new Uint16Array(b.buffer, 36, 33000)
    for (let i = 0; i < indices.length; i++) indices[i] = i % 3
    j.nodes = [{ mesh: 0 }, { mesh: 0 }]; j.scenes[0].nodes = [0, 1]
  }, 66036)
  const repeatedTriangles = buildSoftwareModel(triangleHeavy)
  assert.equal(repeatedTriangles.sampled, true); assert.equal(repeatedTriangles.sourceTriangles, 22000)
  assert.equal(repeatedTriangles.triangles, 20000); assert.equal(repeatedTriangles.vertices, 60000)
  assert.equal(repeatedTriangles.model.children.length, 2); disposeSoftwareModel(repeatedTriangles.model)
  const vertexHeavy = fixture((j, b) => {
    j.accessors[0].count = 30000; j.bufferViews[0].byteLength = 360000
    j.bufferViews[1].byteOffset = 360000; new Uint16Array(b.buffer, 360000, 3).set([0, 1, 2])
    j.nodes = [{ mesh: 0 }, { mesh: 0 }, { mesh: 0 }]; j.scenes[0].nodes = [0, 1, 2]
  }, 360008)
  const repeatedVertices = buildSoftwareModel(vertexHeavy)
  assert.equal(repeatedVertices.sampled, true); assert.equal(repeatedVertices.sourceVertices, 90000)
  assert.equal(repeatedVertices.triangles, 3); assert.equal(repeatedVertices.vertices, 9)
  assert.equal(repeatedVertices.model.children.length, 3); disposeSoftwareModel(repeatedVertices.model)
})

test('dense valid source is deterministically sampled within renderer budgets, retaining both materials and exact source triangles', () => {
  const bytes = denseFixture(), original = bytes.slice(0), first = buildSoftwareModel(bytes), second = buildSoftwareModel(bytes)
  try {
    assert.equal(first.sampled, true); assert.equal(first.sourceVertices, 151686); assert.equal(first.sourceTriangles, 53100)
    assert.equal(first.vertices, SOFTWARE_PREVIEW_LIMITS.vertices); assert.equal(first.triangles, SOFTWARE_PREVIEW_LIMITS.triangles)
    assert.equal(first.model.children.length, 2)
    let vertices = 0
    for (const [index, object] of first.model.children.entries()) {
      const mesh = object as Mesh, positions = mesh.geometry.getAttribute('position'), same = second.model.children[index] as Mesh, part = positions.getZ(0)
      assert.deepEqual(positions.array, same.geometry.getAttribute('position').array); assert.equal(mesh.geometry.index, null)
      assert.equal((mesh.material as any).side, DoubleSide); assert.deepEqual((mesh.material as any).color.toArray(), part === 0 ? [0.5, 0.2, 0.1] : [0.1, 0.7, 0.1])
      assert.ok(positions.count >= 3); vertices += positions.count
      for (let i = 0; i < positions.count; i += 3) {
        const x = positions.getX(i)
        assert.equal(x % 2, 0); assert.deepEqual(Array.from(positions.array.slice(i * 3, i * 3 + 9)), [x, 0, part, x + 1, 0, part, x, 1, part])
      }
      if (part === 1) { assert.equal(positions.getX(0), 0); assert.equal(positions.getX(positions.count - 3), 99998) }
    }
    assert.equal(vertices, first.vertices); assert.deepEqual(bytes, original)
    assert.deepEqual(first.bounds.min.toArray(), [0, 0, 0]); assert.deepEqual(first.bounds.max.toArray(), [99999, 1, 1])
  } finally { disposeSoftwareModel(first.model); disposeSoftwareModel(second.model) }
})

test('source bounds include omitted triangles, and all omitted coordinates and indices are validated before renderer allocation', () => {
  const parts = [{ vertices: 120000, triangles: 40000 }]
  const result = buildSoftwareModel(denseFixture(() => {}, parts))
  // Triangle 1 is genuinely omitted by the selection, established from output.
  const positions = (result.model.children[0] as Mesh).geometry.getAttribute('position')
  assert.ok(!Array.from({ length: positions.count / 3 }, (_, i) => positions.getX(i * 3)).includes(2))
  disposeSoftwareModel(result.model)
  const extreme = buildSoftwareModel(denseFixture((_j, b) => { new DataView(b.buffer).setFloat32(36, -123456, true) }, parts))
  assert.equal(extreme.bounds.min.x, -123456); assert.equal(new Box3().setFromObject(extreme.model).min.x, 0)
  disposeSoftwareModel(extreme.model)
  for (const change of [
    (_j: Json, b: Uint8Array) => { new DataView(b.buffer).setFloat32(36, NaN, true) },
    (_j: Json, b: Uint8Array) => { new DataView(b.buffer).setFloat32(36, 1e9, true) },
    (j: Json, b: Uint8Array) => { j.nodes[0].scale = [1000, 1, 1]; new DataView(b.buffer).setFloat32(36, -200000, true) },
    (j: Json, b: Uint8Array) => { new DataView(b.buffer).setUint32(j.bufferViews[1].byteOffset + 12, 120000, true) },
    (j: Json) => { j.materials[0].pbrMetallicRoughness.baseColorFactor = [-1, 1, 1, 1] },
  ]) {
    const invalid = denseFixture(change, parts), Float = globalThis.Float32Array, Uint = globalThis.Uint32Array
    let allocations = 0
    globalThis.Float32Array = class extends Float { constructor(...args: any[]) { super(...args as [number]); allocations++ } } as typeof Float32Array
    globalThis.Uint32Array = class extends Uint { constructor(...args: any[]) { super(...args as [number]); allocations++ } } as typeof Uint32Array
    try { assert.throws(() => buildSoftwareModel(invalid), /coordinates|vertex index|base material/); assert.equal(allocations, 0) }
    finally { globalThis.Float32Array = Float; globalThis.Uint32Array = Uint }
  }
})

test('all 256 source parts keep representation while sharing a single global rendered budget', () => {
  const result = buildSoftwareModel(denseFixture(() => {}, [{ vertices: 120000, triangles: 40000 }, ...Array.from({ length: 255 }, () => ({ vertices: 3, triangles: 1 }))]))
  try {
    assert.equal(result.model.children.length, 256); assert.equal(result.triangles, 20000); assert.equal(result.vertices, 60000)
    const counts = result.model.children.map(object => (object as Mesh).geometry.getAttribute('position').count)
    assert.equal(counts.filter(count => count === 3).length, 255); assert.ok(counts.every(count => count >= 3))
  } finally { disposeSoftwareModel(result.model) }
})

test('source-work budgets bound definitions and transformed instances without changing file or metadata caps', () => {
  assert.equal(SOFTWARE_PREVIEW_LIMITS.bytes, 16 * 1024 * 1024); assert.equal(SOFTWARE_PREVIEW_LIMITS.jsonBytes, 2 * 1024 * 1024)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.accessors[0].count = SOFTWARE_PREVIEW_SOURCE_LIMITS.vertices + 1 })), /range/)
  assert.throws(() => buildSoftwareModel(fixture(j => { j.accessors[1].count = SOFTWARE_PREVIEW_SOURCE_LIMITS.triangles * 3 + 3 })), /range/)
  assert.throws(() => buildSoftwareModel(denseFixture(() => {}, [{ vertices: 300003, triangles: 1 }, { vertices: 300003, triangles: 1 }])), /too complex/)
  assert.throws(() => buildSoftwareModel(denseFixture(() => {}, [{ vertices: 3, triangles: 100001 }, { vertices: 3, triangles: 100001 }])), /too complex/)
  assert.throws(() => buildSoftwareModel(denseFixture(j => { j.nodes = Array.from({ length: 4 }, () => ({ mesh: 0 })); j.scenes[0].nodes = [0, 1, 2, 3] }, [{ vertices: 150003, triangles: 1 }])), /too complex/)
  assert.throws(() => buildSoftwareModel(denseFixture(j => { j.nodes = Array.from({ length: 4 }, () => ({ mesh: 0 })); j.scenes[0].nodes = [0, 1, 2, 3] }, [{ vertices: 3, triangles: 50001 }])), /too complex/)
})

test('sampled copies dispose all allocated geometry and material resources exactly once', () => {
  const { model } = buildSoftwareModel(denseFixture()), parent = new Scene()
  let geometries = 0, materials = 0
  for (const object of model.children) {
    const mesh = object as Mesh
    mesh.geometry.addEventListener('dispose', () => geometries++)
    ;(mesh.material as any).addEventListener('dispose', () => materials++)
  }
  parent.add(model); disposeSoftwareModel(model); disposeSoftwareModel(model)
  assert.equal(geometries, 2); assert.equal(materials, 2); assert.equal(parent.children.length, 0); assert.equal(model.children.length, 0)
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
