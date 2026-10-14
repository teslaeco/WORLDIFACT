import { inspectGLB, type GLBInspection } from './glb.ts'

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/**
 * Stricter than the legacy preview inspection. Only genuinely backed,
 * finite, non-flat triangle geometry is eligible for an INCOMPLETE recovery.
 * This does not assess visual quality or certify a finished model.
 */
export function inspectRetainedStudioGLB(buffer: ArrayBuffer): GLBInspection {
  const summary = inspectGLB(buffer)
  if (!summary.meshCount || !summary.renderedTriangles || !summary.triangles)
    throw new Error('No renderable mesh exists in the retained GLB.')
  const bytes = new DataView(buffer)
  const jsonSize = bytes.getUint32(12, true)
  const binaryHeader = 20 + jsonSize
  if (binaryHeader + 8 > buffer.byteLength || bytes.getUint32(binaryHeader + 4, true) !== 0x004e4942)
    throw new Error('The retained GLB has no embedded geometry BIN chunk.')
  const binarySize = bytes.getUint32(binaryHeader, true)
  const binaryStart = binaryHeader + 8
  if (!binarySize || binaryStart + binarySize !== buffer.byteLength || binarySize % 4 !== 0)
    throw new Error('The retained GLB binary chunk is incomplete.')
  const doc: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonSize)))
  if (!record(doc) || !Array.isArray(doc.buffers) || doc.buffers.length !== 1 ||
      !record(doc.buffers[0]) || doc.buffers[0].uri !== undefined ||
      !uint(doc.buffers[0].byteLength) || doc.buffers[0].byteLength === 0 ||
      doc.buffers[0].byteLength > binarySize || binarySize - doc.buffers[0].byteLength > 3 ||
      !Array.isArray(doc.bufferViews) || !Array.isArray(doc.accessors) ||
      !Array.isArray(doc.meshes) || !Array.isArray(doc.nodes))
    throw new Error('The retained GLB does not contain a complete embedded mesh buffer.')

  const views = doc.bufferViews
  const accessors = doc.accessors
  const meshes = doc.meshes
  const nodes = doc.nodes
  const bounds = (accessorId: unknown, packed: number, component: number | number[], type: string) => {
    if (!uint(accessorId) || !record(accessors[accessorId])) throw new Error('Missing geometry accessor.')
    const accessor = accessors[accessorId]
    if (!uint(accessor.bufferView) || !record(views[accessor.bufferView]) ||
        accessor.sparse !== undefined || accessor.type !== type ||
        !(Array.isArray(component) ? component.includes(accessor.componentType as number) : accessor.componentType === component) ||
        !uint(accessor.count) || accessor.count < 3)
      throw new Error('Unsupported or missing geometry accessor data.')
    const view = views[accessor.bufferView]
    const viewOffset = view.byteOffset ?? 0
    const entryOffset = accessor.byteOffset ?? 0
    const stride = view.byteStride ?? packed
    if (view.buffer !== 0 || !uint(viewOffset) || !uint(view.byteLength) ||
        !uint(entryOffset) || !uint(stride) || stride < packed ||
        viewOffset + view.byteLength > doc.buffers[0].byteLength ||
        entryOffset + (accessor.count - 1) * stride + packed > view.byteLength)
      throw new Error('Geometry accessor exceeds the retained GLB binary buffer.')
    return { start: binaryStart + viewOffset + entryOffset, stride, count: accessor.count, componentType: accessor.componentType }
  }

  let validPrimitive = false
  const inspectPrimitive = (primitive: unknown) => {
    if (!record(primitive) || !record(primitive.attributes) || primitive.extensions?.['KHR_draco_mesh_compression'] ||
        (primitive.mode !== undefined && ![4, 5, 6].includes(primitive.mode as number))) return
    const position = bounds(primitive.attributes.POSITION, 12, 5126, 'VEC3')
    let spans = 0
    for (let component = 0; component < 3; component++) {
      let low = Infinity, high = -Infinity
      for (let i = 0; i < position.count; i++) {
        const value = bytes.getFloat32(position.start + i * position.stride + component * 4, true)
        if (!Number.isFinite(value)) throw new Error('Retained geometry has non-finite vertex coordinates.')
        low = Math.min(low, value); high = Math.max(high, value)
      }
      if (high > low) spans++
    }
    if (primitive.indices !== undefined) {
      if (!uint(primitive.indices) || !record(accessors[primitive.indices]))
        throw new Error('Missing retained geometry index accessor.')
      const index = accessors[primitive.indices]
      const width = index.componentType === 5121 ? 1 : index.componentType === 5123 ? 2 : index.componentType === 5125 ? 4 : 0
      if (!width) throw new Error('Unsupported retained geometry index format.')
      const range = bounds(primitive.indices, width, [5121, 5123, 5125], 'SCALAR')
      for (let i = 0; i < range.count; i++) {
        const offset = range.start + i * range.stride
        const value = width === 1 ? bytes.getUint8(offset) : width === 2 ? bytes.getUint16(offset, true) : bytes.getUint32(offset, true)
        if (value >= position.count) throw new Error('Retained geometry index points outside vertex data.')
      }
    }
    if (spans >= 2) validPrimitive = true
  }

  const visited = new Set<number>()
  const walk = (id: unknown) => {
    if (!uint(id) || !record(nodes[id])) throw new Error('Invalid retained scene node.')
    if (visited.has(id)) return
    visited.add(id)
    const node = nodes[id]
    if (node.mesh !== undefined) {
      if (!uint(node.mesh) || !record(meshes[node.mesh]) || !Array.isArray(meshes[node.mesh].primitives))
        throw new Error('Invalid retained scene mesh.')
      for (const primitive of meshes[node.mesh].primitives) inspectPrimitive(primitive)
    }
    if (Array.isArray(node.children)) for (const child of node.children) walk(child)
  }
  if (Array.isArray(doc.scenes) && doc.scenes.length) {
    const sceneIndex = doc.scene ?? 0
    if (!uint(sceneIndex) || !record(doc.scenes[sceneIndex]) || !Array.isArray(doc.scenes[sceneIndex].nodes))
      throw new Error('Invalid retained active scene.')
    for (const id of doc.scenes[sceneIndex].nodes) walk(id)
  } else {
    for (let id = 0; id < nodes.length; id++) walk(id)
  }
  if (!validPrimitive) throw new Error('The retained GLB contains no spatially usable triangle geometry.')
  return summary
}
