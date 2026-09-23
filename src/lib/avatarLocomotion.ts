import * as THREE from 'three'
import { gaitPose, STANCE, STRIDE, WALK_SPEED } from './avatarPose.ts'
import type { JumpAnimation } from './playerJump.ts'
export { footCycle, legAngles } from './avatarPose.ts'

/** Runtime GAME rig only. Original positions, UVs, indices and materials are retained.
 * Never use this approximate anatomical binding as a manufacturing/source export. */
export type GameRig = ReturnType<typeof bindStaticAvatar>
const smooth = THREE.MathUtils.smoothstep
const labelOf = (mesh: THREE.Mesh) => {
  // Generated assets often name the GROUP, with anonymous mesh/primitive children.
  const names = [mesh.name, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => m.name)]
  let parent = mesh.parent
  while (parent && parent.parent) { names.push(parent.name); parent = parent.parent }
  return names.join(' ').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}
const isFan = (s: string) => /(?:^|[^a-z])(?:fan(?:surface|blade|handle|frame|membrane|rib)?|wachlarz|handfan|peacock)(?:[^a-z]|$)/i.test(s.replace(/([a-z])([A-Z])/g, '$1_$2'))
const isArm = (s: string) => /arm(?!ou?r)|hand|palm|finger|thumb|wrist|elbow|sleeve|gauntlet/.test(s) && !/charm/.test(s)
const isHand = (s: string) => /hand|palm|finger|thumb|wrist/.test(s) && !isFan(s)

/** Frame the body rather than a wide/raised fan or display pedestal. */
export function avatarBodyBounds(root: THREE.Object3D) {
  const body = new THREE.Box3(), core = new THREE.Box3()
  root.updateMatrixWorld(true)
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const label = labelOf(object)
    if (isFan(label) || /pedestal|platform|ground|display[_ -]?base/.test(label)) return
    const box = new THREE.Box3().setFromObject(object)
    body.union(box)
    if (/torso|chest|pelvis|head|face|neck/.test(label)) core.union(box)
  })
  if (body.isEmpty()) body.setFromObject(root)
  return { body, center: (core.isEmpty() ? body : core).getCenter(new THREE.Vector3()) }
}

