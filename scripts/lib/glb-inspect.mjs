import { createHash } from 'node:crypto'

export const MAX_GLB_BYTES = 12 * 1024 * 1024

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function inspectGlb(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('GLB must be Uint8Array')
  if (bytes.byteLength < 20 || bytes.byteLength > MAX_GLB_BYTES) throw new Error('GLB size out of bounds')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) throw new Error('Invalid GLB magic')
  if (view.getUint32(4, true) !== 2) throw new Error('Unsupported GLB version')
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB length mismatch')

  let offset = 12
  let json = null
  let jsonChunks = 0
  let binChunks = 0
  let binBytes = 0
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('Truncated GLB chunk header')
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    offset += 8
    if (length % 4 !== 0 || offset + length > bytes.byteLength) throw new Error('Invalid GLB chunk length')
    const chunk = bytes.subarray(offset, offset + length)
    offset += length
    if (type === 0x4e4f534a) {
      jsonChunks++
      if (jsonChunks > 1 || binChunks > 0) throw new Error('Invalid GLB JSON chunk order')
      const text = new TextDecoder().decode(chunk).replace(/[\u0000\u0020]+$/g, '')
      json = JSON.parse(text)
    } else if (type === 0x004e4942) {
      binChunks++
      binBytes += length
    } else {
      throw new Error('Unsupported GLB chunk type')
    }
  }
  if (!json || jsonChunks !== 1) throw new Error('GLB JSON chunk missing')
  if (json.asset?.version !== '2.0') throw new Error('glTF asset version is not 2.0')

  const arr = (key) => Array.isArray(json[key]) ? json[key] : []
  const accessors = arr('accessors')
  const meshes = arr('meshes')
  const nodes = arr('nodes')
  const materials = arr('materials')
  const animations = arr('animations')
  const images = arr('images')
  const textures = arr('textures')
  const scenes = arr('scenes')

  let primitives = 0
  let declaredVertices = 0
  let indexedElements = 0
  for (const mesh of meshes) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      primitives++
      const positionIndex = primitive?.attributes?.POSITION
      const positionAccessor = Number.isInteger(positionIndex) ? accessors[positionIndex] : null
      if (positionAccessor && Number.isInteger(positionAccessor.count) && positionAccessor.count >= 0) declaredVertices += positionAccessor.count
      if (Number.isInteger(primitive?.indices)) {
        const indexAccessor = accessors[primitive.indices]
        if (indexAccessor && Number.isInteger(indexAccessor.count) && indexAccessor.count >= 0) indexedElements += indexAccessor.count
      }
    }
  }

  const named = (items) => items.filter((x) => typeof x?.name === 'string' && x.name.trim()).map((x) => x.name.trim()).slice(0, 100)
  return {
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    gltfVersion: json.asset.version,
    generator: typeof json.asset.generator === 'string' ? json.asset.generator.slice(0, 200) : null,
    sceneCount: scenes.length,
    defaultScene: Number.isInteger(json.scene) ? json.scene : null,
    nodeCount: nodes.length,
    meshCount: meshes.length,
    primitiveCount: primitives,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    animationCount: animations.length,
    accessorCount: accessors.length,
    bufferCount: arr('buffers').length,
    bufferViewCount: arr('bufferViews').length,
    declaredVertices,
    indexedElements,
    binaryChunkCount: binChunks,
    binaryBytes: binBytes,
    extensionsUsed: Array.isArray(json.extensionsUsed) ? json.extensionsUsed.slice(0, 100) : [],
    extensionsRequired: Array.isArray(json.extensionsRequired) ? json.extensionsRequired.slice(0, 100) : [],
    meshNames: named(meshes),
    materialNames: named(materials),
    animationNames: named(animations),
  }
}
