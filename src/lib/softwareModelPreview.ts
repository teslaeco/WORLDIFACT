import {
  Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, FrontSide, Group,
  Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3,
} from 'three'

/** Static geometry only. Caps apply to rendered instances before allocation/projection. */
export const SOFTWARE_PREVIEW_LIMITS = Object.freeze({
  bytes: 16 * 1024 * 1024, jsonBytes: 2 * 1024 * 1024,
  nodes: 512, meshes: 256, primitives: 256, accessors: 2048, bufferViews: 2048,
  vertices: 60_000, triangles: 20_000, depth: 64, coordinate: 1e8,
})
export const MODEL_PREVIEW_MAX_BYTES = 96 * 1024 * 1024
export class ModelPreviewError extends Error {}
export const isEmbeddedPreviewImage = (value: unknown): value is string => typeof value === 'string'
  && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
const fail = (message: string): never => { throw new ModelPreviewError(message) }
type Json = Record<string, unknown>
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Json : fail('Invalid model structure.')
const list = (value: unknown, limit: number): unknown[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > limit) fail('This model exceeds the simplified preview limits.')
  return value as unknown[]
}
const integer = (value: unknown, min: number, max: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail('Invalid model geometry range.')
  return value as number
}
const vector = (value: unknown, fallback: number[]): number[] => {
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length !== fallback.length || !value.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= SOFTWARE_PREVIEW_LIMITS.coordinate)) fail('Invalid model transform or color.')
  return value as number[]
}
const noExtensions = (value: Json) => {
  if (value.extensions !== undefined && Object.keys(object(value.extensions)).length) fail('This model uses geometry features unsupported by the simplified preview.')
}

/** Read only an already-authorized local Blob URL. Never fetch a server or provider here. */
export async function readModelPreviewBytes(url: string, signal: AbortSignal, maxBytes = MODEL_PREVIEW_MAX_BYTES): Promise<ArrayBuffer> {
  if (new URL(url).protocol !== 'blob:') fail('The preview requires a local model download.')
  signal.throwIfAborted()
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' })
  if (!response.ok || !response.body) fail('The model download could not be read.')
  const length = Number(response.headers.get('content-length'))
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    if (Number.isFinite(length) && length > maxBytes) fail('This model exceeds the preview file limit.')
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) fail('This model exceeds the preview file limit.')
      chunks.push(chunk.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes.buffer
}

/** Validate the GLB container and disallow external resources in BOTH render paths. */
export function inspectEmbeddedGlb(bytes: ArrayBuffer): { json: Json; bin: DataView } {
  if (bytes.byteLength < 28 || bytes.byteLength > MODEL_PREVIEW_MAX_BYTES) fail('Invalid or oversized GLB file.')
  const view = new DataView(bytes)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) fail('Invalid GLB container.')
  const jsonSize = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonSize > SOFTWARE_PREVIEW_LIMITS.jsonBytes || jsonSize % 4 || 20 + jsonSize + 8 > bytes.byteLength) fail('Invalid or oversized GLB metadata.')
  let json: Json
  try { json = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes, 20, jsonSize)))) }
  catch { return fail('Invalid GLB metadata.') }
  const binHeader = 20 + jsonSize, binSize = view.getUint32(binHeader, true)
  if (view.getUint32(binHeader + 4, true) !== 0x004e4942 || binSize % 4 || binHeader + 8 + binSize !== bytes.byteLength) fail('Invalid GLB binary chunk.')
  if (object(json.asset).version !== '2.0') fail('Unsupported GLB version.')
  const buffers = list(json.buffers, 1)
  if (buffers.length !== 1) fail('The preview requires one embedded model buffer.')
  const size = integer(object(buffers[0]).byteLength, 0, binSize)
  if (binSize - size > 3) fail('Invalid GLB buffer length.')
  // Iterative traversal bounds pathological metadata and rejects URI-bearing extensions too.
  const embeddedImages = new Set(list(json.images, 512).map(object))
  const queue: unknown[] = [json]
  let visited = 0
  while (queue.length) {
    if (++visited > 100_000) fail('This model has too much metadata for preview.')
    const value = queue.pop()
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.toLowerCase() === 'uri' && !(key === 'uri' && embeddedImages.has(value as Json) && isEmbeddedPreviewImage(child))) fail('External or unsupported URI model resources are not supported in this preview.')
        queue.push(child)
      }
    }
  }
  return { json, bin: new DataView(bytes, binHeader + 8, size) }
}

type Accessor = { count: number; read: (index: number, component?: number) => number }
type Primitive = { positions: Accessor; indices?: Accessor; count: number; materialIndex?: number }
type Instance = { primitives: Primitive[]; matrix: Matrix4 }