export function bindStaticAvatar(root: THREE.Group) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse(o => { if (o instanceof THREE.Mesh && !(o instanceof THREE.SkinnedMesh)) meshes.push(o) })
  const invRoot = root.matrixWorld.clone().invert()
  const localBounds = (mesh: THREE.Mesh) => new THREE.Box3().setFromObject(mesh).applyMatrix4(invRoot)
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const b = new THREE.Bone(); b.name = `Worldifact_${name}`; b.position.set(x, y, z); parent.add(b); return b
  }
  const anchor = bone('Root', root, 0, 0)
  const hips = bone('Hips', anchor, 0, .90)
  const legs = [-1, 1].map(side => {
    const thigh = bone(side < 0 ? 'LeftUpLeg' : 'RightUpLeg', hips, side * .11, 0)
    const knee = bone(side < 0 ? 'LeftLeg' : 'RightLeg', thigh, 0, -.41)
    const ankle = bone(side < 0 ? 'LeftFoot' : 'RightFoot', knee, 0, -.41)
    return { thigh, knee, ankle }
  })
  const arms = [-1, 1].map(side => {
    const handBox = new THREE.Box3()
    for (const m of meshes) {
      if (!isHand(labelOf(m))) continue
      const b = localBounds(m), c = b.getCenter(new THREE.Vector3())
      if (Math.sign(c.x) === side && c.y > .45 && c.y < 1.5) handBox.union(b)
    }
    const hasHand = !handBox.isEmpty()
    const handPoint = hasHand ? handBox.getCenter(new THREE.Vector3()) : new THREE.Vector3(side * .30, .80, 0)
    const shoulderPoint = new THREE.Vector3(side * .24, 1.37, 0)
    const rest = handPoint.clone().sub(shoulderPoint)
    const length = Math.max(.305, rest.length() * .515)
    // Locate a bent elbow behind the hand in the sagittal plane. A named lower-arm
    // mesh, when available, supplies the original joint rather than the estimate.
    const perpendicular = new THREE.Vector3(0, rest.z, -rest.y).normalize()
    const elbowPoint = shoulderPoint.clone().addScaledVector(rest, .5).addScaledVector(perpendicular, Math.sqrt(Math.max(0, length * length - rest.lengthSq() / 4)))
    const lowerBox = new THREE.Box3()
    for (const m of meshes) {
      if (!/(?:fore|lower)[ _-]*arm|elbow/.test(labelOf(m))) continue
      const box = localBounds(m)
      if (Math.sign(box.getCenter(new THREE.Vector3()).x) === side) lowerBox.union(box)
    }
    if (!lowerBox.isEmpty()) {
      const inferred = lowerBox.getCenter(new THREE.Vector3()).multiplyScalar(2).sub(handPoint)
      if (inferred.distanceTo(shoulderPoint) > .16 && inferred.distanceTo(shoulderPoint) < .4 && inferred.distanceTo(handPoint) > .16 && inferred.distanceTo(handPoint) < .4) elbowPoint.copy(inferred)
    }
    const shoulder = bone(side < 0 ? 'LeftArm' : 'RightArm', hips, side * .24, .47)
    const upper = elbowPoint.clone().sub(shoulderPoint)
    const lower = handPoint.clone().sub(elbowPoint)
    const elbow = bone(side < 0 ? 'LeftForeArm' : 'RightForeArm', shoulder, upper.x, upper.y, upper.z)
    const hand = bone(side < 0 ? 'LeftHand' : 'RightHand', elbow, lower.x, lower.y, lower.z)
    const down = hasHand ? new THREE.Quaternion().setFromUnitVectors(upper.clone().normalize(), new THREE.Vector3(side * .12, -1, 0).normalize()) : new THREE.Quaternion()
    const elbowDown = hasHand ? new THREE.Quaternion().setFromUnitVectors(lower.clone().normalize(), new THREE.Vector3(side * .08, -1, 0).normalize().applyQuaternion(down.clone().invert())) : new THREE.Quaternion()
    const up = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(side * .12, -1, 0).normalize(), new THREE.Vector3(side * .22, 1, -.12).normalize()).multiply(down)
    return { shoulder, elbow, hand, rest, down, up, elbowDown, hasHand, point: handPoint, shoulderPoint, elbowPoint }

  })
  root.updateMatrixWorld(true)
  const bones = [anchor, hips, ...legs.flatMap(l => [l.thigh, l.knee, l.ankle]), ...arms.flatMap(a => [a.shoulder, a.elbow, a.hand])]
  const skeleton = new THREE.Skeleton(bones)
  const fans = meshes.filter(m => {
    // Never move a whole body solely because one of its material slots is a fan.
    const materials = Array.isArray(m.material) ? m.material : [m.material]
    let parent = m.parent
    while (parent && parent !== root) { if (isFan(parent.name)) return true; parent = parent.parent }
    return isFan(m.name) || (materials.length > 0 && materials.every(mat => isFan(mat.name)))
  })
  const p = new THREE.Vector3(), nearestUpper = new THREE.Vector3(), nearestLower = new THREE.Vector3()
  const armSegments = arms.map(a => ({ upper: new THREE.Line3(a.shoulderPoint, a.elbowPoint), lower: new THREE.Line3(a.elbowPoint, a.point) }))
  for (const original of meshes) {
    if (fans.includes(original)) continue
    const label = labelOf(original), bounds = localBounds(original)
    const center = bounds.getCenter(new THREE.Vector3())
    const decorative = /hair|cape|cloak|skirt|dress|crown|fan|pedestal|base|platform/.test(label)
    const arm = isArm(label) && Math.abs(center.x) > .15 ? (center.x < 0 ? 0 : 1) : -1
    const positions = original.geometry.getAttribute('position')
    if (!positions) continue
    const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4)
    const toRoot = invRoot.clone().multiply(original.matrixWorld)
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(toRoot)
      const k = i * 4
      indices[k] = 1; weights[k] = 1
      if (arm >= 0 && arms[arm].hasHand) {
        const influence = smooth(Math.abs(p.x), .17, .25)
        const upperDistance = armSegments[arm].upper.closestPointToPoint(p, true, nearestUpper).distanceTo(p)
        const lowerDistance = armSegments[arm].lower.closestPointToPoint(p, true, nearestLower).distanceTo(p)
        const lowerWeight = isHand(label) || /(?:fore|lower)[ _-]*arm/.test(label) ? 1 : smooth(upperDistance - lowerDistance, -.035, .035)
        indices[k + 1] = 8 + arm * 3; indices[k + 2] = (isHand(label) ? 10 : 9) + arm * 3
        weights[k] = 1 - influence; weights[k + 1] = influence * (1 - lowerWeight); weights[k + 2] = influence * lowerWeight
      } else if (!decorative && ((/leg|thigh|calf|shin|knee|foot|shoe|boot|heel|sandal/.test(label) && p.y < 1.02) || (p.y < .94 && Math.abs(p.x) < .34 && Math.abs(p.z) < .38))) {
        const side = (Math.abs(center.x) > .06 && /leg|thigh|calf|shin|knee|foot|shoe|boot|heel|sandal/.test(label) ? center.x : p.x) < 0 ? 0 : 1, thigh = 2 + side * 3
        const rigidFoot = /foot|shoe|boot|heel|sandal/.test(label)
        const leg = rigidFoot ? 1 : 1 - smooth(p.y, .84, .96)
        const shin = rigidFoot ? 1 : 1 - smooth(p.y, .435, .535)
        const foot = rigidFoot ? 1 : 1 - smooth(p.y, .10, .17)
        indices[k + 1] = thigh; indices[k + 2] = thigh + 1; indices[k + 3] = thigh + 2
        weights[k] = 1 - leg; weights[k + 1] = leg * (1 - shin)
        weights[k + 2] = leg * shin * (1 - foot); weights[k + 3] = leg * shin * foot
      }
    }
    // Reuse original geometry attributes; only new skin attributes are added to
    // an independent geometry object. No decimation, remesh or texture replacement.
    const geometry = original.geometry.clone()
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
    const skinned = new THREE.SkinnedMesh(geometry, original.material)
    skinned.name = original.name; skinned.userData = { ...original.userData, worldifactGameRig: true }
    skinned.position.copy(original.position); skinned.quaternion.copy(original.quaternion); skinned.scale.copy(original.scale)
    skinned.castShadow = original.castShadow; skinned.receiveShadow = original.receiveShadow
    skinned.visible = original.visible; skinned.renderOrder = original.renderOrder
    skinned.frustumCulled = false // Animated bounds, not the static bind-pose bounds.
    original.parent?.add(skinned)
    for (const child of [...original.children]) skinned.add(child)
    skinned.updateMatrixWorld(true); skinned.bind(skeleton, original.matrixWorld.clone())
    original.removeFromParent(); original.geometry.dispose()
  }
  let fanAttached = false, fanArmIndex = -1
  if (fans.length) {
    const fanBox = new THREE.Box3()
    fans.forEach(m => fanBox.union(localBounds(m)))
    const center = fanBox.getCenter(new THREE.Vector3())
    const candidates = arms.filter(a => a.hasHand).sort((a, b) => a.point.distanceTo(center) - b.point.distanceTo(center))
    const arm = candidates[0]
    if (arm) {
      const fan = new THREE.Group(); fan.name = 'Original_Queen_Fan_Complete'
      root.add(fan); fan.position.copy(arm.point); root.updateMatrixWorld(true)
      // attach preserves the whole original fan, including its surface and ribs.
      for (const part of fans) { part.visible = true; fan.attach(part) }
      arm.hand.attach(fan)
      fanArmIndex = arms.indexOf(arm)
      // Point the fan away from the face, down along the thigh, not across the body.
      const wristDown = arm.down.clone().multiply(arm.elbowDown)
      const direction = center.clone().sub(arm.point).applyQuaternion(wristDown)
      if (direction.lengthSq() > .0001) {
        const correction = new THREE.Quaternion().setFromUnitVectors(direction.normalize(), new THREE.Vector3(Math.sign(arm.point.x) * .18, -1, 0).normalize())
        fan.quaternion.premultiply(wristDown.clone().invert().multiply(correction).multiply(wristDown))
      }
      fanAttached = true
    }
  }
  // Unclassified fan meshes remain visible; never replace them with the low-detail gadget.
  fans.forEach(m => {
    m.visible = true
    const original = Array.isArray(m.material) ? m.material : [m.material]
    const visibleMaterials = original.map(material => { const copy = material.clone(); copy.side = THREE.DoubleSide; return copy })
    m.material = Array.isArray(m.material) ? visibleMaterials : visibleMaterials[0]
  })
  let phase = 0, blend = 0, flightBlend = 0
  return {
    skeleton, hips, legs, arms, fanParts: fans.length, fanAttached, fanArmIndex,
    update(delta: number, speed: number, seated = false, swimming = false, flying = false, jumping = false, motion: JumpAnimation = { tuck: jumping ? .2 : 0, crouch: 0, airborne: jumping }) {
      blend = THREE.MathUtils.damp(blend, seated || swimming || flying || jumping ? 0 : Math.min(1, speed), 14, delta)
      flightBlend = THREE.MathUtils.damp(flightBlend, flying ? 1 : 0, 10, delta)
      phase += Math.max(0, speed) * WALK_SPEED * STANCE / (2 * STRIDE) * delta
      const pose = gaitPose(phase, blend, motion)
      hips.position.y = .90 - pose.drop
      hips.position.x = Math.sin(phase * Math.PI * 2) * .009 * blend
      legs.forEach((leg, index) => {
        const angles = pose.legs[index], side = index ? 1 : -1
        // Separate the feet slightly without remeshing, elongating or replacing the legs.
        leg.thigh.position.x = side * (.11 + .018 * blend)
        leg.thigh.rotation.x = seated ? 1.25 : flying ? .12 : swimming ? Math.sin(phase * Math.PI * 2 + index * Math.PI) * .2 : angles.hip
        leg.knee.rotation.x = seated ? -1.35 : flying ? -.25 : swimming ? -.3 : angles.knee
        leg.ankle.rotation.x = seated || swimming ? 0 : flying ? .13 : angles.ankle
      })
      arms.forEach((arm, index) => {
        arm.shoulder.quaternion.copy(arm.down)
        if (index === fanArmIndex) arm.shoulder.quaternion.slerp(arm.up, flightBlend)
        arm.elbow.quaternion.copy(arm.elbowDown)
        const swing = Math.sin(phase * Math.PI * 2 + index * Math.PI) * blend * (index === fanArmIndex ? .055 : .20)
        arm.shoulder.rotateX(swimming ? Math.sin(phase * Math.PI * 2 + index * Math.PI) * .55 : seated ? .6 : swing)
      })
      root.updateMatrixWorld(true)
    },
    dispose() { skeleton.dispose() },
  }
}
