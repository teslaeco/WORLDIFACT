import { inspectGLB, type GLBInspection } from './glb.ts'

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const arr = (x: unknown): unknown[] => Array.isArray(x) ? x : []

/**
 * Bounded independent check that mesh data exists in the GLB binary, rather
 * than merely claiming tens of thousands of triangles in JSON accessors.
 * Samples are intentionally NOT a photorealism, topology or safety rating.
 */
export type StudioMeshEvidence = {
  inspection: GLBInspection
  embeddedPositionVertices: number
  distinctPositionSamples: number
  nondegenerateTriangleSamples: number
  triangleSamples: number
  materialPbrCount: number
  uvPrimitiveCount: number
}
export function inspectStudioMeshEvidence(buffer: ArrayBuffer): StudioMeshEvidence {
  const inspection = inspectGLB(buffer)
  const view = new DataView(buffer)
  const jsonSize = view.getUint32(12, true)
  const binHead = 20 + jsonSize
  if (binHead + 8 > buffer.byteLength || view.getUint32(binHead + 4, true) !== 0x004e4942)
    throw new Error('No embedded BIN geometry.')
  const binSize = view.getUint32(binHead, true), binOffset = binHead + 8
  if (!binSize || binSize % 4 !== 0 || binOffset + binSize !== buffer.byteLength)
    throw new Error('Corrupted embedded BIN geometry.')
  const doc: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonSize)))
  if (!obj(doc)) throw new Error('Invalid glTF object.')
  const buffers = arr(doc.buffers), views = arr(doc.bufferViews), accessors = arr(doc.accessors)
  const meshes = arr(doc.meshes), nodes = arr(doc.nodes), scenes = arr(doc.scenes)
  if (buffers.length !== 1 || !obj(buffers[0]) || buffers[0].uri !== undefined ||
      !num(buffers[0].byteLength) || buffers[0].byteLength <= 0 || buffers[0].byteLength > binSize ||
      binSize - buffers[0].byteLength > 3 || !scenes.length)
    throw new Error('GLB geometry is not self-contained.')
  const effectiveBin = buffers[0].byteLength
  const attribute = (id: unknown, format: string, components: readonly number[]) => {
    if (!num(id) || !obj(accessors[id])) throw new Error('Missing indexed GLB accessor.')
    const a = accessors[id]
    if (a.type !== format || !num(a.count) || a.count < 3 || !components.includes(a.componentType as number) ||
        a.sparse !== undefined || !num(a.bufferView) || !obj(views[a.bufferView]))
      throw new Error('Unsupported, sparse or missing GLB geometry accessor.')
    const bv = views[a.bufferView] as Record<string, unknown>
    const width = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4
    const packed = width * (format === 'VEC3' ? 3 : format === 'VEC2' ? 2 : 1)
    const start = bv.byteOffset ?? 0, skip = a.byteOffset ?? 0, stride = bv.byteStride ?? packed
    if (bv.buffer !== 0 || !num(start) || !num(skip) || !num(stride) ||
        !num(bv.byteLength) || stride < packed || stride % width !== 0 ||
        start + bv.byteLength > effectiveBin || skip + (a.count - 1) * stride + packed > bv.byteLength)
      throw new Error('A declared GLB accessor is not backed by its binary data.')
    return { count: a.count, start: binOffset + start + skip, stride, component: a.componentType as number }
  }
  const point = (source: ReturnType<typeof attribute>, i: number): [number,number,number] => {
    if (!num(i) || i >= source.count) throw new Error('GLB position index outside geometry buffer.')
    const offset = source.start + i * source.stride
    const p: [number,number,number] = [view.getFloat32(offset,true), view.getFloat32(offset+4,true), view.getFloat32(offset+8,true)]
    if (!p.every(Number.isFinite)) throw new Error('GLB contains nonfinite vertex positions.')
    return p
  }
  const indexValue = (source: ReturnType<typeof attribute>, i: number) => {
    if (!num(i) || i >= source.count) throw new Error('GLB triangle index buffer is invalid.')
    const offset = source.start + i * source.stride
    return source.component === 5121 ? view.getUint8(offset) : source.component === 5123 ? view.getUint16(offset,true) : view.getUint32(offset,true)
  }
  const usedMeshes = new Set<number>()
  const walk = (id: unknown) => {
    if (!num(id) || !obj(nodes[id])) throw new Error('Broken active scene graph.')
    const n = nodes[id]
    if (n.mesh !== undefined) {
      if (!num(n.mesh) || !obj(meshes[n.mesh])) throw new Error('Broken mesh reference.')
      usedMeshes.add(n.mesh)
    }
    for (const child of arr(n.children)) walk(child)
  }
  const sceneIndex = doc.scene ?? 0
  if (!num(sceneIndex) || !obj(scenes[sceneIndex])) throw new Error('GLB has no active scene.')
  for (const id of arr(scenes[sceneIndex].nodes)) walk(id)
  if (!usedMeshes.size) throw new Error('No active scene mesh.')
  const unique = new Set<string>()
  let embeddedPositionVertices = 0, nondegenerateTriangleSamples = 0, triangleSamples = 0
  let uvPrimitiveCount = 0
  for (const id of usedMeshes) {
    const mesh = meshes[id]
    if (!obj(mesh) || !Array.isArray(mesh.primitives)) throw new Error('Invalid GLB mesh primitives.')
    for (const p of mesh.primitives) {
      if (!obj(p) || !obj(p.attributes) || (p.mode ?? 4) !== 4)
        throw new Error('Detail-quality meshes must have independent triangle primitives.')
      const pos = attribute(p.attributes.POSITION,'VEC3',[5126])
      embeddedPositionVertices += pos.count
      if (p.attributes.TEXCOORD_0 !== undefined) {
        attribute(p.attributes.TEXCOORD_0,'VEC2',[5126,5123,5121])
        uvPrimitiveCount++
      }
      const indices = p.indices === undefined ? null : attribute(p.indices,'SCALAR',[5121,5123,5125])
      const count = indices?.count ?? pos.count
      const n = Math.floor(count / 3)
      if (!n) continue
      // Bounded evenly-spaced evidence probes; never claim exhaustive geometry QA.
      const cap = Math.min(n, 32)
      for (let k=0; k<cap; k++) {
        const t = Math.floor(k*n/cap)
        const p0=point(pos,indices?indexValue(indices,t*3):t*3)
        const p1=point(pos,indices?indexValue(indices,t*3+1):t*3+1)
        const p2=point(pos,indices?indexValue(indices,t*3+2):t*3+2)
        triangleSamples++
        for (const coords of [p0,p1,p2]) unique.add(coords.map(c=>c.toPrecision(7)).join(','))
        const u=p1.map((x,j)=>x-p0[j]), v=p2.map((x,j)=>x-p0[j])
        const x=u[1]*v[2]-u[2]*v[1], y=u[2]*v[0]-u[0]*v[2], z=u[0]*v[1]-u[1]*v[0]
        if (x*x+y*y+z*z>1e-22) nondegenerateTriangleSamples++
      }
    }
  }
  return {
    inspection, embeddedPositionVertices, distinctPositionSamples: unique.size,
    nondegenerateTriangleSamples, triangleSamples,
    materialPbrCount: arr(doc.materials).filter(m=>obj(m)&&obj(m.pbrMetallicRoughness)).length,
    uvPrimitiveCount,
  }
}
/** Only applies to NEW strictly selected quality profiles. Not a claim of beauty. */
export function hasRealDetailedMeshEvidence(report: StudioMeshEvidence): boolean {
  return report.embeddedPositionVertices >= 256 &&
    report.distinctPositionSamples >= 48 &&
    report.nondegenerateTriangleSamples >= 12 &&
    report.nondegenerateTriangleSamples * 2 >= report.triangleSamples
}
