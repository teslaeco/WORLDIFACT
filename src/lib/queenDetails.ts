import * as THREE from 'three'

/** Restore a satin finish to the original shoes; preserve geometry, UVs and maps. */
export function polishQueenFootwear(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const label = `${object.name}`.toLowerCase()
    if (!/shoe|boot|heel|sandal/.test(label)) return
    const improve = (material: THREE.Material) => {
      const copy = material.clone()
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.roughness = .4; copy.metalness = .18
        if (!copy.map) copy.color.set('#122b3e')
      }
      return copy
    }
    object.material = Array.isArray(object.material) ? object.material.map(improve) : improve(object.material)
  })
}

/** Queen source faces +Z; game movement, footwear and gait use canonical -Z. */
export function orientQueenForGameplay(model: THREE.Object3D) { model.rotateY(Math.PI); model.updateMatrixWorld(true) }
