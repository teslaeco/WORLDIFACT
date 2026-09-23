import * as THREE from 'three'
import { riverHalfWidth } from './waterPhysics.ts'

/** Seeded, local scenery; one instanced draw, no images or external requests. */
export function createMeadowGrass(mobile: boolean) {
  const shape = new THREE.BufferGeometry()
  shape.setAttribute('position', new THREE.Float32BufferAttribute([
    -.04,0,0, .04,0,0, .015,.24,.02,
    0,0,-.04, 0,0,.04, -.015,.2,.02,
    -.025,0,-.025, .025,0,.025, .04,.17,0,
  ],3))
  shape.computeVertexNormals()
  const grass = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide }), mobile ? 1200 : 2800)
  grass.name = 'meadow-grass-instanced'
  const dummy = new THREE.Object3D(), color = new THREE.Color()
  let seed = 73429
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < grass.count; i++) {
    const x = (random() - .5) * 70
    let z = (random() - .5) * 66
    // Keep water and the portal river line clear.
    if (Math.abs(z) < riverHalfWidth(x) + 1) z += Math.sign(z || 1) * (riverHalfWidth(x) + 1.5)
    dummy.position.set(x, .006, z)
    dummy.rotation.y = random() * Math.PI * 2
    const scale = .6 + random() * .65
    dummy.scale.set(scale, scale, scale); dummy.updateMatrix()
    grass.setMatrixAt(i, dummy.matrix)
    color.setHSL(.23 + random() * .07, .30 + random() * .12, .20 + random() * .12)
    grass.setColorAt(i, color)
  }
  grass.receiveShadow = true
  grass.computeBoundingSphere()
  return grass
}