/** Decode the bounded static subset directly: no loader, image decoding, scripts or I/O. */
export function buildSoftwareModel(bytes: ArrayBuffer): { model: Group; triangles: number; vertices: number; person: boolean } {
  if (bytes.byteLength > SOFTWARE_PREVIEW_LIMITS.bytes) fail('This model exceeds the simplified preview file limit.')
  const { json, bin } = inspectEmbeddedGlb(bytes)
  const nodes = list(json.nodes, SOFTWARE_PREVIEW_LIMITS.nodes).map(object)
  const meshes = list(json.meshes, SOFTWARE_PREVIEW_LIMITS.meshes).map(object)
  const materials = list(json.materials, SOFTWARE_PREVIEW_LIMITS.primitives).map(object)
  const views = list(json.bufferViews, SOFTWARE_PREVIEW_LIMITS.bufferViews).map(object)
  const accessors = list(json.accessors, SOFTWARE_PREVIEW_LIMITS.accessors).map(object)
  const scenes = list(json.scenes, SOFTWARE_PREVIEW_LIMITS.nodes).map(object)
  if (list(json.skins, 0).length || list(json.animations, 0).length) fail('Animated or skinned models are unsupported in the simplified preview.')
  if (json.extensionsRequired !== undefined && list(json.extensionsRequired, 32).some(name => name !== 'KHR_materials_unlit')) fail('This model requires features unsupported by the simplified preview.')
  const accessor = (index: unknown, positions: boolean): Accessor => {
    const a = accessors[integer(index, 0, accessors.length - 1)]
    noExtensions(a)
    if (a.sparse !== undefined || a.normalized === true || a.type !== (positions ? 'VEC3' : 'SCALAR')) fail('Unsupported model geometry encoding.')
    const type = integer(a.componentType, 5121, 5126)
    if (positions ? type !== 5126 : ![5121, 5123, 5125].includes(type)) fail('Unsupported model geometry encoding.')
    const width = type === 5121 ? 1 : type === 5123 ? 2 : 4, itemSize = width * (positions ? 3 : 1)
    const count = integer(a.count, 1, positions ? SOFTWARE_PREVIEW_LIMITS.vertices : SOFTWARE_PREVIEW_LIMITS.triangles * 3)
    const v = views[integer(a.bufferView, 0, views.length - 1)]
    noExtensions(v)
    if (v.buffer !== 0) fail('The model buffer must be embedded.')
    const start = integer(v.byteOffset ?? 0, 0, bin.byteLength), length = integer(v.byteLength, 0, bin.byteLength - start)
    const offset = integer(a.byteOffset ?? 0, 0, length)
    const stride = integer(v.byteStride ?? itemSize, itemSize, 252)
    if (start % width || offset % width || stride % width || (!positions && v.byteStride !== undefined) || offset + (count - 1) * stride + itemSize > length) fail('Invalid model geometry bounds or stride.')
    return { count, read: (i, component = 0) => {
      const at = start + offset + i * stride + component * width
      return positions ? bin.getFloat32(at, true) : type === 5121 ? bin.getUint8(at) : type === 5123 ? bin.getUint16(at, true) : bin.getUint32(at, true)
    } }
  }
  let primitiveDefinitions = 0, sourceVertices = 0, sourceTriangles = 0
  const geometry = meshes.map(mesh => {
    noExtensions(mesh)
    if (mesh.weights !== undefined) fail('Morph models are unsupported in the simplified preview.')
    const primitives = list(mesh.primitives, SOFTWARE_PREVIEW_LIMITS.primitives).map(object)
    primitiveDefinitions += primitives.length
    if (!primitives.length || primitiveDefinitions > SOFTWARE_PREVIEW_LIMITS.primitives) fail('This model has too many mesh parts for simplified preview.')
    return primitives.map((p): Primitive => {
      noExtensions(p)
      if ((p.mode ?? 4) !== 4 || p.targets !== undefined) fail('Only static triangle meshes support simplified preview.')
      const attributes = object(p.attributes)
      if (Object.keys(attributes).some(key => key.startsWith('JOINTS_') || key.startsWith('WEIGHTS_'))) fail('Skinned models are unsupported in the simplified preview.')
      const positions = accessor(attributes.POSITION, true), indices = p.indices === undefined ? undefined : accessor(p.indices, false)
      const count = indices?.count ?? positions.count
      if (count % 3) fail('Invalid model triangle count.')
      sourceVertices += positions.count; sourceTriangles += count / 3
      if (sourceVertices > SOFTWARE_PREVIEW_LIMITS.vertices || sourceTriangles > SOFTWARE_PREVIEW_LIMITS.triangles) fail('This model is too complex for the simplified preview.')
      for (let i = 0; i < positions.count; i++) for (let component = 0; component < 3; component++) {
        const value = positions.read(i, component)
        if (!Number.isFinite(value) || Math.abs(value) > SOFTWARE_PREVIEW_LIMITS.coordinate) fail('Invalid or extreme model coordinates.')
      }
      if (indices) for (let i = 0; i < indices.count; i++) if (indices.read(i) >= positions.count) fail('Invalid model vertex index.')
      const materialIndex = p.material === undefined ? undefined : integer(p.material, 0, materials.length - 1)
      return { positions, indices, count, materialIndex }
    })
  })
  const instances: Instance[] = [], visited = new Set<number>()
  let triangles = 0, vertices = 0, draws = 0, person = false
  const scene = scenes[integer(json.scene ?? 0, 0, scenes.length - 1)]
  const pending = list(scene.nodes, SOFTWARE_PREVIEW_LIMITS.nodes).map(index => ({ index, parent: new Matrix4(), depth: 1 }))
  const bounds = new Box3(), point = new Vector3()
  while (pending.length) {
    const item = pending.pop()!, index = integer(item.index, 0, nodes.length - 1), node = nodes[index]
    if (visited.has(index) || item.depth > SOFTWARE_PREVIEW_LIMITS.depth) fail('Invalid or overly deep model hierarchy.')
    visited.add(index); noExtensions(node)
    if (node.skin !== undefined || node.weights !== undefined) fail('Skinned or morph models are unsupported in the simplified preview.')
    let local: Matrix4
    if (node.matrix !== undefined) {
      if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) fail('Conflicting model transforms.')
      const matrix = vector(node.matrix, new Matrix4().elements)
      if (matrix[3] || matrix[7] || matrix[11] || matrix[15] !== 1) fail('Unsupported model transform.')
      local = new Matrix4().fromArray(matrix)
    } else {
      const t = vector(node.translation, [0, 0, 0]), r = vector(node.rotation, [0, 0, 0, 1]), s = vector(node.scale, [1, 1, 1])
      if (Math.abs(Math.hypot(...r) - 1) > 0.001) fail('Invalid model rotation.')
      local = new Matrix4().compose(new Vector3(...t), new Quaternion(...r).normalize(), new Vector3(...s))
    }
    const matrix = item.parent.clone().multiply(local)
    if (!matrix.elements.every(n => Number.isFinite(n) && Math.abs(n) <= SOFTWARE_PREVIEW_LIMITS.coordinate)) fail('Invalid or extreme model transform.')
    if (matrix.determinant() <= 0) fail('Mirrored or flat transforms are unsupported in the simplified preview.')
    if (node.extras && object(node.extras).froge_kind === 'person') person = true
    if (node.mesh !== undefined) {
      const primitives = geometry[integer(node.mesh, 0, geometry.length - 1)]
      for (const p of primitives) {
        triangles += p.count / 3; vertices += p.positions.count; draws++
        if (triangles > SOFTWARE_PREVIEW_LIMITS.triangles || vertices > SOFTWARE_PREVIEW_LIMITS.vertices || draws > SOFTWARE_PREVIEW_LIMITS.primitives) fail('This model is too complex for the simplified preview.')
        for (let i = 0; i < p.positions.count; i++) {
          point.set(p.positions.read(i, 0), p.positions.read(i, 1), p.positions.read(i, 2)).applyMatrix4(matrix)
          if (!point.toArray().every(n => Number.isFinite(n) && Math.abs(n) <= SOFTWARE_PREVIEW_LIMITS.coordinate)) fail('Invalid transformed model coordinates.')
          bounds.expandByPoint(point)
        }
      }
      instances.push({ primitives, matrix })
    }
    for (const child of list(node.children, SOFTWARE_PREVIEW_LIMITS.nodes)) pending.push({ index: child, parent: matrix, depth: item.depth + 1 })
  }
  if (!triangles || bounds.isEmpty() || bounds.getSize(point).length() <= 1e-10) fail('The model has no usable geometry for simplified preview.')
  // Allocate only after validating all rendered instances and transformed bounds.
  const model = new Group()
  try {
    for (const instance of instances) for (const p of instance.primitives) {
      const values = new Float32Array(p.positions.count * 3)
      for (let i = 0; i < p.positions.count; i++) for (let c = 0; c < 3; c++) values[i * 3 + c] = p.positions.read(i, c)
      const source = p.materialIndex === undefined ? {} : materials[p.materialIndex]
      const pbr = source.pbrMetallicRoughness === undefined ? {} : object(source.pbrMetallicRoughness)
      const color = vector(pbr.baseColorFactor, [1, 1, 1, 1])
      if (color.some(c => c < 0 || c > 1) || (source.alphaMode !== undefined && !['OPAQUE', 'BLEND'].includes(String(source.alphaMode)))) fail('Unsupported model base material.')
      const material = new MeshLambertMaterial({ color: new Color().setRGB(color[0], color[1], color[2]), side: source.doubleSided === true ? DoubleSide : FrontSide, opacity: source.alphaMode === 'BLEND' ? color[3] : 1, transparent: source.alphaMode === 'BLEND' })
      const buffer = new BufferGeometry()
      const mesh = new Mesh(buffer, material)
      model.add(mesh) // Own resources immediately, including on a later validation failure.
      buffer.setAttribute('position', new BufferAttribute(values, 3))
      if (p.indices) { const indices = new Uint32Array(p.indices.count); for (let i = 0; i < indices.length; i++) indices[i] = p.indices.read(i); buffer.setIndex(new BufferAttribute(indices, 1)) }
      buffer.computeVertexNormals()
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(instance.matrix)
    }
    model.updateMatrixWorld(true)
    return { model, triangles, vertices, person }
  } catch (error) { disposeSoftwareModel(model); throw error }
}

export function disposeSoftwareModel(model: Group) {
  model.removeFromParent()
  model.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose() } })
  model.clear()
}
