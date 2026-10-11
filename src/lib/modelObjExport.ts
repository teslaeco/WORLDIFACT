import { LoadingManager, Matrix4, Mesh, Vector3, BufferAttribute } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { inspectGLB } from './glb.ts'
import { inspectEmbeddedGlb, isEmbeddedPreviewImage } from './softwareModelPreview.ts'
import { disposeObject } from './worldGeometry.ts'

/** Local mesh conversion from an already authorized GLB; no provider calls.
 * OBJ stores static geometry/UVs/normals, not Blender rigs or PBR textures. */
export async function modelObjExport(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer()
  inspectGLB(bytes); inspectEmbeddedGlb(bytes)
  const manager = new LoadingManager()
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:') && !isEmbeddedPreviewImage(url)) throw new Error('External model resources are not allowed.')
    return url
  })
  const gltf = await new GLTFLoader(manager).parseAsync(bytes, '')
  const scene = gltf.scene
  try {
    scene.updateMatrixWorld(true)
    const meshes: Mesh[] = []
    scene.traverse(node => { if ((node as Mesh).isMesh) meshes.push(node as Mesh) })
    // Export the current pose, including morph targets, skinning and instances.
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone(), position = geometry.getAttribute('position')
      const vertices = new Float32Array(position.count * 3), vertex = new Vector3()
      for (let i = 0; i < position.count; i++) { mesh.getVertexPosition(i, vertex); vertex.toArray(vertices, i * 3) }
      geometry.setAttribute('position', new BufferAttribute(vertices, 3))
      geometry.morphAttributes = {}; geometry.computeVertexNormals()
      const instance = mesh as Mesh & { isInstancedMesh?: boolean; count: number; getMatrixAt(index: number, target: Matrix4): void }
      const count = instance.isInstancedMesh ? instance.count : 1
      for (let i = 0; i < count; i++) {
        const baked = new Mesh(geometry, mesh.material)
        baked.name = mesh.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'mesh'
        baked.matrixAutoUpdate = false
        baked.matrix.copy(mesh.matrixWorld)
        if (instance.isInstancedMesh) { const matrix = new Matrix4(); instance.getMatrixAt(i, matrix); baked.matrix.multiply(matrix) }
        scene.add(baked)
      }
      mesh.removeFromParent()
      // The clone is disposed with the export scene; release the detached original.
      mesh.geometry.dispose()
    }
    scene.updateMatrixWorld(true)
    return new Blob(['# WORLDIFACT static geometry; use GLB or Blender for PBR materials and rigs.\n', new OBJExporter().parse(scene)], { type: 'text/plain' })
  } finally { disposeObject(scene) }
}
