import { Box3, DoubleSide, Group, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { inspectGLB } from './glb.ts'
import { inspectEmbeddedGlb, isEmbeddedPreviewImage } from './softwareModelPreview.ts'
import { disposeObject } from './worldGeometry.ts'
import { MODEL_REFERENCE_BYTES, type ReferenceFileKind } from './studioFileReferences.ts'

export const REFERENCE_TRIANGLE_LIMIT = 300_000

/** Parse only bounded local geometry, with no external resources or executable files. */
export async function parseReferenceModel(bytes: ArrayBuffer, kind: Exclude<ReferenceFileKind, 'text'>): Promise<Group> {
  if (!bytes.byteLength || bytes.byteLength > MODEL_REFERENCE_BYTES) throw new Error('Use a model reference up to 20 MB.')
  const manager = new LoadingManager()
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:') && !isEmbeddedPreviewImage(url)) throw new Error('Embed all resources in a GLB; external model files are not fetched.')
    return url
  })
  let root: Group | undefined
  try {
    if (kind === 'glb') {
      const info = inspectGLB(bytes)
      inspectEmbeddedGlb(bytes)
      if (info.renderedTriangles > REFERENCE_TRIANGLE_LIMIT || info.nodeCount > 1000 || info.imageCount > 32) throw new Error('Use a reference copy with at most 300,000 triangles, 1,000 nodes and 32 textures.')
      root = (await new GLTFLoader(manager).parseAsync(bytes, '')).scene
    } else if (kind === 'obj') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      let vertices = 0, triangles = 0
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*v\s/.test(line)) vertices++
        if (/^\s*f\s/.test(line)) triangles += Math.max(0, line.trim().split(/\s+/).length - 3)
        if (vertices > REFERENCE_TRIANGLE_LIMIT * 3 || triangles > REFERENCE_TRIANGLE_LIMIT) throw new Error('Use an OBJ reference with at most 300,000 triangles.')
      }
      if (!vertices || !triangles) throw new Error('The OBJ reference has no mesh faces.')
      root = new OBJLoader(manager).parse(text)
    } else {
      const view = new DataView(bytes)
      const binaryCount = bytes.byteLength >= 84 ? view.getUint32(80, true) : 0
      const binary = bytes.byteLength >= 84 && 84 + binaryCount * 50 === bytes.byteLength
      if (binary && (!binaryCount || binaryCount > REFERENCE_TRIANGLE_LIMIT)) throw new Error('Use an STL reference with 1 to 300,000 triangles.')
      if (!binary) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        const count = (text.match(/\bfacet\s+normal\b/g) ?? []).length
        if (!/^\s*solid\b/.test(text) || !count || count > REFERENCE_TRIANGLE_LIMIT || !/\bendsolid\b/.test(text)) throw new Error('Invalid or oversized STL reference.')
      }
      root = new Group()
      root.add(new Mesh(new STLLoader().parse(bytes), new MeshStandardMaterial({ color: '#b7c6d8', roughness: 0.65, side: DoubleSide })))
    }
    root.updateMatrixWorld(true)
    let triangles = 0
    root.traverse(node => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      const position = mesh.geometry.getAttribute('position')
      if (!position || !position.count) throw new Error('This model contains empty geometry.')
      triangles += (mesh.geometry.index?.count ?? position.count) / 3
      for (let i = 0; i < position.count; i++) {
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(v => Number.isFinite(v) && Math.abs(v) <= 1e8)) throw new Error('This model contains invalid coordinates.')
      }
    })
    const bounds = new Box3().setFromObject(root), size = bounds.getSize(new Vector3())
    if (!triangles || triangles > REFERENCE_TRIANGLE_LIMIT || bounds.isEmpty() || !Number.isFinite(size.length()) || size.length() < 1e-10) throw new Error('This model has empty or oversized reference geometry.')
    return root
  } catch (error) {
    if (root) disposeObject(root)
    throw error
  }
}
