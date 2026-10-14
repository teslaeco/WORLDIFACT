/**
 * Offline, cost-free physical GLB evidence counter.
 * Usage: node scripts/benchmark-studio-geometry.mjs first.glb second.glb
 * This is NOT a model-generation client or a visual quality score.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
const array = (source, key) => Array.isArray(source[key]) ? source[key] : []
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null

export function benchmarkStudioGLB(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 20 || bytes.byteLength > 50_000_000)
    throw new Error('GLB evidence is outside supported size.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('Invalid GLB 2.0 container.')
  const jsonBytes = view.getUint32(12, true)
  if (jsonBytes % 4 !== 0 || 20 + jsonBytes > bytes.byteLength)
    throw new Error('Invalid GLB JSON length.')
  const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonBytes)))
  if (!object(document) || document.asset?.version !== '2.0')
    throw new Error('Unsupported glTF document.')
  let offset = 20 + jsonBytes
  let hasBinaryChunk = false
  let binaryBytes = 0
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('Truncated GLB chunk.')
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true)
    offset += 8
    if (size % 4 !== 0 || offset + size > bytes.byteLength || type !== 0x004e4942 || hasBinaryChunk)
      throw new Error('Invalid or unexpected GLB binary chunk.')
    hasBinaryChunk = true
    binaryBytes += size
    offset += size
  }
  const meshes = array(document, 'meshes')
  const accessors = array(document, 'accessors')
  const materials = array(document, 'materials')
  const nodes = array(document, 'nodes')
  let declaredTriangles = 0
  let uvPrimitives = 0
  let primitives = 0
  let indexedPrimitives = 0
  let vertices = 0
  const trisByMesh = []
  for (const mesh of meshes) {
    if (!object(mesh) || !Array.isArray(mesh.primitives)) throw new Error('Invalid GLB mesh metadata.')
    let meshTriangles = 0
    for (const primitive of mesh.primitives) {
      if (!object(primitive) || !object(primitive.attributes)) throw new Error('Invalid GLB primitive.')
      const position = accessors[primitive.attributes.POSITION]
      const positionCount = count(position?.count)
      if (positionCount === null) throw new Error('Missing position accessor.')
      vertices += positionCount
      const indexed = primitive.indices !== undefined
      const elements = indexed ? count(accessors[primitive.indices]?.count) : positionCount
      if (elements === null) throw new Error('Invalid GLB index accessor.')
      const mode = primitive.mode ?? 4
      const triangles = mode === 4 ? Math.floor(elements / 3) : [5, 6].includes(mode) ? Math.max(0, elements - 2) : 0
      meshTriangles += triangles
      declaredTriangles += triangles
      primitives++
      if (indexed) indexedPrimitives++
      if (primitive.attributes.TEXCOORD_0 !== undefined) uvPrimitives++
    }
    trisByMesh.push(meshTriangles)
  }
  const renderedTriangles = nodes.reduce((sum, node) =>
    sum + (object(node) && Number.isSafeInteger(node.mesh) && trisByMesh[node.mesh] !== undefined
      ? trisByMesh[node.mesh] : 0), 0)
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
    hasBinaryChunk, binaryBytes,
    meshCount: meshes.length, primitiveCount: primitives,
    declaredTriangles, renderedTriangles, declaredPositionVertices: vertices,
    indexedPrimitives, nodeCount: nodes.length,
    materialCount: materials.length, pbrMaterialCount: materials.filter(m => object(m) && object(m.pbrMetallicRoughness)).length,
    textureCount: array(document, 'textures').length, imageCount: array(document, 'images').length,
    uvPrimitives, skinCount: array(document, 'skins').length, animationCount: array(document, 'animations').length,
    /** Geometry counts do not establish sculptural fidelity, manifold topology, UV quality, or good anatomy. */
    visualQuality: 'NOT_REVIEWED', topologyQuality: 'NOT_REVIEWED',
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const paths = process.argv.slice(2)
  if (!paths.length) {
    process.stderr.write('Usage: node scripts/benchmark-studio-geometry.mjs <file.glb> [...file.glb]\n')
    process.exitCode = 2
  } else {
    try {
      const results = []
      for (const path of paths) results.push({ path, ...benchmarkStudioGLB(await readFile(path)) })
      process.stdout.write(JSON.stringify({ methodology: 'offline actual GLB metadata; no paid API or inferred provider identity', results }, null, 2) + '\n')
    } catch (error) {
      process.stderr.write('Benchmark rejected input: ' + (error instanceof Error ? error.message : String(error)) + '\n')
      process.exitCode = 1
    }
  }
}
