import * as THREE from 'three'

/** GAME embellishment only: never replace, decimate or export the source fan. */
export function addFanRotors(fan: THREE.Group, originalParts: THREE.Mesh[]) {
  fan.updateWorldMatrix(true, true)
  const inverse = fan.matrixWorld.clone().invert(), bounds = new THREE.Box3()
  for (const mesh of originalParts) bounds.union(new THREE.Box3().setFromObject(mesh).applyMatrix4(inverse))
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
  const axes = [0,1,2].sort((a,b) => size.getComponent(b) - size.getComponent(a))
  const width = size.getComponent(axes[0]), height = size.getComponent(axes[1])
  if (!Number.isFinite(width) || width < .06 || height < .04) return { rotors: [] as THREE.Group[], update(_dt: number, _active: boolean) {} }
  const radius = Math.min(width * .066, height * .13, .046)
  const normal = new THREE.Vector3().setComponent(axes[2],1)
  const turnToPlane = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal)
  const silver = new THREE.MeshStandardMaterial({ color: '#99d9d6', metalness: .7, roughness: .3 })
  const teal = new THREE.MeshStandardMaterial({ color: '#194a60', metalness: .5, roughness: .35, side: THREE.DoubleSide })
  const ringGeometry = new THREE.TorusGeometry(radius, radius * .1, 5, 6)
  const hubGeometry = new THREE.SphereGeometry(radius * .18, 8, 6)
  const bladeGeometry = new THREE.BoxGeometry(radius * .65, radius * .17, radius * .06)
  const rotors: THREE.Group[] = []
  for (let index = 0; index < 5; index++) {
    const device = new THREE.Group(); device.name = `Queen_Fan_Hex_Rotor_${index + 1}`
    device.position.copy(center)
    device.position.setComponent(axes[0], center.getComponent(axes[0]) + (index - 2) * width * .145)
    device.position.setComponent(axes[2], bounds.max.getComponent(axes[2]) + radius * .18)
    device.quaternion.copy(turnToPlane)
    device.add(new THREE.Mesh(ringGeometry,silver), new THREE.Mesh(hubGeometry,silver))
    const spinning = new THREE.Group(); spinning.name = 'six-blade-impeller'
    for (let blade = 0; blade < 6; blade++) {
      const mesh = new THREE.Mesh(bladeGeometry,teal), angle = blade * Math.PI / 3
      mesh.position.set(Math.cos(angle)*radius*.53, Math.sin(angle)*radius*.53, 0)
      mesh.rotation.z = angle + .22; spinning.add(mesh)
    }
    device.add(spinning); fan.add(device); rotors.push(spinning)
    // A back-facing housing keeps the mechanical detail visible from both sides.
    const back = device.clone(true)
    back.name += '_back'; back.position.setComponent(axes[2],bounds.min.getComponent(axes[2]) - radius * .18)
    fan.add(back); rotors.push(back.getObjectByName('six-blade-impeller') as THREE.Group)
  }
  return { rotors, update(dt: number, active: boolean) { for (const rotor of rotors) rotor.rotation.z = (rotor.rotation.z + dt * (active ? 24 : 1.2)) % (Math.PI * 2) } }
}

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
