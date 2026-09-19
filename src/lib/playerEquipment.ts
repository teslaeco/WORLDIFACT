import * as THREE from 'three'

export type OutfitPreset = 'original' | 'tracksuit' | 'dress' | 'casual'
export type EquipmentMode = 'stowed' | 'drone' | 'flight'
export type EquipmentAction = 'toggle-drone' | 'toggle-flight' | 'stow'

export function nextEquipmentMode(current: EquipmentMode, action: EquipmentAction): EquipmentMode {
  if (action === 'stow') return 'stowed'
  if (action === 'toggle-drone') return current === 'drone' ? 'stowed' : 'drone'
  return current === 'flight' ? 'stowed' : 'flight'
}

function material(color: string, metalness = 0.35, roughness = 0.42) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness })
}

export function createFanDevice(scale = 1) {
  const root = new THREE.Group()
  root.name = 'worldifact-fan-device'
  const dark = material('#091521', 0.52, 0.26)
  const teal = material('#0a8f91', 0.45, 0.32)
  const blue = material('#2963a6', 0.5, 0.3)
  const chrome = material('#b9d7dc', 0.92, 0.18)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .09, 18), chrome)
  hub.rotation.x = Math.PI / 2
  root.add(hub)
  for (let i = 0; i < 7; i++) {
    const angle = THREE.MathUtils.degToRad(-66 + i * 22)
    const blade = new THREE.Mesh(new THREE.ConeGeometry(.095, .62, 4), i % 2 ? teal : blue)
    blade.position.set(Math.sin(angle) * .29, Math.cos(angle) * .29, 0)
    blade.rotation.z = -angle
    blade.rotation.x = Math.PI
    blade.name = `fan-blade-${i + 1}`
    root.add(blade)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .04, 6), dark)
    tip.position.set(Math.sin(angle) * .56, Math.cos(angle) * .56, .01)
    tip.rotation.x = Math.PI / 2
    root.add(tip)
  }
  root.scale.setScalar(scale)
  root.userData.gameEquipment = 'fan'
  return root
}

function createTracksuit() {
  const group = new THREE.Group(); group.name = 'outfit-tracksuit'
  const cloth = material('#243a4f', .08, .8)
  const stripe = material('#d7f0ec', .04, .72)
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(.21, .34, 6, 12), cloth)
  jacket.position.y = 1.2; jacket.scale.set(1.08, 1, .72); group.add(jacket)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .46, 6, 10), cloth)
    leg.position.set(side * .12, .58, 0); group.add(leg)
    const stripeLeg = new THREE.Mesh(new THREE.BoxGeometry(.018, .52, .02), stripe)
    stripeLeg.position.set(side * .19, .58, -.075); group.add(stripeLeg)
  }
  return group
}

function createDress() {
  const group = new THREE.Group(); group.name = 'outfit-dress'
  const fabric = material('#1f4260', .12, .7)
  const trim = material('#4db0aa', .28, .46)
  const bodice = new THREE.Mesh(new THREE.CylinderGeometry(.19, .24, .38, 16), fabric)
  bodice.position.y = 1.22; group.add(bodice)
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(.4, .72, 20, 1, true), fabric)
  skirt.position.y = .78; group.add(skirt)
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.24, .025, 8, 24), trim)
  belt.rotation.x = Math.PI / 2; belt.position.y = 1.03; group.add(belt)
  return group
}

function createCasual() {
  const group = new THREE.Group(); group.name = 'outfit-casual'
  const top = material('#7c8796', .06, .82)
  const denim = material('#2b4d70', .08, .8)
  const shirt = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .28, 6, 12), top)
  shirt.position.y = 1.23; shirt.scale.z = .72; group.add(shirt)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.078, .37, 6, 10), denim)
    leg.position.set(side * .115, .59, 0); group.add(leg)
  }
  return group
}

export function hideEmbeddedFanNodes(root: THREE.Object3D) {
  let hidden = 0
  root.traverse(object => {
    const materialNames = object instanceof THREE.Mesh
      ? (Array.isArray(object.material) ? object.material : [object.material]).map(m => m.name || '').join(' ')
      : ''
    const label = `${object.name} ${materialNames}`.toLowerCase()
    if (/(^|[^a-z])(hand[_ -]?fan|fan|wachlarz|peacock[_ -]?fan)([^a-z]|$)/i.test(label)) {
      object.visible = false
      object.userData.worldifactHiddenEmbeddedFan = true
      hidden++
    }
  })
  return hidden
}

export function createAvatarEquipment(root: THREE.Group) {
  const equipment = new THREE.Group()
  equipment.name = 'worldifact-avatar-equipment'
  root.add(equipment)

  const leftFan = createFanDevice(.66)
  leftFan.name = 'shoulder-fan-left'
  leftFan.position.set(-.34, 1.38, -.02)
  leftFan.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  leftFan.visible = false
  equipment.add(leftFan)

  const rightFan = createFanDevice(.66)
  rightFan.name = 'shoulder-fan-right'
  rightFan.position.set(.34, 1.38, -.02)
  rightFan.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
  rightFan.visible = false
  equipment.add(rightFan)

  const outfits: Record<Exclude<OutfitPreset, 'original'>, THREE.Group> = {
    tracksuit: createTracksuit(),
    dress: createDress(),
    casual: createCasual(),
  }
  Object.values(outfits).forEach(group => { group.visible = false; equipment.add(group) })

  let outfit: OutfitPreset = 'original'
  let flightFans = false

  return {
    root: equipment,
    setOutfit(next: OutfitPreset) {
      outfit = next
      for (const [name, group] of Object.entries(outfits)) group.visible = name === next
    },
    setFlightFans(active: boolean) {
      flightFans = active
      leftFan.visible = active
      rightFan.visible = active
    },
    update(time: number) {
      if (flightFans) {
        leftFan.rotation.y = Math.sin(time * 9) * .08
        rightFan.rotation.y = -Math.sin(time * 9) * .08
      }
    },
    getOutfit: () => outfit,
    flightFansVisible: () => flightFans,
  }
}

export function createFanDrone() {
  const root = new THREE.Group()
  root.name = 'fan-drone'
  const fan = createFanDevice(.82)
  fan.rotation.x = Math.PI / 2
  root.add(fan)
  const light = new THREE.PointLight('#69f3e3', 1.8, 6)
  light.position.y = .08
  root.add(light)
  root.visible = false
  return {
    root,
    update(time: number, moving: number) {
      fan.rotation.z = time * (1.8 + moving * 2.7)
      root.rotation.z = Math.sin(time * 2.3) * .025
      root.position.y += Math.sin(time * 2.2) * .0007
    },
  }
}
