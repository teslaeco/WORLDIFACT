import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as THREE from 'three'

// Run only against the reviewed public FORGE original, never a substitute or a private model.
const SOURCE = 'https://forge-world-builder.terraformingplanet.chatgpt.site/world-assets/polyhedron.glb'
const SOURCE_SHA256 = 'c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a'
const sha = value => createHash('sha256').update(value).digest('hex')
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/prepare-portal-sculpture.mjs /path/to/reviewed/public/polyhedron.glb [output-directory]')
const bytes = await readFile(input)
if (sha(bytes) !== SOURCE_SHA256 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('The input is not the reviewed public FORGE original.')
const jsonLength = bytes.readUInt32LE(12)
const original = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
const binaryOffset = 20 + jsonLength + 8
const originalBinary = bytes.subarray(binaryOffset, binaryOffset + bytes.readUInt32LE(binaryOffset - 8))
if (original.buffers.length !== 1 || original.buffers[0].uri || original.extensionsRequired?.length || original.animations || original.skins) throw new Error('The reviewed source structure changed.')
const output = structuredClone(original)
const imageViews = new Set(original.images.map(image => image.bufferView))
const viewMap = new Map(), segments = [], bufferViews = []
let offset = 0
for (let i = 0; i < original.bufferViews.length; i++) {
  if (imageViews.has(i)) continue
  const view = original.bufferViews[i]
  if (view.buffer !== 0) throw new Error('Unexpected source buffer')
  const data = originalBinary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  if (data.length !== view.byteLength) throw new Error('Truncated source geometry')
  const padding = (4 - offset % 4) % 4
  if (padding) { segments.push(Buffer.alloc(padding)); offset += padding }
  viewMap.set(i, bufferViews.length)
  bufferViews.push({ ...view, byteOffset: offset })
  segments.push(data); offset += data.length
}
const geometryBinary = Buffer.concat(segments)
output.bufferViews = bufferViews
output.accessors = original.accessors.map(accessor => {
  if (accessor.sparse || !viewMap.has(accessor.bufferView)) throw new Error('Unexpected accessor structure')
  return { ...accessor, bufferView: viewMap.get(accessor.bufferView) }
})
output.buffers = [{ byteLength: geometryBinary.length, uri: `data:application/octet-stream;base64,${geometryBinary.toString('base64')}` }]
// Only materials/images change. All accessor bytes, meshes, open spaces and node transforms survive.
delete output.images; delete output.textures; delete output.samplers
output.materials = original.materials.map(() => ({ name: 'WORLDIFACT LED surface', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: .55, roughnessFactor: .24 } }))
output.asset = { ...original.asset, extras: { source: SOURCE, sourceSha256: SOURCE_SHA256, revision: 'LED materials only; exact original geometry and transforms' } }
const geometry = original.accessors.map(accessor => {
  const view = original.bufferViews[accessor.bufferView]
  const { bufferView: _view, ...definition } = accessor
  return { definition, viewSha256: sha(originalBinary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)) }
})
const outputDirectory = resolve(process.argv[3] ?? 'public/world-assets')
await mkdir(outputDirectory, { recursive: true })
const gltf = JSON.stringify(output)
const manifest = {
  source: SOURCE, sourceSha256: SOURCE_SHA256, sourceBytes: bytes.length,
  assetSha256: sha(gltf + '\n'), assetBytes: Buffer.byteLength(gltf + '\n'), geometryBufferSha256: sha(geometryBinary),
  meshes: original.meshes.length, nodes: original.nodes.length,
  triangles: original.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + original.accessors[primitive.indices].count / 3, 0), 0),
  meshDefinitionSha256: sha(JSON.stringify(original.meshes)), nodeDefinitionSha256: sha(JSON.stringify(original.nodes)),
  sceneDefinitionSha256: sha(JSON.stringify(original.scenes)), accessors: geometry,
  changes: ['Removed three embedded 4K wood textures', 'Replaced source materials with LED-ready surfaces', 'Repacked unchanged geometry buffer views into an embedded data buffer'],
}
await writeFile(resolve(outputDirectory, 'polyhedron-led.gltf'), gltf + '\n')
// The static fallback is a projection of the exact original triangles, not a replacement primitive.
function values(index) {
  const accessor = output.accessors[index], view = output.bufferViews[accessor.bufferView]
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type]
  const byteWidth = { 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType]
  const read = { 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }[accessor.componentType]
  if (!components || !byteWidth || !read) throw new Error('Unexpected accessor type')
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: components }, (_, c) => geometryBinary[read]((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? byteWidth * components) + c * byteWidth)))
}
const polygons = [], overall = new THREE.Box3()
function visit(index, parent) {
  const node = output.nodes[index]
  const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]))
  const world = parent.clone().multiply(local)
  if (node.mesh !== undefined) for (const primitive of output.meshes[node.mesh].primitives) {
    const vertices = values(primitive.attributes.POSITION).map(value => new THREE.Vector3().fromArray(value).applyMatrix4(world))
    for (const vertex of vertices) overall.expandByPoint(vertex)
    const indices = values(primitive.indices).flat()
    for (let i = 0; i < indices.length; i += 3) polygons.push({ vertices: indices.slice(i, i + 3).map(index => vertices[index].clone()), channel: node.mesh % 2 })
  }
  for (const child of node.children ?? []) visit(child, world)
}
for (const node of output.scenes[output.scene ?? 0].nodes) visit(node, new THREE.Matrix4())
const center = overall.getCenter(new THREE.Vector3()), rotation = new THREE.Euler(.24, .42, .12)
let maximum = 0
for (const polygon of polygons) {
  polygon.vertices.forEach(vertex => { vertex.sub(center).applyEuler(rotation); maximum = Math.max(maximum, Math.abs(vertex.x), Math.abs(vertex.y)) })
  polygon.depth = polygon.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / 3
}
polygons.sort((a, b) => a.depth - b.depth)
const paths = polygons.map(({ vertices, channel }) => {
  const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize()
  const brightness = .52 + Math.max(0, normal.dot(new THREE.Vector3(-.3, .7, .6).normalize())) * .45
  const color = new THREE.Color(channel ? '#38bfff' : '#56ffad').multiplyScalar(brightness).getHexString()
  const points = vertices.map(vertex => `${(160 + vertex.x / maximum * 126).toFixed(2)},${(160 - vertex.y / maximum * 126).toFixed(2)}`).join(' ')
  return `<polygon points="${points}" fill="#${color}" stroke="#${color}" stroke-width=".3"/>`
}).join('')
const poster = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-labelledby="title"><title id="title">Static view of the original FORGE open-frame polyhedron</title><defs><filter id="glow"><feGaussianBlur stdDeviation="1.1" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="halo"><stop stop-color="#075e6855"/><stop offset="1" stop-color="#07122400"/></radialGradient></defs><circle cx="160" cy="160" r="150" fill="url(#halo)"/><g filter="url(#glow)">${paths}</g></svg>`
await writeFile(resolve(outputDirectory, 'polyhedron-led-poster.svg'), poster + '\n')
await writeFile(resolve(outputDirectory, 'polyhedron-led.provenance.json'), JSON.stringify({ ...manifest, assetSha256: sha(gltf + '\n'), posterSha256: sha(poster + '\n') }, null, 2) + '\n')
console.log(JSON.stringify({ assetBytes: Buffer.byteLength(gltf + '\n'), posterBytes: Buffer.byteLength(poster + '\n'), sourceSha256: SOURCE_SHA256, meshes: manifest.meshes, triangles: manifest.triangles }))
